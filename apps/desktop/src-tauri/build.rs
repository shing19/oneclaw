use std::path::Path;

fn main() {
    // Ensure a sidecar binary placeholder exists for the current target triple.
    // Tauri's build step validates that externalBin resources exist at compile time.
    // In dev mode the real sidecar runs via `bun run` on TypeScript source, so this
    // placeholder is never actually executed — it just satisfies the build check.
    //
    // Use cargo's TARGET env var (always set during build scripts) rather than
    // TAURI_ENV_TARGET_TRIPLE which is only set by tauri_build::build().
    let target_triple = std::env::var("TARGET").unwrap_or_else(|_| {
        // Fallback: try TAURI_ENV_TARGET_TRIPLE (set later by tauri, but try anyway)
        std::env::var("TAURI_ENV_TARGET_TRIPLE").unwrap_or_else(|_| "unknown".to_string())
    });
    let binary_name = format!("binaries/oneclaw-sidecar-{target_triple}");
    let binary_path = Path::new(&binary_name);

    if !binary_path.exists() {
        if let Some(parent) = binary_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        // Create a small placeholder script so the path check passes.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::write(binary_path, "#!/bin/sh\necho placeholder\n").ok();
            std::fs::set_permissions(binary_path, std::fs::Permissions::from_mode(0o755)).ok();
        }
        #[cfg(not(unix))]
        {
            std::fs::write(binary_path, "placeholder").ok();
        }
    }

    tauri_build::build()
}
