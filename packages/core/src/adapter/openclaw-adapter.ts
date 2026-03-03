import { randomUUID } from "node:crypto";
import {
  type ChildProcessWithoutNullStreams,
  spawn,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";

import type {
  AgentConfig,
  HealthReport,
} from "../types/agent-adapter.js";
import {
  type OpenClawConfigFile,
  resolveProviderApiKeyEnvVarName,
  translateAgentConfigToOpenClawConfig,
} from "./config-translator.js";
import {
  parseOpenClawLogLine,
  type ProcessOutputSource,
} from "./log-parser.js";
import {
  AgentKernelBase,
  type AgentKernelBaseOptions,
  toAdapterError,
} from "./agent-kernel.js";

export interface OpenClawAdapterOptions extends AgentKernelBaseOptions {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  autoRestartOnCrash?: boolean;
  maxCrashRestarts?: number;
  resolveApiKey?: (
    credentialRef: string,
  ) => Promise<string | undefined> | string | undefined;
  translateConfig?: (
    config: AgentConfig,
  ) =>
    | Promise<OpenClawConfigFile | Record<string, unknown>>
    | OpenClawConfigFile
    | Record<string, unknown>;
  spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;
}

const DEFAULT_COMMAND = "openclaw";
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;
const DEFAULT_FORCE_KILL_TIMEOUT_MS = 2_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const DEFAULT_MAX_CRASH_RESTARTS = 1;

export class OpenClawAdapter extends AgentKernelBase {
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly cwd: string | undefined;
  private readonly staticEnv: NodeJS.ProcessEnv;
  private readonly startupTimeoutMs: number;
  private readonly stopTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly autoRestartOnCrash: boolean;
  private readonly maxCrashRestarts: number;
  private readonly resolveApiKey:
    | ((
        credentialRef: string,
      ) => Promise<string | undefined> | string | undefined)
    | undefined;
  private readonly translateConfig: (
    config: AgentConfig,
  ) => Promise<OpenClawConfigFile | Record<string, unknown>>;
  private readonly spawnProcess: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;

  private process: ChildProcessWithoutNullStreams | null;
  private processStdoutReader: Interface | null;
  private processStderrReader: Interface | null;
  private runtimeDirectory: string | null;
  private intentionalStop: boolean;
  private crashRestartCount: number;
  private recoveringFromCrash: boolean;
  private heartbeatTimer: NodeJS.Timeout | null;
  private lastHeartbeatLatencyMs: number;

  constructor(options: OpenClawAdapterOptions = {}) {
    super(options);

    this.command = options.command ?? DEFAULT_COMMAND;
    this.args = options.args ?? [];
    this.cwd = options.cwd;
    this.staticEnv = {
      ...process.env,
      ...options.env,
    };
    this.startupTimeoutMs = normalizePositiveInteger(
      options.startupTimeoutMs,
      DEFAULT_STARTUP_TIMEOUT_MS,
    );
    this.stopTimeoutMs = normalizePositiveInteger(
      options.stopTimeoutMs,
      DEFAULT_STOP_TIMEOUT_MS,
    );
    this.heartbeatIntervalMs = normalizePositiveInteger(
      options.heartbeatIntervalMs,
      DEFAULT_HEARTBEAT_INTERVAL_MS,
    );
    this.autoRestartOnCrash = options.autoRestartOnCrash ?? true;
    this.maxCrashRestarts = normalizePositiveInteger(
      options.maxCrashRestarts,
      DEFAULT_MAX_CRASH_RESTARTS,
    );
    this.resolveApiKey = options.resolveApiKey;
    this.translateConfig = async (
      config: AgentConfig,
    ): Promise<OpenClawConfigFile | Record<string, unknown>> =>
      options.translateConfig?.(config) ??
      translateAgentConfigToOpenClawConfig(config);
    this.spawnProcess =
      options.spawnProcess ??
      ((command, args, spawnOptions) =>
        spawn(command, args, {
          ...spawnOptions,
          stdio: ["pipe", "pipe", "pipe"],
        }));

    this.process = null;
    this.processStdoutReader = null;
    this.processStderrReader = null;
    this.runtimeDirectory = null;
    this.intentionalStop = false;
    this.crashRestartCount = 0;
    this.recoveringFromCrash = false;
    this.heartbeatTimer = null;
    this.lastHeartbeatLatencyMs = 0;
  }

  protected override async onStart(config: AgentConfig): Promise<void> {
    if (!this.recoveringFromCrash) {
      this.crashRestartCount = 0;
    }

    this.intentionalStop = false;
    await this.cleanupRuntimeDirectory();
    this.detachProcessReaders();

    const runtimeDirectory = await mkdtemp(join(tmpdir(), "oneclaw-openclaw-"));
    this.runtimeDirectory = runtimeDirectory;

    const configPath = join(runtimeDirectory, "openclaw.json");
    const translatedConfig = await this.translateConfigOrThrow(config);
    await writeFile(configPath, JSON.stringify(translatedConfig, null, 2), "utf8");

    const env = await this.buildProcessEnv(config);
    const processArgs = [...this.args, "--config", configPath];
    const child = await this.spawnAndWaitForStartup(processArgs, env);

    this.process = child;
    this.attachProcessReaders(child);
    this.attachProcessLifecycleHandlers(child);
    this.setActiveAgents(1);
    this.startHeartbeat();

    this.emitLog({
      level: "info",
      message: `OpenClaw process started (pid=${child.pid}).`,
      timestamp: new Date(),
      traceId: randomUUID(),
      metadata: {
        pid: child.pid,
        configPath,
      },
    });
  }

  protected override async onStop(): Promise<void> {
    this.intentionalStop = true;
    this.stopHeartbeat();
    const child = this.process;
    this.process = null;

    this.detachProcessReaders();

    if (child !== null) {
      try {
        await terminateChildProcess(child, this.stopTimeoutMs);
      } catch (error: unknown) {
        throw toAdapterError("PROCESS_TIMEOUT", this.locale, error);
      }
    }

    this.setActiveAgents(0);
    await this.cleanupRuntimeDirectory();
  }

  protected override async onHealthCheck(): Promise<HealthReport> {
    const now = new Date();
    const status = this.getStatus();
    const config = this.getLastConfig();
    const providers = config?.modelConfig.providers ?? [];
    const running = status.state === "running" && this.process !== null;

    return {
      endpoints: providers.map((provider) => ({
        provider: provider.id,
        url: provider.baseUrl,
        status: running ? "ok" : "unreachable",
        latencyMs: running ? this.lastHeartbeatLatencyMs : 0,
        lastChecked: now,
      })),
      memory: {
        used: process.memoryUsage().rss,
        total: process.memoryUsage().heapTotal,
      },
      activeConnections: running ? 1 : 0,
      timestamp: now,
    };
  }

  private async translateConfigOrThrow(
    config: AgentConfig,
  ): Promise<OpenClawConfigFile | Record<string, unknown>> {
    try {
      return await this.translateConfig(config);
    } catch (error: unknown) {
      throw toAdapterError("CONFIG_TRANSLATION_FAILED", this.locale, error);
    }
  }

  private async buildProcessEnv(config: AgentConfig): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = { ...this.staticEnv };

    if (this.resolveApiKey === undefined) {
      return env;
    }

    for (const provider of config.modelConfig.providers) {
      if (!provider.enabled) {
        continue;
      }

      const resolvedKey = await this.resolveApiKey(provider.credentialRef);
      if (resolvedKey === undefined || resolvedKey.length === 0) {
        continue;
      }

      env[resolveProviderApiKeyEnvVarName(provider.id)] = resolvedKey;
    }

    return env;
  }

  private async spawnAndWaitForStartup(
    args: readonly string[],
    env: NodeJS.ProcessEnv,
  ): Promise<ChildProcessWithoutNullStreams> {
    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: this.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    };

    const child = this.spawnProcess(this.command, args, spawnOptions);

    return await waitForChildStartup(child, this.startupTimeoutMs);
  }

  private attachProcessReaders(child: ChildProcessWithoutNullStreams): void {
    this.processStdoutReader = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    this.processStderrReader = createInterface({
      input: child.stderr,
      crlfDelay: Infinity,
    });

    this.processStdoutReader.on("line", (line: string): void => {
      this.handleProcessOutput(line, "stdout");
    });
    this.processStderrReader.on("line", (line: string): void => {
      this.handleProcessOutput(line, "stderr");
    });
  }

  private detachProcessReaders(): void {
    if (this.processStdoutReader !== null) {
      this.processStdoutReader.removeAllListeners();
      this.processStdoutReader.close();
      this.processStdoutReader = null;
    }
    if (this.processStderrReader !== null) {
      this.processStderrReader.removeAllListeners();
      this.processStderrReader.close();
      this.processStderrReader = null;
    }
  }

  private attachProcessLifecycleHandlers(child: ChildProcessWithoutNullStreams): void {
    child.once("exit", (code: number | null, signal: NodeJS.Signals | null): void => {
      void this.handleProcessExit(code, signal);
    });
    child.once("error", (error: Error): void => {
      this.emitKernelCrashed(error);
    });
  }

  private async handleProcessExit(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    this.stopHeartbeat();
    this.process = null;
    this.detachProcessReaders();
    this.setActiveAgents(0);
    await this.cleanupRuntimeDirectory();

    const exitMetadata: Record<string, unknown> = {
      code,
      signal,
    };

    if (this.intentionalStop) {
      this.emitLog({
        level: "info",
        message: "OpenClaw process stopped.",
        timestamp: new Date(),
        traceId: randomUUID(),
        metadata: exitMetadata,
      });
      return;
    }

    const crashError = new Error(
      `OpenClaw process crashed unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
    );
    this.emitKernelCrashed(crashError);
    this.emitLog({
      level: "error",
      message: crashError.message,
      timestamp: new Date(),
      traceId: randomUUID(),
      metadata: exitMetadata,
    });

    if (!this.autoRestartOnCrash) {
      return;
    }

    if (this.crashRestartCount >= this.maxCrashRestarts) {
      this.emitLog({
        level: "warn",
        message: "OpenClaw crash auto-restart limit reached.",
        timestamp: new Date(),
        traceId: randomUUID(),
        metadata: {
          retries: this.crashRestartCount,
          limit: this.maxCrashRestarts,
        },
      });
      return;
    }

    const lastConfig = this.getLastConfig();
    if (lastConfig === null) {
      return;
    }

    this.crashRestartCount += 1;
    this.recoveringFromCrash = true;
    this.emitLog({
      level: "warn",
      message: "OpenClaw crashed. Attempting one automatic restart.",
      timestamp: new Date(),
      traceId: randomUUID(),
      metadata: {
        retries: this.crashRestartCount,
        limit: this.maxCrashRestarts,
      },
    });

    try {
      await this.start(lastConfig);
    } catch (error: unknown) {
      this.emitLog({
        level: "error",
        message: "OpenClaw automatic restart failed.",
        timestamp: new Date(),
        traceId: randomUUID(),
        metadata: {
          error: toSerializableError(error),
        },
      });
    } finally {
      this.recoveringFromCrash = false;
    }
  }

  private handleProcessOutput(line: string, source: ProcessOutputSource): void {
    const parsedLine = parseOpenClawLogLine(line, source);
    if (parsedLine === null) {
      return;
    }

    if (parsedLine.activeAgents !== null) {
      this.setActiveAgents(parsedLine.activeAgents);
    }

    this.emitLog(parsedLine.logEntry);

    if (parsedLine.costEvent !== null) {
      this.emitCostEvent(parsedLine.costEvent);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval((): void => {
      this.runHeartbeat();
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === null) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private runHeartbeat(): void {
    const child = this.process;
    if (child === null || !isChildAlive(child)) {
      return;
    }

    const pid = child.pid;
    if (pid === undefined) {
      return;
    }

    const startedAt = Date.now();
    try {
      process.kill(pid, 0);
      this.lastHeartbeatLatencyMs = Math.max(0, Date.now() - startedAt);
    } catch (error: unknown) {
      this.lastHeartbeatLatencyMs = 0;
      this.emitKernelCrashed(error);
    }
  }

  private async cleanupRuntimeDirectory(): Promise<void> {
    const target = this.runtimeDirectory;
    if (target === null) {
      return;
    }

    this.runtimeDirectory = null;
    await rm(target, { recursive: true, force: true });
  }
}

export function createOpenClawAdapter(
  options: OpenClawAdapterOptions = {},
): OpenClawAdapter {
  return new OpenClawAdapter(options);
}

async function waitForChildStartup(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<ChildProcessWithoutNullStreams> {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error("OpenClaw process exited before startup.");
  }

  return await new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout((): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      try {
        child.kill("SIGKILL");
      } catch {
        // Best-effort process cleanup after startup timeout.
      }
      reject(new Error(`OpenClaw process startup timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    const onSpawn = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(child);
    };

    const onError = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(
        new Error(
          `OpenClaw process exited during startup (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        ),
      );
    };

    const cleanup = (): void => {
      clearTimeout(timer);
      child.off("spawn", onSpawn);
      child.off("error", onError);
      child.off("exit", onExit);
    };

    child.once("spawn", onSpawn);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function terminateChildProcess(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  if (!isChildAlive(child)) {
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch (error: unknown) {
    throw new Error(
      `Failed to send SIGTERM to OpenClaw process: ${String(error)}`,
    );
  }

  try {
    await waitForChildExit(child, timeoutMs);
    return;
  } catch {
    // Escalate to SIGKILL after graceful termination timeout.
  }

  try {
    child.kill("SIGKILL");
  } catch (error: unknown) {
    throw new Error(
      `Failed to send SIGKILL to OpenClaw process: ${String(error)}`,
    );
  }

  await waitForChildExit(child, DEFAULT_FORCE_KILL_TIMEOUT_MS);
}

async function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<void> {
  if (!isChildAlive(child)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout((): void => {
      cleanup();
      reject(new Error(`OpenClaw process did not exit within ${timeoutMs}ms.`));
    }, timeoutMs);

    const onExit = (): void => {
      cleanup();
      resolve();
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const cleanup = (): void => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    };

    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function isChildAlive(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function toSerializableError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    value: String(error),
  };
}
