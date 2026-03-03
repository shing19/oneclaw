import { readFile } from "node:fs/promises";
import { stdout as output } from "node:process";

import type { Command } from "commander";

import {
  BackupManager,
  ConfigManager,
  type ConfigBackup,
  type ConfigValidationIssue,
  type OneclawConfig,
  validateConfig,
} from "../../../core/src/index.js";

type CliLocale = "zh-CN" | "en";

interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

interface ConfigShowSummary {
  configPath: string;
  config: unknown;
  message: string;
}

interface ConfigSetSummary {
  keyPath: string;
  value: unknown;
  configPath: string;
  message: string;
}

interface ConfigValidateSummary {
  valid: boolean;
  configPath: string;
  issues: ConfigValidationIssue[];
  message: string;
}

interface ConfigBackupSummary {
  created: boolean;
  backupFile: string | null;
  backupsDir: string;
  totalBackups: number;
  message: string;
}

interface ConfigRollbackSummary {
  restoredBackup: string;
  snapshotBackup: string | null;
  configPath: string;
  defaultModel: string;
  totalBackups: number;
  message: string;
}

type PathSegment = string | number;

const PATH_SEGMENT_SEPARATOR = ".";
const ARRAY_INDEX_PATTERN = /\[(\d+)\]/g;
const INTEGER_SEGMENT_PATTERN = /^\d+$/;
const SENSITIVE_KEYWORDS = ["apikey", "api_key", "secret", "token", "password"];

