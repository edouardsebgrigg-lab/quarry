# Quarry task queue

Claude plans and reviews; Codex implements. **Claude is the only one who edits this file**, on
the branch `claude/coordination`. Codex reports progress in `docs/CODEX-CHECKPOINT.md` on its own
branch.

- **Queue updated:** 30 September 2026
- **Last Codex commit reviewed:** `d0b4e15` on `codex/step-7-safety-and-yard-buildings`
- **Codex works on:** `codex/step-7-safety-and-yard-buildings` (keep using it)

## How to work the queue

1. At the start of every session: `git fetch origin`, then `git merge origin/claude/coordination`
   into your branch. It only carries this queue, review notes, test scripts and small reviewed
   fixes. If it ever conflicts, keep both sides' intent and say so in your checkpoint.
2. Take the **first task not marked done** in your checkpoint, in order. Finish it before
   starting the next. If a task is unclear, choose the simplest sensible reading, note the choice
   in your checkpoint, and carry on. Don't stop to ask.
3. One commit per task at least, with the task ID first in the message, e.g.
   `T2: footprint-based obstacle check for earthworks`.
4. Before every push, run `npm test` and `npm run build`. Both must pass. Browser checks are
   bounded (see "Browser checks" below).
5. Push only to your own branch with `git push -u origin <your branch>`. Never push to `main` or a
   `claude/*` branch, never merge into `main`, never force-push, and don't open pull requests.
6. After each task, update `docs/CODEX-CHECKPOINT.md`: a "Ready for review" list naming each task
   ID, its commit SHA, what changed, what was **actually run** (tests, build, browser) and what
   was not verified. Honest "not verified" beats a vague "passed".
