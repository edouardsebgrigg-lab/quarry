# Quarry

A first-person quarry mining game for PC. Start with a rusty excavator and truck at a roadside gravel pit. Dig, haul and sell your way up to better machines, more sites and a mining empire.

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
| E | Get into the machine in front of you |
| R | Service / repair the nearest machine |

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
| W / S | Accelerate / brake and reverse |
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

## The loop

1. Get in the excavator, swing it over the pit and hold the left mouse button to dig.
2. Swing round to the truck and click to dump each bucket into it.
3. Drive the truck to the yard, stop in the yellow bay and press **T** to tip.
4. Open the market (**M**) and sell. Buy upgrades in the shop (**B**).

## Docs

- `docs/design-spec.md`: the game design
- `docs/implementation-plan.md`: milestones
- `docs/modules.md`: a short guide to the code
