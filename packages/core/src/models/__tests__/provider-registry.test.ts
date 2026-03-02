import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  DefaultProviderRegistry,
  ProviderRegistryError,
  listDefaultProviderPresets,
} from "../provider-registry.js";
import type {
  ChatChunk,
  ChatRequest,
  Credentials,
  ModelProvider,
  ProviderHealth,
  QuotaStatus,
} from "../../types/model-config.js";

describe("provider registry", () => {
  it("provides default presets and returns cloned copies", () => {
    const presetIds = listDefaultProviderPresets().map((preset) => preset.id);
    assert.ok(presetIds.includes("deepseek"));
    assert.ok(presetIds.includes("bailian"));
    assert.ok(presetIds.includes("zhipu"));

    const registry = new DefaultProviderRegistry({ locale: "en" });
    const firstRead = registry.listPresets();
    assert.ok(firstRead.length > 0);
    firstRead[0]!.models[0]!.name = "mutated-model-name";

    const secondRead = registry.listPresets();
    assert.notEqual(secondRead[0]!.models[0]!.name, "mutated-model-name");
  });

  it("normalizes provider id on register and get", () => {
    const registry = new DefaultProviderRegistry({ locale: "en" });
    const provider = createMockProvider(" DeepSeek ");

    registry.register(provider);

    assert.equal(registry.get("deepseek"), provider);
    assert.equal(registry.get(" DEEPSEEK "), provider);
    assert.equal(registry.listAll().length, 1);
  });

  it("throws DUPLICATE_PROVIDER_ID when overwrite is disabled", () => {
    const registry = new DefaultProviderRegistry({
      locale: "en",
      allowProviderOverwrite: false,
    });
    registry.register(createMockProvider("deepseek"));

    assert.throws(
      () => {
        registry.register(createMockProvider("DeepSeek"));
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof ProviderRegistryError);
        assert.equal(error.code, "DUPLICATE_PROVIDER_ID");
        return true;
      },
    );
  });

  it("throws INVALID_PROVIDER_ID for blank provider ids", () => {
    const registry = new DefaultProviderRegistry({ locale: "en" });

    assert.throws(
      () => {
        registry.register(createMockProvider("   "));
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof ProviderRegistryError);
        assert.equal(error.code, "INVALID_PROVIDER_ID");
        return true;
      },
    );
  });
});

function createMockProvider(id: string): ModelProvider {
  return {
    id,
    name: id.trim() || "mock",
    type: "api_key",
    authenticate: async (_credentials: Credentials): Promise<{ success: boolean }> => ({
      success: true,
    }),
    listModels: () => [{ id: "mock-model", name: "Mock Model" }],
    chat: async function* (_request: ChatRequest): AsyncIterable<ChatChunk> {
      yield {
        delta: "ok",
        done: true,
      };
    },
    getQuota: async (): Promise<QuotaStatus> => ({
      type: "unknown",
      used: 0,
      limit: null,
      resetAt: null,
      estimatedCostYuan: 0,
      warningThreshold: 80,
      exhausted: false,
    }),
    getHealth: async (): Promise<ProviderHealth> => ({
      status: "ok",
      latencyMs: 1,
      checkedAt: new Date(0),
    }),
  };
}
