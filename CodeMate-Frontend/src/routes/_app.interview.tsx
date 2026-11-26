import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Sparkles,
  Volume2,
} from "lucide-react";
import type {
  LiveInterviewDifficulty,
  LiveInterviewDomain,
  LiveInterviewDuration,
  LiveInterviewReport,
} from "@/types/domain";
import {
  abandonLiveInterview,
  completeLiveInterview,
  createLiveInterview,
  LiveInterviewCall,
  type LiveTranscriptTurn,
} from "@/services/liveInterview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBar } from "@/components/app/shared";

type InterviewSettings = {
  domain: LiveInterviewDomain;
  difficulty: LiveInterviewDifficulty;
  durationMinutes: LiveInterviewDuration;
};
type PagePhase = "setup" | "connecting" | "call" | "ending" | "report";
type ConnectionState = "connecting" | "connected" | "disconnected";
type SpeakerState = "interviewer" | "candidate" | "listening";

const DOMAINS: LiveInterviewDomain[] = [
  "AI/ML",
  "DSA",
  "Python",
  "Java",
  "C++",
  "Backend",
  "General Software Engineering",
];
const DIFFICULTIES: LiveInterviewDifficulty[] = ["Beginner", "Intermediate", "Advanced"];
const DURATIONS: LiveInterviewDuration[] = [15, 30, 45];

export const Route = createFileRoute("/_app/interview")({
  head: () => ({
    meta: [
      { title: "Live Mock Interview — CodeMate AI" },
      {
        name: "description",
        content:
          "Practise technical interviews in a real-time voice conversation with an adaptive AI interviewer.",
      },
      { property: "og:title", content: "Live Mock Interview — CodeMate AI" },
      {
        property: "og:description",
        content:
          "A private, real-time voice interview with adaptive technical questions and a transcript-based report.",
      },
    ],
  }),
  component: InterviewPage,
});

