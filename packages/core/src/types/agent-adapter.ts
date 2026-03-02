import type { Disposable, ModelConfig } from "./model-config.js";

export interface AgentKernel {
  start(config: AgentConfig): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getStatus(): KernelStatus;
  getHealth(): Promise<HealthReport>;
  onLog(callback: (entry: LogEntry) => void): Disposable;
  onStatusChange(callback: (status: KernelStatus) => void): Disposable;
  onCostEvent(callback: (event: CostEvent) => void): Disposable;
}

export interface AgentConfig {
  modelConfig: ModelConfig;
  concurrency: ConcurrencySettings;
  skills: SkillConfig[];
  workspacePaths: MountPoint[];
  timeoutSeconds: number;
}

export interface ConcurrencySettings {
  maxConcurrent: number;
  subagents: {
    maxConcurrent: number;
    maxSpawnDepth: number;
    maxChildrenPerAgent: number;
  };
}

export interface MountPoint {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

export interface SkillConfig {
  id: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface KernelStatus {
  state: "starting" | "running" | "stopping" | "stopped" | "error";
  uptime: number;
  activeAgents: number;
  lastError?: ErrorInfo;
}

export interface ErrorInfo {
  code: string;
  message: string;
  timestamp: Date;
  stack?: string;
}

export interface HealthReport {
  endpoints: EndpointHealth[];
  memory: { used: number; total: number };
  activeConnections: number;
  timestamp: Date;
}

export interface EndpointHealth {
  provider: string;
  url: string;
  status: "ok" | "degraded" | "unreachable";
  latencyMs: number;
  lastChecked: Date;
}

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: Date;
  traceId: string;
  metadata?: Record<string, unknown>;
}

export interface CostEvent {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostYuan: number;
  timestamp: Date;
  traceId: string;
}

export type AdapterErrorCode =
  | "KERNEL_START_FAILED"
  | "KERNEL_CRASHED"
  | "CONFIG_TRANSLATION_FAILED"
  | "PROCESS_TIMEOUT"
  | "IPC_ERROR";

export interface AdapterError extends Error {
  code: AdapterErrorCode;
  cause?: Error;
  recoverable: boolean;
}
