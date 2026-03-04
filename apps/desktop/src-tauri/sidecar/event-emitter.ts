/**
 * Sidecar event emitter — writes JSON-RPC 2.0 notifications to stdout.
 *
 * Used by sidecar handlers to push real-time events (log, status, cost)
 * through the Rust bridge to the frontend via Tauri events.
 *
 * Notifications have no `id` field (fire-and-forget per JSON-RPC 2.0 spec).
 */

type NotificationMethod = "event.log" | "event.status" | "event.cost";

/**
 * Emit a JSON-RPC 2.0 notification to stdout.
 *
 * The Rust sidecar manager reads these and forwards them as Tauri events.
 */
export function emitNotification(
  method: NotificationMethod,
  params: Record<string, unknown>,
): void {
  const notification = JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
  });
  process.stdout.write(notification + "\n");
}

/** Emit a log event notification. */
export function emitLogEvent(params: {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
  traceId: string;
  metadata?: Record<string, unknown>;
}): void {
  emitNotification("event.log", params);
}

/** Emit a status change notification. */
export function emitStatusEvent(params: {
  state: "starting" | "running" | "stopping" | "stopped" | "error";
  uptime: number;
  activeAgents: number;
  lastError?: {
    code: string;
    message: string;
    timestamp: string;
  };
}): void {
  emitNotification("event.status", params);
}

/** Emit a cost event notification. */
export function emitCostEvent(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostYuan: number;
  timestamp: string;
  traceId: string;
}): void {
  emitNotification("event.cost", params);
}
