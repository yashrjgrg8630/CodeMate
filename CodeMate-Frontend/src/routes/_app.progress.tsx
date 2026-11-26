import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Bug,
  Flame,
  GitBranch,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { getProgress, type ProgressRange } from "@/services/progressService";
import type { ProgressReport } from "@/types/domain";
import { BackendBadge, LoadingSkeleton, RequestError } from "@/components/app/shared";

export const Route = createFileRoute("/_app/progress")({
  head: () => ({
    meta: [
      { title: "Progress & Algorithm DNA — CodeMate AI" },
      {
        name: "description",
        content:
          "Explore your real practice activity, topic signals, interview history, and algorithm profile.",
      },
      { property: "og:title", content: "Progress & Algorithm DNA — CodeMate AI" },
      {
        property: "og:description",
        content: "A measured view of practice consistency and problem-solving patterns.",
      },
    ],
  }),
  component: ProgressPage,
});

const RANGE_OPTIONS: { value: ProgressRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const TOOLTIP_STYLE = {
  border: "1px solid #3b4140",
  borderRadius: 12,
  backgroundColor: "#1d2220",
  color: "#f3f1e8",
  boxShadow: "0 12px 30px rgb(0 0 0 / 24%)",
  fontSize: 12,
};

function ProgressPage() {
  const [range, setRange] = useState<ProgressRange>("30d");
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["progress", range],
    queryFn: () => getProgress(range),
    refetchOnMount: "always",
  });

  return (
    <main className="progress-workspace">
      <header className="progress-page-header">
        <div className="progress-page-title">
          <p className="progress-eyebrow">
            <Activity aria-hidden="true" />
            YOUR PRACTICE, MADE VISIBLE
          </p>
          <h1>Progress &amp; Algorithm DNA</h1>
          <p>
            A clear view of your practice rhythm, topic signals, interview history, and the patterns
            you use to solve problems.
          </p>
        </div>
        <div className="progress-header-actions">
          <label className="progress-range-select">
            <span>Time range</span>
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as ProgressRange)}
              aria-label="Filter progress by time range"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <BackendBadge />
        </div>
      </header>

      {isError ? <RequestError onRetry={() => void refetch()} /> : null}
      {!isError && isLoading ? <LoadingSkeleton rows={4} /> : null}
      {!isError && data ? (
        <div className="progress-dashboard" aria-busy={isFetching}>
          <section className="progress-kpis" aria-label="Key progress metrics">
            <MetricCard
              label="Problems solved"
              value={data.problemsSolved}
              suffix="problems"
              hint={`${data.problemsAttempted} attempt${data.problemsAttempted === 1 ? "" : "s"} in this period`}
              icon={<Activity aria-hidden="true" />}
              accent="mint"
              to="/roadmap"
            />
            <MetricCard
              label="Current streak"
              value={data.streak}
              suffix="days"
              hint="Current · based on all recorded activity"
              icon={<Flame aria-hidden="true" />}
              accent="lime"
            />
            <MetricCard
              label="Optimizations completed"
              value={data.optimizations}
              suffix="runs"
              hint={`${data.bugsFixed} linked bugs fixed in this period`}
              icon={<Sparkles aria-hidden="true" />}
              accent="violet"
              to="/optimizer"
            />
            <MetricCard
              label="Interview performance"
              value={data.interviewsCompleted > 0 ? data.averageInterviewScore : "—"}
              suffix={data.interviewsCompleted > 0 ? "/100" : ""}
              hint={
                data.interviewsCompleted > 0
                  ? `${data.interviewsCompleted} completed ${data.interviewsCompleted === 1 ? "interview" : "interviews"}`
                  : "No completed interviews in this period"
              }
              icon={<BrainCircuit aria-hidden="true" />}
              accent="ivory"
              to="/interview"
            />
          </section>

          <section
            className="progress-panel progress-activity-panel"
            aria-labelledby="activity-title"
          >
            <PanelHeading
              eyebrow="CONSISTENCY"
              title="Practice activity"
              description={
                data.activityGranularity === "day"
                  ? "Daily work recorded across problem practice, analysis, optimization, and interviews."
                  : "All recorded activity, grouped by calendar month."
              }
              id="activity-title"
              action={
                <span className="progress-period-note">
                  {data.activityGranularity === "day" ? "DAILY ACTIVITY" : "MONTHLY ACTIVITY"}
                </span>
              }
            />
            {data.activityHistory.some((item) => activityTotal(item) > 0) ? (
              data.activityGranularity === "day" ? (
                <ActivityHeatmap entries={data.activityHistory} />
              ) : (
                <div className="progress-chart progress-activity-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.activityHistory}
                      margin={{ top: 10, right: 12, bottom: 4, left: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="#343a37" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        minTickGap={28}
                        tickMargin={10}
                        tick={{ fill: "#929a92", fontSize: 11 }}
                        tickFormatter={formatMonth}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        width={34}
                        tick={{ fill: "#929a92", fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(label) => formatMonth(String(label))}
                      />
                      <Bar
                        dataKey="problems"
                        name="Practice"
                        stackId="a"
                        fill="#a6c078"
                        maxBarSize={64}
                      />
                      <Bar
                        dataKey="analyses"
                        name="Analysis"
                        stackId="a"
                        fill="#83bba7"
                        maxBarSize={64}
                      />
                      <Bar
                        dataKey="optimizations"
                        name="Optimizations"
                        stackId="a"
                        fill="#a69bc4"
                        maxBarSize={64}
                      />
                      <Bar
                        dataKey="interviews"
                        name="Interviews"
                        stackId="a"
                        fill="#d2bd8e"
                        maxBarSize={64}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : (
              <EmptyPanelState
                icon={<Activity aria-hidden="true" />}
                title="No activity in this range"
                description="Practice and analysis events will appear here when they are recorded."
              />
            )}
            {data.activityHistory.some((item) => activityTotal(item) > 0) ? (
              <div className="progress-activity-footer">
                <span>
                  <strong>
                    {data.activityHistory.filter((item) => activityTotal(item) > 0).length}
                  </strong>{" "}
                  active {data.activityGranularity === "day" ? "days" : "months"}
                </span>
                <div className="progress-chart-legend" aria-label="Activity categories">
                  <LegendItem color="#a6c078" label="Practice" />
                  <LegendItem color="#83bba7" label="Analysis" />
                  <LegendItem color="#a69bc4" label="Optimizations" />
                  <LegendItem color="#d2bd8e" label="Interviews" />
                </div>
              </div>
            ) : null}
          </section>

          <div className="progress-insights-grid">
            <section className="progress-panel progress-topic-panel" aria-labelledby="topic-title">
              <PanelHeading
                eyebrow="TOPIC SIGNALS"
                title="Where your practice is landing"
                description={
                  data.range === "all"
                    ? "Measured signal from scored analyses, interview answers, and saved roadmap progress."
                    : "Scored analysis and interview signals recorded within this time range."
                }
                id="topic-title"
                action={
                  <Link to="/roadmap" className="progress-text-link">
                    Open roadmap <ArrowUpRight aria-hidden="true" />
                  </Link>
                }
              />
              {data.topicPerformance.length ? (
                <div className="progress-topic-list">
                  {[...data.topicPerformance]
                    .sort((a, b) => b.score - a.score)
                    .map((item) => (
                      <Link
                        key={item.topic}
                        to="/roadmap"
                        className="progress-topic-row"
                        title={`${item.topic}: ${item.score} from ${item.evidence} recorded signals. Open the DSA roadmap.`}
                      >
                        <span className="progress-topic-row-top">
                          <strong>{item.topic}</strong>
                          <span>
                            {item.score}
                            <small>/100</small>
                          </span>
                        </span>
                        <span
                          className="progress-topic-track"
                          role="progressbar"
                          aria-label={`${item.topic} measured signal`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={item.score}
                        >
                          <span style={{ width: `${item.score}%` }} />
                        </span>
                        <span className="progress-topic-evidence">
                          {item.evidence} recorded {item.evidence === 1 ? "signal" : "signals"}
                        </span>
                      </Link>
                    ))}
                </div>
              ) : (
                <EmptyPanelState
                  icon={<GitBranch aria-hidden="true" />}
                  title="Not enough scored topic data yet"
                  description="Topic signals appear after analyses, interview answers, or roadmap progress are recorded in this period."
                />
              )}
            </section>

            <section
              className="progress-panel progress-interview-panel"
              aria-labelledby="interview-title"
            >
              <PanelHeading
                eyebrow="MOCK INTERVIEWS"
                title="Interview performance"
                description="Scores from completed interview reports in this time range."
                id="interview-title"
                action={
                  data.interviewsCompleted ? (
                    <span className="progress-average">
                      AVG <strong>{data.averageInterviewScore}</strong>
                    </span>
                  ) : null
                }
              />
              {data.interviewPerformance.length ? (
                <div className="progress-chart progress-interview-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.interviewPerformance}
                      margin={{ top: 12, right: 14, bottom: 4, left: -12 }}
                    >
                      <CartesianGrid vertical={false} stroke="#343a37" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        minTickGap={24}
                        tickMargin={10}
                        tick={{ fill: "#929a92", fontSize: 11 }}
                        tickFormatter={formatShortDate}
                      />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        tick={{ fill: "#929a92", fontSize: 11 }}
                      />
                      <Tooltip content={<InterviewTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        name="Score"
                        stroke="#d2bd8e"
                        strokeWidth={3}
                        activeDot={{ r: 6, fill: "#d2bd8e", stroke: "#252a27", strokeWidth: 3 }}
                        dot={{ r: 4, fill: "#d2bd8e", stroke: "#252a27", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanelState
                  icon={<BrainCircuit aria-hidden="true" />}
                  title="No completed interviews in this period"
                  description="Complete a mock interview to see dated scores and session details here."
                  action={
                    <Link to="/interview" className="progress-text-link">
                      Start an interview <ArrowUpRight aria-hidden="true" />
                    </Link>
                  }
                />
              )}
            </section>
          </div>

          <section className="progress-panel progress-dna-panel" aria-labelledby="dna-title">
            <PanelHeading
              eyebrow="ALGORITHM DNA"
              title="Your problem-solving profile"
              description="Pattern strength is based on analysis health and repeated use. Unmeasured patterns stay explicitly unscored."
              id="dna-title"
            />
            <div className="progress-dna-grid">
              <div className="progress-dna-patterns">
                {data.algorithmDna.map((item) => (
                  <article className="progress-dna-card" key={item.pattern}>
                    <div className="progress-dna-card-heading">
                      <span className={`progress-dna-icon pattern-${patternKey(item.pattern)}`}>
                        <DnaIcon pattern={item.pattern} />
                      </span>
                      <span>
                        <strong>{patternLabel(item.pattern)}</strong>
                        <small>
                          {item.sampleCount} {item.sampleCount === 1 ? "analysis" : "analyses"}
                        </small>
                      </span>
                      <b>{item.strength === null ? "—" : `${item.strength}`}</b>
                    </div>
                    {item.strength !== null ? (
                      <div
                        className="progress-dna-track"
                        role="progressbar"
                        aria-label={`${item.pattern} measured strength`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={item.strength}
                      >
                        <span style={{ width: `${item.strength}%` }} />
                      </div>
                    ) : (
                      <p className="progress-dna-insufficient">
                        Not enough analysis data to measure
                      </p>
                    )}
                  </article>
                ))}
              </div>
              <aside className="progress-usage-panel" aria-label="Most used algorithm patterns">
                <div className="progress-usage-heading">
                  <div>
                    <span className="progress-section-eyebrow">ANALYSIS HISTORY</span>
                    <h3>Patterns encountered</h3>
                  </div>
                  <Lightbulb aria-hidden="true" />
                </div>
                {data.algorithmUsage.length ? (
                  <div className="progress-usage-list">
                    {data.algorithmUsage.map((item) => {
                      const max = Math.max(...data.algorithmUsage.map((entry) => entry.value));
                      return (
                        <div className="progress-usage-item" key={item.name}>
                          <div>
                            <span>{item.name}</span>
                            <strong>{item.value}</strong>
                          </div>
                          <span className="progress-usage-track">
                            <span style={{ width: `${(item.value / max) * 100}%` }} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="progress-usage-empty">
                    Pattern usage appears after code analyses are recorded.
                  </p>
                )}
              </aside>
            </div>
          </section>

          {isFetching ? (
            <p className="progress-refresh-indicator">Updating this time range…</p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  hint,
  icon,
  accent,
  to,
}: {
  label: string;
  value: string | number;
  suffix: string;
  hint: string;
  icon: ReactNode;
  accent: "mint" | "lime" | "violet" | "ivory";
  to?: "/roadmap" | "/optimizer" | "/interview";
}) {
  const content = (
    <>
      <div className="progress-metric-heading">
        <span>{label}</span>
        <span className={`progress-metric-icon accent-${accent}`}>{icon}</span>
      </div>
      <div className="progress-metric-value">
        <strong>{value}</strong>
        {suffix ? <span>{suffix}</span> : null}
      </div>
      <p>{hint}</p>
      {to ? <ArrowUpRight className="progress-metric-link-icon" aria-hidden="true" /> : null}
    </>
  );

  return to ? (
    <Link to={to} className={`progress-metric-card is-link accent-${accent}`}>
      {content}
    </Link>
  ) : (
    <article className={`progress-metric-card accent-${accent}`}>{content}</article>
  );
}

function PanelHeading({
  eyebrow,
  title,
  description,
  id,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  id: string;
  action?: ReactNode;
}) {
  return (
    <div className="progress-panel-heading">
      <div>
        <p className="progress-section-eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="progress-panel-action">{action}</div> : null}
    </div>
  );
}

function EmptyPanelState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="progress-empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function ActivityHeatmap({ entries }: { entries: ProgressReport["activityHistory"] }) {
  const weekdayOffset = (weekday(entries[0]?.date ?? "") + 6) % 7;
  const columns = Math.ceil((weekdayOffset + entries.length) / 7);
  const maxActivity = Math.max(...entries.map(activityTotal), 0);
  const monthLabels = Array.from({ length: columns }, () => "");

  entries.forEach((entry, index) => {
    const column = Math.floor((weekdayOffset + index) / 7);
    if (index === 0 || entry.date.slice(5, 7) !== entries[index - 1]?.date.slice(5, 7)) {
      monthLabels[column] = formatMonth(entry.date.slice(0, 7));
    }
  });

  return (
    <div className="progress-heatmap-layout">
      <div className="progress-heatmap-weekdays" aria-hidden="true">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="progress-heatmap-content">
        <div
          className="progress-heatmap-months"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          aria-hidden="true"
        >
          {monthLabels.map((label, index) => (
            <span key={`${index}-${label}`} style={{ gridColumn: index + 1 }}>
              {label}
            </span>
          ))}
        </div>
        <div
          className="progress-heatmap-grid"
          role="grid"
          aria-label="Daily activity heatmap"
          style={{
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gridTemplateRows: "repeat(7, 18px)",
          }}
        >
          {entries.map((entry, index) => {
            const count = activityTotal(entry);
            const level = activityLevel(count, maxActivity);
            const col = Math.floor((weekdayOffset + index) / 7) + 1;
            const row = ((weekday(entry.date) + 6) % 7) + 1;
            const title = `${formatDate(entry.date)} · ${count} activities: ${entry.problems} practice, ${entry.analyses} analyses, ${entry.optimizations} optimizations, ${entry.interviews} interviews`;
            return (
              <span
                className={`progress-heatmap-cell level-${level}`}
                key={entry.date}
                role="gridcell"
                aria-label={title}
                title={title}
                style={{ gridColumn: col, gridRow: row }}
              />
            );
          })}
        </div>
      </div>
      <div className="progress-heatmap-legend" aria-label="Activity intensity scale">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span className={`progress-heatmap-cell level-${level}`} key={level} aria-hidden="true" />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="progress-legend-item">
      <i style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function InterviewTooltip({ active, payload }: TooltipProps<number, string>) {
  const point = payload?.[0]?.payload as ProgressReport["interviewPerformance"][number] | undefined;
  if (!active || !point) return null;

  return (
    <div className="progress-chart-tooltip">
      <strong>{point.session}</strong>
      <span>{point.detail || formatDate(point.date)}</span>
      <b>{point.score}/100</b>
    </div>
  );
}

function DnaIcon({ pattern }: { pattern: string }) {
  const Icon =
    pattern === "Recursion"
      ? GitBranch
      : pattern === "Greedy"
        ? Lightbulb
        : pattern === "Memoisation"
          ? BrainCircuit
          : pattern === "Divide & Conquer"
            ? Sparkles
            : pattern === "Hashing"
              ? Bug
              : Activity;
  return <Icon aria-hidden="true" />;
}

function activityTotal(item: ProgressReport["activityHistory"][number]): number {
  return item.problems + item.analyses + item.optimizations + item.interviews;
}

function activityLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  return Math.min(4, Math.ceil((count / max) * 4));
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatShortDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatMonth(month: string): string {
  const parsed = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function patternKey(pattern: string): string {
  return pattern.toLowerCase().replace(/[^a-z]+/g, "-");
}

function patternLabel(pattern: string): string {
  return pattern === "Memoisation" ? "Dynamic programming" : pattern;
}
