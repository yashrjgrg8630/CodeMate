import { beforeEach, describe, expect, it } from "vitest";
import { dsaRoadmapSchema, type DSARoadmap } from "../src/schemas/domain.js";
import {
  canonicalProblemUrl,
  normalizeStoredProblemLink,
  platformSearchUrl,
  resolveProblemLink,
} from "../src/services/problem-links.js";
import {
  createCtx,
  resetDb,
  signup,
  type Ctx,
  type ErrorBody,
} from "./helpers.js";

let ctx: Ctx;
beforeEach(async () => {
  await resetDb();
  ctx = createCtx();
});

const body = {
  targetRole: "Backend Engineer",
  currentLevel: "Intermediate",
  weeks: 8,
};

describe("POST /api/roadmap", () => {
  it("generates a structured roadmap with stable ids, safe links and zero progress", async () => {
    const s = await signup(ctx);
    const r = await s.post<DSARoadmap>("/api/roadmap", body);
    expect(r.status).toBe(200);
    const rm = dsaRoadmapSchema.parse(r.body);
    expect(rm.topics).toHaveLength(4);
    expect(rm.topics[0]?.name).toContain("Backend");
    expect(rm.topics[0]?.description).toContain("Backend Engineer");
    expect(rm.topics.every((topic) => topic.tasks.length === 2)).toBe(true);
    expect(rm.weeks).toBe(8);
    expect(rm.durationValue).toBe(8);
    expect(rm.durationUnit).toBe("weeks");
    expect(rm.durationDays).toBe(56);
    expect(rm.topics[0]?.weekStart).toBe(1);
    expect(rm.topics.at(-1)?.weekEnd).toBe(8);
    expect(rm.preparationLevel).toBe("Intermediate");
    expect(
      rm.topics.every(
        (t) =>
          t.progress === 0 &&
          t.problems.every((p) => !p.completed && !p.inRevision),
      ),
    ).toBe(true);

    const lc = rm.topics[0]?.problems[0];
    expect(lc?.id).toContain("backend-core-foundations");
    expect(lc?.linkType).toBe("search");
    expect(lc?.url).toBe(platformSearchUrl("LeetCode", lc?.title ?? ""));
    const secondLc = rm.topics[0]?.problems[1];
    expect(secondLc?.url).toBe(
      platformSearchUrl("GeeksforGeeks", secondLc?.title ?? ""),
    );
    expect(secondLc?.url).not.toBe(lc?.url);
    expect(rm.topics[0]?.problems[2]?.platform).toBe("Codeforces");
    expect(
      new Set(
        rm.topics.flatMap((topic) =>
          topic.problems.map((problem) => problem.platform),
        ),
      ).size,
    ).toBe(10);
    expect(
      ctx.transport.callsFor("DSA interview-preparation coach")[0]?.system,
    ).toBeUndefined();
    expect(
      ctx.transport.callsFor("DSA and technical-interview preparation coach")[0]
        ?.system,
    ).toContain("do not reuse a fixed stage list");
    expect(rm.resources[0]?.url).toContain("youtube.com/results?search_query=");
    expect(rm.resources).toHaveLength(4);
    expect(rm.resources.map((resource) => resource.topic)).toEqual(
      rm.topics.map((topic) => topic.name),
    );
    expect(await ctx.db.roadmapProblem.count()).toBe(12);
    expect(await ctx.db.roadmapTask.count()).toBe(8);
  });

  describe("problem destinations", () => {
    const directExamples: [string, string][] = [
      ["LeetCode", "https://leetcode.com/problems/two-sum/"],
      [
        "GeeksforGeeks",
        "https://www.geeksforgeeks.org/problems/array-subset/0/",
      ],
      ["Codeforces", "https://codeforces.com/problemset/problem/4/A"],
      ["HackerRank", "https://www.hackerrank.com/challenges/two-sum/problem"],
      ["CodeChef", "https://www.codechef.com/problems/START01"],
      ["AtCoder", "https://atcoder.jp/contests/abc372/tasks/abc372_a"],
      ["InterviewBit", "https://www.interviewbit.com/problems/two-sum/"],
      ["CSES Problem Set", "https://cses.fi/problemset/task/1068"],
      [
        "HackerEarth",
        "https://www.hackerearth.com/practice/algorithms/dynamic-programming/maximum-subarray-sum/",
      ],
      ["SPOJ", "https://www.spoj.com/problems/TEST/"],
      ["NeetCode", "https://neetcode.io/problems/two-sum"],
    ];

    it("recognizes direct problem URL shapes for every supported platform", () => {
      for (const [platform, url] of directExamples) {
        expect(canonicalProblemUrl(platform, url), platform).not.toBeNull();
      }
      expect(
        canonicalProblemUrl(
          "LeetCode",
          "https://leetcode.com/problemset/?search=Two%20Sum",
        ),
      ).toBeNull();
      expect(
        canonicalProblemUrl(
          "LeetCode",
          "https://leetcode.com.evil.example/problems/two-sum/",
        ),
      ).toBeNull();
      expect(
        canonicalProblemUrl(
          "LeetCode",
          `https://leetcode.com/problems/${"a".repeat(2050)}/`,
        ),
      ).toBeNull();
      expect(
        canonicalProblemUrl("Codeforces", "javascript:alert(1)"),
      ).toBeNull();
    });

    it("marks a direct link only when the page title matches the expected problem", async () => {
      const matchingFetcher: typeof fetch = async () =>
        new Response(
          "<html><head><title>Two Sum - LeetCode</title></head></html>",
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        );
      const mismatchingFetcher: typeof fetch = async () =>
        new Response(
          "<html><head><title>Other Problem - LeetCode</title></head></html>",
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        );

      await expect(
        resolveProblemLink(
          "LeetCode",
          "Two Sum",
          "https://leetcode.com/problems/two-sum/",
          matchingFetcher,
        ),
      ).resolves.toEqual({
        url: "https://leetcode.com/problems/two-sum/",
        linkType: "direct",
      });
      await expect(
        resolveProblemLink(
          "LeetCode",
          "Two Sum",
          "https://leetcode.com/problems/two-sum/",
          mismatchingFetcher,
        ),
      ).resolves.toEqual({
        url: platformSearchUrl("LeetCode", "Two Sum"),
        linkType: "search",
      });
    });

    it("verifies returned direct pages against the title on each supported platform", async () => {
      for (const [platform, url] of directExamples) {
        const fetcher: typeof fetch = async () =>
          new Response(
            `<html><head><title>Two Sum - ${platform}</title></head></html>`,
            {
              status: 200,
              headers: { "content-type": "text/html" },
            },
          );
        await expect(
          resolveProblemLink(platform, "Two Sum", url, fetcher),
        ).resolves.toMatchObject({
          url:
            platform === "LeetCode"
              ? "https://leetcode.com/problems/two-sum/"
              : url,
          linkType: "direct",
        });
      }
    });

    it("keeps verified saved links and replaces unverified links with platform-scoped search", () => {
      expect(
        normalizeStoredProblemLink(
          "LeetCode",
          "Two Sum",
          "https://leetcode.com/problems/two-sum/",
          "direct",
        ),
      ).toEqual({
        url: "https://leetcode.com/problems/two-sum/",
        linkType: "direct",
      });
      expect(
        normalizeStoredProblemLink(
          "AtCoder",
          "Two Sum",
          "https://www.google.com/search?q=wrong",
          "direct",
        ),
      ).toEqual({
        url: platformSearchUrl("AtCoder", "Two Sum"),
        linkType: "search",
      });
    });

    it("turns legacy saved links into clearly classified platform searches", async () => {
      const s = await signup(ctx);
      const generated = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
      const stored = await ctx.db.roadmap.findUniqueOrThrow({
        where: { id: generated.id },
      });
      const payload = JSON.parse(JSON.stringify(stored.payload)) as {
        topics: { problems: { url?: string | null; linkType?: string }[] }[];
      };
      payload.topics[0]!.problems[0]!.url =
        "https://leetcode.com/problemset/?search=Two%20Sum";
      await ctx.db.roadmap.update({
        where: { id: generated.id },
        data: { payload },
      });

      const latest = await s.get<DSARoadmap>("/api/roadmap/latest");
      expect(latest.body.topics[0]?.problems[0]?.url).toBe(
        platformSearchUrl(
          "LeetCode",
          latest.body.topics[0]?.problems[0]?.title ?? "",
        ),
      );
      expect(latest.body.topics[0]?.problems[0]?.linkType).toBe("search");
    });
  });

  it("accepts the frontend's preparationLevel alias and defaults weeks", async () => {
    const s = await signup(ctx);
    const r = await s.post<DSARoadmap>("/api/roadmap", {
      targetRole: "SDE",
      preparationLevel: "Beginner",
    });
    expect(r.status).toBe(200);
    expect(r.body.preparationLevel).toBe("Beginner");
    expect(ctx.transport.calls[0]?.prompt).toContain("8 weeks (56 days)");
  });

  it("adapts stage count and schedule to a custom duration", async () => {
    const s = await signup(ctx);
    const r = await s.post<DSARoadmap>("/api/roadmap", { ...body, weeks: 16 });
    expect(r.status).toBe(200);
    expect(r.body.weeks).toBe(16);
    expect(r.body.topics).toHaveLength(8);
    expect(
      r.body.topics.map((topic) => [topic.weekStart, topic.weekEnd]),
    ).toEqual(
      Array.from({ length: 8 }, (_, index) => [index * 2 + 1, index * 2 + 2]),
    );
    expect(ctx.transport.calls[0]?.prompt).toContain("Create exactly 8 stages");
  });

  it("generates distinct role/level plans and converts the selected duration", async () => {
    const s = await signup(ctx);
    const beginner = await s.post<DSARoadmap>("/api/roadmap", {
      targetRole: "Software Engineer",
      currentLevel: "Beginner",
      durationValue: 4,
      durationUnit: "weeks",
    });
    const advanced = await s.post<DSARoadmap>("/api/roadmap", {
      targetRole: "AI/ML Engineer",
      currentLevel: "Advanced",
      durationValue: 12,
      durationUnit: "weeks",
    });
    expect(beginner.status).toBe(200);
    expect(advanced.status).toBe(200);
    expect(beginner.body.topics).toHaveLength(3);
    expect(beginner.body.topics[0]?.name).toContain("Programming");
    expect(advanced.body.topics).toHaveLength(6);
    expect(advanced.body.topics[0]?.name).toContain("AI/ML");
    expect(advanced.body.topics[0]?.name).toContain("Advanced");
    expect(advanced.body.durationValue).toBe(12);
    expect(advanced.body.durationUnit).toBe("weeks");
    expect(advanced.body.durationDays).toBe(84);
    expect(ctx.transport.calls[0]?.prompt).toContain("Create exactly 3 stages");
    expect(ctx.transport.calls[1]?.prompt).toContain("Create exactly 6 stages");
  });

  it("accepts day and month durations and rejects incomplete or excessive durations", async () => {
    const s = await signup(ctx);
    const days = await s.post<DSARoadmap>("/api/roadmap", {
      targetRole: "Data Scientist",
      currentLevel: "Beginner",
      durationValue: 5,
      durationUnit: "days",
    });
    const months = await s.post<DSARoadmap>("/api/roadmap", {
      targetRole: "Backend Developer",
      currentLevel: "Intermediate",
      durationValue: 6,
      durationUnit: "months",
    });
    expect(days.body.topics).toHaveLength(1);
    expect(days.body.topics[0]?.durationLabel).toBe("Days 1–5");
    expect(months.body.topics).toHaveLength(13);
    expect(months.body.durationDays).toBe(180);
    expect(
      (await s.post("/api/roadmap", { ...body, durationValue: 4 })).status,
    ).toBe(400);
    expect(
      (
        await s.post("/api/roadmap", {
          ...body,
          durationValue: 13,
          durationUnit: "months",
        })
      ).status,
    ).toBe(400);
  });

  it("validates input", async () => {
    const s = await signup(ctx);
    expect((await s.post("/api/roadmap", { ...body, weeks: 0 })).status).toBe(
      400,
    );
    expect((await s.post("/api/roadmap", { ...body, weeks: 100 })).status).toBe(
      400,
    );
    expect(
      (await s.post("/api/roadmap", { ...body, weeks: "eight" })).status,
    ).toBe(400);
  });
});

