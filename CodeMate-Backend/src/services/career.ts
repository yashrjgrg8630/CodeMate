import type { Db } from "../lib/prisma.js";
import { clampInt, fence, newId, normalizeShares, sha256, toJson } from "../lib/util.js";
import type { CareerJobResult, Skill, SkillGap, SkillLevel } from "../schemas/domain.js";
import { recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { aiJobNoResumeSchema, aiJobWithResumeSchema, type AiJobNoResume, type AiJobWithResume } from "./ai/schemas.js";

/** The current frontend sends this stub for non-text uploads. It is not resume content. */
const PLACEHOLDER = /^\[[^\]]{1,200}\]\s+attached\s+[—-]\s+text extraction/i;
const MIN_RESUME_CHARS = 40;

type LeetCodePractice = {
  title: string;
  difficulty: "easy" | "medium" | "hard";
  pattern: string;
  practiceGoal: string;
  url: string;
};

const LEETCODE_BY_TOPIC: { match: RegExp; problems: Omit<LeetCodePractice, "url">[] }[] = [
  {
    match: /array|hash|map|set|string/i,
    problems: [
      { title: "Two Sum", difficulty: "easy", pattern: "Hash map", practiceGoal: "Solve in one pass and explain why the lookup approach is O(n) time." },
      { title: "Group Anagrams", difficulty: "medium", pattern: "Hashing / string signatures", practiceGoal: "Choose a stable key for each word and analyse the time and space costs." },
      { title: "Product of Array Except Self", difficulty: "medium", pattern: "Prefix and suffix products", practiceGoal: "Solve without division and keep extra space O(1), excluding the output." },
    ],
  },
  {
    match: /two.?pointer|palindrome/i,
    problems: [
      { title: "Valid Palindrome", difficulty: "easy", pattern: "Two pointers", practiceGoal: "Handle punctuation and letter casing while scanning from both ends." },
      { title: "3Sum", difficulty: "medium", pattern: "Sorting / two pointers", practiceGoal: "Avoid duplicate triplets and explain the O(n²) approach." },
      { title: "Container With Most Water", difficulty: "medium", pattern: "Two pointers / greedy", practiceGoal: "Justify why moving the shorter side cannot discard the optimal answer." },
    ],
  },
  {
    match: /sliding.?window|substring/i,
    problems: [
      { title: "Best Time to Buy and Sell Stock", difficulty: "easy", pattern: "One-pass window", practiceGoal: "Track the best result while maintaining the minimum earlier price." },
      { title: "Longest Substring Without Repeating Characters", difficulty: "medium", pattern: "Sliding window / hash map", practiceGoal: "Maintain a valid window and update its left boundary efficiently." },
      { title: "Minimum Window Substring", difficulty: "hard", pattern: "Variable sliding window", practiceGoal: "Track required character counts and shrink the window only when valid." },
    ],
  },
  {
    match: /stack|queue|monotonic/i,
    problems: [
      { title: "Valid Parentheses", difficulty: "easy", pattern: "Stack", practiceGoal: "Match closing brackets with the most recent unmatched opening bracket." },
      { title: "Min Stack", difficulty: "medium", pattern: "Stack design", practiceGoal: "Support getMin in O(1) while preserving normal stack operations." },
      { title: "Daily Temperatures", difficulty: "medium", pattern: "Monotonic stack", practiceGoal: "Find the next warmer day in linear time using unresolved indices." },
    ],
  },
  {
    match: /binary.?search|search(ed)?|sorted array/i,
    problems: [
      { title: "Binary Search", difficulty: "easy", pattern: "Binary search", practiceGoal: "Keep loop bounds consistent and test empty and one-element inputs." },
      { title: "Search in Rotated Sorted Array", difficulty: "medium", pattern: "Modified binary search", practiceGoal: "Identify which half is sorted and discard the other half safely." },
      { title: "Koko Eating Bananas", difficulty: "medium", pattern: "Binary search on answer", practiceGoal: "Define a monotone feasibility check and find the minimum valid speed." },
    ],
  },
  {
    match: /linked.?list/i,
    problems: [
      { title: "Reverse Linked List", difficulty: "easy", pattern: "Pointer manipulation", practiceGoal: "Reverse links iteratively and explain the O(1) extra-space solution." },
      { title: "Merge Two Sorted Lists", difficulty: "easy", pattern: "Linked-list merge", practiceGoal: "Use a dummy head and preserve sorted order without losing nodes." },
      { title: "Linked List Cycle", difficulty: "easy", pattern: "Fast and slow pointers", practiceGoal: "Detect a cycle in O(1) space and explain why the pointers meet." },
    ],
  },
  {
    match: /tree|bst|binary.?search tree/i,
    problems: [
      { title: "Invert Binary Tree", difficulty: "easy", pattern: "Tree DFS", practiceGoal: "Swap children recursively or iteratively and state the traversal complexity." },
      { title: "Binary Tree Level Order Traversal", difficulty: "medium", pattern: "Tree BFS", practiceGoal: "Process one queue level at a time and return nodes in level order." },
      { title: "Validate Binary Search Tree", difficulty: "medium", pattern: "Tree DFS / bounds", practiceGoal: "Validate every node against inherited lower and upper bounds." },
    ],
  },
  {
    match: /graph|island|bfs|dfs|topological|course schedule/i,
    problems: [
      { title: "Number of Islands", difficulty: "medium", pattern: "Grid DFS / BFS", practiceGoal: "Visit each cell once and avoid counting the same island twice." },
      { title: "Course Schedule", difficulty: "medium", pattern: "Directed graph / cycle detection", practiceGoal: "Detect dependency cycles using DFS states or Kahn's algorithm." },
      { title: "Clone Graph", difficulty: "medium", pattern: "Graph traversal / hash map", practiceGoal: "Copy each node once and preserve all neighbour relationships." },
    ],
  },
  {
    match: /dynamic programming|\\bdp\\b|memoization|tabulation/i,
    problems: [
      { title: "Climbing Stairs", difficulty: "easy", pattern: "Dynamic programming", practiceGoal: "Define the recurrence and reduce space to constant memory." },
      { title: "House Robber", difficulty: "medium", pattern: "Dynamic programming", practiceGoal: "Compare taking and skipping each house and state the DP invariant." },
      { title: "Coin Change", difficulty: "medium", pattern: "Unbounded dynamic programming", practiceGoal: "Build a minimum-count recurrence and handle unreachable amounts." },
    ],
  },
  {
    match: /interval|scheduling/i,
    problems: [
      { title: "Merge Intervals", difficulty: "medium", pattern: "Sorting / intervals", practiceGoal: "Sort by start time and merge overlaps in one pass." },
      { title: "Insert Interval", difficulty: "medium", pattern: "Intervals", practiceGoal: "Insert and merge while preserving sorted order in one linear scan." },
    ],
  },
  {
    match: /heap|priority.?queue|top.?k/i,
    problems: [
      { title: "Top K Frequent Elements", difficulty: "medium", pattern: "Hash map / heap or bucket sort", practiceGoal: "Compare heap and bucket approaches and explain their complexity." },
      { title: "Kth Largest Element in an Array", difficulty: "medium", pattern: "Heap / quickselect", practiceGoal: "Find the kth largest value and compare heap with quickselect." },
    ],
  },
];

