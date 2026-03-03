import type {
  AdapterError,
  AdapterErrorCode,
  AgentConfig,
  AgentKernel,
  CostEvent,
  ErrorInfo,
  HealthReport,
  KernelStatus,
  LogEntry,
} from "../types/agent-adapter.js";
import type { Disposable } from "../types/model-config.js";
import { AgentKernelEventStream } from "./event-stream.js";

export type AgentKernelLocale = "zh-CN" | "en";

export interface AgentKernelBaseOptions {
  locale?: AgentKernelLocale;
  now?: () => number;
}

type KernelState = KernelStatus["state"];

const ERROR_RECOVERABILITY: Readonly<Record<AdapterErrorCode, boolean>> = {
  KERNEL_START_FAILED: false,
  KERNEL_CRASHED: true,
  CONFIG_TRANSLATION_FAILED: false,
  PROCESS_TIMEOUT: true,
  IPC_ERROR: true,
};

export class AgentKernelError extends Error implements AdapterError {
  readonly code: AdapterErrorCode;
  readonly recoverable: boolean;
  override readonly cause?: Error;

  constructor(
    code: AdapterErrorCode,
    locale: AgentKernelLocale,
    options: { cause?: unknown } = {},
  ) {
    super(messageForAdapterError(code, locale));
    this.name = "AgentKernelError";
    this.code = code;
    this.recoverable = ERROR_RECOVERABILITY[code];
    this.cause = toError(options.cause);
  }
}

export abstract class AgentKernelBase implements AgentKernel {
  protected readonly locale: AgentKernelLocale;
  private readonly now: () => number;
  private readonly eventStream: AgentKernelEventStream;

  private status: KernelStatus;
  private lastConfig: AgentConfig | null;
  private startedAtMs: number | null;

  protected constructor(options: AgentKernelBaseOptions = {}) {
    this.locale = options.locale ?? "zh-CN";
    this.now = options.now ?? Date.now;
    this.eventStream = new AgentKernelEventStream({
      cloneLog: cloneLogEntry,
      cloneStatus: cloneKernelStatus,
      cloneCost: cloneCostEvent,
      cloneError: cloneErrorInfo,
    });
    this.lastConfig = null;
    this.startedAtMs = null;
    this.status = {
      state: "stopped",
      uptime: 0,
      activeAgents: 0,
    };
  }

  async start(config: AgentConfig): Promise<void> {
    if (this.status.state === "starting" || this.status.state === "running") {
      throw new AgentKernelError("IPC_ERROR", this.locale);
    }

    if (this.status.state === "stopping") {
      throw new AgentKernelError("PROCESS_TIMEOUT", this.locale);
    }

    const configSnapshot = cloneAgentConfig(config);
    this.lastConfig = configSnapshot;
    this.updateStatus({
      state: "starting",
      lastError: undefined,
    });

    try {
      await this.onStart(cloneAgentConfig(configSnapshot));
      this.startedAtMs = this.now();
      this.updateStatus({
        state: "running",
        lastError: undefined,
      });
    } catch (error: unknown) {
      const wrappedError = toAdapterError("KERNEL_START_FAILED", this.locale, error);
      this.startedAtMs = null;
      this.updateStatus({
        state: "error",
        lastError: toErrorInfo(wrappedError),
      });
      throw wrappedError;
    }
  }

  async stop(): Promise<void> {
    if (this.status.state === "stopped") {
      return;
    }

    this.updateStatus({
      state: "stopping",
    });

    try {
      await this.onStop();
      this.startedAtMs = null;
      this.updateStatus({
        state: "stopped",
        activeAgents: 0,
        lastError: undefined,
      });
    } catch (error: unknown) {
      const wrappedError = toAdapterError("PROCESS_TIMEOUT", this.locale, error);
      this.updateStatus({
        state: "error",
        lastError: toErrorInfo(wrappedError),
      });
      throw wrappedError;
    }
  }

