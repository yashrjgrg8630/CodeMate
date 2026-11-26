import { useEffect, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  BriefcaseBusiness,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Route as RouteIcon,
  Settings,
  Sparkles,
  Terminal,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { LoadingState } from "@/components/app/shared";
import { AuthPage } from "@/components/app/AuthPage";
import { getCurrentUser, logout } from "@/services/authService";
import { cn } from "@/lib/utils";

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
  { to: "/roadmap", label: "DSA Roadmap", icon: RouteIcon },
  { to: "/interview", label: "Mock Interview", icon: MessagesSquare },
  { to: "/progress", label: "Progress & DNA", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/analyzer": "Code Analyzer",
  "/optimizer": "Solution Optimizer",
  "/converter": "Language Converter",
  "/benchmark": "Benchmark",
  "/history": "History",
  "/career": "Job Analyzer",
  "/roadmap": "DSA Roadmap",
  "/interview": "Mock Interview",
  "/progress": "Progress & DNA",
  "/settings": "Settings",
};

function AmbientCanvas() {
  return (
    <div aria-hidden="true" className="workspace-ambient">
      <div className="workspace-ambient__wash" />
    </div>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const [sessionExpired, setSessionExpired] = useState(false);

  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    enabled: typeof window !== "undefined",
    retry: false,
  });

  useEffect(() => {
    const onUnauthorized = () => {
      const hadUser = Boolean(queryClient.getQueryData(["auth", "me"]));
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "auth",
      });
      queryClient.setQueryData(["auth", "me"], null);
      if (hadUser) {
        setSessionExpired(true);
      }
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

  const currentLabel = ROUTE_LABELS[pathname] || "Workspace";

  if (userQuery.isPending) {
    return (
      <div className="relative grid min-h-screen place-items-center p-6">
        <AmbientCanvas />
        <div className="relative z-10">
          <LoadingState label="Connecting to CodeMate backend…" />
        </div>
      </div>
    );
  }

  if (!userQuery.data) {
    if (userQuery.isError) {
      return (
        <AuthPage
          redirectTo={pathname}
          connectionError={
            userQuery.error instanceof Error
              ? userQuery.error.message
              : "Could not verify your connection to the backend."
          }
          onRetryConnection={() => void userQuery.refetch()}
        />
      );
    }
    return (
      <AuthPage
        redirectTo={pathname}
        sessionInvalid={userQuery.data === null}
        sessionExpired={sessionExpired}
        onAuthenticated={() => setSessionExpired(false)}
      />
    );
  }

  return (
    <div className="workspace-shell">
      <SidebarProvider>
        <AmbientCanvas />

        <Sidebar
          collapsible="icon"
          className="relative z-20 border-r border-white/[0.07] bg-[#10151b] shadow-[10px_0_30px_rgba(0,0,0,0.12)]"
        >
          <SidebarHeader className="border-b border-white/[0.08] px-3 py-3.5">
            <Link to="/" className="flex items-center gap-2.5 px-1 py-0.5 group">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#aebcff]/20 bg-[#aebcff]/[0.08] font-code text-xs font-semibold text-[#b8c5ff] transition-transform duration-200 group-hover:scale-105">
                {"{}"}
              </div>
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="font-headline text-sm font-semibold tracking-tight text-white">
                  CodeMate<span className="text-[#b8c5ff] ml-0.5">AI</span>
                </span>
                <span className="font-code text-[10px] text-zinc-400">Studio Workspace</span>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent className="px-2.5 py-3 space-y-5">
            <SidebarGroup>
              <SidebarGroupLabel className="px-2 font-code text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Code Intelligence
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  {CODE_NAV.map((item) => {
                    const isActive = pathname === item.to;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={cn(
                            "rounded-xl transition-all duration-200",
                            isActive
                              ? "bg-[#aebcff]/[0.1] text-white font-medium border border-[#aebcff]/[0.16] hover:bg-[#aebcff]/[0.14]"
                              : "text-zinc-400 border border-transparent hover:bg-white/[0.05] hover:text-zinc-100",
                          )}
                        >
                          <Link to={item.to}>
                            <item.icon className={cn("size-4", isActive ? "text-[#b8c5ff]" : "")} />
                            <span className="text-[13px]">{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="px-2 font-code text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Career &amp; Prep
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  {CAREER_NAV.map((item) => {
                    const isActive = pathname === item.to;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={cn(
                            "rounded-xl transition-all duration-200",
                            isActive
                              ? "bg-[#aebcff]/[0.1] text-white font-medium border border-[#aebcff]/[0.16] hover:bg-[#aebcff]/[0.14]"
                              : "text-zinc-400 border border-transparent hover:bg-white/[0.05] hover:text-zinc-100",
                          )}
                        >
                          <Link to={item.to}>
                            <item.icon className={cn("size-4", isActive ? "text-[#b8c5ff]" : "")} />
                            <span className="text-[13px]">{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-white/[0.08] p-2.5">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Back to Landing" className="rounded-xl">
                  <Link
                    to="/"
                    className="text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    <ArrowLeft className="size-4" />
                    <span className="text-xs font-medium">Back to Landing</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="relative z-10 bg-transparent">
          <header className="workspace-topbar-wrap">
            <div className="workspace-topbar">
              <div className="flex h-11 items-center justify-between gap-3 px-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <SidebarTrigger className="text-zinc-300 hover:text-white" />
                  <Separator orientation="vertical" className="h-4 bg-white/[0.12]" />
                  <div className="flex items-center gap-2 text-xs text-zinc-400 truncate">
                    <Link
                      to="/dashboard"
                      className="hidden sm:inline hover:text-white transition-colors"
                    >
                      Workspace
                    </Link>
                    <span className="hidden sm:inline text-zinc-600">/</span>
                    <span className="font-medium text-white truncate">{currentLabel}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                  <span className="hidden lg:inline-flex items-center gap-2 px-2 text-xs font-medium text-zinc-300">
                    <span className="max-w-[160px] truncate">{userQuery.data.name}</span>
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                    className="h-7 rounded-full text-xs"
                  >
                    <LogOut className="size-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">
                      {logoutMutation.isPending ? "Signing out…" : "Sign out"}
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <main
            key={pathname}
            className="workspace-content mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 space-y-6 animate-page-enter"
          >
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
