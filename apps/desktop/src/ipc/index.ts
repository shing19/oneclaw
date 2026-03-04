/**
 * OneClaw IPC contracts — barrel export.
 *
 * Shared between:
 * - React frontend (Tauri invoke calls)
 * - Sidecar process (JSON-RPC handler dispatch)
 * - Integration tests (contract compatibility checks)
 */

// JSON-RPC 2.0 base types
export * from "./jsonrpc.js";

// Method contracts by namespace
export * from "./methods/agent.js";
export * from "./methods/config.js";
export * from "./methods/model.js";
export * from "./methods/secret.js";
export * from "./methods/channel.js";
export * from "./methods/cost.js";
export * from "./methods/doctor.js";

// Event notifications
export * from "./events.js";

// Unified method map
export * from "./method-map.js";
