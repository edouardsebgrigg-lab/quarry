# Hauling, tools and earthworks review — 2 October 2026

This batch adds optional hauling assistance, direct attachment choice and clearer earthworks feasibility. The reviewer authored the ground/earthworks supply breakdown and independently reviewed the other authors' cruise, attachment and planner integration. The existing material sourcing, build charges, fleet attachment action and save format remain authoritative.

## Logic verified

- `plan.materials` records cut, usable heaps, fill and spoil by material in tonnes. Surface supply is expressed in both loose m³ and tonnes; fill supply uses compacted m³. Each supplies `required`, `fromCut`, `fromHeaps` and `missing`. Occupied, engineered and out-of-reach heaps retain their existing sourcing exclusions. Both deficits are available even when the primary refusal names gravel first.
- New tests balance every material in a mixed-fill preview, preserve every material through the build, and demonstrate that tipping the reported missing supply makes the same raised road feasible. Failed plans/builds leave saved terrain and cash unchanged. Fill refusals quantify the compacted shortfall; steep plans explain the minimum run for the same rise and flag routes longer than one build. Changing endpoints still requires a fresh preview.
- Cruise requests ordinary throttle and service brakes. It does not force velocity or bypass cargo mass, traction, gearing or towing limits. Existing held accelerator input is allowed until release; a fresh accelerator, brake or handbrake cancels. True brake intent also cancels with W and S held together. Engine off, recovery and leaving the vehicle clear the target. Pause preserves it. Grip/slip and downhill braking limit assistance.
- Quick tools use the actual model's compatible attachments and preview each tool from base machine stats. Selection re-reads the driver and current eligibility before calling the existing attachment action. Cargo, rental and motion restrictions remain effective, and the fitted tool survives Save/Continue.

## Review findings

The initial attachment-motion guard used the old `busy()` flag, which only covered dumping. Review identified empty arm motion and then in-place track rotation as missing cases. The final shared `toolSwapBusy` gate covers jobs, dumping, moving joints, slew and actual track travel, including opposing tracks with zero average forward speed. Q and the existing T shortcut use the same gate. The panel pauses motion, so a blocked player closes it and finishes stopping before selecting a tool.

The first native planner captures exposed overlapping floating controls and messages. Controls now live inside the quote, and the planner hides duplicate hints and world feedback while active. A later 130% capture revealed overlap with the status panel; the final bounded quote sits lower, and native checks verify its controls remain inside the visible card and below status. Cruise feedback appears locally in the occupied dash instead of stacking transaction messages.

## Checks and native evidence

**77 distinct focused tests passed:** earthworks/ground/planner (41), cruise/physics/profiles (22), attachment choices and digging rules (12), and runtime swap safety (2). The integration author confirmed the final full suite: **386 tests in 61 files**, production build in 9.32 seconds and clean diff check.

- [Hauling and planning](screenshots/haul-planning-complete/haul-planning.json): 31 checks passed, no browser errors. Actual Z/pedal/handbrake/pause/recovery/exit routing, F and mouse planning, supply feasibility, real material relocation, one build charge and conservation pass. Purchases, placement and the low-speed exit setup are explicit fixtures. All five final captures were independently inspected, including the quote at 390 px and 130% text.
- [Digger tools](screenshots/digger-tools-complete/report.json): 25 checks passed, no browser errors. Actual Q/button routing, moving/settled arm eligibility, loaded and rental refusals, save/reload and 390 px/130% presentation pass. All seven recorded states were inspected; the final initial, loaded and continued 960 px captures were re-inspected and their text is clear. Final captures wait for font readiness, 350 ms of settling and a warm render; the native run used `--use-angle=metal` and `--in-process-gpu`. The script faithfully simulates browser pointer-lock requests; this establishes restored game control, not operating-system mouse capture.

Repeatable scripts are [haul-planning.mjs](browser-checks/haul-planning.mjs) and [digger-tools.mjs](browser-checks/digger-tools.mjs). Native runs were performed by the integration/UI authors and their reports and images reviewed here. They cover selected Chromium/Metal poses and viewports, not every terrain route, vehicle combination, long descent or GPU. Cruise is assistance: its capped brakes cannot promise a held speed on every steep loaded descent.
