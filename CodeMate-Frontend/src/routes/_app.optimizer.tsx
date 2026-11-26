import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, syntaxHighlighting, type LanguageSupport } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  FileCode2,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { optimizeCode, verifyOptimization } from "@/services/optimizationService";
import { SAMPLE_CODE } from "@/services/analysisService";
import { LANGUAGES, type Language, type OptimizationCandidate } from "@/types/domain";
import { useBackgroundTask } from "@/hooks/use-background-task";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/optimizer")({
  head: () => ({
    meta: [
      { title: "Optimizer — CodeMate AI" },
      {
        name: "description",
        content:
          "Generate and compare alternative implementations with algorithmic complexity and trade-offs.",
      },
      { property: "og:title", content: "Optimizer — CodeMate AI" },
      {
        property: "og:description",
        content: "Explore measured, explainable code optimization candidates.",
      },
    ],
  }),
  component: OptimizerPage,
});

const FILE_NAME: Record<Language, string> = {
  python: "solution.py",
  java: "Solution.java",
  c: "solution.c",
  cpp: "solution.cpp",
  javascript: "solution.js",
  typescript: "solution.ts",
};

const EDITOR_SETUP = {
  lineNumbers: true,
  highlightActiveLineGutter: true,
  foldGutter: true,
  dropCursor: false,
  indentOnInput: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: false,
  highlightActiveLine: true,
  highlightSelectionMatches: true,
  tabSize: 4,
} as const;

const EDITOR_THEME = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "#dce5de",
      backgroundColor: "#0d100e",
      fontSize: "12px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-code), ui-monospace, SFMono-Regular, monospace",
      lineHeight: "1.72",
    },
    ".cm-content": { minHeight: "100%", padding: "14px 0", caretColor: "#a5c9ad" },
    ".cm-line": { padding: "0 16px" },
    ".cm-gutters": {
      minWidth: "48px",
      border: "none",
      backgroundColor: "#0d100e",
      color: "#657269",
    },
    ".cm-gutterElement": { padding: "0 12px 0 8px" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#bac8bd" },
    ".cm-activeLine": { backgroundColor: "rgba(198, 219, 202, 0.035)" },
    ".cm-cursor": { borderLeftColor: "#a5c9ad" },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(113, 159, 124, 0.26) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(113, 159, 124, 0.32)",
    },
    ".cm-matchingBracket": {
      backgroundColor: "rgba(157, 201, 170, 0.14)",
      outline: "1px solid rgba(157, 201, 170, 0.35)",
    },
    ".cm-placeholder": { color: "#657269" },
    ".cm-tooltip": {
      border: "1px solid rgba(224, 237, 228, 0.13)",
      backgroundColor: "#171c18",
      color: "#dce5de",
    },
  },
  { dark: true },
);

const EDITOR_SYNTAX = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#c5a8e8" },
    { tag: tags.controlKeyword, color: "#d1a5d6" },
    { tag: tags.definitionKeyword, color: "#c5a8e8" },
    { tag: tags.operatorKeyword, color: "#c5a8e8" },
    { tag: tags.string, color: "#a9c98f" },
    { tag: tags.number, color: "#d5b17b" },
    { tag: tags.bool, color: "#d5b17b" },
    { tag: tags.null, color: "#d5b17b" },
    { tag: tags.comment, color: "#748179", fontStyle: "italic" },
    { tag: tags.function(tags.variableName), color: "#8fc7c1" },
    { tag: tags.definition(tags.variableName), color: "#e1c98d" },
    { tag: tags.typeName, color: "#82b5d1" },
    { tag: tags.className, color: "#82b5d1" },
    { tag: tags.propertyName, color: "#d6dfd8" },
    { tag: tags.operator, color: "#a8b5ab" },
    { tag: tags.punctuation, color: "#a8b5ab" },
    { tag: tags.invalid, color: "#f08d87", textDecoration: "underline wavy" },
  ]),
);

