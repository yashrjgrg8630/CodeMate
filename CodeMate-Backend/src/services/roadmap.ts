import { notFound } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";
import { clampInt, fence, newId, toJson } from "../lib/util.js";
import type { DSARoadmap, DSATopic } from "../schemas/domain.js";
import { recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { aiRoadmapSchema } from "./ai/schemas.js";

const SYSTEM = `You are a DSA interview-preparation coach designing a personalised roadmap.
Return exactly 8 milestones ordered in the sequence a learner should study them, each with 3-6 real, well-known practice problems (use exact, canonical problem titles from LeetCode and similar platforms; never invent problems) that progress from easier to harder.
Fit the scope, weekly workload, topic depth, and problem difficulty to the requested number of weeks and learner's level. For shorter plans, prioritise essentials and fewer problems per milestone; for longer plans, include more deliberate practice and revision. Prioritise topics by how often they appear for the target role ("high" priority first).
Also return 4-8 learning resources that map to the topics: use well-known creators, courses or publishers, an honest estimated duration, and a lesson title describing the topic (these will be turned into search links, so never fabricate URLs).`;

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";

function problemUrl(platform: string, title: string): string {
  const q = encodeURIComponent(title);
  if (platform === "LeetCode") return `https://leetcode.com/problemset/?search=${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} ${platform} problem`)}`;
}

const resourceUrl = (title: string, channel: string): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${channel}`)}`;

interface StoredProblem {
  id: string;
  title: string;
  platform: string;
  difficulty: DSATopic["difficulty"];
  pattern: string;
  url: string;
}
interface StoredTopic extends Omit<DSATopic, "problems" | "progress"> {
  problems: StoredProblem[];
}
interface StoredPayload {
  topics: StoredTopic[];
  resources: DSARoadmap["resources"];
}

interface CompletionRow {
  problemId: string;
  completed: boolean;
  inRevision: boolean;
}

function assemble(
  roadmap: { id: string; targetRole: string; level: string; weeks: number },
  payload: StoredPayload,
  rows: CompletionRow[],
): DSARoadmap {
  const state = new Map(rows.map((r) => [r.problemId, r]));
  return {
    id: roadmap.id,
    targetRole: roadmap.targetRole,
    preparationLevel: roadmap.level,
    weeks: roadmap.weeks,
    topics: payload.topics.map((t, index) => {
      const problems = t.problems.map((p) => ({
        ...p,
        completed: state.get(p.id)?.completed ?? false,
        inRevision: state.get(p.id)?.inRevision ?? false,
      }));
      const done = problems.filter((p) => p.completed).length;
      const weekStart = Math.floor((index * roadmap.weeks) / payload.topics.length) + 1;
      const weekEnd = Math.max(weekStart, Math.floor(((index + 1) * roadmap.weeks) / payload.topics.length));
      return {
        ...t,
        weekStart,
        weekEnd,
        problems,
        progress: problems.length ? clampInt((done / problems.length) * 100, 0, 100) : 0,
      };
    }),
    resources: payload.resources,
  };
}

export async function generateRoadmap(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { targetRole: string; currentLevel: string; weeks: number },
): Promise<DSARoadmap> {
  const ai = await deps.ai.generateJson({
    userId,
    feature: "roadmap",
    system: SYSTEM,
    prompt: `Target role: ${fence("role", input.targetRole)}\nCurrent level: ${fence("level", input.currentLevel)}\nAvailable time: ${input.weeks} weeks\nCreate exactly 8 ordered roadmap milestones. Divide these ${input.weeks} weeks into 8 consecutive stage ranges, avoid gaps or overlaps, and make the workload realistic for the learner's level.`,
    schema: aiRoadmapSchema,
    maxOutputTokens: 16384,
    temperature: 0.4,
  });

  const usedTopicIds = new Set<string>();
  const usedProblemIds = new Set<string>();
  const topics: StoredTopic[] = [];
  for (const [index, t] of ai.topics.entries()) {
    let topicId = slug(t.name);
    for (let n = 2; usedTopicIds.has(topicId); n += 1) topicId = `${slug(t.name)}-${n}`;
    usedTopicIds.add(topicId);

    const problems: StoredProblem[] = [];
    for (const p of t.problems) {
      const id = `p_${slug(t.name)}_${slug(p.title)}`;
      if (usedProblemIds.has(id)) continue; // same problem listed twice: keep the first
      usedProblemIds.add(id);
      problems.push({ id, title: p.title, platform: p.platform, difficulty: p.difficulty, pattern: p.pattern, url: problemUrl(p.platform, p.title) });
    }
    if (problems.length === 0) continue;
    const weekStart = Math.floor((index * input.weeks) / ai.topics.length) + 1;
    const weekEnd = Math.max(weekStart, Math.floor(((index + 1) * input.weeks) / ai.topics.length));
    topics.push({
      id: topicId,
      name: t.name,
      weekStart,
      weekEnd,
      priority: t.priority,
      difficulty: t.difficulty,
      pattern: t.pattern,
      problems,
    });
  }

  const payload: StoredPayload = {
    topics,
    resources: ai.resources.map((r, i) => ({
      id: `r_${i + 1}`,
      title: r.title,
      channel: r.channel,
      topic: r.topic,
      duration: r.duration,
      url: resourceUrl(r.title, r.channel),
    })),
  };

  // Carry over what the learner already solved/flagged in earlier roadmaps (problem ids are stable slugs).
  const prior = await deps.db.roadmapProblem.findMany({
    where: { roadmap: { userId }, OR: [{ completed: true }, { inRevision: true }] },
    select: { problemId: true, completed: true, inRevision: true },
  });
  const carried = new Map<string, CompletionRow>();
  for (const r of prior) {
    const cur = carried.get(r.problemId);
    carried.set(r.problemId, {
      problemId: r.problemId,
      completed: (cur?.completed ?? false) || r.completed,
      inRevision: (cur?.inRevision ?? false) || r.inRevision,
    });
  }

  const roadmapId = newId("rm");
  const rows = topics.flatMap((t) =>
    t.problems.map((p) => ({
      roadmapId,
      problemId: p.id,
      topicName: t.name,
      completed: carried.get(p.id)?.completed ?? false,
      inRevision: carried.get(p.id)?.inRevision ?? false,
      completedAt: carried.get(p.id)?.completed ? new Date() : null,
    })),
  );

  await deps.db.$transaction([
    deps.db.roadmap.create({
      data: { id: roadmapId, userId, targetRole: input.targetRole, level: input.currentLevel, weeks: input.weeks, payload: toJson(payload) },
    }),
    deps.db.roadmapProblem.createMany({ data: rows }),
  ]);

  await recordActivity(deps.db, userId, {
    kind: "CAREER",
    topic: "roadmap",
    meta: {
      label: "Generated DSA roadmap",
      detail: `${input.targetRole} · ${topics.length} topics · ${input.weeks} weeks`,
      roadmapId,
    },
  });

  return assemble(
    { id: roadmapId, targetRole: input.targetRole, level: input.currentLevel, weeks: input.weeks },
    payload,
    rows,
  );
}

