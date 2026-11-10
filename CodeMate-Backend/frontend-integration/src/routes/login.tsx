import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { googleLoginUrl, login, signup } from "@/services/authService";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — CodeMate AI" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "signup") await signup({ name, email, password });
      else await login({ email, password });
      await navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Welcome back" : "Create your account"}</CardTitle>
          <CardDescription>CodeMate AI — code intelligence and career prep.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
            {mode === "signup" ? (
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            ) : null}
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? "Sign in" : "Sign up"}
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <a href={googleLoginUrl}>Continue with Google</a>
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
