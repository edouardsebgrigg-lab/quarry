# Handover: Quarry, end of Step 7 (checkpoint, not finished)

Written for Codex, who continues on a **separate branch**. Nothing here has been merged. No PR was created.

- **Repository:** `edouardsebgrigg-lab/quarry`
- **Branch worked on:** `claude/quarry-mining-brainstorm-0yq0ww`; the verification pass below is on `claude/step7-verification` (branched from `a0fae6c`: docs, test scripts, and one small planner fix) (pushed; the exact tip SHA is in the final report of the handover message and in `git log -1` of this branch; this file is committed as the last commit)
- **Step 7 code was first pushed in:** `be75555` ("Step 7: plan and build haul roads, ramps and level areas"), on top of `128fbdc` (ground earthworks) and `b40d2b5` (time gate + map labels)
- **Plan:** `docs/implementation-plan.md` (Version 2). Steps 3–7 done. Next: step 8 (buildings). Machine tiers stay in Milestone 4

## What Step 7 is (built, on this branch)

Plan and build a **haul road**, a **ramp** or a **level area** on your own land. Press **F** on foot, click the start, click the end (a coloured strip shows the finished surface; green can build, amber can't afford, red invalid with the reason on a card), wheel = width, F again = road/ramp/level, right click = back then cancel, click a third time to build. Nothing is spent or changed until that last click.

| Piece | Files |
|---|---|
| Ground: the earth moving. `planWorks` / `buildWorks`: graded strip with side batters, cut then fill then gravel surface, extra gravel/fill only from loose heaps within 30 m, leftover spoil heaped clear of the strip, every tonne conserved; built cells are firm (no slumping) until dug; `cellBuilt`; saved with the ground | `src/ground/ground.js`, tests `src/ground/works.test.js` |
| Game level: modes, limits, price (`flat + ratePerM2 × area`), obstacles (machines, barrow), friendly reasons, charges money, emits `worksBuilt`, counts in `state.stats.works` | `src/earthworks/index.js`, `src/earthworks/earthworks.test.js`, `data/works.json`, `src/core/data.js`, `src/game/actions.js` (`planWorks`, `buildWorks`) |
| 3D planner: aim ray, points, width, preview mesh, posts, HUD card data | `src/world3d/planner.js`, `src/world3d/planner.test.js`, `src/world3d/index.js` (F action, obstacles, debug hooks `planner`, `aimAt`), `src/world3d/mouse.js` (`takeRightPressed`) |
| HUD + controls | `src/ui/game/hud3d.js` (works card, `plan` hint set), `src/ui/styles.css`, `src/input/bindings.js` (`works: KeyF`) |
| Mentor tip once you own a machine | `src/progression/mentor.js`, `data/objectives.json`, test in `src/progression/progression.test.js` |
| Docs | `README.md` (controls, "Building with material"), `docs/modules.md`, `docs/implementation-plan.md` |

Design decisions worth knowing: the road is cut down by the surface thickness (0.12 m) and topped with loose gravel, so it stays level with the terrain and needs about 14 t of gravel per 20 m × 4 m; ramps allow up to 18% (road 10%, level 0%); a ramp can be a trench cut out of the ground as well as a fill; heaps inside the works footprint are part of the cut and are never counted twice; digging or tipping onto a built cell clears its firm flag. The surface behaves as gravel for driving because the top material is gravel (`PLOT_SURFACE` in `world3d/index.js`); no new driving code. Labour prices are placeholders to balance.

## Results actually obtained

Run in this container, on the final tree:

- `npx vitest run`: **19 files, 135 tests, all passed**
- `npx vite build`: **succeeded** (large-chunk warning only, as before)

Browser smoke (headless Chromium, software rendering, **the pointer lock is stubbed** and the aim is set by look angles; key and mouse events are real DOM events on the canvas; frame-counted; scripts in `docs/handover/browser-checks/`):

| Check | Status |
|---|---|
| Open planner with F, prompts and card appear | passed (`works.mjs`) |
| Preview changes nothing (money, tonnes, height) | passed |
| Wheel changes width (0.5 m steps, limits); right click steps back, then cancels; cancelling loses nothing | passed |
| Invalid: too short, too long, edge of land, no gravel near, too steep, machine in the way, can't afford: clear reason, and a click can't build | passed |
| Build one road with real clicks: cost taken = plan cost, tonnes conserved, surface gravel, spoil message | passed (`works.mjs`) |
| Pickup drives the built road | passed (x 34 → about 68 m along it, real physics) |
| Ramp out of a pit (6.1%), built with real clicks, price = plan | passed (`works2.mjs`) |
| Pickup climbs the 6.1% ramp out of the pit | passed (y −1.16 → 0.12, reached the far end) |
| Steeper 16.9% ramp (points set directly, real confirm click), pickup climbs it | passed (y −1.13 → 0.16, reached the top) |
| Screenshots | `docs/handover/screenshots/works-*.png` (preview strip and card, road built, ramp preview, ramps built) |

### Verification pass (branch `claude/step7-verification`)

A follow-up run of `docs/handover/browser-checks/verify.mjs` on this code (same stubbed pointer lock and code-set aim; builds confirmed with a real left-click event on the canvas; driving uses the dev hook `setKeys`, the same held-key path as the keyboard):

| Check | Status |
|---|---|
| Build a road, a 6.1% ramp out of a pit, a 17.4% ramp and an 8 m level area, each confirmed with the click | passed: all four built, money taken = the planned price each time ($140, $196, $84, $68), total tonnes unchanged |
| Level area is flat | passed: 0 m spread over 15 points on the pad |
| Save to `slot1`, reload the page, Continue: money, heights, surfaces, built flags and works counts | passed within 1 mm: everything identical except one road height (−0.014 m before, −0.013 m after). Cause not confirmed: most likely a settle tick between the snapshot and the save (the clock was forced on) or Float32 rounding |
| Clock on the loaded game: before the click / playing / window blurred / focus back / tab hidden / 5 s more hidden / first 2 frames back | passed: 0 / 6 / 0 / 7 / 0 / 0 / 2 ticks (no catch-up jump). Blur and hidden were simulated by overriding `document.hasFocus` and `document.hidden` |
| Pickup up the gentle ramp in the reloaded game | passed: from the pit floor (−1.26 m) to the top (0.01 m) |
| Screenshot | `docs/handover/screenshots/verify-after-load.png` (the reloaded game: the ramp, the dumper at its top, and the mentor tip) |
| Tracked dumper up the steep ramp | passed: from the pit floor (−1.29 m) to the top (−0.07 m), reached the far end |

| Tractor with its trailer up the 6% ramp out of a pit (`ramps.mjs`) | passed: pit floor (−1.29 m) to the top (−0.01 m), reached the far end. Only the tractor's position was measured, not the trailer's |
| Tractor with its trailer up the 17% ramp | passed: −1.31 m to −0.11 m, reached the top |
| Mini digger on the ramps (`ramps.mjs` phases T3, T4) | not recorded: the run was still going when the session's time ran out |
| Paint before/after | not done: `capture.mjs` with `TAG=after` was queued after `ramps.mjs` but not reached. The "before" shots were taken earlier and are not in the repo |

Also found by the test and **fixed** on this branch: the confirming click only counted while the crosshair was on the ground, so looking at the sky and clicking did nothing, silently. Now, once both ends are set, the click builds wherever you look, and a click that misses the ground while setting an end says "Aim at the ground to set the end points" (`src/world3d/planner.js`, test in `planner.test.js`; 136 tests pass).

Not verified in a browser (the run was cut short after the ramp drives; the container session also ended):

- ~~Save, reload and persistence in the browser~~: done in the verification pass above
- ~~Level area in a browser~~: done in the verification pass above
- ~~The tracked dumper on a ramp~~: done in the verification pass above
- ~~Tractor and trailer on a ramp~~: done (verification pass above). The mini digger on a ramp is still not recorded
- The planner UI at real 1080p (screenshots were 960×540); the message log is moved up while planning (`body:has(.hud3d.planning) .log`) which is untested on browsers without `:has`
- Real pointer lock and real mouse aiming (the aim was set by code); the click that confirms is the third LMB, which is easy to double click by mistake
- Whether the spoil heap position (9.5 m beside the strip, else the other side, else beyond an end) is always convenient: a 22 m ramp cut leaves about 133 t of spoil in one heap

## Earlier items still open from the previous checkpoint (do not call them passed)

- **Fresh-save opening loop with real controls and normal money** (dig, barrow, pickup, depot, sell): `docs/handover/browser-checks/opening.mjs` was written but **never run**. No measured time to first sale / first machine exists
- **Vehicle paint before/after comparison**: `capture.mjs` (with `TAG=after`) never run; the weathering shader and darker base paint are in the code and were only judged from a few screenshots
- Time gate: passed in a controlled browser test (`gate3.mjs`: no clock before the first click or after load, pause, lock loss, shop, map, resume, loaded game; no errors) and in unit tests (`timeGate.test.js`). Blur/hidden window: now also passed in the browser (verification pass above, simulated with `document.hasFocus` / `document.hidden` overrides)
- Map labels: checked by screenshots at default and zoomed views earlier; no automated check

## Known defects and risks

- Building under the player, or with a machine only partly near the strip's batter zone, is only partly guarded (machines and the barrow are blocked with 3 m clearance; the player is not)
- No goal or objective uses roads/ramps yet (only a one-off mentor tip); price and material numbers are unbalanced
- The dev test server (`vite.test.config.mjs`) has `watch: null`: restart it after code changes or it serves stale modules. Kill it by port or through a script file, not `pkill -f` from a command line that contains the pattern (this killed the shell several times)
- `docs/handover/browser-checks/*.mjs` have hard-coded paths (`/opt/node22/lib/node_modules/playwright`, `localhost:5174`, `$OUT`); adjust them

## How to run

```
npm install
npm run dev          # Vite prints the local URL; click to play; F on foot to plan works
npm test             # 135 tests
npx vite build
```

For a quick manual try: dev panel (F1) adds money; tip some gravel on the field (the loose gravel must be within 30 m of the road), press F, click start and end, click again to build. The dev hooks `window.__quarry.world.debug.planner`, `.aimAt(x, z)` and `.teleportPlayer(x, z)` are what the smoke scripts use.

Browser scripts (need Playwright with Chromium): start `npx vite --config docs/handover/browser-checks/vite.test.config.mjs` (edit the root path in it), then `OUT=/some/dir timeout 840 node docs/handover/browser-checks/verify.mjs` (the verification pass, about 10 minutes with software rendering), or `works.mjs` and `works2.mjs`.

## Next items (from `docs/implementation-plan.md`)

1. Finish the unverified checks above (browser save/reload of built works, level area, dumper on a ramp), then the real-controls opening loop and the paint comparison
2. Step 8: buyable yard buildings, each changing play: workshop, fuel tank, home weighbridge, better site office, stockpile bays, floodlights, fence and gate, wash bay, then screener and crusher (ones that need later systems wait for them)
3. Balance works prices and add a goal that checks a built road or ramp (`worksBuilt` event exists)
4. Milestone 4 keeps the Standard, Heavy and Mega machine tiers
