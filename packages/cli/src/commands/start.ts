import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import type { Command } from "commander";

import {
  ConfigManager,
  OpenClawAdapter,
  createSecretStore,
  type AgentConfig,
  type KernelStatus,
  type LogEntry,
  type OneclawConfig,
  type OneclawConfigPaths,
  type SecretStore,
  type ValidationLocale,
} from "../../../core/src/index.js";

type CliLocale = "zh-CN" | "en";

interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

interface StartCommandOptions {
  daemon?: boolean;
  openclawBin?: string;
}

interface DaemonRunnerOptions {
  openclawBin?: string;
}

interface RuntimeFilePaths {
  pidFilePath: string;
  stateFilePath: string;
  logFilePath: string;
}

interface StartSummary {
  mode: "foreground" | "daemon";
  pid: number;
  model: string;
  configPath: string;
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

interface SignalWaitHandle {
  wait: Promise<NodeJS.Signals>;
  dispose(): void;
}

interface ForegroundStartContext {
  globalOptions: CliGlobalOptions;
  commandOptions: StartCommandOptions;
}

const INTERNAL_DAEMON_COMMAND = "__run-agent-daemon";
const DAEMON_PID_FILE_NAME = "agent-daemon.pid";
const DAEMON_STATE_FILE_NAME = "agent-daemon-state.json";
const DAEMON_LOG_FILE_NAME = "agent-daemon.log";
const DEFAULT_OPENCLAW_BIN = "openclaw";
const SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start agent in foreground or daemon mode / 启动 Agent（前台或守护）")
    .option("-d, --daemon", "Run as daemon / 以守护进程模式运行", false)
    .option(
      "--openclaw-bin <path>",
      "Override OpenClaw executable path / 指定 OpenClaw 可执行文件路径",
    )
    .action(async (options: StartCommandOptions, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      try {
        const summary =
          options.daemon === true
            ? await startDaemon(globalOptions, options)
            : await startForeground({
                globalOptions,
                commandOptions: options,
              });
        emitSummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, globalOptions.locale));
        process.exitCode = 1;
      }
    });

  program
    .command(INTERNAL_DAEMON_COMMAND, { hidden: true })
    .description("Internal daemon runner / 内部守护进程命令")
    .option(
      "--openclaw-bin <path>",
      "Override OpenClaw executable path / 指定 OpenClaw 可执行文件路径",
    )
    .action(async (options: DaemonRunnerOptions, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      try {
        await runDaemonProcess(globalOptions.locale, options);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, globalOptions.locale));
        process.exitCode = 1;
      }
    });
}

