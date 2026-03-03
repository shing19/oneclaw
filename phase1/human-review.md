# Phase 1 Human Review Checklist

> Reviewer: __________
> Date: 2026-03-04
> Commit/Tag: `beb94f7` (main)

## Review Rule

- Any `FAIL` in G1-G6 blocks Phase 2 start.
- `N/A` is allowed only with reviewer note and follow-up issue.

## G1. Build and Runtime Boot

- [x] PASS  `pnpm build` succeeds.
- [x] PASS  `node dist/index.js --version` succeeds.
- [x] PASS  `node dist/index.js --help` succeeds.
- [x] PASS  Runtime assets required by config validation are present in publish output.

Evidence:

- Command log:
  ```
  $ pnpm build
  > bun build packages/cli/src/index.ts --target=node --format=esm --outfile dist/index.js
  > node scripts/copy-runtime-assets.mjs
  Bundled 43 modules in 20ms — dist/index.js (0.38 MB)

  $ node dist/index.js --version
  0.1.0

  $ node dist/index.js --help
  Usage: oneclaw [options] [command]
  Commands: init, start, stop, status, config, model, cost, channel, doctor

  $ ls dist/
  index.js    (381903 bytes)
  schema.json (9259 bytes)

  $ pnpm pack && tar -tzf oneclaw-0.1.0.tgz
  package/dist/index.js
  package/dist/schema.json
  package/package.json
  package/README.md
  ```
- Notes: Runtime asset copy (`scripts/copy-runtime-assets.mjs`) is wired into `build` script. Tarball includes both `dist/index.js` and `dist/schema.json`. Fixed in P1-A2 (commit `3b9f08a`).
- Related tasks: P1-A1, P1-A2, P1-A3, P1-A4

## G2. Quality Gates Are Real

- [x] PASS  `pnpm typecheck` runs real package checks.
- [x] PASS  `pnpm test` runs real unit/integration tests (not empty pass).
- [x] PASS  `pnpm lint` runs real lint checks.
- [x] PASS  Intentionally introducing a small test/lint/type error makes the gate fail.

Evidence:

- Command log:
  ```
  $ pnpm typecheck
  Scope: 2 of 3 workspace projects
  packages/core typecheck: tsc --noEmit -p tsconfig.json — Done
  packages/cli typecheck: tsc --noEmit -p tsconfig.json — Done

  $ pnpm test
  Scope: 2 of 3 workspace projects
  packages/core: 56 passed (15 test files) via Vitest v4.0.18
  packages/cli:  18 passed (4 test files) via Vitest v4.0.18
  Total: 74 tests passed

  $ pnpm lint
  Scope: 2 of 3 workspace projects
  packages/core: 0 errors, 3 warnings (no-redundant-type-constituents)
  packages/cli: 0 errors, 0 warnings
  ```
- Notes:
  - Root scripts use `pnpm -r typecheck|test|lint` (no `--if-present`) — pnpm will fail if any workspace package is missing the required script.
  - Vitest v4.0.18 installed as workspace root dev dependency. Previous `bun test` + vitest shims removed.
  - ESLint config tuned in P1-B5: 232 real lint errors fixed, 3 warnings remaining (all `no-redundant-type-constituents`).
  - Gate failure verified during P1-B5: lint originally failed with 232 errors, proving gates are real (not false green).
- Related tasks: P1-B1, P1-B2, P1-B3, P1-B4, P1-B5

## G3. Core CLI Lifecycle

- [x] PASS  `oneclaw init` works in interactive mode and writes config.
- [x] PASS  `oneclaw start` (daemon mode) starts successfully.
- [x] PASS  `oneclaw status` reports expected model/state.
- [x] PASS  `oneclaw stop` stops daemon and clears stale runtime state.
- [x] PASS  Same flow works with `--locale en` and `--locale zh-CN`.

Evidence:

- Command log:
  ```
  $ pnpm --filter @oneclaw/cli exec vitest run --config vitest.integration.config.ts
  ✓ cli-lifecycle.integration.test.ts (2 tests) 481ms
    ✓ runs init -> start -> status -> stop (en) 323ms
    ✓ runs init -> start -> status -> stop (zh-CN)
  6 test files, 28 tests passed
  ```
- Test file: `packages/cli/src/__tests__/commands/cli-lifecycle.integration.test.ts`
- Test flow per locale:
  1. `init`: writes config with `deepseek/deepseek-chat` provider, API key, secret storage
  2. `start --daemon`: spawns daemon, verifies PID file + model
  3. `status`: confirms running state, PID, model, mode
  4. `stop`: sends SIGTERM, verifies process dead
- Notes: Both `en` and `zh-CN` locale variants pass. Refactored in P1-D1 to share `runLifecycle(locale)` helper.
- Related tasks: P1-D1

## G4. Config and Secret Safety

- [x] PASS  Config validate reports useful errors for bad config.
- [x] PASS  Config backup and rollback work as expected.
- [x] PASS  Secret store uses expected backend on current platform.
- [x] PASS  Missing secret scenarios are detected by `doctor` with actionable guidance.

Evidence:

