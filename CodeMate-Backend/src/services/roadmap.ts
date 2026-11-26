import { AppError, notFound } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";
import { clampInt, fence, newId, toJson } from "../lib/util.js";
import type {
  DSAPreparationTask,
  DSARoadmap,
  DSATopic,
  RoadmapDurationUnit,
} from "../schemas/domain.js";
import { recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { aiRoadmapSchema } from "./ai/schemas.js";
import {
  normalizeStoredProblemLink,
  resolveProblemLinks,
  type ProblemLinkType,
} from "./problem-links.js";

const SYSTEM = `You are a DSA and technical-interview preparation coach. Build an original roadmap for the exact target role, current level, and available time in the request; do not reuse a fixed stage list or generic curriculum.
Return the requested number of stages in a sensible learning sequence. Choose stage titles and key topics that fit the role (for example, backend plans may cover APIs, databases, and system design; AI/ML plans may cover mathematical foundations and ML interview concepts where appropriate). Start with fundamentals for beginners; advanced learners should spend more time on advanced patterns, hard problems, and interview simulations instead of repeating basics. Make the final stage consolidate target-role interview preparation, timed simulations, and a personalized revision plan.
Each stage must include a concise description, 2-8 concrete key topics, 1-6 actionable preparation tasks with honest estimated minutes and an optional tangible deliverable, a difficulty and priority, and 1-8 practice problems. Scale the number of stages, task detail, problem count, topic depth, and workload to the requested duration; distribute work realistically and avoid repeated or irrelevant problems.
Practice problems must be real and relevant to that stage, target role, level, and difficulty progression. Use suitable platforms from LeetCode, GeeksforGeeks, Codeforces, HackerRank, CodeChef, AtCoder, InterviewBit, CSES Problem Set, HackerEarth, SPOJ, and NeetCode. Prefer breadth across platforms when relevant, never force a platform. Include the exact problem topic and a specific practice goal. Give an official canonical direct URL only when certain it identifies that exact problem; otherwise omit the URL. Never invent a problem, URL, difficulty, or duration.
Return one well-known learning resource per generated stage, using the exact stage title in its topic field. These resource titles and publishers become clearly labelled YouTube search links, not claimed direct resource URLs.`;

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "item";

const resourceUrl = (title: string, channel: string): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${channel}`)}`;

interface StoredProblem {
  id: string;
  title: string;
  platform: DSATopic["problems"][number]["platform"];
  difficulty: DSATopic["difficulty"];
  topic: string;
  pattern: string;
  practiceGoal?: string;
  estimatedMinutes?: number;
  url?: string | null;
  linkType?: ProblemLinkType;
}
type StoredTask = Omit<DSAPreparationTask, "completed">;
interface StoredTopic extends Omit<
  DSATopic,
  | "problems"
  | "progress"
  | "tasks"
  | "description"
  | "keyTopics"
  | "durationLabel"
  | "estimatedMinutes"
> {
  description?: string;
  keyTopics?: string[];
  tasks?: StoredTask[];
  problems: StoredProblem[];
}
interface StoredPayload {
  topics: StoredTopic[];
  resources: DSARoadmap["resources"];
  duration?: {
    value: number;
    unit: RoadmapDurationUnit;
    days: number;
  };
}

interface CompletionRow {
  problemId: string;
  completed: boolean;
  inRevision: boolean;
}

interface TaskRow {
  taskId: string;
  completed: boolean;
}

function stageCountForDays(days: number): number {
  if (days <= 7) return 1;
  if (days <= 14) return 2;
  return Math.max(3, Math.min(16, Math.ceil(days / 14)));
}

function stageDurationLabel(
  unit: RoadmapDurationUnit,
  startDay: number,
  endDay: number,
): string {
  const labelUnit = unit === "months" ? "weeks" : unit;
  const start =
    labelUnit === "days"
      ? startDay
      : labelUnit === "weeks"
        ? Math.floor((startDay - 1) / 7) + 1
        : Math.floor((startDay - 1) / 30) + 1;
  const end =
    labelUnit === "days"
      ? endDay
      : labelUnit === "weeks"
        ? Math.ceil(endDay / 7)
        : Math.floor((endDay - 1) / 30) + 1;
  const singular = labelUnit.slice(0, -1);
  const period =
    start === end ? `${singular} ${start}` : `${labelUnit} ${start}–${end}`;
  return period[0]!.toUpperCase() + period.slice(1);
}

function assemble(
  roadmap: { id: string; targetRole: string; level: string; weeks: number },
  payload: StoredPayload,
  rows: CompletionRow[],
  taskRows: TaskRow[] = [],
): DSARoadmap {
  const state = new Map(rows.map((r) => [r.problemId, r]));
  const taskState = new Map(taskRows.map((row) => [row.taskId, row]));
  const duration = payload.duration ?? {
    value: roadmap.weeks,
    unit: "weeks" as const,
    days: roadmap.weeks * 7,
  };
  return {
    id: roadmap.id,
    targetRole: roadmap.targetRole,
    preparationLevel: roadmap.level,
    weeks: roadmap.weeks,
    durationValue: duration.value,
    durationUnit: duration.unit,
    durationDays: duration.days,
    topics: payload.topics.map((t, index) => {
      const problems = t.problems.map((p) => ({
        ...p,
        topic: p.topic ?? p.pattern ?? t.name,
        practiceGoal: p.practiceGoal ?? "",
        ...normalizeStoredProblemLink(p.platform, p.title, p.url, p.linkType),
        completed: state.get(p.id)?.completed ?? false,
        inRevision: state.get(p.id)?.inRevision ?? false,
      }));
      const tasks = (t.tasks ?? []).map((task) => ({
        ...task,
        completed: taskState.get(task.id)?.completed ?? false,
      }));
      const startDay =
        Math.floor((index * duration.days) / payload.topics.length) + 1;
      const endDay = Math.max(
        startDay,
        Math.floor(((index + 1) * duration.days) / payload.topics.length),
      );
      const weekStart = Math.floor((startDay - 1) / 7) + 1;
      const weekEnd = Math.floor((endDay - 1) / 7) + 1;
      const done =
        problems.filter((problem) => problem.completed).length +
        tasks.filter((task) => task.completed).length;
      const total = problems.length + tasks.length;
      return {
        ...t,
        description: t.description ?? t.pattern,
        keyTopics: t.keyTopics ?? [],
        tasks,
        weekStart,
        weekEnd,
        durationLabel: stageDurationLabel(duration.unit, startDay, endDay),
        estimatedMinutes:
          tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0) +
          problems.reduce(
            (sum, problem) => sum + (problem.estimatedMinutes ?? 0),
            0,
          ),
        problems,
        progress: total ? clampInt((done / total) * 100, 0, 100) : 0,
      };
    }),
    resources: payload.resources,
  };
}

