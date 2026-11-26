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
  signal?: AbortSignal;
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
  readonly supportsCodeExecution: boolean;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

function isStructuredOutputRejection(err: unknown): boolean {
  return (
    providerErrorStatus(err) === 400 ||
    (err instanceof Error && /bad request/i.test(err.message))
  );
}

function signalForRequest(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function providerErrorStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const status = "status" in err ? err.status : undefined;
  if (typeof status === "number") return status;
  if (!(err instanceof Error)) return undefined;

  if (
    /too many requests|rate.?limit|quota|resource[_ ]exhausted/i.test(
      err.message,
    )
  )
    return 429;
  if (
    /service unavailable|internal server error|bad gateway|gateway timeout/i.test(
      err.message,
    )
  )
    return 503;
  if (/bad request/i.test(err.message)) return 400;
  if (/unauthorized/i.test(err.message)) return 401;
  if (/forbidden|permission denied/i.test(err.message)) return 403;
  if (/not found/i.test(err.message)) return 404;
  return undefined;
}

export class SdkGeminiTransport implements GeminiTransport {
  readonly supportsCodeExecution = true;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { retryOptions: { attempts: 3 } },
    });
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    try {
      const generateContent = (includeSchema: boolean) =>
        this.client.models.generateContent({
          model: req.model,
          contents: req.prompt,
          config: {
            systemInstruction:
              req.jsonSchema && !includeSchema
                ? `${req.system}\n\nReturn JSON matching this schema:\n${JSON.stringify(req.jsonSchema)}`
                : req.system,
            maxOutputTokens: req.maxOutputTokens,
            temperature: req.temperature,
            abortSignal: signalForRequest(req.signal, req.timeoutMs),
            ...(req.jsonSchema
              ? {
                  responseMimeType: "application/json",
                  ...(includeSchema
                    ? { responseJsonSchema: req.jsonSchema }
                    : {}),
                }
              : {}),
            ...(req.codeExecution ? { tools: [{ codeExecution: {} }] } : {}),
            ...(req.thinkingBudget !== undefined
              ? { thinkingConfig: { thinkingBudget: req.thinkingBudget } }
              : {}),
          },
        });

      let response;
      try {
        response = await generateContent(true);
      } catch (error) {
        if (!req.jsonSchema || !isStructuredOutputRejection(error)) throw error;
        logger.warn("ai.gemini_schema_rejected_retrying_json_mode", {
          model: req.model,
        });
        response = await generateContent(false);
      }

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
        outputTokens:
          (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        finishReason: candidate?.finishReason,
      };
    } catch (err) {
      if (req.signal?.aborted) {
        throw new AppError(409, "AI_CANCELLED", "The benchmark was cancelled.");
      }
      if (isAbort(err))
        throw new AppError(
          504,
          "AI_TIMEOUT",
          "The AI service took too long to respond. Please try again.",
        );
      const status = providerErrorStatus(err);
      const errorMessage =
        err instanceof Error
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
      throw new AppError(
        502,
        "AI_UNAVAILABLE",
        "The AI service is temporarily unavailable.",
      );
    }
  }
}

