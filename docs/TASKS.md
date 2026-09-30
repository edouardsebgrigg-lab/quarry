# Quarry task queue

Claude plans and reviews; Codex implements. **Claude is the only one who edits this file**, on
the branch `claude/coordination`. Codex reports progress in `docs/CODEX-CHECKPOINT.md` on its own
branch.

- **Queue updated:** 30 September 2026 (third review)
- **Last Codex commit reviewed:** `fbf0885` on `codex/vehicle-model-integration` (and `0db19b6` on `codex/step-7-safety-and-yard-buildings`)
- **Codex works on:** `codex/step-7-safety-and-yard-buildings`. After T11 that one branch holds everything; keep using it

## How to work the queue

1. At the start of every session: `git fetch origin`, then `git merge origin/claude/coordination`
   into your branch. It only carries this queue, review notes, test scripts and small reviewed
   fixes. If it ever conflicts, keep both sides' intent and say so in your checkpoint.
2. Take the **first task under "Tasks"** that isn't done, in the order listed (IDs aren't always in number order). Finish it before
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

## State of the game (Claude's review, 30 September 2026)

**Built and working:** the hand-dig start (shovel, barrow, pickup), real deformable ground with
layers and slumping, selling at the depot over the weighbridge, five machine types in two tiers
with Assisted and Direct digger controls, a tractor and trailer that behaves like one, the
mentor and guide markers, a time gate that only runs the clock while you're playing, haul
roads, ramps and level areas that conserve material, and the first two yard buildings. 165
unit tests, a clean build, and a set of bounded browser checks.

**The biggest gaps, in order:**
1. Nobody has measured the opening loop with normal money (T5). It's the first ten minutes of
   the game and the most important thing to get right.
2. The game has never been played with a real mouse and pointer lock by the checks; everything
   automated uses a stubbed pointer lock. Edouard playing a session and noting friction is worth
   more than another automated check.
3. Yard buildings (Step 8) are only started: stockpiles and the home weighbridge are the ones
   that change how you play.
4. Balance: works prices, building prices and machine prices are provisional (T8).
5. Download: 37 MB of models plus a 5 MB script. Fine on broadband; slow on mobile data.

**Code health:** good. Logic is separate from the 3D, balance lives in `data/`, every module
is used, and tests cover the rules. Keep it that way: new systems need tests, data files and a
line in `docs/modules.md`.

**Done by Claude in this pass (on `claude/coordination`):**
- T12: textures re-encoded, models 72 MB to 37 MB, with a size-budget test
- The 3D code loads after the menu (menu script 120 KB instead of 5.2 MB), fetched in the
  background; the loading card shows download progress
