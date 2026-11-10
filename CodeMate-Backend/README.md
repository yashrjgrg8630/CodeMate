# CodeMate AI — Backend

Production backend for the CodeMate AI frontend (React / TanStack Start). It replaces the frontend's mock service layer with a real API.
Node 20+ · TypeScript (strict, no `any`) · Hono · PostgreSQL + Prisma · Zod · **Google Gemini** (via `@google/genai`).

```
src/
  config/env.ts            validated environment (fails fast with every problem listed)
  schemas/domain.ts        Zod mirror of the frontend's src/types/domain.ts (response typing + contract tests)
  schemas/requests.ts      Zod request schemas for every endpoint
  services/ai/             AIService (the only code that talks to Gemini), transport seam, model-output schemas
  services/*.ts            analysis, optimization(+verify), conversion, benchmark, career, interview, roadmap, history, stats, auth
  routes/auth.ts, api.ts   HTTP layer
  middleware/              auth cookie guard, rate limiting, origin (CSRF) guard, request id
prisma/                    schema + initial migration
tests/                     119 integration + unit tests (real Postgres, fake Gemini transport)
```

## Quick start

```bash
cp .env.example .env            # set GEMINI_API_KEY and JWT_ACCESS_SECRET (openssl rand -base64 48)
npm install
npm run db:up                   # Postgres 16 via docker compose
npm run prisma:generate
npm run prisma:deploy           # applies prisma/migrations/0001_init
npm run dev                     # http://localhost:8787  (GET /health)
```

Tests (need Postgres running; they create and rebuild a separate `codemate_test` database):

```bash
npm test
npm run typecheck
```

Production: `npm run build && npm start` (reads `.env` via `--env-file`; set `NODE_ENV=production` so cookies are `Secure`).

