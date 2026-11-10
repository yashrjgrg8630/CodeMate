import { ApiError, apiRequest } from "./client";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const response = await apiRequest<{ user: CurrentUser }>("/api/auth/me");
    return response.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function login(input: { email: string; password: string }): Promise<CurrentUser> {
  const response = await apiRequest<{ user: CurrentUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.user;
}

export async function signup(input: {
  email: string;
  password: string;
  name: string;
}): Promise<CurrentUser> {
  const response = await apiRequest<{ user: CurrentUser }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.user;
}

export async function logout(): Promise<void> {
  await apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
}
