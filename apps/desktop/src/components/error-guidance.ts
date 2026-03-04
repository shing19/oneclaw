/**
 * Bilingual error guidance mapping.
 *
 * Maps IPC error codes and JSON-RPC error codes to localized,
 * actionable guidance messages for end users.
 */

import type { AppLanguage } from "@/stores/config-store";

interface ErrorGuidance {
  readonly title: { readonly "zh-CN": string; readonly en: string };
  readonly action: { readonly "zh-CN": string; readonly en: string };
}

/**
 * Guidance keyed by application error code (from IpcError.code).
 */
const APP_CODE_GUIDANCE: Record<string, ErrorGuidance> = {
  // Kernel / agent errors
  KERNEL_START_FAILED: {
    title: { "zh-CN": "Agent 启动失败", en: "Agent failed to start" },
    action: {
      "zh-CN": "请确认已配置 API Key 且网络连接正常，然后重试。",
      en: "Confirm your API key is configured and network is available, then retry.",
    },
  },
  KERNEL_STOP_FAILED: {
    title: { "zh-CN": "Agent 停止失败", en: "Agent failed to stop" },
    action: {
      "zh-CN": "请稍后重试。如仍然失败，尝试重启应用。",
      en: "Please retry later. If the issue persists, try restarting the app.",
    },
  },
  KERNEL_ALREADY_RUNNING: {
    title: { "zh-CN": "Agent 已在运行", en: "Agent is already running" },
    action: {
      "zh-CN": "无需操作，Agent 正在运行中。",
      en: "No action needed — the agent is already running.",
    },
  },

  // Config errors
  CONFIG_LOAD_FAILED: {
    title: { "zh-CN": "配置加载失败", en: "Failed to load configuration" },
    action: {
      "zh-CN": "请检查配置文件路径和读写权限，或在设置中重置配置。",
      en: "Check the config file path and permissions, or reset config in Settings.",
    },
  },
  CONFIG_SAVE_FAILED: {
    title: { "zh-CN": "配置保存失败", en: "Failed to save configuration" },
    action: {
      "zh-CN": "请确认磁盘空间充足且配置目录有写入权限。",
      en: "Ensure sufficient disk space and write permissions to the config directory.",
    },
  },
  CONFIG_INVALID: {
    title: { "zh-CN": "配置格式无效", en: "Invalid configuration" },
    action: {
      "zh-CN": "请检查配置值是否正确，或重置为默认配置。",
      en: "Check configuration values or reset to defaults.",
    },
  },

  // Secret errors
  SECRET_STORE_UNAVAILABLE: {
    title: { "zh-CN": "密钥存储不可用", en: "Secret store unavailable" },
    action: {
      "zh-CN": "请检查系统密钥链（Keychain/密钥管理器）的访问权限。",
      en: "Check system keychain / credential manager access permissions.",
    },
  },
  SECRET_NOT_FOUND: {
    title: { "zh-CN": "密钥未找到", en: "Secret not found" },
    action: {
      "zh-CN": "请在供应商设置中重新输入 API Key。",
      en: "Re-enter the API key in provider settings.",
    },
  },

  // Channel errors
  CHANNEL_NOT_CONNECTED: {
    title: { "zh-CN": "通道未连接", en: "Channel not connected" },
    action: {
      "zh-CN": "请先在通信配置页面完成飞书设置。",
      en: "Complete Feishu setup in the Channel configuration page first.",
    },
  },
  CHANNEL_AUTH_FAILED: {
    title: { "zh-CN": "通道认证失败", en: "Channel authentication failed" },
    action: {
      "zh-CN": "请检查飞书 App ID 和 App Secret 是否正确。",
      en: "Verify your Feishu App ID and App Secret are correct.",
    },
  },
  CHANNEL_SEND_FAILED: {
    title: { "zh-CN": "消息发送失败", en: "Failed to send message" },
    action: {
      "zh-CN": "请检查网络连接和飞书 Bot 权限配置。",
      en: "Check your network connection and Feishu bot permissions.",
    },
  },
  CHANNEL_TIMEOUT: {
    title: { "zh-CN": "通道连接超时", en: "Channel connection timed out" },
    action: {
      "zh-CN": "请检查网络连接，飞书服务可能暂时不可用。",
      en: "Check your network. The Feishu service may be temporarily unavailable.",
    },
  },

  // Model / provider errors
  MODEL_PROVIDER_UNREACHABLE: {
    title: { "zh-CN": "供应商不可达", en: "Provider unreachable" },
    action: {
      "zh-CN": "请检查网络连接和 API 端点配置。如使用代理请确认代理设置。",
      en: "Check your network and API endpoint config. Verify proxy settings if applicable.",
    },
  },
  MODEL_AUTH_FAILED: {
    title: { "zh-CN": "API 认证失败", en: "API authentication failed" },
    action: {
      "zh-CN": "请检查 API Key 是否正确，以及是否已过期或被禁用。",
      en: "Verify your API key is correct and has not expired or been disabled.",
    },
  },
  MODEL_QUOTA_EXCEEDED: {
    title: { "zh-CN": "配额已用尽", en: "Quota exceeded" },
    action: {
      "zh-CN": "请前往供应商控制台充值或等待配额重置。",
      en: "Top up your balance in the provider dashboard or wait for quota reset.",
    },
  },

  // IPC / transport errors
  IPC_ERROR: {
    title: { "zh-CN": "内部通信错误", en: "Internal communication error" },
    action: {
      "zh-CN": "与后台进程通信失败。请尝试重启应用。",
      en: "Communication with the background process failed. Try restarting the app.",
    },
  },
  INTERNAL_ERROR: {
    title: { "zh-CN": "内部错误", en: "Internal error" },
    action: {
      "zh-CN": "发生了未预期的错误。请尝试重启应用，如问题持续请反馈。",
      en: "An unexpected error occurred. Try restarting the app. Report if the issue persists.",
    },
  },
};

