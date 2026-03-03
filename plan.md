# OneClaw Phase 1 — Ralph Loop Execution Plan

> Single source of truth for agent-driven development.
> Any agent (Codex / Claude / Gemini) receiving this file MUST follow the Ralph Loop rules.

---

## Ralph Loop Rules (MANDATORY)

### Rule 1: One Thing Per Loop
Implement **ONE task** per iteration. Smaller = higher quality.

### Rule 2: Search Before You Build
**NEVER assume something doesn't exist.** Search the codebase before implementing.

### Rule 3: Feedback Loops Are Non-Negotiable
Before committing, ALL checks MUST pass:
```bash
pnpm typecheck && pnpm test && pnpm lint
```
**DO NOT commit if any check fails.** Fix first, then commit.

### Rule 4: Track Your Progress
After completing each task, append to `progress.md`:
- Task ID and description
- Key decisions made
- Files changed
- Blockers or notes for next iteration

### Rule 5: Prioritize by Task ID
Work on tasks **in order** (lowest ID first). Do NOT skip ahead.

### Rule 6: Follow Contracts
Read `docs/contracts/` before implementing. Interfaces are the source of truth.
Read `docs/modules/` for file structure and test strategy.
Read `docs/harness.md` for engineering standards.

### Rule 7: Commit with Descriptive Messages
```bash
git add <specific files>
git commit -m "feat/fix/refactor: <description>"
git push
```

### Rule 8: Stop Condition
If ALL tasks are marked `[x]`, output `<COMPLETE>` and stop.
If blocked, document in `progress.md` and move to the next task.

---

## M1.0 — 项目脚手架

- [x] Initialize pnpm monorepo workspace (`pnpm-workspace.yaml`, root `package.json`)
- [x] Create `packages/core/` package with `tsconfig.json` (strict mode, no `any`)
- [x] Create `packages/cli/` package with Commander.js entry point
- [x] Configure ESLint + Prettier (flat config, strict rules)
- [x] Configure Vitest (root config + per-package configs)
- [x] Add `pnpm typecheck`, `pnpm test`, `pnpm lint` scripts to root
- [x] Copy contract TypeScript interfaces from `docs/contracts/` into `packages/core/src/types/`
- [x] Verify: `pnpm typecheck && pnpm test && pnpm lint` all pass

## M1.1 — 配置系统 + 密钥存储

> Contract: `docs/contracts/secret-storage.md`
> Module: `docs/modules/config-system.md`

- [x] Implement `packages/core/src/config/paths.ts` — platform-aware config paths (macOS/Linux/Windows)
- [x] Create `packages/core/src/config/schema.json` — JSON Schema for OneclawConfig
- [x] Implement `packages/core/src/config/validator.ts` — Zod schema + JSON Schema validation
- [x] Implement `packages/core/src/config/config-manager.ts` — load/save/watch with fs.watch debounce
- [x] Implement `packages/core/src/config/backup-manager.ts` — auto-backup before save, keep last 20
- [x] Implement `packages/core/src/config/migrator.ts` — version-based schema migration
- [x] Implement `packages/core/src/secrets/secret-store.ts` — SecretStore interface + platform backends
- [x] macOS backend: Keychain via `security` CLI wrapper
- [x] Linux backend: Secret Service D-Bus via `secret-tool` CLI wrapper
- [x] Fallback backend: AES-256-GCM encrypted file
- [x] Write unit tests for validator, config-manager, backup-manager, migrator
- [x] Write integration tests for secret-store (platform detection + round-trip)

## M1.2 — 模型管理

> Contract: `docs/contracts/model-config.md`
> Module: `docs/modules/model-management.md`

- [x] Implement `packages/core/src/models/provider-registry.ts` — ProviderRegistry with 3 preset providers (DeepSeek, 百炼, 智谱)
- [x] Implement `packages/core/src/models/model-config.ts` — ModelConfig + ModelSettings types with Zod validation
- [x] Implement `packages/core/src/models/key-rotator.ts` — API key rotation on 429, round-robin across keys
- [x] Implement `packages/core/src/models/fallback-orchestrator.ts` — FallbackOrchestrator with error-type-specific behavior
- [x] Implement `packages/core/src/models/quota-tracker.ts` — QuotaTracker for token-based and request-based billing
- [x] Implement `packages/core/src/models/provider-health.ts` — health check + probe recovery (30s interval)
- [x] Write unit tests for provider-registry, key-rotator, fallback-orchestrator, quota-tracker
- [x] Write integration test: 429 triggers key rotation → fallback → probe recovery

