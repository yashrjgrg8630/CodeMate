import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Play, Send } from "lucide-react";
import { toast } from "sonner";
import type { InterviewEvaluation, InterviewReport, InterviewSession } from "@/types/domain";
import { evaluateAnswer, getInterviewReport, startInterview } from "@/services/interviewService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingState, MockBadge, PageHeader, ScoreBar } from "@/components/app/shared";

export const Route = createFileRoute("/_app/interview")({
  head: () => ({
    meta: [
      { title: "Mock Interview — CodeMate AI" },
      {
        name: "description",
        content:
          "Run a simulated technical interview with per-question feedback and a final readiness report.",
      },
      { property: "og:title", content: "Mock Interview — CodeMate AI" },
      {
        property: "og:description",
        content: "Practise answering DSA questions and get scored feedback.",
      },
    ],
  }),
  component: InterviewPage,
});

function InterviewPage() {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [evaluations, setEvaluations] = useState<InterviewEvaluation[]>([]);
  const [report, setReport] = useState<InterviewReport | null>(null);

  const question = session?.questions[index];

  async function begin() {
    setBusy(true);
    setEvaluations([]);
    setReport(null);
    setIndex(0);
    setAnswer("");
    setCode("");
    try {
      setSession(await startInterview());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the interview.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!question || !session) return;
    setBusy(true);
    try {
      const evaluation = await evaluateAnswer({ questionId: question.id, answer, code });
      const next = [...evaluations, evaluation];
      setEvaluations(next);
      setAnswer("");
      setCode("");
      if (index + 1 < session.questions.length) {
        setIndex(index + 1);
      } else {
        setReport(await getInterviewReport(next.map((e) => e.score)));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mock Interview"
        description="A five-question simulated interview with scored feedback after every answer."
        actions={
          <>
            <MockBadge />
            <Button onClick={begin} disabled={busy}>
              <Play className="mr-2 size-4" />
              {session ? "Restart interview" : "Start interview"}
            </Button>
          </>
        }
      />

      {!session && !busy ? (
        <EmptyState
          title="No interview in progress"
          description="Start a session to receive questions one at a time and get feedback on each answer."
        />
      ) : null}

      {busy ? <LoadingState label="Evaluating…" /> : null}

      {!busy && session && question && !report ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                Question {question.index} of {question.total}
              </CardTitle>
              <Badge variant="secondary">{question.topic}</Badge>
              <Badge variant="outline">{question.difficulty}</Badge>
            </div>
            <CardDescription>{question.prompt}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={(index / question.total) * 100} />
            <div className="space-y-2">
              <p className="text-sm font-medium">Your approach</p>
              <Textarea
                rows={5}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Describe the data structure, invariant and complexity…"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Your code</p>
              <Textarea
                rows={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono text-xs"
                placeholder="Write your solution here…"
              />
            </div>
            <Button onClick={submit} disabled={!answer.trim()}>
              <Send className="mr-2 size-4" />
              Submit answer
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!busy && evaluations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback so far</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {evaluations.map((e, i) => (
              <div key={e.questionId} className="space-y-2 rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Question {i + 1}</p>
                  <Badge variant="secondary">{e.score}/100</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{e.feedback}</p>
                <p className="text-xs text-muted-foreground">Follow-up: {e.followUp}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {!busy && report ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Final report — {report.overall}/100</CardTitle>
            <CardDescription>Scored across five interview dimensions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <ScoreBar label="Technical knowledge" value={report.scores.technicalKnowledge} />
              <ScoreBar label="Problem solving" value={report.scores.problemSolving} />
              <ScoreBar label="Communication" value={report.scores.communication} />
              <ScoreBar label="Code quality" value={report.scores.codeQuality} />
              <ScoreBar label="Complexity analysis" value={report.scores.complexityAnalysis} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { title: "Strengths", items: report.strengths },
                { title: "Weaknesses", items: report.weaknesses },
                { title: "Recommendations", items: report.recommendations },
              ].map((g) => (
                <div key={g.title} className="space-y-2">
                  <p className="text-sm font-medium">{g.title}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {g.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
