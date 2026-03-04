/**
 * Performance sanity tests.
 *
 * Verifies that sidecar startup, IPC dispatch latency, and simulated
 * page interaction patterns complete within acceptable time budgets.
 *
 * Method categories:
 *   - **Fast** (in-memory): agent.status, agent.health, model.listPresets,
 *     cost.summary, cost.history, cost.export, channel.feishu.status, model.list
 *   - **I/O-bound**: config.get (file read), config.validate (file read),
 *     secret.list (keychain probe), doctor.run (filesystem + keychain probe)
 *
 * Budgets:
 *   - Context + Router construction:       < 200ms
 *   - Fast method (warm):                  < 50ms
 *   - I/O-bound method:                    < 2000ms (keychain + filesystem)
 *   - Dashboard page load (fast methods):  < 200ms
 *   - 10-call sequential burst (fast):     < 200ms
 *   - 10-call parallel burst (fast):       < 200ms
 */

import { writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import { Router } from "../router.js";
import { SidecarContext } from "../context.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let tmpDir: string;
let savedOriginalEnv: string | undefined;

/** Shared warm context for all warm-path tests. */
let warmCtx: SidecarContext;
let warmRouter: Router;

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

/** Measure elapsed time in milliseconds. */
function elapsed(start: [number, number]): number {
  const diff = process.hrtime(start);
  return diff[0] * 1000 + diff[1] / 1_000_000;
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                         */
/* ------------------------------------------------------------------ */

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "oneclaw-perf-"));
  savedOriginalEnv = process.env["ONECLAW_CONFIG_PATH"];
  process.env["ONECLAW_CONFIG_PATH"] = tmpDir;

  const workspaceDir = join(tmpDir, "workspace");
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(
    join(tmpDir, "config.json"),
    JSON.stringify(createValidConfig(workspaceDir), null, 2),
  );

  // Create a shared warm context: trigger all lazy initializations once
  warmCtx = new SidecarContext({ locale: "en" });
  warmRouter = new Router(warmCtx);
  await warmRouter.dispatch(makeRequest("doctor.run", 0));
  await warmRouter.dispatch(makeRequest("config.get", 0));
  await warmRouter.dispatch(makeRequest("secret.list", 0));
  await warmRouter.dispatch(makeRequest("model.list", 0));
});

