# Work log

One short entry per task, newest at the top: the task, the agent and branch, the commit on
`main`, what changed, what was actually run, and what wasn't verified. Older, longer reports
are in `docs/archive/CODEX-CHECKPOINT.md`.

## 5 October 2026 · Saved working faces (Codex, `codex/working-faces`)

- Feature commit: `35634d0`. Owner-directed development beyond the queue.
- Work areas now filter by owned field and show nine real borehole columns. Choosing
  a target material identifies its shallowest suitable sampled layer and displays
  top-down depths, thicknesses, loose/compacted mixtures and finite intact bedrock.
  The configured 80% volume-share threshold is a digging aid, separate from cargo
  mass purity used by the depot. Ground between samples can differ.
- One dated face plan per area retains material, sample and original depth/thickness.
  Navigation points to that sample rather than the area's centre. Plans survive other
  waypoints and reload; clearing a plan preserves ordinary area navigation. Refreshing
  reports current depths or depletion without resetting the baseline, earning money
  or treating sampled reserve differences as actual production. Old survey records
  and legacy area IDs remain usable. Invalid face metadata is ignored safely.
- Moved work-area presentation into `laptop/workAreas.js`; compact field filtering,
  sample buttons, layer profiles and collapsible area estimates replace the growing
  all-fields grid. README and the geology handbook explain the workflow. Existing
  browser scripts were adjusted for the new field selector and face-plan action.
- Checked: **510 tests in 81 files**, lint, build, `smoke.mjs` and `faces.mjs`; all passed,
  no browser console errors. Rule tests cover untouched company/terrain during surveys,
  mixed fill, remaining rock, actual target depletion, rejected choices, saved exact
  navigation, independent plans and legacy defaults.
- Feature browser used actual field/material/sample controls, saved rock and topsoil
  plans in separate fields, recorded a survey, cut and redeposited terrain through
  actions with per-material conservation, then refreshed to see the exhausted target.
  It verified unchanged money/baseline, Continue recovery of both plans and the precise
  guide, clearing one plan, and returning to goal navigation. Money and earthmoving
  were explicit fixtures; no human excavation session is claimed.
- Inspected final planning/profile screenshots at 1280×850 and depleted-target UI at
  390×844, without horizontal overflow. Review caught and fixed low-contrast native
  button text before the final browser runs. Evidence remains outside Git in
  `/workspace/.cache/quarry/faces-shots`; UI captures hid the scene for speed.
- Limits: headless Chromium on Low graphics. Full-session balance, manual controls,
  audio and real-GPU performance remain unverified.

## 5 October 2026 · Neighbouring land expansion (Codex, `codex/land-expansion`)

- Feature commit: `eae6e76`. Continued owner-directed development beyond the queue.
- Added South Meadow ($4,000, 1.95 ha) and East Ridge ($6,500, 0.70 ha), expanding
  total diggable ground from 23,104 to 49,600 m². South has deeper sand; Ridge has
  shallow cover and a deeper finite rock reserve. Both share the existing company,
  machinery and processing yard. Purchases are once-only capital expenditure.
- Extra fields use independent seeded grids and packed save records; Home Field's
  grid dimensions and existing excavations stay intact. Terrain routing covers hand
  tools, Direct/Assisted machines, tips, staff, earthworks and contractor cuts. Unowned
  fields can be surveyed but cannot be excavated or altered through these actions.
- Land cards provide reserve estimates and entrance navigation. Owned fields add work
  areas and a blasting-map selector. World meshes, physics holes, corner stakes,
  ownership signs, map boundaries and two access strips make the fields physically
  usable; the southern hedge has a real opening. A new handbook article explains them.
- Checked: **503 tests in 80 files**, lint, build, `smoke.mjs` and `land.mjs`; all passed,
  no browser console errors. Rules cover preserved Home terrain/RNG, once-only payment,
  material transfer conservation, operators, grading, saved contractor cuts, legacy
  defaults and rejected corrupt extra terrain.
- Browser used actual purchase/survey/navigation controls, new work areas and the
  blasting field selector. A tracked digger stopped before purchase, then crossed
  South's opening to Z191.1 and Ridge's entrance to X237.4 after purchase. A physical
  shovel removed new-field material; a transfer to the other field conserved it.
  Save and Continue restored money, both purchase receipts and all terrain totals.
  Money, placement and fixed-step steering were explicit fixtures, not a human drive.
