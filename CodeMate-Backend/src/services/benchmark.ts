import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { AppError, notFound } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";
import { clamp, clampInt, fence, newId, titleFromCode, toJson } from "../lib/util.js";
import type { BenchmarkResult, Language } from "../schemas/domain.js";
import { addHistory, recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { execBenchmarkSchema } from "./ai/schemas.js";
import { VERIFY_TEST_COUNT } from "./optimization.js";

const BENCH_SYSTEM = `You benchmark two implementations by executing the requested timing and allocation-measurement script in the Python code-execution sandbox. Never invent or substitute measured values.`;

const inlineVerificationSchema = execBenchmarkSchema.shape.verification.unwrap().superRefine((value, ctx) => {
  if (value.total !== VERIFY_TEST_COUNT || value.passed > value.total) {
    ctx.addIssue({ code: "custom", message: "verification counts must be within the requested 100 cases" });
  }
});

function benchPrompt(language: Language, original: string, candidate: string, verify: boolean): string {
  const verification = verify
    ? `Also run exactly ${VERIFY_TEST_COUNT} deterministic, valid equivalence cases before timing. Seed with random.seed(1234); infer valid inputs from the original; include edge cases (empty/minimal, one item, duplicates, negatives and boundary parameters) plus varied random cases up to 200 items. Deep-copy each input before calling either implementation, and count a case as passed when return values match or both raise the same exception type. Include {"passed": number, "total": ${VERIFY_TEST_COUNT}} in the final JSON.`
    : "This candidate already has stored equivalence-test evidence. Do not repeat verification; omit the verification property.";

  return `Benchmark the OPTIMIZED implementation against the ORIGINAL.

Procedure:
1. If needed, faithfully port both implementations to Python, preserving their algorithms, entry points, and behavior.
2. Create valid deterministic inputs with random.seed(7) for sizes n = 250, 500, 1000, 2500, 5000. Label these "250", "500", "1K", "2.5K", "5K". Use the same input values for both implementations. For extra parameters such as a window size k, use min(100, max(1, n//10)).
3. Measure each implementation with time.perf_counter using identical generated inputs and a fresh deep copy for every call. Take the median of 3 samples if each sample is under 0.1 seconds; otherwise take 1 sample. Set a 0.75-second alarm for each individual call.
4. If a call exceeds its budget, extrapolate only the affected value from the largest completed measurements using their empirical growth. Mark that implementation's *_estimated flag true for every extrapolated value. Never mark measured values as estimated. Keep the script under 15 seconds.
5. At n=5000, measure each implementation's peak Python allocation with tracemalloc using fresh identical input data and reset the peak between implementations. Return these measured values in MB.
6. ${verification}

Print no prose after the final line. The LAST printed line must be exactly one JSON object with all five series entries, including both estimated flags, the peak_memory_mb pair, notes, and (when requested) verification:
{"series":[{"input":"250","original_ms":0.0,"optimized_ms":0.0,"original_estimated":false,"optimized_estimated":false},{"input":"500","original_ms":0.0,"optimized_ms":0.0,"original_estimated":false,"optimized_estimated":false},{"input":"1K","original_ms":0.0,"optimized_ms":0.0,"original_estimated":false,"optimized_estimated":false},{"input":"2.5K","original_ms":0.0,"optimized_ms":0.0,"original_estimated":false,"optimized_estimated":false},{"input":"5K","original_ms":0.0,"optimized_ms":0.0,"original_estimated":false,"optimized_estimated":false}],"peak_memory_mb":{"original":0.0,"optimized":0.0},"notes":[]${verify ? `,"verification":{"passed":0,"total":${VERIFY_TEST_COUNT}}` : ""}}

Original language: ${language}
${fence("original_code", original, `language="${language}"`)}
${fence("optimized_code", candidate, `language="${language}"`)}`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface BenchmarkProgress {
  stage: "preparing" | "measuring" | "saving";
  message: string;
}

export interface BenchmarkRunOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BenchmarkProgress) => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError(409, "AI_CANCELLED", "The benchmark was cancelled.");
}

