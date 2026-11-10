import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { googleOAuthEnabled, type Env } from "../config/env.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { parseBody, type AppBindings } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { ACCESS_COOKIE, OAUTH_COOKIE, REFRESH_COOKIE, requireAuth } from "../middleware/auth.js";
import { rateLimit, type MemoryRateLimiter, clientIp } from "../middleware/rate-limit.js";
import { loginBody, signupBody } from "../schemas/requests.js";
import { toPublicUser, type AuthService, type SessionTokens } from "../services/auth.js";

const REFRESH_PATH = "/api/auth";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export interface AuthRouteDeps {
  env: Env;
  auth: AuthService;
  limiter: MemoryRateLimiter;
  fetchImpl: typeof fetch;
}

export function createAuthRoutes(deps: AuthRouteDeps): Hono<AppBindings> {
  const { env, auth } = deps;
  const app = new Hono<AppBindings>();

  const sameSite = env.COOKIE_SAMESITE === "none" ? "None" : env.COOKIE_SAMESITE === "strict" ? "Strict" : "Lax";
  const secure = env.NODE_ENV === "production" || env.COOKIE_SAMESITE === "none";
  const base = { httpOnly: true, secure, sameSite, ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}) } as const;

  function setSession(c: Context, tokens: SessionTokens): void {
    setCookie(c, ACCESS_COOKIE, tokens.accessToken, { ...base, path: "/", maxAge: env.ACCESS_TOKEN_TTL_SECONDS });
    setCookie(c, REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      path: REFRESH_PATH,
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    });
  }
  function clearSession(c: Context): void {
    deleteCookie(c, ACCESS_COOKIE, { ...base, path: "/" });
    deleteCookie(c, REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
  }

  const authLimit = rateLimit({
    limiter: deps.limiter,
    name: "auth",
    limit: env.AUTH_RATE_LIMIT_PER_MIN,
    windowMs: 60_000,
    key: (c) => clientIp(c, env.TRUST_PROXY),
  });

  app.post("/signup", authLimit, async (c) => {
    const body = await parseBody(c, signupBody);
    const user = await auth.signup(body);
    setSession(c, await auth.startSession(user.id));
    return c.json({ user: toPublicUser(user) }, 201);
  });

  app.post("/login", authLimit, async (c) => {
    const body = await parseBody(c, loginBody);
    const user = await auth.login(body);
    setSession(c, await auth.startSession(user.id));
    return c.json({ user: toPublicUser(user) });
  });

  app.post("/refresh", authLimit, async (c) => {
    const raw = getCookie(c, REFRESH_COOKIE);
    if (!raw) throw unauthorized("No refresh token.");
    try {
      const { user, tokens } = await auth.rotate(raw);
      setSession(c, tokens);
      return c.json({ user: toPublicUser(user) });
    } catch (err) {
      clearSession(c);
      throw err;
    }
  });

  app.post("/logout", async (c) => {
    await auth.revoke(getCookie(c, REFRESH_COOKIE));
    clearSession(c);
    return c.json({ ok: true });
  });

  app.get("/me", requireAuth(auth), async (c) => {
    return c.json({ user: toPublicUser(await auth.getUser(c.get("userId"))) });
  });

  // ---------- Google OAuth (authorization code + PKCE, state bound to a signed httpOnly cookie) ----------

  const failureRedirect = env.OAUTH_FAILURE_REDIRECT ?? `${env.FRONTEND_ORIGIN}/login?error=oauth`;
  const successRedirect = env.OAUTH_SUCCESS_REDIRECT ?? `${env.FRONTEND_ORIGIN}/dashboard`;

  app.get("/google", authLimit, async (c) => {
    if (!googleOAuthEnabled(env)) throw new AppError(404, "OAUTH_DISABLED", "Google sign-in is not configured.");
    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    setCookie(c, OAUTH_COOKIE, await auth.signOAuthState({ state, verifier }), {
      ...base,
      sameSite: "Lax", // must survive the top-level redirect back from Google
      path: `${REFRESH_PATH}/google`,
      maxAge: 600,
    });

    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: env.GOOGLE_REDIRECT_URI ?? "",
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return c.redirect(url.toString(), 302);
  });

  app.get("/google/callback", authLimit, async (c) => {
    if (!googleOAuthEnabled(env)) throw new AppError(404, "OAUTH_DISABLED", "Google sign-in is not configured.");
    const fail = (reason: string): Response => {
      logger.warn("oauth.google_failed", { reason });
      deleteCookie(c, OAUTH_COOKIE, { ...base, path: `${REFRESH_PATH}/google` });
      return c.redirect(failureRedirect, 302);
    };

    const cookie = getCookie(c, OAUTH_COOKIE);
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (c.req.query("error") || !cookie || !code || !state) return fail("missing_params");

    let saved: { state: string; verifier: string };
    try {
      saved = await auth.verifyOAuthState(cookie);
    } catch {
      return fail("bad_state_cookie");
    }
    if (saved.state !== state) return fail("state_mismatch");

    try {
      const tokenRes = await deps.fetchImpl(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID ?? "",
          client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri: env.GOOGLE_REDIRECT_URI ?? "",
          grant_type: "authorization_code",
          code_verifier: saved.verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenRes.ok) return fail(`token_exchange_${tokenRes.status}`);
      const tokens = (await tokenRes.json()) as { access_token?: string };
      if (!tokens.access_token) return fail("no_access_token");

      const infoRes = await deps.fetchImpl(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!infoRes.ok) return fail(`userinfo_${infoRes.status}`);
      const info = (await infoRes.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };
      if (!info.sub || !info.email || info.email_verified !== true) return fail("unverified_email");

      const user = await auth.findOrCreateGoogleUser({
        sub: info.sub,
        email: info.email,
        name: info.name ?? info.email.split("@")[0] ?? "User",
        picture: info.picture,
      });
      deleteCookie(c, OAUTH_COOKIE, { ...base, path: `${REFRESH_PATH}/google` });
      setSession(c, await auth.startSession(user.id));
      return c.redirect(successRedirect, 302);
    } catch (err) {
      return fail(err instanceof Error ? err.name : "unknown");
    }
  });

  return app;
}
