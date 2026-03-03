import { createHmac, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type {
  Attachment,
  ChannelAdapter,
  ChannelConfig,
  ChannelErrorCode,
  ChannelErrorInfo,
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
  SendResult,
  TestResult,
} from "../channel-interface.js";
import type { Disposable } from "../../types/model-config.js";

export type FeishuAdapterLocale = "zh-CN" | "en";

export interface FeishuEventSubscriptionConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  path?: string;
  verificationToken?: string;
  verificationTokenRef?: string;
}

export interface FeishuChannelConfig extends ChannelConfig {
  channel: "feishu" | string;
  appId: string;
  appSecretRef: string;
  webhookUrl?: string;
  webhookToken?: string;
  webhookTokenRef?: string;
  eventSubscription?: FeishuEventSubscriptionConfig;
}

export interface FeishuRuntimeConfig {
  channel: string;
  appId: string;
  appSecretRef: string;
  appSecret: string | null;
  enabled: boolean;
  webhookUrl?: string;
  webhookToken?: string;
  eventSubscription: {
    enabled: boolean;
    host: string;
    port: number;
    path: string;
    verificationToken?: string;
  };
}

export interface FeishuRequestVerificationContext {
  headers: IncomingHttpHeaders;
  rawBody: string;
  body: unknown;
  config: Readonly<FeishuRuntimeConfig>;
}

export type FeishuRequestVerifier = (
  context: FeishuRequestVerificationContext,
) => boolean | Promise<boolean>;

export type FeishuSecretResolver = (
  secretRef: string,
) => string | null | Promise<string | null>;

export interface FeishuAdapterOptions {
  locale?: FeishuAdapterLocale;
  fetchImpl?: typeof fetch;
  resolveSecret?: FeishuSecretResolver;
  requestVerifier?: FeishuRequestVerifier;
  now?: () => Date;
  messageIdFactory?: () => string;
  defaultEventHost?: string;
  defaultEventPort?: number;
  defaultEventPath?: string;
  maxEventBodyBytes?: number;
}

interface ParsedWebhookResponse {
  messageId?: string;
  errorMessage?: string;
  accepted: boolean;
}

interface ExtractedEvent {
  eventType: string;
  message: Record<string, unknown>;
  sender: Record<string, unknown>;
}

const DEFAULT_LOCALE: FeishuAdapterLocale = "zh-CN";
const DEFAULT_EVENT_HOST = "127.0.0.1";
const DEFAULT_EVENT_PORT = 9_322;
const DEFAULT_EVENT_PATH = "/feishu/events";
const DEFAULT_MAX_EVENT_BODY_BYTES = 1_024 * 1_024;