- Inspected purchase/survey and map screenshots at 1280×850, purchase layout at
  390×844 (no horizontal overflow), and the changed ownership board/southern entrance
  at 960×540. Evidence stays outside Git in `/workspace/.cache/quarry/land-shots`.
  UI screenshots hid the 3D scene for speed; the world/physical-tool checks rendered it.
  The first feature run exposed an ambiguous accessible name on the wrapped Field
  selector; an explicit label fixed it, and the complete check passed afterwards.
- Limits: Chromium software rendering and Low graphics. No manual full-company
  playthrough, long-session balance check, listening test or real-GPU benchmark.

## 5 October 2026 · Player journey and save resilience (Codex, `codex/game-journey`)

- Feature commit: `dfb4e6d`. Continued owner-directed development beyond the queue.
- Guided goals remember actual earlier shovel/bucket work, loaded pickups, weighing,
  deliveries and upgrades. The journal retains all 22 goals in four chapters, dated
  reward records and a one-time established-company record. Legacy completion gets no
  invented date or duplicate reward. Guide visibility is optional; free play continues.
- F2 and the pause/office menus open the Field guide: 13 searchable practical articles,
  links to relevant apps, troubleshooting and current rebound controls. Article changes
  begin at the top; tab changes reset their reading position. Intro offers guidance choice.
- Saves retain one usable previous revision per slot, detect accidental corruption and
  recover damaged primary copies. Portable JSON preview/import validates the company and
  packed terrain before replacing a manual slot. Newer versions can be exported intact.
  Exporting the current company works independently of browser storage. Failed writes
  retain the primary, failed Save and quit keeps the company open, and periodic/morning
  autosaves run after the frame's tick handlers finish.
- Checked: **495 tests in 79 files**, lint, production build, `smoke.mjs` and the new
  `journey.mjs`; all passed, no browser console errors. Unit coverage includes a real
  early shovel-to-pickup delivery before the barrow lesson, reload, independent company
  events, legacy histories, once-only completion, quota failures, corruption and imports.
- Browser checks use actual menus, downloads and file uploads: guide toggle, search,
  rebound keys, manual-save rotation, bad/valid imports, Continue recovery, failed exit,
  emergency export, successful Save and quit, periodic autosave and completion reload.
  The final-goal state and shortened autosave interval are explicit fixtures, not a
  full campaign playthrough. A first run exposed a case-sensitive assertion against
  CSS-uppercase text; the assertion now checks the displayed text without case sensitivity.
- Inspected journal, handbook, completion and save-manager screenshots at 1280×850,
  plus handbook/save views at 390×844. Evidence remains outside Git in
  `/workspace/.cache/quarry/journey-shots`. UI captures hide the 3D scene for speed;
  smoke still exercises normal world startup, a physical shovelful, all apps and reload.
- Limits: Chromium software rendering, Low graphics. No manual end-to-end playthrough,
  real-GPU performance measurement or listening test is claimed.

## 4 October 2026 · Rock blasting (Codex, `codex/rock-blasting`)

- Feature commit: `8f1ad4f`. Owner-directed development beyond the task queue.
- New physical rock-working loop: survey an exposed patch, book timed drilling, book
  timed charging, clear the marked field and fire a cancellable countdown. Three saved
  cut sizes trade crew cost/time for yield. Every footprint cell is checked; graded
  ground, excess cover, changed surveys and exhausted reserves are refused.
- Finite bedrock becomes loose rock in-place, retaining all cover and conserving tonnes.
  Buckets still load the rubble; bays, crushers and sales retain their existing handling
  requirements. Rig tracks, wheels, mast, braces, controls and vents are authored in
  code; the working rig has a Rapier collider and leaves before firing. Terrain-following
  flags/rings, map boundaries, countdown HUD, dust and a synthesised impact complete
  the field feedback.
