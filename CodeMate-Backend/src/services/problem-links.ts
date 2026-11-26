import { logger } from "../lib/logger.js";

export type ProblemLinkType = "direct" | "search";

export interface ProblemLink {
  url: string;
  linkType: ProblemLinkType;
}

interface ProblemWithCandidateUrl {
  title: string;
  platform: string;
  url?: string | null | undefined;
}

const PLATFORM_HOST: Record<string, string> = {
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

const normalizeHost = (hostname: string): string =>
  hostname.toLowerCase().replace(/^www\./, "");

function isPlatformHost(platform: string, hostname: string): boolean {
  const allowed = PLATFORM_HOST[platform];
  if (!allowed) return false;
  const host = normalizeHost(hostname);
  return (
    host === allowed ||
    (platform === "GeeksforGeeks" && host === "practice.geeksforgeeks.org")
  );
}

export function canonicalProblemUrl(
  platform: string,
  value: unknown,
): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !isPlatformHost(platform, url.hostname)
  ) {
    return null;
  }

  const path = url.pathname;
  const directPathByPlatform: Record<string, RegExp> = {
    LeetCode: /^\/problems\/[a-z0-9-]+(?:\/description)?\/?$/i,
    GeeksforGeeks: /^\/problems\/[^/]+(?:\/\d+)?\/?$/i,
    Codeforces:
      /^\/(?:contest\/\d+\/problem\/[a-z0-9]+|problemset\/problem\/\d+\/[a-z0-9]+)\/?$/i,
    HackerRank: /^\/challenges\/[^/]+\/problem\/?$/i,
    CodeChef:
      /^\/(?:problems\/[a-z0-9_-]+|contests\/[^/]+\/problems\/[a-z0-9_-]+)\/?$/i,
    AtCoder: /^\/(?:contests\/[^/]+\/tasks\/[^/]+|tasks\/[^/]+)\/?$/i,
    InterviewBit:
      /^\/(?:problems\/[^/]+|courses\/[^/]+\/topics\/[^/]+\/problems\/[^/]+)\/?$/i,
    "CSES Problem Set": /^\/problemset\/task\/\d+\/?$/i,
    HackerEarth: /^\/(?:practice\/.+|challenges\/.+\/problem\/?)$/i,
    SPOJ: /^\/problems\/[a-z0-9_-]+\/?$/i,
    NeetCode: /^\/problems\/[a-z0-9-]+\/?$/i,
  };
  if (!directPathByPlatform[platform]?.test(path)) return null;

  if (platform === "LeetCode") {
    const slug = /^\/problems\/([a-z0-9-]+)/i.exec(path)?.[1];
    return slug ? `https://leetcode.com/problems/${slug.toLowerCase()}/` : null;
  }
  return url.href;
}

export function platformSearchUrl(platform: string, title: string): string {
  const host = PLATFORM_HOST[platform];
  const query = host
    ? `site:${host} "${title}"`
    : `"${platform} ${title}" problem`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function normalizeProblemTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/&#0*39;|&apos;|&#x0*27;/gi, "")
    .replace(/&quot;/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function exactPageTitleMatch(
  actualValue: string,
  expectedValue: string,
  platform: string,
): boolean {
  const escapedPlatform = platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brandSuffix = new RegExp(
    `\\s*(?:\\||[-–—])\\s*${escapedPlatform}(?:\\s*\\|.*)?$`,
    "i",
  );
  const actual = actualValue
    .replace(brandSuffix, "")
    .replace(/^(?:problem\s*)?[a-z0-9]{1,8}\s*[-.:]\s*/i, "");
  const expectedTitle = normalizeProblemTitle(expectedValue);
  return (
    expectedTitle.length > 2 && normalizeProblemTitle(actual) === expectedTitle
  );
}

function pageTitle(html: string): string {
  const raw = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (!raw) return "";
  const title = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&#x0*27;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return title.replace(
    /&#(?:x([0-9a-f]+)|(\d+));/gi,
    (_match, hex: string, decimal: string) => {
      const codePoint = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    },
  );
}

async function readPageTitle(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) return "";
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 1_000_000) return "";
  const html = (await response.text()).slice(0, 1_000_000);
  return pageTitle(html);
}

export async function verifyProblemPage(
  platform: string,
  title: string,
  candidateUrl: unknown,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const directUrl = canonicalProblemUrl(platform, candidateUrl);
  if (!directUrl) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    let targetUrl = directUrl;
    for (let hop = 0; hop <= 2; hop += 1) {
      const response = await fetcher(targetUrl, {
        headers: { accept: "text/html" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return false;
        const redirectedUrl = canonicalProblemUrl(
          platform,
          new URL(location, targetUrl).href,
        );
        if (!redirectedUrl || redirectedUrl === targetUrl) return false;
        targetUrl = redirectedUrl;
        continue;
      }
      if (!response.ok) return false;
      return exactPageTitleMatch(
        await readPageTitle(response),
        title,
        platform,
      );
    }
    return false;
  } catch (error) {
    logger.warn("problem_link.verification_failed", {
      platform,
      reason:
        error instanceof Error ? error.message : "unknown verification error",
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveProblemLink(
  platform: string,
  title: string,
  candidateUrl: unknown,
  fetcher: typeof fetch = fetch,
): Promise<ProblemLink> {
  const directUrl = canonicalProblemUrl(platform, candidateUrl);
  if (
    directUrl &&
    (await verifyProblemPage(platform, title, directUrl, fetcher))
  ) {
    return { url: directUrl, linkType: "direct" };
  }
  return { url: platformSearchUrl(platform, title), linkType: "search" };
}

export function normalizeStoredProblemLink(
  platform: string,
  title: string,
  url: unknown,
  linkType: unknown,
): ProblemLink {
  if (linkType === "direct") {
    const directUrl = canonicalProblemUrl(platform, url);
    if (directUrl) return { url: directUrl, linkType: "direct" };
  }
  return { url: platformSearchUrl(platform, title), linkType: "search" };
}

export async function resolveProblemLinks<T extends ProblemWithCandidateUrl>(
  problems: T[],
  concurrency = 8,
): Promise<(Omit<T, "url"> & ProblemLink)[]> {
  const results = new Array<Omit<T, "url"> & ProblemLink>(problems.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, problems.length) },
    async () => {
      while (nextIndex < problems.length) {
        const index = nextIndex++;
        const problem = problems[index];
        if (!problem) continue;
        const link = await resolveProblemLink(
          problem.platform,
          problem.title,
          problem.url,
        );
        const { url: _candidateUrl, ...metadata } = problem;
        results[index] = { ...metadata, ...link };
      }
    },
  );
  await Promise.all(workers);
  return results;
}
