import type { DSARoadmap, RoadmapDurationUnit } from "@/types/domain";
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
  targetRole: string;
  preparationLevel: string;
  durationValue: number;
  durationUnit: RoadmapDurationUnit;
}): Promise<DSARoadmap> {
  return apiRequest<DSARoadmap>("/api/roadmap", {
    method: "POST",
    body: JSON.stringify({
      targetRole: input.targetRole,
      preparationLevel: input.preparationLevel,
      durationValue: input.durationValue,
      durationUnit: input.durationUnit,
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

export async function updateRoadmapTask(
  roadmapId: string,
  taskId: string,
  completed: boolean,
): Promise<{ taskId: string; completed: boolean; topicProgress: number }> {
  return apiRequest<{
    taskId: string;
    completed: boolean;
    topicProgress: number;
  }>(`/api/roadmap/${encodeURIComponent(roadmapId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({ completed }),
  });
}
