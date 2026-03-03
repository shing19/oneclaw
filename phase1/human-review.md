# Phase 1 Human Review Checklist

> Reviewer: __________
> Date: __________
> Commit/Tag: __________

## Review Rule

- Any `FAIL` in G1-G6 blocks Phase 2 start.
- `N/A` is allowed only with reviewer note and follow-up issue.

## G1. Build and Runtime Boot

- [ ] PASS / [ ] FAIL  `pnpm build` succeeds.
- [ ] PASS / [ ] FAIL  `node dist/index.js --version` succeeds.
- [ ] PASS / [ ] FAIL  `node dist/index.js --help` succeeds.
- [ ] PASS / [ ] FAIL  Runtime assets required by config validation are present in publish output.

Evidence:

- Command log:
- Notes:

## G2. Quality Gates Are Real

- [ ] PASS / [ ] FAIL  `pnpm typecheck` runs real package checks.
- [ ] PASS / [ ] FAIL  `pnpm test` runs real unit/integration tests (not empty pass).
- [ ] PASS / [ ] FAIL  `pnpm lint` runs real lint checks.
- [ ] PASS / [ ] FAIL  Intentionally introducing a small test/lint/type error makes the gate fail.

Evidence:

- Command log:
- Notes:

## G3. Core CLI Lifecycle

- [ ] PASS / [ ] FAIL  `oneclaw init` works in interactive mode and writes config.
- [ ] PASS / [ ] FAIL  `oneclaw start` (daemon mode) starts successfully.
- [ ] PASS / [ ] FAIL  `oneclaw status` reports expected model/state.
- [ ] PASS / [ ] FAIL  `oneclaw stop` stops daemon and clears stale runtime state.
- [ ] PASS / [ ] FAIL  Same flow works with `--locale en` and `--locale zh-CN`.

Evidence:

- Command log:
- Notes:

## G4. Config and Secret Safety

- [ ] PASS / [ ] FAIL  Config validate reports useful errors for bad config.
- [ ] PASS / [ ] FAIL  Config backup and rollback work as expected.
- [ ] PASS / [ ] FAIL  Secret store uses expected backend on current platform.
- [ ] PASS / [ ] FAIL  Missing secret scenarios are detected by `doctor` with actionable guidance.

Evidence:

- Command log:
- Notes:

## G5. Feishu Channel

- [ ] PASS / [ ] FAIL  `oneclaw channel setup feishu` completes with valid input.
- [ ] PASS / [ ] FAIL  `oneclaw channel test feishu` sends test message successfully.
- [ ] PASS / [ ] FAIL  Feishu receive path confirms inbound message handling.

Evidence:

- Command log:
- Notes:

## G6. Distribution Path

- [ ] PASS / [ ] FAIL  `scripts/install.sh` installs correctly on current environment.
- [ ] PASS / [ ] FAIL  Local `npm pack` -> isolated install -> `oneclaw --version` works.
- [ ] PASS / [ ] FAIL  CI workflow jobs (`lint/typecheck/test/build`) are green and meaningful.
- [ ] PASS / [ ] FAIL  Smoke install workflow for macOS + Ubuntu is green for release candidate.

Evidence:

- Command log:
- Notes:

## Final Decision

- [ ] APPROVED: Phase 1 complete, can start Phase 2.
- [ ] REJECTED: Must fix blockers before Phase 2.

Blocking issues:

1.
2.
3.
