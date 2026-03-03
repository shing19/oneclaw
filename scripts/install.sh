#!/usr/bin/env bash

set -euo pipefail

ONECLAW_BINARY_NAME="${ONECLAW_BINARY_NAME:-oneclaw}"
ONECLAW_REPOSITORY="${ONECLAW_REPOSITORY:-oneclaw/oneclaw}"
ONECLAW_VERSION="${ONECLAW_VERSION:-latest}"
ONECLAW_DOWNLOAD_URL="${ONECLAW_DOWNLOAD_URL:-}"
ONECLAW_DOWNLOAD_SOURCE="${ONECLAW_DOWNLOAD_SOURCE:-auto}"
ONECLAW_MIRROR_BASE_URL="${ONECLAW_MIRROR_BASE_URL:-https://oneclaw.cn/releases}"
ONECLAW_CONNECT_TIMEOUT_SECONDS="${ONECLAW_CONNECT_TIMEOUT_SECONDS:-5}"
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

normalize_version_tag() {
  local version="$1"
  if [[ "$version" != v* ]]; then
    printf 'v%s' "$version"
    return 0
  fi
  printf '%s' "$version"
}

resolve_github_download_url() {
  local asset_name="$1"

  if [[ "$ONECLAW_VERSION" == "latest" ]]; then
    printf 'https://github.com/%s/releases/latest/download/%s' "$ONECLAW_REPOSITORY" "$asset_name"
    return 0
  fi

  local normalized_version
  normalized_version="$(normalize_version_tag "$ONECLAW_VERSION")"
  printf 'https://github.com/%s/releases/download/%s/%s' "$ONECLAW_REPOSITORY" "$normalized_version" "$asset_name"
}

resolve_mirror_download_url() {
  local asset_name="$1"
  local mirror_base_url="${ONECLAW_MIRROR_BASE_URL%/}"

  if [[ "$ONECLAW_VERSION" == "latest" ]]; then
    printf '%s/latest/%s' "$mirror_base_url" "$asset_name"
    return 0
  fi

  local normalized_version
  normalized_version="$(normalize_version_tag "$ONECLAW_VERSION")"
  printf '%s/%s/%s' "$mirror_base_url" "$normalized_version" "$asset_name"
}

can_reach_url() {
  local target_url="$1"
  local timeout_seconds="$2"
  local max_time_seconds
  max_time_seconds=$((timeout_seconds + 2))

  if command -v curl >/dev/null 2>&1; then
    curl \
      --head \
      --silent \
      --show-error \
      --location \
      --connect-timeout "$timeout_seconds" \
      --max-time "$max_time_seconds" \
      --output /dev/null \
      "$target_url" >/dev/null 2>&1
    return $?
  fi

  if command -v wget >/dev/null 2>&1; then
    wget \
      --spider \
      --quiet \
      --timeout="$timeout_seconds" \
      "$target_url" >/dev/null 2>&1
    return $?
  fi

  return 1
}

resolve_download_source() {
  if [[ -n "$ONECLAW_DOWNLOAD_URL" ]]; then
    printf 'custom'
    return 0
  fi

  case "$ONECLAW_DOWNLOAD_SOURCE" in
    auto | AUTO | Auto | "")
      if can_reach_url "https://github.com" "$ONECLAW_CONNECT_TIMEOUT_SECONDS"; then
        log_info "GitHub connectivity check passed (${ONECLAW_CONNECT_TIMEOUT_SECONDS}s timeout)."
        printf 'github'
      else
        log_info "GitHub connectivity check failed (${ONECLAW_CONNECT_TIMEOUT_SECONDS}s timeout); falling back to China mirror."
        printf 'mirror'
      fi
      return 0
      ;;
    github | mirror)
      printf '%s' "$ONECLAW_DOWNLOAD_SOURCE"
      return 0
      ;;
    *)
      log_error "Invalid ONECLAW_DOWNLOAD_SOURCE: ${ONECLAW_DOWNLOAD_SOURCE}. Use: auto, github, mirror."
      exit 1
      ;;
  esac
}

resolve_download_url() {
  local asset_name="$1"
  local download_source="$2"

  case "$download_source" in
    custom)
      printf '%s' "$ONECLAW_DOWNLOAD_URL"
      ;;
    github)
      resolve_github_download_url "$asset_name"
      ;;
    mirror)
      resolve_mirror_download_url "$asset_name"
      ;;
    *)
      log_error "Unsupported download source: ${download_source}"
      exit 1
      ;;
  esac
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
  local rc=0

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output_path" || rc=$?
    if [[ "$rc" -ne 0 ]]; then
      log_error "Download failed (curl exit code ${rc}): ${url}"
      log_error "Check the URL, your network connection, or try ONECLAW_DOWNLOAD_SOURCE=mirror"
      return "$rc"
    fi
    return 0
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output_path" "$url" || rc=$?
    if [[ "$rc" -ne 0 ]]; then
      log_error "Download failed (wget exit code ${rc}): ${url}"
      log_error "Check the URL, your network connection, or try ONECLAW_DOWNLOAD_SOURCE=mirror"
      return "$rc"
    fi
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
  local download_source
  local download_url
  local install_dir

  os="$(detect_os)"
  arch="$(detect_arch)"
  asset_name="$(resolve_asset_name "$os" "$arch")"
  download_source="$(resolve_download_source)"
  download_url="$(resolve_download_url "$asset_name" "$download_source")"
  install_dir="$(resolve_install_dir)"

  log_info "Detected platform: ${os}/${arch}"
  case "$download_source" in
    custom)
      log_info "Download source: custom URL"
      ;;
    github)
      log_info "Download source: GitHub Releases"
      ;;
    mirror)
      log_info "Download source: China mirror (${ONECLAW_MIRROR_BASE_URL%/})"
      ;;
  esac
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
    log_error "Archive contents:"
    find "$extract_dir" -type f 2>/dev/null | sed "s|${extract_dir}/|  |" >&2
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
