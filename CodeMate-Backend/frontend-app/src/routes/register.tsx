import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/app/AuthPage";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Create account — CodeMate AI" }] }),
  component: () => <AuthPage mode="register" />,
});
