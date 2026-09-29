"""Buildings for the village and the depot: houses in a few styles, a steel shed (the plant
dealer) and a weighbridge. Each is exported as a prop (origin on the ground at its centre);
fronts face -Y (south in the game), like the site office."""
import math
import bmesh
from mathutils import Matrix
import lib
import textures as tex
from lib import bm_box, bm_cylinder, merge, mesh_object, empty, finish, material

HOUSES = {
    # length (along the front), depth, wall height to the eaves, roof pitch (degrees),
    # wall, roof, door colour, storeys
    'cottage': dict(L=8.4, W=6.0, H=5.0, pitch=42, wall='brick', roof='slate', door=(0.08, 0.2, 0.12), floors=2),
    'semi': dict(L=9.6, W=7.2, H=5.4, pitch=35, wall='render', roof='tile', door=(0.45, 0.06, 0.05), floors=2),
    'bungalow': dict(L=12.0, W=7.6, H=2.9, pitch=30, wall='brick', roof='tile', door=(0.1, 0.16, 0.35), floors=1),
    'pub': dict(L=13.0, W=7.4, H=5.3, pitch=40, wall='render', roof='slate', door=(0.25, 0.1, 0.06), floors=2),
}


def house_materials(spec):
    m = {}
    if spec['wall'] == 'brick':
        m['wall'] = material('Brick', (1, 1, 1), 'brick', tex.brick, 1024, roughness=0.9)
    else:
        m['wall'] = material('Render', (0.96, 0.93, 0.85), 'render', tex.render, 512, roughness=0.95)
    if spec['roof'] == 'slate':
        m['roof'] = material('Slate', (1, 1, 1), 'slate', tex.slate, 512, roughness=0.7)
    else:
        m['roof'] = material('RoofTile', (1, 1, 1), 'rooftile', tex.rooftile, 512, roughness=0.85)
    m['brick'] = material('BrickTrim', (1, 1, 1), 'brick', tex.brick, 1024, roughness=0.9)
    m['frame'] = material('WindowFrame', (0.92, 0.92, 0.9), roughness=0.5, vertex_color=False)
    m['glass'] = material('HouseGlass', (0.03, 0.035, 0.04), roughness=0.05, metallic=0.5, vertex_color=False)
    m['stone'] = material('Stone', (0.7, 0.68, 0.62), 'concrete', tex.concrete, 512, roughness=0.9)
    m['door'] = material('Door', spec['door'], 'paint_worn', tex.paint_worn, roughness=0.5, vertex_color=False)
    m['pot'] = material('ChimneyPot', (0.55, 0.28, 0.16), roughness=0.8, vertex_color=False)
    return m


def window(x, z, w, h, y_face, depth_sign=-1):
    """A window on the wall plane y = y_face (front: depth_sign -1). Returns (frame, glass, sill)."""
    d = depth_sign
    frame = [bm_box((w, 0.08, 0.07), (x, y_face + d * 0.03, z + h / 2)), bm_box((w, 0.08, 0.07), (x, y_face + d * 0.03, z - h / 2)),
             bm_box((0.07, 0.08, h), (x - w / 2, y_face + d * 0.03, z)), bm_box((0.07, 0.08, h), (x + w / 2, y_face + d * 0.03, z)),
             bm_box((0.05, 0.06, h), (x, y_face + d * 0.035, z)), bm_box((w, 0.06, 0.05), (x, y_face + d * 0.035, z + h * 0.18))]
    glass = lib.panel(lib.rounded_rect(w - 0.06, h - 0.06, 0.005, 1), (x, y_face + d * 0.01, z),
                      (1, 0, 0) if d < 0 else (-1, 0, 0), (0, 0, 1))
    sill = bm_box((w + 0.16, 0.16, 0.07), (x, y_face + d * 0.07, z - h / 2 - 0.05))
    return frame, glass, sill


