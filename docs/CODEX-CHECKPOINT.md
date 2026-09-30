# Codex checkpoint — 30 September 2026

Branch: `codex/step-7-safety-and-yard-buildings`.
Claude owns `docs/TASKS.md`; Codex has not edited it.

## Ready for review

- **T1 — done, coordination sync:** merge commit `6cb0c6d65ea7447da720c15032a896e2b05898b6`,
  importing `origin/claude/coordination` at `3a4a991a5367cb6cd1d9124ab372bbd27dbc6065`.
  Actually run: `git fetch origin`, `git merge origin/claude/coordination`,
  `npm test` (145 passing tests in 20 files), `npm run build` (passed).
  No browser checks rerun for T1; Claude's verification is imported evidence,
  not a new Codex result. Published through the connected GitHub account; CLI push lacked credentials.

- **T2 — done, `5645f2997de8d1f52fc4af15d4e3e399da959996`:** ground plans
  expose a circle query over actual grading jobs, including side batters;
  machines and barrow use those cells plus the 0.5 m configured margin.
  Removed the player obstacle; `worksBuilt` puts their feet on the new surface.
  Wording now starts with "Move…". README and module guide updated; shared
  browser setup accepts portable Playwright/URL overrides and uses 320×180.
  Actually run: targeted earthworks/ground/planner tests, then `npm test`
  (147 passing in 20 files), `npm run build`, `git diff --check`, and
  `timeout 600 node docs/handover/browser-checks/footprint.mjs` with headless
  Chromium/SwiftShader on port 5184. All final checks passed, no page errors.
  Browser: real canvas confirm click built a road at the start post (40,60),
  feet 0.150 m above the surface; filling a hollow raised feet from -0.356 m
  to 0.172 m, again 0.150 m above the new surface. Pointer lock was stubbed,
  aim/placement set by code, dev money and supplied gravel used.
  Not verified: manual pointer lock/aiming, normal-money opening loop, phone.
  An initial raised-road test fixture lacked fill material; supplying enough
  gravel corrected the fixture and the test passed. No defect was hidden.

- **T3 — done, `a13bb10d9fa5f31639b11fba16cb324a8e3d4dd6`:** added
  `ONLY_MINI=1` to isolate phases T3/T4 of `ramps.mjs`, portable module/URL
  overrides, progress output, explicit reached/error assertions, larger frame
  budgets, and browser cleanup. Gameplay, track speeds and slope limits unchanged.
  Actually run: `ONLY_MINI=1 timeout 1200 node docs/handover/browser-checks/ramps.mjs`
  using Playwright override and port 5184, 320×180 headless Chromium/SwiftShader.
  Both ramps built with canvas confirmation clicks, exact labour prices ($240,
  $100) and material conservation. Mini digger reached the 16.866% ramp's top
  in 144 measured drive frames: (101,60) to (92.78,60), surface -1.22 to -0.02 m.
  The 6.386% ramp took 216 measured drive frames: (99,60) to (121.06,60),
  surface -1.22 to 0.10 m. No browser errors; process exited successfully.
  `npm test` (147 passing), `npm run build`, `node --check` on the script and
  `git diff --check` also passed before publication.
  Explanation: isolated phases complete through the Assisted held-key path with
  the expected yaw. Mini tracks are configured at 1.1 m/s; the prior report's
  aggregate software-rendering timeout was not reproduced as a slope/control
  defect. The original run's exact timing is unknown. Larger test budgets leave
  margin, not a gameplay speed increase. Pointer lock stubbed, aim/placement set
  by code, dev money and supplied material used. Not verified: Direct-mode
  driving, manual controls, full tractor-plus-mini script or ramp save/reload
  in this run. The script's "T4" phase is a ramp phase, not queue task T4.

