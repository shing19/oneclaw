import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { stdout as output } from "node:process";

import type { Command } from "commander";

import {
  ConfigManager,
  createQuotaTracker,
  parseOpenClawLogLine,
  type CostEvent,
  type OneclawConfig,
  type OneclawConfigPaths,
  type ProviderQuotaPolicy,
  type QuotaStatus,
  type QuotaTracker,
  type UsageEvent,
} from "../../../core/src/index.js";

type CliLocale = "zh-CN" | "en";

interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

interface RuntimeFilePaths {
  logFilePath: string;
}

interface CostContext {
  configPath: string;
  logFilePath: string;
  config: OneclawConfig;
  tracker: QuotaTracker;
  events: readonly UsageEvent[];
}

interface CostCommandSummary {
  date: string;
  configPath: string;
  logFilePath: string;
  totalCostYuan: number;
  totalRequests: number;
  byProvider: Record<string, number>;
  providerStatuses: Record<string, QuotaStatus>;
  trackedEvents: number;
  message: string;
}

interface CostHistoryCommandOptions {
  range?: string;
}

interface DailyCostItem {
  date: string;
  totalCostYuan: number;
  totalRequests: number;
  byProvider: Record<string, number>;
}

interface CostHistorySummary {
  range: {
    label: string;
    start: string;
    end: string;
    days: number;
  };
  configPath: string;
  logFilePath: string;
  totalCostYuan: number;
  totalRequests: number;
  trackedEvents: number;
  daily: DailyCostItem[];
  message: string;
}

interface CostExportCommandOptions {
  format?: string;
  output?: string;
}

type ExportFormat = "csv" | "json";

interface CostExportSummary {
  format: ExportFormat;
  outputPath: string | null;
  configPath: string;
  logFilePath: string;
  trackedEvents: number;
  bytes: number;
  payload?: string;
  message: string;
}

const DAEMON_LOG_FILE_NAME = "agent-daemon.log";
const DEFAULT_HISTORY_RANGE_DAYS = 7;
const MAX_HISTORY_RANGE_DAYS = 3650;
const RANGE_PATTERN = /^(\d+)\s*d$/i;
const BRACKET_TIMESTAMP_PATTERN = /^\[(?<timestamp>[^\]]+)\]/;
const TIMESTAMP_KEYS = [
  "timestamp",
  "time",
  "ts",
  "createdAt",
  "created_at",
  "eventTime",
  "event_time",
] as const;

export function registerCostCommand(program: Command): void {
  const costCommand = program
    .command("cost")
    .description("Show cost summary and exports / 查看成本摘要与导出");

  costCommand.action(async (_options: unknown, command: Command) => {
    const globalOptions = resolveGlobalOptions(command);
    const locale = globalOptions.locale;

    try {
      const summary = await getTodayCostSummary(locale);
      emitCostSummary(globalOptions, summary);
    } catch (error: unknown) {
      emitError(globalOptions, toErrorMessage(error, locale));
      process.exitCode = 1;
    }
  });

  costCommand
    .command("history")
    .description("Show historical cost summary / 查看历史成本")
    .option(
      "--range <range>",
      "Date range like 7d / 日期范围，例如 7d",
      `${String(DEFAULT_HISTORY_RANGE_DAYS)}d`,
    )
    .action(async (options: CostHistoryCommandOptions, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await getHistorySummary(locale, options.range);
        emitHistorySummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });

  costCommand
    .command("export")
    .description("Export tracked cost events / 导出成本事件")
    .option("--format <format>", "Export format: csv|json / 导出格式: csv|json", "csv")
    .option("-o, --output <path>", "Write export to file / 输出到文件")
    .action(async (options: CostExportCommandOptions, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await exportCostData(locale, options);
        emitExportSummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });
}

async function getTodayCostSummary(locale: CliLocale): Promise<CostCommandSummary> {
  const context = await loadCostContext(locale);
  const now = new Date();
  const daily = context.tracker.getDailySummary(now);
  const providerStatuses = collectProviderStatuses(context);
  const message =
    daily.totalRequests > 0
      ? text(locale, "Loaded today's cost summary.", "已加载今日成本摘要。")
      : text(
          locale,
          "No cost events found for today.",
          "今日未发现成本事件。",
        );

  return {
    date: toIsoDate(daily.date),
    configPath: context.configPath,
    logFilePath: context.logFilePath,
    totalCostYuan: daily.totalCostYuan,
    totalRequests: daily.totalRequests,
    byProvider: daily.byProvider,
    providerStatuses,
    trackedEvents: context.events.length,
    message,
  };
}

