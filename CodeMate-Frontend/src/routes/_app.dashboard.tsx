import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  MessagesSquare,
  Route as RouteIcon,
  Sparkles,
  Terminal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { clearActivities, deleteActivity, getDashboard } from "@/services/progressService";
import { getCurrentUser } from "@/services/authService";
import { LoadingSkeleton, RequestError } from "@/components/app/shared";
import type { ActivityItem, DashboardData } from "@/types/domain";

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

const TOOLS = [
  {
    to: "/analyzer",
    label: "Code Analyzer",
    description: "Find patterns, complexity, and bugs in your code.",
    icon: Terminal,
  },
  {
    to: "/optimizer",
    label: "Solution Optimizer",
    description: "Compare alternatives and verify improvements.",
    icon: Sparkles,
  },
  {
    to: "/converter",
    label: "Language Converter",
    description: "Translate code while keeping the intent intact.",
    icon: ArrowLeftRight,
  },
  {
    to: "/career",
    label: "Job Analyzer",
    description: "Map your experience to a role’s requirements.",
    icon: BriefcaseBusiness,
  },
  {
    to: "/roadmap",
    label: "DSA Roadmap",
    description: "Build a steady, trackable problem-solving plan.",
    icon: RouteIcon,
  },
  {
    to: "/interview",
    label: "Mock Interview",
    description: "Practice a live, adaptive technical interview.",
    icon: MessagesSquare,
  },
] as const;

const ACTIVITY_ICONS: Record<ActivityItem["kind"], LucideIcon> = {
  analysis: Terminal,
  optimization: Sparkles,
  conversion: ArrowLeftRight,
  career: BriefcaseBusiness,
  interview: MessagesSquare,
};

