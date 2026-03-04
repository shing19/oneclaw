/**
 * Sidecar handlers for `channel.*` read operations.
 *
 * channel.feishu.status — get Feishu channel connection status
 */

import type { SidecarContext } from "../context.js";

type IpcChannelStatus = "connected" | "disconnected" | "error";

interface IpcChannelErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export function handleChannelFeishuStatus(
  _ctx: SidecarContext,
): { status: IpcChannelStatus; error?: IpcChannelErrorInfo } {
  // No Feishu adapter connected yet — returns disconnected.
  // Will be updated when P2-B3 implements channel.feishu.setup / connect.
  return { status: "disconnected" };
}