async function getHistorySummary(
  locale: CliLocale,
  rangeValue: string | undefined,
): Promise<CostHistorySummary> {
  const context = await loadCostContext(locale);
  const days = parseHistoryRangeDays(rangeValue, locale);
  const now = new Date();
  const start = startOfDay(addDays(now, -(days - 1)));
  const history = context.tracker.getHistory({
    start,
    end: now,
  });

  const daily = history.daily.map((item) => ({
    date: toIsoDate(item.date),
    totalCostYuan: item.totalCostYuan,
    totalRequests: item.totalRequests,
    byProvider: item.byProvider,
  }));
  const totalCostYuan = daily.reduce(
    (sum, item) => sum + item.totalCostYuan,
    0,
  );
  const totalRequests = daily.reduce(
    (sum, item) => sum + item.totalRequests,
    0,
  );
  const message =
    totalRequests > 0
      ? text(locale, "Loaded cost history.", "已加载成本历史。")
      : text(
          locale,
          "No cost events found in the selected range.",
          "选定范围内未发现成本事件。",
        );

  return {
    range: {
      label: `${String(days)}d`,
      start: toIsoDate(history.range.start),
      end: toIsoDate(history.range.end),
      days,
    },
    configPath: context.configPath,
    logFilePath: context.logFilePath,
    totalCostYuan: roundTo6(totalCostYuan),
    totalRequests,
    trackedEvents: context.events.length,
    daily,
    message,
  };
}

async function exportCostData(
  locale: CliLocale,
  options: CostExportCommandOptions,
): Promise<CostExportSummary> {
  const context = await loadCostContext(locale);
  const format = resolveExportFormat(options.format, locale);
  const payload = context.tracker.export(format);
  const bytes = Buffer.byteLength(payload, "utf8");
  const outputPathInput = normalizeOptionalString(options.output);

  if (outputPathInput !== undefined) {
    const absolutePath = resolve(outputPathInput);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, payload, "utf8");

    return {
      format,
      outputPath: absolutePath,
      configPath: context.configPath,
      logFilePath: context.logFilePath,
      trackedEvents: context.events.length,
      bytes,
      message: text(
        locale,
        "Cost data exported to file.",
        "成本数据已导出到文件。",
      ),
    };
  }

  return {
    format,
    outputPath: null,
    configPath: context.configPath,
    logFilePath: context.logFilePath,
    trackedEvents: context.events.length,
    bytes,
    payload,
    message: text(
      locale,
      "Cost data export payload generated.",
      "已生成成本导出内容。",
    ),
  };
}

async function loadCostContext(locale: CliLocale): Promise<CostContext> {
  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const paths = configManager.getPaths();
  const runtimeFiles = toRuntimeFilePaths(paths);
  const events = await loadUsageEvents(runtimeFiles.logFilePath);
  const providerPolicies = buildProviderPolicies(config);
  const tracker = createQuotaTracker({
    locale,
    providers: providerPolicies,
  });

  for (const event of events) {
    tracker.record(event);
  }

  return {
    configPath: paths.configFilePath,
    logFilePath: runtimeFiles.logFilePath,
    config,
    tracker,
    events,
  };
}

function buildProviderPolicies(config: OneclawConfig): readonly ProviderQuotaPolicy[] {
  const warningThreshold = config.quotas.warningThreshold;
  const window = resolveQuotaWindow(config);
  const limit = resolveQuotaLimit(config, window);

  return config.models.providers.map((provider) => ({
    providerId: provider.id,
    type: "token_based",
    window,
    limit,
    warningThreshold,
  }));
}

function resolveQuotaWindow(config: OneclawConfig): ProviderQuotaPolicy["window"] {
  if (config.quotas.monthlyLimit !== undefined) {
    return "monthly";
  }
  if (config.quotas.weeklyLimit !== undefined) {
    return "weekly";
  }
  if (config.quotas.dailyLimit !== undefined) {
    return "daily";
  }
  return "monthly";
}

function resolveQuotaLimit(
  config: OneclawConfig,
  window: ProviderQuotaPolicy["window"],
): number | null | undefined {
  if (window === "monthly") {
    return config.quotas.monthlyLimit ?? null;
  }
  if (window === "weekly") {
    return config.quotas.weeklyLimit ?? null;
  }
  if (window === "daily") {
    return config.quotas.dailyLimit ?? null;
  }
  return null;
}

