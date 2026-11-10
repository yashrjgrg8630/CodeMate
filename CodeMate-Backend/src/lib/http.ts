import type { Context } from "hono";
import type { z } from "zod";
import { AppError } from "./errors.js";

export type AppBindings = { Variables: { userId: string; requestId: string } };
export type AppContext = Context<AppBindings>;

function issues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message }));
}

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.", issues(parsed.error));
  }
  return parsed.data;
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid query.", issues(parsed.error));
  }
  return parsed.data;
}
