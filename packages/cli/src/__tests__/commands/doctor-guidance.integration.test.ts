import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
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

interface DoctorCheckResult {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  summary: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

interface DoctorReport {
  ok: boolean;
  overall: "pass" | "warn" | "fail";
  checks: DoctorCheckResult[];
  passed: number;
  warned: number;
  failed: number;
  message: string;
}

const mockSecretValues = new Map<string, string>();

vi.mock("../../../../core/src/index.js", async () => {
  const actual = await import("../../../../core/src/index.js");

  return {
    ...actual,
    createSecretStore: async (): Promise<MockSecretStore> => ({
      set: async (key: string, value: string): Promise<void> => {
        mockSecretValues.set(key, value);
      },
      get: async (key: string): Promise<string | null> =>
        mockSecretValues.get(key) ?? null,
      delete: async (key: string): Promise<void> => {
        mockSecretValues.delete(key);
      },
      has: async (key: string): Promise<boolean> => mockSecretValues.has(key),
      list: async (): Promise<string[]> => [...mockSecretValues.keys()].sort(),
    }),
  };
});

interface CliCommandResult {
  output: string;
  exitCode: number;
}

async function runCliCommand(args: readonly string[]): Promise<CliCommandResult> {
  const previousExitCode = process.exitCode;
  const previousWrite = process.stdout.write;
  const outputChunks: string[] = [];

  process.stdout.write = ((
    chunk: string | Uint8Array,
    cb?: (error?: Error | null) => void,
  ) => {
    const text =
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
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

function parseJsonReport(output: string): DoctorReport {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  assert.ok(start >= 0 && end >= start, `Expected JSON output, received: ${output}`);
  return JSON.parse(output.slice(start, end + 1)) as DoctorReport;
}

function findCheck(report: DoctorReport, id: string): DoctorCheckResult {
  const check = report.checks.find((c) => c.id === id);
  assert.ok(check, `Expected check "${id}" in report`);
  return check;
}

describe("doctor command failure guidance (bilingual)", () => {
  async function runDoctorWithMissingConfig(locale: "en" | "zh-CN"): Promise<{
    report: DoctorReport;
    tempRoot: string;
  }> {
    mockSecretValues.clear();
    const tempRoot = await mkdtemp(join(tmpdir(), "oneclaw-doctor-"));
    const configPath = join(tempRoot, "config.json");
    // Do NOT create config.json — simulates missing config
    const original = process.env.ONECLAW_CONFIG_PATH;

    try {
      process.env.ONECLAW_CONFIG_PATH = configPath;
      const result = await runCliCommand([
        "--locale",
        locale,
        "--json",
        "doctor",
        "--skip-network",
      ]);
      // doctor exits 1 when failures are found
      assert.equal(result.exitCode, 1);
      return { report: parseJsonReport(result.output), tempRoot };
    } finally {
      if (original === undefined) {
        delete process.env.ONECLAW_CONFIG_PATH;
      } else {
        process.env.ONECLAW_CONFIG_PATH = original;
      }
    }
  }

  async function runDoctorWithInvalidJson(locale: "en" | "zh-CN"): Promise<{
    report: DoctorReport;
    tempRoot: string;
  }> {
    mockSecretValues.clear();
    const tempRoot = await mkdtemp(join(tmpdir(), "oneclaw-doctor-"));
    const configPath = join(tempRoot, "config.json");
    await writeFile(configPath, "{ not valid json !!!", "utf8");
    const original = process.env.ONECLAW_CONFIG_PATH;

    try {
      process.env.ONECLAW_CONFIG_PATH = configPath;
      const result = await runCliCommand([
        "--locale",
        locale,
        "--json",
        "doctor",
        "--skip-network",
      ]);
      assert.equal(result.exitCode, 1);
      return { report: parseJsonReport(result.output), tempRoot };
    } finally {
      if (original === undefined) {
        delete process.env.ONECLAW_CONFIG_PATH;
      } else {
        process.env.ONECLAW_CONFIG_PATH = original;
      }
    }
  }

  async function runDoctorWithStalePid(locale: "en" | "zh-CN"): Promise<{
    report: DoctorReport;
    tempRoot: string;
  }> {
    mockSecretValues.clear();
    mockSecretValues.set("oneclaw/provider/deepseek/api-key-1", "test-key");
    const tempRoot = await mkdtemp(join(tmpdir(), "oneclaw-doctor-"));
    const configPath = join(tempRoot, "config.json");
    const dataDir = join(tempRoot, "data");
    await mkdir(dataDir, { recursive: true });

    // Write a valid config
    const validConfig = {
      models: {
        defaultModel: "deepseek/deepseek-chat",
        providers: [
          {
            id: "deepseek",
            name: "DeepSeek",
            enabled: true,
            protocol: "openai-chat",
            baseUrl: "https://api.deepseek.com/v1",
            models: ["deepseek-chat"],
            credentialRef: "oneclaw/provider/deepseek/api-key-1",
          },
        ],
      },
      channels: {},
    };
    await writeFile(configPath, JSON.stringify(validConfig, null, 2), "utf8");

    // Write a PID file with a dead PID (99999999 should not be alive)
    await writeFile(join(dataDir, "agent-daemon.pid"), "99999999", "utf8");
    // Write a state file referencing the dead PID
    await writeFile(
      join(dataDir, "agent-daemon-state.json"),
      JSON.stringify({
        mode: "daemon",
        state: "running",
        pid: 99999999,
        model: "deepseek/deepseek-chat",
        configPath,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const original = process.env.ONECLAW_CONFIG_PATH;

    try {
      process.env.ONECLAW_CONFIG_PATH = configPath;
      const result = await runCliCommand([
        "--locale",
        locale,
        "--json",
        "doctor",
        "--skip-network",
      ]);
      assert.equal(result.exitCode, 1);
      return { report: parseJsonReport(result.output), tempRoot };
    } finally {
      if (original === undefined) {
        delete process.env.ONECLAW_CONFIG_PATH;
      } else {
        process.env.ONECLAW_CONFIG_PATH = original;
      }
    }
  }

  // --- Missing config: English ---
  it("reports missing config failure guidance (en)", async () => {
    const { report, tempRoot } = await runDoctorWithMissingConfig("en");

    try {
      assert.equal(report.ok, false);
      assert.ok(report.failed > 0);

      // Config check should fail
      const configCheck = findCheck(report, "config");
      assert.equal(configCheck.status, "fail");
      assert.ok(
        configCheck.summary.includes("does not exist"),
        `Expected English summary, got: ${configCheck.summary}`,
      );
      assert.ok(
        configCheck.suggestion?.includes("oneclaw init"),
        `Expected English suggestion with 'oneclaw init', got: ${configCheck.suggestion}`,
      );

      // All titles should be in English
      for (const check of report.checks) {
        assert.ok(
          /^[A-Za-z]/.test(check.title),
          `Expected English title, got: ${check.title}`,
        );
      }

      // Report message should be in English
      assert.ok(
        report.message.includes("blocking issues") || report.message.includes("warnings"),
        `Expected English report message, got: ${report.message}`,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  // --- Missing config: Chinese ---
  it("reports missing config failure guidance (zh-CN)", async () => {
    const { report, tempRoot } = await runDoctorWithMissingConfig("zh-CN");

    try {
      assert.equal(report.ok, false);
      assert.ok(report.failed > 0);

      const configCheck = findCheck(report, "config");
      assert.equal(configCheck.status, "fail");
      assert.ok(
        configCheck.summary.includes("不存在"),
        `Expected Chinese summary, got: ${configCheck.summary}`,
      );
      assert.ok(
        configCheck.suggestion?.includes("oneclaw init"),
        `Expected Chinese suggestion with 'oneclaw init', got: ${configCheck.suggestion}`,
      );

      // Check titles should be in Chinese
      const configTitle = configCheck.title;
      assert.ok(
        configTitle.includes("配置"),
        `Expected Chinese title, got: ${configTitle}`,
      );

      // Report message should be in Chinese
      assert.ok(
        report.message.includes("阻塞") || report.message.includes("警告"),
        `Expected Chinese report message, got: ${report.message}`,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  // --- Invalid JSON config: English ---
  it("reports invalid JSON config failure guidance (en)", async () => {
    const { report, tempRoot } = await runDoctorWithInvalidJson("en");

    try {
      assert.equal(report.ok, false);

      const configCheck = findCheck(report, "config");
      assert.equal(configCheck.status, "fail");
      assert.ok(
        configCheck.summary.includes("invalid JSON"),
        `Expected English JSON error summary, got: ${configCheck.summary}`,
      );
      assert.ok(
        configCheck.suggestion?.includes("config validate"),
        `Expected English suggestion with 'config validate', got: ${configCheck.suggestion}`,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  // --- Invalid JSON config: Chinese ---
  it("reports invalid JSON config failure guidance (zh-CN)", async () => {
    const { report, tempRoot } = await runDoctorWithInvalidJson("zh-CN");

    try {
      assert.equal(report.ok, false);

      const configCheck = findCheck(report, "config");
      assert.equal(configCheck.status, "fail");
      assert.ok(
        configCheck.summary.includes("JSON 格式不合法"),
        `Expected Chinese JSON error summary, got: ${configCheck.summary}`,
      );
      assert.ok(
        configCheck.suggestion?.includes("config validate"),
        `Expected Chinese suggestion with 'config validate', got: ${configCheck.suggestion}`,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  // --- Stale PID: English ---
  it("reports stale PID runtime failure guidance (en)", async () => {
    const { report, tempRoot } = await runDoctorWithStalePid("en");

    try {
      const runtimeCheck = findCheck(report, "runtime");
      assert.equal(runtimeCheck.status, "fail");
      assert.ok(
        runtimeCheck.summary.includes("not alive") ||
          runtimeCheck.summary.includes("PID exists"),
        `Expected English stale PID summary, got: ${runtimeCheck.summary}`,
      );
      assert.ok(
        runtimeCheck.suggestion?.includes("stop --force"),
        `Expected English suggestion with 'stop --force', got: ${runtimeCheck.suggestion}`,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  // --- Stale PID: Chinese ---
  it("reports stale PID runtime failure guidance (zh-CN)", async () => {
    const { report, tempRoot } = await runDoctorWithStalePid("zh-CN");

    try {
      const runtimeCheck = findCheck(report, "runtime");
      assert.equal(runtimeCheck.status, "fail");
      assert.ok(
        runtimeCheck.summary.includes("已不存在") ||
          runtimeCheck.summary.includes("PID"),
        `Expected Chinese stale PID summary, got: ${runtimeCheck.summary}`,
      );
      assert.ok(
        runtimeCheck.suggestion?.includes("stop --force"),
        `Expected Chinese suggestion with 'stop --force', got: ${runtimeCheck.suggestion}`,
      );

      // Verify runtime check title is Chinese
      assert.ok(
        runtimeCheck.title.includes("进程"),
        `Expected Chinese runtime title, got: ${runtimeCheck.title}`,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  // --- Verify all check IDs are present with guidance ---
  it("surfaces all 6 health check categories with suggestions (en)", async () => {
    const { report, tempRoot } = await runDoctorWithMissingConfig("en");

    try {
      const checkIds = report.checks.map((c) => c.id);
      assert.ok(checkIds.includes("filesystem"), "Missing filesystem check");
      assert.ok(checkIds.includes("config"), "Missing config check");
      assert.ok(checkIds.includes("openclaw-binary"), "Missing openclaw-binary check");
      assert.ok(checkIds.includes("runtime"), "Missing runtime check");
      assert.ok(checkIds.includes("secret-store"), "Missing secret-store check");
      assert.ok(
        checkIds.includes("provider-connectivity"),
        "Missing provider-connectivity check",
      );

      // Every non-pass check should have a suggestion
      for (const check of report.checks) {
        if (check.status !== "pass") {
          assert.ok(
            typeof check.suggestion === "string" && check.suggestion.length > 0,
            `Check "${check.id}" (${check.status}) missing suggestion`,
          );
        }
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("surfaces all 6 health check categories with suggestions (zh-CN)", async () => {
    const { report, tempRoot } = await runDoctorWithMissingConfig("zh-CN");

    try {
      const checkIds = report.checks.map((c) => c.id);
      assert.ok(checkIds.includes("filesystem"), "Missing filesystem check");
      assert.ok(checkIds.includes("config"), "Missing config check");
      assert.ok(checkIds.includes("openclaw-binary"), "Missing openclaw-binary check");
      assert.ok(checkIds.includes("runtime"), "Missing runtime check");
      assert.ok(checkIds.includes("secret-store"), "Missing secret-store check");
      assert.ok(
        checkIds.includes("provider-connectivity"),
        "Missing provider-connectivity check",
      );

      // Every non-pass check should have a suggestion
      for (const check of report.checks) {
        if (check.status !== "pass") {
          assert.ok(
            typeof check.suggestion === "string" && check.suggestion.length > 0,
            `Check "${check.id}" (${check.status}) missing suggestion (zh-CN)`,
          );
        }
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
