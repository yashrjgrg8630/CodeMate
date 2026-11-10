import type { DSARoadmap } from "@/types/domain";
import { ApiError, apiRequest } from "./client";

export async function getLatestRoadmap(): Promise<DSARoadmap | null> {
  try {
    return await apiRequest<DSARoadmap>("/api/roadmap/latest");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateRoadmap(input: {
  targetRole?: string;
  preparationLevel?: string;
  weeks: number;
}): Promise<DSARoadmap> {
  return apiRequest<DSARoadmap>("/api/roadmap", {
    method: "POST",
    body: JSON.stringify({
      targetRole: input.targetRole ?? "Software Engineer",
      preparationLevel: input.preparationLevel ?? "Intermediate",
      weeks: input.weeks,
    }),
  });
}

export async function updateRoadmapProblem(
  roadmapId: string,
  problemId: string,
  patch: { completed?: boolean; inRevision?: boolean },
): Promise<{ problemId: string; completed: boolean; inRevision: boolean; topicProgress: number }> {
  return apiRequest<{
    problemId: string;
    completed: boolean;
    inRevision: boolean;
    topicProgress: number;
  }>(`/api/roadmap/${encodeURIComponent(roadmapId)}/problems/${encodeURIComponent(problemId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
