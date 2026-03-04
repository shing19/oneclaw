/**
 * Sidecar handlers for `agent.*` operations.
 *
 * Read:
 *   agent.status  — current kernel status
 *   agent.health  — detailed health report
 *
 * Write:
 *   agent.start   — start the agent kernel
 *   agent.stop    — stop the agent kernel
 *   agent.restart — restart the agent kernel
 */

import type { SidecarContext } from "../context.js";
import { mapKernelError, SidecarHandlerError } from "./errors.js";

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

export function handleAgentStatus(ctx: SidecarContext): AgentStatusResult {
  const kernel = ctx.getAgentKernel();
  const status = kernel.getStatus();

  return {
    state: status.state,
    uptime: status.uptime,
    activeAgents: status.activeAgents,
    lastError:
      status.lastError === undefined
        ? undefined
        : {
            code: status.lastError.code,
            message: status.lastError.message,
            timestamp: status.lastError.timestamp.toISOString(),
            stack: status.lastError.stack,
          },
  };
}

export async function handleAgentHealth(
  ctx: SidecarContext,
): Promise<AgentHealthResult> {
  const kernel = ctx.getAgentKernel();

  try {
    const report = await kernel.getHealth();
    return {
      endpoints: report.endpoints.map((ep) => ({
        provider: ep.provider,
        url: ep.url,
        status: ep.status,
        latencyMs: ep.latencyMs,
        lastChecked: ep.lastChecked.toISOString(),
      })),
      memory: { used: report.memory.used, total: report.memory.total },
      activeConnections: report.activeConnections,
      timestamp: report.timestamp.toISOString(),
    };
  } catch {
    return {
      endpoints: [],
      memory: { used: 0, total: 0 },
      activeConnections: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

export async function handleAgentStart(
  ctx: SidecarContext,
): Promise<{ ok: true }> {
  const kernel = ctx.getAgentKernel();
  const config = await ctx.loadConfig();

  const agentConfig = {
    modelConfig: config.models,
    concurrency: config.agent.concurrency,
    skills: config.agent.skills,
    workspacePaths: config.agent.mountPoints,
    timeoutSeconds: config.agent.timeoutSeconds,
  };

  try {
    await kernel.start(agentConfig);
    return { ok: true };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapKernelError(error, ctx.locale));
  }
}

export async function handleAgentStop(
  ctx: SidecarContext,
): Promise<{ ok: true }> {
  const kernel = ctx.getAgentKernel();

  try {
    await kernel.stop();
    return { ok: true };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapKernelError(error, ctx.locale));
  }
}

export async function handleAgentRestart(
  ctx: SidecarContext,
): Promise<{ ok: true }> {
  const kernel = ctx.getAgentKernel();

  try {
    await kernel.restart();
    return { ok: true };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapKernelError(error, ctx.locale));
  }
}
