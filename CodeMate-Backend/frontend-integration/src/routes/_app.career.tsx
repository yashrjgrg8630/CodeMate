import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness, FileText, Sparkles, Upload } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import type { JobAnalysis, ResumeMatchRoadmap, SkillGap } from "@/types/domain";
import { analyzeCareer } from "@/services/jobService";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingState, MockBadge, PageHeader, ScoreBar } from "@/components/app/shared";

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
  onFile,
}: {
  label: string;
  hint: string;
  fileName: string | null;
  onFile: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
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
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [gap, setGap] = useState<SkillGap | null>(null);
  const [roadmap, setRoadmap] = useState<ResumeMatchRoadmap | null>(null);

  async function readInto(file: File, set: (text: string) => void) {
    if (/\.(txt|md)$/i.test(file.name)) set(await file.text());
    else set(`[${file.name}] attached — text extraction happens on the server later.`);
  }

  async function run() {
    setLoading(true);
    try {
      const result = await analyzeCareer(jd, resumeText);
      setAnalysis(result.analysis);
      setGap(result.skillGap);
      setRoadmap(result.roadmap);
      if (!result.roadmap) {
        toast.info(
          "Resume text could not be read. Upload a .txt or .md resume (or paste its text) to get the match roadmap.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Analyzer"
        description="Attach your resume and the job description — get a visual match report and a colourful preparation roadmap."
        actions={<MockBadge />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1 · Your resume</CardTitle>
            <CardDescription>PDF, DOCX or plain text.</CardDescription>
          </CardHeader>
          <CardContent>
            <FileDrop
              label="Attach resume"
              hint="Click to choose a file"
              fileName={resumeName}
              onFile={(f) => {
                setResumeName(f.name);
                void readInto(f, setResumeText);
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2 · Job description</CardTitle>
            <CardDescription>Attach a file or paste the posting below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FileDrop
              label="Attach job description"
              hint="Optional — you can paste instead"
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

      <Button size="lg" onClick={run} disabled={loading || !resumeName || !jd.trim()}>
        <BriefcaseBusiness className="mr-2 size-4" />
        Generate roadmap
      </Button>

      {loading ? <LoadingState label="Matching your resume against the role…" /> : null}

      {!loading && !analysis ? (
        <EmptyState
          title="No roadmap yet"
          description="Attach your resume and a job description, then generate your visual preparation roadmap."
        />
      ) : null}

      {!loading && roadmap ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Resume ↔ role match</CardTitle>
                <CardDescription>{roadmap.verdict}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="metric text-5xl font-semibold text-primary">{roadmap.matchScore}%</p>
                <Progress value={roadmap.matchScore} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Your skills vs role requirements</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={roadmap.radar} outerRadius="72%">
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis
                      dataKey="skill"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <Radar
                      name="Required"
                      dataKey="required"
                      stroke="var(--chart-2)"
                      fill="var(--chart-2)"
                      fillOpacity={0.25}
                    />
                    <Radar
                      name="Your resume"
                      dataKey="resume"
                      stroke="var(--chart-1)"
                      fill="var(--chart-1)"
                      fillOpacity={0.45}
                    />
                    <Legend />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Biggest gaps to close</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roadmap.gaps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="skill"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      name="You have"
                      dataKey="have"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      name="Role needs"
                      dataKey="need"
                      fill="var(--chart-5)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Where your study time should go</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={roadmap.categoryFocus}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={3}
                    >
                      {roadmap.categoryFocus.map((entry, i) => (
                        <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your 10-week roadmap</CardTitle>
              <CardDescription>
                Generated from your resume and this job description.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                    <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {phase.focus.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Goal: </span>
                      {phase.outcome}
                    </p>
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