export async function generateRoadmap(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: {
    targetRole: string;
    currentLevel: string;
    weeks: number;
    durationValue: number;
    durationUnit: RoadmapDurationUnit;
    durationDays: number;
  },
): Promise<DSARoadmap> {
  const expectedStages = stageCountForDays(input.durationDays);
  const ai = await deps.ai.generateJson({
    userId,
    feature: "roadmap",
    system: SYSTEM,
    prompt: `Target role: ${fence("role", input.targetRole)}
Current level: ${fence("level", input.currentLevel)}
Available preparation time: ${fence("duration", `${input.durationValue} ${input.durationUnit} (${input.durationDays} days)`)}
Create exactly ${expectedStages} stages, in a role-appropriate learning sequence. Divide all ${input.durationDays} days across the stages without gaps, include a progressive mix of theory, hands-on preparation tasks, and practice problems, and size the total workload realistically for this level and schedule. A beginner's software-engineering plan should establish programming/DSA foundations; an advanced plan should prioritize difficult patterns and interview practice. Tailor stage topics to the selected role instead of relabeling a generic DSA curriculum.`,
    schema: aiRoadmapSchema,
    maxOutputTokens: 16384,
    temperature: 0.4,
  });

  const usedTopicIds = new Set<string>();
  const usedProblemIds = new Set<string>();
  const usedProblemTitles = new Set<string>();
  const usedTaskIds = new Set<string>();
  const taskScope = slug(`${input.targetRole}-${input.currentLevel}`);
  const topics: StoredTopic[] = [];
  if (
    ai.topics.length !== expectedStages ||
    new Set(ai.topics.map((topic) => topic.name.trim().toLowerCase())).size !==
      ai.topics.length
  ) {
    throw new AppError(
      502,
      "AI_BAD_RESPONSE",
      "The AI service returned an invalid stage sequence for this preparation window. Please try again.",
    );
  }
  for (const [index, t] of ai.topics.entries()) {
    let topicId = slug(t.name);
    for (let n = 2; usedTopicIds.has(topicId); n += 1)
      topicId = `${slug(t.name)}-${n}`;
    usedTopicIds.add(topicId);

    const problems: StoredProblem[] = [];
    const tasks: StoredTask[] = [];
    for (const task of t.tasks) {
      const id = `t_${taskScope}_${topicId}_${slug(task.title)}`;
      if (usedTaskIds.has(id)) continue;
      usedTaskIds.add(id);
      tasks.push({ id, ...task });
    }
    for (const p of t.problems) {
      const id = `p_${topicId}_${slug(p.title)}`;
      const titleKey = p.title
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      if (usedProblemIds.has(id) || usedProblemTitles.has(titleKey)) continue;
      usedProblemIds.add(id);
      usedProblemTitles.add(titleKey);
      problems.push({
        id,
        title: p.title,
        platform: p.platform,
        difficulty: p.difficulty,
        topic: p.topic,
        pattern: p.pattern,
        practiceGoal: p.practiceGoal,
        estimatedMinutes: p.estimatedMinutes,
        url: p.url,
      });
    }
    if (problems.length === 0 || tasks.length === 0) {
      throw new AppError(
        502,
        "AI_BAD_RESPONSE",
        "The AI service returned a stage without unique preparation tasks or practice problems. Please try again.",
      );
    }
    const startDay =
      Math.floor((index * input.durationDays) / ai.topics.length) + 1;
    const endDay = Math.max(
      startDay,
      Math.floor(((index + 1) * input.durationDays) / ai.topics.length),
    );
    const weekStart = Math.floor((startDay - 1) / 7) + 1;
    const weekEnd = Math.floor((endDay - 1) / 7) + 1;
    topics.push({
      id: topicId,
      name: t.name,
      description: t.description,
      keyTopics: t.keyTopics,
      tasks,
      weekStart,
      weekEnd,
      priority: t.priority,
      difficulty: t.difficulty,
      pattern: t.pattern,
      problems,
    });
  }

  const resolvedProblems = await resolveProblemLinks(
    topics.flatMap((topic) => topic.problems),
  );
  let resolvedIndex = 0;
  for (const topic of topics) {
    topic.problems = topic.problems.map(
      () => resolvedProblems[resolvedIndex++]!,
    );
  }

  const generatedResources = new Map(
    ai.resources.map((resource) => [resource.topic, resource]),
  );
  if (
    generatedResources.size !== topics.length ||
    topics.some((topic) => !generatedResources.has(topic.name))
  ) {
    throw new AppError(
      502,
      "AI_BAD_RESPONSE",
      "The AI service returned incomplete learning resources for this roadmap. Please try again.",
    );
  }
  const payload: StoredPayload = {
    topics,
    duration: {
      value: input.durationValue,
      unit: input.durationUnit,
      days: input.durationDays,
    },
    resources: topics.map((topic, i) => {
      const r = generatedResources.get(topic.name)!;
      return {
        id: `r_${i + 1}`,
        title: r.title,
        channel: r.channel,
        topic: r.topic,
        duration: r.duration,
        url: resourceUrl(r.title, r.channel),
      };
    }),
  };

  // Carry over what the learner already solved/flagged in earlier roadmaps (problem ids are stable slugs).
  const prior = await deps.db.roadmapProblem.findMany({
    where: {
      roadmap: { userId },
      OR: [{ completed: true }, { inRevision: true }],
    },
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
  const priorTasks = await deps.db.roadmapTask.findMany({
    where: { roadmap: { userId }, completed: true },
    select: { taskId: true, completed: true },
  });
  const carriedTasks = new Map(
    priorTasks.map((task) => [task.taskId, task.completed]),
  );

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
  const taskRows = topics.flatMap((topic) =>
    (topic.tasks ?? []).map((task) => ({
      roadmapId,
      taskId: task.id,
      topicName: topic.name,
      completed: carriedTasks.get(task.id) ?? false,
    })),
  );

  await deps.db.$transaction([
    deps.db.roadmap.create({
      data: {
        id: roadmapId,
        userId,
        targetRole: input.targetRole,
        level: input.currentLevel,
        weeks: input.weeks,
        payload: toJson(payload),
      },
    }),
    deps.db.roadmapProblem.createMany({ data: rows }),
    deps.db.roadmapTask.createMany({ data: taskRows }),
  ]);

  await recordActivity(deps.db, userId, {
    kind: "CAREER",
    topic: "roadmap",
    meta: {
      label: "Generated DSA roadmap",
      detail: `${input.targetRole} · ${topics.length} stages · ${input.durationValue} ${input.durationUnit}`,
      roadmapId,
    },
  });

  return assemble(
    {
      id: roadmapId,
      targetRole: input.targetRole,
      level: input.currentLevel,
      weeks: input.weeks,
    },
    payload,
    rows,
    taskRows,
  );
}

export async function latestRoadmap(
  db: Db,
  userId: string,
): Promise<DSARoadmap> {
  const roadmap = await db.roadmap.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { completions: true, tasks: true },
  });
  if (!roadmap) throw notFound("No roadmap yet. Generate one first.");
  return assemble(
    roadmap,
    roadmap.payload as unknown as StoredPayload,
    roadmap.completions,
    roadmap.tasks,
  );
}