- Live player, vehicle, trailer and barrow positions gate firing and every countdown
  tick. Intrusion stops the countdown until the player explicitly restarts it. Missing
  world positions cannot certify clearance. Old saves default empty; preparation,
  stage quotes and charged projects persist. Bounded receipts and daily reports keep
  loosened rock separate from excavated/sold tonnage; bank entries identify crew costs.
- Checked: **481 tests in 77 files**, lint, build, `smoke.mjs`, `blasting.mjs` and
  `blast-controls.mjs`. All passed with no browser console errors. Conservation includes
  settling, save/reload, repeated cuts to the finite floor and normal bucket extraction.
  The full action integration feeds one conserved tonne into a crusher, producing
  0.8 t gravel and 0.2 t sand. Collider tests check the working rig and its removal.
- Browser buttons verify both paid stages, live player/vehicle clearance, Save/Continue,
  manual and automatic interruption, then 15.21 t released into terrain and ordinary
  bucket → stockpile → crusher handling. Actual keyboard E stops the countdown. The
  narrow layout places active controls above the survey and has no horizontal overflow.
  Tests explicitly wait for the laptop's throttled refresh and give the small digger
  enough strokes to collect the test batch.
- Inspected desktop survey, refined rig, ready/clearance, rubble and narrow-control
  screenshots, kept outside Git in `/workspace/.cache/quarry/blasting-shots`.
- Limits: cloud Chromium software rendering with Low graphics; explicit funds,
  earthmoving, viewpoints and clock fixtures. No manual driving/digging playthrough,
  real-GPU performance measurement or sound-by-ear verification is claimed.

## 4 October 2026 · Production planning (Codex, `codex/production-planning`)

- Feature commit: `aecc27d`. Continued the owner's broad development request beyond the
  old task queue. Finite per-plant production orders now wait for feed, space, service or
  cash; fresh quotes start each batch and a shared adjustable reserve protects working
  capital. Orders can be moved, removed, paused and resumed. Cancellation returns feed,
  retains the operating cost and pauses future work without silently repeating it.
- Individual stockpile bays expand from 25 to 40 to 55 t. Purchases preserve all stock and
  reservations, count as capital, and raise both rendered walls and physical colliders.
  Topsoil/clay recovery uses conserved separation, retaining rejects in the feed bay.
  Home flags waiting queues and production forms show current upgraded/worn plant rates.
- Checked: **467 tests in 75 files**, lint, build, `smoke.mjs`, `quarry-upgrade.mjs` and
  `production-planning.mjs`. All passed; browser checks reported no console errors.
  Coverage includes simultaneous plants sharing a cash reserve, linked crushing/screening,
  unchanged waiting stock/cash, cancellation, bounded/reordered orders, legacy defaults,
  paid service and upgraded quotes, delivery/production reservations, and actual Rapier
  wall heights before/after upgrade and restored saves.
- Browser buttons verified bay expansion, queue edits, pause/resume, cash protection,
  Save/Continue and automatic batch costs paid once with normal milestone rewards active.
  Recovered topsoil received a valid nursery quote. Inspected queue desktop/narrow,
  expanded inventory and yard-wall screenshots, kept outside Git at
  `/workspace/.cache/quarry/planning-shots`.
- Limits: software-rendered Chromium, Low graphics; test fixtures supply funds/stock and
  advance the clock/place the viewpoint. No human working session, real-GPU performance
  measurement or sound-by-ear check is claimed.

## 4 October 2026 · Regional and industrial expansion (Codex, `codex/quarry-expansion`)

- Feature commit: `0f76c4a`. Owner-directed expansion beyond the task queue.
- Three roadside businesses now buy real cargo at distinct prices, purity thresholds and
  daily quotas. Public scales, delivery pads, map markers and navigation connect them to
  a new Regional trade app. Supplier relationships improve prices; partial sales retain
  excess on the actual truck/trailer. In-flight reservations prevent overselling demand,
  receipts persist, and regional sales do not fulfil unrelated depot contracts.
- Crusher/screener upgrades improve throughput and operating cost. Completed batches wear
  the plant; paid servicing takes saved game time. Running batch quotes remain fixed and
  output is conserved. Workshop controls and plant visuals reflect condition/upgrades.
- Recorded work-area surveys compare sampled reserves over time without changing terrain.
  New state defaults for older saves; player instructions and module documentation updated.
