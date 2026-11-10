const DEFAULT_API_CANDIDATES = [
  import.meta.env["VITE_API_URL"],
  typeof window !== "undefined" ? window.location.origin : undefined,
  "http://localhost:8787",
  "http://127.0.0.1:8787",
].filter((value): value is string => Boolean(value));

const API_BASE_URL = DEFAULT_API_CANDIDATES[0]?.replace(/\/+$/, "") ?? "http://localhost:8787";
const AUTH_NO_REFRESH = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/refresh",
]);

function getApiCandidates(): string[] {
  const seen = new Set<string>();
  return DEFAULT_API_CANDIDATES.filter((candidate) => {
    const normalized = candidate.replace(/\/+$/, "");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshPromise: Promise<boolean> | undefined;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = undefined;
      });
  }
  return refreshPromise;
}

async function send<T>(path: string, init: RequestInit, retried: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const candidates = getApiCandidates();
  let lastError: Error | undefined;

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        credentials: "include",
      });

      if (response.status === 401 && !retried && !AUTH_NO_REFRESH.has(path)) {
        if (await refreshSession()) return send<T>(path, init, true);
      }

      const text = await response.text();
      let payload: unknown;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          if (response.ok)
            throw new ApiError("The backend returned an invalid response.", response.status);
        }
      }

      if (!response.ok) {
        const body = payload as { error?: { message?: string; code?: string } } | undefined;
        if (response.status === 401 && typeof window !== "undefined" && !AUTH_NO_REFRESH.has(path)) {
          window.dispatchEvent(new Event("codemate:unauthorized"));
        }
        throw new ApiError(
          body?.error?.message ?? `The request failed (${response.status}).`,
          response.status,
          body?.error?.code,
        );
      }
      return payload as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
      if (error instanceof ApiError && error.status !== 0 && error.status !== 404) {
        throw error;
      }
    }
  }

  const reachableBase = candidates.join(", ");
  throw new ApiError(
    `Could not reach the CodeMate backend. Start the backend server and try again, or set VITE_API_URL to the correct API URL. Tried: ${reachableBase}.`,
    0,
    "NETWORK_ERROR",
  );
}

export function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return send<T>(path, init, false);
}
