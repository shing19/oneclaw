/**
 * IPC contracts for `config.*` namespace.
 *
 * Maps to ConfigManager operations in @oneclaw/core.
 */

export type AppLanguage = "zh-CN" | "en";
export type AppTheme = "light" | "dark" | "system";

/** Serializable subset of OneclawConfig exposed to the GUI. */
export interface IpcOneclawConfig {
  readonly version: number;
  readonly general: {
    readonly language: AppLanguage;
    readonly theme: AppTheme;
    readonly workspace: string;
  };
  readonly models: IpcModelConfigSection;
  readonly channels: IpcChannelsSection;
  readonly agent: IpcAgentSection;
  readonly quotas: IpcQuotaLimits;
}

export interface IpcModelConfigSection {
  readonly providers: IpcProviderConfig[];
  readonly fallbackChain: string[];
  readonly defaultModel: string;
  readonly perModelSettings: Record<string, IpcModelSettings>;
}

export interface IpcProviderConfig {
  readonly id: string;
  readonly enabled: boolean;
  readonly credentialRef: string;
  readonly baseUrl: string;
  readonly protocol: "openai-completions" | "openai-responses" | "anthropic-messages" | "ollama";
  readonly models: string[];
}

export interface IpcModelSettings {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "adaptive";
  readonly timeout?: number;
  readonly transport?: "sse" | "websocket" | "auto";
  readonly streaming?: boolean;
  readonly cacheRetention?: "none" | "short" | "long";
}

export interface IpcChannelsSection {
  readonly feishu?: IpcFeishuConfig;
  readonly dingtalk?: { readonly enabled?: boolean };
  readonly wechatWork?: { readonly enabled?: boolean };
}

export interface IpcFeishuConfig {
  readonly appId: string;
  readonly appSecretRef: string;
  readonly webhookUrl?: string;
  readonly webhookTokenRef?: string;
  readonly enabled?: boolean;
}

export interface IpcAgentSection {
  readonly concurrency: {
    readonly maxConcurrent: number;
    readonly subagents: {
      readonly maxConcurrent: number;
      readonly maxSpawnDepth: number;
      readonly maxChildrenPerAgent: number;
    };
  };
  readonly skills: ReadonlyArray<{
    readonly id: string;
    readonly enabled: boolean;
    readonly options?: Record<string, unknown>;
  }>;
  readonly mountPoints: ReadonlyArray<{
    readonly hostPath: string;
    readonly containerPath: string;
    readonly readonly: boolean;
  }>;
  readonly timeoutSeconds: number;
}

export interface IpcQuotaLimits {
  readonly dailyLimit?: number;
  readonly weeklyLimit?: number;
  readonly monthlyLimit?: number;
  readonly warningThreshold: number;
}

// ── Request params ─────────────────────────────────────────────────

/** `config.get` — read the full configuration. */
export type ConfigGetParams = Record<string, never>;

/**
 * `config.update` — apply a partial config update (deep merge).
 * Only include fields to change; omitted fields are preserved.
 */
export interface ConfigUpdateParams {
  readonly patch: Partial<IpcOneclawConfig>;
}

/** `config.reset` — reset configuration to defaults. */
export type ConfigResetParams = Record<string, never>;

/** `config.validate` — validate current config without saving. */
export type ConfigValidateParams = Record<string, never>;

// ── Response results ───────────────────────────────────────────────

/** `config.get` result. */
export type ConfigGetResult = IpcOneclawConfig;

/** `config.update` result. */
export interface ConfigUpdateResult {
  readonly ok: true;
  readonly config: IpcOneclawConfig;
}

/** `config.reset` result. */
export interface ConfigResetResult {
  readonly ok: true;
  readonly config: IpcOneclawConfig;
}

/** Single validation issue. */
export interface IpcValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly suggestion: string;
}

/** `config.validate` result. */
export interface ConfigValidateResult {
  readonly valid: boolean;
  readonly issues: IpcValidationIssue[];
}