export class OpenAICompatibleTransport implements GeminiTransport {
  readonly supportsCodeExecution = false;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    try {
      const schemaInstruction = req.jsonSchema
        ? `\n\nReturn ONLY a valid JSON object strictly matching this JSON Schema (no markdown fences, no commentary):\n${JSON.stringify(req.jsonSchema)}`
        : req.codeExecution
          ? `\n\nEvaluate the test cases carefully and output the final JSON object as the LAST line of your response.`
          : "";

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: [
            { role: "system", content: `${req.system}${schemaInstruction}` },
            { role: "user", content: req.prompt },
          ],
          temperature: req.temperature,
          max_tokens: req.maxOutputTokens,
          top_p: 0.9,
          stream: false,
          reasoning_effort: "high",
        }),
        signal: signalForRequest(req.signal, req.timeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const err = new Error(
          `HTTP ${response.status}: ${errText.slice(0, 200)}`,
        ) as Error & {
          status?: number;
        };
        err.status = response.status;
        throw err;
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string | null };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const choice = payload.choices?.[0];
      const text = choice?.message?.content ?? "";
      return {
        text,
        codeOutputs: req.codeExecution ? [text] : [],
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
        finishReason: choice?.finish_reason,
      };
    } catch (err) {
      if (req.signal?.aborted) {
        throw new AppError(409, "AI_CANCELLED", "The benchmark was cancelled.");
      }
      if (isAbort(err)) {
        throw new AppError(
          504,
          "AI_TIMEOUT",
          "The AI service took too long to respond. Please try again.",
        );
      }
      const status = providerErrorStatus(err);
      const errorMessage =
        err instanceof Error
          ? err.message.slice(0, 300)
          : "Unknown provider error";
      logger.warn("ai.provider_error", {
        model: req.model,
        status,
        errorName: err instanceof Error ? err.name : "unknown",
        errorMessage,
      });

      if (status === 429) {
        const isBillingLimit =
          /plan credits|payment method|spend limit|quota|billing/i.test(
            errorMessage,
          );
        throw new AppError(
          503,
          "AI_RATE_LIMITED",
          isBillingLimit
            ? `Modal endpoint billing/spend limit reached: ${errorMessage.replace(/^HTTP 429:\s*/i, "")}`
            : "The AI endpoint rate limit has been reached. Please wait a moment and try again.",
          undefined,
          { "Retry-After": "15" },
        );
      }
      if (status === 503 || /no upstreams/i.test(errorMessage)) {
        throw new AppError(
          503,
          "AI_BUSY",
          "The AI model endpoint is temporarily busy or starting up. Please try again.",
          undefined,
          { "Retry-After": "10" },
        );
      }
      if (status === 401 || status === 403) {
        throw new AppError(
          502,
          "AI_CREDENTIALS_INVALID",
          "The AI endpoint rejected the configured credentials.",
        );
      }
      throw new AppError(
        502,
        "AI_UNAVAILABLE",
        "The AI service is temporarily unavailable.",
      );
    }
  }
}

export class FallbackTransport implements GeminiTransport {
  readonly supportsCodeExecution: boolean;

  constructor(
    private readonly primary: GeminiTransport,
    private readonly fallback: GeminiTransport,
    private readonly fallbackModel: string,
  ) {
    this.supportsCodeExecution =
      primary.supportsCodeExecution || fallback.supportsCodeExecution;
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    if (req.codeExecution && !this.primary.supportsCodeExecution) {
      return this.fallback.generate({ ...req, model: this.fallbackModel });
    }

    try {
      return await this.primary.generate(req);
    } catch (err) {
      const isRecoverable =
        err instanceof AppError &&
        (err.code === "AI_RATE_LIMITED" ||
          err.code === "AI_BUSY" ||
          err.code === "AI_TIMEOUT" ||
          err.code === "AI_UNAVAILABLE" ||
          err.code === "AI_CREDENTIALS_INVALID") &&
        (!req.codeExecution || this.fallback.supportsCodeExecution);

      if (isRecoverable) {
        logger.warn("ai.primary_failed_switching_to_fallback", {
          originalModel: req.model,
          fallbackModel: this.fallbackModel,
          originalError: err.message,
        });
        const fallbackReq: GenerateRequest = {
          ...req,
          model: this.fallbackModel,
        };
        return await this.fallback.generate(fallbackReq);
      }
      throw err;
    }
  }
}

export function createTransport(env: Env): GeminiTransport {
  if (env.AI_PROVIDER === "openai-compatible") {
    const baseUrl = env.OPENAI_BASE_URL;
    const apiKey =
      env.OPENAI_API_KEY ??
      (env.MODAL_PROXY_TOKEN_ID && env.MODAL_PROXY_TOKEN_SECRET
        ? `${env.MODAL_PROXY_TOKEN_ID}.${env.MODAL_PROXY_TOKEN_SECRET}`
        : undefined);
    if (!baseUrl || !apiKey) {
      throw new Error(
        "OPENAI_BASE_URL and either OPENAI_API_KEY or MODAL_PROXY_TOKEN_ID + MODAL_PROXY_TOKEN_SECRET are required when AI_PROVIDER=openai-compatible",
      );
    }
    const primary = new OpenAICompatibleTransport(baseUrl, apiKey);
    if (env.GEMINI_API_KEY) {
      const fallback = new SdkGeminiTransport(env.GEMINI_API_KEY);
      return new FallbackTransport(
        primary,
        fallback,
        env.GEMINI_EXEC_MODEL ?? env.GEMINI_MODEL,
      );
    }
    return primary;
  }
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
  }
  return new SdkGeminiTransport(env.GEMINI_API_KEY);
}
