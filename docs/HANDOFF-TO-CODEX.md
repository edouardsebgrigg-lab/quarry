# Handoff to Codex: 1 October 2026

Claude is stepping back. Codex now carries Quarry's development on its own, including the areas
Claude owned (laptop, HUD, menus, sound, models, renderer). This file is the starting point;
`docs/TASKS.md`, `docs/POLISH.md`, `docs/modules.md` and `README.md` have the detail.

## Where the code is

- **`claude/coordination` is the newest and most complete branch.** It holds everything: all of
  Codex's merged work (`codex/step-7-safety-and-yard-buildings` and
  `codex/vehicle-model-integration` are fully contained in it), Claude's polish loop, and the
  staff system. Last commit at handoff: `7504bfa`.
- **`main` on GitHub is still the initial commit.** The planned fast-forward of `main` was
  blocked and Edouard deferred it. Don't merge into `main`; Edouard decides when.
- Start from it: `git fetch origin && git checkout -b codex/continue origin/claude/coordination`
  (or merge `origin/claude/coordination` into your existing branch). Push only to your own
  `codex/*` branch with `git push -u origin <branch>`. Never force-push, never push to `main`
  or `claude/*`, and no pull requests unless Edouard asks.

## The game in one paragraph

A first-person quarry business game: start with a shovel, a barrow and a pickup on a field,
sell dug material at the depot over a weighbridge, buy and hire machines (mini digger,
excavator, dumper, tractor and trailer, truck), build haul roads and ramps, and grow the
business through the laptop (dealer, Wolds Trader second-hand adverts, bank with loans and a
credit rating, fleet with insurance cover, hire-out, jobs board and regular customers, news,
logbook, milestones, and Staff). Plain JavaScript ES modules, Three.js r186, Rapier physics,
Vite, Vitest. No engine.

## Rules that keep it working

- Game logic stays separate from 3D and UI. Logic emits events, and the world and UI react.
  Player actions go through `game.actions.*` (`src/game/actions.js`).
- Every balance number goes in `data/*.json`.
- New saved state must load from old saves: default it with `??=`, or add a migration in
  `src/core/migrations.js`.
- Material is conserved. Nothing is created from nothing.
- A new random system gets its own RNG state (see `createRng(() => stateObj)` in `src/staff/`
  or `src/classifieds/`).
- Tests sit next to the rules (`*.test.js`). At handoff, `npm test` passes all 246 tests and
  `npm run build` is clean.
- Update `README.md` (controls) and `docs/modules.md` when behaviour or modules change.

## Checking your work

- `npm test` and `npm run build` must both pass before every push.
- Browser checks live in `docs/handover/browser-checks/`, and `common.mjs` holds the shared
  setup. Start the no-reload test server with
  `npx vite --config docs/handover/browser-checks/vite.test.config.mjs` (port 5174), and
  restart it after code changes, because it doesn't watch files. Run each check as
  `OUT=<dir> timeout 600 node docs/handover/browser-checks/<check>.mjs`.
- Playwright is installed globally here, so set
  `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs`. SwiftShader's GPU
  process stalls after teleports, so set `CHROMIUM_ARGS='["--in-process-gpu"]'`.
- Software rendering is slow. Use the 320×180 viewport, count frames rather than wall-clock
  time, and keep screenshots few. `staff.mjs` timed out on its last field screenshot, which is
  why `stafffield.mjs` exists as a quicker in-world check.
- `pkill -f <pattern>` typed on a command line that contains the pattern kills your own shell.
  Kill by PID or from a script file.
- Look at visual changes yourself in a screenshot, and say what you didn't verify. Pointer lock
  is stubbed in the checks.

### Review future model and UI updates

Edouard requested thorough review for each update. A changed model needs its rig
contract and asset budget checked, plus actual in-game entry, cab/chase views,
movement and its working parts. Use `fleet-fit.mjs`; check visible bucket teeth,
moving cargo floor/unload points and trailer hitch alignment where applicable.
Inspect the screenshots, not only numerical assertions. A changed menu/shop needs
desktop and narrow layouts, larger text, visible/reachable primary controls and
its real purchase/hire/return action checked. Use `ui-layout.mjs`,
`ui-layout-small.mjs` and `entry-rentals.mjs` as appropriate. Restart the no-watch
server after edits; fetching new CSS directly does not refresh its module cache.
Have another agent review significant asset/interface changes when available.
Fix findings and rerun affected checks, then record the actual evidence and limits
in the checkpoint. The native Mac checks use ANGLE Metal; low graphics/muted audio
and synthetic pointer lock do not establish subjective sound or a long manual
playthrough. Always run the full tests and build before pushing.

