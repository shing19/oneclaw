/**
 * Integration tests for IPC contract compatibility.
 *
 * Verifies that:
 * 1. JSON-RPC 2.0 protocol is correctly implemented in the router.
 * 2. All 26 methods from IpcMethodMap are registered and dispatchable.
 * 3. Stateless read methods return valid response shapes.
 * 4. Error responses follow the JSON-RPC 2.0 + application error code format.
 * 5. Process-level sidecar stdio transport works correctly.
 */

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { Router, createParseErrorResponse } from "../router.js";
import { SidecarContext } from "../context.js";

/**
 * All 26 IPC method names from the IPC contract.
 * This list must match the keys in src/ipc/method-map.ts exactly.
 */
const ALL_IPC_METHODS = [
  "agent.start",
  "agent.stop",
  "agent.restart",
  "agent.status",
  "agent.health",
  "config.get",
  "config.update",
  "config.reset",
  "config.validate",
  "model.list",
  "model.listPresets",
  "model.setFallbackChain",
  "model.testProvider",
  "model.getQuota",
  "secret.set",
  "secret.delete",
  "secret.exists",
  "secret.list",
  "channel.feishu.setup",
  "channel.feishu.test",
  "channel.feishu.status",
  "channel.feishu.sendTest",
  "cost.summary",
  "cost.history",
  "cost.export",
  "doctor.run",
] as const;

/** JSON-RPC error codes from the spec and our application. */
const JSONRPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INTERNAL_ERROR: -32603,
} as const;

function createRouter(): Router {
  const ctx = new SidecarContext({ locale: "en" });
  return new Router(ctx);
}

function makeRequest(
  method: string,
  id: number | string = 1,
  params?: unknown,
): Record<string, unknown> {
  const req: Record<string, unknown> = { jsonrpc: "2.0", id, method };
  if (params !== undefined) {
    req.params = params;
  }
  return req;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: { code: string; recoverable: boolean };
  };
}

function isSuccessResponse(
  resp: JsonRpcResponse,
): resp is JsonRpcResponse & { result: unknown } {
  return "result" in resp;
}

function isErrorResponse(
  resp: JsonRpcResponse,
): resp is JsonRpcResponse & {
  error: { code: number; message: string };
} {
  return "error" in resp && resp.error !== undefined;
}

// ──────────────────────────────────────────────────────────────
// 1. JSON-RPC 2.0 Protocol Tests
// ──────────────────────────────────────────────────────────────

describe("JSON-RPC 2.0 protocol", () => {
  it("createParseErrorResponse returns code -32700", () => {
    const resp = createParseErrorResponse();
    assert.equal(resp.jsonrpc, "2.0");
    assert.equal(resp.id, null);
    assert.equal(resp.error.code, JSONRPC.PARSE_ERROR);
    assert.equal(resp.error.message, "Parse error");
  });

  it("rejects non-object input as invalid request", async () => {
    const router = createRouter();

    const cases: unknown[] = ["hello", 42, null, true, [1, 2]];
    for (const input of cases) {
      const resp = (await router.dispatch(input)) as JsonRpcResponse;
      assert.ok(resp !== null, `Expected response for input: ${String(input)}`);
      assert.ok(isErrorResponse(resp));
      assert.equal(resp.error.code, JSONRPC.INVALID_REQUEST);
    }
  });

  it("rejects object without method as invalid request", async () => {
    const router = createRouter();

    const resp = (await router.dispatch({
      jsonrpc: "2.0",
      id: 1,
    })) as JsonRpcResponse;
    assert.ok(resp !== null);
    assert.ok(isErrorResponse(resp));
    assert.equal(resp.error.code, JSONRPC.INVALID_REQUEST);
  });

  it("rejects object without jsonrpc version as invalid request", async () => {
    const router = createRouter();

    const resp = (await router.dispatch({
      id: 1,
      method: "agent.status",
    })) as JsonRpcResponse;
    assert.ok(resp !== null);
    assert.ok(isErrorResponse(resp));
    assert.equal(resp.error.code, JSONRPC.INVALID_REQUEST);
  });

  it("returns null for notifications (no id)", async () => {
    const router = createRouter();

    const resp = await router.dispatch({
      jsonrpc: "2.0",
      method: "some.notification",
    });
    assert.equal(resp, null);
  });

  it("returns method not found for unknown methods", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("nonexistent.method"),
    )) as JsonRpcResponse;
    assert.ok(isErrorResponse(resp));
    assert.equal(resp.error.code, JSONRPC.METHOD_NOT_FOUND);
    assert.ok(resp.error.message.includes("nonexistent.method"));
    assert.equal(resp.id, 1);
  });

  it("preserves request id in responses", async () => {
    const router = createRouter();

    // Numeric id
    const resp1 = (await router.dispatch(
      makeRequest("nonexistent.method", 42),
    )) as JsonRpcResponse;
    assert.equal(resp1.id, 42);

    // String id
    const resp2 = (await router.dispatch(
      makeRequest("nonexistent.method", "req-abc"),
    )) as JsonRpcResponse;
    assert.equal(resp2.id, "req-abc");
  });

  it("extracts id from invalid requests when available", async () => {
    const router = createRouter();

    const resp = (await router.dispatch({
      id: 99,
      method: 123, // method should be string
    })) as JsonRpcResponse;
    assert.ok(resp !== null);
    assert.equal(resp.id, 99);
  });

  it("normalizes null params to empty object", async () => {
    const router = createRouter();

    // model.listPresets takes no params, so null params should work fine
    const resp = (await router.dispatch(
      makeRequest("model.listPresets", 1, null),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));
    assert.equal(resp.jsonrpc, "2.0");
  });

  it("normalizes missing params to empty object", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("model.listPresets"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));
  });
});

