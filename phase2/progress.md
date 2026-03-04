# Progress Log

> Updated by agents during Ralph Loop execution.

---

## Iteration 1 — P2-A1: Create `apps/desktop` scaffold (Tauri 2 + React + TypeScript)

- **Date**: 2026-03-04
- **Scope**: Bootstrap `apps/desktop` with Tauri 2 + React 19 + TypeScript + Vite
- **Implementation**:
  - Created `apps/desktop/package.json` with React 19, @tauri-apps/api 2.10.1, Vite 6, @vitejs/plugin-react
  - Created `tsconfig.json` (strict mode, JSX react-jsx, DOM libs) and `tsconfig.node.json`
  - Created `vite.config.ts` with React plugin, Tauri HMR support (port 1420)
  - Created `index.html` entry point (zh-CN lang)
  - Created `src/main.tsx` (React 19 createRoot) and `src/App.tsx` (greet IPC demo)
  - Created `src-tauri/Cargo.toml` (tauri 2, tauri-plugin-shell 2, serde)
  - Created `src-tauri/src/main.rs` + `src-tauri/src/lib.rs` (greet command, shell plugin)
  - Created `src-tauri/tauri.conf.json` (1200x800 window, min 900x600, identifier com.oneclaw.app)
  - Created `src-tauri/capabilities/default.json` (core:default, shell:allow-open)
  - Created `src-tauri/build.rs`, placeholder RGBA PNG icons, `.gitignore` for target/
  - Updated root `eslint.config.mjs`: added `.tsx` support, `src-tauri` ignore, browser globals for desktop
- **Validation**:
  - `pnpm typecheck`: 3 packages pass (core, cli, desktop)
  - `pnpm test`: 74 tests pass (56 core + 18 cli)
  - `cargo check` in src-tauri: compiles clean
- **Status**: COMPLETE

---

## Iteration 2 — P2-A2: Define folder structure for pages/components/stores/theme/tauri commands

- **Date**: 2026-03-04
- **Scope**: Establish the full folder structure for the desktop frontend and Tauri backend per `docs/modules/gui.md`
- **Implementation**:
  - Created `src/pages/` with 5 page directories: `dashboard/`, `model-config/`, `channel-config/`, `settings/`, `setup-wizard/` — each with a real component
  - Created `src/components/index.ts` — shared UI components barrel export
  - Created `src/hooks/index.ts` — custom hooks barrel export
  - Created `src/stores/` with 4 Zustand stores: `agent-store.ts`, `model-store.ts`, `config-store.ts`, `cost-store.ts` + barrel `index.ts`
  - Created `src/theme/tokens.ts` — design tokens (layout dimensions, light/dark color palettes) + barrel `index.ts`
  - Restructured `src-tauri/src/commands/mod.rs` — moved `greet` command into commands module, updated `lib.rs`
  - Added `zustand` dependency to `@oneclaw/desktop`
  - Added `@/` path alias in `tsconfig.json` (paths) and `vite.config.ts` (resolve.alias)
- **Validation**:
  - `pnpm typecheck`: 3 packages pass (core, cli, desktop)
  - `pnpm test`: 74 tests pass (56 core + 18 cli)
  - `pnpm lint`: 0 errors, 3 pre-existing warnings
  - `cargo check`: compiles clean
- **Status**: COMPLETE

---

## Iteration 3 — P2-A3: Add design tokens and base layout shell (icon rail + sidebar + content panel)

- **Date**: 2026-03-04
- **Scope**: Expand design tokens and implement the three-panel layout shell (IconRail + Sidebar + ContentPanel)
- **Implementation**:
  - Expanded `src/theme/tokens.ts`: added `spacing`, `typography`, `transitions`, `zIndex`, `borderRadius` token groups; expanded `lightColors`/`darkColors` with icon rail colors, disabled text, border variants, status colors, hover accents
  - Added `ColorTokens` widened type for cross-theme compatibility
  - Created `src/hooks/use-theme.ts`: resolves system/light/dark preference, listens to OS `prefers-color-scheme` changes, returns resolved theme + color tokens
  - Created `src/components/layout/types.ts`: `PageId` union type for navigation
  - Created `src/components/layout/IconRail.tsx`: 48px vertical icon rail with 4 nav items (Dashboard, 模型, 通信, 设置), SVG icons, active state indicator, aria attributes
  - Created `src/components/layout/Sidebar.tsx`: 240px sidebar with bilingual page titles (zh-CN/en), border and theme transitions
  - Created `src/components/layout/ContentPanel.tsx`: flex-grow content area with padding and scroll
  - Created `src/components/layout/AppLayout.tsx`: composes IconRail + Sidebar + ContentPanel, manages active page state, renders page components
  - Created `src/global.css`: box-sizing reset, full-height body/root, font smoothing
  - Updated `src/App.tsx`: replaced greet demo with `AppLayout`
  - Updated `src/main.tsx`: imports `global.css`
  - Updated barrel exports: `hooks/index.ts` exports `useTheme`, `components/index.ts` exports `AppLayout`
- **Validation**:
  - `pnpm typecheck`: 3 packages pass (core, cli, desktop)
  - `pnpm test`: 74 tests pass (56 core + 18 cli)
  - `pnpm lint`: 0 errors, 3 pre-existing warnings
- **Status**: COMPLETE

---

## Iteration 4 — P2-A4: Decide and document runtime integration strategy

