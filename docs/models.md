# 3D models

All models are made in **Blender** by Python scripts in `blender/`, exported as `.glb` files to `assets/models/`. The game loads every model listed in `assets/models/manifest.json`. If a model is missing, the game falls back to simple placeholder shapes, so nothing breaks.

| Model | Files | Preview |
|---|---|---|
| Haul truck | `truck_rusty.glb`, `truck_used.glb` | `docs/images/models/truck_*.jpg` |
| Excavator | `excavator_rusty.glb`, `excavator_used.glb` | `docs/images/models/excavator_*.jpg` |
| Site office | `prop_office.glb` | |
| Diesel tank | `prop_fueltank.glb` | |
| Concrete block | `prop_block.glb` | |
| Boulders | `prop_boulder1..3.glb` | |
| Traffic cone | `prop_cone.glb` | |
| Shipping container (20 ft) | `prop_container.glb` | |
| Oil drums | `prop_drum.glb`, `prop_drumrust.glb` | |
| Tyre stack, pallets | `prop_tyres.glb`, `prop_pallets.glb` | |
| Your old pickup | `prop_pickup.glb` | |
| Fence bay (3 m), farm gate | `prop_fence.glb`, `prop_gate.glb` | |
| Portaloo, power pole | `prop_portaloo.glb`, `prop_pole.glb` | |

Previews for all of them are in `docs/images/models/`.

## Ground and plant textures

These are also made in Blender, from real geometry rather than painted by hand:

- `blender/ground.py` models patches of gravel (thousands of pebbles in sand), trodden dirt with clods, rough grass (tens of thousands of blades), a sand-and-gravel pit face (layered beds with stones stuck in them) and old tarmac. Each patch wraps at its edges and is rendered from above, which gives a seamless colour image and a normal+height image in `assets/textures/ground/`. The terrain shader (`src/world3d/groundMaterial.js`) blends them.
- `blender/vegetation.py` models grass tufts, dry grass, ragwort and thistles and renders them from the side into `assets/textures/vegetation.png`, which the game shows on crossed cards that sway in the wind.

- `blender/trees.py` grows branching oak, poplar and hawthorn trees with thousands of leaves and renders them the same way into `assets/textures/trees.png`. The game lays them out as hedgerows, copses and a row of poplars along the road.

```bash
python blender/ground.py            # all surfaces (about 2 minutes); or e.g. `ground.py rock`
python blender/vegetation.py
python blender/trees.py
```

## Rebuilding the models

You need Blender 4.2 or newer. Either use the Blender app:

```bash
blender --background --python blender/build_models.py            # everything
blender --background --python blender/build_models.py -- truck   # just one
```

or Blender as a Python module (`pip install bpy` with Python 3.11) and run `python blender/build_models.py truck`. To rebuild only some props: `python blender/build_models.py prop:gate,fence`. Add `--no-preview` to skip the preview renders (they take a few minutes).

The scripts:
- `lib.py`: shape helpers (boxes, rounded boxes, cylinders, extruded profiles, lathe, lofted bodies from cross-sections, flat panels for glass), bevels with weighted normals, subdivision, UVs, grime vertex colours, materials, export and preview rendering.
- `textures.py`: generates the tileable textures (worn paint, rust, grimy steel, rubber, concrete, cladding, weathered wood, plastic).
- `truck.py`, `excavator.py`, `pickup.py`, `props.py`: the models themselves.

**How the shapes are made (so they don't look blocky):** bodies such as the pickup, the truck cab and the excavator's boom and cab are *lofted*: a series of rounded cross-sections is skinned into one smooth surface, so panels have rolled edges and curves instead of flat boxes. Glass is set into those surfaces with a black rubber seal. Chunky parts (bumpers, mirrors, tool boxes, the portaloo) use `rounded_box`. Every part is finished with a real bevel plus *weighted normals*, which keeps big panels flat and lets their edges catch the light. Boulders start as a random lump, get smoothed, roughened with layered noise and then cut by a few flat fracture planes.
- `menu_background.py`: renders the main-menu picture (`assets/ui/menu.jpg`), with the excavator loading a truck at a quarry face. Add `--fast` for a quick low-res test.

## Making your own models in Blender

You can replace any model with your own. Keep the file name, keep the named parts below, and export as **glTF Binary (.glb)** with **+Y Up** ticked, into `assets/models/`. Then add the name to `manifest.json`, or rerun the build script, which rewrites it.

**Scale and axes:** 1 Blender unit = 1 metre. The machine faces **+X**, its left side is **+Y**, and up is **+Z**.

### Haul truck (`truck_<tier>.glb`)
- Origin: the truck body centre. **The ground is 1.3 m below the origin.**
- `Wheel0` to `Wheel3`: each wheel's origin is its axle centre (tyre radius 0.55 m). Wheel0 is front-left, 1 front-right, 2 rear-left, 3 rear-right. Front wheels sit at X = 2.1, rear at X = −2.0, Y = ±1.05, Z = −0.75.
- `BedPivot`: an empty at the tipping hinge (X −3.1, Z 0.05) with the bed as its child. The game rotates it to tip.
- `Interior`: the dashboard, seat, pillars and so on that you see from the driver's seat. The driver's eye is at about (2.3, 0.5, 1.15).
- Make the cab shell and glass **one-sided with backface culling on**, so you can see out from inside.

### Excavator (`excavator_<tier>.glb`)
- Origin: on the ground, centred between the tracks.
- `House`: an empty at Z 1.05 holding the upper body. It turns about Z.
- `Boom`: an empty at (0.9, −0.35, 1.1) inside House. The boom points along +X and is 3.6 m long.
- `Stick`: an empty at the boom tip (3.6, 0, 0), 2.6 m long along +X.
- `Bucket`: an empty at the stick tip (2.6, 0, 0).
- The game rotates Boom, Stick and Bucket about the Y axis, so keep their own rotation at zero.
- `Interior`: what you see from the seat. The eye is at about (0.4, 0.72, 1.42) in House space.

### Props (`prop_<name>.glb`)
The origin sits on the ground at the centre. The office's door faces −Y (south in the game).

## Tiers
Each machine has a model per tier (`rusty`, `used`, and later `standard`, `heavy`, `mega`). Only the materials differ at the moment. The scripts pick paint by tier in `lib.standard_materials()`.
