# Quarry — handoff from Codex to Claude

Prepared 2 October 2026 (Australia/Sydney). Edouard requested this handoff so Claude can continue development from the completed local work.

## Start here: the latest code is on GitHub

Repository: `edouardsebgrigg-lab/quarry`.

- Working and published branch: **`codex/continue`**.
- All gameplay and development receipts through **`c535a1106e2cc713b76c23ae89cc62c039b1c7fd`** were successfully pushed on 2 October 2026. The successful-publication receipt and this handoff follow as documentation commits on the same branch.
- Latest gameplay implementation: **`09bd6a9`**, followed by checkpoint/publication receipts.
- Codex started from Claude coordination at **`ad7a7ed5636cd807d084c4ea856c15081a083ba2`**. The branch contains that baseline and all subsequent Codex work.
- Earlier HTTP 403 failures were resolved by Edouard authorizing GitHub CLI as **`edouardsebgrigg-lab`**, the repository owner. GitHub confirms write access; the normal non-force push succeeded. This was Git account access, not an approval-review rejection.
- **Do not restart from `main` or assume `origin/claude/coordination` contains the new work.** Neither of those branches was changed.

### Pick up from GitHub

In an existing clone, preserve any uncommitted work first, then:

```sh
git fetch origin
git log -5 --oneline origin/codex/continue
git merge-base --is-ancestor c535a1106e2cc713b76c23ae89cc62c039b1c7fd origin/codex/continue
```

The ancestor check must succeed. Continue from `origin/codex/continue`; use an existing clean local tracking branch or a fresh working branch, preserving other work. Do not force-reset or overwrite a divergent branch. If cloning anew, clone this repository with `--branch codex/continue`.

Local checkout:
`/Users/edouardgrigg/Documents/Codex/2026-10-01/continue-development-of-quarry-repo-edouardsebgrigg/work/quarry`

Task outputs:
`/Users/edouardgrigg/Documents/Codex/2026-10-01/continue-development-of-quarry-repo-edouardsebgrigg/outputs`

The output **`quarry-codex-continue.bundle`** remains an incremental recovery copy requiring baseline `ad7a7ed`. GitHub is now the practical pickup route. The packed editable Blender file remains a separate output, not a committed repository asset; ask Edouard for it if needed.

The push used GitHub CLI's active credential helper explicitly to avoid the older macOS Keychain login. If a plain Git push still uses the old account, check `gh auth status` and configure Git to use the authenticated CLI (`gh auth setup-git --hostname github.com`) before retrying. Never paste or log tokens.

## User direction and rules

Edouard wants deeper, more enjoyable quarry gameplay, substantially improved digging/material behavior and machine controls, a larger differentiated fleet, easier first hiring, tidy menus, and thorough visual/functional review. He explicitly authorized multiple agents. Continue with **less emphasis on jobs**; contracts remain optional and company progression has clean-sale alternatives.

- Preserve the original publication restrictions: own `codex/*` branch only, no main/Claude branch writes, no force push, no merge into main, no pull requests. Obtain a changed instruction before changing that policy.
- Before every push, run **`npm test` and `npm run build`**; both must pass. Use `git push -u origin <authorized-branch>`.
- After each task, update `docs/CODEX-CHECKPOINT.md` with task ID, actual implementation commit, changes, what actually ran and what remains unverified. Update TASKS/POLISH, README controls and modules where relevant.
- Plain JavaScript ES modules, Three.js and Rapier. Keep game rules separate from 3D/UI; player mutations go through `game.actions.*`. Balance belongs in `data/*.json`; preserve material conservation, old saves and separate RNG state for new random systems.
- Review significant changes with another agent when available. Inspect screenshots yourself, fix findings and rerun affected checks. Do not call fixture-based tests a complete manual playthrough.
- Edouard rejected gearbox whine; do not re-add it without a request.

Read **`docs/CODEX-CHECKPOINT.md` from its latest sections**, then `docs/modules.md`, `README.md`, `docs/TASKS.md` and `docs/POLISH.md`. `docs/HANDOFF-TO-CODEX.md` remains useful for architecture/review/artifact packaging, but its starting branch, 246-test baseline, two-minute economy and initial staff thresholds are historical. Later entries supersede them. The early D7 line in POLISH also predates P1; use current JSON/code and the later checkpoint.

## Completed work — build on it

