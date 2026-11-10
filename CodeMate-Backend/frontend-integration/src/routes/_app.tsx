import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { getMe } from "@/services/authService";
import { ApiError } from "@/services/client";

export const Route = createFileRoute("/_app")({
  // Session cookies live in the browser, so the check only runs client-side.
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      await getMe();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw redirect({ to: "/login" });
      throw err;
    }
  },
  component: AppShell,
});
