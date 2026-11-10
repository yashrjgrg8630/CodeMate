import type { CodeHistoryItem } from "@/types/domain";
import { apiRequest } from "./client";

export async function getHistory(): Promise<CodeHistoryItem[]> {
  return apiRequest<CodeHistoryItem[]>("/api/history");
}

export async function getHistoryItem(id: string): Promise<CodeHistoryItem> {
  return apiRequest<CodeHistoryItem>(`/api/history/${encodeURIComponent(id)}`);
}

export async function saveToHistory(
  item: Omit<CodeHistoryItem, "id" | "date">,
): Promise<CodeHistoryItem> {
  return apiRequest<CodeHistoryItem>("/api/history", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export async function deleteHistoryItem(id: string): Promise<void> {
  await apiRequest<void>(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function clearHistory(): Promise<void> {
  await apiRequest<void>("/api/history", { method: "DELETE" });
}