def house(style):
    spec = HOUSES[style]
    L, W, H = spec['L'], spec['W'], spec['H']
    rise = (W / 2) * math.tan(math.radians(spec['pitch']))
    R = H + rise
    m = house_materials(spec)
    root = empty('House')

    # Walls and gables in one: a five-sided prism along X.
    body = lib.bm_profile([(-W / 2, 0), (W / 2, 0), (W / 2, H), (0, R), (-W / 2, H)], L, 'X')
    walls = mesh_object('Walls', body, m['wall'], root)
    finish(walls, 0.01, uv_scale=1.2, smooth_angle=20, dirt_range=(-0.4, 1.6))
    # A brick plinth under render; stone quoins would be too fancy.
    if spec['wall'] != 'brick':
        pl = mesh_object('Plinth', bm_box((L + 0.06, W + 0.06, 0.55), (0, 0, 0.27)), m['brick'], root)
        finish(pl, 0.01, uv_scale=1.2, dirt_range=(-0.3, 0.8))

    # Roof: two slabs overhanging the walls, and a ridge.
    over, t = 0.35, 0.14
    slabs = []
    run = W / 2 + over
    ang = math.radians(spec['pitch'])
    for s in (-1, 1):
        y0 = s * (W / 2 + over)
        z0 = H - over * math.tan(ang)
        pts = [(y0, z0), (0, R + 0.02), (0, R + 0.02 + t / math.cos(ang)), (y0, z0 + t / math.cos(ang))]
        if s > 0:
            pts = list(reversed(pts))
        slabs.append(lib.bm_profile(pts, L + 0.5, 'X'))
    roof = mesh_object('Roof', merge(*slabs), m['roof'], root)
    finish(roof, 0.004, uv_scale=2.4, smooth_angle=20, dirt_range=(H - 3, R + 1))
    ridge = mesh_object('Ridge', bm_cylinder(0.09, L + 0.5, 'X', 10, (0, 0, R + 0.1)), m['roof'], root)
    finish(ridge, 0, dirt_range=(H - 3, R + 1))
    del run

    # Chimney on the ridge at one end (two on the pub), with pots.
    stacks = []
    pots = []
    for cx in ([L / 2 - 0.7] if style != 'pub' else [L / 2 - 0.7, -L / 2 + 0.7]):
        stacks.append(bm_box((0.62, 0.9, rise + 1.2), (cx, 0, H + (rise + 1.2) / 2 + 0.2)))
        stacks.append(bm_box((0.72, 1.0, 0.1), (cx, 0, H + rise + 1.35)))
        for py in (-0.2, 0.2):
            pots.append(bm_cylinder(0.1, 0.4, 'Z', 12, (cx, py, H + rise + 1.6), radius2=0.08))
    ch = mesh_object('Chimney', merge(*stacks), m['brick'], root)
    finish(ch, 0.01, uv_scale=1.2, dirt_range=(H, H + rise + 2))
    pt = mesh_object('Pots', merge(*pots), m['pot'], root)
    finish(pt, 0, dirt=False)

    # Windows and the front door. The front is -Y.
    frames, glasses, sills = [], [], []
    wy = -W / 2
    by = W / 2
    ww, wh = (1.05, 1.15) if spec['floors'] == 2 else (1.3, 1.1)
    xs = [-L * 0.3, L * 0.3] if L < 11 else [-L * 0.36, -L * 0.14, L * 0.3]
    door_x = 0.0 if L < 11 else L * 0.1
    rows_z = [1.35, H - 1.25] if spec['floors'] == 2 else [1.4]
    for zi, z in enumerate(rows_z):
        for x in xs + ([0.0] if zi == 1 and L >= 8 else []):
            f, g, s = window(x, z, ww, wh, wy, -1)
            frames += f
            glasses.append(g)
            sills.append(s)
        for x in xs:  # back of the house
            f, g, s = window(x, z, ww * 0.9, wh * 0.9, by, 1)
            frames += f
            glasses.append(g)
            sills.append(s)
    # Side windows on the bigger houses.
    if L >= 9:
        for s in (-1, 1):
            for z in rows_z[:1]:
                g = lib.panel(lib.rounded_rect(0.8, 0.9, 0.005, 1), (s * (L / 2 + 0.01), 0, z), (0, -s, 0), (0, 0, 1))
                glasses.append(g)
                frames.append(bm_box((0.08, 0.9, 0.06), (s * (L / 2 + 0.03), 0, z - 0.47)))
                frames.append(bm_box((0.08, 0.9, 0.06), (s * (L / 2 + 0.03), 0, z + 0.47)))
    door = [bm_box((0.95, 0.07, 2.05), (door_x, wy - 0.02, 1.03))]
    frames += [bm_box((1.12, 0.1, 0.08), (door_x, wy - 0.03, 2.1)), bm_box((0.08, 0.1, 2.1), (door_x - 0.52, wy - 0.03, 1.05)),
               bm_box((0.08, 0.1, 2.1), (door_x + 0.52, wy - 0.03, 1.05))]
    sills.append(bm_box((1.3, 0.45, 0.14), (door_x, wy - 0.24, 0.07)))  # step
    if style in ('cottage', 'pub'):  # a little canopy over the door
        cano = lib.bm_profile([(wy - 0.02, 2.35), (wy - 0.75, 2.2), (wy - 0.75, 2.26), (wy - 0.02, 2.47)], 1.6, 'X', door_x)
        can = mesh_object('Canopy', cano, m['roof'], root)
        finish(can, 0.004, uv_scale=1.0, dirt_range=(0, 3))
    fr = mesh_object('Frames', merge(*frames), m['frame'], root)
    finish(fr, 0.004, dirt=False)
    gl = mesh_object('Glass', merge(*glasses), m['glass'], root)
    lib.box_uv(gl)
    si = mesh_object('Sills', merge(*sills), m['stone'], root)
    finish(si, 0.006, uv_scale=0.8, dirt_range=(-0.2, 1.5))
    dr = mesh_object('Door', merge(*door), m['door'], root)
    finish(dr, 0.006, uv_scale=0.8, dirt=False)
    return root


