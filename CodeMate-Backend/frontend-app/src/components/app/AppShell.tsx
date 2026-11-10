import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Activity,
  ArrowLeftRight,
  Braces,
  BriefcaseBusiness,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
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
import { logout } from "@/services/authService";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["auth", "me"] });
      await navigate({ to: "/login" });
    },
  });

  useEffect(() => {
    const handleUnauthorized = () => {
      void navigate({ to: "/login" });
    };
    window.addEventListener("codemate:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("codemate:unauthorized", handleUnauthorized);
  }, [navigate]);

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
          <Button
            className="ml-auto"
            variant="ghost"
            size="sm"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            <LogOut className="size-4" />
            {signOut.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