| Task | Implementation | Result |
|---|---|---|
| T9 | `ed765fb` | Obstacle-respecting heap sourcing and spare-spoil placement; refusal before mutation. |
| T5 | `50923aa`, `116c347` | Bounded opening-loop measurement, clearer empty-barrow hint and driveway obstruction fix. Full first-sale/first-machine timing remains incomplete. |
| T6 / T7 | `8eb45b8` / `b6af5da` | Conserved home storage bays and home weighbridge with valid load-specific depot tickets. |
| D14 | `72f506e` | Targeted staff deliveries, digger/driver pairing and saved work experience. |
| M1 / S2 / M2 / V1 / D7 | `70e279f` / `699f1dd` / `048d7d7` / `6888038` / `49d20a1` | Decals, PTO/tipper audio, initial model detailing, countryside and playable visual nights. |
| G1 | `d9ea29a` | Material resistance/cohesion/flow, finite breaker rock, conserved ruts/fill, strata and exact compressed terrain saves. |
| F1 | `1d151f9` | Eight diggers, five tractors, five separate trailers, four mobility vehicles, differentiated handling/towing/volume and legacy migration. |
| D15 | `91aa2f6` | Swept directional cutting, independent controls, precision/free look, Assisted guides, progressive/deferred dumping, working attachments and saved pose. |
| P1 / P2 / Q1 | `868c88f` | Twenty-minute business days, easier apprentice, rentals/deposits, recovery/waypoints/repeat shovel and optional-job progression. |
| M4 / F2 / U13 | `ce87233` / `4d8f5e5` / `9f87df7` | Complete Blender asset audit/detailing, corrected actual machinery fits and cleaner responsive shops/menus. |
| F3 / P3 / D16 / H1 | `b17280d` | Smoother movement/driving/camera, chosen milestone targets, actual ground survey/operating feedback and comfort/HUD controls. |
| F4 / Q2 / E1 | `09bd6a9` | Current-speed cruise, cab attachment selection and quantitative earthworks material quotes. |

**Current pacing:** business days take **20 real minutes at 1×**. The visual day independently takes 20 active real minutes; business speed controls do not accelerate the visual cycle. Save v6 rebases old calendar ticks once while preserving dates/deadlines/visual phase. D7 was approved and implemented; no new daylight decision is pending.

**First hire:** two owned machines including a digger plus two depot sales or $120 earned opens the first post, with immediate applicants. Guaranteed apprentice fee/wage are $18/$18 per day; earned skill improves without raising agreed pay. Rentals do not count as owned fleet. A real UI hire check used normal opening cash, actual digging/sales through actions and hired on day one; it did not time a full manual hauling route.

### Latest control/integration details

- **Z cruise** captures forward road speed, uses ordinary throttle/brakes and existing traction/load/towing limits, and never forces velocity. Fresh W/S/Space cancels; already-held W may be released after enabling. Pause retains target. Exit, recovery, engine shutdown and sustained lost contact cancel. Targets can fall with limits and do not silently rise. Runtime-only: reload clears cruise. Cruise cannot guarantee speed on every steep loaded descent.
- **Q tools** opens a pausing same-cab overlay with compatible attachments and actual recomputed stats. Loaded/rented/working/moving equipment is blocked with reasons. Selection rechecks the live machine then calls the existing attachment action; Save/Continue retains the attachment. The shared swap guard includes empty arm motion, slew and in-place track turning; T cycling uses it too. Custom legacy Q/Z bindings are preserved, leaving new conflicting actions unbound.
- **L survey** reads real remaining ground/loose/compacted material and uses obstacle-respecting aim or the digger working target. Operating advice derives from actual physical fullness, cutting resistance/hydraulics and towing/slip.
- **Earthworks quotes** distinguish usable cut/heap supply, surface loose volume/tonnes and compacted fill volume. Both deficits and heap radius remain visible; steep ramps show same-rise minimum run guidance. Planning keycaps are inside the quote; conflicting prompts/messages are temporarily suppressed. Preview/failed builds are read-only and exact sourcing/payment/conservation remain authoritative. Task ID is **E1**: an initial new documentation label T11 was corrected because historical T11 already meant branch coordination.

Key modules: `src/ground/`, `src/earthworks/`, `src/staff/`, `src/core/migrations.js`, `src/game/actions.js`, `src/world3d/index.js`, `cruiseControl.js`, `truckPhysics.js`, `toolSwap.js`, `src/ui/game/diggerToolChoices.js`, `diggerTools.js`; see modules for actual file locations. Tuning includes `data/handling.json` and `data/presentation.json`.

## Verification and assets

Fresh checks before the successful GitHub publication: **386 tests in 61 files** (10.62 s), `npm run build` passed in 4.36 s, working tree clean. Last native batch: **31 hauling/planning + 25 digger-tool checks**, no browser errors. Native evidence was recorded during the prior gameplay review; browser checks were not rerun for this publication/documentation update. Full tests and build are rerun before each push, including the publication receipt.

Committed evidence/reviews:

