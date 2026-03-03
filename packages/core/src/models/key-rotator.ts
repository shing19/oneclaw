export type KeyRotatorLocale = "zh-CN" | "en";

export type KeyRotatorErrorCode =
  | "NO_API_KEYS"
  | "INVALID_KEY"
  | "INVALID_COOLDOWN_MS";

export interface KeyRotatorOptions {
  providerId: string;
  apiKeys: readonly string[];
  cooldownMs?: number;
  locale?: KeyRotatorLocale;
  now?: () => number;
}

export type KeyRotationReason =
  | "rate_limit"
  | "all_keys_rate_limited"
  | "not_rate_limit";

export interface KeyRotationResult {
  rotated: boolean;
  reason: KeyRotationReason;
  previousKey: string;
  currentKey: string;
  retryAfterMs: number | null;
}

export interface RateLimitedKeyState {
  key: string;
  rateLimitedUntilMs: number;
  remainingCooldownMs: number;
}

export interface KeyRotatorState {
  providerId: string;
  cooldownMs: number;
  keys: readonly string[];
  currentKey: string;
  rateLimitedKeys: readonly RateLimitedKeyState[];
}

export class KeyRotatorError extends Error {
  readonly code: KeyRotatorErrorCode;

  constructor(code: KeyRotatorErrorCode, locale: KeyRotatorLocale) {
    super(messageForErrorCode(code, locale));
    this.name = "KeyRotatorError";
    this.code = code;
  }
}

const DEFAULT_COOLDOWN_MS = 60_000;

export class KeyRotator {
  private readonly providerId: string;
  private readonly locale: KeyRotatorLocale;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly keys: readonly string[];
  private readonly rateLimitedUntilByKey: Map<string, number>;
  private currentIndex: number;

  constructor(options: KeyRotatorOptions) {
    this.locale = options.locale ?? "zh-CN";
    this.providerId = options.providerId.trim();
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = options.now ?? Date.now;

    if (!Number.isFinite(this.cooldownMs) || this.cooldownMs <= 0) {
      throw new KeyRotatorError("INVALID_COOLDOWN_MS", this.locale);
    }

    this.keys = normalizeApiKeys(options.apiKeys);
    if (this.keys.length === 0) {
      throw new KeyRotatorError("NO_API_KEYS", this.locale);
    }

    this.rateLimitedUntilByKey = new Map<string, number>();
    this.currentIndex = 0;
  }

  getProviderId(): string {
    return this.providerId;
  }

  getCooldownMs(): number {
    return this.cooldownMs;
  }

  getCurrentKey(): string {
    const key = this.keys[this.currentIndex];
    if (key === undefined) {
      throw new Error(`Key index out of bounds: ${this.currentIndex}`);
    }
    return key;
  }

  listKeys(): readonly string[] {
    return [...this.keys];
  }

  getState(atMs: number = this.now()): KeyRotatorState {
    const rateLimitedKeys = this.keys
      .map((key: string): RateLimitedKeyState | null => {
        const until = this.rateLimitedUntilByKey.get(key);
        if (typeof until !== "number" || until <= atMs) {
          if (typeof until === "number") {
            this.rateLimitedUntilByKey.delete(key);
          }
          return null;
        }

        return {
          key,
          rateLimitedUntilMs: until,
          remainingCooldownMs: until - atMs,
        };
      })
      .filter((item: RateLimitedKeyState | null): item is RateLimitedKeyState => item !== null);

    return {
      providerId: this.providerId,
      cooldownMs: this.cooldownMs,
      keys: [...this.keys],
      currentKey: this.getCurrentKey(),
      rateLimitedKeys,
    };
  }

  markCurrentKeyRateLimited(atMs: number = this.now()): void {
    const key = this.getCurrentKey();
    this.rateLimitedUntilByKey.set(key, atMs + this.cooldownMs);
  }

  clearRateLimit(key: string): void {
    const normalizedKey = normalizeApiKey(key);
    if (normalizedKey === null || !this.rateLimitedUntilByKey.has(normalizedKey)) {
      return;
    }
    this.rateLimitedUntilByKey.delete(normalizedKey);
  }

  rotate(): string {
    const nowMs = this.now();
    const nextIndex = this.findNextAvailableIndex(this.currentIndex, nowMs);
    if (nextIndex === null) {
      return this.getCurrentKey();
    }

    this.currentIndex = nextIndex;
    return this.getCurrentKey();
  }

