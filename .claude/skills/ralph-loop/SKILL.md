---
name: ralph-loop
description: Ralph Wiggum Loop methodology for autonomous iterative development. Use this skill when executing multi-step feature development, running iterative build-test-fix cycles, managing task prioritization during implementation, or when the user says "ralph", "loop", or asks for autonomous/iterative execution of a plan. Provides the structured loop pattern for high-quality agent-driven code delivery.
---

# Ralph Wiggum Loop: Iterative Autonomous Development

The Ralph Loop is an autonomous AI coding pattern where the agent works through tasks iteratively in a structured loop. Each iteration: pick one task, implement it, validate with feedback loops, commit, and repeat. Named after Ralph Wiggum — it looks simple, but it ships code.

## When to Use This Skill

- Executing a multi-step implementation plan
- Building features iteratively with test-driven feedback
- Running build-test-fix cycles autonomously
- User says "ralph", "loop", or wants iterative autonomous execution
- Working through a backlog of tasks or TODOs
- Quality improvement loops (test coverage, linting, cleanup)

## Core Philosophy

> "Software is clay on the pottery wheel — when something fails, it returns to the loop for refinement."

The agent CHOOSES which task to work on next based on priority, not necessarily the first in the list. The loop runs until all tasks pass or the iteration cap is reached.

---

## The Loop Structure

```
┌─────────────────────────────────────────┐
│            RALPH LOOP START             │
├─────────────────────────────────────────┤
│                                         │
│  1. READ scope (plan/PRD/task list)     │
│  2. READ progress.md (if exists)        │
│  3. CHOOSE highest priority task        │
│  4. SEARCH codebase before implementing │
│  5. IMPLEMENT one thing only            │
│  6. RUN feedback loops (build/test)     │
│  7. FIX if feedback loops fail          │
│  8. COMMIT with descriptive message     │
│  9. UPDATE progress tracking            │
│ 10. LOOP or STOP                        │
│                                         │
└─────────────────────────────────────────┘
```

---

## The 7 Rules of Ralph

### Rule 1: One Thing Per Loop

The most critical constraint. Each iteration implements ONE focused change.

- One feature, one bug fix, or one refactor per cycle
- Smaller tasks = higher quality output
- Never outrun your headlights — feedback rate is your speed limit
- If a task feels too large, break it into subtasks first

**Why**: Context windows degrade with size ("context rot"). Smaller focused tasks keep the agent sharp.

### Rule 2: Search Before You Build

**NEVER assume something doesn't exist.** Always search the codebase before implementing.

- `rg` / `grep` for existing implementations
- Check for existing utilities, helpers, patterns
- Don't duplicate what's already there
- Don't assume an item is not implemented — verify first

**Why**: Non-deterministic behavior can cause duplicate implementations. Searching is cheap; rewriting is expensive.

### Rule 3: Feedback Loops Are Non-Negotiable

Before committing, ALL feedback loops must pass:

| Feedback Loop | What It Catches | Priority |
|---|---|---|
| Build/Compile | Syntax errors, type mismatches | MUST pass |
| Tests | Broken logic, regressions | MUST pass |
| Linting | Code style, potential bugs | SHOULD pass |
| Type checking | Type safety violations | MUST pass |

**DO NOT commit if any mandatory feedback loop fails.** Fix issues first, then commit.

> "Great programmers don't trust their own code. They build automations and checks to verify what they ship."

**For Tailnote (Xcode/Swift):**
- Build: `xcodebuild` must succeed
- Tests: Unit tests must pass
- SwiftLint: If configured, lint must pass
- Type safety: Compiler is the primary feedback loop

### Rule 4: Track Your Progress

Between iterations, maintain a progress file so the next cycle has full context.

**What to track:**
- Tasks completed and which plan item they reference
- Key decisions made and reasoning
- Files changed
- Blockers encountered
- Notes for the next iteration

**Keep entries concise.** Sacrifice grammar for brevity — this is for the agent, not humans.

**Cleanup:** Progress files are session-specific. Delete after the sprint is complete.

### Rule 5: Prioritize Risky Tasks First

Without guidance, agents pick easy wins. Force the hard stuff first:

| Priority | Task Type | Why |
|---|---|---|
| 1 (HIGH) | Architectural decisions & core abstractions | Cascades through entire codebase |
| 2 (HIGH) | Integration points between modules | Reveals incompatibilities early |
| 3 (HIGH) | Unknown unknowns / spike work | Better to fail fast than fail late |
| 4 (MED) | Standard features & implementation | Solid foundation makes these easy |
| 5 (LOW) | Polish, cleanup, quick wins | Can be done anytime |

**For Tailnote:** SSH/SFTP integration (risky) before UI polish (easy). Core data flow before edge case handling.

### Rule 6: The Codebase Always Wins

Instructions compete with existing code patterns. The agent sees two truth sources: your prompt vs. thousands of lines of existing code. **The codebase typically prevails.**

Implications:
- Keep the codebase clean BEFORE running loops
- Agents amplify what they see — poor code leads to poorer code
- Existing patterns will be replicated, good or bad
- Fix bad patterns early; they compound fast

