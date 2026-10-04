# Work log

One short entry per task, newest at the top: the task, the agent and branch, the commit on
`main`, what changed, what was actually run, and what wasn't verified. Older, longer reports
are in `docs/archive/CODEX-CHECKPOINT.md`.

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
