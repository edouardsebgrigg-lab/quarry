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
  `docs/archive/`. README reorganised so the later additions sit in their sections, and the
  module guide now lists every module and data file, with its notes grouped by system.
- Fixed the depot price board printing "Steadynull" in the Trend column (a `null` passed to
  `replaceChildren` becomes the text "null"); no other place in the UI does this.
- Checked: a save made by the pre-merge version (save v5, 9 days in, four bought machines)
  loads into the current game, splits the old tractor into tractor + trailer, plays three more
  days and saves again. Every laptop app opens in under 25 ms with no console errors.
- `smoke.mjs` also fails if a laptop app prints "null", "undefined" or "NaN"; checked that it
  fails on the old price board and passes on the fixed one. It passes on this branch
  (new game, shovelful, all ten apps, map, save and Continue, no console errors).
- Looked at (headless, software rendering, Low graphics): menu, intro, HUD, laptop dealer,
  home, jobs, staff, fleet, bank, prices, milestones, map, field, pickup cab and pause screen.
  Not checked by eye: driving, digging with machines, night, rain, sound, high graphics.
- Noticed, not fixed: a new game opens facing the low morning sun (the field lies the same way
  the sun rises), which whites out the top of the screen. Left as P-4 in `docs/TASKS.md`
  because the fix is a choice about start time, sun path or spawn view.
- Also noticed: frame cost rose about 13 to 35% with the merge (H-4) and the key hints overlap
  the goal card in very small windows (H-5).
