import {
  Boxes,
  BrainCircuit,
  Check,
  Code2,
  Database,
  Flag,
  Lightbulb,
  Mic,
  Network,
  Search,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { DSATopic } from "@/types/domain";

const ROW_HEIGHT = 204;
const TOP_PADDING = 150;
const BOTTOM_PADDING = 122;

function stageIcon(topic: DSATopic): LucideIcon {
  const name = `${topic.name} ${topic.keyTopics.join(" ")}`.toLowerCase();
  if (/interview|mock/.test(name)) return Mic;
  if (/machine learning|dynamic programming|memorization|mathematics|\bai\b/.test(name)) {
    return BrainCircuit;
  }
  if (/graph|network/.test(name)) return Network;
  if (/database|api|backend/.test(name)) return Database;
  if (/search|binary/.test(name)) return Search;
  if (/complexity|analysis|optimization/.test(name)) return Timer;
  if (/programming|fundamental|language|coding/.test(name)) return Code2;
  if (/array|tree|hash|data structure/.test(name)) return Boxes;
  return Lightbulb;
}

function windingPath(topics: DSATopic[], height: number): string {
  const stages = topics.map((topic, index) => ({
    id: topic.id,
    y: TOP_PADDING + (topics.length - index - 0.5) * ROW_HEIGHT,
  }));
  const points = [
    { x: 500, y: height - BOTTOM_PADDING / 2 },
    ...stages.map(({ y }) => ({ x: 500, y })),
    { x: 500, y: 58 },
  ];

  return points.slice(1).reduce((path, point, index) => {
    const from = points[index]!;
    const distance = from.y - point.y;
    const bend = index % 2 === 0 ? -168 : 168;
    return `${path} C ${from.x + bend} ${from.y - distance * 0.34}, ${point.x + bend} ${point.y + distance * 0.34}, ${point.x} ${point.y}`;
  }, `M ${points[0]!.x} ${points[0]!.y}`);
}

export function DsaJourneyMap({
  topics,
  selectedStageId,
  onSelectStage,
}: {
  topics: DSATopic[];
  selectedStageId: string | null;
  onSelectStage: (stageId: string) => void;
}) {
  const height = TOP_PADDING + topics.length * ROW_HEIGHT + BOTTOM_PADDING;
  const currentStageId = topics.find((topic) => topic.progress < 100)?.id;
  const visualStages = topics.map((topic, index) => ({ topic, number: index + 1 })).reverse();

  return (
    <div
      className="dsa-journey-map"
      style={{ height }}
      role="group"
      aria-label={`DSA learning journey with ${topics.length} stages`}
    >
      <svg
        className="dsa-journey-path"
        viewBox={`0 0 1000 ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={windingPath(topics, height)}
          fill="none"
          stroke="#c9e2fb"
          strokeWidth="22"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={windingPath(topics, height)}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeDasharray="2 12"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="dsa-journey-finish">
        <Target aria-hidden="true" />
        <span>INTERVIEW READY</span>
      </div>

      <div className="dsa-journey-stages">
        {visualStages.map(({ topic, number }) => {
          const StageIcon = stageIcon(topic);
          const isComplete = topic.progress === 100;
          const isCurrent = currentStageId === topic.id && !isComplete;
          const isSelected = selectedStageId === topic.id;
          const isLeft = number % 2 === 0;
          const highlights = topic.keyTopics.slice(0, 3);

          return (
            <div className={`dsa-journey-row${isLeft ? " is-left" : " is-right"}`} key={topic.id}>
              {isLeft ? (
                <StageCard
                  topic={topic}
                  number={number}
                  Icon={StageIcon}
                  summary={topic.description}
                  highlights={highlights}
                  isComplete={isComplete}
                  isCurrent={isCurrent}
                  isSelected={isSelected}
                  onClick={() => onSelectStage(topic.id)}
                />
              ) : (
                <span className="dsa-journey-spacer" aria-hidden="true" />
              )}
              <div className="dsa-journey-marker-wrap">
                <button
                  type="button"
                  className={`dsa-journey-marker${isComplete ? " is-complete" : ""}${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}`}
                  aria-label={`Open stage ${number}: ${topic.name}${isComplete ? ", completed" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectStage(topic.id)}
                >
                  {isComplete ? <Check aria-hidden="true" /> : number}
                </button>
              </div>
              {isLeft ? (
                <span className="dsa-journey-spacer" aria-hidden="true" />
              ) : (
                <StageCard
                  topic={topic}
                  number={number}
                  Icon={StageIcon}
                  summary={topic.description}
                  highlights={highlights}
                  isComplete={isComplete}
                  isCurrent={isCurrent}
                  isSelected={isSelected}
                  onClick={() => onSelectStage(topic.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="dsa-journey-start">
        <Flag aria-hidden="true" />
        <span>START</span>
      </div>
    </div>
  );
}

function StageCard({
  topic,
  number,
  Icon,
  summary,
  highlights,
  isComplete,
  isCurrent,
  isSelected,
  onClick,
}: {
  topic: DSATopic;
  number: number;
  Icon: LucideIcon | undefined;
  summary: string;
  highlights: readonly string[];
  isComplete: boolean;
  isCurrent: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`dsa-stage-card${isComplete ? " is-complete" : ""}${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}`}
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`Open stage ${number}: ${topic.name}`}
    >
      <span className="dsa-stage-card-art">
        {Icon ? <Icon aria-hidden="true" className="dsa-stage-card-icon" /> : null}
        <span className="dsa-stage-card-art-number">{String(number).padStart(2, "0")}</span>
      </span>
      <span className="dsa-stage-card-copy">
        <span className="dsa-stage-card-meta">
          <span>STAGE {String(number).padStart(2, "0")}</span>
          {isComplete ? (
            <span className="dsa-stage-status is-complete">
              <Check aria-hidden="true" /> Complete
            </span>
          ) : isCurrent ? (
            <span className="dsa-stage-status">UP NEXT</span>
          ) : null}
        </span>
        <strong>{topic.name}</strong>
        <span className="dsa-stage-card-summary">{summary}</span>
        <span className="dsa-stage-highlights">
          {highlights.map((highlight) => (
            <span key={highlight}>{highlight}</span>
          ))}
        </span>
        <span className="dsa-stage-card-footer">
          <span>{topic.durationLabel}</span>
          <span>{topic.problems.length} problems</span>
          <span>
            {topic.difficulty} ·{" "}
            {topic.estimatedMinutes ? `${Math.ceil(topic.estimatedMinutes / 60)}h` : "workload n/a"}
          </span>
        </span>
      </span>
    </button>
  );
}
