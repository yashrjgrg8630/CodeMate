const AUTH_NO_REFRESH = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/refresh",
]);

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // In browser on localhost / 127.0.0.1, always use same-origin window.location.origin
    // so Vite dev proxy handles /api seamlessly without cross-origin, CORS or Brave shield blocks.
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (isLocalhost) {
      return window.location.origin;
    }
    const configured = import.meta.env["VITE_API_URL"];
    if (configured) return configured.replace(/\/+$/, "");
    return window.location.origin;
  }
  const configured = import.meta.env["VITE_API_URL"];
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:8787";
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

async function refreshSession(baseUrl: string): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${baseUrl}/api/auth/refresh`, {
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
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const baseUrl = getApiBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError(
      "Could not reach the CodeMate backend. Please check your connection or start the backend server.",
      0,
      "NETWORK_ERROR",
    );
  }

  // Attempt token refresh on 401 for authenticated endpoints (only once per request)
  if (response.status === 401 && !retried && !AUTH_NO_REFRESH.has(path)) {
    const refreshed = await refreshSession(baseUrl);
    if (refreshed) {
      return send<T>(path, init, true);
    }
  }

  const text = await response.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ApiError("The backend returned an invalid response.", response.status);
      }
    }
  }

  if (!response.ok) {
    const body = payload as { error?: { message?: string; code?: string } } | undefined;

    // Only dispatch unauthorized if the session could not be refreshed
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !AUTH_NO_REFRESH.has(path)
    ) {
      window.dispatchEvent(new Event("codemate:unauthorized"));
    }

    throw new ApiError(
      body?.error?.message ?? `The request failed (${response.status}).`,
      response.status,
      body?.error?.code,
    );
  }

  return payload as T;
}

export function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return send<T>(path, init, false);
}
