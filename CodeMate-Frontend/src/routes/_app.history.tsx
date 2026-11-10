import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { clearHistory, deleteHistoryItem, getHistory } from "@/services/historyService";
import { LANGUAGES, type CodeHistoryItem, type Language } from "@/types/domain";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BackendBadge,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
  RequestError,
} from "@/components/app/shared";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/history")({
  head: () => ({
    meta: [
      { title: "History — CodeMate AI" },
      {
        name: "description",
        content:
          "Browse every analyzed, optimized, converted and benchmarked solution in one timeline.",
      },
      { property: "og:title", content: "History — CodeMate AI" },
      { property: "og:description", content: "Your full code evolution timeline." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["history"],
    queryFn: getHistory,
    refetchOnMount: "always",
  });
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language | "all">("all");

  const deleteMutation = useMutation({
    mutationFn: deleteHistoryItem,
    onSuccess: (_, historyId) => {
      queryClient.setQueryData(["history"], (current: CodeHistoryItem[] | undefined) =>
        current?.filter((item) => item.id !== historyId),
      );
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: clearHistory,
    onSuccess: () => {
      queryClient.setQueryData(["history"], []);
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
  });

  const items = (data ?? []).filter(
    (item) =>
      (language === "all" || item.language === language) &&
      item.title.toLowerCase().includes(query.toLowerCase()),
  );

  const handleDelete = (id: string) => deleteMutation.mutate(id);
  const handleClear = () => clearMutation.mutate();

  return (
    <div className="space-y-6">
      <PageHeader
        title="History"
        description="Every solution you have run through CodeMate, with how it evolved."
        actions={<BackendBadge />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title"
            className="pl-9"
          />
        </div>
        <Select value={language} onValueChange={(v) => setLanguage(v as Language | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && data.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleClear}
            disabled={clearMutation.isPending}
          >
            <Trash2 className="size-4" />
            Clear history
          </Button>
        ) : null}
      </div>

      {isError ? <RequestError onRetry={() => void refetch()} /> : null}
      {!isError && isLoading ? <LoadingSkeleton rows={4} /> : null}

      {!isError && !isLoading && items.length === 0 ? (
        <EmptyState
          title={data?.length === 0 ? "No history yet" : "Nothing matches"}
          description={
            data?.length === 0
              ? "Your saved analyses and other activity will appear here."
              : "Try a different search term or clear the language filter."
          }
        />
      ) : null}

      {!isError && items.length > 0 ? (
        <Card>
          <CardContent className="p-2">
            <Accordion type="single" collapsible>
              {items.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <div className="flex items-center gap-2">
                    <AccordionTrigger className="flex-1 px-3">
                      <div className="flex w-full flex-wrap items-center gap-2 pr-3 text-left">
                        <span className="font-medium">{item.title}</span>
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {item.language}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {item.status}
                        </Badge>
                        <span className="metric ml-auto text-xs text-muted-foreground">
                          {item.originalComplexity} → {item.optimizedComplexity} · {item.date}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${item.title}`}
                      title="Delete history item"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <AccordionContent className="px-4">
                    <p className="mb-3 text-sm text-muted-foreground">
                      Optimization gain: {item.optimizationPercent}%
                    </p>
                    <ol className="space-y-2 border-l border-border pl-4">
                      {item.evolution.map((step, i) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">{step.step}</span>
                          <span className="block text-xs text-muted-foreground">{step.detail}</span>
                        </li>
                      ))}
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
