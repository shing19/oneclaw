#!/usr/bin/env bash

set -euo pipefail

ONECLAW_BINARY_NAME="${ONECLAW_BINARY_NAME:-oneclaw}"
ONECLAW_REPOSITORY="${ONECLAW_REPOSITORY:-oneclaw/oneclaw}"
ONECLAW_VERSION="${ONECLAW_VERSION:-latest}"
ONECLAW_DOWNLOAD_URL="${ONECLAW_DOWNLOAD_URL:-}"
ONECLAW_ASSET_NAME="${ONECLAW_ASSET_NAME:-}"
ONECLAW_INSTALL_DIR="${ONECLAW_INSTALL_DIR:-}"

log_info() {
  printf '[INFO] %s\n' "$1"
}

log_error() {
  printf '[ERROR] %s\n' "$1" >&2
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    log_error "Missing required command: ${command_name}"
    exit 1
  fi
}

detect_os() {
  local os_name
  os_name="$(uname -s)"
  case "$os_name" in
    Darwin)
      printf 'darwin'
      ;;
    Linux)
      printf 'linux'
      ;;
    *)
      log_error "Unsupported operating system: ${os_name}"
      exit 1
      ;;
  esac
}

detect_arch() {
  local arch_name
  arch_name="$(uname -m)"
  case "$arch_name" in
    x86_64 | amd64)
      printf 'x64'
      ;;
    arm64 | aarch64)
      printf 'arm64'
      ;;
    *)
      log_error "Unsupported architecture: ${arch_name}"
      exit 1
      ;;
  esac
}

resolve_asset_name() {
  local os="$1"
  local arch="$2"

  if [[ -n "$ONECLAW_ASSET_NAME" ]]; then
    printf '%s' "$ONECLAW_ASSET_NAME"
    return 0
  fi

  printf 'oneclaw-%s-%s.tar.gz' "$os" "$arch"
}

resolve_download_url() {
  local asset_name="$1"

  if [[ -n "$ONECLAW_DOWNLOAD_URL" ]]; then
    printf '%s' "$ONECLAW_DOWNLOAD_URL"
    return 0
  fi

  if [[ "$ONECLAW_VERSION" == "latest" ]]; then
    printf 'https://github.com/%s/releases/latest/download/%s' "$ONECLAW_REPOSITORY" "$asset_name"
    return 0
  fi

  local normalized_version="$ONECLAW_VERSION"
  if [[ "$normalized_version" != v* ]]; then
    normalized_version="v${normalized_version}"
  fi
  printf 'https://github.com/%s/releases/download/%s/%s' "$ONECLAW_REPOSITORY" "$normalized_version" "$asset_name"
}

resolve_install_dir() {
  if [[ -n "$ONECLAW_INSTALL_DIR" ]]; then
    printf '%s' "$ONECLAW_INSTALL_DIR"
    return 0
  fi

  if [[ -w "/usr/local/bin" ]]; then
    printf '/usr/local/bin'
    return 0
  fi

  printf '%s/.local/bin' "$HOME"
}

download_file() {
  local url="$1"
  local output_path="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output_path"
    return 0
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output_path" "$url"
    return 0
  fi

  log_error "curl or wget is required to download files"
  exit 1
}

main() {
  require_command uname
  require_command tar
  require_command mktemp

  local os
  local arch
  local asset_name
  local download_url
  local install_dir

  os="$(detect_os)"
  arch="$(detect_arch)"
  asset_name="$(resolve_asset_name "$os" "$arch")"
  download_url="$(resolve_download_url "$asset_name")"
  install_dir="$(resolve_install_dir)"

  log_info "Detected platform: ${os}/${arch}"
  log_info "Download URL: ${download_url}"
  log_info "Install directory: ${install_dir}"

  mkdir -p "$install_dir"

  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT

  local archive_path="${temp_dir}/${asset_name}"
  local extract_dir="${temp_dir}/extract"
  mkdir -p "$extract_dir"

  log_info "Downloading ${asset_name}..."
  download_file "$download_url" "$archive_path"

  log_info "Extracting package..."
  tar -xzf "$archive_path" -C "$extract_dir"

  local binary_source_path
  binary_source_path="$(
    find "$extract_dir" -type f -name "$ONECLAW_BINARY_NAME" -perm -u+x 2>/dev/null | head -n 1
  )"

  if [[ -z "$binary_source_path" ]]; then
    binary_source_path="$(
      find "$extract_dir" -type f -name "$ONECLAW_BINARY_NAME" 2>/dev/null | head -n 1
    )"
  fi

  if [[ -z "$binary_source_path" ]]; then
    log_error "Could not find binary '${ONECLAW_BINARY_NAME}' in downloaded archive"
    exit 1
  fi

  install -m 0755 "$binary_source_path" "${install_dir}/${ONECLAW_BINARY_NAME}"

  log_info "Installed to ${install_dir}/${ONECLAW_BINARY_NAME}"
  if [[ ":$PATH:" != *":${install_dir}:"* ]]; then
    log_info "Add this directory to PATH:"
    printf '  export PATH="%s:$PATH"\n' "$install_dir"
  fi

  log_info "Installation complete."
}

main "$@"
