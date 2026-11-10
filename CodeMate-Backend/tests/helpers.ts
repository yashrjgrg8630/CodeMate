import type { Hono } from "hono";
import { createApp } from "../src/app.js";
import { loadEnv, type Env } from "../src/config/env.js";
import type { AppBindings } from "../src/lib/http.js";
import { createPrisma, type Db } from "../src/lib/prisma.js";
import { AIService } from "../src/services/ai/ai-service.js";
import type { GeminiTransport, GenerateRequest, GenerateResponse } from "../src/services/ai/transport.js";
import { DEFAULT_TEST_DATABASE_URL } from "./global-setup.js";

export const ORIGIN = "http://localhost:3000";

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    PORT: "8787",
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
    FRONTEND_ORIGIN: ORIGIN,
    JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-1234",
    GEMINI_API_KEY: "test-key",
    BCRYPT_ROUNDS: "4",
    AUTH_RATE_LIMIT_PER_MIN: "1000",
    GENERAL_RATE_LIMIT_PER_MIN: "10000",
    AI_RATE_LIMIT_PER_MIN: "1000",
    AI_DAILY_LIMIT: "1000",
    GEMINI_COST_PER_MTOK_INPUT: "0.3",
    GEMINI_COST_PER_MTOK_OUTPUT: "2.5",
    ...overrides,
  });
}

// ---------------------------------------------------------------- fake Gemini

export const json = (value: unknown): GenerateResponse => ({
  text: JSON.stringify(value),
  codeOutputs: [],
  inputTokens: 120,
  outputTokens: 60,
  finishReason: "STOP",
});
export const exec = (value: unknown): GenerateResponse => ({
  text: "",
  codeOutputs: [`running tests...\n${JSON.stringify(value)}`],
  inputTokens: 200,
  outputTokens: 400,
  finishReason: "STOP",
});

type Responder = GenerateResponse | ((req: GenerateRequest) => GenerateResponse | Promise<GenerateResponse>);

