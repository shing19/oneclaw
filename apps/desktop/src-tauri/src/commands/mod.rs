/// Tauri command handlers.
/// Each submodule groups related commands (status, config, agent, cost, etc.).

pub mod ipc;
pub mod sidecar;

/// Greeting command — demo/smoke-test.
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("欢迎使用 {}！桌面应用已就绪。", name)
}
