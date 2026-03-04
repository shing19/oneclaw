//! Tauri IPC command — bridges frontend `invoke()` calls to the sidecar.
//!
//! The frontend calls `invoke("ipc_request", { method, params })` and
//! receives the JSON-RPC result directly.

use serde_json::Value;
use tauri::State;

use super::sidecar::SidecarState;

/// Generic IPC request handler.
///
/// Forwards any JSON-RPC method call to the sidecar and returns the result.
#[tauri::command]
pub async fn ipc_request(
    state: State<'_, SidecarState>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    state.call(&method, params).await
}
