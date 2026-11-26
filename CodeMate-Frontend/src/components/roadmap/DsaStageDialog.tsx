import { ArrowUpRight, BookOpen, Clock3, Search } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ProblemFilters, type ProblemFilterValues } from "@/components/roadmap/ProblemFilters";
import { PracticeProblemRow } from "@/components/roadmap/PracticeProblemRow";
import type { DSAProblem, DSATopic, LearningResource } from "@/types/domain";

const EMPTY_FILTERS: ProblemFilterValues = {
  platform: "all",
  difficulty: "all",
  topic: "all",
};

export function DsaStageDialog({
  topic,
  stageNumber,
  totalStages,
  isCurrent,
  resources,
  updatePending,
  updateError,
  taskUpdatePending,
  taskUpdateError,
  onProblemCompleted,
  onTaskCompleted,
  onOpenChange,
}: {
  topic: DSATopic | null;
  stageNumber: number;
  totalStages: number;
  isCurrent: boolean;
  resources: LearningResource[];
  updatePending: boolean;
  updateError: string | null;
  taskUpdatePending: boolean;
  taskUpdateError: string | null;
  onProblemCompleted: (problemId: string, completed: boolean) => void;
  onTaskCompleted: (taskId: string, completed: boolean) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const matchedResources = topic
    ? resources.filter((resource) => resource.topic === topic.name)
    : [];
  const platforms = topic
    ? [...new Set(topic.problems.map((problem) => problem.platform))].sort()
    : [];
  const problemTopics = topic
    ? [...new Set(topic.problems.map((problem) => problem.topic || topic.name))].sort()
    : [];
  const visibleProblems =
    topic?.problems.filter(
      (problem) =>
        (filters.platform === "all" || problem.platform === filters.platform) &&
        (filters.difficulty === "all" || problem.difficulty === filters.difficulty) &&
        (filters.topic === "all" || (problem.topic || topic.name) === filters.topic),
    ) ?? [];
  const completedProblems = topic?.problems.filter((problem) => problem.completed).length ?? 0;
  const completedTasks = topic?.tasks.filter((task) => task.completed).length ?? 0;
  const totalItems = (topic?.problems.length ?? 0) + (topic?.tasks.length ?? 0);
  const completedItems = completedProblems + completedTasks;
  const isUpdating = updatePending || taskUpdatePending;

  return (
    <Dialog open={topic !== null} onOpenChange={onOpenChange}>
      <DialogContent className="dsa-stage-dialog">
        {topic ? (
          <>
            <DialogHeader className="dsa-stage-dialog-header">
              <span className="dsa-stage-dialog-icon">
                <BookOpen aria-hidden="true" />
              </span>
              <span className="dsa-stage-dialog-overline">
                STAGE {String(stageNumber).padStart(2, "0")} OF{" "}
                {String(totalStages).padStart(2, "0")}
              </span>
              <DialogTitle className="dsa-stage-dialog-title">{topic.name}</DialogTitle>
              <DialogDescription className="dsa-stage-dialog-description">
                {topic.description}
              </DialogDescription>
              <div className="dsa-stage-dialog-meta">
                <span>
                  <Clock3 aria-hidden="true" />
                  {topic.durationLabel}
                  {topic.estimatedMinutes
                    ? ` · ${Math.ceil(topic.estimatedMinutes / 60)}h estimated`
                    : " · workload not estimated"}
                </span>
                <span>
                  {isCurrent
                    ? "Current stage"
                    : topic.progress === 100
                      ? "Completed"
                      : "In your plan"}
                </span>
                <span>
                  {completedItems} of {totalItems} items complete
                </span>
              </div>
              <div
                className="dsa-stage-dialog-progress"
                role="progressbar"
                aria-label={`${topic.name} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={topic.progress}
              >
                <span style={{ width: `${topic.progress}%` }} />
              </div>
            </DialogHeader>

            <div className="dsa-stage-dialog-scroll">
              <section className="dsa-detail-section" aria-labelledby="dsa-concepts-heading">
                <div className="dsa-detail-section-heading">
                  <span className="dsa-detail-kicker">LEARNING PATH</span>
                  <h3 id="dsa-concepts-heading">Key concepts</h3>
                </div>
                <ul className="dsa-concept-list">
                  {topic.keyTopics.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="dsa-detail-section" aria-labelledby="dsa-tasks-heading">
                <div className="dsa-detail-section-heading">
                  <span className="dsa-detail-kicker">PREPARATION</span>
                  <h3 id="dsa-tasks-heading">Stage tasks</h3>
                  <p>
                    {completedTasks} of {topic.tasks.length} complete
                  </p>
                </div>
                <ul className="dsa-task-list">
                  {topic.tasks.map((task) => (
                    <li className={task.completed ? "is-complete" : ""} key={task.id}>
                      <Checkbox
                        checked={task.completed}
                        disabled={isUpdating}
                        aria-label={`Mark ${task.title} complete`}
                        onCheckedChange={(checked) => onTaskCompleted(task.id, checked === true)}
                      />
                      <span>
                        <strong>{task.title}</strong>
                        <small>{task.description}</small>
                        {task.deliverable ? <small>Deliverable: {task.deliverable}</small> : null}
                      </span>
                      <em>{task.estimatedMinutes} min</em>
                    </li>
                  ))}
                </ul>
                {taskUpdateError ? (
                  <p className="dsa-detail-error" role="alert">
                    Could not save task progress: {taskUpdateError}
                  </p>
                ) : null}
              </section>

              <section className="dsa-detail-section" aria-labelledby="dsa-practice-heading">
                <div className="dsa-detail-section-heading">
                  <span className="dsa-detail-kicker">PRACTICE</span>
                  <h3 id="dsa-practice-heading">Problems for this stage</h3>
                  <p>
                    {completedProblems} of {topic.problems.length} complete
                  </p>
                </div>
                <ProblemFilters
                  className="dsa-detail-filters"
                  platforms={platforms}
                  topics={problemTopics}
                  value={filters}
                  onChange={setFilters}
                />
                <div className="dsa-detail-problem-list">
                  {visibleProblems.length ? (
                    visibleProblems.map((problem) => (
                      <PracticeProblemRow
                        key={problem.id}
                        problem={toRowProblem(problem, topic.name)}
                        disabled={isUpdating}
                        onCompletedChange={(completed) => onProblemCompleted(problem.id, completed)}
                      />
                    ))
                  ) : (
                    <p className="dsa-detail-empty">
                      No problems match those filters. Try another platform, difficulty, or topic.
                    </p>
                  )}
                </div>
                {updateError ? (
                  <p className="dsa-detail-error" role="alert">
                    Could not save problem progress: {updateError}
                  </p>
                ) : null}
              </section>

              <section className="dsa-detail-section" aria-labelledby="dsa-resources-heading">
                <div className="dsa-detail-section-heading">
                  <span className="dsa-detail-kicker">GO DEEPER</span>
                  <h3 id="dsa-resources-heading">Learning resource</h3>
                </div>
                {matchedResources.length ? (
                  <div className="dsa-detail-resource-list">
                    {matchedResources.map((resource) => (
                      <a
                        className="dsa-detail-resource"
                        href={resource.url}
                        key={resource.id}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <BookOpen aria-hidden="true" />
                        <span>
                          <strong>{resource.title}</strong>
                          <small>
                            {resource.channel} · {resource.topic} · {resource.duration}
                          </small>
                        </span>
                        <span className="dsa-resource-search-label">
                          <Search aria-hidden="true" />
                          Search YouTube
                          <ArrowUpRight aria-hidden="true" />
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="dsa-detail-empty">
                    No stage-specific resource was included in this saved roadmap.
                  </p>
                )}
              </section>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function toRowProblem(problem: DSAProblem, stageName: string) {
  return {
    ...problem,
    topic: problem.topic || stageName,
  };
}
