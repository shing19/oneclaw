import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  DefaultFallbackOrchestrator,
  FallbackOrchestratorError,
} from "../fallback-orchestrator.js";
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

describe("fallback orchestrator", () => {
  it("falls back on rate limit and emits event", async () => {
    const deepseek = createProvider({
      id: "deepseek",
      models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
      chat: () => streamThatThrows({ status: 429 }),
    });
    const bailian = createProvider({
      id: "bailian",
      models: [{ id: "qwen-plus", name: "Qwen Plus" }],
      chat: (_request: ChatRequest) =>
        streamFromChunks([{ delta: "fallback-ok", done: true }]),
    });

    const events: FallbackEvent[] = [];
    const orchestrator = new DefaultFallbackOrchestrator({
      fallbackChain: ["deepseek", "bailian"],
      providers: [deepseek, bailian],
      now: () => new Date(2026, 0, 1, 10, 0, 0, 0),
    });
    const subscription = orchestrator.onFallback((event: FallbackEvent) => {
      events.push(event);
    });

    const chunks = await collectChunks(
      orchestrator.execute(createRequest("deepseek/deepseek-chat")),
    );

    subscription.dispose();

    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.delta, "fallback-ok");
    assert.equal(events.length, 1);
    assert.equal(events[0]!.from, "deepseek");
    assert.equal(events[0]!.to, "bailian");
    assert.equal(events[0]!.reason, "rate_limit");
  });

  it("retries timeout once before falling back", async () => {
    let deepseekCalls = 0;

    const deepseek = createProvider({
      id: "deepseek",
      models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
      chat: () => {
        deepseekCalls += 1;
        return streamThatThrows(new Error("request timed out"));
      },
    });
    const zhipu = createProvider({
      id: "zhipu",
      models: [{ id: "glm-4.5", name: "GLM-4.5" }],
      chat: () => streamFromChunks([{ delta: "zhipu-ok", done: true }]),
    });

    const events: FallbackEvent[] = [];
    const orchestrator = new DefaultFallbackOrchestrator({
      fallbackChain: ["deepseek", "zhipu"],
      providers: [deepseek, zhipu],
      timeoutRetryLimit: 1,
    });
    orchestrator.onFallback((event: FallbackEvent) => {
      events.push(event);
    });

    const chunks = await collectChunks(
      orchestrator.execute(createRequest("deepseek/deepseek-chat")),
    );

    assert.equal(deepseekCalls, 2);
    assert.equal(chunks[0]!.delta, "zhipu-ok");
    assert.equal(events.length, 1);
    assert.equal(events[0]!.reason, "timeout");
  });

  it("does not fallback on abort errors", async () => {
    let fallbackCalls = 0;
    const abortError = new Error("request aborted by user");
    abortError.name = "AbortError";

    const deepseek = createProvider({
      id: "deepseek",
      models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
      chat: () => streamThatThrows(abortError),
    });
    const bailian = createProvider({
      id: "bailian",
      models: [{ id: "qwen-plus", name: "Qwen Plus" }],
      chat: () => {
        fallbackCalls += 1;
        return streamFromChunks([{ delta: "should-not-run", done: true }]);
      },
    });

    const orchestrator = new DefaultFallbackOrchestrator({
      fallbackChain: ["deepseek", "bailian"],
      providers: [deepseek, bailian],
    });

    await assert.rejects(
      async () => {
        await collectChunks(
          orchestrator.execute(createRequest("deepseek/deepseek-chat")),
        );
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof FallbackOrchestratorError);
        assert.equal(error.code, "EXECUTION_FAILED");
        assert.equal(error.attempts.length, 1);
        assert.equal(error.attempts[0]!.reason, "non_fallback");
        return true;
      },
    );

    assert.equal(fallbackCalls, 0);
  });

  it("throws PARTIAL_RESPONSE_FAILED without fallback after streamed output", async () => {
    let fallbackCalls = 0;

    const deepseek = createProvider({
      id: "deepseek",
      models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
      chat: () =>
        (async function* (): AsyncIterable<ChatChunk> {
          yield { delta: "partial", done: false };
          throw new Error("timeout after first chunk");
        })(),
    });
    const zhipu = createProvider({
      id: "zhipu",
      models: [{ id: "glm-4.5", name: "GLM-4.5" }],
      chat: () => {
        fallbackCalls += 1;
        return streamFromChunks([{ delta: "should-not-run", done: true }]);
      },
    });

    const orchestrator = new DefaultFallbackOrchestrator({
      fallbackChain: ["deepseek", "zhipu"],
      providers: [deepseek, zhipu],
    });

    await assert.rejects(
      async () => {
        await collectChunks(
          orchestrator.execute(createRequest("deepseek/deepseek-chat")),
        );
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof FallbackOrchestratorError);
        assert.equal(error.code, "PARTIAL_RESPONSE_FAILED");
        assert.equal(error.attempts.length, 1);
        assert.equal(error.attempts[0]!.reason, "non_fallback");
        return true;
      },
    );

    assert.equal(fallbackCalls, 0);
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

function streamFromChunks(chunks: readonly ChatChunk[]): AsyncIterable<ChatChunk> {
  return (async function* (): AsyncIterable<ChatChunk> {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

function streamThatThrows(error: unknown): AsyncIterable<ChatChunk> {
  return (async function* (): AsyncIterable<ChatChunk> {
    yield* []; // ensure valid generator before throwing
    throw error;
  })();
}

async function collectChunks(stream: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}
