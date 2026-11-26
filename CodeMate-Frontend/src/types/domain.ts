/**
 * CodeMate AI domain models.
 * These types are the contract between the UI and the CodeMate API service layer.
 */

export type Language = "python" | "java" | "c" | "cpp" | "javascript" | "typescript";

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
];

export type Severity = "critical" | "warning" | "suggestion";

export interface Bug {
  id: string;
  line: number;
  title: string;
  explanation: string;
  severity: Severity;
  suggestedFix: string;
}

export interface AlgorithmPattern {
  name: string;
  category: string;
  confidence: number;
  description: string;
}

export interface Complexity {
  time: string;
  space: string;
}

export interface Analysis {
  id: string;
  language: Language;
  codeHealth: number;
  complexity: Complexity;
  pattern: AlgorithmPattern;
  bugs: Bug[];
  optimizationHint: {
    approach: string;
    summary: string;
    from: string;
    to: string;
  };
  createdAt: string;
}

export interface OptimizationCandidate {
  id: string;
  name: string;
  approach: string;
  complexity: Complexity;
  readability: number;
  confidence: number;
  improvement: number;
  rationale: string;
  code: string;
}

export interface OptimizationResult {
  id: string;
  language: Language;
  original: {
    approach: string;
    complexity: Complexity;
    code: string;
  };
  candidates: OptimizationCandidate[];
  recommendedId: string;
  explanation: string;
}

export interface ConversionChange {
  category: "syntax" | "data-structure" | "library";
  from: string;
  to: string;
  note: string;
}

export interface ConversionResult {
  id: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  code: string;
  summary: string;
  changes: ConversionChange[];
  complexity: Complexity;
  warnings: string[];
}

export interface BenchmarkMetric {
  label: string;
  original: number;
  optimized: number;
  unit: string;
}

export interface BenchmarkResult {
  id: string;
  metrics: BenchmarkMetric[];
  candidate: { approach: string; language: Language };
  executionSeries: {
    input: string;
    original: number;
    optimized: number;
    originalEstimated: boolean;
    optimizedEstimated: boolean;
  }[];
  originalComplexity: Complexity;
  optimizedComplexity: Complexity;
  improvementPercent: number;
  performanceChangePercent: number | null;
  verification: { total: number; passed: number; failed: number };
  trustScore: { correctness: number; optimization: number; benchmark: number };
  isMockData: boolean;
  notes?: string[];
}

export type HistoryStatus = "analyzed" | "optimized" | "converted" | "benchmarked";

export interface CodeHistoryItem {
  id: string;
  title: string;
  language: Language;
  originalComplexity: string;
  optimizedComplexity: string;
  date: string;
  status: HistoryStatus;
  optimizationPercent: number;
  evolution: { step: string; detail: string }[];
}

export type SkillLevel = "strong" | "practice" | "weak" | "missing";

export interface Skill {
  name: string;
  category: "language" | "framework" | "database" | "dsa" | "tooling";
  required: number;
  current: number;
  level: SkillLevel;
}

export interface SkillGap {
  strong: Skill[];
  practice: Skill[];
  weak: Skill[];
  missing: Skill[];
  recommendation: string[];
}

export interface JobAnalysis {
  id: string;
  roleSummary: string;
  seniority: string;
  languages: string[];
  frameworks: string[];
  databases: string[];
  dsaTopics: string[];
  interviewTopics: string[];
  skills: Skill[];
}

export interface CareerJobResult {
  analysis: JobAnalysis;
  skillGap: SkillGap;
  roadmap: ResumeMatchRoadmap | null;
}

export type Priority = "high" | "medium" | "low";
export type Difficulty = "easy" | "medium" | "hard";
export const CODING_PLATFORMS = [
  "LeetCode",
  "GeeksforGeeks",
  "Codeforces",
  "HackerRank",
  "CodeChef",
  "AtCoder",
  "InterviewBit",
  "CSES Problem Set",
  "HackerEarth",
  "SPOJ",
  "NeetCode",
] as const;
export type CodingPlatform = (typeof CODING_PLATFORMS)[number] | "Other";
export type ProblemLinkType = "direct" | "search";

export interface PracticeProblem {
  title: string;
  platform: CodingPlatform;
  difficulty: Difficulty;
  topic: string;
  pattern: string;
  practiceGoal: string;
  url: string;
  linkType: ProblemLinkType;
  estimatedMinutes?: number;
}

