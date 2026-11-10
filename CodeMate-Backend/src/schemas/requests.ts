import { z } from "zod";
import { historyStatusSchema, languageSchema } from "./domain.js";

export const MAX_CODE_CHARS = 50_000;
export const MAX_TEXT_CHARS = 30_000;

const code = z.string().trim().min(1, "Code is required.").max(MAX_CODE_CHARS, `Code must be at most ${MAX_CODE_CHARS} characters.`);

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 bytes.");

const emailSchema = z.string().trim().toLowerCase().email("A valid email is required.").max(254);

export const signupBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, "Name is required.").max(80),
});
export const loginBody = z.object({
  email: emailSchema,
  // Do not enforce policy on login: only presence + the bcrypt byte cap.
  password: z.string().min(1).max(200),
});

export const analysisBody = z.object({ code, language: languageSchema });
export const optimizationBody = z.object({ code, language: languageSchema });
export const verifyBody = z.object({ candidateId: z.string().min(1).max(100) });
export const conversionBody = z
  .object({
    code,
    sourceLanguage: languageSchema,
    targetLanguage: languageSchema,
    optimizeWhileConverting: z.boolean().default(false),
  })
  .refine((v) => v.sourceLanguage !== v.targetLanguage, {
    message: "Source and target language must differ.",
    path: ["targetLanguage"],
  });
export const benchmarkBody = z.object({ candidateId: z.string().min(1).max(100).optional() });

export const historyCreateBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    language: languageSchema,
    status: historyStatusSchema.optional(),
    /** Alias accepted from the written spec. */
    type: historyStatusSchema.optional(),
    snippet: z.string().max(MAX_CODE_CHARS).optional(),
    originalComplexity: z.string().max(60).default("—"),
    optimizedComplexity: z.string().max(60).default("—"),
    optimizationPercent: z.number().int().min(0).max(100).default(0),
    evolution: z
      .array(z.object({ step: z.string().max(120), detail: z.string().max(500) }))
      .max(20)
      .default([]),
  })
  .refine((v) => v.status ?? v.type, { message: "status (or type) is required.", path: ["status"] });

export const careerJobBody = z.object({
  jobDescription: z.string().trim().min(20, "Job description is too short.").max(MAX_TEXT_CHARS),
  resumeText: z.string().trim().max(MAX_TEXT_CHARS).optional(),
  weeks: z.number().int().min(1).max(52).default(10),
});

export const interviewStartBody = z.object({
  role: z.string().trim().min(2).max(100).default("Software Engineer"),
});
export const interviewEvaluateBody = z.object({
  questionId: z.string().min(1).max(100),
  answer: z.string().trim().min(1, "Answer is required.").max(MAX_TEXT_CHARS),
  code: z.string().max(MAX_CODE_CHARS).default(""),
});
export const interviewReportBody = z.object({
  scores: z.array(z.number().min(0).max(100)).min(1).max(30),
  sessionId: z.string().min(1).max(100).optional(),
});

export const roadmapBody = z
  .object({
    targetRole: z.string().trim().min(2).max(100).default("Software Engineer"),
    currentLevel: z.string().trim().min(2).max(60).optional(),
    /** Alias used by the current frontend service signature. */
    preparationLevel: z.string().trim().min(2).max(60).optional(),
    weeks: z.number().int().min(1).max(52).default(8),
  })
  .transform((v) => ({
    targetRole: v.targetRole,
    currentLevel: v.currentLevel ?? v.preparationLevel ?? "Intermediate",
    weeks: v.weeks,
  }));
export const roadmapProblemPatch = z
  .object({ completed: z.boolean().optional(), inRevision: z.boolean().optional() })
  .refine((v) => v.completed !== undefined || v.inRevision !== undefined, {
    message: "Provide completed and/or inRevision.",
  });

export const tzQuery = z.object({
  tz: z
    .string()
    .max(64)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Unknown IANA time zone.")
    .optional(),
});
