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
- [ ] S2 Sound: listen-free checks only so far. Done: turbo whistle (used excavator, truck),
      load layers in the engine note, gravel crunch under tracks, relief-valve squeal and engine
      bog when a digger's lever is held at the end of its stroke. Next: wind in the open, birds
      on a fine morning, a distant road; metal clank when the bucket hits rock
- [ ] W1 Weather: first rain shot: the sky stayed blue and the wet grass looked frosted (sky
      reflections). Fixed with a grey overcast dome in the fog's colour and far less sheen on
      grass; re-shoot (weather.mjs now jumps straight to the rain) and judge
- [ ] M2 Blender: the biggest remaining model issues from the studio shots (the used truck and
      excavator look too clean and toy-like up close: panel gaps, grime in recesses)
- [ ] M3 Scraped bare-steel floors in the tipper beds (truck, dumper skip, trailer) as decals:
      check them in the studio shots and from the digger cab when loading
- [ ] V1 Countryside: the hedgerow trees read as small round blobs at a distance; the far hills
      are smooth green domes. Taller, more varied trees and field boundaries
- [ ] U9 Laptop: a proper look at the Prices app with news (laptop3.mjs) and the weekly report

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
- [x] D2 Mobile mechanic call-out from the fleet app (quote, fee, tested) — `4204835`
- [x] S2 (part) Used machines sound smoother; turbo excavator — `ea271cc`
- [x] D3 Jobs board: delivery contracts with bonuses and deadlines (`src/contracts/`, tested) — `2e85ac2`
- [x] U7 Main menu: checked; already clean, left as it is
- [x] U8 Laptop dock badges (unread messages, open offers); in-game job and summary messages
- [x] Jobs board reputation (bigger bonuses and more offers as you build a name)
- [x] Company name on the intro card (laptop, bank)
- [x] D4 (part) Weekly machine insurance, shown in the dealer and fleet apps
- [x] U5 (part) HUD job tracker under the goal card
- [x] Used-tier paint gets a clear coat
- [x] Weather: forecast, overcast sky, fog, rain streaks, wet ground, less grip, rain sound (logic tested; visual check is W1)
- [x] D5 Daily summary names the prices that moved most; a weekly report every seven days (best
      day, top earner, bank balance) — `c38af33`, `0df1066`
- [x] D6 Market news: local stories move one material's price for a few days (tested), in
      Messages, the Prices app and a ticker on the laptop home — `eeae0b3`
- [x] Product photos pose the diggers (boom up, rams lined up) instead of the straight-out
      export pose with rams pointing the wrong way
