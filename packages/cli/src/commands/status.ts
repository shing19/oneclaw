import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { stdout as output } from "node:process";

import type { Command } from "commander";

import {
  ConfigManager,
  type KernelStatus,
  type OneclawConfigPaths,
} from "../../../core/src/index.js";
import {
  formatStatusError,
  formatStatusSummary,
  type AgentHealthStatus,
  type CliLocale,
  type StatusFormatterOptions,
  type StatusSummary,
} from "../formatters/status.js";

type CliGlobalOptions = StatusFormatterOptions;

interface RuntimeFilePaths {
  pidFilePath: string;
  stateFilePath: string;
  logFilePath: string;
}

interface RuntimeState {
  mode: "foreground" | "daemon";
  pid: number;
  state: KernelStatus["state"];
  model: string;
  configPath: string;
  startedAt: string;
  updatedAt: string;
  lastError?: string;
}

const DAEMON_PID_FILE_NAME = "agent-daemon.pid";
const DAEMON_STATE_FILE_NAME = "agent-daemon-state.json";
const DAEMON_LOG_FILE_NAME = "agent-daemon.log";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show agent status, health and current model / 显示 Agent 状态、健康和当前模型")
    .action(async (_options: unknown, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await resolveStatusSummary(locale);
        output.write(formatStatusSummary(summary, globalOptions));
      } catch (error: unknown) {
        output.write(formatStatusError(toErrorMessage(error, locale), globalOptions));
        process.exitCode = 1;
      }
    });
}

async function resolveStatusSummary(locale: CliLocale): Promise<StatusSummary> {
  const configManager = new ConfigManager({ locale });
  const paths = configManager.getPaths();
  const runtimeFiles = toRuntimeFilePaths(paths);

  const runtimeState = await readRuntimeState(runtimeFiles.stateFilePath);
  const pidFromFile = await readPid(runtimeFiles.pidFilePath);
  const pid = resolvePid(runtimeState, pidFromFile);
  const pidAlive = pid !== null && isProcessAlive(pid);
  const state = resolveState(runtimeState, pidAlive);
  const running = pidAlive && (state === "starting" || state === "running" || state === "stopping");
  const health = resolveHealthStatus(state, running, pidAlive, runtimeState?.lastError);
  const message = resolveMessage(locale, state, running, pidAlive, health);

  const startedAt = runtimeState?.startedAt ?? null;
  const updatedAt = runtimeState?.updatedAt ?? null;
  const uptimeMs = computeUptimeMs(startedAt, running);
  const defaultModel = await readConfiguredDefaultModel(configManager);
  const currentModel = runtimeState?.model ?? defaultModel ?? "unknown";
  const configPath = runtimeState?.configPath ?? paths.configFilePath;

  return {
    running,
    state,
    health,
    mode: runtimeState?.mode ?? "unknown",
    pid,
    pidAlive,
    currentModel,
    configPath,
    pidFilePath: runtimeFiles.pidFilePath,
    stateFilePath: runtimeFiles.stateFilePath,
    logFilePath: runtimeFiles.logFilePath,
    startedAt,
    updatedAt,
    uptimeMs,
    lastError: runtimeState?.lastError,
    message,
  };
}

async function readConfiguredDefaultModel(
  configManager: ConfigManager,
): Promise<string | undefined> {
  try {
    const config = await configManager.load();
    return config.models.defaultModel;
  } catch (_error: unknown) {
    return undefined;
  }
}

function resolvePid(runtimeState: RuntimeState | null, pidFromFile: number | null): number | null {
  if (pidFromFile !== null) {
    return pidFromFile;
  }

  if (runtimeState !== null && isActiveState(runtimeState.state)) {
    return runtimeState.pid;
  }

  return null;
}

function resolveState(runtimeState: RuntimeState | null, pidAlive: boolean): KernelStatus["state"] {
  if (runtimeState !== null) {
    if (runtimeState.state !== "stopped") {
      return runtimeState.state;
    }
    if (pidAlive) {
      return "running";
    }
    return "stopped";
  }

  return pidAlive ? "running" : "stopped";
}

function resolveHealthStatus(
  state: KernelStatus["state"],
  running: boolean,
  pidAlive: boolean,
  lastError: string | undefined,
): AgentHealthStatus {
  if (!pidAlive) {
    return state === "stopped" ? "unreachable" : "degraded";
  }

  if (lastError !== undefined && lastError.length > 0) {
    return "degraded";
  }

  if (running && state === "running") {
    return "ok";
  }

  return "degraded";
}

