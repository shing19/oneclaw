/**
 * IPC contracts for `channel.*` namespace.
 *
 * Maps to ChannelAdapter operations in @oneclaw/core.
 * Currently only Feishu is supported; extensible for dingtalk/wechatWork.
 */

// ── Serializable types ─────────────────────────────────────────────

export type IpcChannelStatus = "connected" | "disconnected" | "error";

export interface IpcChannelErrorInfo {
  readonly code:
    | "CHANNEL_NOT_CONNECTED"
    | "CHANNEL_AUTH_FAILED"
    | "CHANNEL_SEND_FAILED"
    | "CHANNEL_RECEIVE_FAILED"
    | "CHANNEL_TIMEOUT"
    | "CHANNEL_UNKNOWN";
  readonly message: string;
  readonly recoverable: boolean;
  readonly details?: Record<string, unknown>;
}

export interface IpcTestResult {
  readonly success: boolean;
  readonly latencyMs: number;
  /** ISO 8601 timestamp. */
  readonly checkedAt: string;
  readonly status: IpcChannelStatus;
  readonly message?: string;
  readonly error?: IpcChannelErrorInfo;
}

export interface IpcSendResult {
  readonly success: boolean;
  readonly messageId?: string;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  readonly error?: IpcChannelErrorInfo;
}

// ── Request params ─────────────────────────────────────────────────

/** `channel.feishu.setup` — configure Feishu channel credentials. */
export interface ChannelFeishuSetupParams {
  readonly appId: string;
  readonly appSecret: string;
  readonly webhookUrl?: string;
  readonly webhookToken?: string;
}

/** `channel.feishu.test` — test Feishu channel connectivity. */
export type ChannelFeishuTestParams = Record<string, never>;

/** `channel.feishu.status` — get Feishu channel connection status. */
export type ChannelFeishuStatusParams = Record<string, never>;

/** `channel.feishu.sendTest` — send a test message to Feishu. */
export interface ChannelFeishuSendTestParams {
  readonly message?: string;
}

// ── Response results ───────────────────────────────────────────────

/** `channel.feishu.setup` result. */
export interface ChannelFeishuSetupResult {
  readonly ok: true;
  readonly testResult: IpcTestResult;
}

/** `channel.feishu.test` result. */
export type ChannelFeishuTestResult = IpcTestResult;

/** `channel.feishu.status` result. */
export interface ChannelFeishuStatusResult {
  readonly status: IpcChannelStatus;
  readonly error?: IpcChannelErrorInfo;
}

/** `channel.feishu.sendTest` result. */
export type ChannelFeishuSendTestResult = IpcSendResult;
