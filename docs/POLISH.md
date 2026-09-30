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
- [ ] S2 Sound: listen-free checks only so far. Done: turbo whistle (used excavator, truck),
      load layers in the engine note, gravel crunch under tracks, relief-valve squeal and engine
      bog when a digger's lever is held at the end of its stroke (with a clunk as it bottoms out),
      stronger wind and no birdsong in rain. Next: gear whine in the truck, the tractor's PTO
      and a proper tipper-ram sound
- [ ] M2 Blender: the biggest remaining model issues from the studio shots (the used truck and
      excavator look too clean and toy-like up close: panel gaps, grime in recesses)
- [ ] V1 Countryside: hedges done (one continuous hedge with oaks). Next: the far hills are
      smooth green domes (field patterns, hedge lines up their sides), and a few farm buildings

## Done

- [x] U10 Laptop open: notifications pop up bottom right above its taskbar — `89574af`
- [x] N1 Milestones app on the laptop (summary, perks, groups with progress), dock badge,
      one merged toast for a burst — `15274c2`
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
- [x] M3 Scraped bare-steel floors in the tipper beds (truck, dumper skip, trailer), rust on
      the old ones — checked from above in studio shots
- [x] Tractor wheel discs were see-through on the left; truck tipping ram poked through the bed
      floor (fixed in the model files and blender/truck.py); lamps look off by day; quarry dust
      on everything facing up
- [x] U5 HUD: money, place, date and weather (with an icon) in one panel top right, goal card
      folds away fully, repeated messages merge (×N); checked in hud.mjs shot
- [x] W1 Weather checked in the game: grey overcast (a dome in the fog's colour, tone-mapped
      like the rest), hills melting into the mist, wet dark grass without the frosty sky
      reflections, rain streaks; weather.mjs jumps straight to the rain
- [x] U9 Prices app with news, laptop home ticker, weekly report: checked in laptop3.mjs shots
- [x] Product photos pose the diggers (boom up, rams lined up) instead of the straight-out
      export pose with rams pointing the wrong way
