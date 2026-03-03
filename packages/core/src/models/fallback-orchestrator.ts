import type {
  ChatChunk,
  ChatRequest,
  Disposable,
  FailoverReason,
  FallbackEvent,
  FallbackOrchestrator,
  ModelInfo,
  ModelProvider,
  ProviderRegistry,
} from "../types/model-config.js";
import { isRateLimitError } from "./key-rotator.js";

export type FallbackOrchestratorLocale = "zh-CN" | "en";

export type FallbackOrchestratorErrorCode =
  | "EMPTY_FALLBACK_CHAIN"
  | "INVALID_TIMEOUT_RETRY_LIMIT"
  | "INVALID_PROBE_INTERVAL_MS"
  | "NO_PROVIDER_AVAILABLE"
  | "EXECUTION_FAILED"
  | "PARTIAL_RESPONSE_FAILED";

export interface FallbackAttempt {
  providerId: string;
  reason: FailoverReason | "non_fallback";
  error: unknown;
  timeoutRetryCount: number;
}

export interface FallbackOrchestratorOptions {
  fallbackChain: readonly string[];
  providerRegistry?: ProviderRegistry;
  providers?: readonly ModelProvider[] | Record<string, ModelProvider>;
  locale?: FallbackOrchestratorLocale;
  timeoutRetryLimit?: number;
  rateLimitProbeIntervalMs?: number;
  now?: () => Date;
}

interface ClassifiedError {
  reason: FailoverReason;
  shouldFallback: boolean;
}

const DEFAULT_TIMEOUT_RETRY_LIMIT = 1;
const DEFAULT_RATE_LIMIT_PROBE_INTERVAL_MS = 30_000;

export class FallbackOrchestratorError extends Error {
  readonly code: FallbackOrchestratorErrorCode;
  readonly attempts: readonly FallbackAttempt[];
  override readonly cause: unknown;

  constructor(
    code: FallbackOrchestratorErrorCode,
    locale: FallbackOrchestratorLocale,
    attempts: readonly FallbackAttempt[] = [],
    cause?: unknown,
  ) {
    super(messageForErrorCode(code, locale));
    this.name = "FallbackOrchestratorError";
    this.code = code;
    this.attempts = attempts;
    this.cause = cause;
  }
}

export class DefaultFallbackOrchestrator implements FallbackOrchestrator {
  private readonly fallbackChain: readonly string[];
  private readonly providerRegistry: ProviderRegistry | undefined;
  private readonly providersById: Map<string, ModelProvider>;
  private readonly locale: FallbackOrchestratorLocale;
  private readonly timeoutRetryLimit: number;
  private readonly rateLimitProbeIntervalMs: number;
  private readonly now: () => Date;
  private readonly fallbackListeners: Set<(event: FallbackEvent) => void>;
  private readonly rateLimitedUntilByProviderId: Map<string, number>;

  constructor(options: FallbackOrchestratorOptions) {
    this.locale = options.locale ?? "zh-CN";
    this.timeoutRetryLimit = normalizeNonNegativeInteger(
      options.timeoutRetryLimit ?? DEFAULT_TIMEOUT_RETRY_LIMIT,
      "INVALID_TIMEOUT_RETRY_LIMIT",
      this.locale,
    );
    this.rateLimitProbeIntervalMs = normalizePositiveInteger(
      options.rateLimitProbeIntervalMs ?? DEFAULT_RATE_LIMIT_PROBE_INTERVAL_MS,
      "INVALID_PROBE_INTERVAL_MS",
      this.locale,
    );
    this.now = options.now ?? (() => new Date());
    this.providerRegistry = options.providerRegistry;
    this.providersById = buildProviderMap(options.providers);
    this.fallbackListeners = new Set<(event: FallbackEvent) => void>();
    this.rateLimitedUntilByProviderId = new Map<string, number>();

    const normalizedChain = normalizeFallbackChain(options.fallbackChain);
    if (normalizedChain.length === 0) {
      throw new FallbackOrchestratorError(
        "EMPTY_FALLBACK_CHAIN",
        this.locale,
      );
    }
    this.fallbackChain = normalizedChain;
  }

  onFallback(callback: (event: FallbackEvent) => void): Disposable {
    this.fallbackListeners.add(callback);
    return {
      dispose: () => {
        this.fallbackListeners.delete(callback);
      },
    };
  }

