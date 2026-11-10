import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { loadEnv } from "../src/config/env.js";
import { titleFromCode, normalizeShares, relativeTime } from "../src/lib/util.js";
import { toGeminiSchema } from "../src/services/ai/ai-service.js";
import { providerErrorStatus } from "../src/services/ai/transport.js";
import { canonicalTopic } from "../src/services/stats.js";
import { createCtx, PASSWORD, PY_CODE, resetDb, Session, signup, testEnv, type ErrorBody } from "./helpers.js";

beforeEach(resetDb);

describe("rate limiting and quotas", () => {
  it("limits AI calls per user per minute, with Retry-After, without affecting other users", async () => {
    const ctx = createCtx({ AI_RATE_LIMIT_PER_MIN: "2" });
    const a = await signup(ctx, "a@example.com");
    const b = await signup(ctx, "b@example.com");
    const call = (s: Session) => s.post<ErrorBody>("/api/analysis", { code: PY_CODE, language: "python" });
    expect((await call(a)).status).toBe(200);
    expect((await call(a)).status).toBe(200);
    const blocked = await call(a);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await call(b)).status).toBe(200);
    expect(ctx.transport.calls).toHaveLength(3);
  });

  it("enforces a rolling daily AI quota backed by the call log", async () => {
    const ctx = createCtx({ AI_DAILY_LIMIT: "2" });
    const s = await signup(ctx);
    await s.post("/api/analysis", { code: PY_CODE, language: "python" });
    await s.post("/api/analysis", { code: PY_CODE, language: "python" });
    const r = await s.post<ErrorBody>("/api/analysis", { code: PY_CODE, language: "python" });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("AI_QUOTA_EXCEEDED");
    expect(ctx.transport.calls).toHaveLength(2);
    // non-AI endpoints stay available
    expect((await s.get("/api/history")).status).toBe(200);
  });

  it("rate limits auth endpoints per IP", async () => {
    const ctx = createCtx({ AUTH_RATE_LIMIT_PER_MIN: "3" });
    const s = new Session(ctx.app);
    for (let i = 0; i < 3; i += 1) {
      expect((await s.post("/api/auth/login", { email: "x@example.com", password: PASSWORD })).status).toBe(401);
    }
    const r = await s.post<ErrorBody>("/api/auth/login", { email: "x@example.com", password: PASSWORD });
    expect(r.status).toBe(429);
  });

  it("applies the general limiter", async () => {
    const ctx = createCtx({ GENERAL_RATE_LIMIT_PER_MIN: "3" });
    const s = new Session(ctx.app);
    for (let i = 0; i < 3; i += 1) await s.get("/api/auth/me");
    expect((await s.get("/api/auth/me")).status).toBe(429);
  });

  it("rejects oversized bodies with 413", async () => {
    const ctx = createCtx();
    const s = await signup(ctx);
    const r = await s.request<ErrorBody>("POST", "/api/analysis", undefined, { rawBody: JSON.stringify({ code: "x".repeat(300_000), language: "python" }) });
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("never leaks internals on unexpected errors", async () => {
    const ctx = createCtx();
    const s = await signup(ctx);
    ctx.transport.queue("meticulous senior code reviewer", () => {
      throw new Error("secret connection string postgres://admin:hunter2@db");
    });
    const r = await s.post<ErrorBody>("/api/analysis", { code: PY_CODE, language: "python" });
    expect(r.status).toBe(500);
    expect(r.body.error).toEqual({ code: "INTERNAL", message: "Something went wrong on our side." });
    expect(JSON.stringify(r.body)).not.toContain("hunter2");
  });
});

describe("units", () => {
  it("normalizeShares always sums to the total", () => {
    expect(normalizeShares([32, 28, 20]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(normalizeShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(normalizeShares([0, 0])).toEqual([100, 0]);
    expect(normalizeShares([NaN, 5, -3])).toEqual([0, 100, 0]);
  });

  it("canonicalTopic prefers the most specific topic", () => {
    expect(canonicalTopic("Arrays / Sliding Window")).toBe("Sliding Window");
    expect(canonicalTopic("Two Pointers")).toBe("Two Pointer");
    expect(canonicalTopic("Dynamic Programming")).toBe("Dynamic Programming");
    expect(canonicalTopic("Array Traversal")).toBe("Arrays");
    expect(canonicalTopic("BFS / DFS")).toBe("Graphs");
    expect(canonicalTopic("Binary Trees")).toBe("Trees");
    expect(canonicalTopic("Quantum Gardening")).toBeNull();
    expect(canonicalTopic(null)).toBeNull();
  });

  it("titleFromCode finds function names across languages", () => {
    expect(titleFromCode("def two_sum(a):\n  pass", "x")).toBe("two_sum");
    expect(titleFromCode("function twoSum(a) {}", "x")).toBe("twoSum");
    expect(titleFromCode("const twoSum = (a) => a", "x")).toBe("twoSum");
    expect(titleFromCode("int twoSum(int* a) { }", "x")).toBe("twoSum");
    expect(titleFromCode("1 + 1", "fallback")).toBe("fallback");
  });

  it("relativeTime formats recent and old dates", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    expect(relativeTime(new Date("2026-01-10T11:59:50Z"), now)).toBe("just now");
    expect(relativeTime(new Date("2026-01-10T11:30:00Z"), now)).toBe("30 min ago");
    expect(relativeTime(new Date("2026-01-10T09:00:00Z"), now)).toBe("3h ago");
    expect(relativeTime(new Date("2026-01-08T12:00:00Z"), now)).toBe("2d ago");
    expect(relativeTime(new Date("2025-11-01T12:00:00Z"), now)).toBe("2025-11-01");
  });

  it("toGeminiSchema emits plain JSON Schema without $schema", () => {
    const schema = toGeminiSchema(z.object({ a: z.number().int().min(0).max(100), b: z.enum(["x", "y"]) })) as Record<string, unknown>;
    expect(schema["$schema"]).toBeUndefined();
    expect(schema["type"]).toBe("object");
    expect(JSON.stringify(schema)).toContain('"maximum":100');
  });

  it("recognizes HTTP statuses wrapped by the Gemini SDK", () => {
    expect(providerErrorStatus(new Error("Retryable HTTP Error: Service Unavailable"))).toBe(503);
    expect(providerErrorStatus(new Error("Retryable HTTP Error: Too Many Requests"))).toBe(429);
    expect(providerErrorStatus(new Error("Non-retryable exception Not Found sending request"))).toBe(404);
  });

  it("loadEnv reports every problem and treats blanks as unset", () => {
    expect(() => loadEnv({ NODE_ENV: "test" })).toThrow(/DATABASE_URL[\s\S]*FRONTEND_ORIGIN[\s\S]*JWT_ACCESS_SECRET[\s\S]*GEMINI_API_KEY/);
    expect(() => testEnv({ JWT_ACCESS_SECRET: "short" })).toThrow(/at least 32/);
    const env = testEnv({ GOOGLE_CLIENT_ID: "   ", FRONTEND_ORIGIN: "http://localhost:3000///" });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.FRONTEND_ORIGIN).toBe("http://localhost:3000");
  });
});