export async function setProblemState(
  db: Db,
  userId: string,
  roadmapId: string,
  problemId: string,
  patch: { completed?: boolean | undefined; inRevision?: boolean | undefined },
): Promise<{
  problemId: string;
  completed: boolean;
  inRevision: boolean;
  topicProgress: number;
}> {
  const roadmap = await db.roadmap.findFirst({
    where: { id: roadmapId, userId },
    include: { completions: true, tasks: true },
  });
  const row = roadmap?.completions.find((c) => c.problemId === problemId);
  if (!roadmap || !row) throw notFound("Problem not found in this roadmap.");

  const payload = roadmap.payload as unknown as StoredPayload;
  const topic = payload.topics.find((t) =>
    t.problems.some((p) => p.id === problemId),
  );
  const problem = topic?.problems.find((p) => p.id === problemId);

  const completed = patch.completed ?? row.completed;
  const inRevision = patch.inRevision ?? row.inRevision;
  await db.roadmapProblem.update({
    where: { roadmapId_problemId: { roadmapId, problemId } },
    data: {
      completed,
      inRevision,
      completedAt: completed
        ? row.completed
          ? row.completedAt
          : new Date()
        : null,
    },
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
      where: {
        userId,
        kind: "ROADMAP_PROGRESS",
        meta: { path: ["problemId"], equals: problemId },
      },
    });
  }

  const siblings = roadmap.completions.filter(
    (c) => c.topicName === row.topicName,
  );
  const taskSiblings = roadmap.tasks.filter(
    (task) => task.topicName === row.topicName,
  );
  const done =
    siblings.filter((c) =>
      c.problemId === problemId ? completed : c.completed,
    ).length + taskSiblings.filter((task) => task.completed).length;
  const total = siblings.length + taskSiblings.length;
  return {
    problemId,
    completed,
    inRevision,
    topicProgress: total ? clampInt((done / total) * 100, 0, 100) : 0,
  };
}

