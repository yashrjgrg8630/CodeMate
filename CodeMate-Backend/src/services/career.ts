import type { Db } from "../lib/prisma.js";
import {
  clampInt,
  fence,
  newId,
  normalizeShares,
  sha256,
  toJson,
} from "../lib/util.js";
import type {
  CareerJobResult,
  Skill,
  SkillGap,
  SkillLevel,
} from "../schemas/domain.js";
import { recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import {
  aiJobNoResumeSchema,
  aiJobWithResumeSchema,
  type AiJobNoResume,
  type AiJobWithResume,
} from "./ai/schemas.js";
import { resolveProblemLinks, type ProblemLinkType } from "./problem-links.js";

/** The current frontend sends this stub for non-text uploads. It is not resume content. */
const PLACEHOLDER = /^\[[^\]]{1,200}\]\s+attached\s+[—-]\s+text extraction/i;
const MIN_RESUME_CHARS = 40;
type AiCareerProblem =
  AiJobWithResume["roadmap"]["phases"][number]["problems"][number];
type ResolvedCareerProblem = Omit<AiCareerProblem, "url"> & {
  url: string;
  linkType: ProblemLinkType;
};

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

async function resolveCareerProblems(
  phases: AiJobWithResume["roadmap"]["phases"],
): Promise<ResolvedCareerProblem[][]> {
  const usedTitles = new Set<string>();
  const phaseCandidates = phases.map((phase) =>
    phase.problems.filter((problem) => {
      const topicMatches = phase.focus.some(
        (focus) =>
          focus.trim().toLowerCase() === problem.topic.trim().toLowerCase(),
      );
      const titleKey = problem.title.trim().toLowerCase();
      if (!topicMatches || usedTitles.has(titleKey)) return false;
      usedTitles.add(titleKey);
      return true;
    }),
  );
  const resolved = await resolveProblemLinks(phaseCandidates.flat());
  let cursor = 0;
  return phaseCandidates.map((phase) => phase.map(() => resolved[cursor++]!));
}

function hasRoadmap(x: AiJobWithResume | AiJobNoResume): x is AiJobWithResume {
  return "roadmap" in x;
}

export function usableResume(text: string | undefined): string | undefined {
  const t = text?.trim();
  if (!t || t.length < MIN_RESUME_CHARS || PLACEHOLDER.test(t))
    return undefined;
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
- When a resume is present, also produce "roadmap": a plan for the exact requested number of weeks in 3-5 phases. Each phase should contain a concise title, short focus label, 2-5 focus topics, a measurable outcome, and 2-5 real practice problems relevant to its focus topics. Select across LeetCode, GeeksforGeeks, Codeforces, HackerRank, CodeChef, AtCoder, InterviewBit, CSES Problem Set, HackerEarth, and SPOJ. Use varied platforms and a reasonable easy/medium/hard mix appropriate to the candidate's level and preparation time. Prioritize actual skill gaps and job requirements, and do not repeat problems between phases. Each problem's topic must exactly match one phase focus topic. Include an official canonical direct URL only when known exactly; omit it when uncertain so the server can verify it or provide a platform-specific search fallback. Never invent problem titles, URLs, time estimates or progress. Also provide "radar" with 5-8 axes comparing resume level versus requirement, "categoryFocus" weights showing where study time should go, and short "quickWins" for the resume itself. Be honest in the verdict.`;

export async function analyzeJob(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: {
    jobDescription: string;
    resumeText?: string | undefined;
    weeks: number;
  },
): Promise<CareerJobResult> {
  const resume = usableResume(input.resumeText);
  const prompt = [
    fence("job_description", input.jobDescription),
    resume
      ? fence("resume", resume)
      : "No resume was supplied: set every skill's current to 0 and do not produce a roadmap.",
    `Preparation duration: ${input.weeks} weeks. Tailor the phase workload, focus topics and outcomes to fit this exact duration.`,
  ].join("\n\n");

  const ai: AiJobWithResume | AiJobNoResume = resume
    ? await deps.ai.generateJson({
        userId,
        feature: "career",
        system: SYSTEM,
        prompt,
        schema: aiJobWithResumeSchema,
        maxOutputTokens: 16384,
      })
    : await deps.ai.generateJson({
        userId,
        feature: "career",
        system: SYSTEM,
        prompt,
        schema: aiJobNoResumeSchema,
        maxOutputTokens: 12288,
      });

  const seen = new Set<string>();
  const skills: Skill[] = [];
  for (const s of ai.skills) {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const required = clampInt(s.required, 0, 100);
    const current = resume ? clampInt(s.current, 0, 100) : 0;
    skills.push({
      name: s.name.trim(),
      category: s.category,
      required,
      current,
      level: skillLevel(required, current),
    });
  }

  const byLevel = (level: SkillLevel): Skill[] =>
    skills.filter((s) => s.level === level);
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
    const phaseProblems = await resolveCareerProblems(r.phases);
    const weightSum = skills.reduce((a, s) => a + Math.max(1, s.required), 0);
    const matchScore = clampInt(
      (skills.reduce(
        (a, s) =>
          a +
          Math.max(1, s.required) *
            Math.min(1, s.current / Math.max(1, s.required)),
        0,
      ) /
        weightSum) *
        100,
      0,
      100,
    );
    const radar = r.radar.map((p) => ({
      skill: p.skill,
      resume: clampInt(p.resume, 0, 100),
      required: clampInt(p.required, 0, 100),
    }));
    const shares = normalizeShares(r.categoryFocus.map((c) => c.weight));
    roadmap = {
      id: newId("match"),
      matchScore,
      verdict: r.verdict,
      radar,
      categoryFocus: r.categoryFocus.map((c, i) => ({
        name: c.name,
        value: shares[i] ?? 0,
      })),
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
        const range =
          weekStart === weekEnd
            ? `Week ${weekStart}`
            : `Weeks ${weekStart}–${weekEnd}`;
        const problems = phaseProblems[i] ?? [];
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
          problems,
          leetcode: problems
            .filter((problem) => problem.platform === "LeetCode")
            .map(({ title, difficulty, pattern, practiceGoal, url }) => ({
              title,
              difficulty,
              pattern,
              practiceGoal,
              url,
            })),
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
      inputHash: sha256(
        `${input.jobDescription}\n--\n${resume ?? ""}\n--\n${input.weeks}`,
      ),
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
      detail: roadmap
        ? `${analysis.seniority} · ${roadmap.matchScore}% match`
        : `${analysis.seniority} · ${skills.length} skills extracted`,
      jobAnalysisId: analysisId,
    },
  });

  return result;
}