- `docs/handover/haul-tools-planning-review.md`, screenshots `haul-planning-complete/` and `digger-tools-complete/` (390 px and 130% text included).
- `docs/handover/game-feel-review.md`, prior movement/survey/comfort/target reports.
- Model/interface review and `fleet-fit-final/`, `ui-layout-complete/`, `entry-rentals/`. Actual entry/control/cab/chase/work fit checks covered all 35 current/legacy equipment variants. The later cruise/tools batch does not re-establish every fit/material/weather combination.

Output `quarry-models-reviewed.blend` is the packed editable Blender 5.2 catalogue: 42 source collections, 19 assembled variants, embedded textures and aligned hydraulic pairs. All 42 asset geometry-buffer checks passed; the in-game library is about 34.63 MB within the 40 MB budget. Preserve rig origins/transforms, lateral full-digger boom offsets, moving cargo floors/unload points and trailer hitch alignment. No models were changed in the last gameplay batches. Blender GUI opening previously failed because the Mac was locked; background creation/render/reopen succeeded.

### Running locally and repeating browser checks

Development game was left running at **http://127.0.0.1:5173/**, with current source and HTTP 200 checked. The isolated 5174 review server was stopped. No GitHub authorization is needed for local play.

```sh
npm ci                 # if dependencies are absent
npm run dev -- --host 127.0.0.1
npm test
npm run build
npx vite --config docs/handover/browser-checks/vite.test.config.mjs --host 127.0.0.1
```

The test server has no file watching/HMR: **restart after code edits**. Its asset directory is `assets`. Scripts are in `docs/handover/browser-checks/` and use `common.mjs`. Set `OUT` to an existing evidence directory and `QUARRY_URL=http://127.0.0.1:5174/`. Current Mac paths (discover equivalents on another machine):

```sh
export PLAYWRIGHT_MODULE=/Users/edouardgrigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/Users/edouardgrigg/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell
export CHROMIUM_ARGS='["--use-angle=metal","--in-process-gpu"]'
export QUARRY_URL=http://127.0.0.1:5174/
export OUT=docs/handover/screenshots/your-review
mkdir -p "$OUT"
node docs/handover/browser-checks/haul-planning.mjs
```

Use a 600-second subprocess bound where available. SwiftShader stalled on this Mac; native ANGLE Metal worked. Capture after fonts/modal transitions settle; inspect the final images, including after Continue. `digger-tools.mjs`, `f3-feel.mjs`, `game-feel.mjs`, `hud-comfort.mjs`, `personal-target-ui.mjs`, `fleet-fit.mjs`, `ui-layout.mjs`, `ui-layout-small.mjs` and `entry-rentals.mjs` cover different affected systems.

Browser checks use low graphics, muted audio, simulated pointer-lock transitions and labelled placement/cash/state fixtures. Some use actual keys/UI actions and real cuts/material transfers; these remain bounded scenarios. Native OS pointer lock, subjective audio, high/ultra graphics, touch gameplay and a long manual loaded-hauling/economy session remain unverified.

## Suggested next work, in order

These are proposed priorities for the existing broader refinement request, not newly promised features:

1. Confirm checkout/bundle SHA, read latest receipts, run baseline tests/build and play the current version. Do not repeat completed feature implementations from the historical handoff queue.
2. Finish the outstanding **T5 manual normal-money opening loop**: time first sale, first machine and first hire using actual walking/barrow/driving controls. The old scripted hedge return was an automation blocker, not proof manual steering was defective; later controls/balance have changed. Record real friction before adjusting JSON.
3. Run longer loaded routes and digging sessions: starts/brakes/reversing, trailer grades, cruise cancellation and descent limits, Direct/Assisted digging in multiple strata, breaker-to-rubble-to-bucket workflow, stockpile loading, ramp/road sourcing, staff pairing and Save/Continue after genuine work. Fix reproducible gameplay friction with focused tests and independent review.
4. Listen to engines/hydraulics/PTO/tipper audio and assess night readability, camera comfort and menus at ordinary and larger text settings. Existing muted tests do not establish fun or sound quality. Keep visual UI uncluttered; avoid adding jobs as the main source of depth.
5. Then propose a small cohesive next depth/fun batch based on those findings. Further content/endgame and long-session balancing are still future work; no pending code edits or half-finished feature branch exists at this handoff.

If Edouard wants the **claude.ai playable artifact** updated, only a Claude session can republish it. Current local updates have **not** been republished there. Packaging from the original handoff remains:

```sh
VITE_MODEL_EXT=gltf.json npx vite build --outDir <artifact-output-dir>
node docs/handover/web-models.mjs <artifact-output-dir>
```

The artifact host cannot serve GLB or fetch data/blob URLs; this emits glTF JSON geometry and shared texture files. Keep normal development/build unchanged. Repository write-access repair and artifact publication are separate operations.
