/**
 * Security sanity test suite (P2-E4).
 *
 * Verifies that secret values are never exposed in:
 * 1. IPC method responses (secret.*, config.*, channel.*, doctor.*)
 * 2. Cost export data (CSV/JSON)
 * 3. Error messages from failed operations
 * 4. JSON-RPC wire format responses
 *
 * Uses test secrets with known values and scans all response payloads
 * to ensure those values never appear in any output.
 */

import { writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import { Router } from "../router.js";
import { SidecarContext } from "../context.js";

// ── Test fixtures ─────────────────────────────────────────────────

/** Known secret values used in tests — must NEVER appear in responses. */
const TEST_SECRETS = {
  API_KEY: "sk-secret-test-value-12345-abcdef",
  APP_SECRET: "feishu-app-secret-xyz-789",
  WEBHOOK_TOKEN: "webhook-token-secret-qrs-456",
} as const;

/** Pattern that matches any of the test secret values. */
const SECRET_PATTERN = new RegExp(
  Object.values(TEST_SECRETS)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
);

let tmpDir: string;
let router: Router;
let ctx: SidecarContext;
let savedOriginalEnv: string | undefined;

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

function makeRequest(
  method: string,
  id: number = 1,
  params?: unknown,
): Record<string, unknown> {
  const req: Record<string, unknown> = { jsonrpc: "2.0", id, method };
  if (params !== undefined) {
    req.params = params;
  }
  return req;
}

/**
 * Recursively scan any value for the presence of known secret strings.
 * Returns the first secret found, or null if clean.
 */
function findSecretInValue(value: unknown, path: string = "$"): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const match = SECRET_PATTERN.exec(value);
    if (match !== null) {
      return `Secret found at ${path}: "${match[0].slice(0, 10)}..."`;
    }
    return null;
  }

  if (typeof value === "number" || typeof value === "boolean") return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findSecretInValue(value[i], `${path}[${String(i)}]`);
      if (found !== null) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const found = findSecretInValue(val, `${path}.${key}`);
      if (found !== null) return found;
    }
    return null;
  }

  return null;
}

/**
 * Assert that a JSON-RPC response (success or error) contains no secrets.
 */
function assertNoSecrets(resp: JsonRpcResponse, method: string): void {
  const serialized = JSON.stringify(resp);
  const match = SECRET_PATTERN.exec(serialized);
  assert.equal(
    match,
    null,
    `Secret leaked in ${method} response: "${match?.[0]?.slice(0, 10)}..."`,
  );

  // Deep scan for structural leaks
  const found = findSecretInValue(resp, method);
  assert.equal(found, null, found ?? "");
}

// ── Setup / teardown ──────────────────────────────────────────────