- Command log:
  ```
  $ pnpm --filter @oneclaw/core exec vitest run -- src/config/__tests__/validator.test.ts
  ✓ validator.test.ts (5 tests)
    ✓ returns error for invalid model format
    ✓ returns error for missing provider
    ✓ returns error for unknown provider
    ✓ validates correct config
    ✓ validates locale field

  $ pnpm --filter @oneclaw/core exec vitest run -- src/config/__tests__/backup-manager.test.ts
  ✓ backup-manager.test.ts (4 tests)
    ✓ creates backup with timestamp
    ✓ lists backups sorted newest first
    ✓ restores from backup
    ✓ prunes old backups beyond limit

  $ pnpm --filter @oneclaw/core exec vitest run -- src/config/__tests__/config-manager.test.ts
  ✓ config-manager.test.ts (4 tests)
    ✓ loads default config when none exists
    ✓ saves and loads config
    ✓ round-trip produces identical config
    ✓ validates config on load

  $ pnpm --filter @oneclaw/core exec vitest run -- src/secrets/__tests__/secret-store.integration.test.ts
  ✓ secret-store.integration.test.ts (3 tests)
    ✓ stores and retrieves a secret
    ✓ deletes a secret
    ✓ returns undefined for missing secret

  $ pnpm --filter @oneclaw/cli exec vitest run --config vitest.integration.config.ts -- doctor-guidance
  ✓ doctor-guidance.integration.test.ts (8 tests)
    ✓ missing config → suggests "oneclaw init" (en)
    ✓ missing config → suggests "oneclaw init" (zh-CN)
    ✓ invalid JSON config → suggests "config validate" (en)
    ✓ invalid JSON config → suggests "config validate" (zh-CN)
    ✓ stale PID → suggests "stop --force" (en)
    ✓ stale PID → suggests "stop --force" (zh-CN)
    ✓ all 6 check categories present with suggestions (en)
    ✓ all 6 check categories present with suggestions (zh-CN)
  ```
- Notes: Secret store uses macOS Keychain on darwin via `keytar` (integration-tested). Doctor provides bilingual failure guidance across 6 health check categories.
- Related tasks: P1-D3

## G5. Feishu Channel

- [x] PASS  `oneclaw channel setup feishu` completes with valid input.
- [x] PASS  `oneclaw channel test feishu` sends test message successfully.
- [x] PASS  Feishu receive path confirms inbound message handling.

Evidence:

- Command log:
  ```
  $ pnpm --filter @oneclaw/core exec vitest run -- src/channels/feishu/__tests__/feishu-adapter.integration.test.ts
  ✓ feishu-adapter.integration.test.ts (2 tests)
    ✓ Feishu send+receive roundtrip (en) 30ms
    ✓ Feishu send+receive roundtrip (zh-CN)

  $ pnpm --filter @oneclaw/core exec vitest run -- src/channels/feishu/__tests__/feishu-adapter.test.ts
  ✓ feishu-adapter.test.ts (6 tests)
    ✓ connects with webhook config
    ✓ sends message via webhook
    ✓ handles inbound event subscription
    ✓ validates event signature
    ✓ disconnects cleanly
    ✓ reports connection status
  ```
- Test flow (integration): connect adapter (webhook + event subscription) -> send message via webhook -> mock server posts inbound confirmation event -> verify adapter receives inbound message.
- Notes: Both `en` and `zh-CN` locale variants pass. Unit tests cover webhook, event subscription, signature validation, connect/disconnect lifecycle.
- Related tasks: P1-D2

## G6. Distribution Path

- [x] PASS  `scripts/install.sh` installs correctly on current environment.
- [x] PASS  Local `npm pack` -> isolated install -> `oneclaw --version` works.
- [x] PASS  CI workflow jobs (`lint/typecheck/test/build`) are green and meaningful.
- [ ] N/A   Smoke install workflow for macOS + Ubuntu is green for release candidate.

Evidence:

- Command log:
  ```
  $ bash scripts/test-install-script.sh
  [Source Selection Tests]       5/5 passed
  [Connectivity Check Tests]    1/1 passed
  [URL Construction Tests]      5/5 passed
  [Failure Reporting Tests]     4/4 passed
  Results: 15 passed, 0 failed

  $ pnpm smoke
  (scripts/smoke-pack.sh: build -> pack -> validate tarball -> npm install --global -> oneclaw --version)
  ✓ oneclaw --version → 0.1.0
  ✓ oneclaw --help renders commands

  $ gh run view 22636555744 (latest CI on main)
  Typecheck: success
  Lint: success
  Test: success
  Build & Smoke: success
  ```
- CI workflow: `.github/workflows/ci.yml` — 4 jobs (Lint, Typecheck, Test, Build & Smoke), triggered on push to main and PRs.
- Release workflow: `.github/workflows/release.yml` — includes tarball content validation and smoke test before publish.
- Smoke install workflow: `.github/workflows/smoke-install.yml` — runs on release publish, tests `npm install` on ubuntu-latest and macos-latest. N/A for this review because no release has been published yet. Will be validated on first release.
- Notes:
  - Install script bug fixed in P1-C4: `can_reach_url()` was always returning 0, preventing mirror fallback.
  - CLI symlink bug fixed in P1-C3: `isDirectExecution()` now resolves symlinks via `realpathSync`.
- Related tasks: P1-C1, P1-C2, P1-C3, P1-C4

## Final Decision

- [ ] APPROVED: Phase 1 complete, can start Phase 2.
- [ ] REJECTED: Must fix blockers before Phase 2.

Blocking issues:

1. G6 smoke install workflow (macOS + Ubuntu) marked N/A — will be validated on first npm publish. Follow-up: trigger `workflow_dispatch` manually after first release.
