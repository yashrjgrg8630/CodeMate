import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Bug,
  Gauge,
  MessagesSquare,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboard } from "@/services/progressService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  LoadingSkeleton,
  MockBadge,
  PageHeader,
  QueryErrorState,
  StatCard,
} from "@/components/app/shared";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CodeMate AI" },
      {
        name: "description",
        content:
          "Track analyzed problems, detected bugs, optimizations and interview readiness in one CodeMate AI workspace.",
      },
      { property: "og:title", content: "Dashboard — CodeMate AI" },
      {
        property: "og:description",
        content: "Your code intelligence and interview preparation overview.",
      },
    ],
  }),
  component: DashboardPage,
});

const QUICK_ACTIONS = [
  { to: "/analyzer", label: "Analyze code", icon: Terminal },
  { to: "/optimizer", label: "Optimize", icon: Sparkles },
  { to: "/converter", label: "Convert language", icon: ArrowLeftRight },
  { to: "/interview", label: "Mock interview", icon: MessagesSquare },
] as const;

function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A single view of your code quality work and interview preparation."
        actions={<MockBadge />}
      />

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : isError ? (
        <QueryErrorState error={error} onRetry={() => void refetch()} />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Problems analyzed"
              value={data.stats.problemsAnalyzed}
              icon={<Terminal className="size-4" />}
            />
            <StatCard
              label="Bugs detected"
              value={data.stats.bugsDetected}
              icon={<Bug className="size-4" />}
            />
            <StatCard
              label="Optimizations found"
              value={data.stats.optimizationsFound}
              icon={<Sparkles className="size-4" />}
            />
            <StatCard
              label="Code conversions"
              value={data.stats.codeConversions}
              icon={<ArrowLeftRight className="size-4" />}
            />
            <StatCard
              label="Problems solved"
              value={data.stats.problemsSolved}
              icon={<Gauge className="size-4" />}
            />
            <StatCard
              label="Interview score"
              value={`${data.stats.interviewScore}/100`}
              icon={<MessagesSquare className="size-4" />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">Quick actions</CardTitle>
              <CardDescription>Jump straight into a tool.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => (
                <Button key={action.to} asChild variant="secondary">
                  <Link to={action.to}>
                    <action.icon className="size-4" />
                    {action.label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="font-display text-xl">Weakness heatmap</CardTitle>
                <CardDescription>Confidence score per DSA topic.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weaknessHeatmap} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid horizontal={false} stroke="var(--border)" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                    />
                    <YAxis
                      type="category"
                      dataKey="topic"
                      width={120}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Bar dataKey="score" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-display text-xl">Recent activity</CardTitle>
                <CardDescription>Latest actions in your workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.activity.length === 0 ? (
                  <EmptyState
                    title="No activity yet"
                    description="Your activity will appear here after your account is connected and you start using the tools."
                  />
                ) : (
                  data.activity.map((item) => (
                    <div
                      key={item.id}
                      className="flex gap-3 border-b border-border pb-3 last:border-0"
                    >
                      <Wand2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.label}</p>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {item.kind}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                        <p className="text-[11px] text-muted-foreground">{item.time}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
