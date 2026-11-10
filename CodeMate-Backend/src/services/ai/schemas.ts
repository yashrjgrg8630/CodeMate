/** Schemas for what the *model* returns. The server maps these to the public domain types
 *  (assigning ids, clamping scores, deriving levels) so model output is never trusted verbatim. */
import { z } from "zod";
import { difficultySchema, prioritySchema, severitySchema, skillCategorySchema } from "../../schemas/domain.js";

const pct = z.number().int().min(0).max(100);
const short = z.string().min(1).max(200);
const para = z.string().min(1).max(1200);
const complexity = z.object({
  time: z.string().min(1).max(40).describe("Big-O notation, e.g. O(n log n)"),
  space: z.string().min(1).max(40).describe("Big-O notation, e.g. O(1)"),
});

export const aiAnalysisSchema = z.object({
  codeHealth: pct.describe("Overall quality 0-100 considering correctness, robustness, readability, efficiency"),
  complexity,
  pattern: z.object({
    name: short.describe("Algorithmic technique, e.g. Brute Force, Sliding Window, Dynamic Programming"),
    category: short.describe("Problem family, e.g. Array Traversal, Graph Search"),
    confidence: pct,
    description: para,
  }),
  bugs: z
    .array(
      z.object({
        line: z.number().int().min(1).max(100000).describe("1-based line number in the submitted code"),
        title: short,
        explanation: para,
        severity: severitySchema,
        suggestedFix: para,
      }),
    )
    .max(12),
  optimizationHint: z.object({
    approach: short,
    summary: para,
    from: z.string().min(1).max(40).describe("Current time complexity"),
    to: z.string().min(1).max(40).describe("Achievable time complexity"),
  }),
});
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

export const aiOptimizationSchema = z.object({
  original: z.object({ approach: short, complexity }),
  candidates: z
    .array(
      z.object({
        approach: short.describe("Technique name, e.g. Sliding Window, HashMap, Two Pointer"),
        complexity,
        readability: pct,
        confidence: pct.describe("Confidence this candidate is behaviourally equivalent to the original"),
        improvement: pct.describe("Estimated runtime improvement versus the original, 0-100"),
        rationale: para,
        code: z.string().min(1).max(20000).describe("Complete, runnable implementation in the SAME language as the input"),
      }),
    )
    .min(3)
    .max(4),
  recommendedIndex: z.number().int().min(0).max(3).describe("0-based index into candidates of the best overall candidate"),
  explanation: z.string().min(1).max(1500),
});
export type AiOptimization = z.infer<typeof aiOptimizationSchema>;

export const aiConversionSchema = z.object({
  code: z.string().min(1).max(30000),
  summary: para,
  changes: z
    .array(
      z.object({
        category: z.enum(["syntax", "data-structure", "library"]),
        from: z.string().min(1).max(200),
        to: z.string().min(1).max(200),
        note: z.string().min(1).max(500),
      }),
    )
    .max(12),
  complexity,
  /** Complexity of the *input* program (before conversion), used for the History timeline. */
  sourceComplexity: complexity,
  warnings: z.array(z.string().min(1).max(400)).max(8),
});
export type AiConversion = z.infer<typeof aiConversionSchema>;

const aiSkill = z.object({
  name: z.string().min(1).max(60),
  category: skillCategorySchema,
  required: pct.describe("How strongly the job requires this skill, 0-100"),
  current: pct.describe("Evidence of this skill in the resume 0-100; 0 when absent or when no resume was supplied"),
});

const aiJobBase = {
  roleSummary: para,
  seniority: z.string().min(1).max(60),
  languages: z.array(z.string().min(1).max(40)).max(12),
  frameworks: z.array(z.string().min(1).max(40)).max(15),
  databases: z.array(z.string().min(1).max(40)).max(10),
  dsaTopics: z.array(z.string().min(1).max(50)).max(15),
  interviewTopics: z.array(z.string().min(1).max(80)).max(12),
  skills: z.array(aiSkill).min(5).max(18),
  recommendations: z.array(z.string().min(1).max(400)).min(2).max(6),
};

