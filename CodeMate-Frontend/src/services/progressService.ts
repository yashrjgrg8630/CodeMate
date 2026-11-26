import type { DashboardData, ProgressReport } from "@/types/domain";
import { apiRequest } from "./client";

export type ProgressRange = ProgressReport["range"];

export async function getDashboard(): Promise<DashboardData> {
  return apiRequest<DashboardData>("/api/dashboard");
}

export async function deleteActivity(activityId: string): Promise<void> {
  await apiRequest<void>(`/api/activity/${encodeURIComponent(activityId)}`, { method: "DELETE" });
}

export async function clearActivities(): Promise<void> {
  await apiRequest<void>("/api/activity", { method: "DELETE" });
}

export async function getProgress(range: ProgressRange = "30d"): Promise<ProgressReport> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const params = new URLSearchParams({ tz, range });
  return apiRequest<ProgressReport>(`/api/progress?${params.toString()}`);
}
