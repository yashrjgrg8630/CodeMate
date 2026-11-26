import { beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  dashboardDataSchema,
  progressReportSchema,
  type DashboardData,
  type DSARoadmap,
  type InterviewSession,
  type ProgressReport,
} from "../src/schemas/domain.js";
import { dayKey, getProgress } from "../src/services/stats.js";
import { createCtx, PY_CODE, resetDb, signup, type Ctx, type ErrorBody } from "./helpers.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

describe("a brand-new user", () => {
  it("has all-zero progress and dashboard (no random or mock data)", async () => {
    const s = await signup(ctx);
    const p = progressReportSchema.parse((await s.get("/api/progress")).body);
    expect(p).toMatchObject({ problemsSolved: 0, problemsAttempted: 0, streak: 0, averageInterviewScore: 0, optimizations: 0, bugsFixed: 0 });
    expect(p.weeklyActivity.map((d) => d.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(p.weeklyActivity.every((d) => d.problems === 0 && d.analyses === 0)).toBe(true);
    expect(p.topicPerformance).toEqual([]);
    expect(p.interviewPerformance).toEqual([]);
    expect(p.algorithmUsage).toEqual([]);
    expect(p.algorithmDna).toHaveLength(6);
    expect(p.algorithmDna.every((d) => d.strength === null && d.sampleCount === 0)).toBe(true);

    const d = dashboardDataSchema.parse((await s.get("/api/dashboard")).body);
    expect(d.stats).toEqual({ problemsAnalyzed: 0, bugsDetected: 0, optimizationsFound: 0, codeConversions: 0, problemsSolved: 0, interviewScore: 0 });
    expect(d.activity).toEqual([]);
    expect(d.weaknessHeatmap).toEqual([]);
  });
});

describe("aggregation from real activity", () => {
  async function work(s: Awaited<ReturnType<typeof signup>>): Promise<void> {
    await s.post("/api/analysis", { code: PY_CODE, language: "python" });
    await s.post("/api/optimization", { code: PY_CODE, language: "python" });
    await s.post("/api/conversion", { code: PY_CODE, sourceLanguage: "python", targetLanguage: "java", optimizeWhileConverting: false });
    const session = (await s.post<InterviewSession>("/api/interview/start", { role: "Backend Engineer" })).body;
    await s.post("/api/interview/evaluate", { questionId: session.questions[0]?.id, answer: "Sliding window", code: "" });
    await s.post("/api/interview/report", { scores: [77], sessionId: session.id });
    const rm = (await s.post<DSARoadmap>("/api/roadmap", { targetRole: "SDE", currentLevel: "Intermediate", weeks: 8 })).body;
    await s.patch(`/api/roadmap/${rm.id}/problems/${rm.topics[0]?.problems[0]?.id}`, { completed: true });
  }

  it("dashboard reflects every kind of action", async () => {
    const s = await signup(ctx);
    await work(s);
    const d = (await s.get<DashboardData>("/api/dashboard")).body;
    expect(d.stats).toEqual({
      problemsAnalyzed: 1,
      bugsDetected: 3,
      optimizationsFound: 1,
      codeConversions: 1,
      problemsSolved: 1,
      interviewScore: 77,
    });
    expect(d.activity.length).toBeGreaterThanOrEqual(6);
    expect(d.activity[0]?.time).toBe("just now");
    expect(new Set(d.activity.map((a) => a.kind))).toEqual(new Set(["analysis", "optimization", "conversion", "career", "interview"]));
    const heat = Object.fromEntries(d.weaknessHeatmap.map((h) => [h.topic, h.score]));
    expect(heat["Arrays"]).toBeGreaterThan(0); // analysis health + roadmap completion
    expect(heat["Sliding Window"]).toBe(77);
    expect(heat["Graphs"]).toBeUndefined(); // no graph evidence has been recorded
  });

  it("progress derives solved, attempted, bugs fixed, usage, DNA and interview trend", async () => {
    const s = await signup(ctx);
    await work(s);
    const p = progressReportSchema.parse((await s.get("/api/progress")).body);
    expect(p.problemsSolved).toBe(1);
    expect(p.problemsAttempted).toBe(1 + 1 + 1); // solved + analysis + interview answer
    expect(p.optimizations).toBe(1);
    expect(p.bugsFixed).toBe(2); // critical+warning bugs of code later optimized
    expect(p.streak).toBe(1);
    expect(p.averageInterviewScore).toBe(77);
    expect(p.interviewPerformance.map(({ session, score }) => ({ session, score }))).toEqual([
      { session: "S1", score: 77 },
    ]);
    expect(p.interviewPerformance[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.algorithmUsage).toEqual([{ name: "Brute Force", value: 1 }]);
    expect(p.algorithmDna.find((d) => d.pattern === "Iteration")?.strength).toBe(27); // 82 × (1/3)

    const todayIdx = (new Date().getUTCDay() + 6) % 7; // test runs well away from UTC midnight boundaries in practice
    const today = p.weeklyActivity[todayIdx];
    expect(today?.analyses).toBe(1);
    expect(today?.problems).toBe(2); // interview answer + solved roadmap problem
  });

  it("does not count bugs as fixed if the code was never optimized", async () => {
    const s = await signup(ctx);
    await s.post("/api/analysis", { code: PY_CODE, language: "python" });
    expect(((await s.get<ProgressReport>("/api/progress")).body).bugsFixed).toBe(0);
  });

  it("isolates users completely", async () => {
    const a = await signup(ctx, "a@example.com");
    const b = await signup(ctx, "b@example.com");
    await work(a);
    const d = (await b.get<DashboardData>("/api/dashboard")).body;
    expect(d.stats.problemsAnalyzed).toBe(0);
    expect(d.activity).toEqual([]);
    expect(((await b.get<ProgressReport>("/api/progress")).body).problemsSolved).toBe(0);
  });

  it("averages several interview reports and keeps the last 10 sessions", async () => {
    const s = await signup(ctx);
    for (let i = 0; i < 12; i += 1) await s.post("/api/interview/report", { scores: [i < 6 ? 50 : 90] });
    const p = (await s.get<ProgressReport>("/api/progress")).body;
    expect(p.averageInterviewScore).toBe(70);
    expect(p.interviewPerformance).toHaveLength(10);
    expect(p.interviewPerformance[0]?.session).toBe("S3");
    expect(p.interviewPerformance[9]?.session).toBe("S12");
  });

  it("scopes metrics and dated activity to the selected range", async () => {
    const s = await signup(ctx);
    const user = await ctx.db.user.findFirstOrThrow();
    const eventDate = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
    const createEvent = (
      kind: "ANALYSIS" | "OPTIMIZATION" | "INTERVIEW_REPORT",
      daysAgo: number,
      options: { score?: number; topic?: string; meta?: Prisma.InputJsonObject } = {},
    ) =>
      ctx.db.activityEvent.create({
        data: {
          userId: user.id,
          kind,
          score: options.score,
          topic: options.topic,
          meta: options.meta,
          createdAt: eventDate(daysAgo),
        },
      });

    await createEvent("ANALYSIS", 2, {
      score: 82,
      topic: "Arrays",
      meta: {
        label: "Analyzed array traversal",
        detail: "Array Traversal · 2 issues",
        codeHash: "range-test-code",
        patternName: "Array Traversal",
        patternCategory: "Arrays",
        bugCount: 2,
      },
    });
    await createEvent("OPTIMIZATION", 2, {
      meta: { label: "Optimized array traversal", detail: "Completed", codeHash: "range-test-code" },
    });
    await createEvent("INTERVIEW_REPORT", 2, {
      score: 90,
      meta: { label: "Interview 2", detail: "Backend systems interview" },
    });
    await createEvent("OPTIMIZATION", 20, {
      meta: { label: "Older optimization", detail: "Completed" },
    });
    await createEvent("INTERVIEW_REPORT", 20, {
      score: 60,
      meta: { label: "Interview 1", detail: "Data structures interview" },
    });

    const week = progressReportSchema.parse((await s.get("/api/progress?range=7d")).body);
    expect(week.optimizations).toBe(1);
    expect(week.interviewsCompleted).toBe(1);
    expect(week.averageInterviewScore).toBe(90);
    expect(week.activityGranularity).toBe("day");
    expect(week.activityHistory).toHaveLength(7);
    expect(week.activityHistory.some((day) => day.optimizations === 1 && day.interviews === 1)).toBe(true);
    expect(week.topicPerformance).toContainEqual({ topic: "Arrays", score: 82, evidence: 1 });
    expect(week.interviewPerformance).toEqual([
      expect.objectContaining({
        session: "S2",
        detail: "Backend systems interview",
        score: 90,
      }),
    ]);

    const quarter = progressReportSchema.parse((await s.get("/api/progress?range=90d")).body);
    expect(quarter.optimizations).toBe(2);
    expect(quarter.interviewsCompleted).toBe(2);
    expect(quarter.averageInterviewScore).toBe(75);
    expect(quarter.interviewPerformance.map((item) => item.session)).toEqual(["S1", "S2"]);

    const allTime = progressReportSchema.parse((await s.get("/api/progress?range=all")).body);
    expect(allTime.activityGranularity).toBe("month");
    expect(allTime.activityHistory.every((item) => /^\d{4}-\d{2}$/.test(item.date))).toBe(true);
  });
});

describe("streak and time zones", () => {
  async function seedDays(userId: string, offsets: number[]): Promise<void> {
    for (const off of offsets) {
      await ctx.db.activityEvent.create({
        data: { userId, kind: "ANALYSIS", createdAt: new Date(Date.now() - off * 86_400_000), meta: { label: "x", detail: "y" } },
      });
    }
  }

  it("counts consecutive days, allowing 'today not yet active'", async () => {
    const s = await signup(ctx);
    const user = await ctx.db.user.findFirstOrThrow();
    await seedDays(user.id, [1, 2, 3, 5]); // gap at day 4
    expect(((await s.get<ProgressReport>("/api/progress")).body).streak).toBe(3);
  });

  it("resets when neither today nor yesterday has activity", async () => {
    const s = await signup(ctx);
    const user = await ctx.db.user.findFirstOrThrow();
    await seedDays(user.id, [2, 3]);
    expect(((await s.get<ProgressReport>("/api/progress")).body).streak).toBe(0);
  });

  it("buckets days in the requested IANA time zone", () => {
    const instant = new Date("2026-01-10T20:00:00Z");
    expect(dayKey(instant, "UTC")).toBe("2026-01-10");
    expect(dayKey(instant, "Asia/Kolkata")).toBe("2026-01-11"); // UTC+5:30
    expect(dayKey(instant, "America/Los_Angeles")).toBe("2026-01-10");
  });

  it("computes the week in the caller's zone", async () => {
    const s = await signup(ctx);
    const user = await ctx.db.user.findFirstOrThrow();
    // Sunday 2026-01-11 21:00 UTC is already Monday 2026-01-12 in Kolkata.
    await ctx.db.activityEvent.create({
      data: { userId: user.id, kind: "ANALYSIS", createdAt: new Date("2026-01-11T21:00:00Z"), meta: { label: "x", detail: "y" } },
    });
    const now = new Date("2026-01-12T10:00:00Z");
    const ist = await getProgress(ctx.db, user.id, "Asia/Kolkata", now);
    const utc = await getProgress(ctx.db, user.id, "UTC", now);
    expect(ist.weeklyActivity[0]?.analyses).toBe(1); // Monday
    expect(utc.weeklyActivity.reduce((a, d) => a + d.analyses, 0)).toBe(0); // Sunday belongs to last week
    void s;
  });

  it("accepts ?tz and rejects unknown zones", async () => {
    const s = await signup(ctx);
    expect((await s.get("/api/progress?tz=Asia/Kolkata")).status).toBe(200);
    const bad = await s.get<ErrorBody>("/api/progress?tz=Mars/Olympus");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unsupported progress ranges", async () => {
    const s = await signup(ctx);
    const bad = await s.get<ErrorBody>("/api/progress?range=21d");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
  });
});
