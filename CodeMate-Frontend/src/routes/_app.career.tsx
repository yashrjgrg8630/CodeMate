import { useEffect, useRef, useState, type DragEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  FileUp,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { CareerJobResult, ResumeMatchRoadmap, Skill, SkillLevel } from "@/types/domain";
import { analyzeJobDescription } from "@/services/jobService";
import { useBackgroundTask } from "@/hooks/use-background-task";
import { ProblemFilters, type ProblemFilterValues } from "@/components/roadmap/ProblemFilters";
import {
  PracticeProblemRow,
  type PracticeProblemRowData,
} from "@/components/roadmap/PracticeProblemRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
          "Attach your resume and a job description to get a visual skill-match report and a week-by-week preparation roadmap.",
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

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;
const MIN_RESUME_CHARS = 40;
const MIN_JOB_DESCRIPTION_CHARS = 20;

type UploadTarget = "resume" | "description";
type DurationUnit = "weeks" | "months";

interface UploadedDocument {
  name: string;
  size: number;
  type: string;
  text: string;
}

interface UploadProgress {
  unit: "bytes" | "pages";
  current: number;
  total: number;
}

interface FileProcessing {
  target: UploadTarget;
  fileName: string;
  stage: string;
  progress: UploadProgress | null;
}

interface FileIssue {
  target: UploadTarget;
  message: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readTextFile(
  file: File,
  signal: AbortSignal,
  onProgress: (progress: UploadProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("File reading was cancelled.", "AbortError"));
      return;
    }

    const reader = new FileReader();
    const onAbort = () => reader.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress({ unit: "bytes", current: event.loaded, total: event.total });
      }
    };
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read this file."));
    reader.onabort = () => reject(new DOMException("File reading was cancelled.", "AbortError"));
    reader.onloadend = () => signal.removeEventListener("abort", onAbort);
    reader.readAsText(file);
  });
}

function validateFile(file: File, target: UploadTarget): string | null {
  const extension = fileExtension(file.name);
  const acceptedExtensions = target === "resume" ? ["pdf", "txt", "md"] : ["txt", "md"];
  if (!acceptedExtensions.includes(extension)) {
    return target === "resume"
      ? "Choose a PDF, TXT, or Markdown resume."
      : "Choose a TXT or Markdown job description.";
  }
  if (!file.size) return "This file is empty. Choose a file with readable text.";
  if (file.size > MAX_FILE_BYTES) return "Files must be 10 MB or smaller.";
  return null;
}

function fileReadError(error: unknown): string {
  return error instanceof Error ? error.message : "Could not read this file.";
}

