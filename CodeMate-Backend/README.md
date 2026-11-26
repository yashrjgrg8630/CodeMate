# CodeMate AI — Backend

Production backend for the CodeMate AI frontend (React / TanStack Start). It replaces the frontend's mock service layer with a real API.
Node 20+ · TypeScript (strict, no `any`) · Hono · PostgreSQL + Prisma · Zod · **Google Gemini** (via `@google/genai`).

```
src/
  config/env.ts            validated environment (fails fast with every problem listed)
  schemas/domain.ts        Zod mirror of the frontend's src/types/domain.ts (response typing + contract tests)
  schemas/requests.ts      Zod request schemas for every endpoint
  services/ai/             AIService for text/JSON calls, transport seam, model-output schemas
  services/*.ts            analysis, optimization(+verify), conversion, benchmark, career, live interview, roadmap, history, stats, auth
  routes/auth.ts, api.ts   HTTP layer
  middleware/              auth cookie guard, rate limiting, origin (CSRF) guard, request id
prisma/                    schema + migrations
tests/                     119 integration + unit tests (real Postgres, fake Gemini transport)
```

## Quick start

```bash
cp .env.example .env            # set GEMINI_API_KEY and JWT_ACCESS_SECRET (openssl rand -base64 48)
npm install
npm run db:up                   # Postgres 16 via docker compose
npm run prisma:generate
npm run prisma:deploy           # applies all pending migrations
npm run dev                     # http://localhost:8787  (GET /health)
```

Tests (need Postgres running; they create and rebuild a separate `codemate_test` database):

```bash
npm test
npm run typecheck
```

Production: `npm run build && npm start` (reads `.env` via `--env-file`; set `NODE_ENV=production` so cookies are `Secure`).