async function startForeground(context: ForegroundStartContext): Promise<StartSummary> {
  const { globalOptions, commandOptions } = context;
  const locale = globalOptions.locale;
  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const paths = configManager.getPaths();
  const runtimeFiles = toRuntimeFilePaths(paths);
  const model = config.models.defaultModel;
  const configPath = paths.configFilePath;
  const startedAt = new Date().toISOString();
  const secretStore = await createRuntimeSecretStore(locale);

  await ensureRuntimeDirectory(paths);
  await clearStaleDaemonPid(runtimeFiles.pidFilePath);
  await writeRuntimeState(runtimeFiles.stateFilePath, {
    mode: "foreground",
    pid: process.pid,
    state: "starting",
    model,
    configPath,
    startedAt,
    updatedAt: startedAt,
  });

  const adapter = createAdapter({
    locale,
    openclawBin: commandOptions.openclawBin,
    secretStore,
  });
  const agentConfig = toAgentConfig(config);
  const signalWait = waitForSignals();

  const statusSubscription = adapter.onStatusChange((status: KernelStatus): void => {
    void writeRuntimeState(runtimeFiles.stateFilePath, {
      mode: "foreground",
      pid: process.pid,
      state: status.state,
      model,
      configPath,
      startedAt,
      updatedAt: new Date().toISOString(),
      lastError: status.lastError?.message,
    });
  });
  const logSubscription = adapter.onLog((entry: LogEntry): void => {
    emitRuntimeLog(globalOptions, entry);
  });

  let started = false;
  try {
    await adapter.start(agentConfig);
    started = true;

    emitInfo(
      globalOptions,
      text(
        locale,
        "Agent is running in foreground mode. Press Ctrl+C to stop.",
        "Agent 已在前台模式运行。按 Ctrl+C 停止。",
      ),
    );

    await waitForStopSignalOrKernelError(adapter, signalWait);

    emitInfo(
      globalOptions,
      text(locale, "Stopping agent...", "正在停止 Agent..."),
    );
  } finally {
    signalWait.dispose();
    logSubscription.dispose();
    statusSubscription.dispose();

    if (started) {
      await adapter.stop().catch(() => undefined);
    }

    const stoppedAt = new Date().toISOString();
    await writeRuntimeState(runtimeFiles.stateFilePath, {
      mode: "foreground",
      pid: process.pid,
      state: "stopped",
      model,
      configPath,
      startedAt,
      updatedAt: stoppedAt,
    });
  }

  return {
    mode: "foreground",
    pid: process.pid,
    model,
    configPath,
    stateFilePath: runtimeFiles.stateFilePath,
    logFilePath: runtimeFiles.logFilePath,
  };
}

async function startDaemon(
  globalOptions: CliGlobalOptions,
  commandOptions: StartCommandOptions,
): Promise<StartSummary> {
  const locale = globalOptions.locale;
  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const paths = configManager.getPaths();
  const runtimeFiles = toRuntimeFilePaths(paths);

  await ensureRuntimeDirectory(paths);

  const existingPid = await readPid(runtimeFiles.pidFilePath);
  if (existingPid !== null) {
    if (isProcessAlive(existingPid)) {
      throw new Error(
        text(
          locale,
          `Agent daemon is already running (pid=${String(existingPid)}).`,
          `Agent 守护进程已在运行（pid=${String(existingPid)}）。`,
        ),
      );
    }
    await clearRuntimeFiles(runtimeFiles);
  }

  const scriptPath = resolveCurrentScriptPath(locale);
  const daemonEnv = await prepareDaemonEnv(locale);
  const daemonArgs = buildDaemonSpawnArgs({
    scriptPath,
    locale,
    openclawBin: commandOptions.openclawBin,
  });

  const logFd = openSync(runtimeFiles.logFilePath, "a");
  let child: ChildProcess | null = null;
  try {
    child = spawn(process.execPath, daemonArgs, {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: daemonEnv,
    });
    await waitForSpawn(child);
  } finally {
    closeSync(logFd);
  }

  const pid = child.pid;
  if (pid === undefined) {
    throw new Error(
      text(
        locale,
        "Failed to start daemon process.",
        "启动守护进程失败。",
      ),
    );
  }

  child.unref();

  const startedAt = new Date().toISOString();
  await writeFile(runtimeFiles.pidFilePath, `${String(pid)}\n`, "utf8");
  await writeRuntimeState(runtimeFiles.stateFilePath, {
    mode: "daemon",
    pid,
    state: "starting",
    model: config.models.defaultModel,
    configPath: paths.configFilePath,
    startedAt,
    updatedAt: startedAt,
  });

  return {
    mode: "daemon",
    pid,
    model: config.models.defaultModel,
    configPath: paths.configFilePath,
    stateFilePath: runtimeFiles.stateFilePath,
    logFilePath: runtimeFiles.logFilePath,
  };
}