def shed():
    """A steel portal-frame shed, 24 x 16 m: roller doors on the front, an office at one end."""
    root = empty('Shed')
    L, W, H = 24.0, 16.0, 6.2
    rise = (W / 2) * math.tan(math.radians(8))
    clad = material('Cladding', (0.36, 0.44, 0.38), 'cladding', tex.cladding, 512, roughness=0.55, metallic=0.4)
    roofm = material('RoofSheet', (0.55, 0.56, 0.55), 'cladding', tex.cladding, 512, roughness=0.5, metallic=0.5)
    block = material('Blockwork', (0.72, 0.7, 0.66), 'concrete', tex.concrete, 512, roughness=0.9)
    door = material('RollerDoor', (0.75, 0.73, 0.68), 'planks', tex.planks, 512, roughness=0.6, metallic=0.3)
    trim = material('Trim', (0.12, 0.14, 0.13), roughness=0.5, vertex_color=False)
    glass = material('ShedGlass', (0.03, 0.035, 0.04), roughness=0.05, metallic=0.5, vertex_color=False)
    office_door = material('OfficeDoor', (0.1, 0.25, 0.45), 'paint_worn', tex.paint_worn, roughness=0.45, vertex_color=False)

    body = lib.bm_profile([(-W / 2, 1.2), (W / 2, 1.2), (W / 2, H), (0, H + rise), (-W / 2, H)], L, 'X')
    w = mesh_object('Walls', body, clad, root)
    finish(w, 0.02, uv_scale=2.0, smooth_angle=20, dirt_range=(0.5, 3.0))
    pl = mesh_object('Plinth', bm_box((L, W, 1.2), (0, 0, 0.6)), block, root)
    finish(pl, 0.01, uv_scale=1.6, dirt_range=(-0.3, 1.2))
    slabs = []
    for s in (-1, 1):
        pts = [(s * (W / 2 + 0.4), H - 0.06), (0, H + rise + 0.02), (0, H + rise + 0.14), (s * (W / 2 + 0.4), H + 0.06)]
        if s > 0:
            pts = list(reversed(pts))
        slabs.append(lib.bm_profile(pts, L + 0.6, 'X'))
    r = mesh_object('Roof', merge(*slabs), roofm, root)
    finish(r, 0.004, uv_scale=3.0, dirt_range=(H - 4, H + 2))
    fy = -W / 2 - 0.03
    doors = [bm_box((5.0, 0.08, 5.0), (x, fy, 2.5)) for x in (-6.5, 0.5)]
    dm = mesh_object('RollerDoors', merge(*doors), door, root)  # noqa: F841
    finish(dm, 0.01, uv_scale=1.0, dirt_range=(0, 2.0))
    trims = []
    for x in (-6.5, 0.5):
        trims += [bm_box((5.3, 0.14, 0.25), (x, fy - 0.03, 5.1)), bm_box((0.18, 0.14, 5.1), (x - 2.6, fy - 0.03, 2.55)),
                  bm_box((0.18, 0.14, 5.1), (x + 2.6, fy - 0.03, 2.55))]
    trims += [bm_box((L + 0.2, 0.2, 0.2), (0, s * (W / 2 + 0.05), H)) for s in (-1, 1)]  # gutters
    trims += [bm_cylinder(0.05, H, 'Z', 8, (x, fy - 0.08, H / 2)) for x in (-L / 2 + 0.3, L / 2 - 0.3)]  # downpipes
    tm = mesh_object('Trim', merge(*trims), trim, root)
    finish(tm, 0.004, dirt=False)
    # Office at the +X end of the front: windows and a door.
    gls = [lib.panel(lib.rounded_rect(2.2, 1.2, 0.01, 1), (x, fy - 0.01, 2.2), (1, 0, 0), (0, 0, 1)) for x in (6.5, 9.4)]
    g = mesh_object('Glass', merge(*gls), glass, root)
    lib.box_uv(g)
    od = mesh_object('OfficeDoor', bm_box((1.0, 0.08, 2.1), (4.6, fy - 0.01, 1.05)), office_door, root)
    finish(od, 0.006, dirt=False)
    return root


