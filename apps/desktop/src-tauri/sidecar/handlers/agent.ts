/**
 * Sidecar handlers for `agent.*` read operations.
 *
 * agent.status — current kernel status (returns stopped when no kernel is running)
 * agent.health — detailed health report (returns empty report when no kernel is running)
 */

import type { SidecarContext } from "../context.js";

export interface AgentStatusResult {
  state: "starting" | "running" | "stopping" | "stopped" | "error";
  uptime: number;
  activeAgents: number;
  lastError?: {
    code: string;
    message: string;
    timestamp: string;
    stack?: string;
  };
}

export interface AgentHealthResult {
  endpoints: Array<{
    provider: string;
    url: string;
    status: "ok" | "degraded" | "unreachable";
    latencyMs: number;
    lastChecked: string;
  }>;
  memory: { used: number; total: number };
  activeConnections: number;
  timestamp: string;
}

export function handleAgentStatus(_ctx: SidecarContext): AgentStatusResult {
  // No kernel running yet — return default stopped status.
  // When P2-B3 implements agent.start, this will read from the live kernel.
  return {
    state: "stopped",
    uptime: 0,
    activeAgents: 0,
  };
}

export function handleAgentHealth(_ctx: SidecarContext): AgentHealthResult {
  // No kernel running yet — return empty health report.
  return {
    endpoints: [],
    memory: { used: 0, total: 0 },
    activeConnections: 0,
    timestamp: new Date().toISOString(),
  };
}