function leetcodeProblems(topics: string[], phaseIndex: number): LeetCodePractice[] {
  const matches = LEETCODE_BY_TOPIC.filter(({ match }) => topics.some((topic) => match.test(topic)));
  const pool = (matches.length ? matches : LEETCODE_BY_TOPIC.slice(0, 1))
    .flatMap(({ problems }) => problems);
  const offset = (phaseIndex * 2) % pool.length;
  const selected = [pool[offset], pool[(offset + 1) % pool.length]].filter(
    (problem): problem is (typeof pool)[number] => problem !== undefined,
  );
  return selected.map((problem) => ({
    ...problem,
    url: `https://leetcode.com/problemset/?search=${encodeURIComponent(problem.title)}`,
  }));
}

function phaseActions(focus: string[], outcome: string) {
  const [primary, secondary] = focus;
  const mainFocus = primary ?? "the phase topics";
  const nextFocus = secondary ?? mainFocus;
  return [
    {
      title: `Learn ${mainFocus}`,
      instructions: `Study ${mainFocus} using a trusted course or official documentation. Write concise notes on the core concepts, common mistakes, and when to use each technique; then explain them aloud without notes.`,
      timebox: "3 × 45 min",
      deliverable: `A one-page ${mainFocus} summary with examples and at least three edge cases.`,
    },
    {
      title: `Apply ${nextFocus} in a small project`,
      instructions: `Build a small feature that uses ${nextFocus}. Break it into steps, implement the happy path, handle invalid or boundary cases, and add tests. Relate the implementation to the role requirements.`,
      timebox: "3 × 60 min",
      deliverable: `A working, tested example demonstrating ${nextFocus}, with setup and usage notes.`,
    },
    {
      title: "Review and explain your work",
      instructions: `Review your ${mainFocus} notes and implementation. Explain the design choices, alternatives, complexity or trade-offs, and one likely interview follow-up. Fix any gaps, then update your study log.`,
      timebox: "2 × 45 min",
      deliverable: outcome,
    },
  ];
}

