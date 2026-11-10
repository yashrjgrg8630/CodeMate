import { GoogleGenAI, Outcome } from "@google/genai";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

export interface GenerateRequest {
  model: string;
  system: string;
  prompt: string;
  /** JSON Schema for structured output. Mutually exclusive with `codeExecution`. */
  jsonSchema?: unknown;
  /** Enables Gemini's sandboxed Python code-execution tool. */
  codeExecution?: boolean;
  maxOutputTokens: number;
  temperature: number;
  thinkingBudget?: number;
  timeoutMs: number;
}

export interface GenerateResponse {
  text: string;
  /** stdout of each successful code-execution step, in order. */
  codeOutputs: string[];
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
}

/** Thin seam around the Gemini SDK so tests can inject a fake. */
export interface GeminiTransport {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

export function providerErrorStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const status = "status" in err ? err.status : undefined;
  if (typeof status === "number") return status;
  if (!(err instanceof Error)) return undefined;

  if (/too many requests|rate.?limit|quota|resource[_ ]exhausted/i.test(err.message)) return 429;
  if (/service unavailable|internal server error|bad gateway|gateway timeout/i.test(err.message)) return 503;
  if (/unauthorized/i.test(err.message)) return 401;
  if (/forbidden|permission denied/i.test(err.message)) return 403;
  if (/not found/i.test(err.message)) return 404;
  return undefined;
}

export class SdkGeminiTransport implements GeminiTransport {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { retryOptions: { attempts: 3 } },
    });
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    try {
      const response = await this.client.models.generateContent({
        model: req.model,
        contents: req.prompt,
        config: {
          systemInstruction: req.system,
          maxOutputTokens: req.maxOutputTokens,
          temperature: req.temperature,
          abortSignal: AbortSignal.timeout(req.timeoutMs),
          ...(req.jsonSchema
            ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema }
            : {}),
          ...(req.codeExecution ? { tools: [{ codeExecution: {} }] } : {}),
          ...(req.thinkingBudget !== undefined
            ? { thinkingConfig: { thinkingBudget: req.thinkingBudget } }
            : {}),
        },
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const text = parts
        .filter((p) => typeof p.text === "string" && p.thought !== true)
        .map((p) => p.text as string)
        .join("");
      const codeOutputs = parts
        .filter((p) => p.codeExecutionResult?.outcome === Outcome.OUTCOME_OK)
        .map((p) => p.codeExecutionResult?.output ?? "");

      const usage = response.usageMetadata;
      return {
        text,
        codeOutputs,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        finishReason: candidate?.finishReason,
      };
    } catch (err) {
      if (isAbort(err)) throw new AppError(504, "AI_TIMEOUT", "The AI service took too long to respond. Please try again.");
      const status = providerErrorStatus(err);
      const errorMessage = err instanceof Error
        ? err.message
            .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
            .replace(/(key=)[^&\s]+/gi, "$1[redacted]")
            .slice(0, 300)
        : "Unknown provider error";
      logger.warn("ai.provider_error", {
        model: req.model,
        status,
        errorName: err instanceof Error ? err.name : "unknown",
        errorMessage,
      });

      if (status === 429) {
        throw new AppError(
          503,
          "AI_RATE_LIMITED",
          "Gemini's request limit or quota has been reached. Check the quota for your API key in Google AI Studio, or wait before trying again.",
          undefined,
          { "Retry-After": "30" },
        );
      }
      if (status === 503) {
        throw new AppError(
          503,
          "AI_BUSY",
          "Gemini is temporarily unavailable after automatic retries. Wait a moment and try again.",
          undefined,
          { "Retry-After": "10" },
        );
      }
      if (status === 404) {
        throw new AppError(
          502,
          "AI_MODEL_UNAVAILABLE",
          "The configured Gemini model is unavailable to this API key. Choose a model listed in Google AI Studio that supports content generation.",
        );
      }
      if (status === 401 || status === 403) {
        throw new AppError(
          502,
          "AI_CREDENTIALS_INVALID",
          "Gemini rejected this API key. Check that it is valid and has access to the selected model.",
        );
      }
      throw new AppError(502, "AI_UNAVAILABLE", "The AI service is temporarily unavailable.");
    }
  }
}

export function createTransport(env: Env): GeminiTransport {
  return new SdkGeminiTransport(env.GEMINI_API_KEY);
}
