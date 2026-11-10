import type { CareerJobResult } from "@/types/domain";
import { apiRequest } from "./client";

export async function analyzeJobDescription(
  jobDescription: string,
  resumeText?: string,
  weeks = 10,
): Promise<CareerJobResult> {
  return apiRequest<CareerJobResult>("/api/career/job", {
    method: "POST",
    body: JSON.stringify({ jobDescription, weeks, ...(resumeText ? { resumeText } : {}) }),
  });
}
