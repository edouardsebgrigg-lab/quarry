# Module guide

A short tour of the code. The logic modules never touch the screen. Each module has one public entry file (`index.js`), and other modules only import from that file.

## data/ — all the numbers
| File | What's in it |
|---|---|
| `game.json` | Tick rate, day length, speeds, starting machines (the pickup) and site, save version |
| `production.json` | Crusher/screener throughput, batch limits, operating costs, conserved recipes and receipt history limit |
| `operations.json` | Field work-area subdivision, names, survey sample density and minimum target-layer material share |
| `economy.json` | Starting money, fuel price, debt interest, resale value |
| `materials.json` | Materials you can sell (topsoil, clay, sand, gravel, mixed fill) and their base prices per tonne |
| `market.json` | How prices swing (trend) and drop when you sell a lot (saturation) |
| `machines.json` | Every machine tier's stats and price (including mass and engine power, used by the driving physics and the engine sound). Each type says what it is (`kind`: a `digger` with a bucket or a `carrier` with a bed), whether it's road-legal, whether it's sold in the shop and how it unloads |
| `mods.json` | Cheap upgrades you can fit to machines |
| `sites.json` | Company sites and their primary ground plot; Home remains the shared yard and fleet site |
| `land.json` | Purchasable neighbouring parcels: plot IDs, prices, independent seed offsets, access strips, signs and survey density |
| `depot.json` | The selling depot: its bays, the purity grades (clean, slightly mixed) and what they pay |
| `works.json` | Earthworks: the kinds (haul road, ramp, level area) with surface, thickness, greatest slope, width range and price, plus the length limits and how far from the works loose heaps can be used |
| `ground.json` | Diggable ground: materials (density, how much they swell when dug, the slope they settle at, how steep a wall they can stand) and each plot's layers |
| `objectives.json` | The intro story and the goals (texts and rewards): the machine ladder, then the business (jobs, the yard, clean tonnes, a name, a Used fleet, $15,000) |
| `handbook.json` | Four journey chapters and searchable practical articles; binding tokens resolve against the player's controls |
| `persistence.json` | Active-play autosave interval and maximum imported file size |
| `happenings.json` | Things that happen: the site inspector (how often, the fine per unfit machine, the reputation for a clean bill), rush orders (chance, days, bonus and size) and the dealer's offers (chance, discount, days) |
| `milestones.json` | Company milestones (what each measures, its target and reward, its group) and the perks some of them switch on (depot account, fuel card, trade account) |
| `tools.json` | Hand tools: how much a shovelful and a wheelbarrow hold (loose m³), reach, dig and tip times, pushing speeds |
| `contracts.json` | The jobs board: how often offers come, their tonnages, bonuses and deadlines, rush orders and regular customers |
| `staff.json` | Staff: when each post opens, applicants, wages and fees, the roles and their skills, and how each role works (dig swing time, trip times, the fitter's threshold, the sales bonus) |
| `buildings.json` | Yard facilities: prices and what each changes, stockpile bay capacity |
| `hire.json` | Hiring out: how often contractors ask, day rates, hire lengths and wear |
| `rental.json` | Renting in: fees, deposits, rental lengths and overdue charges |
| `classifieds.json` | The Wolds Trader: how many adverts, discounts, and how often a seller exaggerates |
| `weather.json` | Weather kinds and how likely each day follows the last (rain soaks the ground, and wet ground has less grip: `handling.json` surfaces) |
| `handling.json` | How walking, jumping, vehicles changing direction, cab springs and cruise control feel, and tyre grip and rolling resistance on each surface, dry and wet (`surfaces`) |
| `presentation.json` | Camera motion, the ground survey and on-screen feedback tuning |

You can change any of these and reload the game. No code changes are needed.

## Logic (no screen code)
| Module | Job |
|---|---|
| `src/core` | Game clock (ticks, days, hours), event bus, seeded random numbers, save slots with version upgrades |
| `src/economy` | Money and debt, market prices and news, fuel, the depot (weighbridge tickets, grading a load by purity, paying for it), the bank (loans, statement, credit rating: `bank.js`) and overheads (insurance cover: `overheads.js`) |
| `src/quarry` | Site/load helpers, neighbouring land purchases and terrain routing, named work areas, current-ground borehole estimates and saved navigation |
| `src/ground` | The real, diggable ground: a grid of soil columns with layers; digging carves bowls and returns tonnes by material, dumped material piles up and slumps to its natural slope, undercut walls cave in; `planWorks` / `buildWorks` grade a strip (road, ramp, level) with side batters, conserving every tonne: cut first, then fill, then a gravel surface, then loose heaps within reach for what's missing, and the rest heaped beside; plans expose `touchesChangedCell({x,z,r})` over the actual grading jobs (including batters), skip occupied source cells and choose a clear spare-spoil footprint before mutation; built cells are firm (no slumping) until dug; wheels and tracks (`applyTraffic`, one tyre's swept path per call) compact the ground and wear the turf, faster wet, heavy or slipping, until it's torn to bare soil and only then ruts; mud grips less than dry soil (`wetTraction`); saves only the chunks that changed (turf wear as an optional extra, so older saves load with whole turf) |
| `src/earthworks` | Building with material: what a road, ramp or level area may be (slope, length, width, price by area from `data/works.json`), the plan (what it costs and needs, changing nothing) and the build (checks machine/barrow circles against grading cells with the configured margin, charges the labour and asks the ground to do it); `worksBuilt` carries plain spoil-position data; the world re-seats the player on the new surface after grading, sourcing or spoil deposition |
| `src/handtools` | Your shovel and wheelbarrow: digging a shovelful out of the real ground, tipping it into the barrow, the pickup's or a truck's bed or onto the ground, and tipping the barrow as a pile or into a bed. Loads are dug material measured by loose volume |
| `src/machinery` | Machine stats and mods (a machine's `kind` decides which jobs it can do), buying and selling machines, Direct-mode bucket cutting and pouring, timed jobs (dig a bucket out of the real ground, tip or unload a road vehicle at the depot or on your land, service, repair), wear and breakdowns |
| `src/progression` | The step-by-step goals for a new game (which one is current, checking them against game events, paying rewards), the mentor's texts and tips (`mentor.js`), and a pacing check of the machine ladder and of groundworks prices against a trailer load (`pacing.test.js`) |
| `src/happenings` | Things that happen, each a small decision. The council's site inspector is announced the day before and at the hour of the visit fines every machine that is broken or under 40%, or lifts your reputation if they're all above 70%. A rush order goes on the jobs board (via `postRushOrder` in `src/contracts`): smaller, due sooner, double bonus, open today only. The dealer's offer takes 15% off one machine you don't own for three days (`offerPrice`; `machinePrice` in `src/machinery` combines it with the trade account). Its own random numbers, so it changes no other luck |
| `src/career` | Milestones and perks. `career.js` keeps the counters milestones need that nothing else keeps (clean loads in a row, gravel dug, metres of road, loads sold in the rain, the best day's takings, loans paid off) from game events, pays each milestone once and sends `milestoneReached`; `perks.js` answers price questions (`dealerPrice`, `fuelPerkMultiplier`, `cleanSaleBonus`) and imports nothing, so the economy, the dealer and the buildings can ask it. Tests that check exact money should turn milestones off (`data.milestones.list = []`), or a reward can land mid-test |
| `src/contracts` | The jobs board (customers want a tonnage of one clean material by a deadline, for a bonus), rush orders and regular customers' weekly standing orders |
| `src/staff` | Employees: posts that open with progress, applicants, wages, and the four roles (digger operator, haulage driver, sales, fitter) worked each tick by `staffTick`; `perks.js` answers the sales bonus and the fitter's discount and imports nothing |
| `src/buildings` | Yard facilities you commission (workshop, bulk fuel, home weighbridge) and their benefits; `stockpiles.js` holds the stockpile bays' contents |
| `src/production` | Read-only batch quotes, paid crusher/screener jobs, held feed and capacity reservations, cancellation, tick-driven completion and lifetime throughput. `state.production` saves jobs, bounded completed/cancelled receipts and validated per-site/per-plant plans. Planning does not reserve or spend; starting always quotes current conditions. Stockpile room includes both held feed and future products |
| `src/hire` | Hiring your machines out to contractors for a day rate (the machine leaves the yard while it's away) |
| `src/rental` | Renting machines in from the dealer for a day or three, with a deposit |
| `src/classifieds` | The Wolds Trader: private sellers' second-hand machines, some of them less good than the advert says |
| `src/weather` | Each day's weather and tomorrow's forecast; rain makes the ground slippery |
| `src/game` | Wires everything together: `createGame()` builds a game, `game.tick()` advances time, `game.actions.*` are the player's actions |

**Player actions** (`src/game/actions.js`) are the single way to make things happen. They're used by buttons and hotkeys now, and later by operators and 3D driving.

**Events** are what the logic announces, e.g. `weighedIn`, `productSold`, `machineBought`, `machineBrokeDown`, `dayStarted`. The UI listens to them for pop-ups and messages.

## Display and controls
| Module | Job |
|---|---|
| `src/input` | Hotkeys and rebinding |
| `src/audio` | Sound: `synth.js` builds every sound from maths (diesel engines, gravel, rocks, hydraulics, birds…), `index.js` plays them through a mixer with 3D positioning, engine voices driven by rpm and load, loops and one-shots |
| `src/ui` | Main menu, pause menu, settings, save/load screens, HUD, 3D overlay (prompts, machine dash), the map (`mapView.js` draws the countryside from above, `mapOverlay.js` adds the places and your machines), the office laptop and its apps (`game/laptop/`: home, quarry operations, plant dealer, jobs board, milestones, depot prices, fleet, bank, messages), depot price board (`market.js`), dev panel, feedback effects. `game/timeGate.js` decides when the game clock may run (only while you're playing: not before the first click, not with the pointer released, the window hidden, or paused) and turns frame time into ticks without catch-up |
| `src/world3d` | The 3D world, described below |

### The 3D world (`src/world3d`)
| File | Job |
|---|---|
| `map.js` | Level design: where the roads, your field and yard, the village, the dealer and the depot (weighbridge, bays) are. Only positions; numbers for balance stay in `data/` |
| `countryside.js` | Builds the 2 km countryside from the map: rolling farmland heights (with the ground levelled under yards, houses and the roads), the road ribbons with a centre line, the physics heightfield (with a hole where your field is) and questions like "is this on the road?". The terrain is drawn in 250 m tiles sharing one vertex buffer, so what's behind you is skipped; the roads use the worn-tarmac shader (`wornTarmac` in `groundMaterial.js`) |
| `places.js` | Buildings and props at each place: your yard (office, fences, gates, sign), the power line, the village houses and pub, the dealer's shed, and the depot's weighbridge (with its traffic light), office, signs and block-wall bays |
| `farms.js` | Farmsteads out in the countryside (`map.farms`): a farmhouse and a steel barn from the Blender props, a feed silo, round straw bales, a packed-earth yard and a dirt track down to the nearest road (with a gap in the roadside hedge). Scenery only; the ground under each is levelled and trees keep to its edge |
| `staticBatch.js` | Draws the props that never move (blocks, fences, poles, houses, barns, the machines parked in the farm fields) in batches once they're placed: a part that repeats becomes one `InstancedMesh`, the rest is merged by material per 96 m patch. Weathered machine paint is only merged, never instanced (its shader needs the mesh's own matrix) |
| `planner.js` | The earthworks planner (F, on foot): aims at the ground, keeps the start, end, width and kind, re-plans as they change, draws the coloured strip and posts, and feeds the HUD card. Only the last click builds |
| `quarryOperations.js` | Lightweight crusher/screener yard meshes, running status/rollers, enabled physical colliders and a reusable terrain-following boundary for the chosen work area; all owned geometry and colliders are released on teardown |
| `groundChunks.js`, `groundMaterial.js` | Your diggable field: its chunked mesh and colliders that follow the real ground (grass worn by traffic shows as flattened tracks, then mud), and the shader that blends the ground textures |
| `vegetation.js` | Grass tufts and weeds (streamed in around you), hedgerows, copses and lone trees |
| `environment.js` | The renderer and its quality levels (low: no shadows; medium: soft shadows; high and ultra: soft shadows plus ambient occlusion, drawn through a small post-processing chain that leaves out see-through things like grass and glass), sky, sun, fog and the hills on the horizon |
| `player.js`, `playerMovement.js`, `headSway.js`, `cameraFeel.js`, `handTools.js` | You on foot, head bob, the shovel in your hands and the wheelbarrow |
| `truck.js`, `truckPhysics.js` | Road vehicles (the pickup, the tipper truck and the tractor): the model, bed or tailgate, and Rapier ray-cast vehicle physics with an engine, gearbox and brakes. Each wheel's braking and drive is limited by its grip (surface friction × the weight on it, less what it's using to corner): past that it locks or spins and loses its sideways hold. The roll moment the ray-cast vehicle leaves out is put back, so bodies lean in bends (the pickup and the tractor have their own shape and engine) |
| `surfaces.js` | Grip and rolling resistance under a tyre from the surface mix and the ground's wetness |
| `tyreMarks.js`, `pedals.js` | Tyre marks: thin tread-printed quads along each wheel's and track's path (flattened tracks on grass, darker through mud and soil, grey on gravel, black rubber on tarmac only where a wheel locked or spun; one draw, the oldest fade away). Pedals: a key presses a pedal down over a quarter of a second; the precision key keeps it light |
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

M4 adds the complete Blender cleanup/catalogue scripts and four authored mobility
GLBs (see `docs/models.md`). `glbModels.js` reads their named cab/cargo anchors;
truck, dumper and trailer cargo coordinates are expressed in the moving bed frame.
Trailer collider bounds include variant sideboards, and its drawbar eye follows
the tractor hitch in three dimensions. Excavator tooth and dump targeting include
the authored boom's lateral offset. The chase camera fits current model/trailer
bounds and viewport aspect ratio. Dealer/Fleet/Staff use responsive rows and
separate purchase details; laptop notices occupy their own strip and restore on
close. Settings keep their tabs and action bar outside the scroll region.

## Tests
Unit tests sit next to the code (`*.test.js`). Run them with `npm test`.

## Notes by system

Details that matter when you change one of these systems. Each says where the state lives,
what it emits and what older saves get.

### Yard facilities, stockpile bays and the home weighbridge

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

The home weighbridge: `buildings.weighbridge` commissions the fixed `MAP.home.weighbridge`
deck. World dwell calls `actions.weighIn(id, { home: true })`, which checks commissioning
and road legality and returns `bestDeliveryQuote`. Both bridges share `state.depot.tickets`;
`hasTicket` validates total and every material against the current vehicle load, discards
stale tickets, and depot tip completion checks again before transferring inventory.
Repeated weighing of an unchanged load emits no duplicate receipt. Timing is in
`data/depot.json` (`weighSeconds`); home price is in `data/buildings.json`.

### Staff

Workers default `experience`, `delivery` and `partnerId` for legacy
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

### Tipping and PTO sounds

`synth.tipperRam` builds filtered valve flow and cylinder/seal friction;
`ptoDrive` builds a 540 rpm mechanical pulse loop. Web Audio banks these as `tipperRam`
and `pto`. World truck/trailer bed velocity gates ram gain (lowering is quieter/slower);
tractor PTO is gated to a raising tip job and engine envelope. Voices stop when machinery
is removed/destroyed. Gearbox audio is unchanged. Unit checks cover finite/non-clipping
seamless buffers plus raising/lowering/idle/removal behavior; the browser API check is muted.

### Model detail

`blender/review_models.py` now includes Used-only access joints,
fasteners and soft transparent recess grime for truck/excavator. New details follow the
existing Cab/House/Bed parents. Only those two compressed production GLBs changed;
protected rig transforms are guarded by the builder and fleet asset tests.

### Farm field scenery

`map.js` farm `fieldWork` entries place static tractors and empty hitched
trailers in Mill/Westfield fields. `farms.js` reuses the game GLBs, adds solid colliders,
merges scattered bales with farm batches and supplies `farmWorkRect` to keep tall tufts
out of the machinery. No fleet entries, saved RNG draws or economic work are created.
`farm-fields.mjs` checks scenery presence, unchanged fleet and two field screenshots.

### Day, night and the two clocks

`data/game.json.visualDayLengthSeconds` is 1200 while economic
`dayLengthSeconds` is now also 1200 (P1), with the visual clock independent of speed. `core/visualClock.js` defaults old saves' optional
`state.time.visualSeconds`, wraps active elapsed time and computes smooth solar phases.
`game.advanceVisualTime(dt)` is called once per active real frame by `gameScreen.js`
through the existing time gate; economic ticks/speed/dev skips do not advance it.
`environment.js` combines solar direction, warm horizons, night fog/dome/stars,
moonlight and ambient floors with eased weather. It reuses the daylight environment map
at reduced intensity at night, avoiding repeated PMREM renders. `workLight.js` pools one
shadow-free view-following night light; `sounds.js` suppresses new bird calls at night.
The HUD marks the visual period and explains the business clock in its date tooltip.
`visualClock.test.js` covers separate timing, cyclic boundaries and save/legacy behaviour;
`daylight.mjs` checks real pause/resume, lighting views, a night walk/dig and UI Continue.

Business pacing: `time.ticksPerDay` stores the calendar rate. Save v6 records v5's 1200-tick legacy rate; `restoreClock` rebases ticks to the current 12000-tick day once, retaining day/hour/deadlines. New states store the current rate. Speed controls affect economic ticks; daylight remains real-time.

### The machine catalogue and trailers

Model tier IDs remain under machine families, preserving the `buyMachine(type,tier)` boundary. `machinery/catalogue.js` supplies descriptors and idempotent `migrateFleet`: old tractor bundles become a tractor plus attached trailer, preserving loads, mods, original total value/insurance and saved positions. `trailers.js` resolves `loadCarrier`, `combinationStats`, `cargoRoom`, hitching and gross/volume limits. Tickets remain under the driven tractor ID and record carrier ID. Hand tools, jobs, buckets, staff and stockpiles resolve the actual cargo owner. Bare tractors, passenger quads and detached trailers do not satisfy the last-delivery-vehicle safeguard. `world3d/fleetProfiles.js` provides drive/shape profiles and `fleetVariants.js` adds distinct bodywork to shared rigs plus mobility models; existing asset downloads remain unchanged. Trailer articulation uses a kinematic follower, with combination mass, grade/traction and trailer braking in the tractor physics.

### Ground materials

Ground `materialResponseAt` exposes resistance, cohesion, flow, wet grip and rolling resistance. `cutSweep` removes material along a finite moving cutting edge, with force/attack/width/capacity limits; a breaker can extract a finite rock reserve. `applyTraffic` tracks firmness and moves rut material into neighbouring shoulders without changing density or total tonnes. Compacted earthworks fill retains its real material mixture. The chunk mesh passes original geological contacts to the terrain shader, which uses soil/gravel textures on exposed faces. Ground persistence records material/layer IDs and lossless floats; loading reactivates unfinished settling and supports older packed saves.

### Digging operation

`machinery/digging.js` centralises true loose-volume bucket fill and directional attack. Assisted jobs marked `physical` receive material incrementally from world tooth sweeps and never mint a fallback bucket on completion. Dumps retain cargo until the real joint pose opens. Direct mouse and independent joint/slew keys use material resistance feedback, free look and precision. Digger placement saves optional arm/house/reach/depth/last-dump state. Attachments alter cut geometry and available tools through the action boundary.

### First hire

First-slot sale/earned/digger requirements and guaranteed apprenticeship wage/fee live in `data/staff.json`. Valid depot sales increment saved deliveries; older totals are restored from machine logbooks. Applicants appear when a post opens, without waiting for dawn. Staff hauling reserves the trailer as well as the tractor and respects both tonnes and bed volume.

### Rentals and conveniences

`data/rental.json` and `src/rental/` implement incoming short hire independently of contractor hire-out. Calendar-day deadlines, deposits, wear and overdue charges are saved on the machine; loaded/occupied/busy rentals cannot be removed. Rentals are excluded from owned-machine progression, resale collateral and insurance. `fleetNavigation.js` adds explicit map waypoints through actions. World hand tools implement repeat swings and cargo-preserving local recovery. Jobs-board progression has clean-tonnage alternatives.

### Game feel, ground survey and personal targets

`data/handling.json` holds walking acceleration, jump grace, vehicle direction-change and cab spring tuning. `playerMovement.js` is pure movement/jump state; `player.motion()` reports collision-resolved travel. `cameraFeel.js` uses that travel for optional bob, one-shot landing and sprint FOV. `headSway.js` uses a bounded analytic damped spring and resets on seat changes/teleports. `data/presentation.json` holds camera, survey and feedback tuning. Settings persist `cameraMotion` and `fieldOfView` with safe legacy defaults.

Ground `inspectAt(x,z)` reads the actual top-to-bottom loose, compacted and natural column without mutations, including mix proportions, contiguous depths, cover identity and remaining bedrock depth. World survey uses an obstacle-respecting physics ray or the digger tooth target, toggled by the rebindable survey action (L). `workTelemetry.js` derives read-only advice from physical bucket fullness, real cutting/engine/slip state and gross towing load; HUD presentation never writes terrain or economy. Material contact particles use the actual cut material.

Career `pinnedMilestone`, `pinMilestone` and `unpinMilestone` expose an optional saved focus through `game.actions`. Unknown legacy IDs clear safely; selection does not emit gameplay events or change automatic milestone payouts. HUD/Home reuse their existing goal surface and Milestones exposes choose/switch/clear. Narrow HUDs suppress mentor cards while a goal is visible; those messages remain in Messages.

### Cruise control, the tool picker and earthworks quotes

`cruiseControl.js` is a runtime-only speed controller using JSON tuning in `handling.vehicle.cruise`. `truckPhysics` sends contact/grip/slip, shift and manual-pedal state; the helper requests ordinary throttle/brake forces without setting velocity. Active speed targets can only decrease with physical limits and clear on pedal intent, engine stop or recovery. World key actions also cancel immediately so brief taps work between physics frames; exit/unoccupied/job/broken boundaries clear assistance. HUD telemetry stays read-only.

`diggerToolChoices.js` builds compatible unmodified stat previews, current-tool state and reasons cargo/rental/work blocks a swap. `diggerTools.js` opens the pausing Q overlay, rechecks the actual cab and motion before the existing authoritative `setDiggerAttachment` action, and reports errors inside its note. World `toolSwap.js` blocks real joint/slew/track motion, including in-place chassis turns. These ephemeral checks and controls introduce no saved fields. Existing settings migration leaves new Q/Z actions unbound if those keys belong to older custom bindings.

Ground `planWorks().materials` uses the same allocation the build executes: cut/heaps/spoil records in tonnes, surface supply in loose cubic metres and tonnes, and required/fromCut/fromHeaps/missing fill in compacted bank cubic metres. Usable heap supply respects radius, surface priority and obstacle exclusions. `planEarthworks().gradeGuidance` estimates the run needed for the same rise at the mode's grade limit; it does not promise that an alternate alignment is obstacle-free. The planner's integrated controls/material quote and last-build note are transient presentation. Preview and failed builds remain read-only.

### Regional trade, industrial maintenance and survey baselines

`src/trade/index.js` and `data/trade.json` implement regional buyers, purity rules, daily
quotas, saved supplier relationships and bounded receipts. Read-only quotes subtract other
in-flight tip reservations. Tip jobs reserve their accepted quantity, then recheck cargo,
ticket and current demand at completion, preserving excess on the actual load carrier.
Sales reuse depot grading/accounting with a buyer multiplier; `buyerId` prevents unrelated
contract credit. Player navigation targets select either a business, machine or work area.

`world3d/regionalYards.js` builds the three roadside businesses from `MAP.buyers`, with
colliders, weighbridges and unloading pads. Countryside flattening, ground surfaces and
hedgerow gaps make the yards accessible. World actions dispatch real regional tip jobs;
the map and laptop `trade.js` reuse buyer data and authoritative quotes.

`production/plant.js` holds per-site condition/upgrade state and saved service timers.
Data-driven wear applies only to completed batches; upgrades affect new batch quotes,
without changing yields or running jobs. Capital upgrades and operating service expenses
use normal bank/logbook accounting. The workshop and plant visuals reflect this state.
`quarry/operations.js` records dated survey snapshots without changing terrain or money;
Work areas compares fresh estimates to the saved baseline.

### Finite production schedules and expandable bays

`production/schedule.js` owns per-site/per-plant saved orders and pause states. Orders
contain a validated recipe/bay/tonnage request and bounded counts of batches remaining
to start. `productionQueueStatus` is read-only; `tickProductionQueue` starts ready orders
at the active site after existing jobs/services advance. It reuses authoritative
`quoteProduction`/`startProduction` checks, including current condition and reservations,
and enforces the shared automatic cash reserve. Only a successful start consumes a count.
Manual cancellation pauses that plant's queue; deleting/reordering waiting work never
changes a running job. Old saves default empty schedules and the configured reserve.
`laptop/productionQueue.js` presents controls and waiting reasons; Home highlights stalls.

`buildings/stockpiles.js` derives per-site capacity from saved bay upgrade levels and JSON
upgrade definitions. Additional capacity preserves live tip/production reservations.
Purchases count as capital investment. `world3d/stockpiles.js` updates both wall geometry
and Rapier colliders on inventory/upgrade refresh and restores heights on load. Soil
recovery recipes reuse the conserved separation path; rejects stay in the feed bay.

### Saved contractor cuts and finite rock fracturing

- `data/blasting.json`: abstract game cut presets, crew costs/times, clearance,
  countdown, history and dust settings. Loaded by `core/data.js`.
- `ground.planFracture` previews every cell in the circular footprint without mutation.
  It rejects fixed edges, engineered fill, excess cover and exhausted reserve. A lossless
  shape fingerprint identifies the drilled columns. `ground.fracture` requires that same
  fingerprint and converts Float32-measured bed depletion into loose rock in-place;
  cover remains, dirty chunks and settling activate, and terrain saves need no new format.
- `src/blasting/index.js`: independent game rules, public actions and tick entry.
  `state.blasting` defaults projects/history/counters for old saves. One project per
  current site advances through drilling → drilled → charging → ready → countdown.
  Stage quotes remain saved, each crew cost is paid once, and cancelled work is recorded
  without refund. Only successful firing counts as loosened rock; actual digging retains
  its existing extraction credit. Projects at other sites wait.
- Firing uses the live `ctx.blastOccupants` provider installed/disposed by `world3d`;
  saved positions never certify clearance. Player, barrow, visible vehicles and attached
  trailers are included with their bounds. Every countdown tick checks clearance; commit
  also checks the original terrain fingerprint. Missing positions, intrusion or changed
  ground hold the project at Ready until the player gives another command.
- `world3d/blastSite.js`: disposable preview/cut boundaries, flags, hole markers and
  animated contractor rig. Its Rapier collider follows drilling/charging and is removed
  from collision before firing. Fired cuts use ordinary terrain chunks/colliders, dust
  particles and the new synthesised `quarryBlast` sound. The map and countdown HUD read
  the same project. Interact (E by default) aborts a countdown directly in the field.
- `ui/game/laptop/blasting.js`: sampled field map plus authoritative cut quote, staged
  controls, live clearance and bounded receipts. Preview ownership ends on tab/overlay
  disposal. `game/logbook.js` and Operations reports show rock cuts/loosened tonnage;
  Bank labels crew costs as operating expenditure.
- `blasting/blasting.test.js` covers conservation, finite reserve, stale surveys,
  re-entrant/invalid actions, stage costs, live clearance, aborted countdowns, save/reload,
  cancellation and legacy defaults. `world3d/blastSite.test.js` exercises actual Rapier
  rig colliders, previews and cleanup. `browser-checks/blasting.mjs` checks the UI,
  physical-world provider, Continue, and rubble-to-bay-to-crusher action integration
  using explicit earthmoving, money, position and clock fixtures. `blast-controls.mjs`
  verifies real keyboard dispatch and the narrow layout, which prioritises active controls.

### Player journey and portable saves

`progression/journal.js` defaults saved `objectives.evidence`, `history`,
`guideEnabled` and the one-time `completion` record. Actual shovel, bucket, weighing,
upgrade and sale events retain bounded evidence for goals reached later. Completion
records the reward once before the index advances; the per-company guard permits
separate games to progress independently. Legacy completed steps have an honest
`legacy` record, without invented dates or another payout. `journeyCompleted` announces
the final step; free play continues. `setGuideEnabled` is exposed through actions;
HUD/world/mentor honour it while explicit navigation and milestone targets still work.
`laptop/guide.js` presents history, search and rebound controls. `handbookText.js`
resolves binding tokens and matches all search words; help stays in JSON.

`core/save.js` retains the old slot API and adds `loadWithInfo`, previous revisions,
portable exports, import preview and import. A new record is validated/serialized
before any storage writes; a usable primary is copied to `.backup` before replacement.
Quota errors leave the primary intact. Damaged primary copies never replace a usable
backup. Checksums catch accidental record damage; legacy records without checksums
remain supported. Future-version records can be exported intact, but cannot be imported
or overwritten by this version. `game/saveValidation.js` checks core company/fleet/load
shape and exercises terrain decoding and legacy defaults on an independent game.
`exportState` works without browser storage; imported files are bounded by JSON tuning.

`screens/saves.js` provides slot summaries, explicit recovery/export controls and a
validated file preview with a manual-slot destination. The app retains the live
company after failed Save and quit. Periodic and morning autosaves run at the end of
a game frame, after tick handlers finish; failed periodic writes wait for the next
interval. `journal.test.js` and `saveRecovery.test.js` cover early action credit,
completion, old saves, isolation, checksum damage, quota failures and import/export.
`journey.mjs` checks the actual screens, a corrupted local copy, download/upload and
failed exits; its final-goal and shortened-autosave fixtures are explicit.

### Neighbouring land and independent terrain

`quarry/land.js` owns parcel descriptions, purchases, reserve samples and coordinate
routing. `state.land.owned` and dated `purchases` default for legacy saves. Buying
initialises the plot before charging once, records `landPurchase` as capital spending
and emits `landPurchased`. All parcels retain the Home company/site, fleet and yard;
there is no site switch or automatic transport.

The original `ctx.ground` and packed Home terrain retain their dimensions and format.
Extra grids are cached by parcel ID in `ctx.parcelGrounds` and snapshotted independently
into `state.parcelGrounds`. Generation uses configured seed offsets without advancing
company RNG. Loading rejects unknown parcel IDs, mismatched plot IDs and invalid packed
terrain. `game/index.js` settles each instantiated grid and snapshots all of them.

`groundAt(ctx,x,z)` returns only owned terrain by default. Shovel/barrow actions,
Direct/Assisted buckets, carrier tips, earthworks, blasting and staff jobs route through
it. Transfers retain their material composition; contractor cuts consume the selected
grid's finite rock reserve. Earthworks stay within a single field. Read-only surveys and
rendering explicitly request unowned terrain. Original nine work-area IDs stay stable;
owned neighbours add parcel-prefixed areas. Land, work-area, buyer and fleet navigation
clear one another when selected.

`world3d/groundAccess.js` routes world-coordinate reads over all visible fields and
traffic mutations over owned fields. Each raw grid has its own `groundChunks` mesh and
colliders; `countryside.js` removes the corresponding terrain/physics tiles underneath
all fields. Site-machine travel accepts owned parcels and their access strips. The
southern hedge has a physical opening, and `landMarkers.js` owns disposable corner
stakes, signs and post colliders; purchase events repaint their ownership state.

`laptop/land.js` presents purchase, survey and entrance navigation; map views show field
boundaries and ownership. The blasting selector maps the chosen owned grid and actual
world coordinates. `land.test.js` checks ownership, capital charges, conserved transfers,
staff work, earthworks, saved contractor cuts, isolated RNG and legacy saves.
`browser-checks/land.mjs` exercises actual purchase controls, tracked-machine boundaries,
both access strips, a physical shovel, map navigation and independent terrain reload.
Its money, machine placement and fixed-step steering are explicit test fixtures.

### Saved working faces

`quarry/operations.js` returns each borehole's ordered current layers and remaining
bedrock alongside the original area reserve estimates. `quarry/faces.js` chooses the
first layer whose target share meets `operations.survey.targetMinimumShare`; intact
rock is a separate finite fallback. Candidate samples sort by least cover, then target
share, then thickness. This is a volume-composition aid, separate from depot mass grading.

`planWorkFace` validates an owned area and current sampled layer before saving
`operations.faces[areaId]` with material, sample index, date and baseline depth/thickness.
The action selects that area for navigation. Refreshing samples never rewrites the
baseline, consumes material or spends money. Plans persist when navigation changes;
`clearWorkFace` removes only the chosen area's plan. Legacy saves need no migration.
`workFacePlan` ignores invalid saved metadata, and `activeWorkFace` computes a waypoint
from the grid index without resurveying terrain every render frame.

`ui/game/laptop/workAreas.js` owns the field filter, nine area buttons, target selector,
nine boreholes, ordered layer profile, baseline comparison and collapsible area reserves.
`world3d/index.js` uses a saved face's exact point when guiding an active work area; the
map reads the same guide. Ordinary area-centre navigation remains available to old saves.
`faces.test.js` covers actual columns, mixed fill, finite rock, depletion, state isolation,
reload and invalid choices. `browser-checks/faces.mjs` uses the real controls and two
saved field plans, with explicit finances and a conserved earthmoving fixture to verify
exhaustion, refresh, reload and clearing.
