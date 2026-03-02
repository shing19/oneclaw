# OneClaw — Claude Agent Plan (Parallel Mode)

> Scope: M1.1 配置系统 + 密钥存储 → M1.2 模型管理
> These modules form the data foundation. M1.2 depends on M1.1.

---

## Prerequisites

Before starting, ensure M1.0 scaffold is complete:
- [ ] Verify `pnpm typecheck && pnpm test && pnpm lint` passes
- [ ] Verify `packages/core/src/types/` has contract interfaces

---

## M1.1 — 配置系统 + 密钥存储

> Contract: `docs/contracts/secret-storage.md`
> Module: `docs/modules/config-system.md`

### Config Core

- [ ] Implement `packages/core/src/config/paths.ts` — platform config paths (macOS: `~/Library/Application Support/oneclaw/`, Linux: `~/.config/oneclaw/`, Windows: `%APPDATA%/oneclaw/`, env override: `ONECLAW_CONFIG_PATH`)
- [ ] Create `packages/core/src/config/schema.json` — JSON Schema matching OneclawConfig interface from contract
- [ ] Implement `packages/core/src/config/types.ts` — Zod schemas mirroring JSON Schema (single source generates both)
- [ ] Implement `packages/core/src/config/validator.ts` — validate config against Zod schema, return field-level error messages in Chinese
- [ ] Implement `packages/core/src/config/config-manager.ts` — ConfigManager class: `load()`, `save()`, `get(key)`, `set(key, value)`, `watch()` with fs.watch + 500ms debounce
- [ ] Implement `packages/core/src/config/backup-manager.ts` — auto-backup before each save to `backups/config-{timestamp}.json`, keep last 20, list/restore API
- [ ] Implement `packages/core/src/config/migrator.ts` — version field check, migration function registry (`migrations[1→2]`, etc.), auto-migrate on load

### Secret Store

- [ ] Implement `packages/core/src/secrets/secret-store.ts` — SecretStore interface: `get(key)`, `set(key, value)`, `delete(key)`, `list(prefix)`, `has(key)`
- [ ] Implement `packages/core/src/secrets/backends/keychain.ts` — macOS Keychain via `security` CLI (`add-generic-password`, `find-generic-password`, `delete-generic-password`)
- [ ] Implement `packages/core/src/secrets/backends/secret-service.ts` — Linux Secret Service via `secret-tool` CLI
- [ ] Implement `packages/core/src/secrets/backends/encrypted-file.ts` — AES-256-GCM fallback (derive key from machine ID + user password)
- [ ] Implement `packages/core/src/secrets/secret-store-factory.ts` — auto-detect platform, return appropriate backend
- [ ] Key naming convention: `oneclaw/{category}/{identifier}` (e.g., `oneclaw/provider/deepseek-api-key`)

### Tests — M1.1

- [ ] Unit tests: `validator.test.ts` — valid config passes, invalid config returns field-level errors
- [ ] Unit tests: `config-manager.test.ts` — load/save round-trip, watch triggers on change
- [ ] Unit tests: `backup-manager.test.ts` — backup created on save, old backups pruned, restore works
- [ ] Unit tests: `migrator.test.ts` — v1→v2 migration, unknown version throws
- [ ] Integration tests: `secret-store.test.ts` — platform detection, set/get/delete/list round-trip

---

## M1.2 — 模型管理

> Contract: `docs/contracts/model-config.md`
> Module: `docs/modules/model-management.md`
> Depends on: M1.1 (config-manager for reading provider config, secret-store for API keys)

### Provider System

- [ ] Implement `packages/core/src/models/types.ts` — ModelProvider, ModelConfig, ModelSettings Zod schemas (matching contract)
- [ ] Implement `packages/core/src/models/provider-registry.ts` — ProviderRegistry: register/get/list providers, 3 presets (DeepSeek, 百炼, 智谱) with base URLs and default models
- [ ] Implement `packages/core/src/models/provider-health.ts` — health check per provider (lightweight chat completion test), status tracking (healthy/degraded/down), probe recovery every 30s for down providers

### Key Management

- [ ] Implement `packages/core/src/models/key-rotator.ts` — KeyRotator: round-robin key selection, rotate on 429, cooldown per key (60s default), exhaustion detection

### Fallback

- [ ] Implement `packages/core/src/models/fallback-orchestrator.ts` — FallbackOrchestrator: ordered provider chain, error-type-specific behavior (no fallback on context overflow, fallback on rate limit/auth error/timeout, probe recovery on rate limit)

### Quota Tracking

- [ ] Implement `packages/core/src/models/quota-tracker.ts` — QuotaTracker: token-based billing (input/output token prices), request-based billing (Coding Plan monthly request count), daily/weekly/monthly limits, warning threshold alerts
- [ ] Implement `packages/core/src/models/cost-calculator.ts` — calculate cost per request (tokens × price), aggregate by time period, export as CSV

### Tests — M1.2

- [ ] Unit tests: `provider-registry.test.ts` — register/get/list, preset providers present
- [ ] Unit tests: `key-rotator.test.ts` — rotation on 429, cooldown, exhaustion
- [ ] Unit tests: `fallback-orchestrator.test.ts` — fallback chain, error-type behavior, probe recovery
- [ ] Unit tests: `quota-tracker.test.ts` — token billing, request billing, limit warnings
- [ ] Integration test: simulate 429 → key rotation → provider fallback → probe recovery cycle

---

## Notes

- Read `docs/harness.md` for enforceable standards (strict TS, Zod validation, structured logging)
- Config uses JSON files; cost history uses SQLite (`data/oneclaw.db` next to config)
- Secrets are NEVER stored in config — config holds `credentialRef` strings pointing to SecretStore keys
- All error types: typed enums per module (e.g., `ConfigError`, `SecretStoreError`, `ProviderError`)