> **Verify migrations once.** The migration SQL in `prisma/migrations` was generated from `schema.prisma` by a script
> (Prisma's schema engine could not be downloaded in the environment I built this in). After `prisma:deploy`, confirm there is no drift:
> `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code`
> (exit code 0 = identical). If it reports differences, run `npx prisma migrate dev --name sync` and commit the result.

## Environment

See `.env.example` (every variable is documented). Required: `DATABASE_URL`, `FRONTEND_ORIGIN`, `JWT_ACCESS_SECRET` (≥32 chars), `GEMINI_API_KEY`. Live voice interviews use `GEMINI_LIVE_MODEL` (defaults to `gemini-3.8-live`) and require that the key has access to Gemini Live. The backend provisions a single-use, short-lived, configuration-locked token for each authenticated call; the browser connects using Gemini Live's `v1alpha` API, and the long-lived API key never reaches the browser.
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
| `POST /api/benchmark/jobs` `{candidateId?}` · `GET/DELETE /api/benchmark/jobs/:jobId` | Start, poll, and cancel a per-user benchmark job |
| `POST /api/benchmark` `{candidateId?}` | Synchronous compatibility endpoint returning `BenchmarkResult` |
| `GET /api/history`, `GET /api/history/:id`, `POST /api/history` | Per-user history (every analysis/optimization/conversion/benchmark is auto-recorded) |
| `POST /api/career/job` | `{ analysis, skillGap, roadmap \| null }` in one call |
| `POST /api/interview/start` · `evaluate` · `report` | AI mock interview |
| `POST /api/interview/live/start` · `complete` · `abandon` | Authenticated Gemini Live call setup, transcript-based report, and session cleanup |
| `GET /api/progress?tz=Asia/Kolkata`, `GET /api/dashboard` | Aggregated from `ActivityEvent` rows only (zero for new users) |
| `POST /api/roadmap`, `GET /api/roadmap/latest`, `PATCH /api/roadmap/:roadmapId/problems/:problemId`, `PATCH /api/roadmap/:roadmapId/tasks/:taskId` | Role-, level-, and duration-personalized roadmap with dynamically sized stages and persisted task/problem completion |

### Where the real frontend types differ from the written spec (the frontend wins)
I implemented the **actual** `src/types/domain.ts`, which differs from the prompt in a few places:
`ResumeMatchRoadmap.gaps` is `{skill, have, need}`, `radar` is `{skill, resume, required}`, `categoryFocus` is `{name, value}`; `interviewPerformance` is `{session, score}` (not `date`);
`CodeHistoryItem` carries `status`, `originalComplexity`, `optimizedComplexity`, `optimizationPercent`, `evolution` (`POST /api/history` also accepts `type` as an alias for `status`);
the roadmap request accepts `preparationLevel` or `currentLevel`, plus `durationValue` and `durationUnit` (`days`, `weeks`, or `months`); legacy `weeks` requests remain supported.
Additive fields (ignored by old code): `BenchmarkResult.notes`, `DSARoadmap.id`. The frontend type `isMockData: true` must become `boolean` (done in `frontend-integration/`).

## How the AI layer works
* **`AIService`** handles text/JSON model calls; the live-interview service separately mints scoped Gemini Live tokens. Both use the server-side key, which never reaches the browser.
* **Structured output**: every JSON feature sends a JSON Schema generated from a Zod schema (`responseJsonSchema`), then validates the reply with the same Zod schema.
  Invalid output → one retry with the validation error → otherwise `502 AI_BAD_RESPONSE` with a safe message. Timeouts → `504`, provider 429 → `503`.
* **Never trusting the model for facts the server can compute**: ids are server-assigned, scores are clamped, bug line numbers are clamped to the code,
  skill levels / match score / category shares / trust score / improvement % / "overall" interview score are derived deterministically from the numbers.
* **Prompt-injection hygiene**: user code, job descriptions, resumes and answers are wrapped in tags and declared untrusted in the system prompt.
* **Verification and benchmarking run real code** using Gemini's sandboxed Python *code-execution* tool, never on this server. An OpenAI-compatible provider with a configured Gemini fallback routes execution requests through Gemini; providers without code execution are rejected instead of treating generated text as measured output. Only executed stdout's final JSON line is trusted; model prose is ignored.
* **Limits & observability**: per-feature token caps and timeouts, per-user requests/minute plus a rolling 24h quota, and one `AiCallLog` row per call (model, tokens, latency, cost, ok/error).
  Cost uses `GEMINI_COST_PER_MTOK_*` from env; update them to current pricing.

## Security notes
* Access JWT (HS256, 15 min) and opaque refresh token (hashed in DB) in `HttpOnly` cookies; the refresh cookie is scoped to `/api/auth`. Refresh rotates every time; presenting an already-used token revokes the whole token family.
* CORS locked to `FRONTEND_ORIGIN`; state-changing requests with a foreign `Origin` are rejected (defence in depth on top of SameSite). Use `COOKIE_SAMESITE=none` only for genuinely cross-site deployments (requires HTTPS).
* bcrypt passwords (72-byte cap enforced), constant-time-ish login (dummy compare for unknown emails), rate limits on auth, secure headers, 256 KB body cap.
* Google sign-in requires a *verified* Google email. Linking Google to an existing password account **deletes that account's password and revokes its sessions**
  (signup does not verify email, so a squatter could otherwise keep access).

## Known limitations (read these)
1. **Provider verification is partial.** Live interview token provisioning and a Gemini Live WebSocket response with generated interviewer audio were verified against the configured key. Text/JSON AI features and post-interview report generation are covered by tests using a fake transport; run those paths with a real key before relying on them. Most likely first-run issues: a model name your key can't use (`GEMINI_MODEL`), or a model that rejects part of the generated JSON Schema.
2. **Benchmarks and equivalence tests execute Python ports in Gemini's sandbox.** For non-Python inputs the model ports the code first, so language-specific behaviour (integer overflow, undefined behaviour) is not exercised,
   timings are indicative rather than absolute, and the script itself is model-written (a faulty script can misreport). Benchmark jobs combine first-time verification with measurement, use bounded input sizes, and flag extrapolated points individually and in `notes`.
   If you need audited results, replace `runCodeJson` calls with your own isolated runner (e.g. Firecracker/gVisor containers).
3. Gemini 2.5 "thinking" tokens count against `maxOutputTokens`; token caps are generous, and `GEMINI_THINKING_BUDGET` can cap them.
4. Rate limiting is in-memory (per process). Use a shared store (Redis) if you run several instances. The daily quota is DB-backed and counts every model call, including retries.
5. The frontend extracts selectable text from PDF resumes in the browser before sending the text for career analysis. Scanned/image-only PDFs and DOCX files are not supported.
6. No email verification or password reset yet.
7. **Metric definitions** (documented because "real" needs a definition): `bugsFixed` = critical/warning bugs reported for code that the user later optimized;
   `problemsSolved` = distinct completed roadmap problems; `problemsAttempted` = solved/flagged problems + analyses + interview answers;
   topic scores average whichever signals exist (interview answers, analysis health, roadmap completion);
   algorithm-DNA strength = mean code health of analyses using that pattern × min(1, uses/3). Streaks and the Mon–Sun chart use the `tz` query parameter (default UTC).
8. Learning-resource links are clearly labelled YouTube searches. Problem links use direct canonical URLs only after the server verifies the destination page title; otherwise the UI labels a platform-scoped search link.

## Frontend integration
`frontend-integration/` contains only the changed frontend files (same paths as in the app): real `services/*`, `authService`, a login page + route guard, and small route patches.
See its `README.md`.
