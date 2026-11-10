import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, PlayCircle } from "lucide-react";
import { getRoadmap, setProblemState } from "@/services/roadmapService";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSkeleton, MockBadge, PageHeader, QueryErrorState } from "@/components/app/shared";

export const Route = createFileRoute("/_app/roadmap")({
  head: () => ({
    meta: [
      { title: "DSA Roadmap — CodeMate AI" },
      {
        name: "description",
        content:
          "A prioritised data-structures and algorithms roadmap with curated problems and learning resources.",
      },
      { property: "og:title", content: "DSA Roadmap — CodeMate AI" },
      {
        property: "og:description",
        content: "Topic-by-topic preparation plan with practice problems.",
      },
    ],
  }),
  component: RoadmapPage,
});

const PRIORITY_TONE: Record<string, string> = {
  high: "border-destructive/50 text-destructive",
  medium: "border-warning/50 text-warning",
  low: "border-border text-muted-foreground",
};

function RoadmapPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["roadmap"],
    queryFn: getRoadmap,
  });
  const [done, setDone] = useState<Record<string, boolean>>({});

  const total = data?.topics.reduce((n, t) => n + t.problems.length, 0) ?? 0;
  const isDone = (id: string, saved: boolean) => done[id] ?? saved;
  const completed =
    data?.topics.reduce(
      (n, t) => n + t.problems.filter((p) => isDone(p.id, p.completed)).length,
      0,
    ) ?? 0;
  function toggle(problemId: string, value: boolean) {
    setDone((d) => ({ ...d, [problemId]: value }));
    if (!data?.id) return;
    setProblemState(data.id, problemId, { completed: value }).catch((err: unknown) => {
      setDone((d) => ({ ...d, [problemId]: !value }));
      toast.error(err instanceof Error ? err.message : "Could not save progress.");
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="DSA Roadmap"
        description="Prioritised topics based on your target role, each with practice problems and resources."
        actions={<MockBadge />}
      />

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : isError ? (
        <QueryErrorState error={error} onRetry={() => void refetch()} />
      ) : data ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {data.targetRole} · {data.preparationLevel}
              </CardTitle>
              <CardDescription>
                {completed} of {total} problems marked complete
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
                    <span className="ml-auto text-xs text-muted-foreground">
                      {topic.progress}% ready
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4">
                  <p className="text-sm text-muted-foreground">Pattern focus: {topic.pattern}</p>
                  <Progress value={topic.progress} />
                  <div className="space-y-2">
                    {topic.problems.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card/60 p-3"
                      >
                        <Checkbox
                          checked={isDone(p.id, p.completed)}
                          onCheckedChange={(v) => toggle(p.id, !!v)}
                        />
                        <span className="text-sm font-medium">{p.title}</span>
                        <Badge variant="outline">{p.difficulty}</Badge>
                        <span className="text-xs text-muted-foreground">{p.pattern}</span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {p.platform}
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
              {data.resources.map((r) => (
                <a
                  key={r.id}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent"
                >
                  <PlayCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.channel} · {r.topic} · {r.duration}
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