function ProgressMeter({ progress, label }: { progress: UploadProgress | null; label: string }) {
  const percent = progress
    ? Math.max(0, Math.min(99, Math.round((progress.current / progress.total) * 100)))
    : null;

  return (
    <div className="career-progress-wrap">
      <div
        className={`career-progress-track${percent === null ? " is-indeterminate" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(percent === null
          ? { "aria-valuetext": "Progress unavailable" }
          : { "aria-valuenow": percent })}
      >
        <span style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      {percent !== null ? <span className="career-progress-percent">{percent}%</span> : null}
    </div>
  );
}

function FileDrop({
  target,
  accept,
  title,
  supported,
  file,
  processing,
  issue,
  notice,
  disabled,
  canRetry,
  onFile,
  onRetry,
  onCancel,
  onRemove,
}: {
  target: UploadTarget;
  accept: string;
  title: string;
  supported: string;
  file: UploadedDocument | null;
  processing: FileProcessing | null;
  issue: string | null;
  notice: string | null;
  disabled: boolean;
  canRetry: boolean;
  onFile: (file: File, target: UploadTarget) => void;
  onRetry: (target: UploadTarget) => void;
  onCancel: (target: UploadTarget) => void;
  onRemove: (target: UploadTarget) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const operation = processing?.target === target ? processing : null;
  const extension = file ? fileExtension(file.name).toUpperCase() : "";

  function acceptDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) onFile(droppedFile, target);
  }

  return (
    <div className={`career-upload-wrap${operation ? " is-processing" : ""}`}>
      <input
        ref={inputRef}
        className="career-visually-hidden"
        type="file"
        accept={accept}
        disabled={disabled || Boolean(processing)}
        onChange={(event) => {
          const chosenFile = event.currentTarget.files?.[0];
          if (chosenFile) onFile(chosenFile, target);
          event.currentTarget.value = "";
        }}
        aria-label={title}
      />

      {file ? (
        <div className="career-file-card">
          <div className="career-file-icon" aria-hidden="true">
            <FileText size={18} />
            <span>{extension}</span>
          </div>
          <div className="career-file-details">
            <strong title={file.name}>{file.name}</strong>
            <span>
              {formatBytes(file.size)} ·{" "}
              {target === "resume" ? "Resume text extracted locally" : "Job description loaded"}
            </span>
          </div>
          <div className="career-file-actions">
            <Button
              type="button"
              variant="ghost"
              className="career-file-action"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || Boolean(processing)}
              aria-label={`Replace ${target === "resume" ? "resume" : "job description"}`}
            >
              <FileUp size={14} />
              <span>Replace</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="career-file-action is-remove"
              onClick={() => onRemove(target)}
              disabled={disabled || Boolean(processing)}
              aria-label={`Remove ${target === "resume" ? "resume" : "job description"} file`}
            >
              <Trash2 size={14} />
              <span>Remove</span>
            </Button>
          </div>
        </div>
      ) : !operation ? (
        <button
          type="button"
          className={`career-dropzone${dragging ? " is-dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragging(false);
            }
          }}
          onDrop={acceptDrop}
          disabled={disabled || Boolean(processing)}
        >
          <span className="career-dropzone-mark">
            <Upload size={19} strokeWidth={1.7} />
          </span>
          <strong>{dragging ? "Release to add your file" : title}</strong>
          <span className="career-dropzone-browse">
            or <u>browse files</u>
          </span>
          <span className="career-supported-formats">{supported}</span>
        </button>
      ) : null}

      {operation ? (
        <div className="career-file-processing" role="status" aria-live="polite">
          <div className="career-processing-topline">
            <div className="career-processing-file">
              <LoaderCircle size={15} className="career-spin" />
              <span>{operation.stage}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="career-cancel-upload"
              onClick={() => onCancel(target)}
              disabled={disabled}
            >
              <X size={13} />
              Cancel
            </Button>
          </div>
          <div className="career-processing-filename">{operation.fileName}</div>
          <ProgressMeter progress={operation.progress} label={`Processing ${operation.fileName}`} />
          {operation.progress?.unit === "pages" ? (
            <span className="career-progress-detail">
              Page {operation.progress.current} of {operation.progress.total}
            </span>
          ) : null}
        </div>
      ) : null}

      {issue ? (
        <div className="career-upload-message is-error" role="alert">
          <CircleAlert size={14} />
          <span>{issue}</span>
          {canRetry ? (
            <button type="button" onClick={() => onRetry(target)} disabled={disabled}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <div className="career-upload-message" role="status">
          <CircleAlert size={14} />
          <span>{notice}</span>
        </div>
      ) : null}
    </div>
  );
}

function SkillRow({ skill }: { skill: Skill }) {
  return (
    <div className="career-skill-row">
      <div className="career-skill-label">
        <span>{skill.name}</span>
        <span className={`career-skill-level level-${skill.level}`}>{skill.level}</span>
      </div>
      <div
        className="career-skill-track"
        role="img"
        aria-label={`${skill.name}: ${skill.current} of ${skill.required} required`}
      >
        <span style={{ width: `${skill.current}%` }} />
        <i style={{ left: `${skill.required}%` }} />
      </div>
      <div className="career-skill-values">
        <span>{skill.current}% current</span>
        <span>{skill.required}% required</span>
      </div>
    </div>
  );
}

