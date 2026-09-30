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

- [ ] U1 Laptop shell: a desktop with app icons, a task bar (clock, balance) and app windows;
      opens from the office laptop (E) and B. Replaces the separate shop and price windows
- [ ] U2 Plant dealer app: a sidebar of categories (Diggers, Carriers, Upgrades, Yard buildings,
      Sell), product cards with pictures of the real models, a detail pane with specs compared
      with what you own, and a clear buy button
- [ ] D1 Bank app with depth: account balance, a statement of money in and out, and loans you
      can take and repay (fixed daily repayment, interest), with tests. Replaces the silent
      overdraft as the way to borrow; the overdraft stays as an emergency
- [ ] U3 Fleet app: every machine with its condition, hours, value and fitted upgrades; sell here
- [ ] U4 Messages app: Ray's texts and a daily summary (sold, spent, profit)
- [ ] U5 HUD: cleaner top bar (money, date and time, speed) and goal card, in the same style
- [ ] U6 Settings: tabs (Controls, Display, Sound, Game, Keys) in the same style
- [ ] S1 Sound: diesel engines with load and turbo, a reversing beeper on site machines,
      hydraulic whine that follows the lever, track clank
- [ ] M1 Model realism pass: close in-game shots of each machine, list what looks fake, fix the
      biggest things in the Blender builders, rebuild, recompress (`blender/compress_textures.py`)

## Done
