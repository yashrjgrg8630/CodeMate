import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Sparkles,
  Upload,
} from "lucide-react";
import type { JobAnalysis, ResumeMatchRoadmap, SkillGap } from "@/types/domain";
import { analyzeJobDescription } from "@/services/jobService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  LoadingState,
  BackendBadge,
  PageHeader,
  ScoreBar,
} from "@/components/app/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/career")({
  head: () => ({
    meta: [
      { title: "Job Analyzer — CodeMate AI" },
      {
        name: "description",
        content:
          "Attach your resume and a job description to get a visual skill-match report and a colourful week-by-week preparation roadmap.",
      },
      { property: "og:title", content: "Job Analyzer — CodeMate AI" },
      {
        property: "og:description",
        content: "Resume + job description in, visual roadmap out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CareerPage,
});

const SAMPLE_JD = `Software Engineer — Backend (2-4 years)

You will build and scale high-throughput services in Java and Spring Boot.
Strong SQL and relational modelling (PostgreSQL) required. Familiarity with
Redis, Docker and Kubernetes is a plus. Interviews cover data structures and
algorithms, concurrency, database indexing and system design basics.`;

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type DurationUnit = "weeks" | "months";

function SkillColumn({
  title,
  skills,
  tone,
}: {
  title: string;
  skills: SkillGap["strong"];
  tone: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <span className={tone}>{title}</span>{" "}
          <span className="text-muted-foreground">({skills.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this bucket.</p>
        ) : (
          skills.map((s) => <ScoreBar key={s.name} label={s.name} value={s.current} />)
        )}
      </CardContent>
    </Card>
  );
}

function FileDrop({
  label,
  hint,
  fileName,
  accept = ".txt,.md,text/plain,text/markdown",
  onFile,
}: {
  label: string;
  hint: string;
  fileName: string | null;
  accept?: string;
  onFile: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center transition-colors hover:border-primary hover:bg-accent"
      >
        <Upload className="size-5 text-primary" />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </button>
      {fileName ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-3.5 text-primary" />
          {fileName}
        </p>
      ) : null}
    </div>
  );
}

function CareerPage() {
  const [jd, setJd] = useState(SAMPLE_JD);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jdName, setJdName] = useState<string | null>(null);
  const [duration, setDuration] = useState("12");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("weeks");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [gap, setGap] = useState<SkillGap | null>(null);
  const [roadmap, setRoadmap] = useState<ResumeMatchRoadmap | null>(null);
  const parsedDuration = Number(duration);
  const weeks = durationUnit === "months" ? parsedDuration * 4 : parsedDuration;
  const durationValid = Number.isInteger(weeks) && weeks >= 1 && weeks <= 52;

  async function readInto(file: File, set: (text: string) => void, isResume = false) {
    try {
      let text: string;
      if (isResume && file.name.toLowerCase().endsWith(".pdf")) {
        const { extractPdfText } = await import("@/lib/pdf");
        text = await extractPdfText(file);
      } else {
        text = await file.text();
      }
      set(text);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read this file.");
      return false;
    }
  }

  async function run() {
    setLoading(true);
    try {
      const result = await analyzeJobDescription(jd, resumeText, weeks);
      setAnalysis(result.analysis);
      setGap(result.skillGap);
      setRoadmap(result.roadmap);
      if (!result.roadmap) {
        toast.info(
          "Job analysis is ready. Add at least 40 characters of resume text for a match roadmap.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Job analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Analyzer"
        description="Upload a PDF, text, or Markdown resume and a job description for an AI-powered match report and preparation roadmap."
        actions={<BackendBadge />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1 · Your resume</CardTitle>
            <CardDescription>
              PDF text is extracted in your browser; only the extracted text is sent for analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileDrop
              label="Attach resume"
              hint="Choose a .pdf, .txt or .md file (selectable PDF text, up to 10 MB)"
              fileName={resumeName}
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onFile={(f) => {
                setResumeName(null);
                setResumeText("");
                void readInto(f, setResumeText, true).then((success) => {
                  if (success) setResumeName(f.name);
                });
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2 · Job description</CardTitle>
            <CardDescription>Attach a text file or paste the posting below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FileDrop
              label="Attach job description"
              hint="Choose a .txt or .md file, or paste below"
              fileName={jdName}
              onFile={(f) => {
                setJdName(f.name);
                void readInto(f, setJd);
              }}
            />
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-primary" />
            Your preparation timeline
          </CardTitle>
          <CardDescription>
            Choose how much time you have. The roadmap phases will be scheduled across your full
            timeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="w-full space-y-2 text-sm font-medium sm:max-w-md">
            Available time
            <div className="flex gap-2">
              <Input
                type="number"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                min={1}
                max={durationUnit === "months" ? 12 : 52}
                step={1}
                required
                aria-label="Job preparation duration"
              />
              <Select
                value={durationUnit}
                onValueChange={(value) => setDurationUnit(value as DurationUnit)}
              >
                <SelectTrigger className="w-32" aria-label="Job preparation duration unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weeks">Weeks</SelectItem>
                  <SelectItem value="months">Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="block text-xs font-normal text-muted-foreground">
              {durationValid ? `Plan length: ${weeks} weeks` : "Choose a duration up to 12 months."}
            </span>
          </label>
          <Button
            size="lg"
            onClick={run}
            disabled={loading || !resumeName || !jd.trim() || !durationValid}
          >
            <BriefcaseBusiness className="mr-2 size-4" />
            {loading ? "Building your plan…" : "Generate roadmap"}
          </Button>
        </CardContent>
      </Card>

      {loading ? <LoadingState label="Matching your resume against the role…" /> : null}

      {!loading && !analysis ? (
        <EmptyState
          title="No roadmap yet"
          description="Attach your resume and a job description, then generate your visual preparation roadmap."
        />
      ) : null}

      {!loading && roadmap ? (
        <div className="space-y-6">
          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Resume ↔ role match</CardTitle>
                <CardDescription>{roadmap.verdict}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="metric text-5xl font-semibold text-primary">{roadmap.matchScore}%</p>
                <Progress value={roadmap.matchScore} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your {roadmap.weeks}-week roadmap</CardTitle>
              <CardDescription>
                Generated from your resume and this job description, with phases covering all{" "}
                {roadmap.weeks} weeks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {roadmap.phases.map((phase, i) => (
                  <div
                    key={phase.id}
                    className="relative space-y-3 overflow-hidden rounded-lg border border-border p-4"
                    style={{
                      background: `color-mix(in oklab, ${CHART_COLORS[i % CHART_COLORS.length]} 12%, transparent)`,
                    }}
                  >
                    <div
                      className="absolute inset-x-0 top-0 h-1"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{phase.weeks}</Badge>
                      <span className="metric text-xs text-muted-foreground">
                        {phase.intensity}% load
                      </span>
                    </div>
                    <p className="font-medium">{phase.title}</p>
                    <Progress value={phase.intensity} />
                    <div className="flex flex-wrap gap-1.5">
                      {phase.focus.map((f) => (
                        <Badge key={f} variant="outline">
                          {f}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Goal: </span>
                      {phase.outcome}
                    </p>
                    <div className="grid gap-4 border-t border-border/70 pt-4 lg:grid-cols-2">
                      <section className="space-y-3">
                        <h4 className="text-sm font-semibold">What to do</h4>
                        <ol className="space-y-3">
                          {phase.actions.map((action, actionIndex) => (
                            <li
                              key={`${action.title}-${actionIndex}`}
                              className="rounded-md bg-background/60 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">{action.title}</p>
                                <Badge variant="secondary">{action.timebox}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {action.instructions}
                              </p>
                              <p className="mt-2 text-xs">
                                <span className="font-medium">Deliverable: </span>
                                <span className="text-muted-foreground">{action.deliverable}</span>
                              </p>
                            </li>
                          ))}
                        </ol>
                      </section>
                      <section className="space-y-3">
                        <h4 className="text-sm font-semibold">LeetCode practice</h4>
                        {phase.leetcode.length ? (
                          <ul className="space-y-2">
                            {phase.leetcode.map((problem) => (
                              <li key={problem.title} className="rounded-md bg-background/60 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <a
                                    href={problem.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                                  >
                                    {problem.title}
                                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                                  </a>
                                  <Badge variant="outline">{problem.difficulty}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  <span className="font-medium">Pattern: </span>
                                  {problem.pattern}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {problem.practiceGoal}
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            LeetCode is not a priority for this role; focus on the tasks listed.
                          </p>
                        )}
                      </section>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                Quick resume wins
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {roadmap.quickWins.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!loading && analysis ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Role summary</CardTitle>
              <CardDescription>{analysis.seniority}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{analysis.roleSummary}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: "Languages", items: analysis.languages },
                  { label: "Frameworks", items: analysis.frameworks },
                  { label: "Databases", items: analysis.databases },
                  { label: "DSA topics", items: analysis.dsaTopics },
                  { label: "Interview topics", items: analysis.interviewTopics },
                ].map((group) => (
                  <div key={group.label} className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((i) => (
                        <Badge key={i} variant="secondary">
                          {i}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {gap ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SkillColumn title="Strong" skills={gap.strong} tone="text-success" />
              <SkillColumn title="Needs practice" skills={gap.practice} tone="text-warning" />
              <SkillColumn title="Weak" skills={gap.weak} tone="text-destructive" />
              <SkillColumn title="Missing" skills={gap.missing} tone="text-muted-foreground" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
