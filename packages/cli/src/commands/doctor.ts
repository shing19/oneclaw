import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { stdout as output } from "node:process";

import type { Command } from "commander";

import {
  ConfigManager,
  SecretStoreManager,
  createSecretStore,
  listDefaultProviderPresets,
  type KernelStatus,
  type OneclawConfig,
  type OneclawConfigPaths,
  type ProviderConfig,
  type SecretStore,
} from "../../../core/src/index.js";
import { validateConfig } from "../../../core/src/config/validator.js";

type CliLocale = "zh-CN" | "en";

interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

interface DoctorCommandOptions {
  skipNetwork?: boolean;
  timeoutMs?: string;
}

type DoctorCheckStatus = "pass" | "warn" | "fail";

interface DoctorCheckResult {
  id: string;
  title: string;
  status: DoctorCheckStatus;
  summary: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

interface DoctorReport {
  ok: boolean;
  overall: DoctorCheckStatus;
  generatedAt: string;
  configPath: string;
  checks: DoctorCheckResult[];
  passed: number;
  warned: number;
  failed: number;
  message: string;
}

interface ConfigCheckResult {
  check: DoctorCheckResult;
  config?: OneclawConfig;
}

interface SecretStoreCheckResult {
  check: DoctorCheckResult;
  store?: SecretStore;
}

interface ConnectivityCheckInput {
  config: OneclawConfig | undefined;
  store: SecretStore | undefined;
  locale: CliLocale;
  skipNetwork: boolean;
  timeoutMs: number;
}

interface ProviderConnectivityDetail {
  providerId: string;
  providerName: string;
  endpoint: string;
  status: "pass" | "fail";
  statusCode: number | null;
  latencyMs: number | null;
  message: string;
}

interface RuntimeFilePaths {
  pidFilePath: string;
  stateFilePath: string;
  logFilePath: string;
  auditFilePath: string;
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

interface CommandExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  errorCode?: string;
}

interface ProbeResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  message: string;
}

const DAEMON_PID_FILE_NAME = "agent-daemon.pid";
const DAEMON_STATE_FILE_NAME = "agent-daemon-state.json";
const DAEMON_LOG_FILE_NAME = "agent-daemon.log";
const SECRET_AUDIT_FILE_NAME = "secret-audit.log";
const DEFAULT_NETWORK_TIMEOUT_MS = 8_000;
const MIN_NETWORK_TIMEOUT_MS = 1_000;
const MAX_NETWORK_TIMEOUT_MS = 60_000;
const MAX_PROVIDER_PROBES = 8;

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run comprehensive health checks / 执行全面健康检查")
    .option("--skip-network", "Skip provider connectivity checks / 跳过供应商连通性检查", false)
    .option(
      "--timeout-ms <ms>",
      "Provider check timeout in milliseconds / 供应商检查超时毫秒数",
      String(DEFAULT_NETWORK_TIMEOUT_MS),
    )
    .action(async (options: DoctorCommandOptions, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const timeoutMs = resolveTimeoutMs(options.timeoutMs, locale);
        const report = await runDoctorChecks({
          locale,
          skipNetwork: options.skipNetwork === true,
          timeoutMs,
        });
        emitDoctorReport(globalOptions, report);

        if (report.failed > 0) {
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });
}

async function runDoctorChecks(input: {
  locale: CliLocale;
  skipNetwork: boolean;
  timeoutMs: number;
}): Promise<DoctorReport> {
  const configManager = new ConfigManager({ locale: input.locale });
  const paths = configManager.getPaths();
  const checks: DoctorCheckResult[] = [];

  checks.push(await checkFilesystem(paths, input.locale));

  const configCheck = await checkConfig(paths.configFilePath, input.locale);
  checks.push(configCheck.check);

  checks.push(await checkOpenClawBinary(input.locale));
  checks.push(await checkRuntime(paths, input.locale));

  const secretCheck = await checkSecretStore(paths, configCheck.config, input.locale);
  checks.push(secretCheck.check);

  const connectivityCheck = await checkProviderConnectivity({
    config: configCheck.config,
    store: secretCheck.store,
    locale: input.locale,
    skipNetwork: input.skipNetwork,
    timeoutMs: input.timeoutMs,
  });
  checks.push(connectivityCheck);

  const passed = checks.filter((check) => check.status === "pass").length;
  const warned = checks.filter((check) => check.status === "warn").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  const overall: DoctorCheckStatus = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";

  return {
    ok: failed === 0,
    overall,
    generatedAt: new Date().toISOString(),
    configPath: paths.configFilePath,
    checks,
    passed,
    warned,
    failed,
    message: resolveReportMessage(input.locale, overall),
  };
}

