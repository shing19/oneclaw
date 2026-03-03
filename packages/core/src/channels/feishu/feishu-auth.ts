export type FeishuAuthLocale = "zh-CN" | "en";

export type FeishuAuthErrorCode =
  | "INVALID_APP_ID"
  | "INVALID_APP_SECRET"
  | "INVALID_APP_SECRET_REF"
  | "SECRET_RESOLVER_REQUIRED"
  | "SECRET_NOT_FOUND"
  | "INVALID_AUTH_ENDPOINT"
  | "INVALID_REFRESH_BUFFER_MS"
  | "INVALID_REQUEST_TIMEOUT_MS"
  | "AUTH_REQUEST_FAILED"
  | "AUTH_RESPONSE_INVALID"
  | "AUTH_REJECTED";

export interface FeishuAuthToken {
  appId: string;
  tokenType: "tenant_access_token";
  accessToken: string;
  expiresInSeconds: number;
  fetchedAt: Date;
  expiresAt: Date;
}

export type FeishuAuthSecretResolver = (
  secretRef: string,
) => string | null | Promise<string | null>;

export interface FeishuAuthManagerOptions {
  appId: string;
  appSecret?: string;
  appSecretRef?: string;
  resolveSecret?: FeishuAuthSecretResolver;
  locale?: FeishuAuthLocale;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  authEndpoint?: string;
  refreshBufferMs?: number;
  requestTimeoutMs?: number;
}

interface FeishuAuthResponse {
  code: number;
  message?: string;
  accessToken?: string;
  expiresInSeconds?: number;
}

