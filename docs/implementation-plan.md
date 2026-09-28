# Implementation Plan

Based on `docs/design-spec.md`. Every milestone ends with something you can run and play (`npm run dev`), a short "what to test" list, and a git commit at each working step.

---

## Milestone 1 — Playable Gravel Pit (small and complete)

**Goal:** start a new game, dig, haul and sell gravel by hand, buy your first upgrades, save and quit, then continue later.

| Step | What gets built | Tests |
|---|---|---|
| 1.1 | Project setup: Vite, Vitest, folder structure, fullscreen game shell (no page scrolling, no browser look) | — |
| 1.2 | `core`: game clock (10 ticks/sec, calendar, pause / 1× / 2× / 4×), event bus, seeded random numbers, game state, loading data from `data/` | ✅ |
| 1.3 | `economy`: money, fuel costs, market prices (trend + saturation), selling, emergency loan when money goes below zero | ✅ |
| 1.4 | `quarry`: Gravel Pit data (4 zones × layers of sand/gravel), face pile, yard with a stockpile limit | ✅ |
| 1.5 | `machinery`: Rusty and Used excavator + truck, timed jobs (Dig, Haul, Service, Repair), wear and breakdowns, buying and selling machines, 3–4 cheap mods | ✅ |
| 1.6 | Save/load: 3 slots, an autosave each game day, a version number in each save | ✅ |
| 1.7 | `input`: hotkeys (D, H, S, R, Tab, Space, 1/2/3, B, M, Esc, F1), rebindable, remembered | — |
| 1.8 | `ui`: main menu (New Game / Continue / Load / Settings / Quit), pause menu, settings screen, HUD, shop, market panel | — |
| 1.9 | `ui`: 2D top-down site view (zones by depth, face pile, truck driving to the yard, yard pile) | — |
| 1.10 | Feedback: floating +$ numbers, money counter that counts up, before → after upgrade card | — |
| 1.11 | Dev panel (F1): add money, skip time, fix machines, unlock all | — |
| 1.12 | First balance pass so the first mod comes at about 3 min and a Used machine at about 10–15 min | — |

**What you'll test:** the menus all work; dig and haul feel OK; prices move; machines wear and break; buying a Used truck feels like a clear jump; saving, quitting and continuing work; the dev panel works.

---

## Milestone 2 — Operators and automation
- Hiring board, operators with names, wages, skills and traits
- Assigned operators run their machine's job on a loop (the same job functions you use)
- Daily wages, bottleneck marker on the chain
- **Balance tester** (`npm run sim`) prints pacing times
- Milestones/achievements with cash rewards, some switching on features
- Sound effects (free CC0 packs)

## Milestone 3 — Contracts, reputation and events
- Contracts board, deliveries, deadlines, reputation levels 0–10
- The six random events
- Bank screen with normal loans

## Milestone 4 — Research and all machine types
- Research tree (pay and wait, one at a time)
- Standard, Heavy and Mega tiers for everything
- Crusher and graded products
- Drill rig and blasting
- Conveyors

## Milestone 5 — All sites and the manager view
- Sites 2–5 with their rock, buying sites, delivery cost by distance
- Moving between sites; other sites keep running
- Geology surveys and rich pockets
- Manager overview screen, auto-sell rules, rail link
- A balance pass over the whole ~10 h game using the balance tester

## Milestone 6 — 3D world (looking good)
- Three.js scene built from the game state: terraced pit, yard, haul road
- Realistic lighting: HDRI sky, sun and soft shadows, haze, post-processing
- Placeholder models, with a clear guide to naming and exporting your Blender `.glb` files
- Camera controls, and switching between the 3D view and the 2D map
- Graphics settings (Low → Ultra)
- Machines move around in 3D, driven by the same logic (you watch, you don't drive yet)

## Milestone 7 — Driving with real physics
- Rapier physics: truck suspension, grip, weight, load making it heavier
- E to get in or out, WASD + mouse, chase camera and cab camera
- Excavator: drive on tracks, control the arm directly, dig at the face
- Driving triggers the real jobs (dig, load, unload)
- Dust, tyre tracks, rocks tipping into the truck
- Operators hand the machine back to you and take it over again smoothly

## Milestone 8 — Desktop app
- Electron wrapper: a real window, fullscreen, a working Quit button
- Saves as files on disk
- Build a Mac app and a Windows installer

---

**How we work:** I build one step at a time, run the tests, commit, and push. After each milestone I tell you exactly how to run it and what to try. You can change balance numbers yourself in `data/` at any time.