async function checkFilesystem(
  paths: OneclawConfigPaths,
  locale: CliLocale,
): Promise<DoctorCheckResult> {
  const writableTargets = [paths.configDir, paths.backupsDir, paths.dataDir];
  const failures: string[] = [];

  for (const target of writableTargets) {
    try {
      await mkdir(target, { recursive: true });
      await access(target, fsConstants.R_OK | fsConstants.W_OK);
    } catch (error: unknown) {
      failures.push(`${target}: ${toErrorMessage(error, locale)}`);
    }
  }

  if (failures.length > 0) {
    return {
      id: "filesystem",
      title: text(locale, "Filesystem access", "文件系统访问"),
      status: "fail",
      summary: text(
        locale,
        "Some OneClaw directories are not readable/writable.",
        "部分 OneClaw 目录不可读或不可写。",
      ),
      suggestion: text(
        locale,
        "Check directory permissions for config, backups, and data directories.",
        "请检查配置目录、备份目录和数据目录的权限。",
      ),
      details: {
        configDir: paths.configDir,
        backupsDir: paths.backupsDir,
        dataDir: paths.dataDir,
        failures,
      },
    };
  }

  return {
    id: "filesystem",
    title: text(locale, "Filesystem access", "文件系统访问"),
    status: "pass",
    summary: text(
      locale,
      "Config, backups, and data directories are accessible.",
      "配置、备份和数据目录均可访问。",
    ),
    details: {
      configDir: paths.configDir,
      backupsDir: paths.backupsDir,
      dataDir: paths.dataDir,
    },
  };
}

async function checkConfig(configFilePath: string, locale: CliLocale): Promise<ConfigCheckResult> {
  let rawConfig: string;

  try {
    rawConfig = await readFile(configFilePath, "utf8");
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      return {
        check: {
          id: "config",
          title: text(locale, "Configuration", "配置文件"),
          status: "fail",
          summary: text(
            locale,
            "Config file does not exist.",
            "配置文件不存在。",
          ),
          suggestion: text(
            locale,
            "Run `oneclaw init` to create a valid config file.",
            "请运行 `oneclaw init` 创建合法配置文件。",
          ),
          details: { configFilePath },
        },
      };
    }

    return {
      check: {
        id: "config",
        title: text(locale, "Configuration", "配置文件"),
        status: "fail",
        summary: text(
          locale,
          "Failed to read config file.",
          "读取配置文件失败。",
        ),
        suggestion: text(
          locale,
          "Check file permissions and path configuration.",
          "请检查文件权限和配置路径设置。",
        ),
        details: {
          configFilePath,
          error: toErrorMessage(error, locale),
        },
      },
    };
  }

  let parsedConfig: unknown;
  try {
    parsedConfig = JSON.parse(rawConfig) as unknown;
  } catch (error: unknown) {
    return {
      check: {
        id: "config",
        title: text(locale, "Configuration", "配置文件"),
        status: "fail",
        summary: text(
          locale,
          "Config file contains invalid JSON.",
          "配置文件 JSON 格式不合法。",
        ),
        suggestion: text(
          locale,
          "Run `oneclaw config validate` and fix JSON syntax errors.",
          "请运行 `oneclaw config validate` 并修复 JSON 语法错误。",
        ),
        details: {
          configFilePath,
          error: toErrorMessage(error, locale),
        },
      },
    };
  }

  const validation = validateConfig(parsedConfig, { locale });
  if (!validation.ok) {
    return {
      check: {
        id: "config",
        title: text(locale, "Configuration", "配置文件"),
        status: "fail",
        summary: text(
          locale,
          `Config validation failed with ${String(validation.issues.length)} issues.`,
          `配置校验失败，共 ${String(validation.issues.length)} 个问题。`,
        ),
        suggestion: text(
          locale,
          "Run `oneclaw config validate` for full diagnostics and fix reported fields.",
          "请运行 `oneclaw config validate` 查看完整诊断并修复对应字段。",
        ),
        details: {
          configFilePath,
          issues: validation.issues,
        },
      },
    };
  }

  return {
    check: {
      id: "config",
      title: text(locale, "Configuration", "配置文件"),
      status: "pass",
      summary: text(
        locale,
        "Config schema validation passed.",
        "配置 Schema 校验通过。",
      ),
      details: {
        configFilePath,
        defaultModel: validation.data.models.defaultModel,
        providers: validation.data.models.providers.length,
      },
    },
    config: validation.data,
  };
}

