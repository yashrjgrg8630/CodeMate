import type { LiveConnectConfig, LiveServerMessage } from "@google/genai";
import type {
  LiveInterviewDifficulty,
  LiveInterviewDomain,
  LiveInterviewDuration,
  LiveInterviewReport,
} from "@/types/domain";
import { apiRequest } from "./client";

export interface LiveTranscriptTurn {
  speaker: "interviewer" | "candidate";
  text: string;
}

export interface LiveInterviewCredentials {
  sessionId: string;
  token: string;
  model: string;
  config: LiveConnectConfig;
  startedAt: string;
}

interface LiveInterviewSettings {
  domain: LiveInterviewDomain;
  difficulty: LiveInterviewDifficulty;
  durationMinutes: LiveInterviewDuration;
}

interface LiveInterviewCallbacks {
  onConnectionState: (state: "connecting" | "connected" | "disconnected") => void;
  onTranscript: (transcript: LiveTranscriptTurn[]) => void;
  onSpeaker: (speaker: "interviewer" | "candidate" | "listening") => void;
  onAudioLevel: (level: number) => void;
  onError: (message: string) => void;
}

export async function createLiveInterview(
  settings: LiveInterviewSettings,
): Promise<LiveInterviewCredentials> {
  return apiRequest<LiveInterviewCredentials>("/api/interview/live/start", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

export async function completeLiveInterview(input: {
  sessionId: string;
  durationSeconds: number;
  transcript: LiveTranscriptTurn[];
}): Promise<LiveInterviewReport> {
  return apiRequest<LiveInterviewReport>("/api/interview/live/complete", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function abandonLiveInterview(sessionId: string): Promise<void> {
  await apiRequest<void>("/api/interview/live/abandon", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

function resampleTo16Khz(input: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / 16_000;
  const output = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sample = 0;
    for (let j = start; j < end; j += 1) sample += input[j] ?? 0;
    const average = sample / Math.max(1, end - start);
    output[i] = Math.max(-1, Math.min(1, average)) * 0x7fff;
  }
  return output;
}

function toBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 1) {
    binary += String.fromCharCode(bytes[offset] ?? 0);
  }
  return btoa(binary);
}

export class LiveInterviewCall {
  private session?: Awaited<ReturnType<import("@google/genai").GoogleGenAI["live"]["connect"]>>;
  private inputContext?: AudioContext;
  private outputContext?: AudioContext;
  private processor?: ScriptProcessorNode;
  private stream?: MediaStream;
  private playbackCursor = 0;
  private readonly playingNodes = new Set<AudioBufferSourceNode>();
  private readonly transcript: LiveTranscriptTurn[] = [];
  private muted = false;
  private closed = false;
  private callbacks: LiveInterviewCallbacks;
  private speakerTimer?: ReturnType<typeof setTimeout>;
  private setupResolve?: () => void;
  private setupReject?: (error: Error) => void;

  constructor(callbacks: LiveInterviewCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(credentials: LiveInterviewCredentials, stream: MediaStream): Promise<void> {
    this.stream = stream;
    this.callbacks.onConnectionState("connecting");

    let resolveSetup: () => void = () => undefined;
    let rejectSetup: (error: Error) => void = () => undefined;
    const setup = new Promise<void>((resolve, reject) => {
      resolveSetup = resolve;
      rejectSetup = reject;
    });
    void setup.catch(() => undefined);
    this.setupResolve = resolveSetup;
    this.setupReject = rejectSetup;

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const client = new GoogleGenAI({
        apiKey: credentials.token,
        httpOptions: { apiVersion: "v1alpha" },
      });
      this.session = await client.live.connect({
        model: credentials.model,
        config: credentials.config,
        callbacks: {
          onopen: () => undefined,
          onmessage: (message) => this.handleMessage(message),
          onerror: () => {
            const error = new Error("The live interview connection failed.");
            this.setupReject?.(error);
            this.callbacks.onError(error.message);
          },
          onclose: () => {
            if (!this.closed) this.callbacks.onConnectionState("disconnected");
            if (!this.closed) {
              this.setupReject?.(new Error("Gemini Live closed the interview connection."));
            }
          },
        },
      });

      await Promise.race([
        setup,
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("Gemini Live did not finish setting up in time.")),
            20_000,
          );
        }),
      ]);
      if (this.closed) throw new Error("The interview was ended before the call connected.");

      this.startAudioCapture();
      this.callbacks.onConnectionState("connected");
      this.session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              {
                text: "Begin the interview now. Introduce yourself briefly and ask your first question.",
              },
            ],
          },
        ],
        turnComplete: true,
      });
    } catch (error) {
      await this.close();
      throw error instanceof Error ? error : new Error("Could not connect to the live interview.");
    }
  }

  getTranscript(): LiveTranscriptTurn[] {
    return this.transcript.map((turn) => ({ ...turn }));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    if (muted) this.session?.sendRealtimeInput({ audioStreamEnd: true });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.speakerTimer) clearTimeout(this.speakerTimer);
    this.stopPlayback();
    this.session?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.processor?.disconnect();
    this.inputContext?.close();
    this.outputContext?.close();
    this.callbacks.onSpeaker("listening");
    this.callbacks.onAudioLevel(0);
    this.callbacks.onConnectionState("disconnected");
  }

  private startAudioCapture(): void {
    if (!this.stream || !this.session) throw new Error("Microphone stream is unavailable.");
    this.inputContext = new AudioContext({ sampleRate: 16_000 });
    this.outputContext = new AudioContext();
    void this.inputContext.resume();
    void this.outputContext.resume();

    const source = this.inputContext.createMediaStreamSource(this.stream);
    const analyser = this.inputContext.createAnalyser();
    analyser.fftSize = 512;
    this.processor = this.inputContext.createScriptProcessor(2_048, 1, 1);
    const mutedOutput = this.inputContext.createGain();
    mutedOutput.gain.value = 0;

    source.connect(analyser);
    analyser.connect(this.processor);
    this.processor.connect(mutedOutput);
    mutedOutput.connect(this.inputContext.destination);

    const levelSamples = new Float32Array(analyser.fftSize);
    this.processor.onaudioprocess = (event) => {
      if (this.closed) return;
      analyser.getFloatTimeDomainData(levelSamples);
      let sum = 0;
      for (const sample of levelSamples) sum += sample * sample;
      const level = Math.min(1, Math.sqrt(sum / levelSamples.length) * 8);
      this.callbacks.onAudioLevel(level);
      if (level > 0.035 && !this.muted) this.callbacks.onSpeaker("candidate");

      if (this.muted || !this.session) return;
      const pcm = resampleTo16Khz(
        event.inputBuffer.getChannelData(0),
        this.inputContext?.sampleRate ?? 16_000,
      );
      if (pcm.length === 0) return;
      this.session.sendRealtimeInput({
        audio: { data: toBase64(pcm), mimeType: "audio/pcm;rate=16000" },
      });
    };
  }

  private handleMessage(message: LiveServerMessage): void {
    if (message.setupComplete) {
      this.setupResolve?.();
      return;
    }

    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) {
      this.stopPlayback();
      this.callbacks.onSpeaker("candidate");
    }
    if (content.inputTranscription?.text) {
      this.appendTranscript("candidate", content.inputTranscription.text);
    }
    if (content.outputTranscription?.text) {
      this.appendTranscript("interviewer", content.outputTranscription.text);
    }

    for (const part of content.modelTurn?.parts ?? []) {
      const inlineData = part.inlineData;
      if (inlineData?.data && inlineData.mimeType?.startsWith("audio/pcm")) {
        this.playAudio(inlineData.data, inlineData.mimeType);
      }
    }

    if (content.turnComplete) {
      if (this.speakerTimer) clearTimeout(this.speakerTimer);
      const remaining = Math.max(
        0,
        (this.playbackCursor - (this.outputContext?.currentTime ?? 0)) * 1000,
      );
      this.speakerTimer = setTimeout(() => {
        if (!this.closed) this.callbacks.onSpeaker("listening");
      }, remaining + 80);
    }
  }

  private appendTranscript(speaker: LiveTranscriptTurn["speaker"], rawText: string): void {
    const text = rawText.trim();
    if (!text) return;
    const last = this.transcript[this.transcript.length - 1];
    if (last?.speaker === speaker) {
      if (text.startsWith(last.text)) last.text = text;
      else if (!last.text.endsWith(text)) last.text = `${last.text} ${text}`;
    } else {
      this.transcript.push({ speaker, text });
    }
    this.callbacks.onTranscript(this.getTranscript());
  }

  private playAudio(base64: string, mimeType: string): void {
    const context = this.outputContext;
    if (!context || this.closed) return;
    const binary = atob(base64);
    const sampleCount = Math.floor(binary.length / 2);
    if (sampleCount === 0) return;

    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
      const value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      samples[i] = (value >= 0x8000 ? value - 0x1_0000 : value) / 0x8000;
    }

    const sampleRate = Number(/rate=(\d+)/i.exec(mimeType)?.[1] ?? 24_000);
    const buffer = context.createBuffer(1, sampleCount, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => this.playingNodes.delete(source);
    this.playingNodes.add(source);

    const startAt = Math.max(context.currentTime, this.playbackCursor);
    source.start(startAt);
    this.playbackCursor = startAt + buffer.duration;
    this.callbacks.onSpeaker("interviewer");
  }

  private stopPlayback(): void {
    for (const node of this.playingNodes) {
      try {
        node.stop();
      } catch {
        // A node may have completed between the interruption signal and stop().
      }
    }
    this.playingNodes.clear();
    this.playbackCursor = this.outputContext?.currentTime ?? 0;
  }
}