async function runDaemonProcess(
  locale: CliLocale,
  options: DaemonRunnerOptions,
): Promise<void> {
  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const paths = configManager.getPaths();
  const runtimeFiles = toRuntimeFilePaths(paths);
  const startedAt = new Date().toISOString();
  const pid = process.pid;
  const model = config.models.defaultModel;
  const configPath = paths.configFilePath;

  await ensureRuntimeDirectory(paths);
  await writeFile(runtimeFiles.pidFilePath, `${String(pid)}\n`, "utf8");
  await writeRuntimeState(runtimeFiles.stateFilePath, {
    mode: "daemon",
    pid,
    state: "starting",
    model,
    configPath,
    startedAt,
    updatedAt: startedAt,
  });

  const secretStore = await createSecretStore({ locale });
  const adapter = createAdapter({
    locale,
    openclawBin: options.openclawBin,
    secretStore,
  });
  const agentConfig = toAgentConfig(config);
  const signalWait = waitForSignals();

  const statusSubscription = adapter.onStatusChange((status: KernelStatus): void => {
    void writeRuntimeState(runtimeFiles.stateFilePath, {
      mode: "daemon",
      pid,
      state: status.state,
      model,
      configPath,
      startedAt,
      updatedAt: new Date().toISOString(),
      lastError: status.lastError?.message,
    });
  });

  const logSubscription = adapter.onLog((_entry: LogEntry): void => {
    // The daemon process writes stdout/stderr to log file via detached stdio.
  });

  let started = false;
  try {
    await adapter.start(agentConfig);
    started = true;
    await waitForStopSignalOrKernelError(adapter, signalWait);
  } finally {
    signalWait.dispose();
    logSubscription.dispose();
    statusSubscription.dispose();

    if (started) {
      await adapter.stop().catch(() => undefined);
    }

    const stoppedAt = new Date().toISOString();
    await writeRuntimeState(runtimeFiles.stateFilePath, {
      mode: "daemon",
      pid,
      state: "stopped",
      model,
      configPath,
      startedAt,
      updatedAt: stoppedAt,
    });
    await rm(runtimeFiles.pidFilePath, { force: true });
  }
}

async function createRuntimeSecretStore(locale: CliLocale): Promise<SecretStore> {
  const cachedPassword = {
    value: "",
    resolved: false,
  };

  const passwordProvider = async (): Promise<string> => {
    if (cachedPassword.resolved) {
      return cachedPassword.value;
    }
    const password = await promptSecretPassword(locale);
    cachedPassword.value = password;
    cachedPassword.resolved = true;
    return password;
  };

  return createSecretStore({
    locale,
    passwordProvider,
  });
}

function createAdapter(input: {
  locale: CliLocale;
  openclawBin?: string;
  secretStore: SecretStore;
}): OpenClawAdapter {
  return new OpenClawAdapter({
    locale: input.locale,
    command: normalizeOpenclawBin(input.openclawBin),
    resolveApiKey: async (credentialRef: string): Promise<string | undefined> => {
      const value = await input.secretStore.get(credentialRef);
      return value ?? undefined;
    },
  });
}

function toAgentConfig(config: OneclawConfig): AgentConfig {
  return {
    modelConfig: {
      providers: config.models.providers.map((provider) => ({
        id: provider.id,
        enabled: provider.enabled,
        credentialRef: provider.credentialRef,
        baseUrl: provider.baseUrl,
        protocol: provider.protocol,
        models: [...provider.models],
      })),
      fallbackChain: [...config.models.fallbackChain],
      defaultModel: config.models.defaultModel,
      perModelSettings: Object.fromEntries(
        Object.entries(config.models.perModelSettings).map(([key, value]) => [
          key,
          { ...value },
        ]),
      ),
    },
    concurrency: {
      maxConcurrent: config.agent.concurrency.maxConcurrent,
      subagents: {
        maxConcurrent: config.agent.concurrency.subagents.maxConcurrent,
        maxSpawnDepth: config.agent.concurrency.subagents.maxSpawnDepth,
        maxChildrenPerAgent:
          config.agent.concurrency.subagents.maxChildrenPerAgent,
      },
    },
    skills: config.agent.skills.map((skill) => ({
      id: skill.id,
      enabled: skill.enabled,
      options:
        skill.options === undefined
          ? undefined
          : { ...skill.options },
    })),
    workspacePaths: config.agent.mountPoints.map((mount) => ({
      hostPath: mount.hostPath,
      containerPath: mount.containerPath,
      readonly: mount.readonly,
    })),
    timeoutSeconds: config.agent.timeoutSeconds,
  };
}

