import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "@prisma/client";
import type { Env } from "../config/env.js";
import { AppError, conflict, unauthorized } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";
import { newId, sha256 } from "../lib/util.js";
import type { PublicUser } from "../schemas/domain.js";

const ISSUER = "codemate-api";
const ACCESS_AUDIENCE = "codemate-web";
const OAUTH_AUDIENCE = "codemate-oauth-state";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export const toPublicUser = (u: Pick<User, "id" | "email" | "name" | "avatarUrl">): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  avatarUrl: u.avatarUrl,
});

export class AuthService {
  private readonly secret: Uint8Array;
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly env: Env,
    private readonly db: Db,
  ) {
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  // ---------- passwords ----------

  async signup(input: { email: string; password: string; name: string }): Promise<User> {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict("EMAIL_TAKEN", "An account with this email already exists.");
    const passwordHash = await bcrypt.hash(input.password, this.env.BCRYPT_ROUNDS);
    try {
      return await this.db.user.create({ data: { email: input.email, name: input.name, passwordHash } });
    } catch (err) {
      // Lost a race with a concurrent signup for the same email.
      if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
        throw conflict("EMAIL_TAKEN", "An account with this email already exists.");
      }
      throw err;
    }
  }

  async login(input: { email: string; password: string }): Promise<User> {
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    // Always run a bcrypt compare so response time does not reveal whether the email exists.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const ok = await bcrypt.compare(input.password, hash);
    if (!user || !user.passwordHash || !ok) throw unauthorized("Invalid email or password.");
    return user;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash("codemate-dummy-password", this.env.BCRYPT_ROUNDS);
    return this.dummyHash;
  }

  // ---------- access tokens ----------

  private signAccess(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(ACCESS_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  async verifyAccess(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: ACCESS_AUDIENCE,
      });
      if (!payload.sub) throw new Error("missing sub");
      return payload.sub;
    } catch {
      throw unauthorized("Session expired or invalid.");
    }
  }

  // ---------- refresh tokens (opaque, hashed, rotated, reuse-detected) ----------

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  async startSession(userId: string): Promise<SessionTokens> {
    return this.issueRefresh(userId, newId("fam"));
  }

  private async issueRefresh(userId: string, familyId: string): Promise<SessionTokens> {
    const refreshToken = randomBytes(48).toString("base64url");
    await this.db.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(refreshToken), expiresAt: this.refreshExpiry() },
    });
    return { accessToken: await this.signAccess(userId), refreshToken };
  }

  /**
   * Exchanges a refresh token for a new pair. The presented token is revoked atomically; presenting an
   * already-used token is treated as theft and revokes the whole rotation family.
   */
  async rotate(rawToken: string): Promise<{ user: User; tokens: SessionTokens }> {
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!row) throw unauthorized("Invalid refresh token.");

    if (row.revokedAt) {
      await this.db.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized("Refresh token was already used. Please sign in again.");
    }
    if (row.expiresAt <= new Date()) throw unauthorized("Refresh token expired. Please sign in again.");

    const claimed = await this.db.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      // A concurrent request rotated it first: same outcome as reuse.
      await this.db.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized("Refresh token was already used. Please sign in again.");
    }

    const user = await this.db.user.findUnique({ where: { id: row.userId } });
    if (!user) throw unauthorized("Account no longer exists.");

    const tokens = await this.issueRefresh(user.id, row.familyId);
    const next = await this.db.refreshToken.findUnique({ where: { tokenHash: sha256(tokens.refreshToken) } });
    if (next) await this.db.refreshToken.update({ where: { id: row.id }, data: { replacedById: next.id } });
    return { user, tokens };
  }

  async revoke(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!row) return;
    await this.db.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async getUser(userId: string): Promise<User> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized("Account no longer exists.");
    return user;
  }

  // ---------- Google OAuth ----------

  async signOAuthState(payload: { state: string; verifier: string }): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience(OAUTH_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(this.secret);
  }

  async verifyOAuthState(token: string): Promise<{ state: string; verifier: string }> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ["HS256"], issuer: ISSUER, audience: OAUTH_AUDIENCE });
      if (typeof payload["state"] !== "string" || typeof payload["verifier"] !== "string") throw new Error("bad payload");
      return { state: payload["state"], verifier: payload["verifier"] };
    } catch {
      throw new AppError(400, "OAUTH_STATE_INVALID", "OAuth state is missing or expired.");
    }
  }

  async findOrCreateGoogleUser(profile: { sub: string; email: string; name: string; picture?: string | undefined }): Promise<User> {
    const bySubject = await this.db.user.findUnique({
      where: { oauthProvider_oauthSubject: { oauthProvider: "google", oauthSubject: profile.sub } },
    });
    if (bySubject) return bySubject;

    const email = profile.email.toLowerCase();
    const byEmail = await this.db.user.findUnique({ where: { email } });
    if (byEmail) {
      if (byEmail.oauthProvider && byEmail.oauthProvider !== "google") {
        throw new AppError(409, "ACCOUNT_CONFLICT", "This email is linked to a different sign-in method.");
      }
      if (byEmail.oauthSubject && byEmail.oauthSubject !== profile.sub) {
        throw new AppError(409, "ACCOUNT_CONFLICT", "This email is linked to a different Google account.");
      }
      // Linking a password account: Google has verified the email, but signup here never did, so the
      // password may belong to someone who pre-registered the address. Drop it and kill existing sessions.
      const [linked] = await this.db.$transaction([
        this.db.user.update({
          where: { id: byEmail.id },
          data: {
            oauthProvider: "google",
            oauthSubject: profile.sub,
            passwordHash: null,
            avatarUrl: byEmail.avatarUrl ?? profile.picture ?? null,
          },
        }),
        this.db.refreshToken.updateMany({ where: { userId: byEmail.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      return linked;
    }

    return this.db.user.create({
      data: {
        email,
        name: profile.name.slice(0, 80) || email.split("@")[0] || "User",
        avatarUrl: profile.picture ?? null,
        oauthProvider: "google",
        oauthSubject: profile.sub,
      },
    });
  }
}
