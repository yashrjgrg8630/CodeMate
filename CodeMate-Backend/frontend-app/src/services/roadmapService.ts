import type { DSARoadmap } from "@/types/domain";
import { ApiError, api } from "./client";

interface GenerateInput {
  targetRole?: string;
  preparationLevel?: string;
  weeks?: number;
}

/** Generates a fresh roadmap with AI (progress on previously solved problems is carried over). */
export async function generateRoadmap(input?: GenerateInput): Promise<DSARoadmap> {
  return api<DSARoadmap>("/api/roadmap", {
    body: {
      targetRole: input?.targetRole ?? "Software Engineer",
      preparationLevel: input?.preparationLevel ?? "Intermediate",
      weeks: input?.weeks ?? 8,
    },
  });
}

/** Returns the saved roadmap, generating the first one on demand, so revisiting the page never re-bills the AI. */
export async function getRoadmap(): Promise<DSARoadmap> {
  try {
    return await api<DSARoadmap>("/api/roadmap/latest");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return generateRoadmap();
    throw err;
  }
}

export async function setProblemState(
  roadmapId: string,
  problemId: string,
  patch: { completed?: boolean; inRevision?: boolean },
): Promise<void> {
  await api(
    `/api/roadmap/${encodeURIComponent(roadmapId)}/problems/${encodeURIComponent(problemId)}`,
    {
      method: "PATCH",
      body: patch,
    },
  );
}
