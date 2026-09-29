# Module guide

A short tour of the code. The logic modules never touch the screen. Each module has one public entry file (`index.js`), and other modules only import from that file.

## data/ — all the numbers
| File | What's in it |
|---|---|
| `game.json` | Tick rate, day length, speeds, starting machines and site, save version |
| `economy.json` | Starting money, fuel price, debt interest, resale value |
| `materials.json` | Rock types and base prices |
| `market.json` | How prices swing (trend) and drop when you sell a lot (saturation) |
| `machines.json` | Every machine tier's stats and price (including mass and engine power, used by the driving physics and the engine sound) |
| `mods.json` | Cheap upgrades you can fit to machines |
| `sites.json` | Sites, zones, rock layers, pile and yard sizes |
| `ground.json` | Diggable ground: materials (density, how much they swell when dug, the slope they settle at, how steep a wall they can stand) and each plot's layers |
| `objectives.json` | The intro story and the first goals (texts and rewards) |

You can change any of these and reload the game. No code changes are needed.

## Logic (no screen code)
| Module | Job |
|---|---|
| `src/core` | Game clock (ticks, days, hours), event bus, seeded random numbers, save slots with version upgrades |
| `src/economy` | Money and debt, market prices, fuel, selling |
| `src/quarry` | Zones and rock layers, face pile, yard |
| `src/ground` | The real, diggable ground: a grid of soil columns with layers; digging carves bowls and returns tonnes by material, dumped material piles up and slumps to its natural slope, undercut walls cave in; saves only the chunks that changed |
| `src/machinery` | Machine stats and mods, buying and selling machines, timed jobs (dig, haul, service, repair), wear and breakdowns |
| `src/progression` | The step-by-step goals for a new game: which one is current, checking them against game events, paying rewards |
| `src/game` | Wires everything together: `createGame()` builds a game, `game.tick()` advances time, `game.actions.*` are the player's actions |

**Player actions** (`src/game/actions.js`) are the single way to make things happen. They're used by buttons and hotkeys now, and later by operators and 3D driving.

**Events** are what the logic announces, e.g. `productSold`, `machineBought`, `machineBrokeDown`, `layerFinished`, `dayStarted`. The UI listens to them for pop-ups and messages.

## Display and controls
| Module | Job |
|---|---|
| `src/input` | Hotkeys and rebinding |
| `src/audio` | Sound: `synth.js` builds every sound from maths (diesel engines, gravel, rocks, hydraulics, birds…), `index.js` plays them through a mixer with 3D positioning, engine voices driven by rpm and load, loops and one-shots |
| `src/ui` | Main menu, pause menu, settings, save/load screens, HUD, 3D overlay (prompts, machine panel), site map (2D view), shop, market, dev panel, feedback effects |
| `src/world3d` | The 3D world: terrain and pits (`terrain.js`; the diggable plot's chunked mesh and colliders in `groundChunks.js`; blended ground textures in `groundMaterial.js`), grass tufts, weeds and countryside trees (`vegetation.js`), the gate, public road, fence and power line (`entrance.js`), sky and scenery (`environment.js`), physics (`physics.js`; the truck's engine, gearbox and handling in `truckPhysics.js`; the excavator's arm solver and hydraulic joints in `excavatorArm.js`; engine start/stop in `engineLife.js`), what the machines sound like (`sounds.js`), you on foot (`player.js`), machines (`truck.js`, `excavator.js`; Blender models loaded by `glbModels.js`, placeholders in `models.js`), site props (`props.js`), piles, dust, and `index.js`, which ties it together and turns driving/digging into game actions. Site layouts (where zones, road and yard go) are in `layouts.js` |

## Models
`blender/` has the Python scripts that build the 3D models in Blender; `assets/models/` has the exported `.glb` files. See `docs/models.md`.

## Tests
Unit tests sit next to the code (`*.test.js`). Run them with `npm test`.