  async *execute(request: ChatRequest): AsyncIterable<ChatChunk> {
    const attempts: FallbackAttempt[] = [];
    const executionOrder = this.getExecutionOrder();
    if (executionOrder.length === 0) {
      throw new FallbackOrchestratorError("NO_PROVIDER_AVAILABLE", this.locale);
    }

    for (let index = 0; index < executionOrder.length; index += 1) {
      const providerId = executionOrder[index];
      if (providerId === undefined) {
        continue;
      }
      const provider = this.resolveProvider(providerId);
      if (provider === undefined) {
        attempts.push({
          providerId,
          reason: "unknown",
          error: new Error(`Provider not registered: ${providerId}`),
          timeoutRetryCount: 0,
        });
        continue;
      }

      const providerRequest = this.toProviderRequest(provider, request);
      let timeoutRetryCount = 0;
      let hasYieldedChunks = false;
      const maxAttempts = this.timeoutRetryLimit + 1;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          for await (const chunk of provider.chat(providerRequest)) {
            hasYieldedChunks = true;
            yield chunk;
          }

          this.rateLimitedUntilByProviderId.delete(providerId);
          return;
        } catch (error: unknown) {
          const classification = classifyError(error);

          if (
            classification.reason === "timeout" &&
            timeoutRetryCount < this.timeoutRetryLimit &&
            !hasYieldedChunks
          ) {
            timeoutRetryCount += 1;
            continue;
          }

          if (hasYieldedChunks) {
            attempts.push({
              providerId,
              reason: "non_fallback",
              error,
              timeoutRetryCount,
            });
            throw new FallbackOrchestratorError(
              "PARTIAL_RESPONSE_FAILED",
              this.locale,
              attempts,
              error,
            );
          }

          attempts.push({
            providerId,
            reason: classification.shouldFallback
              ? classification.reason
              : "non_fallback",
            error,
            timeoutRetryCount,
          });

          if (!classification.shouldFallback) {
            throw new FallbackOrchestratorError(
              "EXECUTION_FAILED",
              this.locale,
              attempts,
              error,
            );
          }

          if (classification.reason === "rate_limit") {
            this.markProviderRateLimited(providerId);
          }

          const nextProviderId = executionOrder[index + 1];
          if (typeof nextProviderId === "string") {
            this.emitFallbackEvent({
              from: providerId,
              to: nextProviderId,
              reason: classification.reason,
              timestamp: this.now(),
            });
          }

          break;
        }
      }
    }

    throw new FallbackOrchestratorError(
      "EXECUTION_FAILED",
      this.locale,
      attempts,
    );
  }

  private emitFallbackEvent(event: FallbackEvent): void {
    for (const listener of this.fallbackListeners) {
      try {
        listener(event);
      } catch {
        // Listener failures are isolated to keep the fallback pipeline healthy.
      }
    }
  }

  private markProviderRateLimited(providerId: string): void {
    const nowMs = this.now().getTime();
    this.rateLimitedUntilByProviderId.set(
      providerId,
      nowMs + this.rateLimitProbeIntervalMs,
    );
  }

  private getExecutionOrder(): readonly string[] {
    const nowMs = this.now().getTime();
    const available: string[] = [];
    let earliestRateLimitedProviderId: string | null = null;
    let earliestRateLimitedUntilMs = Number.POSITIVE_INFINITY;

    for (const providerId of this.fallbackChain) {
      const untilMs = this.rateLimitedUntilByProviderId.get(providerId);
      if (typeof untilMs !== "number" || untilMs <= nowMs) {
        if (typeof untilMs === "number") {
          this.rateLimitedUntilByProviderId.delete(providerId);
        }
        available.push(providerId);
        continue;
      }

      if (untilMs < earliestRateLimitedUntilMs) {
        earliestRateLimitedUntilMs = untilMs;
        earliestRateLimitedProviderId = providerId;
      }
    }

    if (available.length > 0) {
      return available;
    }

    if (earliestRateLimitedProviderId !== null) {
      return [earliestRateLimitedProviderId];
    }

    return [];
  }

  private resolveProvider(providerId: string): ModelProvider | undefined {
    const normalizedProviderId = normalizeProviderId(providerId);
    if (normalizedProviderId === null) {
      return undefined;
    }

    const inlineProvider = this.providersById.get(normalizedProviderId);
    if (inlineProvider !== undefined) {
      return inlineProvider;
    }

    return this.providerRegistry?.get(normalizedProviderId);
  }

  private toProviderRequest(
    provider: ModelProvider,
    request: ChatRequest,
  ): ChatRequest {
    return {
      ...request,
      model: resolveModelForProvider(provider, request.model),
    };
  }
}

export function createFallbackOrchestrator(
  options: FallbackOrchestratorOptions,
): FallbackOrchestrator {
  return new DefaultFallbackOrchestrator(options);
}

