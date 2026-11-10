import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { optimizeCode, verifyOptimization } from "@/services/optimizationService";
import { SAMPLE_CODE } from "@/services/analysisService";
import { LANGUAGES, type Language } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  MockBadge,
  PageHeader,
  ScoreBar,
} from "@/components/app/shared";

export const Route = createFileRoute("/_app/optimizer")({
  head: () => ({
    meta: [
      { title: "Optimizer — CodeMate AI" },
      {
        name: "description",
        content:
          "Compare multiple optimized solutions side by side with complexity, readability and confidence scores.",
      },
      { property: "og:title", content: "Optimizer — CodeMate AI" },
      { property: "og:description", content: "Four optimized candidates, one recommendation." },
    ],
  }),
  component: OptimizerPage,
});

function OptimizerPage() {
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState(SAMPLE_CODE.python);
  const optimize = useMutation({ mutationFn: optimizeCode });
  const verify = useMutation({ mutationFn: verifyOptimization });

  const result = optimize.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Optimizer"
        description="Generate several optimized rewrites and pick the one that fits your constraints."
        actions={<MockBadge />}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="font-display text-xl">Original solution</CardTitle>
            <CardDescription>The baseline we optimize against.</CardDescription>
          </div>
          <Select
            value={language}
            onValueChange={(v) => {
              const next = v as Language;
              setLanguage(next);
              setCode(SAMPLE_CODE[next]);
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
            className="min-h-[220px] font-mono text-xs"
            aria-label="Code to optimize"
          />
          <Button
            onClick={() => {
              verify.reset();
              optimize.mutate({ code, language });
            }}
            disabled={optimize.isPending || !code.trim()}
          >
            <Sparkles className="size-4" />
            {optimize.isPending ? "Optimizing…" : "Generate optimizations"}
          </Button>
        </CardContent>
      </Card>

      {optimize.isPending ? <LoadingState label="Exploring optimization candidates…" /> : null}

      {!result && !optimize.isPending ? (
        <EmptyState
          title="No candidates yet"
          description="Run the optimizer to compare alternative approaches with their complexity and trade-offs."
        />
      ) : null}

      {result ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">Why this changes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{result.explanation}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Original: {result.original.approach}</Badge>
                <Badge variant="outline">Time {result.original.complexity.time}</Badge>
                <Badge variant="outline">Space {result.original.complexity.space}</Badge>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue={result.candidates[0]!.id}>
            <TabsList className="flex-wrap">
              {result.candidates.map((c) => (
                <TabsTrigger key={c.id} value={c.id}>
                  {c.approach}
                  {c.id === result.recommendedId ? " ★" : ""}
                </TabsTrigger>
              ))}
            </TabsList>
            {result.candidates.map((c) => (
              <TabsContent key={c.id} value={c.id} className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-display text-xl">{c.approach}</CardTitle>
                      {c.id === result.recommendedId ? (
                        <Badge className="bg-success text-success-foreground">Recommended</Badge>
                      ) : null}
                      <Badge variant="outline">Time {c.complexity.time}</Badge>
                      <Badge variant="outline">Space {c.complexity.space}</Badge>
                    </div>
                    <CardDescription>{c.rationale}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <ScoreBar label="Readability" value={c.readability} />
                      <ScoreBar label="Confidence" value={c.confidence} />
                      <ScoreBar label="Improvement" value={c.improvement} />
                    </div>
                    <CodeBlock code={c.code} />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => verify.mutate(c.id)}
                        disabled={verify.isPending}
                      >
                        <CheckCircle2 className="size-4" />
                        {verify.isPending ? "Verifying…" : "Verify equivalence"}
                      </Button>
                      {verify.data && verify.data.candidateId === c.id ? (
                        <p className="text-sm text-success">
                          {verify.data.passed}/{verify.data.total} tests passed — output equivalent
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