function normalizeOpenclawBin(value: string | undefined): string {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return DEFAULT_OPENCLAW_BIN;
  }
  return normalized;
}

function toRuntimeFilePaths(paths: OneclawConfigPaths): RuntimeFilePaths {
  return {
    pidFilePath: join(paths.dataDir, DAEMON_PID_FILE_NAME),
    stateFilePath: join(paths.dataDir, DAEMON_STATE_FILE_NAME),
    logFilePath: join(paths.dataDir, DAEMON_LOG_FILE_NAME),
  };
}

async function ensureRuntimeDirectory(paths: OneclawConfigPaths): Promise<void> {
  await mkdir(paths.dataDir, { recursive: true });
}

async function clearRuntimeFiles(files: RuntimeFilePaths): Promise<void> {
  await rm(files.pidFilePath, { force: true });
  await rm(files.stateFilePath, { force: true });
}

async function clearStaleDaemonPid(pidFilePath: string): Promise<void> {
  const existingPid = await readPid(pidFilePath);
  if (existingPid === null) {
    return;
  }

  if (!isProcessAlive(existingPid)) {
    await rm(pidFilePath, { force: true });
  }
}

async function writeRuntimeState(
  stateFilePath: string,
  state: RuntimeState,
): Promise<void> {
  await writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
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

function resolveCurrentScriptPath(locale: CliLocale): string {
  const scriptPath = process.argv[1];
  const normalized = normalizeOptionalString(scriptPath);
  if (normalized === undefined) {
    throw new Error(
      text(
        locale,
        "Cannot resolve CLI entry path for daemon mode.",
        "无法解析守护模式所需的 CLI 入口路径。",
      ),
    );
  }
  return resolve(normalized);
}

async function prepareDaemonEnv(locale: CliLocale): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env };

  const existingPassword = normalizeOptionalString(env.ONECLAW_SECRETS_PASSWORD);
  if (existingPassword !== undefined) {
    return env;
  }

  try {
    await createSecretStore({ locale, env });
    return env;
  } catch (_error: unknown) {
    if (!isInteractiveTerminal()) {
      throw new Error(
        text(
          locale,
          "Secret store password is required in daemon mode. Set ONECLAW_SECRETS_PASSWORD.",
          "守护模式需要密钥存储密码，请设置 ONECLAW_SECRETS_PASSWORD。",
        ),
      );
    }

    const password = await promptSecretPassword(locale);
    env.ONECLAW_SECRETS_PASSWORD = password;
    return env;
  }
}

function buildDaemonSpawnArgs(input: {
  scriptPath: string;
  locale: CliLocale;
  openclawBin?: string;
}): string[] {
  const args = [
    input.scriptPath,
    "--locale",
    input.locale,
    "--quiet",
    INTERNAL_DAEMON_COMMAND,
  ];

  const openclawBin = normalizeOptionalString(input.openclawBin);
  if (openclawBin !== undefined) {
    args.push("--openclaw-bin", openclawBin);
  }

  return args;
}

async function waitForSpawn(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onSpawn = (): void => {
      cleanup();
      resolvePromise();
    };
    const onError = (error: Error): void => {
      cleanup();
      rejectPromise(error);
    };

    const cleanup = (): void => {
      child.off("spawn", onSpawn);
      child.off("error", onError);
    };

    child.on("spawn", onSpawn);
    child.on("error", onError);
  });
}

