# Module guide

A short tour of the code. The logic modules never touch the screen. Each module has one public entry file (`index.js`), and other modules only import from that file.

## data/ — all the numbers
| File | What's in it |
|---|---|
| `game.json` | Tick rate, day length, speeds, starting machines and site, save version |
| `economy.json` | Starting money, fuel price, debt interest, resale value |
| `materials.json` | Rock types and base prices |
| `market.json` | How prices swing (trend) and drop when you sell a lot (saturation) |
| `machines.json` | Every machine tier's stats and price |
| `mods.json` | Cheap upgrades you can fit to machines |
| `sites.json` | Sites, zones, rock layers, pile and yard sizes |
| `objectives.json` | The intro story and the first goals (texts and rewards) |

You can change any of these and reload the game. No code changes are needed.

## Logic (no screen code)
| Module | Job |
|---|---|
| `src/core` | Game clock (ticks, days, hours), event bus, seeded random numbers, save slots with version upgrades |
| `src/economy` | Money and debt, market prices, fuel, selling |
| `src/quarry` | Zones and rock layers, face pile, yard |
| `src/machinery` | Machine stats and mods, buying and selling machines, timed jobs (dig, haul, service, repair), wear and breakdowns |
| `src/progression` | The step-by-step goals for a new game: which one is current, checking them against game events, paying rewards |
| `src/game` | Wires everything together: `createGame()` builds a game, `game.tick()` advances time, `game.actions.*` are the player's actions |

**Player actions** (`src/game/actions.js`) are the single way to make things happen. They're used by buttons and hotkeys now, and later by operators and 3D driving.

**Events** are what the logic announces, e.g. `productSold`, `machineBought`, `machineBrokeDown`, `layerFinished`, `dayStarted`. The UI listens to them for pop-ups and messages.

## Display and controls
| Module | Job |
|---|---|
| `src/input` | Hotkeys and rebinding |
| `src/ui` | Main menu, pause menu, settings, save/load screens, HUD, 3D overlay (prompts, machine panel), site map (2D view), shop, market, dev panel, feedback effects |
| `src/world3d` | The 3D world: terrain and pits (`terrain.js`, blended ground textures in `groundMaterial.js`), grass tufts and weeds (`vegetation.js`), the gate, public road, fence and power line (`entrance.js`), sky and scenery (`environment.js`), physics (`physics.js`, `truckPhysics.js`), you on foot (`player.js`), machines (`truck.js`, `excavator.js`; Blender models loaded by `glbModels.js`, placeholders in `models.js`), site props (`props.js`), piles, dust, and `index.js`, which ties it together and turns driving/digging into game actions. Site layouts (where zones, road and yard go) are in `layouts.js` |

## Models
`blender/` has the Python scripts that build the 3D models in Blender; `assets/models/` has the exported `.glb` files. See `docs/models.md`.

## Tests
Unit tests sit next to the code (`*.test.js`). Run them with `npm test`.