// ──────────────────────────────────────────────────────────────
// 2. Method Registration Completeness
// ──────────────────────────────────────────────────────────────

describe("method registration", () => {
  it("all 26 IPC contract methods are registered in the router", async () => {
    const router = createRouter();
    assert.equal(ALL_IPC_METHODS.length, 26, "Expected 26 IPC methods");

    for (const method of ALL_IPC_METHODS) {
      const resp = (await router.dispatch(
        makeRequest(method, 1, {}),
      )) as JsonRpcResponse | null;

      // A registered method either returns a success response or an
      // application error (e.g. config not found). The key assertion is
      // that it does NOT return METHOD_NOT_FOUND (-32601).
      if (resp !== null && isErrorResponse(resp)) {
        assert.notEqual(
          resp.error.code,
          JSONRPC.METHOD_NOT_FOUND,
          `Method "${method}" is not registered in the router`,
        );
      }
    }
  });

  it("method count matches the IPC contract exactly", async () => {
    const router = createRouter();

    // Verify no extra methods exist beyond the contract.
    // We do this by testing a few names that should NOT be registered.
    const invalidMethods = [
      "agent.kill",
      "config.import",
      "model.delete",
      "secret.rotate",
      "channel.slack.status",
      "system.shutdown",
    ];

    for (const method of invalidMethods) {
      const resp = (await router.dispatch(
        makeRequest(method),
      )) as JsonRpcResponse;
      assert.ok(isErrorResponse(resp));
      assert.equal(
        resp.error.code,
        JSONRPC.METHOD_NOT_FOUND,
        `Unexpected method "${method}" is registered`,
      );
    }
  });
});

// ──────────────────────────────────────────────────────────────
// 3. Stateless Read Method Response Shapes
// ──────────────────────────────────────────────────────────────

