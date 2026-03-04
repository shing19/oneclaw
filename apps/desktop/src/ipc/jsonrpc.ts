/**
 * JSON-RPC 2.0 base types for OneClaw IPC.
 *
 * Used by both the React frontend (via Tauri invoke) and
 * the sidecar process (stdin/stdout transport).
 */

/** JSON-RPC 2.0 request object. */
export interface JsonRpcRequest<P = unknown> {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly method: string;
  readonly params?: P;
}

/** JSON-RPC 2.0 success response. */
export interface JsonRpcSuccessResponse<R = unknown> {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly result: R;
}

/** Structured JSON-RPC error data. */
export interface JsonRpcErrorData {
  readonly code: string;
  readonly recoverable: boolean;
  readonly details?: Record<string, unknown>;
}

/** JSON-RPC 2.0 error response. */
export interface JsonRpcErrorResponse {
  readonly jsonrpc: "2.0";
  readonly id: number | string | null;
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: JsonRpcErrorData;
  };
}

/** Union of success and error response. */
export type JsonRpcResponse<R = unknown> =
  | JsonRpcSuccessResponse<R>
  | JsonRpcErrorResponse;

/**
 * JSON-RPC 2.0 notification (no `id` field).
 * Used for server-initiated event push from sidecar → Rust → frontend.
 */
export interface JsonRpcNotification<P = unknown> {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: P;
}

// ── Standard JSON-RPC error codes ──────────────────────────────────

export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

// ── Application error codes (reserved -32000 to -32099) ────────────

export const APP_SIDECAR_NOT_READY = -32000;
export const APP_KERNEL_ERROR = -32001;
export const APP_CONFIG_ERROR = -32002;
export const APP_SECRET_ERROR = -32003;
export const APP_CHANNEL_ERROR = -32004;
export const APP_DOCTOR_ERROR = -32005;

// ── Helpers ────────────────────────────────────────────────────────

/** Type guard: check if response is an error. */
export function isJsonRpcError(
  response: JsonRpcResponse,
): response is JsonRpcErrorResponse {
  return "error" in response;
}

/** Type guard: check if a message is a notification (no `id`). */
export function isJsonRpcNotification(
  msg: JsonRpcRequest | JsonRpcNotification,
): msg is JsonRpcNotification {
  return !("id" in msg);
}
