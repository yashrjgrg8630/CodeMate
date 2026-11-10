/** HTTP transport for the CodeMate backend. */
export const IS_MOCK_BACKEND = false;

export const API_URL: string =
  import.meta.env["VITE_API_URL"]?.replace(/\/+$/, "") ?? "http://localhost:8787";

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
  refreshInFlight ??= (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      if (err instanceof TypeError) {
        throw new ApiError(
          0,
          "NETWORK",
          "Cannot refresh your session because the CodeMate server is unavailable.",
        );
      }
      throw err;
    }

    if (response.status === 401) return false;
    if (!response.ok) {
      const error = await parseResponseError(response);
      throw error;
    }
    return true;
  })().finally(() => {
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
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    throw new ApiError(
      0,
      "NETWORK",
      "Cannot reach the CodeMate server. Check your connection and try again.",
    );
  }

  const isAuthMutation = [
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/logout",
    "/api/auth/refresh",
  ].includes(path);
  if (res.status === 401 && canRetry && !isAuthMutation) {
    if (await refreshSession()) return api<T>(path, options, false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("codemate:unauthorized"));
  }

  if (!res.ok) {
    throw await parseResponseError(res);
  }
  return (await parseResponseBody(res)) as T;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function parseResponseError(response: Response): Promise<ApiError> {
  const data = await parseResponseBody(response);
  const error = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)
    ?.error;
  return new ApiError(
    response.status,
    error?.code ?? "HTTP_ERROR",
    error?.message ?? `Request failed (${response.status}).`,
    error?.details,
  );
}