describe("Security sanity: secrets never exposed in responses", () => {
  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "oneclaw-security-"));
    savedOriginalEnv = process.env.ONECLAW_CONFIG_PATH;
    process.env.ONECLAW_CONFIG_PATH = tmpDir;

    const workspaceDir = join(tmpDir, "workspace");
    await mkdir(workspaceDir, { recursive: true });

    // Write config with provider that has credentialRef (not raw secret)
    const config = {
      version: 1,
      general: { language: "zh-CN", theme: "system", workspace: workspaceDir },
      models: {
        providers: [
          {
            id: "deepseek",
            enabled: true,
            credentialRef: "oneclaw/provider/deepseek/api-key",
            baseUrl: "https://api.deepseek.com/v1",
            protocol: "openai-completions",
            models: ["deepseek/deepseek-chat"],
          },
        ],
        fallbackChain: ["deepseek"],
        defaultModel: "deepseek/deepseek-chat",
        perModelSettings: {},
      },
      channels: {
        feishu: {
          appId: "cli_test_app",
          appSecretRef: "oneclaw/channel/feishu/app-secret",
          webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test",
          webhookTokenRef: "oneclaw/channel/feishu/webhook-token",
          enabled: true,
        },
      },
      agent: {
        concurrency: {
          maxConcurrent: 1,
          subagents: { maxConcurrent: 2, maxSpawnDepth: 2, maxChildrenPerAgent: 3 },
        },
        skills: [],
        mountPoints: [],
        timeoutSeconds: 300,
      },
      automation: { tasks: [] },
      quotas: { warningThreshold: 0.8 },
    };
    await writeFile(
      join(tmpDir, "config.json"),
      JSON.stringify(config, null, 2),
    );

    ctx = new SidecarContext({ locale: "zh-CN" });
    router = new Router(ctx);

    // Store test secrets
    await router.dispatch(
      makeRequest("secret.set", 1, {
        key: "oneclaw/provider/deepseek/api-key",
        value: TEST_SECRETS.API_KEY,
      }),
    );
    await router.dispatch(
      makeRequest("secret.set", 2, {
        key: "oneclaw/channel/feishu/app-secret",
        value: TEST_SECRETS.APP_SECRET,
      }),
    );
    await router.dispatch(
      makeRequest("secret.set", 3, {
        key: "oneclaw/channel/feishu/webhook-token",
        value: TEST_SECRETS.WEBHOOK_TOKEN,
      }),
    );
  });

  afterAll(async () => {
    if (savedOriginalEnv === undefined) {
      delete process.env.ONECLAW_CONFIG_PATH;
    } else {
      process.env.ONECLAW_CONFIG_PATH = savedOriginalEnv;
    }
    ctx.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ────────────────────────────────────────────────────────────────
  // 1. Secret handler responses never contain secret values
  // ────────────────────────────────────────────────────────────────

  it("secret.list returns only keys, never values", async () => {
    const resp = (await router.dispatch(
      makeRequest("secret.list"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "secret.list");

    if (resp.result !== undefined) {
      const result = resp.result as { keys: string[] };
      assert.ok(Array.isArray(result.keys));
      // Keys are identifiers, not secret values
      for (const key of result.keys) {
        assert.equal(SECRET_PATTERN.test(key), false, `Secret in key name: ${key}`);
      }
    }
  });

  it("secret.exists returns boolean only, not the value", async () => {
    const resp = (await router.dispatch(
      makeRequest("secret.exists", 1, {
        key: "oneclaw/provider/deepseek/api-key",
      }),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "secret.exists");

    if (resp.result !== undefined) {
      const result = resp.result as { exists: boolean };
      assert.equal(typeof result.exists, "boolean");
      // Response should have exactly one field
      assert.deepEqual(Object.keys(result), ["exists"]);
    }
  });

  it("secret.set returns {ok: true}, not the stored value", async () => {
    const resp = (await router.dispatch(
      makeRequest("secret.set", 1, {
        key: "oneclaw/test/security-check",
        value: TEST_SECRETS.API_KEY,
      }),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "secret.set");

    if (resp.result !== undefined) {
      const result = resp.result as { ok: boolean };
      assert.equal(result.ok, true);
      assert.deepEqual(Object.keys(result), ["ok"]);
    }
  });

  it("secret.delete returns {ok: true}, not the deleted value", async () => {
    const resp = (await router.dispatch(
      makeRequest("secret.delete", 1, {
        key: "oneclaw/test/security-check",
      }),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "secret.delete");

    if (resp.result !== undefined) {
      const result = resp.result as { ok: boolean };
      assert.equal(result.ok, true);
      assert.deepEqual(Object.keys(result), ["ok"]);
    }
  });

  // ────────────────────────────────────────────────────────────────
  // 2. Config responses use credential refs, not raw secrets
  // ────────────────────────────────────────────────────────────────

  it("config.get returns credentialRef strings, not secret values", async () => {
    const resp = (await router.dispatch(
      makeRequest("config.get"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "config.get");

    if (resp.result !== undefined) {
      const config = resp.result as {
        models: {
          providers: Array<{ credentialRef: string }>;
        };
        channels: {
          feishu?: { appSecretRef: string; webhookTokenRef?: string };
        };
      };

      // Providers must use refs, not raw values
      for (const provider of config.models.providers) {
        assert.equal(typeof provider.credentialRef, "string");
        assert.ok(
          provider.credentialRef.startsWith("oneclaw/"),
          "credentialRef should be a reference path",
        );
        assert.equal(
          SECRET_PATTERN.test(provider.credentialRef),
          false,
          "credentialRef must not contain a secret value",
        );
      }

      // Channel config must use refs
      if (config.channels.feishu !== undefined) {
        assert.equal(typeof config.channels.feishu.appSecretRef, "string");
        assert.ok(
          config.channels.feishu.appSecretRef.startsWith("oneclaw/"),
          "appSecretRef should be a reference path",
        );
      }
    }
  });

  it("config.update response contains no secrets", async () => {
    const resp = (await router.dispatch(
      makeRequest("config.update", 1, {
        patch: { general: { theme: "dark" } },
      }),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "config.update");
  });

  it("config.validate response contains no secrets", async () => {
    const resp = (await router.dispatch(
      makeRequest("config.validate"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "config.validate");
  });

  // ────────────────────────────────────────────────────────────────
  // 3. Cost export contains no secrets
  // ────────────────────────────────────────────────────────────────

  it("cost.export CSV contains no secret values", async () => {
    const resp = (await router.dispatch(
      makeRequest("cost.export", 1, { format: "csv" }),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "cost.export (csv)");

    if (resp.result !== undefined) {
      const result = resp.result as { data: string };
      assert.equal(
        SECRET_PATTERN.test(result.data),
        false,
        "CSV export must not contain secret values",
      );
    }
  });

  it("cost.export JSON contains no secret values", async () => {
    const resp = (await router.dispatch(
      makeRequest("cost.export", 1, { format: "json" }),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "cost.export (json)");

    if (resp.result !== undefined) {
      const result = resp.result as { data: string };
      assert.equal(
        SECRET_PATTERN.test(result.data),
        false,
        "JSON export must not contain secret values",
      );
    }
  });

  it("cost.summary contains no secret values", async () => {
    const resp = (await router.dispatch(
      makeRequest("cost.summary"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "cost.summary");
  });

  // ────────────────────────────────────────────────────────────────
  // 4. Doctor checks do not expose secret values or file contents
  // ────────────────────────────────────────────────────────────────

  it("doctor.run reports key count but never key values", async () => {
    const resp = (await router.dispatch(
      makeRequest("doctor.run"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "doctor.run");

    if (resp.result !== undefined) {
      const report = resp.result as {
        checks: Array<{
          id: string;
          message: { "zh-CN": string; en: string };
        }>;
      };

      for (const check of report.checks) {
        assert.equal(
          SECRET_PATTERN.test(check.message["zh-CN"]),
          false,
          `Secret in doctor check (zh-CN): ${check.id}`,
        );
        assert.equal(
          SECRET_PATTERN.test(check.message.en),
          false,
          `Secret in doctor check (en): ${check.id}`,
        );
      }
    }
  });

  // ────────────────────────────────────────────────────────────────
  // 5. Channel responses do not leak credentials
  // ────────────────────────────────────────────────────────────────

  it("channel.feishu.status contains no secrets", async () => {
    const resp = (await router.dispatch(
      makeRequest("channel.feishu.status"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "channel.feishu.status");
  });

  it("channel.feishu.test contains no secrets in error details", async () => {
    const resp = (await router.dispatch(
      makeRequest("channel.feishu.test"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "channel.feishu.test");
  });

  it("channel.feishu.sendTest contains no secrets in error details", async () => {
    const resp = (await router.dispatch(
      makeRequest("channel.feishu.sendTest"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "channel.feishu.sendTest");
  });

  // ────────────────────────────────────────────────────────────────
  // 6. Agent/model responses do not leak credentials
  // ────────────────────────────────────────────────────────────────

  it("agent.status contains no secrets", async () => {
    const resp = (await router.dispatch(
      makeRequest("agent.status"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "agent.status");
  });

  it("agent.health contains no secrets", async () => {
    const resp = (await router.dispatch(
      makeRequest("agent.health"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "agent.health");
  });

  it("model.list returns credentialRefs not raw secrets", async () => {
    const resp = (await router.dispatch(
      makeRequest("model.list"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "model.list");
  });

  it("model.listPresets contains no secrets", async () => {
    const resp = (await router.dispatch(
      makeRequest("model.listPresets"),
    )) as JsonRpcResponse;

    assertNoSecrets(resp, "model.listPresets");
  });

  // ────────────────────────────────────────────────────────────────
  // 7. Error responses do not leak secrets
  // ────────────────────────────────────────────────────────────────

  it("error responses from failed operations contain no secrets", async () => {
    // Trigger errors on operations that involve secrets
    const errorMethods = [
      { method: "agent.start", params: {} },
      { method: "agent.stop", params: {} },
    ];

    for (const { method, params } of errorMethods) {
      const resp = (await router.dispatch(
        makeRequest(method, 1, params),
      )) as JsonRpcResponse;

      assertNoSecrets(resp, `error:${method}`);
    }
  });

  // ────────────────────────────────────────────────────────────────
  // 8. Full JSON-RPC wire format scan
  // ────────────────────────────────────────────────────────────────

  it("serialized wire format of all method responses contains no secrets", async () => {
    const allMethods = [
      { method: "agent.status", params: {} },
      { method: "agent.health", params: {} },
      { method: "config.get", params: {} },
      { method: "config.validate", params: {} },
      { method: "model.list", params: {} },
      { method: "model.listPresets", params: {} },
      { method: "model.getQuota", params: { providerId: "deepseek" } },
      { method: "secret.list", params: {} },
      { method: "secret.exists", params: { key: "oneclaw/provider/deepseek/api-key" } },
      { method: "channel.feishu.status", params: {} },
      { method: "channel.feishu.test", params: {} },
      { method: "cost.summary", params: {} },
      { method: "cost.history", params: { start: "2026-03-01", end: "2026-03-04" } },
      { method: "cost.export", params: { format: "csv" } },
      { method: "cost.export", params: { format: "json" } },
      { method: "doctor.run", params: {} },
    ];

    for (const { method, params } of allMethods) {
      const resp = (await router.dispatch(
        makeRequest(method, 1, params),
      )) as JsonRpcResponse;

      // Serialize exactly as it would go over the wire
      const wire = JSON.stringify(resp);
      assert.equal(
        SECRET_PATTERN.test(wire),
        false,
        `Secret found in wire format of ${method}`,
      );
    }
  });
});
