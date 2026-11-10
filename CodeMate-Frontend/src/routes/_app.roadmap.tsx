import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, PlayCircle, Route as RouteIcon, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { generateRoadmap, getLatestRoadmap, updateRoadmapProblem } from "@/services/roadmapService";
import type { DSARoadmap, DSATopic } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BackendBadge, LoadingSkeleton, PageHeader, RequestError } from "@/components/app/shared";

export const Route = createFileRoute("/_app/roadmap")({
  head: () => ({
    meta: [
      { title: "DSA Roadmap — CodeMate AI" },
      {
        name: "description",
        content:
          "Build a personalised, time-bound DSA interview preparation roadmap with curated problems and learning resources.",
      },
      { property: "og:title", content: "DSA Roadmap — CodeMate AI" },
      {
        property: "og:description",
        content: "An eight-stage DSA preparation journey tailored to your schedule.",
      },
    ],
  }),
  component: RoadmapPage,
});

const PRIORITY_TONE: Record<string, string> = {
  high: "border-amber-300/40 text-amber-200",
  medium: "border-slate-400/40 text-slate-200",
  low: "border-slate-500/40 text-slate-300",
};

type DurationUnit = "weeks" | "months";

function RoadmapPage() {
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [preparationLevel, setPreparationLevel] = useState("Intermediate");
  const [duration, setDuration] = useState("12");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("weeks");
  const queryClient = useQueryClient();
  const roadmapQuery = useQuery({
    queryKey: ["roadmap"],
    queryFn: getLatestRoadmap,
    refetchOnMount: "always",
  });
  const generate = useMutation({
    mutationFn: generateRoadmap,
    onSuccess: (roadmap) => {
      queryClient.setQueryData(["roadmap"], roadmap);
    },
  });
  const data = roadmapQuery.data;

  const updateProblem = useMutation({
    mutationFn: (input: { roadmapId: string; problemId: string; completed: boolean }) =>
      updateRoadmapProblem(input.roadmapId, input.problemId, { completed: input.completed }),
    onSuccess: (result) => {
      queryClient.setQueryData<DSARoadmap | null>(["roadmap"], (roadmap) =>
        roadmap
          ? {
              ...roadmap,
              topics: roadmap.topics.map((topic) =>
                topic.problems.some((problem) => problem.id === result.problemId)
                  ? {
                      ...topic,
                      progress: result.topicProgress,
                      problems: topic.problems.map((problem) =>
                        problem.id === result.problemId
                          ? { ...problem, completed: result.completed }
                          : problem,
                      ),
                    }
                  : topic,
              ),
            }
          : roadmap,
      );
    },
  });

  const total = data?.topics.reduce((n, topic) => n + topic.problems.length, 0) ?? 0;
  const completed =
    data?.topics.reduce(
      (n, topic) => n + topic.problems.filter((problem) => problem.completed).length,
      0,
    ) ?? 0;
  const parsedDuration = Number(duration);
  const weeks = durationUnit === "months" ? parsedDuration * 4 : parsedDuration;
  const durationValid = Number.isInteger(weeks) && weeks >= 1 && weeks <= 52;

  function submitRoadmap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!durationValid) return;
    generate.mutate({ targetRole, preparationLevel, weeks });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="DSA Roadmap"
        description="Choose your target role, current level and available time to build a practical interview-preparation plan."
        actions={<BackendBadge />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Plan your preparation</CardTitle>
          <CardDescription>
            Enter your own schedule in weeks or months. The roadmap adjusts its topics and workload
            to fit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submitRoadmap}>
            <label className="space-y-2 text-sm font-medium">
              Target role
              <Input
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
                minLength={2}
                maxLength={100}
                required
                aria-label="Target role"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Current level
              <Select value={preparationLevel} onValueChange={setPreparationLevel}>
                <SelectTrigger aria-label="Current DSA level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Your available time
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  min={1}
                  max={durationUnit === "months" ? 12 : 52}
                  step={1}
                  required
                  aria-label="Preparation duration"
                />
                <Select
                  value={durationUnit}
                  onValueChange={(value) => setDurationUnit(value as DurationUnit)}
                >
                  <SelectTrigger className="w-32" aria-label="Duration unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="block text-xs font-normal text-muted-foreground">
                {durationValid
                  ? `Plan length: ${weeks} weeks`
                  : "Choose a duration up to 12 months."}
              </span>
            </label>
            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full"
                disabled={generate.isPending || !durationValid || targetRole.trim().length < 2}
              >
                <Sparkles className="size-4" />
                {generate.isPending ? "Building your roadmap…" : "Generate my roadmap"}
              </Button>
            </div>
          </form>
          {generate.isError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              Could not generate the roadmap: {generate.error.message}
            </p>
          ) : null}
          {generate.isPending ? (
            <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
              Creating eight milestones and selecting practice that fits your timeline…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {roadmapQuery.isError ? <RequestError onRetry={() => void roadmapQuery.refetch()} /> : null}
      {!roadmapQuery.isError && roadmapQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}
      {!roadmapQuery.isError && !roadmapQuery.isLoading && !data ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <RouteIcon className="mx-auto size-8 text-primary" />
          <h2 className="mt-3 font-display text-lg">Your DSA journey starts here</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set your timeline above and generate a personalised eight-stage roadmap.
          </p>
        </div>
      ) : null}
      {!roadmapQuery.isError && data ? (
        <>
          <RoadmapInfographic roadmap={data} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {data.targetRole} · {data.preparationLevel}
              </CardTitle>
              <CardDescription>
                {data.weeks} weeks · {completed} of {total} problems marked complete
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={total ? (completed / total) * 100 : 0} />
            </CardContent>
          </Card>

          <Accordion type="multiple" className="space-y-3">
            {data.topics.map((topic) => (
              <AccordionItem
                key={topic.id}
                value={topic.id}
                className="rounded-lg border border-border px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex flex-1 flex-wrap items-center gap-3 pr-3 text-left">
                    <span className="font-medium">{topic.name}</span>
                    <Badge variant="outline" className={PRIORITY_TONE[topic.priority]}>
                      {topic.priority} priority
                    </Badge>
                    <Badge variant="secondary">{topic.difficulty}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatWeekRange(topic.weekStart, topic.weekEnd)}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {topic.progress}% ready
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4">
                  <p className="text-sm text-muted-foreground">Pattern focus: {topic.pattern}</p>
                  <Progress value={topic.progress} />
                  <div className="space-y-2">
                    {topic.problems.map((problem) => (
                      <div
                        key={problem.id}
                        className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card/60 p-3"
                      >
                        <Checkbox
                          checked={problem.completed}
                          disabled={updateProblem.isPending || !data.id}
                          onCheckedChange={(checked) => {
                            if (data.id) {
                              updateProblem.mutate({
                                roadmapId: data.id,
                                problemId: problem.id,
                                completed: checked === true,
                              });
                            }
                          }}
                        />
                        <span className="text-sm font-medium">{problem.title}</span>
                        <Badge variant="outline">{problem.difficulty}</Badge>
                        <span className="text-xs text-muted-foreground">{problem.pattern}</span>
                        <a
                          href={problem.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {problem.platform}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Learning resources</CardTitle>
              <CardDescription>Curated walkthroughs for your weakest topics.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {data.resources.map((resource) => (
                <a
                  key={resource.id}
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent"
                >
                  <PlayCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{resource.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {resource.channel} · {resource.topic} · {resource.duration}
                    </p>
                  </div>
                </a>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function formatWeekRange(start: number, end: number): string {
  return start === end ? `Week ${start}` : `Weeks ${start}–${end}`;
}

function RoadmapInfographic({ roadmap }: { roadmap: DSARoadmap }) {
  const stages = roadmap.topics.slice(0, 8);

  return (
    <section
      aria-label="Eight-stage DSA roadmap infographic"
      className="relative isolate overflow-hidden rounded-2xl border border-slate-700 bg-[#101414] px-4 py-6 shadow-xl sm:px-8 sm:py-9"
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-20"
        preserveAspectRatio="none"
        viewBox="0 0 1000 1200"
      >
        <defs>
          <pattern id="roadmap-network" width="120" height="120" patternUnits="userSpaceOnUse">
            <path
              d="M0 0 120 120M120 0 0 120M60 0v120M0 60h120"
              fill="none"
              stroke="#748080"
              strokeWidth="0.6"
            />
            <circle cx="60" cy="60" r="2" fill="#b5bdbd" />
          </pattern>
        </defs>
        <rect width="1000" height="1200" fill="url(#roadmap-network)" />
      </svg>

      <header className="relative z-10 mx-auto mb-8 max-w-3xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/35 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-100">
          <CalendarDays className="size-3.5" />
          {roadmap.weeks} week preparation plan
        </div>
        <h2 className="font-display text-balance text-xl font-bold uppercase leading-tight text-slate-950 sm:text-3xl">
          <span className="box-decoration-clone bg-[#f4df65] px-2 py-1">
            Step-by-step DSA roadmap for {roadmap.targetRole}
          </span>
        </h2>
        <p className="mt-4 text-sm text-slate-300">
          {roadmap.preparationLevel} level · eight milestones · curated practice
        </p>
      </header>

      <div className="relative mx-auto max-w-5xl">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
          preserveAspectRatio="none"
          viewBox="0 0 100 800"
        >
          <path
            d="M50 0 C72 25 72 75 50 100 C28 125 28 175 50 200 C72 225 72 275 50 300 C28 325 28 375 50 400 C72 425 72 475 50 500 C28 525 28 575 50 600 C72 625 72 675 50 700 C28 725 28 775 50 800"
            fill="none"
            stroke="#4b5352"
            strokeLinecap="round"
            strokeWidth="13"
          />
          <path
            d="M50 0 C72 25 72 75 50 100 C28 125 28 175 50 200 C72 225 72 275 50 300 C28 325 28 375 50 400 C72 425 72 475 50 500 C28 525 28 575 50 600 C72 625 72 675 50 700 C28 725 28 775 50 800"
            fill="none"
            stroke="#e7e8e3"
            strokeDasharray="9 13"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
        <ol className="relative grid gap-y-4 md:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] md:gap-y-3">
          {stages.map((topic, index) => {
            const card = <RoadmapStage topic={topic} number={index + 1} />;
            return (
              <li
                key={topic.id}
                className="relative grid min-h-[138px] grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 md:grid-cols-subgrid md:col-span-3 md:grid-rows-1"
              >
                <div className="absolute bottom-0 left-[21px] top-0 -z-0 border-l-2 border-dashed border-slate-500/50 md:hidden" />
                <div className="relative z-10 col-start-1 row-start-1 flex size-11 items-center justify-center rounded-full border-[3px] border-[#242a29] bg-[#f7f3ec] font-display text-lg font-bold text-[#161919] shadow-[0_0_18px_rgba(255,255,255,0.14)] md:col-start-2">
                  {index + 1}
                </div>
                <div
                  className={
                    index % 2 === 0
                      ? "relative z-10 col-start-2 row-start-1 md:col-start-1"
                      : "relative z-10 col-start-2 row-start-1 md:col-start-3"
                  }
                >
                  {card}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <footer className="relative z-10 mt-8 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
        <RouteIcon className="size-4 text-amber-200" />
        Mark problems complete below and keep moving toward interview-ready.
      </footer>
    </section>
  );
}

function RoadmapStage({ topic, number }: { topic: DSATopic; number: number }) {
  return (
    <article className="rounded-xl border border-slate-500/40 bg-[#1b2020]/95 p-3.5 shadow-[0_12px_28px_rgba(0,0,0,0.28)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-[#f4df65] sm:text-base">
          {number}. {topic.name}
        </h3>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-300">
          {formatWeekRange(topic.weekStart, topic.weekEnd)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {topic.pattern} · {topic.priority} priority
      </p>
      <ul className="mt-2 space-y-1.5">
        {topic.problems.slice(0, 4).map((problem) => (
          <li
            key={problem.id}
            className="flex items-start gap-2 text-xs leading-snug text-slate-100"
          >
            <span aria-hidden="true" className="mt-1 size-1 shrink-0 rounded-full bg-slate-300" />
            <a
              href={problem.url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:text-[#f4df65] hover:underline"
            >
              {problem.title}
            </a>
            <span className="ml-auto shrink-0 text-[10px] capitalize text-slate-400">
              {problem.difficulty}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
