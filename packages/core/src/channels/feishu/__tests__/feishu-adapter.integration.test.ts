import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createTcpServer } from "node:net";

import { describe, it } from "vitest";

import {
  FeishuAdapter,
  type FeishuChannelConfig,
} from "../feishu-adapter.js";
import type { InboundMessage } from "../../channel-interface.js";

function createBaseConfig(
  webhookUrl: string,
  eventPort: number,
): FeishuChannelConfig {
  return {
    channel: "feishu",
    enabled: true,
    appId: "integration-app",
    appSecretRef: "oneclaw/channel/feishu/app-secret",
    webhookUrl,
    eventSubscription: {
      enabled: true,
      host: "127.0.0.1",
      port: eventPort,
      path: "/events",
      verificationToken: "verify-token",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRequestText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonRecord(input: string): Record<string, unknown> {
  const parsed = JSON.parse(input) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Expected JSON object payload.");
  }
  return parsed;
}

async function allocateTcpPort(): Promise<number> {
  const server = createTcpServer();
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

async function closeServer(server: Server): Promise<void> {
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

function wait(ms: number): Promise<void> {
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
    await wait(20);
  }

  throw new Error(`Condition not met within ${String(timeoutMs)}ms.`);
}

function readNestedString(
  input: Record<string, unknown>,
  path: readonly string[],
): string | undefined {
  let current: unknown = input;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}

async function postInboundConfirmation(
  eventPort: number,
): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${String(eventPort)}/events`, {
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
          content: JSON.stringify({ text: "delivery confirmed" }),
          create_time: "1700000000",
          message_id: "om_integration_001",
          chat_id: "oc_integration_001",
        },
        sender: {
          sender_id: {
            open_id: "ou_integration_sender",
          },
        },
      },
    }),
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as unknown;
  assert.ok(isRecord(payload));
  assert.equal(payload.code, 0);
}

describe("feishu adapter integration", () => {
  it("sends test message and receives confirmation event", async () => {
    const eventPort = await allocateTcpPort();
    const webhookPort = await allocateTcpPort();
    const webhookPayloads: Record<string, unknown>[] = [];
    const callbackErrors: string[] = [];

    const webhookServer = createServer((request, response) => {
      void handleWebhookRequest({
        request,
        response,
        eventPort,
        webhookPayloads,
        callbackErrors,
      });
    });

    await new Promise<void>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(webhookPort, "127.0.0.1", () => {
        webhookServer.off("error", reject);
        resolve();
      });
    });

    const adapter = new FeishuAdapter({
      locale: "en",
      resolveSecret: async (secretRef: string): Promise<string | null> => {
        if (secretRef === "oneclaw/channel/feishu/app-secret") {
          return "integration-secret";
        }
        return null;
      },
    });

    let received: InboundMessage | null = null;
    const listener = adapter.onMessage((message) => {
      received = message;
    });

    try {
      await adapter.connect(
        createBaseConfig(
          `http://127.0.0.1:${String(webhookPort)}/webhook`,
          eventPort,
        ),
      );

      const sendResult = await adapter.sendMessage({
        text: "[OneClaw] integration test",
        format: "plain",
      });

      assert.equal(sendResult.success, true);
      assert.equal(sendResult.messageId, "webhook-message-id");
      assert.equal(webhookPayloads.length, 1);
      assert.equal(
        readNestedString(webhookPayloads[0] ?? {}, ["content", "text"]),
        "[OneClaw] integration test",
      );

      await waitForCondition(() => received !== null, 2_000);
      assert.equal(received?.text, "delivery confirmed");
      assert.equal(received?.channel, "feishu");
      assert.equal(adapter.getStatus(), "connected");
      assert.deepEqual(callbackErrors, []);
    } finally {
      listener.dispose();
      await adapter.disconnect();
      await closeServer(webhookServer);
    }
  });
});

async function handleWebhookRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  eventPort: number;
  webhookPayloads: Record<string, unknown>[];
  callbackErrors: string[];
}): Promise<void> {
  const {
    request,
    response,
    eventPort,
    webhookPayloads,
    callbackErrors,
  } = input;

  if (request.method !== "POST" || request.url !== "/webhook") {
    response.statusCode = 404;
    response.end(
      JSON.stringify({
        code: 404,
        msg: "not_found",
      }),
    );
    return;
  }

  try {
    const payload = parseJsonRecord(await readRequestText(request));
    webhookPayloads.push(payload);
    await postInboundConfirmation(eventPort);

    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        code: 0,
        data: {
          message_id: "webhook-message-id",
        },
      }),
    );
  } catch (error: unknown) {
    callbackErrors.push(
      error instanceof Error ? error.message : String(error),
    );

    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        code: 500,
        msg: "internal_error",
      }),
    );
  }
}