function classifyError(error: unknown): ClassifiedError {
  if (isAbortError(error)) {
    return {
      reason: "unknown",
      shouldFallback: false,
    };
  }

  if (isContextOverflowError(error)) {
    return {
      reason: "unknown",
      shouldFallback: false,
    };
  }

  if (isRateLimitError(error) || readStatusCode(error) === 429) {
    return {
      reason: "rate_limit",
      shouldFallback: true,
    };
  }

  if (isAuthError(error)) {
    return {
      reason: "auth",
      shouldFallback: true,
    };
  }

  if (isBillingError(error)) {
    return {
      reason: "billing",
      shouldFallback: true,
    };
  }

  if (isTimeoutError(error)) {
    return {
      reason: "timeout",
      shouldFallback: true,
    };
  }

  if (isModelNotFoundError(error)) {
    return {
      reason: "model_not_found",
      shouldFallback: true,
    };
  }

  return {
    reason: "unknown",
    shouldFallback: true,
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    const normalizedName = error.name.toLowerCase();
    const normalizedMessage = error.message.toLowerCase();
    if (
      normalizedName === "aborterror" ||
      normalizedMessage.includes("aborted") ||
      normalizedMessage.includes("abort") ||
      normalizedMessage.includes("cancelled by user") ||
      normalizedMessage.includes("canceled by user")
    ) {
      return true;
    }
  }

  const code = readCode(error);
  if (typeof code === "string") {
    const normalizedCode = code.toLowerCase();
    return normalizedCode === "abort_err" || normalizedCode === "err_canceled";
  }

  return false;
}

function isContextOverflowError(error: unknown): boolean {
  const code = readCode(error)?.toLowerCase();
  if (
    code === "context_length_exceeded" ||
    code === "prompt_too_long" ||
    code === "token_limit_exceeded"
  ) {
    return true;
  }

  const message = readMessage(error)?.toLowerCase();
  if (typeof message !== "string") {
    return false;
  }

  return (
    message.includes("context length") ||
    message.includes("maximum context") ||
    message.includes("prompt is too long") ||
    message.includes("input is too long")
  );
}

function isAuthError(error: unknown): boolean {
  const statusCode = readStatusCode(error);
  if (statusCode === 401) {
    return true;
  }

  const code = readCode(error)?.toLowerCase();
  if (
    code === "invalid_api_key" ||
    code === "authentication_error" ||
    code === "unauthorized"
  ) {
    return true;
  }

  const message = readMessage(error)?.toLowerCase();
  return (
    typeof message === "string" &&
    (message.includes("unauthorized") ||
      message.includes("authentication failed") ||
      message.includes("invalid api key"))
  );
}

function isBillingError(error: unknown): boolean {
  const statusCode = readStatusCode(error);
  if (statusCode === 402) {
    return true;
  }

  const code = readCode(error)?.toLowerCase();
  if (
    code === "billing_error" ||
    code === "payment_required" ||
    code === "insufficient_quota"
  ) {
    return true;
  }

  const message = readMessage(error)?.toLowerCase();
  return (
    typeof message === "string" &&
    (message.includes("payment required") ||
      message.includes("billing") ||
      message.includes("insufficient quota"))
  );
}

function isTimeoutError(error: unknown): boolean {
  const statusCode = readStatusCode(error);
  if (statusCode === 408 || statusCode === 504) {
    return true;
  }

  const code = readCode(error)?.toLowerCase();
  if (
    code === "etimedout" ||
    code === "timeout" ||
    code === "etime" ||
    code === "econnaborted"
  ) {
    return true;
  }

  const message = readMessage(error)?.toLowerCase();
  return (
    typeof message === "string" &&
    (message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("request time-out"))
  );
}

function isModelNotFoundError(error: unknown): boolean {
  const statusCode = readStatusCode(error);
  const code = readCode(error)?.toLowerCase();
  const message = readMessage(error)?.toLowerCase();

  if (code === "model_not_found" || code === "not_found") {
    return true;
  }

  if (
    statusCode === 404 &&
    typeof message === "string" &&
    (message.includes("model not found") || message.includes("unknown model"))
  ) {
    return true;
  }

  return false;
}

function readStatusCode(error: unknown): number | null {
  if (typeof error === "number" && Number.isFinite(error)) {
    return Math.trunc(error);
  }

  if (!isRecord(error)) {
    return null;
  }

  const directStatus = readNumberField(error, "status");
  if (directStatus !== null) {
    return directStatus;
  }

  const statusCode = readNumberField(error, "statusCode");
  if (statusCode !== null) {
    return statusCode;
  }

  const response = error.response;
  if (!isRecord(response)) {
    return null;
  }

  const responseStatus = readNumberField(response, "status");
  if (responseStatus !== null) {
    return responseStatus;
  }

  return readNumberField(response, "statusCode");
}

function readCode(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }
  return readStringField(error, "code");
}

function readMessage(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (!isRecord(error)) {
    return null;
  }

  return readStringField(error, "message");
}

function readStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumberField(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildProviderMap(
  providers: FallbackOrchestratorOptions["providers"],
): Map<string, ModelProvider> {
  const providerMap = new Map<string, ModelProvider>();
  if (providers === undefined) {
    return providerMap;
  }

  if (Array.isArray(providers)) {
    for (const provider of providers as readonly ModelProvider[]) {
      const providerId = normalizeProviderId(provider.id);
      if (providerId !== null) {
        providerMap.set(providerId, provider);
      }
    }
    return providerMap;
  }

  const record = providers as Record<string, ModelProvider>;
  for (const provider of Object.values(record)) {
    const providerId = normalizeProviderId(provider.id);
    if (providerId !== null) {
      providerMap.set(providerId, provider);
    }
  }

  return providerMap;
}

function normalizeFallbackChain(chain: readonly string[]): readonly string[] {
  const normalizedIds: string[] = [];
  const seen = new Set<string>();

  for (const providerId of chain) {
    const normalizedId = normalizeProviderId(providerId);
    if (normalizedId === null || seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);
    normalizedIds.push(normalizedId);
  }

  return normalizedIds;
}

function normalizeProviderId(providerId: string): string | null {
  const normalized = providerId.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveModelForProvider(provider: ModelProvider, rawModelRef: string): string {
  const providerModels = provider.listModels().map((model: ModelInfo): string => model.id);
  const modelSelection = parseModelReference(rawModelRef);

  if (
    modelSelection.providerId !== null &&
    modelSelection.providerId === normalizeProviderId(provider.id) &&
    modelSelection.modelId !== null
  ) {
    return modelSelection.modelId;
  }

  if (
    modelSelection.modelId !== null &&
    providerModels.includes(modelSelection.modelId)
  ) {
    return modelSelection.modelId;
  }

  if (providerModels.length > 0) {
    const firstModel = providerModels[0];
    if (firstModel !== undefined) {
      return firstModel;
    }
  }

  if (modelSelection.modelId !== null) {
    return modelSelection.modelId;
  }

  return rawModelRef;
}

function parseModelReference(modelRef: string): {
  providerId: string | null;
  modelId: string | null;
} {
  const trimmed = modelRef.trim();
  if (trimmed.length === 0) {
    return {
      providerId: null,
      modelId: null,
    };
  }

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex === -1) {
    return {
      providerId: null,
      modelId: trimmed,
    };
  }

  const rawProviderId = trimmed.slice(0, slashIndex);
  const rawModelId = trimmed.slice(slashIndex + 1);
  return {
    providerId: normalizeProviderId(rawProviderId),
    modelId: rawModelId.trim().length > 0 ? rawModelId.trim() : null,
  };
}

function normalizeNonNegativeInteger(
  value: number,
  errorCode: FallbackOrchestratorErrorCode,
  locale: FallbackOrchestratorLocale,
): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new FallbackOrchestratorError(errorCode, locale);
  }

  return Math.floor(value);
}

function normalizePositiveInteger(
  value: number,
  errorCode: FallbackOrchestratorErrorCode,
  locale: FallbackOrchestratorLocale,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new FallbackOrchestratorError(errorCode, locale);
  }

  return Math.floor(value);
}

function messageForErrorCode(
  code: FallbackOrchestratorErrorCode,
  locale: FallbackOrchestratorLocale,
): string {
  switch (code) {
    case "EMPTY_FALLBACK_CHAIN":
      return text(
        locale,
        "Fallback chain must include at least one provider id.",
        "Fallback chain 必须至少包含一个 provider id。",
      );
    case "INVALID_TIMEOUT_RETRY_LIMIT":
      return text(
        locale,
        "Timeout retry limit must be a non-negative number.",
        "超时重试次数必须是大于等于 0 的数字。",
      );
    case "INVALID_PROBE_INTERVAL_MS":
      return text(
        locale,
        "Probe interval must be a positive number in milliseconds.",
        "探测间隔必须是正数毫秒值。",
      );
    case "NO_PROVIDER_AVAILABLE":
      return text(
        locale,
        "No provider is available for execution.",
        "当前没有可用 Provider 可执行请求。",
      );
    case "EXECUTION_FAILED":
      return text(
        locale,
        "All providers in fallback chain failed.",
        "Fallback chain 中所有 Provider 均执行失败。",
      );
    case "PARTIAL_RESPONSE_FAILED":
      return text(
        locale,
        "Provider failed after streaming partial response, fallback is skipped.",
        "Provider 在返回部分流式结果后失败，已跳过 fallback。",
      );
    default:
      return text(
        locale,
        "Unknown fallback orchestrator error.",
        "未知 FallbackOrchestrator 错误。",
      );
  }
}

function text(
  locale: FallbackOrchestratorLocale,
  english: string,
  chinese: string,
): string {
  return locale === "zh-CN" ? chinese : english;
}
