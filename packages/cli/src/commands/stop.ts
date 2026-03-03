import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stdout as output } from "node:process";

import type { Command } from "commander";

import {
  ConfigManager,
  type KernelStatus,
  type OneclawConfigPaths,
} from "../../../core/src/index.js";

type CliLocale = "zh-CN" | "en";

interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

interface StopCommandOptions {
  force?: boolean;
}

interface RuntimeFilePaths {
  pidFilePath: string;
  stateFilePath: string;
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

interface StopSummary {
  stopped: boolean;
  alreadyStopped: boolean;
  forced: boolean;
  signal: "SIGTERM" | "SIGKILL" | null;
  pid: number | null;
  mode: "foreground" | "daemon" | "unknown";
  stateFilePath: string;
  pidFilePath: string;
  message: string;
}

const DAEMON_PID_FILE_NAME = "agent-daemon.pid";
const DAEMON_STATE_FILE_NAME = "agent-daemon-state.json";
const STOP_WAIT_TIMEOUT_MS = 7_000;
const PROCESS_POLL_INTERVAL_MS = 150;

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop running agent / 停止运行中的 Agent")
    .option("-f, --force", "Force kill if graceful stop hangs / 必要时强制终止", false)
    .action(async (options: StopCommandOptions, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await stopRunningAgent(locale, options);
        emitSummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });
}

async function stopRunningAgent(
  locale: CliLocale,
  options: StopCommandOptions,
): Promise<StopSummary> {
  const configManager = new ConfigManager({ locale });
  const paths = configManager.getPaths();
  const runtimeFiles = toRuntimeFilePaths(paths);

  const runtimeState = await readRuntimeState(runtimeFiles.stateFilePath);
  const pid = await resolveTargetPid(runtimeFiles, runtimeState);

  if (pid === null) {
    await ensureStoppedState(paths, runtimeFiles, runtimeState, process.pid);
    return {
      stopped: false,
      alreadyStopped: true,
      forced: false,
      signal: null,
      pid: null,
      mode: runtimeState?.mode ?? "unknown",
      stateFilePath: runtimeFiles.stateFilePath,
      pidFilePath: runtimeFiles.pidFilePath,
      message: text(locale, "Agent is not running.", "Agent 当前未运行。"),
    };
  }

  if (!isProcessAlive(pid)) {
    await rm(runtimeFiles.pidFilePath, { force: true });
    await ensureStoppedState(paths, runtimeFiles, runtimeState, pid);
    return {
      stopped: false,
      alreadyStopped: true,
      forced: false,
      signal: null,
      pid,
      mode: runtimeState?.mode ?? "unknown",
      stateFilePath: runtimeFiles.stateFilePath,
      pidFilePath: runtimeFiles.pidFilePath,
      message: text(locale, "Agent process is already stopped.", "Agent 进程已停止。"),
    };
  }

  const forceRequested = options.force === true;
  let usedSignal: "SIGTERM" | "SIGKILL" = "SIGTERM";

  sendSignal(pid, "SIGTERM");
  const exitedGracefully = await waitForProcessExit(pid, STOP_WAIT_TIMEOUT_MS);

  if (!exitedGracefully) {
    if (!forceRequested) {
      throw new Error(
        text(
          locale,
          "Agent did not stop in time. Re-run with --force.",
          "Agent 未在超时时间内停止，请使用 --force 重试。",
        ),
      );
    }

    sendSignal(pid, "SIGKILL");
    usedSignal = "SIGKILL";

    const exitedAfterKill = await waitForProcessExit(pid, STOP_WAIT_TIMEOUT_MS);
    if (!exitedAfterKill) {
      throw new Error(
        text(
          locale,
          "Failed to stop agent process after SIGKILL.",
          "发送 SIGKILL 后仍未能停止 Agent 进程。",
        ),
      );
    }
  }

  await rm(runtimeFiles.pidFilePath, { force: true });
  await ensureStoppedState(paths, runtimeFiles, runtimeState, pid);

  return {
    stopped: true,
    alreadyStopped: false,
    forced: usedSignal === "SIGKILL",
    signal: usedSignal,
    pid,
    mode: runtimeState?.mode ?? "unknown",
    stateFilePath: runtimeFiles.stateFilePath,
    pidFilePath: runtimeFiles.pidFilePath,
    message:
      usedSignal === "SIGKILL"
        ? text(locale, "Agent was force-stopped.", "Agent 已被强制停止。")
        : text(locale, "Agent stopped successfully.", "Agent 已成功停止。"),
  };
}

async function resolveTargetPid(
  runtimeFiles: RuntimeFilePaths,
  runtimeState: RuntimeState | null,
): Promise<number | null> {
  const pidFromFile = await readPid(runtimeFiles.pidFilePath);
  if (pidFromFile !== null) {
    return pidFromFile;
  }

  if (runtimeState !== null && isActiveState(runtimeState.state) && runtimeState.pid > 0) {
    return runtimeState.pid;
  }

  return null;
}

function isActiveState(state: KernelStatus["state"]): boolean {
  return state === "starting" || state === "running" || state === "stopping";
}

function toRuntimeFilePaths(paths: OneclawConfigPaths): RuntimeFilePaths {
  return {
    pidFilePath: join(paths.dataDir, DAEMON_PID_FILE_NAME),
    stateFilePath: join(paths.dataDir, DAEMON_STATE_FILE_NAME),
  };
}

async function ensureStoppedState(
  paths: OneclawConfigPaths,
  runtimeFiles: RuntimeFilePaths,
  currentState: RuntimeState | null,
  pid: number,
): Promise<void> {
  await mkdir(paths.dataDir, { recursive: true });

  const now = new Date().toISOString();
  const nextState: RuntimeState = {
    mode: currentState?.mode ?? "daemon",
    pid,
    state: "stopped",
    model: currentState?.model ?? "unknown",
    configPath: currentState?.configPath ?? paths.configFilePath,
    startedAt: currentState?.startedAt ?? now,
    updatedAt: now,
    lastError: currentState?.lastError,
  };

  await writeRuntimeState(runtimeFiles.stateFilePath, nextState);
}

async function writeRuntimeState(
  stateFilePath: string,
  state: RuntimeState,
): Promise<void> {
  await writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function readRuntimeState(
  stateFilePath: string,
): Promise<RuntimeState | null> {
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

function sendSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (error: unknown) {
    if (hasErrorCode(error, "ESRCH")) {
      return;
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

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await sleep(PROCESS_POLL_INTERVAL_MS);
  }

  return !isProcessAlive(pid);
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, durationMs);
  });
}

function emitSummary(options: CliGlobalOptions, summary: StopSummary): void {
  if (options.json) {
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (options.quiet) {
    return;
  }

  output.write(`${summary.message}\n`);

  if (summary.pid !== null) {
    output.write(`${text(options.locale, "PID", "进程 PID")}: ${String(summary.pid)}\n`);
  }

  output.write(`${text(options.locale, "Mode", "模式")}: ${summary.mode}\n`);

  if (summary.signal !== null) {
    output.write(`${text(options.locale, "Signal", "信号")}: ${summary.signal}\n`);
  }

  output.write(
    `${text(options.locale, "State", "状态文件")}: ${summary.stateFilePath}\n`,
  );
}

function emitError(options: CliGlobalOptions, message: string): void {
  if (options.json) {
    output.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    return;
  }

  output.write(`${message}\n`);
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
