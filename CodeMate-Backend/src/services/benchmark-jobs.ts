import { AppError, notFound } from "../lib/errors.js";
import { newId } from "../lib/util.js";
import type { BenchmarkResult } from "../schemas/domain.js";
import { runBenchmark, type BenchmarkProgress } from "./benchmark.js";
import type { AIService } from "./ai/ai-service.js";
import type { Db } from "../lib/prisma.js";

export type BenchmarkJobStatus =
  | "queued"
  | "running"
  | "measuring"
  | "saving"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface BenchmarkJobSnapshot {
  id: string;
  status: BenchmarkJobStatus;
  message: string;
  result?: BenchmarkResult;
  error?: string;
}

interface BenchmarkJob extends BenchmarkJobSnapshot {
  userId: string;
  controller: AbortController;
  updatedAt: number;
}

const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map<string, BenchmarkJob>();
const activeJobsByUser = new Map<string, string>();

function isTerminal(status: BenchmarkJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function expireOldJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (isTerminal(job.status) && job.updatedAt < cutoff) jobs.delete(id);
  }
}

function snapshot(job: BenchmarkJob): BenchmarkJobSnapshot {
  return {
    id: job.id,
    status: job.status,
    message: job.message,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

function reserveUser(userId: string, jobId: string): void {
  const activeJobId = activeJobsByUser.get(userId);
  if (activeJobId) {
    const activeJob = jobs.get(activeJobId);
    if (activeJob && !isTerminal(activeJob.status)) {
      throw new AppError(409, "BENCHMARK_ALREADY_RUNNING", "A benchmark is already running for this account.");
    }
    activeJobsByUser.delete(userId);
  }
  activeJobsByUser.set(userId, jobId);
}

function releaseUser(userId: string, jobId: string): void {
  if (activeJobsByUser.get(userId) === jobId) activeJobsByUser.delete(userId);
}

export async function runBenchmarkExclusive(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { candidateId?: string | undefined },
  signal?: AbortSignal,
): Promise<BenchmarkResult> {
  const lockId = newId("benchlock");
  reserveUser(userId, lockId);
  try {
    return await runBenchmark(deps, userId, input, { signal });
  } finally {
    releaseUser(userId, lockId);
  }
}

export function startBenchmarkJob(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { candidateId?: string | undefined },
): BenchmarkJobSnapshot {
  expireOldJobs();
  const id = newId("benchjob");
  reserveUser(userId, id);

  const job: BenchmarkJob = {
    id,
    userId,
    controller: new AbortController(),
    status: "queued",
    message: "Preparing the selected candidate.",
    updatedAt: Date.now(),
  };
  jobs.set(id, job);

  void Promise.resolve()
    .then(() =>
      runBenchmark(deps, userId, input, {
        signal: job.controller.signal,
        onProgress: (progress: BenchmarkProgress) => {
          if (job.status === "cancelling") return;
          job.status = progress.stage === "preparing" ? "running" : progress.stage;
          job.message = progress.message;
          job.updatedAt = Date.now();
        },
      }),
    )
    .then((result) => {
      job.status = "completed";
      job.message = "Benchmark complete.";
      job.result = result;
    })
    .catch((error: unknown) => {
      if (job.controller.signal.aborted || (error instanceof AppError && error.code === "AI_CANCELLED")) {
        job.status = "cancelled";
        job.message = "Benchmark cancelled.";
      } else {
        job.status = "failed";
        job.message = "Benchmark could not be completed.";
        job.error = error instanceof AppError ? error.message : "An unexpected error occurred. Please try again.";
      }
    })
    .finally(() => {
      job.updatedAt = Date.now();
      releaseUser(userId, id);
    });

  return snapshot(job);
}

export function getBenchmarkJob(userId: string, id: string): BenchmarkJobSnapshot {
  expireOldJobs();
  const job = jobs.get(id);
  if (!job || job.userId !== userId) throw notFound("Benchmark job not found.");
  return snapshot(job);
}

export function cancelBenchmarkJob(userId: string, id: string): BenchmarkJobSnapshot {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) throw notFound("Benchmark job not found.");
  if (isTerminal(job.status)) return snapshot(job);
  job.status = "cancelling";
  job.message = "Cancelling benchmark execution.";
  job.updatedAt = Date.now();
  job.controller.abort();
  return snapshot(job);
}
