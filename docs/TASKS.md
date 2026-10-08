# Task queue

The shared to-do list for every agent. Rules for working are in `AGENTS.md`. Take the first
open task you're suited to, claim it (put your agent and branch after the title), and tick it
with the commit once it's on `main`. Add tasks you notice at the bottom of the right section.
Older queues and their history are in `docs/archive/`.

State on 5 October 2026: `main` includes regional buyers, plant upgrades and saved
production queues, expandable bays, soil recovery, conserved contractor rock blasting,
and a lasting player journal, searchable Field guide and recoverable portable saves.
Purchasable South Meadow and East Ridge more than double the diggable area, with
independent terrain, physical access and shared company machinery/processing.
Saved working faces now pair borehole profiles with precise navigation and depth
comparisons after excavation. The first sale, springs, Micro 08 and Continue are also
checked with automated inputs and explicit depot placement. Partial-bucket deadlocks
are fixed; all eight current digger models pass physical scoop/dump checks. A normal-money
domain simulation also completes all 22 goals and continues after saved-game recovery.
515 tests pass, alongside lint/build and smoke/digger-cycle browser checks.
The latest expansions followed the owner's direct request for broad development
beyond this queue; the manual play tasks below remain unverified.

## Play and fix (most valuable now)

Nobody has yet played the current game start to finish with real controls. These tasks are
about playing it properly and fixing what gets in the way.

- [ ] **P-1 The opening loop, played for real.** New game, normal money, real walking, barrow
      and driving: time the first sale, the first machine and the first hire (game clock and
      real minutes). Write down every point where a new player would get stuck or bored, then
      fix the worst ones. (Old T5 got as far as a bounded check; see the archive.)
- [ ] **P-2 A long working session.** Loaded hauls with starts, braking, reversing and trailer
      grades; cruise on and off; Direct and Assisted digging through several layers; the
      breaker, rubble and bucket; stockpile loading; a ramp and a road from your own spoil;
      staff working in pairs; Save and Continue after real work. Fix what's reproducible, with
      a test for each fix.
- [ ] **P-3 Listen and look.** Engines, hydraulics, PTO and tipper sounds with the volume up;
      night readability; camera comfort; menus at normal and larger text sizes.
