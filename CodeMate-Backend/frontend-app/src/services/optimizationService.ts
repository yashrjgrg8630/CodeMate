import type { Language, OptimizationResult } from "@/types/domain";
import { api } from "./client";

export async function optimizeCode(input: {
  code: string;
  language: Language;
}): Promise<OptimizationResult> {
  return api<OptimizationResult>("/api/optimization", { body: input });
}

export async function verifyOptimization(candidateId: string): Promise<{
  candidateId: string;
  passed: number;
  total: number;
  equivalent: boolean;
}> {
  return api("/api/optimization/verify", { body: { candidateId } });
}
