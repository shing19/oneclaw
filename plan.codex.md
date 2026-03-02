# OneClaw — Codex Agent Plan (Parallel Mode)

> Scope: M1.3 Agent 适配层 → M1.4 CLI
> M1.3 is the bridge to OpenClaw. M1.4 is the user-facing interface. M1.4 depends on M1.3.

---

## Prerequisites

Before starting, ensure dependencies are available:
- [ ] Verify M1.0 scaffold complete (`pnpm typecheck` passes)
- [ ] Verify M1.1 config-manager and secret-store are implemented (needed by adapter)
- [ ] Verify M1.2 model management is implemented (needed by CLI model commands)

If M1.1/M1.2 are not yet ready, start with M1.3 tasks that don't depend on them (config-translator, log-parser).

---

## M1.3 — Agent 适配层

> Contract: `docs/contracts/agent-adapter.md`
> Module: `docs/modules/agent-adapter.md`

### Core Interface

- [ ] Implement `packages/core/src/adapter/types.ts` — AgentKernel, AgentConfig, KernelStatus, HealthReport, LogEntry, CostEvent, AdapterError types (Zod schemas matching contract)
- [ ] Implement `packages/core/src/adapter/agent-kernel.ts` — AgentKernel interface implementation skeleton

### OpenClaw Adapter

- [ ] Implement `packages/core/src/adapter/openclaw-adapter.ts` — OpenClawAdapter class:
  - `start()`: spawn OpenClaw process with translated config, pipe stdout/stderr
  - `stop()`: graceful shutdown (SIGTERM → wait 5s → SIGKILL)
  - `restart()`: stop + start with latest config
  - `status()`: return KernelStatus (running/stopped/error + pid + uptime)
  - `health()`: return HealthReport (kernel status + model provider health + last error)
- [ ] Implement `packages/core/src/adapter/config-translator.ts` — translate OneClaw config schema → `openclaw.json` format (model settings, API keys from SecretStore, transport, concurrency)
- [ ] Implement `packages/core/src/adapter/log-parser.ts` — parse OpenClaw stdout/stderr into structured LogEntry stream (timestamp, level, source, message, metadata)
- [ ] Implement `packages/core/src/adapter/event-stream.ts` — EventEmitter wrapper: emit typed events (cost, status-change, error, log) from parsed log stream

### Process Management

- [ ] Implement `packages/core/src/adapter/process-manager.ts` — low-level process spawn/kill with:
  - PID tracking + pidfile
  - Graceful shutdown with timeout
  - Crash detection + auto-restart option
  - Environment variable passthrough

### Tests — M1.3

- [ ] Unit tests: `config-translator.test.ts` — OneClaw config → openclaw.json round-trip, missing fields handled
- [ ] Unit tests: `log-parser.test.ts` — parse sample OpenClaw output lines into LogEntry structs
- [ ] Unit tests: `event-stream.test.ts` — events emitted correctly from parsed log stream
- [ ] Integration test: `openclaw-adapter.test.ts` — start → status(running) → stop → status(stopped) lifecycle (mock process)

---

## M1.4 — CLI

> Module: `docs/modules/cli.md`
> Depends on: M1.1 (config), M1.2 (models), M1.3 (adapter)

### Entry Point

- [ ] Implement `packages/cli/src/index.ts` — Commander.js program setup, global options (`--json` for machine-readable output, `--quiet` for minimal output), version from package.json

### Core Commands

- [ ] Implement `packages/cli/src/commands/init.ts` — interactive wizard using @inquirer/prompts:
  1. Select language (zh-CN / en)
  2. Select model provider (list presets)
  3. Enter API key (interactive, no echo)
  4. Test connection (send "hello" to model)
  5. Save config + store API key in SecretStore
- [ ] Implement `packages/cli/src/commands/start.ts` — start Agent via adapter (foreground with log streaming, or `--daemon` mode with pidfile)
- [ ] Implement `packages/cli/src/commands/stop.ts` — stop Agent via adapter (read pidfile, graceful shutdown)
- [ ] Implement `packages/cli/src/commands/status.ts` — show Agent status table (running/stopped, PID, uptime, current model, provider health)

### Config Commands

- [ ] Implement `packages/cli/src/commands/config.ts` — subcommands:
  - `config show` — display config (secrets masked as `***`)
  - `config set <key> <value>` — set config value with validation
  - `config validate` — run full validation and report issues
  - `config backup` — manual backup
  - `config rollback [version]` — list backups / restore specific version

### Model Commands

- [ ] Implement `packages/cli/src/commands/model.ts` — subcommands:
  - `model list` — table of configured providers and models
  - `model test [provider]` — send test message and report latency
  - `model priority` — show/reorder fallback chain

### Cost & Diagnostics

- [ ] Implement `packages/cli/src/commands/cost.ts` — `cost` (today summary), `cost history --range 7d`, `cost export --format csv`
- [ ] Implement `packages/cli/src/commands/doctor.ts` — health check: config valid? secrets accessible? model connectable? OpenClaw installed? network OK?

### Output Formatters

- [ ] Implement `packages/cli/src/formatters/table.ts` — colored table output using chalk + cli-table3
- [ ] Implement `packages/cli/src/formatters/json.ts` — JSON output mode
- [ ] Implement `packages/cli/src/formatters/status.ts` — status display with colored indicators

### Tests — M1.4

- [ ] Unit tests: `init.test.ts` — wizard flow with mocked prompts
- [ ] Unit tests: `config.test.ts` — show/set/validate command parsing
- [ ] Unit tests: `formatters/*.test.ts` — table and JSON formatting
- [ ] Integration test: full flow `init` → `start` → `status` → `stop` (mock adapter)

---

## Notes

- Read `docs/harness.md` — especially Principle 3 (mechanical enforcement) for CLI validation
- CLI must support both interactive (TTY) and non-interactive (pipe) modes
- Secrets are NEVER passed as CLI arguments — always use interactive prompts
- Destructive operations (`config rollback`, `stop`) need confirmation prompts
- All output defaults to colored human-readable; `--json` for scripts; `--quiet` for minimal
