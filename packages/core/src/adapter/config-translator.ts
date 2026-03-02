import type { AgentConfig } from "../types/agent-adapter.js";

export interface OpenClawConfigFile {
  agents: {
    defaults: OpenClawAgentDefaults;
  };
  skills: OpenClawSkillConfig[];
  workspace: OpenClawWorkspaceMount[];
}

export interface OpenClawAgentDefaults {
  model: string;
  models: OpenClawProviderModelConfig[];
  maxConcurrent: number;
  subagents: {
    maxConcurrent: number;
    maxSpawnDepth: number;
    maxChildrenPerAgent: number;
  };
  timeoutSeconds: number;
}

export interface OpenClawProviderModelConfig {
  provider: string;
  baseUrl: string;
  protocol: string;
  models: string[];
}

export interface OpenClawSkillConfig {
  id: string;
  options: Record<string, unknown>;
}

export interface OpenClawWorkspaceMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

export function translateAgentConfigToOpenClawConfig(
  config: AgentConfig,
): OpenClawConfigFile {
  const enabledProviders = config.modelConfig.providers.filter(
    (provider) => provider.enabled,
  );

  return {
    agents: {
      defaults: {
        model: config.modelConfig.defaultModel,
        models: enabledProviders.map((provider) => ({
          provider: provider.id,
          baseUrl: provider.baseUrl,
          protocol: provider.protocol,
          models: [...provider.models],
        })),
        maxConcurrent: config.concurrency.maxConcurrent,
        subagents: {
          maxConcurrent: config.concurrency.subagents.maxConcurrent,
          maxSpawnDepth: config.concurrency.subagents.maxSpawnDepth,
          maxChildrenPerAgent: config.concurrency.subagents.maxChildrenPerAgent,
        },
        timeoutSeconds: config.timeoutSeconds,
      },
    },
    skills: config.skills
      .filter((skill) => skill.enabled)
      .map((skill) => ({
        id: skill.id,
        options: cloneJsonRecord(skill.options ?? {}),
      })),
    workspace: config.workspacePaths.map((mountPoint) => ({
      hostPath: mountPoint.hostPath,
      containerPath: mountPoint.containerPath,
      readonly: mountPoint.readonly,
    })),
  };
}

export function resolveProviderApiKeyEnvVarName(providerId: string): string {
  const normalizedId = providerId.trim().toLowerCase();
  if (normalizedId === "deepseek") {
    return "DEEPSEEK_API_KEY";
  }
  if (normalizedId === "bailian") {
    return "BAILIAN_API_KEY";
  }
  if (normalizedId === "zhipu") {
    return "ZHIPU_API_KEY";
  }

  const sanitized = normalizedId
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const prefix = sanitized.length > 0 ? sanitized.toUpperCase() : "PROVIDER";
  return `${prefix}_API_KEY`;
}

function cloneJsonRecord<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