  handleError(error: unknown): KeyRotationResult {
    const previousKey = this.getCurrentKey();

    if (!isRateLimitError(error)) {
      return {
        rotated: false,
        reason: "not_rate_limit",
        previousKey,
        currentKey: previousKey,
        retryAfterMs: null,
      };
    }

    this.markCurrentKeyRateLimited();
    const nowMs = this.now();
    const nextIndex = this.findNextAvailableIndex(this.currentIndex, nowMs);

    if (nextIndex === null) {
      return {
        rotated: false,
        reason: "all_keys_rate_limited",
        previousKey,
        currentKey: previousKey,
        retryAfterMs: this.computeRetryAfterMs(nowMs),
      };
    }

    this.currentIndex = nextIndex;
    return {
      rotated: true,
      reason: "rate_limit",
      previousKey,
      currentKey: this.getCurrentKey(),
      retryAfterMs: null,
    };
  }

  private findNextAvailableIndex(
    startIndex: number,
    atMs: number,
  ): number | null {
    const keyCount = this.keys.length;

    for (let offset = 1; offset <= keyCount; offset += 1) {
      const candidateIndex = (startIndex + offset) % keyCount;
      const key = this.keys[candidateIndex];
      if (key !== undefined && !this.isRateLimitedAt(key, atMs)) {
        return candidateIndex;
      }
    }

    return null;
  }

  private isRateLimitedAt(key: string, atMs: number): boolean {
    const rateLimitedUntilMs = this.rateLimitedUntilByKey.get(key);
    if (typeof rateLimitedUntilMs !== "number") {
      return false;
    }

    if (rateLimitedUntilMs <= atMs) {
      this.rateLimitedUntilByKey.delete(key);
      return false;
    }

    return true;
  }

  private computeRetryAfterMs(atMs: number): number | null {
    const remainingCooldowns = [...this.rateLimitedUntilByKey.values()]
      .map((untilMs: number): number => untilMs - atMs)
      .filter((remainingMs: number): boolean => remainingMs > 0);

    if (remainingCooldowns.length === 0) {
      return null;
    }

    return Math.min(...remainingCooldowns);
  }
}

export function createKeyRotator(options: KeyRotatorOptions): KeyRotator {
  return new KeyRotator(options);
}

export function isRateLimitError(error: unknown): boolean {
  if (typeof error === "number") {
    return error === 429;
  }

  if (typeof error === "string") {
    return looksLikeRateLimitMessage(error);
  }

  if (error instanceof Error) {
    return (
      hasStatusCode429(error) ||
      looksLikeRateLimitMessage(error.message)
    );
  }

  if (!isRecord(error)) {
    return false;
  }

  if (hasStatusCode429(error)) {
    return true;
  }

  const code = readStringValue(error, "code");
  if (typeof code === "string" && looksLikeRateLimitCode(code)) {
    return true;
  }

  const message = readStringValue(error, "message");
  if (typeof message === "string" && looksLikeRateLimitMessage(message)) {
    return true;
  }

  return false;
}

function normalizeApiKeys(apiKeys: readonly string[]): readonly string[] {
  const deduped = new Set<string>();
  for (const key of apiKeys) {
    const normalized = normalizeApiKey(key);
    if (normalized === null) {
      continue;
    }
    deduped.add(normalized);
  }
  return [...deduped];
}

function normalizeApiKey(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

function hasStatusCode429(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const status = readNumberValue(value, "status");
  if (status === 429) {
    return true;
  }

  const statusCode = readNumberValue(value, "statusCode");
  if (statusCode === 429) {
    return true;
  }

  const response = value["response"];
  if (!isRecord(response)) {
    return false;
  }

  const responseStatus = readNumberValue(response, "status");
  return responseStatus === 429;
}

function readNumberValue(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function readStringValue(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function looksLikeRateLimitCode(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  return (
    normalized === "429" ||
    normalized === "rate_limit" ||
    normalized === "rate_limited" ||
    normalized === "too_many_requests" ||
    normalized === "too-many-requests"
  );
}

function looksLikeRateLimitMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageForErrorCode(
  code: KeyRotatorErrorCode,
  locale: KeyRotatorLocale,
): string {
  switch (code) {
    case "NO_API_KEYS":
      return text(
        locale,
        "At least one API key is required.",
        "至少需要一个 API Key。",
      );
    case "INVALID_KEY":
      return text(
        locale,
        "Invalid API key.",
        "API Key 无效。",
      );
    case "INVALID_COOLDOWN_MS":
      return text(
        locale,
        "cooldownMs must be a positive number.",
        "cooldownMs 必须是正数。",
      );
    default:
      return text(
        locale,
        "Unknown key rotator error.",
        "未知 Key 轮换错误。",
      );
  }
}

function text(
  locale: KeyRotatorLocale,
  english: string,
  chinese: string,
): string {
  return locale === "zh-CN" ? chinese : english;
}
