import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (message = "Authentication required.") =>
  new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource.") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Resource not found.") => new AppError(404, "NOT_FOUND", message);
export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
