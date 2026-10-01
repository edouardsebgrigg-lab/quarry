# Module guide

A short tour of the code. The logic modules never touch the screen. Each module has one public entry file (`index.js`), and other modules only import from that file.

## data/ — all the numbers
| File | What's in it |
|---|---|
| `game.json` | Tick rate, day length, speeds, starting machines (the pickup) and site, save version |
| `economy.json` | Starting money, fuel price, debt interest, resale value |
| `materials.json` | Materials you can sell (topsoil, clay, sand, gravel, mixed fill) and their base prices per tonne |
| `market.json` | How prices swing (trend) and drop when you sell a lot (saturation) |
| `machines.json` | Every machine tier's stats and price (including mass and engine power, used by the driving physics and the engine sound). Each type says what it is (`kind`: a `digger` with a bucket or a `carrier` with a bed), whether it's road-legal, whether it's sold in the shop and how it unloads |
| `mods.json` | Cheap upgrades you can fit to machines |
| `sites.json` | Your properties (just Home Field for now) and which ground plot each one has |
| `depot.json` | The selling depot: its bays, the purity grades (clean, slightly mixed) and what they pay |
| `works.json` | Earthworks: the kinds (haul road, ramp, level area) with surface, thickness, greatest slope, width range and price, plus the length limits and how far from the works loose heaps can be used |
| `ground.json` | Diggable ground: materials (density, how much they swell when dug, the slope they settle at, how steep a wall they can stand) and each plot's layers |
| `objectives.json` | The intro story and the goals (texts and rewards): the machine ladder, then the business (jobs, the yard, clean tonnes, a name, a Used fleet, $15,000) |
| `happenings.json` | Things that happen: the site inspector (how often, the fine per unfit machine, the reputation for a clean bill), rush orders (chance, days, bonus and size) and the dealer's offers (chance, discount, days) |
| `milestones.json` | Company milestones (what each measures, its target and reward, its group) and the perks some of them switch on (depot account, fuel card, trade account) |
| `tools.json` | Hand tools: how much a shovelful and a wheelbarrow hold (loose m³), reach, dig and tip times, pushing speeds |

You can change any of these and reload the game. No code changes are needed.