- [x] **P-4 The start view.** Fixed: the sun rose in the west, straight ahead of a new game's view
      (the map's x is east); it now rises in the east behind you. (Claude, `claude/realism`)
      Original note: A new game opens looking up into a low morning sun that whites out
      the top of the screen. Start the player facing the field, slightly down, and check the
      sun's glare at dawn and dusk isn't overpowering.

## Completed upgrades

- [x] **U-11 Complete-company progression** (Codex, `codex/company-progression`):
      all 22 goals reached from $200 without injected money, cargo or progress; real
      calendar costs, repairs, graded sales and per-material conservation. Mid-career
      slot recovery and a completed-company portable save both permit continued work.
      Contracts remain optional. 515 tests, lint/build and browser smoke passed.
      Domain positions and haul times are fixtures; manual play remains open.
      Verification commit: `7f908e6`.

- [x] **U-10 Digger reliability** (Codex, `codex/digger-reliability`): small bites
      remain dumpable across controls, prompts and saves; accurate partial-load advice
      and readouts; zero-share pours preserve cargo. All eight current digger models
      completed physical Assisted scoop/dump cycles with conserved material. 514 tests,
      lint/build, smoke and digger-cycles browser checks passed. Simulation/placement
      fixtures are explicit; human operation remains unverified.
      Feature commit: `5934923`.

- [x] **U-9 Opening-loop checks and handling feedback** (Codex, `codex/opening-loop`):
      directional blocked-barrow prompts; normal-money shovel/barrow/pickup transfers,
      weighing, first sale, springs, Micro 08 and Continue verified. 510 tests,
      lint/build, smoke, barrow-guidance and opening browser checks passed. Automatic
      aim/input and depot vehicle placement were fixtures; P-1 remains open.
      Feature commit: `b9e6e38`.

- [x] **U-8 Working-face planning** (Codex, `codex/working-faces`): field-filtered
      surveys, ordered borehole profiles, material recommendations, saved face choices,
      exact navigation and original-vs-current depth readings. Depleted targets remain
      honestly depleted; refreshing changes no material or saved baseline.
      Feature commit: `35634d0`. 510 tests, lint/build, smoke and faces browser checks passed.

- [x] **U-7 Land expansion** (Codex, `codex/land-expansion`): South Meadow and East
      Ridge purchases, distinct geology, independent saved terrain, physical access,
      surveys, map markers and navigation. Shovels, machinery, staff, earthworks and
      blasting route to owned fields. Feature commit: `eae6e76`.
      503 tests, lint/build and both browser checks passed. Fixed-step vehicle inputs
      and seeded finances were fixtures; manual play and GPU performance remain open.

- [x] **U-6 Player journey and save resilience** (Codex, `codex/game-journey`):
      remembered early actions, a permanent completion journal, optional guidance,
      13 handbook articles, rebound controls, recovery copies, file import/export,
      periodic autosaves and safe Save and quit. Feature commit: `dfb4e6d`.
      495 tests, lint/build and both browser checks passed.

- [x] **U-5 Rock blasting** (Codex, `codex/rock-blasting`): conserved finite bedrock
      fracturing, timed contractor preparation, live clearance, cancellable countdown,
      direct E stop, field rig/markers/effects, saved cuts and cost/yield receipts.
      Feature commit: `8f1ad4f`. 481 tests, lint/build and three browser checks passed.

- [x] **U-4 Production planning** (Codex, `codex/production-planning`): finite saved
      queues, pause/reorder/remove, working-capital reserve, bay capacity/wall upgrades,
      topsoil/clay recovery and Home attention notices. Feature commit: `aecc27d`.
      467 tests plus lint/build and three browser checks passed.

- [x] **U-3 Regional and industrial expansion** (Codex, `codex/quarry-expansion`):
      three roadside buyers, daily quotas/loyalty, delivery navigation, plant upgrades
      and service timers, recorded surveys. Feature commit: `0f76c4a`.
      454 tests plus lint/build and three browser checks passed.

- [x] **U-2 Production handoff** (Codex, `codex/production-handoff`): saved batch
      history, reusable plans, completion notices and processed-material handling
      checks. Each repeated plan gets a fresh quote before spending.
      On main: `562d86c` (442 tests, lint/build, both browser checks).

- [x] **U-1 Working Quarry upgrade** (Codex, `codex/quarry-upgrade`): surveyed work
      areas, conserved crushing/screening, yard operations, daily reports and
      optional production goals. Plan: `docs/UPGRADE-PLAN.md`.
      On main: `9e52f8d` (437 tests, lint/build, both browser checks).

- [x] **G-1 Ground, grass and driving** (Claude, `claude/ground-driving`): grip-limited wheels
      (lockups, wheelspin, body roll), dry and wet surface grip in data, turf that wears into
      tyre tracks and mud, grass tufts on the field, a pedal ramp and light-pedal key.
      On main: `d944458`, included with the Working Quarry upgrade.

- [ ] **H-7 A slow save test.** `saveRecovery.test.js` "exports, validates and imports into the
      chosen slot" takes about 1.7 s alone; it failed once in a full run while a headless browser
      was rendering (likely the 5 s timeout) and passed in three reruns. Find what makes it slow.

## Next depth (after the play tasks)

- [ ] **N-1 Propose the next small batch of depth and fun**, based on P-1 to P-3, and agree it
      with Edouard before building. Keep jobs optional.

## Housekeeping

- [ ] **H-1 Screenshot evidence.** `docs/handover/screenshots/` is over 100 MB and grows with
      every review. Decide with Edouard whether to stop committing review screenshots (keep
      them local, describe them in `docs/LOG.md`) and whether to remove the old ones.
- [ ] **H-2 Old browser checks.** Several scripts in `docs/handover/browser-checks/` were written
      for one task and may no longer pass against the current game. When one fails, fix it if
      the feature still needs checking, otherwise delete it. `smoke.mjs` must always pass.
- [ ] **H-3 Republish the playable web copy** (a Claude session; see `AGENTS.md`) whenever
      Edouard wants the claude.ai link brought up to date.
- [ ] **H-4 Frame cost.** In the same software-rendered test, a frame on the field went from
      1.9 s before the 2 October merge to 2.5 s after (visible meshes 971 → 1,218, about 1.3 M
      triangles on Low). A real GPU is far faster, but draw calls cost CPU time on every machine:
      look for static scenery that can be merged or instanced, and check Low really is light.
      Progress (Claude, `claude/realism`): static props batched (depot 801 → 167 draws), machine
      details merged at load (eight machines: 1,901 → 834 meshes), the countryside terrain
      drawn in 250 m tiles (field on Low 806k → 555k triangles, for 41 more draws). Left: the
      depot's block walls (122k triangles) still draw from the yard 700 m away behind hedges;
      a far LOD or distance cut for small batched props would save that.
- [x] **H-5 Small windows.** At 640×360 the key-hints panel runs into the goal card. Fine from
      960×540 up; give the hints a max height (or hide them) when the window is short.
      Done: the hints get a max height and tighten below 640 px tall (Claude, `claude/realism`).
- [ ] **H-6 Ground shader on Medium+ (check on a real GPU).** In the headless test browser
      (SwiftShader), a game that loads with the sun in the east draws the home field not at all on
      Medium and up: the field shows the sky through it. Plain materials draw; turning the sun's
      shadows off fixes it; forcing the ground shader to recompile crashed SwiftShader's GL
      context; there are no GL errors. The field's ground shader (30+ texture reads plus PCF
      shadows) looks too heavy for SwiftShader to compile reliably. Confirm on a real GPU that a
      new game's field draws on Medium/High at 07:00; if it doesn't, simplify the ground shader
      (fewer `tileless` double samples, or a cheaper path when shadows are on). Use Low for field
      screenshots in SwiftShader meanwhile.
