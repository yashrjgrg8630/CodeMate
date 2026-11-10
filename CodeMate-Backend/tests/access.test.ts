import { beforeEach, describe, expect, it } from "vitest";
import { createCtx, PY_CODE, resetDb, Session, signup, type Ctx, type ErrorBody } from "./helpers.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

const code = { code: PY_CODE, language: "python" };
const endpoints: [string, string, unknown][] = [
  ["POST", "/api/analysis", code],
  ["POST", "/api/optimization", code],
  ["POST", "/api/optimization/verify", { candidateId: "cand_x" }],
  ["POST", "/api/conversion", { code: PY_CODE, sourceLanguage: "python", targetLanguage: "java", optimizeWhileConverting: false }],
  ["POST", "/api/benchmark", {}],
  ["GET", "/api/history", undefined],
  ["GET", "/api/history/h_1", undefined],
  ["POST", "/api/history", { title: "t", language: "python", status: "analyzed" }],
  ["POST", "/api/career/job", { jobDescription: "We are hiring a backend engineer with Java experience." }],
  ["POST", "/api/interview/start", { role: "Software Engineer" }],
  ["POST", "/api/interview/evaluate", { questionId: "q_1", answer: "a", code: "" }],
  ["POST", "/api/interview/report", { scores: [70] }],
  ["GET", "/api/progress", undefined],
  ["GET", "/api/dashboard", undefined],
  ["POST", "/api/roadmap", { targetRole: "Software Engineer", currentLevel: "Intermediate", weeks: 8 }],
  ["GET", "/api/roadmap/latest", undefined],
  ["PATCH", "/api/roadmap/rm_1/problems/p_1", { completed: true }],
];

describe("authentication is required on every protected endpoint", () => {
  it.each(endpoints)("%s %s → 401 without a session", async (method, path, body) => {
    const r = await new Session(ctx.app).request<ErrorBody>(method, path, body);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHORIZED");
  });

  it("never calls the model for an unauthenticated request", async () => {
    await new Session(ctx.app).post("/api/analysis", code);
    expect(ctx.transport.calls).toHaveLength(0);
  });
});

describe("misc", () => {
  it("serves /health without auth", async () => {
    const r = await new Session(ctx.app).get<{ ok: boolean }>("/health");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it("returns the standard error shape for unknown routes (401 first, so route existence is not revealed)", async () => {
    expect((await new Session(ctx.app).get<ErrorBody>("/api/nope")).status).toBe(401);
    const s = await signup(ctx);
    const r = await s.get<ErrorBody>("/api/nope");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
    const outside = await s.get<ErrorBody>("/nope");
    expect(outside.status).toBe(404);
  });

  it("sets security headers and disables caching on API responses", async () => {
    const r = await new Session(ctx.app).get("/api/auth/me");
    expect(r.res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.res.headers.get("cache-control")).toBe("no-store");
    expect(r.res.headers.get("x-request-id")).toBeTruthy();
  });
});