async function loadUsageEvents(logFilePath: string): Promise<readonly UsageEvent[]> {
  let rawLog: string;
  let fallbackTimestamp: Date;

  try {
    const [raw, stats] = await Promise.all([readFile(logFilePath, "utf8"), stat(logFilePath)]);
    rawLog = raw;
    fallbackTimestamp = new Date(stats.mtime.getTime());
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }

  const lines = rawLog.split(/\r?\n/u);
  const events: UsageEvent[] = [];

  for (const line of lines) {
    const timestamp = resolveTimestampFromLogLine(line) ?? fallbackTimestamp;
    const parsed = parseOpenClawLogLine(line, "stdout", { timestamp });
    if (parsed === null || parsed.costEvent === null) {
      continue;
    }

    const usageEvent = toUsageEvent(parsed.costEvent);
    if (usageEvent === null) {
      continue;
    }
    events.push(usageEvent);
  }

  events.sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );

  return events;
}

function toUsageEvent(costEvent: CostEvent): UsageEvent | null {
  const provider = normalizeOptionalString(costEvent.provider);
  const model = normalizeOptionalString(costEvent.model);
  const inputTokens = normalizeTokenCount(costEvent.inputTokens);
  const outputTokens = normalizeTokenCount(costEvent.outputTokens);
  const traceId = normalizeOptionalString(costEvent.traceId);
  const timestamp = cloneValidDate(costEvent.timestamp);

  if (
    provider === undefined ||
    model === undefined ||
    inputTokens === null ||
    outputTokens === null ||
    traceId === undefined ||
    timestamp === null
  ) {
    return null;
  }

  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    timestamp,
    traceId,
  };
}

function collectProviderStatuses(context: CostContext): Record<string, QuotaStatus> {
  const statuses: Record<string, QuotaStatus> = {};
  for (const provider of context.config.models.providers) {
    statuses[provider.id] = context.tracker.getStatus(provider.id);
  }
  return statuses;
}

function parseHistoryRangeDays(
  value: string | undefined,
  locale: CliLocale,
): number {
  if (value === undefined) {
    return DEFAULT_HISTORY_RANGE_DAYS;
  }

  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return DEFAULT_HISTORY_RANGE_DAYS;
  }

  const matched = normalized.match(RANGE_PATTERN);
  if (matched === null) {
    throw new Error(
      text(
        locale,
        `Invalid range "${normalized}". Use format like 7d.`,
        `无效范围 "${normalized}"。请使用类似 7d 的格式。`,
      ),
    );
  }

  const daysToken = matched[1];
  if (daysToken === undefined) {
    throw new Error(
      text(
        locale,
        `Invalid range "${normalized}". Use format like 7d.`,
        `无效范围 "${normalized}"。请使用类似 7d 的格式。`,
      ),
    );
  }

  const parsed = Number.parseInt(daysToken, 10);
  if (
    !Number.isInteger(parsed) ||
    parsed <= 0 ||
    parsed > MAX_HISTORY_RANGE_DAYS
  ) {
    throw new Error(
      text(
        locale,
        `Range days must be between 1 and ${String(MAX_HISTORY_RANGE_DAYS)}.`,
        `范围天数必须在 1 到 ${String(MAX_HISTORY_RANGE_DAYS)} 之间。`,
      ),
    );
  }

  return parsed;
}

function resolveExportFormat(
  value: string | undefined,
  locale: CliLocale,
): ExportFormat {
  const normalized = normalizeOptionalString(value) ?? "csv";
  if (normalized === "csv" || normalized === "json") {
    return normalized;
  }

  throw new Error(
    text(
      locale,
      `Unsupported export format: ${normalized}.`,
      `不支持的导出格式：${normalized}。`,
    ),
  );
}

function resolveTimestampFromLogLine(line: string): Date | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const bracketMatch = trimmed.match(BRACKET_TIMESTAMP_PATTERN);
  if (bracketMatch?.groups?.timestamp !== undefined) {
    const fromBracket = parseTimestampValue(bracketMatch.groups.timestamp);
    if (fromBracket !== null) {
      return fromBracket;
    }
  }

  const payload = tryParseRecord(trimmed);
  if (payload === null) {
    return null;
  }

  for (const key of TIMESTAMP_KEYS) {
    if (!(key in payload)) {
      continue;
    }
    const fromPayload = parseTimestampValue(payload[key]);
    if (fromPayload !== null) {
      return fromPayload;
    }
  }

  return null;
}