function resolveMessage(
  locale: CliLocale,
  state: KernelStatus["state"],
  running: boolean,
  pidAlive: boolean,
  health: AgentHealthStatus,
): string {
  if (!pidAlive && state === "stopped") {
    return text(locale, "Agent is not running.", "Agent 当前未运行。");
  }

  if (!pidAlive) {
    return text(
      locale,
      "Agent process is not alive, but runtime state is active.",
      "Agent 进程已不存在，但运行时状态仍显示为活跃。",
    );
  }

  if (running && health === "ok") {
    return text(locale, "Agent is running normally.", "Agent 正在正常运行。");
  }

  return text(
    locale,
    "Agent is running with warnings.",
    "Agent 正在运行，但存在警告。",
  );
}

function computeUptimeMs(startedAt: string | null, running: boolean): number | null {
  if (!running || startedAt === null) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);
  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  return Math.max(0, Date.now() - startedAtMs);
}

function isActiveState(state: KernelStatus["state"]): boolean {
  return state === "starting" || state === "running" || state === "stopping";
}

function toRuntimeFilePaths(paths: OneclawConfigPaths): RuntimeFilePaths {
  return {
    pidFilePath: join(paths.dataDir, DAEMON_PID_FILE_NAME),
    stateFilePath: join(paths.dataDir, DAEMON_STATE_FILE_NAME),
    logFilePath: join(paths.dataDir, DAEMON_LOG_FILE_NAME),
  };
}

async function readRuntimeState(stateFilePath: string): Promise<RuntimeState | null> {
  try {
    const raw = await readFile(stateFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return toRuntimeState(parsed);
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }
    return null;
  }
}

function toRuntimeState(value: unknown): RuntimeState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode;
  const state = candidate.state;
  const pid = candidate.pid;
  const model = candidate.model;
  const configPath = candidate.configPath;
  const startedAt = candidate.startedAt;
  const updatedAt = candidate.updatedAt;
  const lastError = candidate.lastError;

  if (mode !== "foreground" && mode !== "daemon") {
    return null;
  }
  if (!isKernelState(state)) {
    return null;
  }
  if (!Number.isInteger(pid) || typeof pid !== "number" || pid <= 0) {
    return null;
  }

  if (
    typeof model !== "string" ||
    model.length === 0 ||
    typeof configPath !== "string" ||
    configPath.length === 0 ||
    typeof startedAt !== "string" ||
    startedAt.length === 0 ||
    typeof updatedAt !== "string" ||
    updatedAt.length === 0
  ) {
    return null;
  }

  if (lastError !== undefined && typeof lastError !== "string") {
    return null;
  }

  return {
    mode,
    pid,
    state,
    model,
    configPath,
    startedAt,
    updatedAt,
    lastError,
  };
}

function isKernelState(value: unknown): value is KernelStatus["state"] {
  return (
    value === "starting" ||
    value === "running" ||
    value === "stopping" ||
    value === "stopped" ||
    value === "error"
  );
}

async function readPid(pidFilePath: string): Promise<number | null> {
  try {
    const raw = (await readFile(pidFilePath, "utf8")).trim();
    if (raw.length === 0) {
      return null;
    }

    const pid = Number.parseInt(raw, 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      return null;
    }

    return pid;
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (hasErrorCode(error, "EPERM")) {
      return true;
    }
    return false;
  }
}

function resolveGlobalOptions(command: Command): CliGlobalOptions {
  const options = command.optsWithGlobals<{
    json?: unknown;
    quiet?: unknown;
    locale?: unknown;
  }>();

  return {
    json: options.json === true,
    quiet: options.quiet === true,
    locale: normalizeLocale(options.locale),
  };
}

function normalizeLocale(value: unknown): CliLocale {
  return value === "en" ? "en" : "zh-CN";
}

function text(locale: CliLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function toErrorMessage(error: unknown, locale: CliLocale): string {
  if (error instanceof Error) {
    return error.message;
  }

  return text(
    locale,
    `Unexpected error: ${String(error)}`,
    `未知错误：${String(error)}`,
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    (error as { code: string }).code === code
  );
}
