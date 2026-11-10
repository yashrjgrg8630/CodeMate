import type { DashboardData, ProgressReport } from "@/types/domain";
import { apiRequest } from "./client";

export async function getDashboard(): Promise<DashboardData> {
  return apiRequest<DashboardData>("/api/dashboard");
}

export async function deleteActivity(activityId: string): Promise<void> {
  await apiRequest<void>(`/api/activity/${encodeURIComponent(activityId)}`, { method: "DELETE" });
}

export async function clearActivities(): Promise<void> {
  await apiRequest<void>("/api/activity", { method: "DELETE" });
}

export async function getProgress(): Promise<ProgressReport> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return apiRequest<ProgressReport>(`/api/progress?tz=${encodeURIComponent(tz)}`);
}
