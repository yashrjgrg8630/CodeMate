import type { BenchmarkResult } from "@/types/domain";
import { apiRequest } from "./client";

export async function runBenchmark(input?: { candidateId?: string }): Promise<BenchmarkResult> {
  return apiRequest<BenchmarkResult>("/api/benchmark", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}