export async function setTaskState(
  db: Db,
  userId: string,
  roadmapId: string,
  taskId: string,
  patch: { completed: boolean },
): Promise<{ taskId: string; completed: boolean; topicProgress: number }> {
  const roadmap = await db.roadmap.findFirst({
    where: { id: roadmapId, userId },
    include: { completions: true, tasks: true },
  });
  const row = roadmap?.tasks.find((task) => task.taskId === taskId);
  if (!roadmap || !row) throw notFound("Task not found in this roadmap.");

  await db.roadmapTask.update({
    where: { roadmapId_taskId: { roadmapId, taskId } },
    data: { completed: patch.completed },
  });

  const payload = roadmap.payload as unknown as StoredPayload;
  const task = payload.topics
    .flatMap((topic) => topic.tasks ?? [])
    .find((item) => item.id === taskId);
  if (patch.completed && !row.completed) {
    await recordActivity(db, userId, {
      kind: "ROADMAP_PROGRESS",
      topic: row.topicName,
      meta: {
        label: `Completed ${task?.title ?? "a preparation task"}`,
        detail: `${row.topicName} · preparation task`,
        taskId,
        completed: true,
      },
    });
  } else if (!patch.completed && row.completed) {
    await db.activityEvent.deleteMany({
      where: {
        userId,
        kind: "ROADMAP_PROGRESS",
        meta: { path: ["taskId"], equals: taskId },
      },
    });
  }

  const problemSiblings = roadmap.completions.filter(
    (completion) => completion.topicName === row.topicName,
  );
  const taskSiblings = roadmap.tasks.filter(
    (item) => item.topicName === row.topicName,
  );
  const done =
    problemSiblings.filter((completion) => completion.completed).length +
    taskSiblings.filter((item) =>
      item.taskId === taskId ? patch.completed : item.completed,
    ).length;
  const total = problemSiblings.length + taskSiblings.length;
  return {
    taskId,
    completed: patch.completed,
    topicProgress: total ? clampInt((done / total) * 100, 0, 100) : 0,
  };
}