function SkillGroup({
  title,
  level,
  skills,
}: {
  title: string;
  level: SkillLevel;
  skills: Skill[];
}) {
  return (
    <section className={`career-skill-group level-${level}`}>
      <header>
        <span className="career-skill-group-dot" />
        <h3>{title}</h3>
        <span className="career-skill-count">{skills.length}</span>
      </header>
      {skills.length ? (
        <div className="career-skill-list">
          {skills.map((skill) => (
            <SkillRow key={`${skill.category}-${skill.name}`} skill={skill} />
          ))}
        </div>
      ) : (
        <p className="career-no-skills">No skills returned in this category.</p>
      )}
    </section>
  );
}

function TopicSet({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="career-topic-set">
      <h3>{title}</h3>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function JobResults({ result }: { result: CareerJobResult }) {
  const { analysis, skillGap, roadmap } = result;
  const skillGroups: { title: string; level: SkillLevel; skills: Skill[] }[] = [
    { title: "Strong match", level: "strong", skills: skillGap.strong },
    { title: "Needs practice", level: "practice", skills: skillGap.practice },
    { title: "Skill gaps", level: "weak", skills: skillGap.weak },
    { title: "Not yet listed", level: "missing", skills: skillGap.missing },
  ];

  return (
    <section className="career-results" aria-labelledby="career-results-title">
      <header className="career-results-heading">
        <div>
          <p className="career-section-kicker">CAREER REPORT</p>
          <h2 id="career-results-title">Your role analysis</h2>
        </div>
        <div className="career-report-status">
          <BadgeCheck size={14} /> Analysis complete
        </div>
      </header>

      {roadmap ? (
        <article className="career-match-summary">
          <div
            className="career-score-ring"
            style={{
              background: `conic-gradient(#a6c5a9 ${roadmap.matchScore}%, rgba(226, 238, 227, 0.1) ${roadmap.matchScore}% 100%)`,
            }}
            role="img"
            aria-label={`Resume match score: ${roadmap.matchScore} percent`}
          >
            <div>
              <strong>{roadmap.matchScore}</strong>
              <span>%</span>
            </div>
          </div>
          <div className="career-match-copy">
            <p className="career-section-kicker">RESUME ↔ ROLE MATCH</p>
            <h3>{roadmap.verdict}</h3>
            <p>
              Match score is based on the skills extracted from your resume and the role
              requirements.
            </p>
          </div>
          <div className="career-match-stats">
            <div>
              <strong>{skillGap.strong.length}</strong>
              <span>Strong matches</span>
            </div>
            <div>
              <strong>
                {skillGap.missing.length + skillGap.weak.length + skillGap.practice.length}
              </strong>
              <span>Focus areas</span>
            </div>
            <div>
              <strong>{roadmap.weeks}</strong>
              <span>Weeks to prepare</span>
            </div>
          </div>
        </article>
      ) : (
        <div className="career-no-roadmap">
          <Target size={17} />
          <div>
            <strong>No resume match score was returned</strong>
            <span>
              The report includes role analysis, but there was not enough resume data to generate a
              personalized roadmap.
            </span>
          </div>
        </div>
      )}

      <div className="career-report-grid">
        <article className="career-report-panel career-role-panel">
          <header className="career-panel-heading">
            <div>
              <p className="career-section-kicker">ROLE PROFILE</p>
              <h3>{analysis.seniority}</h3>
            </div>
            <BriefcaseBusiness size={16} />
          </header>
          <p className="career-role-summary">{analysis.roleSummary}</p>
          <div className="career-topic-grid">
            <TopicSet title="Languages" items={analysis.languages} />
            <TopicSet title="Frameworks" items={analysis.frameworks} />
            <TopicSet title="Databases" items={analysis.databases} />
            <TopicSet title="DSA topics" items={analysis.dsaTopics} />
            <TopicSet title="Interview topics" items={analysis.interviewTopics} />
          </div>
        </article>

        <article className="career-report-panel career-skills-panel">
          <header className="career-panel-heading">
            <div>
              <p className="career-section-kicker">SKILL ALIGNMENT</p>
              <h3>Where to focus</h3>
            </div>
            <span className="career-skill-total">{analysis.skills.length} skills</span>
          </header>
          <p className="career-panel-description">
            Current and required levels are returned by the analysis. Marker shows the role
            requirement.
          </p>
          {analysis.skills.length ? (
            <div className="career-skill-groups">
              {skillGroups.map((group) => (
                <SkillGroup key={group.level} {...group} />
              ))}
            </div>
          ) : (
            <p className="career-no-skills">No skill data was returned for this role.</p>
          )}
          {skillGap.recommendation.length ? (
            <div className="career-focus-list">
              <p>RECOMMENDED FOCUS</p>
              <ul>
                {skillGap.recommendation.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </div>

      {roadmap ? (
        <>
          <div className="career-roadmap-signals">
            {roadmap.categoryFocus.length ? (
              <article className="career-report-panel">
                <header className="career-panel-heading">
                  <div>
                    <p className="career-section-kicker">TIME ALLOCATION</p>
                    <h3>Recommended focus mix</h3>
                  </div>
                  <Clock3 size={15} />
                </header>
                <div className="career-focus-mix">
                  {roadmap.categoryFocus.map((item) => (
                    <div className="career-focus-mix-row" key={item.name}>
                      <span>{item.name}</span>
                      <div>
                        <i style={{ width: `${item.value}%` }} />
                      </div>
                      <strong>{item.value}%</strong>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}
            {roadmap.gaps.length ? (
              <article className="career-report-panel">
                <header className="career-panel-heading">
                  <div>
                    <p className="career-section-kicker">FROM THE MATCH ANALYSIS</p>
                    <h3>Largest skill gaps</h3>
                  </div>
                  <ArrowDownRight size={15} />
                </header>
                <div className="career-gap-list">
                  {roadmap.gaps.slice(0, 5).map((gap) => (
                    <div className="career-gap-row" key={gap.skill}>
                      <span>{gap.skill}</span>
                      <div className="career-gap-track">
                        <i style={{ width: `${gap.have}%` }} />
                        <b style={{ left: `${gap.need}%` }} />
                      </div>
                      <small>
                        {gap.have} / {gap.need}
                      </small>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
          <PreparationRoadmap roadmap={roadmap} />
        </>
      ) : null}
    </section>
  );
}

function PreparationRoadmap({ roadmap }: { roadmap: ResumeMatchRoadmap }) {
  const [problemFilters, setProblemFilters] = useState<ProblemFilterValues>({
    platform: "all",
    difficulty: "all",
    topic: "all",
  });
  const phaseProblems = roadmap.phases.map((phase) => ({
    phase,
    problems: phase.problems?.length
      ? phase.problems
      : (phase.leetcode ?? []).map((problem): PracticeProblemRowData => ({
          ...problem,
          platform: "LeetCode",
          topic: phase.focus[0] ?? problem.pattern,
          linkType: "search",
        })),
  }));
  const platforms = [
    ...new Set(
      phaseProblems.flatMap(({ problems }) => problems.map((problem) => problem.platform)),
    ),
  ].sort();
  const topics = [
    ...new Set(phaseProblems.flatMap(({ problems }) => problems.map((problem) => problem.topic))),
  ].sort();
  const visiblePhaseProblems = phaseProblems.map(({ phase, problems }) => ({
    phase,
    problems: problems.filter(
      (problem) =>
        (problemFilters.platform === "all" || problem.platform === problemFilters.platform) &&
        (problemFilters.difficulty === "all" || problem.difficulty === problemFilters.difficulty) &&
        (problemFilters.topic === "all" || problem.topic === problemFilters.topic),
    ),
  }));
  const visibleProblemCount = visiblePhaseProblems.reduce(
    (count, item) => count + item.problems.length,
    0,
  );

  return (
    <section className="career-roadmap" aria-labelledby="career-roadmap-title">
      <header className="career-roadmap-heading">
        <div>
          <p className="career-section-kicker">YOUR PREPARATION PLAN</p>
          <h2 id="career-roadmap-title">{roadmap.weeks}-week roadmap</h2>
          <p>Personalized from the skills and requirements in this analysis.</p>
        </div>
        <div className="career-roadmap-duration">
          <CalendarDays size={15} /> {roadmap.weeks} weeks
        </div>
      </header>

      <div className="career-practice-toolbar">
        <div>
          <strong>Practice problems</strong>
          <span>
            {visibleProblemCount} matching {visibleProblemCount === 1 ? "problem" : "problems"}
          </span>
        </div>
        <ProblemFilters
          className="career-problem-filters"
          platforms={platforms}
          topics={topics}
          value={problemFilters}
          onChange={setProblemFilters}
        />
      </div>

      <div className="career-phase-list">
        {roadmap.phases.length ? (
          roadmap.phases.map((phase, index) => {
            const phaseProblemList =
              visiblePhaseProblems.find((item) => item.phase.id === phase.id)?.problems ?? [];
            return (
              <article className="career-phase" key={phase.id}>
                <div className="career-phase-marker">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {index < roadmap.phases.length - 1 ? <i /> : null}
                </div>
                <div className="career-phase-content">
                  <header className="career-phase-heading">
                    <div>
                      <p>{phase.weeks}</p>
                      <h3>{phase.title}</h3>
                    </div>
                    <div className="career-intensity">
                      <span>Plan intensity</span>
                      <strong>{phase.intensity}%</strong>
                    </div>
                  </header>
                  <p className="career-phase-outcome">{phase.outcome}</p>
                  {phase.focus.length ? (
                    <div className="career-phase-focus">
                      {phase.focus.map((focus) => (
                        <span key={focus}>{focus}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="career-phase-details">
                    {phase.actions.length ? (
                      <section>
                        <h4>
                          <BookOpenCheck size={14} /> Preparation tasks
                        </h4>
                        <ol className="career-action-list">
                          {phase.actions.map((action, actionIndex) => (
                            <li key={`${phase.id}-${actionIndex}-${action.title}`}>
                              <span className="career-action-number">
                                {String(actionIndex + 1).padStart(2, "0")}
                              </span>
                              <div>
                                <div className="career-action-title">
                                  <strong>{action.title}</strong>
                                  <span>
                                    <Clock3 size={11} /> {action.timebox}
                                  </span>
                                </div>
                                <p>{action.instructions}</p>
                                <small>Deliverable · {action.deliverable}</small>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ) : null}
                    {phaseProblemList.length ? (
                      <section className="career-practice-section">
                        <h4>
                          <Target size={14} /> Practice problems
                        </h4>
                        <div className="career-practice-list">
                          {phaseProblemList.map((problem, problemIndex) => (
                            <PracticeProblemRow
                              key={`${phase.id}-${problem.title}-${problemIndex}`}
                              problem={{
                                ...problem,
                                topic: problem.topic || phase.focus[0] || problem.pattern,
                              }}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <p className="career-no-skills">No preparation phases were returned for this analysis.</p>
        )}
        {roadmap.phases.length > 0 && visibleProblemCount === 0 ? (
          <p className="career-no-practice-results">No practice problems match these filters.</p>
        ) : null}
      </div>

      {roadmap.quickWins.length ? (
        <aside className="career-quick-wins">
          <Sparkles size={16} />
          <div>
            <p>QUICK RESUME WINS</p>
            <ul>
              {roadmap.quickWins.map((win) => (
                <li key={win}>{win}</li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
    </section>
  );
}

function CareerPage() {
  const [jd, setJd] = useState(SAMPLE_JD);
  const [jdFile, setJdFile] = useState<UploadedDocument | null>(null);
  const [resume, setResume] = useState<UploadedDocument | null>(null);
  const [duration, setDuration] = useState("12");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("weeks");
  const [processingFile, setProcessingFile] = useState<FileProcessing | null>(null);
  const [fileIssue, setFileIssue] = useState<FileIssue | null>(null);
  const [fileNotice, setFileNotice] = useState<FileIssue | null>(null);
  const activeFileController = useRef<AbortController | null>(null);
  const retryFile = useRef<{ file: File; target: UploadTarget } | null>(null);
  const task = useBackgroundTask<CareerJobResult>("career-job");

  useEffect(() => () => activeFileController.current?.abort(), []);

  function resetFinishedTask() {
    if (task.isSuccess || task.isError) task.reset();
  }

  const parsedDuration = Number(duration);
  const weeks = durationUnit === "months" ? parsedDuration * 4 : parsedDuration;
  const maxDuration = durationUnit === "months" ? 12 : 52;
  const durationValid =
    Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= maxDuration;
  const canGenerate =
    !processingFile &&
    Boolean(resume?.text.trim()) &&
    jd.trim().length >= MIN_JOB_DESCRIPTION_CHARS &&
    jd.length <= MAX_TEXT_CHARS &&
    durationValid;

  async function processFile(file: File, target: UploadTarget) {
    const validationError = validateFile(file, target);
    if (validationError) {
      retryFile.current = null;
      setFileIssue({ target, message: validationError });
      setFileNotice(null);
      return;
    }

    activeFileController.current?.abort();
    const controller = new AbortController();
    activeFileController.current = controller;
    retryFile.current = { file, target };
    setFileIssue(null);
    setFileNotice(null);
    setProcessingFile({
      target,
      fileName: file.name,
      stage: fileExtension(file.name) === "pdf" ? "Opening PDF" : "Reading text file",
      progress: null,
    });

    const updateProgress = (progress: UploadProgress) => {
      if (activeFileController.current !== controller) return;
      setProcessingFile((current) =>
        current?.target === target
          ? {
              ...current,
              stage: progress.unit === "pages" ? "Extracting resume text" : "Reading file",
              progress,
            }
          : current,
      );
    };

    try {
      let text: string;
      if (fileExtension(file.name) === "pdf") {
        const { extractPdfText } = await import("@/lib/pdf");
        text = await extractPdfText(file, {
          signal: controller.signal,
          onProgress: ({ stage, pagesCompleted, totalPages }) => {
            if (stage === "extracting" && totalPages !== undefined) {
              updateProgress({ unit: "pages", current: pagesCompleted, total: totalPages });
            } else if (activeFileController.current === controller) {
              setProcessingFile((current) =>
                current?.target === target
                  ? { ...current, stage: "Reading PDF", progress: null }
                  : current,
              );
            }
          },
        });
      } else {
        text = await readTextFile(file, controller.signal, updateProgress);
      }

      if (controller.signal.aborted) return;
      const cleanText = text.trim();
      if (!cleanText) throw new Error("No readable text was found in this file.");
      if (cleanText.length > MAX_TEXT_CHARS) {
        throw new Error("Extracted text is over 30,000 characters. Please use a shorter file.");
      }
      if (target === "resume" && cleanText.length < MIN_RESUME_CHARS) {
        throw new Error("At least 40 characters of resume text are needed for a match report.");
      }
      if (target === "description" && cleanText.length < MIN_JOB_DESCRIPTION_CHARS) {
        throw new Error("The job description must contain at least 20 characters.");
      }

      const loadedDocument = { name: file.name, size: file.size, type: file.type, text: cleanText };
      if (target === "resume") setResume(loadedDocument);
      else {
        setJd(cleanText);
        setJdFile(loadedDocument);
      }
      resetFinishedTask();
    } catch (error) {
      if (!controller.signal.aborted) {
        setFileIssue({ target, message: fileReadError(error) });
      }
    } finally {
      if (activeFileController.current === controller) {
        activeFileController.current = null;
        setProcessingFile(null);
      }
    }
  }

  function cancelFile(target: UploadTarget) {
    const current = processingFile;
    if (!current || current.target !== target) return;
    activeFileController.current?.abort();
    activeFileController.current = null;
    setProcessingFile(null);
    setFileIssue(null);
    setFileNotice({
      target,
      message: `${current.fileName} processing was cancelled. Your existing file is unchanged.`,
    });
  }

  function removeFile(target: UploadTarget) {
    if (target === "resume") setResume(null);
    else {
      setJd("");
      setJdFile(null);
    }
    setFileIssue((current) => (current?.target === target ? null : current));
    setFileNotice(null);
    retryFile.current = null;
    resetFinishedTask();
  }

  function updateJobDescription(value: string) {
    setJd(value);
    setJdFile(null);
    setFileIssue((current) => (current?.target === "description" ? null : current));
    setFileNotice((current) => (current?.target === "description" ? null : current));
    resetFinishedTask();
  }

  function runAnalysis() {
    if (!canGenerate || !resume || task.isPending) return;
    task.run(() => analyzeJobDescription(jd, resume.text, weeks));
  }

  const resumeIssue = fileIssue?.target === "resume" ? fileIssue.message : null;
  const descriptionIssue = fileIssue?.target === "description" ? fileIssue.message : null;
  const resumeNotice = fileNotice?.target === "resume" ? fileNotice.message : null;
  const descriptionNotice = fileNotice?.target === "description" ? fileNotice.message : null;
  const retryTarget = retryFile.current?.target;

  return (
    <div className="career-page">
      <header className="career-page-heading">
        <div className="career-heading-copy">
          <span className="career-intelligence-badge">
            <Sparkles size={13} /> AI Career Intelligence
          </span>
          <h1>Job Analyzer</h1>
          <p>See how your experience maps to the role—and what to focus on before the interview.</p>
        </div>
        {task.isSuccess ? (
          <div className="career-complete-mark">
            <Check size={14} /> Report ready
          </div>
        ) : null}
      </header>

      <section className="career-input-grid" aria-label="Resume and job description">
        <article className="career-input-panel career-resume-panel">
          <header className="career-input-heading">
            <span className="career-step-number">01</span>
            <div>
              <p>START WITH YOUR EXPERIENCE</p>
              <h2>Your resume</h2>
            </div>
          </header>
          <FileDrop
            target="resume"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            title="Drop your resume here"
            supported="PDF · TXT · Markdown  /  10 MB max"
            file={resume}
            processing={processingFile}
            issue={resumeIssue}
            notice={resumeNotice}
            disabled={task.isPending}
            canRetry={retryTarget === "resume"}
            onFile={(file, target) => void processFile(file, target)}
            onRetry={(target) => {
              if (retryFile.current?.target === target) {
                void processFile(retryFile.current.file, target);
              }
            }}
            onCancel={cancelFile}
            onRemove={removeFile}
          />
          <p className="career-privacy-note">
            <span />
            PDF text is extracted on your device. Only extracted text is sent for analysis.
          </p>
        </article>

        <article className="career-input-panel career-description-panel">
          <header className="career-input-heading">
            <span className="career-step-number">02</span>
            <div>
              <p>DEFINE THE OPPORTUNITY</p>
              <h2>Job description</h2>
            </div>
            {jdFile ? (
              <span className="career-description-file">
                <FileText size={12} /> {jdFile.name}
              </span>
            ) : null}
          </header>
          <div className="career-description-editor">
            <Textarea
              value={jd}
              onChange={(event) => updateJobDescription(event.target.value)}
              rows={9}
              disabled={task.isPending || processingFile?.target === "description"}
              placeholder="Paste the role description, responsibilities, and qualifications…"
              aria-label="Job description"
              className="career-description-textarea"
            />
            <footer>
              <label className="career-attach-jd">
                <input
                  className="career-visually-hidden"
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  disabled={task.isPending || Boolean(processingFile)}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void processFile(file, "description");
                    event.currentTarget.value = "";
                  }}
                  aria-label="Attach a job description text file"
                />
                <FileUp size={13} />
                Attach TXT / MD
              </label>
              <span className={jd.length > MAX_TEXT_CHARS ? "is-over-limit" : ""}>
                {jd.length.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()}
              </span>
            </footer>
          </div>
          {jdFile ||
          processingFile?.target === "description" ||
          descriptionIssue ||
          descriptionNotice ? (
            <FileDrop
              target="description"
              accept=".txt,.md,text/plain,text/markdown"
              title="Drop a job description"
              supported="TXT · Markdown  /  10 MB max"
              file={jdFile}
              processing={processingFile}
              issue={descriptionIssue}
              notice={descriptionNotice}
              disabled={task.isPending}
              canRetry={retryTarget === "description"}
              onFile={(file, target) => void processFile(file, target)}
              onRetry={(target) => {
                if (retryFile.current?.target === target) {
                  void processFile(retryFile.current.file, target);
                }
              }}
              onCancel={cancelFile}
              onRemove={removeFile}
            />
          ) : null}
        </article>
      </section>

      <section className="career-plan-bar" aria-label="Preparation timeline settings">
        <div className="career-plan-intro">
          <span className="career-plan-icon">
            <CalendarDays size={16} />
          </span>
          <div>
            <p className="career-section-kicker">PREPARATION WINDOW</p>
            <h2>When is your interview?</h2>
          </div>
        </div>
        <div className="career-plan-duration">
          <Input
            type="number"
            value={duration}
            onChange={(event) => {
              setDuration(event.target.value);
              resetFinishedTask();
            }}
            min={1}
            max={maxDuration}
            step={1}
            required
            disabled={task.isPending}
            aria-label="Available preparation time"
            className="career-duration-input"
          />
          <Select
            value={durationUnit}
            onValueChange={(value) => {
              setDurationUnit(value as DurationUnit);
              resetFinishedTask();
            }}
            disabled={task.isPending}
          >
            <SelectTrigger
              className="career-duration-select"
              aria-label="Preparation duration unit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weeks">Weeks</SelectItem>
              <SelectItem value="months">Months</SelectItem>
            </SelectContent>
          </Select>
          <span className="career-plan-summary">
            {durationValid
              ? `${weeks} ${weeks === 1 ? "week" : "weeks"} to prepare`
              : `Choose 1–${maxDuration} ${durationUnit}.`}
          </span>
        </div>
        <Button
          type="button"
          onClick={runAnalysis}
          disabled={task.isPending || !canGenerate}
          className="career-generate-button"
        >
          {task.isPending ? (
            <LoaderCircle size={16} className="career-spin" />
          ) : (
            <Sparkles size={15} />
          )}
          {task.isPending
            ? "Analyzing role…"
            : task.data
              ? "Refresh career report"
              : "Generate career report"}
          {!task.isPending ? <ChevronRight size={15} /> : null}
        </Button>
      </section>

      <p className="career-form-hint">
        {!resume
          ? "Add a resume and a job description to generate your personalized report."
          : processingFile
            ? "Wait for local file processing to finish before generating the report."
            : jd.trim().length < MIN_JOB_DESCRIPTION_CHARS
              ? `Add at least ${MIN_JOB_DESCRIPTION_CHARS} characters to the job description.`
              : jd.length > MAX_TEXT_CHARS
                ? "The job description exceeds the 30,000 character service limit."
                : !durationValid
                  ? `Choose a preparation window from 1 to ${maxDuration} ${durationUnit}.`
                  : "Your resume and job description are sent only when you generate the report."}
      </p>

      {task.isPending ? (
        <section className="career-analysis-progress" role="status" aria-live="polite">
          <div className="career-analysis-progress-icon">
            <LoaderCircle size={18} className="career-spin" />
          </div>
          <div className="career-analysis-progress-copy">
            <p className="career-section-kicker">CAREER ANALYSIS IN PROGRESS</p>
            <h2>Matching your experience to the role</h2>
            <p>
              The service returns the skill analysis and preparation plan together. Exact progress
              is not available during this request.
            </p>
          </div>
          <ProgressMeter progress={null} label="Career analysis progress" />
        </section>
      ) : null}

      {task.isError ? (
        <section className="career-request-error" role="alert">
          <CircleAlert size={17} />
          <div>
            <strong>We couldn’t complete the career analysis.</strong>
            <p>
              {task.error?.message ?? "The request failed. Check your connection and try again."}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={runAnalysis} disabled={!canGenerate}>
            <RotateCcw size={14} />
            Retry
          </Button>
        </section>
      ) : null}

      {task.data ? (
        <JobResults result={task.data} />
      ) : !task.isPending && !task.isError ? (
        <section className="career-empty-report">
          <div className="career-empty-icon">
            <Target size={18} />
          </div>
          <div>
            <p className="career-section-kicker">A CLEARER NEXT STEP</p>
            <h2>Your career report will appear here</h2>
            <p>
              Compare the role with your actual resume, then get a focused plan based on the gaps
              the analysis finds.
            </p>
          </div>
          <ArrowDownRight className="career-empty-arrow" size={18} />
        </section>
      ) : null}
    </div>
  );
}
