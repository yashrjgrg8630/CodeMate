import type { ActivityKind } from "@prisma/client";
import type { Db } from "../lib/prisma.js";
import { clampInt, relativeTime } from "../lib/util.js";
import type { ActivityItem, DashboardData, ProgressReport } from "../schemas/domain.js";

/** Most specific first: "Arrays / Sliding Window" must land on Sliding Window, not Arrays. */
const TOPIC_RULES: { name: string; re: RegExp }[] = [
  { name: "Two Pointer", re: /two[\s-]?pointer/i },
  { name: "Sliding Window", re: /sliding/i },
  { name: "Binary Search", re: /binary[\s-]?search|bisect/i },
  { name: "Dynamic Programming", re: /dynamic|\bdp\b|memoi[sz]|knapsack/i },
  { name: "Graphs", re: /graph|\bbfs\b|\bdfs\b|topolog|shortest[\s-]?path|union[\s-]?find/i },
  { name: "Trees", re: /\btrees?\b|\bbst\b|\btrie\b|heap/i },
  { name: "Hashing", re: /hash|dictionary|frequency|\bmap\b/i },
  { name: "Strings", re: /string|palindrom|anagram|substring/i },
  { name: "Arrays", re: /array|prefix|matrix|subarray|traversal/i },
];

export const HEATMAP_TOPICS = [
  "Arrays",
  "Strings",
  "Hashing",
  "Two Pointer",
  "Sliding Window",
  "Binary Search",
  "Trees",
  "Graphs",
  "Dynamic Programming",
] as const;

const PROGRESS_TOPICS: { canonical: string; label: string }[] = [
  { canonical: "Arrays", label: "Arrays" },
  { canonical: "Hashing", label: "Hashing" },
  { canonical: "Sliding Window", label: "Sliding Window" },
  { canonical: "Binary Search", label: "Binary Search" },
  { canonical: "Trees", label: "Trees" },
  { canonical: "Graphs", label: "Graphs" },
  { canonical: "Dynamic Programming", label: "DP" },
];

const DNA_RULES: { pattern: string; re: RegExp }[] = [
  { pattern: "Memoisation", re: /dynamic|\bdp\b|memoi[sz]|tabulation|knapsack/i },
  { pattern: "Divide & Conquer", re: /divide|conquer|binary[\s-]?search|merge[\s-]?sort|quick[\s-]?sort/i },
  { pattern: "Greedy", re: /greedy/i },
  { pattern: "Recursion", re: /recurs|backtrack|\bdfs\b|depth[\s-]?first/i },
  { pattern: "Hashing", re: /hash|frequency|dictionary/i },
  { pattern: "Iteration", re: /brute|iterat|sliding|two[\s-]?pointer|traversal|linear|prefix|loop|scan/i },
];
const DNA_ORDER = ["Iteration", "Hashing", "Recursion", "Greedy", "Divide & Conquer", "Memoisation"];

export function canonicalTopic(text: string | null | undefined): string | null {
  if (!text) return null;
  return TOPIC_RULES.find((r) => r.re.test(text))?.name ?? null;
}

function dnaPattern(text: string): string | null {
  return DNA_RULES.find((r) => r.re.test(text))?.pattern ?? null;
}

/** Calendar day (YYYY-MM-DD) of `date` in `tz`. */
export function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday=0 … Sunday=6 for a YYYY-MM-DD key. */
function weekdayIndex(key: string): number {
  return (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface EventRow {
  id: string;
  kind: ActivityKind;
  topic: string | null;
  score: number | null;
  createdAt: Date;
  meta: unknown;
}

const metaOf = (e: EventRow): Record<string, unknown> =>
  e.meta && typeof e.meta === "object" ? (e.meta as Record<string, unknown>) : {};
const metaNum = (e: EventRow, key: string): number => {
  const v = metaOf(e)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};
const metaStr = (e: EventRow, key: string): string => {
  const v = metaOf(e)[key];
  return typeof v === "string" ? v : "";
};

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

async function loadEvents(db: Db, userId: string): Promise<EventRow[]> {
  return db.activityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 20000,
    select: { id: true, kind: true, topic: true, score: true, createdAt: true, meta: true },
  });
}

