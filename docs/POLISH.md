# Polish backlog (Codex takeover)

Codex continues this backlog after T9, T5, T6, T7 and D14, on `codex/continue`.
Verify tests and build before every push; inspect a bounded screenshot for visual changes.
Record commits and actual verification in `docs/CODEX-CHECKPOINT.md`. All areas below
are now Codex’s responsibility. D7’s independent 20-minute visual cycle was approved by Edouard.

Design direction: clean and quiet, like the in-vehicle and menu UI of Euro Truck Simulator 2,
Farming Simulator 25's shop and Forza Horizon's menus. Big clear numbers, few colours, one
accent, generous spacing, a sidebar for categories, real "product" pictures, and no clutter.
The laptop should feel like a real small-business laptop: a desktop with apps (the plant
dealer, the bank, the depot's prices, your fleet, your messages).

## Now

- [x] M1 Decal review completed (`70e279f`): big studio shots of every machine, rendered by the
      game (`docs/handover/browser-checks/modelshots.mjs`). Done so far: rams read as steel, chips
      scale with wear, rubber stays dark, trailer hitched properly in product photos, decals
      (model lettering, hazard chevrons, warning stickers, number plates). All machine/tier
      combinations reviewed; pickup plate, truck cab lettering and excavator stickers corrected.
- [x] S2 PTO/tipper sound (`699f1dd`): listen-free checks only so far. Done: turbo whistle (used excavator, truck),
      load layers in the engine note, gravel crunch under tracks, relief-valve squeal and engine
      bog when a digger's lever is held at the end of its stroke (with a clunk as it bottoms out),
      stronger wind and no birdsong in rain. Tractor PTO and distinct raising/lowering ram
      loops added; subjective listening remains unverified. No gearbox whine.
- [x] M2 Blender (`048d7d7`): used truck/excavator rebuilt with panel joints,
      access fasteners and subtle grime at shut lines, handles, bed/vent recesses; rigs retained.
- [x] V1 Countryside (`6888038`): hedges, field patchwork, farmsteads (with gravel-rutted tracks) and a
      patchy home field done. Parked tractors/empty trailers and scattered bales now in
      Mill/Westfield fields; solid scenery separate from the player’s fleet.
- [x] D7 Time of day (`49d20a1`): approved independent 20-minute visual cycle, saved phase,
      moving sun, dawn/dusk/night, weather-aware night sky and automatic work light.
      Economic day stays two minutes; speed controls leave daylight at normal pace.

## Done

- [x] V1 (part) Four farmsteads by the lanes (house, barn, silo, bales, yard, track to the road), on the map too — see git log
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
- [x] Farmsteads (from the overnight pass) checked in the game and fixed: the yard and tracks
      were flat grey slabs with grass tufts on them (now the game's ground: gravel wheel ruts
      with grass up the middle, packed earth fading to grass), the barn read as mint glass
      (painted steel now), bales were flat yellow (straw texture; black-wrapped silage at some
      farms); farms.mjs check
- [x] Cab views (cabs.mjs): windscreen dust with wiper arcs, black plastic darkened to charcoal
- [x] D13 Staff (laptop Staff app): posts open with progress ($3k earned and 3 machines; then
      $20k, 5 machines, reputation 4; then $60k, 7 machines, reputation 7); applicants with four
      skills (digging, driving, selling, fixing) and a wage to match; roles: digger operator
      (digs the field where the digger's parked, the arm animates, sorts heaps by material if
      skilled), haulage driver (loads from the heaps, drives to the depot and sells in the best
      bay; the vehicle leaves and comes back), sales (more per load, takes board jobs), fitter
      (services and repairs, cheaper); wages daily, agency fee, notice; tested; staff.mjs (laptop)
      and stafffield.mjs (the operator digging and heaping, the truck gone to the depot) checked
- [x] D14 Staff (`72f506e`): a driver could also deliver to jobs-board customers and fill a regular
      customer's order on purpose; morale or experience that grows with work; an operator
      loading the truck directly (digger and driver working together)
- [x] D12 Insurance cover is a choice (Fleet app): none, basic (half of each repair paid, the
      old weekly rate, the default) or full (85% paid, dearer); changes start at the weekly
      renewal so it can't be switched on for one repair; tested; cover.mjs shot checked
- [x] Milestones for hire, regular orders and the credit rating; tipping oil sound
- [x] U12 Pause screen: scene darkened from the left, HUD hidden, a card with the company,
      day, weather, balance, machines, earnings and current goal; notifications move to the
      bottom right whenever any overlay (map, laptop, menus) is open; menus.mjs check
- [x] D11 Wolds Trader (second-hand adverts) on the laptop: private sellers list machines for a
      few days, cheaper than the dealer for the condition they claim, but some overclaim; a
      mechanic's look ($25) shows the truth; bought machines arrive in their real condition
      (Ray tells you if you were had); tested; trader.mjs check
- [x] D10 Hiring out machines: from three machines, contractors ask to hire a kind you own
      for a few days (about 4% of its price a day, paid on return, some wear); the machine
      leaves the yard and comes back; Fleet app card and badge, Coming up, Messages, bank
      statement; tested; hire.mjs check
- [x] V2 Depot and yards: weathered grey blocks, working-sized heaps in the bays (capped), and
      yards worn through to packed dirt in patches, darker where driven hard; farms.mjs
- [x] Wet ground stops the dust: low dark mud spray from wheels in the rain (not
      screenshot-checked: needs driving in rain)
- [x] D9 Credit rating: rises in credit and with loans paid off, falls each morning overdrawn;
      scales the borrowing limit and loan rates; Bank app, Messages, toasts; tested
- [x] U11 Bank: the last fortnight's profit as a chart (bars up for profit, down for loss,
      today paler, the fortnight's total, a hover card per day); bankchart.mjs check
- [x] D8 Regular customers: standing orders from reputation 4 (weekly quota, paid each week
      it's met, reputation lost for a short week), on the Jobs board and the home Coming up
      card; tested; checked in regular.mjs shots
- [x] Market news follows the forecast (no wet-week story in a heatwave); tested
- [x] Laptop notifications: three at most, newest by the taskbar; checked in milestones.mjs
- [x] U9 Prices app with news, laptop home ticker, weekly report: checked in laptop3.mjs shots
- [x] Product photos pose the diggers (boom up, rams lined up) instead of the straight-out
      export pose with rams pointing the wrong way
