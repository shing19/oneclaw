/**
 * Sidecar handlers for `config.*` read operations.
 *
 * config.get      — read the full configuration
 * config.validate — validate current config without saving
 */

import { validateConfig, type OneclawConfig } from "@oneclaw/core";
import type { SidecarContext } from "../context.js";

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