export async function runBenchmark(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { candidateId?: string | undefined },
  options: BenchmarkRunOptions = {},
): Promise<BenchmarkResult> {
  type CandidateWithOpt = Prisma.OptimizationCandidateGetPayload<{ include: { optimization: true } }>;
  let candidate: CandidateWithOpt | null;
  options.onProgress?.({ stage: "preparing", message: "Loading the selected optimized candidate." });
  throwIfAborted(options.signal);

  if (input.candidateId) {
    candidate = await deps.db.optimizationCandidate.findFirst({
      where: { id: input.candidateId, optimization: { userId } },
      include: { optimization: true },
    });
    if (!candidate) throw notFound("Candidate not found.");
  } else {
    const latest = await deps.db.optimization.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    if (!latest) {
      throw new AppError(409, "NO_OPTIMIZATION", "Run the optimizer first, then benchmark one of its candidates.");
    }
    candidate = await deps.db.optimizationCandidate.findFirst({
      where: { id: latest.recommendedId, optimizationId: latest.id },
      include: { optimization: true },
    });
    if (!candidate) throw notFound("Recommended candidate not found.");
  }
  throwIfAborted(options.signal);

  const opt = candidate.optimization;
  const needsVerification = candidate.verifiedPassed === null || candidate.verifiedTotal === null;
  const benchmarkSchema = needsVerification
    ? execBenchmarkSchema.extend({ verification: inlineVerificationSchema })
    : execBenchmarkSchema;

  options.onProgress?.({
    stage: "measuring",
    message: needsVerification
      ? "Verifying and measuring both implementations in one sandbox run."
      : "Measuring both implementations in the sandbox.",
  });

  const measured = await deps.ai.runCodeJson({
    userId,
    feature: "benchmark",
    system: BENCH_SYSTEM,
    prompt: benchPrompt(opt.language as Language, opt.code, candidate.code, needsVerification),
    schema: benchmarkSchema,
    maxOutputTokens: 8192,
    signal: options.signal,
  });
  throwIfAborted(options.signal);

  let passed = candidate.verifiedPassed;
  let total = candidate.verifiedTotal;
  if (needsVerification) {
    const verification = measured.verification;
    if (!verification || verification.total !== VERIFY_TEST_COUNT || verification.passed > verification.total) {
      throw new AppError(502, "AI_BAD_RESPONSE", "Benchmark did not return valid equivalence-test results.");
    }
    passed = verification.passed;
    total = verification.total;
  }
  if (passed === null || total === null) {
    throw new AppError(502, "AI_BAD_RESPONSE", "Benchmark is missing equivalence-test results.");
  }

  const series = measured.series.map((point) => ({
    input: point.input,
    original: round2(point.original_ms),
    optimized: round2(point.optimized_ms),
    originalEstimated: point.original_estimated,
    optimizedEstimated: point.optimized_estimated,
  }));
  const largest = measured.series[measured.series.length - 1];
  if (!largest) throw new AppError(502, "AI_BAD_RESPONSE", "Benchmark returned no data.");

  const rawPerformanceChange =
    largest.original_ms > 0
      ? ((largest.original_ms - largest.optimized_ms) / largest.original_ms) * 100
      : null;
  const performanceChangePercent =
    rawPerformanceChange === null ? null : round2(rawPerformanceChange);
  const improvementPercent = clampInt(rawPerformanceChange ?? 0, 0, 100);
  const estimatedCount = measured.series.filter((point) => point.original_estimated || point.optimized_estimated).length;
  const notes = [
    "Timings compare faithful Python ports executed in a shared sandbox; they are not absolute native-language runtimes.",
    "Peak memory is Python tracemalloc allocation, not total process RSS.",
    ...(performanceChangePercent === null
      ? ["Relative runtime change is unavailable because the original measured at 0 ms."]
      : []),
    ...(estimatedCount > 0
      ? [`${estimatedCount} input-size point${estimatedCount === 1 ? " was" : "s were"} extrapolated because a measurement exceeded its time budget.`]
      : []),
    ...measured.notes,
  ];

  const original = (opt.original ?? {}) as { complexity?: { time: string; space: string } };
  const result: BenchmarkResult = {
    id: newId("bench"),
    metrics: [
      { label: "Execution Time", original: round2(largest.original_ms), optimized: round2(largest.optimized_ms), unit: "ms" },
      {
        label: "Memory Usage",
        original: round2(measured.peak_memory_mb.original),
        optimized: round2(measured.peak_memory_mb.optimized),
        unit: "MB",
      },
    ],
    candidate: { approach: candidate.approach, language: opt.language as Language },
    executionSeries: series,
    originalComplexity: original.complexity ?? { time: "—", space: "—" },
    optimizedComplexity: { time: candidate.timeComplexity, space: candidate.spaceComplexity },
    improvementPercent,
    performanceChangePercent,
    verification: { total, passed, failed: Math.max(0, total - passed) },
    trustScore: {
      correctness: total > 0 ? clampInt((passed / total) * 100, 0, 100) : 0,
      optimization: clampInt(0.5 * (performanceChangePercent ?? 0) + 0.5 * candidate.confidence, 0, 100),
      benchmark: clampInt(100 - 12 * estimatedCount, 40, 100),
    },
    isMockData: false,
    notes,
  };

  options.onProgress?.({ stage: "saving", message: "Saving measured results and verification evidence." });
  throwIfAborted(options.signal);
  await deps.db.benchmark.create({
    data: {
      id: result.id,
      userId,
      optimizationId: opt.id,
      candidateId: candidate.id,
      result: toJson(result),
    },
  });

  if (needsVerification) {
    await deps.db.optimizationCandidate.update({
      where: { id: candidate.id },
      data: { verifiedPassed: passed, verifiedTotal: total, verifiedAt: new Date() },
    });
    await recordActivity(deps.db, userId, {
      kind: "VERIFICATION",
      topic: candidate.approach,
      score: Math.round((passed / total) * 100),
      meta: {
        label: "Verified optimization",
        detail: `${passed}/${total} tests matched the original (${candidate.approach})`,
        candidateId: candidate.id,
      },
    });
  }

  const title = titleFromCode(opt.code, "Benchmark");
  const performanceDetail =
    performanceChangePercent === null
      ? "relative runtime change unavailable because the original measured at 0 ms"
      : performanceChangePercent > 0
        ? `${performanceChangePercent}% faster at 5K inputs`
        : performanceChangePercent < 0
          ? `${Math.abs(performanceChangePercent)}% slower at 5K inputs`
          : "no measurable runtime difference at reported precision at 5K inputs";
  await addHistory(deps.db, userId, {
    title,
    language: opt.language as Language,
    status: "benchmarked",
    originalComplexity: result.originalComplexity.time,
    optimizedComplexity: result.optimizedComplexity.time,
    optimizationPercent: improvementPercent,
    evolution: [
      { step: "Benchmarked", detail: `${candidate.approach}: ${performanceDetail}` },
      { step: "Verified", detail: `${passed}/${total} equivalence tests passed` },
    ],
    snippet: opt.code,
  });

  await recordActivity(deps.db, userId, {
    kind: "BENCHMARK",
    topic: candidate.approach,
    score: clamp(improvementPercent, 0, 100),
    meta: {
      label: `Benchmarked ${title}`,
      detail: `${candidate.approach}: ${performanceDetail}`,
      benchmarkId: result.id,
    },
  });

  return result;
}
