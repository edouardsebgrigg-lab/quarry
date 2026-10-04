# Quarry

A first-person quarry mining game for PC. Start with a shovel, a wheelbarrow and a tired old pickup on a field outside a village. Dig by hand, sell what you dig at the depot, save up for a rusty excavator and a tipper truck, and work your way up to better machines, more sites and a mining empire.

Built with plain JavaScript, [Three.js](https://threejs.org) (3D) and [Rapier](https://rapier.rs) (physics). The game logic is separate from the 3D, so balancing and rules live in `data/` and `src/` modules that know nothing about graphics.

## Run it

You need [Node.js](https://nodejs.org) (version 20 or newer).

```bash
npm install      # first time only
npm run dev      # then open the address it prints (usually http://localhost:5173)
npm test         # run the unit tests
```

Use Chrome or Edge for the best experience (full screen and mouse capture work best there).

## Controls

| On foot | |
|---|---|
| W A S D | Walk |
| Mouse | Look |
| Shift | Sprint |
| Space | Jump |
| Left Mouse | Shovel: dig a shovelful (aim at the ground on your field), click again to tip it (into the wheelbarrow, the pickup's or a truck's bed, or on the ground) |
| E | Take the wheelbarrow (at its handles) / get into the machine in front of you / use the office laptop or the dealer's door |
| R | Service / repair the nearest machine |
| F | Plan a haul road, ramp or level area on your land (see below) |
| L | Toggle ground survey: aim at your field to see the remaining material layers and bedrock depth |
| V | Recover a stuck wheelbarrow onto a clear, level patch nearby (its load stays in it) |

| Planning works (F, on foot) | |
|---|---|
| Left Mouse | Set the start, then the end (a coloured strip shows what will be built), then click again to build it |
| Mouse wheel | Width |
| F | Road, ramp or level area |
| Right Mouse | Step back, then cancel. Nothing is spent or changed until the last click |

| Wheelbarrow | |
|---|---|
| W / S | Push / pull |
| Mouse, A / D | Steer (it goes where you look) |
| T | Tip it: pushed up to the pickup's tailgate it goes into the bed, anywhere else on your field it makes a pile |
| E | Let go |

After tipping a barrow into the pickup, hold **S** to back away from the tailgate before turning.

| Pickup, tractor and tipper truck | |
|---|---|
| W / S | Accelerate / brake (the pedal goes down over a quarter of a second). Stopped, hold S to reverse |
| Hold Right Shift | Light pedal: ease away on wet grass without spinning the wheels, or creep back into a bay |
| A / D | Steer |
| Space | Handbrake |
| T | Unload: in a depot bay (after weighing in) you get paid; on your field it makes a heap. The truck tips its bed, the tractor tips its trailer, you shovel the pickup off by hand |
| Z | Cruise control: holds your current speed (above 8 km/h); Z again, W, S or Space cancels |
| C | Cab / outside camera |
| V | Recover (if it's stuck or on its side; puts the trailer straight behind the tractor) |
| E | Get out (on the driver's side: road vehicles are right-hand drive) |

| Mini digger and excavator: Assisted (the default) | |
|---|---|
| Mouse left/right | Swing the arm (the house turns) |
| Hold Left Mouse | Dig a bucket out of your field where the ring is |
| Left Mouse | Dump the bucket into a truck, trailer or the pickup (ring turns blue) or on the ground |
| W A S D | Drive on tracks (not road-legal: they stay on your land) |
| G | Switch to Direct controls |
| Q | Choose an attachment (bucket, trench, grading, breaker) |
| C | Cab / outside camera |
| E | Get out |

| Mini digger and excavator: Direct (G, or Settings) | |
|---|---|
| Mouse left/right | Swing |
| Mouse forward/back | Stick out / in |
| Mouse wheel (or Up / Down arrows) | Boom up / down |
| I / K | Stick out / in independently |
| U / O | Slew left / right independently |
| Hold X | Free look without moving the arm |
| Hold Right Shift | Precision movement |
| T (empty bucket) | Cycle standard, trench, grading or available breaker attachment |
| T (loaded, Assisted) | Return to the last dump destination |
| Hold Left Mouse (or Left arrow) | Curl the bucket in |
| Hold Right Mouse (or Right arrow) | Open the bucket |
| W A S D | Drive on tracks |

In Direct mode the tooth edge sweeps a strip through the ground. Bucket width, angle, available room, machine force and material resistance determine the bite. A partly filled bucket keeps collecting until its loose-volume capacity is reached. The load pours only when the bucket opens, into the bed beneath it or onto your field. Assisted mode performs a real reach/bite/drag/curl/lift stroke; use the wheel to adjust reach and Right Shift + wheel to adjust cut depth. Both modes show reach, depth and load in the HUD.

| Site dumper | |
|---|---|
| W / S, A / D | Drive, turn on the spot (tracks; it stays on your land) |
| T | Tip the skip forward |
| C / E | Camera / get out |

| Anywhere | |
|---|---|
| B | Office laptop: plant dealer (machines, upgrades, yard buildings) |
| M | Office laptop: depot prices |
| Tab | Map |
| J | Goal details |
| H | Show / hide the key hints |
| P | Pause time · 1 / 2 / 3 game speed (time only runs while you're playing: it waits for your first click, and stops when you press Esc, alt-tab or the window is hidden) |
| Esc | Menu |
| F1 | Dev panel (in `npm run dev` only) |

All keys can be changed in Settings. **Settings → Display** also controls field of view (50–95°) and camera motion; set motion to zero for a steady view. **Settings → Game** can switch off the guide beam (the arrow at the top and the map still show the way) and Ray's tips (they still arrive in Messages). Walking eases into movement and stops, jumps support a small input buffer, and reversing a road vehicle brakes before changing direction.

**Q in a digger** opens compatible attachments with their purpose and actual width/capacity or breaking force. Pick a tool directly; the panel returns to the same cab. Stop travelling/slewing, finish the stroke and empty the bucket first. Rental tools stay unchanged. T still cycles empty attachments or recalls the last Assisted dump target.

**Z in a road vehicle** captures your current forward speed once above 8 km/h. Release the accelerator to let cruise hold it; Z again, a new W/S press, or Space cancels. Engine off, recovery, leaving the cab or sustained loss of wheel contact also cancels it. Loads, grades, grip, available engine power and towing speed limits still matter. The dash shows the selected speed and any grip/terrain limitation; cruise is cleared when loading a save.

**Settings → Controls → Hold to repeat shovel** avoids repeated clicks. **V on foot** recovers a stuck wheelbarrow onto a nearby clear, level patch while retaining its cargo; V in a road vehicle recovers that vehicle. **Tab → machine name** selects a machine and marks the route to it; select *Follow the current goal* to clear the waypoint. Existing saves retain their business date, loads, staff and trailer combinations.

## Getting started

You've bought a field off Mill Lane, outside the village of Ashby, with $200, a shovel, a wheelbarrow and your old pickup. A goal card (top left) walks you through the first steps:

1. Walk from the yard through the gap in the hedge onto your field, look at the ground and click to dig a shovelful of topsoil.
2. Look into the wheelbarrow (just inside the field) and click to tip each shovelful in until it's full.
3. Take the handles (**E**), push the barrow up to the pickup's tailgate in the yard and tip it in (**T**). Do it again until there's at least 300 kg on board.
4. Get in the pickup and drive to **Ashby Aggregates**: out of the gate, east along Mill Lane, north into Ashby, left at The Plough onto Quarry Road, and the depot is on the right. **Tab** shows the map.
5. Stop on the weighbridge at the depot gate to weigh in, then back up to the **topsoil** bay and unload (**T**).
6. Buy a cheap upgrade for the pickup, then choose a **compact digger** (the Micro 08 costs $180, or rent one to try it) (on the office laptop, **E** at the door, **B** anywhere, or at Ashby Plant in the village). Bought machines are delivered to your yard. It digs far faster than you can and loads the pickup.
7. Buy a **tractor and a separate trailer**, hitch them in Fleet, and sell at least 1 t. The cheapest Yard pair costs $255 and carries 1.5 t. Gross tow limits include empty trailer mass.
8. Build your first groundworks (**F** on foot): a ramp out of the pit, a haul road or a level area.
9. Then the 8 t **excavator** and the **tipper truck**, earn $3,000, and buy your next machine.
10. After that, grow the business with clean material sales, yard buildings and a stronger fleet. Jobs-board orders are optional alternatives to the clean-tonnage goals.

**Ray**, who sold you the field, texts you the plan as each goal comes up (top right), plus the odd tip when something goes wrong. A **guide marker** shows where to go next: a column of light in the world, an arrow with the distance at the top of the screen, and a ring on the map (**Tab**). It follows what you're doing, so it points at the barrow, then the pickup, then the weighbridge, then the right bay.

The Micro 08 is affordable from your starting cash. The pacing tests estimate the first tractor/trailer pair within 40 minutes of pickup hauling, then check that larger buckets and beds make subsequent upgrades practical. These estimates assume continuous work and are not a timed playthrough.

Each goal pays a small bonus. Entry equipment is small and slow; upgrades improve bucket capacity, reach, hydraulic force, speed or towing capacity.

## Selling at the depot

1. Drive onto the weighbridge at the gate and stop. After a moment the light turns green and you get a ticket for the load.
2. Back up to the bay for your material (TOPSOIL, CLAY, SAND, GRAVEL or MIXED FILL; the prompt tells you when you're in one and what you'll get) and unload (**T**).
3. You're paid per tonne. A **clean** load (95% or more of that material) gets the full price, a **slightly mixed** one (80–95%) gets 75%, and anything more mixed is paid as mixed fill. Tipping in the mixed fill bay always pays the fill price.

Prices drift up and down, and flooding the market with one material lowers its price for a while. **M** shows the depot's price board.

## Digging and the ground

The field is real ground you can dig anywhere: topsoil on top, then clay, sand and gravel, with rock at the bottom. Each shovelful comes out of the ground where you aim, so holes get deeper and walls that are too steep cave in. Whatever you tip on the ground (off the shovel, out of the barrow or off a truck) makes a real heap that slumps to its natural slope; you can walk on it and shovel it back up. A barrow holds about 0.11 m³: around 115 kg of topsoil, more of heavier gravel. Topsoil sells best; clay is worth little. Keep the layers apart if you want clean loads.

Topsoil crumbles easily, clay resists and holds steep faces, sand spreads readily and gravel settles as loose aggregate. Weather and compaction affect grip and resistance; turf wears under traffic, from flattened tracks to mud. A compatible breaker extracts finite bedrock into saleable broken rock; ordinary buckets cannot cut intact rock. Traffic compacts the surface and displaces shallow rut spoil without destroying tonnes. Exposed slopes show the underlying strata.

The machine dash shows the attachment, material under the teeth, cutting resistance, hydraulic effort and actual bucket volume. Advice explains a full bucket, a hard bite, the wrong tool for rock or loose rubble, low grip and excessive towing load. The ground survey reads the current excavated column, including deposited spoil and compacted fill; it changes no material or money. Thin deposits show their cover and the working material below.

## Machines

The dealer separates **Diggers**, **Tractors**, **Trailers**, **Haulage** and **Getting around**. Condition is saved on each owned machine separately from its model and upgrades.

| Digger | Operating mass | Bucket | Reach |
|---|---:|---:|---:|
| Micro 08 | 0.8 t | 0.03 m³ | 2.4 m |
| Mini 16 | 1.6 t | 0.08 m³ | 3.3 m |
| Compact 25 | 2.5 t | 0.12 m³ | 4.0 m |
| Compact 35 | 3.5 t | 0.20 m³ | 4.6 m |
| Utility 80 | 8 t | 0.40 m³ | 6.8 m |
| Production 130 | 13 t | 0.70 m³ | 8.0 m |
| Quarry 210 | 21 t | 1.10 m³ | 9.2 m |
| Heavy 320 | 32 t | 1.60 m³ | 10.5 m |

Five tractors run from Yard 35 (25 km/h, 3 t gross tow limit) to Haul 210 (50 km/h, 24 t gross). Five tipping trailers have 1.5, 3, 6, 10 and 16 t nominal payloads; usable payload also depends on the tractor's tow limit and the bed's volume. Single, tandem and triaxle bodies have different braking and tipping behaviour. Stop within 10 m and use **Fleet → Hitch**; **Unhitch** parks the same loaded trailer. Load and weighbridge tickets follow the trailer, and changing the combination invalidates its ticket.

A quad, utility buggy, purchasable 4×4 and service van provide other ways to get around. The service van provides nearby mechanical support. Incoming one- or three-day rentals in the dealer let you try diggers or vehicles before buying. The fee and refundable deposit are shown before renting; return through Fleet after unloading and releasing staff. Keeping equipment past its due time incurs another day rate, and damage is settled from the deposit. A rental cannot be sold or hired out.

The machines behave like the real thing:
- **Pickup:** an old petrol six with a 4-speed automatic and rear-wheel drive, on soft leaf springs (it leans in bends; right-hand drive, so you get out on the right). It carries 0.8 t in the bed; you load it by barrow, shovel or excavator and shovel it off by hand at the other end. Empty, there's little weight over the driven wheels: on wet grass they spin and the back steps out, so pull away gently, and a load in the bed (or a 4×4) helps.
- **Tipper truck:** a diesel engine with a torque curve and a 4-speed automatic gearbox, engine braking, air brakes and grip that depends on the ground (tarmac, gravel, dirt, grass). A loaded truck is heavier at the back, slower to pull away, slower up hills and longer to stop. Worn trucks misfire.
- **Tractor and trailer:** an old diesel with a low-revving torque curve and big driven rear wheels, pulling a tipping trailer. The trailer follows like a real one: it cuts the corner inside the tractor's path, and it jackknifes if you reverse carelessly (the back goes the opposite way to the wheel). Loaded, it's slow to get going and slow to stop.
- **Mini digger and site dumper:** small rubber-tracked site machines. The mini digger is Assisted or Direct like the excavator, just smaller and much cheaper; the dumper carries a tonne or so round your field and tips its skip forward.
- **Excavator:** the arm is solved so the bucket really reaches the ground or the truck bed: it reaches out, bites, drags back along the ground and curls. Every joint moves like a hydraulic ram, the rams slide in and out, the house swings with inertia, and the tracks roll round their sprockets. The machine tilts with the ground and rocks as the bucket bites.
- **Grip** depends on the ground under each wheel and how wet it is: tarmac, then rock, dirt and gravel, then grass. Rain soaks the ground over a while and it dries out after; wet grass and mud lose far more grip than gravel. Brake harder than the ground allows and the wheels lock and slide (with no ABS, a locked front won't steer); accelerate harder and they spin, throwing up turf, mud or stones.
- **Your field wears where you drive.** Tyres flatten the grass into tracks, and wet ground, heavy loads or spinning wheels tear it to mud (which then ruts). Use the same route and it becomes a muddy track; build a haul road where traffic is heavy.
- Engines start when you get in (starter motor, a puff of black smoke) and stop a few seconds after you leave. From the cab you feel acceleration, braking, bumps and engine vibration.

All sound is generated in code (no recordings): engines by rpm and load, gear changes, tyres on gravel or tarmac, air brakes, the reverse alarm, hydraulics, clanking tracks, digging, rock pouring into the steel bed, footsteps, wind, birds and the odd car on the road outside. Volume is in Settings.

## Building with material

### Quarry operations: plan, process and grow

Open the office laptop and choose **Quarry operations** (also linked from Home).
The **Work areas** tab divides the field into nine areas and samples their actual
remaining layers. Compare approximate reserves, overburden and depth to bedrock,
then **Set as work area** to mark it in the field and on the map. **Refresh survey**
reads the ground again after digging. The survey is an estimate; it does not create
resources. Choosing a machine waypoint or **Follow current goal** clears the area guide.

Commission **Stockpile bays**, then a **Jaw crusher** or **Screening plant** in the
plant dealer's Yard buildings section. Tip feed into a bay using the normal vehicle
or digger controls. In **Production**, choose the recipe, different feed/product
bays and batch size. The live quote shows operating cost, game time, products,
rejects and the indicative change in today's depot value.

- The crusher needs clean **broken rock** and makes an **80% gravel / 20% sand** blend.
- The screener recovers the gravel or sand already in a mixed batch. Other material
  returns to the feed bay; every tonne remains accounted for.
- Batches reserve both finished-product space and room to return their held feed.
  Costs are paid at the start. **Cancel batch** returns the feed without refunding
  the operating cost. One batch runs per plant, and both plants can work together.
- Production runs on game time, stops with the game clock and resumes after
  **Save/Continue**. It does not simulate progress while the game is closed.
- Finished material still needs loading and hauling to the depot. Processing is
  not a sale; prices, purity and saturation determine what it actually earns.

The **Yard** tab shows composition, free/reserved space and today's depot quotes.
Valid recipe, bay and quantity choices are saved per plant, including when you
switch tabs or use Save/Continue. **Batch history** keeps the last 20 completed or
cancelled batches with their outputs, destinations and operating costs. **Plan again**
restores those choices for a fresh quote; press **Start batch** when you're ready
to pay and begin. A completion notice tells you which bay has the finished product.
**Daily reports** separates trading income, running costs and investment, alongside
digging, sales, completed batches and processed tonnes. Three optional production
milestones reward your first batch and growing throughput; no contract is required.

Press **F** on foot to plan works on your field: a **haul road**, a **ramp** (steeper, for getting out of a pit) or a **level area** (flattens a patch, filling holes). Aim at the ground and click where it starts and where it ends; a coloured strip shows the finished surface (green: you can build it, amber: you can't afford it yet, red: it can't be built, with the reason on the card). The card says the slope, the price (labour, per square metre) and the material: what has to be dug out, the gravel for the surface and where it comes from.

Nothing is made from nothing. The strip is cut or filled to the planned grade, gravel for the surface and any fill still needed are taken from **loose heaps within 30 m** of it (tip gravel there first: off the truck, the dumper, the barrow or a bucket), and whatever the cut left over is heaped beside the road, never lost. Roads and ramps are topped with a loose gravel surface (vehicles use the game's gravel driving behaviour: it rolls easier than dirt or grass); a built strip is firm, so it doesn't slump, but digging into it breaks it up again. Roads can be up to 10% slope, ramps 18%. Move machines and the wheelbarrow clear of the cells being graded, including the side slopes (with a 0.5 m safety margin). You can stand at the start post to build: your feet are placed on the new surface. You can't build on rock or at the edge of your land. Built ground is saved with the game.

In the preview, the amber ring marks where spare spoil will be heaped. Move machines and the
wheelbarrow clear first; heap cells with something parked on them can't supply material.

Road/ramp/level previews show usable gravel from the planned cut and nearby clear heaps, exact required/available tonnes, compacted fill volumes and quantitative shortages. A steep plan gives the minimum run for the same rise. Planning controls sit inside the quote, and a successful build stays confirmed there. The preview costs nothing and creates no material; only the final click builds and charges.

## Yard facilities

Open the plant dealer on the laptop (**B**) and choose **Yard buildings**. The first facilities commission structures
already in your yard: a **Container workshop** ($450) cuts service/repair prices by 25% and
times by 30%; **Bulk fuel supply** ($300) cuts machine-job fuel charges by 15%. Benefits apply
to machines at this site, including Direct digging. Existing maintenance jobs keep their quoted
price and duration. Ownership is saved, and signs appear on commissioned structures. Prices
are an initial balance pass. These are fixed upgrades; they do not place new buildings.

**Stockpile bays** (also in Yard buildings) let you hold material until the price is right. Back a carrier’s tail into
one of the three bays at the south end of the yard and press T to store its load.
Each bay holds 25 t. With a digger bucket over a bay, hold LMB in Assisted mode
(or cut into the heap in Direct mode) to reload stored material. Dump the bucket into
a carrier as usual. Mixing stays mixed, and storing earns no sale income. Tab shows each
bay’s contents and grade; inventory survives saving and loading.

Commission the **Home weighbridge** in Yard buildings to weigh at your driveway. Stop
a loaded road vehicle on the steel deck: its load, purity and current best depot quote
appear with the ticket. You can then drive straight to the depot bays. The quote can
change on the journey. Adding/removing material invalidates the ticket; field or
stockpile tipping clears it. The depot bridge still weighs loads normally.

## The loop with machines

1. Get in the mini digger (or excavator), drive it onto your field, swing the bucket over the ground and hold the left mouse button to dig. It digs where the ring is, as deep as the bucket bites.
2. Park the pickup, tractor or truck next to it, swing round and click to dump each bucket into the bed.
3. Drive to the depot, weigh in, back into the right bay and press **T** to tip (with the tractor, back the trailer in: take it slowly).
4. Buy upgrades in the plant dealer (**B**). Service your machines (**R**) before they break down.

Site machines (mini digger, excavator, dumper) can't leave your land; the pickup, tractor and truck can go anywhere.

## Staff

Hire people in the laptop's **Staff** app and give each one a job and a machine:

- **Digger operator:** digs where the digger is parked, sorts heaps by material, or loads a paired driver's truck directly.
- **Haulage driver:** hauls heaps from the field (or buckets from a paired operator) to the depot, a jobs-board customer or your regular order.
- **Sales and office:** gets a better price for every load and takes on work from the jobs board.
- **Fitter:** services and repairs your machines without being asked, and cuts the cost of the work.

Everyone has digging, driving, selling and fixing skills (one to five stars) and a daily wage, paid each morning. You can't drive a machine someone is working. The first staff post opens when you own a digger and make two depot sales (or earn $120). An apprentice is available immediately at **$18 per day with an $18 fee**. Later posts keep their existing growth requirements. Payroll is shown in Staff and skill grows through real work.

In **Staff**, haulage drivers have Customer and Loading choices. Select an accepted
jobs-board customer or regular order to haul its clean material on purpose. Finished
jobs wait for a new choice; regular drivers wait once this week's quota is filled.
Park a truck bed within the digger's reach, assign both workers, and choose that
operator under Loading to receive buckets directly. A full bed leaves for delivery;
leftover bucket material stays with the operator. Heaps remain available as a loading choice.
Completed digging, round trips, sales and fitter jobs earn experience and raise the
matching skill up to five stars. The agreed daily wage stays fixed; progress appears in Staff.

## Time, day and night

Daylight follows a separate **20-minute cycle** of active play, with a moving sun, dusk,
night and dawn. The business calendar takes **20 minutes per day at 1×**: wages, prices, contracts
and deadlines still follow the date/clock shown in the HUD. Changing economic speed
leaves daylight at its normal pace. Both clocks stop when play pauses or loses focus.
Night has moonlit ambient light and an automatic work light following your view; the
weather label shows Dawn/Dusk/Night. The daylight phase is saved; older saves start it
at morning.

## Milestones and perks

Alongside the goals, the office laptop's **Milestones** app lists 31 company achievements you can go for in any order: tonnes sold and dug, clean loads in a row, loads sold in the rain, your best day, gravel dug, metres of haul road, ramps, yard buildings, the size of your fleet, jobs done, reputation, loans paid off and money earned. Each pays a cash reward when you reach it, and three switch on a perk for good:

- **Depot account** (sell 500 t): the depot pays 4% more for clean loads
- **Fuel card** (dig 400 t): 10% off diesel
- **Trade account** (own 6 machines): 5% off machines, upgrades and yard buildings at the dealer

Choose a personal target in **Milestones** to follow its progress, reward and next step in the HUD and Home. Switch or clear it freely; other milestones still pay once when earned, and a reached target stays visible until you choose another.

The numbers are in `data/milestones.json`. An old save catches up the first time something happens: anything you've already done is paid out then.

## Things that happen

Every so often something comes up that asks for a decision:

- **The site inspector:** once you have a few machines, the council's inspector visits every week or two. You get a message the day before (Ray explains the first time). At 10:00 on the day, every machine that's broken down or under 40% condition is a $60 fine; if they're all above 70%, your reputation goes up. Service your machines (**R**) before they arrive.
- **Rush jobs:** once you've finished a job, a customer sometimes posts a rush order on the jobs board: fewer tonnes, due tomorrow, twice the bonus, and only open today.
- **Dealer's offers:** Ashby Plant sometimes takes 15% off one machine you don't own yet, for three days. It's marked in the plant dealer.

The numbers are in `data/happenings.json`.

## The map

The map is 2 km across. Your land is the 150 m field and the yard next to it, on Mill Lane. The lane runs east and then north through **Ashby** (a village with a pub and the machine dealer, **Ashby Plant**). In the middle of the village **Quarry Road** turns off west to **Ashby Aggregates**, the depot where you sell. It's about 1.2 km from your gate by road, a couple of minutes in the pickup. Site machines (the excavator) aren't road-legal and stay on your land; the pickup and the tipper truck can go anywhere. Four farms sit back from the lanes (Mill Farm is across the lane from your gate); they're scenery for now.

## For developers and agents

- `AGENTS.md`: how to work on this repository (branches, checks, code rules). Start here.
- `docs/TASKS.md`: the shared task queue; `docs/LOG.md`: what each task changed and what was checked
- `docs/modules.md`: a short guide to the code
- `docs/models.md`: the 3D models, how to rebuild them in Blender, and how to make your own
- `docs/design-spec.md`: the game design; `docs/implementation-plan.md`: the milestones
- `docs/handover/browser-checks/`: headless-browser checks (`smoke.mjs` is the quick one)
- `docs/archive/`: earlier handoffs, checkpoints and queues

## Regional deliveries and plant development

The laptop's **Regional trade** app compares an example load or your selected vehicle's
actual cargo against Ashby and three new businesses. **Mill Lane Nursery** buys clean
soil and gravel, **Ashby Concrete** buys sand and gravel, and **Wolds Roadstone** takes
rock and mixed material. Each has its own daily demand and prices. Repeat deliveries
build a supplier relationship with better prices; no contract is required.

Choose **Guide me here**, drive to the business's public weighbridge and stop to weigh.
Then stop with the vehicle's unloading point inside its yellow delivery pad and press
**T**. A business only buys its remaining daily demand: excess stays aboard and needs
weighing again before the next sale. Demand includes deliveries already tipping, resets
each game day, and recent receipts survive saving. Regional sales do not fulfil unrelated
depot contracts. Map distances are straight-line estimates, not road distances.

In **Quarry operations → Plant workshop**, fit two successive upgrades to each owned
crusher or screener for faster batches and lower running costs. Completed batches wear
the plant, reducing throughput. Pay for a timed service when worn; an exhausted plant
must be serviced before another batch. Upgrades and services require the plant to be idle.
Running batch prices and durations remain fixed, and service progress survives Continue.

In **Work areas**, **Record survey** keeps a baseline for the selected area. Later surveys
show how estimated reserves have changed, including material dumped back into the area.
These are sampled estimates, not an exact extraction ledger. Replace the baseline whenever
you want to start a new comparison.

## Planning a working yard

In **Quarry operations → Production**, choose a recipe, feed bay, product bay and batch
size. **Add to queue** schedules 1–20 batches without taking material or money. Each
plant can hold eight orders. In **Queue**, move orders earlier/later, remove them, or pause
and resume the plant's waiting work. Orders run at your active quarry when game time
advances. You can keep digging or drive a delivery while the yard processes its stock.

A queue waits if the feed is unsuitable or insufficient, the product bay is full, the
plant needs servicing, or there isn't enough money. Automatic batches initially leave
**$100** in the bank; change this reserve in Queue to protect fuel and other spending.
Every batch checks current prices, condition and capacity before starting. Queued orders
do not reserve stock or space, and unfinished orders, pauses and the cash reserve survive
Continue. Home highlights queues needing attention.

**Pause queue** and **Remove order** leave an already running batch alone. **Cancel batch**
returns that batch's feed and also pauses its queue; its operating cost is retained and
the cancelled batch is not re-added. **Start batch** remains available for manual work
and can spend below the automatic reserve.

Each **Yard** bay can be expanded independently from **25 t → 40 t → 55 t**. Upgrades
raise the actual walls and increase room without moving material or cancelling reserved
production/deliveries. The screener also has **Recover topsoil** and **Separate clay**
recipes: they separate material already present in the feed, returning everything else
to its source bay. Clean recovered topsoil can be delivered to the nursery.