## Playable web copy (claude.ai artifact)

Edouard plays a build published as a private claude.ai artifact. That host won't serve `.glb`,
and its security policy blocks `fetch` of `data:` and `blob:` URLs. So the web build is made
like this:

```
VITE_MODEL_EXT=gltf.json npx vite build --outDir <dir>
node docs/handover/web-models.mjs <dir>
```

`web-models.mjs` turns each model into glTF JSON with base64 geometry, plus shared texture
image files (`models/tex/<hash>.jpg`). `glbModels.js` decodes the geometry itself when
`VITE_MODEL_EXT=gltf.json`. The normal `npm run build` and dev server are unchanged. Only a
Claude session can republish the artifact, so leave that to Edouard.

## Recently added systems (build on them, don't duplicate them)

The long paragraph under "Areas Claude is working on" in `docs/TASKS.md` lists the gotchas for
each system: hire-out (`m.onHire`), classifieds, insurance (`repairShare`), credit rating (pin
`state.bank.credit` in tests), regular customers, and staff. The newest is the staff system:

- **Staff** (`src/staff/`, `data/staff.json`, laptop app `src/ui/game/laptop/staff.js`).
  - Posts open with progress: the first at $3,000 earned and 3 machines, then much harder ones.
  - Each worker has dig, drive, sell and fix skills, a daily wage, a hiring fee and notice pay.
  - **Roles:**
    - Digger operator: runs `startJob('dig')` where the digger is parked, heaps beside it, and
      sorts by material when skilled.
    - Haulage driver: loads from field heaps, drives to the depot and sells. The vehicle has
      `m.away` while on the road, and the world removes it and brings it back.
    - Sales: a better price per load, and takes board jobs.
    - Fitter: services and repairs, more cheaply.
  - A worked machine has `m.operator`: it can't be entered, sold or hired out.
  - `state.player.driving` is the machine the player is in.
  - `staffTick` runs after `tickJobs`.

## What to do next, in order

1. **Take over the planning files.** Codex may now edit `docs/TASKS.md` and `docs/POLISH.md`,
   since Claude has handed them over.
2. **The open gameplay queue in `docs/TASKS.md`, in its listed order:**
   - **T9:** spoil and heap sourcing respect obstacles.
   - **T5:** measure the opening loop with real controls and normal money.
   - **T6:** stockpile bays at the home yard. A tipped load is not a sale, so don't emit
     `productSold`.
   - **T7:** home weighbridge.

   Each task has a "Done when" section.
3. **D14 Staff, next** (`docs/POLISH.md`):
   - Drivers deliver to jobs-board customers and fill a regular customer's order on purpose.
   - Experience or morale that grows with work.
   - A digger operator loading a waiting truck directly, so a digger and a driver work as a
     pair.
4. **Polish backlog** (`docs/POLISH.md` "Now"):
   - **M1:** check decal placement on every machine (`modelshots.mjs`).
   - **S2:** the tractor's PTO and a better tipper-ram sound. Edouard rejected a gearbox
     whine, so don't re-add it unless asked.
   - **M2:** models look too clean up close. Blender isn't installed in the cloud container;
     the builders are in `blender/`, and run `blender/compress_textures.py` after any rebuild.
   - **V1:** farm animals or machinery in the fields.
5. **D7 time of day needs a decision from Edouard.** The day is 2 real minutes, so a moving
   sun would sweep the sky every minute. Ask before building it.

## Reporting

After each task, update `docs/CODEX-CHECKPOINT.md`. For each task, give its ID, the commit, what
changed, and what was actually run (tests, build, browser), with "not verified" stated plainly.
Tick items in `docs/POLISH.md` or `docs/TASKS.md` with the commit.

### Game-feel update checks

Use `f3-feel.mjs` for actual keyboard walking/jump/barrow/reverse checks, `game-feel.mjs` for real survey/excavation and machine feedback, `hud-comfort.mjs` for bounded HUD/comfort controls, and `personal-target-ui.mjs` for choose/switch/clear and Save/Continue. Their reports distinguish component fixtures from gameplay actions. Inspect final phone and larger-text views and check overlay intersections, not just viewport bounds. See `game-feel-review.md` and the checkpoint for evidence and limits.
