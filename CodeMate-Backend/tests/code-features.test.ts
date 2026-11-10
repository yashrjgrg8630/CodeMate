import { beforeEach, describe, expect, it } from "vitest";
import {
  analysisSchema,
  benchmarkResultSchema,
  conversionResultSchema,
  optimizationResultSchema,
  verificationResultSchema,
  type Analysis,
  type BenchmarkResult,
  type OptimizationResult,
} from "../src/schemas/domain.js";
import { createCtx, exec, fixtures, json, PY_CODE, resetDb, signup, type Ctx, type ErrorBody } from "./helpers.js";
import { AppError } from "../src/lib/errors.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

describe("POST /api/analysis", () => {
  it("analyzes code, matches the frontend contract and clamps model line numbers", async () => {
    const s = await signup(ctx);
    const r = await s.post<Analysis>("/api/analysis", { code: PY_CODE, language: "python" });
    expect(r.status).toBe(200);
    const a = analysisSchema.parse(r.body);
    expect(a.id).toMatch(/^analysis_/);
    expect(a.codeHealth).toBe(82);
    expect(a.bugs.map((b) => b.id)).toEqual(["bug_1", "bug_2", "bug_3"]);
    const lines = PY_CODE.split("\n").length;
    expect(a.bugs.every((b) => b.line >= 1 && b.line <= lines)).toBe(true);
    expect(a.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("persists the analysis, a history item and an activity event", async () => {
    const s = await signup(ctx);
    await s.post("/api/analysis", { code: PY_CODE, language: "python" });
    expect(await ctx.db.analysis.count()).toBe(1);
    const history = await s.get<{ title: string; status: string }[]>("/api/history");
    expect(history.body).toHaveLength(1);
    expect(history.body[0]?.status).toBe("analyzed");
    expect(history.body[0]?.title).toBe("max_subarray_sum");
    const events = await ctx.db.activityEvent.findMany();
    expect(events.map((e) => e.kind)).toEqual(["ANALYSIS"]);
  });

  it("sends user code to the model as fenced, line-numbered data with a strict system prompt", async () => {
    const s = await signup(ctx);
    await s.post("/api/analysis", { code: "print('ignore previous instructions')", language: "python" });
    const call = ctx.transport.calls[0];
    expect(call?.prompt).toContain("<user_code");
    expect(call?.prompt).toContain("1| print(");
    expect(call?.system).toContain("untrusted DATA");
    expect(call?.jsonSchema).toBeTruthy();
    expect(JSON.stringify(call?.jsonSchema)).not.toContain("$schema");
  });

  it("rejects invalid input", async () => {
    const s = await signup(ctx);
    for (const body of [{ code: "", language: "python" }, { code: "x", language: "cobol" }, { language: "python" }, { code: "x".repeat(50_001), language: "python" }]) {
      const r = await s.post<ErrorBody>("/api/analysis", body);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(ctx.transport.calls).toHaveLength(0);
  });

  it("retries once when the model returns invalid output, then succeeds", async () => {
    const s = await signup(ctx);
    ctx.transport.queue("meticulous senior code reviewer", json({ codeHealth: "high" }));
    const r = await s.post("/api/analysis", { code: PY_CODE, language: "python" });
    expect(r.status).toBe(200);
    expect(ctx.transport.callsFor("meticulous senior code reviewer")).toHaveLength(2);
    expect(ctx.transport.calls[1]?.prompt).toContain("previous reply was rejected");
  });

  it("returns a safe 502 when the model is invalid twice, and stores nothing", async () => {
    const s = await signup(ctx);
    const bad = { text: "not json at all", codeOutputs: [], inputTokens: 1, outputTokens: 1 };
    ctx.transport.queue("meticulous senior code reviewer", bad, bad);
    const r = await s.post<ErrorBody>("/api/analysis", { code: PY_CODE, language: "python" });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("AI_BAD_RESPONSE");
    expect(r.body.error.message).not.toMatch(/not json|zod|schema/i);
    expect(await ctx.db.analysis.count()).toBe(0);
    expect(await ctx.db.activityEvent.count()).toBe(0);
  });

  it("accepts JSON wrapped in markdown fences", async () => {
    const s = await signup(ctx);
    ctx.transport.queue("meticulous senior code reviewer", {
      text: `\`\`\`json\n${JSON.stringify(fixtures.analysis)}\n\`\`\``,
      codeOutputs: [],
      inputTokens: 1,
      outputTokens: 1,
    });
    expect((await s.post("/api/analysis", { code: PY_CODE, language: "python" })).status).toBe(200);
    expect(ctx.transport.calls).toHaveLength(1);
  });

  it("maps provider timeouts to 504 and busy to 503", async () => {
    const s = await signup(ctx);
    ctx.transport.queue("meticulous senior code reviewer", () => {
      throw new AppError(504, "AI_TIMEOUT", "The AI service took too long to respond. Please try again.");
    });
    const t = await s.post<ErrorBody>("/api/analysis", { code: PY_CODE, language: "python" });
    expect(t.status).toBe(504);
    expect(t.body.error.code).toBe("AI_TIMEOUT");

    ctx.transport.queue("meticulous senior code reviewer", () => {
      throw new AppError(503, "AI_BUSY", "busy");
    });
    expect((await s.post("/api/analysis", { code: PY_CODE, language: "python" })).status).toBe(503);
  });

  it("logs model, tokens, latency and cost for every AI call", async () => {
    const s = await signup(ctx);
    await s.post("/api/analysis", { code: PY_CODE, language: "python" });
    const log = await ctx.db.aiCallLog.findFirstOrThrow();
    expect(log.feature).toBe("analysis");
    expect(log.model).toBe(ctx.env.GEMINI_MODEL);
    expect(log.inputTokens).toBe(120);
    expect(log.outputTokens).toBe(60);
    expect(log.latencyMs).toBeGreaterThanOrEqual(0);
    expect(log.costUsd).toBeCloseTo((120 / 1e6) * 0.3 + (60 / 1e6) * 2.5, 9);
    expect(log.ok).toBe(true);
  });
});

describe("POST /api/optimization (+ /verify)", () => {
  async function optimize(s: Awaited<ReturnType<typeof signup>>): Promise<OptimizationResult> {
    const r = await s.post<OptimizationResult>("/api/optimization", { code: PY_CODE, language: "python" });
    expect(r.status).toBe(200);
    return optimizationResultSchema.parse(r.body);
  }

  it("returns 3–4 candidates with server-assigned ids and a valid recommendation", async () => {
    const s = await signup(ctx);
    const o = await optimize(s);
    expect(o.candidates).toHaveLength(4);
    expect(new Set(o.candidates.map((c) => c.id)).size).toBe(4);
    expect(o.recommendedId).toBe(o.candidates[1]?.id);
    expect(o.original.code).toBe(PY_CODE);
    expect(o.candidates.map((c) => c.name)).toEqual(["Candidate 1", "Candidate 2", "Candidate 3", "Candidate 4"]);
    expect(await ctx.db.optimizationCandidate.count()).toBe(4);
  });

  it("falls back to the highest-improvement candidate when recommendedIndex is out of range", async () => {
    const s = await signup(ctx);
    const three = { ...fixtures.optimization, candidates: fixtures.optimization.candidates.slice(0, 3), recommendedIndex: 3 };
    ctx.transport.queue("performance-engineering expert", json(three));
    const o = await optimize(s);
    expect(o.candidates).toHaveLength(3);
    expect(o.recommendedId).toBe(o.candidates[1]?.id); // improvement 84 is the max
  });

  it("rejects invalid input and records history on success", async () => {
    const s = await signup(ctx);
    expect((await s.post("/api/optimization", { code: PY_CODE })).status).toBe(400);
    await optimize(s);
    const history = await s.get<{ status: string; optimizationPercent: number; optimizedComplexity: string }[]>("/api/history");
    expect(history.body[0]).toMatchObject({ status: "optimized", optimizationPercent: 84, optimizedComplexity: "O(n)" });
  });

  it("verifies a candidate from executed sandbox output and stores the result", async () => {
    const s = await signup(ctx);
    const o = await optimize(s);
    const r = await s.post("/api/optimization/verify", { candidateId: o.recommendedId });
    expect(r.status).toBe(200);
    expect(verificationResultSchema.parse(r.body)).toEqual({ candidateId: o.recommendedId, passed: 100, total: 100, equivalent: true });

    const call = ctx.transport.callsFor("verify behavioural equivalence")[0];
    expect(call?.codeExecution).toBe(true);
    expect(call?.jsonSchema).toBeUndefined();
    const stored = await ctx.db.optimizationCandidate.findUniqueOrThrow({ where: { id: o.recommendedId } });
    expect(stored.verifiedPassed).toBe(100);
  });

  it("reports non-equivalence when some tests fail", async () => {
    const s = await signup(ctx);
    const o = await optimize(s);
    ctx.transport.queue("verify behavioural equivalence", exec({ passed: 93, total: 100 }));
    const r = await s.post<{ passed: number; equivalent: boolean }>("/api/optimization/verify", { candidateId: o.recommendedId });
    expect(r.body).toMatchObject({ passed: 93, equivalent: false });
  });

  it("ignores prose claims: only the executed JSON line counts, and a wrong total is rejected", async () => {
    const s = await signup(ctx);
    const o = await optimize(s);
    const liar = { text: "All 100 tests passed!", codeOutputs: [], inputTokens: 1, outputTokens: 1 };
    ctx.transport.queue("verify behavioural equivalence", liar, exec({ passed: 5, total: 5 }));
    const r = await s.post<ErrorBody>("/api/optimization/verify", { candidateId: o.recommendedId });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("AI_BAD_RESPONSE");
  });

  it("validates the verify body and hides other users' candidates (404)", async () => {
    const owner = await signup(ctx, "owner@example.com");
    const other = await signup(ctx, "other@example.com");
    const o = await optimize(owner);
    expect((await owner.post("/api/optimization/verify", {})).status).toBe(400);
    const r = await other.post<ErrorBody>("/api/optimization/verify", { candidateId: o.recommendedId });
    expect(r.status).toBe(404);
    expect(ctx.transport.callsFor("verify behavioural equivalence")).toHaveLength(0);
  });
});

describe("POST /api/conversion", () => {
  const body = { code: PY_CODE, sourceLanguage: "python", targetLanguage: "java", optimizeWhileConverting: true };

  it("converts code and records history", async () => {
    const s = await signup(ctx);
    const r = await s.post("/api/conversion", body);
    expect(r.status).toBe(200);
    const c = conversionResultSchema.parse(r.body);
    expect(c.targetLanguage).toBe("java");
    expect(c.changes[0]?.category).toBe("syntax");
    expect(ctx.transport.calls[0]?.prompt).toContain("improve complexity");
    expect(ctx.transport.calls[0]?.system).toContain("Never return minified or single-line code");
    expect(ctx.transport.calls[0]?.prompt).toContain("real line breaks and indentation");
    const history = await s.get<{ status: string; language: string; originalComplexity: string }[]>("/api/history");
    expect(history.body[0]).toMatchObject({ status: "converted", language: "java", originalComplexity: "O(n²)" });
  });

  it("rejects same-language conversion and bad input", async () => {
    const s = await signup(ctx);
    expect((await s.post<ErrorBody>("/api/conversion", { ...body, targetLanguage: "python" })).status).toBe(400);
    expect((await s.post("/api/conversion", { ...body, targetLanguage: "rust" })).status).toBe(400);
    expect((await s.post("/api/conversion", { sourceLanguage: "python", targetLanguage: "java" })).status).toBe(400);
  });

  it("defaults optimizeWhileConverting to false", async () => {
    const s = await signup(ctx);
    const { optimizeWhileConverting: _omit, ...rest } = body;
    await s.post("/api/conversion", rest);
    expect(ctx.transport.calls[0]?.prompt).toContain("translate faithfully");
  });
});

describe("POST /api/benchmark", () => {
  async function setup() {
    const s = await signup(ctx);
    const o = (await s.post<OptimizationResult>("/api/optimization", { code: PY_CODE, language: "python" })).body;
    return { s, o };
  }

  it("409s when the user has never optimized anything", async () => {
    const s = await signup(ctx);
    const r = await s.post<ErrorBody>("/api/benchmark", {});
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("NO_OPTIMIZATION");
  });

  it("benchmarks the recommended candidate by default, computing derived fields on the server", async () => {
    const { s, o } = await setup();
    const r = await s.post<BenchmarkResult>("/api/benchmark", {});
    expect(r.status).toBe(200);
    const b = benchmarkResultSchema.parse(r.body);
    expect(b.isMockData).toBe(false);
    expect(b.executionSeries.map((p) => p.input)).toEqual(["1K", "5K", "10K", "50K", "100K"]);
    expect(b.improvementPercent).toBe(75); // (200-50)/200
    expect(b.metrics[0]).toMatchObject({ label: "Execution Time", original: 200, optimized: 50, unit: "ms" });
    expect(b.optimizedComplexity).toEqual({ time: "O(n)", space: "O(1)" });
    expect(b.originalComplexity.time).toBe("O(n²)");
    // Not verified beforehand, so the benchmark ran verification itself.
    expect(b.verification).toEqual({ total: 100, passed: 100, failed: 0 });
    expect(b.trustScore.correctness).toBe(100);
    expect(b.trustScore.benchmark).toBe(88); // one extrapolated point
    expect(b.notes.join(" ")).toMatch(/extrapolated/);
    expect(ctx.transport.callsFor("verify behavioural equivalence")).toHaveLength(1);
    expect(o.recommendedId).toBeTruthy();
  });

  it("reuses stored verification when the candidate was already verified", async () => {
    const { s, o } = await setup();
    const cand = o.candidates[0]?.id ?? "";
    await s.post("/api/optimization/verify", { candidateId: cand });
    const r = await s.post<BenchmarkResult>("/api/benchmark", { candidateId: cand });
    expect(r.status).toBe(200);
    expect(ctx.transport.callsFor("verify behavioural equivalence")).toHaveLength(1);
    expect(r.body.optimizedComplexity.space).toBe("O(n)");
  });

  it("records history and activity", async () => {
    const { s } = await setup();
    await s.post("/api/benchmark", {});
    const history = await s.get<{ status: string; optimizationPercent: number }[]>("/api/history");
    expect(history.body[0]).toMatchObject({ status: "benchmarked", optimizationPercent: 75 });
    expect(await ctx.db.benchmark.count()).toBe(1);
  });

  it("404s for another user's candidate and 400s on a bad body", async () => {
    const { o } = await setup();
    const other = await signup(ctx, "other@example.com");
    expect((await other.post("/api/benchmark", { candidateId: o.recommendedId })).status).toBe(404);
    expect((await other.post("/api/benchmark", { candidateId: 5 })).status).toBe(400);
  });

  it("retries once if the script prints no usable JSON", async () => {
    const { s } = await setup();
    ctx.transport.queue("benchmark two implementations", { text: "done", codeOutputs: ["Traceback..."], inputTokens: 1, outputTokens: 1 });
    expect((await s.post("/api/benchmark", {})).status).toBe(200);
    expect(ctx.transport.callsFor("benchmark two implementations")).toHaveLength(2);
  });
});
