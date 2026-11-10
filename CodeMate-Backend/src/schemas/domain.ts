/**
 * Zod mirror of the frontend's `src/types/domain.ts`. These schemas are the single
 * source of truth for response typing on the server; contract tests parse every
 * endpoint response with them.
 */
import { z } from "zod";

export const languageSchema = z.enum(["python", "java", "c", "cpp", "javascript", "typescript"]);
export type Language = z.infer<typeof languageSchema>;

export const severitySchema = z.enum(["critical", "warning", "suggestion"]);
export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export const prioritySchema = z.enum(["high", "medium", "low"]);

const pct = z.number().int().min(0).max(100);

export const complexitySchema = z.object({ time: z.string(), space: z.string() });
export type Complexity = z.infer<typeof complexitySchema>;

export const bugSchema = z.object({
  id: z.string(),
  line: z.number().int().min(1),
  title: z.string(),
  explanation: z.string(),
  severity: severitySchema,
  suggestedFix: z.string(),
});

export const analysisSchema = z.object({
  id: z.string(),
  language: languageSchema,
  codeHealth: pct,
  complexity: complexitySchema,
  pattern: z.object({
    name: z.string(),
    category: z.string(),
    confidence: pct,
    description: z.string(),
  }),
  bugs: z.array(bugSchema),
  optimizationHint: z.object({
    approach: z.string(),
    summary: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  createdAt: z.string(),
});
export type Analysis = z.infer<typeof analysisSchema>;

export const optimizationCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  approach: z.string(),
  complexity: complexitySchema,
  readability: pct,
  confidence: pct,
  improvement: pct,
  rationale: z.string(),
  code: z.string(),
});
export type OptimizationCandidate = z.infer<typeof optimizationCandidateSchema>;

export const optimizationResultSchema = z.object({
  id: z.string(),
  original: z.object({ approach: z.string(), complexity: complexitySchema, code: z.string() }),
  candidates: z.array(optimizationCandidateSchema),
  recommendedId: z.string(),
  explanation: z.string(),
});
export type OptimizationResult = z.infer<typeof optimizationResultSchema>;

export const verificationResultSchema = z.object({
  candidateId: z.string(),
  passed: z.number().int().min(0),
  total: z.number().int().min(0),
  equivalent: z.boolean(),
});
export type VerificationResult = z.infer<typeof verificationResultSchema>;

export const conversionChangeSchema = z.object({
  category: z.enum(["syntax", "data-structure", "library"]),
  from: z.string(),
  to: z.string(),
  note: z.string(),
});

export const conversionResultSchema = z.object({
  id: z.string(),
  sourceLanguage: languageSchema,
  targetLanguage: languageSchema,
  code: z.string(),
  summary: z.string(),
  changes: z.array(conversionChangeSchema),
  complexity: complexitySchema,
  warnings: z.array(z.string()),
});
export type ConversionResult = z.infer<typeof conversionResultSchema>;

export const benchmarkResultSchema = z.object({
  id: z.string(),
  metrics: z.array(
    z.object({ label: z.string(), original: z.number(), optimized: z.number(), unit: z.string() }),
  ),
  executionSeries: z.array(
    z.object({
      input: z.enum(["1K", "5K", "10K", "50K", "100K"]),
      original: z.number(),
      optimized: z.number(),
    }),
  ),
  originalComplexity: complexitySchema,
  optimizedComplexity: complexitySchema,
  improvementPercent: pct,
  verification: z.object({
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
  }),
  trustScore: z.object({ correctness: pct, optimization: pct, benchmark: pct }),
  isMockData: z.literal(false),
  /** Additive (not in the original frontend type): human-readable measurement caveats. */
  notes: z.array(z.string()),
});
export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;

export const historyStatusSchema = z.enum(["analyzed", "optimized", "converted", "benchmarked"]);
export type HistoryStatus = z.infer<typeof historyStatusSchema>;

export const codeHistoryItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  language: languageSchema,
  originalComplexity: z.string(),
  optimizedComplexity: z.string(),
  date: z.string(),
  status: historyStatusSchema,
  optimizationPercent: z.number().int().min(0).max(100),
  evolution: z.array(z.object({ step: z.string(), detail: z.string() })),
});
export type CodeHistoryItem = z.infer<typeof codeHistoryItemSchema>;

export const skillLevelSchema = z.enum(["strong", "practice", "weak", "missing"]);
export type SkillLevel = z.infer<typeof skillLevelSchema>;
export const skillCategorySchema = z.enum(["language", "framework", "database", "dsa", "tooling"]);

export const skillSchema = z.object({
  name: z.string(),
  category: skillCategorySchema,
  required: pct,
  current: pct,
  level: skillLevelSchema,
});
export type Skill = z.infer<typeof skillSchema>;

export const skillGapSchema = z.object({
  strong: z.array(skillSchema),
  practice: z.array(skillSchema),
  weak: z.array(skillSchema),
  missing: z.array(skillSchema),
  recommendation: z.array(z.string()),
});
export type SkillGap = z.infer<typeof skillGapSchema>;

