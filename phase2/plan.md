# Phase 2 Plan (Execution)

> Baseline date: 2026-03-03
> Phase 2 objective: deliver GUI + cross-platform desktop baseline on top of Phase 1 core.

## Entry Criteria (Must Be True Before Phase 2)

- `phase1/human-review.md` is APPROVED.
- `<PHASE1_COMPLETE>` was reached.
- Release candidate can pass build/runtime smoke and real CI checks.

## Distance from Current State

Current codebase is CLI/core focused. Missing major Phase 2 foundations:

- No Tauri desktop project scaffold.
- No React GUI pages or state stores.
- No GUI-to-runtime IPC contract and implementation.
- No desktop packaging flow for macOS/Windows/Linux installers.

## Ralph Loop Rules

- One task per loop.
- Keep strict task order.
- Every UI/backend task needs test coverage or demo verification evidence.

## Milestone P2-A: Architecture and Skeleton (Week 1)

- [x] `P2-A1` Create `apps/desktop` scaffold (Tauri 2 + React + TypeScript).
- [x] `P2-A2` Define folder structure for pages/components/stores/theme/tauri commands.
- [x] `P2-A3` Add design tokens and base layout shell (icon rail + sidebar + content panel).
- [x] `P2-A4` Decide and document runtime integration strategy (Tauri Rust command wrappers vs sidecar process boundary).
- [x] `P2-A5` Add minimal CI check for desktop frontend typecheck/build.

## Milestone P2-B: Runtime Bridge and IPC (Week 2)

- [x] `P2-B1` Define typed IPC contracts for status/config/start/stop/doctor/cost/model/channel.
- [x] `P2-B2` Implement Tauri command layer (or sidecar bridge) for core read operations first.
- [x] `P2-B3` Implement write/action operations with error mapping (`zh-CN` and `en`).
- [x] `P2-B4` Add event channel for runtime status/log/cost updates.
- [x] `P2-B5` Add integration tests for IPC contract compatibility.

## Milestone P2-C: GUI Functional Pages (Weeks 3-5)

- [x] `P2-C1` Dashboard page: runtime status, recent logs, quick actions.
- [x] `P2-C2` Cost panel: today/week/month summary and trend view.
- [x] `P2-C3` Model config page: provider cards, model selection, fallback chain reorder.
- [x] `P2-C4` Channel page: Feishu setup flow + test message trigger + status.
- [x] `P2-C5` Settings page: language/theme/workspace/security overview.
- [x] `P2-C6` Setup Wizard GUI flow (7-step guided onboarding with skip support).

## Milestone P2-D: Platform and Packaging (Week 6)

- [x] `P2-D1` macOS desktop packaging pipeline (`.dmg`) proof build.
- [x] `P2-D2` Windows desktop packaging pipeline (`.exe`) proof build.
- [x] `P2-D3` Linux desktop packaging pipeline (`.AppImage` or `.deb`) proof build.
- [x] `P2-D4` Verify app config path and secret behavior consistency across platforms.
- [x] `P2-D5` Add release artifacts upload for desktop builds.

## Milestone P2-E: Stabilization and Exit (Week 7)

- [x] `P2-E1` End-to-end happy path: first launch -> wizard -> start agent -> receive channel test message.
- [x] `P2-E2` Error UX review: common failures have localized and actionable guidance.
- [x] `P2-E3` Performance sanity: startup time and key page interactions acceptable.
- [ ] `P2-E4` Security sanity: secret values never exposed in UI logs or plain text exports.
- [ ] `P2-E5` Complete `phase2/human-review.md` with PASS on required gates.

## Done Definition for Phase 2

All items below must be true:

- All tasks above are checked.
- GUI can perform core workflows without requiring CLI for normal users.
- Desktop builds exist for macOS, Windows, and Linux.
- `phase2/human-review.md` required gates are PASS.

When all are done, output `<PHASE2_COMPLETE>`.