/**
 * Fallback guidance keyed by JSON-RPC numeric error code range.
 * Used when no specific APP_CODE_GUIDANCE match is found.
 */
const JSONRPC_CODE_GUIDANCE: Record<number, ErrorGuidance> = {
  [-32001]: {
    title: { "zh-CN": "Agent 内核错误", en: "Agent kernel error" },
    action: {
      "zh-CN": "请检查 Agent 配置和运行状态，然后重试。",
      en: "Check agent configuration and runtime status, then retry.",
    },
  },
  [-32002]: {
    title: { "zh-CN": "配置错误", en: "Configuration error" },
    action: {
      "zh-CN": "请检查配置文件路径和内容是否正确。",
      en: "Check the config file path and contents.",
    },
  },
  [-32003]: {
    title: { "zh-CN": "密钥存储错误", en: "Secret store error" },
    action: {
      "zh-CN": "请检查系统密钥链的访问权限。",
      en: "Check system keychain access permissions.",
    },
  },
  [-32004]: {
    title: { "zh-CN": "通信渠道错误", en: "Channel error" },
    action: {
      "zh-CN": "请检查飞书配置和网络连接。",
      en: "Check Feishu configuration and network connection.",
    },
  },
  [-32005]: {
    title: { "zh-CN": "模型连接错误", en: "Model connection error" },
    action: {
      "zh-CN": "请检查 API Key 和供应商状态。",
      en: "Check your API key and provider status.",
    },
  },
};

export interface ResolvedGuidance {
  readonly title: string;
  readonly action: string;
}

/**
 * Resolve localized error guidance for a given error.
 *
 * Lookup order:
 * 1. App error code (e.g. "CHANNEL_AUTH_FAILED")
 * 2. JSON-RPC numeric code fallback (e.g. -32004)
 * 3. Generic fallback
 */
export function resolveErrorGuidance(
  language: AppLanguage,
  code: string,
  jsonrpcCode?: number,
): ResolvedGuidance {
  // Try app code first
  const byCode = APP_CODE_GUIDANCE[code];
  if (byCode) {
    return { title: byCode.title[language], action: byCode.action[language] };
  }

  // Try JSON-RPC code
  if (jsonrpcCode !== undefined) {
    const byRpc = JSONRPC_CODE_GUIDANCE[jsonrpcCode];
    if (byRpc) {
      return { title: byRpc.title[language], action: byRpc.action[language] };
    }
  }

  // Generic fallback
  const fallback = APP_CODE_GUIDANCE["INTERNAL_ERROR"];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { title: fallback!.title[language], action: fallback!.action[language] };
}
