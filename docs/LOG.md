# Work log

One short entry per task, newest at the top: the task, the agent and branch, the commit on
`main`, what changed, what was actually run, and what wasn't verified. Older, longer reports
are in `docs/archive/CODEX-CHECKPOINT.md`.

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
  With eight machines in the yard the scene had 1,901 meshes before and 834 after.
- Checked: tests (398), lint, build; the depot, village, farm and yard shot with and without
  batching look the same; eight machines side by side on the old and new build look the same
  (wheel nuts, trim, lights), except that the steering wheel is now on the right. Sitting in
  the pickup, tipper and van puts your eye on the right and you step out on the right; in the
  excavator, left as before.
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