export class FeishuAdapterError extends Error {
  readonly code: ChannelErrorCode;
  readonly recoverable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ChannelErrorCode,
    locale: FeishuAdapterLocale,
    options: {
      recoverable: boolean;
      englishMessage: string;
      chineseMessage: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(text(locale, options.englishMessage, options.chineseMessage));
    this.name = "FeishuAdapterError";
    this.code = code;
    this.recoverable = options.recoverable;
    this.details = options.details;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class FeishuAdapter implements ChannelAdapter {
  private readonly locale: FeishuAdapterLocale;
  private readonly fetchImpl: typeof fetch;
  private readonly resolveSecret: FeishuSecretResolver | undefined;
  private readonly requestVerifier: FeishuRequestVerifier | undefined;
  private readonly now: () => Date;
  private readonly messageIdFactory: () => string;
  private readonly defaultEventHost: string;
  private readonly defaultEventPort: number;
  private readonly defaultEventPath: string;
  private readonly maxEventBodyBytes: number;

  private status: ChannelStatus;
  private runtimeConfig: FeishuRuntimeConfig | null;
  private server: Server | null;
  private readonly messageListeners: Set<(message: InboundMessage) => void>;

  constructor(options: FeishuAdapterOptions = {}) {
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.resolveSecret = options.resolveSecret;
    this.requestVerifier = options.requestVerifier;
    this.now = options.now ?? (() => new Date());
    this.messageIdFactory = options.messageIdFactory ?? randomUUID;
    this.defaultEventHost =
      normalizeNonEmptyString(options.defaultEventHost) ?? DEFAULT_EVENT_HOST;
    this.defaultEventPort =
      normalizePositiveInteger(options.defaultEventPort) ?? DEFAULT_EVENT_PORT;
    this.defaultEventPath =
      normalizeEventPath(options.defaultEventPath) ?? DEFAULT_EVENT_PATH;
    this.maxEventBodyBytes =
      normalizePositiveInteger(options.maxEventBodyBytes) ??
      DEFAULT_MAX_EVENT_BODY_BYTES;

    this.status = "disconnected";
    this.runtimeConfig = null;
    this.server = null;
    this.messageListeners = new Set<(message: InboundMessage) => void>();
  }

  async connect(config: ChannelConfig): Promise<void> {
    await this.disconnect();

    const runtimeConfig = await this.parseRuntimeConfig(config);
    if (!runtimeConfig.enabled) {
      this.runtimeConfig = runtimeConfig;
      this.status = "disconnected";
      return;
    }

    if (
      runtimeConfig.webhookUrl === undefined &&
      !runtimeConfig.eventSubscription.enabled
    ) {
      this.status = "error";
      throw new FeishuAdapterError("CHANNEL_NOT_CONNECTED", this.locale, {
        recoverable: false,
        englishMessage:
          "Feishu channel needs at least one active transport: webhook send or event subscription receive.",
        chineseMessage:
          "飞书渠道至少需要一个有效通道：Webhook 发送或事件订阅接收。",
      });
    }

    if (runtimeConfig.eventSubscription.enabled) {
      this.server = await this.startEventServer(runtimeConfig);
    }

    this.runtimeConfig = runtimeConfig;
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    if (this.server !== null) {
      await closeServer(this.server);
      this.server = null;
    }

    this.runtimeConfig = null;
    this.status = "disconnected";
  }

  async sendMessage(message: OutboundMessage): Promise<SendResult> {
    const sentAt = this.now();
    const runtimeConfig = this.runtimeConfig;

    if (this.status !== "connected" || runtimeConfig === null) {
      return {
        success: false,
        timestamp: sentAt,
        error: createErrorInfo(
          "CHANNEL_NOT_CONNECTED",
          this.locale,
          {
            englishMessage: "Feishu channel is not connected.",
            chineseMessage: "飞书渠道未连接。",
          },
        ),
      };
    }

    if (runtimeConfig.webhookUrl === undefined) {
      return {
        success: false,
        timestamp: sentAt,
        error: createErrorInfo(
          "CHANNEL_SEND_FAILED",
          this.locale,
          {
            englishMessage:
              "Webhook URL is not configured. Unable to send Feishu message.",
            chineseMessage: "未配置 Webhook URL，无法发送飞书消息。",
            details: {
              appId: runtimeConfig.appId,
            },
          },
        ),
      };
    }

    const payload = buildWebhookPayload(message, runtimeConfig.webhookToken);

    try {
      const response = await this.fetchImpl(runtimeConfig.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      const parsed = parseWebhookResponse(response.status, response.ok, responseText);

      if (!parsed.accepted) {
        this.status = "error";
        return {
          success: false,
          timestamp: sentAt,
          error: createErrorInfo(
            "CHANNEL_SEND_FAILED",
            this.locale,
            {
              englishMessage:
                parsed.errorMessage ?? "Feishu webhook rejected the message.",
              chineseMessage:
                parsed.errorMessage ?? "飞书 Webhook 拒绝了该消息。",
              details: {
                statusCode: response.status,
                appId: runtimeConfig.appId,
              },
            },
          ),
        };
      }

      this.status = "connected";
      return {
        success: true,
        messageId: parsed.messageId ?? this.messageIdFactory(),
        timestamp: sentAt,
      };
    } catch (error: unknown) {
      this.status = "error";
      return {
        success: false,
        timestamp: sentAt,
        error: createErrorInfo(
          "CHANNEL_SEND_FAILED",
          this.locale,
          {
            englishMessage: toErrorMessage(
              error,
              "Failed to send message through Feishu webhook.",
            ),
            chineseMessage: toErrorMessage(
              error,
              "通过飞书 Webhook 发送消息失败。",
            ),
            details: {
              appId: runtimeConfig.appId,
            },
          },
        ),
      };
    }
  }

  onMessage(callback: (message: InboundMessage) => void): Disposable {
    this.messageListeners.add(callback);

    return {
      dispose: (): void => {
        this.messageListeners.delete(callback);
      },
    };
  }

  async testConnection(): Promise<TestResult> {
    const startedAt = Date.now();
    const checkedAt = this.now();

    if (this.status !== "connected" || this.runtimeConfig === null) {
      return {
        success: false,
        latencyMs: Date.now() - startedAt,
        checkedAt,
        status: this.status,
        message: text(
          this.locale,
          "Feishu channel is not connected.",
          "飞书渠道未连接。",
        ),
        error: createErrorInfo(
          "CHANNEL_NOT_CONNECTED",
          this.locale,
          {
            englishMessage: "Connect the Feishu channel before testing.",
            chineseMessage: "请先连接飞书渠道后再测试。",
          },
        ),
      };
    }

    if (this.runtimeConfig.webhookUrl === undefined) {
      const success = this.runtimeConfig.eventSubscription.enabled;
      return {
        success,
        latencyMs: Date.now() - startedAt,
        checkedAt,
        status: success ? "connected" : "error",
        message: success
          ? text(
              this.locale,
              "Event subscription server is listening.",
              "事件订阅服务已监听。",
            )
          : text(
              this.locale,
              "No webhook URL configured for send test.",
              "未配置用于发送测试的 Webhook URL。",
            ),
        error: success
          ? undefined
          : createErrorInfo(
              "CHANNEL_SEND_FAILED",
              this.locale,
              {
                englishMessage: "Webhook URL is required for send connectivity test.",
                chineseMessage: "发送连通性测试需要配置 Webhook URL。",
              },
            ),
      };
    }

    const result = await this.sendMessage({
      text: "[OneClaw] Feishu connection test",
      format: "plain",
    });
    const latencyMs = Date.now() - startedAt;

    if (!result.success) {
      return {
        success: false,
        latencyMs,
        checkedAt,
        status: this.status,
        message: text(
          this.locale,
          "Feishu connection test failed.",
          "飞书连接测试失败。",
        ),
        error: result.error,
      };
    }

    return {
      success: true,
      latencyMs,
      checkedAt,
      status: this.status,
      message: text(
        this.locale,
        "Feishu connection test succeeded.",
        "飞书连接测试成功。",
      ),
    };
  }

  getStatus(): ChannelStatus {
    return this.status;
  }

  private async parseRuntimeConfig(config: ChannelConfig): Promise<FeishuRuntimeConfig> {
    const objectValue = asRecord(config);

    const appId = readRequiredString(objectValue, "appId", this.locale, {
      code: "CHANNEL_AUTH_FAILED",
      englishMessage: "Feishu appId is required.",
      chineseMessage: "缺少飞书 appId。",
    });

    const appSecretRef = readRequiredString(
      objectValue,
      "appSecretRef",
      this.locale,
      {
        code: "CHANNEL_AUTH_FAILED",
        englishMessage: "Feishu appSecretRef is required.",
        chineseMessage: "缺少飞书 appSecretRef。",
      },
    );

    const channel = normalizeNonEmptyString(readOptionalString(objectValue, "channel")) ??
      "feishu";
    const enabled = readOptionalBoolean(objectValue, "enabled") ?? true;

    const webhookUrl = normalizeWebhookUrl(
      readOptionalString(objectValue, "webhookUrl"),
    );
    let webhookToken = normalizeNonEmptyString(
      readOptionalString(objectValue, "webhookToken"),
    );

    const appSecret = await this.resolveRequiredSecret(appSecretRef, {
      englishMessage: "Unable to resolve Feishu app secret.",
      chineseMessage: "无法解析飞书应用密钥。",
      missingCode: "CHANNEL_AUTH_FAILED",
    });

    const webhookTokenRef = normalizeNonEmptyString(
      readOptionalString(objectValue, "webhookTokenRef"),
    );
    if (webhookToken === undefined && webhookTokenRef !== undefined) {
      webhookToken =
        (await this.resolveRequiredSecret(webhookTokenRef, {
          englishMessage: "Unable to resolve Feishu webhook token.",
          chineseMessage: "无法解析飞书 Webhook Token。",
          missingCode: "CHANNEL_AUTH_FAILED",
        })) ?? undefined;
    }

    const eventConfig = await this.parseEventSubscriptionConfig(
      objectValue,
      webhookToken,
    );

    return {
      channel,
      appId,
      appSecretRef,
      appSecret,
      enabled,
      webhookUrl,
      webhookToken,
      eventSubscription: eventConfig,
    };
  }

  private async parseEventSubscriptionConfig(
    config: Record<string, unknown>,
    fallbackToken?: string,
  ): Promise<FeishuRuntimeConfig["eventSubscription"]> {
    const nested = readOptionalRecord(config, "eventSubscription") ?? {};

    const enabled =
      readOptionalBoolean(nested, "enabled") ??
      readOptionalBoolean(config, "eventEnabled") ??
      true;

    const host =
      normalizeNonEmptyString(readOptionalString(nested, "host")) ??
      normalizeNonEmptyString(readOptionalString(config, "eventHost")) ??
      this.defaultEventHost;

    const port =
      readOptionalPositiveInteger(nested, "port") ??
      readOptionalPositiveInteger(config, "eventPort") ??
      this.defaultEventPort;

    const path =
      normalizeEventPath(readOptionalString(nested, "path")) ??
      normalizeEventPath(readOptionalString(config, "eventPath")) ??
      this.defaultEventPath;

    let verificationToken = normalizeNonEmptyString(
      readOptionalString(nested, "verificationToken"),
    );
    if (verificationToken === undefined) {
      verificationToken = normalizeNonEmptyString(
        readOptionalString(config, "verificationToken"),
      );
    }

    const verificationTokenRef =
      normalizeNonEmptyString(readOptionalString(nested, "verificationTokenRef")) ??
      normalizeNonEmptyString(
        readOptionalString(config, "verificationTokenRef"),
      );

    if (verificationToken === undefined && verificationTokenRef !== undefined) {
      verificationToken =
        (await this.resolveRequiredSecret(verificationTokenRef, {
          englishMessage: "Unable to resolve Feishu event verification token.",
          chineseMessage: "无法解析飞书事件校验 Token。",
          missingCode: "CHANNEL_AUTH_FAILED",
        })) ?? undefined;
    }

    return {
      enabled,
      host,
      port,
      path,
      verificationToken: verificationToken ?? fallbackToken,
    };
  }

  private async resolveRequiredSecret(
    secretRef: string,
    options: {
      englishMessage: string;
      chineseMessage: string;
      missingCode: ChannelErrorCode;
    },
  ): Promise<string | null> {
    if (this.resolveSecret === undefined) {
      return null;
    }

    let resolved: string | null;
    try {
      resolved = await this.resolveSecret(secretRef);
    } catch (error: unknown) {
      throw new FeishuAdapterError(options.missingCode, this.locale, {
        recoverable: false,
        englishMessage: options.englishMessage,
        chineseMessage: options.chineseMessage,
        details: {
          secretRef,
        },
        cause: error,
      });
    }

    const normalized = normalizeNonEmptyString(resolved);
    if (normalized === undefined) {
      throw new FeishuAdapterError(options.missingCode, this.locale, {
        recoverable: false,
        englishMessage: options.englishMessage,
        chineseMessage: options.chineseMessage,
        details: {
          secretRef,
        },
      });
    }

    return normalized;
  }

  private async startEventServer(config: FeishuRuntimeConfig): Promise<Server> {
    const server = createServer((request, response) => {
      void this
        .handleEventRequest(request, response, config)
        .catch((error: unknown) => {
          this.status = "error";
          sendJson(response, 500, {
            code: 500,
            msg: toErrorMessage(error, "internal_error"),
          });
        });
    });

    server.on("error", () => {
      this.status = "error";
    });

    try {
      await listenServer(
        server,
        config.eventSubscription.port,
        config.eventSubscription.host,
      );
    } catch (error: unknown) {
      this.status = "error";
      throw new FeishuAdapterError("CHANNEL_RECEIVE_FAILED", this.locale, {
        recoverable: true,
        englishMessage: "Unable to start Feishu event subscription server.",
        chineseMessage: "无法启动飞书事件订阅服务。",
        details: {
          host: config.eventSubscription.host,
          port: config.eventSubscription.port,
          path: config.eventSubscription.path,
        },
        cause: error,
      });
    }

    return server;
  }

  private async handleEventRequest(
    request: IncomingMessage,
    response: ServerResponse,
    config: FeishuRuntimeConfig,
  ): Promise<void> {
    const method = normalizeNonEmptyString(request.method);
    if (method !== "POST") {
      sendJson(response, 405, {
        code: 405,
        msg: "method_not_allowed",
      });
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== config.eventSubscription.path) {
      sendJson(response, 404, {
        code: 404,
        msg: "not_found",
      });
      return;
    }

    const rawBody = await readRequestBody(request, this.maxEventBodyBytes);
    const body = parseJsonAsUnknown(rawBody);

    if (body === undefined) {
      this.status = "error";
      sendJson(response, 400, {
        code: 400,
        msg: "invalid_json",
      });
      return;
    }

    const verified = await this.verifyIncomingEventRequest({
      headers: request.headers,
      rawBody,
      body,
      config,
    });

    if (!verified) {
      this.status = "error";
      sendJson(response, 401, {
        code: 401,
        msg: "signature_invalid",
      });
      return;
    }

    const challenge = extractChallenge(body);
    if (challenge !== undefined) {
      sendJson(response, 200, {
        challenge,
      });
      return;
    }

    const inboundMessage = extractInboundMessage(body, config.channel);
    if (inboundMessage !== null) {
      this.emitInboundMessage(inboundMessage);
    }

    sendJson(response, 200, {
      code: 0,
      msg: "ok",
    });
  }

  private async verifyIncomingEventRequest(
    context: FeishuRequestVerificationContext,
  ): Promise<boolean> {
    if (this.requestVerifier !== undefined) {
      try {
        return await Promise.resolve(this.requestVerifier(context));
      } catch {
        return false;
      }
    }

    const expectedToken = context.config.eventSubscription.verificationToken;
    if (expectedToken === undefined) {
      return true;
    }

    const tokens = extractTokenCandidates(context.body);
    if (tokens.length === 0) {
      return false;
    }

    return tokens.some((token) => token === expectedToken);
  }

  private emitInboundMessage(message: InboundMessage): void {
    for (const listener of this.messageListeners) {
      try {
        listener(cloneInboundMessage(message));
      } catch {
        // Listener failures are isolated to avoid affecting adapter IO.
      }
    }
  }
}

export function createFeishuAdapter(options: FeishuAdapterOptions = {}): ChannelAdapter {
  return new FeishuAdapter(options);
}

function createErrorInfo(
  code: ChannelErrorCode,
  locale: FeishuAdapterLocale,
  options: {
    englishMessage: string;
    chineseMessage: string;
    recoverable?: boolean;
    details?: Record<string, unknown>;
  },
): ChannelErrorInfo {
  return {
    code,
    message: text(locale, options.englishMessage, options.chineseMessage),
    recoverable: options.recoverable ?? true,
    details: options.details,
  };
}

function buildWebhookPayload(
  message: OutboundMessage,
  webhookToken?: string,
): Record<string, unknown> {
  const payload = baseMessagePayload(message);

  if (webhookToken === undefined) {
    return payload;
  }

  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = buildWebhookSignature(timestamp, webhookToken);

  return {
    ...payload,
    timestamp,
    sign: signature,
  };
}

function baseMessagePayload(message: OutboundMessage): Record<string, unknown> {
  switch (message.format) {
    case "plain":
      return {
        msg_type: "text",
        content: {
          text: message.text,
        },
      };
    case "markdown":
      return {
        msg_type: "post",
        content: {
          post: {
            zh_cn: {
              title: "OneClaw",
              content: [[{ tag: "text", text: message.text }]],
            },
            en_us: {
              title: "OneClaw",
              content: [[{ tag: "text", text: message.text }]],
            },
          },
        },
      };
    case "card": {
      const card = extractCardPayload(message);
      return {
        msg_type: "interactive",
        card,
      };
    }
    default:
      return {
        msg_type: "text",
        content: {
          text: message.text,
        },
      };
  }
}

function extractCardPayload(message: OutboundMessage): Record<string, unknown> {
  const metadataCard = asRecord(message.metadata)?.card;
  if (isRecord(metadataCard)) {
    return metadataCard;
  }

  const parsedTextCard = parseJsonAsUnknown(message.text);
  if (isRecord(parsedTextCard)) {
    return parsedTextCard;
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    elements: [
      {
        tag: "markdown",
        content: message.text,
      },
    ],
  };
}

function buildWebhookSignature(timestamp: string, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", secret).update(stringToSign).digest("base64");
}

function parseWebhookResponse(
  statusCode: number,
  ok: boolean,
  bodyText: string,
): ParsedWebhookResponse {
  const parsedBody = parseJsonAsUnknown(bodyText);
  const objectValue = isRecord(parsedBody) ? parsedBody : undefined;

  const explicitCode = readOptionalNumber(objectValue, "code");
  const explicitMsg = readOptionalString(objectValue, "msg");
  const statusField = readOptionalNumber(objectValue, "StatusCode");
  const statusMessage = readOptionalString(objectValue, "StatusMessage");

  if (!ok) {
    return {
      accepted: false,
      errorMessage:
        explicitMsg ?? statusMessage ?? `HTTP ${String(statusCode)} response.`,
    };
  }

  if (explicitCode !== undefined && explicitCode !== 0) {
    return {
      accepted: false,
      errorMessage:
        explicitMsg ?? `Feishu webhook returned code ${String(explicitCode)}.`,
    };
  }

  if (statusField !== undefined && statusField !== 0) {
    return {
      accepted: false,
      errorMessage:
        statusMessage ??
        `Feishu webhook returned StatusCode ${String(statusField)}.`,
    };
  }

  const messageId =
    readOptionalString(objectValue, "message_id") ??
    readOptionalString(readOptionalRecord(objectValue, "data"), "message_id") ??
    readOptionalString(readOptionalRecord(objectValue, "data"), "messageId");

  return {
    accepted: true,
    messageId,
  };
}

async function listenServer(
  server: Server,
  port: number,
  host: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };

    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function readRequestBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const normalizedChunk = normalizeChunkToBuffer(chunk);
    totalBytes += normalizedChunk.byteLength;

    if (totalBytes > maxBytes) {
      throw new Error(`Payload too large: ${String(totalBytes)} bytes.`);
    }

    chunks.push(normalizedChunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function normalizeChunkToBuffer(chunk: unknown): Buffer {
  if (typeof chunk === "string") {
    return Buffer.from(chunk, "utf8");
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  return Buffer.from(String(chunk), "utf8");
}

function extractChallenge(payload: unknown): string | undefined {
  const objectValue = asRecord(payload);
  return normalizeNonEmptyString(readOptionalString(objectValue, "challenge"));
}

function extractInboundMessage(
  payload: unknown,
  channel: string,
): InboundMessage | null {
  const extracted = extractEvent(payload);
  if (extracted === null) {
    return null;
  }

  const messageType =
    normalizeNonEmptyString(readOptionalString(extracted.message, "message_type")) ??
    "text";
  const rawContent = readOptionalString(extracted.message, "content") ?? "";
  const contentValue = parseContentPayload(rawContent);

  const text =
    extractTextFromContent(messageType, contentValue) ??
    fallbackTextForMessageType(messageType);

  const sender =
    readNestedString(extracted.sender, ["sender_id", "open_id"]) ??
    readNestedString(extracted.sender, ["sender_id", "user_id"]) ??
    readNestedString(extracted.sender, ["sender_id", "union_id"]) ??
    readOptionalString(extracted.sender, "sender_id") ??
    "unknown";

  const timestamp = parseEventTimestamp(
    readOptionalString(extracted.message, "create_time"),
  );

  const attachments = extractAttachments(messageType, contentValue);

  return {
    text,
    sender,
    channel,
    timestamp,
    attachments: attachments.length > 0 ? attachments : undefined,
    metadata: {
      eventType: extracted.eventType,
      messageId: readOptionalString(extracted.message, "message_id"),
      chatId: readOptionalString(extracted.message, "chat_id"),
      messageType,
    },
  };
}

function extractEvent(payload: unknown): ExtractedEvent | null {
  const objectValue = asRecord(payload);

  const header = readOptionalRecord(objectValue, "header");
  const directEvent = readOptionalRecord(objectValue, "event");
  const directEventType = normalizeNonEmptyString(
    readOptionalString(header, "event_type"),
  );

  if (directEvent !== undefined && directEventType !== undefined) {
    const directMessage = readOptionalRecord(directEvent, "message");
    const directSender = readOptionalRecord(directEvent, "sender");
    if (directMessage !== undefined && directSender !== undefined) {
      return {
        eventType: directEventType,
        message: directMessage,
        sender: directSender,
      };
    }
  }

  const callbackType = normalizeNonEmptyString(readOptionalString(objectValue, "type"));
  if (callbackType === "event_callback") {
    const event = readOptionalRecord(objectValue, "event");
    if (event === undefined) {
      return null;
    }

    const eventType = normalizeNonEmptyString(readOptionalString(event, "type"));
    const message = readOptionalRecord(event, "message");
    const sender = readOptionalRecord(event, "sender");

    if (eventType !== undefined && message !== undefined && sender !== undefined) {
      return {
        eventType,
        message,
        sender,
      };
    }
  }

  return null;
}

function parseContentPayload(content: string): Record<string, unknown> {
  const parsed = parseJsonAsUnknown(content);
  if (isRecord(parsed)) {
    return parsed;
  }
  return {};
}

function extractTextFromContent(
  messageType: string,
  content: Record<string, unknown>,
): string | undefined {
  if (messageType === "text") {
    return normalizeNonEmptyString(readOptionalString(content, "text"));
  }

  if (messageType === "post") {
    const textParts: string[] = [];
    collectTextFragments(content, textParts);
    const combined = normalizeNonEmptyString(textParts.join(" ").trim());
    return combined;
  }

  if (messageType === "interactive") {
    return normalizeNonEmptyString(readOptionalString(content, "title"));
  }

  return undefined;
}

function fallbackTextForMessageType(messageType: string): string {
  switch (messageType) {
    case "image":
      return "[image]";
    case "file":
      return "[file]";
    case "audio":
      return "[audio]";
    case "video":
      return "[video]";
    case "sticker":
      return "[sticker]";
    default:
      return "[message]";
  }
}

function collectTextFragments(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const normalized = normalizeNonEmptyString(value);
    if (normalized !== undefined) {
      output.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFragments(item, output);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const nestedValue of Object.values(value)) {
    collectTextFragments(nestedValue, output);
  }
}

function extractAttachments(
  messageType: string,
  content: Record<string, unknown>,
): Attachment[] {
  const attachments: Attachment[] = [];

  if (messageType === "text" || messageType === "post") {
    return attachments;
  }

  const attachmentType = toAttachmentType(messageType);
  const id =
    normalizeNonEmptyString(readOptionalString(content, "file_key")) ??
    normalizeNonEmptyString(readOptionalString(content, "image_key")) ??
    normalizeNonEmptyString(readOptionalString(content, "media_id"));

  attachments.push({
    type: attachmentType,
    id,
    metadata: cloneRecord(content),
  });

  return attachments;
}

function toAttachmentType(
  messageType: string,
): "image" | "file" | "audio" | "video" | "link" | "card" | "unknown" {
  switch (messageType) {
    case "image":
      return "image";
    case "file":
      return "file";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "interactive":
      return "card";
    default:
      return "unknown";
  }
}

function parseEventTimestamp(value: string | undefined): Date {
  if (value === undefined) {
    return new Date();
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return new Date();
  }

  const milliseconds = value.length > 10 ? parsed : parsed * 1_000;
  return new Date(milliseconds);
}

function extractTokenCandidates(payload: unknown): string[] {
  const objectValue = asRecord(payload);
  const candidates = new Set<string>();

  const directToken = normalizeNonEmptyString(readOptionalString(objectValue, "token"));
  if (directToken !== undefined) {
    candidates.add(directToken);
  }

  const headerToken = normalizeNonEmptyString(
    readOptionalString(readOptionalRecord(objectValue, "header"), "token"),
  );
  if (headerToken !== undefined) {
    candidates.add(headerToken);
  }

  return [...candidates];
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  if (response.headersSent) {
    return;
  }

  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRecord(input: Record<string, unknown>): Record<string, unknown> {
  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    cloned[key] = value;
  }
  return cloned;
}

function cloneInboundMessage(message: InboundMessage): InboundMessage {
  return {
    ...message,
    timestamp: new Date(message.timestamp.getTime()),
    attachments: message.attachments?.map((attachment) => ({ ...attachment })),
    metadata: message.metadata !== undefined ? cloneRecord(message.metadata) : undefined,
  };
}

function readRequiredString(
  input: Record<string, unknown>,
  key: string,
  locale: FeishuAdapterLocale,
  options: {
    code: ChannelErrorCode;
    englishMessage: string;
    chineseMessage: string;
  },
): string {
  const value = normalizeNonEmptyString(readOptionalString(input, key));
  if (value !== undefined) {
    return value;
  }

  throw new FeishuAdapterError(options.code, locale, {
    recoverable: false,
    englishMessage: options.englishMessage,
    chineseMessage: options.chineseMessage,
    details: {
      key,
    },
  });
}

function readOptionalString(
  input: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input[key];
  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

function readOptionalNumber(
  input: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function readOptionalBoolean(
  input: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input[key];
  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function readOptionalRecord(
  input: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (input === undefined) {
    return undefined;
  }

  const value = input[key];
  if (isRecord(value)) {
    return value;
  }

  return undefined;
}

function readNestedString(
  input: Record<string, unknown> | undefined,
  path: readonly string[],
): string | undefined {
  let current: unknown = input;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }

  if (typeof current === "string") {
    return current;
  }

  return undefined;
}

function readOptionalPositiveInteger(
  input: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = input[key];
  if (typeof value !== "number") {
    return undefined;
  }
  if (!Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function normalizeNonEmptyString(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function normalizeWebhookUrl(value: string | undefined): string | undefined {
  const normalized = normalizeNonEmptyString(value);
  if (normalized === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizeEventPath(value: string | undefined): string | undefined {
  const normalized = normalizeNonEmptyString(value);
  if (normalized === undefined) {
    return undefined;
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function parseJsonAsUnknown(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return normalizeNonEmptyString(error.message) ?? fallback;
  }

  return fallback;
}

function text(
  locale: FeishuAdapterLocale,
  english: string,
  chinese: string,
): string {
  return locale === "zh-CN" ? chinese : english;
}
