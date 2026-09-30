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
| Your old pickup (drivable) | `vehicle_pickup.glb` (and `prop_pickup.glb`, a parked one with a jerrycan in the bed) | `docs/images/models/vehicle_pickup.jpg` |
| Fence bay (3 m), farm gate | `prop_fence.glb`, `prop_gate.glb` | |
| Portaloo, power pole | `prop_portaloo.glb`, `prop_pole.glb` | |
| Wheelbarrow, shovel | `prop_wheelbarrow.glb`, `prop_shovel.glb` | |
| Mini digger (1.5 t class) | `minidigger_rusty.glb`, `minidigger_used.glb` | `docs/images/models/minidigger_*.jpg` |
| Tracked site dumper | `dumper_rusty.glb`, `dumper_used.glb` | `docs/images/models/dumper_*.jpg` |
| Tractor | `tractor_rusty.glb`, `tractor_used.glb` | `docs/images/models/tractor_*.jpg` |
| Tipping trailer | `trailer_rusty.glb`, `trailer_used.glb` | `docs/images/models/trailer_*.jpg` |
| Village houses: cottage, semi, bungalow, pub | `prop_house_cottage.glb`, `prop_house_semi.glb`, `prop_house_bungalow.glb`, `prop_house_pub.glb` | `docs/images/models/prop_house_*.jpg` |
| Steel shed (the dealer, 24 × 16 m) | `prop_shed.glb` | |
| Weighbridge (3.4 × 16 m deck with a traffic light) | `prop_weighbridge.glb` | |

Previews for all of them are in `docs/images/models/`.

## Refined fleet

The drivable pickup, wheelbarrow and both Rusty/Used variants of the mini digger,
dumper, tractor, excavator, truck and trailer use the approved Blender fleet revision.
These 14 exports have embedded colour, normal and roughness maps, darker rubber and
steel, tier-specific paint wear, hydraulic hoses, and cab apertures with transparent
glazing. Their moving-part names, parents and rest transforms retain the original
rig contract. The parked pickup prop remains the separate jerrycan variant.

The refined materials have a `Review_` prefix. They already contain baked wear, so
the legacy runtime weathering shader does not process them a second time. The
legacy shader still treats unchanged models. No saved state or vehicle handling
changes are required.

`blender/review_models.py` reproduces the refined exports from the original builders:

```bash
blender --background --python blender/review_models.py -- --out /tmp/quarry-fleet
python3 blender/check_review_exports.py /tmp/quarry-fleet --production /path/to/original-glbs
```

Each output subdirectory contains its GLB, editable packed Blender scene, two
renders and rig report. Copy the approved GLBs into `assets/models/` after checking
them; leave `manifest.json` unchanged. The classic `build_models.py` commands below
generate the original base models, so run the refinement stage afterwards for
these 14 assets. `blender/fleet-rigs.json` records their original protected rigs.
Actual before/after comparisons are in `docs/handover/screenshots/models/`.

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

**After any rebuild, shrink the textures** (no Blender needed, just Pillow):

```bash
python3 blender/compress_textures.py            # every model in assets/models
python3 blender/compress_textures.py assets/models/truck_rusty.glb
```

It re-saves embedded textures as JPEG where nothing is see-through (PNG only where a transparent material uses the alpha), stores identical images once and caps them at 1024 px. Geometry, rigs and materials are untouched, and it only rewrites a file if it gets noticeably smaller. It took the fleet from 72 MB to 37 MB with no visible change (median texture PSNR 45.7 dB; the worst, about 29 dB, are grainy roughness maps). `src/world3d/assetBudget.test.js` fails if `assets/models` goes over 40 MB or an opaque texture is stored as PNG.

The scripts:
- `lib.py`: shape helpers (boxes, rounded boxes, cylinders, extruded profiles, lathe, lofted bodies from cross-sections, flat panels for glass), bevels with weighted normals, subdivision, UVs, grime vertex colours, materials, export and preview rendering.
- `textures.py`: generates the tileable textures (worn paint, rust, grimy steel, rubber, concrete, cladding, weathered wood, plastic, brick, slate, roof tiles, render, checker plate).
- `truck.py`, `excavator.py`, `pickup.py`, `props.py`, `handtools.py`, `buildings.py` (houses, the shed, the weighbridge), `vehicles.py` (the drivable pickup), `minidigger.py`, `dumper.py`, `tractor.py`, `trailer.py`: the models themselves.

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
- Hydraulic rams (optional; the game animates them if present): `BoomRam`, `StickRam`, `BucketRam` are the barrels, `BoomRamRod`, `StickRamRod`, `BucketRamRod` the rods. Each has its origin on its pin with the part pointing along +X; the barrel sits on one part (House, Boom, Stick) and the rod on the other (Boom, Stick, `BucketLink`). The game points each barrel at its rod's pin and each rod back at its barrel every frame, so they slide in and out. `BucketLink` is an empty at the stick tip that the game turns at 0.55 × the bucket angle + 1.9 rad.
- Tracks (optional): `TrackShoe` is one loose shoe; the game copies it round the track path and moves the copies as you drive (and hides the static `Tracks` mesh). `TrackWheelL0/L1`, `TrackWheelR0/R1` are the sprockets and idlers, turned by the game.

