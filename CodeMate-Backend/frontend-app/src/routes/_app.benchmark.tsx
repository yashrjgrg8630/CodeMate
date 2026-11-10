import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { runBenchmark } from "@/services/benchmarkService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  LoadingState,
  MockBadge,
  PageHeader,
  ScoreBar,
  StatCard,
} from "@/components/app/shared";

export const Route = createFileRoute("/_app/benchmark")({
  head: () => ({
    meta: [
      { title: "Benchmark — CodeMate AI" },
      {
        name: "description",
        content:
          "Compare original and optimized solutions across execution time, memory and verification results.",
      },
      { property: "og:title", content: "Benchmark — CodeMate AI" },
      { property: "og:description", content: "Before and after performance, side by side." },
    ],
  }),
  component: BenchmarkPage,
});

function BenchmarkPage() {
  const bench = useMutation({ mutationFn: runBenchmark });
  const data = bench.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benchmark"
        description="Measure the optimized solution against the original across growing input sizes."
        actions={
          <>
            <MockBadge />
            <Button onClick={() => bench.mutate({})} disabled={bench.isPending}>
              <Gauge className="size-4" />
              {bench.isPending ? "Running…" : "Run benchmark"}
            </Button>
          </>
        }
      />

      {bench.isPending ? <LoadingState label="Running benchmark across input sizes…" /> : null}
      {!data && !bench.isPending ? (
        <EmptyState
          title="No benchmark yet"
          description="Run a benchmark to compare execution time, memory usage and correctness."
        />
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.metrics.map((m) => (
              <StatCard
                key={m.label}
                label={m.label}
                value={`${m.optimized}${m.unit}`}
                hint={`was ${m.original}${m.unit}`}
              />
            ))}
            <StatCard
              label="Overall improvement"
              value={`${data.improvementPercent}%`}
              hint={`${data.originalComplexity.time} → ${data.optimizedComplexity.time}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">Execution time by input size</CardTitle>
              <CardDescription>Lower is better.</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.executionSeries}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="input" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="original"
                    stroke="var(--chart-5)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="optimized"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl">Verification</CardTitle>
                <CardDescription>Both solutions run against the same test inputs.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge className="bg-success text-success-foreground">
                  {data.verification.passed} passed
                </Badge>
                <Badge variant="outline">{data.verification.failed} failed</Badge>
                <Badge variant="outline">{data.verification.total} total</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl">Trust score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScoreBar label="Correctness" value={data.trustScore.correctness} />
                <ScoreBar label="Optimization" value={data.trustScore.optimization} />
                <ScoreBar label="Benchmark reliability" value={data.trustScore.benchmark} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
