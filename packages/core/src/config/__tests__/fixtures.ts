import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OneclawConfigPaths } from "../paths.js";
import type { OneclawConfig } from "../validator.js";

export interface TempConfigContext {
  paths: OneclawConfigPaths;
  cleanup(): Promise<void>;
}

export async function createTempConfigContext(
  prefix = "oneclaw-config-test-",
): Promise<TempConfigContext> {
  const configDir = await mkdtemp(join(tmpdir(), prefix));
  const paths: OneclawConfigPaths = {
    configDir,
    configFilePath: join(configDir, "config.json"),
    backupsDir: join(configDir, "backups"),
    dataDir: join(configDir, "data"),
    secretsFilePath: join(configDir, "secrets.enc"),
  };

  return {
    paths,
    cleanup: async (): Promise<void> => {
      await rm(configDir, { recursive: true, force: true });
    },
  };
}

export function createValidConfig(version = 1): OneclawConfig {
  return {
    version,
    general: {
      language: "zh-CN",
      theme: "system",
      workspace: "/tmp/oneclaw-workspace",
    },
    models: {
      providers: [
        {
          id: "deepseek",
          enabled: true,
          credentialRef: "oneclaw/provider/deepseek/api-key-1",
          baseUrl: "https://api.deepseek.com/v1",
          protocol: "openai-responses",
          models: ["deepseek-chat"],
        },
      ],
      fallbackChain: ["deepseek"],
      defaultModel: "deepseek/deepseek-chat",
      perModelSettings: {
        "deepseek/deepseek-chat": {
          temperature: 0.7,
          maxTokens: 1024,
          streaming: true,
        },
      },
    },
    channels: {
      feishu: {
        appId: "app-123",
        appSecretRef: "oneclaw/channel/feishu/app-secret",
        enabled: true,
      },
    },
    agent: {
      concurrency: {
        maxConcurrent: 2,
        subagents: {
          maxConcurrent: 2,
          maxSpawnDepth: 2,
          maxChildrenPerAgent: 3,
        },
      },
      skills: [
        {
          id: "search",
          enabled: true,
          options: {
            provider: "builtin",
          },
        },
      ],
      mountPoints: [
        {
          hostPath: "/tmp",
          containerPath: "/workspace",
          readonly: false,
        },
      ],
      timeoutSeconds: 30,
    },
    automation: {
      tasks: [
        {
          id: "daily-report",
          enabled: true,
        },
      ],
    },
    quotas: {
      warningThreshold: 80,
    },
  };
}