- Graphics: soft shadows (medium and up), ambient occlusion on high and ultra (skipping
  see-through things so grass and glass don't cast boxes), a clearer sky, and the weathering
  shader now applies to the new models (rusty: rust patches, chips, grime; used: light fade
  and dirt). T10 is in progress with Claude: see its entry below
- Clean-up: an unused helper removed, docs updated

## Review notes on `fbf0885` (VEH1, the new vehicle models)

VEH1 was a batch Edouard asked for directly, so doing it before the queue was right, and
putting it on its own branch was sensible. Checked by Claude: `npm test` (161 passing in 21
files) and `npm run build` (passed) on `fbf0885`, the comparison sheets, and the model files.

Good: tyres and tracks are now dark rubber and steel (half of R3), the models have more detail,
the rigs and joint names are kept and guarded by tests, and the report is clear about what was
and wasn't checked.

**R4 (must fix, T12):** the models nearly doubled in size, from 38 MB to 72 MB. 47.5 MB of that
is PNG textures: 25 to 57 images per model, and each rusty/used pair carries its own copies.
Every player downloads all of it before the game starts.

**R5 (still open, T10 re-scoped):** in the comparison sheets the rusty and used versions look
almost the same, and "rusty" doesn't read as rusty (the rusty dumper is plain orange-brown).
The in-game shot `fleet-in-world.png` is 320×180 and covered by the HUD, so it shows nothing.

**Note:** the private preview site was built from a different baseline (158 tests, without the
T2 safety fixes). Don't update it unless Edouard asks; if he does, build it from the merged
branch after T11.

## Review notes on `0db19b6` (T1 to T4)

Checked by Claude: read the diff and your checkpoint, `npm test` (147 passing in 20 files) and
`npm run build` (passed) on `0db19b6`, and looked at the paint shots side by side. No browser
rerun by Claude this time. Stopping after T4 as the rules say was right.

Good: T1 clean. T2 is the right design (obstacles tested against the cells the grading really
changes, player lifted onto the new surface, better wording) with good tests and a browser
check. T3 found no game defect and made the script isolate phases; fine. The checkpoint is
honest and specific. Keep reporting like this.

**R2 (must fix, T9):** spoil and heap sourcing still ignore obstacles. The leftover spoil is
dropped 9.5 m beside the strip (or beyond an end) without checking what is there, so a parked
machine, the barrow or the player can end up buried in a heap; taking gravel from a heap can
also lower the ground under a machine parked on it.

**R3 (must fix, T10):** the paint pass went the wrong way for the rusty tier. In
`after-rusty-close.png` the rusty dumper's skip is pale cream and the trailer pale mint: they
read cleaner and newer than before, not rustier. Tyres and tracks everywhere are washed-out grey
instead of dark rubber and steel. The used tier barely changed. The original complaint was
machines looking like "one colour all the way round"; the aim is visible wear, not paler paint.

**Minor (do it while in the code, no separate task):** the `worksBuilt` event now carries a
function (`touchesChangedCell`). Events should stay plain data. Emit the changed cells' bounding
box or list instead, or have the world re-seat the player when the ground height under their
feet changed.

## Done

- T1 sync (`6cb0c6d`, `1f73751`)
- T2 earthworks obstacles by real footprint (`5645f29`, `69af721`)
- T3 mini digger on the ramps (`a13bb10`, `fbd0f06`): both ramps climbed in the browser
- T4 paint before and after (`fc33266`, `0db19b6`): shots in, but see R3 and T10
- VEH1 new vehicle models (`38af7d1`, `fbf0885` on `codex/vehicle-model-integration`): see R4 and R5

## Tasks

### T11: One working branch
`claude/coordination` now includes `codex/vehicle-model-integration` (merged by Claude), so the
normal start-of-session merge of `origin/claude/coordination` brings the new models into
`codex/step-7-safety-and-yard-buildings`. Just do that merge, run `npm test` and `npm run build`,
and push. Keep working on `codex/step-7-safety-and-yard-buildings`.
**Done when:** merged, both pass, pushed. (A sync task: it doesn't count toward the three.)

### T9: Spoil and heap sourcing respect obstacles (R2)
- Check the spoil spot's footprint (the heap's radius) against the same obstacles (machines,
  barrow) before choosing it. Try the other candidate spots in order; if none is clear,
  refuse the plan with a clear reason ("No room for the spare spoil: move <machine>").
- Don't take heap material from cells under a machine (skip them when gathering).
- If spoil lands where the player stands, lift them onto the new surface as T2 does.
- The plan, the card and the build must agree: the preview shows the spoil spot the build
  will use (a small marker is enough).
**Done when:** unit tests show a machine parked on the first spoil spot makes the build use
another spot (or refuse), a machine on a heap isn't undermined, and a refused build changes
nothing. Material still conserved.

### T12: Shrink the vehicle textures: DONE BY CLAUDE
Models went from 72 MB to 37 MB (`blender/compress_textures.py`, test in
`src/world3d/assetBudget.test.js`). It arrives with your next merge. Run the script after any
model rebuild.

### T5: The opening loop with real controls and normal money
The fresh-save loop has never been measured: dig by hand, fill the barrow, load the pickup,
drive to the depot, weigh in, sell, then buy the first machine. Use
`docs/handover/browser-checks/opening.mjs` (unrun; it has hard-coded paths). No dev money and no
forced shortcuts except those the script marks. Record game-clock times to the first sale and
the first machine, and any point where a new player would get stuck.
**Done when:** times recorded in your checkpoint, or the exact blocker with steps to reproduce if
software rendering makes it impractical. Fix any defect that blocks the loop.

### T10: Rusty and used look different: CLAIMED BY CLAUDE, skip it
Claude is doing this together with a general graphics pass on `claude/coordination`. Don't change
models, textures, `src/world3d/weathering.js`, `environment.js` or `groundMaterial.js` meanwhile,
to avoid conflicts.

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