## Logic (no screen code)
| Module | Job |
|---|---|
| `src/core` | Game clock (ticks, days, hours), event bus, seeded random numbers, save slots with version upgrades |
| `src/economy` | Money and debt, market prices, fuel, and the depot: weighbridge tickets, grading a load by purity, paying for it |
| `src/quarry` | Which sites you own, and helpers for loads (a load is `{ material: tonnes }`) |
| `src/ground` | The real, diggable ground: a grid of soil columns with layers; digging carves bowls and returns tonnes by material, dumped material piles up and slumps to its natural slope, undercut walls cave in; `planWorks` / `buildWorks` grade a strip (road, ramp, level) with side batters, conserving every tonne: cut first, then fill, then a gravel surface, then loose heaps within reach for what's missing, and the rest heaped beside; plans expose `touchesChangedCell({x,z,r})` over the actual grading jobs (including batters), skip occupied source cells and choose a clear spare-spoil footprint before mutation; built cells are firm (no slumping) until dug; saves only the chunks that changed |
| `src/earthworks` | Building with material: what a road, ramp or level area may be (slope, length, width, price by area from `data/works.json`), the plan (what it costs and needs, changing nothing) and the build (checks machine/barrow circles against grading cells with the configured margin, charges the labour and asks the ground to do it); `worksBuilt` carries plain spoil-position data; the world re-seats the player on the new surface after grading, sourcing or spoil deposition |
| `src/handtools` | Your shovel and wheelbarrow: digging a shovelful out of the real ground, tipping it into the barrow, the pickup's or a truck's bed or onto the ground, and tipping the barrow as a pile or into a bed. Loads are dug material measured by loose volume |
| `src/machinery` | Machine stats and mods (a machine's `kind` decides which jobs it can do), buying and selling machines, Direct-mode bucket cutting and pouring, timed jobs (dig a bucket out of the real ground, tip or unload a road vehicle at the depot or on your land, service, repair), wear and breakdowns |
| `src/progression` | The step-by-step goals for a new game (which one is current, checking them against game events, paying rewards), the mentor's texts and tips (`mentor.js`), and a pacing check of the machine ladder and of groundworks prices against a trailer load (`pacing.test.js`) |
| `src/happenings` | Things that happen, each a small decision. The council's site inspector is announced the day before and at the hour of the visit fines every machine that is broken or under 40%, or lifts your reputation if they're all above 70%. A rush order goes on the jobs board (via `postRushOrder` in `src/contracts`): smaller, due sooner, double bonus, open today only. The dealer's offer takes 15% off one machine you don't own for three days (`offerPrice`; `machinePrice` in `src/machinery` combines it with the trade account). Its own random numbers, so it changes no other luck |
| `src/career` | Milestones and perks. `career.js` keeps the counters milestones need that nothing else keeps (clean loads in a row, gravel dug, metres of road, loads sold in the rain, the best day's takings, loans paid off) from game events, pays each milestone once and sends `milestoneReached`; `perks.js` answers price questions (`dealerPrice`, `fuelPerkMultiplier`, `cleanSaleBonus`) and imports nothing, so the economy, the dealer and the buildings can ask it. Tests that check exact money should turn milestones off (`data.milestones.list = []`), or a reward can land mid-test |
| `src/game` | Wires everything together: `createGame()` builds a game, `game.tick()` advances time, `game.actions.*` are the player's actions |

**Player actions** (`src/game/actions.js`) are the single way to make things happen. They're used by buttons and hotkeys now, and later by operators and 3D driving.

**Events** are what the logic announces, e.g. `weighedIn`, `productSold`, `machineBought`, `machineBrokeDown`, `dayStarted`. The UI listens to them for pop-ups and messages.

## Display and controls
| Module | Job |
|---|---|
| `src/input` | Hotkeys and rebinding |
| `src/audio` | Sound: `synth.js` builds every sound from maths (diesel engines, gravel, rocks, hydraulics, birds…), `index.js` plays them through a mixer with 3D positioning, engine voices driven by rpm and load, loops and one-shots |
| `src/ui` | Main menu, pause menu, settings, save/load screens, HUD, 3D overlay (prompts, machine dash), the map (`mapView.js` draws the countryside from above, `mapOverlay.js` adds the places and your machines), the office laptop and its apps (`game/laptop/`: home, plant dealer, jobs board, milestones, depot prices, fleet, bank, messages), depot price board (`market.js`), dev panel, feedback effects. `game/timeGate.js` decides when the game clock may run (only while you're playing: not before the first click, not with the pointer released, the window hidden, or paused) and turns frame time into ticks without catch-up |
| `src/world3d` | The 3D world, described below |

### The 3D world (`src/world3d`)
| File | Job |
|---|---|
| `map.js` | Level design: where the roads, your field and yard, the village, the dealer and the depot (weighbridge, bays) are. Only positions; numbers for balance stay in `data/` |
| `countryside.js` | Builds the 2 km countryside from the map: rolling farmland heights (with the ground levelled under yards, houses and the roads), the road ribbons with a centre line, the physics heightfield (with a hole where your field is) and questions like "is this on the road?" |
| `places.js` | Buildings and props at each place: your yard (office, fences, gates, sign), the power line, the village houses and pub, the dealer's shed, and the depot's weighbridge (with its traffic light), office, signs and block-wall bays |
| `farms.js` | Farmsteads out in the countryside (`map.farms`): a farmhouse and a steel barn from the Blender props, a feed silo, round straw bales, a packed-earth yard and a dirt track down to the nearest road (with a gap in the roadside hedge). Scenery only; the ground under each is levelled and trees keep to its edge |
| `planner.js` | The earthworks planner (F, on foot): aims at the ground, keeps the start, end, width and kind, re-plans as they change, draws the coloured strip and posts, and feeds the HUD card. Only the last click builds |
| `groundChunks.js`, `groundMaterial.js` | Your diggable field: its chunked mesh and colliders that follow the real ground, and the shader that blends the ground textures |
| `vegetation.js` | Grass tufts and weeds (streamed in around you), hedgerows, copses and lone trees |
| `environment.js` | The renderer and its quality levels (low: no shadows; medium: soft shadows; high and ultra: soft shadows plus ambient occlusion, drawn through a small post-processing chain that leaves out see-through things like grass and glass), sky, sun, fog and the hills on the horizon |
| `player.js`, `headSway.js`, `handTools.js` | You on foot, head bob, the shovel in your hands and the wheelbarrow |
| `truck.js`, `truckPhysics.js` | Road vehicles (the pickup, the tipper truck and the tractor): the model, bed or tailgate, and Rapier ray-cast vehicle physics with an engine, gearbox, brakes and grip by surface (the pickup and the tractor have their own shape and engine) |
| `trailer.js` | The tractor's tipping trailer: it hangs off the hitch and follows it with the one-axle pursuit maths (`trailerYawStep`, tested), sits on the ground, and has a kinematic collider |
| `excavator.js`, `excavatorArm.js` | The two diggers (excavator and mini digger, from a spec each) with their arm solver and hydraulic joints; Assisted (the arm plans the dig) and Direct (boom, stick, bucket and swing on their own controls) |
| `trackDrive.js`, `dumper.js` | The rubber or steel track undercarriage shared by the diggers and the site dumper (track speeds, rolling shoes, sitting on the ground), and the dumper with its tipping skip. Site machines can't leave your land |
| `glbModels.js`, `models.js` | Blender models (loaded from `.glb`) and placeholder shapes if a model is missing |
| `weathering.js` | Weathers the machines' paint in the game, by tier: rust on edges and low down spreading in patches, chipped edges, sun-faded tops, dried mud. A small shader addition (value noise, and edge detection from screen-space normal derivatives) on each model's rest-pose positions, baked into a vertex attribute when it loads |
| `guideBeacon.js` | The guide marker's column of light; `index.js` works out where the current goal wants you (`guideTarget`) |
| `sounds.js`, `engineLife.js` | What the machines sound like, engines starting and stopping, passing cars on the lane |
| `index.js` | Ties it together and turns driving, digging, weighing in and unloading into game actions |

## Models
`blender/` has the Python scripts that build the 3D models in Blender; `assets/models/` has the exported `.glb` files. See `docs/models.md`.

The approved 14-asset fleet uses `blender/review_models.py` to refine the original
builders while retaining their named rigs. Embedded PBR maps and `Review_` materials
carry their own painted wear; `weathering.js` adds a lighter layer on top (rust and chips on
the Rusty tier, light fade and dirt on Used) so the two tiers read differently in the game. `blender/fleet-rigs.json`
records the protected animation hierarchy and rest transforms for export checks.

## Tests
Unit tests sit next to the code (`*.test.js`). Run them with `npm test`.

## Yard facilities (Step 8, first batch)

`src/buildings/index.js` owns commissioning and per-site benefits; `data/buildings.json` owns
prices and multipliers. `state.buildings[siteId][buildingId]` stores ownership. Missing state
from older saves means no facilities; the first purchase initialises it. Actions reject unknown,
duplicate and unaffordable purchases. `buildingBought` refreshes the shop and the fixed yard signs.
The workshop modifies service/repair quotes when jobs begin. Bulk fuel modifies fuel charges
for timed jobs and Direct bucket cuts; other sites retain their original prices. Neither feature
places a new footprint, creates free material or changes existing collision shapes.

The home workshop container is positioned explicitly by `MAP.home.workshop`, clear of the
driveway. An empty barrow at the pickup tailgate prompts backing away before turning.


`src/buildings/stockpiles.js` owns per-site, per-bay inventory (`state.stockpiles`),
capacity reservations for pending carrier tips, and proportional bucket extraction by
loose volume. Old saves default to empty inventory. Store transfers consume their supplied
load and emit `stockpileChanged`, never `productSold`. Reloading emits `stockpileScooped`
and does not count the same material as newly dug. `src/world3d/stockpiles.js` builds the
three fixed bays, saved-inventory heaps and matching cone colliders/surface heights;
wall and heap collisions are enabled only when commissioned. Assisted/Direct digger
controls and carrier T dispatch detect the same mapped bay rectangles. The map panel
reports each bay’s material mix and normal depot purity grade.

Home weighbridge: `buildings.weighbridge` commissions the fixed `MAP.home.weighbridge`
deck. World dwell calls `actions.weighIn(id, { home: true })`, which checks commissioning
and road legality and returns `bestDeliveryQuote`. Both bridges share `state.depot.tickets`;
`hasTicket` validates total and every material against the current vehicle load, discards
stale tickets, and depot tip completion checks again before transferring inventory.
Repeated weighing of an unchanged load emits no duplicate receipt. Timing is in
`data/depot.json` (`weighSeconds`); home price is in `data/buildings.json`.

D14 staff additions: workers default `experience`, `delivery` and `partnerId` for legacy
saves. `configureHaul` validates active customer/pair choices and locks changes during
trips. Driver `spot.bed` is a plain world-supplied loading position; pairing only transfers
within configured reach to a waiting, available same-site carrier. Customer loads choose
the requested heap material and must meet clean grade. Saved trip target/material drive
`productSold.deliveryTarget`; contracts credit that chosen order rather than an earlier
one. Untargeted sales retain deadline allocation. Missing/completed targets wait; regular
quota completion waits until the next week. Bucket remainders are retained and dumped
before another cut. `staffOnEvent` earns dig/sell/fix experience from completed events;
round-trip return earns drive experience. Thresholds in `data/staff.json` multiply by the
current star, cap at five, and never change the agreed wage.

S2 tipping audio: `synth.tipperRam` builds filtered valve flow and cylinder/seal friction;
`ptoDrive` builds a 540 rpm mechanical pulse loop. Web Audio banks these as `tipperRam`
and `pto`. World truck/trailer bed velocity gates ram gain (lowering is quieter/slower);
tractor PTO is gated to a raising tip job and engine envelope. Voices stop when machinery
is removed/destroyed. Gearbox audio is unchanged. Unit checks cover finite/non-clipping
seamless buffers plus raising/lowering/idle/removal behavior; the browser API check is muted.

M2 model production: `blender/review_models.py` now includes Used-only access joints,
fasteners and soft transparent recess grime for truck/excavator. New details follow the
existing Cab/House/Bed parents. Only those two compressed production GLBs changed;
protected rig transforms are guarded by the builder and fleet asset tests.