export function registerConfigCommand(program: Command): void {
  const configCommand = program
    .command("config")
    .description("Show or update configuration / 查看或修改配置");

  configCommand
    .command("show")
    .description("Show current config with masked secrets / 显示当前配置（密钥脱敏）")
    .action(async (_options: unknown, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await showConfig(locale);
        emitShowSummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });

  configCommand
    .command("set <key> <value>")
    .description("Set config value by path / 按路径设置配置值")
    .action(async (keyPath: string, rawValue: string, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await setConfigValue(locale, keyPath, rawValue);
        emitSetSummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });

  configCommand
    .command("validate")
    .description("Validate config schema / 校验配置结构")
    .action(async (_options: unknown, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await validateConfigFile(locale);
        emitValidateSummary(globalOptions, summary);
        if (!summary.valid) {
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });

  configCommand
    .command("backup")
    .description("Create config backup manually / 手动创建配置备份")
    .action(async (_options: unknown, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await backupConfig(locale);
        emitBackupSummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });

  configCommand
    .command("rollback [version]")
    .description("Restore config from backup / 从备份恢复配置")
    .action(async (version: string | undefined, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await rollbackConfig(locale, version);
        emitRollbackSummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });
}

async function showConfig(locale: CliLocale): Promise<ConfigShowSummary> {
  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const paths = configManager.getPaths();

  return {
    configPath: paths.configFilePath,
    config: redactSensitiveValues(config),
    message: text(
      locale,
      "Loaded current configuration.",
      "已加载当前配置。",
    ),
  };
}

async function setConfigValue(
  locale: CliLocale,
  keyPath: string,
  rawValue: string,
): Promise<ConfigSetSummary> {
  const configManager = new ConfigManager({ locale });
  const currentConfig = await configManager.load();
  const parsedValue = parseCliValue(rawValue);
  const nextConfig = applyPathValue(currentConfig, keyPath, parsedValue, locale);
  await configManager.save(nextConfig);

  return {
    keyPath,
    value: parsedValue,
    configPath: configManager.getPaths().configFilePath,
    message: text(
      locale,
      "Configuration updated successfully.",
      "配置更新成功。",
    ),
  };
}

async function validateConfigFile(
  locale: CliLocale,
): Promise<ConfigValidateSummary> {
  const configManager = new ConfigManager({ locale });
  const configPath = configManager.getPaths().configFilePath;

  let rawContent: string;
  try {
    rawContent = await readFile(configPath, "utf8");
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      throw new Error(
        text(
          locale,
          `Config file does not exist: ${configPath}`,
          `配置文件不存在：${configPath}`,
        ),
      );
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as unknown;
  } catch (error: unknown) {
    return {
      valid: false,
      configPath,
      issues: [
        {
          source: "json-schema",
          path: "$",
          code: "JSON_PARSE_FAILED",
          message: text(
            locale,
            "Config file is not valid JSON.",
            "配置文件不是合法 JSON。",
          ),
          suggestion: text(
            locale,
            "Fix JSON syntax and run validate again.",
            "修复 JSON 语法后重新执行 validate。",
          ),
        },
      ],
      message: text(
        locale,
        "Configuration validation failed.",
        "配置校验失败。",
      ),
    };
  }

  const result = validateConfig(parsed, { locale });
  if (result.ok) {
    return {
      valid: true,
      configPath,
      issues: [],
      message: text(
        locale,
        "Configuration is valid.",
        "配置校验通过。",
      ),
    };
  }

  return {
    valid: false,
    configPath,
    issues: result.issues,
    message: text(
      locale,
      "Configuration validation failed.",
      "配置校验失败。",
    ),
  };
}

async function backupConfig(locale: CliLocale): Promise<ConfigBackupSummary> {
  const configManager = new ConfigManager({ locale });
  const backupManager = new BackupManager({
    locale,
    paths: configManager.getPaths(),
  });

  const created = await backupManager.backupBeforeSave();
  const backups = await backupManager.listBackups();
  const backupsDir = backupManager.getPaths().backupsDir;

  if (created === null) {
    return {
      created: false,
      backupFile: null,
      backupsDir,
      totalBackups: backups.length,
      message: text(
        locale,
        "Skipped backup because config file was not found.",
        "未创建备份：配置文件不存在。",
      ),
    };
  }

  return {
    created: true,
    backupFile: created.fileName,
    backupsDir,
    totalBackups: backups.length,
    message: text(
      locale,
      "Backup created successfully.",
      "配置备份创建成功。",
    ),
  };
}

async function rollbackConfig(
  locale: CliLocale,
  version: string | undefined,
): Promise<ConfigRollbackSummary> {
  const configManager = new ConfigManager({ locale });
  const backupManager = new BackupManager({
    locale,
    paths: configManager.getPaths(),
  });

  const backups = await backupManager.listBackups();
  if (backups.length === 0) {
    throw new Error(
      text(locale, "No config backups available.", "没有可用的配置备份。"),
    );
  }

  const targetBackup = resolveRollbackTarget(backups, version, locale);
  const snapshotBackup = await backupManager.backupBeforeSave();
  await backupManager.restoreBackup(targetBackup.fileName);
  const restoredConfig = await configManager.load();
  const totalBackups = (await backupManager.listBackups()).length;

  return {
    restoredBackup: targetBackup.fileName,
    snapshotBackup: snapshotBackup?.fileName ?? null,
    configPath: configManager.getPaths().configFilePath,
    defaultModel: restoredConfig.models.defaultModel,
    totalBackups,
    message: text(
      locale,
      "Configuration rollback completed.",
      "配置回滚完成。",
    ),
  };
}

function resolveRollbackTarget(
  backups: readonly ConfigBackup[],
  version: string | undefined,
  locale: CliLocale,
): ConfigBackup {
  if (version === undefined || version.trim().length === 0) {
    const latest = backups[0];
    if (latest !== undefined) {
      return latest;
    }
    throw new Error(
      text(locale, "No config backups available.", "没有可用的配置备份。"),
    );
  }

  const normalized = version.trim();
  const byExactFileName = backups.find((backup) => backup.fileName === normalized);
  if (byExactFileName !== undefined) {
    return byExactFileName;
  }

  if (INTEGER_SEGMENT_PATTERN.test(normalized)) {
    const index = Number.parseInt(normalized, 10);
    if (Number.isInteger(index) && index > 0 && index <= backups.length) {
      const target = backups[index - 1];
      if (target !== undefined) {
        return target;
      }
    }
  }

  const normalizedFileName =
    normalized.startsWith("config-") && normalized.endsWith(".json")
      ? normalized
      : `config-${normalized}.json`;
  const byNormalizedName = backups.find(
    (backup) => backup.fileName === normalizedFileName,
  );
  if (byNormalizedName !== undefined) {
    return byNormalizedName;
  }

  const fuzzyMatches = backups.filter((backup) =>
    backup.fileName.includes(normalized),
  );
  if (fuzzyMatches.length === 1) {
    const match = fuzzyMatches[0];
    if (match !== undefined) {
      return match;
    }
  }

  if (fuzzyMatches.length > 1) {
    throw new Error(
      text(
        locale,
        `Rollback target "${normalized}" is ambiguous. Matched: ${fuzzyMatches.map((backup) => backup.fileName).join(", ")}`,
        `回滚目标 "${normalized}" 匹配到多个备份：${fuzzyMatches.map((backup) => backup.fileName).join("，")}`,
      ),
    );
  }

  throw new Error(
    text(
      locale,
      `Backup "${normalized}" was not found.`,
      `未找到备份 "${normalized}"。`,
    ),
  );
}

function applyPathValue(
  config: OneclawConfig,
  keyPath: string,
  value: unknown,
  locale: CliLocale,
): unknown {
  const segments = parsePathSegments(keyPath, locale);
  const cloned = deepClone(config);

  let cursor: unknown = cloned;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];

    if (typeof segment === "number") {
      if (!Array.isArray(cursor)) {
        throw new Error(
          text(
            locale,
            `Path "${keyPath}" is not assignable at segment ${String(segment)}.`,
            `路径 "${keyPath}" 在片段 ${String(segment)} 处不可写入。`,
          ),
        );
      }
      if (segment < 0 || segment >= cursor.length) {
        throw new Error(
          text(
            locale,
            `Array index out of range at "${keyPath}".`,
            `路径 "${keyPath}" 的数组索引越界。`,
          ),
        );
      }

      let nextValue = cursor[segment];
      if (nextValue === undefined || nextValue === null) {
        const container = typeof nextSegment === "number" ? [] : {};
        cursor[segment] = container;
        nextValue = container;
      }

      if (!isContainer(nextValue)) {
        throw new Error(
          text(
            locale,
            `Path "${keyPath}" enters a non-object value.`,
            `路径 "${keyPath}" 进入了不可继续写入的非对象值。`,
          ),
        );
      }
      cursor = nextValue;
      continue;
    }

    if (!isRecord(cursor)) {
      throw new Error(
        text(
          locale,
          `Path "${keyPath}" is not assignable at segment "${segment}".`,
          `路径 "${keyPath}" 在片段 "${segment}" 处不可写入。`,
        ),
      );
    }

    let nextValue = cursor[segment];
    if (nextValue === undefined || nextValue === null) {
      const container = typeof nextSegment === "number" ? [] : {};
      cursor[segment] = container;
      nextValue = container;
    }

    if (!isContainer(nextValue)) {
      throw new Error(
        text(
          locale,
          `Path "${keyPath}" enters a non-object value.`,
          `路径 "${keyPath}" 进入了不可继续写入的非对象值。`,
        ),
      );
    }

    cursor = nextValue;
  }

  const finalSegment = segments[segments.length - 1];
  if (finalSegment === undefined) {
    throw new Error(
      text(
        locale,
        `Invalid config key path: "${keyPath}".`,
        `配置键路径无效："${keyPath}"。`,
      ),
    );
  }

  if (typeof finalSegment === "number") {
    if (!Array.isArray(cursor)) {
      throw new Error(
        text(
          locale,
          `Path "${keyPath}" does not point to an array value.`,
          `路径 "${keyPath}" 未指向数组值。`,
        ),
      );
    }
    if (finalSegment < 0 || finalSegment >= cursor.length) {
      throw new Error(
        text(
          locale,
          `Array index out of range at "${keyPath}".`,
          `路径 "${keyPath}" 的数组索引越界。`,
        ),
      );
    }
    cursor[finalSegment] = value;
    return cloned;
  }

  if (!isRecord(cursor)) {
    throw new Error(
      text(
        locale,
        `Path "${keyPath}" is not assignable.`,
        `路径 "${keyPath}" 不可写入。`,
      ),
    );
  }

  cursor[finalSegment] = value;
  return cloned;
}