function DashboardPage() {
  const queryClient = useQueryClient();
  const userQuery = useQuery({ queryKey: ["auth", "me"], queryFn: getCurrentUser });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    refetchOnMount: "always",
  });

  const deleteMutation = useMutation({
    mutationFn: deleteActivity,
    onSuccess: (_, activityId) => {
      queryClient.setQueryData(["dashboard"], (current: DashboardData | undefined) => {
        if (!current) return current;
        return {
          ...current,
          activity: current.activity.filter((item) => item.id !== activityId),
        };
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: clearActivities,
    onSuccess: () => {
      queryClient.setQueryData(["dashboard"], (current: DashboardData | undefined) => {
        if (!current) return current;
        return {
          ...current,
          activity: [],
        };
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const firstName = userQuery.data?.name?.trim().split(/\s+/)[0];

  return (
    <div className="dashboard-page">
      <header className="dashboard-welcome">
        <div>
          <p className="dashboard-eyebrow">YOUR CODEMATE WORKSPACE</p>
          <h1>{firstName ? `Welcome back, ${firstName}.` : "Welcome back."}</h1>
          <p className="dashboard-welcome__copy">
            Your code work and interview preparation, in one place.
          </p>
        </div>
        <Link to="/analyzer" className="dashboard-analyze-button">
          <Terminal size={17} />
          <span>Analyze code</span>
          <ArrowRight size={16} />
        </Link>
      </header>

      {isError ? <RequestError onRetry={() => void refetch()} /> : null}
      {!isError && (isLoading || !data) ? (
        <div className="dashboard-loading" aria-label="Loading dashboard data">
          <LoadingSkeleton rows={3} />
        </div>
      ) : null}

      {!isError && data ? (
        <section className="dashboard-overview" aria-label="Workspace overview">
          <article className="dashboard-primary-stat">
            <div className="dashboard-primary-stat__heading">
              <p>Problems analyzed</p>
              <Terminal size={18} aria-hidden="true" />
            </div>
            <p className="dashboard-primary-stat__value metric">{data.stats.problemsAnalyzed}</p>
            <p className="dashboard-primary-stat__caption">Analyses saved to your workspace</p>
          </article>

          <div className="dashboard-supporting-stats">
            {[
              { label: "Bugs found", value: data.stats.bugsDetected },
              { label: "Optimizations", value: data.stats.optimizationsFound },
              { label: "Conversions", value: data.stats.codeConversions },
              { label: "Problems solved", value: data.stats.problemsSolved },
              { label: "Interview score", value: `${data.stats.interviewScore}/100` },
            ].map((stat) => (
              <div className="dashboard-support-stat" key={stat.label}>
                <p>{stat.label}</p>
                <span className="metric">{stat.value}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dashboard-tools-section" aria-labelledby="dashboard-tools-title">
        <div className="dashboard-section-heading">
          <div>
            <p className="dashboard-eyebrow">PICK UP A THREAD</p>
            <h2 id="dashboard-tools-title">Your tools</h2>
          </div>
          <p>Choose the next step that fits your work.</p>
        </div>

        <div className="dashboard-tool-grid">
          <Link to="/analyzer" className="dashboard-tool-feature">
            <div className="dashboard-tool-feature__top">
              <span className="dashboard-tool-feature__icon">
                <Terminal size={21} />
              </span>
              <ArrowUpRight size={19} />
            </div>
            <div className="dashboard-tool-feature__body">
              <p className="dashboard-tool-feature__overline">START WITH THE CODE</p>
              <h3>Code Analyzer</h3>
              <p>Trace patterns, complexity, and bugs in a solution you’re working through.</p>
            </div>
            <span className="dashboard-tool-feature__action">
              Open analyzer <ArrowRight size={15} />
            </span>
          </Link>

          <div className="dashboard-tool-list" aria-label="More CodeMate tools">
            {TOOLS.slice(1).map((tool) => (
              <Link to={tool.to} className="dashboard-tool-link" key={tool.to}>
                <span className="dashboard-tool-link__icon">
                  <tool.icon size={17} />
                </span>
                <span className="dashboard-tool-link__copy">
                  <span className="dashboard-tool-link__name">{tool.label}</span>
                  <span className="dashboard-tool-link__description">{tool.description}</span>
                </span>
                <ArrowUpRight size={15} className="dashboard-tool-link__arrow" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {!isError && data ? (
        <div className="dashboard-insights">
          <section className="dashboard-activity" aria-labelledby="dashboard-activity-title">
            <div className="dashboard-section-heading dashboard-section-heading--compact">
              <div>
                <p className="dashboard-eyebrow">FROM YOUR WORKSPACE</p>
                <h2 id="dashboard-activity-title">Recent activity</h2>
              </div>
              <div className="dashboard-activity-actions">
                <Link to="/history" className="dashboard-subtle-link">
                  View history <ArrowUpRight size={14} />
                </Link>
                {data.activity.length > 0 ? (
                  <button
                    type="button"
                    className="dashboard-clear-button"
                    onClick={() => clearAllMutation.mutate()}
                    disabled={clearAllMutation.isPending || deleteMutation.isPending}
                  >
                    {clearAllMutation.isPending ? "Clearing…" : "Clear all"}
                  </button>
                ) : null}
              </div>
            </div>

            {data.activity.length === 0 ? (
              <div className="dashboard-empty-activity">
                <div>
                  <p className="dashboard-empty-activity__title">A clean slate.</p>
                  <p>Run an analysis and your recent work will show up here.</p>
                </div>
                <Link to="/analyzer">
                  Analyze code <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <ol className="dashboard-activity-list">
                {data.activity.map((item) => {
                  const Icon = ACTIVITY_ICONS[item.kind];
                  return (
                    <li className="dashboard-activity-item" key={item.id}>
                      <span className="dashboard-activity-item__icon">
                        <Icon size={15} aria-hidden="true" />
                      </span>
                      <div className="dashboard-activity-item__content">
                        <p className="dashboard-activity-item__title">{item.label}</p>
                        {item.detail ? (
                          <p className="dashboard-activity-item__detail">{item.detail}</p>
                        ) : null}
                        <span className="dashboard-activity-item__kind">{item.kind}</span>
                      </div>
                      <span className="dashboard-activity-item__time">{item.time}</span>
                      <button
                        type="button"
                        className="dashboard-activity-item__delete"
                        aria-label={`Delete ${item.label}`}
                        title="Delete activity"
                        onClick={() => deleteMutation.mutate(item.id)}
                        disabled={deleteMutation.isPending || clearAllMutation.isPending}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="dashboard-readiness" aria-labelledby="dashboard-readiness-title">
            <div className="dashboard-section-heading dashboard-section-heading--compact">
              <div>
                <p className="dashboard-eyebrow">BASED ON YOUR ACTIVITY</p>
                <h2 id="dashboard-readiness-title">Topic readiness</h2>
              </div>
            </div>
            <p className="dashboard-readiness__intro">
              Scores reflect your analyses, interview answers, and roadmap progress.
            </p>

            {data.weaknessHeatmap.length > 0 ? (
              <div className="dashboard-readiness-list" role="list">
                {data.weaknessHeatmap.map(({ topic, score }) => (
                  <div className="dashboard-readiness-row" role="listitem" key={topic}>
                    <span className="dashboard-readiness-row__topic">{topic}</span>
                    <div
                      className="dashboard-readiness-row__track"
                      role="meter"
                      aria-label={`${topic} readiness`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={score}
                    >
                      <span style={{ width: `${score}%` }} />
                    </div>
                    <span className="dashboard-readiness-row__score metric">{score}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-readiness-empty">
                <p>No topic scores yet.</p>
                <span>
                  As you analyze code, complete roadmap problems, or practice interviews, your
                  profile will take shape.
                </span>
                <Link to="/roadmap">
                  Open DSA Roadmap <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
