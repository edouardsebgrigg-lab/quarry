# Codex checkpoint — 30 September 2026

Branch: `codex/step-7-safety-and-yard-buildings`.
Claude owns `docs/TASKS.md`; Codex has not edited it.

## Ready for review

- **T1 — coordination sync:** merge commit `6cb0c6d65ea7447da720c15032a896e2b05898b6`,
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

- T3: mini digger climbing both ramps.
- T4: five matching paint after shots and visual comparison.
- T5: normal-money fresh-save dig/haul/sell loop and measured pacing.
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
