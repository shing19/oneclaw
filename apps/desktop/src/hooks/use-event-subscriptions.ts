/**
 * Hook that subscribes to sidecar runtime events and updates Zustand stores.
 *
 * Mount this once in the root App component to keep stores in sync
 * with real-time events from the sidecar process.
 *
 * Events handled:
 *   - agent-status → AgentStore.setStatus
 *   - agent-log    → AgentStore.addLog
 *   - agent-cost   → CostStore (accumulates per-event cost)
 */

import { useTauriEvent } from "./use-tauri-event";
import { useAgentStore, useCostStore } from "@/stores";

/**
 * Subscribe to all sidecar runtime events and route payloads to stores.
 * Call this once in the root component.
 */
export function useEventSubscriptions(): void {
  // Agent status changes → update agent store state
  useTauriEvent("agent-status", (payload) => {
    const validStates = new Set([
      "stopped",
      "starting",
      "running",
      "error",
    ] as const);
    if (validStates.has(payload.state as "stopped")) {
      useAgentStore
        .getState()
        .setStatus(payload.state as "stopped" | "starting" | "running" | "error");
    }
  });

  // Agent log entries → append to agent store log buffer
  useTauriEvent("agent-log", (payload) => {
    const prefix =
      payload.level === "error"
        ? "[ERROR]"
        : payload.level === "warn"
          ? "[WARN]"
          : payload.level === "debug"
            ? "[DEBUG]"
            : "[INFO]";
    useAgentStore
      .getState()
      .addLog(`${prefix} ${payload.timestamp} ${payload.message}`);
  });

  // Cost events → accumulate into today's cost summary
  useTauriEvent("agent-cost", (payload) => {
    const store = useCostStore.getState();
    const totalTokens = payload.inputTokens + payload.outputTokens;
    store.updateToday({
      amount: store.today.amount + payload.estimatedCostYuan,
      requests: store.today.requests + 1,
      tokens: store.today.tokens + totalTokens,
    });
  });
}
