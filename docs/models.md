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

## Rebuilding the models

You need Blender 4.2 or newer. Either use the Blender app:

```bash
blender --background --python blender/build_models.py            # everything
blender --background --python blender/build_models.py -- truck   # just one
```

or Blender as a Python module (`pip install bpy` with Python 3.11) and run `python blender/build_models.py truck`. Add `--no-preview` to skip the preview renders (they take a few minutes).

The scripts:
- `lib.py`: shape helpers (boxes, cylinders, extruded profiles, lathe), bevels, UVs, grime vertex colours, materials, export and preview rendering.
- `textures.py`: generates the tileable textures (worn paint, rust, grimy steel, rubber, concrete, cladding).
- `truck.py`, `excavator.py`, `props.py`: the models themselves.

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
