import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Clock3,
  Database,
  Gauge,
  Info,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import {
  cancelBenchmarkJob,
  getBenchmarkJob,
  startBenchmarkJob,
  type BenchmarkJob,
} from "@/services/benchmarkService";
import type { BenchmarkMetric, BenchmarkResult } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { BackendBadge, PageHeader } from "@/components/app/shared";

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

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function metric(result: BenchmarkResult | undefined, label: string): BenchmarkMetric | undefined {
  return result?.metrics.find((item) => item.label === label);
}

function formatValue(value: number, unit: string): string {
  const digits = Math.abs(value) < 10 ? 2 : 1;
  return `${value.toFixed(digits)} ${unit}`;
}

function BenchmarkPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const jobQuery = useQuery({
    queryKey: ["benchmark-job", jobId],
    queryFn: () => {
      if (!jobId) throw new Error("No benchmark job is selected.");
      return getBenchmarkJob(jobId);
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const current = query.state.data as BenchmarkJob | undefined;
      return current && TERMINAL_STATUSES.has(current.status) ? false : 700;
    },
    refetchIntervalInBackground: true,
  });
  const startMutation = useMutation({
    mutationFn: () => startBenchmarkJob({}),
    onSuccess: (job) => {
      setJobId(job.id);
      queryClient.setQueryData(["benchmark-job", job.id], job);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: cancelBenchmarkJob,
    onSuccess: (job) => queryClient.setQueryData(["benchmark-job", job.id], job),
  });

  const job = jobQuery.data;
  const result = job?.status === "completed" ? job.result : undefined;
  const isRunning = Boolean(
    job && ["queued", "running", "measuring", "saving", "cancelling"].includes(job.status),
  );
  const execution = metric(result, "Execution Time");
  const memory = metric(result, "Memory Usage");
  const finalPoint = result?.executionSeries[result.executionSeries.length - 1];
  const change = result?.performanceChangePercent ?? null;
  const absoluteChange = Math.abs(change ?? 0);
  const changeLabel =
    change === null
      ? "Relative change unavailable"
      : change > 0
        ? `${absoluteChange}% faster`
        : change < 0
          ? `${absoluteChange}% slower`
          : "No measurable runtime difference";
  const memoryData = memory
    ? [
        { implementation: "Original", allocation: memory.original },
        { implementation: "Optimized", allocation: memory.optimized },
      ]
    : [];
  const startError = startMutation.error instanceof Error ? startMutation.error.message : null;
  const pollError = jobQuery.error instanceof Error ? jobQuery.error.message : null;
  const cancelError = cancelMutation.error instanceof Error ? cancelMutation.error.message : null;

  return (
    <div className="benchmark-page">
      <PageHeader
        eyebrow="Code Intelligence / Performance"
        title="Algorithmic Benchmark"
        description="A measured comparison of the original implementation and its optimized candidate."
        actions={
          <div className="benchmark-header-actions">
            <BackendBadge />
            {isRunning ? (
              <Button
                variant="outline"
                onClick={() => job && cancelMutation.mutate(job.id)}
                disabled={!job || job.status === "cancelling" || cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                {job?.status === "cancelling" ? "Cancelling…" : "Cancel run"}
              </Button>
            ) : (
              <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
                {startMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : result ? (
                  <RotateCcw className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {startMutation.isPending ? "Starting…" : result ? "Run again" : "Run benchmark"}
              </Button>
            )}
          </div>
        }
      />

      {isRunning && job ? (
        <section className="benchmark-run-status" aria-live="polite">
          <span className="benchmark-status-spinner">
            <LoaderCircle className="size-4 animate-spin" />
          </span>
          <div>
            <p className="benchmark-status-title">
              {job.status === "queued"
                ? "Queued"
                : job.status === "saving"
                  ? "Saving results"
                  : "Benchmark in progress"}
            </p>
            <p className="benchmark-status-message">{job.message}</p>
          </div>
          <span className="benchmark-status-stage">{job.status}</span>
        </section>
      ) : null}

      {startError || pollError || cancelError || (job?.status === "failed" && job.error) ? (
        <section className="benchmark-error" role="alert">
          <div>
            <p className="benchmark-error-title">The benchmark could not be completed.</p>
            <p>{job?.status === "failed" ? job.error : (startError ?? pollError ?? cancelError)}</p>
          </div>
          {jobQuery.isError && jobId ? (
            <Button variant="outline" size="sm" onClick={() => void jobQuery.refetch()}>
              Retry status
            </Button>
          ) : !isRunning ? (
            <Button variant="outline" size="sm" onClick={() => startMutation.mutate()}>
              <RotateCcw className="size-3.5" />
              Try again
            </Button>
          ) : null}
        </section>
      ) : null}

      {!result && !isRunning && !startMutation.isPending && job?.status !== "failed" ? (
        <section className="benchmark-empty">
          <div className="benchmark-empty-icon">
            <Gauge className="size-5" />
          </div>
          <div>
            <p className="benchmark-empty-title">
              {job?.status === "cancelled" ? "Run cancelled" : "Ready to measure"}
            </p>
            <p className="benchmark-empty-copy">
              {job?.status === "cancelled"
                ? "No result was saved. Start another run whenever you are ready."
                : "Run Code Optimizer first to create a candidate. We will benchmark its actual code against the original and verify it if it has no stored verification evidence."}
            </p>
          </div>
          {job?.status === "cancelled" ? (
            <Button variant="outline" onClick={() => startMutation.mutate()}>
              <Play className="size-4" /> Run benchmark
            </Button>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <>
          <section className="benchmark-summary" aria-label="Benchmark summary">
            <article className="benchmark-summary-primary">
              <div className="benchmark-summary-label">
                <Clock3 className="size-4" />
                Runtime at {finalPoint?.input ?? "largest input"}
              </div>
              <div className="benchmark-runtime-values">
                <div>
                  <span className="benchmark-runtime-caption">Optimized</span>
                  <strong>
                    {execution ? formatValue(execution.optimized, execution.unit) : "—"}
                  </strong>
                </div>
                <span className="benchmark-runtime-divider" aria-hidden="true">
                  /
                </span>
                <div>
                  <span className="benchmark-runtime-caption">Original</span>
                  <span className="benchmark-runtime-original">
                    {execution ? formatValue(execution.original, execution.unit) : "—"}
                  </span>
                </div>
              </div>
              <p
                className={`benchmark-runtime-change ${change !== null && change < 0 ? "is-slower" : ""}`}
              >
                {change === null ? (
                  <Info className="size-4" />
                ) : change < 0 ? (
                  <ArrowDownRight className="size-4" />
                ) : (
                  <ArrowUpRight className="size-4" />
                )}
                {changeLabel}
                {change !== null ? " at the largest measured input" : ""}
                {finalPoint && (finalPoint.originalEstimated || finalPoint.optimizedEstimated)
                  ? " · includes an extrapolated value"
                  : ""}
              </p>
            </article>

            <article className="benchmark-summary-card">
              <div className="benchmark-summary-label">
                <Database className="size-4" /> Peak allocation
              </div>
              <div className="benchmark-summary-value">
                {memory ? formatValue(memory.optimized, memory.unit) : "—"}
              </div>
              <p className="benchmark-summary-detail">
                Optimized · {memory ? formatValue(memory.original, memory.unit) : "—"} original
              </p>
              <p className="benchmark-summary-footnote">At 5K inputs · Python tracemalloc</p>
            </article>

            <article className="benchmark-summary-card">
              <div className="benchmark-summary-label">
                <ShieldCheck className="size-4" /> Equivalence checks
              </div>
              <div className="benchmark-summary-value">
                {result.verification.passed}
                <span>/{result.verification.total}</span>
              </div>
              <p className="benchmark-summary-detail">
                {result.verification.failed === 0
                  ? "All generated cases matched"
                  : `${result.verification.failed} case${result.verification.failed === 1 ? "" : "s"} differed`}
              </p>
              <p className="benchmark-summary-footnote">
                {result.trustScore.correctness}% correctness score
              </p>
            </article>
          </section>

          <div className="benchmark-candidate-line">
            <span>Comparing</span>
            <strong>{result.candidate.approach}</strong>
            <span className="benchmark-language">{result.candidate.language}</span>
            <span className="benchmark-complexity">
              {result.originalComplexity.time} <span aria-hidden="true">→</span>{" "}
              {result.optimizedComplexity.time}
              <span className="benchmark-complexity-caption">time complexity</span>
            </span>
          </div>

          <section className="benchmark-charts">
            <article className="benchmark-panel benchmark-runtime-panel">
              <header className="benchmark-panel-heading">
                <div>
                  <p className="benchmark-kicker">Execution profile</p>
                  <h2>Runtime scales with input</h2>
                  <p>Measured wall-clock time for the same generated inputs.</p>
                </div>
                <span className="benchmark-unit">milliseconds</span>
              </header>
              <div className="benchmark-runtime-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={result.executionSeries}
                    margin={{ top: 10, right: 16, bottom: 4, left: 2 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 6" />
                    <XAxis
                      dataKey="input"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      label={{
                        value: "Input size",
                        position: "insideBottom",
                        offset: -2,
                        fill: "var(--muted-foreground)",
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      width={52}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      tickFormatter={(value: number) => `${value} ms`}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--border)", strokeDasharray: "3 4" }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      formatter={(value, name, item) => {
                        const point = item.payload;
                        const estimated =
                          typeof point === "object" &&
                          point !== null &&
                          ((name === "original" &&
                            "originalEstimated" in point &&
                            point.originalEstimated === true) ||
                            (name === "optimized" &&
                              "optimizedEstimated" in point &&
                              point.optimizedEstimated === true));
                        const label = name === "original" ? "Original" : "Optimized";
                        return [
                          `${Number(value).toFixed(2)} ms${estimated ? " · estimated" : ""}`,
                          label,
                        ];
                      }}
                      labelFormatter={(label) => `${label} items`}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      iconType="circle"
                      iconSize={7}
                      formatter={(value) => (value === "original" ? "Original" : "Optimized")}
                    />
                    <Line
                      name="original"
                      type="monotone"
                      dataKey="original"
                      stroke="var(--chart-5)"
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 1 }}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      animationDuration={400}
                    />
                    <Line
                      name="optimized"
                      type="monotone"
                      dataKey="optimized"
                      stroke="var(--chart-1)"
                      strokeWidth={2.5}
                      dot={{ r: 3, strokeWidth: 1 }}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      animationDuration={400}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div
                className="benchmark-series-table"
                role="table"
                aria-label="Measured runtime data"
              >
                <div className="benchmark-series-row benchmark-series-head" role="row">
                  <span role="columnheader">Input</span>
                  <span role="columnheader">Original</span>
                  <span role="columnheader">Optimized</span>
                </div>
                {result.executionSeries.map((point) => (
                  <div className="benchmark-series-row" role="row" key={point.input}>
                    <span role="cell">{point.input}</span>
                    <span role="cell">
                      {formatValue(point.original, "ms")}
                      {point.originalEstimated ? <em>est.</em> : null}
                    </span>
                    <span role="cell">
                      {formatValue(point.optimized, "ms")}
                      {point.optimizedEstimated ? <em>est.</em> : null}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="benchmark-panel benchmark-memory-panel">
              <header className="benchmark-panel-heading">
                <div>
                  <p className="benchmark-kicker">Memory profile</p>
                  <h2>Peak allocation</h2>
                  <p>Python-managed memory at the largest common input.</p>
                </div>
                <span className="benchmark-unit">MB</span>
              </header>
              <div className="benchmark-memory-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={memoryData}
                    layout="vertical"
                    margin={{ top: 10, right: 18, bottom: 0, left: 4 }}
                  >
                    <CartesianGrid
                      horizontal={false}
                      stroke="var(--border)"
                      strokeDasharray="2 6"
                    />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      tickFormatter={(value: number) => `${value} MB`}
                    />
                    <YAxis
                      type="category"
                      dataKey="implementation"
                      width={76}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      formatter={(value) => [`${Number(value).toFixed(3)} MB`, "Peak allocation"]}
                    />
                    <Bar
                      dataKey="allocation"
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                      animationDuration={400}
                    >
                      {memoryData.map((item) => (
                        <Cell
                          key={item.implementation}
                          fill={
                            item.implementation === "Optimized"
                              ? "var(--chart-1)"
                              : "var(--chart-5)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="benchmark-memory-caption">
                <Info className="size-3.5" />
                This is traced Python allocation, not total process memory or native runtime RSS.
              </div>
            </article>
          </section>

          <section className="benchmark-detail-grid">
            <article className="benchmark-panel benchmark-verification">
              <header className="benchmark-panel-heading">
                <div>
                  <p className="benchmark-kicker">Correctness</p>
                  <h2>Equivalence verification</h2>
                  <p>Original and optimized code were run against the same cases.</p>
                </div>
                {result.verification.failed === 0 ? (
                  <span className="benchmark-check-icon">
                    <Check className="size-4" />
                  </span>
                ) : null}
              </header>
              <div className="benchmark-verification-score">
                <strong>{result.verification.passed}</strong>
                <span>of {result.verification.total} cases passed</span>
              </div>
              <div
                className="benchmark-verification-track"
                role="progressbar"
                aria-label="Equivalence cases passed"
                aria-valuenow={result.verification.passed}
                aria-valuemin={0}
                aria-valuemax={result.verification.total}
              >
                <span
                  style={{
                    width: `${result.verification.total ? (result.verification.passed / result.verification.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="benchmark-verification-foot">
                {result.verification.failed === 0
                  ? "Every generated case returned the same result."
                  : `${result.verification.failed} case${result.verification.failed === 1 ? "" : "s"} returned different results.`}
              </p>
            </article>

            <article className="benchmark-panel benchmark-trust">
              <header className="benchmark-panel-heading">
                <div>
                  <p className="benchmark-kicker">Signal quality</p>
                  <h2>Confidence indicators</h2>
                  <p>
                    Combines verification, measured performance and stored candidate confidence.
                  </p>
                </div>
              </header>
              <ScoreLine label="Correctness" value={result.trustScore.correctness} />
              <ScoreLine label="Measured performance" value={result.trustScore.optimization} />
              <ScoreLine label="Measurement reliability" value={result.trustScore.benchmark} />
            </article>
          </section>

          {(result.notes?.length ?? 0) > 0 ? (
            <details className="benchmark-notes">
              <summary>
                <Info className="size-4" /> Measurement notes{" "}
                <span>{result.notes?.length ?? 0}</span>
              </summary>
              <ul>
                {result.notes?.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ScoreLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="benchmark-score-line">
      <div className="benchmark-score-label">
        <span>{label}</span>
        <strong>
          {value}
          <small>%</small>
        </strong>
      </div>
      <div
        className="benchmark-score-track"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
