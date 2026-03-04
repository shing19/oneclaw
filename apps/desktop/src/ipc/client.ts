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
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { IpcMethodName, IpcParams, IpcResult } from "./method-map.js";
import type { TauriEventMap } from "./events.js";

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
 * Extract structured error data from a Tauri invoke error.
 *
 * Tauri may pass errors as strings or objects with `code`, `message`,
 * and `data` fields from the JSON-RPC error response.
 */
function parseIpcError(error: unknown): IpcError {
  // Tauri invoke errors may be plain strings
  if (typeof error === "string") {
    return new IpcError(error, "IPC_ERROR", true);
  }

  // Object error — may have structured fields from sidecar
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;

    // Extract message
    const message =
      typeof obj["message"] === "string"
        ? obj["message"]
        : error instanceof Error
          ? error.message
          : "Unknown error";

    // Try to extract code from obj.data.code (JSON-RPC error data shape)
    let code = "IPC_ERROR";
    let recoverable = true;
    const data = obj["data"];
    if (typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;
      if (typeof d["code"] === "string") code = d["code"];
      if (typeof d["recoverable"] === "boolean") recoverable = d["recoverable"];
    }
    // Also check direct fields (SidecarHandlerError shape)
    if (code === "IPC_ERROR" && typeof obj["code"] === "string") {
      code = obj["code"];
    }
    if (typeof obj["recoverable"] === "boolean") {
      recoverable = obj["recoverable"];
    }

    return new IpcError(message, code, recoverable);
  }

  return new IpcError(String(error), "IPC_ERROR", true);
}

/**
 * Call a JSON-RPC method with structured error handling.
 *
 * Returns `{ ok: true, data }` on success or `{ ok: false, error }` on failure.
 * Preserves structured error codes and recoverable flags from the sidecar.
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
    return { ok: false, error: parseIpcError(error) };
  }
}

type TauriEventName = keyof TauriEventMap;

/**
 * Subscribe to a Tauri event emitted by the sidecar bridge.
 *
 * Returns a promise resolving to an unlisten function.
 * Call the unlisten function to remove the listener.
 *
 * @example
 *   const unlisten = await listenToEvent("agent-status", (payload) => {
 *     console.log("Agent state:", payload.state);
 *   });
 *   // Later:
 *   unlisten();
 */
export async function listenToEvent<E extends TauriEventName>(
  event: E,
  callback: (payload: TauriEventMap[E]) => void,
): Promise<UnlistenFn> {
  return listen<TauriEventMap[E]>(event, (e) => {
    callback(e.payload);
  });
}