async function checkOpenClawBinary(locale: CliLocale): Promise<DoctorCheckResult> {
  const probe = await executeCommand("openclaw", ["--version"], 3_000);

  if (probe.timedOut) {
    return {
      id: "openclaw-binary",
      title: text(locale, "OpenClaw binary", "OpenClaw 可执行文件"),
      status: "fail",
      summary: text(
        locale,
        "OpenClaw binary check timed out.",
        "OpenClaw 可执行文件检查超时。",
      ),
      suggestion: text(
        locale,
        "Verify OpenClaw installation and ensure `openclaw --version` returns quickly.",
        "请检查 OpenClaw 安装，并确认 `openclaw --version` 能快速返回。",
      ),
      details: {
        command: "openclaw --version",
        stderr: trimForDisplay(probe.stderr),
      },
    };
  }

  if (probe.errorCode === "ENOENT") {
    return {
      id: "openclaw-binary",
      title: text(locale, "OpenClaw binary", "OpenClaw 可执行文件"),
      status: "fail",
      summary: text(
        locale,
        "OpenClaw executable was not found in PATH.",
        "在 PATH 中未找到 OpenClaw 可执行文件。",
      ),
      suggestion: text(
        locale,
        "Install OpenClaw and retry, or use `oneclaw start --openclaw-bin <path>`.",
        "请安装 OpenClaw 后重试，或使用 `oneclaw start --openclaw-bin <path>`。",
      ),
      details: { command: "openclaw --version" },
    };
  }

  if (probe.exitCode !== 0) {
    return {
      id: "openclaw-binary",
      title: text(locale, "OpenClaw binary", "OpenClaw 可执行文件"),
      status: "fail",
      summary: text(
        locale,
        "OpenClaw executable returned a non-zero exit code.",
        "OpenClaw 可执行文件返回了非零退出码。",
      ),
      suggestion: text(
        locale,
        "Reinstall OpenClaw or verify runtime dependencies.",
        "请重新安装 OpenClaw 或检查运行时依赖。",
      ),
      details: {
        command: "openclaw --version",
        exitCode: probe.exitCode,
        stderr: trimForDisplay(probe.stderr),
      },
    };
  }

  const versionLine = firstNonEmptyLine(probe.stdout) ?? "unknown";
  return {
    id: "openclaw-binary",
    title: text(locale, "OpenClaw binary", "OpenClaw 可执行文件"),
    status: "pass",
    summary: text(
      locale,
      "OpenClaw executable is available.",
      "OpenClaw 可执行文件可用。",
    ),
    details: {
      command: "openclaw --version",
      version: versionLine,
    },
  };
}

