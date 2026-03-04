/**
 * Sidecar handlers for `config.*` operations.
 *
 * Read:
 *   config.get      — read the full configuration
 *   config.validate — validate current config without saving
 *
 * Write:
 *   config.update   — apply a partial config update (deep merge + save)
 *   config.reset    — reset configuration to defaults and save
 */

import { validateConfig, type OneclawConfig } from "@oneclaw/core";
import type { SidecarContext } from "../context.js";
import { mapConfigError, SidecarHandlerError } from "./errors.js";

export interface IpcValidationIssue {
  path: string;
  code: string;
  message: string;
  suggestion: string;
}

export async function handleConfigGet(
  ctx: SidecarContext,
): Promise<OneclawConfig> {
  return ctx.loadConfig();
}

export async function handleConfigValidate(
  ctx: SidecarContext,
): Promise<{ valid: boolean; issues: IpcValidationIssue[] }> {
  try {
    const config = await ctx.loadConfig();
    const result = validateConfig(config, { locale: ctx.locale });

    if (result.ok) {
      return { valid: true, issues: [] };
    }

    const issues: IpcValidationIssue[] = result.issues.map((issue) => ({
      path: issue.path,
      code: issue.code,
      message: issue.message,
      suggestion: issue.suggestion ?? "",
    }));

    return { valid: false, issues };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Validation failed";
    return {
      valid: false,
      issues: [
        {
          path: "",
          code: "CONFIG_ERROR",
          message,
          suggestion:
            ctx.locale === "zh-CN"
              ? "请检查配置文件是否存在且格式正确。"
              : "Check that the config file exists and has valid JSON.",
        },
      ],
    };
  }
}

export async function handleConfigUpdate(
  ctx: SidecarContext,
  params: { patch: Partial<OneclawConfig> },
): Promise<{ ok: true; config: OneclawConfig }> {
  const configManager = ctx.getConfigManager();

  try {
    const current = await configManager.load();
    const merged = deepMerge(
      current as unknown as Record<string, unknown>,
      params.patch as unknown as Record<string, unknown>,
    );
    const saved = await configManager.save(merged);
    return { ok: true, config: saved };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapConfigError(error, ctx.locale));
  }
}

export async function handleConfigReset(
  ctx: SidecarContext,
): Promise<{ ok: true; config: OneclawConfig }> {
  const configManager = ctx.getConfigManager();

  const defaultConfig: OneclawConfig = {
    version: 1,
    general: {
      language: "zh-CN",
      theme: "system",
      workspace: "~/.oneclaw/workspace",
    },
    models: {
      providers: [],
      fallbackChain: [],
      defaultModel: "",
      perModelSettings: {},
    },
    channels: {},
    agent: {
      concurrency: {
        maxConcurrent: 1,
        subagents: {
          maxConcurrent: 2,
          maxSpawnDepth: 2,
          maxChildrenPerAgent: 3,
        },
      },
      skills: [],
      mountPoints: [],
      timeoutSeconds: 300,
    },
    automation: {
      tasks: [],
    },
    quotas: {
      warningThreshold: 0.8,
    },
  };

  try {
    const saved = await configManager.save(defaultConfig);
    return { ok: true, config: saved };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapConfigError(error, ctx.locale));
  }
}

/**
 * Deep merge two objects. Arrays are replaced, not merged.
 * Undefined values in source are skipped.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    if (sourceValue === undefined) {
      continue;
    }

    const targetValue = result[key];
    if (
      isPlainObject(targetValue) &&
      isPlainObject(sourceValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