- **T4 — done, `fc332664a2c494c935ab09f825375bb9debf6f48`:** added five
  `after-*.png` files alongside the five untouched `before-*.png` files in
  `docs/handover/screenshots/paint/`. All ten decode correctly at 960×540.
  `capture.mjs` supports `CAPTURE_VIEWS` to isolate a view and `CLEAN_SHOTS=1`
  to hide transient feedback in screenshots; camera/model placements are unchanged.
  No paint, shader or model assets changed in T4.
  Actually run: the full `TAG=after timeout 600 node .../capture.mjs` saved the
  rusty lineup, then hit the 600 s bound (exit 124) waiting for frames for the
  used lineup. Fresh isolated 600 s runs passed for `used-lineup`, `rusty-close`,
  `used-close` and `rusty-tractor-chase`, with CLEAN_SHOTS and no browser errors.
  A clean isolated `rusty-lineup` retry also timed out waiting for frames; the
  final rusty lineup is the saved image from the first run, with delivery/mentor
  overlays partly covering the right-hand machines. The other four are clean.
  All runs used the portable Playwright override, port 5184, low graphics,
  320×180 setup and real 960×540 screenshots. Placement/aim set by code and
  dev money used; this is not a manual pointer-lock or driving verification.
  Also run: `node --check` on capture.mjs, `npm test` (147 passing in 20 files),
  `npm run build`, `git diff --check`, PNG decode/dimension checks, and exact
  Git blob hash checks for all five uploaded images. Final checks passed.
  Not verified: a successful single-process five-view capture, clean rusty
  lineup capture, hardware GPU rendering, or an identical-seed/pixel baseline.

  **Visual note:** rusty bodies retain yellow/red/mint paint instead of the
  earlier overall orange rust appearance; seams and chips are visible. The
  rusty trailer/dumper look pale, and broad grey mud on tyres/tracks obscures
  dark rubber/steel detail. Used panels still look fairly flat/pale, although
  chips and lower-body dirt are present. No missing texture is apparent in these
  views. HUD/lighting/time and terrain seed differ from the before images, so
  this is a qualitative comparison. Paint observations are for Claude's review.

## Decisions and session setup

- CLI push failed for lack of credentials. The connected owner account has push
  permission; publish equivalent Git trees/commits with preserved merge parents,
  and fast-forward only the Codex ref. Keep unpublished local commits on a local
  backup branch and continue from the fetched published branch.
- Continued from `d0b4e15`, using a copy of the existing clean checkout in this
  session's writable workspace. Published history is preserved.
- The existing remote fetch configuration only included two branches. Added
  `claude/coordination` to the local fetch configuration, then repeated the
  required fetch and merge. No conflicts.
- Interpret "never merge" as no integration into other branches; the explicitly
  required coordination merge into the Codex branch is allowed.

## Verification imported from Claude

The coordination merge includes the planner confirmation fix and Claude's
verification reports/scripts in `docs/HANDOVER.md`. Save/reload with Continue,
level areas, clock on blur/hidden windows, pickup driving after reload, and
dumper plus tractor/trailer climbing both ramps are no longer outstanding.
Codex did not independently rerun those checks this session.

## Outstanding checks and risks

- **Next: T5**, normal-money fresh-save dig/haul/sell loop and measured pacing.
- T6–T8 remain queued after T5, per `docs/TASKS.md`.
- Footprint means the grading job cells requested by T2; heap sourcing and
  spoil deposition retain their existing separate paths.
- Real pointer lock and manual mouse aiming remain unverified.
- Large cuts still place one spoil heap; road goals and prices await T8.
- Terrain saves retain their existing millimetre quantisation.
- Touch controls and phone performance remain outside this task queue.

## Previous work

`d0b4e15` implemented per-site workshop and bulk fuel commissioning, shop/world
signs, maintenance and fuel discounts, finite-width refusal and the heap-source
reach fix. Its player obstacle and six-metre clearance approach is superseded
by T2. Prior Codex browser checks and their limitations remain documented in
`docs/HANDOVER.md` and `docs/handover/browser-checks/checkpoint.mjs`.

## Session stop

Stopped after the three counted tasks T2, T3 and T4; T1 was the sync task.
No further queue work started. No decision is required for this batch.
Only the Codex branch is published, via normal fast-forward GitHub ref updates.
CLI push lacked credentials; publication through the connected owner account
succeeded. Later task commits/checkpoints were fetched back, their exact trees
and ancestry checked, and the local branch advanced to the published descendant.
The task list blob remains `5c036898d1c0d96f2dd103e840b44e7b45f639a2`,
unchanged from Claude's coordination branch. No PR or deployment created.