- Checked: **454 tests in 72 files**, lint, production build, `smoke.mjs`, full
  `quarry-upgrade.mjs`, and full `expansion.mjs`, all passing with no browser console errors.
  Expansion checks cover actual UI upgrade/service/survey/buyer actions and Save/Continue;
  fixture placements exercise all three public scales and world T-dispatch, including
  quota-limited sales and retained excess. Existing production conservation, cancellation,
  history/plans, accounting and reload/weigh/sell flows still pass.
- Inspected desktop workshop/trade, narrow trade, and all three yard screenshots. Moved
  scale signage beside the approach and fixed an empty survey comparison rendering “null”.
  Evidence remains outside Git at `/workspace/.cache/quarry/expansion-shots`.
- Limits: Chromium software rendering, Low graphics; fixtures provide funds, wear, cargo,
  placement, shortened scale dwell and clock advancement. This is not a human driving
  playthrough, real-GPU performance measurement, or sound-by-ear verification.

## 4 October 2026 · Production handoff (Codex, `codex/production-handoff`)

- On main: `562d86c`; branch and main pushed normally and the remote main SHA
  read back successfully. No force-push or merge conflict.
- Valid recipe/bay/quantity plans survive tab changes and Save/Continue. Planning
  changes no stock or balance; Start batch always checks present inventory,
  capacity and prices. Completed/cancelled batches keep the latest 20 receipts,
  including output and reject destinations, retained operating cost and time.
  Plan again restores choices for review, without starting or charging a batch.
- Completion notices name the finished materials and collection bay. Old saves,
  including running jobs without history/plans, default safely; receipts stay
  historical when their product is loaded or sold.
- Checked: 442 tests in 70 files, lint, build, `smoke.mjs` and expanded
  `quarry-upgrade.mjs`, both with no console errors. New tests cover fresh prices
  on reuse, invalid plans without mutation, receipt retention/cancellation,
  old saves, and loading/selling finished material. Browser buttons verify saved
  plans, notices, history and review before repeating. The labelled handling
  fixture reloaded and sold 0.116667 t of screened gravel after weighing,
  retained 0.683333 t, added no digging credit and left receipts unchanged.
- Inspected desktop and narrow batch-history screenshots: receipts, costs,
  destinations and Plan again fit; production shows the remembered quantities.
  Screenshots remain local outside the checkout.
- Coverage limits: browser cash, extraction, placement and tick advancement use
  fixtures; loading/selling uses game actions. This is not manual driving or a
  physical digger playthrough. Real GPU performance and sound remain unverified.

## 4 October 2026 · Working Quarry upgrade (Codex, `codex/quarry-upgrade`)

- Feature commit: `9e52f8d`, published to `main` with Claude's `d944458` work.
  After the owner accepted the collaborator invitation, the existing cloud Git
  authentication successfully pushed `codex/quarry-upgrade` and fast-forwarded
  `main` from `b7a1adb` to `11ce375`. Both remote refs were read back and matched.
  The earlier HTTP 403 is resolved; no force-push or credential replacement was needed.
- Plan in `docs/UPGRADE-PLAN.md`; builds on Claude's completed ground/driving,
  realism and cleanup work at `d944458`.
- Nine named field areas sample the actual remaining geological columns. Selection
  is saved, marks the map/field and reuses the guide; fleet navigation can replace it.
  Refresh reads current terrain without changing reserves or adding resources.
- Commission a jaw crusher and screening plant through the yard dealer. Paid,
  tick-driven batches consume actual stockpile feed, retain every output/reject
  tonne, reserve product and cancellation space, and survive Save/Continue.
  Cancel returns feed without refunding the operating cost. Processing is not a
  sale or another digging reward; normal loading and depot hauling are required.
- Quarry operations brings together live bay inventories/values, production
  quotes and active batches, sampled work areas and existing daily logbook reports.
  Three optional milestones reward production. Lightweight visible yard plants,
  status lights and a terrain-following area boundary release their GPU resources
  and colliders on teardown. Added a favicon to remove Chromium's missing-icon error.
