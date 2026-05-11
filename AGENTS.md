# Agent Instructions

## Project Context

See [PROJECT.md](PROJECT.md) for project-specific details (architecture, IdP config, attribute mappings, contacts, tech stack, and open questions).
See [WORKPLAN.md](WORKPLAN.md) for the current status, active checklist items, and the next logical slice of work.
If there are additional focused planning documents in the project root, such as `*_PLAN.md`, `*_CHECKLIST.md`, or `*_ROLLOUT_CHECKLIST.md`, read the relevant ones before making changes and keep them aligned with the work.
If `PROJECT.md` or `WORKPLAN.md` are missing, create them.

## Lessons Learned Protocol

A `LESSONS.md` file exists in the project root.

- **Read it** at the start of every session before making changes.
- **Append an entry** whenever: a bug took multiple attempts to fix, something behaved unexpectedly, you were corrected by the user, or a new convention was established.
- Follow the existing entry format. Append only — never edit or remove existing entries.
- Severity: 🔴 critical | 🟡 important | 🟢 nice-to-know

## Git Workflow

After each logical change, **ask the user if you should commit** and suggest a concise commit message describing the "why". Do **not** push to remote unless explicitly asked.

- Stage only the specific files that were changed (no `git add -A`)
- Do not commit without user confirmation

## Clean Code

- **Naming**: Names should reveal intent. No abbreviations unless universally understood (e.g. `id`, `url`). If you need a comment to explain what a variable holds, rename it instead.
- **Functions**: Do one thing. If a function needs "and" in its description, split it.
- **No magic values**: Extract unnamed numbers and strings into well-named constants.
- **DRY within reason**: Deduplicate when logic is truly shared. Three similar lines are fine — a premature abstraction is not.
- **Fail early**: Validate at the boundary, return/throw early, avoid deep nesting.
- **Delete dead code**: Don't comment it out. Git remembers.

## Conventions

- Document all config decisions in PROJECT.md as they are made
- Keep WORKPLAN.md updated with current status, completed slices, and next steps
- For larger efforts, create a dedicated `*_PLAN.md`, `*_CHECKLIST.md`, or `*_ROLLOUT_CHECKLIST.md` file instead of overloading PROJECT.md or WORKPLAN.md
- If the agreed direction changes, update the relevant markdown plan before continuing implementation
- After each logical slice, update the relevant plan or checklist so the next session can continue from the saved state
- Keep README.md up to date when code changes affect setup, architecture, or project structure. If there is no README.md, create one
