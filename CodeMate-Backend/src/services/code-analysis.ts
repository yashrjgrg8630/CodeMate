import type { Db } from "../lib/prisma.js";
import { clampInt, fence, newId, titleFromCode, toJson } from "../lib/util.js";
import type { Analysis, Language } from "../schemas/domain.js";
import { addHistory, recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { aiAnalysisSchema } from "./ai/schemas.js";
import { sha256 } from "../lib/util.js";

export function numberLines(code: string): string {
  const lines = code.split("\n");
  const width = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(width, " ")}| ${l}`).join("\n");
}

const SYSTEM = `You are a meticulous senior code reviewer and algorithms expert.
Analyze the submitted code and report: real bugs and risks (correctness first, then robustness, then performance/style), an honest code-health score, time and space complexity of the dominant algorithm, and the algorithmic pattern used.
Rules:
- "line" must refer to the 1-based line numbers shown in the numbered listing, and point at the offending line.
- Only report issues that actually exist in the code. Do not pad the list; an empty bugs array is valid for clean code.
- severity: "critical" = wrong results/crash/security flaw or asymptotic inefficiency that breaks practical use; "warning" = edge-case or robustness defect; "suggestion" = style/minor improvement.
- codeHealth: 90+ only for correct, clean, efficient code; subtract for each defect by severity.
- Complexities use Big-O (e.g. O(n log n)). "optimizationHint" describes the best realistic improvement; if already optimal, set from and to equal and say so in the summary.
- Write suggestedFix as a concrete instruction (short code snippet allowed in prose).`;

export async function analyzeCode(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { code: string; language: Language },
): Promise<Analysis> {
  const lineCount = input.code.split("\n").length;
  const ai = await deps.ai.generateJson({
    userId,
    feature: "analysis",
    system: SYSTEM,
    prompt: `Language: ${input.language}\n\n${fence("user_code", numberLines(input.code), `language="${input.language}"`)}`,
    schema: aiAnalysisSchema,
    maxOutputTokens: 8192,
  });

  const analysis: Analysis = {
    id: newId("analysis"),
    language: input.language,
    codeHealth: clampInt(ai.codeHealth, 0, 100),
    complexity: ai.complexity,
    pattern: { ...ai.pattern, confidence: clampInt(ai.pattern.confidence, 0, 100) },
    bugs: ai.bugs.map((b, i) => ({
      id: `bug_${i + 1}`,
      line: clampInt(b.line, 1, lineCount),
      title: b.title,
      explanation: b.explanation,
      severity: b.severity,
      suggestedFix: b.suggestedFix,
    })),
    optimizationHint: ai.optimizationHint,
    createdAt: new Date().toISOString(),
  };

  await deps.db.analysis.create({
    data: {
      id: analysis.id,
      userId,
      language: input.language,
      code: input.code,
      result: toJson(analysis),
    },
  });

  const title = titleFromCode(input.code, "Code analysis");
  await addHistory(deps.db, userId, {
    title,
    language: input.language,
    status: "analyzed",
    originalComplexity: analysis.complexity.time,
    optimizedComplexity: analysis.optimizationHint.to,
    optimizationPercent: 0,
    evolution: [
      { step: "Analyzed", detail: `${analysis.pattern.name} · ${analysis.complexity.time} time · health ${analysis.codeHealth}/100` },
      ...(analysis.bugs.length
        ? [{ step: "Issues found", detail: `${analysis.bugs.length} issue${analysis.bugs.length === 1 ? "" : "s"} detected` }]
        : []),
    ],
    snippet: input.code,
  });

  await recordActivity(deps.db, userId, {
    kind: "ANALYSIS",
    topic: analysis.pattern.category,
    score: analysis.codeHealth,
    meta: {
      label: `Analyzed ${title}`,
      detail: `${analysis.pattern.name} · ${analysis.bugs.length} issue${analysis.bugs.length === 1 ? "" : "s"}`,
      analysisId: analysis.id,
      codeHash: sha256(input.code),
      patternName: analysis.pattern.name,
      patternCategory: analysis.pattern.category,
      bugCount: analysis.bugs.filter((b) => b.severity !== "suggestion").length,
      totalBugs: analysis.bugs.length,
    },
  });

  return analysis;
}
