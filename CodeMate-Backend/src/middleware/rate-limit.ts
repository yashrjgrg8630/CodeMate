import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";

/** Fixed-window in-memory limiter. Per-process: use a shared store (e.g. Redis) when running multiple instances. */
export class MemoryRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSeconds: number } {
    if (this.hits.size > 20_000) this.sweep(now);
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, retryAfterSeconds: 0 };
    }
    cur.count += 1;
    return { ok: cur.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
  }

  private sweep(now: number): void {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function rateLimit(opts: {
  limiter: MemoryRateLimiter;
  name: string;
  limit: number;
  windowMs: number;
  key: (c: Context) => string;
}): MiddlewareHandler {
  return async (c, next) => {
    const result = opts.limiter.hit(`${opts.name}:${opts.key(c)}`, opts.limit, opts.windowMs);
    if (!result.ok) {
      throw new AppError(429, "RATE_LIMITED", "Too many requests. Please slow down and try again shortly.", undefined, {
        "Retry-After": String(result.retryAfterSeconds),
      });
    }
    await next();
  };
}