> **Verify the migration once.** The initial migration SQL in `prisma/migrations/0001_init` was generated from `schema.prisma` by a script
> (Prisma's schema engine could not be downloaded in the environment I built this in). After `prisma:deploy`, confirm there is no drift:
> `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code`
> (exit code 0 = identical). If it reports differences, run `npx prisma migrate dev --name sync` and commit the result.

## Environment

See `.env.example` (every variable is documented). Required: `DATABASE_URL`, `FRONTEND_ORIGIN`, `JWT_ACCESS_SECRET` (≥32 chars), `GEMINI_API_KEY`.
`GEMINI_MODEL` defaults to `gemini-3.1-flash-lite`, verified with structured JSON output and sandboxed code execution. Use a model available to your key that supports both features.
Google OAuth is optional: leave `GOOGLE_*` blank to disable it (`/api/auth/google` then returns 404).

## API

All `/api/*` routes except `/api/auth/*` require the session cookie. Every error is `{ "error": { "code", "message", "details?" } }`.
The client never supplies a user id; every query is scoped by the id inside the signed access token.

| Method & path | Purpose |
|---|---|
| `POST /api/auth/signup` · `login` · `logout` · `refresh`, `GET /api/auth/me` | Email/password auth, rotating refresh tokens |
| `GET /api/auth/google` → `/google/callback` | Google OAuth (code flow + PKCE + signed state cookie) |
| `POST /api/analysis` | `Analysis` |
| `POST /api/optimization`, `POST /api/optimization/verify` | `OptimizationResult`; sandbox-executed equivalence check on 100 generated tests |
| `POST /api/conversion` | `ConversionResult` |
| `POST /api/benchmark` `{candidateId?}` | `BenchmarkResult` (sandbox-executed timings; `isMockData: false`) |
| `GET /api/history`, `GET /api/history/:id`, `POST /api/history` | Per-user history (every analysis/optimization/conversion/benchmark is auto-recorded) |
| `POST /api/career/job` | `{ analysis, skillGap, roadmap \| null }` in one call |
| `POST /api/interview/start` · `evaluate` · `report` | AI mock interview |
| `GET /api/progress?tz=Asia/Kolkata`, `GET /api/dashboard` | Aggregated from `ActivityEvent` rows only (zero for new users) |
| `POST /api/roadmap`, `GET /api/roadmap/latest`, `PATCH /api/roadmap/:roadmapId/problems/:problemId` | Personalised eight-stage DSA roadmap for 1–52 weeks, with persisted problem completion |

### Where the real frontend types differ from the written spec (the frontend wins)
I implemented the **actual** `src/types/domain.ts`, which differs from the prompt in a few places:
`ResumeMatchRoadmap.gaps` is `{skill, have, need}`, `radar` is `{skill, resume, required}`, `categoryFocus` is `{name, value}`; `interviewPerformance` is `{session, score}` (not `date`);
`CodeHistoryItem` carries `status`, `originalComplexity`, `optimizedComplexity`, `optimizationPercent`, `evolution` (`POST /api/history` also accepts `type` as an alias for `status`);
the roadmap request field is `preparationLevel` in the frontend (`currentLevel` is accepted too).
Additive fields (ignored by old code): `BenchmarkResult.notes`, `DSARoadmap.id`. The frontend type `isMockData: true` must become `boolean` (done in `frontend-integration/`).

## How the AI layer works

* **One class, `AIService`**, is the only code that calls Gemini. The key comes from env only and never reaches the browser.
* **Structured output**: every JSON feature sends a JSON Schema generated from a Zod schema (`responseJsonSchema`), then validates the reply with the same Zod schema.
  Invalid output → one retry with the validation error → otherwise `502 AI_BAD_RESPONSE` with a safe message. Timeouts → `504`, provider 429 → `503`.
* **Never trusting the model for facts the server can compute**: ids are server-assigned, scores are clamped, bug line numbers are clamped to the code,
  skill levels / match score / category shares / trust score / improvement % / "overall" interview score are derived deterministically from the numbers.
* **Prompt-injection hygiene**: user code, job descriptions, resumes and answers are wrapped in tags and declared untrusted in the system prompt.
* **Verification and benchmarking run real code** using Gemini's sandboxed Python *code-execution* tool, never on this server. Only the executed stdout's final JSON line is trusted; the model's prose is ignored.
* **Limits & observability**: per-feature token caps and timeouts, per-user requests/minute plus a rolling 24h quota, and one `AiCallLog` row per call (model, tokens, latency, cost, ok/error).
  Cost uses `GEMINI_COST_PER_MTOK_*` from env; update them to current pricing.

## Security notes
* Access JWT (HS256, 15 min) and opaque refresh token (hashed in DB) in `HttpOnly` cookies; the refresh cookie is scoped to `/api/auth`. Refresh rotates every time; presenting an already-used token revokes the whole token family.
* CORS locked to `FRONTEND_ORIGIN`; state-changing requests with a foreign `Origin` are rejected (defence in depth on top of SameSite). Use `COOKIE_SAMESITE=none` only for genuinely cross-site deployments (requires HTTPS).
* bcrypt passwords (72-byte cap enforced), constant-time-ish login (dummy compare for unknown emails), rate limits on auth, secure headers, 256 KB body cap.
* Google sign-in requires a *verified* Google email. Linking Google to an existing password account **deletes that account's password and revokes its sessions**
  (signup does not verify email, so a squatter could otherwise keep access).

## Known limitations (read these)
1. **Not run against live Gemini.** The environment I built this in had no Gemini access, so every AI path is tested with a fake transport that returns schema-valid payloads.
   Before relying on it, run each feature once with a real key. Most likely first-run issues: a model name your key can't use (`GEMINI_MODEL`), or a model that rejects part of the generated JSON Schema.
2. **Benchmarks and equivalence tests execute Python ports in Gemini's sandbox.** For non-Python inputs the model ports the code first, so language-specific behaviour (integer overflow, undefined behaviour) is not exercised,
   timings are indicative rather than absolute, and the script itself is model-written (a faulty script can misreport). Points that exceed the time budget are extrapolated and flagged in `notes`.
   If you need audited results, replace `runCodeJson` calls with your own isolated runner (e.g. Firecracker/gVisor containers).
3. Gemini 2.5 "thinking" tokens count against `maxOutputTokens`; token caps are generous, and `GEMINI_THINKING_BUDGET` can cap them.
4. Rate limiting is in-memory (per process). Use a shared store (Redis) if you run several instances. The daily quota is DB-backed and counts every model call, including retries.
5. The frontend extracts selectable text from PDF resumes in the browser before sending the text for career analysis. Scanned/image-only PDFs and DOCX files are not supported.
6. No email verification or password reset yet.
7. **Metric definitions** (documented because "real" needs a definition): `bugsFixed` = critical/warning bugs reported for code that the user later optimized;
   `problemsSolved` = distinct completed roadmap problems; `problemsAttempted` = solved/flagged problems + analyses + interview answers;
   topic scores average whichever signals exist (interview answers, analysis health, roadmap completion);
   algorithm-DNA strength = mean code health of analyses using that pattern × min(1, uses/3). Streaks and the Mon–Sun chart use the `tz` query parameter (default UTC).
8. Learning-resource and problem links are **search links** (LeetCode search / YouTube search / Google), never model-invented URLs, so they can't 404.

## Frontend integration
`frontend-integration/` contains only the changed frontend files (same paths as in the app): real `services/*`, `authService`, a login page + route guard, and small route patches.
See its `README.md`.