export const fixtures = {
  analysis: {
    codeHealth: 82,
    complexity: { time: "O(n²)", space: "O(1)" },
    pattern: { name: "Brute Force", category: "Array Traversal", confidence: 94, description: "Nested loops recompute window sums." },
    bugs: [
      { line: 4, title: "Redundant recomputation", explanation: "Inner loop re-sums overlapping ranges.", severity: "critical", suggestedFix: "Use a running window sum." },
      { line: 2, title: "Wrong result for negatives", explanation: "result starts at 0.", severity: "warning", suggestedFix: "Start from -inf." },
      { line: 9999, title: "Out-of-range line", explanation: "Model gave a bad line.", severity: "suggestion", suggestedFix: "Clamp it." },
    ],
    optimizationHint: { approach: "Sliding Window", summary: "Reduce O(n²) to O(n).", from: "O(n²)", to: "O(n)" },
  },
  optimization: {
    original: { approach: "Brute Force", complexity: { time: "O(n²)", space: "O(1)" } },
    candidates: [
      { approach: "HashMap", complexity: { time: "O(n)", space: "O(n)" }, readability: 78, confidence: 88, improvement: 62, rationale: "Prefix sums in a map.", code: "def f(nums, k):\n    return 0" },
      { approach: "Sliding Window", complexity: { time: "O(n)", space: "O(1)" }, readability: 94, confidence: 96, improvement: 84, rationale: "One running sum.", code: "def f(nums, k):\n    return 1" },
      { approach: "Two Pointer", complexity: { time: "O(n)", space: "O(1)" }, readability: 86, confidence: 81, improvement: 76, rationale: "Generalises to variable windows.", code: "def f(nums, k):\n    return 2" },
      { approach: "Dynamic Programming", complexity: { time: "O(n)", space: "O(n)" }, readability: 71, confidence: 74, improvement: 58, rationale: "DP table of prefix sums.", code: "def f(nums, k):\n    return 3" },
    ],
    recommendedIndex: 1,
    explanation: "Window sum changes by one element per step.",
  },
  conversion: {
    code: "public class Solution { }",
    summary: "Translated to Java.",
    changes: [{ category: "syntax", from: "Indentation", to: "Braces", note: "Blocks need braces." }],
    complexity: { time: "O(n)", space: "O(1)" },
    sourceComplexity: { time: "O(n²)", space: "O(1)" },
    warnings: ["Integer overflow is possible."],
  },
  verification: { passed: 100, total: 100 },
  benchmark: {
    series: [
      { input: "1K", original_ms: 4, optimized_ms: 2, original_estimated: false, optimized_estimated: false },
      { input: "5K", original_ms: 21, optimized_ms: 6, original_estimated: false, optimized_estimated: false },
      { input: "10K", original_ms: 48, optimized_ms: 12, original_estimated: false, optimized_estimated: false },
      { input: "50K", original_ms: 96, optimized_ms: 24, original_estimated: false, optimized_estimated: false },
      { input: "100K", original_ms: 200, optimized_ms: 50, original_estimated: true, optimized_estimated: false },
    ],
    peak_memory_mb: { original: 12.5, optimized: 18.25 },
    notes: [],
  },
  jobBase: {
    roleSummary: "Backend engineer building high-throughput services.",
    seniority: "Mid-level (2-4 years)",
    languages: ["Java", "Python"],
    frameworks: ["Spring Boot"],
    databases: ["PostgreSQL", "Redis"],
    dsaTopics: ["Arrays & Hashing", "Graphs"],
    interviewTopics: ["System design basics"],
    skills: [
      { name: "Java", category: "language", required: 90, current: 85 },
      { name: "Spring Boot", category: "framework", required: 85, current: 60 },
      { name: "PostgreSQL", category: "database", required: 70, current: 30 },
      { name: "Redis", category: "database", required: 55, current: 0 },
      { name: "Graphs", category: "dsa", required: 70, current: 40 },
      { name: "java", category: "language", required: 90, current: 85 },
    ],
    recommendations: ["Build one Spring Boot CRUD service.", "Practise graph traversal."],
  },
  jobRoadmap: {
    verdict: "Good base fit.",
    radar: [
      { skill: "Java", resume: 82, required: 90 },
      { skill: "Spring Boot", resume: 58, required: 85 },
      { skill: "SQL", resume: 76, required: 80 },
      { skill: "System Design", resume: 44, required: 70 },
      { skill: "DSA", resume: 63, required: 85 },
    ],
    categoryFocus: [
      { name: "Backend frameworks", weight: 32 },
      { name: "DSA practice", weight: 28 },
      { name: "System design", weight: 20 },
    ],
    phases: [
      {
        title: "Foundations",
        weeks: "Week 1–3",
        intensity: 60,
        focus: ["Collections", "SQL"],
        outcome: "20 problems solved.",
        actions: [
          { title: "Review Java collections", instructions: "Compare HashMap, HashSet and ArrayList; implement one small example with each.", timebox: "3 × 45 min", deliverable: "A short comparison note and three runnable examples." },
          { title: "Practise SQL joins", instructions: "Write INNER, LEFT and GROUP BY queries against a small sample schema.", timebox: "2 × 45 min", deliverable: "Five queries saved with expected result notes." },
          { title: "Track interview practice", instructions: "Attempt problems without looking at solutions, then record the pattern and complexity.", timebox: "3 × 30 min", deliverable: "A mistake log with at least three entries." },
        ],
        leetcode: [
          { title: "Two Sum", difficulty: "easy", pattern: "Hash map", practiceGoal: "Return indices in one pass and explain why lookup is O(1) on average." },
        ],
      },
      {
        title: "Frameworks",
        weeks: "Week 4–7",
        intensity: 85,
        focus: ["Spring Boot", "JPA"],
        outcome: "One deployable service.",
        actions: [
          { title: "Build a REST service", instructions: "Create controller, service and repository layers for one resource; add validation and error responses.", timebox: "4 × 60 min", deliverable: "Runnable CRUD API with documented endpoints." },
          { title: "Add persistence", instructions: "Model entities and relationships, add migrations, and test repository behavior against PostgreSQL.", timebox: "3 × 60 min", deliverable: "Database-backed feature with migration and tests." },
          { title: "Review concurrency basics", instructions: "Explain race conditions, synchronization and thread pools; implement a small safe counter.", timebox: "2 × 45 min", deliverable: "A working example and a one-page explanation." },
        ],
        leetcode: [
          { title: "Valid Parentheses", difficulty: "easy", pattern: "Stack", practiceGoal: "Use a stack to match bracket pairs and explain invalid-prefix handling." },
        ],
      },
      {
        title: "Polish",
        weeks: "Week 8–10",
        intensity: 70,
        focus: ["System design", "Mocks"],
        outcome: "Mock score above 80.",
        actions: [
          { title: "Practise backend system design", instructions: "Design a URL shortener; cover API, storage, scaling, caching and failure modes.", timebox: "2 × 60 min", deliverable: "A labelled diagram and a 10-minute walkthrough." },
          { title: "Run timed interview mocks", instructions: "Solve one medium problem aloud, clarify constraints, state complexity and test edge cases.", timebox: "2 × 45 min", deliverable: "Two mock recordings with feedback notes." },
          { title: "Polish project evidence", instructions: "Add tests, setup steps and measurable impact to the project README and resume bullets.", timebox: "2 × 45 min", deliverable: "A demo-ready repository and revised resume bullets." },
        ],
        leetcode: [
          { title: "Course Schedule", difficulty: "medium", pattern: "Graph traversal / topological sort", practiceGoal: "Detect a cycle with DFS or Kahn's algorithm and state time and space complexity." },
        ],
      },
    ],
    quickWins: ["Add metrics to bullets.", "Lead with the Spring project."],
  },
  interviewQuestions: {
    questions: [
      { topic: "Arrays / Sliding Window", difficulty: "medium", prompt: "Max sum of a subarray of size k?", followUp: "What if k varies?" },
      { topic: "Hashing", difficulty: "easy", prompt: "Detect nearby duplicates?", followUp: "Memory trade-off?" },
      { topic: "Graphs", difficulty: "hard", prompt: "Course schedule ordering?", followUp: "Report the cycle?" },
      { topic: "Dynamic Programming", difficulty: "hard", prompt: "Fewest coins for an amount?", followUp: "Reduce space?" },
      { topic: "Binary Search", difficulty: "medium", prompt: "Search a rotated array.", followUp: "Handle duplicates?" },
    ],
  },
  evaluation: { score: 77, feedback: "Solid, state edge cases.", followUp: "How does it scale?" },
  report: {
    scores: { technicalKnowledge: 82, problemSolving: 78, communication: 70, codeQuality: 76, complexityAnalysis: 86 },
    strengths: ["Clear pattern recognition", "States complexity early"],
    weaknesses: ["DP state definitions", "Edge cases late"],
    recommendations: ["Drill 1D DP", "Narrate trade-offs", "Weekly graph mock"],
  },
  roadmap: {
    topics: ["Arrays", "Hashing", "Sliding Window", "Binary Search", "Trees", "Graphs", "Dynamic Programming", "Greedy"].map((name, i) => ({
      name,
      priority: i < 3 ? "high" : "medium",
      difficulty: i < 2 ? "easy" : "medium",
      pattern: `${name} patterns`,
      problems: [1, 2, 3].map((n) => ({
        title: `${name} Problem ${n}`,
        platform: n === 3 ? "HackerRank" : "LeetCode",
        difficulty: n === 1 ? "easy" : "medium",
        pattern: "Core pattern",
      })),
    })),
    resources: [1, 2, 3, 4].map((n) => ({ title: `Lesson ${n}`, channel: "Algo Academy", topic: "Arrays", duration: "~40 min" })),
  },
};