export interface DSAProblem {
  id: string;
  title: string;
  platform: CodingPlatform;
  difficulty: Difficulty;
  topic: string;
  pattern: string;
  practiceGoal: string;
  estimatedMinutes?: number;
  url: string;
  linkType: ProblemLinkType;
  completed: boolean;
  inRevision: boolean;
}

export type RoadmapDurationUnit = "days" | "weeks" | "months";

export interface DSAPreparationTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  deliverable?: string;
  completed: boolean;
}

export interface DSATopic {
  id: string;
  name: string;
  description: string;
  keyTopics: string[];
  tasks: DSAPreparationTask[];
  weekStart: number;
  weekEnd: number;
  durationLabel: string;
  estimatedMinutes: number;
  priority: Priority;
  difficulty: Difficulty;
  progress: number;
  pattern: string;
  problems: DSAProblem[];
}

export interface LearningResource {
  id: string;
  title: string;
  channel: string;
  topic: string;
  duration: string;
  url: string;
}

export interface DSARoadmap {
  id: string;
  targetRole: string;
  preparationLevel: string;
  weeks: number;
  durationValue: number;
  durationUnit: RoadmapDurationUnit;
  durationDays: number;
  topics: DSATopic[];
  resources: LearningResource[];
}

export interface InterviewQuestion {
  id: string;
  index: number;
  total: number;
  topic: string;
  difficulty: Difficulty;
  prompt: string;
  followUp: string;
}

export interface InterviewEvaluation {
  questionId: string;
  score: number;
  feedback: string;
  followUp: string;
}

export interface InterviewReport {
  scores: {
    technicalKnowledge: number;
    problemSolving: number;
    communication: number;
    codeQuality: number;
    complexityAnalysis: number;
  };
  overall: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export type LiveInterviewDomain =
  "AI/ML" | "DSA" | "Python" | "Java" | "C++" | "Backend" | "General Software Engineering";
export type LiveInterviewDifficulty = "Beginner" | "Intermediate" | "Advanced";
export type LiveInterviewDuration = 15 | 30 | 45;

export interface LiveInterviewReport {
  overall: number;
  scores: {
    technicalKnowledge: number;
    problemSolving: number;
    communication: number;
  };
  strengths: string[];
  areasToImprove: string[];
  questionsAsked: string[];
  responseFeedback: {
    question: string;
    answer: string;
    score: number;
    feedback: string;
  }[];
  suggestedTopics: string[];
}

export interface InterviewSession {
  id: string;
  role: string;
  startedAt: string;
  questions: InterviewQuestion[];
}

export interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  time: string;
  kind: "analysis" | "optimization" | "conversion" | "career" | "interview";
}

export interface ProgressReport {
  range: "7d" | "30d" | "90d" | "all";
  problemsSolved: number;
  problemsAttempted: number;
  streak: number;
  interviewsCompleted: number;
  averageInterviewScore: number;
  optimizations: number;
  bugsFixed: number;
  activityGranularity: "day" | "month";
  activityHistory: {
    date: string;
    problems: number;
    analyses: number;
    optimizations: number;
    interviews: number;
  }[];
  weeklyActivity: { day: string; problems: number; analyses: number }[];
  topicPerformance: { topic: string; score: number; evidence: number }[];
  interviewPerformance: { session: string; detail: string; date: string; score: number }[];
  algorithmUsage: { name: string; value: number }[];
  algorithmDna: { pattern: string; strength: number | null; sampleCount: number }[];
}

export interface DashboardStats {
  problemsAnalyzed: number;
  bugsDetected: number;
  optimizationsFound: number;
  codeConversions: number;
  problemsSolved: number;
  interviewScore: number;
}

export interface DashboardData {
  stats: DashboardStats;
  activity: ActivityItem[];
  weaknessHeatmap: { topic: string; score: number }[];
}

export interface ResumeRoadmapPhase {
  id: string;
  title: string;
  weeks: string;
  weekStart: number;
  weekEnd: number;
  intensity: number;
  focus: string[];
  outcome: string;
  actions: {
    title: string;
    instructions: string;
    timebox: string;
    deliverable: string;
  }[];
  problems?: PracticeProblem[];
  leetcode?: {
    title: string;
    difficulty: Difficulty;
    pattern: string;
    practiceGoal: string;
    url: string;
  }[];
}

export interface ResumeMatchRoadmap {
  id: string;
  weeks: number;
  matchScore: number;
  verdict: string;
  radar: { skill: string; resume: number; required: number }[];
  categoryFocus: { name: string; value: number }[];
  gaps: { skill: string; have: number; need: number }[];
  phases: ResumeRoadmapPhase[];
  quickWins: string[];
}
