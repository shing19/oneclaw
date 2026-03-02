import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  resolveProviderApiKeyEnvVarName,
  translateAgentConfigToOpenClawConfig,
} from "../config-translator.js";
import type { AgentConfig } from "../../types/agent-adapter.js";

describe("config translator", () => {
  it("translates agent config into openclaw config with enabled-only providers", () => {
    const sourceConfig = createAgentConfig();

    const translated = translateAgentConfigToOpenClawConfig(sourceConfig);

    assert.equal(translated.agents.defaults.model, "deepseek/deepseek-chat");
    assert.equal(translated.agents.defaults.models.length, 2);
    assert.deepEqual(
      translated.agents.defaults.models.map((provider) => provider.provider),
      ["deepseek", "zhipu"],
    );
    assert.deepEqual(translated.agents.defaults.models[0]?.models, [
      "deepseek-chat",
      "deepseek-reasoner",
    ]);

    assert.equal(translated.agents.defaults.maxConcurrent, 4);
    assert.equal(translated.agents.defaults.subagents.maxConcurrent, 8);
    assert.equal(translated.agents.defaults.subagents.maxSpawnDepth, 2);
    assert.equal(translated.agents.defaults.subagents.maxChildrenPerAgent, 5);
    assert.equal(translated.agents.defaults.timeoutSeconds, 45);

    assert.equal(translated.skills.length, 2);
    assert.deepEqual(
      translated.skills.map((skill) => skill.id),
      ["search", "planner"],
    );
    assert.deepEqual(translated.skills[1]?.options, {});

    assert.equal(translated.workspace.length, 2);
    assert.equal(translated.workspace[0]?.hostPath, "/workspace/repo");
    assert.equal(translated.workspace[0]?.readonly, false);
    assert.equal(translated.workspace[1]?.readonly, true);
  });

  it("deep-clones skill options to avoid source mutation through translated config", () => {
    const sourceConfig = createAgentConfig();
    const translated = translateAgentConfigToOpenClawConfig(sourceConfig);

    const translatedOptions = translated.skills[0]?.options;
    assert.ok(translatedOptions);
    translatedOptions.nested = {
      changed: true,
    };

    const sourceOptions = sourceConfig.skills[0]?.options;
    assert.ok(sourceOptions);
    assert.deepEqual(sourceOptions, {
      provider: "builtin",
      nested: { mode: "fast" },
    });
  });

  it("resolves provider api-key env var names for known and custom providers", () => {
    assert.equal(resolveProviderApiKeyEnvVarName("deepseek"), "DEEPSEEK_API_KEY");
    assert.equal(resolveProviderApiKeyEnvVarName("  bailian  "), "BAILIAN_API_KEY");
    assert.equal(resolveProviderApiKeyEnvVarName("ZHIPU"), "ZHIPU_API_KEY");
    assert.equal(
      resolveProviderApiKeyEnvVarName("my-provider.v2"),
      "MY_PROVIDER_V2_API_KEY",
    );
    assert.equal(resolveProviderApiKeyEnvVarName("   "), "PROVIDER_API_KEY");
  });
});

function createAgentConfig(): AgentConfig {
  return {
    modelConfig: {
      providers: [
        {
          id: "deepseek",
          enabled: true,
          credentialRef: "oneclaw/provider/deepseek/key-1",
          baseUrl: "https://api.deepseek.com/v1",
          protocol: "openai-responses",
          models: ["deepseek-chat", "deepseek-reasoner"],
        },
        {
          id: "bailian",
          enabled: false,
          credentialRef: "oneclaw/provider/bailian/key-1",
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          protocol: "openai-completions",
          models: ["qwen-max"],
        },
        {
          id: "zhipu",
          enabled: true,
          credentialRef: "oneclaw/provider/zhipu/key-1",
          baseUrl: "https://open.bigmodel.cn/api/paas/v4",
          protocol: "openai-completions",
          models: ["glm-4-flash"],
        },
      ],
      fallbackChain: ["deepseek", "zhipu"],
      defaultModel: "deepseek/deepseek-chat",
      perModelSettings: {},
    },
    concurrency: {
      maxConcurrent: 4,
      subagents: {
        maxConcurrent: 8,
        maxSpawnDepth: 2,
        maxChildrenPerAgent: 5,
      },
    },
    skills: [
      {
        id: "search",
        enabled: true,
        options: {
          provider: "builtin",
          nested: {
            mode: "fast",
          },
        },
      },
      {
        id: "planner",
        enabled: true,
      },
      {
        id: "disabled",
        enabled: false,
        options: {
          shouldBeDropped: true,
        },
      },
    ],
    workspacePaths: [
      {
        hostPath: "/workspace/repo",
        containerPath: "/repo",
        readonly: false,
      },
      {
        hostPath: "/workspace/readonly",
        containerPath: "/readonly",
        readonly: true,
      },
    ],
    timeoutSeconds: 45,
  };
}
