/**
 * Sidecar handlers for `model.*` read operations.
 *
 * model.list        — list all registered providers with health and quota
 * model.listPresets — list preset (built-in) providers
 * model.getQuota    — get quota status for a specific provider
 */

import { listDefaultProviderPresets } from "@oneclaw/core";
import type { SidecarContext } from "../context.js";

export interface IpcModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface IpcPresetProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: IpcModelInfo[];
  signupUrl: string;
  pricingRef: string;
  setupGuide: string;
}

export interface IpcQuotaStatus {
  type: "token_based" | "request_based" | "unlimited" | "unknown";
  used: number;
  limit: number | null;
  resetAt: string | null;
  estimatedCostYuan: number;
  warningThreshold: number;
  exhausted: boolean;
}

export interface IpcProviderSummary {
  id: string;
  name: string;
  enabled: boolean;
  health: {
    status: "ok" | "degraded" | "unreachable";
    latencyMs: number;
    checkedAt: string;
    message?: string;
  };
  quota: IpcQuotaStatus;
  models: IpcModelInfo[];
}

export interface ModelListResult {
  providers: IpcProviderSummary[];
  fallbackChain: string[];
  defaultModel: string;
}

export async function handleModelList(
  ctx: SidecarContext,
): Promise<ModelListResult> {
  try {
    const config = await ctx.loadConfig();
    const registry = ctx.getProviderRegistry();
    const quotaTracker = ctx.getQuotaTracker();

    const providers: IpcProviderSummary[] = config.models.providers.map(
      (p) => {
        const registeredProvider = registry.get(p.id);
        const quota = quotaTracker.getStatus(p.id);

        return {
          id: p.id,
          name: registeredProvider?.name ?? p.id,
          enabled: p.enabled,
          health: {
            status: "unreachable" as const,
            latencyMs: 0,
            checkedAt: new Date().toISOString(),
            message:
              ctx.locale === "zh-CN" ? "未检查" : "Not checked",
          },
          quota: {
            type: quota.type,
            used: quota.used,
            limit: quota.limit,
            resetAt: quota.resetAt?.toISOString() ?? null,
            estimatedCostYuan: quota.estimatedCostYuan,
            warningThreshold: quota.warningThreshold,
            exhausted: quota.exhausted,
          },
          models: p.models.map((modelId) => ({ id: modelId, name: modelId })),
        };
      },
    );

    return {
      providers,
      fallbackChain: config.models.fallbackChain,
      defaultModel: config.models.defaultModel,
    };
  } catch {
    return {
      providers: [],
      fallbackChain: [],
      defaultModel: "",
    };
  }
}

export function handleModelListPresets(): {
  presets: IpcPresetProvider[];
} {
  const presets = listDefaultProviderPresets();
  return {
    presets: presets.map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      models: p.models.map((m) => ({
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
      })),
      signupUrl: p.signupUrl,
      pricingRef: p.pricingRef,
      setupGuide: p.setupGuide,
    })),
  };
}

export function handleModelGetQuota(
  ctx: SidecarContext,
  params: { providerId: string },
): { providerId: string; quota: IpcQuotaStatus } {
  const quotaTracker = ctx.getQuotaTracker();
  const quota = quotaTracker.getStatus(params.providerId);

  return {
    providerId: params.providerId,
    quota: {
      type: quota.type,
      used: quota.used,
      limit: quota.limit,
      resetAt: quota.resetAt?.toISOString() ?? null,
      estimatedCostYuan: quota.estimatedCostYuan,
      warningThreshold: quota.warningThreshold,
      exhausted: quota.exhausted,
    },
  };
}