async function checkRuntime(
  paths: OneclawConfigPaths,
  locale: CliLocale,
): Promise<DoctorCheckResult> {
  const runtimePaths = toRuntimeFilePaths(paths);
  const runtimeState = await readRuntimeState(runtimePaths.stateFilePath);
  const pid = await readPid(runtimePaths.pidFilePath);
  const pidAlive = pid !== null && isProcessAlive(pid);

  if (pid === null && runtimeState === null) {
    return {
      id: "runtime",
      title: text(locale, "Runtime process", "运行中进程"),
      status: "warn",
      summary: text(
        locale,
        "Agent is not running.",
        "Agent 当前未运行。",
      ),
      suggestion: text(
        locale,
        "Start the agent with `oneclaw start` when ready.",
        "准备好后可执行 `oneclaw start` 启动 Agent。",
      ),
      details: runtimePaths,
    };
  }

  if (pid !== null && !pidAlive) {
    return {
      id: "runtime",
      title: text(locale, "Runtime process", "运行中进程"),
      status: "fail",
      summary: text(
        locale,
        "Daemon PID exists but the process is not alive.",
        "存在守护进程 PID，但进程已不存在。",
      ),
      suggestion: text(
        locale,
        "Run `oneclaw stop --force` to clean stale runtime state, then restart.",
        "请执行 `oneclaw stop --force` 清理陈旧运行态后重新启动。",
      ),
      details: {
        ...runtimePaths,
        pid,
        state: runtimeState?.state ?? null,
      },
    };
  }

  if (pid === null && runtimeState !== null && isActiveState(runtimeState.state)) {
    return {
      id: "runtime",
      title: text(locale, "Runtime process", "运行中进程"),
      status: "fail",
      summary: text(
        locale,
        "Runtime state is active but no valid PID was found.",
        "运行状态显示活跃，但未找到有效 PID。",
      ),
      suggestion: text(
        locale,
        "Run `oneclaw stop --force` and then `oneclaw start` to recover.",
        "请执行 `oneclaw stop --force` 后再执行 `oneclaw start` 恢复。",
      ),
      details: {
        ...runtimePaths,
        state: runtimeState.state,
      },
    };
  }

  if (runtimeState?.state === "error") {
    return {
      id: "runtime",
      title: text(locale, "Runtime process", "运行中进程"),
      status: "warn",
      summary: text(
        locale,
        "Agent runtime reports error state.",
        "Agent 运行态报告错误状态。",
      ),
      suggestion: text(
        locale,
        "Inspect the runtime log file and restart the agent.",
        "请检查运行日志文件并重启 Agent。",
      ),
      details: {
        ...runtimePaths,
        pid,
        state: runtimeState.state,
        lastError: runtimeState.lastError ?? null,
      },
    };
  }

  return {
    id: "runtime",
    title: text(locale, "Runtime process", "运行中进程"),
    status: "pass",
    summary: text(
      locale,
      "Agent runtime state is consistent.",
      "Agent 运行态一致且正常。",
    ),
    details: {
      ...runtimePaths,
      pid,
      state: runtimeState?.state ?? "running",
      mode: runtimeState?.mode ?? null,
      model: runtimeState?.model ?? null,
    },
  };
}

async function checkSecretStore(
  paths: OneclawConfigPaths,
  config: OneclawConfig | undefined,
  locale: CliLocale,
): Promise<SecretStoreCheckResult> {
  let store: SecretStore;
  try {
    store = await createSecretStore({ locale });
  } catch (error: unknown) {
    return {
      check: {
        id: "secret-store",
        title: text(locale, "Secret storage", "密钥存储"),
        status: "fail",
        summary: text(
          locale,
          "Secret storage backend is unavailable.",
          "密钥存储后端不可用。",
        ),
        suggestion: text(
          locale,
          "Check platform secret backend availability or fallback secret password setup.",
          "请检查平台密钥后端可用性或兜底密钥密码配置。",
        ),
        details: { error: toErrorMessage(error, locale) },
      },
    };
  }

  const backend =
    store instanceof SecretStoreManager ? store.getBackendKind() : "unknown";

  const requiredRefs = config === undefined ? [] : collectRequiredSecretRefs(config);
  const missingRefs: string[] = [];
  for (const ref of requiredRefs) {
    const exists = await store.has(ref).catch(() => false);
    if (!exists) {
      missingRefs.push(ref);
    }
  }

  const knownKeys = await store.list().catch(() => []);
  const auditStatus = await checkSecretAuditFile(join(paths.dataDir, SECRET_AUDIT_FILE_NAME), locale);

  if (missingRefs.length > 0) {
    return {
      check: {
        id: "secret-store",
        title: text(locale, "Secret storage", "密钥存储"),
        status: "fail",
        summary: text(
          locale,
          `Missing ${String(missingRefs.length)} required secret references.`,
          `缺少 ${String(missingRefs.length)} 个必需密钥引用。`,
        ),
        suggestion: text(
          locale,
          "Re-run `oneclaw init` or write missing keys to SecretStore.",
          "请重新执行 `oneclaw init` 或补齐 SecretStore 中缺失的密钥。",
        ),
        details: {
          backend,
          requiredRefs,
          missingRefs,
          knownKeyCount: knownKeys.length,
          auditFile: auditStatus.path,
          auditLines: auditStatus.lines,
        },
      },
      store,
    };
  }

  if (!auditStatus.exists) {
    return {
      check: {
        id: "secret-store",
        title: text(locale, "Secret storage", "密钥存储"),
        status: "warn",
        summary: text(
          locale,
          "Secret audit log file was not found yet.",
          "尚未发现密钥审计日志文件。",
        ),
        suggestion: text(
          locale,
          "Perform a key operation (init/model test) to generate audit records.",
          "执行一次密钥相关操作（如 init/model test）以生成审计记录。",
        ),
        details: {
          backend,
          requiredRefs,
          knownKeyCount: knownKeys.length,
          auditFile: auditStatus.path,
        },
      },
      store,
    };
  }

  return {
    check: {
      id: "secret-store",
      title: text(locale, "Secret storage", "密钥存储"),
      status: "pass",
      summary: text(
        locale,
        "Secret backend is available and required references exist.",
        "密钥后端可用且所需密钥引用完整。",
      ),
      details: {
        backend,
        requiredRefs,
        knownKeyCount: knownKeys.length,
        auditFile: auditStatus.path,
        auditLines: auditStatus.lines,
      },
    },
    store,
  };
}

