mod commands;

use commands::sidecar::SidecarState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState::new())
        .setup(|app| {
            // Spawn the sidecar process during app setup.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<SidecarState>();
                if let Err(e) = state.spawn(&handle).await {
                    eprintln!("Failed to spawn sidecar: {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::ipc::ipc_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
