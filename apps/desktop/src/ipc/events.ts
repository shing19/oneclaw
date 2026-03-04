/**
 * IPC event notification types (sidecar → Rust → frontend).
 *
 * These are JSON-RPC notifications (no `id`) pushed from the sidecar
 * and bridged to the frontend as Tauri events.
 */

// ── Sidecar lifecycle events ───────────────────────────────────────

/** Emitted when the sidecar process is ready. */
export interface SidecarReadyEvent {
  readonly version: string;
}

// ── Agent events ───────────────────────────────────────────────────

/** `event.log` — real-time log entry from the agent kernel. */
export interface LogEvent {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  readonly traceId: string;
  readonly metadata?: Record<string, unknown>;
}

/** `event.status` — agent kernel status change. */
export interface StatusEvent {
  readonly state: "starting" | "running" | "stopping" | "stopped" | "error";
  readonly uptime: number;
  readonly activeAgents: number;
  readonly lastError?: {
    readonly code: string;
    readonly message: string;
    /** ISO 8601 timestamp. */
    readonly timestamp: string;
  };
}

/** `event.cost` — real-time cost event from the agent kernel. */
export interface CostEventPayload {
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostYuan: number;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  readonly traceId: string;
}

// ── Tauri event name constants ─────────────────────────────────────
// React frontend listens on these event names via `listen()`.

export const TAURI_EVENT_SIDECAR_READY = "sidecar-ready" as const;
export const TAURI_EVENT_AGENT_LOG = "agent-log" as const;
export const TAURI_EVENT_AGENT_STATUS = "agent-status" as const;
export const TAURI_EVENT_AGENT_COST = "agent-cost" as const;

/** Map from Tauri event name → payload type (for type-safe `listen()`). */
export interface TauriEventMap {
  [TAURI_EVENT_SIDECAR_READY]: SidecarReadyEvent;
  [TAURI_EVENT_AGENT_LOG]: LogEvent;
  [TAURI_EVENT_AGENT_STATUS]: StatusEvent;
  [TAURI_EVENT_AGENT_COST]: CostEventPayload;
}

/** Map from JSON-RPC notification method → payload type. */
export interface JsonRpcNotificationMap {
  "ready": SidecarReadyEvent;
  "event.log": LogEvent;
  "event.status": StatusEvent;
  "event.cost": CostEventPayload;
}