async function checkProviderConnectivity(
  input: ConnectivityCheckInput,
): Promise<DoctorCheckResult> {
  const title = text(input.locale, "Provider connectivity", "供应商连通性");

  if (input.skipNetwork) {
    return {
      id: "provider-connectivity",
      title,
      status: "warn",
      summary: text(
        input.locale,
        "Provider connectivity check was skipped.",
        "已跳过供应商连通性检查。",
      ),
      suggestion: text(
        input.locale,
        "Run `oneclaw doctor` without --skip-network to verify remote connectivity.",
        "去掉 --skip-network 重新执行 `oneclaw doctor` 以验证远端连通性。",
      ),
    };
  }

  if (input.config === undefined) {
    return {
      id: "provider-connectivity",
      title,
      status: "warn",
      summary: text(
        input.locale,
        "Skipped connectivity check because config is invalid.",
        "配置无效，已跳过连通性检查。",
      ),
      suggestion: text(
        input.locale,
        "Fix configuration issues first, then rerun doctor.",
        "请先修复配置问题，再重新执行 doctor。",
      ),
    };
  }

  if (input.store === undefined) {
    return {
      id: "provider-connectivity",
      title,
      status: "warn",
      summary: text(
        input.locale,
        "Skipped connectivity check because secret store is unavailable.",
        "密钥存储不可用，已跳过连通性检查。",
      ),
      suggestion: text(
        input.locale,
        "Repair secret store availability first.",
        "请先修复密钥存储可用性。",
      ),
    };
  }

  const enabledProviders = input.config.models.providers.filter((provider) => provider.enabled);
  if (enabledProviders.length === 0) {
    return {
      id: "provider-connectivity",
      title,
      status: "warn",
      summary: text(
        input.locale,
        "No enabled providers to probe.",
        "没有可探测的已启用供应商。",
      ),
      suggestion: text(
        input.locale,
        "Enable at least one provider in config.",
        "请在配置中至少启用一个供应商。",
      ),
    };
  }

  const providerNameMap = createPresetNameMap();
  const probeTargets = enabledProviders.slice(0, MAX_PROVIDER_PROBES);
  const details: ProviderConnectivityDetail[] = [];

  for (const provider of probeTargets) {
    const apiKey = await input.store.get(provider.credentialRef);
    if (apiKey === null) {
      details.push({
        providerId: provider.id,
        providerName: providerNameMap.get(normalizeProviderId(provider.id)) ?? provider.id,
        endpoint: resolveProbeEndpoint(provider),
        status: "fail",
        statusCode: null,
        latencyMs: null,
        message: text(
          input.locale,
          `Secret not found: ${provider.credentialRef}`,
          `密钥不存在：${provider.credentialRef}`,
        ),
      });
      continue;
    }

    const probe = await probeProvider(provider, apiKey, input.locale, input.timeoutMs);
    details.push({
      providerId: provider.id,
      providerName: providerNameMap.get(normalizeProviderId(provider.id)) ?? provider.id,
      endpoint: resolveProbeEndpoint(provider),
      status: probe.ok ? "pass" : "fail",
      statusCode: probe.statusCode,
      latencyMs: probe.latencyMs,
      message: probe.message,
    });
  }

  const failed = details.filter((entry) => entry.status === "fail").length;
  const passed = details.length - failed;
  const skipped = enabledProviders.length - probeTargets.length;

  if (failed === 0) {
    return {
      id: "provider-connectivity",
      title,
      status: "pass",
      summary: text(
        input.locale,
        "All provider connectivity probes passed.",
        "所有供应商连通性探测通过。",
      ),
      details: {
        totalEnabled: enabledProviders.length,
        probed: probeTargets.length,
        skipped,
        timeoutMs: input.timeoutMs,
        results: details,
      },
    };
  }

  const status: DoctorCheckStatus = failed === details.length ? "fail" : "warn";
  return {
    id: "provider-connectivity",
    title,
    status,
    summary: text(
      input.locale,
      `${String(passed)}/${String(details.length)} provider probes passed.`,
      `${String(passed)}/${String(details.length)} 个供应商探测通过。`,
    ),
    suggestion: text(
      input.locale,
      "Run `oneclaw model test <provider>` for failed providers and verify API keys/base URLs.",
      "请对失败供应商执行 `oneclaw model test <provider>` 并检查 API Key 与基础 URL。",
    ),
    details: {
      totalEnabled: enabledProviders.length,
      probed: probeTargets.length,
      skipped,
      timeoutMs: input.timeoutMs,
      results: details,
    },
  };
}

