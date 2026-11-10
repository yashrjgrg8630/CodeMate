import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";
import type { AppBindings } from "../lib/http.js";

export const requestId: MiddlewareHandler<AppBindings> = async (c, next) => {
  const id = randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
};

export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
};

/**
 * CSRF defence in depth (on top of SameSite cookies): browsers always send Origin on cross-origin
 * state-changing requests, so reject any whose Origin is not the configured frontend.
 */
export function originGuard(allowedOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const origin = c.req.header("origin");
      if (origin && origin !== allowedOrigin) {
        throw new AppError(403, "BAD_ORIGIN", "Cross-origin request blocked.");
      }
    }
    await next();
  };
}
