# 模块计划：分发与安装

> 覆盖 Phase 1（npm + 安装脚本）到 Phase 3（自动更新）。

---

## 范围

- 跨平台构建（macOS / Windows / Linux）
- 国内可达的下载渠道
- 包管理器支持
- 自动更新（Phase 3）

---

## 安装方式

### 1. GUI 安装包（Tauri bundler，Phase 2）

| 平台 | 格式 |
|------|------|
| macOS | `.dmg`（Universal Binary: Intel + Apple Silicon） |
| Windows | `.exe`（NSIS 安装器） |
| Linux | `.AppImage` / `.deb` / `.rpm` |

### 2. 包管理器（Phase 1）

| 方式 | 命令 |
|------|------|
| npm | `npm install -g oneclaw` |
| bun | `bun install -g oneclaw` |
| Homebrew | `brew install oneclaw`（tap 仓库） |

### 3. Docker（Phase 1，服务器场景）

```bash
docker run -v ~/.config/oneclaw:/config oneclaw/oneclaw
```

### 4. 一键安装脚本（Phase 1）

```bash
# 国际
curl -fsSL https://install.oneclaw.dev | bash

# 国内
curl -fsSL https://install.oneclaw.cn | bash
```

- 自动检测 OS/架构
- 下载正确版本的二进制
- 安装到 PATH
- 国内脚本自动使用镜像源

---

## 国内镜像策略

| 资源 | 国内方案 |
|------|---------|
| GitHub Releases | 阿里云 OSS + CDN |
| npm 包 | npmmirror (`registry.npmmirror.com`) |
| Homebrew | tap 仓库 + 国内 bottle 镜像 |
| Docker 镜像 | 阿里云 ACR |
| 安装脚本 | oneclaw.cn 域名 |

- 每次 Release 自动同步到 OSS
- 安装脚本检测网络环境，自动选择最快源

---

## 构建流水线（GitHub Actions）

### CI（每个 PR）

```yaml
jobs:
  lint:     # ESLint
  typecheck: # tsc --noEmit
  test:     # vitest
  build:    # dry-run 构建
```

### Release（git tag v*）

```yaml
jobs:
  build:
    matrix:
      - os: macos-latest   # Intel + ARM universal
      - os: ubuntu-latest  # x64
      - os: windows-latest # x64
    steps:
      - Tauri build (Phase 2+)
      - npm publish
      - 上传 GitHub Releases
      - 同步到阿里云 OSS
      - 更新 Homebrew formula
```

---

## 代码签名

| 平台 | 方案 |
|------|------|
| macOS | Apple Developer 证书 + 公证（notarization） |
| Windows | 代码签名证书 |
| Linux | GPG 签名包 |

---

## 自动更新（Phase 3）

- Tauri updater 插件（内置能力）
- 更新服务器：阿里云 OSS 静态 JSON manifest
- 断点续传（国内网络不稳定）
- 签名校验后应用
- 更新失败保留当前版本，可回滚

---

## 依赖

- 所有模块必须可构建
- CI/CD 基础设施（GitHub Actions）
- 云账号（阿里云 OSS、Apple Developer 等）

## 文件清单

```
.github/workflows/
  ci.yml                           — PR 检查
  release.yml                      — 发布流水线
scripts/
  install.sh                       — 一键安装脚本
  mirror-release.sh                — OSS 同步脚本
Dockerfile
docker-compose.yml
```

## 工作量估算

- CI 流水线：1 周
- Release 流水线 + 签名：1 周
- 国内镜像配置：3 天
- Docker：2 天
- 自动更新（Phase 3）：1 周

## 待定问题

- 域名方案：oneclaw.dev + oneclaw.cn？
- Apple Developer 账号：个人 vs 组织？
- Windows 签名：购买 EV 证书 or Azure Trusted Signing？
