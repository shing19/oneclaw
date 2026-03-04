#!/usr/bin/env bash
# Build the OneClaw sidecar binary for a specific platform.
#
# Usage:
#   ./scripts/build-sidecar.sh                    # auto-detect current platform
#   ./scripts/build-sidecar.sh aarch64-apple-darwin  # explicit Rust target triple
#
# The compiled binary is placed at:
#   src-tauri/binaries/oneclaw-sidecar-{target_triple}
#
# This naming convention matches Tauri 2's externalBin resolution.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SIDECAR_ENTRY="$DESKTOP_DIR/src-tauri/sidecar/main.ts"
OUT_DIR="$DESKTOP_DIR/src-tauri/binaries"

# Resolve target triple: argument or auto-detect from rustc.
if [[ $# -ge 1 ]]; then
  TARGET_TRIPLE="$1"
else
  TARGET_TRIPLE="$(rustc -vV | grep 'host:' | cut -d' ' -f2)"
fi

# Map Rust target triple to Bun compile target.
case "$TARGET_TRIPLE" in
  aarch64-apple-darwin)   BUN_TARGET="bun-darwin-arm64" ;;
  x86_64-apple-darwin)    BUN_TARGET="bun-darwin-x64" ;;
  x86_64-pc-windows-msvc) BUN_TARGET="bun-windows-x64" ;;
  x86_64-unknown-linux-gnu)  BUN_TARGET="bun-linux-x64" ;;
  aarch64-unknown-linux-gnu) BUN_TARGET="bun-linux-arm64" ;;
  *)
    echo "Error: unsupported target triple: $TARGET_TRIPLE" >&2
    echo "Supported: aarch64-apple-darwin, x86_64-apple-darwin, x86_64-pc-windows-msvc, x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu" >&2
    exit 1
    ;;
esac

OUT_FILE="$OUT_DIR/oneclaw-sidecar-$TARGET_TRIPLE"

echo "Building sidecar for $TARGET_TRIPLE (bun target: $BUN_TARGET)"
echo "  Entry: $SIDECAR_ENTRY"
echo "  Output: $OUT_FILE"

mkdir -p "$OUT_DIR"

bun build "$SIDECAR_ENTRY" \
  --compile \
  --target="$BUN_TARGET" \
  --outfile "$OUT_FILE"

echo "Sidecar built successfully: $OUT_FILE"
ls -lh "$OUT_FILE"