- Checked: 437 unit tests in 70 files, lint, build, `smoke.mjs` and the new
  `quarry-upgrade.mjs`. Real dealer/UI buttons buy plants and start/cancel batches;
  Save/Continue preserves held feed, jobs and money. The labelled extraction
  fixture relocates real overburden, obtains finite bedrock with breaker cuts and
  asserts ground/feed conservation; developer cash and explicit tick advancement
  keep the browser check bounded. A 1 t rock batch yields 0.8 t gravel + 0.2 t sand;
  screening retains the sand and recovers the gravel, with both batches in the report.
- Looked at local screenshots: work-area selection and both plants in the yard,
  desktop production, narrow production/report layouts (no horizontal overflow).
  An external fixture also checks purchased meshes and the selected boundary are
  visible. Screenshots remain outside the checkout; both browser checks report no
  console errors. An initial extraction assertion read the consumed transfer
  object; preserving its receipt fixed the fixture, with conservation still checked.
- Not checked: manual driving/digging or physical loading of processed output,
  real GPU performance, sound by ear, a long normal-money business session,
  offline production (deliberately unsupported) or the private Claude artifact.
  Existing H-6 Medium+ field rendering coverage remains outstanding.

## 4 October 2026 · Ground, grass and driving (Claude, `claude/ground-driving`)

- Grip-limited wheels: each wheel's braking and drive is capped by its surface friction times
  the weight on it, less what it's using to corner (Rapier only checked forward force against
  half its friction circle, so the pickup braked as hard on wet grass as on tarmac and never
  spun a wheel). Past the limit a wheel locks or spins, graded by how far past, and loses
  sideways hold. Revs flare when the wheels spin (sound only); spinning wheels throw turf, mud
  or stones.
- Body roll: the roll moment the ray-cast vehicle leaves out is put back; the pickup leans about
  4 degrees in a hard bend with real load transfer.
- Surfaces in `data/handling.json`, dry and wet, blended by the ground's wetness (soaks up in
  rain, dries after). Mud and wet clay are slippery and wet sand firms up (`wetTraction`).
- Turf wear: each tyre or track wears the field along its own path; dry light passes flatten
  it, wet ground, heavy loads and slipping wheels tear it to mud, and only torn turf ruts.
  Saved (older saves load with whole turf). Tyre marks (`tyreMarks.js`) show it at tyre width
  anywhere: flattened tracks on grass, mud tracks, grey lines on gravel, black rubber on tarmac
  only when a wheel locks or spins.
- Grass tufts grow on the home field's turf (there were none), thinner on tracks, gone where
  it's dug, dumped on or torn.
- Keys work pedals: a held key presses the pedal over a quarter of a second; Right Shift keeps
  it light (40%). On wet grass that gets the empty pickup to 20 km/h in 7 s instead of 10.
- Fixed: field chunk rebuilds left their old vertex buffers on the GPU (digging leaked; with
  turf wear two scripted drives crashed the tab). Rebuilds now free the old geometry, and a tyre
  pass only redraws a cell when it would look different.
- Measured headless (empty pickup): from 40 km/h it stops in about 9 m on dry tarmac and 14 m on
  wet grass; cornering 0.9 g on tarmac, 0.45 g on wet grass; 0-50 km/h 5.7 s on tarmac.
- Checked: tests (418), lint, build; scripted drives in the game (real key presses) on the
  field in rain and in sunshine: wheelspin, revs, lockups, lean, tyre marks, mud tracks, field
  tufts, memory flat across a run. Tried and reverted: letting spinning wheels make the
  automatic change up (it hunted between first and second).
  Not checked: a person driving with real hands, a real GPU, the tipper and tractor in the game
  (their tests pass), sound by ear.

## 3 October 2026 · Realism and frame cost (Claude, `claude/realism`)

- The sun rose in the west: the solar path was mirrored (the map's x is east), so a new game
  faced straight into the morning sun (P-4). It now rises in the east; the moon stands in the
  south.
- Truer colours: Neutral tone mapping instead of ACES (yellow paint stayed yellow), grimy track
  and bucket steel instead of icy mirrors, a dark vinyl pickup dash, a rubber floor mat over
  the bare body shell, a thinner windscreen film.
- British right-hand drive: the pickup, 4×4, service van and tipper cabs are mirrored so the
  wheel and driver's seat are on the right, and you step out on that side. (The buggy, quad,
  tractors and diggers are unchanged.)
