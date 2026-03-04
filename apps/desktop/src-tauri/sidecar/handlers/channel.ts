/**
 * Sidecar handlers for `channel.*` operations.
 *
 * Read:
 *   channel.feishu.status   — get Feishu channel connection status
 *
 * Write:
 *   channel.feishu.setup    — configure Feishu credentials and connect
 *   channel.feishu.test     — test Feishu channel connectivity
 *   channel.feishu.sendTest — send a test message through Feishu
 */

import type { SidecarContext } from "../context.js";
import { mapChannelError, mapSecretError, SidecarHandlerError } from "./errors.js";

type IpcChannelStatus = "connected" | "disconnected" | "error";

interface IpcChannelErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

interface IpcTestResult {
  success: boolean;
  latencyMs: number;
  checkedAt: string;
  status: IpcChannelStatus;
  message?: string;
  error?: IpcChannelErrorInfo;
}

interface IpcSendResult {
  success: boolean;
  messageId?: string;
  timestamp: string;
  error?: IpcChannelErrorInfo;
}

function toIpcChannelError(error: unknown): IpcChannelErrorInfo {
  if (typeof error !== "object" || error === null) {
    return {
      code: "CHANNEL_UNKNOWN",
      message: String(error),
      recoverable: true,
    };
  }

  const e = error as Record<string, unknown>;
  return {
    code: typeof e.code === "string" ? e.code : "CHANNEL_UNKNOWN",
    message: error instanceof Error ? error.message : String(error),
    recoverable: typeof e.recoverable === "boolean" ? e.recoverable : true,
    details: typeof e.details === "object" && e.details !== null
      ? e.details as Record<string, unknown>
      : undefined,
  };
}

export function handleChannelFeishuStatus(
  ctx: SidecarContext,
): { status: IpcChannelStatus; error?: IpcChannelErrorInfo } {
  const adapter = ctx.getFeishuAdapter();
  if (adapter === null) {
    return { status: "disconnected" };
  }

  const status = adapter.getStatus();
  return { status };
}

export async function handleChannelFeishuSetup(
  ctx: SidecarContext,
  params: {
    appId: string;
    appSecret: string;
    webhookUrl?: string;
    webhookToken?: string;
  },
): Promise<{ ok: true; testResult: IpcTestResult }> {
  const store = await ctx.getSecretStore();

  // Store credentials as secrets
  try {
    await store.set("oneclaw/channel/feishu/app-secret", params.appSecret);
    if (params.webhookToken !== undefined) {
      await store.set("oneclaw/channel/feishu/webhook-token", params.webhookToken);
    }
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapSecretError(error, ctx.locale));
  }

  // Create and connect the adapter
  try {
    const adapter = await ctx.createFeishuAdapter();
    await adapter.connect({
      channel: "feishu",
      appId: params.appId,
      appSecretRef: "oneclaw/channel/feishu/app-secret",
      webhookUrl: params.webhookUrl,
      webhookTokenRef: params.webhookToken !== undefined
        ? "oneclaw/channel/feishu/webhook-token"
        : undefined,
      enabled: true,
    });

    // Run connectivity test after setup
    const testResult = await adapter.testConnection();
    return {
      ok: true,
      testResult: {
        success: testResult.success,
        latencyMs: testResult.latencyMs,
        checkedAt: testResult.checkedAt.toISOString(),
        status: testResult.status,
        message: testResult.message,
        error: testResult.error !== undefined
          ? toIpcChannelError(testResult.error)
          : undefined,
      },
    };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapChannelError(error, ctx.locale));
  }
}

export async function handleChannelFeishuTest(
  ctx: SidecarContext,
): Promise<IpcTestResult> {
  const adapter = ctx.getFeishuAdapter();
  if (adapter === null) {
    const msg = ctx.locale === "zh-CN"
      ? "飞书渠道未配置，请先运行设置。"
      : "Feishu channel not configured. Run setup first.";
    return {
      success: false,
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      status: "disconnected",
      message: msg,
      error: {
        code: "CHANNEL_NOT_CONNECTED",
        message: msg,
        recoverable: true,
      },
    };
  }

  try {
    const result = await adapter.testConnection();
    return {
      success: result.success,
      latencyMs: result.latencyMs,
      checkedAt: result.checkedAt.toISOString(),
      status: result.status,
      message: result.message,
      error: result.error !== undefined
        ? toIpcChannelError(result.error)
        : undefined,
    };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapChannelError(error, ctx.locale));
  }
}

export async function handleChannelFeishuSendTest(
  ctx: SidecarContext,
  params: { message?: string },
): Promise<IpcSendResult> {
  const adapter = ctx.getFeishuAdapter();
  if (adapter === null) {
    const msg = ctx.locale === "zh-CN"
      ? "飞书渠道未配置，请先运行设置。"
      : "Feishu channel not configured. Run setup first.";
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: {
        code: "CHANNEL_NOT_CONNECTED",
        message: msg,
        recoverable: true,
      },
    };
  }

  try {
    const text = params.message ?? "[OneClaw] 测试消息 / Test message";
    const result = await adapter.sendMessage({
      text,
      format: "plain",
    });
    return {
      success: result.success,
      messageId: result.messageId,
      timestamp: result.timestamp.toISOString(),
      error: result.error !== undefined
        ? toIpcChannelError(result.error)
        : undefined,
    };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapChannelError(error, ctx.locale));
  }
}