### Mini digger (`minidigger_<tier>.glb`)
- Same parts as the excavator (`House`, `Boom`, `Stick`, `Bucket`, `BucketLink`, the three rams and their rods, `TrackWheelL0/L1/R0/R1`), at 1.5 t size: house floor 0.42 m up, boom foot at house (0.5, 0, 0.3), boom 1.75 m, stick 1.1 m, bucket teeth at (0.407, 0.095) in the bucket's frame. The operator's eyes are at (−0.05, 1.44, 0) in house space.
- Tracks: `TrackBand` (the smooth rubber belt, always shown) and one loose `TrackShoe` (a chevron lug, local +Z outward) that the game copies 44 times round each track and rolls with the machine.
- `Blade`: the dozer blade on its pivot.

### Site dumper (`dumper_<tier>.glb`)
- Origin on the ground between the tracks, facing +X; same track parts as the mini digger.
- `SkipPivot`: the skip's hinge at its front bottom edge (x 1.12, z 0.6); the game tips it about Y (the back rises). The skip floor is at z 0.62. `Interior`: the seat and levers; the operator's eyes are at about (−0.55, 1.75, 0).

### Tractor (`tractor_<tier>.glb`) and trailer (`trailer_<tier>.glb`)
- Tractor: origin on the ground halfway between the axles, facing +X. `Wheel0` to `Wheel3` (front-left, front-right, rear-left, rear-right) at their axle centres: front axle x 0.93 (tyre radius 0.36), rear axle x −0.9 (radius 0.65). The hitch pin is at (−1.32, 0, 0.5); the driver's eyes at about (−0.9, 0, 2.0). `SteeringWheel` and `Interior` are for looks.
- Trailer: origin on the ground under the axle, facing +X (the drawbar end); the drawbar eye is at (3.3, 0, 0.5). `Wheel0`/`Wheel1` at the axle. `BedPivot` is the bed's rear hinge (the game tips it so the front rises) and `TailgatePivot`, inside it, is the top of the tailgate (the game keeps it hanging). The bed floor is at z 1.0 from x −1.7 to 2.1.

### Pickup (`vehicle_pickup.glb`)
- Origin: on the ground under the middle of the body; it faces +X like the other machines. The game lifts it by its ride height.
- `Wheel0` to `Wheel3`: each wheel's origin is its axle centre (tyre radius 0.36 m). Wheel0 is front-left, 1 front-right, 2 rear-left, 3 rear-right, at X = ±1.55, Y = ±0.76, Z = 0.36.
- `TailgatePivot`: an empty at the tailgate hinge (X −2.665, Z 0.6) with the tailgate as its child. The game swings it open about Y when you unload.
- The bed floor is at Z 0.85 between X −2.6 and −0.4; keep it empty (the game puts the load's heap there).
- `Interior`: dashboard, steering wheel and seat. The driver's eye is at about (0.18, 0.45, 1.45).

### Houses, shed, weighbridge (`prop_house_*.glb`, `prop_shed.glb`, `prop_weighbridge.glb`)
- Origin on the ground at the centre. House and shed fronts (front door, roller doors) face −Y; the game turns each house to face its road.
- The weighbridge deck runs along Y (vehicles drive along it); its traffic light has two lamps named `Red…` and `Green…`, which the game lights up.

### Wheelbarrow (`prop_wheelbarrow.glb`)
- Origin on the ground between the wheel and the legs; the wheel end points along +X.
- `Wheel`: an empty at the axle (X 0.56, Z 0.19; tyre radius 0.19 m). The game spins it as you push.
- The grips are at about (−0.98, ±0.29, 0.53) and the feet at X −0.34. The tray floor is at Z 0.35 and its rim at Z 0.64 (the game fills it with a heap of whatever you shovel in).

### Shovel (`prop_shovel.glb`)
- Origin at the D-grip; the shaft runs along +X, scoop side up (+Z).
- `Blade`: an empty at the middle of the blade (X 1.26), where the game puts the shovelful.

### Props (`prop_<name>.glb`)
The origin sits on the ground at the centre. The office's door faces −Y (south in the game).

## Paint and weathering
Machines are exported with clean, readable base paint (faded on Rusty models, fresh on Used ones). The game weathers them itself (`src/world3d/weathering.js`): materials named `Paint`, `TractorPaint`, `PickupPaint`, `PickupFaded` or `Toolbox` get rust, chipped edges, sun fade and mud; `PaintDark`, `Canopy`, `Frame`, `Chassis`, `Castings`, `Rims`/`RimPaint` get a lighter version; `Steel`, `Rubber` and `RubberTrack` just get mud low down. How much depends on the tier (Rusty heavily, Used lightly). Keep those material names if you make your own machine, and keep the model's ground at the origin (the truck's is 1.3 m below it).

## Tiers
Each machine has a model per tier (`rusty`, `used`, and later `standard`, `heavy`, `mega`). Only the materials differ at the moment. The scripts pick paint by tier in `lib.standard_materials()`.
