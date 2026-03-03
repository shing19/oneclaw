#!/usr/bin/env bash

# Test install.sh source selection and failure reporting behavior.
# Exercises logic paths without performing actual remote downloads.
#
# Usage: bash scripts/test-install-script.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/install.sh"
PASS_COUNT=0
FAIL_COUNT=0

pass() {
  printf '  ✓ %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  printf '  ✗ %s\n' "$1" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

assert_output_contains() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if printf '%s' "$actual" | grep -qF "$expected"; then
    pass "$label"
  else
    fail "$label — expected to contain '${expected}', got: ${actual}"
  fi
}

assert_exit_nonzero() {
  local label="$1"
  local rc="$2"
  if [[ "$rc" -ne 0 ]]; then
    pass "$label"
  else
    fail "$label — expected non-zero exit code, got 0"
  fi
}

# Create a temp file with sourced functions (everything except `main "$@"`)
FUNC_FILE="$(mktemp)"
trap 'rm -f "$FUNC_FILE"' EXIT
sed '$d' "$INSTALL_SCRIPT" > "$FUNC_FILE"

# ─── Source Selection Tests ────────────────────────────────────

printf '\n[Source Selection Tests]\n'

# Test: explicit github source
output="$(
  source "$FUNC_FILE"
  ONECLAW_DOWNLOAD_SOURCE="github"
  ONECLAW_DOWNLOAD_URL=""
  resolve_download_source 2>/dev/null
)" || true
assert_output_contains "Explicit source=github selects github" "github" "$output"

# Test: explicit mirror source
output="$(
  source "$FUNC_FILE"
  ONECLAW_DOWNLOAD_SOURCE="mirror"
  ONECLAW_DOWNLOAD_URL=""
  resolve_download_source 2>/dev/null
)" || true
assert_output_contains "Explicit source=mirror selects mirror" "mirror" "$output"

# Test: custom URL overrides source
output="$(
  source "$FUNC_FILE"
  ONECLAW_DOWNLOAD_URL="https://example.com/oneclaw.tar.gz"
  ONECLAW_DOWNLOAD_SOURCE="github"
  resolve_download_source 2>/dev/null
)" || true
assert_output_contains "Custom URL overrides source selection" "custom" "$output"

# Test: invalid source is rejected
output="$(
  source "$FUNC_FILE"
  ONECLAW_DOWNLOAD_URL=""
  ONECLAW_DOWNLOAD_SOURCE="invalid_source"
  resolve_download_source 2>&1
)" || true
assert_output_contains "Invalid source reports error" "Invalid ONECLAW_DOWNLOAD_SOURCE" "$output"

# ─── Connectivity Check Tests ─────────────────────────────────

printf '\n[Connectivity Check Tests]\n'

# Test: can_reach_url returns non-zero for unreachable URL
rc=0
(
  source "$FUNC_FILE"
  can_reach_url "http://192.0.2.1" "1"
) 2>/dev/null || rc=$?
assert_exit_nonzero "can_reach_url returns non-zero for unreachable URL" "$rc"

# ─── URL Construction Tests ───────────────────────────────────

printf '\n[URL Construction Tests]\n'

# Test: GitHub URL for latest
output="$(
  source "$FUNC_FILE"
  ONECLAW_VERSION="latest"
  ONECLAW_REPOSITORY="oneclaw/oneclaw"
  resolve_github_download_url "oneclaw-darwin-arm64.tar.gz"
)"
assert_output_contains "GitHub latest URL format" "releases/latest/download/oneclaw-darwin-arm64.tar.gz" "$output"

# Test: GitHub URL for specific version
output="$(
  source "$FUNC_FILE"
  ONECLAW_VERSION="0.2.0"
  ONECLAW_REPOSITORY="oneclaw/oneclaw"
  resolve_github_download_url "oneclaw-linux-x64.tar.gz"
)"
assert_output_contains "GitHub versioned URL format" "releases/download/v0.2.0/oneclaw-linux-x64.tar.gz" "$output"

# Test: Mirror URL for latest
output="$(
  source "$FUNC_FILE"
  ONECLAW_VERSION="latest"
  ONECLAW_MIRROR_BASE_URL="https://oneclaw.cn/releases"
  resolve_mirror_download_url "oneclaw-darwin-arm64.tar.gz"
)"
assert_output_contains "Mirror latest URL format" "oneclaw.cn/releases/latest/oneclaw-darwin-arm64.tar.gz" "$output"

# Test: Mirror URL for specific version (auto v-prefix)
output="$(
  source "$FUNC_FILE"
  ONECLAW_VERSION="1.0.0"
  ONECLAW_MIRROR_BASE_URL="https://oneclaw.cn/releases"
  resolve_mirror_download_url "oneclaw-linux-x64.tar.gz"
)"
assert_output_contains "Mirror versioned URL with v-prefix" "oneclaw.cn/releases/v1.0.0/oneclaw-linux-x64.tar.gz" "$output"

# Test: Version already has v prefix
output="$(
  source "$FUNC_FILE"
  ONECLAW_VERSION="v2.0.0"
  ONECLAW_REPOSITORY="oneclaw/oneclaw"
  resolve_github_download_url "oneclaw-linux-x64.tar.gz"
)"
assert_output_contains "Version with existing v-prefix not doubled" "releases/download/v2.0.0/" "$output"

# ─── Failure Reporting Tests ──────────────────────────────────

printf '\n[Failure Reporting Tests]\n'

# Test: download_file reports error on failure (use non-routable IP with short timeout)
output="$(
  source "$FUNC_FILE"
  download_file "http://192.0.2.1/nonexistent" "/tmp/oneclaw-test-dl-$$" 2>&1
)" || true
assert_output_contains "Download failure reports URL" "192.0.2.1" "$output"
assert_output_contains "Download failure suggests mirror fallback" "ONECLAW_DOWNLOAD_SOURCE=mirror" "$output"

# Test: unsupported OS is reported
output="$(
  source "$FUNC_FILE"
  uname() { printf 'FreeBSD'; }
  export -f uname
  detect_os 2>&1
)" || true
assert_output_contains "Unsupported OS reports error" "Unsupported operating system" "$output"

# Test: unsupported arch is reported
output="$(
  source "$FUNC_FILE"
  uname() { printf 'riscv64'; }
  export -f uname
  detect_arch 2>&1
)" || true
assert_output_contains "Unsupported arch reports error" "Unsupported architecture" "$output"

# Test: missing required command is reported
output="$(
  source "$FUNC_FILE"
  require_command "nonexistent_command_xyz_123" 2>&1
)" || true
assert_output_contains "Missing command reports name" "nonexistent_command_xyz_123" "$output"

# ─── Summary ──────────────────────────────────────────────────

printf '\n─────────────────────────────────\n'
printf 'Results: %d passed, %d failed\n' "$PASS_COUNT" "$FAIL_COUNT"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
printf 'All install script tests passed.\n'
