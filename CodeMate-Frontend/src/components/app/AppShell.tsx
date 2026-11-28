import { useEffect, useState, type CSSProperties } from "react";
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
  type LucideIcon,
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
import { CodeMateLogo } from "@/components/brand/CodeMateLogo";
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

interface NavItemConfig {
  to: string;
  label: string;
  icon: LucideIcon;
}

function SidebarNavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: readonly NavItemConfig[];
  pathname: string;
}) {
  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel className="mb-1.5 h-auto px-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5e656d] group-data-[collapsible=icon]:hidden">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const isActive = pathname === item.to;
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className={cn(
                    "group/nav relative h-9 rounded-lg px-2.5 transition-[background-color,color,border-color] duration-150",
                    "group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center",
                    isActive
                      ? "!bg-[#132019] !text-[#f3f4f2] font-medium border border-emerald-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:!bg-[#16261d]"
                      : "text-[#8e959e] border border-transparent hover:bg-white/[0.04] hover:text-[#eef0ec]",
                  )}
                >
                  <Link to={item.to} className="flex items-center gap-2.5">
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2.5px] rounded-r-full bg-emerald-400 group-data-[collapsible=icon]:hidden"
                      />
                    ) : null}
                    <item.icon
                      strokeWidth={1.75}
                      className={cn(
                        "size-4 shrink-0 transition-[color,transform] duration-150",
                        isActive
                          ? "text-emerald-400"
                          : "text-[#6e757e] group-hover/nav:text-[#d4d8dc] group-hover/nav:translate-x-[1px]",
                      )}
                    />
                    <span className="truncate text-[13px] tracking-[-0.01em] group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

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
      <SidebarProvider
        style={
          {
            "--sidebar-width": "15.5rem",
            "--sidebar-width-icon": "3.75rem",
          } as CSSProperties
        }
      >
        <AmbientCanvas />

        <Sidebar
          collapsible="icon"
          className="relative z-20 border-r border-white/[0.06] bg-[#0f1215]"
        >
          <SidebarHeader className="border-b border-white/[0.05] px-3.5 py-4 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-3.5">
            <Link
              to="/"
              aria-label="CodeMate AI home"
              className="group/brand flex items-center rounded-lg px-0.5 py-0.5 transition-opacity duration-150 hover:opacity-90 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <CodeMateLogo
                size={32}
                tone="dark"
                subtitle="Studio Workspace"
                className="group-data-[collapsible=icon]:hidden"
              />
              <CodeMateLogo
                size={32}
                tone="dark"
                compact
                className="hidden group-data-[collapsible=icon]:inline-flex"
              />
            </Link>
          </SidebarHeader>

          <SidebarContent className="gap-6 overflow-x-hidden px-3 py-5 group-data-[collapsible=icon]:px-2">
            <SidebarNavGroup label="Code Intelligence" items={CODE_NAV} pathname={pathname} />
            <SidebarNavGroup label="Career & Prep" items={CAREER_NAV} pathname={pathname} />
          </SidebarContent>

          <SidebarFooter className="border-t border-white/[0.05] p-3 group-data-[collapsible=icon]:px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Back to Landing"
                  className="group/back h-9 rounded-lg px-2.5 text-[#7a828a] transition-[background-color,color] duration-150 hover:bg-white/[0.04] hover:text-[#f3f4f2] group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"
                >
                  <Link to="/" className="flex items-center gap-2.5">
                    <ArrowLeft
                      strokeWidth={1.75}
                      className="size-4 shrink-0 transition-transform duration-150 group-hover/back:-translate-x-0.5"
                    />
                    <span className="truncate text-[12.5px] font-medium tracking-[-0.01em] group-data-[collapsible=icon]:hidden">
                      Back to Landing
                    </span>
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
