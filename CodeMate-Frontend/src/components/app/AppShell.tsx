import { useEffect, useState, type FormEvent } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowLeftRight,
  Braces,
  BriefcaseBusiness,
  Gauge,
  History,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Sparkles,
  Terminal,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/app/shared";
import { getCurrentUser, login, logout, signup, type CurrentUser } from "@/services/authService";

const CODE_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analyzer", label: "Code Analyzer", icon: Terminal },
  { to: "/optimizer", label: "Optimizer", icon: Sparkles },
  { to: "/converter", label: "Converter", icon: ArrowLeftRight },
  { to: "/benchmark", label: "Benchmark", icon: Gauge },
  { to: "/history", label: "History", icon: History },
] as const;

const CAREER_NAV = [
  { to: "/career", label: "Job Analyzer", icon: BriefcaseBusiness },
  { to: "/interview", label: "Mock Interview", icon: MessagesSquare },
  { to: "/progress", label: "Progress", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    enabled: typeof window !== "undefined",
    retry: false,
  });
  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "auth",
      });
      queryClient.setQueryData(["auth", "me"], null);
    };
    window.addEventListener("codemate:unauthorized", onUnauthorized);
    return () => window.removeEventListener("codemate:unauthorized", onUnauthorized);
  }, [queryClient]);
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "auth",
      });
      queryClient.setQueryData(["auth", "me"], null);
    },
  });

  if (userQuery.isPending) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <LoadingState label="Connecting to CodeMate…" />
      </div>
    );
  }
  if (!userQuery.data) {
    if (userQuery.isError) {
      return (
        <AuthPanel
          connectionError={
            userQuery.error instanceof Error
              ? userQuery.error.message
              : "Could not verify your connection to the backend."
          }
          onRetryConnection={() => void userQuery.refetch()}
        />
      );
    }
    return <AuthPanel sessionInvalid={userQuery.data === null} />;
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link to="/" className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Braces className="size-4" />
            </span>
            <span className="font-display text-lg group-data-[collapsible=icon]:hidden">
              CodeMate AI
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Code Intelligence</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {CODE_NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={pathname === item.to} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Career Intelligence</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {CAREER_NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={pathname === item.to} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <span className="text-sm text-muted-foreground">CodeMate workspace</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {userQuery.data.name}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AuthPanel({
  sessionInvalid = false,
  connectionError,
  onRetryConnection,
}: {
  sessionInvalid?: boolean;
  connectionError?: string;
  onRetryConnection?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();
  const authMutation = useMutation({
    mutationFn: (input: {
      mode: "login" | "signup";
      name: string;
      email: string;
      password: string;
    }) =>
      input.mode === "signup"
        ? signup({ name: input.name, email: input.email, password: input.password })
        : login({ email: input.email, password: input.password }),
    onSuccess: (user: CurrentUser) => queryClient.setQueryData(["auth", "me"], user),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    authMutation.mutate({ mode, name, email, password });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            {mode === "login" ? "Welcome back" : "Create your CodeMate account"}
          </CardTitle>
          <CardDescription>
            {connectionError
              ? "Could not verify your connection to the CodeMate backend."
              : sessionInvalid
                ? "The backend is reachable, but you are not signed in or your session has expired. Sign in to continue."
                : "Sign in to use the connected CodeMate AI backend. Your work is saved to your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectionError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="size-4" />
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>{connectionError}</span>
                <Button type="button" variant="outline" size="sm" onClick={onRetryConnection}>
                  Retry connection
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <form className="space-y-4" onSubmit={submit}>
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="auth-name">Name</Label>
                <Input
                  id="auth-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={80}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "signup" ? 8 : 1}
                maxLength={72}
              />
            </div>
            <Button className="w-full" type="submit" disabled={authMutation.isPending}>
              {authMutation.isPending
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </Button>
            <Button
              className="w-full"
              variant="ghost"
              type="button"
              onClick={() => {
                authMutation.reset();
                setMode(mode === "login" ? "signup" : "login");
              }}
            >
              {mode === "login" ? "Need an account? Sign up" : "Already registered? Sign in"}
            </Button>
            {authMutation.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {authMutation.error instanceof Error
                  ? authMutation.error.message
                  : "Sign-in failed. Please try again."}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
