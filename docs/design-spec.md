# Quarry Mining Simulator — Design Spec

*Status: draft for review. Numbers here are **starting targets**. The real values live in `data/` and get tuned with the balance tester.*

## 1. The pitch

A PC quarry tycoon game. You start with a rusty excavator, a rusty truck and a roadside gravel pit. At first you do the digging and hauling yourself. Slowly you save up for better machines, hire operators, automate, buy richer sites, and end up running several quarries from a manager view. You can still jump into any machine and drive it.

## 2. Design pillars

1. **Every upgrade is a big jump.** Each machine tier is about 2.5–3× better. The shop always shows before and after (`Dig speed 3 → 8 t/min (×2.7)`).
2. **Saving up is hard and it matters.** Machines, sites and operators are expensive. Choosing what to buy next is the core decision.
3. **Fix the bottleneck.** Dig → haul → crush → sell is a chain. The game shows which link is slowest. Fixing it gives a visible jump in income.
4. **Pressure, not punishment.** You can go into debt, but the game never ends.
5. **Fun and working beats polish.** It's a personal project. Keep things small.

## 3. Tech decisions (locked)

| Topic | Decision |
|---|---|
| Language/tools | Plain JavaScript (ES modules), Vite, Vitest for tests |
| 3D (later) | Three.js, loading your Blender `.glb` models, aiming for realistic graphics |
| Physics (later) | Rapier (a proper physics engine that runs in the browser), for driving and collisions |
| Desktop app (last) | Electron |
| Game logic | Runs separately from the screen at a fixed 10 ticks per second, with seeded randomness so tests and the balance tester give repeatable results |
| Before 3D | HUD and panels, plus a **2D top-down site view** drawn on a canvas |

We are **not** planning a Godot move. It would mean rewriting all the code.

## 4. Core loop

```
 DIG ──► face pile ──► HAUL ──► yard (stockpile) ──► [CRUSH] ──► SELL / CONTRACT
 (excavator)            (truck / conveyor)            (crusher)
```

- **Dig:** the excavator scoops rock from the current zone into a small pile at the rock face.
- **Haul:** the truck loads from the face pile, drives to the yard and unloads. It's one job with a progress bar.
- **Crush (from site 2 onward):** turns raw rock in the yard into a graded product worth more.
- **Sell:** sell yard stock on the open market, or deliver it to a contract. A **delivery cost per tonne** is taken off, based on how far the site is from market.

### Manual work = timed jobs
- Each action (Dig, Haul, Crush, Drill, Blast, Repair) is a **timed job with a progress bar**. Better machines mean faster jobs and bigger loads.
- Holding the hotkey repeats the job.
- **You are one person.** You can only run one job at a time. While you're hauling, nobody is digging. That pain is what makes hiring your first operator feel great.
- Operators later run the **exact same job functions** on a loop. The future 3D driving will call them too.

## 5. Time

- An in-game calendar. **One game day ≈ 2 real minutes** at 1× speed. The HUD shows `Day 12 · 14:30`.
- Speed controls: **Pause, 1×, 2×, 4×**.
- Things that happen daily: wages, loan interest, conveyor upkeep, new contracts, new operator candidates, market drift.
- No offline or idle progress. The game only runs while you play.

## 6. Sites

Every site is **for sale from the start**, but at a huge price. Deeper rock at better sites is also too hard for weak machines, so buying early is pointless. You need the site *and* much better machinery.

| # | Site | Price (target) | Main rock | Distance to market | Notes |
|---|---|---|---|---|---|
| 1 | Roadside Gravel Pit | owned at start | sand, gravel | very close | shallow, cheap, soft |
| 2 | Old Limestone Quarry | ~$25k | limestone, some granite | close | crushing starts to matter |
| 3 | Granite Hills | ~$250k | granite, marble pockets | medium | needs drilling and blasting |
| 4 | Deep Mountain Quarry | ~$2M | marble, iron, copper | far | hauling and delivery costs matter |
| 5 | Rare Vein Site | ~$20M | gold ore, gemstones | far | endgame, very hard rock |

