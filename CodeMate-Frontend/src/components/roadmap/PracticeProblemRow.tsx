import { BadgeCheck, ExternalLink, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { CodingPlatform, Difficulty, ProblemLinkType } from "@/types/domain";

const PLATFORM_HOST: Partial<Record<CodingPlatform, string>> = {
  LeetCode: "leetcode.com",
  GeeksforGeeks: "geeksforgeeks.org",
  Codeforces: "codeforces.com",
  HackerRank: "hackerrank.com",
  CodeChef: "codechef.com",
  AtCoder: "atcoder.jp",
  InterviewBit: "interviewbit.com",
  "CSES Problem Set": "cses.fi",
  HackerEarth: "hackerearth.com",
  SPOJ: "spoj.com",
  NeetCode: "neetcode.io",
};

const PLATFORM_MONOGRAM: Record<CodingPlatform, string> = {
  LeetCode: "LC",
  GeeksforGeeks: "GFG",
  Codeforces: "CF",
  HackerRank: "HR",
  CodeChef: "CC",
  AtCoder: "AC",
  InterviewBit: "IB",
  "CSES Problem Set": "CSES",
  HackerEarth: "HE",
  SPOJ: "SPOJ",
  NeetCode: "NC",
  Other: "—",
};

const DIRECT_PATH: Partial<Record<CodingPlatform, RegExp>> = {
  LeetCode: /^\/problems\/[a-z0-9-]+(?:\/description)?\/?$/i,
  GeeksforGeeks: /^\/problems\/[^/]+(?:\/\d+)?\/?$/i,
  Codeforces: /^\/(?:contest\/\d+\/problem\/[a-z0-9]+|problemset\/problem\/\d+\/[a-z0-9]+)\/?$/i,
  HackerRank: /^\/challenges\/[^/]+\/problem\/?$/i,
  CodeChef: /^\/(?:problems\/[a-z0-9_-]+|contests\/[^/]+\/problems\/[a-z0-9_-]+)\/?$/i,
  AtCoder: /^\/(?:contests\/[^/]+\/tasks\/[^/]+|tasks\/[^/]+)\/?$/i,
  InterviewBit: /^\/(?:problems\/[^/]+|courses\/[^/]+\/topics\/[^/]+\/problems\/[^/]+)\/?$/i,
  "CSES Problem Set": /^\/problemset\/task\/\d+\/?$/i,
  HackerEarth: /^\/(?:practice\/.+|challenges\/.+\/problem\/?)$/i,
  SPOJ: /^\/problems\/[a-z0-9_-]+\/?$/i,
  NeetCode: /^\/problems\/[a-z0-9-]+\/?$/i,
};

export interface PracticeProblemRowData {
  id?: string;
  title: string;
  platform: CodingPlatform;
  difficulty: Difficulty;
  topic: string;
  pattern: string;
  practiceGoal?: string;
  url: string;
  linkType?: ProblemLinkType;
  completed?: boolean;
  estimatedMinutes?: number;
}

function safePracticeProblemHref(
  problem: Pick<PracticeProblemRowData, "platform" | "url" | "linkType">,
): string | null {
  try {
    const url = new URL(problem.url);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (problem.linkType === "search") {
      if (
        problem.platform === "LeetCode" &&
        host === "leetcode.com" &&
        url.pathname === "/problemset/"
      ) {
        return url.searchParams.has("search") ? url.href : null;
      }
      if (host !== "google.com" || url.pathname !== "/search") return null;
      const expectedHost = PLATFORM_HOST[problem.platform];
      return expectedHost && url.searchParams.get("q")?.includes(`site:${expectedHost}`)
        ? url.href
        : null;
    }

    const allowedHost = PLATFORM_HOST[problem.platform];
    const path = DIRECT_PATH[problem.platform];
    if (
      !allowedHost ||
      !path ||
      !(
        host === allowedHost ||
        (problem.platform === "GeeksforGeeks" && host === "practice.geeksforgeeks.org")
      ) ||
      !path.test(url.pathname)
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function PracticeProblemRow({
  problem,
  onCompletedChange,
  disabled = false,
}: {
  problem: PracticeProblemRowData;
  onCompletedChange?: (completed: boolean) => void;
  disabled?: boolean;
}) {
  const href = safePracticeProblemHref(problem);
  const isSearch = problem.linkType !== "direct";
  const content = (
    <>
      <span className="practice-platform-mark" aria-hidden="true">
        {PLATFORM_MONOGRAM[problem.platform]}
      </span>
      <span className="practice-problem-main">
        <strong>{problem.title}</strong>
        <span className="practice-problem-tags">
          <span>{problem.topic}</span>
          {problem.pattern && problem.pattern.toLowerCase() !== problem.topic.toLowerCase() ? (
            <span>{problem.pattern}</span>
          ) : null}
          {problem.estimatedMinutes ? <span>{problem.estimatedMinutes} min</span> : null}
        </span>
        {problem.practiceGoal ? <small>{problem.practiceGoal}</small> : null}
      </span>
      <span className="practice-problem-meta">
        <span className={`practice-difficulty difficulty-${problem.difficulty}`}>
          {problem.difficulty}
        </span>
        {href ? (
          <span className={`practice-open-action${isSearch ? " is-search" : ""}`}>
            {isSearch ? <Search aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />}
            <span>{isSearch ? `Search ${problem.platform}` : `Open ${problem.platform}`}</span>
            <ExternalLink aria-hidden="true" />
          </span>
        ) : (
          <span className="practice-open-action is-unavailable">Link unavailable</span>
        )}
      </span>
    </>
  );

  return (
    <div className={`practice-problem-row${problem.completed ? " is-complete" : ""}`}>
      {onCompletedChange ? (
        <Checkbox
          checked={problem.completed === true}
          disabled={disabled}
          aria-label={`Mark ${problem.title} complete`}
          onCheckedChange={(checked) => onCompletedChange(checked === true)}
        />
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="practice-problem-link"
          aria-label={`${isSearch ? "Search" : "Open"} ${problem.title} on ${problem.platform} in a new tab`}
        >
          {content}
        </a>
      ) : (
        <div className="practice-problem-link is-unavailable">{content}</div>
      )}
    </div>
  );
}