/** Stand-in for Gemini. Routes by a marker in the system prompt; every call is recorded. */
export class FakeTransport implements GeminiTransport {
  readonly calls: GenerateRequest[] = [];
  private readonly overrides = new Map<string, Responder[]>();

  private readonly defaults: [string, (req: GenerateRequest) => GenerateResponse][] = [
    ["meticulous senior code reviewer", () => json(fixtures.analysis)],
    ["performance-engineering expert", () => json(fixtures.optimization)],
    ["polyglot engineer", () => json(fixtures.conversion)],
    ["verify behavioural equivalence", () => exec(fixtures.verification)],
    ["benchmark two implementations", () => exec(fixtures.benchmark)],
    [
      "technical recruiter",
      (req) =>
        req.prompt.includes("No resume was supplied")
          ? json(fixtures.jobBase)
          : json({ ...fixtures.jobBase, roadmap: fixtures.jobRoadmap }),
    ],
    ["running a technical mock interview", () => json(fixtures.interviewQuestions)],
    ["scoring a candidate's answer", () => json(fixtures.evaluation)],
    ["end-of-interview report", () => json(fixtures.report)],
    ["DSA interview-preparation coach", () => json(fixtures.roadmap)],
  ];

  /** Queue one-shot responders for calls whose system prompt contains `marker`. */
  queue(marker: string, ...responders: Responder[]): void {
    this.overrides.set(marker, [...(this.overrides.get(marker) ?? []), ...responders]);
  }

