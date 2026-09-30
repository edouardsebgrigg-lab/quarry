# Polish backlog (Claude's loop)

Claude works this list on `claude/coordination`, one item per iteration, alongside Codex's
gameplay queue in `docs/TASKS.md`. Each iteration: take the first unchecked item, build it,
verify it (`npm test`, `npm run build`, and for anything visual a bounded in-game screenshot
that Claude looks at and judges), commit, push, tick it here with the commit, and add anything
new that was noticed. Keep the game logic separate from the UI and 3D, balance numbers in
`data/*.json`, and tests next to new rules.

Claude owns these areas while the loop runs (Codex leaves them alone): the laptop and its apps
(`src/ui/game/laptop/`, the old `shop.js` and `market.js`), the HUD, settings and menus, sound
(`src/audio/`), models (`blender/`, `assets/models/`) and the renderer and weathering.

Design direction: clean and quiet, like the in-vehicle and menu UI of Euro Truck Simulator 2,
Farming Simulator 25's shop and Forza Horizon's menus. Big clear numbers, few colours, one
accent, generous spacing, a sidebar for categories, real "product" pictures, and no clutter.
The laptop should feel like a real small-business laptop: a desktop with apps (the plant
dealer, the bank, the depot's prices, your fleet, your messages).

## Now

- [ ] M1 Model realism pass (in progress): big studio shots of every machine, rendered by the
      game (`docs/handover/browser-checks/modelshots.mjs`). Done so far: rams read as steel, chips
      scale with wear, rubber stays dark, trailer hitched properly in product photos, decals
      (model lettering, hazard chevrons, warning stickers, number plates). Next: check the
      decals on every machine and fix placement
- [ ] U5 HUD: cleaner top bar (money, date and time, speed) and goal card, in the laptop's style;
      the message log sometimes shows the same line twice
- [ ] S2 Sound: listen-free checks only so far. Next: a turbo whistle on the used excavator and
      truck, exhaust note that follows load, gravel crunch under tracks
- [ ] D2 Fleet app: call out a mobile mechanic to service or repair a machine where it stands,
      for a call-out fee (data in `data/machines.json`), with tests
- [ ] U7 Main menu: same style as the laptop and settings
- [ ] M2 Blender: the biggest remaining model issues from the studio shots (the used truck and
      excavator look too clean and toy-like up close: panel gaps, grime in recesses)

## Done

- [x] U1 Laptop shell with apps (B dealer, M prices, office laptop home) — `3183757`
- [x] U2 Plant dealer: categories, product photos rendered from the game's models, detail page
      with specs against yours, upgrades, yard buildings, two-click sell — `3183757`
- [x] D1 Bank: statement of every payment, loans with daily repayments and a credit limit
      (`src/economy/bank.js`, tested) — `3183757`
- [x] U3, U4 Fleet and Messages apps, fed by a new logbook (per-machine work, daily summaries,
      Ray's texts; `src/game/logbook.js`, tested) — `9a23f58`
- [x] U6 Settings rebuilt with tabs, value readouts, segmented choices, grouped keys — see git log
- [x] S1 (part) Reversing and travel alarms on site plant — `2e3a52a`