afterAll(async () => {
  warmCtx.dispose();

  if (savedOriginalEnv === undefined) {
    delete process.env["ONECLAW_CONFIG_PATH"];
  } else {
    process.env["ONECLAW_CONFIG_PATH"] = savedOriginalEnv;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("Performance sanity", () => {
  // ------------------------------------------------------------------
  // 1. Startup: Context + Router construction (no I/O)
  // ------------------------------------------------------------------
  describe("Startup", () => {
    it("SidecarContext + Router initializes within 200ms", () => {
      const start = process.hrtime();
      const ctx = new SidecarContext({ locale: "en" });
      const _router = new Router(ctx);
      const ms = elapsed(start);

      assert.ok(ms < 200, `Init took ${ms.toFixed(1)}ms (budget: 200ms)`);
      ctx.dispose();
    });
  });

  // ------------------------------------------------------------------
  // 2. Fast in-memory methods (warm): should be < 50ms each
  //    These methods use cached services and do no I/O
  // ------------------------------------------------------------------
  describe("Fast method dispatch (warm)", () => {
    const fastMethods = [
      "agent.status",
      "agent.health",
      "model.listPresets",
      "cost.summary",
      "channel.feishu.status",
      "model.list",
    ] as const;

    for (const method of fastMethods) {
      it(`${method} within 50ms`, async () => {
        const start = process.hrtime();
        await warmRouter.dispatch(makeRequest(method));
        const ms = elapsed(start);

        assert.ok(ms < 50, `${method} took ${ms.toFixed(1)}ms (budget: 50ms)`);
      });
    }
  });

  // ------------------------------------------------------------------
  // 3. I/O-bound methods: config read, secret store, doctor
  //    These involve filesystem or keychain access — budget is generous
  // ------------------------------------------------------------------
  describe("I/O-bound method dispatch", () => {
    it("config.get (file read) within 2000ms", async () => {
      const ctx = new SidecarContext({ locale: "en" });
      const router = new Router(ctx);
      const start = process.hrtime();
      await router.dispatch(makeRequest("config.get"));
      const ms = elapsed(start);
      ctx.dispose();

      assert.ok(ms < 2000, `config.get took ${ms.toFixed(1)}ms (budget: 2000ms)`);
    });

    it("doctor.run (filesystem + keychain probe) within 2000ms", async () => {
      const ctx = new SidecarContext({ locale: "en" });
      const router = new Router(ctx);
      const start = process.hrtime();
      await router.dispatch(makeRequest("doctor.run"));
      const ms = elapsed(start);
      ctx.dispose();

      assert.ok(ms < 2000, `doctor.run took ${ms.toFixed(1)}ms (budget: 2000ms)`);
    });

    it("secret.list (keychain init) within 2000ms", async () => {
      const ctx = new SidecarContext({ locale: "en" });
      const router = new Router(ctx);
      const start = process.hrtime();
      await router.dispatch(makeRequest("secret.list"));
      const ms = elapsed(start);
      ctx.dispose();

      assert.ok(ms < 2000, `secret.list took ${ms.toFixed(1)}ms (budget: 2000ms)`);
    });
  });

  // ------------------------------------------------------------------
  // 4. Dashboard page simulation (warm, fast methods only)
  //    Dashboard fetches agent.status + cost.summary + agent.health
  // ------------------------------------------------------------------
  describe("Page interaction: Dashboard (warm)", () => {
    it("parallel agent.status + cost.summary + agent.health within 200ms", async () => {
      const start = process.hrtime();
      const results = await Promise.all([
        warmRouter.dispatch(makeRequest("agent.status", 1)),
        warmRouter.dispatch(makeRequest("cost.summary", 2)),
        warmRouter.dispatch(makeRequest("agent.health", 3)),
      ]);
      const ms = elapsed(start);

      for (const resp of results) {
        assert.ok(resp !== null, "Response should not be null");
        const r = resp as JsonRpcResponse;
        assert.equal(r.jsonrpc, "2.0");
      }

      assert.ok(ms < 200, `Dashboard load took ${ms.toFixed(1)}ms (budget: 200ms)`);
    });
  });

  // ------------------------------------------------------------------
  // 5. Cost panel page simulation (warm)
  // ------------------------------------------------------------------
  describe("Page interaction: Cost panel (warm)", () => {
    it("parallel cost.summary + cost.history within 200ms", async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const start = process.hrtime();
      const results = await Promise.all([
        warmRouter.dispatch(makeRequest("cost.summary", 1)),
        warmRouter.dispatch(
          makeRequest("cost.history", 2, {
            start: weekAgo.toISOString(),
            end: now.toISOString(),
          }),
        ),
      ]);
      const ms = elapsed(start);

      for (const resp of results) {
        assert.ok(resp !== null);
      }

      assert.ok(ms < 200, `Cost panel load took ${ms.toFixed(1)}ms (budget: 200ms)`);
    });
  });

  // ------------------------------------------------------------------
  // 6. Sequential burst (warm, fast methods): 10 rapid calls
  // ------------------------------------------------------------------
  describe("Sequential burst (warm)", () => {
    it("10 sequential fast dispatches within 200ms", async () => {
      const methods = [
        "agent.status",
        "cost.summary",
        "model.listPresets",
        "agent.health",
        "channel.feishu.status",
        "cost.summary",
        "model.list",
        "agent.status",
        "model.listPresets",
        "agent.health",
      ];

      const start = process.hrtime();
      for (let i = 0; i < methods.length; i++) {
        await warmRouter.dispatch(makeRequest(methods[i]!, i + 1));
      }
      const ms = elapsed(start);

      assert.ok(
        ms < 200,
        `10-call burst took ${ms.toFixed(1)}ms (budget: 200ms)`,
      );
    });
  });

  // ------------------------------------------------------------------
  // 7. Parallel burst (warm, fast methods): 10 concurrent calls
  // ------------------------------------------------------------------
  describe("Parallel burst (warm)", () => {
    it("10 parallel fast dispatches within 200ms", async () => {
      const methods = [
        "agent.status",
        "cost.summary",
        "model.listPresets",
        "agent.health",
        "channel.feishu.status",
        "cost.summary",
        "model.list",
        "agent.status",
        "model.listPresets",
        "agent.health",
      ];

      const start = process.hrtime();
      const results = await Promise.all(
        methods.map((method, i) =>
          warmRouter.dispatch(makeRequest(method, i + 1)),
        ),
      );
      const ms = elapsed(start);

      for (const resp of results) {
        assert.ok(resp !== null);
      }

      assert.ok(
        ms < 200,
        `10-call parallel burst took ${ms.toFixed(1)}ms (budget: 200ms)`,
      );
    });
  });

  // ------------------------------------------------------------------
  // 8. Frontend bundle size sanity (Vite build output)
  // ------------------------------------------------------------------
  describe("Frontend bundle", () => {
    it("Vite build produces output under expected size", async () => {
      const { stat } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      const distDir = resolve(
        import.meta.dirname ?? ".",
        "../../../../dist",
      );

      let totalSize = 0;
      try {
        const { readdir } = await import("node:fs/promises");

        async function walkDir(dir: string): Promise<void> {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              await walkDir(fullPath);
            } else {
              const st = await stat(fullPath);
              totalSize += st.size;
            }
          }
        }

        await walkDir(distDir);
      } catch {
        // dist may not exist in test-only runs (no Vite build)
        // Skip gracefully — CI desktop job verifies build separately
        return;
      }

      // Frontend bundle should be under 2MB (React + Zustand + pages, no heavy libs)
      const maxBytes = 2 * 1024 * 1024;
      assert.ok(
        totalSize < maxBytes,
        `Bundle size ${(totalSize / 1024).toFixed(0)}KB exceeds ${(maxBytes / 1024).toFixed(0)}KB limit`,
      );
    });
  });
});
