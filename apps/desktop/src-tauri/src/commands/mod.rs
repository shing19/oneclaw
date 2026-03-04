/// Tauri command handlers.
/// Each submodule groups related commands (status, config, agent, cost, etc.).

/// Greeting command — demo/smoke-test, will be replaced by real IPC in P2-B.
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("欢迎使用 {}！桌面应用已就绪。", name)
}
