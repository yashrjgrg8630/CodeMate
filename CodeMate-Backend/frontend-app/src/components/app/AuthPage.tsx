import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { googleLoginUrl, login, signup } from "@/services/authService";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const user = isRegister
        ? await signup({ name, email, password })
        : await login({ email, password });
      queryClient.setQueryData(["auth", "me"], user);
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
          <CardTitle>{isRegister ? "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>CodeMate AI — code intelligence and career prep.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            {isRegister ? (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={isRegister ? 8 : undefined}
                maxLength={200}
                required
              />
              {isRegister ? (
                <p className="text-xs text-muted-foreground">
                  At least 8 characters. Passwords are limited to 72 UTF-8 bytes.
                </p>
              ) : null}
            </div>
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {isRegister ? "Create account" : "Sign in"}
            </Button>
          </form>
          {!isRegister ? (
            <Button variant="outline" className="w-full" asChild>
              <a href={googleLoginUrl}>Continue with Google</a>
            </Button>
          ) : null}
          <p className="text-center text-sm text-muted-foreground">
            {isRegister ? "Already have an account? " : "New here? "}
            <Link
              className="font-medium text-primary hover:underline"
              to={isRegister ? "/login" : "/register"}
            >
              {isRegister ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
