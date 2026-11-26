import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import { convertCode } from "@/services/conversionService";
import { SAMPLE_CODE } from "@/services/analysisService";
import { LANGUAGES, type Language } from "@/types/domain";
import { useBackgroundTask } from "@/hooks/use-background-task";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
} from "@/components/app/shared";

export const Route = createFileRoute("/_app/converter")({
  head: () => ({
    meta: [
      { title: "Language Converter — CodeMate AI" },
      {
        name: "description",
        content:
          "Translate a solution between Python, Java, C, C++, JavaScript and TypeScript with a change log and warnings.",
      },
      { property: "og:title", content: "Language Converter — CodeMate AI" },
      {
        property: "og:description",
        content: "Convert code across languages with an explained diff.",
      },
    ],
  }),
  component: ConverterPage,
});

function ConverterPage() {
  const [sourceLanguage, setSourceLanguage] = useState<Language>("python");
  const [targetLanguage, setTargetLanguage] = useState<Language>("java");
  const [optimizeWhileConverting, setOptimize] = useState(true);
  const [code, setCode] = useState(SAMPLE_CODE.python);
  const convert = useBackgroundTask<Awaited<ReturnType<typeof convertCode>>>("converter");
  const targetLanguages = LANGUAGES.filter((language) => language.id !== sourceLanguage);

  function changeSourceLanguage(value: string) {
    const next = value as Language;
    setSourceLanguage(next);
    setCode(SAMPLE_CODE[next]);
    if (targetLanguage === next) {
      const nextTarget = LANGUAGES.find((language) => language.id !== next);
      if (nextTarget) setTargetLanguage(nextTarget.id);
    }
    convert.reset();
  }

  const targetLabel = LANGUAGES.find((language) => language.id === targetLanguage)?.label;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Code Intelligence"
        title="Language Converter"
        description="Translate a working solution across languages while preserving idioms and inspecting every structural change."
        actions={<BackendBadge />}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="source-language" className="text-xs">
              Source language
            </Label>
            <Select value={sourceLanguage} onValueChange={changeSourceLanguage}>
              <SelectTrigger id="source-language" className="w-40">
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
          </div>
          <ArrowLeftRight className="mb-2.5 size-4 text-muted-foreground" />
          <div className="space-y-1.5">
            <Label htmlFor="target-language" className="text-xs">
              Convert to
            </Label>
            <Select
              value={targetLanguage}
              onValueChange={(value) => {
                setTargetLanguage(value as Language);
                convert.reset();
              }}
            >
              <SelectTrigger id="target-language" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetLanguages.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <Switch id="optimize" checked={optimizeWhileConverting} onCheckedChange={setOptimize} />
            <Label htmlFor="optimize" className="text-xs font-medium">
              Optimize while converting
            </Label>
          </div>
          <Button
            className="mb-0.5 ml-auto"
            onClick={() =>
              convert.run(() =>
                convertCode({ code, sourceLanguage, targetLanguage, optimizeWhileConverting }),
              )
            }
            disabled={convert.isPending || !code.trim() || sourceLanguage === targetLanguage}
          >
            {convert.isPending ? "Converting…" : "Convert"}
          </Button>
        </CardContent>
      </Card>

      {convert.isError ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {convert.error?.message ?? "Conversion failed."}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="font-display text-lg">Source</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="min-h-[340px] font-mono text-xs leading-relaxed"
              aria-label="Source code"
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="font-display text-lg">Converted {targetLabel}</CardTitle>
            <CardDescription>
              {convert.data ? convert.data.summary : "The translated result appears here."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {convert.isPending ? <LoadingState label="Translating…" /> : null}
            {!convert.data && !convert.isPending ? (
              <EmptyState
                title="Nothing converted yet"
                description="Choose a target language and run the conversion."
              />
            ) : null}
            {convert.data ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-code">
                    Time {convert.data.complexity.time}
                  </Badge>
                  <Badge variant="outline" className="font-code">
                    Space {convert.data.complexity.space}
                  </Badge>
                </div>
                <CodeBlock code={convert.data.code} label={targetLabel} />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {convert.data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">What changed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {convert.data.changes.map((change, i) => (
                <div key={i} className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
                  <Badge variant="secondary" className="font-code text-[10px] uppercase">
                    {change.category}
                  </Badge>
                  <p className="mt-2 font-code text-xs text-foreground">
                    {change.from} → {change.to}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {change.note}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Warnings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {convert.data.warnings.length === 0 ? (
                <p className="text-xs text-muted-foreground">No conversion warnings.</p>
              ) : (
                convert.data.warnings.map((warning, i) => (
                  <div
                    key={i}
                    className="flex gap-2.5 rounded-xl border border-warning/35 bg-warning/[0.06] p-3.5"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <p className="text-xs leading-relaxed text-muted-foreground">{warning}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
