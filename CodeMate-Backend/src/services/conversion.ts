import type { Db } from "../lib/prisma.js";
import { fence, newId, titleFromCode, toJson } from "../lib/util.js";
import type { ConversionResult, Language } from "../schemas/domain.js";
import { addHistory, recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { aiConversionSchema } from "./ai/schemas.js";

const LANGUAGE_LABEL: Record<Language, string> = {
  python: "Python 3",
  java: "Java 17",
  c: "C (C11)",
  cpp: "C++17",
  javascript: "JavaScript (ES2022)",
  typescript: "TypeScript (strict)",
};

const SYSTEM = `You are an expert polyglot engineer who translates code between programming languages idiomatically and faithfully.
Rules:
- Output complete, compilable/runnable target code (include needed imports/includes and a wrapper class where the language requires one).
- Format the code as normal source code that a developer would commit: use actual newline characters, consistent 4-space indentation, and separate logical statements onto separate lines. Put braces and control-flow bodies on readable lines. Never return minified or single-line code.
- Preserve behaviour exactly unless asked to optimize. When optimizing, improve the algorithmic complexity while preserving the observable results, and say what changed in the summary.
- "changes" lists the notable translation decisions (syntax, data-structure, library) with concrete from/to values from THIS code, not generic text.
- "warnings" lists real semantic risks of this specific translation (integer overflow, mutability, null handling, undefined behaviour, library differences). Empty array if none.
- "sourceComplexity" is the Big-O of the input program; "complexity" is the Big-O of the produced program.`;

export async function convertCode(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { code: string; sourceLanguage: Language; targetLanguage: Language; optimizeWhileConverting: boolean },
): Promise<ConversionResult> {
  const ai = await deps.ai.generateJson({
    userId,
    feature: "conversion",
    system: SYSTEM,
    prompt: `Convert from ${LANGUAGE_LABEL[input.sourceLanguage]} to ${LANGUAGE_LABEL[input.targetLanguage]}.\nOptimize while converting: ${input.optimizeWhileConverting ? "YES — improve complexity where possible" : "NO — translate faithfully, keep the same algorithm"}\nThe returned "code" field must contain human-readable, conventionally formatted source code with real line breaks and indentation; do not put the entire program on one line.\n\n${fence("user_code", input.code, `language="${input.sourceLanguage}"`)}`,
    schema: aiConversionSchema,
    maxOutputTokens: 12288,
    temperature: 0.1,
  });

  const result: ConversionResult = {
    id: newId("conv"),
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    code: ai.code,
    summary: ai.summary,
    changes: ai.changes,
    complexity: ai.complexity,
    warnings: ai.warnings,
  };

  await deps.db.conversion.create({
    data: {
      id: result.id,
      userId,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      optimize: input.optimizeWhileConverting,
      sourceCode: input.code,
      result: toJson(result),
    },
  });

  const title = titleFromCode(input.code, "Code conversion");
  await addHistory(deps.db, userId, {
    title,
    language: input.targetLanguage,
    status: "converted",
    originalComplexity: ai.sourceComplexity.time,
    optimizedComplexity: ai.complexity.time,
    optimizationPercent: 0,
    evolution: [
      { step: "Source", detail: LANGUAGE_LABEL[input.sourceLanguage] },
      { step: "Converted", detail: `${LANGUAGE_LABEL[input.targetLanguage]}${input.optimizeWhileConverting ? " (optimized)" : ""}` },
    ],
    snippet: input.code,
  });

  await recordActivity(deps.db, userId, {
    kind: "CONVERSION",
    topic: `${input.sourceLanguage}→${input.targetLanguage}`,
    meta: {
      label: `Converted ${title}`,
      detail: `${LANGUAGE_LABEL[input.sourceLanguage]} → ${LANGUAGE_LABEL[input.targetLanguage]}`,
      conversionId: result.id,
    },
  });

  return result;
}
