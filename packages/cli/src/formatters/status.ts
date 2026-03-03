import { formatJson, formatJsonError } from "./json.js";
import { formatTable } from "./table.js";

export type CliLocale = "zh-CN" | "en";
export type AgentHealthStatus = "ok" | "degraded" | "unreachable";
export type KernelRuntimeState = "starting" | "running" | "stopping" | "stopped" | "error";

export interface StatusSummary {
  running: boolean;
  state: KernelRuntimeState;
  health: AgentHealthStatus;
  mode: "foreground" | "daemon" | "unknown";
  pid: number | null;
  pidAlive: boolean;
  currentModel: string;
  configPath: string;
  pidFilePath: string;
  stateFilePath: string;
  logFilePath: string;
  startedAt: string | null;
  updatedAt: string | null;
  uptimeMs: number | null;
  lastError?: string;
  message: string;
}

export interface StatusFormatterOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

export function formatStatusSummary(
  summary: StatusSummary,
  options: StatusFormatterOptions,
): string {
  if (options.json) {
    return formatJson(summary);
  }

  if (options.quiet) {
    return `${summary.state}\n`;
  }

  const locale = options.locale;
  const rows: string[][] = [
    [text(locale, "State", "状态"), summary.state],
    [text(locale, "Health", "健康"), summary.health],
    [text(locale, "Model", "模型"), summary.currentModel],
    [text(locale, "Mode", "模式"), summary.mode],
    [text(locale, "PID", "进程 PID"), summary.pid === null ? "-" : String(summary.pid)],
    [text(locale, "Process alive", "进程存活"), summary.pidAlive ? "yes" : "no"],
    [text(locale, "Started at", "启动时间"), summary.startedAt ?? "-"],
    [text(locale, "Updated at", "更新时间"), summary.updatedAt ?? "-"],
    [
      text(locale, "Uptime(ms)", "运行时长(毫秒)"),
      summary.uptimeMs === null ? "-" : String(summary.uptimeMs),
    ],
    [text(locale, "Config", "配置文件"), summary.configPath],
    [text(locale, "State file", "状态文件"), summary.stateFilePath],
    [text(locale, "Log file", "日志文件"), summary.logFilePath],
  ];

  if (summary.lastError !== undefined && summary.lastError.length > 0) {
    rows.push([text(locale, "Last error", "最近错误"), summary.lastError]);
  }

  const table = formatTable(
    [
      { header: text(locale, "Field", "字段") },
      { header: text(locale, "Value", "值") },
    ],
    rows,
  );

  return `${summary.message}\n${table}\n`;
}

export function formatStatusError(message: string, options: StatusFormatterOptions): string {
  if (options.json) {
    return formatJsonError(message);
  }
  return `${message}\n`;
}

function text(locale: CliLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}
