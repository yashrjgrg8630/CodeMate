import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/app/AuthPage";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {}),
    ...(typeof search["error"] === "string" ? { error: search["error"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — CodeMate AI" },
      { name: "description", content: "Sign in to your CodeMate engineering workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect, error } = Route.useSearch();
  return (
    <AuthPage
      mode="login"
      {...(redirect ? { redirectTo: redirect } : {})}
      {...(error ? { oauthError: error } : {})}
    />
  );
}
