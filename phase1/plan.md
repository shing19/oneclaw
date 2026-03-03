# Phase 1 Plan (Execution)

> Baseline date: 2026-03-03
> Goal: turn current Phase 1 code into a release-ready MVP before starting Phase 2.

## Current Snapshot

- Most Phase 1 modules are implemented (`core`, `cli`, `feishu`, distribution workflows).
- Main blockers observed in current branch:
  - Packaged CLI fails at runtime because `dist/schema.json` is missing.
  - `start` command uses `hideHelp()` and can fail under current Commander runtime.
  - Root quality scripts can pass without running package checks (`--if-present` with missing package scripts).

## Ralph Loop Rules

- One task per loop.
- Search before coding.
- Keep task order.
- Do not mark done without passing required checks.

## Milestone P1-A: Runtime and Packaging Correctness

- [x] `P1-A1` Fix internal daemon command registration compatibility in `packages/cli/src/commands/start.ts`.
- [x] `P1-A2` Ensure config schema asset is available at runtime for built CLI (`dist/schema.json`).
- [x] `P1-A3` Verify `node dist/index.js --version` and `node dist/index.js --help` both pass after build.
- [x] `P1-A4` Ensure published package includes all runtime-required assets (not only `index.js`).

## Milestone P1-B: Real Quality Gates (No False Green)

- [x] `P1-B1` Add explicit `typecheck`, `test`, `lint` scripts in `packages/core/package.json`.
- [x] `P1-B2` Add explicit `typecheck`, `test`, `lint` scripts in `packages/cli/package.json`.
- [x] `P1-B3` Install and wire missing test tooling (Vitest/TS runner) so tests actually execute.
- [x] `P1-B4` Make root scripts fail if package scripts are missing (remove `--if-present` for required checks).
- [x] `P1-B5` Verify locally: `pnpm typecheck && pnpm test && pnpm lint` runs real checks and fails on real errors.

## Milestone P1-C: CI/Release/Smoke Hardening

- [x] `P1-C1` Add CI `build` job and runtime smoke check on built artifact.
- [ ] `P1-C2` Ensure release workflow validates packaged tarball content before publish.
- [ ] `P1-C3` Add a local reproducible smoke command/script for `npm pack` -> isolated install -> `oneclaw --version`.
- [ ] `P1-C4` Confirm install script behavior for source selection and failure reporting.

## Milestone P1-D: Phase 1 Exit Evidence

- [ ] `P1-D1` Re-run integration flow evidence: `init -> start -> status -> stop`.
- [ ] `P1-D2` Re-run Feishu integration evidence: send + receive confirmation.
- [ ] `P1-D3` Verify doctor command surfaces common failure guidance in both `zh-CN` and `en`.
- [ ] `P1-D4` Record final evidence and links in `phase1/human-review.md`.

## Done Definition for Phase 1

All items below must be true:

- All tasks above are checked.
- Local quality gates are real and passing.
- CI and smoke workflows are trustworthy (no false green).
- `phase1/human-review.md` gates are all PASS.

When all are done, output `<PHASE1_COMPLETE>`.
