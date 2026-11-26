import { beforeEach, describe, expect, it } from "vitest";
import {
  liveInterviewReportSchema,
  type LiveInterviewReport,
} from "../src/schemas/domain.js";
import { createCtx, json, resetDb, signup, type Ctx, type ErrorBody } from "./helpers.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

const transcript = [
  {
    speaker: "interviewer" as const,
    text: "How would you design a rate limiter for a distributed API?",
  },
  {
    speaker: "candidate" as const,
    text: "I would use a token bucket with shared state and atomic updates.",
  },
];

const generatedReport = {
  scores: { technicalKnowledge: 82, problemSolving: 78, communication: 86 },
  responseFeedback: [
    { score: 80, feedback: "You chose a suitable algorithm; discuss consistency and failure modes." },
  ],
  strengths: ["Explains the core approach clearly."],
  areasToImprove: ["Compare consistency trade-offs across storage options."],
  suggestedTopics: ["Distributed counters", "Token bucket trade-offs"],
};

async function createSession(userId: string): Promise<string> {
  const session = await ctx.db.interviewSession.create({
    data: {
      userId,
      role: "Backend",
      domain: "Backend",
      difficulty: "Intermediate",
      durationMinutes: 15,
    },
  });
  return session.id;
}

describe("live mock interview", () => {
  it("validates the live interview setup before requesting a provider token", async () => {
    const user = await signup(ctx);
    const response = await user.post<ErrorBody>("/api/interview/live/start", {
      domain: "General",
      difficulty: "Intermediate",
      durationMinutes: 15,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await ctx.db.interviewSession.count()).toBe(0);
  });

  it("scores the actual transcript and saves the report and conversation to interview history", async () => {
    const user = await signup(ctx);
    const storedUser = await ctx.db.user.findUniqueOrThrow({
      where: { email: "ada@example.com" },
      select: { id: true },
    });
    const actualSessionId = await createSession(storedUser.id);
    ctx.transport.queue("fair technical interviewer writing a report", json(generatedReport));

    const response = await user.post<LiveInterviewReport>("/api/interview/live/complete", {
      sessionId: actualSessionId,
      durationSeconds: 148,
      transcript,
    });

    expect(response.status).toBe(200);
    const report = liveInterviewReportSchema.parse(response.body);
    expect(report.overall).toBe(80);
    expect(report.questionsAsked).toEqual([transcript[0]?.text]);
    expect(report.responseFeedback[0]).toMatchObject({
      question: transcript[0]?.text,
      answer: transcript[1]?.text,
      score: 80,
    });

    const session = await ctx.db.interviewSession.findUniqueOrThrow({
      where: { id: actualSessionId },
      include: { questions: { include: { answer: true } } },
    });
    expect(session.durationSeconds).toBe(148);
    expect(session.transcript).toEqual(transcript);
    expect(session.report).toEqual(report);
    expect(session.completedAt).not.toBeNull();
    expect(session.questions).toHaveLength(1);
    expect(session.questions[0]?.answer?.answer).toBe(transcript[1]?.text);
    expect(session.questions[0]?.answer?.score).toBe(80);
    expect(await ctx.db.activityEvent.count({ where: { kind: "INTERVIEW_REPORT" } })).toBe(1);

    const repeated = await user.post<LiveInterviewReport>("/api/interview/live/complete", {
      sessionId: actualSessionId,
      durationSeconds: 148,
      transcript,
    });
    expect(repeated.status).toBe(200);
    expect(repeated.body).toEqual(report);
    expect(ctx.transport.callsFor("fair technical interviewer writing a report")).toHaveLength(1);
    expect(await ctx.db.activityEvent.count({ where: { kind: "INTERVIEW_REPORT" } })).toBe(1);
  });

  it("does not allow a different user to finish or delete a live session", async () => {
    const owner = await signup(ctx, "live-owner@example.com");
    const other = await signup(ctx, "live-other@example.com");
    const user = await ctx.db.user.findUniqueOrThrow({ where: { email: "live-owner@example.com" } });
    const sessionId = await createSession(user.id);

    const complete = await other.post<ErrorBody>("/api/interview/live/complete", {
      sessionId,
      durationSeconds: 30,
      transcript,
    });
    expect(complete.status).toBe(404);
    expect(complete.body.error.code).toBe("NOT_FOUND");

    const abandon = await other.post("/api/interview/live/abandon", { sessionId });
    expect(abandon.status).toBe(204);
    expect(await ctx.db.interviewSession.count({ where: { id: sessionId } })).toBe(1);
    expect(ctx.transport.callsFor("fair technical interviewer writing a report")).toHaveLength(0);

    const ownerAbandon = await owner.post("/api/interview/live/abandon", { sessionId });
    expect(ownerAbandon.status).toBe(204);
    expect(await ctx.db.interviewSession.count({ where: { id: sessionId } })).toBe(0);
  });

  it("rejects incomplete or oversized call transcripts", async () => {
    const user = await signup(ctx);
    const storedUser = await ctx.db.user.findUniqueOrThrow({
      where: { email: "ada@example.com" },
      select: { id: true },
    });
    const sessionId = await createSession(storedUser.id);

    const missingAnswer = await user.post<ErrorBody>("/api/interview/live/complete", {
      sessionId,
      durationSeconds: 20,
      transcript: [{ speaker: "interviewer", text: "Tell me about a queue." }],
    });
    expect(missingAnswer.status).toBe(400);
    expect(missingAnswer.body.error.code).toBe("VALIDATION_ERROR");

    const oversized = await user.post<ErrorBody>("/api/interview/live/complete", {
      sessionId,
      durationSeconds: 20,
      transcript: [
        { speaker: "interviewer", text: "A question?" },
        { speaker: "candidate", text: "x".repeat(6_001) },
      ],
    });
    expect(oversized.status).toBe(400);
    expect(ctx.transport.callsFor("fair technical interviewer writing a report")).toHaveLength(0);
  });
});