- Roads: worn tarmac instead of one speckled texture repeated every 2 m: darker polished wheel
  paths, grit along the crown and soil at the edges, square-cut repairs, a broad colour drift,
  and in the rain dark wet tarmac with water standing in the wheel paths. (The first version
  had near-black slab repairs and mirrored a blue sky in the rain: the environment map is a
  clear sky. Repairs now keep the texture with a sealed seam, and wet reflections go grey.)
- Trees and hedges: single leaves scattered outside each crown floated like confetti on the
  cards by the road; `blender/despeckle.py` clears them from the atlas (1.4 → 1.0 MB).
- Ashby: low brick front-garden walls (stone coping, a gap for the path, returns to the house,
  colliders), two meshes for the whole village; the pub keeps its open front.
- Soft shadow edges again: three.js dropped PCFSoft (it warned and fell back to hard PCF);
  Medium and up now blur the sun's shadow with its radius.
- Settings → Game: switch off the guide beam or Ray's tips. Key hints fit short windows (H-5).
- Frame cost (H-4): props that never move are drawn in batches (`staticBatch.js`): repeated
  parts instanced, the rest merged by material, per 96 m patch so culling still works; the 40
  horizon hills are four meshes; each machine's small fixed parts (wheel nuts, pin caps,
  steps) merge into their parent when it loads. Measured in SwiftShader on Medium: draw calls a
  frame at the depot 801 → 167, in the village 894 → 569, in the yard 627 → 400; triangles
  about the same (batching across patches first raised them 20%, so batches stay in a patch).
  Frame time in SwiftShader didn't change beyond its noise (it's bound by pixel work there); the
  saving is CPU time per frame on a real machine, which I couldn't measure here.
  With eight machines in the yard the scene had 1,901 meshes before and 834 after. The 2 km
  countryside terrain was one half-million-triangle mesh drawn whole every frame; it's now 250 m
  tiles sharing one vertex buffer (field on Low: 806k → 555k triangles, 176 → 217 draws;
  125 m tiles saved a little more but cost 110 draws).
- Checked: tests (402), lint, build, `smoke.mjs`. The depot, village, farm and yard shot with
  and without batching look the same; eight machines side by side on the old and new build look
  the same (wheel nuts, trim, lights) except that the steering wheel is now on the right.
  Sitting in the pickup, tipper and van puts your eye on the right and you step out on the
  right; in the excavator, left as before. The roads dry and in rain, the hedges, the village
  walls and the terrain tiles (no gaps) were shot and looked at.
  Not checked: a real GPU (all rendering here is SwiftShader), H-6 (the field on Medium+ in
  SwiftShader), sound, driving and digging by hand.

## 2 October 2026 · UI polish pass (Claude, `claude/cleanup`)

- New `ui-gallery.mjs`: every menu, settings tab, laptop app, dealer category, the map and the
  pause screens at 1280×720 in about a minute (screens over the world are taken with the 3D
  hidden). Used it to review all 28 screens, fix, and re-shoot.
- Fixed: Home stat cards out of line (button cards centred their content); selected chips
  looked weaker than unselected ones (now accent-filled); jobs-board bonus wrapping under long
  customer names and buttons out of line; "Wolds Trader" wrapping beside its badge; sell-list
  condition bars out of line; map machine names indented and a stray focus ring on its first
  button; two long messages from Ray filling the right of the HUD (the older one now shrinks to
  one line); the profit chart squeezing a few days to the left (now always a fortnight).
- Wording: "hire an excavator" (`withArticle`, tested), clearer Milestones and Fleet notes,
  machine descriptions no longer state one size for every model, "(laptop: …)" pointers hidden
  while you're in the laptop.
- Main menu backdrop replaced with a render made by the game (`menu-backdrop.mjs` +
  `grade-backdrop.py`): dusk over a dug trench, the excavator and tipper on the right.
- Checked: tests (387), lint, build, `smoke.mjs` pass; every screen re-shot and looked at.
  Not checked: real-GPU rendering of the new backdrop scene (rendered with SwiftShader on High),
  the HUD at night or in rain, sound.

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