function InterviewPage() {
  const [settings, setSettings] = useState<InterviewSettings>({
    domain: "General Software Engineering",
    difficulty: "Intermediate",
    durationMinutes: 15,
  });
  const [phase, setPhase] = useState<PagePhase>("setup");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [speaker, setSpeaker] = useState<SpeakerState>("listening");
  const [transcript, setTranscript] = useState<LiveTranscriptTurn[]>([]);
  const [report, setReport] = useState<LiveInterviewReport | null>(null);
  const [error, setError] = useState("");
  const [finishError, setFinishError] = useState("");
  const [muted, setMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const callRef = useRef<LiveInterviewCall | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const startAttemptRef = useRef(0);
  const endingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const endInterview = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setPhase("ending");

    const durationSeconds = Math.min(
      45 * 60,
      Math.max(0, Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000)),
    );
    const finalTranscript = callRef.current?.getTranscript() ?? transcript;
    setTranscript(finalTranscript);
    await callRef.current?.close();
    callRef.current = null;
    streamRef.current = null;
    setElapsedSeconds(durationSeconds);

    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      setFinishError("The live interview session could not be saved.");
      setPhase("report");
      return;
    }

    try {
      const finalReport = await completeLiveInterview({
        sessionId,
        durationSeconds,
        transcript: finalTranscript,
      });
      setReport(finalReport);
      setFinishError("");
    } catch (finishFailure) {
      setFinishError(
        finishFailure instanceof Error
          ? finishFailure.message
          : "Could not generate the interview report. Your transcript is retained for retry.",
      );
    } finally {
      setPhase("report");
    }
  }, [transcript]);

  useEffect(() => {
    if (phase !== "call") return;
    const timer = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(elapsed);
      if (elapsed >= settings.durationMinutes * 60) void endInterview();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [endInterview, phase, settings.durationMinutes]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, showTranscript]);

  useEffect(
    () => () => {
      startAttemptRef.current += 1;
      void callRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function startInterview(): Promise<void> {
    const attempt = ++startAttemptRef.current;
    sessionIdRef.current = null;
    endingRef.current = false;
    setError("");
    setFinishError("");
    setReport(null);
    setTranscript([]);
    setElapsedSeconds(0);
    setMuted(false);
    setPhase("connecting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Microphone access requires a supported browser and a secure connection (HTTPS or localhost).",
      );
      setPhase("setup");
      return;
    }

    let stream: MediaStream | null = null;
    let sessionId: string | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (attempt !== startAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const credentials = await createLiveInterview(settings);
      sessionId = credentials.sessionId;
      sessionIdRef.current = credentials.sessionId;
      if (attempt !== startAttemptRef.current) {
        await abandonLiveInterview(credentials.sessionId);
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const call = new LiveInterviewCall({
        onConnectionState: setConnectionState,
        onTranscript: setTranscript,
        onSpeaker: setSpeaker,
        onAudioLevel: setAudioLevel,
        onError: setError,
      });
      callRef.current = call;
      await call.connect(credentials, stream);
      if (attempt !== startAttemptRef.current) {
        await call.close();
        await abandonLiveInterview(credentials.sessionId);
        return;
      }

      startedAtRef.current = Date.now();
      setConnectionState("connected");
      setPhase("call");
    } catch (failure) {
      await callRef.current?.close();
      callRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (sessionId) {
        try {
          await abandonLiveInterview(sessionId);
        } catch {
          setError("The call could not connect and its temporary session could not be removed.");
        }
      }
      if (attempt !== startAttemptRef.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not start the live interview. Check the microphone and Gemini Live configuration.",
      );
      setPhase("setup");
    }
  }

  function cancelConnection(): void {
    startAttemptRef.current += 1;
    void callRef.current?.close();
    callRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (sessionId) {
      void abandonLiveInterview(sessionId).catch(() => {
        setError("The temporary interview session could not be removed.");
      });
    }
    setPhase("setup");
  }

  async function retryReport(): Promise<void> {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    setFinishError("");
    try {
      const finalReport = await completeLiveInterview({
        sessionId,
        durationSeconds: elapsedSeconds,
        transcript,
      });
      setReport(finalReport);
    } catch (failure) {
      setFinishError(
        failure instanceof Error
          ? failure.message
          : "Could not generate the report. Please try again.",
      );
    }
  }

  function prepareAnotherInterview(): void {
    endingRef.current = false;
    sessionIdRef.current = null;
    startedAtRef.current = null;
    setPhase("setup");
    setReport(null);
    setTranscript([]);
    setError("");
    setFinishError("");
    setElapsedSeconds(0);
  }

  const fullScreenCall = phase === "connecting" || phase === "call" || phase === "ending";
  const timeRemaining = Math.max(0, settings.durationMinutes * 60 - elapsedSeconds);
  const statusText =
    speaker === "interviewer"
      ? "Interviewer speaking"
      : speaker === "candidate"
        ? "You're speaking · interviewer listening"
        : "Your turn to speak";

  return (
    <>
      {phase === "setup" ? (
        <main className="mx-auto max-w-6xl space-y-8 pb-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                Career &amp; Prep
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                Live Mock Interview
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                A private, real-time voice conversation with an adaptive technical interviewer. No
                scripts, text answers, or code editor.
              </p>
            </div>
            <Badge variant="outline" className="hidden gap-2 sm:flex">
              <Radio className="size-3.5 text-primary" />
              Gemini Live
            </Badge>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="relative flex min-h-[430px] flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-[#0b1115] p-8 text-white shadow-2xl sm:p-10">
              <div
                className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-emerald-400/10 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative">
                <Badge className="border border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/10">
                  <AudioLines className="mr-1.5 size-3.5" />
                  Live speech-to-speech
                </Badge>
                <div className="mt-10 flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_0_60px_rgba(52,211,153,0.12)]">
                  <Sparkles className="size-7 text-emerald-200" />
                </div>
                <h2 className="mt-7 max-w-lg font-display text-3xl font-medium leading-tight">
                  Think out loud.
                  <br />
                  <span className="text-emerald-200">Get a real conversation.</span>
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
                  The interviewer listens to your reasoning, asks follow-ups based on what you
                  actually say, and builds feedback from the complete call.
                </p>
              </div>
              <div className="relative grid grid-cols-3 gap-3 border-t border-white/10 pt-6 text-xs text-white/65">
                <div className="space-y-1">
                  <Volume2 className="mb-2 size-4 text-emerald-200" />
                  Natural voice
                </div>
                <div className="space-y-1">
                  <Radio className="mb-2 size-4 text-emerald-200" />
                  Adaptive follow-ups
                </div>
                <div className="space-y-1">
                  <CheckCircle2 className="mb-2 size-4 text-emerald-200" />
                  Saved report
                </div>
              </div>
            </section>

            <Card className="rounded-3xl border-border/80">
              <CardHeader className="pb-5">
                <CardTitle className="font-display text-xl">Set up your interview</CardTitle>
                <CardDescription>
                  Choose a focus, then allow microphone access when the call begins.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Interview domain
                  </span>
                  <select
                    value={settings.domain}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        domain: event.currentTarget.value as LiveInterviewDomain,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {DOMAINS.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Difficulty
                  </span>
                  <select
                    value={settings.difficulty}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        difficulty: event.currentTarget.value as LiveInterviewDifficulty,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {DIFFICULTIES.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>
                        {difficulty}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Interview duration
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {DURATIONS.map((duration) => (
                      <button
                        key={duration}
                        type="button"
                        aria-pressed={settings.durationMinutes === duration}
                        onClick={() =>
                          setSettings((current) => ({ ...current, durationMinutes: duration }))
                        }
                        className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                          settings.durationMinutes === duration
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {duration} min
                      </button>
                    ))}
                  </div>
                </fieldset>

                {error ? (
                  <p
                    className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}

                <Button
                  className="h-12 w-full rounded-xl text-sm"
                  onClick={() => void startInterview()}
                >
                  <Mic className="size-4" />
                  Start Interview
                </Button>
                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  Your microphone audio is streamed securely to Gemini Live for this call. The
                  transcript and report are saved to your interview history.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      ) : null}

      {fullScreenCall ? (
        <main className="fixed inset-0 z-[100] flex min-h-dvh flex-col overflow-hidden bg-[#070a0d] text-white">
          <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-200/20 bg-emerald-200/[0.08]">
                <Sparkles className="size-4 text-emerald-200" />
              </div>
              <div>
                <p className="text-sm font-semibold">CodeMate Interview</p>
                <p className="text-[11px] text-white/45">
                  {settings.domain} · {settings.difficulty}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="flex items-center gap-2 text-xs text-white/65">
                <Clock3 className="size-3.5" />
                <span className="font-mono tabular-nums">
                  {phase === "ending" ? formatTime(elapsedSeconds) : formatTime(timeRemaining)}
                </span>
                <span className="hidden text-white/35 sm:inline">
                  / {settings.durationMinutes}:00
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px]">
                <span
                  className={`size-1.5 rounded-full ${
                    connectionState === "connected" ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {phase === "connecting"
                  ? "Connecting"
                  : connectionState === "connected"
                    ? "Connected"
                    : "Connection interrupted"}
              </div>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-5 py-8">
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 size-[min(72vw,38rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/[0.035] blur-3xl"
              aria-hidden="true"
            />
            <section className="relative flex w-full max-w-2xl flex-col items-center text-center">
              <div className="relative mb-8 flex size-40 items-center justify-center sm:size-48">
                {speaker === "interviewer" ? (
                  <div className="absolute inset-2 rounded-full border border-emerald-200/20 animate-ping [animation-duration:2.4s]" />
                ) : null}
                <div
                  className="relative flex size-32 items-center justify-center rounded-full border border-emerald-100/20 bg-[radial-gradient(circle_at_35%_30%,rgba(110,231,183,0.32),rgba(16,30,30,0.98)_62%)] shadow-[0_0_90px_rgba(52,211,153,0.16)] transition-transform duration-100"
                  style={{
                    transform: `scale(${1 + (speaker === "candidate" ? audioLevel * 0.06 : 0)})`,
                  }}
                >
                  <div className="absolute inset-2 rounded-full border border-white/[0.08]" />
                  <Sparkles className="size-11 text-emerald-100" />
                </div>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200/70">
                {phase === "connecting"
                  ? "Preparing your private call"
                  : phase === "ending"
                    ? "Finishing interview"
                    : "Technical interview"}
              </p>
              <h1 className="mt-3 font-display text-2xl font-medium sm:text-3xl">AI Interviewer</h1>
              <p className="mt-2 text-sm text-white/55">{statusText}</p>

              <div
                className="mt-8 flex h-10 items-center justify-center gap-1.5"
                aria-label="Live microphone activity"
              >
                {Array.from({ length: 19 }, (_, index) => {
                  const centerWeight = 1 - Math.abs(index - 9) / 10;
                  const height = 5 + audioLevel * 33 * centerWeight;
                  return (
                    <span
                      key={index}
                      className={`w-1 rounded-full transition-[height,opacity] duration-100 ${
                        speaker === "candidate" && audioLevel > 0.04
                          ? "bg-emerald-300"
                          : "bg-white/20"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-white/35">
                {phase === "connecting"
                  ? "Waiting for secure voice connection…"
                  : muted
                    ? "Microphone muted"
                    : "Microphone active"}
              </p>

              {error && phase === "call" ? (
                <p
                  className="mt-4 max-w-lg rounded-xl border border-amber-300/20 bg-amber-200/[0.06] px-4 py-2.5 text-xs text-amber-100/90"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              {phase === "connecting" ? (
                <div className="mt-8 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <LoaderCircle className="size-4 animate-spin" />
                    Allow microphone access if your browser asks
                  </div>
                  <Button
                    variant="ghost"
                    className="text-white/55 hover:text-white"
                    onClick={cancelConnection}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </section>

            {showTranscript ? (
              <aside className="absolute inset-x-4 bottom-4 top-4 z-10 flex flex-col rounded-2xl border border-white/10 bg-[#0d1217]/95 shadow-2xl backdrop-blur-xl sm:inset-y-6 sm:left-auto sm:right-6 sm:w-[min(23rem,calc(100%-3rem))]">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Live transcript</p>
                    <p className="text-[10px] text-white/40">Speech recognition captions</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/60 hover:text-white"
                    aria-label="Hide transcript"
                    onClick={() => setShowTranscript(false)}
                  >
                    <ChevronDown />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  {transcript.length === 0 ? (
                    <p className="pt-8 text-center text-xs text-white/35">
                      The live transcript will appear here as you speak.
                    </p>
                  ) : (
                    transcript.map((turn, index) => (
                      <div key={`${index}-${turn.speaker}`} className="space-y-1.5">
                        <p
                          className={`text-[10px] font-semibold uppercase tracking-wider ${
                            turn.speaker === "interviewer"
                              ? "text-emerald-200/75"
                              : "text-sky-200/75"
                          }`}
                        >
                          {turn.speaker === "interviewer" ? "Interviewer" : "You"}
                        </p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/75">
                          {turn.text}
                        </p>
                      </div>
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </aside>
            ) : null}
          </div>

          <footer className="relative z-20 flex flex-col items-center gap-5 border-t border-white/[0.08] bg-[#090d10]/80 px-5 py-5">
            <div className="flex items-center justify-center gap-3">
              {phase === "call" ? (
                <>
                  <Button
                    variant="outline"
                    size="lg"
                    className={`h-12 min-w-32 rounded-full border-white/15 bg-white/[0.06] text-white hover:bg-white/10 ${
                      muted ? "border-amber-300/35 text-amber-100" : ""
                    }`}
                    onClick={() => {
                      const nextMuted = !muted;
                      setMuted(nextMuted);
                      callRef.current?.setMuted(nextMuted);
                    }}
                  >
                    {muted ? <MicOff /> : <Mic />}
                    {muted ? "Unmute" : "Mute"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="lg"
                    className="h-12 rounded-full px-6"
                    onClick={() => void endInterview()}
                  >
                    <PhoneOff />
                    End interview
                  </Button>
                </>
              ) : phase === "ending" ? (
                <Button
                  variant="outline"
                  disabled
                  className="h-12 rounded-full border-white/15 bg-white/[0.06] text-white/60"
                >
                  <LoaderCircle className="animate-spin" />
                  Saving your interview
                </Button>
              ) : null}
              {phase === "call" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-12 rounded-full text-white/70 hover:bg-white/10 hover:text-white ${
                    showTranscript ? "bg-white/10 text-emerald-100" : ""
                  }`}
                  aria-label={showTranscript ? "Hide transcript" : "Show transcript"}
                  onClick={() => setShowTranscript((visible) => !visible)}
                >
                  {showTranscript ? <ChevronDown /> : <ChevronUp />}
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/35">
              <span
                className={`size-1.5 rounded-full ${muted ? "bg-amber-400" : "bg-emerald-400"}`}
              />
              {muted ? "Microphone muted" : "Microphone permission granted"}
              <span className="px-1 text-white/15">·</span>
              {connectionState === "connected"
                ? "Encrypted live connection"
                : "Securely connecting"}
            </div>
          </footer>
        </main>
      ) : null}

      {phase === "report" ? (
        <main className="mx-auto max-w-5xl space-y-6 pb-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                Interview complete
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                Your interview report
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {settings.domain} · {settings.difficulty} · {formatTime(elapsedSeconds)}
              </p>
            </div>
            <Button variant="outline" onClick={prepareAnotherInterview}>
              <ArrowLeft />
              New interview
            </Button>
          </div>

          {finishError ? (
            <Card className="border-destructive/30 bg-destructive/[0.03]">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <p className="max-w-2xl text-sm leading-relaxed text-destructive" role="alert">
                  {finishError}
                </p>
                <Button onClick={() => void retryReport()} disabled={!transcript.length}>
                  Retry report
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {report ? (
            <>
              <Card className="overflow-hidden rounded-3xl border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card">
                <CardContent className="flex flex-wrap items-end justify-between gap-6 p-7 sm:p-9">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                      Overall performance
                    </p>
                    <p className="mt-3 font-display text-6xl font-semibold tracking-tight">
                      {report.overall}
                      <span className="ml-1 text-2xl text-muted-foreground">/100</span>
                    </p>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                      Scored from your spoken responses and the full interviewer transcript.
                    </p>
                  </div>
                  <div className="w-full max-w-sm space-y-3">
                    <ScoreBar
                      label="Technical knowledge"
                      value={report.scores.technicalKnowledge}
                    />
                    <ScoreBar label="Problem solving" value={report.scores.problemSolving} />
                    <ScoreBar label="Communication" value={report.scores.communication} />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-3">
                <ReportList title="Strengths" items={report.strengths} />
                <ReportList title="Areas to improve" items={report.areasToImprove} />
                <ReportList title="Suggested next topics" items={report.suggestedTopics} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg">Feedback on your responses</CardTitle>
                  <CardDescription>
                    Each score and note is tied to what you said in the call.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.responseFeedback.map((item, index) => (
                    <article
                      key={`${index}-${item.question}`}
                      className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                            {index + 1}
                          </span>
                          <p className="text-sm font-medium leading-relaxed">{item.question}</p>
                        </div>
                        <Badge variant="secondary" className="font-code">
                          {item.score}/100
                        </Badge>
                      </div>
                      <div className="ml-9 space-y-2 border-l border-border pl-3">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {item.answer}
                        </p>
                        <p className="text-xs leading-relaxed text-foreground/85">
                          {item.feedback}
                        </p>
                      </div>
                    </article>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-display text-lg">
                    <AudioLines className="size-4 text-primary" />
                    Questions asked
                  </CardTitle>
                  <CardDescription>Captured from the interviewer’s live speech.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {report.questionsAsked.map((question, index) => (
                    <div
                      key={`${index}-${question}`}
                      className="flex gap-3 text-sm leading-relaxed"
                    >
                      <span className="font-code text-xs text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <p>{question}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          ) : null}

          {transcript.length > 0 ? (
            <details className="rounded-2xl border border-border/80 bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium">
                Full interview transcript
                <ChevronDown className="size-4 text-muted-foreground" />
              </summary>
              <div className="space-y-4 border-t border-border/70 px-5 py-4">
                {transcript.map((turn, index) => (
                  <div key={`${index}-${turn.speaker}`} className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {turn.speaker === "interviewer" ? "Interviewer" : "You"}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {turn.text}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </main>
      ) : null}
    </>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
