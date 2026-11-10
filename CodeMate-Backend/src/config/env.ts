import { z } from "zod";

const optionalString = z.string().optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FRONTEND_ORIGIN: z.string().url().transform((v) => v.replace(/\/+$/, "")),
  TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: optionalString,

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalString,
  OAUTH_SUCCESS_REDIRECT: optionalString,
  OAUTH_FAILURE_REDIRECT: optionalString,

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
  GEMINI_EXEC_MODEL: optionalString,
  GEMINI_THINKING_BUDGET: z.coerce.number().int().min(0).max(32768).optional(),
  GEMINI_COST_PER_MTOK_INPUT: z.coerce.number().min(0).default(0.75),
  GEMINI_COST_PER_MTOK_OUTPUT: z.coerce.number().min(0).default(3.75),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90_000),
  AI_EXEC_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120_000),

  GENERAL_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
  AI_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).default(150),
});

export type Env = z.output<typeof schema>;

/** Parses env vars. Blank values (e.g. `GOOGLE_CLIENT_ID=`) are treated as unset. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim() !== "") cleaned[key] = value.trim();
  }
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export function googleOAuthEnabled(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}