## M1.3 — Agent 适配层

> Contract: `docs/contracts/agent-adapter.md`
> Module: `docs/modules/agent-adapter.md`

- [x] Implement `packages/core/src/adapter/agent-kernel.ts` — AgentKernel interface (start/stop/restart/status/health)
- [x] Implement `packages/core/src/adapter/openclaw-adapter.ts` — OpenClaw process management (spawn/kill/restart)
- [x] Implement `packages/core/src/adapter/config-translator.ts` — OneClaw config → openclaw.json translation
- [x] Implement `packages/core/src/adapter/log-parser.ts` — OpenClaw stdout/stderr → structured LogEntry stream
- [x] Implement `packages/core/src/adapter/event-stream.ts` — EventEmitter for cost/status/error events
- [x] Write unit tests for config-translator, log-parser
- [x] Write integration test: adapter start → status check → stop lifecycle

## M1.4 — CLI

> Module: `docs/modules/cli.md`

- [x] Implement `packages/cli/src/index.ts` — Commander.js program with global options (`--json`, `--quiet`)
- [x] Implement `packages/cli/src/commands/init.ts` — interactive init wizard (model provider + API key + test connection)
- [x] Implement `packages/cli/src/commands/start.ts` — start Agent (foreground or daemon mode)
- [x] Implement `packages/cli/src/commands/stop.ts` — stop running Agent
- [x] Implement `packages/cli/src/commands/status.ts` — display Agent status, health, current model
- [x] Implement `packages/cli/src/commands/config.ts` — show/set/validate/backup/rollback subcommands
- [x] Implement `packages/cli/src/commands/model.ts` — list/test/priority subcommands
- [x] Implement `packages/cli/src/commands/cost.ts` — today's summary, history, export
- [x] Implement `packages/cli/src/commands/doctor.ts` — comprehensive health check + fix suggestions
- [x] Implement `packages/cli/src/formatters/` — table, JSON, status formatters
- [x] Write unit tests for command parsing and formatters
- [x] Write integration test: `oneclaw init` → `oneclaw start` → `oneclaw status` → `oneclaw stop`

## M1.5 — 飞书通信渠道

> Module: `docs/modules/communication.md`

- [x] Implement `packages/core/src/channels/channel-interface.ts` — ChannelAdapter interface
- [x] Implement `packages/core/src/channels/feishu/feishu-adapter.ts` — Feishu bot (send/receive messages via webhook + event subscription)
- [x] Implement `packages/core/src/channels/feishu/feishu-auth.ts` — app_id/app_secret token management
- [x] Implement `packages/cli/src/commands/channel.ts` — setup wizard + test message
- [x] Write unit tests for feishu-adapter (mock HTTP)
- [x] Write integration test: send test message → receive confirmation

## M1.6 — 分发

> Module: `docs/modules/distribution.md`

- [x] Create `scripts/install.sh` — one-click install script (detect OS/arch, download binary, install to PATH)
- [x] Add China mirror auto-detection in install script (test connectivity, fallback to mirror)
- [x] Configure npm package (`package.json` bin field, `prepublishOnly` build)
- [x] Create `.github/workflows/ci.yml` — PR checks (lint + typecheck + test)
- [x] Create `.github/workflows/release.yml` — tag-triggered release (build + npm publish + GitHub Release)
- [x] Create `Dockerfile` for server deployment scenario
- [x] Write smoke test: clean install from npm on macOS and Ubuntu

---

## Notes for Agent

- **Contract files are the source of truth** for all TypeScript interfaces
- **Module plan files** specify the exact file structure to create
- **No `any` type** — use `unknown` + type guards instead
- **Zod for runtime validation** at all boundaries (config load, API response, user input)
- **All user strings** must support `zh-CN` and `en` (use i18n helper from day 1)
- **Test coverage**: every module must have unit tests before moving to next module
