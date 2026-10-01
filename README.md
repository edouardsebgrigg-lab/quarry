# Quarry

A first-person quarry mining game for PC. Start with a shovel, a wheelbarrow and a tired old pickup on a field outside a village. Dig by hand, sell what you dig at the depot, save up for a rusty excavator and a tipper truck, and work your way up to better machines, more sites and a mining empire.

Built with plain JavaScript, [Three.js](https://threejs.org) (3D) and [Rapier](https://rapier.rs) (physics). The game logic is separate from the 3D, so balancing and rules live in `data/` and `src/` modules that know nothing about graphics.

The fleet includes refined Blender models with transparent cab glazing, worn paint
and distinct rubber/steel materials. See [model rebuilding and rig contracts](docs/models.md).

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

| Pickup, tractor and tipper truck | |
|---|---|
| W / S | Accelerate / brake. Stopped, hold S to reverse |
| A / D | Steer |
| Space | Handbrake |
| T | Unload: in a depot bay (after weighing in) you get paid; on your field it makes a heap. The truck tips its bed, the tractor tips its trailer, you shovel the pickup off by hand |
| C | Cab / outside camera |
| V | Recover (if it's stuck or on its side; puts the trailer straight behind the tractor) |
| E | Get out |

| Mini digger and excavator: Assisted (the default) | |
|---|---|
| Mouse left/right | Swing the arm (the house turns) |
| Hold Left Mouse | Dig a bucket out of your field where the ring is |
| Left Mouse | Dump the bucket into a truck, trailer or the pickup (ring turns blue) or on the ground |
| W A S D | Drive on tracks (not road-legal: they stay on your land) |
| G | Switch to Direct controls |
| C | Cab / outside camera |
| E | Get out |

| Mini digger and excavator: Direct (G, or Settings) | |
|---|---|
| Mouse left/right | Swing |
| Mouse forward/back | Stick out / in |
| Mouse wheel (or Up / Down arrows) | Boom up / down |
| Hold Left Mouse (or Left arrow) | Curl the bucket in |
| Hold Right Mouse (or Right arrow) | Open the bucket |
| W A S D | Drive on tracks |

In Direct mode the teeth cut the ground where they really are (as much as fits in the bucket, and not into rock or off your land), and the load runs out where the tilted bucket really is: into a truck or trailer under it, or onto the ground as a heap.

| Site dumper | |
|---|---|
| W / S, A / D | Drive, turn on the spot (tracks; it stays on your land) |
| T | Tip the skip forward |
| C / E | Camera / get out |

| Anywhere | |
|---|---|
| B | Shop (machines and upgrades) |
| M | Depot prices |
| Tab | Map |
| J | Goal details |
| H | Show / hide the key hints |
| P | Pause time · 1 / 2 / 3 game speed (time only runs while you're playing: it waits for your first click, and stops when you press Esc, alt-tab or the window is hidden) |
| Esc | Menu |
| F1 | Dev panel (in `npm run dev` only) |

All keys can be changed in Settings.

## Machines and sound

The machines behave like the real thing:
- **Pickup:** an old petrol six with a 4-speed automatic. It carries 0.8 t in the bed; you load it by barrow, shovel or excavator and shovel it off by hand at the other end.
- **Tipper truck:** a diesel engine with a torque curve and a 4-speed automatic gearbox, engine braking, air brakes and grip that depends on the ground (tarmac, gravel, dirt, grass). A loaded truck is heavier at the back, slower to pull away, slower up hills and longer to stop. Worn trucks misfire.
- **Tractor and trailer:** an old diesel with a low-revving torque curve and big driven rear wheels, pulling a tipping trailer. The trailer follows like a real one: it cuts the corner inside the tractor's path, and it jackknifes if you reverse carelessly (the back goes the opposite way to the wheel). Loaded, it's slow to get going and slow to stop.
- **Mini digger and site dumper:** small rubber-tracked site machines. The mini digger is Assisted or Direct like the excavator, just smaller and much cheaper; the dumper carries a tonne or so round your field and tips its skip forward.
- **Excavator:** the arm is solved so the bucket really reaches the ground or the truck bed: it reaches out, bites, drags back along the ground and curls. Every joint moves like a hydraulic ram, the rams slide in and out, the house swings with inertia, and the tracks roll round their sprockets. The machine tilts with the ground and rocks as the bucket bites.
- Engines start when you get in (starter motor, a puff of black smoke) and stop a few seconds after you leave. From the cab you feel acceleration, braking, bumps and engine vibration.

All sound is generated in code (no recordings): engines by rpm and load, gear changes, tyres on gravel or tarmac, air brakes, the reverse alarm, hydraulics, clanking tracks, digging, rock pouring into the steel bed, footsteps, wind, birds and the odd car on the road outside. Volume is in Settings.

## Getting started

You've bought a field off Mill Lane, outside the village of Ashby, with $200, a shovel, a wheelbarrow and your old pickup. A goal card (top left) walks you through the first steps:

1. Walk from the yard through the gap in the hedge onto your field, look at the ground and click to dig a shovelful of topsoil.
2. Look into the wheelbarrow (just inside the field) and click to tip each shovelful in until it's full.
3. Take the handles (**E**), push the barrow up to the pickup's tailgate in the yard and tip it in (**T**). Do it again until there's at least 300 kg on board.
4. Get in the pickup and drive to **Ashby Aggregates**: out of the gate, east along Mill Lane, north into Ashby, left at The Plough onto Quarry Road, and the depot is on the right. **Tab** shows the map.
5. Stop on the weighbridge at the depot gate to weigh in, then back up to the **topsoil** bay and unload (**T**).
6. Buy a cheap upgrade for the pickup, then keep going by hand until you can afford the **mini digger** (on the office laptop, **E** at the door, **B** anywhere, or at Ashby Plant in the village). Bought machines are delivered to your yard. It digs far faster than you can and loads the pickup.
7. Save up for the **tractor and trailer** (4 t a trip instead of 0.8), and sell a trailer load.
8. Build your first groundworks (**F** on foot): a ramp out of the pit, a haul road or a level area.
9. Then the 8 t **excavator** and the **tipper truck**, earn $3,000, and a Used machine.
10. After that, the business: a job from the **Jobs board**, a yard building, 300 t of clean material, a reputation of 3, a Used digger and a Used road vehicle, and $15,000 earned.

**Ray**, who sold you the field, texts you the plan as each goal comes up (top right), plus the odd tip when something goes wrong. A **guide marker** shows where to go next: a column of light in the world, an arrow with the distance at the top of the screen, and a ring on the map (**Tab**). It follows what you're doing, so it points at the barrow, then the pickup, then the weighbridge, then the right bay.

Roughly how long each machine takes to save for, playing the obvious way (from `src/progression/pacing.test.js`): the mini digger a few minutes after your first sale, the tractor about half an hour after that, then the excavator and the truck about half an hour each.

Each goal pays a small bonus. Everything starts slow and clapped-out on purpose. Every machine tier is roughly 2.5 to 3 times better than the one before, so each purchase is a big step.

## Milestones and perks

Alongside the goals, the office laptop's **Milestones** app lists 25 company achievements you can go for in any order: tonnes sold and dug, clean loads in a row, loads sold in the rain, your best day, gravel dug, metres of haul road, ramps, yard buildings, the size of your fleet, jobs done, reputation, loans paid off and money earned. Each pays a cash reward when you reach it, and three switch on a perk for good:

- **Depot account** (sell 500 t): the depot pays 4% more for clean loads
- **Fuel card** (dig 400 t): 10% off diesel
- **Trade account** (own 6 machines): 5% off machines, upgrades and yard buildings at the dealer

The numbers are in `data/milestones.json`. An old save catches up the first time something happens: anything you've already done is paid out then.

## Things that happen

Every so often something comes up that asks for a decision:

- **The site inspector:** once you have a few machines, the council's inspector visits every week or two. You get a message the day before (Ray explains the first time). At 10:00 on the day, every machine that's broken down or under 40% condition is a $60 fine; if they're all above 70%, your reputation goes up. Service your machines (**R**) before they arrive.
- **Rush jobs:** once you've finished a job, a customer sometimes posts a rush order on the jobs board: fewer tonnes, due tomorrow, twice the bonus, and only open today.
- **Dealer's offers:** Ashby Plant sometimes takes 15% off one machine you don't own yet, for three days. It's marked in the plant dealer.

The numbers are in `data/happenings.json`.

## The map

The map is 2 km across. Your land is the 150 m field and the yard next to it, on Mill Lane. The lane runs east and then north through **Ashby** (a village with a pub and the machine dealer, **Ashby Plant**). In the middle of the village **Quarry Road** turns off west to **Ashby Aggregates**, the depot where you sell. It's about 1.2 km from your gate by road, a couple of minutes in the pickup. Site machines (the excavator) aren't road-legal and stay on your land; the pickup and the tipper truck can go anywhere. Four farms sit back from the lanes (Mill Farm is across the lane from your gate); they're scenery for now.

## Selling at the depot

1. Drive onto the weighbridge at the gate and stop. After a moment the light turns green and you get a ticket for the load.
2. Back up to the bay for your material (TOPSOIL, CLAY, SAND, GRAVEL or MIXED FILL; the prompt tells you when you're in one and what you'll get) and unload (**T**).
3. You're paid per tonne. A **clean** load (95% or more of that material) gets the full price, a **slightly mixed** one (80–95%) gets 75%, and anything more mixed is paid as mixed fill. Tipping in the mixed fill bay always pays the fill price.

Prices drift up and down, and flooding the market with one material lowers its price for a while. **M** shows the depot's price board.

## Digging by hand

The field is real ground you can dig anywhere: topsoil on top, then clay, sand and gravel, with rock at the bottom. Each shovelful comes out of the ground where you aim, so holes get deeper and walls that are too steep cave in. Whatever you tip on the ground (off the shovel, out of the barrow or off a truck) makes a real heap that slumps to its natural slope; you can walk on it and shovel it back up. A barrow holds about 0.11 m³: around 115 kg of topsoil, more of heavier gravel. Topsoil sells best; clay is worth little. Keep the layers apart if you want clean loads.

## Building with material

Press **F** on foot to plan works on your field: a **haul road**, a **ramp** (steeper, for getting out of a pit) or a **level area** (flattens a patch, filling holes). Aim at the ground and click where it starts and where it ends; a coloured strip shows the finished surface (green: you can build it, amber: you can't afford it yet, red: it can't be built, with the reason on the card). The card says the slope, the price (labour, per square metre) and the material: what has to be dug out, the gravel for the surface and where it comes from.

Nothing is made from nothing. The strip is cut or filled to the planned grade, gravel for the surface and any fill still needed are taken from **loose heaps within 30 m** of it (tip gravel there first: off the truck, the dumper, the barrow or a bucket), and whatever the cut left over is heaped beside the road, never lost. Roads and ramps are topped with a loose gravel surface (vehicles use the game's gravel driving behaviour: it rolls easier than dirt or grass); a built strip is firm, so it doesn't slump, but digging into it breaks it up again. Roads can be up to 10% slope, ramps 18%. Move machines and the wheelbarrow clear of the cells being graded, including the side slopes (with a 0.5 m safety margin). You can stand at the start post to build: your feet are placed on the new surface. You can't build on rock or at the edge of your land. Built ground is saved with the game.

## Yard facilities

Open the shop (**B**) and choose **Yard buildings**. The first facilities commission structures
already in your yard: a **Container workshop** ($450) cuts service/repair prices by 25% and
times by 30%; **Bulk fuel supply** ($300) cuts machine-job fuel charges by 15%. Benefits apply
to machines at this site, including Direct digging. Existing maintenance jobs keep their quoted
price and duration. Ownership is saved, and signs appear on commissioned structures. Prices
are an initial balance pass. These are fixed upgrades; they do not place new buildings.

## The loop with machines

1. Get in the mini digger (or excavator), drive it onto your field, swing the bucket over the ground and hold the left mouse button to dig. It digs where the ring is, as deep as the bucket bites.
2. Park the pickup, tractor or truck next to it, swing round and click to dump each bucket into the bed.
3. Drive to the depot, weigh in, back into the right bay and press **T** to tip (with the tractor, back the trailer in: take it slowly).
4. Buy upgrades in the shop (**B**). Service your machines (**R**) before they break down.

Site machines (mini digger, excavator, dumper) can't leave your land; the pickup, tractor and truck can go anywhere.

## Docs

- `docs/design-spec.md`: the game design
- `docs/implementation-plan.md`: milestones
- `docs/modules.md`: a short guide to the code
- `docs/models.md`: the 3D models, how to rebuild them in Blender, and how to make your own
- `docs/TASKS.md`: the current work queue (Claude plans and reviews on `claude/coordination`; Codex implements on its own branch)
- `docs/CODEX-CHECKPOINT.md`: Codex's progress reports, with what was actually run
- `docs/HANDOVER.md`: the Step 7 handover and its verification record
- `docs/handover/browser-checks/`: bounded headless-browser checks (software rendering is slow; see `docs/TASKS.md` for how to run them)

Earthworks preview: the amber ring marks where spare spoil will be heaped. Move machines
and the wheelbarrow clear; occupied heap cells cannot supply works material.

After tipping a barrow into the pickup, hold S to back away from the tailgate before turning.

Buy Stockpile bays in the laptop’s Yard buildings category. Back a carrier’s tail into
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

In **Staff**, haulage drivers have Customer and Loading choices. Select an accepted
jobs-board customer or regular order to haul its clean material on purpose. Finished
jobs wait for a new choice; regular drivers wait once this week's quota is filled.
Park a truck bed within the digger's reach, assign both workers, and choose that
operator under Loading to receive buckets directly. A full bed leaves for delivery;
leftover bucket material stays with the operator. Heaps remain available as a loading choice.
Completed digging, round trips, sales and fitter jobs earn experience and raise the
matching skill up to five stars. The agreed daily wage stays fixed; progress appears in Staff.
