//! Sidecar process manager.
//!
//! Spawns the OneClaw sidecar (a Bun-compiled TypeScript process),
//! manages its lifecycle, and provides request/response correlation
//! over stdin/stdout using JSON-RPC 2.0.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde_json::Value;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command as TokioCommand};
use tokio::sync::{Mutex, oneshot};

/// Manages the sidecar process and routes JSON-RPC messages.
pub struct SidecarState {
    /// Handle to the sidecar's stdin for writing requests.
    stdin: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
    /// Pending requests awaiting responses, keyed by request ID.
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    /// Monotonically increasing request ID counter.
    next_id: AtomicU64,
    /// Whether the sidecar has sent its "ready" notification.
    ready: Arc<Mutex<bool>>,
    /// Handle to the sidecar child process (for cleanup).
    child: Arc<Mutex<Option<Child>>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            stdin: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            ready: Arc::new(Mutex::new(false)),
            child: Arc::new(Mutex::new(None)),
        }
    }

    /// Spawn the sidecar process and start reading its stdout.
    pub async fn spawn(&self, app: &tauri::AppHandle) -> Result<(), String> {
        // Resolve the sidecar entry point.
        let sidecar_path = resolve_sidecar_path(app);

        let mut child = TokioCommand::new("bun")
            .arg("run")
            .arg(&sidecar_path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or("Failed to capture sidecar stdin")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture sidecar stdout")?;

        *self.stdin.lock().await = Some(stdin);
        *self.child.lock().await = Some(child);

        // Background task: read stdout lines and route responses/notifications.
        let pending = self.pending.clone();
        let ready = self.ready.clone();
        let app_handle = app.clone();

        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let msg: Value = match serde_json::from_str(trimmed) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                    // This is a response — route to the pending request.
                    if let Some(sender) = pending.lock().await.remove(&id) {
                        let _ = sender.send(msg);
                    }
                } else if let Some(method) = msg.get("method").and_then(|m| m.as_str()) {
                    // This is a notification — emit as Tauri event.
                    let params = msg.get("params").cloned().unwrap_or(Value::Null);
                    match method {
                        "ready" => {
                            *ready.lock().await = true;
                            let _ = app_handle.emit("sidecar-ready", &params);
                        }
                        "event.log" => {
                            let _ = app_handle.emit("agent-log", &params);
                        }
                        "event.status" => {
                            let _ = app_handle.emit("agent-status", &params);
                        }
                        "event.cost" => {
                            let _ = app_handle.emit("agent-cost", &params);
                        }
                        _ => {}
                    }
                }
            }
        });

        Ok(())
    }

    /// Send a JSON-RPC request to the sidecar and wait for the response.
    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);

        // Write request to sidecar stdin.
        {
            let mut stdin_lock = self.stdin.lock().await;
            match stdin_lock.as_mut() {
                Some(stdin) => {
                    let line = format!("{}\n", request);
                    stdin
                        .write_all(line.as_bytes())
                        .await
                        .map_err(|e| format!("Failed to write to sidecar: {e}"))?;
                    stdin
                        .flush()
                        .await
                        .map_err(|e| format!("Failed to flush sidecar stdin: {e}"))?;
                }
                None => {
                    self.pending.lock().await.remove(&id);
                    return Err("Sidecar not running".into());
                }
            }
        }

        // Wait for response with 30s timeout.
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(response)) => {
                // Check for JSON-RPC error in the response.
                if let Some(error) = response.get("error") {
                    let message = error
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown error");
                    Err(message.to_string())
                } else {
                    Ok(response
                        .get("result")
                        .cloned()
                        .unwrap_or(Value::Null))
                }
            }
            Ok(Err(_)) => Err("Response channel closed".into()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err("Request timed out (30s)".into())
            }
        }
    }
}

/// Resolve the sidecar entry script path.
fn resolve_sidecar_path(app: &tauri::AppHandle) -> String {
    // In development, run the TypeScript source directly with bun.
    // In production, this would be the compiled sidecar binary path.
    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_default();

    let dev_path = resource_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .map(|p| p.join("src-tauri/sidecar/main.ts"))
        .unwrap_or_default();

    if dev_path.exists() {
        return dev_path.to_string_lossy().to_string();
    }

    // Fallback: assume running from the project root.
    "apps/desktop/src-tauri/sidecar/main.ts".to_string()
}
