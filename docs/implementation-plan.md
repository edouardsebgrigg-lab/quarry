# Implementation Plan

Based on `docs/design-spec.md`. Every milestone ends with something you can run and play (`npm run dev`), a short "what to test" list, and a git commit at each working step.

> **Change of plan:** after Milestone 1 we moved the 3D first-person world forward (it was Milestones 6–7). The game logic didn't change, only how you play it.

---

## ✅ Milestone 1: Playable Gravel Pit
- Game logic: clock and calendar, money and debt, market (trends + saturation), fuel, zones and rock layers, Rusty and Used excavator + truck, cheap upgrades (mods), wear, breakdowns, service and repair, versioned save slots, autosave
- Main menu, pause menu, settings (key rebinding, volume, interface size, full screen), shop, market, dev panel (F1)
- Feedback: floating +$ numbers, rolling money counter, before → after upgrade cards
- First balance pass (first upgrade ≈ 3.5 min, first Used machine ≈ 10–17 min)

## ✅ Milestone 1b: 3D first person
- 3D quarry: terraced pits that get deeper as you dig, yard with stockpiles, tipping bay, road, site office, sky, sun and shadows, hills, trees, dust
- Walk around in first person, get in and out of machines
- Excavator: swing with the mouse, scoop, dump into a truck or onto the face pile
- Truck: Rapier vehicle physics (heavier when loaded), cab and chase cameras, tip at the yard, load from the face pile
- Site map (Tab), control hints, prompts, machine panel; graphics, mouse sensitivity and invert-Y settings

## Milestone 2: Operators and automation
- Hiring board, operators with names, wages, skills and traits
- Operators drive machines in 3D on their own: excavators dig and load trucks, trucks drive the haul road and tip
- Daily wages, bottleneck marker
- **Balance tester** (`npm run sim`) prints pacing times
- Milestones/achievements with cash rewards, some switching on features
- Sound effects: engines, digging, tipping, UI (free CC0 packs)

## Milestone 3: Contracts, reputation and events
- Contracts board, deliveries, deadlines, reputation levels 0–10
- The six random events (rain affects driving grip, and so on)
- Bank screen with normal loans

## Milestone 4: Research and all machine types
- Research tree (pay and wait, one at a time)
- Standard, Heavy and Mega tiers for everything
- Crusher (3D plant at the yard) and graded products
- Drill rig and blasting (with a proper boom and dust cloud)
- Conveyors

## Milestone 5: All sites and the manager view
- Sites 2–5, each with its own 3D layout, rock and scenery
- Buying sites, delivery cost by distance, travelling between sites
- Geology surveys and rich pockets
- Manager overview screen, auto-sell rules, rail link
- A balance pass over the whole ~10 h game using the balance tester

## Milestone 6: Your Blender models and more realism
- Load your `.glb` models (with a short naming and export guide), falling back to the placeholders
- More detailed terrain textures, post-processing (ambient occlusion, bloom), better lighting
- Proper excavator arm reach toward the target, tyre tracks, loaded-truck sway

## Milestone 7: Desktop app
- Electron wrapper: a real window, full screen, a working Quit button, Esc always goes to the menu
- Saves as files on disk
- Build a Mac app and a Windows installer

---

**How we work:** I build one step at a time, run the tests, commit, and push. After each milestone I tell you exactly how to run it and what to try. You can change balance numbers yourself in `data/` at any time.
