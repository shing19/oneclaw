import assert from "node:assert/strict";
import {
  type ChildProcessWithoutNullStreams,
  spawn,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it } from "vitest";

import { OpenClawAdapter } from "../openclaw-adapter.js";
import type {
  AgentConfig,
  KernelStatus,
} from "../../types/agent-adapter.js";

interface SpawnCallSnapshot {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

describe("openclaw adapter integration", () => {
  it("supports start -> status check -> stop lifecycle", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "oneclaw-adapter-test-"));
    const mockBinaryPath = join(workspaceRoot, "mock-openclaw.mjs");
    const statusStates: KernelStatus["state"][] = [];
    let lastSpawnCall: SpawnCallSnapshot | null = null;
    let spawnedChild: ChildProcessWithoutNullStreams | null = null;

    await writeFile(mockBinaryPath, createMockOpenClawScript(), "utf8");

    const adapter = new OpenClawAdapter({
      command: process.execPath,
      args: [mockBinaryPath],
      startupTimeoutMs: 2_000,
      stopTimeoutMs: 2_000,
      heartbeatIntervalMs: 50,
      autoRestartOnCrash: false,
      resolveApiKey: async (credentialRef: string): Promise<string | undefined> =>
        credentialRef === "oneclaw/provider/deepseek/key-1" ? "deepseek-test-key" : undefined,
      spawnProcess: (
        command: string,
        args: readonly string[],
        options: SpawnOptionsWithoutStdio,
      ): ChildProcessWithoutNullStreams => {
        lastSpawnCall = {
          command,
          args: [...args],
          env: { ...(options.env ?? {}) },
        };

        const child = spawn(command, args, {
          ...options,
          stdio: ["ignore", "pipe", "pipe"],
        });
        spawnedChild = child;
        return child;
      },
    });

    const statusSubscription = adapter.onStatusChange((status: KernelStatus): void => {
      statusStates.push(status.state);
    });

    try {
      await adapter.start(createAgentConfig());

      assert.ok(lastSpawnCall);
      assert.equal(lastSpawnCall.command, process.execPath);
      assert.equal(lastSpawnCall.env.DEEPSEEK_API_KEY, "deepseek-test-key");

      const configPath = extractConfigPath(lastSpawnCall.args);
      const translatedConfigRaw = await readFile(configPath, "utf8");
      assert.match(translatedConfigRaw, /"model":\s*"deepseek\/deepseek-chat"/);

      const runningStatus = adapter.getStatus();
      assert.equal(runningStatus.state, "running");
      assert.ok(runningStatus.activeAgents >= 1);
      assert.ok(runningStatus.uptime >= 0);

      const health = await adapter.getHealth();
      assert.equal(health.activeConnections, 1);
      assert.equal(health.endpoints.length, 1);
      assert.equal(health.endpoints[0]?.provider, "deepseek");
      assert.equal(health.endpoints[0]?.status, "ok");

      await adapter.stop();

      const stoppedStatus = adapter.getStatus();
      assert.equal(stoppedStatus.state, "stopped");
      assert.equal(stoppedStatus.activeAgents, 0);
      assert.equal(stoppedStatus.uptime, 0);

      assert.ok(statusStates.includes("starting"));
      assert.ok(statusStates.includes("running"));
      assert.ok(statusStates.includes("stopping"));
      assert.ok(statusStates.includes("stopped"));

      await waitFor(
        (): boolean =>
          spawnedChild !== null &&
          (spawnedChild.exitCode !== null || spawnedChild.signalCode !== null),
        2_000,
      );
    } finally {
      statusSubscription.dispose();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

function createMockOpenClawScript(): string {
  return [
    "import { readFileSync } from \"node:fs\";",
    "",
    "const args = process.argv.slice(2);",
    "const configFlagIndex = args.indexOf(\"--config\");",
    "if (configFlagIndex === -1 || configFlagIndex === args.length - 1) {",
    "  process.stderr.write(\"missing --config\\n\");",
    "  process.exit(2);",
    "}",
    "",
    "const configPath = args[configFlagIndex + 1];",
    "const configJson = readFileSync(configPath, \"utf8\");",
    "JSON.parse(configJson);",
    "",
    "process.stdout.write(",
    "  JSON.stringify({",
    "    level: \"info\",",
    "    message: \"mock openclaw started\",",
    "    activeAgents: 2,",
    "  }) + \"\\n\",",
    ");",
    "",
    "const keepAliveTimer = setInterval(() => {}, 250);",
    "",
    "process.on(\"SIGTERM\", () => {",
    "  clearInterval(keepAliveTimer);",
    "  process.stdout.write(",
    "    JSON.stringify({",
    "      level: \"info\",",
    "      message: \"mock openclaw stopping\",",
    "      activeAgents: 0,",
    "    }) + \"\\n\",",
    "  );",
    "  process.exit(0);",
    "});",
  ].join("\n");
}

function extractConfigPath(args: readonly string[]): string {
  const configFlagIndex = args.indexOf("--config");
  assert.notEqual(configFlagIndex, -1, "expected --config argument");

  const configPath = args[configFlagIndex + 1];
  assert.ok(configPath, "expected config path argument");
  return configPath;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  pollIntervalMs = 20,
): Promise<void> {
  const startAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startAt >= timeoutMs) {
      throw new Error(`Condition was not met within ${timeoutMs}ms.`);
    }
    await sleep(pollIntervalMs);
  }
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise<void>((resolve): void => {
    setTimeout(resolve, durationMs);
  });
}

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
          models: ["deepseek-chat"],
        },
      ],
      fallbackChain: ["deepseek"],
      defaultModel: "deepseek/deepseek-chat",
      perModelSettings: {},
    },
    concurrency: {
      maxConcurrent: 4,
      subagents: {
        maxConcurrent: 8,
        maxSpawnDepth: 1,
        maxChildrenPerAgent: 5,
      },
    },
    skills: [
      {
        id: "search",
        enabled: true,
        options: {
          provider: "builtin",
        },
      },
    ],
    workspacePaths: [
      {
        hostPath: "/tmp",
        containerPath: "/workspace",
        readonly: false,
      },
    ],
    timeoutSeconds: 30,
  };
}
