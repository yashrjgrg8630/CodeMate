import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bug, Flame, Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getProgress } from "@/services/progressService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BackendBadge,
  LoadingSkeleton,
  PageHeader,
  RequestError,
  StatCard,
} from "@/components/app/shared";

export const Route = createFileRoute("/_app/progress")({
  head: () => ({
    meta: [
      { title: "Progress — CodeMate AI" },
      {
        name: "description",
        content:
          "Weekly activity, topic performance, interview trend and your Algorithm DNA profile in one view.",
      },
      { property: "og:title", content: "Progress — CodeMate AI" },
      {
        property: "og:description",
        content: "Visualise practice consistency and algorithmic strengths.",
      },
    ],
  }),
  component: ProgressPage,
});

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ProgressPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["progress"],
    queryFn: getProgress,
    refetchOnMount: "always",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress"
        description="How your practice, optimisation and interview performance are trending."
        actions={<BackendBadge />}
      />

      {isError ? <RequestError onRetry={() => void refetch()} /> : null}
      {!isError && (isLoading || !data) ? <LoadingSkeleton rows={4} /> : null}
      {!isError && data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Problems solved"
              value={data.problemsSolved}
              hint={`${data.problemsAttempted} attempted`}
              icon={<Activity className="size-4" />}
            />
            <StatCard
              label="Current streak"
              value={`${data.streak} days`}
              icon={<Flame className="size-4" />}
            />
            <StatCard
              label="Optimizations"
              value={data.optimizations}
              icon={<Sparkles className="size-4" />}
            />
            <StatCard
              label="Bugs fixed"
              value={data.bugsFixed}
              hint={`Avg interview ${data.averageInterviewScore}/100`}
              icon={<Bug className="size-4" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Weekly activity" description="Problems solved vs analyses run.">
              <BarChart data={data.weeklyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="problems" fill="var(--color-chart-1)" radius={4} />
                <Bar dataKey="analyses" fill="var(--color-chart-2)" radius={4} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Topic performance" description="Readiness score per DSA topic.">
              <BarChart data={data.topicPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" domain={[0, 100]} fontSize={12} />
                <YAxis type="category" dataKey="topic" width={110} fontSize={12} />
                <Tooltip />
                <Bar dataKey="score" fill="var(--color-chart-3)" radius={4} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Interview trend" description="Overall score across mock sessions.">
              <LineChart data={data.interviewPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="session" fontSize={12} />
                <YAxis domain={[0, 100]} fontSize={12} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ChartCard>

            <ChartCard title="Algorithm usage" description="Which patterns you reach for most.">
              <PieChart>
                <Tooltip />
                <Pie
                  data={data.algorithmUsage}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={95}
                  label
                >
                  {data.algorithmUsage.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartCard>
          </div>

          <ChartCard
            title="Algorithm DNA"
            description="Your relative strength across core problem-solving styles."
          >
            <RadarChart data={data.algorithmDna} outerRadius="72%">
              <PolarGrid stroke="var(--color-border)" />
              <PolarAngleAxis dataKey="pattern" fontSize={12} />
              <Radar
                dataKey="strength"
                stroke="var(--color-chart-1)"
                fill="var(--color-chart-1)"
                fillOpacity={0.35}
              />
              <Tooltip />
            </RadarChart>
          </ChartCard>
        </>
      ) : null}
    </div>
  );
}
