import { z } from "zod";
import { AppError, notFound } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";
import { clampInt, fence, newId, sha256, titleFromCode } from "../lib/util.js";
import type { Language, OptimizationResult, VerificationResult } from "../schemas/domain.js";
import { addHistory, recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { aiOptimizationSchema, execVerificationSchema } from "./ai/schemas.js";
import { numberLines } from "./code-analysis.js";

export const VERIFY_TEST_COUNT = 100;

const OPTIMIZE_SYSTEM = `You are a performance-engineering expert who rewrites code for better time/space complexity without changing behaviour.
Produce 3 or 4 genuinely different candidate implementations (different algorithmic approaches, e.g. sliding window vs prefix sums vs two pointers vs dynamic programming vs hashing) of the user's code.
Rules:
- Every candidate must be complete and runnable code in the SAME language as the input, with the same function name and signature as the original, and must preserve the original's observable behaviour on valid inputs (including return values for edge cases the original handles).
- If the original has an obvious bug that makes its behaviour ill-defined, keep behaviour consistent with the clearly intended semantics and mention it in the rationale.
- Report honest Big-O complexity for each candidate and for the original. "improvement" is the estimated runtime improvement versus the original on large inputs (0 when not faster). "readability" scores how maintainable the code is.
- "confidence" is your confidence in behavioural equivalence.
- recommendedIndex points at the best overall trade-off (speed, memory, readability, equivalence risk).
- The explanation justifies the recommendation in 2-4 sentences.`;

export async function optimizeCode(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { code: string; language: Language },
): Promise<OptimizationResult> {
  const ai = await deps.ai.generateJson({
    userId,
    feature: "optimization",
    system: OPTIMIZE_SYSTEM,
    prompt: `Language: ${input.language}\n\n${fence("user_code", numberLines(input.code), `language="${input.language}"`)}\n\nThe listing above has line-number prefixes ("  1| "); they are NOT part of the code. Do not include them in candidate code.`,
    schema: aiOptimizationSchema,
    maxOutputTokens: 16384,
    temperature: 0.3,
  });

  const optimizationId = newId("opt");
  const candidates = ai.candidates.map((c, i) => ({
    id: newId("cand"),
    name: `Candidate ${i + 1}`,
    approach: c.approach,
    complexity: c.complexity,
    readability: clampInt(c.readability, 0, 100),
    confidence: clampInt(c.confidence, 0, 100),
    improvement: clampInt(c.improvement, 0, 100),
    rationale: c.rationale,
    code: c.code,
  }));

  const recommended = candidates[ai.recommendedIndex] ?? [...candidates].sort((a, b) => b.improvement - a.improvement)[0];
  if (!recommended) throw new AppError(502, "AI_BAD_RESPONSE", "The AI service returned no candidates.");

  const result: OptimizationResult = {
    id: optimizationId,
    original: { approach: ai.original.approach, complexity: ai.original.complexity, code: input.code },
    candidates,
    recommendedId: recommended.id,
    explanation: ai.explanation,
  };

  await deps.db.optimization.create({
    data: {
      id: optimizationId,
      userId,
      language: input.language,
      code: input.code,
      original: { approach: ai.original.approach, complexity: ai.original.complexity },
      recommendedId: recommended.id,
      explanation: ai.explanation,
      candidates: {
        create: candidates.map((c, position) => ({
          id: c.id,
          position,
          name: c.name,
          approach: c.approach,
          timeComplexity: c.complexity.time,
          spaceComplexity: c.complexity.space,
          readability: c.readability,
          confidence: c.confidence,
          improvement: c.improvement,
          rationale: c.rationale,
          code: c.code,
        })),
      },
    },
  });

  const title = titleFromCode(input.code, "Optimization");
  await addHistory(deps.db, userId, {
    title,
    language: input.language,
    status: "optimized",
    originalComplexity: ai.original.complexity.time,
    optimizedComplexity: recommended.complexity.time,
    optimizationPercent: recommended.improvement,
    evolution: [
      { step: "Original", detail: `${ai.original.approach} · ${ai.original.complexity.time}` },
      { step: "Optimized", detail: `${recommended.approach} · ${recommended.complexity.time}` },
    ],
    snippet: input.code,
  });

  await recordActivity(deps.db, userId, {
    kind: "OPTIMIZATION",
    topic: recommended.approach,
    score: recommended.improvement,
    meta: {
      label: `Optimized ${title}`,
      detail: `${ai.original.complexity.time} → ${recommended.complexity.time} via ${recommended.approach}`,
      optimizationId,
      codeHash: sha256(input.code),
    },
  });

  return result;
}

const VERIFY_SYSTEM = `You verify behavioural equivalence of two implementations by ACTUALLY EXECUTING code in the Python code-execution sandbox. You never guess results: the numbers you report must come from a script you ran.`;

function verifyPrompt(language: Language, original: string, candidate: string): string {
  return `Check whether the CANDIDATE implementation is behaviourally equivalent to the ORIGINAL on ${VERIFY_TEST_COUNT} generated test cases.

Procedure:
1. If the code is not Python, port both implementations faithfully to Python (same algorithm, same edge-case behaviour, same function entry point). Do not "fix" or alter semantics while porting.
2. Infer the entry-point function and its valid input domain from the ORIGINAL.
3. Seed the RNG (random.seed(1234)) and generate exactly ${VERIFY_TEST_COUNT} test inputs: include edge cases (empty/minimal inputs, single elements, duplicates, negative values, boundary parameters) plus random cases of varied size. Only use inputs that respect the original's preconditions.
4. For each input, deep-copy it before each call (implementations may mutate arguments). Count a test as passed when both return equal values, or both raise the same exception type.
5. Run the script. Its LAST printed line must be exactly one JSON object: {"passed": <int>, "total": ${VERIFY_TEST_COUNT}}
Print nothing after that line.

Original language: ${language}
${fence("original_code", original, `language="${language}"`)}
${fence("candidate_code", candidate, `language="${language}"`)}`;
}

export async function verifyCandidate(
  deps: { db: Db; ai: AIService },
  userId: string,
  candidateId: string,
): Promise<VerificationResult> {
  const candidate = await deps.db.optimizationCandidate.findFirst({
    where: { id: candidateId, optimization: { userId } },
    include: { optimization: true },
  });
  if (!candidate) throw notFound("Candidate not found.");

  const schema = execVerificationSchema.refine((v) => v.total === VERIFY_TEST_COUNT && v.passed <= v.total, {
    message: `total must be ${VERIFY_TEST_COUNT}`,
  });
  const out = await deps.ai.runCodeJson({
    userId,
    feature: "verification",
    system: VERIFY_SYSTEM,
    prompt: verifyPrompt(candidate.optimization.language as Language, candidate.optimization.code, candidate.code),
    schema: z.unknown().pipe(schema),
    maxOutputTokens: 16384,
  });

  await deps.db.optimizationCandidate.update({
    where: { id: candidate.id },
    data: { verifiedPassed: out.passed, verifiedTotal: out.total, verifiedAt: new Date() },
  });

  await recordActivity(deps.db, userId, {
    kind: "VERIFICATION",
    topic: candidate.approach,
    score: Math.round((out.passed / out.total) * 100),
    meta: {
      label: "Verified optimization",
      detail: `${out.passed}/${out.total} tests matched the original (${candidate.approach})`,
      candidateId: candidate.id,
    },
  });

  return { candidateId: candidate.id, passed: out.passed, total: out.total, equivalent: out.passed === out.total };
}