function hasRoadmap(x: AiJobWithResume | AiJobNoResume): x is AiJobWithResume {
  return "roadmap" in x;
}

export function usableResume(text: string | undefined): string | undefined {
  const t = text?.trim();
  if (!t || t.length < MIN_RESUME_CHARS || PLACEHOLDER.test(t)) return undefined;
  return t;
}

/** Level is derived server-side from the numbers so it can never disagree with them. */
export function skillLevel(required: number, current: number): SkillLevel {
  if (current <= 0) return "missing";
  const deficit = required - current;
  if (deficit <= 10) return "strong";
  if (deficit <= 30) return "practice";
  return "weak";
}

const SYSTEM = `You are a technical recruiter and career coach for software engineers.
Extract what the job description requires and, if a resume is supplied, assess the candidate against it.
Rules:
- Base every claim on the job description / resume text. Do not invent requirements or experience.
- "skills" is a deduplicated list of 8-16 concrete skills spanning languages, frameworks, databases, DSA topics and tooling. "required" is how strongly the job needs it (0-100). "current" is the resume's evidence of that skill (0-100): 0 if absent or no resume supplied; reserve 80+ for skills demonstrated by substantial, recent, specific experience.
- "dsaTopics" are algorithm/data-structure topics the interview is likely to cover, inferred from the role level and stack.
- "recommendations" are specific, prioritised next steps (not generic advice).
- When a resume is present, also produce "roadmap": a plan for the exact requested number of weeks in 3-5 phases. Each phase should contain a concise title, short focus label, 2-5 focus topics, and a measurable outcome; the server assigns each phase's calendar range and enriches these topics into detailed tasks and verified LeetCode practice. Also provide "radar" with 5-8 axes comparing resume level versus requirement, "categoryFocus" weights showing where study time should go, and short "quickWins" for the resume itself. Be honest in the verdict.`;

