# Phase 2 Human Review Checklist

> Reviewer: __________
> Date: __________
> Commit/Tag: __________

## Review Rule

- Any `FAIL` in G1-G7 blocks Phase 3 planning.
- `N/A` requires written justification and a follow-up issue.

## G0. Entry Gate

- [ ] PASS / [ ] FAIL  Phase 1 is approved (`phase1/human-review.md` complete).
- [ ] PASS / [ ] FAIL  Phase 2 scope freeze is agreed (no hidden feature creep).

Evidence:

- Notes:

## G1. Desktop App Foundation

- [ ] PASS / [ ] FAIL  Tauri + React app starts locally.
- [ ] PASS / [ ] FAIL  Layout shell is complete (icon rail, sidebar, content area).
- [ ] PASS / [ ] FAIL  Language/theme baseline works (`zh-CN` and `en`).

Evidence:

- Command log:
- Screenshot links:
- Notes:

## G2. Runtime Bridge (IPC)

- [ ] PASS / [ ] FAIL  GUI can read runtime status/config via typed IPC.
- [ ] PASS / [ ] FAIL  GUI can trigger start/stop/config writes safely.
- [ ] PASS / [ ] FAIL  Runtime errors are mapped to localized, actionable messages.
- [ ] PASS / [ ] FAIL  Event updates (status/log/cost) are reflected live in UI.

Evidence:

- Command log:
- Notes:

## G3. Functional Parity (GUI vs CLI Core)

- [ ] PASS / [ ] FAIL  Dashboard shows status/log basics correctly.
- [ ] PASS / [ ] FAIL  Model config edits persist and affect runtime behavior.
- [ ] PASS / [ ] FAIL  Channel page supports Feishu setup and test message.
- [ ] PASS / [ ] FAIL  Settings page covers language/theme/workspace/security essentials.
- [ ] PASS / [ ] FAIL  Setup Wizard completes full first-run flow with skip/back support.

Evidence:

- Screen recording or screenshot links:
- Notes:

## G4. Cost and Diagnostics UX

- [ ] PASS / [ ] FAIL  Cost panel shows day/week/month summaries with correct units.
- [ ] PASS / [ ] FAIL  Doctor/health diagnostics are visible and understandable in GUI.
- [ ] PASS / [ ] FAIL  Failure states have recovery suggestions.

Evidence:

- Notes:

## G5. Security and Data Handling

- [ ] PASS / [ ] FAIL  Secret values are never rendered in plain text except explicit reveal controls.
- [ ] PASS / [ ] FAIL  Logs and exported diagnostics are redacted for sensitive fields.
- [ ] PASS / [ ] FAIL  Config and secret storage behavior is consistent with platform expectations.

Evidence:

- Notes:

## G6. Cross-Platform Packaging

- [ ] PASS / [ ] FAIL  macOS build artifact produced and launchable.
- [ ] PASS / [ ] FAIL  Windows build artifact produced and launchable.
- [ ] PASS / [ ] FAIL  Linux build artifact produced and launchable.
- [ ] PASS / [ ] FAIL  Release workflow uploads expected desktop artifacts.

Evidence:

- Artifact links:
- Notes:

## G7. Stability and Regression

- [ ] PASS / [ ] FAIL  Key flow E2E test passes: first launch -> wizard -> start -> channel test.
- [ ] PASS / [ ] FAIL  No blocker regressions to existing Phase 1 CLI behavior.
- [ ] PASS / [ ] FAIL  No P0/P1 bugs remain open.

Evidence:

- Test report links:
- Bug list:

## Final Decision

- [ ] APPROVED: Phase 2 complete, can plan Phase 3.
- [ ] REJECTED: Must fix blockers before Phase 3.

Blocking issues:

1.
2.
3.
