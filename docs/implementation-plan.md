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

## ✅ Milestone 1c: Realism pass
- Blender models (lofted bodies, rounded parts), multi-texture ground, grass and weeds, trees, site entrance and props
- Truck drivetrain (engine, gearbox, brakes, grip by surface), excavator arm IK with hydraulic joints, moving rams and tracks
- Synthesised sound for engines, machines, ground and countryside

## Milestone V2: the first loop (in progress, agreed plan in the design spec, section 0)
Each step is playable and committed.
1. ✅ HUD redesign: small sim-style corner widgets, fading key hints (H)
2. ✅ Deformable layered ground: chunked high-resolution heightfield, soil layers, dig/deposit, slumping piles, physics colliders that follow; tests
3. ✅ Hand-dig start: shovel, wheelbarrow, ground piles, picking material back up. New games start with $200, a shovel and a barrow; topsoil and clay are on the market
4. ✅ The bigger map: a 2 km countryside with Mill Lane and Quarry Road, your field and yard, the village of Ashby (houses, pub, the Ashby Plant dealer) and the Ashby Aggregates depot with a weighbridge and a bay per material. Loads are weighed in, then paid per tonne by material and purity (clean, slightly mixed, or mixed fill). Your old pickup is the first road vehicle (loaded by barrow, shovel or excavator, shovelled off by hand); the excavator and tipper truck now dig and tip on the real ground, and the excavator can't leave your land. New map screen (Tab). Old saves can't be loaded
5. Machines on the new ground: mini digger (Assisted + Direct controls), site dumper, tractor + trailer, the existing excavator and truck; road-legal rules
6. Mentor guidance with map markers; balance pass
7. Building with material: haul roads, ramps, levelling

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

## Milestone 6: More realism
- ✅ Blender models for the truck, excavator and site props, loaded from `.glb` with placeholder fallback (see `docs/models.md`)
- More detailed terrain textures, post-processing (ambient occlusion, bloom), better lighting
- Proper excavator arm reach toward the target, tyre tracks, loaded-truck sway

## Milestone 7: Desktop app
- Electron wrapper: a real window, full screen, a working Quit button, Esc always goes to the menu
- Saves as files on disk
- Build a Mac app and a Windows installer

---

**How we work:** I build one step at a time, run the tests, commit, and push. After each milestone I tell you exactly how to run it and what to try. You can change balance numbers yourself in `data/` at any time.
