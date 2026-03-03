import assert from "node:assert/strict";
import { createServer } from "node:net";

import { describe, it } from "vitest";

import {
  FeishuAdapter,
  FeishuAdapterError,
  type FeishuChannelConfig,
} from "../feishu-adapter.js";

interface RecordedFetchCall {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
}

function createBaseConfig(
  overrides: Partial<FeishuChannelConfig> = {},
): FeishuChannelConfig {
  return {
    channel: "feishu",
    enabled: true,
    appId: "cli-test",
    appSecretRef: "oneclaw/channel/feishu/app-secret",
    webhookUrl: "https://example.com/feishu-webhook",
    eventSubscription: {
      enabled: false,
    },
    ...overrides,
  };
}

function resolveRequestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function decodeRequestBody(init: Parameters<typeof fetch>[1]): string {
  const body = init?.body;
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }

  return "";
}

function parseRecord(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

function readNestedString(
  input: Record<string, unknown>,
  path: readonly string[],
): string | undefined {
  let current: unknown = input;

  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current === "string") {
    return current;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(20);
  }
  throw new Error(`Condition not met within ${String(timeoutMs)}ms.`);
}

async function allocateTcpPort(): Promise<number> {
  const server = createServer();

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });

    const address = server.address();
    if (
      address === null ||
      typeof address === "string" ||
      !Number.isInteger(address.port)
    ) {
      throw new Error("Unable to resolve allocated test port.");
    }

    return address.port;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

describe("feishu adapter", () => {
  it("sends message through webhook with mocked fetch", async () => {
    const calls: RecordedFetchCall[] = [];
    const fetchImpl: typeof fetch = async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            message_id: "msg-001",
          },
        }),
        { status: 200 },
      );
    };

    const adapter = new FeishuAdapter({
      locale: "en",
      fetchImpl,
      now: () => new Date("2026-03-03T08:00:00.000Z"),
      messageIdFactory: () => "generated-message-id",
    });

    try {
      await adapter.connect(createBaseConfig());

      const result = await adapter.sendMessage({
        text: "hello feishu",
        format: "plain",
      });

      assert.equal(result.success, true);
      assert.equal(result.messageId, "msg-001");
      assert.equal(adapter.getStatus(), "connected");
      assert.equal(calls.length, 1);
      assert.equal(
        resolveRequestUrl(calls[0]!.input),
        "https://example.com/feishu-webhook",
      );

      const payload = parseRecord(decodeRequestBody(calls[0]!.init));
      assert.equal(payload.msg_type, "text");
      assert.equal(readNestedString(payload, ["content", "text"]), "hello feishu");
    } finally {
      await adapter.disconnect();
    }
  });

  it("adds webhook signature when token is configured", async () => {
    const calls: RecordedFetchCall[] = [];
    const fetchImpl: typeof fetch = async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ code: 0 }), { status: 200 });
    };

    const adapter = new FeishuAdapter({
      locale: "en",
      fetchImpl,
      resolveSecret: async (secretRef: string): Promise<string | null> => {
        if (secretRef === "oneclaw/channel/feishu/app-secret") {
          return "app-secret-value";
        }
        if (secretRef === "oneclaw/channel/feishu/webhook-token") {
          return "token-secret";
        }
        return null;
      },
      messageIdFactory: () => "message-2",
    });

    try {
      await adapter.connect(
        createBaseConfig({
          webhookTokenRef: "oneclaw/channel/feishu/webhook-token",
        }),
      );

      const result = await adapter.sendMessage({
        text: "signed message",
        format: "plain",
      });

      assert.equal(result.success, true);
      assert.equal(calls.length, 1);
      const payload = parseRecord(decodeRequestBody(calls[0]!.init));

      assert.equal(typeof payload.timestamp, "string");
      assert.equal(typeof payload.sign, "string");
      assert.ok((payload.sign as string).length > 10);
    } finally {
      await adapter.disconnect();
    }
  });

  it("returns send failure and switches status to error when webhook rejects request", async () => {
    const fetchImpl: typeof fetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          code: 91_001,
          msg: "invalid webhook token",
        }),
        { status: 200 },
      );

    const adapter = new FeishuAdapter({
      locale: "en",
      fetchImpl,
    });

    try {
      await adapter.connect(createBaseConfig());

      const result = await adapter.sendMessage({
        text: "should fail",
        format: "plain",
      });

      assert.equal(result.success, false);
      assert.equal(result.error?.code, "CHANNEL_SEND_FAILED");
      assert.equal(adapter.getStatus(), "error");
    } finally {
      await adapter.disconnect();
    }
  });

  it("returns not-connected result when sendMessage is called before connect", async () => {
    const adapter = new FeishuAdapter({
      locale: "en",
    });

    const result = await adapter.sendMessage({
      text: "not connected",
      format: "plain",
    });

    assert.equal(result.success, false);
    assert.equal(result.error?.code, "CHANNEL_NOT_CONNECTED");
    assert.equal(adapter.getStatus(), "disconnected");
  });

  it("throws when no transport is enabled", async () => {
    const adapter = new FeishuAdapter({
      locale: "en",
    });

    await assert.rejects(
      async () => {
        await adapter.connect(
          createBaseConfig({
            webhookUrl: undefined,
            eventSubscription: {
              enabled: false,
            },
          }),
        );
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof FeishuAdapterError);
        assert.equal(error.code, "CHANNEL_NOT_CONNECTED");
        return true;
      },
    );
  });

  it("receives event-subscription messages and notifies listeners", async () => {
    const port = await allocateTcpPort();
    const adapter = new FeishuAdapter({
      locale: "en",
    });

    let receivedText: string | null = null;
    const listener = adapter.onMessage((message) => {
      receivedText = message.text;
    });

    try {
      await adapter.connect(
        createBaseConfig({
          webhookUrl: undefined,
          eventSubscription: {
            enabled: true,
            host: "127.0.0.1",
            port,
            path: "/events",
            verificationToken: "verify-token",
          },
        }),
      );

      const response = await fetch(`http://127.0.0.1:${String(port)}/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          schema: "2.0",
          header: {
            event_type: "im.message.receive_v1",
            token: "verify-token",
          },
          event: {
            message: {
              message_type: "text",
              content: JSON.stringify({ text: "hello inbound" }),
              create_time: "1700000000",
              message_id: "om_001",
              chat_id: "oc_001",
            },
            sender: {
              sender_id: {
                open_id: "ou_001",
              },
            },
          },
        }),
      });

      assert.equal(response.status, 200);
      const responsePayload = (await response.json()) as { code?: unknown };
      assert.equal(responsePayload.code, 0);

      await waitForCondition(() => receivedText !== null, 2000);
      assert.equal(receivedText, "hello inbound");
      assert.equal(adapter.getStatus(), "connected");
    } finally {
      listener.dispose();
      await adapter.disconnect();
    }
  });
});