### Rule 7: Ask What Capability Is Missing

When something fails, DON'T just "try harder." Ask:

> "What capability is missing, and how do we make it legible and enforceable?"

- Build missing tools, helpers, abstractions
- Add documentation for missing context
- Create test utilities for untestable code
- Promote conventions into code/compiler enforcement

---

## Two Operating Modes

### HITL Mode (Human-In-The-Loop)

Run once, watch, intervene. Best for:
- Learning how the agent handles your codebase
- Refining prompts and feedback loops
- Risky architectural work
- Early project phases

### AFK Mode (Away From Keyboard)

Run in a loop with iteration cap. Best for:
- Bulk implementation work
- Low-risk tasks on solid foundation
- Test coverage improvement
- Code cleanup and linting fixes

**Progression:** Always start HITL → build confidence → transition to AFK.

**Iteration Caps:** Always limit iterations (5-10 for small tasks, 30-50 for larger ones). Never run infinite loops with probabilistic systems.

---

## Loop Variants

### Standard Feature Loop
```
Read plan → Pick task → Implement → Test → Commit → Repeat
```

### Test Coverage Loop
```
Read coverage report → Find uncovered paths → Write tests →
Run coverage → Update report → Repeat until target reached
```

### Entropy/Cleanup Loop
```
Scan for code smells → Fix ONE issue → Verify build →
Document change → Repeat
```

### Linting Loop
```
Run linter → Fix ONE error → Re-run linter → Verify → Repeat
```

### Review Loop (Ralph Wiggum Loop from OpenAI)
```
Agent writes code → Agent reviews own changes →
Agent requests peer agent review → Agent responds to feedback →
Iterate until all reviewers satisfied
```

---

## Applying to Tailnote

### Feature Implementation Loop

When implementing a new Tailnote feature:

1. **Read** the relevant docs (`docs/`, `README.md`, existing module code)
2. **Check** `progress.md` for prior context (if exists)
3. **Choose** the highest-priority unfinished task
4. **Search** existing code for related implementations
5. **Implement** in the correct architectural layer:
   - Models → pure data types
   - Services → business logic (SSH, file operations)
   - ViewModels → state management
   - Views → SwiftUI presentation
6. **Build** to verify compilation
7. **Test** to verify correctness (mock-first when needed)
8. **Commit** with descriptive message
9. **Update** progress tracking
10. **Next** task or stop

### Quality Standards for Tailnote

```
This is a production iOS app. Quality expectations:
- Protocol-driven services for testability
- Typed errors per domain (SSHError, FileError, etc.)
- Parse SSH/SFTP responses into strict Swift types at boundaries
- Views are pure renderers — no business logic
- Every public API has a clear contract
- Mock implementations exist for every service protocol
```

### Risk Priority for Tailnote

1. SSH/SFTP connection & authentication (HIGH — core dependency)
2. File system operations over SFTP (HIGH — integration point)
3. Reconnection & error recovery (HIGH — unknown unknowns)
4. Markdown parsing & rendering (MED — well-understood domain)
5. UI features & navigation (LOW — straightforward SwiftUI)
6. Visual polish & animations (LOW — can be done anytime)

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Better Approach |
|---|---|---|
| Implementing multiple features per loop | Context rot, lower quality | One thing per loop |
| Skipping feedback loops to go faster | Broken code compounds | Always validate before commit |
| Starting with easy tasks | Hard tasks get harder over time | Risky tasks first |
| Not tracking progress | Agent wastes tokens re-exploring | Maintain progress.md |
| Assuming code doesn't exist | Creates duplicates | Always search first |
| Running infinite AFK loops | Probabilistic systems drift | Set iteration caps |
| Placeholder/minimal implementations | Tech debt compounds instantly | Full implementations or nothing |
| Ignoring existing patterns | Fighting the codebase | Read and follow existing conventions |

---

## Recovery When Things Break

When you wake up to a broken codebase:

1. **Assess**: `git log` to see what happened, `git diff` to see damage
2. **Decide**: Can it be fixed forward, or reset with `git reset`?
3. **Fix forward** if possible — craft a targeted prompt to repair
4. **Reset** to last known good commit if damage is extensive
5. **Learn**: What capability was missing? Add it to prevent recurrence

> "Any problem created by AI can be resolved through a different series of prompts."

---

## Prompt Template for Ralph Loop

When running a Ralph loop, the agent prompt should include:

```
Context files: [plan file] [progress file] [relevant specs]

1. Read the plan and progress files
2. Decide which task has the HIGHEST priority — not necessarily the first
3. SEARCH the codebase before implementing anything
4. Implement ONE task fully (no placeholders, no shortcuts)
5. Run ALL feedback loops (build, test, lint)
6. Fix any failures before committing
7. Commit with a descriptive message
8. Update progress tracking
9. If all tasks complete, STOP. Otherwise, continue to next task.

DO NOT implement placeholder or minimal implementations.
DO NOT assume something doesn't exist without searching.
DO NOT commit if feedback loops fail.
DO NOT work on more than one task per iteration.
```
