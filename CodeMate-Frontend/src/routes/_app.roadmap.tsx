import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Route as RouteIcon, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  generateRoadmap,
  updateRoadmapProblem,
  updateRoadmapTask,
} from "@/services/roadmapService";
import type { DSARoadmap } from "@/types/domain";
import type { RoadmapDurationUnit } from "@/types/domain";
import { useBackgroundTask } from "@/hooks/use-background-task";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BackendBadge, EmptyState, LoadingState } from "@/components/app/shared";
import { DsaJourneyMap } from "@/components/roadmap/DsaJourneyMap";
import { DsaStageDialog } from "@/components/roadmap/DsaStageDialog";

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
        content: "A personalized learning journey tailored to your role and preparation time.",
      },
    ],
  }),
  component: RoadmapPage,
});

const TARGET_ROLES = [
  "Software Engineer",
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "AI/ML Engineer",
  "Data Scientist",
  "Data Engineer",
  "Cybersecurity Engineer",
  "Other",
] as const;

function RoadmapPage() {
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [customRole, setCustomRole] = useState("");
  const [preparationLevel, setPreparationLevel] = useState("Intermediate");
  const [duration, setDuration] = useState("12");
  const [durationUnit, setDurationUnit] = useState<RoadmapDurationUnit>("weeks");
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [data, setData] = useState<DSARoadmap | null>(null);
  const generate = useBackgroundTask<DSARoadmap>("roadmap-generate");

  const updateProblem = useMutation({
    mutationFn: (input: { roadmapId: string; problemId: string; completed: boolean }) =>
      updateRoadmapProblem(input.roadmapId, input.problemId, { completed: input.completed }),
    onSuccess: (result, input) =>
      setData((roadmap) =>
        roadmap?.id !== input.roadmapId
          ? roadmap
          : {
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
            },
      ),
  });
  const updateTask = useMutation({
    mutationFn: (input: { roadmapId: string; taskId: string; completed: boolean }) =>
      updateRoadmapTask(input.roadmapId, input.taskId, input.completed),
    onSuccess: (result, input) =>
      setData((roadmap) =>
        roadmap?.id !== input.roadmapId
          ? roadmap
          : {
              ...roadmap,
              topics: roadmap.topics.map((topic) =>
                topic.tasks.some((task) => task.id === result.taskId)
                  ? {
                      ...topic,
                      progress: result.topicProgress,
                      tasks: topic.tasks.map((task) =>
                        task.id === result.taskId ? { ...task, completed: result.completed } : task,
                      ),
                    }
                  : topic,
              ),
            },
      ),
  });

  const total =
    data?.topics.reduce((count, topic) => count + topic.problems.length + topic.tasks.length, 0) ??
    0;
  const completed =
    data?.topics.reduce(
      (count, topic) =>
        count +
        topic.problems.filter((problem) => problem.completed).length +
        topic.tasks.filter((task) => task.completed).length,
      0,
    ) ?? 0;
  const completedStages = data?.topics.filter((topic) => topic.progress === 100).length ?? 0;
  const selectedTopic = data?.topics.find((topic) => topic.id === selectedStageId) ?? null;
  const selectedStageNumber = Math.max(
    1,
    (data?.topics.findIndex((topic) => topic.id === selectedStageId) ?? 0) + 1,
  );
  const parsedDuration = Number(duration);
  const durationMax = durationUnit === "days" ? 365 : durationUnit === "weeks" ? 52 : 12;
  const durationDays =
    durationUnit === "days"
      ? parsedDuration
      : durationUnit === "weeks"
        ? parsedDuration * 7
        : parsedDuration * 30;
  const durationValid =
    Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= durationMax;
  const effectiveRole = targetRole === "Other" ? customRole.trim() : targetRole;
  const roleValid = effectiveRole.length >= 2 && effectiveRole.length <= 100;

  function submitRoadmap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!durationValid || !roleValid || generate.isPending) return;
    generate.run(() =>
      generateRoadmap({
        targetRole: effectiveRole,
        preparationLevel,
        durationValue: parsedDuration,
        durationUnit,
      }).then((roadmap) => {
        setData(roadmap);
        setSelectedStageId(null);
        return roadmap;
      }),
    );
  }

  return (
    <main className="dsa-journey-page">
      <header className="dsa-journey-page-heading">
        <div>
          <div className="dsa-journey-eyebrow">
            <RouteIcon aria-hidden="true" />
            CAREER &amp; PREP
          </div>
          <h1>DSA Roadmap</h1>
          <p>
            A guided learning journey built around your target role, current level, and the time you
            have.
          </p>
        </div>
        <BackendBadge />
      </header>

      <section className="dsa-journey-planner" aria-labelledby="dsa-planner-title">
        <div className="dsa-journey-section-heading">
          <div>
            <p className="dsa-journey-kicker">PERSONALIZE YOUR PLAN</p>
            <h2 id="dsa-planner-title">Set your preparation window</h2>
          </div>
          <p>Your stage count, learning sequence, and practice workload adapt to these choices.</p>
        </div>

        <form className="dsa-journey-planner-form" onSubmit={submitRoadmap}>
          <label className="dsa-journey-field">
            <span>Target role</span>
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger aria-label="Target role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dsa-journey-select-menu">
                {TARGET_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {targetRole === "Other" ? (
            <label className="dsa-journey-field">
              <span>Custom role</span>
              <Input
                value={customRole}
                onChange={(event) => setCustomRole(event.target.value)}
                minLength={2}
                maxLength={100}
                required
                aria-label="Enter your custom target role"
                placeholder="e.g. Site Reliability Engineer"
              />
            </label>
          ) : null}
          <label className="dsa-journey-field">
            <span>Current level</span>
            <Select value={preparationLevel} onValueChange={setPreparationLevel}>
              <SelectTrigger aria-label="Current DSA level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dsa-journey-select-menu">
                <SelectItem value="Beginner">Beginner</SelectItem>
                <SelectItem value="Intermediate">Intermediate</SelectItem>
                <SelectItem value="Advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="dsa-journey-field">
            <span>Available time</span>
            <div className="dsa-journey-duration-input">
              <Input
                type="number"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                min={1}
                max={durationMax}
                step={1}
                required
                aria-label="Preparation duration"
              />
              <Select
                value={durationUnit}
                onValueChange={(value) => setDurationUnit(value as RoadmapDurationUnit)}
              >
                <SelectTrigger aria-label="Duration unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dsa-journey-select-menu">
                  <SelectItem value="days">Days</SelectItem>
                  <SelectItem value="weeks">Weeks</SelectItem>
                  <SelectItem value="months">Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <small>
              {durationValid
                ? `About ${durationDays} preparation days`
                : `Choose ${durationUnit} from 1 to ${durationMax}.`}
            </small>
          </label>
          <div className="dsa-journey-submit-wrap">
            <Button
              type="submit"
              disabled={generate.isPending || !durationValid || !roleValid}
              className="dsa-journey-generate-button"
            >
              <Sparkles aria-hidden="true" />
              {generate.isPending
                ? "Building your roadmap…"
                : data
                  ? "Regenerate roadmap"
                  : "Generate roadmap"}
            </Button>
          </div>
        </form>

        {generate.isError ? (
          <p className="dsa-journey-error" role="alert">
            Could not generate the roadmap: {generate.error?.message ?? "Please try again."}
          </p>
        ) : null}
        {generate.isPending ? (
          <LoadingState label="Building your personalized roadmap from your role, level, and timeline…" />
        ) : null}
      </section>

      {!data && !generate.isPending && !generate.isError ? (
        <EmptyState
          icon={<RouteIcon className="size-5 text-primary" />}
          title="Your DSA journey starts here"
          description="Choose a target and timeline above to create a personalized practice roadmap."
        />
      ) : null}
      {data ? (
        <>
          <section className="dsa-journey-overview" aria-label="Roadmap progress">
            <div className="dsa-journey-overview-main">
              <div className="dsa-journey-overview-title">
                <span className="dsa-journey-overview-icon">
                  <CalendarDays aria-hidden="true" />
                </span>
                <div>
                  <p className="dsa-journey-kicker">YOUR PREPARATION PLAN</p>
                  <h2>{data.targetRole}</h2>
                  <p>
                    {data.preparationLevel} · {data.durationValue} {data.durationUnit} ·{" "}
                    {data.topics.length} personalized stages
                  </p>
                </div>
              </div>
              <div
                className="dsa-journey-progress-track"
                role="progressbar"
                aria-label="Roadmap completion"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={completed}
              >
                <span style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
              </div>
              <p className="dsa-journey-progress-caption">
                {completed} of {total} preparation items complete ·{" "}
                {total ? Math.round((completed / total) * 100) : 0}% overall
              </p>
            </div>
            <div className="dsa-journey-overview-stats">
              <div>
                <span>Duration</span>
                <strong>
                  {data.durationValue} {data.durationUnit}
                </strong>
              </div>
              <div>
                <span>Stages completed</span>
                <strong>
                  {completedStages} / {data.topics.length}
                </strong>
              </div>
              <div>
                <span>Practice problems</span>
                <strong>
                  {data.topics.reduce((count, topic) => count + topic.problems.length, 0)}
                </strong>
              </div>
            </div>
          </section>

          <section className="dsa-learning-journey" aria-labelledby="dsa-journey-title">
            <div className="dsa-journey-section-heading dsa-learning-journey-heading">
              <div>
                <p className="dsa-journey-kicker">YOUR LEARNING JOURNEY</p>
                <h2 id="dsa-journey-title">Your path to interview ready</h2>
              </div>
              <p>
                Follow the path from the start. Choose any stage to explore its concepts, practice,
                and resources.
              </p>
            </div>
            <DsaJourneyMap
              topics={data.topics}
              selectedStageId={selectedStageId}
              onSelectStage={setSelectedStageId}
            />
          </section>

          <DsaStageDialog
            key={selectedTopic?.id ?? "closed"}
            topic={selectedTopic}
            stageNumber={selectedStageNumber}
            totalStages={data.topics.length}
            isCurrent={data.topics.find((topic) => topic.progress < 100)?.id === selectedTopic?.id}
            resources={data.resources}
            updatePending={updateProblem.isPending}
            updateError={updateProblem.isError ? updateProblem.error.message : null}
            taskUpdatePending={updateTask.isPending}
            taskUpdateError={updateTask.isError ? updateTask.error.message : null}
            onProblemCompleted={(problemId, completed) => {
              updateProblem.mutate({ roadmapId: data.id, problemId, completed });
            }}
            onTaskCompleted={(taskId, completed) => {
              updateTask.mutate({ roadmapId: data.id, taskId, completed });
            }}
            onOpenChange={(open) => {
              if (!open) setSelectedStageId(null);
            }}
          />
        </>
      ) : null}
    </main>
  );
}