  async restart(): Promise<void> {
    if (this.lastConfig === null) {
      throw new AgentKernelError("KERNEL_START_FAILED", this.locale);
    }

    await this.stop();
    await this.start(cloneAgentConfig(this.lastConfig));
  }

  getStatus(): KernelStatus {
    const uptime = computeUptimeMs(this.startedAtMs, this.now(), this.status.state);
    return cloneKernelStatus({
      ...this.status,
      uptime,
    });
  }

  async getHealth(): Promise<HealthReport> {
    try {
      const report = await this.onHealthCheck();
      return cloneHealthReport(report);
    } catch (error: unknown) {
      throw toAdapterError("IPC_ERROR", this.locale, error);
    }
  }

  onLog(callback: (entry: LogEntry) => void): Disposable {
    return this.eventStream.onLog(callback);
  }

  onStatusChange(callback: (status: KernelStatus) => void): Disposable {
    return this.eventStream.onStatus(callback);
  }

  onCostEvent(callback: (event: CostEvent) => void): Disposable {
    return this.eventStream.onCost(callback);
  }

  onError(callback: (error: ErrorInfo) => void): Disposable {
    return this.eventStream.onError(callback);
  }

  protected getLastConfig(): AgentConfig | null {
    if (this.lastConfig === null) {
      return null;
    }
    return cloneAgentConfig(this.lastConfig);
  }

  protected setActiveAgents(count: number): void {
    const normalizedCount = normalizeActiveAgentCount(count);
    if (normalizedCount === this.status.activeAgents) {
      return;
    }

    this.updateStatus({
      activeAgents: normalizedCount,
    });
  }

  protected emitLog(entry: LogEntry): void {
    this.eventStream.emitLog(entry);
  }

  protected emitCostEvent(event: CostEvent): void {
    this.eventStream.emitCost(event);
  }

  protected emitKernelCrashed(error: unknown): void {
    const wrappedError = toAdapterError("KERNEL_CRASHED", this.locale, error);
    const errorInfo = toErrorInfo(wrappedError);
    this.updateStatus({
      state: "error",
      lastError: errorInfo,
    });
    this.eventStream.emitError(errorInfo);
  }

  protected abstract onStart(config: AgentConfig): Promise<void>;

  protected abstract onStop(): Promise<void>;

  protected abstract onHealthCheck(): Promise<HealthReport>;

  private updateStatus(partial: Partial<KernelStatus>): void {
    const nextStatus: KernelStatus = {
      state: partial.state ?? this.status.state,
      uptime:
        partial.uptime ??
        computeUptimeMs(this.startedAtMs, this.now(), partial.state ?? this.status.state),
      activeAgents:
        partial.activeAgents !== undefined
          ? normalizeActiveAgentCount(partial.activeAgents)
          : this.status.activeAgents,
      lastError: partial.lastError,
    };

    if (nextStatus.state === "stopped") {
      nextStatus.uptime = 0;
    }

    this.status = cloneKernelStatus(nextStatus);
    this.emitStatusChange();
  }

  private emitStatusChange(): void {
    const statusSnapshot = this.getStatus();
    this.eventStream.emitStatus(statusSnapshot);
  }
}

export function toAdapterError(
  code: AdapterErrorCode,
  locale: AgentKernelLocale,
  cause: unknown,
): AgentKernelError {
  if (cause instanceof AgentKernelError) {
    return cause;
  }

  return new AgentKernelError(code, locale, { cause });
}

function cloneAgentConfig(config: AgentConfig): AgentConfig {
  return {
    modelConfig: cloneJsonRecord(config.modelConfig),
    concurrency: {
      maxConcurrent: config.concurrency.maxConcurrent,
      subagents: {
        maxConcurrent: config.concurrency.subagents.maxConcurrent,
        maxSpawnDepth: config.concurrency.subagents.maxSpawnDepth,
        maxChildrenPerAgent: config.concurrency.subagents.maxChildrenPerAgent,
      },
    },
    skills: config.skills.map((skill) => ({
      id: skill.id,
      enabled: skill.enabled,
      options: cloneJsonRecord(skill.options),
    })),
    workspacePaths: config.workspacePaths.map((mountPoint) => ({
      hostPath: mountPoint.hostPath,
      containerPath: mountPoint.containerPath,
      readonly: mountPoint.readonly,
    })),
    timeoutSeconds: config.timeoutSeconds,
  };
}

