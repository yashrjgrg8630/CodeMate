import type { CodeHistoryItem } from "@/types/domain";
import { ApiError, api } from "./client";

export async function getHistory(): Promise<CodeHistoryItem[]> {
  return api<CodeHistoryItem[]>("/api/history");
}

export async function getHistoryItem(id: string): Promise<CodeHistoryItem | undefined> {
  try {
    return await api<CodeHistoryItem>(`/api/history/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

/** The backend already records every analysis, optimization, conversion and benchmark; use this for manual entries. */
export async function saveToHistory(
  item: Omit<CodeHistoryItem, "id" | "date">,
): Promise<CodeHistoryItem> {
  return api<CodeHistoryItem>("/api/history", { body: item });
}
