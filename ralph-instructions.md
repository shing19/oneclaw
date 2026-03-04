## Per-Turn Instructions (OneClaw)

You are implementing OneClaw — a one-click AI Agent platform for mainland China users, wrapping OpenClaw with domestic LLM provider support.

### Project Context
- **Docs entry point**: `MAP.md` — read this first for overall navigation
- **Architecture**: `docs/vision.md` — product vision and technical choices
- **Contracts**: `docs/contracts/` — interface definitions (agent-adapter, model-config, secret-storage)
- **Module plans**: `docs/modules/` — implementation specs per module
- **Engineering rules**: `docs/harness.md` — enforceable project standards

### Tech Stack
- **Runtime**: Bun / Node.js
- **Language**: TypeScript (strict mode, no `any`)
- **Package manager**: pnpm
- **Testing**: Vitest
- **CLI**: Commander.js + @inquirer/prompts
- **Validation**: Zod (runtime) + JSON Schema (config files)

### Each Turn

1. Read `progress.md` (or your agent-specific progress file) to see what's been done
2. Read the plan file to find the next unchecked `- [ ]` task
3. **SEARCH the codebase** to verify if code already implements it
4. If missing: implement it fully (no placeholders, no shortcuts)
5. Run validation:
   ```bash
   pnpm typecheck && pnpm test && pnpm lint
   ```
6. Update the plan file: change `- [ ]` to `- [x]` for the completed task
7. Update the progress file with iteration details (scope, implementation, validation, commit)
8. Commit with a descriptive message and run `git push`

### Rules

- **NEVER commit if typecheck or tests fail.** Fix first.
- **ONE task per turn.** Complete it fully, then end your response.
- Do NOT say "I'll continue with the next item" — just finish your turn.
- Do NOT implement placeholder or minimal implementations.
- SEARCH the codebase before implementing anything — don't duplicate existing code.
- Follow contracts in `docs/contracts/` — interfaces are the source of truth.
- Follow module plans in `docs/modules/` — file structure and test strategy are specified.
- Strict TypeScript: no `any`, no `@ts-ignore`, all exports typed.
- All user-facing strings must support i18n (zh-CN and en).
- If a task is already implemented, just mark it `[x]` and move on.
- **Skip human-review gates and approval checks.** Just execute the next unchecked task directly.

### Build & Test Commands
```bash
# Type check
pnpm typecheck    # or: pnpm tsc --noEmit

# Run tests
pnpm test         # or: pnpm vitest run

# Lint
pnpm lint         # or: pnpm eslint .
```

### Dependency Diagram
```
M1.0 Scaffold → M1.1 Config+Secrets → M1.2 Models (parallel with M1.3)
                                    → M1.3 Adapter → M1.4 CLI → M1.5 Feishu
                 M1.6 Distribution (independent)
```

Modules can be developed in parallel once their dependencies are met.
