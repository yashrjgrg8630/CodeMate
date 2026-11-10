import { API_URL, api } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  return (await api<{ user: AuthUser }>("/api/auth/signup", { body: input })).user;
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  return (await api<{ user: AuthUser }>("/api/auth/login", { body: input })).user;
}

export async function logout(): Promise<void> {
  await api("/api/auth/logout", { body: {} });
}

export async function getMe(): Promise<AuthUser> {
  return (await api<{ user: AuthUser }>("/api/auth/me")).user;
}

/** Full-page navigation target that starts the Google OAuth flow. */
export const googleLoginUrl = `${API_URL}/api/auth/google`;
