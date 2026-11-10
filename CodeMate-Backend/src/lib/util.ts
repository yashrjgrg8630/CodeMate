import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const newId = (prefix: string): string => `${prefix}_${randomBytes(9).toString("base64url")}`;

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export const clampInt = (n: number, min: number, max: number): number =>
  Math.round(clamp(Number.isFinite(n) ? n : min, min, max));

/** Prisma Json columns want InputJsonValue; our validated DTOs are JSON-safe by construction. */
export const toJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

export function titleFromCode(code: string, fallbackLabel: string): string {
  const patterns = [
    /\bdef\s+([A-Za-z_]\w*)\s*\(/,
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    /\bclass\s+([A-Za-z_]\w*)/,
    /\b(?:int|long|double|float|void|bool|boolean|string|auto|char\s*\*?|vector<[^>]+>|String|Integer)\s+([A-Za-z_]\w*)\s*\(/,
  ];
  for (const re of patterns) {
    const m = re.exec(code);
    if (m?.[1]) return m[1];
  }
  return fallbackLabel;
}

export function relativeTime(date: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toISOString().slice(0, 10);
}

/** Wraps untrusted text in a tag so prompts can clearly delimit user data. */
export function fence(tag: string, text: string, attrs = ""): string {
  const safe = text.replaceAll(`</${tag}`, `<\\/${tag}`);
  return `<${tag}${attrs ? ` ${attrs}` : ""}>\n${safe}\n</${tag}>`;
}

/** Splits integer shares so they sum to exactly `total` (largest remainder method). */
export function normalizeShares(weights: number[], total = 100): number[] {
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  if (sum === 0) return safe.map((_, i) => (i === 0 ? total : 0));
  const raw = safe.map((w) => (w / sum) * total);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}
