/**
 * Type-safe IPC client for the React frontend.
 *
 * Wraps Tauri `invoke()` calls with compile-time type checking
 * using the IpcMethodMap from the contract definitions.
 *
 * Usage:
 *   const status = await ipcCall("agent.status", {});
 *   const config = await ipcCall("config.get", {});
 */

import { invoke } from "@tauri-apps/api/core";
import type { IpcMethodName, IpcParams, IpcResult } from "./method-map.js";

/**
 * Call a JSON-RPC method on the sidecar via Tauri invoke.
 *
 * Type-safe: method name is validated against IpcMethodMap,
 * params and result types are inferred automatically.
 */
export async function ipcCall<M extends IpcMethodName>(
  method: M,
  params: IpcParams<M>,
): Promise<IpcResult<M>> {
  const result = await invoke("ipc_request", {
    method,
    params,
  });
  return result as IpcResult<M>;
}

/**
 * IPC error class for structured error handling.
 */
export class IpcError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(message: string, code: string, recoverable: boolean) {
    super(message);
    this.name = "IpcError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

/**
 * Call a JSON-RPC method with structured error handling.
 *
 * Returns `{ ok: true, data }` on success or `{ ok: false, error }` on failure.
 */
export async function ipcCallSafe<M extends IpcMethodName>(
  method: M,
  params: IpcParams<M>,
): Promise<
  | { ok: true; data: IpcResult<M> }
  | { ok: false; error: IpcError }
> {
  try {
    const data = await ipcCall(method, params);
    return { ok: true, data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: new IpcError(message, "IPC_ERROR", true),
    };
  }
}