def weighbridge():
    """A pit-mounted weighbridge: a 3.4 x 16 m steel deck flush with the ground, yellow and black
    kerbs along both sides, and a traffic light at the far end."""
    root = empty('Weighbridge')
    plate = material('CheckerPlate', (1, 1, 1), 'checker', tex.checker_plate, 512, roughness=0.5, metallic=0.8)
    yellow = material('KerbYellow', (0.9, 0.62, 0.05), 'paint_worn', tex.paint_worn, roughness=0.5)
    black = material('KerbBlack', (0.03, 0.03, 0.03), roughness=0.6, vertex_color=False)
    steel = material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7)
    red = material('LampRed', (0.9, 0.05, 0.03), roughness=0.2, vertex_color=False, emission=(0.9, 0.05, 0.02))
    green = material('LampGreen', (0.1, 0.9, 0.2), roughness=0.2, vertex_color=False, emission=(0.05, 0.6, 0.1))
    L, W = 3.4, 16.0  # X across, Y along (vehicles drive along Y)
    deck = mesh_object('Deck', bm_box((L, W, 0.3), (0, 0, -0.13)), plate, root)
    finish(deck, 0.01, uv_scale=1.2, dirt_range=(-0.2, 0.2))
    kerbs_y, kerbs_b = [], []
    n = 8
    for s in (-1, 1):
        for k in range(n):
            y0 = -W / 2 + k * W / n
            (kerbs_y if k % 2 == 0 else kerbs_b).append(bm_box((0.22, W / n, 0.18), (s * (L / 2 + 0.11), y0 + W / (2 * n), 0.09)))
    ky = mesh_object('KerbYellow', merge(*kerbs_y), yellow, root)
    finish(ky, 0.01, dirt_range=(0, 0.2))
    kb = mesh_object('KerbBlack', merge(*kerbs_b), black, root)
    finish(kb, 0.01, dirt=False)
    pole = mesh_object('LightPole', merge(bm_cylinder(0.05, 2.6, 'Z', 10, (L / 2 + 0.7, W / 2 + 0.4, 1.3)),
                                         bm_box((0.28, 0.2, 0.62), (L / 2 + 0.7, W / 2 + 0.4, 2.55))), steel, root)
    finish(pole, 0, dirt=False)
    mesh_object('Red', bm_cylinder(0.08, 0.05, 'Y', 12, (L / 2 + 0.7, W / 2 + 0.29, 2.7)), red, root)
    mesh_object('Green', bm_cylinder(0.08, 0.05, 'Y', 12, (L / 2 + 0.7, W / 2 + 0.29, 2.42)), green, root)
    return root


PARTS = {
    'house_cottage': lambda: house('cottage'),
    'house_semi': lambda: house('semi'),
    'house_bungalow': lambda: house('bungalow'),
    'house_pub': lambda: house('pub'),
    'shed': shed,
    'weighbridge': weighbridge,
}

PREVIEWS = {
    'house_cottage': dict(target=(0, 0, 3.0), distance=17, angle=-60, elevation=12, samples=24),
    'house_semi': dict(target=(0, 0, 3.0), distance=18, angle=-60, elevation=12, samples=24),
    'house_bungalow': dict(target=(0, 0, 2.0), distance=18, angle=-60, elevation=12, samples=24),
    'house_pub': dict(target=(0, 0, 3.0), distance=21, angle=-60, elevation=12, samples=24),
    'shed': dict(target=(0, 0, 3.5), distance=40, angle=-60, elevation=14, samples=24),
    'weighbridge': dict(target=(0, 0, 0.5), distance=14, angle=-40, elevation=25, samples=24),
}
