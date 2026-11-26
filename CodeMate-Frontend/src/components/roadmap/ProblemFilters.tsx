import { CODING_PLATFORMS } from "@/types/domain";

export interface ProblemFilterValues {
  platform: string;
  difficulty: string;
  topic: string;
}

export function ProblemFilters({
  platforms,
  topics,
  value,
  onChange,
  className = "",
}: {
  platforms: string[];
  topics: string[];
  value: ProblemFilterValues;
  onChange: (value: ProblemFilterValues) => void;
  className?: string;
}) {
  const platformOptions = [
    ...CODING_PLATFORMS.filter((platform) => platforms.includes(platform)),
    ...(platforms.includes("Other") ? ["Other"] : []),
  ];

  return (
    <div className={`problem-filter-bar ${className}`}>
      <label>
        <span>Platform</span>
        <select
          value={value.platform}
          onChange={(event) => onChange({ ...value, platform: event.target.value })}
          aria-label="Filter problems by platform"
        >
          <option value="all">All platforms</option>
          {platformOptions.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Difficulty</span>
        <select
          value={value.difficulty}
          onChange={(event) => onChange({ ...value, difficulty: event.target.value })}
          aria-label="Filter problems by difficulty"
        >
          <option value="all">All levels</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      <label>
        <span>Topic</span>
        <select
          value={value.topic}
          onChange={(event) => onChange({ ...value, topic: event.target.value })}
          aria-label="Filter problems by topic"
        >
          <option value="all">All topics</option>
          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