export async function latestRoadmap(db: Db, userId: string): Promise<DSARoadmap> {
  const roadmap = await db.roadmap.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { completions: true },
  });
  if (!roadmap) throw notFound("No roadmap yet. Generate one first.");
  return assemble(roadmap, roadmap.payload as unknown as StoredPayload, roadmap.completions);
}

export async function setProblemState(
  db: Db,
  userId: string,
  roadmapId: string,
  problemId: string,
  patch: { completed?: boolean | undefined; inRevision?: boolean | undefined },
): Promise<{ problemId: string; completed: boolean; inRevision: boolean; topicProgress: number }> {
  const roadmap = await db.roadmap.findFirst({ where: { id: roadmapId, userId }, include: { completions: true } });
  const row = roadmap?.completions.find((c) => c.problemId === problemId);
  if (!roadmap || !row) throw notFound("Problem not found in this roadmap.");

  const payload = roadmap.payload as unknown as StoredPayload;
  const topic = payload.topics.find((t) => t.problems.some((p) => p.id === problemId));
  const problem = topic?.problems.find((p) => p.id === problemId);

  const completed = patch.completed ?? row.completed;
  const inRevision = patch.inRevision ?? row.inRevision;
  await db.roadmapProblem.update({
    where: { roadmapId_problemId: { roadmapId, problemId } },
    data: { completed, inRevision, completedAt: completed ? (row.completed ? row.completedAt : new Date()) : null },
  });

  if (completed && !row.completed) {
    await recordActivity(db, userId, {
      kind: "ROADMAP_PROGRESS",
      topic: row.topicName,
      meta: {
        label: `Solved ${problem?.title ?? "a problem"}`,
        detail: `${row.topicName}${problem ? ` · ${problem.difficulty}` : ""}`,
        problemId,
        completed: true,
      },
    });
  } else if (!completed && row.completed) {
    await db.activityEvent.deleteMany({
      where: { userId, kind: "ROADMAP_PROGRESS", meta: { path: ["problemId"], equals: problemId } },
    });
  }

  const siblings = roadmap.completions.filter((c) => c.topicName === row.topicName);
  const done = siblings.filter((c) => (c.problemId === problemId ? completed : c.completed)).length;
  return { problemId, completed, inRevision, topicProgress: siblings.length ? clampInt((done / siblings.length) * 100, 0, 100) : 0 };
}