### Site layout
- Each site has a few **zones** (4 at the Gravel Pit, 8–10 at later sites). Each zone has **layers** going down, about 2 m each.
- Each layer has a **rock mix** (e.g. 70% gravel, 30% sand) and a **hardness** (1–10). Deeper layers are harder and worth more.
- Sites are **finite**. When every zone is dug to the bottom, the site is exhausted. It takes a long time, and you usually move on before then because the next site is richer.
- You **keep every site you buy**. You are physically at one site at a time, where you do manual work. Other sites run on their operators. Switching sites is instant.
- Each site has a **yard** with a stockpile limit. You can upgrade it.

### Geology surveys (mid game)
- Unsurveyed zones only show their top layer.
- Paying for a survey (it takes a few game hours) reveals all layers in a zone, including hidden **rich pockets**.
- This makes "where do I dig next?" a real choice.

## 7. Rock and products

| Rock | Hardness | Base $/t (target) | Crushed product(s) |
|---|---|---|---|
| Sand | 1 | 4 | — |
| Gravel | 2 | 6 | Graded gravel (×1.6) |
| Limestone | 4 | 12 | Aggregate (×1.7), Agricultural lime (×2.2) |
| Granite | 6 | 25 | Crushed granite (×1.8) |
| Marble | 7 | 45 | Marble chips (×2.0) |
| Iron ore | 7 | 70 | Iron concentrate (×2.5) |
| Copper ore | 8 | 120 | Copper concentrate (×2.5) |
| Gold ore | 9 | 600 | Gold concentrate (×3.0) |
| Gem rock | 9 | 1,500 | — (sold raw) |

Better crushers unlock the higher-value product grades.

## 8. Machines

Five types, each with five tiers: **Rusty → Used → Standard → Heavy → Mega**.

| Type | What it decides | Key stats |
|---|---|---|
| Excavator | how fast you dig, and the hardest rock it can break | bucket (t), cycle time (s), max hardness |
| Haul truck | how much you move and how fast | capacity (t), speed |
| Drill rig | which rock it can drill for blasting | max hardness, drill speed |
| Crusher | turns raw rock into products | t per minute, which grades it can make |
| Conveyor | replaces a truck leg (pit → yard) | t per minute, daily upkeep; needs no operator |

### Tier rules (the "big jump" rule)
- Each tier is about **2.5–3× better output** than the one before.
- Each tier costs about **4× more**.
- Higher tiers wear out slower and break down less.
- The **max hardness** an excavator can dig goes up with tier (Rusty 3, Used 4, Standard 5, Heavy 7, Mega 8). Harder rock must be blasted.
- Standard, Heavy and Mega tiers are **unlocked by research**.

### Buying and owning
- **Unlimited machines**, but each one is expensive.
- **Every machine needs someone to run it**: you (one at a time) or a hired operator. Conveyors are the exception.
- Sell old machines back for part of the price, depending on condition.
- **Cheap upgrades (mods)** fill the gaps between tiers. Examples: sharpened bucket teeth (+15% dig), patched tyres (+10% truck speed), bigger tailgate (+1 t). They're what you buy in the first few minutes.

