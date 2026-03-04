/**
 * IPC contracts for `agent.*` namespace.
 *
 * Maps to AgentKernel operations in @oneclaw/core.
 */

// ── Serializable mirrors of core types ─────────────────────────────
// Date fields are serialized as ISO strings over JSON-RPC.

export interface IpcErrorInfo {
  readonly code: string;
  readonly message: string;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  readonly stack?: string;
}

export interface IpcKernelStatus {
  readonly state: "starting" | "running" | "stopping" | "stopped" | "error";
  readonly uptime: number;
  readonly activeAgents: number;
  readonly lastError?: IpcErrorInfo;
}

export interface IpcEndpointHealth {
  readonly provider: string;
  readonly url: string;
  readonly status: "ok" | "degraded" | "unreachable";
  readonly latencyMs: number;
  /** ISO 8601 timestamp. */
  readonly lastChecked: string;
}

export interface IpcHealthReport {
  readonly endpoints: IpcEndpointHealth[];
  readonly memory: { readonly used: number; readonly total: number };
  readonly activeConnections: number;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
}

// ── Request params ─────────────────────────────────────────────────

/** `agent.start` — start the agent kernel. No params required (config loaded from file). */
export type AgentStartParams = Record<string, never>;

/** `agent.stop` — stop the agent kernel gracefully. */
export type AgentStopParams = Record<string, never>;

/** `agent.restart` — restart the agent kernel. */
export type AgentRestartParams = Record<string, never>;

/** `agent.status` — get current kernel status. */
export type AgentStatusParams = Record<string, never>;

/** `agent.health` — get detailed health report. */
export type AgentHealthParams = Record<string, never>;

// ── Response results ───────────────────────────────────────────────

/** `agent.start` result. */
export interface AgentStartResult {
  readonly ok: true;
}

/** `agent.stop` result. */
export interface AgentStopResult {
  readonly ok: true;
}

/** `agent.restart` result. */
export interface AgentRestartResult {
  readonly ok: true;
}

/** `agent.status` result. */
export type AgentStatusResult = IpcKernelStatus;

/** `agent.health` result. */
export type AgentHealthResult = IpcHealthReport;
