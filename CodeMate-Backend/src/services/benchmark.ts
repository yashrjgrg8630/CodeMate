import type { Prisma } from "@prisma/client";
import { AppError, notFound } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";
import { clamp, clampInt, fence, newId, titleFromCode, toJson } from "../lib/util.js";
import type { BenchmarkResult, Language } from "../schemas/domain.js";
import { addHistory, recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { execBenchmarkSchema } from "./ai/schemas.js";
import { verifyCandidate } from "./optimization.js";

const BENCH_SYSTEM = `You benchmark two implementations by ACTUALLY EXECUTING a timing script in the Python code-execution sandbox. Every number you report must be printed by a script you ran; never estimate from theory except where the procedure below explicitly says to extrapolate.`;

function benchPrompt(language: Language, original: string, candidate: string): string {
  return `Benchmark the OPTIMIZED implementation against the ORIGINAL.

Procedure:
1. If the code is not Python, port both implementations faithfully to Python (same algorithm, same entry-point name). Do not change algorithms while porting.
2. Infer the input shape from the ORIGINAL and write a deterministic generator (random.seed(7)) that builds a valid input of size n. Use n = 1000, 5000, 10000, 50000, 100000 labelled "1K","5K","10K","50K","100K". For extra parameters (like a window size k) choose a sensible fixed rule such as min(100, n//10).
3. Time with time.perf_counter. Take the best of 3 runs for sizes where a run takes < 0.2 s, otherwise a single run. Deep-copy inputs before each call.
4. Enforce a hard budget of 1.5 s per single measurement using signal.setitimer(ITIMER_REAL) raising an exception. If an implementation exceeds the budget at some size, do NOT report the timeout: extrapolate that point from the two largest completed sizes using the empirical growth exponent (log-log slope) and set the matching *_estimated flag to true. Keep the whole script under 25 seconds.
5. Measure peak memory (MB) for each implementation separately at the largest size that completed for both, using tracemalloc (reset between runs).
6. The LAST printed line must be exactly one JSON object:
{"series":[{"input":"1K","original_ms":0.0,"optimized_ms":0.0,"original_estimated":false,"optimized_estimated":false}, ... five entries in order ...],"peak_memory_mb":{"original":0.0,"optimized":0.0},"notes":["optional short caveats"]}
Print nothing after that line.

Original language: ${language}
${fence("original_code", original, `language="${language}"`)}
${fence("optimized_code", candidate, `language="${language}"`)}`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function runBenchmark(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { candidateId?: string | undefined },
): Promise<BenchmarkResult> {
  type CandidateWithOpt = Prisma.OptimizationCandidateGetPayload<{ include: { optimization: true } }>;
  let candidate: CandidateWithOpt | null;

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

  // Equivalence evidence is part of the result: run it now if the user has not verified yet.
  let passed = candidate.verifiedPassed;
  let total = candidate.verifiedTotal;
  if (passed === null || total === null) {
    const v = await verifyCandidate(deps, userId, candidate.id);
    passed = v.passed;
    total = v.total;
  }

  const opt = candidate.optimization;
  const measured = await deps.ai.runCodeJson({
    userId,
    feature: "benchmark",
    system: BENCH_SYSTEM,
    prompt: benchPrompt(opt.language as Language, opt.code, candidate.code),
    schema: execBenchmarkSchema,
    maxOutputTokens: 16384,
  });

  const series = measured.series.map((p) => ({
    input: p.input,
    original: round2(p.original_ms),
    optimized: round2(p.optimized_ms),
  }));
  const largest = measured.series[measured.series.length - 1];
  if (!largest) throw new AppError(502, "AI_BAD_RESPONSE", "Benchmark returned no data.");

  const improvementPercent =
    largest.original_ms > 0
      ? clampInt(((largest.original_ms - largest.optimized_ms) / largest.original_ms) * 100, 0, 100)
      : 0;

  const estimatedCount = measured.series.filter((p) => p.original_estimated || p.optimized_estimated).length;
  const notes = [
    "Timings come from Python ports executed in a shared sandbox: use them to compare the two versions, not as absolute numbers.",
    ...(estimatedCount > 0
      ? [`${estimatedCount} data point${estimatedCount === 1 ? " was" : "s were"} extrapolated because the run exceeded the time budget.`]
      : []),
    ...measured.notes,
  ];

  const original = (opt.original ?? {}) as { complexity?: { time: string; space: string }; approach?: string };
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
    executionSeries: series,
    originalComplexity: original.complexity ?? { time: "—", space: "—" },
    optimizedComplexity: { time: candidate.timeComplexity, space: candidate.spaceComplexity },
    improvementPercent,
    verification: { total, passed, failed: Math.max(0, total - passed) },
    trustScore: {
      correctness: total > 0 ? clampInt((passed / total) * 100, 0, 100) : 0,
      optimization: clampInt(0.5 * improvementPercent + 0.5 * candidate.confidence, 0, 100),
      benchmark: clampInt(100 - 12 * estimatedCount, 40, 100),
    },
    isMockData: false,
    notes,
  };

  await deps.db.benchmark.create({
    data: {
      id: result.id,
      userId,
      optimizationId: opt.id,
      candidateId: candidate.id,
      result: toJson(result),
    },
  });

  const title = titleFromCode(opt.code, "Benchmark");
  await addHistory(deps.db, userId, {
    title,
    language: opt.language as Language,
    status: "benchmarked",
    originalComplexity: result.originalComplexity.time,
    optimizedComplexity: result.optimizedComplexity.time,
    optimizationPercent: improvementPercent,
    evolution: [
      { step: "Benchmarked", detail: `${candidate.approach}: ${improvementPercent}% faster at 100K inputs` },
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
      detail: `${candidate.approach}: ${improvementPercent}% faster at 100K`,
      benchmarkId: result.id,
    },
  });

  return result;
}
