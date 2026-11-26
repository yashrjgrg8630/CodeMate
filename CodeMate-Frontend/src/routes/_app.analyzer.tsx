import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Code2,
  Info,
  Loader2,
  Play,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
} from "lucide-react";
import { analyzeCode, SAMPLE_CODE } from "@/services/analysisService";
import { LANGUAGES, type Language } from "@/types/domain";
import { useBackgroundTask } from "@/hooks/use-background-task";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CodeBlock } from "@/components/app/shared";

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

const FILE_EXT: Record<Language, string> = {
  python: "solution.py",
  java: "Solution.java",
  c: "solution.c",
  cpp: "solution.cpp",
  javascript: "solution.js",
  typescript: "solution.ts",
};

function AnalyzerPage() {
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const analysis = useBackgroundTask<Awaited<ReturnType<typeof analyzeCode>>>("analyzer");

  function loadSample() {
    setCode(SAMPLE_CODE[language]);
    analysis.reset();
  }

  function runAnalysis() {
    if (!code.trim() || analysis.isPending) return;
    analysis.run(() => analyzeCode({ code, language }));
  }

  const lineCount = code.split("\n").length;
  const languageLabel = LANGUAGES.find((item) => item.id === language)?.label ?? language;
  const healthValue = analysis.data ? Math.min(100, Math.max(0, analysis.data.codeHealth)) : 0;

  return (
    <div className="analyzer-page">
      <header className="analyzer-heading">
        <div>
          <p className="analyzer-heading__eyebrow">
            WORKSPACE <span>/</span> CODE ANALYSIS
          </p>
          <h1>Code Analyzer</h1>
          <p>Understand the complexity, patterns, and potential issues in a solution.</p>
        </div>
      </header>

      <section className="analyzer-workspace" aria-label="Code analysis workspace">
        <div className="analyzer-editor-pane">
          <div className="analyzer-toolbar">
            <div className="analyzer-file-tab">
              <Code2 size={16} aria-hidden="true" />
              <span>{FILE_EXT[language]}</span>
            </div>

            <div className="analyzer-toolbar__actions">
              <Select
                value={language}
                onValueChange={(value) => {
                  const nextLanguage = LANGUAGES.find((item) => item.id === value)?.id;
                  if (!nextLanguage) return;
                  setLanguage(nextLanguage);
                  if (!analysis.isIdle) analysis.reset();
                }}
              >
                <SelectTrigger
                  className="analyzer-language-select"
                  aria-label="Programming language"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                onClick={loadSample}
                className="analyzer-sample-button"
              >
                Load sample
              </Button>
              <Button
                type="button"
                onClick={runAnalysis}
                disabled={analysis.isPending || !code.trim()}
                className="analyzer-run-button"
              >
                {analysis.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {analysis.isPending ? "Analyzing…" : "Analyze code"}
              </Button>
            </div>
          </div>

          <div className="analyzer-editor">
            <div className="analyzer-line-numbers" ref={lineNumbersRef} aria-hidden="true">
              <pre>{Array.from({ length: lineCount }, (_, index) => index + 1).join("\n")}</pre>
            </div>
            <Textarea
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (!analysis.isIdle) analysis.reset();
              }}
              onScroll={(event) => {
                if (lineNumbersRef.current) {
                  lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
                }
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              placeholder="Paste code here, or load a sample to get started."
              className="analyzer-textarea"
              aria-label="Code input"
            />
          </div>

          <footer className="analyzer-statusbar" aria-live="polite">
            <span>
              {lineCount} {lineCount === 1 ? "line" : "lines"}
              <i />
              {code.length} characters
            </span>
            <span>{languageLabel}</span>
          </footer>
        </div>

        <aside className="analyzer-diagnostics" aria-labelledby="analyzer-diagnostics-title">
          <header className="analyzer-diagnostics__header">
            <div>
              <p className="analyzer-diagnostics__eyebrow">INSPECTOR</p>
              <h2 id="analyzer-diagnostics-title">Diagnostic output</h2>
            </div>
            <span
              className={`analyzer-state${analysis.isError ? " analyzer-state--error" : ""}${analysis.data ? " analyzer-state--complete" : ""}`}
              role="status"
            >
              <i />
              {analysis.isPending
                ? "RUNNING"
                : analysis.isError
                  ? "FAILED"
                  : analysis.data
                    ? "COMPLETE"
                    : "READY"}
            </span>
          </header>

          <div className="analyzer-diagnostics__body">
            {analysis.isPending ? (
              <div className="analyzer-progress" role="status" aria-live="polite">
                <span className="analyzer-progress__icon">
                  <Loader2 size={19} className="animate-spin" />
                </span>
                <h3>Reading your code</h3>
                <p>Evaluating its structure, complexity, and possible issues.</p>
                <div className="analyzer-progress__bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ) : analysis.isError ? (
              <div className="analyzer-error" role="alert">
                <span className="analyzer-error__icon">
                  <AlertTriangle size={18} />
                </span>
                <h3>Analysis didn’t complete</h3>
                <p>{analysis.error?.message ?? "The analysis failed without an error message."}</p>
                <div className="analyzer-error__actions">
                  <Button
                    type="button"
                    onClick={runAnalysis}
                    disabled={!code.trim()}
                    className="analyzer-retry-button"
                  >
                    <RefreshCw size={15} />
                    Retry analysis
                  </Button>
                  {!code.trim() ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={loadSample}
                      className="analyzer-empty__action"
                    >
                      <Code2 size={15} />
                      Load {languageLabel} sample
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : analysis.data ? (
              <div className="analyzer-results">
                <section className="analyzer-result-health">
                  <div className="analyzer-result-health__label">
                    <p>CODE HEALTH</p>
                    <strong>{analysis.data.codeHealth}%</strong>
                  </div>
                  <div
                    className="analyzer-result-health__track"
                    role="meter"
                    aria-label="Code health"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={healthValue}
                  >
                    <span style={{ width: `${healthValue}%` }} />
                  </div>
                </section>

                <section className="analyzer-complexity" aria-label="Complexity">
                  <div>
                    <p>TIME COMPLEXITY</p>
                    <strong>{analysis.data.complexity.time}</strong>
                  </div>
                  <div>
                    <p>SPACE COMPLEXITY</p>
                    <strong>{analysis.data.complexity.space}</strong>
                  </div>
                </section>

                <section className="analyzer-result-section">
                  <div className="analyzer-result-section__heading">
                    <h3>Detected pattern</h3>
                    <Badge variant="secondary" className="analyzer-confidence-badge">
                      {analysis.data.pattern.confidence}% match
                    </Badge>
                  </div>
                  <p className="analyzer-pattern-name">{analysis.data.pattern.name}</p>
                  <p className="analyzer-pattern-category">{analysis.data.pattern.category}</p>
                  <p>{analysis.data.pattern.description}</p>
                </section>

                <section className="analyzer-optimization">
                  <p className="analyzer-optimization__eyebrow">OPTIMIZATION DIRECTION</p>
                  <h3>{analysis.data.optimizationHint.approach}</h3>
                  <p className="analyzer-optimization__complexity">
                    {analysis.data.optimizationHint.from}
                    <span aria-hidden="true"> → </span>
                    {analysis.data.optimizationHint.to}
                  </p>
                  <p>{analysis.data.optimizationHint.summary}</p>
                </section>

                <section className="analyzer-result-section analyzer-issues">
                  <div className="analyzer-result-section__heading">
                    <h3>Findings</h3>
                    <span>{analysis.data.bugs.length}</span>
                  </div>
                  {analysis.data.bugs.length === 0 ? (
                    <p className="analyzer-no-issues">
                      <CheckCircle2 size={16} />
                      No bugs detected in this snippet.
                    </p>
                  ) : (
                    <div className="analyzer-issue-list">
                      {analysis.data.bugs.map((bug) => {
                        const Icon = SEVERITY_ICON[bug.severity] ?? Bug;
                        return (
                          <article className="analyzer-issue" key={bug.id}>
                            <div className="analyzer-issue__heading">
                              <Icon size={15} aria-hidden="true" />
                              <h4>{bug.title}</h4>
                              <span>
                                L{bug.line} · {bug.severity}
                              </span>
                            </div>
                            <p>{bug.explanation}</p>
                            <CodeBlock
                              className="analyzer-fix-code"
                              label="Suggested fix"
                              code={bug.suggestedFix}
                            />
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="analyzer-empty">
                <span className="analyzer-empty__icon">
                  <ScanSearch size={22} />
                </span>
                <p className="analyzer-empty__eyebrow">ANALYSIS WORKSPACE</p>
                <h3>Results appear here</h3>
                <p>
                  Add a code sample or paste a solution, then run Analyze code to see its
                  complexity, detected pattern, and findings.
                </p>
                {!code.trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadSample}
                    className="analyzer-empty__action"
                  >
                    <Code2 size={15} />
                    Load {languageLabel} sample
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
