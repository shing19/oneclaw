/**
 * IPC contracts for `model.*` namespace.
 *
 * Maps to ProviderRegistry, FallbackOrchestrator, and related
 * model management operations in @oneclaw/core.
 */

// ── Serializable types ─────────────────────────────────────────────

export interface IpcModelInfo {
  readonly id: string;
  readonly name: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
}

export interface IpcPresetProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly models: IpcModelInfo[];
  readonly signupUrl: string;
  readonly pricingRef: string;
  readonly setupGuide: string;
}

export interface IpcProviderHealth {
  readonly status: "ok" | "degraded" | "unreachable";
  readonly latencyMs: number;
  /** ISO 8601 timestamp. */
  readonly checkedAt: string;
  readonly message?: string;
}

export interface IpcQuotaStatus {
  readonly type: "token_based" | "request_based" | "unlimited" | "unknown";
  readonly used: number;
  readonly limit: number | null;
  /** ISO 8601 timestamp, or null if no reset date. */
  readonly resetAt: string | null;
  readonly estimatedCostYuan: number;
  readonly warningThreshold: number;
  readonly exhausted: boolean;
}

export interface IpcProviderSummary {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly health: IpcProviderHealth;
  readonly quota: IpcQuotaStatus;
  readonly models: IpcModelInfo[];
}

// ── Request params ─────────────────────────────────────────────────

/** `model.list` — list all registered providers with health and quota. */
export type ModelListParams = Record<string, never>;

/** `model.listPresets` — list all preset (built-in) providers. */
export type ModelListPresetsParams = Record<string, never>;

/** `model.setFallbackChain` — reorder the fallback chain. */
export interface ModelSetFallbackChainParams {
  readonly chain: string[];
}

/** `model.testProvider` — test connectivity to a specific provider. */
export interface ModelTestProviderParams {
  readonly providerId: string;
}

/** `model.getQuota` — get quota status for a specific provider. */
export interface ModelGetQuotaParams {
  readonly providerId: string;
}

// ── Response results ───────────────────────────────────────────────

/** `model.list` result. */
export interface ModelListResult {
  readonly providers: IpcProviderSummary[];
  readonly fallbackChain: string[];
  readonly defaultModel: string;
}

/** `model.listPresets` result. */
export interface ModelListPresetsResult {
  readonly presets: IpcPresetProvider[];
}

/** `model.setFallbackChain` result. */
export interface ModelSetFallbackChainResult {
  readonly ok: true;
  readonly chain: string[];
}

/** `model.testProvider` result. */
export interface ModelTestProviderResult {
  readonly providerId: string;
  readonly health: IpcProviderHealth;
}

/** `model.getQuota` result. */
export interface ModelGetQuotaResult {
  readonly providerId: string;
  readonly quota: IpcQuotaStatus;
}
