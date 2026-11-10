import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import type { Env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import type { AppBindings } from "./lib/http.js";
import { logger } from "./lib/logger.js";
import type { Db } from "./lib/prisma.js";
import { clientIp, MemoryRateLimiter, rateLimit } from "./middleware/rate-limit.js";
import { noStore, originGuard, requestId } from "./middleware/security.js";
import { createApiRoutes } from "./routes/api.js";
import { createAuthRoutes } from "./routes/auth.js";
import type { AIService } from "./services/ai/ai-service.js";
import { AuthService } from "./services/auth.js";

export interface AppDeps {
  env: Env;
  db: Db;
  ai: AIService;
  /** Injectable for tests (Google OAuth token exchange). */
  fetchImpl?: typeof fetch;
}

export function createApp(deps: AppDeps): Hono<AppBindings> {
  const { env, db, ai } = deps;
  const app = new Hono<AppBindings>();
  const limiter = new MemoryRateLimiter();
  const auth = new AuthService(env, db);

  app.use("*", requestId);
  app.use("*", secureHeaders());
  app.use(
    "/api/*",
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      maxAge: 600,
    }),
  );
  app.use("/api/*", noStore);
  app.use("/api/*", originGuard(env.FRONTEND_ORIGIN));
  app.use(
    "/api/*",
    rateLimit({
      limiter,
      name: "general",
      limit: env.GENERAL_RATE_LIMIT_PER_MIN,
      windowMs: 60_000,
      key: (c) => clientIp(c, env.TRUST_PROXY),
    }),
  );
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => c.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } }, 413),
    }),
  );

  app.get("/health", async (c) => {
    await db.$queryRaw`SELECT 1`;
    return c.json({ ok: true });
  });

  app.route("/api/auth", createAuthRoutes({ env, auth, limiter, fetchImpl: deps.fetchImpl ?? fetch }));
  app.route("/api", createApiRoutes({ env, db, ai, auth, limiter }));

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      for (const [k, v] of Object.entries(err.headers ?? {})) c.header(k, v);
      return c.json(
        { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } },
        err.status,
      );
    }
    if (err instanceof ZodError) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: err.issues[0]?.message ?? "Invalid request." } }, 400);
    }
    logger.error("request.unhandled", {
      requestId: c.get("requestId"),
      path: c.req.path,
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return c.json({ error: { code: "INTERNAL", message: "Something went wrong on our side." } }, 500);
  });

  return app;
}