7. Stop when the queue is done, or after three tasks (a sync task like T1 doesn't count),
   whichever comes first, and leave the branch pushed and the checkpoint current so Claude can review.

Project rules that still hold (see `README.md`, `docs/modules.md`, `docs/implementation-plan.md`):
game logic stays separate from the 3D and UI code (logic emits events; the UI and world react);
all balance numbers go in `data/*.json`; player actions go through `game.actions.*`; new saved
state must load from old saves (default it, or add a migration in `src/core/migrations.js`);
update `README.md` controls and `docs/modules.md` when behaviour or modules change; nothing is
created from nothing (material is conserved).

## Browser checks

Scripts are in `docs/handover/browser-checks/` (`common.mjs` has the shared setup; `verify.mjs`,
`ramps.mjs` and your `checkpoint.mjs` are good templates). Software rendering is slow: use a
320×180 viewport, count frames rather than wall-clock time, and wrap every run in
`timeout 600 node …`. Restart the test dev server after code changes (its config has
`watch: null`). Kill processes by PID or from a script file; `pkill -f <pattern>` typed on a
command line that contains the pattern kills your own shell. Say in reports that the pointer
lock is stubbed and aim is set by code.

## Review notes on `d0b4e15`

Good: the heap-distance fix (`eligible` in `gatherLoose`), the finite-width check, site-scoped
fuel and maintenance multipliers, re-checking obstacles on confirm, and the honest checkpoint.

**R1 (must fix, T2):** the player now counts as an obstacle and `clearance` went from 3 to 6 m,
so you must stand more than about 8.4 m from a 4 m road's centre line before it can be built.
People plan standing at the start post, so almost every build shows red, and the message reads
"You is in the way: move it first". The 6 m clearance also blocks machines that a flat road's
real edits never reach (on flat ground the side batter is only a fraction of a metre wide).

**Already done on `claude/step7-verification` (merged by T1):** browser save and reload with
Continue, level area, clock on blur and hidden window, pickup on a reloaded ramp, dumper and
tractor with trailer up both ramps, and a planner fix (the build click works wherever you
look). See the "Verification pass" in `docs/HANDOVER.md`. Remove those from your "outstanding"
list after merging.

## Tasks

### T1: Sync with the coordination branch
Merge `origin/claude/coordination` into your branch. (Claude trial-merged the verification work
into `d0b4e15`: clean, 145 tests passing.) Update the outstanding list in your checkpoint.
**Done when:** merged, `npm test` and `npm run build` pass, pushed.

### T2: Earthworks obstacles by real footprint (R1)
- The ground's plan should say which cells it changes (it already builds a job list). Expose a
  cheap way to ask whether a circle `{ x, z, r }` touches any changed cell, and check obstacles
  against that, not against `width / 2 + clearance`. Remove or shrink `clearance` in
  `data/works.json` to a small margin (for example 0.5 m).
- Machines and the barrow still block when they touch changed cells.
- The player does **not** block. After a build, if the player's feet are over changed cells,
  put them back on the new surface (`player.teleport(x, heightAt(x, z) + 0.1, z)`) so they're
  never left inside raised ground.
- Fix the wording: no "You is in the way" anywhere.
**Done when:** unit tests show (a) standing 1 m from a 4 m road's edge doesn't block it, (b) a
machine parked 3 m from a flat road's edge doesn't block, (c) a machine on a cell the build
changes does block, and (d) a refused build changes no money or material. A bounded browser
check builds a road while standing at its start post, and the player ends on the surface.

### T3: Mini digger on the ramps
`docs/handover/browser-checks/ramps.mjs` phases T3 and T4 never finished: the 600 s limit hit
during the mini digger's first drive up the 17% ramp, which was far slower than the dumper,
pickup and tractor. Find out why. It may be the digger's track speed or slope handling, or the
test driving it the wrong way (`setKeys` with the digger in Assisted mode, or the yaw
convention). Run just those phases with a longer limit.
**Done when:** the mini digger climbs both ramps in the browser, or the cause is found and
fixed with a unit test. If it's a genuine limit (too steep for a mini digger), make the game
say so rather than crawl, and document it.

### T4: Paint before and after
The "before" shots are in `docs/handover/screenshots/paint/`. They were taken just before the
paint pass (commit `b16c01e`) with `docs/handover/browser-checks/capture.mjs` (`TAG=before`).
Run the same script with `TAG=after` on your current branch (same views, 960×540 shots) and
commit the five `after-*.png` files next to them. Add a short note in your checkpoint: what
differs, and anything that looks wrong (flat single colour, too pale, too dark, missing
texture).
**Done when:** ten images side by side in that folder and the note written. Don't change the
paint in this task.

### T5: The opening loop with real controls and normal money
The fresh-save loop has never been measured: dig by hand, fill the barrow, load the pickup,
drive to the depot, weigh in, sell, then buy the first machine. Use
`docs/handover/browser-checks/opening.mjs` (unrun; it has hard-coded paths). No dev money and no
forced shortcuts except those the script marks. Record game-clock times to the first sale and
the first machine, and any point where a new player would get stuck.
**Done when:** times recorded in your checkpoint, or the exact blocker with steps to reproduce if
software rendering makes it impractical. Fix any defect that blocks the loop.

### T6: Step 8b: stockpile bays at the home yard
The design's "hold or sell" choice (`docs/design-spec.md`: yard stockpile with a limit).
- Buy once per site, like the workshop, from the Yard buildings shop tab. Fixed bays in the
  yard (three is enough), each with a capacity in tonnes in `data/buildings.json`.
- A carrier backed up to a bay and tipped (T) puts its load in the bay. Contents are tracked
  per material, and mixing lowers purity the same way the depot grades loads.
- Take material out with a digger bucket over the bay (reuse the dig and dump path), so it can
  be loaded into a truck later when the price is better.
- Contents are saved and loaded (with a default for old saves). A heap in each bay grows and
  shrinks with its tonnes, and the map shows what's in each bay.
- Material is conserved in and out. A full bay refuses with a clear reason.
**Done when:** unit tests cover conservation, capacity, purity and save/load; a bounded browser
check tips a load in and digs a bucket out; README and modules docs updated.

### T7: Step 8c: home weighbridge
Buying it lets you weigh in at home: the ticket then counts at the depot, so you drive straight
to the bays. The depot weighbridge still works as now. Show the load and its quote when you
weigh at home.
**Done when:** unit tests for ticket validity (one ticket per load; tipping on your field clears
it), the shop entry, and a bounded browser check. Docs updated.

### T8: A goal for roads and ramps, and a price check
Add an objective after the first machine: build a haul road or ramp (the `worksBuilt` event
exists). Check that works prices sit sensibly against early income, and adjust
`data/works.json` if a 20 m road costs more than about one good load sells for. Extend
`src/progression/pacing.test.js` if the ladder changes.
**Done when:** the goal appears in order with a mentor message, tests pass, and the pacing test
still holds.

## Not now (and why)

- Better site office: needs operators (Milestone 2)
- Security fence and gate: needs random events (Milestone 3)
- Screener and crusher: need graded products (Milestone 4)
- Floodlights: the game has no night yet. Wash bay: nothing makes machines dirty or penalises
  mud on the road yet. Each needs its system designed first; Claude will add tasks when it is
- Standard, Heavy and Mega machine tiers: Milestone 4
- Touch controls and phone play: a separate batch, not planned yet
