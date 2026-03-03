import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { DefaultFallbackOrchestrator } from "../fallback-orchestrator.js";
import { KeyRotator } from "../key-rotator.js";
import type {
  ChatChunk,
  ChatRequest,
  Credentials,
  FallbackEvent,
  ModelInfo,
  ModelProvider,
  ProviderHealth,
  QuotaStatus,
} from "../../types/model-config.js";

interface TestClock {
  nowMs(): number;
  nowDate(): Date;
  advanceMs(deltaMs: number): void;
}

describe("model management integration", () => {
  it("handles 429 with key rotation, fallback, and probe recovery", async () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    const keyRotator = new KeyRotator({
      providerId: "deepseek",
      apiKeys: ["deepseek-key-1", "deepseek-key-2"],
      cooldownMs: 60_000,
      locale: "en",
      now: () => clock.nowMs(),
    });

    const deepseekState = {
      chatCalls: 0,
      hasRecovered: false,
      usedKeys: [] as string[],
      rotationResults: [] as { rotated: boolean; currentKey: string }[],
    };
    let fallbackCalls = 0;
    const fallbackEvents: FallbackEvent[] = [];

    const deepseek = createProvider({
      id: "deepseek",
      models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
      chat: () =>
        (async function* (): AsyncIterable<ChatChunk> {
          deepseekState.chatCalls += 1;
          const currentKey = keyRotator.getCurrentKey();
          deepseekState.usedKeys.push(currentKey);

          if (!deepseekState.hasRecovered) {
            const result = keyRotator.handleError({ status: 429 });
            deepseekState.rotationResults.push({
              rotated: result.rotated,
              currentKey: result.currentKey,
            });
            throw new Error(JSON.stringify({ status: 429, message: "rate limit" }));
          }

          yield {
            delta: `deepseek-recovered:${currentKey}`,
            done: true,
          };
        })(),
    });

    const bailian = createProvider({
      id: "bailian",
      models: [{ id: "qwen-plus", name: "Qwen Plus" }],
      chat: () =>
        (async function* (): AsyncIterable<ChatChunk> {
          fallbackCalls += 1;
          yield { delta: `fallback-${fallbackCalls}`, done: true };
        })(),
    });

    const orchestrator = new DefaultFallbackOrchestrator({
      fallbackChain: ["deepseek", "bailian"],
      providers: [deepseek, bailian],
      now: () => clock.nowDate(),
      rateLimitProbeIntervalMs: 30_000,
    });
    orchestrator.onFallback((event: FallbackEvent) => {
      fallbackEvents.push(event);
    });

    const firstExecutionChunks = await collectChunks(
      orchestrator.execute(createRequest("deepseek/deepseek-chat")),
    );
    assert.equal(firstExecutionChunks[0]!.delta, "fallback-1");
    assert.equal(fallbackCalls, 1);
    assert.equal(deepseekState.chatCalls, 1);
    assert.equal(deepseekState.usedKeys[0], "deepseek-key-1");
    assert.equal(keyRotator.getCurrentKey(), "deepseek-key-2");
    assert.equal(deepseekState.rotationResults[0]?.rotated, true);
    assert.equal(deepseekState.rotationResults[0]?.currentKey, "deepseek-key-2");
    assert.equal(fallbackEvents.length, 1);
    assert.equal(fallbackEvents[0]!.from, "deepseek");
    assert.equal(fallbackEvents[0]!.to, "bailian");
    assert.equal(fallbackEvents[0]!.reason, "rate_limit");

    const secondExecutionChunks = await collectChunks(
      orchestrator.execute(createRequest("deepseek/deepseek-chat")),
    );
    assert.equal(secondExecutionChunks[0]!.delta, "fallback-2");
    assert.equal(fallbackCalls, 2);
    assert.equal(
      deepseekState.chatCalls,
      1,
      "deepseek should stay in cooldown before probe window",
    );
    assert.equal(fallbackEvents.length, 1);

    clock.advanceMs(30_001);
    deepseekState.hasRecovered = true;

    const thirdExecutionChunks = await collectChunks(
      orchestrator.execute(createRequest("deepseek/deepseek-chat")),
    );
    assert.equal(thirdExecutionChunks[0]!.delta, "deepseek-recovered:deepseek-key-2");
    assert.equal(deepseekState.chatCalls, 2);
    assert.deepEqual(deepseekState.usedKeys, ["deepseek-key-1", "deepseek-key-2"]);
    assert.equal(fallbackCalls, 2);
    assert.equal(fallbackEvents.length, 1);
  });
});

function createProvider(options: {
  id: string;
  models: readonly ModelInfo[];
  chat: (request: ChatRequest) => AsyncIterable<ChatChunk>;
}): ModelProvider {
  return {
    id: options.id,
    name: options.id,
    type: "api_key",
    authenticate: async (_credentials: Credentials): Promise<{ success: boolean }> => ({
      success: true,
    }),
    listModels: (): ModelInfo[] => [...options.models],
    chat: options.chat,
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

function createRequest(model: string): ChatRequest {
  return {
    model,
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
    stream: true,
  };
}

function createTestClock(startMs: number): TestClock {
  let currentMs = startMs;

  return {
    nowMs: (): number => currentMs,
    nowDate: (): Date => new Date(currentMs),
    advanceMs: (deltaMs: number): void => {
      currentMs += deltaMs;
    },
  };
}

async function collectChunks(stream: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}