/** Per canonical topic: mean of whichever signals exist (interview answers, analysis health, roadmap completion). */
async function topicScores(db: Db, userId: string, events: EventRow[]): Promise<Map<string, number>> {
  const interview = new Map<string, number[]>();
  const analysis = new Map<string, number[]>();
  for (const e of events) {
    if (e.score === null) continue;
    const topic = canonicalTopic(e.topic);
    if (!topic) continue;
    const bucket = e.kind === "INTERVIEW_ANSWER" ? interview : e.kind === "ANALYSIS" ? analysis : null;
    if (!bucket) continue;
    bucket.set(topic, [...(bucket.get(topic) ?? []), e.score]);
  }

  const latest = await db.roadmap.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { completions: true },
  });
  const roadmapPct = new Map<string, { done: number; total: number }>();
  for (const c of latest?.completions ?? []) {
    const topic = canonicalTopic(c.topicName);
    if (!topic) continue;
    const cur = roadmapPct.get(topic) ?? { done: 0, total: 0 };
    roadmapPct.set(topic, { done: cur.done + (c.completed ? 1 : 0), total: cur.total + 1 });
  }

  const out = new Map<string, number>();
  for (const topic of HEATMAP_TOPICS) {
    const signals: number[] = [];
    const i = mean(interview.get(topic) ?? []);
    const a = mean(analysis.get(topic) ?? []);
    const r = roadmapPct.get(topic);
    if (i !== null) signals.push(i);
    if (a !== null) signals.push(a);
    if (r && r.total > 0) signals.push((r.done / r.total) * 100);
    out.set(topic, clampInt(mean(signals) ?? 0, 0, 100));
  }
  return out;
}

function averageInterview(events: EventRow[]): number {
  const reports = events.filter((e) => e.kind === "INTERVIEW_REPORT" && e.score !== null).map((e) => e.score as number);
  const basis = reports.length
    ? reports
    : events.filter((e) => e.kind === "INTERVIEW_ANSWER" && e.score !== null).map((e) => e.score as number);
  return clampInt(mean(basis) ?? 0, 0, 100);
}

async function solvedCount(db: Db, userId: string): Promise<{ solved: number; flagged: number }> {
  const rows = await db.roadmapProblem.findMany({
    where: { roadmap: { userId }, OR: [{ completed: true }, { inRevision: true }] },
    select: { problemId: true, completed: true },
  });
  const solved = new Set(rows.filter((r) => r.completed).map((r) => r.problemId));
  const flagged = new Set(rows.map((r) => r.problemId));
  return { solved: solved.size, flagged: flagged.size };
}

const KIND_TO_ACTIVITY: Record<ActivityKind, ActivityItem["kind"]> = {
  ANALYSIS: "analysis",
  OPTIMIZATION: "optimization",
  VERIFICATION: "optimization",
  BENCHMARK: "optimization",
  CONVERSION: "conversion",
  CAREER: "career",
  ROADMAP_PROGRESS: "career",
  INTERVIEW_ANSWER: "interview",
  INTERVIEW_REPORT: "interview",
};

export async function getDashboard(db: Db, userId: string): Promise<DashboardData> {
  const events = await loadEvents(db, userId);
  const count = (kind: ActivityKind): number => events.filter((e) => e.kind === kind).length;
  const { solved } = await solvedCount(db, userId);
  const scores = await topicScores(db, userId, events);

  const recent = [...events].reverse().slice(0, 10);
  return {
    stats: {
      problemsAnalyzed: count("ANALYSIS"),
      bugsDetected: events.filter((e) => e.kind === "ANALYSIS").reduce((a, e) => a + metaNum(e, "totalBugs"), 0),
      optimizationsFound: count("OPTIMIZATION"),
      codeConversions: count("CONVERSION"),
      problemsSolved: solved,
      interviewScore: averageInterview(events),
    },
    activity: recent.map((e) => ({
      id: e.id,
      label: metaStr(e, "label") || e.kind.toLowerCase(),
      detail: metaStr(e, "detail"),
      time: relativeTime(e.createdAt),
      kind: KIND_TO_ACTIVITY[e.kind],
    })),
    weaknessHeatmap: HEATMAP_TOPICS.map((topic) => ({ topic, score: scores.get(topic) ?? 0 })),
  };
}