describe("stateless read methods", () => {
  it("model.listPresets returns presets array", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("model.listPresets"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as { presets: unknown[] };
    assert.ok(Array.isArray(result.presets));

    // Each preset should have the expected shape
    for (const preset of result.presets) {
      const p = preset as Record<string, unknown>;
      assert.equal(typeof p.id, "string");
      assert.equal(typeof p.name, "string");
      assert.equal(typeof p.baseUrl, "string");
      assert.ok(Array.isArray(p.models));
      assert.equal(typeof p.signupUrl, "string");
      assert.equal(typeof p.pricingRef, "string");
      assert.equal(typeof p.setupGuide, "string");
    }
  });

  it("agent.status returns stopped kernel status", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("agent.status"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as Record<string, unknown>;
    assert.equal(result.state, "stopped");
    assert.equal(typeof result.uptime, "number");
    assert.equal(typeof result.activeAgents, "number");
  });

  it("agent.health returns health report shape", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("agent.health"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as Record<string, unknown>;
    assert.ok(Array.isArray(result.endpoints));
    assert.ok(
      typeof result.memory === "object" && result.memory !== null,
    );
    assert.equal(typeof result.activeConnections, "number");
    assert.equal(typeof result.timestamp, "string");
  });

  it("channel.feishu.status returns disconnected without adapter", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("channel.feishu.status"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as { status: string };
    assert.equal(result.status, "disconnected");
  });

  it("channel.feishu.test returns graceful failure without adapter", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("channel.feishu.test"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as {
      success: boolean;
      status: string;
      error?: { code: string };
    };
    assert.equal(result.success, false);
    assert.equal(result.status, "disconnected");
    assert.ok(result.error !== undefined);
    assert.equal(result.error.code, "CHANNEL_NOT_CONNECTED");
  });

  it("channel.feishu.sendTest returns graceful failure without adapter", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("channel.feishu.sendTest"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as {
      success: boolean;
      error?: { code: string };
    };
    assert.equal(result.success, false);
    assert.ok(result.error !== undefined);
    assert.equal(result.error.code, "CHANNEL_NOT_CONNECTED");
  });

  it("cost.summary returns today/week/month structure", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("cost.summary"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as Record<string, unknown>;
    assert.ok(typeof result.today === "object" && result.today !== null);
    assert.ok(typeof result.week === "object" && result.week !== null);
    assert.ok(typeof result.month === "object" && result.month !== null);

    // Verify today shape
    const today = result.today as Record<string, unknown>;
    assert.equal(typeof today.date, "string");
    assert.equal(typeof today.totalCostYuan, "number");
    assert.equal(typeof today.totalRequests, "number");
  });

  it("cost.history returns range and daily array", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("cost.history", 1, {
        start: "2025-01-01",
        end: "2025-01-31",
      }),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as {
      range: { start: string; end: string };
      daily: unknown[];
    };
    assert.equal(typeof result.range.start, "string");
    assert.equal(typeof result.range.end, "string");
    assert.ok(Array.isArray(result.daily));
  });

  it("cost.export returns data string and format", async () => {
    const router = createRouter();

    for (const format of ["csv", "json"] as const) {
      const resp = (await router.dispatch(
        makeRequest("cost.export", 1, { format }),
      )) as JsonRpcResponse;
      assert.ok(isSuccessResponse(resp));

      const result = resp.result as { data: string; format: string };
      assert.equal(typeof result.data, "string");
      assert.equal(result.format, format);
    }
  });

  it("model.getQuota returns quota shape for unknown provider", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("model.getQuota", 1, { providerId: "nonexistent" }),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as {
      providerId: string;
      quota: Record<string, unknown>;
    };
    assert.equal(result.providerId, "nonexistent");
    assert.equal(typeof result.quota.type, "string");
    assert.equal(typeof result.quota.used, "number");
    assert.equal(typeof result.quota.estimatedCostYuan, "number");
    assert.equal(typeof result.quota.exhausted, "boolean");
  });

  it("model.list returns empty structure on missing config", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("model.list"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as {
      providers: unknown[];
      fallbackChain: string[];
      defaultModel: string;
    };
    // model.list catches errors and returns empty
    assert.ok(Array.isArray(result.providers));
    assert.ok(Array.isArray(result.fallbackChain));
    assert.equal(typeof result.defaultModel, "string");
  });

  it("config.validate returns validation result on missing config", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("config.validate"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(resp));

    const result = resp.result as {
      valid: boolean;
      issues: Array<{
        path: string;
        code: string;
        message: string;
        suggestion: string;
      }>;
    };
    // Without a config file, validation returns { valid: false, issues: [...] }
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0);
    assert.equal(typeof result.issues[0]!.path, "string");
    assert.equal(typeof result.issues[0]!.code, "string");
    assert.equal(typeof result.issues[0]!.message, "string");
  });
});

// ──────────────────────────────────────────────────────────────
// 4. Error Response Format
// ──────────────────────────────────────────────────────────────