function cloneJsonRecord<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneKernelStatus(status: KernelStatus): KernelStatus {
  return {
    state: status.state,
    uptime: status.uptime,
    activeAgents: status.activeAgents,
    lastError: status.lastError === undefined ? undefined : cloneErrorInfo(status.lastError),
  };
}

function cloneHealthReport(report: HealthReport): HealthReport {
  return {
    endpoints: report.endpoints.map((endpoint) => ({
      provider: endpoint.provider,
      url: endpoint.url,
      status: endpoint.status,
      latencyMs: endpoint.latencyMs,
      lastChecked: new Date(endpoint.lastChecked.getTime()),
    })),
    memory: {
      used: report.memory.used,
      total: report.memory.total,
    },
    activeConnections: report.activeConnections,
    timestamp: new Date(report.timestamp.getTime()),
  };
}

function cloneLogEntry(entry: LogEntry): LogEntry {
  return {
    level: entry.level,
    message: entry.message,
    timestamp: new Date(entry.timestamp.getTime()),
    traceId: entry.traceId,
    metadata: cloneJsonRecord(entry.metadata),
  };
}

function cloneCostEvent(event: CostEvent): CostEvent {
  return {
    provider: event.provider,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    estimatedCostYuan: event.estimatedCostYuan,
    timestamp: new Date(event.timestamp.getTime()),
    traceId: event.traceId,
  };
}

function cloneErrorInfo(error: ErrorInfo): ErrorInfo {
  return {
    code: error.code,
    message: error.message,
    timestamp: new Date(error.timestamp.getTime()),
    stack: error.stack,
  };
}

function normalizeActiveAgentCount(count: number): number {
  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }
  return Math.floor(count);
}

function computeUptimeMs(
  startedAtMs: number | null,
  nowMs: number,
  state: KernelState,
): number {
  if (startedAtMs === null) {
    return 0;
  }
  if (state === "stopped") {
    return 0;
  }
  if (nowMs <= startedAtMs) {
    return 0;
  }
  return nowMs - startedAtMs;
}

function messageForAdapterError(
  code: AdapterErrorCode,
  locale: AgentKernelLocale,
): string {
  const map: Record<AdapterErrorCode, { zh: string; en: string }> = {
    KERNEL_START_FAILED: {
      zh: "Agent 内核启动失败，请检查配置与运行环境。",
      en: "Agent kernel failed to start. Check configuration and runtime prerequisites.",
    },
    KERNEL_CRASHED: {
      zh: "Agent 内核运行中崩溃。",
      en: "Agent kernel crashed during runtime.",
    },
    CONFIG_TRANSLATION_FAILED: {
      zh: "配置翻译失败，OneClaw 配置与内核配置不兼容。",
      en: "Configuration translation failed. OneClaw config is incompatible with kernel config.",
    },
    PROCESS_TIMEOUT: {
      zh: "Agent 内核进程超时无响应。",
      en: "Agent kernel process timed out and did not respond.",
    },
    IPC_ERROR: {
      zh: "Agent 内核通信失败。",
      en: "Agent kernel communication failed.",
    },
  };

  if (locale === "en") {
    return map[code].en;
  }
  return map[code].zh;
}

function toError(value: unknown): Error | undefined {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    return new Error(value);
  }
  return undefined;
}

function toErrorInfo(error: Error): ErrorInfo {
  return {
    code: error.name,
    message: error.message,
    timestamp: new Date(),
    stack: error.stack,
  };
}
