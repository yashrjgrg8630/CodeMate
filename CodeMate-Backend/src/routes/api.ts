import { Hono, type MiddlewareHandler } from "hono";
import type { Env } from "../config/env.js";
import { AppError, notFound } from "../lib/errors.js";
import { parseBody, parseQuery, type AppBindings } from "../lib/http.js";
import type { Db } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit, type MemoryRateLimiter } from "../middleware/rate-limit.js";
import {
  analysisBody,
  benchmarkBody,
  careerJobBody,
  conversionBody,
  historyCreateBody,
  interviewEvaluateBody,
  interviewReportBody,
  interviewStartBody,
  optimizationBody,
  roadmapBody,
  roadmapProblemPatch,
  tzQuery,
  verifyBody,
} from "../schemas/requests.js";
import type { AIService } from "../services/ai/ai-service.js";
import type { AuthService } from "../services/auth.js";
import { runBenchmark } from "../services/benchmark.js";
import { analyzeJob } from "../services/career.js";
import { analyzeCode } from "../services/code-analysis.js";
import { convertCode } from "../services/conversion.js";
import { clearHistory, createHistoryItem, deleteHistoryItem, getHistoryItem, listHistory } from "../services/history.js";
import { evaluateAnswer, interviewReport, startInterview } from "../services/interview.js";
import { optimizeCode, verifyCandidate } from "../services/optimization.js";
import { generateRoadmap, latestRoadmap, setProblemState } from "../services/roadmap.js";
import { getDashboard, getProgress } from "../services/stats.js";

export interface ApiRouteDeps {
  env: Env;
  db: Db;
  ai: AIService;
  auth: AuthService;
  limiter: MemoryRateLimiter;
}

export function createApiRoutes(deps: ApiRouteDeps): Hono<AppBindings> {
  const { env, db, ai } = deps;
  const app = new Hono<AppBindings>();
  const svc = { db, ai };

  app.use("*", requireAuth(deps.auth));

  // Per-user AI protection: requests/minute plus a rolling 24h quota backed by AiCallLog.
  const aiMinute = rateLimit({
    limiter: deps.limiter,
    name: "ai",
    limit: env.AI_RATE_LIMIT_PER_MIN,
    windowMs: 60_000,
    key: (c) => String(c.get("userId")),
  });
  const aiQuota: MiddlewareHandler<AppBindings> = async (c, next) => {
    const used = await ai.callsInLast24h(c.get("userId"));
    if (used >= env.AI_DAILY_LIMIT) {
      throw new AppError(429, "AI_QUOTA_EXCEEDED", "Daily AI usage limit reached. Please try again tomorrow.");
    }
    await next();
  };
  const aiGuard = [aiMinute, aiQuota] as const;

  // ---- Analyzer
  app.post("/analysis", ...aiGuard, async (c) => {
    const body = await parseBody(c, analysisBody);
    return c.json(await analyzeCode(svc, c.get("userId"), body));
  });

  // ---- Optimizer
  app.post("/optimization", ...aiGuard, async (c) => {
    const body = await parseBody(c, optimizationBody);
    return c.json(await optimizeCode(svc, c.get("userId"), body));
  });
  app.post("/optimization/verify", ...aiGuard, async (c) => {
    const body = await parseBody(c, verifyBody);
    return c.json(await verifyCandidate(svc, c.get("userId"), body.candidateId));
  });

  // ---- Converter
  app.post("/conversion", ...aiGuard, async (c) => {
    const body = await parseBody(c, conversionBody);
    return c.json(await convertCode(svc, c.get("userId"), body));
  });

  // ---- Benchmark
  app.post("/benchmark", ...aiGuard, async (c) => {
    const body = await parseBody(c, benchmarkBody);
    return c.json(await runBenchmark(svc, c.get("userId"), body));
  });

  // ---- History
  app.get("/history", async (c) => c.json(await listHistory(db, c.get("userId"))));
  app.get("/history/:id", async (c) => {
    const id = c.req.param("id");
    if (id.length > 100) throw notFound("History item not found.");
    return c.json(await getHistoryItem(db, c.get("userId"), id));
  });
  app.post("/history", async (c) => {
    const body = await parseBody(c, historyCreateBody);
    return c.json(await createHistoryItem(db, c.get("userId"), body), 201);
  });
  app.delete("/history/:id", async (c) => {
    const id = c.req.param("id");
    if (id.length > 100 || !(await deleteHistoryItem(db, c.get("userId"), id))) {
      throw notFound("History item not found.");
    }
    return c.body(null, 204);
  });
  app.delete("/history", async (c) => {
    await clearHistory(db, c.get("userId"));
    return c.body(null, 204);
  });

  // ---- Career
  app.post("/career/job", ...aiGuard, async (c) => {
    const body = await parseBody(c, careerJobBody);
    return c.json(await analyzeJob(svc, c.get("userId"), body));
  });

  // ---- Mock interview
  app.post("/interview/start", ...aiGuard, async (c) => {
    const body = await parseBody(c, interviewStartBody);
    return c.json(await startInterview(svc, c.get("userId"), body));
  });
  app.post("/interview/evaluate", ...aiGuard, async (c) => {
    const body = await parseBody(c, interviewEvaluateBody);
    return c.json(await evaluateAnswer(svc, c.get("userId"), body));
  });
  app.post("/interview/report", ...aiGuard, async (c) => {
    const body = await parseBody(c, interviewReportBody);
    return c.json(await interviewReport(svc, c.get("userId"), body));
  });

  // ---- Progress & dashboard (pure aggregation of stored activity)
  app.get("/progress", async (c) => {
    const { tz } = parseQuery(c, tzQuery);
    return c.json(await getProgress(db, c.get("userId"), tz ?? "UTC"));
  });
  app.delete("/activity/:id", async (c) => {
    const activityId = c.req.param("id");
    if (!activityId || activityId.length > 200) throw notFound("Activity not found.");

    const result = await db.activityEvent.deleteMany({
      where: { id: activityId, userId: c.get("userId") },
    });

    if (result.count === 0) throw notFound("Activity not found.");
    return c.body(null, 204);
  });
  app.delete("/activity", async (c) => {
    await db.activityEvent.deleteMany({ where: { userId: c.get("userId") } });
    return c.body(null, 204);
  });
  app.get("/dashboard", async (c) => c.json(await getDashboard(db, c.get("userId"))));

  // ---- DSA roadmap
  app.post("/roadmap", ...aiGuard, async (c) => {
    const body = await parseBody(c, roadmapBody);
    return c.json(await generateRoadmap(svc, c.get("userId"), body));
  });
  app.get("/roadmap/latest", async (c) => c.json(await latestRoadmap(db, c.get("userId"))));
  app.patch("/roadmap/:roadmapId/problems/:problemId", async (c) => {
    const body = await parseBody(c, roadmapProblemPatch);
    const { roadmapId, problemId } = c.req.param();
    return c.json(await setProblemState(db, c.get("userId"), roadmapId, problemId, body));
  });

  return app;
}
