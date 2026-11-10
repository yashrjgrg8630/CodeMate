import type { JobAnalysis, ResumeMatchRoadmap, SkillGap } from "@/types/domain";
import { api } from "./client";

export interface CareerResult {
  analysis: JobAnalysis;
  skillGap: SkillGap;
  /** null when no readable resume text was provided (e.g. a PDF, which the server cannot parse yet). */
  roadmap: ResumeMatchRoadmap | null;
}

/** One request returns the job extraction, the skill gap and (with a resume) the 10-week match roadmap. */
export async function analyzeCareer(
  jobDescription: string,
  resumeText?: string,
): Promise<CareerResult> {
  return api<CareerResult>("/api/career/job", {
    body: { jobDescription, resumeText: resumeText?.trim() ? resumeText : undefined },
  });
}