  callsFor(marker: string): GenerateRequest[] {
    return this.calls.filter((c) => c.system.includes(marker));
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    this.calls.push(req);
    for (const [marker, queue] of this.overrides) {
      if (req.system.includes(marker) && queue.length > 0) {
        const next = queue.shift();
        if (next === undefined) continue;
        return typeof next === "function" ? next(req) : next;
      }
    }
    const match = this.defaults.find(([marker]) => req.system.includes(marker));
    if (!match) throw new Error(`FakeTransport: no responder for system prompt: ${req.system.slice(0, 80)}`);
    return match[1](req);
  }
}

// ---------------------------------------------------------------- app + session client

export interface Ctx {
  app: Hono<AppBindings>;
  db: Db;
  env: Env;
  transport: FakeTransport;
  ai: AIService;
}

let sharedDb: Db | undefined;
export function getDb(): Db {
  sharedDb ??= createPrisma(process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL);
  return sharedDb;
}

export async function resetDb(): Promise<void> {
  await getDb().$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
}

export function createCtx(envOverrides: Record<string, string> = {}, fetchImpl?: typeof fetch): Ctx {
  const env = testEnv(envOverrides);
  const db = getDb();
  const transport = new FakeTransport();
  const ai = new AIService(env, transport, db);
  const app = createApp({ env, db, ai, ...(fetchImpl ? { fetchImpl } : {}) });
  return { app, db, env, transport, ai };
}

interface StoredCookie {
  value: string;
  path: string;
}

export interface Reply<T = unknown> {
  status: number;
  body: T;
  res: Response;
}

/** Minimal browser: keeps a cookie jar and sends the frontend Origin on every request. */
export class Session {
  readonly jar = new Map<string, StoredCookie>();

  constructor(
    private readonly app: Hono<AppBindings>,
    private readonly origin: string | null = ORIGIN,
  ) {}

  private cookieHeader(path: string): string {
    return [...this.jar.entries()]
      .filter(([, c]) => path.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join("; ");
  }

  private absorb(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const path = attrs.find((a) => a.toLowerCase().startsWith("path="))?.slice(5) ?? "/";
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith("max-age="))?.slice(8);
      if (value === "" || maxAge === "0") this.jar.delete(name);
      else this.jar.set(name, { value, path });
    }
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    opts: { origin?: string | null; rawBody?: string } = {},
  ): Promise<Reply<T>> {
    const headers: Record<string, string> = {};
    const cookie = this.cookieHeader(path.split("?")[0] ?? path);
    if (cookie) headers["cookie"] = cookie;
    const origin = opts.origin === undefined ? this.origin : opts.origin;
    if (origin) headers["origin"] = origin;
    let payload: string | undefined;
    if (opts.rawBody !== undefined) {
      payload = opts.rawBody;
      headers["content-type"] = "application/json";
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["content-type"] = "application/json";
    }
    const res = await this.app.request(`http://localhost${path}`, { method, headers, ...(payload !== undefined ? { body: payload } : {}) });
    this.absorb(res);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body (redirects) */
    }
    return { status: res.status, body: parsed as T, res };
  }

  get = <T = unknown>(path: string) => this.request<T>("GET", path);
  post = <T = unknown>(path: string, body?: unknown) => this.request<T>("POST", path, body ?? {});
  patch = <T = unknown>(path: string, body?: unknown) => this.request<T>("PATCH", path, body ?? {});
}

export const PASSWORD = "correct-horse-battery";

export async function signup(ctx: Ctx, email = "ada@example.com", name = "Ada"): Promise<Session> {
  const s = new Session(ctx.app);
  const r = await s.post("/api/auth/signup", { email, password: PASSWORD, name });
  if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.body)}`);
  return s;
}

export const PY_CODE = `def max_subarray_sum(nums, k):
    result = 0
    for i in range(len(nums)):
        current = 0
        for j in range(i, min(i + k, len(nums))):
            current += nums[j]
        if current > result:
            result = current
    return result`;

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}
