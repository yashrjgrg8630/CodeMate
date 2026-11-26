import type { BenchmarkResult } from "@/types/domain";
import { apiRequest } from "./client";

export type BenchmarkJobStatus =
  | "queued"
  | "running"
  | "measuring"
  | "measuring"
  | "saving"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface BenchmarkJob {
  id: string;
  status: BenchmarkJobStatus;
  message: string;
  result?: BenchmarkResult;
  error?: string;
}

export async function runBenchmark(input?: { candidateId?: string }): Promise<BenchmarkResult> {
  return apiRequest<BenchmarkResult>("/api/benchmark", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function startBenchmarkJob(input?: { candidateId?: string }): Promise<BenchmarkJob> {
  return apiRequest<BenchmarkJob>("/api/benchmark/jobs", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function getBenchmarkJob(jobId: string): Promise<BenchmarkJob> {
  return apiRequest<BenchmarkJob>(`/api/benchmark/jobs/${encodeURIComponent(jobId)}`);
}

export async function cancelBenchmarkJob(jobId: string): Promise<BenchmarkJob> {
  return apiRequest<BenchmarkJob>(`/api/benchmark/jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
  });
}
