# Working on Quarry (for every agent: Codex, Claude and anyone else)

Quarry is a first-person quarry business game: dig by hand, sell at the depot, buy and run
machines, hire staff and grow the company. Plain JavaScript ES modules, Three.js (3D), Rapier
(physics), Vite (dev server and build), Vitest (tests). No game engine.

Several agents work on this repository, sometimes at the same time. This file is the shared
rulebook. Read it first, then `docs/TASKS.md` for what to do.

## Branches: `main` is the game

- **`main` is the current playable game and the branch everyone builds from.**
- At the start of every task: `git fetch origin`, then branch from the newest main
  (`git checkout -b <agent>/<short-task-name> origin/main`, for example `codex/stockpile-ui` or
  `claude/hud-cleanup`), or merge `origin/main` into the branch you're on.
- When the task is done and the checks below pass, bring it into `main`:
  1. `git fetch origin` and merge `origin/main` into your branch if main has moved, then
     re-run the checks.
  2. Push your branch, then fast-forward main: `git push origin HEAD:main`.
  3. If that's refused because main moved again, repeat from step 1. If a merge conflict
     changes behaviour either way (both sides changed the same logic), open a pull request
     instead and say what needs deciding.
- **Never force-push, never rewrite history on a shared branch, never commit straight to main
  without the checks.** Small tasks and frequent merges keep agents from colliding.

## Before every push

```bash
npm ci            # once per checkout (Node 20 or newer)
npm test          # all unit tests must pass
npm run lint      # must report nothing (undefined names, unused code, unreachable code)
npm run build     # must succeed
```

For anything you can see or play, also run the quick browser check (see "Browser checks")
and look at what you changed in a screenshot. Say plainly what you did not verify.

## How the code is put together

- **Game logic never touches the screen.** Logic modules (`src/core`, `src/economy`,
  `src/machinery`, `src/ground`, `src/staff`, ...) change state and emit events; the 3D world
  (`src/world3d`) and the UI (`src/ui`) react. A player action goes through `game.actions.*`
  (`src/game/actions.js`).
- **Every balance number lives in `data/*.json`**, not in code.
- **Old saves must keep loading.** Default new state with `??=` where it's first used, or add a
  migration in `src/core/migrations.js`.
- **Material is conserved.** Nothing is created from nothing or lost; tests check it.
- **A new random system gets its own RNG state** (`createRng(() => stateObj)`), so it doesn't
  shift every other system's dice.
- **Tests sit next to the rules** (`*.test.js`). New rules come with tests.
- `docs/modules.md` is the map of the code; update it when you add or move a module.
  `README.md` is for players: update its controls and how-to when behaviour changes.
- Models: Blender builders are in `blender/`, exported models in `assets/models/`, notes in
  `docs/models.md`. Run `blender/compress_textures.py` after any model rebuild; the model budget
  test fails if they grow too big.

## Browser checks

Scripts are in `docs/handover/browser-checks/` and share `common.mjs`. Run the quick one,
`smoke.mjs`, after any change; the others check one feature each.

```bash
npx vite --config docs/handover/browser-checks/vite.test.config.mjs   # test server, port 5174
OUT=/tmp/shots timeout 600 node docs/handover/browser-checks/smoke.mjs
```

- The test server doesn't watch files: restart it after editing code.
- Playwright isn't a project dependency. Point `PLAYWRIGHT_MODULE` at an installed copy
  (in Claude's cloud container: `/opt/node22/lib/node_modules/playwright/index.mjs`), and
  `CHROMIUM_EXECUTABLE` at a browser if Playwright can't find one.
- Software rendering is slow. Keep the 320×180 viewport, count frames rather than seconds,
  take few screenshots, and always bound a run with `timeout`. On Linux, SwiftShader stalls
  without `CHROMIUM_ARGS='["--in-process-gpu"]'`; on a Mac, `["--use-angle=metal","--in-process-gpu"]`.
- Pointer lock is simulated and aim is set in code; that is not the same as a person playing.
- `pkill -f <pattern>` typed on a command line that contains the pattern kills your own shell.
  Stop processes by PID or from a script file.
- Keep screenshot evidence small and few. Prefer describing what you saw in `docs/LOG.md`;
  `docs/handover/screenshots/` is already over 100 MB.

## Writing down what you did

- `docs/TASKS.md` is the queue. Claim a task by putting your agent and branch on it before you
  start, so two agents don't do the same work; tick it with the commit when it's on main.
- `docs/LOG.md` gets a short entry per task: what changed, the commit, what you actually ran,
  and what you didn't verify.
- `docs/archive/` holds old handoffs and checkpoints. Read them only for history.

## What Edouard (the owner) has asked for

- Deeper, more enjoyable quarry gameplay: digging, material behaviour and machine handling
  first. Jobs/contracts stay optional, not the main source of depth.
- Clean, uncluttered UI (in the spirit of Euro Truck Simulator 2 and Farming Simulator menus).
- Realistic models and synthesised sound. He rejected a gearbox whine; don't re-add it unless
  asked.
- Honest reports: a fixture-driven check is not a playthrough.

## The playable web copy

The game can be published as a private claude.ai artifact, which won't serve `.glb` files or
allow `data:`/`blob:` fetches. Build that copy with
`VITE_MODEL_EXT=gltf.json npx vite build --outDir <dir> && node docs/handover/web-models.mjs <dir>`.
Only a Claude session can publish it. The normal build is unaffected.
