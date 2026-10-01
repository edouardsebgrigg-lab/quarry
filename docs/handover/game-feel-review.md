# Game feel and personal target review — 2 October 2026

The final survey, operating feedback, movement and personal target logic has no remaining blocking finding in this review. Personal targets select what the player follows; the existing milestone checks still award every earned achievement once, regardless of selection. Old saves default to no target, and removed milestone IDs are cleared safely.

## Findings resolved

- A real 0.003 t gravel deposit creates an 8.23 mm cover that the existing cutting rules treat as topsoil beneath loose spoil. The survey now exposes `coverMaterial` separately and displays “Gravel over Topsoil”; it preserves the original resistance and cutting rules. Reading the column leaves saved terrain unchanged.
- Bucket fullness now comes from the shared physical rule, rather than a 98% display threshold. An independent check using `bucketFill` verifies a 0.0285/0.03 m³ bucket is full at 95%, while 0.396/0.4 m³ at 99% remains open to another bite. The corresponding advice agrees with both states. A blocked breaker over loose rubble advises using a bucket.
- Sprint FOV uses actual movement, so holding sprint into a wall no longer widens the view. Independent stationary, moving and stopped sequences pass. A remembered landing creates one impulse and then decays: a 48 mm initial drop falls to 14.95 mm after six samples, without retriggering.
- At 390 px, a chosen target sits below status and its title, numeric progress, reward and next step remain visible. Home and Milestones show reachable switch/clear controls. At 130% text scale, the machine prompt stays clear of the dash and mentor.
- The independent phone review also found Ray's mentor card covering expanded default guided-goal text. The final narrow layout hides the mentor while a visible goal is present; Messages retains the correspondence. Replacement guided-goal, digger and survey captures show the complete goal unobscured, and the new actual-visibility assertion passes.

## Independent checks

**62 tests passed across nine files:** career (18), survey (4), earthworks (12), operating feedback (4), foot camera (4), player movement (5), real Rapier player (2), cab sway (2), and truck physics (11). Additional read-only assertions verified the physical bucket examples, thin cover, stationary sprint and landing decay described above. `git diff --check` passed.

The integration author separately confirmed the final full suite after the phone overlap correction: **362 tests in 58 files passed**, production build passed (3.79 s), and diff check was clean. The final native survey/operating run used the final product source on a freshly restarted port 5174.

An actual built ramp was also inspected across 48 compacted columns. Loose gravel sits above retained topsoil/clay fill, followed by remaining natural layers; depths are contiguous, mixture proportions sum to one, and layer thicknesses sum to the reported bedrock depth. This review found no new held-jump, barrow stopping, recovery, reverse-braking or cab-spring regression.

## Native evidence inspected

- [Survey and operating flow](screenshots/game-feel-final/game-feel.json): 15 checks passed, no browser errors. Actual keyboard survey toggling, excavation exposing clay, Assisted cutting, conserved ground/cargo, digger survey, chosen FOV, steady cab and chase mode pass. All four final images were inspected.
- [HUD and comfort](screenshots/feel-hud/report.json): 19 checks passed, no browser errors. Dash/survey layout uses explicit component fixtures; comfort sliders use the real settings UI and persisted state. Final 390 px guided goal/survey/dash/settings, tractor metrics and 130% dash images were inspected, including replacement phone captures after the overlap fix.
- [Personal target flow](screenshots/personal-target/report.json): 17 checks passed, no browser errors. Actual Milestones and Home clicks pin, switch and clear; Save/Continue preserves the target. Final phone HUD, Home and Milestones images were inspected independently.
- [Movement and driving](screenshots/f3-feel/f3-feel.json): 11 checks passed, no browser errors. Real key input covers one jump per held press, walking acceleration and stopping, zero camera motion, sprint FOV, taking/stopping the barrow, entering the truck, and braking into reverse. All three saved images were inspected. The [repeatable script](browser-checks/f3-feel.mjs) distinguishes debug placement and purchase cash fixtures from actual input.

## Limits

These native runs were performed by the integration/UI authors and their reports and images independently reviewed here. They cover Chromium/Metal, recorded poses and selected 390/960 px layouts, not other GPUs, every machine or a long economy playthrough. The HUD fixture is evidence of presentation, not a real hard-cut or towing incident. The survey shows up to three layer rows plus bedrock depth; the read-only API retains the complete column.

No remaining blocker was found in the final reviewed captures or code. No product code, publication or checkpoint changes were made by this reviewer during the final audit.
