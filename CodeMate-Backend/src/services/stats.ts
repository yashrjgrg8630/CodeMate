import type { ActivityKind } from "@prisma/client";
import type { Db } from "../lib/prisma.js";
import { clampInt, relativeTime } from "../lib/util.js";
import type {
  ActivityItem,
  DashboardData,
  ProgressRange,
  ProgressReport,
} from "../schemas/domain.js";

/** Most specific first: "Arrays / Sliding Window" must land on Sliding Window, not Arrays. */
const TOPIC_RULES: { name: string; re: RegExp }[] = [
  { name: "Greedy", re: /greedy/i },
  { name: "Recursion", re: /recurs|backtrack/i },
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
  "Greedy",
  "Recursion",
] as const;

const PROGRESS_TOPICS: { canonical: string; label: string }[] = [
  { canonical: "Arrays", label: "Arrays" },
  { canonical: "Strings", label: "Strings" },
  { canonical: "Hashing", label: "Hashing" },
  { canonical: "Two Pointer", label: "Two Pointers" },
  { canonical: "Sliding Window", label: "Sliding Window" },
  { canonical: "Binary Search", label: "Binary Search" },
  { canonical: "Trees", label: "Trees" },
  { canonical: "Graphs", label: "Graphs" },
  { canonical: "Dynamic Programming", label: "Dynamic Programming" },
  { canonical: "Greedy", label: "Greedy" },
  { canonical: "Recursion", label: "Recursion" },
  { canonical: "Other", label: "Other" },
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

interface TopicMetric {
  score: number;
  evidence: number;
}

/** Per-topic score and evidence count from actual scored events and roadmap progress. */
async function topicScores(
  db: Db,
  userId: string,
  events: EventRow[],
  includeRoadmap = true,
): Promise<Map<string, TopicMetric>> {
  const interview = new Map<string, number[]>();
  const analysis = new Map<string, number[]>();
  const other: number[] = [];
  for (const e of events) {
    if (e.score === null || !e.topic) continue;
    const topic = canonicalTopic(e.topic);
    if (!topic) {
      if (e.kind === "INTERVIEW_ANSWER" || e.kind === "ANALYSIS") other.push(e.score);
      continue;
    }
    const bucket = e.kind === "INTERVIEW_ANSWER" ? interview : e.kind === "ANALYSIS" ? analysis : null;
    if (!bucket) continue;
    bucket.set(topic, [...(bucket.get(topic) ?? []), e.score]);
  }

  const roadmapPct = new Map<string, { done: number; total: number }>();
  if (includeRoadmap) {
    const latest = await db.roadmap.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { completions: true },
    });
    for (const c of latest?.completions ?? []) {
      const topic = canonicalTopic(c.topicName);
      if (!topic) continue;
      const cur = roadmapPct.get(topic) ?? { done: 0, total: 0 };
      roadmapPct.set(topic, { done: cur.done + (c.completed ? 1 : 0), total: cur.total + 1 });
    }
  }

  const out = new Map<string, TopicMetric>();
  for (const topic of [...HEATMAP_TOPICS, "Other"]) {
    const signals: number[] = [];
    const interviewValues = topic === "Other" ? other : interview.get(topic) ?? [];
    const analysisValues = topic === "Other" ? [] : analysis.get(topic) ?? [];
    const i = mean(interviewValues);
    const a = mean(analysisValues);
    const r = roadmapPct.get(topic);
    if (i !== null) signals.push(i);
    if (a !== null) signals.push(a);
    if (r && r.total > 0) signals.push((r.done / r.total) * 100);
    if (signals.length > 0) {
      out.set(topic, {
        score: clampInt(mean(signals) ?? 0, 0, 100),
        evidence: interviewValues.length + analysisValues.length + (r?.total ?? 0),
      });
    }
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

async function solvedCount(
  db: Db,
  userId: string,
  fromDay?: string,
  tz = "UTC",
): Promise<{ solved: number; flagged: number }> {
  const earliestUtc = fromDay ? new Date(`${addDays(fromDay, -1)}T10:00:00Z`) : undefined;
  const rows = await db.roadmapProblem.findMany({
    where: {
      roadmap: { userId },
      OR: earliestUtc
        ? [
            { completed: true, completedAt: { gte: earliestUtc } },
            { inRevision: true, updatedAt: { gte: earliestUtc } },
          ]
        : [{ completed: true }, { inRevision: true }],
    },
    select: { problemId: true, completed: true, inRevision: true, completedAt: true, updatedAt: true },
  });
  const solved = new Set(
    rows
      .filter(
        (row) =>
          row.completed &&
          row.completedAt !== null &&
          (!fromDay || dayKey(row.completedAt, tz) >= fromDay),
      )
      .map((row) => row.problemId),
  );
  const flagged = new Set(
    rows
      .filter(
        (row) =>
          row.inRevision &&
          (!fromDay || dayKey(row.updatedAt, tz) >= fromDay),
      )
      .map((row) => row.problemId),
  );
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
    weaknessHeatmap: HEATMAP_TOPICS.flatMap((topic) => {
      const score = scores.get(topic);
      return score === undefined ? [] : [{ topic, score: score.score }];
    }),
  };
}