- **Date**: 2026-03-04
- **Scope**: Evaluate Tauri Rust command wrappers vs sidecar process boundary; write architectural decision record
- **Implementation**:
  - Evaluated 3 options: (A) Rust-embedded Node.js/WASM, (B) Sidecar + JSON-RPC over stdio, (C) Sidecar + HTTP/WebSocket
  - Decision: **Option B — Sidecar process + JSON-RPC over stdio**
    - Core TypeScript modules depend on Node.js APIs (`child_process`, `node:fs`, `node:crypto`) — cannot compile to WASM
    - Sidecar binary built via `bun build --compile`, zero runtime dependencies
    - Tauri `tauri-plugin-shell` manages sidecar lifecycle
    - JSON-RPC 2.0 over stdin/stdout for request/response, notifications for event push
    - Rust commands bridge frontend `invoke()` calls to sidecar stdin, forward sidecar stdout events via Tauri `app.emit()`
  - Created `docs/decisions/runtime-integration.md` with full architecture, data flow, lifecycle, file structure, and consequences
  - Updated `MAP.md` with new "架构决策" section linking the decision document
- **Validation**:
  - `pnpm typecheck`: 3 packages pass (core, cli, desktop)
  - `pnpm test`: 74 tests pass (56 core + 18 cli)
- **Status**: COMPLETE

---

## Iteration 5 — P2-A5: Add minimal CI check for desktop frontend typecheck/build

- **Date**: 2026-03-04
- **Scope**: Add a CI workflow job that validates the desktop frontend compiles and builds correctly
- **Implementation**:
  - Added `desktop` job to `.github/workflows/ci.yml` with 3 steps: typecheck, vite build, verify output
  - Job runs `pnpm --filter @oneclaw/desktop typecheck` then `pnpm --filter @oneclaw/desktop build`
  - Includes smoke check: verifies `apps/desktop/dist/index.html` exists after build
  - Uses same pnpm/Node.js setup pattern as existing CI jobs (pnpm 10.26.1, Node 20)
- **Validation**:
  - `pnpm typecheck`: 3 packages pass (core, cli, desktop)
  - `pnpm test`: 74 tests pass (56 core + 18 cli)
  - Desktop build verified locally: vite produces dist/index.html + JS/CSS assets
- **Status**: COMPLETE

---

## Iteration 6 — P2-B1: Define typed IPC contracts for all JSON-RPC methods

- **Date**: 2026-03-04
- **Scope**: Define typed TypeScript IPC contracts for all JSON-RPC methods (agent, config, model, secret, channel, cost, doctor) and event notifications
- **Implementation**:
  - Created `src/ipc/jsonrpc.ts`: JSON-RPC 2.0 base types (request, response, notification, error), standard error codes, application error codes, type guards
  - Created `src/ipc/methods/agent.ts`: 5 methods — `agent.start`, `agent.stop`, `agent.restart`, `agent.status`, `agent.health`; serializable mirrors of core `KernelStatus`, `HealthReport`, `ErrorInfo` with ISO string dates
  - Created `src/ipc/methods/config.ts`: 4 methods — `config.get`, `config.update`, `config.reset`, `config.validate`; full `IpcOneclawConfig` shape mirroring core `OneclawConfig` with serializable types
  - Created `src/ipc/methods/model.ts`: 5 methods — `model.list`, `model.listPresets`, `model.setFallbackChain`, `model.testProvider`, `model.getQuota`; `IpcProviderSummary` with health + quota
  - Created `src/ipc/methods/secret.ts`: 4 methods — `secret.set`, `secret.delete`, `secret.exists`, `secret.list`; values never returned to frontend (security)
  - Created `src/ipc/methods/channel.ts`: 4 methods — `channel.feishu.setup`, `channel.feishu.test`, `channel.feishu.status`, `channel.feishu.sendTest`; serializable `IpcTestResult`, `IpcSendResult`
  - Created `src/ipc/methods/cost.ts`: 3 methods — `cost.summary`, `cost.history`, `cost.export`; `IpcCostOverview` with today/week/month, `IpcCostHistory` with daily breakdown
  - Created `src/ipc/methods/doctor.ts`: 1 method — `doctor.run`; bilingual `IpcDoctorCheck` with zh-CN/en labels
  - Created `src/ipc/events.ts`: 4 event types — `SidecarReadyEvent`, `LogEvent`, `StatusEvent`, `CostEventPayload`; Tauri event name constants; `TauriEventMap` and `JsonRpcNotificationMap` for type-safe listeners
  - Created `src/ipc/method-map.ts`: unified `IpcMethodMap` interface (26 methods total); `IpcMethodName`, `IpcParams<M>`, `IpcResult<M>` utility types for compile-time dispatch safety
  - Created `src/ipc/index.ts`: barrel export for all contracts
- **Design decisions**:
  - All `Date` fields serialized as ISO 8601 strings (JSON-RPC transport)
  - Secret values never exposed in responses (only `exists` and `list` keys)
  - Doctor check labels are bilingual objects (`{zh-CN, en}`)
  - Method map uses mapped types for compile-time params↔result enforcement
- **Validation**:
  - `pnpm typecheck`: 3 packages pass (core, cli, desktop)
  - `pnpm test`: 74 tests pass (56 core + 18 cli)
- **Status**: COMPLETE

---

## Failed Attempts

### 2026-03-04 10:54:36 | Agent: claude | Iteration: 2
- Task: Unknown Task
- Exit code: 1
- Attempts: 1
- Log: `/Users/shing/Projects/oneclaw/ralph-log.txt`
- Error excerpt:
```text
- **lint**: 0 errors, 3 warnings
- **Local quality gates are real and passing**: typecheck (2 packages), 74 tests (56 core + 18 cli) via Vitest v4.0.18, lint (0 errors, 3 warnings).
- **lint**: 0 errors, 3 warnings
| Local quality gates real and passing | **Yes** — typecheck (2 packages), 74 tests (56 core + 18 cli), lint (0 errors, 3 warnings) |
^C[2026-03-04 10:54:36] [Agent: claude] Failed on iteration 2.
```
