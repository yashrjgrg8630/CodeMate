import { notFound } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";
import type { CodeHistoryItem } from "../schemas/domain.js";
import { addHistory, toHistoryDto } from "./activity.js";
import type { z } from "zod";
import type { historyCreateBody } from "../schemas/requests.js";

export async function listHistory(db: Db, userId: string): Promise<CodeHistoryItem[]> {
  const rows = await db.historyItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500 });
  return rows.map(toHistoryDto);
}

export async function getHistoryItem(db: Db, userId: string, id: string): Promise<CodeHistoryItem> {
  const row = await db.historyItem.findFirst({ where: { id, userId } });
  if (!row) throw notFound("History item not found.");
  return toHistoryDto(row);
}

export async function createHistoryItem(
  db: Db,
  userId: string,
  body: z.output<typeof historyCreateBody>,
): Promise<CodeHistoryItem> {
  const status = body.status ?? body.type;
  if (!status) throw notFound("status is required."); // unreachable: the schema refines this
  return addHistory(db, userId, {
    title: body.title,
    language: body.language,
    status,
    originalComplexity: body.originalComplexity,
    optimizedComplexity: body.optimizedComplexity,
    optimizationPercent: body.optimizationPercent,
    evolution: body.evolution,
    snippet: body.snippet,
  });
}

export async function deleteHistoryItem(db: Db, userId: string, id: string): Promise<boolean> {
  const result = await db.historyItem.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

export async function clearHistory(db: Db, userId: string): Promise<number> {
  const result = await db.historyItem.deleteMany({ where: { userId } });
  return result.count;
}
