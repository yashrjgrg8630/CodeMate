import { beforeEach, describe, expect, it } from "vitest";
import { codeHistoryItemSchema, type CodeHistoryItem } from "../src/schemas/domain.js";
import { createCtx, PY_CODE, resetDb, signup, type Ctx, type ErrorBody } from "./helpers.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

const item = {
  title: "two_sum",
  language: "python",
  status: "optimized",
  originalComplexity: "O(n²)",
  optimizedComplexity: "O(n)",
  optimizationPercent: 80,
  evolution: [{ step: "Original", detail: "Brute force" }],
};

describe("history", () => {
  it("starts empty for a new user", async () => {
    const s = await signup(ctx);
    const r = await s.get<CodeHistoryItem[]>("/api/history");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("saves an item with a server-generated id and date, then reads it back", async () => {
    const s = await signup(ctx);
    const created = await s.post<CodeHistoryItem>("/api/history", item);
    expect(created.status).toBe(201);
    const saved = codeHistoryItemSchema.parse(created.body);
    expect(saved.id).toBeTruthy();
    expect(saved.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(saved).toMatchObject({ title: "two_sum", status: "optimized", optimizationPercent: 80 });

    const one = await s.get<CodeHistoryItem>(`/api/history/${saved.id}`);
    expect(one.status).toBe(200);
    expect(one.body).toEqual(saved);
    expect((await s.get<CodeHistoryItem[]>("/api/history")).body).toHaveLength(1);
  });

  it("accepts the spec's `type` alias and a snippet, and ignores client-supplied id/userId", async () => {
    const s = await signup(ctx);
    const { status: _s, ...rest } = item;
    const r = await s.post<CodeHistoryItem>("/api/history", { ...rest, type: "converted", snippet: "print(1)", id: "evil", userId: "someone-else" });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("converted");
    expect(r.body.id).not.toBe("evil");
    const row = await ctx.db.historyItem.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(row.userId).not.toBe("someone-else");
  });

  it("returns newest first and auto-records every kind of run", async () => {
    const s = await signup(ctx);
    await s.post("/api/analysis", { code: PY_CODE, language: "python" });
    await s.post("/api/optimization", { code: PY_CODE, language: "python" });
    await s.post("/api/conversion", { code: PY_CODE, sourceLanguage: "python", targetLanguage: "java", optimizeWhileConverting: false });
    await s.post("/api/benchmark", {});
    const r = await s.get<CodeHistoryItem[]>("/api/history");
    expect(r.body.map((h) => h.status)).toEqual(["benchmarked", "converted", "optimized", "analyzed"]);
    r.body.forEach((h) => codeHistoryItemSchema.parse(h));
  });

  it("isolates users: never lists or returns another user's items", async () => {
    const a = await signup(ctx, "a@example.com");
    const b = await signup(ctx, "b@example.com");
    const created = await a.post<CodeHistoryItem>("/api/history", item);
    expect((await b.get<CodeHistoryItem[]>("/api/history")).body).toEqual([]);
    const r = await b.get<ErrorBody>(`/api/history/${created.body.id}`);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_FOUND");
  });

  it("404s for an unknown id and 400s on invalid bodies", async () => {
    const s = await signup(ctx);
    expect((await s.get("/api/history/does-not-exist")).status).toBe(404);
    expect((await s.post("/api/history", { ...item, language: "cobol" })).status).toBe(400);
    expect((await s.post("/api/history", { title: "x", language: "python" })).status).toBe(400);
    expect((await s.post("/api/history", { ...item, optimizationPercent: 150 })).status).toBe(400);
    expect((await s.post("/api/history", { ...item, title: "" })).status).toBe(400);
  });
});
