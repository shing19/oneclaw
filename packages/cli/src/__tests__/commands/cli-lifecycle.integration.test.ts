import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, vi } from "vitest";

interface MockSecretStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  list(): Promise<string[]>;
}

interface CliCommandResult {
  output: string;
  exitCode: number;
}

interface StartSummary {
  pid: number;
  model: string;
}

interface StatusSummary {
  pid: number | null;
  mode: "foreground" | "daemon" | "unknown";
  state: "starting" | "running" | "stopping" | "stopped" | "error";
  currentModel: string;
}

interface StopSummary {
  pid: number | null;
  stopped: boolean;
}

const mockPromptAnswers: string[] = [];
const mockSecretValues = new Map<string, string>();

vi.mock("node:readline/promises", async () => {
  const actual = await import("node:readline/promises");

  return {
    ...actual,
    createInterface: () => ({
      question: async (_query: string): Promise<string> => {
        const next = mockPromptAnswers.shift();
        if (next === undefined) {
          throw new Error("No queued mocked answer for readline question.");
        }
        return next;
      },
      close: (): void => {
        // no-op for mocked interface
      },
    }),
  };
});

vi.mock("../../../../core/src/index.js", async () => {
  const actual = await import("../../../../core/src/index.js");

  return {
    ...actual,
    createSecretStore: async (): Promise<MockSecretStore> => createMockSecretStore(),
  };
});

describe("cli integration lifecycle", () => {
  it("runs init -> start -> status -> stop", async () => {
    mockPromptAnswers.length = 0;
    mockSecretValues.clear();

    const tempRoot = await mkdtemp(join(tmpdir(), "oneclaw-cli-integration-"));
    const configPath = join(tempRoot, "config.json");
    const daemonRunnerPath = join(tempRoot, "mock-daemon-runner.mjs");

    const originalConfigPath = process.env.ONECLAW_CONFIG_PATH;
    const originalArgv1 = process.argv[1] ?? "oneclaw";
    const originalStdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const originalStdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    let daemonPid: number | null = null;

    try {
      process.env.ONECLAW_CONFIG_PATH = configPath;
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: true,
      });
      Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: true,
      });

      await writeFile(
        daemonRunnerPath,
        [
          "process.on('SIGTERM', () => process.exit(0));",
          "process.on('SIGINT', () => process.exit(0));",
          "setInterval(() => {}, 1000);",
        ].join("\n"),
        "utf8",
      );
      await chmod(daemonRunnerPath, 0o755);

      mockPromptAnswers.push("1", "1", "test-api-key", "test-secret-password");
      const initResult = await runCliCommand([
        "--locale",
        "en",
        "init",
        "--skip-connection-test",
      ]);
      assert.equal(initResult.exitCode, 0);

      const configRaw = await readFile(configPath, "utf8");
      const config = JSON.parse(configRaw) as {
        models?: {
          defaultModel?: unknown;
        };
      };
      assert.equal(config.models?.defaultModel, "deepseek/deepseek-chat");
      assert.equal(
        mockSecretValues.get("oneclaw/provider/deepseek/api-key-1"),
        "test-api-key",
      );

      process.argv[1] = daemonRunnerPath;
      const startResult = await runCliCommand([
        "--locale",
        "en",
        "--json",
        "start",
        "--daemon",
      ]);
      assert.equal(startResult.exitCode, 0);

      const startSummary = parseJsonFromOutput(startResult.output) as StartSummary;
      assert.ok(startSummary.pid > 0);
      assert.equal(startSummary.model, "deepseek/deepseek-chat");
      daemonPid = startSummary.pid;

      const statusResult = await runCliCommand(["--locale", "en", "--json", "status"]);
      assert.equal(statusResult.exitCode, 0);

      const statusSummary = parseJsonFromOutput(statusResult.output) as StatusSummary;
      assert.equal(statusSummary.pid, daemonPid);
      assert.equal(statusSummary.mode, "daemon");
      assert.equal(statusSummary.currentModel, "deepseek/deepseek-chat");
      assert.ok(
        statusSummary.state === "starting" ||
          statusSummary.state === "running" ||
          statusSummary.state === "stopping",
      );

      const stopResult = await runCliCommand(["--locale", "en", "--json", "stop"]);
      assert.equal(stopResult.exitCode, 0);

      const stopSummary = parseJsonFromOutput(stopResult.output) as StopSummary;
      assert.equal(stopSummary.pid, daemonPid);
      assert.equal(stopSummary.stopped, true);

      assert.equal(isProcessAlive(daemonPid), false);
    } finally {
      if (daemonPid !== null && isProcessAlive(daemonPid)) {
        process.kill(daemonPid, "SIGKILL");
      }

      restoreTtyDescriptor(process.stdin, originalStdinDescriptor);
      restoreTtyDescriptor(process.stdout, originalStdoutDescriptor);

      process.argv[1] = originalArgv1;
      if (originalConfigPath === undefined) {
        delete process.env.ONECLAW_CONFIG_PATH;
      } else {
        process.env.ONECLAW_CONFIG_PATH = originalConfigPath;
      }

      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function createMockSecretStore(): MockSecretStore {
  return {
    set: async (key: string, value: string): Promise<void> => {
      mockSecretValues.set(key, value);
    },
    get: async (key: string): Promise<string | null> => mockSecretValues.get(key) ?? null,
    delete: async (key: string): Promise<void> => {
      mockSecretValues.delete(key);
    },
    has: async (key: string): Promise<boolean> => mockSecretValues.has(key),
    list: async (): Promise<string[]> => [...mockSecretValues.keys()].sort(),
  };
}

async function runCliCommand(args: readonly string[]): Promise<CliCommandResult> {
  const previousExitCode = process.exitCode;
  const previousWrite = process.stdout.write;
  const outputChunks: string[] = [];

  process.stdout.write = ((chunk: string | Uint8Array, cb?: (error?: Error | null) => void) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    outputChunks.push(text);
    cb?.(null);
    return true;
  }) as typeof process.stdout.write;

  process.exitCode = 0;
  try {
    const { runCli } = await import("../../index.js");
    await runCli(["node", "oneclaw", ...args]);
  } finally {
    process.stdout.write = previousWrite;
  }

  const exitCode = process.exitCode ?? 0;
  process.exitCode = previousExitCode;
  return {
    output: outputChunks.join(""),
    exitCode,
  };
}

function parseJsonFromOutput(output: string): unknown {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  assert.ok(start >= 0 && end >= start, `Expected JSON output, received: ${output}`);

  const raw = output.slice(start, end + 1);
  return JSON.parse(raw) as unknown;
}

function restoreTtyDescriptor(
  target: NodeJS.ReadStream | NodeJS.WriteStream,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    delete (target as { isTTY?: boolean }).isTTY;
    return;
  }
  Object.defineProperty(target, "isTTY", descriptor);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