export const jobAnalysisSchema = z.object({
  id: z.string(),
  roleSummary: z.string(),
  seniority: z.string(),
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  databases: z.array(z.string()),
  dsaTopics: z.array(z.string()),
  interviewTopics: z.array(z.string()),
  skills: z.array(skillSchema),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

export const resumeRoadmapPhaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  weeks: z.string(),
  weekStart: z.number().int().min(1),
  weekEnd: z.number().int().min(1),
  intensity: pct,
  focus: z.array(z.string()),
  outcome: z.string(),
  actions: z.array(
    z.object({
      title: z.string(),
      instructions: z.string(),
      timebox: z.string(),
      deliverable: z.string(),
    }),
  ),
  leetcode: z.array(
    z.object({
      title: z.string(),
      difficulty: difficultySchema,
      pattern: z.string(),
      practiceGoal: z.string(),
      url: z.string().url(),
    }),
  ),
});

export const resumeMatchRoadmapSchema = z.object({
  id: z.string(),
  weeks: z.number().int().min(1).max(52),
  matchScore: pct,
  verdict: z.string(),
  radar: z.array(z.object({ skill: z.string(), resume: pct, required: pct })),
  categoryFocus: z.array(z.object({ name: z.string(), value: z.number().int().min(0).max(100) })),
  gaps: z.array(z.object({ skill: z.string(), have: pct, need: pct })),
  phases: z.array(resumeRoadmapPhaseSchema),
  quickWins: z.array(z.string()),
});
export type ResumeMatchRoadmap = z.infer<typeof resumeMatchRoadmapSchema>;

export const careerJobResultSchema = z.object({
  analysis: jobAnalysisSchema,
  skillGap: skillGapSchema,
  /** null when no usable resume text was supplied. */
  roadmap: resumeMatchRoadmapSchema.nullable(),
});
export type CareerJobResult = z.infer<typeof careerJobResultSchema>;

export const dsaProblemSchema = z.object({
  id: z.string(),
  title: z.string(),
  platform: z.string(),
  difficulty: difficultySchema,
  pattern: z.string(),
  url: z.string(),
  completed: z.boolean(),
  inRevision: z.boolean(),
});
export type DSAProblem = z.infer<typeof dsaProblemSchema>;

export const dsaTopicSchema = z.object({
  id: z.string(),
  name: z.string(),
  weekStart: z.number().int().min(1),
  weekEnd: z.number().int().min(1),
  priority: prioritySchema,
  difficulty: difficultySchema,
  progress: pct,
  pattern: z.string(),
  problems: z.array(dsaProblemSchema),
});
export type DSATopic = z.infer<typeof dsaTopicSchema>;

export const learningResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  channel: z.string(),
  topic: z.string(),
  duration: z.string(),
  url: z.string(),
});

export const dsaRoadmapSchema = z.object({
  /** Additive: needed by the completion-toggle endpoint. */
  id: z.string(),
  targetRole: z.string(),
  preparationLevel: z.string(),
  weeks: z.number().int().min(1).max(52),
  topics: z.array(dsaTopicSchema),
  resources: z.array(learningResourceSchema),
});
export type DSARoadmap = z.infer<typeof dsaRoadmapSchema>;

export const interviewQuestionSchema = z.object({
  id: z.string(),
  index: z.number().int().min(1),
  total: z.number().int().min(1),
  topic: z.string(),
  difficulty: difficultySchema,
  prompt: z.string(),
  followUp: z.string(),
});
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

export const interviewSessionSchema = z.object({
  id: z.string(),
  role: z.string(),
  startedAt: z.string(),
  questions: z.array(interviewQuestionSchema),
});
export type InterviewSession = z.infer<typeof interviewSessionSchema>;

export const interviewEvaluationSchema = z.object({
  questionId: z.string(),
  score: pct,
  feedback: z.string(),
  followUp: z.string(),
});
export type InterviewEvaluation = z.infer<typeof interviewEvaluationSchema>;

export const interviewReportSchema = z.object({
  scores: z.object({
    technicalKnowledge: pct,
    problemSolving: pct,
    communication: pct,
    codeQuality: pct,
    complexityAnalysis: pct,
  }),
  overall: pct,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
});
export type InterviewReport = z.infer<typeof interviewReportSchema>;

export const activityItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  time: z.string(),
  kind: z.enum(["analysis", "optimization", "conversion", "career", "interview"]),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const progressReportSchema = z.object({
  problemsSolved: z.number().int().min(0),
  problemsAttempted: z.number().int().min(0),
  streak: z.number().int().min(0),
  averageInterviewScore: pct,
  optimizations: z.number().int().min(0),
  bugsFixed: z.number().int().min(0),
  weeklyActivity: z.array(
    z.object({ day: z.string(), problems: z.number().int(), analyses: z.number().int() }),
  ),
  topicPerformance: z.array(z.object({ topic: z.string(), score: pct })),
  interviewPerformance: z.array(z.object({ session: z.string(), score: pct })),
  algorithmUsage: z.array(z.object({ name: z.string(), value: z.number().int() })),
  algorithmDna: z.array(z.object({ pattern: z.string(), strength: pct })),
});
export type ProgressReport = z.infer<typeof progressReportSchema>;

export const dashboardDataSchema = z.object({
  stats: z.object({
    problemsAnalyzed: z.number().int(),
    bugsDetected: z.number().int(),
    optimizationsFound: z.number().int(),
    codeConversions: z.number().int(),
    problemsSolved: z.number().int(),
    interviewScore: pct,
  }),
  activity: z.array(activityItemSchema),
  weaknessHeatmap: z.array(z.object({ topic: z.string(), score: pct })),
});
export type DashboardData = z.infer<typeof dashboardDataSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
export type PublicUser = z.infer<typeof userSchema>;
