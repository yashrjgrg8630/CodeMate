/**
 * HTTP transport for the CodeMate backend.
 *
 * - Cookies (httpOnly access + refresh) are sent with `credentials: "include"`.
 * - A 401 triggers one silent refresh-token rotation, then the request is retried.
 * - Errors are normalised into `ApiError` using the server's `{ error: { code, message } }` shape.
 */
export const IS_MOCK_BACKEND = false;

export const API_URL: string =
  (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/+$/, "") ??
  "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
}

export async function api<T>(
  path: string,
  options: RequestOptions = {},
  canRetry = true,
): Promise<T> {
  let res: Response;
  try {
    const init: RequestInit = {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      credentials: "include",
    };
    if (options.body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(options.body);
    }
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(
      0,
      "NETWORK",
      "Cannot reach the CodeMate server. Check your connection and try again.",
    );
  }

  if (res.status === 401 && canRetry && !path.startsWith("/api/auth/")) {
    if (await refreshSession()) return api<T>(path, options, false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("codemate:unauthorized"));
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? `Request failed (${res.status}).`,
      err?.details,
    );
  }
  return data as T;
}
