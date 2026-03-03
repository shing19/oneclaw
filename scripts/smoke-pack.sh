#!/usr/bin/env bash

# Local reproducible smoke test: build -> pack -> isolated install -> oneclaw --version
# Usage: bash scripts/smoke-pack.sh
#
# This script verifies that the npm tarball produced by `pnpm pack` can be
# installed globally in an isolated prefix and that the installed binary works.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log_step() {
  printf '\n==> %s\n' "$1"
}

log_ok() {
  printf '  OK: %s\n' "$1"
}

log_fail() {
  printf '  FAIL: %s\n' "$1" >&2
}

cleanup() {
  if [[ -n "${SMOKE_DIR:-}" && -d "${SMOKE_DIR}" ]]; then
    rm -rf "${SMOKE_DIR}"
  fi
}
trap cleanup EXIT

cd "${PROJECT_ROOT}"

# --- Step 1: Build ---
log_step "Building project"
pnpm build
log_ok "pnpm build succeeded"

# --- Step 2: Pack ---
log_step "Packing npm tarball"
SMOKE_DIR="$(mktemp -d)"
pnpm pack --pack-destination "${SMOKE_DIR}"

tarball="$(ls "${SMOKE_DIR}"/*.tgz | head -1)"
if [[ -z "${tarball}" ]]; then
  log_fail "No tarball produced by pnpm pack"
  exit 1
fi
log_ok "Tarball created: $(basename "${tarball}")"

# --- Step 3: Validate tarball contents ---
log_step "Validating tarball contents"
contents="$(tar -tzf "${tarball}")"

required_files=(
  "package/package.json"
  "package/dist/index.js"
  "package/dist/schema.json"
)

missing=0
for f in "${required_files[@]}"; do
  if echo "${contents}" | grep -qx "${f}"; then
    log_ok "${f}"
  else
    log_fail "${f} missing from tarball"
    missing=1
  fi
done

if [[ "${missing}" -ne 0 ]]; then
  printf '\nFull tarball contents:\n'
  echo "${contents}"
  exit 1
fi

# --- Step 4: Isolated npm install ---
log_step "Installing tarball in isolated prefix"
NPM_PREFIX="${SMOKE_DIR}/install"
mkdir -p "${NPM_PREFIX}"
npm install --global --prefix "${NPM_PREFIX}" "${tarball}"
log_ok "npm install --global succeeded"

# --- Step 5: Verify binary exists ---
log_step "Verifying installed binary"
BIN_PATH="${NPM_PREFIX}/bin/oneclaw"
if [[ ! -f "${BIN_PATH}" ]]; then
  # On some npm versions the bin may be a symlink; check lib as fallback
  BIN_PATH="$(find "${NPM_PREFIX}" -name oneclaw -type f -o -name oneclaw -type l 2>/dev/null | head -1)"
fi

if [[ -z "${BIN_PATH}" || ! -e "${BIN_PATH}" ]]; then
  log_fail "oneclaw binary not found in ${NPM_PREFIX}"
  ls -laR "${NPM_PREFIX}" 2>/dev/null || true
  exit 1
fi
log_ok "Binary found at ${BIN_PATH}"

# --- Step 6: Run smoke checks ---
log_step "Running smoke checks"

version_output="$("${BIN_PATH}" --version 2>&1)"
if [[ -z "${version_output}" ]]; then
  log_fail "oneclaw --version produced no output"
  exit 1
fi
log_ok "oneclaw --version -> ${version_output}"

"${BIN_PATH}" --help >/dev/null 2>&1
log_ok "oneclaw --help exited successfully"

printf '\n✅ Smoke test passed: pack -> install -> run all succeeded.\n'
