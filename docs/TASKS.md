# Task queue

The shared to-do list for every agent. Rules for working are in `AGENTS.md`. Take the first
open task you're suited to, claim it (put your agent and branch after the title), and tick it
with the commit once it's on `main`. Add tasks you notice at the bottom of the right section.
Older queues and their history are in `docs/archive/`.

State on 2 October 2026: `main` has everything (the hand-dig start through staff, the expanded
fleet, directional digging, stockpiles, home weighbridge, day and night, cruise control and the
tool picker). 386 unit tests pass, lint is clean and the build succeeds.

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
- [ ] **P-4 The start view.** A new game opens looking up into a low morning sun that whites out
      the top of the screen. Start the player facing the field, slightly down, and check the
      sun's glare at dawn and dusk isn't overpowering.

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
