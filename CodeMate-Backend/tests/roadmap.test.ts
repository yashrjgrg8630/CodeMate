import { beforeEach, describe, expect, it } from "vitest";
import { dsaRoadmapSchema, type DSARoadmap } from "../src/schemas/domain.js";
import { createCtx, resetDb, signup, type Ctx, type ErrorBody } from "./helpers.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

const body = { targetRole: "Backend Engineer", currentLevel: "Intermediate", weeks: 8 };

describe("POST /api/roadmap", () => {
  it("generates a structured roadmap with stable ids, safe links and zero progress", async () => {
    const s = await signup(ctx);
    const r = await s.post<DSARoadmap>("/api/roadmap", body);
    expect(r.status).toBe(200);
    const rm = dsaRoadmapSchema.parse(r.body);
    expect(rm.topics).toHaveLength(8);
    expect(rm.weeks).toBe(8);
    expect(rm.topics.map((topic) => [topic.weekStart, topic.weekEnd])).toEqual(
      Array.from({ length: 8 }, (_, i) => [i + 1, i + 1]),
    );
    expect(rm.preparationLevel).toBe("Intermediate");
    expect(rm.topics.every((t) => t.progress === 0 && t.problems.every((p) => !p.completed && !p.inRevision))).toBe(true);

    const lc = rm.topics[0]?.problems[0];
    expect(lc?.id).toBe("p_arrays_arrays-problem-1");
    expect(lc?.url).toBe("https://leetcode.com/problemset/?search=Arrays%20Problem%201");
    const hr = rm.topics[0]?.problems[2];
    expect(hr?.url).toContain("google.com/search");
    expect(rm.resources[0]?.url).toContain("youtube.com/results?search_query=");
    expect(await ctx.db.roadmapProblem.count()).toBe(24);
  });

  it("accepts the frontend's preparationLevel alias and defaults weeks", async () => {
    const s = await signup(ctx);
    const r = await s.post<DSARoadmap>("/api/roadmap", { targetRole: "SDE", preparationLevel: "Beginner" });
    expect(r.status).toBe(200);
    expect(r.body.preparationLevel).toBe("Beginner");
    expect(ctx.transport.calls[0]?.prompt).toContain("8 weeks");
  });

  it("distributes a custom duration across all eight ordered stages", async () => {
    const s = await signup(ctx);
    const r = await s.post<DSARoadmap>("/api/roadmap", { ...body, weeks: 16 });
    expect(r.status).toBe(200);
    expect(r.body.weeks).toBe(16);
    expect(r.body.topics.map((topic) => [topic.weekStart, topic.weekEnd])).toEqual(
      [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]],
    );
    expect(ctx.transport.calls[0]?.prompt).toContain("exactly 8 ordered roadmap milestones");
  });

  it("validates input", async () => {
    const s = await signup(ctx);
    expect((await s.post("/api/roadmap", { ...body, weeks: 0 })).status).toBe(400);
    expect((await s.post("/api/roadmap", { ...body, weeks: 100 })).status).toBe(400);
    expect((await s.post("/api/roadmap", { ...body, weeks: "eight" })).status).toBe(400);
  });
});

describe("roadmap completion", () => {
  it("404s on /latest before any roadmap exists", async () => {
    const s = await signup(ctx);
    expect((await s.get<ErrorBody>("/api/roadmap/latest")).status).toBe(404);
  });

  it("toggles completion, updates topic progress and activity, and persists across reads", async () => {
    const s = await signup(ctx);
    const rm = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    const pid = rm.topics[0]?.problems[0]?.id ?? "";

    const done = await s.patch<{ completed: boolean; topicProgress: number }>(`/api/roadmap/${rm.id}/problems/${pid}`, { completed: true });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ completed: true, topicProgress: 33 });

    const latest = await s.get<DSARoadmap>("/api/roadmap/latest");
    expect(latest.body.topics[0]?.progress).toBe(33);
    expect(latest.body.topics[0]?.problems[0]?.completed).toBe(true);
    expect(await ctx.db.activityEvent.count({ where: { kind: "ROADMAP_PROGRESS" } })).toBe(1);

    // idempotent: completing again does not duplicate the event
    await s.patch(`/api/roadmap/${rm.id}/problems/${pid}`, { completed: true });
    expect(await ctx.db.activityEvent.count({ where: { kind: "ROADMAP_PROGRESS" } })).toBe(1);

    const undone = await s.patch<{ topicProgress: number }>(`/api/roadmap/${rm.id}/problems/${pid}`, { completed: false });
    expect(undone.body.topicProgress).toBe(0);
    expect(await ctx.db.activityEvent.count({ where: { kind: "ROADMAP_PROGRESS" } })).toBe(0);
  });

  it("flags problems for revision", async () => {
    const s = await signup(ctx);
    const rm = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    const pid = rm.topics[1]?.problems[1]?.id ?? "";
    await s.patch(`/api/roadmap/${rm.id}/problems/${pid}`, { inRevision: true });
    const latest = await s.get<DSARoadmap>("/api/roadmap/latest");
    expect(latest.body.topics[1]?.problems[1]?.inRevision).toBe(true);
  });

  it("carries completed problems over when the roadmap is regenerated", async () => {
    const s = await signup(ctx);
    const first = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    const pid = first.topics[2]?.problems[0]?.id ?? "";
    await s.patch(`/api/roadmap/${first.id}/problems/${pid}`, { completed: true });
    const second = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    expect(second.id).not.toBe(first.id);
    expect(second.topics[2]?.problems[0]?.completed).toBe(true);
    expect(second.topics[2]?.progress).toBe(33);
  });

  it("scopes by user and validates", async () => {
    const owner = await signup(ctx, "owner@example.com");
    const other = await signup(ctx, "other@example.com");
    const rm = (await owner.post<DSARoadmap>("/api/roadmap", body)).body;
    const pid = rm.topics[0]?.problems[0]?.id ?? "";
    expect((await other.patch(`/api/roadmap/${rm.id}/problems/${pid}`, { completed: true })).status).toBe(404);
    expect((await other.get("/api/roadmap/latest")).status).toBe(404);
    expect((await owner.patch(`/api/roadmap/${rm.id}/problems/nope`, { completed: true })).status).toBe(404);
    expect((await owner.patch(`/api/roadmap/${rm.id}/problems/${pid}`, {})).status).toBe(400);
    expect((await owner.patch(`/api/roadmap/${rm.id}/problems/${pid}`, { completed: "yes" })).status).toBe(400);
  });
});
