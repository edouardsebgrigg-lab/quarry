# Codex checkpoint — 30 September 2026

Base: exact Claude handover `a0fae6c2584541b34e167acb80830f6d92eaa14d`.
Branch: `codex/step-7-safety-and-yard-buildings`. No merge.

## Step 7 audit and corrections

- Remote files contained the earthworks logic, planner, HUD, tests and preserved smoke scripts.
- Player feet now join the live obstacle list, checked again on confirmation. Clearance covers
  the ground algorithm's six-metre side-batter reach instead of three metres.
- Nonfinite widths are refused before terrain computation.
- Heap sourcing now enforces the configured distance from the strip: the old midpoint circle
  could take material more than 30 m from it. Refused construction changes no money or material.
- Ground dirty chunks rebuild visual meshes and Rapier heightfields. Built gravel is fed to
  the existing surface/grip code. These connections were inspected; Claude's prior pickup
  road/ramp driving reports were not independently rerun in this checkpoint.

## Step 8 first batch

Container workshop and bulk fuel commissioning, per-site saved ownership, shop tab, visible
signs on existing structures, cheaper/faster maintenance and discounted timed/Direct job fuel.
Already running maintenance jobs keep their quote. Facilities reuse existing yard collision
footprints. Prices and discounts are provisional; no inventory/refuelling simulation is claimed.

## Validation actually performed

- `npm test`: 144 passing tests in 20 files.
- `npm run build`: successful.
- New browser script `docs/handover/browser-checks/checkpoint.mjs`: headless Chromium 134,
  software WebGL, stubbed pointer lock, code-set planner points, real shop button clicks.
- Built road, ramp and level area through planner confirmation. Checked exact labour charges
  and per-material conservation immediately across construction.
- Bought both facilities through the Yard buildings shop and checked visible signs.
- Saved to `slot1`, reloaded the page and used Continue. Checked money, construction counts,
  facility ownership, gravel surfaces and firm flags, and all sampled heights within 4 mm.
  Existing saves quantise every natural layer and loose thickness to millimetres; exact
  floating-point equality is not the save contract. A first overly strict equality check
  exposed a 1 mm difference; the documented tolerance corrects that test assumption.
- No browser page errors in the successful final run.

Run the new script with installed Playwright, or set `PLAYWRIGHT_MODULE` to its module path.
Start the portable test config first. `QUARRY_URL` overrides the default localhost URL.
The other preserved Claude scripts still contain environment-specific paths.

## Outstanding checks and risks

- Real pointer lock/mouse aiming; fresh normal-money dig/haul/sell loop and measured pacing.
- Other machines on ramps, post-load driving and vehicle paint comparison.
- Blur/hidden-window behaviour remains unit-tested only.
- Spoil from a large cut remains one potentially inconvenient heap. Road goals and prices
  remain unbalanced. Saves use the existing lossy terrain encoding.
- This is a desktop-controls game. Hosting makes it accessible remotely, but touch controls
  and phone performance have not been implemented or verified.

## Publication

GitHub connector permission is pull=true, push=false. Cloud Git reads succeed, but a dry-run
push failed with `unable to get password from user`. GitHub branch publication and draft PR
remain blocked until a write-capable account/credential is connected. No Claude prompts sent.
An independently hosted private preview is being published via Sites at the user's request;
it does not imply GitHub push access.

## Next reviewable batch

Finish post-load pickup and tracked-machine ramp checks. Then add home stockpile bays:
preview/validate fixed yard footprints, buy once per site, segregate stored material with
conserved transfer-in/out, persist inventories, show bay contents in the world and map. Keep
home weighing as a following checkpoint. Defer office/operators, security/events and crushing
until their planned dependent milestones. Touch controls are a separate phone-play batch.