describe("roadmap completion", () => {
  it("404s on /latest before any roadmap exists", async () => {
    const s = await signup(ctx);
    expect((await s.get<ErrorBody>("/api/roadmap/latest")).status).toBe(404);
  });

  it("toggles completion, updates topic progress and activity, and persists across reads", async () => {
    const s = await signup(ctx);
    const rm = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    const pid = rm.topics[0]?.problems[0]?.id ?? "";

    const done = await s.patch<{ completed: boolean; topicProgress: number }>(
      `/api/roadmap/${rm.id}/problems/${pid}`,
      { completed: true },
    );
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ completed: true, topicProgress: 20 });

    const latest = await s.get<DSARoadmap>("/api/roadmap/latest");
    expect(latest.body.topics[0]?.progress).toBe(20);
    expect(latest.body.topics[0]?.problems[0]?.completed).toBe(true);
    expect(
      await ctx.db.activityEvent.count({ where: { kind: "ROADMAP_PROGRESS" } }),
    ).toBe(1);

    // idempotent: completing again does not duplicate the event
    await s.patch(`/api/roadmap/${rm.id}/problems/${pid}`, { completed: true });
    expect(
      await ctx.db.activityEvent.count({ where: { kind: "ROADMAP_PROGRESS" } }),
    ).toBe(1);

    const undone = await s.patch<{ topicProgress: number }>(
      `/api/roadmap/${rm.id}/problems/${pid}`,
      { completed: false },
    );
    expect(undone.body.topicProgress).toBe(0);
    expect(
      await ctx.db.activityEvent.count({ where: { kind: "ROADMAP_PROGRESS" } }),
    ).toBe(0);
  });

  it("persists task completion, updates stage progress and carries it to a regenerated plan", async () => {
    const s = await signup(ctx);
    const first = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    const taskId = first.topics[0]?.tasks[0]?.id ?? "";
    const completed = await s.patch<{
      taskId: string;
      completed: boolean;
      topicProgress: number;
    }>(`/api/roadmap/${first.id}/tasks/${taskId}`, { completed: true });
    expect(completed.status).toBe(200);
    expect(completed.body).toEqual({
      taskId,
      completed: true,
      topicProgress: 20,
    });

    const latest = await s.get<DSARoadmap>("/api/roadmap/latest");
    expect(latest.body.topics[0]?.progress).toBe(20);
    expect(latest.body.topics[0]?.tasks[0]?.completed).toBe(true);
    expect(
      await ctx.db.activityEvent.count({ where: { kind: "ROADMAP_PROGRESS" } }),
    ).toBe(1);

    const second = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    expect(second.topics[0]?.tasks[0]?.completed).toBe(true);
    expect(second.topics[0]?.progress).toBe(20);
  });

  it("flags problems for revision", async () => {
    const s = await signup(ctx);
    const rm = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    const pid = rm.topics[1]?.problems[1]?.id ?? "";
    await s.patch(`/api/roadmap/${rm.id}/problems/${pid}`, {
      inRevision: true,
    });
    const latest = await s.get<DSARoadmap>("/api/roadmap/latest");
    expect(latest.body.topics[1]?.problems[1]?.inRevision).toBe(true);
  });

  it("carries completed problems over when the roadmap is regenerated", async () => {
    const s = await signup(ctx);
    const first = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    const pid = first.topics[2]?.problems[0]?.id ?? "";
    await s.patch(`/api/roadmap/${first.id}/problems/${pid}`, {
      completed: true,
    });
    const second = (await s.post<DSARoadmap>("/api/roadmap", body)).body;
    expect(second.id).not.toBe(first.id);
    expect(second.topics[2]?.problems[0]?.completed).toBe(true);
    expect(second.topics[2]?.progress).toBe(20);
  });

  it("scopes by user and validates", async () => {
    const owner = await signup(ctx, "owner@example.com");
    const other = await signup(ctx, "other@example.com");
    const rm = (await owner.post<DSARoadmap>("/api/roadmap", body)).body;
    const pid = rm.topics[0]?.problems[0]?.id ?? "";
    expect(
      (
        await other.patch(`/api/roadmap/${rm.id}/problems/${pid}`, {
          completed: true,
        })
      ).status,
    ).toBe(404);
    expect((await other.get("/api/roadmap/latest")).status).toBe(404);
    expect(
      (
        await owner.patch(`/api/roadmap/${rm.id}/problems/nope`, {
          completed: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (await owner.patch(`/api/roadmap/${rm.id}/problems/${pid}`, {})).status,
    ).toBe(400);
    expect(
      (
        await owner.patch(`/api/roadmap/${rm.id}/problems/${pid}`, {
          completed: "yes",
        })
      ).status,
    ).toBe(400);
  });
});