export async function getProgress(db: Db, userId: string, tz = "UTC", now = new Date()): Promise<ProgressReport> {
  const events = await loadEvents(db, userId);
  const { solved, flagged } = await solvedCount(db, userId);
  const scores = await topicScores(db, userId, events);

  // --- streak: consecutive local days with any activity, ending today (or yesterday if today is empty)
  const activeDays = new Set(events.map((e) => dayKey(e.createdAt, tz)));
  const today = dayKey(now, tz);
  let cursor = activeDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  // --- week-to-date (Mon..Sun)
  const monday = addDays(today, -weekdayIndex(today));
  const weekly = DAY_LABELS.map((day, i) => {
    const key = addDays(monday, i);
    const todays = events.filter((e) => dayKey(e.createdAt, tz) === key);
    return {
      day,
      problems: todays.filter(
        (e) => e.kind === "INTERVIEW_ANSWER" || (e.kind === "ROADMAP_PROGRESS" && metaOf(e)["completed"] === true),
      ).length,
      analyses: todays.filter((e) => e.kind === "ANALYSIS").length,
    };
  });

  // --- bugs fixed: bugs reported for code the user later sent through the optimizer
  const lastAnalysisByHash = new Map<string, EventRow>();
  for (const e of events) if (e.kind === "ANALYSIS") lastAnalysisByHash.set(metaStr(e, "codeHash"), e);
  let bugsFixed = 0;
  for (const [hash, analysisEvent] of lastAnalysisByHash) {
    if (!hash) continue;
    const optimizedLater = events.some(
      (e) => e.kind === "OPTIMIZATION" && metaStr(e, "codeHash") === hash && e.createdAt >= analysisEvent.createdAt,
    );
    if (optimizedLater) bugsFixed += metaNum(analysisEvent, "bugCount");
  }

  // --- interview trend: last 10 completed sessions
  const reports = events.filter((e) => e.kind === "INTERVIEW_REPORT" && e.score !== null);
  const interviewPerformance = reports
    .map((e, i) => ({ session: `S${i + 1}`, score: clampInt(e.score ?? 0, 0, 100) }))
    .slice(-10);

  // --- algorithm usage + DNA from analyses
  const analyses = events.filter((e) => e.kind === "ANALYSIS");
  const usage = new Map<string, number>();
  const dna = new Map<string, { count: number; health: number[] }>();
  for (const e of analyses) {
    const name = metaStr(e, "patternName");
    if (name) usage.set(name, (usage.get(name) ?? 0) + 1);
    const pattern = dnaPattern(`${name} ${metaStr(e, "patternCategory")}`);
    if (pattern) {
      const cur = dna.get(pattern) ?? { count: 0, health: [] };
      cur.count += 1;
      if (e.score !== null) cur.health.push(e.score);
      dna.set(pattern, cur);
    }
  }
  const sortedUsage = [...usage.entries()].sort((a, b) => b[1] - a[1]);
  const algorithmUsage = sortedUsage.slice(0, 6).map(([name, value]) => ({ name, value }));
  const otherCount = sortedUsage.slice(6).reduce((a, [, v]) => a + v, 0);
  if (otherCount > 0) algorithmUsage.push({ name: "Other", value: otherCount });

  return {
    problemsSolved: solved,
    problemsAttempted: Math.max(solved, flagged) + analyses.length + events.filter((e) => e.kind === "INTERVIEW_ANSWER").length,
    streak,
    averageInterviewScore: averageInterview(events),
    optimizations: events.filter((e) => e.kind === "OPTIMIZATION").length,
    bugsFixed,
    weeklyActivity: weekly,
    topicPerformance: PROGRESS_TOPICS.map((t) => ({ topic: t.label, score: scores.get(t.canonical) ?? 0 })),
    interviewPerformance,
    algorithmUsage,
    // strength = average health of analyses using the pattern, scaled by experience (saturates at 3 uses)
    algorithmDna: DNA_ORDER.map((pattern) => {
      const d = dna.get(pattern);
      return { pattern, strength: d ? clampInt((mean(d.health) ?? 0) * Math.min(1, d.count / 3), 0, 100) : 0 };
    }),
  };
}
