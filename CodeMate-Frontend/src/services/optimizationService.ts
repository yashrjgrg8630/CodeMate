import type { Language, OptimizationResult } from "@/types/domain";
import { apiRequest } from "./client";

export async function optimizeCode(input: {
  code: string;
  language: Language;
}): Promise<OptimizationResult> {
  return apiRequest<OptimizationResult>("/api/optimization", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyOptimization(candidateId: string): Promise<{
  candidateId: string;
  passed: number;
  total: number;
  equivalent: boolean;
}> {
  return apiRequest("/api/optimization/verify", {
    method: "POST",
    body: JSON.stringify({ candidateId }),
  });
}
