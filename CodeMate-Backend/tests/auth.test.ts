import { beforeEach, describe, expect, it } from "vitest";
import { userSchema } from "../src/schemas/domain.js";
import { createCtx, ORIGIN, PASSWORD, resetDb, Session, signup, type Ctx, type ErrorBody } from "./helpers.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

describe("POST /api/auth/signup", () => {
  it("creates an account, sets httpOnly cookies and never returns the hash", async () => {
    const s = new Session(ctx.app);
    const r = await s.post<{ user: unknown }>("/api/auth/signup", { email: "Ada@Example.com ", password: PASSWORD, name: "Ada" });
    expect(r.status).toBe(201);
    const user = userSchema.parse(r.body.user);
    expect(user.email).toBe("ada@example.com");
    expect(JSON.stringify(r.body)).not.toContain("passwordHash");

    const cookies = r.res.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/cm_access=.*HttpOnly/i);
    expect(cookies).toMatch(/cm_refresh=.*HttpOnly/i);
    expect(cookies).toMatch(/cm_refresh=[^\n]*Path=\/api\/auth/i);
    expect(cookies).toMatch(/SameSite=Lax/i);

    const row = await ctx.db.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("rejects a duplicate email with 409", async () => {
    await signup(ctx);
    const r = await new Session(ctx.app).post<ErrorBody>("/api/auth/signup", { email: "ada@example.com", password: PASSWORD, name: "Again" });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects invalid input with a structured 400", async () => {
    const r = await new Session(ctx.app).post<ErrorBody>("/api/auth/signup", { email: "not-an-email", password: "short", name: "" });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(r.body.error.details)).toBe(true);
  });

  it("rejects malformed JSON", async () => {
    const r = await new Session(ctx.app).request<ErrorBody>("POST", "/api/auth/signup", undefined, { rawBody: "{nope" });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_JSON");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    await signup(ctx);
    const s = new Session(ctx.app);
    const r = await s.post("/api/auth/login", { email: "ADA@example.com", password: PASSWORD });
    expect(r.status).toBe(200);
    expect((await s.get("/api/auth/me")).status).toBe(200);
  });

  it("returns the same 401 for a wrong password and an unknown email", async () => {
    await signup(ctx);
    const wrong = await new Session(ctx.app).post<ErrorBody>("/api/auth/login", { email: "ada@example.com", password: "wrong-password" });
    const unknown = await new Session(ctx.app).post<ErrorBody>("/api/auth/login", { email: "nobody@example.com", password: "wrong-password" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("validates the body", async () => {
    const r = await new Session(ctx.app).post<ErrorBody>("/api/auth/login", { email: "x" });
    expect(r.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user", async () => {
    const s = await signup(ctx);
    const r = await s.get<{ user: unknown }>("/api/auth/me");
    expect(r.status).toBe(200);
    expect(userSchema.parse(r.body.user).name).toBe("Ada");
  });

  it("401s without a session", async () => {
    const r = await new Session(ctx.app).get<ErrorBody>("/api/auth/me");
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHORIZED");
  });

  it("401s on a tampered access token", async () => {
    const s = await signup(ctx);
    const cookie = s.jar.get("cm_access");
    if (!cookie) throw new Error("no cookie");
    s.jar.set("cm_access", { ...cookie, value: `${cookie.value.slice(0, -4)}AAAA` });
    expect((await s.get("/api/auth/me")).status).toBe(401);
  });
});

describe("refresh token rotation", () => {
  it("rotates the refresh token and keeps the session alive", async () => {
    const s = await signup(ctx);
    const before = s.jar.get("cm_refresh")?.value;
    const r = await s.post("/api/auth/refresh");
    expect(r.status).toBe(200);
    expect(s.jar.get("cm_refresh")?.value).not.toBe(before);
    expect((await s.get("/api/auth/me")).status).toBe(200);
  });

  it("treats a replayed refresh token as theft and revokes the whole family", async () => {
    const s = await signup(ctx);
    const stolen = s.jar.get("cm_refresh");
    if (!stolen) throw new Error("no refresh cookie");

    expect((await s.post("/api/auth/refresh")).status).toBe(200); // legitimate rotation
    const legit = s.jar.get("cm_refresh")?.value;

    const attacker = new Session(ctx.app);
    attacker.jar.set("cm_refresh", stolen);
    const replay = await attacker.post<ErrorBody>("/api/auth/refresh");
    expect(replay.status).toBe(401);

    // The legitimate user's newer token is dead too.
    const victim = new Session(ctx.app);
    victim.jar.set("cm_refresh", { value: legit ?? "", path: "/api/auth" });
    expect((await victim.post("/api/auth/refresh")).status).toBe(401);
  });

  it("401s without a refresh cookie", async () => {
    expect((await new Session(ctx.app).post("/api/auth/refresh")).status).toBe(401);
  });

  it("rejects an expired refresh token", async () => {
    const s = await signup(ctx);
    await ctx.db.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await s.post("/api/auth/refresh")).status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears cookies and revokes the refresh token", async () => {
    const s = await signup(ctx);
    const refresh = s.jar.get("cm_refresh");
    const r = await s.post("/api/auth/logout");
    expect(r.status).toBe(200);
    expect(s.jar.has("cm_access")).toBe(false);
    expect((await s.get("/api/auth/me")).status).toBe(401);

    const again = new Session(ctx.app);
    if (refresh) again.jar.set("cm_refresh", refresh);
    expect((await again.post("/api/auth/refresh")).status).toBe(401);
  });
});

describe("CSRF origin guard", () => {
  it("blocks state-changing requests from another origin", async () => {
    const s = await signup(ctx);
    const r = await s.request<ErrorBody>("POST", "/api/analysis", { code: "x", language: "python" }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("BAD_ORIGIN");
  });

  it("answers CORS preflight only for the frontend origin", async () => {
    const res = await ctx.app.request("http://localhost/api/analysis", {
      method: "OPTIONS",
      headers: { origin: ORIGIN, "access-control-request-method": "POST" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

describe("Google OAuth", () => {
  it("is disabled (404) when not configured", async () => {
    const r = await new Session(ctx.app).get<ErrorBody>("/api/auth/google");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("OAUTH_DISABLED");
  });

  const googleEnv = {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:8787/api/auth/google/callback",
  };

  function fakeGoogle(profile: Record<string, unknown>): typeof fetch {
    return (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "g-token" });
      if (url.includes("openidconnect.googleapis.com")) return Response.json(profile);
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
  }

  async function start(c: Ctx): Promise<{ s: Session; state: string }> {
    const s = new Session(c.app);
    const r = await s.get("/api/auth/google");
    expect(r.status).toBe(302);
    const location = new URL(r.res.headers.get("location") ?? "");
    expect(location.host).toBe("accounts.google.com");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("scope")).toContain("email");
    return { s, state: location.searchParams.get("state") ?? "" };
  }

  it("completes the code flow and creates a user", async () => {
    const c = createCtx(googleEnv, fakeGoogle({ sub: "g-123", email: "New@Gmail.com", email_verified: true, name: "New User", picture: "https://img/x.png" }));
    const { s, state } = await start(c);
    const cb = await s.get(`/api/auth/google/callback?code=abc&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
    const me = await s.get<{ user: { email: string; avatarUrl: string } }>("/api/auth/me");
    expect(me.body.user.email).toBe("new@gmail.com");
    expect(me.body.user.avatarUrl).toBe("https://img/x.png");
  });

  it("rejects a mismatched state", async () => {
    const c = createCtx(googleEnv, fakeGoogle({ sub: "g-1", email: "a@b.com", email_verified: true, name: "A" }));
    const { s } = await start(c);
    const cb = await s.get("/api/auth/google/callback?code=abc&state=forged");
    expect(cb.status).toBe(302);
    expect(cb.res.headers.get("location")).toContain("error=oauth");
    expect((await s.get("/api/auth/me")).status).toBe(401);
  });

  it("rejects an unverified Google email", async () => {
    const c = createCtx(googleEnv, fakeGoogle({ sub: "g-2", email: "a@b.com", email_verified: false, name: "A" }));
    const { s, state } = await start(c);
    const cb = await s.get(`/api/auth/google/callback?code=abc&state=${state}`);
    expect(cb.res.headers.get("location")).toContain("error=oauth");
  });

  it("linking an existing password account drops its password and revokes old sessions", async () => {
    const c = createCtx(googleEnv, fakeGoogle({ sub: "g-9", email: "ada@example.com", email_verified: true, name: "Ada" }));
    const old = await signup(c);
    const { s, state } = await start(c);
    expect((await s.get(`/api/auth/google/callback?code=abc&state=${state}`)).res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);

    expect((await new Session(c.app).post("/api/auth/login", { email: "ada@example.com", password: PASSWORD })).status).toBe(401);
    expect((await old.post("/api/auth/refresh")).status).toBe(401);
    expect(await c.db.user.count()).toBe(1);
  });
});
