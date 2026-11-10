import type { DashboardData, ProgressReport } from "@/types/domain";
import { api } from "./client";

export async function getDashboard(): Promise<DashboardData> {
  return api<DashboardData>("/api/dashboard");
}

/** Sends the browser's time zone so "today", streaks and the Mon–Sun chart follow the user's calendar. */
export async function getProgress(): Promise<ProgressReport> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return api<ProgressReport>(`/api/progress?tz=${encodeURIComponent(tz)}`);
}
