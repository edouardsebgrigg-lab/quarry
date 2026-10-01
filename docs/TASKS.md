# Quarry task queue

Claude plans and reviews; Codex implements. **Claude is the only one who edits this file**, on
the branch `claude/coordination`. Codex reports progress in `docs/CODEX-CHECKPOINT.md` on its own
branch.

- **Queue updated:** 1 October 2026 (overnight pass)
- **Last Codex commit reviewed:** `7ddb43d` (T11) on `codex/step-7-safety-and-yard-buildings`
- **Codex works on:** `codex/step-7-safety-and-yard-buildings`. After T11 that one branch holds everything; keep using it
- **`main`:** on 1 October Edouard had everything merged into `main` (a fast-forward to the overnight pass, which includes PR #1). `main` is now the playable game; work still happens on the branches above, and only Edouard merges into `main`

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

## Areas Claude is working on (don't edit these)

Claude is running a polish loop (`docs/POLISH.md`) and owns, until it says otherwise: the laptop
and its apps (`src/ui/game/shop.js`, `market.js` and the new `src/ui/game/laptop/`), the HUD,
settings and menus, `src/audio/`, `blender/`, `assets/models/`, and the renderer and weathering
files. For your tasks: add buildings through `data/buildings.json` and `src/buildings/` (the
laptop lists them from the data), keep new UI you need in a new file, and say in your checkpoint
what Claude should wire into the laptop.

New game systems Claude added in the loop (they arrive with your next merge; build on them,
don't duplicate them): the laptop (B and M now open its dealer and prices apps; the old
`shop.js` is gone), a bank with loans and a statement (`src/economy/bank.js`), a logbook of
per-machine work, daily summaries and messages (`src/game/logbook.js`), a jobs board of
delivery contracts (`src/contracts/`, `data/contracts.json`), a mobile mechanic call-out
(`src/machinery/mechanic.js`), decals on the machines (`src/world3d/decals.js`) and site-plant
reversing alarms, weather with a forecast (`src/weather/`), a weekly report, and market news
(`src/economy/news.js`: local stories push one material's price up or down for a few days;
`currentPrice` and `quoteSale` include it, so anything pricing a load already follows it), and
regular customers (standing orders in `src/contracts`: from reputation 4, a weekly quota of one
clean material; a clean sale counts toward whichever is due first, a board job or this week's
quota, so T6 stockpile tips must stay out of `productSold` as already noted), and a bank credit
rating (`creditRating` in `src/economy/bank.js`: it moves each morning, so a test that checks
an exact borrowing limit or loan rate after days pass should pin `state.bank.credit`). For T6 (stockpiles): a load tipped into a bay is not a sale, so it shouldn't
emit `productSold` (contracts count sales).

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

## Overnight pass (Claude, 1 October 2026)

Built on `7ddb43d` (T11), so it has everything. Edouard asked for deeper, more rewarding
gameplay and a better look while he slept.

**Review of T11 (`7ddb43d`):** a clean sync, as asked. Nothing to fix.

**Added (commit `15274c2`):**
- **T8 done:** the goal "Build a ramp or a haul road" comes after the first trailer sale (any
  works count, so a level area, which needs no gravel, is always possible). The price check is
  in `pacing.test.js`: a 20 m road, a 15 m ramp and an 8 m level area cost $140, $140 and $58,
  against $200 for a full trailer of clean topsoil. No change to `works.json` was needed.
- **Goals, chapter 2:** after "Get a better machine", six more goals walk the player into
  systems that were only on the laptop: a job from the jobs board, a yard building, 300 t of
  clean material, reputation 3, a Used digger plus a Used road vehicle, and $15,000 earned.
  22 goals in all now.
- **Milestones and perks (`src/career/`, `data/milestones.json`):** 25 achievements in any
  order (selling, digging, building, business), each paid once, with the counters nothing else
  kept (clean loads in a row, gravel dug, road metres, rain loads, best day, loans cleared).
  Three perks: depot account (+4% on clean loads), fuel card (-10% diesel), trade account (-5%
  at the dealer). `perks.js` imports nothing; prices ask it (`dealerPrice`,
  `fuelPerkMultiplier`, `cleanSaleBonus`). A Milestones app on the laptop, a toast, a chime and
  a line in Messages. Old saves catch up on their first event.

**Added later the same night:**
- **N2 Things that happen (`src/happenings/`, `data/happenings.json`, `16c756e`):** the
  design spec's random events, as decisions. The council's site inspector (once you have three
  machines, every 8 to 13 days, announced the day before) fines each broken or sub-40% machine
  $60 at 10:00, or lifts reputation by 0.5 if all are above 70%. Rush jobs (after your first
  job): 80% of the tonnes, due tomorrow, double bonus, open today only (`postRushOrder` in
  `src/contracts`). Dealer's offers: 15% off one machine you don't own for three days.
  `machinePrice` in `src/machinery` combines the offer and the trade account; use it for any
  machine price. Rain, price booms and fuel spikes already exist as weather, news and fuel drift.
- **V1 Farmsteads (`src/world3d/farms.js`, `3cd359c`):** four farms beside the lanes (house,
  barn, silo, bales, yard, a track to the road through a hedge gap), levelled ground, on the map.
- **Laptop home:** a "Coming up" card (inspection and the fine as things stand, the dealer's
  offer, a rush job, the closest milestone).
- **Pacing:** `pacing.test.js` checks early milestone rewards stay under a quarter of the machine
  ladder ($290 of $1,560).
- **Browser checks:** `CHROMIUM_ARGS='["--in-process-gpu"]'` in `common.mjs`. Where I worked,
  SwiftShader's separate GPU process stalled after a teleport (frames stopped, CPU idle); in
  process it's fine. New checks: `milestones.mjs`, `happenings.mjs`.

**For Codex:** after your next merge, tests that check exact money must turn milestones off
(`data.milestones.list = []`), as the bank, planner and earthworks tests now do, or a reward
lands mid-test. New buildings in `data/buildings.json` count toward the "Fitted out" milestone
automatically. Loads tipped into a stockpile bay (T6) aren't sales, so they won't count toward
milestones either, which is right.

**Checked:** my own copy of the test runner (Vitest itself couldn't be installed where I
worked): 208 tests pass at the end of the night; the 8 truck and pickup driving tests need the real Rapier, which I
couldn't load, and that code is untouched. `npm run build` was **not** run, for the same
reason; every changed file loads in the browser (`docs/handover/browser-checks/milestones.mjs`,
screenshot checked, no page errors). **Codex: run `npm test` and `npm run build` after your merge
and say in your checkpoint if anything fails.**

**Still open from earlier reviews:** the `worksBuilt` event carries a function
(`touchesChangedCell`); make it plain data when T9 is in that code. `main` now has everything (merged
at Edouard's request on 1 October).

**Needs Edouard:**
- Play the first ten minutes with a real mouse and say what felt wrong (the biggest gap, as before).
- Judge T10 (rusty vs used paint) in the game.

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
- T11 one working branch (`7ddb43d`)
- T8 a goal for roads and ramps, and the price check: done by Claude (`15274c2`)

## Tasks

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

### T10: Rusty and used look different: DONE BY CLAUDE (ready to judge)
The weathering shader now recognises the refined fleet's `Review_` materials and adds a lighter
layer on top of their painted wear (`src/world3d/weathering.js`, `BAKED_TIERS`): rusty machines
get grime, broad rust patches, streaks and chips; used ones a light fade and dirt; tyres stay
dark. In-game shots on "high" are in `docs/handover/screenshots/graphics/`. Edouard and Claude
judge by eye; tune the numbers in `BAKED_TIERS` rather than the textures. Don't change the
weathering, renderer or ground material files without a task.

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

### T8: A goal for roads and ramps, and a price check: DONE BY CLAUDE (see the overnight pass)
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