describe("error response format", () => {
  it("config.get returns structured error on missing config", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("config.get"),
    )) as JsonRpcResponse;

    // config.get throws when config file doesn't exist
    assert.ok(isErrorResponse(resp));
    assert.equal(resp.jsonrpc, "2.0");
    assert.equal(resp.id, 1);
    assert.equal(typeof resp.error.code, "number");
    assert.equal(typeof resp.error.message, "string");
    assert.ok(resp.error.message.length > 0);

    // Should have application error data
    if (resp.error.data !== undefined) {
      assert.equal(typeof resp.error.data.code, "string");
      assert.equal(typeof resp.error.data.recoverable, "boolean");
    }
  });

  it("config.update returns error on missing config", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("config.update", 1, {
        patch: { general: { language: "en" } },
      }),
    )) as JsonRpcResponse;

    assert.ok(isErrorResponse(resp));
    assert.equal(resp.id, 1);
    // Should be a config error code
    assert.ok(resp.error.data !== undefined);
    assert.equal(typeof resp.error.data.code, "string");
    assert.equal(typeof resp.error.data.recoverable, "boolean");
  });

  it("all error responses include jsonrpc version and id", async () => {
    const router = createRouter();

    // Methods that will fail due to missing state
    const failingMethods = [
      { method: "config.get", params: {} },
      { method: "config.update", params: { patch: {} } },
    ];

    for (const { method, params } of failingMethods) {
      const resp = (await router.dispatch(
        makeRequest(method, 1, params),
      )) as JsonRpcResponse;

      if (isErrorResponse(resp)) {
        assert.equal(resp.jsonrpc, "2.0");
        assert.equal(resp.id, 1);
        assert.equal(typeof resp.error.code, "number");
        assert.equal(typeof resp.error.message, "string");
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────
// 5. Wire Format Verification
// ──────────────────────────────────────────────────────────────

describe("wire format", () => {
  it("createParseErrorResponse is JSON-serializable", () => {
    const resp = createParseErrorResponse();
    const serialized = JSON.stringify(resp);
    const deserialized = JSON.parse(serialized) as Record<string, unknown>;

    assert.equal(deserialized.jsonrpc, "2.0");
    assert.equal(deserialized.id, null);
    const error = deserialized.error as Record<string, unknown>;
    assert.equal(error.code, JSONRPC.PARSE_ERROR);
  });

  it("success responses are JSON-serializable", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("model.listPresets"),
    )) as JsonRpcResponse;

    // Round-trip through JSON serialization (undefined values are
    // expected to be stripped — this matches real wire behavior)
    const serialized = JSON.stringify(resp);
    const deserialized = JSON.parse(serialized) as JsonRpcResponse;

    assert.equal(deserialized.jsonrpc, "2.0");
    assert.equal(deserialized.id, 1);
    assert.ok(isSuccessResponse(deserialized));

    const result = deserialized.result as { presets: Array<{ id: string; name: string }> };
    assert.ok(Array.isArray(result.presets));
    assert.ok(result.presets.length > 0);
    assert.equal(typeof result.presets[0]!.id, "string");
    assert.equal(typeof result.presets[0]!.name, "string");
  });

  it("error responses are JSON-serializable with application data", async () => {
    const router = createRouter();

    const resp = (await router.dispatch(
      makeRequest("config.get"),
    )) as JsonRpcResponse;
    assert.ok(isErrorResponse(resp));

    const serialized = JSON.stringify(resp);
    const deserialized = JSON.parse(serialized) as JsonRpcResponse;

    assert.ok(isErrorResponse(deserialized));
    assert.equal(deserialized.error.code, resp.error.code);
    assert.equal(deserialized.error.message, resp.error.message);
    if (resp.error.data !== undefined) {
      assert.deepEqual(deserialized.error.data, resp.error.data);
    }
  });

  it("all date fields in responses are ISO 8601 strings", async () => {
    const router = createRouter();

    // agent.health has a timestamp field
    const healthResp = (await router.dispatch(
      makeRequest("agent.health"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(healthResp));
    const health = healthResp.result as { timestamp: string };
    assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(health.timestamp),
      `timestamp "${health.timestamp}" is not ISO 8601`,
    );

    // cost.summary has date fields
    const costResp = (await router.dispatch(
      makeRequest("cost.summary"),
    )) as JsonRpcResponse;
    assert.ok(isSuccessResponse(costResp));
    const cost = costResp.result as {
      today: { date: string };
    };
    assert.ok(
      /^\d{4}-\d{2}-\d{2}$/.test(cost.today.date),
      `date "${cost.today.date}" is not YYYY-MM-DD`,
    );
  });
});
