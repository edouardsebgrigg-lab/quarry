# Work log

One short entry per task, newest at the top: the task, the agent and branch, the commit on
`main`, what changed, what was actually run, and what wasn't verified. Older, longer reports
are in `docs/archive/CODEX-CHECKPOINT.md`.

## 2 October 2026 · Clean-up after the merge into main (Claude, `claude/cleanup`)

- Removed unused imports, variables and constants across the code (no behaviour change), added
  `npm run lint` (ESLint: undefined names, unused and unreachable code) and made it pass.
- Added `docs/handover/browser-checks/smoke.mjs`, a quick whole-game check, and removed the
  stale Step 7 `verify.mjs` it replaces.
- One rulebook for every agent in `AGENTS.md` (Claude reads it through `CLAUDE.md`), a fresh
  short `docs/TASKS.md`, this log; old handoffs, checkpoints and queues moved to
  `docs/archive/`. README reorganised so the later additions sit in their sections.
