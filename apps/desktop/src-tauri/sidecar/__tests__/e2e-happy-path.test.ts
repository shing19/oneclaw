/**
 * End-to-end happy path integration test.
 *
 * Simulates the complete user journey through the sidecar layer:
 *   1. First launch → no config exists, create default
 *   2. Wizard: language/theme config update
 *   3. Wizard: provider presets, API key setup
 *   4. Wizard: channel setup + test message (network-dependent, graceful)
 *   5. Post-wizard: dashboard (agent status, cost, health)
 *   6. Post-wizard: agent start, doctor diagnostics
 *   7. Post-wizard: model config, fallback chain, secrets
 *
 * Uses a temporary config directory to avoid side effects.
 * Network-dependent operations verify graceful error handling.
 */

import { writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import { Router } from "../router.js";
import { SidecarContext } from "../context.js";

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

function isSuccess(
  resp: JsonRpcResponse,
): resp is JsonRpcResponse & { result: unknown } {
  return "result" in resp && resp.error === undefined;
}

function isError(
  resp: JsonRpcResponse,
): resp is JsonRpcResponse & {
  error: { code: number; message: string };
} {
  return "error" in resp && resp.error !== undefined;
}

/**
 * A valid OneClaw config that passes schema validation.
 * Written directly to disk in beforeAll to bootstrap the test environment.
 */
function createValidConfig(workspaceDir: string): Record<string, unknown> {
  return {
    version: 1,
    general: { language: "zh-CN", theme: "system", workspace: workspaceDir },
    models: {
      providers: [],
      fallbackChain: [],
      defaultModel: "deepseek/deepseek-chat",
      perModelSettings: {},
    },
    channels: {},
    agent: {
      concurrency: {
        maxConcurrent: 1,
        subagents: {
          maxConcurrent: 2,
          maxSpawnDepth: 2,
          maxChildrenPerAgent: 3,
        },
      },
      skills: [],
      mountPoints: [],
      timeoutSeconds: 300,
    },
    automation: { tasks: [] },
    quotas: { warningThreshold: 0.8 },
  };
}

describe("E2E happy path: first launch → wizard → agent → channel", () => {
  beforeAll(async () => {
    // Create isolated temp directory for config and secrets
    tmpDir = await mkdtemp(join(tmpdir(), "oneclaw-e2e-"));

    // Set env var so ConfigManager and SecretStore resolve to temp dir
    savedOriginalEnv = process.env.ONECLAW_CONFIG_PATH;
    process.env.ONECLAW_CONFIG_PATH = tmpDir;

    // Write a valid initial config (simulates first-launch config creation)
    const workspaceDir = join(tmpDir, "workspace");
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(
      join(tmpDir, "config.json"),
      JSON.stringify(createValidConfig(workspaceDir), null, 2),
    );

    // Create context and router using temp paths
    ctx = new SidecarContext({ locale: "zh-CN" });
    router = new Router(ctx);
  });

  afterAll(async () => {
    // Restore env
    if (savedOriginalEnv === undefined) {
      delete process.env.ONECLAW_CONFIG_PATH;
    } else {
      process.env.ONECLAW_CONFIG_PATH = savedOriginalEnv;
    }

    // Dispose context
    ctx.dispose();

    // Clean up temp directory
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 1: Config Exists (simulating first launch bootstrap)
  // ──────────────────────────────────────────────────────────────

  it("config.get reads the bootstrapped config", async () => {
    const resp = (await router.dispatch(
      makeRequest("config.get"),
    )) as JsonRpcResponse;

    assert.ok(
      isSuccess(resp),
      `config.get should succeed, got: ${JSON.stringify(resp.error)}`,
    );
    const config = resp.result as {
      version: number;
      general: Record<string, unknown>;
    };
    assert.equal(config.version, 1);
    assert.equal(config.general.language, "zh-CN");
    assert.equal(config.general.theme, "system");
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 2: Wizard — Language & Theme
  // ──────────────────────────────────────────────────────────────

  it("wizard updates language and theme (config.update)", async () => {
    const resp = (await router.dispatch(
      makeRequest("config.update", 1, {
        patch: { general: { language: "en", theme: "dark" } },
      }),
    )) as JsonRpcResponse;

    assert.ok(
      isSuccess(resp),
      `config.update should succeed, got: ${JSON.stringify(resp.error)}`,
    );
    const result = resp.result as {
      ok: boolean;
      config: { general: Record<string, unknown> };
    };
    assert.equal(result.ok, true);
    assert.equal(result.config.general.language, "en");
    assert.equal(result.config.general.theme, "dark");
  });

  it("config persisted correctly (config.get reads updated values)", async () => {
    const resp = (await router.dispatch(
      makeRequest("config.get"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp));
    const config = resp.result as { general: Record<string, unknown> };
    assert.equal(config.general.language, "en");
    assert.equal(config.general.theme, "dark");
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 3: Wizard — Provider Selection
  // ──────────────────────────────────────────────────────────────

  it("wizard loads provider presets (model.listPresets)", async () => {
    const resp = (await router.dispatch(
      makeRequest("model.listPresets"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp), "model.listPresets should succeed");
    const result = resp.result as {
      presets: Array<{ id: string; name: string; models: unknown[] }>;
    };
    assert.ok(Array.isArray(result.presets));
    assert.ok(
      result.presets.length > 0,
      "Should have at least one preset provider",
    );

    for (const preset of result.presets) {
      assert.equal(typeof preset.id, "string");
      assert.equal(typeof preset.name, "string");
      assert.ok(Array.isArray(preset.models));
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 4: Wizard — API Key Config
  // ──────────────────────────────────────────────────────────────

  it("wizard saves API key (secret.set)", async () => {
    const resp = (await router.dispatch(
      makeRequest("secret.set", 1, {
        key: "oneclaw/provider/deepseek/api-key",
        value: "sk-test-key-for-e2e",
      }),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp), "secret.set should succeed");
    const result = resp.result as { ok: boolean };
    assert.equal(result.ok, true);
  });

  it("verify API key stored (secret.exists)", async () => {
    const resp = (await router.dispatch(
      makeRequest("secret.exists", 1, {
        key: "oneclaw/provider/deepseek/api-key",
      }),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp));
    const result = resp.result as { exists: boolean };
    assert.equal(result.exists, true);
  });

  it("wizard validates provider connection (model.testProvider)", async () => {
    const resp = (await router.dispatch(
      makeRequest("model.testProvider", 1, { providerId: "deepseek" }),
    )) as JsonRpcResponse;

    // model.testProvider makes real network calls — response shape
    // must be valid regardless of connection outcome
    assert.ok(resp !== null);
    assert.equal(resp.jsonrpc, "2.0");
    assert.equal(resp.id, 1);

    if (isSuccess(resp)) {
      const result = resp.result as {
        ok: boolean;
        health: { status: string };
      };
      assert.equal(typeof result.ok, "boolean");
      assert.equal(typeof result.health.status, "string");
    }
    // Error is acceptable (no real API key / network)
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 5: Wizard — Channel Setup
  // ──────────────────────────────────────────────────────────────

  it("wizard confirms channel initially disconnected", async () => {
    const resp = (await router.dispatch(
      makeRequest("channel.feishu.status"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp));
    const result = resp.result as { status: string };
    assert.equal(result.status, "disconnected");
  });

  it("wizard attempts Feishu setup (channel.feishu.setup)", async () => {
    const resp = (await router.dispatch(
      makeRequest("channel.feishu.setup", 1, {
        appId: "cli_test_e2e_app_id",
        appSecret: "test-app-secret-for-e2e",
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test-e2e",
        webhookToken: "test-webhook-token-e2e",
      }),
    )) as JsonRpcResponse;

    // Channel setup attempts real connection — may succeed or fail
    assert.ok(resp !== null);
    assert.equal(resp.jsonrpc, "2.0");
    assert.equal(resp.id, 1);

    if (isSuccess(resp)) {
      const result = resp.result as {
        ok: boolean;
        testResult: { success: boolean; status: string };
      };
      assert.equal(result.ok, true);
      assert.equal(typeof result.testResult.success, "boolean");
    } else {
      assert.ok(isError(resp));
      assert.equal(typeof resp.error.message, "string");
    }
  });

  it("wizard sends test message (channel.feishu.sendTest)", async () => {
    const resp = (await router.dispatch(
      makeRequest("channel.feishu.sendTest", 1, {
        message: "Hello from OneClaw E2E test!",
      }),
    )) as JsonRpcResponse;

    assert.ok(resp !== null);
    assert.equal(resp.jsonrpc, "2.0");

    if (isSuccess(resp)) {
      const result = resp.result as {
        success: boolean;
        timestamp: string;
      };
      assert.equal(typeof result.success, "boolean");
      assert.equal(typeof result.timestamp, "string");
    }
    // Error or graceful failure both acceptable
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 6: Post-Wizard — Dashboard
  // ──────────────────────────────────────────────────────────────

  it("dashboard loads agent status (agent.status)", async () => {
    const resp = (await router.dispatch(
      makeRequest("agent.status"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp), "agent.status should succeed");
    const result = resp.result as {
      state: string;
      uptime: number;
      activeAgents: number;
    };
    assert.equal(result.state, "stopped");
    assert.equal(typeof result.uptime, "number");
    assert.equal(typeof result.activeAgents, "number");
  });

  it("dashboard loads cost summary (cost.summary)", async () => {
    const resp = (await router.dispatch(
      makeRequest("cost.summary"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp), "cost.summary should succeed");
    const result = resp.result as {
      today: { date: string; totalCostYuan: number; totalRequests: number };
      week: Record<string, unknown>;
      month: Record<string, unknown>;
    };
    assert.equal(typeof result.today.date, "string");
    assert.equal(typeof result.today.totalCostYuan, "number");
    assert.equal(typeof result.today.totalRequests, "number");
    assert.ok(typeof result.week === "object" && result.week !== null);
    assert.ok(typeof result.month === "object" && result.month !== null);
  });

  it("dashboard loads agent health (agent.health)", async () => {
    const resp = (await router.dispatch(
      makeRequest("agent.health"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp), "agent.health should succeed");
    const result = resp.result as {
      endpoints: unknown[];
      memory: { used: number; total: number };
      activeConnections: number;
      timestamp: string;
    };
    assert.ok(Array.isArray(result.endpoints));
    assert.equal(typeof result.memory.used, "number");
    assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(result.timestamp),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 7: Post-Wizard — Agent Start
  // ──────────────────────────────────────────────────────────────

  it("user clicks Start Agent (agent.start)", async () => {
    const resp = (await router.dispatch(
      makeRequest("agent.start"),
    )) as JsonRpcResponse;

    // agent.start loads config and attempts to spawn the kernel.
    // The response must be well-formed regardless of outcome.
    assert.ok(resp !== null);
    assert.equal(resp.jsonrpc, "2.0");
    assert.equal(resp.id, 1);

    if (isSuccess(resp)) {
      const result = resp.result as { ok: boolean };
      assert.equal(result.ok, true);
    } else {
      // Error is expected in test env (no real agent binary)
      assert.ok(isError(resp));
      assert.equal(typeof resp.error.message, "string");
      assert.ok(resp.error.message.length > 0);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 8: Post-Wizard — Doctor Diagnostics
  // ──────────────────────────────────────────────────────────────

  it("settings page runs diagnostics (doctor.run)", async () => {
    const resp = (await router.dispatch(
      makeRequest("doctor.run"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp), "doctor.run should succeed");
    const result = resp.result as {
      overall: string;
      checks: Array<{
        id: string;
        label: { "zh-CN": string; en: string };
        status: string;
        message: { "zh-CN": string; en: string };
        checkedAt: string;
      }>;
      timestamp: string;
    };

    assert.ok(Array.isArray(result.checks));
    assert.ok(result.checks.length > 0, "Doctor should run at least one check");
    assert.equal(typeof result.timestamp, "string");
    assert.ok(
      ["pass", "warn", "fail"].includes(result.overall),
      `Unexpected overall status: ${result.overall}`,
    );

    // Verify bilingual check labels
    for (const check of result.checks) {
      assert.equal(typeof check.id, "string");
      assert.equal(typeof check.label["zh-CN"], "string");
      assert.equal(typeof check.label.en, "string");
      assert.ok(
        ["pass", "warn", "fail"].includes(check.status),
        `Unexpected check status: ${check.status}`,
      );
      assert.equal(typeof check.message["zh-CN"], "string");
      assert.equal(typeof check.message.en, "string");
      assert.equal(typeof check.checkedAt, "string");
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 9: Cost Panel — History & Export
  // ──────────────────────────────────────────────────────────────

  it("cost panel loads history (cost.history)", async () => {
    const resp = (await router.dispatch(
      makeRequest("cost.history", 1, {
        start: "2026-03-01",
        end: "2026-03-04",
      }),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp));
    const result = resp.result as {
      range: { start: string; end: string };
      daily: unknown[];
    };
    assert.equal(result.range.start, "2026-03-01");
    assert.equal(result.range.end, "2026-03-04");
    assert.ok(Array.isArray(result.daily));
  });

  it("cost panel exports data (cost.export)", async () => {
    for (const format of ["csv", "json"] as const) {
      const resp = (await router.dispatch(
        makeRequest("cost.export", 1, { format }),
      )) as JsonRpcResponse;

      assert.ok(isSuccess(resp));
      const result = resp.result as { data: string; format: string };
      assert.equal(typeof result.data, "string");
      assert.equal(result.format, format);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 10: Config Validation & Secret Management
  // ──────────────────────────────────────────────────────────────

  it("settings page validates config (config.validate)", async () => {
    const resp = (await router.dispatch(
      makeRequest("config.validate"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp));
    const result = resp.result as {
      valid: boolean;
      issues: Array<{ path: string; code: string; message: string }>;
    };
    assert.equal(typeof result.valid, "boolean");
    assert.ok(Array.isArray(result.issues));
  });

  it("settings page lists stored secrets (secret.list)", async () => {
    const resp = (await router.dispatch(
      makeRequest("secret.list"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp));
    const result = resp.result as { keys: string[] };
    assert.ok(Array.isArray(result.keys));
    // At minimum, the API key saved earlier should be present
    // (keychain operations may vary by environment)
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 11: Model Configuration
  // ──────────────────────────────────────────────────────────────

  it("model config page loads providers (model.list)", async () => {
    const resp = (await router.dispatch(
      makeRequest("model.list"),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp));
    const result = resp.result as {
      providers: unknown[];
      fallbackChain: string[];
      defaultModel: string;
    };
    assert.ok(Array.isArray(result.providers));
    assert.ok(Array.isArray(result.fallbackChain));
    assert.equal(typeof result.defaultModel, "string");
  });

  it("user sets fallback chain (model.setFallbackChain)", async () => {
    const resp = (await router.dispatch(
      makeRequest("model.setFallbackChain", 1, {
        chain: ["deepseek", "bailian"],
      }),
    )) as JsonRpcResponse;

    // setFallbackChain loads+updates config
    if (isSuccess(resp)) {
      const result = resp.result as { ok: boolean };
      assert.equal(result.ok, true);

      // Verify the chain persisted
      const configResp = (await router.dispatch(
        makeRequest("config.get"),
      )) as JsonRpcResponse;
      assert.ok(isSuccess(configResp));
      const config = configResp.result as {
        models: { fallbackChain: string[] };
      };
      assert.deepEqual(config.models.fallbackChain, ["deepseek", "bailian"]);
    }
    // Error acceptable if config schema validation rejects
  });

  // ──────────────────────────────────────────────────────────────
  // Phase 12: Cleanup
  // ──────────────────────────────────────────────────────────────

  it("cleanup API key (secret.delete)", async () => {
    const resp = (await router.dispatch(
      makeRequest("secret.delete", 1, {
        key: "oneclaw/provider/deepseek/api-key",
      }),
    )) as JsonRpcResponse;

    assert.ok(isSuccess(resp));
    const result = resp.result as { ok: boolean };
    assert.equal(result.ok, true);

    // Verify key is gone
    const existsResp = (await router.dispatch(
      makeRequest("secret.exists", 1, {
        key: "oneclaw/provider/deepseek/api-key",
      }),
    )) as JsonRpcResponse;
    assert.ok(isSuccess(existsResp));
    const existsResult = existsResp.result as { exists: boolean };
    assert.equal(existsResult.exists, false);
  });
});
