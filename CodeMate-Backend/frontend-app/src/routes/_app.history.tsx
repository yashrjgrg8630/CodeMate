import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { getHistory } from "@/services/historyService";
import { LANGUAGES, type Language } from "@/types/domain";
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
  EmptyState,
  LoadingSkeleton,
  MockBadge,
  PageHeader,
  QueryErrorState,
} from "@/components/app/shared";

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
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["history"],
    queryFn: getHistory,
  });
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language | "all">("all");

  const items = (data ?? []).filter(
    (item) =>
      (language === "all" || item.language === language) &&
      item.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="History"
        description="Every solution you have run through CodeMate, with how it evolved."
        actions={<MockBadge />}
      />

      <div className="flex flex-wrap gap-3">
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
      </div>

      {isLoading ? <LoadingSkeleton rows={4} /> : null}
      {isError ? <QueryErrorState error={error} onRetry={() => void refetch()} /> : null}

      {!isLoading && !isError && items.length === 0 ? (
        <EmptyState
          title={data?.length === 0 ? "No history yet" : "Nothing matches"}
          description={
            data?.length === 0
              ? "Your activity history will appear here after your account is connected."
              : "Try a different search term or clear the language filter."
          }
        />
      ) : null}

      {!isLoading && !isError ? (
        <Card>
          <CardContent className="p-2">
            <Accordion type="single" collapsible>
              {items.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger className="px-3">
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
