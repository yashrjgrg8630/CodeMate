import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import { convertCode } from "@/services/conversionService";
import { SAMPLE_CODE } from "@/services/analysisService";
import { LANGUAGES, type Language } from "@/types/domain";
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
  MockBadge,
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
  const convert = useMutation({ mutationFn: convertCode });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Language Converter"
        description="Move a working solution to another language and see exactly what changed."
        actions={<MockBadge />}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Select
              value={sourceLanguage}
              onValueChange={(v) => {
                const next = v as Language;
                setSourceLanguage(next);
                setCode(SAMPLE_CODE[next]);
              }}
            >
              <SelectTrigger className="w-40">
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
            <Label>To</Label>
            <Select value={targetLanguage} onValueChange={(v) => setTargetLanguage(v as Language)}>
              <SelectTrigger className="w-40">
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
          <div className="mb-2 flex items-center gap-2">
            <Switch id="optimize" checked={optimizeWhileConverting} onCheckedChange={setOptimize} />
            <Label htmlFor="optimize">Optimize while converting</Label>
          </div>
          <Button
            className="mb-0.5 ml-auto"
            onClick={() =>
              convert.mutate({ code, sourceLanguage, targetLanguage, optimizeWhileConverting })
            }
            disabled={convert.isPending || !code.trim()}
          >
            {convert.isPending ? "Converting…" : "Convert"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Source</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="min-h-[320px] font-mono text-xs"
              aria-label="Source code"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Converted</CardTitle>
            <CardDescription>
              {convert.data ? convert.data.summary : "The translated result appears here."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  <Badge variant="outline">Time {convert.data.complexity.time}</Badge>
                  <Badge variant="outline">Space {convert.data.complexity.space}</Badge>
                </div>
                <CodeBlock code={convert.data.code} />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {convert.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">What changed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {convert.data.changes.map((change, i) => (
                <div key={i} className="rounded-md border border-border p-3">
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {change.category}
                  </Badge>
                  <p className="mt-2 text-sm">
                    {change.from} → {change.to}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{change.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">Warnings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {convert.data.warnings.map((warning, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-md border border-warning/40 bg-warning/5 p-3"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-xs text-muted-foreground">{warning}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
