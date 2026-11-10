import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/app/AuthPage";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — CodeMate AI" }] }),
  component: () => <AuthPage mode="login" />,
});
