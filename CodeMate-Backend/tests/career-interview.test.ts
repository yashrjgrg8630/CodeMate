import { beforeEach, describe, expect, it } from "vitest";
import {
  careerJobResultSchema,
  interviewEvaluationSchema,
  interviewReportSchema,
  interviewSessionSchema,
  type CareerJobResult,
  type InterviewSession,
} from "../src/schemas/domain.js";
import { usableResume, skillLevel } from "../src/services/career.js";
import { createCtx, resetDb, signup, type Ctx, type ErrorBody } from "./helpers.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

const JD = "We are hiring a backend engineer with strong Java, Spring Boot and PostgreSQL experience to build high-throughput services.";
const RESUME = "Software engineer, 3 years of Java and Spring Boot, built REST APIs backed by PostgreSQL, led a migration to Kubernetes.";

describe("POST /api/career/job", () => {
  it("returns extraction, skill gap and a resume roadmap when a resume is supplied", async () => {
    const s = await signup(ctx);
    const r = await s.post<CareerJobResult>("/api/career/job", { jobDescription: JD, resumeText: RESUME });
    expect(r.status).toBe(200);
    const out = careerJobResultSchema.parse(r.body);

    // duplicate "java"/"Java" collapsed, levels derived from the numbers
    expect(out.analysis.skills.filter((k) => k.name.toLowerCase() === "java")).toHaveLength(1);
    const level = Object.fromEntries(out.analysis.skills.map((k) => [k.name, k.level]));
    expect(level).toMatchObject({ Java: "strong", "Spring Boot": "practice", PostgreSQL: "weak", Redis: "missing" });
    expect(out.skillGap.missing.map((k) => k.name)).toEqual(["Redis"]);
    expect(out.skillGap.recommendation.length).toBeGreaterThan(0);

    const road = out.roadmap;
    expect(road).not.toBeNull();
    expect(road?.weeks).toBe(10);
    expect(road?.matchScore).toBeGreaterThan(0);
    expect(road?.matchScore).toBeLessThanOrEqual(100);
    expect(road?.categoryFocus.reduce((a, c) => a + c.value, 0)).toBe(100);
    expect(road?.phases.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(road?.phases.map((phase) => [phase.weekStart, phase.weekEnd])).toEqual([
      [1, 3],
      [4, 6],
      [7, 10],
    ]);
    expect(road?.phases[0]?.actions).toHaveLength(3);
    expect(road?.phases[0]?.actions[0]).toMatchObject({
      title: "Learn Collections",
      timebox: "3 × 45 min",
    });
    expect(road?.phases[0]?.actions[0]?.deliverable).toContain("Collections");
    expect(road?.phases[0]?.leetcode[0]).toMatchObject({
      title: "Two Sum",
      difficulty: "easy",
      url: "https://leetcode.com/problemset/?search=Two%20Sum",
    });
    const deficits = road?.gaps.map((g) => g.need - g.have) ?? [];
    expect(deficits).toEqual([...deficits].sort((a, b) => b - a));
    expect(await ctx.db.jobAnalysis.count()).toBe(1);
  });

  it("fits the job roadmap phases to a custom preparation duration", async () => {
    const s = await signup(ctx);
    const r = await s.post<CareerJobResult>("/api/career/job", {
      jobDescription: JD,
      resumeText: RESUME,
      weeks: 16,
    });
    expect(r.status).toBe(200);
    expect(r.body.roadmap?.weeks).toBe(16);
    expect(r.body.roadmap?.phases.map((phase) => [phase.weekStart, phase.weekEnd])).toEqual([
      [1, 5],
      [6, 10],
      [11, 16],
    ]);
    expect(ctx.transport.calls[0]?.prompt).toContain("Preparation duration: 16 weeks");
    expect(await ctx.db.jobAnalysis.count()).toBe(1);
  });

  it("returns no roadmap and marks every skill missing when there is no resume", async () => {
    const s = await signup(ctx);
    const r = await s.post<CareerJobResult>("/api/career/job", { jobDescription: JD });
    expect(r.status).toBe(200);
    expect(r.body.roadmap).toBeNull();
    expect(r.body.analysis.skills.every((k) => k.current === 0 && k.level === "missing")).toBe(true);
    expect(ctx.transport.calls[0]?.prompt).toContain("No resume was supplied");
  });

  it("treats the frontend's non-text upload placeholder as no resume", async () => {
    const s = await signup(ctx);
    const r = await s.post<CareerJobResult>("/api/career/job", {
      jobDescription: JD,
      resumeText: "[resume.pdf] attached — text extraction happens on the server later.",
    });
    expect(r.status).toBe(200);
    expect(r.body.roadmap).toBeNull();
  });

  it("fences JD and resume as untrusted data", async () => {
    const s = await signup(ctx);
    await s.post("/api/career/job", { jobDescription: JD, resumeText: RESUME });
    const prompt = ctx.transport.calls[0]?.prompt ?? "";
    expect(prompt).toContain("<job_description>");
    expect(prompt).toContain("<resume>");
  });

  it("validates input", async () => {
    const s = await signup(ctx);
    expect((await s.post<ErrorBody>("/api/career/job", { jobDescription: "short" })).status).toBe(400);
    expect((await s.post("/api/career/job", {})).status).toBe(400);
    expect((await s.post("/api/career/job", { jobDescription: JD, weeks: 0 })).status).toBe(400);
    expect((await s.post("/api/career/job", { jobDescription: JD, weeks: 53 })).status).toBe(400);
    expect((await s.post("/api/career/job", { jobDescription: "x".repeat(30_001) })).status).toBe(400);
  });

  it("unit: skillLevel and usableResume", () => {
    expect(skillLevel(80, 0)).toBe("missing");
    expect(skillLevel(80, 75)).toBe("strong");
    expect(skillLevel(80, 55)).toBe("practice");
    expect(skillLevel(80, 20)).toBe("weak");
    expect(usableResume("   ")).toBeUndefined();
    expect(usableResume("too short")).toBeUndefined();
    expect(usableResume(RESUME)).toBe(RESUME);
  });
});

describe("mock interview", () => {
  async function start(s: Awaited<ReturnType<typeof signup>>, role = "Backend Engineer"): Promise<InterviewSession> {
    const r = await s.post<InterviewSession>("/api/interview/start", { role });
    expect(r.status).toBe(200);
    return interviewSessionSchema.parse(r.body);
  }

  it("starts a session with AI questions numbered 1..n", async () => {
    const s = await signup(ctx);
    const session = await start(s);
    expect(session.role).toBe("Backend Engineer");
    expect(session.questions).toHaveLength(5);
    expect(session.questions.map((q) => q.index)).toEqual([1, 2, 3, 4, 5]);
    expect(session.questions.every((q) => q.total === 5)).toBe(true);
    expect(await ctx.db.interviewQuestion.count()).toBe(5);
  });

  it("defaults the role and validates it", async () => {
    const s = await signup(ctx);
    expect((await s.post<InterviewSession>("/api/interview/start", {})).body.role).toBe("Software Engineer");
    expect((await s.post("/api/interview/start", { role: "x" })).status).toBe(400);
  });

  it("evaluates an answer, stores it and records activity once even when re-answered", async () => {
    const s = await signup(ctx);
    const session = await start(s);
    const q = session.questions[0];
    if (!q) throw new Error("no question");
    const r = await s.post("/api/interview/evaluate", { questionId: q.id, answer: "Use a sliding window, O(n) time, O(1) space.", code: "def f(): pass" });
    expect(r.status).toBe(200);
    expect(interviewEvaluationSchema.parse(r.body)).toMatchObject({ questionId: q.id, score: 77 });

    await s.post("/api/interview/evaluate", { questionId: q.id, answer: "Second attempt with more detail.", code: "" });
    expect(await ctx.db.interviewAnswer.count()).toBe(1);
    expect(await ctx.db.activityEvent.count({ where: { kind: "INTERVIEW_ANSWER" } })).toBe(1);
    expect((await ctx.db.interviewAnswer.findFirstOrThrow()).answer).toBe("Second attempt with more detail.");
  });

  it("does not let one user evaluate another user's question", async () => {
    const owner = await signup(ctx, "owner@example.com");
    const other = await signup(ctx, "other@example.com");
    const q = (await start(owner)).questions[0];
    const r = await other.post<ErrorBody>("/api/interview/evaluate", { questionId: q?.id, answer: "hi", code: "" });
    expect(r.status).toBe(404);
    expect(ctx.transport.callsFor("scoring a candidate's answer")).toHaveLength(0);
  });

  it("validates evaluate input", async () => {
    const s = await signup(ctx);
    expect((await s.post("/api/interview/evaluate", { questionId: "q_1", answer: "", code: "" })).status).toBe(400);
    expect((await s.post("/api/interview/evaluate", { answer: "x" })).status).toBe(400);
    expect((await s.post<ErrorBody>("/api/interview/evaluate", { questionId: "q_missing", answer: "x" })).status).toBe(404);
  });

  it("builds a report: overall is computed from the scores, dimensions come from the model", async () => {
    const s = await signup(ctx);
    const r = await s.post("/api/interview/report", { scores: [70, 80, 90] });
    expect(r.status).toBe(200);
    const report = interviewReportSchema.parse(r.body);
    expect(report.overall).toBe(80);
    expect(report.scores.technicalKnowledge).toBe(82);
    expect(report.strengths.length).toBeGreaterThan(0);
    expect(await ctx.db.activityEvent.count({ where: { kind: "INTERVIEW_REPORT" } })).toBe(1);
  });

  it("uses the stored transcript and completes the session when sessionId is given", async () => {
    const s = await signup(ctx);
    const session = await start(s);
    const q = session.questions[0];
    await s.post("/api/interview/evaluate", { questionId: q?.id, answer: "Sliding window.", code: "" });
    const r = await s.post("/api/interview/report", { scores: [77], sessionId: session.id });
    expect(r.status).toBe(200);
    const stored = await ctx.db.interviewSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.overall).toBe(77);
    expect(stored.completedAt).not.toBeNull();
    expect(ctx.transport.callsFor("end-of-interview report")[0]?.prompt).toContain("Feedback: Solid");
  });

  it("rejects another user's sessionId and invalid score arrays", async () => {
    const owner = await signup(ctx, "owner@example.com");
    const other = await signup(ctx, "other@example.com");
    const session = await start(owner);
    expect((await other.post("/api/interview/report", { scores: [50], sessionId: session.id })).status).toBe(404);
    expect((await owner.post("/api/interview/report", { scores: [] })).status).toBe(400);
    expect((await owner.post("/api/interview/report", { scores: [101] })).status).toBe(400);
    expect((await owner.post("/api/interview/report", { scores: ["a"] })).status).toBe(400);
  });
});