const RANGE_DAYS: Record<Exclude<ProgressRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function monthAfter(month: string): string {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function activityBuckets(
  events: EventRow[],
  range: ProgressRange,
  fromDay: string | null,
  today: string,
  tz: string,
): ProgressReport["activityHistory"] {
  const granularity = range === "all" ? "month" : "day";
  let keys: string[] = [];

  if (granularity === "month") {
    if (!events.length) return [];
    const firstDay = events.reduce((earliest, event) => {
      const current = dayKey(event.createdAt, tz);
      return current < earliest ? current : earliest;
    }, today);
    for (let month = firstDay.slice(0, 7); month <= today.slice(0, 7); month = monthAfter(month)) {
      keys.push(month);
    }
  } else if (fromDay) {
    for (let day = fromDay; day <= today; day = addDays(day, 1)) keys.push(day);
  }

  const buckets = new Map(
    keys.map((date) => [date, { date, problems: 0, analyses: 0, optimizations: 0, interviews: 0 }]),
  );
  for (const event of events) {
    const localDay = dayKey(event.createdAt, tz);
    const key = granularity === "month" ? localDay.slice(0, 7) : localDay;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (
      event.kind === "INTERVIEW_ANSWER" ||
      (event.kind === "ROADMAP_PROGRESS" && metaOf(event).completed === true)
    ) {
      bucket.problems += 1;
    } else if (event.kind === "ANALYSIS") {
      bucket.analyses += 1;
    } else if (event.kind === "OPTIMIZATION") {
      bucket.optimizations += 1;
    } else if (event.kind === "INTERVIEW_REPORT") {
      bucket.interviews += 1;
    }
  }
  return [...buckets.values()];
}

export async function getProgress(
  db: Db,
  userId: string,
  tz = "UTC",
  now = new Date(),
  range: ProgressRange = "all",
): Promise<ProgressReport> {
  const events = await loadEvents(db, userId);
  const today = dayKey(now, tz);
  const fromDay = range === "all" ? null : addDays(today, 1 - RANGE_DAYS[range]);
  const eventsInRange = events.filter((event) => {
    const date = dayKey(event.createdAt, tz);
    return date <= today && (!fromDay || date >= fromDay);
  });
  const { solved, flagged } = await solvedCount(db, userId, fromDay ?? undefined, tz);
  const scores = await topicScores(db, userId, eventsInRange, range === "all");

  // The current streak remains lifetime-based regardless of the selected reporting window.
  const activeDays = new Set(events.map((event) => dayKey(event.createdAt, tz)));
  let cursor = activeDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  // Keep the existing week-to-date field for older consumers.
  const monday = addDays(today, -weekdayIndex(today));
  const weekly = DAY_LABELS.map((day, index) => {
    const key = addDays(monday, index);
    const todaysEvents = events.filter((event) => dayKey(event.createdAt, tz) === key);
    return {
      day,
      problems: todaysEvents.filter(
        (event) =>
          event.kind === "INTERVIEW_ANSWER" ||
          (event.kind === "ROADMAP_PROGRESS" && metaOf(event).completed === true),
      ).length,
      analyses: todaysEvents.filter((event) => event.kind === "ANALYSIS").length,
    };
  });

  // Attribute fixed bugs to the date of the successful optimization.
  const lastAnalysisByHash = new Map<string, EventRow>();
  for (const event of events) {
    if (event.kind === "ANALYSIS") lastAnalysisByHash.set(metaStr(event, "codeHash"), event);
  }
  let bugsFixed = 0;
  for (const [hash, analysisEvent] of lastAnalysisByHash) {
    if (!hash) continue;
    const optimizedLater = eventsInRange.some(
      (event) =>
        event.kind === "OPTIMIZATION" &&
        metaStr(event, "codeHash") === hash &&
        event.createdAt >= analysisEvent.createdAt,
    );
    if (optimizedLater) bugsFixed += metaNum(analysisEvent, "bugCount");
  }

  const reportNumbers = new Map(
    events
      .filter((event) => event.kind === "INTERVIEW_REPORT" && event.score !== null)
      .map((event, index) => [event.id, index + 1]),
  );
  const reports = eventsInRange.filter(
    (event) => event.kind === "INTERVIEW_REPORT" && event.score !== null,
  );
  const interviewPerformance = reports
    .map((event) => ({
      session: `S${reportNumbers.get(event.id) ?? 1}`,
      detail: metaStr(event, "detail"),
      date: dayKey(event.createdAt, tz),
      score: clampInt(event.score ?? 0, 0, 100),
    }))
    .slice(-10);

  const analyses = eventsInRange.filter((event) => event.kind === "ANALYSIS");
  const usage = new Map<string, number>();
  const dna = new Map<string, { count: number; health: number[] }>();
  for (const event of analyses) {
    const name = metaStr(event, "patternName");
    if (name) usage.set(name, (usage.get(name) ?? 0) + 1);
    const pattern = dnaPattern(`${name} ${metaStr(event, "patternCategory")}`);
    if (pattern) {
      const current = dna.get(pattern) ?? { count: 0, health: [] };
      current.count += 1;
      if (event.score !== null) current.health.push(event.score);
      dna.set(pattern, current);
    }
  }
  const sortedUsage = [...usage.entries()].sort((a, b) => b[1] - a[1]);
  const algorithmUsage = sortedUsage.slice(0, 6).map(([name, value]) => ({ name, value }));
  const otherCount = sortedUsage.slice(6).reduce((total, [, count]) => total + count, 0);
  if (otherCount > 0) algorithmUsage.push({ name: "Other", value: otherCount });

  return {
    range,
    problemsSolved: solved,
    problemsAttempted:
      Math.max(solved, flagged) +
      analyses.length +
      eventsInRange.filter((event) => event.kind === "INTERVIEW_ANSWER").length,
    streak,
    interviewsCompleted: reports.length,
    averageInterviewScore: averageInterview(eventsInRange),
    optimizations: eventsInRange.filter((event) => event.kind === "OPTIMIZATION").length,
    bugsFixed,
    activityGranularity: range === "all" ? "month" : "day",
    activityHistory: activityBuckets(eventsInRange, range, fromDay, today, tz),
    weeklyActivity: weekly,
    topicPerformance: PROGRESS_TOPICS.flatMap((topic) => {
      const metric = scores.get(topic.canonical);
      return metric ? [{ topic: topic.label, score: metric.score, evidence: metric.evidence }] : [];
    }),
    interviewPerformance,
    algorithmUsage,
    algorithmDna: DNA_ORDER.map((pattern) => {
      const metric = dna.get(pattern);
      const strength =
        metric && metric.health.length
          ? clampInt((mean(metric.health) ?? 0) * Math.min(1, metric.count / 3), 0, 100)
          : null;
      return { pattern, strength, sampleCount: metric?.count ?? 0 };
    }),
  };
}
