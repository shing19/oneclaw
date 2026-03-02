---
name: harness-engineering
description: Harness Engineering architectural decision guide based on OpenAI's agent-first engineering principles. Use this skill when making architectural decisions, designing new modules, choosing technology approaches, structuring code, or when unsure how to proceed with design choices. Provides a framework for maximizing agent-code collaboration quality.
---

# Harness Engineering: Architectural Decision Guide

This skill provides a decision-making framework based on OpenAI's "Harness Engineering" principles (from their article "Harness engineering: leveraging Codex in an agent-first world"). Apply these principles when designing architecture, making technology choices, structuring code, or facing uncertainty in the Tailnote project.

## When to Use This Skill

- Designing a new module or feature architecture
- Choosing between technology approaches or libraries
- Structuring code for maintainability and agent-legibility
- Facing uncertainty about how to organize or implement something
- Reviewing code for architectural coherence
- Deciding whether to use a library vs. build in-house

## Core Philosophy

> "Humans steer. Agents execute."

The goal is to build environments, specify intent, and create feedback loops that enable reliable, high-quality work. When something fails or is unclear, ask: **"What capability is missing, and how do we make it both legible and enforceable?"** — not "try harder."

---

## The 5 Principles

### Principle 1: What Can't Be Seen Doesn't Exist

**All decisions, context, and knowledge must live in the repository.**

- Push every decision into the repo as markdown, schemas, or structured docs
- If a design decision was made in a conversation, it must be written into `docs/` to be actionable
- Create self-contained documents that provide enough context for end-to-end implementation
- Avoid relying on external knowledge sources (Slack threads, Google Docs, people's heads)

**Apply to Tailnote:**
- Architecture decisions → `docs/` directory
- Module interfaces and contracts → code comments or dedicated docs
- Product specs → `docs/` with clear acceptance criteria
- Tech research → `docs/TECH-research.md` (already exists, keep it updated)

### Principle 2: Ask What Capability Is Missing, Not Why the Agent Is Failing

**When something goes wrong, instrument the environment — don't just debug the output.**

- Reframe failures: "What capability is missing?" instead of "Why did this fail?"
- Build missing tools, helpers, and abstractions rather than working around limitations
- Favor **stable, well-documented, "boring" technology** — API stability and strong documentation make behavior more predictable
- Sometimes it's cheaper to reimplement a focused subset than to fight opaque upstream behavior

**Apply to Tailnote:**
- Prefer well-documented Swift libraries with stable APIs (e.g., SwiftNIO ecosystem)
- When a library is opaque or poorly documented, consider building a focused wrapper or subset
- Build shared utilities with clear interfaces rather than scattered one-off implementations
- Example: if an SSH library is unreliable, build a focused abstraction layer rather than scattering workarounds

### Principle 3: Mechanical Enforcement Over Documentation

**Encode constraints into code, not just docs. If it can be checked programmatically, it should be.**

- Use strict types and compile-time checks rather than runtime conventions
- Define clear architectural layers with enforced dependency directions
- Validate data shapes at boundaries (parse, don't validate)
- Custom linters > style guides. Compile errors > code review comments.

**Apply to Tailnote — Layered Architecture:**

```
Types → Models → Services → ViewModels → Views
```

- **Types/Models**: Pure data structures, Codable, no business logic
- **Services**: Business logic, SSH/SFTP operations, file management
- **ViewModels**: State management, bridge between services and views
- **Views**: SwiftUI presentation layer only

**Rules:**
- Views NEVER import Services directly — always go through ViewModels
- Services NEVER reference SwiftUI or Views
- Models are pure value types with no dependencies
- Dependency direction flows forward only: Types → Models → Services → ViewModels → Views

### Principle 4: Give the Agent Eyes (Observability & Feedback Loops)

**Make the system's behavior visible and measurable.**

- Build feedback loops that enable verification of work
- Make vague requirements into concrete, measurable criteria
- Ensure changes can be validated against acceptance criteria
- Test coverage serves as a feedback loop — if it can't be tested, reconsider the design

**Apply to Tailnote:**
- Every feature should have clear acceptance criteria in the task description
- Write testable code: separate pure logic from side effects (SSH I/O)
- Use protocol-based abstractions so components can be tested with mocks
- "SSH connection should reconnect within 3 seconds" > "handle reconnection"

### Principle 5: A Map, Not a Manual

**Provide concise navigation, not exhaustive documentation.**

- Short entry point (like AGENTS.md ~100 lines) as table of contents
- Progressive disclosure: start with overview, link to details
- Architecture docs should tell you "what lives where" and "what does NOT belong here"
- Constraints ("X does not exist in this layer") are more valuable than long descriptions

**Apply to Tailnote:**
- `README.md` → project overview and quick start
- `docs/TECH-research.md` → technology decisions and rationale
- Each module should have a brief header comment explaining its boundary
- Negative constraints are powerful: "This module does NOT handle UI state" or "This service does NOT directly access Keychain"

---

## Decision Framework

When facing an architectural decision, run through this checklist:

### 1. Is it legible?
- Can someone (or an agent) understand this from the repo alone?
- Is the rationale documented, not just the result?

### 2. Is it enforceable?
- Can this constraint be checked by the compiler, tests, or linters?
- If it's only a convention, can we promote it to code?

### 3. Is it boring?
- Are we using stable, well-documented technology?
- Are we avoiding "clever" solutions that sacrifice readability?
- Would a new team member understand this without tribal knowledge?

### 4. Is it bounded?
- Does each module have a clear boundary?
- Are dependency directions explicit and one-way?
- Can you state what this module does NOT do?

### 5. Is it composable?
- Can this be tested in isolation?
- Does it depend on abstractions (protocols) rather than concrete types?
- Can it be replaced without ripple effects?

---

## Anti-Patterns to Avoid

| Anti-Pattern | Better Approach |
|---|---|
| Giant instruction file with everything | Short map + deep linked docs |
| Relying on conventions ("we always do X") | Enforce with types/compiler/tests |
| Using a complex library for a simple need | Build a focused, tested helper |
| Scattering workarounds for a library bug | Build an abstraction layer |
| Mixing layers (View calls Service directly) | Respect layer boundaries strictly |
| Documentation that duplicates code | Document intent and boundaries, not implementation |
| Fixing symptoms without understanding cause | Ask "what capability is missing?" |

---

## Entropy Management (Garbage Collection)

Code quality degrades over time. Combat this with:

1. **Golden Principles**: Opinionated rules that keep codebase consistent
   - Prefer shared utilities over hand-rolled helpers
   - Validate at boundaries, trust internal types
   - Structured naming conventions for files, types, and functions

2. **Continuous Cleanup**: Small, frequent refactors > big rewrites
   - Technical debt is a high-interest loan — pay it down continuously
   - When you see a bad pattern, fix it now rather than letting it spread

3. **Taste Feedback Loop**: Capture quality standards in enforceable forms
   - Review comments → documentation updates → tooling enforcement
   - When documentation falls short, promote the rule into code

---

## Tailnote-Specific Conventions

Based on the project structure (SwiftUI iOS app with SSH/SFTP):

- **Module isolation**: Each module in `Modules/` should be independently testable
- **Mock-first development**: MockData exists for every service interface (already in place)
- **Protocol-driven**: Services behind protocols enable testing and future replacement
- **Boundary parsing**: Parse SSH/SFTP responses into strict Swift types at the network boundary
- **Error handling**: Typed errors per domain (SSHError, FileError, etc.), not generic Error
- **State management**: ViewModels own state, Views are pure renderers
