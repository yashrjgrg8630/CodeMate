import type { ActivityKind } from "@prisma/client";
import type { Db } from "../lib/prisma.js";
import { toJson } from "../lib/util.js";
import type { CodeHistoryItem } from "../schemas/domain.js";
import { codeHistoryItemSchema, languageSchema } from "../schemas/domain.js";

export interface ActivityInput {
  kind: ActivityKind;
  topic?: string | null;
  score?: number | null;
  /** Always include `label` and `detail`: the Dashboard feed renders them. */
  meta: { label: string; detail: string } & Record<string, unknown>;
}

export async function recordActivity(db: Db, userId: string, input: ActivityInput): Promise<void> {
  await db.activityEvent.create({
    data: {
      userId,
      kind: input.kind,
      topic: input.topic ?? null,
      score: input.score ?? null,
      meta: toJson(input.meta),
    },
  });
}

export type NewHistoryItem = Omit<CodeHistoryItem, "id" | "date"> & { snippet?: string | undefined };

interface HistoryPayload {
  originalComplexity: string;
  optimizedComplexity: string;
  optimizationPercent: number;
  evolution: { step: string; detail: string }[];
  snippet?: string;
}

export function toHistoryDto(row: {
  id: string;
  type: CodeHistoryItem["status"];
  title: string;
  language: string;
  payload: unknown;
  createdAt: Date;
}): CodeHistoryItem {
  const payload = (row.payload ?? {}) as Partial<HistoryPayload>;
  return codeHistoryItemSchema.parse({
    id: row.id,
    title: row.title,
    language: languageSchema.catch("python").parse(row.language),
    originalComplexity: payload.originalComplexity ?? "—",
    optimizedComplexity: payload.optimizedComplexity ?? "—",
    date: row.createdAt.toISOString().slice(0, 10),
    status: row.type,
    optimizationPercent: payload.optimizationPercent ?? 0,
    evolution: payload.evolution ?? [],
  });
}

export async function addHistory(db: Db, userId: string, item: NewHistoryItem): Promise<CodeHistoryItem> {
  const payload: HistoryPayload = {
    originalComplexity: item.originalComplexity,
    optimizedComplexity: item.optimizedComplexity,
    optimizationPercent: item.optimizationPercent,
    evolution: item.evolution,
    ...(item.snippet ? { snippet: item.snippet.slice(0, 2000) } : {}),
  };
  const row = await db.historyItem.create({
    data: {
      userId,
      type: item.status,
      title: item.title.slice(0, 200),
      language: item.language,
      payload: toJson(payload),
    },
  });
  return toHistoryDto(row);
}
