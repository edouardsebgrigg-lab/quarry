# Quarry

A first-person quarry mining game for PC. Start with a shovel and a wheelbarrow at a roadside gravel pit. Dig by hand, save up for a rusty excavator and truck, and work your way up to better machines, more sites and a mining empire.

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
| Left Mouse | Shovel: dig a shovelful (aim at the ground on the field), click again to tip it (into the wheelbarrow, a truck bed, or on the ground) |
| E | Take the wheelbarrow (at its handles) / get into the machine in front of you |
| R | Service / repair the nearest machine |

| Wheelbarrow | |
|---|---|
| W / S | Push / pull |
| Mouse, A / D | Steer (it goes where you look) |
| T | Tip it: on the field it makes a pile, in the yellow bay in the yard it goes into stock to sell |
| E | Let go |

| Excavator | |
|---|---|
| Mouse left/right | Swing the arm (the house turns) |
| Hold Left Mouse | Dig a bucket from the pit (aim the ring at a zone) |
| Left Mouse | Dump the bucket into a truck (ring turns blue) or onto the face pile |
| W A S D | Drive on tracks |
| C | Cab / outside camera |
| E | Get out |

| Haul truck | |
|---|---|
| W / S | Accelerate / brake. Stopped, hold S to reverse |
| A / D | Steer |
| Space | Handbrake |
| T | Tip the load (in the yellow tipping bay at the yard) |
| F | Load from the face pile (park next to it) |
| C | Cab / outside camera |
| V | Recover a stuck truck |
| E | Get out |

| Anywhere | |
|---|---|
| B | Shop (machines and upgrades) |
| M | Market (sell stock from the yard) |
| Tab | Site map |
| P | Pause time · 1 / 2 / 3 game speed |
| Esc | Menu |
| F1 | Dev panel (in `npm run dev` only) |

All keys can be changed in Settings.

## Machines and sound

The machines behave like the real thing:
- **Haul truck:** a diesel engine with a torque curve and a 4-speed automatic gearbox, engine braking, air brakes and grip that depends on the ground (tarmac, gravel, dirt, grass). A loaded truck is heavier at the back, slower to pull away, slower up hills and longer to stop. Worn trucks misfire.
- **Excavator:** the arm is solved so the bucket really reaches the ground or the truck bed: it reaches out, bites, drags back along the ground and curls. Every joint moves like a hydraulic ram, the rams slide in and out, the house swings with inertia, and the tracks roll round their sprockets. The machine tilts with the ground and rocks as the bucket bites.
- Engines start when you get in (starter motor, a puff of black smoke) and stop a few seconds after you leave. From the cab you feel acceleration, braking, bumps and engine vibration.

All sound is generated in code (no recordings): engines by rpm and load, gear changes, tyres on gravel or tarmac, air brakes, the reverse alarm, hydraulics, clanking tracks, digging, rock pouring into the steel bed, footsteps, wind, birds and the odd car on the road outside. Volume is in Settings.

## Getting started

You take over an old, overgrown gravel pit with $200, a shovel and a wheelbarrow. That's not quite enough for a machine, so you start by hand. A goal card (top left) walks you through the first steps:

1. Walk to the bare field next to the yard, look at the ground and click to dig a shovelful of topsoil.
2. Look into the wheelbarrow (it's at the corner of the field) and click to tip each shovelful in until it's full.
3. Take the handles (**E**), push it into the yellow tipping bay in the yard and tip it (**T**). Sell it at the market (**M**).
4. Keep going until you can buy a rusty excavator, then a rusty truck, on the office laptop (**E** at the door, or **B** anywhere).
5. Dig, load, haul, tip and sell your first truck load (see below), buy a cheap upgrade, earn $500, then save up for your first Used machine.

Each goal pays a small bonus. Everything starts slow and clapped-out on purpose.

## Digging by hand

The field is real ground you can dig anywhere: topsoil on top, then clay, sand and gravel, with rock at the bottom. Each shovelful comes out of the ground where you aim, so holes get deeper and walls that are too steep cave in. Whatever you tip on the ground (off the shovel or out of the barrow) makes a real heap that slumps to its natural slope; you can walk on it and shovel it back up. A barrow holds about 0.11 m³: around 115 kg of topsoil, more of heavier gravel. Topsoil sells best by hand; clay is worth little.

## The loop with machines

1. Get in the excavator, swing it over the pit and hold the left mouse button to dig.
2. Swing round to the truck and click to dump each bucket into it.
3. Drive the truck to the yard, stop in the yellow bay and press **T** to tip.
4. Open the market (**M**) and sell. Buy upgrades in the shop (**B**).

## Docs

- `docs/design-spec.md`: the game design
- `docs/implementation-plan.md`: milestones
- `docs/modules.md`: a short guide to the code
- `docs/models.md`: the 3D models, how to rebuild them in Blender, and how to make your own