### Fuel, wear and breakdowns
- Every job costs **fuel**, paid automatically. Fuel price drifts a little.
- Every job lowers a machine's **condition**. The lower the condition, the higher the chance of a **breakdown** on each job. Rusty machines break a lot.
- **Service** (while it's still working) is cheap. **Repairing** a broken-down machine is expensive. Both are timed jobs.

### Blasting
- **Drill** a layer, which is a timed job with the drill rig. Then **Blast**, which costs explosives.
- A blasted layer becomes broken rock that any excavator can scoop quickly, whatever its hardness.
- Big satisfying moment: sound, screen shake, and a dust cloud later in 3D.

## 9. Workforce

- A **hiring board** shows about 3 candidates, refreshed daily.
- Each operator has: a **name**, a **daily wage**, a **skill level 1–5** (about +10% speed per level, grows with experience), and **one trait**.
- Example traits: *Careful* (−30% wear), *Speedy* (+15% speed, +20% wear), *Frugal* (−15% fuel), *Lazy* (−10% speed, cheaper wage), *Mechanic* (repairs their own machine, slowly), *Veteran* (starts at higher skill, pricey).
- Assign an operator to a machine and it runs its job on a loop, forever.
- Wages are paid every day, even when an operator is idle. Operators are available from day one but pricey, so your first hire is a big decision.

## 10. Money, market and contracts

### Money and debt (soft pressure)
- Running costs: fuel, repairs, wages, conveyor upkeep, loan interest.
- Money **can go below zero**. When it does, it turns into an **emergency loan** with daily interest, and you can't buy anything until you're positive again. The game never ends.
- A **bank screen** also lets you take a normal loan (limit based on what you own) and repay it anytime.

### Market
- Each product has a price = base × **trend** × **saturation**.
- **Trend:** slow ups and downs (about ±30%) you can read on a small 7-day chart with an arrow.
- **Saturation:** selling a lot of one product pushes its price down for a while. It recovers over a few days. This rewards selling several products and holding stock.
- **Stockpile limit:** your yard fills up, so you can't hold forever. Hold or sell is the real choice.

### Contracts
- A **contracts board** with new offers every day. Example: *"Deliver 60 t gravel by Day 9: $4,000 + 2 reputation."*
- Contracts pay better than the market. Missing the deadline costs reputation and a small penalty.
- **Reputation (levels 0–10)** unlocks bigger, better-paying contracts and a small bonus on market prices.

## 11. Research

- A research tree of about 20 projects in 4 branches:
  - **Machinery:** unlock Standard, Heavy and Mega tiers; drill and crusher improvements
  - **Operations:** bigger yard, conveyors, auto-sell rules, rail link (cuts delivery cost at far sites)
  - **Geology:** cheaper and faster surveys, better blasting
  - **Business:** better contract pay, lower loan interest, better resale value
- **You pay money and wait** a few game days. One project at a time.

## 12. Milestones

- Achievement-style goals with **cash rewards**. Some also **switch on new features**, which acts as a gentle tutorial.
- Examples: *First sale*, which opens the contracts board. *Earn $5,000 total*, which opens research. *Dig 20 m deep.* *Hire 5 operators.* *Own 3 sites.* *First $1M.*
- Milestones do **not** gate sites. Sites are just bought.

## 13. Random events

About six simple events, one every few days:

| Event | Effect |
|---|---|
| Heavy rain | Hauling −30% for a day |
| Price boom | One product +50% for 2 days |
| Fuel spike | Fuel ×1.5 for 2 days |
| Inspector visit | Fine if machines are in bad condition, reputation bonus if all are good |
| Lucky find | A rich pocket appears in a zone |
| Sick day | One operator doesn't turn up |

## 14. Feel and feedback

- Floating **+$** numbers when you sell, and a money counter that counts up.
- An **upgrade moment**: a before → after card with the multiplier in big letters.
- A **bottleneck marker** on the slowest link of the chain.
- Milestone pop-ups with a small fanfare.
- **Sound effects** from free (CC0) packs, added early because they're cheap and make a big difference. Music later.

## 15. Screens and controls

**Screens:** Main menu (New Game / Continue / Load / Settings / Quit) · HUD (money, date, speed, current job) · 2D site view · Shop · Machines · Workforce · Market and Contracts · Research · Bank · Sites / Manager overview · Pause menu (Resume / Save / Load / Settings / Quit to menu) · Settings (volume, key bindings, fullscreen, UI scale, autosave) · Dev panel.

**Default hotkeys** (all rebindable):

| Key | Action |
|---|---|
| D | Dig |
| H | Haul |
| S | Sell (opens quick-sell) |
| R | Service/repair current machine |
| Tab | Switch to next machine |
| Space | Pause / unpause |
| 1 / 2 / 3 | Speed 1× / 2× / 4× |
| B | Shop |
| M | Market and contracts |
| Esc | Pause menu |
| F1 | Dev panel (dev builds only) |

Game UI rules: full screen, no browser-looking bits, no page scrolling, and everything reachable by keyboard and mouse.

## 16. Late game: manager view

- One screen listing every site with its income per day, bottleneck, machine alerts and stockpiles.
- Click a site to jump there. Click a machine to take it over yourself.
- Research unlocks **auto-sell rules**, e.g. "sell granite when price > $30".

## 17. 3D world (later milestones)

- Three.js scene per site. The pit is drawn as **terraced steps** (benches) that drop as zones get deeper. No free-form terrain digging.
- **E** to get into or out of a machine. **WASD + mouse** to drive, with a chase camera and a cab camera.
- Driving triggers the same jobs: the bucket at the face calls Dig, and reaching the yard calls unload.
- Your `.glb` models replace simple placeholder shapes as you make them.

### Realistic graphics
- **Realistic materials (PBR)** so metal, rust, dirt, rock and dust look right. Your Blender textures carry straight over in `.glb`.
- **Sky lighting from an HDRI** (a real photo of the sky), sun with soft shadows, distance haze.
- **Post-processing:** ambient occlusion (soft contact shadows), bloom, tone mapping, a little depth of field.
- **Detail:** dust clouds when digging, driving and blasting; tyre tracks; a truck bed that visibly fills with rock.
- **Graphics settings** (Low / Medium / High / Ultra) so it runs on weaker PCs.
- How realistic it ends up depends a lot on your models and textures. The engine side can deliver the look.

### Driving physics
- **Rapier physics** with a proper vehicle model: suspension, tyre grip, weight and momentum.
- **A loaded truck feels heavier.** It's slower to speed up, longer to stop and leans in corners. Better tiers have stronger engines and better suspension.
- Slopes on the haul ramps matter: a heavy load going uphill is slow.
- Excavators and loaders: the tracks and body are physical, but the **arm is controlled directly** (keys or mouse move the boom, stick and bucket). Simulating a real hydraulic arm with physics is fiddly and not much fun.
- **Rocks tipping into the truck** use a small number of physics rocks for show. The actual tonnage is still counted by the game logic, so physics glitches can never break the economy.

## 18. Save / load

- 3 manual save slots plus an **autosave** every game day.
- Every save file has a **version number**. Older saves get upgraded automatically when the game changes.
- Browser build: saves in local storage. Desktop build: save files on disk.

## 19. Dev tools

- **Dev panel (F1):** add money, skip hours or days, unlock all research, max reputation, spawn machines, trigger events, fix all machines.
- **Balance tester (`npm run sim`):** a simple bot plays the game at very high speed with no screen and prints pacing, e.g. *"first upgrade: 3 min, first operator: 22 min, site 2: 48 min"*. We compare that against the targets below after every balance change.

## 20. Pacing targets

| Moment | Target (real time at 1×) |
|---|---|
| First mod bought | ~3 min |
| First Used-tier machine | ~10–15 min |
| First operator hired | ~20–30 min |
| Mostly automated at site 1 | ~45 min |
| Site 2 bought | ~45–60 min |
| Site 3 bought | ~2–3 h |
| Site 4 bought | ~5–6 h |
| Site 5 bought | ~10 h |

## 21. Out of scope (for now)

- Offline or idle progress
- Prestige / "sell the company" (maybe a post-game extra, much later)
- Seasons (maybe later, on top of the calendar)
- Free-form terrain digging (you can't carve any shape into the ground, you dig down in steps)
- Multiplayer, mods, mobile, a web release
- Deep operator systems (morale, fatigue, shifts)

## 22. Code layout

As in the original brief, plus a `tools/` folder for the balance tester:

```
(repo root)
  data/       all balance numbers (JSON)
  src/
    core/ economy/ machinery/ quarry/ workforce/ progression/   ← logic only, no screen code
    input/ ui/ world3d/                                          ← display + controls
  tools/      balance tester
  assets/models/
  docs/
```

Rules: logic modules never touch the screen. They change state and send events (`oreSold`, `machineBought`, ...). The UI only listens and sends player actions back in. Every number lives in `data/`. Each module has one public entry file. Logic modules have Vitest tests.