export async function analyzeJob(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { jobDescription: string; resumeText?: string | undefined; weeks: number },
): Promise<CareerJobResult> {
  const resume = usableResume(input.resumeText);
  const prompt = [
    fence("job_description", input.jobDescription),
    resume ? fence("resume", resume) : "No resume was supplied: set every skill's current to 0 and do not produce a roadmap.",
    `Preparation duration: ${input.weeks} weeks. Tailor the phase workload, focus topics and outcomes to fit this exact duration.`,
  ].join("\n\n");

  const ai: AiJobWithResume | AiJobNoResume = resume
    ? await deps.ai.generateJson({ userId, feature: "career", system: SYSTEM, prompt, schema: aiJobWithResumeSchema, maxOutputTokens: 16384 })
    : await deps.ai.generateJson({ userId, feature: "career", system: SYSTEM, prompt, schema: aiJobNoResumeSchema, maxOutputTokens: 12288 });

  const seen = new Set<string>();
  const skills: Skill[] = [];
  for (const s of ai.skills) {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const required = clampInt(s.required, 0, 100);
    const current = resume ? clampInt(s.current, 0, 100) : 0;
    skills.push({ name: s.name.trim(), category: s.category, required, current, level: skillLevel(required, current) });
  }

  const byLevel = (level: SkillLevel): Skill[] => skills.filter((s) => s.level === level);
  const skillGap: SkillGap = {
    strong: byLevel("strong"),
    practice: byLevel("practice"),
    weak: byLevel("weak"),
    missing: byLevel("missing"),
    recommendation: ai.recommendations,
  };

  const analysisId = newId("job");
  const analysis = {
    id: analysisId,
    roleSummary: ai.roleSummary,
    seniority: ai.seniority,
    languages: ai.languages,
    frameworks: ai.frameworks,
    databases: ai.databases,
    dsaTopics: ai.dsaTopics,
    interviewTopics: ai.interviewTopics,
    skills,
  };

  let roadmap: CareerJobResult["roadmap"] = null;
  if (resume && hasRoadmap(ai)) {
    const r = ai.roadmap;
    const weightSum = skills.reduce((a, s) => a + Math.max(1, s.required), 0);
    const matchScore = clampInt(
      (skills.reduce((a, s) => a + Math.max(1, s.required) * Math.min(1, s.current / Math.max(1, s.required)), 0) / weightSum) * 100,
      0,
      100,
    );
    const radar = r.radar.map((p) => ({ skill: p.skill, resume: clampInt(p.resume, 0, 100), required: clampInt(p.required, 0, 100) }));
    const shares = normalizeShares(r.categoryFocus.map((c) => c.weight));
    roadmap = {
      id: newId("match"),
      matchScore,
      verdict: r.verdict,
      radar,
      categoryFocus: r.categoryFocus.map((c, i) => ({ name: c.name, value: shares[i] ?? 0 })),
      gaps: radar
        .map((p) => ({ skill: p.skill, have: p.resume, need: p.required }))
        .sort((a, b) => b.need - b.have - (a.need - a.have)),
      weeks: input.weeks,
      phases: r.phases.map((p, i) => {
        const weekStart = Math.floor((i * input.weeks) / r.phases.length) + 1;
        const weekEnd = Math.max(
          weekStart,
          Math.floor(((i + 1) * input.weeks) / r.phases.length),
        );
        const range = weekStart === weekEnd ? `Week ${weekStart}` : `Weeks ${weekStart}–${weekEnd}`;
        return {
          id: `p${i + 1}`,
          title: p.title,
          weeks: range,
          weekStart,
          weekEnd,
          intensity: clampInt(p.intensity, 0, 100),
          focus: p.focus,
          outcome: p.outcome,
          actions: phaseActions(p.focus, p.outcome),
          leetcode: leetcodeProblems(ai.dsaTopics, i),
        };
      }),
      quickWins: r.quickWins,
    };
  }

  const result: CareerJobResult = { analysis, skillGap, roadmap };

  await deps.db.jobAnalysis.create({
    data: {
      id: analysisId,
      userId,
      inputHash: sha256(`${input.jobDescription}\n--\n${resume ?? ""}\n--\n${input.weeks}`),
      jobDescription: input.jobDescription,
      resumeText: resume ?? null,
      result: toJson(result),
    },
  });

  await recordActivity(deps.db, userId, {
    kind: "CAREER",
    topic: "career",
    score: roadmap?.matchScore ?? null,
    meta: {
      label: roadmap ? "Matched resume to job" : "Analyzed job description",
      detail: roadmap ? `${analysis.seniority} · ${roadmap.matchScore}% match` : `${analysis.seniority} · ${skills.length} skills extracted`,
      jobAnalysisId: analysisId,
    },
  });

  return result;
}