const DEFAULT_LOCALE: FeishuAuthLocale = "zh-CN";
const DEFAULT_AUTH_ENDPOINT =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const DEFAULT_REFRESH_BUFFER_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class FeishuAuthError extends Error {
  readonly code: FeishuAuthErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: FeishuAuthErrorCode,
    locale: FeishuAuthLocale,
    options?: {
      cause?: unknown;
      details?: Record<string, unknown>;
      englishMessage?: string;
      chineseMessage?: string;
    },
  ) {
    const englishMessage =
      options?.englishMessage ?? defaultErrorMessage(code, "en");
    const chineseMessage =
      options?.chineseMessage ?? defaultErrorMessage(code, "zh-CN");
    super(text(locale, englishMessage, chineseMessage));
    this.name = "FeishuAuthError";
    this.code = code;
    this.details = options?.details;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class FeishuAuthManager {
  private readonly appId: string;
  private readonly appSecretRef?: string;
  private appSecret?: string;
  private readonly resolveSecret?: FeishuAuthSecretResolver;
  private readonly locale: FeishuAuthLocale;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly authEndpoint: string;
  private readonly refreshBufferMs: number;
  private readonly requestTimeoutMs: number;

  private cachedToken: FeishuAuthToken | null;
  private inFlightRefresh: Promise<FeishuAuthToken> | null;

  constructor(options: FeishuAuthManagerOptions) {
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.appId = normalizeRequiredString(
      options.appId,
      "INVALID_APP_ID",
      this.locale,
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.authEndpoint = normalizeAuthEndpoint(
      options.authEndpoint ?? DEFAULT_AUTH_ENDPOINT,
      this.locale,
    );
    this.refreshBufferMs = normalizePositiveInteger(
      options.refreshBufferMs ?? DEFAULT_REFRESH_BUFFER_MS,
      "INVALID_REFRESH_BUFFER_MS",
      this.locale,
    );
    this.requestTimeoutMs = normalizePositiveInteger(
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      "INVALID_REQUEST_TIMEOUT_MS",
      this.locale,
    );
    this.resolveSecret = options.resolveSecret;

    const appSecret = normalizeOptionalString(options.appSecret);
    if (appSecret !== undefined) {
      this.appSecret = appSecret;
    }

    const appSecretRef = normalizeOptionalString(options.appSecretRef);
    if (appSecretRef !== undefined) {
      this.appSecretRef = appSecretRef;
    }

    if (this.appSecret === undefined && this.appSecretRef === undefined) {
      throw new FeishuAuthError("INVALID_APP_SECRET", this.locale, {
        details: {
          appId: this.appId,
        },
        englishMessage:
          "Feishu auth requires appSecret or appSecretRef for token management.",
        chineseMessage:
          "飞书鉴权需要提供 appSecret 或 appSecretRef 以管理访问令牌。",
      });
    }

    this.cachedToken = null;
    this.inFlightRefresh = null;
  }

  getAppId(): string {
    return this.appId;
  }

  getAuthEndpoint(): string {
    return this.authEndpoint;
  }

  getTokenSnapshot(): FeishuAuthToken | null {
    return this.cachedToken === null ? null : cloneToken(this.cachedToken);
  }

  invalidateAccessToken(): void {
    this.cachedToken = null;
  }

  setAppSecret(appSecret: string): void {
    this.appSecret = normalizeRequiredString(
      appSecret,
      "INVALID_APP_SECRET",
      this.locale,
    );
    this.invalidateAccessToken();
  }

  async getAccessToken(): Promise<string> {
    const token = await this.getToken();
    return token.accessToken;
  }

  async getToken(): Promise<FeishuAuthToken> {
    if (this.cachedToken !== null && !this.isRefreshRequired(this.cachedToken)) {
      return cloneToken(this.cachedToken);
    }
    return this.refreshAccessToken(true);
  }

  async refreshAccessToken(force = false): Promise<FeishuAuthToken> {
    if (
      !force &&
      this.cachedToken !== null &&
      !this.isRefreshRequired(this.cachedToken)
    ) {
      return cloneToken(this.cachedToken);
    }

    if (this.inFlightRefresh !== null) {
      const pending = await this.inFlightRefresh;
      return cloneToken(pending);
    }

    const refreshPromise = this.fetchAccessToken()
      .then((token) => {
        this.cachedToken = token;
        return token;
      })
      .finally(() => {
        this.inFlightRefresh = null;
      });

    this.inFlightRefresh = refreshPromise;
    const refreshed = await refreshPromise;
    return cloneToken(refreshed);
  }

  private isRefreshRequired(token: FeishuAuthToken): boolean {
    const refreshAtMs = token.expiresAt.getTime() - this.refreshBufferMs;
    return this.now().getTime() >= refreshAtMs;
  }

  private async fetchAccessToken(): Promise<FeishuAuthToken> {
    const appSecret = await this.resolveAppSecret();

    const payload = await this.postAuthRequest({
      app_id: this.appId,
      app_secret: appSecret,
    });
    const parsed = parseAuthResponse(payload);

    if (parsed.code !== 0) {
      throw new FeishuAuthError("AUTH_REJECTED", this.locale, {
        details: {
          appId: this.appId,
          authEndpoint: this.authEndpoint,
          code: parsed.code,
        },
        englishMessage:
          parsed.message ??
          `Feishu auth endpoint rejected credentials with code ${String(parsed.code)}.`,
        chineseMessage:
          parsed.message ??
          `飞书鉴权接口拒绝了凭证，错误码 ${String(parsed.code)}。`,
      });
    }

    const accessToken = normalizeOptionalString(parsed.accessToken);
    const expiresInSeconds = parsed.expiresInSeconds;

    if (
      accessToken === undefined ||
      expiresInSeconds === undefined ||
      !Number.isFinite(expiresInSeconds) ||
      expiresInSeconds <= 0
    ) {
      throw new FeishuAuthError("AUTH_RESPONSE_INVALID", this.locale, {
        details: {
          appId: this.appId,
          authEndpoint: this.authEndpoint,
        },
      });
    }

    const fetchedAt = this.now();
    const ttlSeconds = Math.floor(expiresInSeconds);
    const expiresAt = new Date(fetchedAt.getTime() + ttlSeconds * 1_000);

    return {
      appId: this.appId,
      tokenType: "tenant_access_token",
      accessToken,
      expiresInSeconds: ttlSeconds,
      fetchedAt,
      expiresAt,
    };
  }

  private async postAuthRequest(
    body: Record<string, string>,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(this.authEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const textBody = await response.text();
      const parsedBody = parseJson(textBody);

      if (!response.ok) {
        throw new FeishuAuthError("AUTH_REQUEST_FAILED", this.locale, {
          details: {
            appId: this.appId,
            authEndpoint: this.authEndpoint,
            statusCode: response.status,
          },
          englishMessage:
            readOptionalString(asRecord(parsedBody), "msg") ??
            `Feishu auth request failed with HTTP ${String(response.status)}.`,
          chineseMessage:
            readOptionalString(asRecord(parsedBody), "msg") ??
            `飞书鉴权请求失败，HTTP 状态码 ${String(response.status)}。`,
        });
      }

      if (parsedBody === undefined) {
        throw new FeishuAuthError("AUTH_RESPONSE_INVALID", this.locale, {
          details: {
            appId: this.appId,
            authEndpoint: this.authEndpoint,
          },
        });
      }

      return parsedBody;
    } catch (error: unknown) {
      if (error instanceof FeishuAuthError) {
        throw error;
      }

      throw new FeishuAuthError("AUTH_REQUEST_FAILED", this.locale, {
        cause: error,
        details: {
          appId: this.appId,
          authEndpoint: this.authEndpoint,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveAppSecret(): Promise<string> {
    if (this.appSecret !== undefined) {
      return this.appSecret;
    }

    if (this.appSecretRef === undefined) {
      throw new FeishuAuthError("INVALID_APP_SECRET_REF", this.locale, {
        details: {
          appId: this.appId,
        },
      });
    }

    if (this.resolveSecret === undefined) {
      throw new FeishuAuthError("SECRET_RESOLVER_REQUIRED", this.locale, {
        details: {
          appId: this.appId,
          appSecretRef: this.appSecretRef,
        },
      });
    }

    let resolved: string | null;
    try {
      resolved = await this.resolveSecret(this.appSecretRef);
    } catch (error: unknown) {
      throw new FeishuAuthError("SECRET_NOT_FOUND", this.locale, {
        cause: error,
        details: {
          appId: this.appId,
          appSecretRef: this.appSecretRef,
        },
      });
    }

    const normalized = normalizeOptionalString(resolved);
    if (normalized === undefined) {
      throw new FeishuAuthError("SECRET_NOT_FOUND", this.locale, {
        details: {
          appId: this.appId,
          appSecretRef: this.appSecretRef,
        },
      });
    }

    this.appSecret = normalized;
    return normalized;
  }
}

export function createFeishuAuthManager(
  options: FeishuAuthManagerOptions,
): FeishuAuthManager {
  return new FeishuAuthManager(options);
}

function parseAuthResponse(payload: unknown): FeishuAuthResponse {
  const objectValue = asRecord(payload);
  if (objectValue === undefined) {
    return {
      code: -1,
      message: undefined,
    };
  }

  const code = readOptionalNumber(objectValue, "code") ?? -1;
  const message =
    readOptionalString(objectValue, "msg") ??
    readOptionalString(objectValue, "message");
  const accessToken =
    readOptionalString(objectValue, "tenant_access_token") ??
    readOptionalString(objectValue, "access_token");
  const expiresInSeconds =
    readOptionalNumber(objectValue, "expire") ??
    readOptionalNumber(objectValue, "expires_in");

  return {
    code,
    message,
    accessToken,
    expiresInSeconds,
  };
}

function cloneToken(token: FeishuAuthToken): FeishuAuthToken {
  return {
    appId: token.appId,
    tokenType: token.tokenType,
    accessToken: token.accessToken,
    expiresInSeconds: token.expiresInSeconds,
    fetchedAt: new Date(token.fetchedAt.getTime()),
    expiresAt: new Date(token.expiresAt.getTime()),
  };
}

function normalizeAuthEndpoint(
  endpoint: string,
  locale: FeishuAuthLocale,
): string {
  const normalized = normalizeOptionalString(endpoint);
  if (normalized === undefined) {
    throw new FeishuAuthError("INVALID_AUTH_ENDPOINT", locale);
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch (error: unknown) {
    throw new FeishuAuthError("INVALID_AUTH_ENDPOINT", locale, {
      cause: error,
      details: {
        endpoint: normalized,
      },
    });
  }

  if (url.protocol !== "https:") {
    throw new FeishuAuthError("INVALID_AUTH_ENDPOINT", locale, {
      details: {
        endpoint: normalized,
      },
      englishMessage: "Feishu auth endpoint must use HTTPS.",
      chineseMessage: "飞书鉴权地址必须使用 HTTPS。",
    });
  }

  return url.toString();
}

function normalizePositiveInteger(
  value: number,
  errorCode: FeishuAuthErrorCode,
  locale: FeishuAuthLocale,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new FeishuAuthError(errorCode, locale);
  }
  return Math.floor(value);
}

function normalizeRequiredString(
  value: string,
  errorCode: FeishuAuthErrorCode,
  locale: FeishuAuthLocale,
): string {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    throw new FeishuAuthError(errorCode, locale);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

function parseJson(payload: string): unknown | undefined {
  if (payload.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readOptionalString(
  objectValue: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (objectValue === undefined) {
    return undefined;
  }
  return normalizeOptionalString(objectValue[key]);
}

function readOptionalNumber(
  objectValue: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (objectValue === undefined) {
    return undefined;
  }

  const value = objectValue[key];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(
  locale: FeishuAuthLocale,
  englishMessage: string,
  chineseMessage: string,
): string {
  return locale === "zh-CN" ? chineseMessage : englishMessage;
}

function defaultErrorMessage(
  code: FeishuAuthErrorCode,
  locale: FeishuAuthLocale,
): string {
  switch (code) {
    case "INVALID_APP_ID":
      return text(
        locale,
        "Feishu appId is required.",
        "缺少飞书 appId。",
      );
    case "INVALID_APP_SECRET":
      return text(
        locale,
        "Feishu appSecret is required.",
        "缺少飞书 appSecret。",
      );
    case "INVALID_APP_SECRET_REF":
      return text(
        locale,
        "Feishu appSecretRef is required.",
        "缺少飞书 appSecretRef。",
      );
    case "SECRET_RESOLVER_REQUIRED":
      return text(
        locale,
        "Secret resolver is required to load Feishu appSecretRef.",
        "解析飞书 appSecretRef 需要提供密钥解析器。",
      );
    case "SECRET_NOT_FOUND":
      return text(
        locale,
        "Unable to resolve Feishu app secret.",
        "无法解析飞书 appSecret。",
      );
    case "INVALID_AUTH_ENDPOINT":
      return text(
        locale,
        "Invalid Feishu auth endpoint.",
        "飞书鉴权地址无效。",
      );
    case "INVALID_REFRESH_BUFFER_MS":
      return text(
        locale,
        "refreshBufferMs must be a positive integer.",
        "refreshBufferMs 必须是正整数。",
      );
    case "INVALID_REQUEST_TIMEOUT_MS":
      return text(
        locale,
        "requestTimeoutMs must be a positive integer.",
        "requestTimeoutMs 必须是正整数。",
      );
    case "AUTH_REQUEST_FAILED":
      return text(
        locale,
        "Feishu auth request failed.",
        "飞书鉴权请求失败。",
      );
    case "AUTH_RESPONSE_INVALID":
      return text(
        locale,
        "Feishu auth response is invalid.",
        "飞书鉴权响应格式无效。",
      );
    case "AUTH_REJECTED":
      return text(
        locale,
        "Feishu auth rejected app credentials.",
        "飞书鉴权拒绝了应用凭证。",
      );
    default:
      return text(
        locale,
        "Unknown Feishu auth error.",
        "未知飞书鉴权错误。",
      );
  }
}