function parseTimestampValue(value: unknown): Date | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsedMs = Date.parse(trimmed);
    if (Number.isNaN(parsedMs)) {
      return null;
    }
    return new Date(parsedMs);
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const asMilliseconds = value > 10_000_000_000 ? value : value * 1_000;
    return new Date(asMilliseconds);
  }

  return null;
}

function tryParseRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeTokenCount(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value);
}

function cloneValidDate(value: Date): Date | null {
  if (!(value instanceof Date)) {
    return null;
  }
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return new Date(value.getTime());
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toRuntimeFilePaths(paths: OneclawConfigPaths): RuntimeFilePaths {
  return {
    logFilePath: join(paths.dataDir, DAEMON_LOG_FILE_NAME),
  };
}

function emitCostSummary(options: CliGlobalOptions, summary: CostCommandSummary): void {
  if (options.json) {
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (options.quiet) {
    output.write(`${formatYuan(summary.totalCostYuan)}\n`);
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Date", "日期")}: ${summary.date}\n`);
  output.write(
    `${text(options.locale, "Total requests", "总请求数")}: ${String(summary.totalRequests)}\n`,
  );
  output.write(
    `${text(options.locale, "Total cost (CNY)", "总成本 (CNY)")}: ${formatYuan(summary.totalCostYuan)}\n`,
  );
  output.write(
    `${text(options.locale, "Tracked events", "已跟踪事件")}: ${String(summary.trackedEvents)}\n`,
  );
  output.write(
    `${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`,
  );
  output.write(
    `${text(options.locale, "Log file", "日志文件")}: ${summary.logFilePath}\n`,
  );

  const providers = Object.entries(summary.byProvider).sort(
    (left, right) => right[1] - left[1],
  );
  if (providers.length === 0) {
    output.write(`${text(options.locale, "By provider: none", "按供应商: 无")}\n`);
    return;
  }

  output.write(`${text(options.locale, "By provider", "按供应商")}:` + "\n");
  for (const [providerId, amount] of providers) {
    output.write(`- ${providerId}: ${formatYuan(amount)}\n`);
  }
}

function emitHistorySummary(options: CliGlobalOptions, summary: CostHistorySummary): void {
  if (options.json) {
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (options.quiet) {
    output.write(`${formatYuan(summary.totalCostYuan)}\n`);
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(
    `${text(options.locale, "Range", "范围")}: ${summary.range.label} (${summary.range.start} -> ${summary.range.end})\n`,
  );
  output.write(
    `${text(options.locale, "Total requests", "总请求数")}: ${String(summary.totalRequests)}\n`,
  );
  output.write(
    `${text(options.locale, "Total cost (CNY)", "总成本 (CNY)")}: ${formatYuan(summary.totalCostYuan)}\n`,
  );
  output.write(
    `${text(options.locale, "Tracked events", "已跟踪事件")}: ${String(summary.trackedEvents)}\n`,
  );
  output.write(
    `${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`,
  );
  output.write(
    `${text(options.locale, "Log file", "日志文件")}: ${summary.logFilePath}\n`,
  );

  if (summary.daily.length === 0) {
    return;
  }

  output.write(`${text(options.locale, "Daily breakdown", "每日明细")}:` + "\n");
  for (const item of summary.daily) {
    output.write(
      `- ${item.date} | ${text(options.locale, "requests", "请求")}: ${String(item.totalRequests)} | ${text(options.locale, "cost", "成本")}: ${formatYuan(item.totalCostYuan)}\n`,
    );
  }
}

function emitExportSummary(options: CliGlobalOptions, summary: CostExportSummary): void {
  if (options.json) {
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (summary.outputPath === null) {
    if (summary.payload !== undefined) {
      output.write(ensureTrailingNewline(summary.payload));
    }
    return;
  }

  if (options.quiet) {
    output.write(`${summary.outputPath}\n`);
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Format", "格式")}: ${summary.format}\n`);
  output.write(`${text(options.locale, "Output file", "输出文件")}: ${summary.outputPath}\n`);
  output.write(`${text(options.locale, "Bytes", "字节数")}: ${String(summary.bytes)}\n`);
  output.write(
    `${text(options.locale, "Tracked events", "已跟踪事件")}: ${String(summary.trackedEvents)}\n`,
  );
  output.write(
    `${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`,
  );
  output.write(
    `${text(options.locale, "Log file", "日志文件")}: ${summary.logFilePath}\n`,
  );
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function formatYuan(value: number): string {
  return roundTo6(value).toFixed(6);
}

function roundTo6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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