function waitForSignals(): SignalWaitHandle {
  let settled = false;
  let resolveWait: ((signal: NodeJS.Signals) => void) | undefined;
  const handlers = new Map<NodeJS.Signals, () => void>();

  const wait = new Promise<NodeJS.Signals>((resolvePromise) => {
    resolveWait = resolvePromise;
  });

  for (const signal of SIGNALS) {
    const handler = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolveWait?.(signal);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }

  return {
    wait,
    dispose: (): void => {
      for (const [signal, handler] of handlers) {
        process.off(signal, handler);
      }
      handlers.clear();
    },
  };
}

async function waitForStopSignalOrKernelError(
  adapter: OpenClawAdapter,
  signalWait: SignalWaitHandle,
): Promise<void> {
  let statusSubscription:
    | {
        dispose(): void;
      }
    | undefined;

  const kernelErrorWait = new Promise<never>((_resolvePromise, rejectPromise) => {
    statusSubscription = adapter.onStatusChange((status: KernelStatus): void => {
      if (status.state !== "error") {
        return;
      }
      rejectPromise(
        new Error(
          status.lastError?.message ?? "Agent kernel entered error state.",
        ),
      );
    });
  });

  try {
    await Promise.race([signalWait.wait.then(() => undefined), kernelErrorWait]);
  } finally {
    statusSubscription?.dispose();
  }
}

function emitRuntimeLog(options: CliGlobalOptions, entry: LogEntry): void {
  if (options.json || options.quiet) {
    return;
  }

  const timestamp = entry.timestamp.toISOString();
  output.write(`[${timestamp}] ${entry.level.toUpperCase()}: ${entry.message}\n`);
}

function emitSummary(options: CliGlobalOptions, summary: StartSummary): void {
  if (options.json) {
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (options.quiet) {
    return;
  }

  const modeLabel = summary.mode === "daemon" ? "daemon" : "foreground";
  output.write(
    `${text(
      options.locale,
      summary.mode === "daemon"
        ? "Agent started in daemon mode."
        : "Agent started in foreground mode.",
      summary.mode === "daemon"
        ? "Agent 已以守护进程模式启动。"
        : "Agent 已以前台模式启动。",
    )}\n`,
  );
  output.write(
    `${text(options.locale, "PID", "进程 PID")}: ${String(summary.pid)}\n`,
  );
  output.write(
    `${text(options.locale, "Mode", "模式")}: ${modeLabel}\n`,
  );
  output.write(
    `${text(options.locale, "Model", "模型")}: ${summary.model}\n`,
  );
  output.write(
    `${text(options.locale, "Config", "配置文件")}: ${summary.configPath}\n`,
  );
  output.write(
    `${text(options.locale, "State", "状态文件")}: ${summary.stateFilePath}\n`,
  );
  output.write(
    `${text(options.locale, "Log", "日志文件")}: ${summary.logFilePath}\n`,
  );
}

function emitInfo(options: CliGlobalOptions, message: string): void {
  if (options.json || options.quiet) {
    return;
  }
  output.write(`${message}\n`);
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

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
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

function isInteractiveTerminal(): boolean {
  return input.isTTY && output.isTTY;
}

async function promptSecretPassword(locale: ValidationLocale): Promise<string> {
  if (!isInteractiveTerminal()) {
    throw new Error(
      text(
        locale,
        "Secret store password is required. Set ONECLAW_SECRETS_PASSWORD in non-interactive mode.",
        "需要密钥存储密码。非交互模式请设置 ONECLAW_SECRETS_PASSWORD。",
      ),
    );
  }

  const rl = createInterface({
    input,
    output,
    terminal: true,
  });

  try {
    for (;;) {
      const answer = (
        await rl.question(
          `${text(
            locale,
            "Enter secret store password:",
            "请输入密钥存储密码：",
          )} `,
        )
      ).trim();
      if (answer.length > 0) {
        return answer;
      }
      output.write(
        `${text(
          locale,
          "Password cannot be empty.",
          "密码不能为空。",
        )}\n`,
      );
    }
  } finally {
    rl.close();
  }
}