async function checkSecretAuditFile(
  auditFilePath: string,
  locale: CliLocale,
): Promise<{ exists: boolean; path: string; lines: number; message?: string }> {
  try {
    const content = await readFile(auditFilePath, "utf8");
    const lines = content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0).length;

    return {
      exists: true,
      path: auditFilePath,
      lines,
    };
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      return {
        exists: false,
        path: auditFilePath,
        lines: 0,
      };
    }

    return {
      exists: false,
      path: auditFilePath,
      lines: 0,
      message: toErrorMessage(error, locale),
    };
  }
}

async function probeProvider(
  provider: ProviderConfig,
  apiKey: string,
  locale: CliLocale,
  timeoutMs: number,
): Promise<ProbeResult> {
  const endpoint = resolveProbeEndpoint(provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAtMs = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildProbeHeaders(provider, apiKey),
      signal: controller.signal,
    });

    const latencyMs = Math.max(0, Date.now() - startedAtMs);
    const body = summarizeResponseBody(await response.text());

    if (response.ok) {
      return {
        ok: true,
        statusCode: response.status,
        latencyMs,
        message: text(
          locale,
          "Connectivity check passed.",
          "连通性检查通过。",
        ),
      };
    }

    if (body === undefined) {
      return {
        ok: false,
        statusCode: response.status,
        latencyMs,
        message: text(
          locale,
          `HTTP ${String(response.status)} returned from provider endpoint.`,
          `供应商接口返回 HTTP ${String(response.status)}。`,
        ),
      };
    }

    return {
      ok: false,
      statusCode: response.status,
      latencyMs,
      message: text(
        locale,
        `HTTP ${String(response.status)}: ${body}`,
        `HTTP ${String(response.status)}：${body}`,
      ),
    };
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return {
        ok: false,
        statusCode: null,
        latencyMs: timeoutMs,
        message: text(
          locale,
          `Connection timeout after ${String(timeoutMs)}ms.`,
          `连接超时（${String(timeoutMs)}ms）。`,
        ),
      };
    }

    return {
      ok: false,
      statusCode: null,
      latencyMs: null,
      message: toErrorMessage(error, locale),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildProbeHeaders(provider: ProviderConfig, apiKey: string): Record<string, string> {
  if (provider.protocol === "anthropic-messages") {
    return {
      accept: "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

function resolveProbeEndpoint(provider: ProviderConfig): string {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  if (provider.protocol === "ollama") {
    return `${baseUrl}/api/tags`;
  }
  return `${baseUrl}/models`;
}

function summarizeResponseBody(value: string): string | undefined {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 177)}...`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function createPresetNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const preset of listDefaultProviderPresets()) {
    map.set(normalizeProviderId(preset.id), preset.name);
  }
  return map;
}

function collectRequiredSecretRefs(config: OneclawConfig): string[] {
  const refs = new Set<string>();

  for (const provider of config.models.providers) {
    if (!provider.enabled) {
      continue;
    }
    refs.add(provider.credentialRef);
  }

  const feishu = config.channels.feishu;
  if (feishu !== undefined) {
    refs.add(feishu.appSecretRef);
    if (typeof feishu.webhookTokenRef === "string" && feishu.webhookTokenRef.length > 0) {
      refs.add(feishu.webhookTokenRef);
    }
  }

  return [...refs];
}

async function executeCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<CommandExecutionResult> {
  return await new Promise<CommandExecutionResult>((resolveResult) => {
    const child = spawn(command, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let errorCode: string | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      errorCode = error.code;
      resolveResult({
        exitCode: null,
        stdout,
        stderr: stderr.length > 0 ? stderr : error.message,
        timedOut,
        errorCode,
      });
    });

    child.on("close", (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolveResult({
        exitCode,
        stdout,
        stderr,
        timedOut,
        errorCode,
      });
    });
  });
}

function resolveTimeoutMs(value: string | undefined, locale: CliLocale): number {
  if (value === undefined) {
    return DEFAULT_NETWORK_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      text(
        locale,
        "Invalid --timeout-ms value: must be an integer.",
        "--timeout-ms 参数无效：必须是整数。",
      ),
    );
  }

  if (parsed < MIN_NETWORK_TIMEOUT_MS || parsed > MAX_NETWORK_TIMEOUT_MS) {
    throw new Error(
      text(
        locale,
        `--timeout-ms must be between ${String(MIN_NETWORK_TIMEOUT_MS)} and ${String(
          MAX_NETWORK_TIMEOUT_MS,
        )}.`,
        `--timeout-ms 必须在 ${String(MIN_NETWORK_TIMEOUT_MS)} 到 ${String(
          MAX_NETWORK_TIMEOUT_MS,
        )} 之间。`,
      ),
    );
  }

  return parsed;
}

function resolveReportMessage(locale: CliLocale, status: DoctorCheckStatus): string {
  if (status === "pass") {
    return text(
      locale,
      "All health checks passed.",
      "所有健康检查通过。",
    );
  }

  if (status === "warn") {
    return text(
      locale,
      "Health checks completed with warnings.",
      "健康检查完成，但存在警告。",
    );
  }

  return text(
    locale,
    "Health checks found blocking issues.",
    "健康检查发现阻塞问题。",
  );
}

function emitDoctorReport(options: CliGlobalOptions, report: DoctorReport): void {
  if (options.json) {
    output.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (options.quiet) {
    output.write(`${report.overall}\n`);
    return;
  }

  output.write(`${report.message}\n`);
  output.write(`${text(options.locale, "Generated at", "生成时间")}: ${report.generatedAt}\n`);
  output.write(`${text(options.locale, "Config file", "配置文件")}: ${report.configPath}\n`);
  output.write(
    `${text(options.locale, "Summary", "汇总")}: ${String(report.passed)} pass / ${String(
      report.warned,
    )} warn / ${String(report.failed)} fail\n`,
  );

  for (const check of report.checks) {
    output.write(`- [${check.status.toUpperCase()}] ${check.title}\n`);
    output.write(`  ${check.summary}\n`);
    if (typeof check.suggestion === "string" && check.suggestion.length > 0) {
      output.write(
        `  ${text(options.locale, "Suggestion", "修复建议")}: ${check.suggestion}\n`,
      );
    }
  }
}

function emitError(options: CliGlobalOptions, message: string): void {
  if (options.json) {
    output.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    return;
  }

  output.write(`${message}\n`);
}

function toRuntimeFilePaths(paths: OneclawConfigPaths): RuntimeFilePaths {
  return {
    pidFilePath: join(paths.dataDir, DAEMON_PID_FILE_NAME),
    stateFilePath: join(paths.dataDir, DAEMON_STATE_FILE_NAME),
    logFilePath: join(paths.dataDir, DAEMON_LOG_FILE_NAME),
    auditFilePath: join(paths.dataDir, SECRET_AUDIT_FILE_NAME),
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
  if (!isRecord(value)) {
    return null;
  }

  const mode = value.mode;
  const state = value.state;
  const pid = value.pid;
  const model = value.model;
  const configPath = value.configPath;
  const startedAt = value.startedAt;
  const updatedAt = value.updatedAt;
  const lastError = value.lastError;

  if (mode !== "foreground" && mode !== "daemon") {
    return null;
  }
  if (!isKernelState(state)) {
    return null;
  }
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
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
    state,
    pid,
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

function isActiveState(value: KernelStatus["state"]): boolean {
  return value === "starting" || value === "running" || value === "stopping";
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

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

function firstNonEmptyLine(value: string): string | undefined {
  for (const line of value.split(/\r?\n/u)) {
    const normalized = line.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return undefined;
}

function trimForDisplay(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length <= 300) {
    return trimmed;
  }
  return `${trimmed.slice(0, 297)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

