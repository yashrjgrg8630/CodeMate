import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { unauthorized } from "../lib/errors.js";
import type { AppBindings } from "../lib/http.js";
import type { AuthService } from "../services/auth.js";

export const ACCESS_COOKIE = "cm_access";
export const REFRESH_COOKIE = "cm_refresh";
export const OAUTH_COOKIE = "cm_oauth";

/** Authenticates from the httpOnly access cookie and exposes `userId`. The client never supplies a user id. */
export function requireAuth(auth: AuthService): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const token = getCookie(c, ACCESS_COOKIE);
    if (!token) throw unauthorized();
    c.set("userId", await auth.verifyAccess(token));
    await next();
  };
}
