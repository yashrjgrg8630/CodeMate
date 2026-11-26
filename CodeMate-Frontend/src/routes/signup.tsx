import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/app/AuthPage";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {}),
    ...(typeof search["error"] === "string" ? { error: search["error"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Create account — CodeMate AI" },
      { name: "description", content: "Create your CodeMate engineering workspace." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { redirect, error } = Route.useSearch();
  return (
    <AuthPage
      mode="signup"
      {...(redirect ? { redirectTo: redirect } : {})}
      {...(error ? { oauthError: error } : {})}
    />
  );
}