function languageSupport(language: Language): LanguageSupport {
  switch (language) {
    case "python":
      return python();
    case "java":
      return java();
    case "c":
    case "cpp":
      return cpp();
    case "typescript":
      return javascript({ typescript: true });
    case "javascript":
      return javascript();
  }
}

function CodeEditor({
  value,
  language,
  ariaLabel,
  readOnly = false,
  editable = true,
  placeholder,
  onChange,
}: {
  value: string;
  language: Language;
  ariaLabel: string;
  readOnly?: boolean;
  editable?: boolean;
  placeholder?: string;
  onChange?: (value: string) => void;
}) {
  const extensions = useMemo(
    () => [
      languageSupport(language),
      EDITOR_THEME,
      EDITOR_SYNTAX,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
    ],
    [language, ariaLabel],
  );

  return (
    <CodeMirror
      value={value}
      {...(onChange ? { onChange } : {})}
      extensions={extensions}
      basicSetup={EDITOR_SETUP}
      theme="dark"
      height="100%"
      className="optimizer-codemirror"
      readOnly={readOnly}
      editable={editable}
      {...(placeholder ? { placeholder } : {})}
      aria-label={ariaLabel}
    />
  );
}

function OptimizerPage() {
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState(SAMPLE_CODE.python);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [verifyCandidateId, setVerifyCandidateId] = useState<string | null>(null);
  const [appliedOriginal, setAppliedOriginal] = useState<{
    code: string;
    language: Language;
  } | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<"source" | "candidate" | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const optimize = useBackgroundTask<Awaited<ReturnType<typeof optimizeCode>>>("optimizer");
  const verify =
    useBackgroundTask<Awaited<ReturnType<typeof verifyOptimization>>>("optimizer-verify");
  const result = optimize.data;

  useEffect(() => {
    if (!result) return;
    setCode(result.original.code);
    setLanguage(result.language);
    setAppliedOriginal(null);
    setAppliedNotice(null);
  }, [result]);

  const selectedCandidate =
    result?.candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    result?.candidates.find((candidate) => candidate.id === result.recommendedId) ??
    result?.candidates[0];
  const selectedIndex = selectedCandidate
    ? (result?.candidates.findIndex((candidate) => candidate.id === selectedCandidate.id) ?? -1)
    : -1;
  const selectedVerification =
    verify.data?.candidateId === selectedCandidate?.id ? verify.data : undefined;
  const languageLabel = LANGUAGES.find((item) => item.id === language)?.label ?? language;
  const lineCount = code.split("\n").length;

  function resetResults() {
    optimize.reset();
    verify.reset();
    setSelectedCandidateId(null);
    setVerifyCandidateId(null);
  }

  function handleCodeChange(nextCode: string) {
    if (nextCode === code) return;
    setCode(nextCode);
    resetResults();
    setAppliedNotice(null);
    setCopyError(null);
  }

  function changeLanguage(value: string) {
    const nextLanguage = LANGUAGES.find((item) => item.id === value)?.id;
    if (!nextLanguage || nextLanguage === language) return;
    setLanguage(nextLanguage);
    resetResults();
    setAppliedNotice(null);
  }

  function loadSample() {
    setCode(SAMPLE_CODE[language]);
    setAppliedOriginal(null);
    setAppliedNotice(null);
    setCopyError(null);
    resetResults();
  }

  function generateOptimizations() {
    if (!code.trim() || optimize.isPending) return;
    verify.reset();
    setSelectedCandidateId(null);
    setVerifyCandidateId(null);
    setCopyError(null);
    optimize.run(() => optimizeCode({ code, language }));
  }

  function selectCandidate(candidateId: string) {
    setSelectedCandidateId(candidateId);
    verify.reset();
    setVerifyCandidateId(null);
    setCopyError(null);
  }

  function verifyCandidate(candidateId: string) {
    setVerifyCandidateId(candidateId);
    verify.run(() => verifyOptimization(candidateId));
  }

  function applyCandidate(candidate: OptimizationCandidate) {
    if (!result) return;
    setAppliedOriginal({ code: result.original.code, language: result.language });
    setCode(candidate.code);
    setAppliedNotice(`${candidate.approach} applied. The original source is available to restore.`);
    resetResults();
  }

  function restoreOriginal() {
    if (!appliedOriginal) return;
    setCode(appliedOriginal.code);
    setLanguage(appliedOriginal.language);
    setAppliedOriginal(null);
    setAppliedNotice("Original source restored.");
    resetResults();
  }

  async function copyCode(target: "source" | "candidate", value: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setCopyError(null);
      window.setTimeout(() => setCopied((current) => (current === target ? null : current)), 1400);
    } catch (error) {
      setCopied(null);
      setCopyError(error instanceof Error ? error.message : "Could not copy code.");
    }
  }

  return (
    <div className="optimizer-page">
      <header className="optimizer-heading">
        <div>
          <p className="optimizer-eyebrow">
            CODE INTELLIGENCE <span>/</span> OPTIMIZATION
          </p>
          <h1>Solution Optimizer</h1>
          <p>Explore alternative approaches. Keep the original until you choose to apply one.</p>
        </div>
        {result ? (
          <div className="optimizer-result-count">
            <span>{result.candidates.length}</span> candidates
            <i aria-hidden="true" />
            Recommended:{" "}
            <strong>
              {result.candidates.find((candidate) => candidate.id === result.recommendedId)
                ?.approach ?? "—"}
            </strong>
          </div>
        ) : null}
      </header>

      <section className="optimizer-workspace" aria-label="Solution optimization workspace">
        <article className="optimizer-source-pane" aria-labelledby="optimizer-source-title">
          <header className="optimizer-toolbar">
            <div className="optimizer-file" id="optimizer-source-title">
              <span className="optimizer-file-icon">
                <FileCode2 size={15} />
              </span>
              <span>{FILE_NAME[language]}</span>
              <span className="optimizer-file-state">Draft</span>
            </div>
            <div className="optimizer-toolbar-actions">
              <Select value={language} onValueChange={changeLanguage} disabled={optimize.isPending}>
                <SelectTrigger className="optimizer-language" aria-label="Programming language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  side="bottom"
                  align="start"
                  sideOffset={4}
                  className="optimizer-language-content"
                >
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
                className="optimizer-tool-button"
                onClick={loadSample}
                disabled={optimize.isPending}
              >
                <Code2 size={14} />
                Load sample
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="optimizer-tool-button optimizer-copy-source"
                onClick={() => void copyCode("source", code)}
                disabled={!code}
              >
                {copied === "source" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "source" ? "Copied" : "Copy"}
              </Button>
            </div>
          </header>

          <div className="optimizer-editor-heading">
            <div>
              <p>ORIGINAL SOURCE</p>
              <span>
                {languageLabel} · {FILE_NAME[language]}
              </span>
            </div>
            {appliedOriginal ? (
              <Button
                type="button"
                variant="ghost"
                className="optimizer-restore-button"
                onClick={restoreOriginal}
              >
                <RotateCcw size={13} />
                Restore original
              </Button>
            ) : null}
          </div>

          <div className="optimizer-editor-shell">
            <CodeEditor
              value={code}
              language={language}
              ariaLabel="Original source code editor"
              editable={!optimize.isPending}
              placeholder="Write or paste code to optimize…"
              onChange={handleCodeChange}
            />
          </div>

          <footer className="optimizer-editor-footer">
            <span>
              {lineCount} {lineCount === 1 ? "line" : "lines"}
              <i />
              {code.length} characters
            </span>
            <span>{languageLabel}</span>
          </footer>

          {result ? (
            <div className="optimizer-baseline">
              <span>Baseline</span>
              <strong>{result.original.approach}</strong>
              <code>{result.original.complexity.time}</code>
              <code>{result.original.complexity.space}</code>
            </div>
          ) : null}

          {appliedNotice ? (
            <p className="optimizer-applied-notice" role="status">
              {appliedNotice}
            </p>
          ) : null}
          {copyError ? (
            <p className="optimizer-inline-error" role="alert">
              {copyError}
            </p>
          ) : null}

          <div className="optimizer-source-actions">
            <p>
              {optimize.isPending
                ? "Comparing algorithmic approaches…"
                : result
                  ? "Candidates are compared against this source."
                  : "Your source is sent to the optimizer only when you run it."}
            </p>
            <Button
              type="button"
              className="optimizer-generate-button"
              onClick={generateOptimizations}
              disabled={optimize.isPending || !code.trim()}
            >
              {optimize.isPending ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <WandSparkles size={15} />
              )}
              {optimize.isPending ? "Generating…" : "Generate optimizations"}
              {!optimize.isPending ? <ChevronRight size={14} /> : null}
            </Button>
          </div>
        </article>

        <section className="optimizer-results-pane" aria-labelledby="optimizer-results-title">
          <header className="optimizer-results-heading">
            <div>
              <p className="optimizer-eyebrow">RESULTS</p>
              <h2 id="optimizer-results-title">Optimization candidates</h2>
            </div>
            <span className={`optimizer-result-state${optimize.isError ? " is-error" : ""}`}>
              <i />
              {optimize.isPending
                ? "GENERATING"
                : optimize.isError
                  ? "FAILED"
                  : result
                    ? "READY"
                    : "WAITING"}
            </span>
          </header>

          <div className="optimizer-results-body">
            {optimize.isPending ? (
              <div
                className="optimizer-state optimizer-pending-state"
                role="status"
                aria-live="polite"
              >
                <span className="optimizer-state-icon">
                  <LoaderCircle size={19} className="animate-spin" />
                </span>
                <h3>Exploring alternatives</h3>
                <p>Generating approaches and checking their algorithmic trade-offs.</p>
              </div>
            ) : optimize.isError ? (
              <div className="optimizer-state optimizer-error-state" role="alert">
                <span className="optimizer-state-icon">
                  <Sparkles size={18} />
                </span>
                <h3>Couldn’t generate candidates</h3>
                <p>{optimize.error?.message ?? "The optimization request failed."}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateOptimizations}
                  disabled={!code.trim()}
                >
                  <RotateCcw size={14} />
                  Retry optimization
                </Button>
              </div>
            ) : !result ? (
              <div className="optimizer-state optimizer-empty-state">
                <span className="optimizer-state-icon">
                  <Sparkles size={18} />
                </span>
                <h3>Compare approaches</h3>
                <p>Optimization candidates, complexity, and trade-offs will appear here.</p>
                <span className="optimizer-empty-hint">
                  Edit the source, then generate optimizations.
                </span>
              </div>
            ) : selectedCandidate ? (
              <div className="optimizer-candidate-view">
                <div className="optimizer-explanation">
                  <p>{result.explanation}</p>
                  <div className="optimizer-original-complexity">
                    <span>ORIGINAL · {result.original.approach}</span>
                    <code>Time {result.original.complexity.time}</code>
                    <code>Space {result.original.complexity.space}</code>
                  </div>
                </div>

                <div
                  className="optimizer-candidate-switcher"
                  role="tablist"
                  aria-label="Optimization candidates"
                >
                  {result.candidates.map((candidate, index) => {
                    const active = candidate.id === selectedCandidate.id;
                    const recommended = candidate.id === result.recommendedId;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`optimizer-candidate-tab${active ? " is-active" : ""}${recommended ? " is-recommended" : ""}`}
                        onClick={() => selectCandidate(candidate.id)}
                      >
                        <span className="optimizer-candidate-tab-index">0{index + 1}</span>
                        <span className="optimizer-candidate-tab-name">{candidate.approach}</span>
                        {recommended ? (
                          <span
                            className="optimizer-recommended-mark"
                            title="Recommended candidate"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="optimizer-selected-candidate" role="tabpanel">
                  <header className="optimizer-candidate-heading">
                    <div>
                      <p className="optimizer-candidate-overline">
                        CANDIDATE {String(selectedIndex + 1).padStart(2, "0")}
                        {selectedCandidate.id === result.recommendedId ? (
                          <span>RECOMMENDED</span>
                        ) : null}
                      </p>
                      <h3>{selectedCandidate.approach}</h3>
                      <p>{selectedCandidate.rationale}</p>
                    </div>
                    <div className="optimizer-complexity-pair" aria-label="Complexity comparison">
                      <span>
                        <small>TIME</small>
                        <strong>{selectedCandidate.complexity.time}</strong>
                      </span>
                      <ChevronRight size={13} aria-hidden="true" />
                      <span>
                        <small>SPACE</small>
                        <strong>{selectedCandidate.complexity.space}</strong>
                      </span>
                    </div>
                  </header>

                  <div className="optimizer-candidate-metrics">
                    <div>
                      <span>Readability</span>
                      <strong>
                        {selectedCandidate.readability}
                        <small>/100</small>
                      </strong>
                    </div>
                    <div>
                      <span>Model confidence</span>
                      <strong>
                        {selectedCandidate.confidence}
                        <small>/100</small>
                      </strong>
                    </div>
                    <div>
                      <span>Estimated improvement</span>
                      <strong>
                        {selectedCandidate.improvement}
                        <small>%</small>
                      </strong>
                    </div>
                  </div>
                  <p className="optimizer-estimate-note">
                    Improvement is an algorithmic estimate, not a measured runtime. Use Benchmark to
                    measure execution.
                  </p>

                  <div className="optimizer-preview">
                    <header className="optimizer-preview-toolbar">
                      <div>
                        <Code2 size={14} />
                        <span>{FILE_NAME[language]}</span>
                        <span>OPTIMIZED PREVIEW</span>
                      </div>
                      <div className="optimizer-preview-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          className="optimizer-preview-button"
                          onClick={() => void copyCode("candidate", selectedCandidate.code)}
                        >
                          {copied === "candidate" ? <Check size={13} /> : <Copy size={13} />}
                          {copied === "candidate" ? "Copied" : "Copy"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="optimizer-apply-button"
                          onClick={() => applyCandidate(selectedCandidate)}
                        >
                          Apply to editor
                        </Button>
                      </div>
                    </header>
                    <div className="optimizer-preview-editor">
                      <CodeEditor
                        value={selectedCandidate.code}
                        language={language}
                        ariaLabel={`Optimized code preview: ${selectedCandidate.approach}`}
                        readOnly
                        editable={false}
                      />
                    </div>
                  </div>

                  <div className="optimizer-verification">
                    <div className="optimizer-verification-copy">
                      <CheckCircle2 size={15} />
                      <div>
                        <strong>
                          {selectedVerification
                            ? selectedVerification.equivalent
                              ? "Equivalence verified"
                              : "Output differences found"
                            : "Equivalence not checked"}
                        </strong>
                        <span>
                          {selectedVerification
                            ? `${selectedVerification.passed}/${selectedVerification.total} cases matched`
                            : "Run the same-input check before applying with confidence."}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="optimizer-verify-button"
                      onClick={() => verifyCandidate(selectedCandidate.id)}
                      disabled={verify.isPending}
                    >
                      {verify.isPending && verifyCandidateId === selectedCandidate.id ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      {verify.isPending && verifyCandidateId === selectedCandidate.id
                        ? "Verifying…"
                        : selectedVerification
                          ? "Verify again"
                          : "Verify equivalence"}
                    </Button>
                  </div>
                  {verifyCandidateId === selectedCandidate.id && verify.isError ? (
                    <p className="optimizer-inline-error" role="alert">
                      {verify.error?.message ?? "Verification failed. Try again."}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="optimizer-state optimizer-empty-state">
                <span className="optimizer-state-icon">
                  <Sparkles size={18} />
                </span>
                <h3>No candidates returned</h3>
                <p>The optimizer did not return any alternatives. Try another implementation.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