export const aiJobNoResumeSchema = z.object(aiJobBase);

export const aiJobWithResumeSchema = z.object({
  ...aiJobBase,
  roadmap: z.object({
    verdict: z.string().min(1).max(400),
    radar: z
      .array(z.object({ skill: z.string().min(1).max(40), resume: pct, required: pct }))
      .min(5)
      .max(8),
    categoryFocus: z
      .array(z.object({ name: z.string().min(1).max(50), weight: z.number().min(0).max(100) }))
      .min(3)
      .max(7),
    phases: z
      .array(
        z.object({
          title: short,
          weeks: z.string().min(1).max(30).describe('e.g. "Week 1–2"'),
          intensity: pct,
          focus: z.array(z.string().min(1).max(120)).min(2).max(5),
          outcome: z.string().min(1).max(300),
        }),
      )
      .min(3)
      .max(5),
    quickWins: z.array(z.string().min(1).max(300)).min(2).max(6),
  }),
});
export type AiJobWithResume = z.infer<typeof aiJobWithResumeSchema>;
export type AiJobNoResume = z.infer<typeof aiJobNoResumeSchema>;

export const aiInterviewQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        topic: z.string().min(1).max(80),
        difficulty: difficultySchema,
        prompt: z.string().min(1).max(1200),
        followUp: z.string().min(1).max(500),
      }),
    )
    .min(4)
    .max(6),
});

export const aiEvaluationSchema = z.object({
  score: pct,
  feedback: z.string().min(1).max(1500),
  followUp: z.string().min(1).max(500),
});

export const aiReportSchema = z.object({
  scores: z.object({
    technicalKnowledge: pct,
    problemSolving: pct,
    communication: pct,
    codeQuality: pct,
    complexityAnalysis: pct,
  }),
  strengths: z.array(z.string().min(1).max(300)).min(2).max(5),
  weaknesses: z.array(z.string().min(1).max(300)).min(2).max(5),
  recommendations: z.array(z.string().min(1).max(300)).min(3).max(5),
});

export const aiRoadmapSchema = z.object({
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        priority: prioritySchema,
        difficulty: difficultySchema,
        pattern: z.string().min(1).max(120),
        problems: z
          .array(
            z.object({
              title: z.string().min(1).max(100).describe("Exact, well-known problem title"),
              platform: z.enum(["LeetCode", "GeeksforGeeks", "HackerRank", "Codeforces", "Other"]),
              difficulty: difficultySchema,
              pattern: z.string().min(1).max(80),
            }),
          )
          .min(3)
          .max(6),
      }),
    )
    .length(8),
  resources: z
    .array(
      z.object({
        title: z.string().min(1).max(120).describe("Lesson/course title for the topic"),
        channel: z.string().min(1).max(80).describe("Well-known creator, course or publisher"),
        topic: z.string().min(1).max(60),
        duration: z.string().min(1).max(30).describe('Estimated length, e.g. "~45 min"'),
      }),
    )
    .min(4)
    .max(8),
});
export type AiRoadmap = z.infer<typeof aiRoadmapSchema>;

/** Output of the sandboxed verification script. */
export const execVerificationSchema = z.object({
  passed: z.number().int().min(0).max(100000),
  total: z.number().int().min(1).max(100000),
});

const seriesPoint = z.object({
  input: z.enum(["1K", "5K", "10K", "50K", "100K"]),
  original_ms: z.number().min(0),
  optimized_ms: z.number().min(0),
  original_estimated: z.boolean().default(false),
  optimized_estimated: z.boolean().default(false),
});
export const execBenchmarkSchema = z.object({
  series: z.array(seriesPoint).length(5),
  peak_memory_mb: z.object({ original: z.number().min(0), optimized: z.number().min(0) }),
  notes: z.array(z.string().max(300)).max(6).default([]),
});
export type ExecBenchmark = z.infer<typeof execBenchmarkSchema>;
