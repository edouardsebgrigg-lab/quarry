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
| `ground.json` | Diggable ground: materials (density, how much they swell when dug, the slope they settle at, how steep a wall they can stand) and each plot's layers |
| `objectives.json` | The intro story and the first goals (texts and rewards) |
| `tools.json` | Hand tools: how much a shovelful and a wheelbarrow hold (loose m³), reach, dig and tip times, pushing speeds |

You can change any of these and reload the game. No code changes are needed.

## Logic (no screen code)
| Module | Job |
|---|---|
| `src/core` | Game clock (ticks, days, hours), event bus, seeded random numbers, save slots with version upgrades |
| `src/economy` | Money and debt, market prices, fuel, and the depot: weighbridge tickets, grading a load by purity, paying for it |
| `src/quarry` | Which sites you own, and helpers for loads (a load is `{ material: tonnes }`) |
| `src/ground` | The real, diggable ground: a grid of soil columns with layers; digging carves bowls and returns tonnes by material, dumped material piles up and slumps to its natural slope, undercut walls cave in; saves only the chunks that changed |
| `src/handtools` | Your shovel and wheelbarrow: digging a shovelful out of the real ground, tipping it into the barrow, the pickup's or a truck's bed or onto the ground, and tipping the barrow as a pile or into a bed. Loads are dug material measured by loose volume |
| `src/machinery` | Machine stats and mods (a machine's `kind` decides which jobs it can do), buying and selling machines, Direct-mode bucket cutting and pouring, timed jobs (dig a bucket out of the real ground, tip or unload a road vehicle at the depot or on your land, service, repair), wear and breakdowns |
| `src/progression` | The step-by-step goals for a new game (which one is current, checking them against game events, paying rewards), the mentor's texts and tips (`mentor.js`), and a pacing check of the machine ladder (`pacing.test.js`) |
| `src/game` | Wires everything together: `createGame()` builds a game, `game.tick()` advances time, `game.actions.*` are the player's actions |

**Player actions** (`src/game/actions.js`) are the single way to make things happen. They're used by buttons and hotkeys now, and later by operators and 3D driving.

**Events** are what the logic announces, e.g. `weighedIn`, `productSold`, `machineBought`, `machineBrokeDown`, `dayStarted`. The UI listens to them for pop-ups and messages.

## Display and controls
| Module | Job |
|---|---|
| `src/input` | Hotkeys and rebinding |
| `src/audio` | Sound: `synth.js` builds every sound from maths (diesel engines, gravel, rocks, hydraulics, birds…), `index.js` plays them through a mixer with 3D positioning, engine voices driven by rpm and load, loops and one-shots |
| `src/ui` | Main menu, pause menu, settings, save/load screens, HUD, 3D overlay (prompts, machine dash), the map (`mapView.js` draws the countryside from above, `mapOverlay.js` adds the places and your machines), shop, depot price board (`market.js`), dev panel, feedback effects |
| `src/world3d` | The 3D world, described below |

### The 3D world (`src/world3d`)
| File | Job |
|---|---|
| `map.js` | Level design: where the roads, your field and yard, the village, the dealer and the depot (weighbridge, bays) are. Only positions; numbers for balance stay in `data/` |
| `countryside.js` | Builds the 2 km countryside from the map: rolling farmland heights (with the ground levelled under yards, houses and the roads), the road ribbons with a centre line, the physics heightfield (with a hole where your field is) and questions like "is this on the road?" |
| `places.js` | Buildings and props at each place: your yard (office, fences, gates, sign), the power line, the village houses and pub, the dealer's shed, and the depot's weighbridge (with its traffic light), office, signs and block-wall bays |
| `groundChunks.js`, `groundMaterial.js` | Your diggable field: its chunked mesh and colliders that follow the real ground, and the shader that blends the ground textures |
| `vegetation.js` | Grass tufts and weeds (streamed in around you), hedgerows, copses and lone trees |
| `environment.js` | Sky, sun, fog and the hills on the horizon |
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

## Tests
Unit tests sit next to the code (`*.test.js`). Run them with `npm test`.
