import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Bug, Info, Play, ShieldAlert } from "lucide-react";
import { analyzeCode, SAMPLE_CODE } from "@/services/analysisService";
import { LANGUAGES, type Language } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CodeBlock,
  EmptyState,
  LoadingState,
  BackendBadge,
  PageHeader,
  ScoreBar,
} from "@/components/app/shared";

export const Route = createFileRoute("/_app/analyzer")({
  head: () => ({
    meta: [
      { title: "Code Analyzer — CodeMate AI" },
      {
        name: "description",
        content:
          "Paste code to see complexity, algorithm pattern detection, bug findings and a code health score.",
      },
      { property: "og:title", content: "Code Analyzer — CodeMate AI" },
      {
        property: "og:description",
        content: "Complexity, pattern detection and bug findings for your code.",
      },
    ],
  }),
  component: AnalyzerPage,
});

const SEVERITY_ICON = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  suggestion: Info,
} as const;

function AnalyzerPage() {
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");
  const analysis = useMutation({ mutationFn: analyzeCode });

  function loadSample(nextLanguage = language) {
    setLanguage(nextLanguage);
    setCode(SAMPLE_CODE[nextLanguage]);
    analysis.reset();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Code Analyzer"
        description="Detect the algorithm pattern, estimate complexity and surface bugs before you submit."
        actions={<BackendBadge />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="font-display text-xl">Your code</CardTitle>
              <CardDescription>Paste a solution or load a sample.</CardDescription>
            </div>
            <Select
              value={language}
              onValueChange={(value) => {
                const next = value as Language;
                loadSample(next);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="min-h-[340px] font-mono text-xs"
              aria-label="Code input"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => analysis.mutate({ code, language })}
                disabled={analysis.isPending || !code.trim()}
              >
                <Play className="size-4" />
                {analysis.isPending ? "Analyzing…" : "Analyze code"}
              </Button>
              <Button variant="ghost" onClick={() => loadSample()}>
                Load sample
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {analysis.isPending ? <LoadingState label="Analyzing your code…" /> : null}

          {!analysis.data && !analysis.isPending ? (
            <EmptyState
              title="No analysis yet"
              description="Run the analyzer to see complexity, the detected pattern and any bugs found in your code."
            />
          ) : null}

          {analysis.data ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-xl">Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ScoreBar label="Code health" value={analysis.data.codeHealth} />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">Time complexity</p>
                      <p className="metric text-lg">{analysis.data.complexity.time}</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">Space complexity</p>
                      <p className="metric text-lg">{analysis.data.complexity.space}</p>
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{analysis.data.pattern.name}</p>
                      <Badge variant="secondary">{analysis.data.pattern.confidence}% match</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {analysis.data.pattern.description}
                    </p>
                  </div>
                  <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                    <p className="font-medium">
                      {analysis.data.optimizationHint.approach}:{" "}
                      {analysis.data.optimizationHint.from} → {analysis.data.optimizationHint.to}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {analysis.data.optimizationHint.summary}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-xl">
                    Bugs & issues ({analysis.data.bugs.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {analysis.data.bugs.map((bug) => {
                    const Icon = SEVERITY_ICON[bug.severity] ?? Bug;
                    return (
                      <div key={bug.id} className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 text-warning" />
                          <p className="text-sm font-medium">{bug.title}</p>
                          <Badge variant="outline" className="ml-auto text-[10px] uppercase">
                            line {bug.line} · {bug.severity}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{bug.explanation}</p>
                        <CodeBlock className="mt-2 max-h-40" code={bug.suggestedFix} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