function parsePathSegments(path: string, locale: CliLocale): PathSegment[] {
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    throw new Error(
      text(locale, "Config key path cannot be empty.", "配置键路径不能为空。"),
    );
  }

  const normalizedPath = trimmed.replace(ARRAY_INDEX_PATTERN, ".$1");
  if (normalizedPath.includes("[") || normalizedPath.includes("]")) {
    throw new Error(
      text(locale, `Invalid path syntax: "${path}".`, `路径语法无效："${path}"。`),
    );
  }

  const segments = normalizedPath.split(PATH_SEGMENT_SEPARATOR);
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(
      text(locale, `Invalid path syntax: "${path}".`, `路径语法无效："${path}"。`),
    );
  }

  const parsedSegments = segments.map((segment) =>
    INTEGER_SEGMENT_PATTERN.test(segment)
      ? Number.parseInt(segment, 10)
      : segment,
  );

  if (typeof parsedSegments[0] === "number") {
    throw new Error(
      text(locale, `Invalid path syntax: "${path}".`, `路径语法无效："${path}"。`),
    );
  }

  return parsedSegments;
}

function parseCliValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "";
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (_error: unknown) {
    return raw;
  }
}

function redactSensitiveValues(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (shouldMaskKey(key)) {
      return maskString(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValues(item, key));
  }

  if (!isRecord(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    redacted[entryKey] = redactSensitiveValues(entryValue, entryKey);
  }
  return redacted;
}

function shouldMaskKey(key: string): boolean {
  if (key.length === 0) {
    return false;
  }

  if (key.endsWith("Ref")) {
    return false;
  }

  const lower = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function maskString(value: string): string {
  if (value.length <= 4) {
    return "*".repeat(Math.max(4, value.length));
  }
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emitShowSummary(options: CliGlobalOptions, summary: ConfigShowSummary): void {
  if (options.json) {
    output.write(
      `${JSON.stringify(
        {
          ok: true,
          configPath: summary.configPath,
          config: summary.config,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.quiet) {
    output.write(`${JSON.stringify(summary.config, null, 2)}\n`);
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`);
  output.write(`${JSON.stringify(summary.config, null, 2)}\n`);
}

function emitSetSummary(options: CliGlobalOptions, summary: ConfigSetSummary): void {
  if (options.json) {
    output.write(
      `${JSON.stringify(
        {
          ok: true,
          keyPath: summary.keyPath,
          value: summary.value,
          configPath: summary.configPath,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.quiet) {
    output.write("ok\n");
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Path", "路径")}: ${summary.keyPath}\n`);
  output.write(`${text(options.locale, "Value", "值")}: ${JSON.stringify(summary.value)}\n`);
  output.write(`${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`);
}

function emitValidateSummary(
  options: CliGlobalOptions,
  summary: ConfigValidateSummary,
): void {
  if (options.json) {
    output.write(
      `${JSON.stringify(
        {
          ok: summary.valid,
          valid: summary.valid,
          configPath: summary.configPath,
          issues: summary.issues,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.quiet) {
    output.write(summary.valid ? "valid\n" : "invalid\n");
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`);
  output.write(
    `${text(options.locale, "Issue count", "问题数量")}: ${String(summary.issues.length)}\n`,
  );

  for (const issue of summary.issues) {
    output.write(
      `- [${issue.source}] ${issue.path} (${issue.code}): ${issue.message}\n`,
    );
    output.write(
      `  ${text(options.locale, "Suggestion", "修复建议")}: ${issue.suggestion}\n`,
    );
  }
}

function emitBackupSummary(
  options: CliGlobalOptions,
  summary: ConfigBackupSummary,
): void {
  if (options.json) {
    output.write(
      `${JSON.stringify(
        {
          ok: summary.created,
          created: summary.created,
          backupFile: summary.backupFile,
          backupsDir: summary.backupsDir,
          totalBackups: summary.totalBackups,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.quiet) {
    output.write(`${summary.backupFile ?? "none"}\n`);
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(
    `${text(options.locale, "Backup file", "备份文件")}: ${summary.backupFile ?? "-"}\n`,
  );
  output.write(`${text(options.locale, "Backups dir", "备份目录")}: ${summary.backupsDir}\n`);
  output.write(
    `${text(options.locale, "Total backups", "备份总数")}: ${String(summary.totalBackups)}\n`,
  );
}

function emitRollbackSummary(
  options: CliGlobalOptions,
  summary: ConfigRollbackSummary,
): void {
  if (options.json) {
    output.write(
      `${JSON.stringify(
        {
          ok: true,
          restoredBackup: summary.restoredBackup,
          snapshotBackup: summary.snapshotBackup,
          configPath: summary.configPath,
          defaultModel: summary.defaultModel,
          totalBackups: summary.totalBackups,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.quiet) {
    output.write(`${summary.restoredBackup}\n`);
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(
    `${text(options.locale, "Restored backup", "恢复备份")}: ${summary.restoredBackup}\n`,
  );
  output.write(
    `${text(options.locale, "Snapshot backup", "快照备份")}: ${summary.snapshotBackup ?? "-"}\n`,
  );
  output.write(`${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`);
  output.write(
    `${text(options.locale, "Default model", "默认模型")}: ${summary.defaultModel}\n`,
  );
  output.write(
    `${text(options.locale, "Total backups", "备份总数")}: ${String(summary.totalBackups)}\n`,
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
