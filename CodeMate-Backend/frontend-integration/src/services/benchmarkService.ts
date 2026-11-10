import type { BenchmarkResult } from "@/types/domain";
import { api } from "./client";

/** Benchmarks the given optimizer candidate, or the latest recommended one when omitted. */
export async function runBenchmark(input?: { candidateId?: string }): Promise<BenchmarkResult> {
  return api<BenchmarkResult>("/api/benchmark", { body: { candidateId: input?.candidateId } });
}
