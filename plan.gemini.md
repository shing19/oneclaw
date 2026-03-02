# OneClaw — Gemini Agent Plan (Parallel Mode)

> Scope: M1.5 飞书通信渠道 + M1.6 分发
> These modules are the outward-facing layer. M1.5 depends on M1.3 (adapter). M1.6 is independent.

---

## Prerequisites

Before starting M1.5, ensure dependencies are available:
- [ ] Verify M1.0 scaffold complete (`pnpm typecheck` passes)
- [ ] Verify M1.3 adapter is implemented (needed by channel → agent communication)

M1.6 has no code dependencies — can start immediately.

---

## M1.6 — 分发（可立即开始）

> Module: `docs/modules/distribution.md`

### Install Script

- [ ] Create `scripts/install.sh` — one-click install:
  - Detect OS (macOS/Linux) and architecture (x64/arm64)
  - Download correct binary from GitHub Releases
  - Install to `~/.local/bin/` (or `/usr/local/bin/` with sudo)
  - Add to PATH if not already present
  - Print success message with `oneclaw --version`
- [ ] Add China mirror auto-detection in `scripts/install.sh`:
  - Test GitHub connectivity (curl timeout 5s)
  - If unreachable, switch to mirror URL (Alibaba Cloud OSS)
  - Print which source is being used

### npm Package

- [ ] Configure root `package.json` for npm publish:
  - `bin` field pointing to CLI entry
  - `files` field for published files only
  - `prepublishOnly` script: `pnpm build`
  - `engines` field: node >=18
- [ ] Verify `npm pack --dry-run` includes correct files

### CI/CD

- [ ] Create `.github/workflows/ci.yml`:
  - Trigger: push to main, pull requests
  - Matrix: Node 18, 20, 22
  - Steps: checkout → setup pnpm → install → lint → typecheck → test
- [ ] Create `.github/workflows/release.yml`:
  - Trigger: push tag `v*`
  - Steps: checkout → setup pnpm → install → build → npm publish → create GitHub Release → upload artifacts
  - Secrets needed: `NPM_TOKEN`, `GITHUB_TOKEN`

### Docker

- [ ] Create `Dockerfile`:
  - Base: `node:20-slim`
  - Install pnpm, copy source, build
  - Volume mount: `/config` → config directory
  - Entrypoint: `oneclaw start`
- [ ] Create `docker-compose.yml` for easy local usage
- [ ] Create `.dockerignore` (exclude node_modules, .git, docs)

### Tests — M1.6

- [ ] Smoke test: `scripts/install.sh` runs without error in dry-run mode (add `--dry-run` flag)
- [ ] Smoke test: `npm pack` produces valid tarball with correct files
- [ ] CI workflow: validate YAML syntax (actionlint or manual review)

---

## M1.5 — 飞书通信渠道

> Module: `docs/modules/communication.md`
> Depends on: M1.3 adapter (to route messages to/from Agent)

### Channel Interface

- [ ] Implement `packages/core/src/channels/types.ts` — ChannelAdapter interface: `connect()`, `disconnect()`, `sendMessage(target, content)`, `onMessage(handler)`, `status()` with Zod schemas
- [ ] Implement `packages/core/src/channels/channel-registry.ts` — ChannelRegistry: register/get/list channels, channel lifecycle management

### Feishu Implementation

- [ ] Implement `packages/core/src/channels/feishu/feishu-types.ts` — Feishu API types (app_id, app_secret, webhook URL, message card format)
- [ ] Implement `packages/core/src/channels/feishu/feishu-auth.ts` — token management:
  - Get tenant_access_token via app_id + app_secret
  - Auto-refresh before expiry (token valid ~2 hours)
  - Store tokens in memory (not in SecretStore — they're ephemeral)
- [ ] Implement `packages/core/src/channels/feishu/feishu-adapter.ts` — FeishuAdapter class:
  - `connect()`: validate credentials, get initial token
  - `sendMessage()`: POST to Feishu API (text + interactive card formats)
  - `onMessage()`: HTTP webhook endpoint for receiving messages from Feishu
  - `disconnect()`: cleanup webhook listener
  - `status()`: return connection state + last message timestamp
- [ ] Implement `packages/core/src/channels/feishu/feishu-message-builder.ts` — build Feishu interactive card messages (status reports, cost alerts, error notifications)

### CLI Integration

- [ ] Implement `packages/cli/src/commands/channel.ts` — subcommands:
  - `channel setup feishu` — interactive wizard:
    1. Enter app_id and app_secret (interactive, no echo)
    2. Store in SecretStore
    3. Test token acquisition
    4. Print webhook URL for Feishu event subscription
    5. Send test message
  - `channel test [feishu]` — send a test message to configured channel
  - `channel status` — show all channel connection states
- [ ] Add permission list one-click copy to Feishu setup wizard (required Feishu bot permissions)

### Tests — M1.5

- [ ] Unit tests: `feishu-auth.test.ts` — token acquisition, refresh, expiry handling (mock HTTP)
- [ ] Unit tests: `feishu-adapter.test.ts` — sendMessage format, onMessage webhook parsing (mock HTTP)
- [ ] Unit tests: `feishu-message-builder.test.ts` — card message structure validation
- [ ] Unit tests: `channel-registry.test.ts` — register/get/list lifecycle
- [ ] Integration test: `channel setup` → authenticate → send test message → receive confirmation (mock Feishu API)

---

## Notes

- Read `docs/modules/communication.md` for the full channel architecture
- Feishu API docs: https://open.feishu.cn/document/server-docs/im-v1/message/create
- The channel interface is designed for future expansion (钉钉, 企业微信 in Phase 3)
- Install script must work on fresh macOS and Ubuntu — no assumptions about pre-installed tools beyond curl and bash
- CI matrix tests all supported Node.js versions
- Docker image should be minimal (no dev dependencies)
