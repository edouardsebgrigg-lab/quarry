"""Ground textures for the terrain, made from real 3D geometry rendered top-down.

Each surface (gravel, dirt, grass, rock) is modelled as a patch of ground that wraps at its
edges: pebbles, clods and grass blades near an edge are copied to the opposite side, so the
rendered image tiles seamlessly. Two renders per surface:
  <name>_albedo.jpg  colour, lit by an even white sky, so crevices get natural shadowing.
  <name>_normal.jpg  R,G = surface normal (x, y), B = height. Linear data, not colour.
Plus macro.jpg: three large-scale noise fields the terrain shader uses to break up tiling.

Run:  <python with bpy> blender/ground.py [gravel dirt grass rock macro] [--fast]
Output goes to assets/textures/ground/."""
import math
import os
import sys

import bpy
import bmesh
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import textures as tex  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'textures', 'ground')
FAST = '--fast' in sys.argv
RES = 256 if FAST else 1024


def srgb(hex_color):
    """'#rrggbb' -> linear RGB (Blender material colours are linear)."""
    h = hex_color.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ---------------------------------------------------------------- heights that wrap

class Field:
    """A tileable height/colour field over a square tile of size S metres."""

    def __init__(self, arr, S):
        self.a = arr
        self.S = S
        self.n = arr.shape[0]

    def __call__(self, x, y):
        n = self.n
        fx = (np.asarray(x) / self.S * n) % n
        fy = (np.asarray(y) / self.S * n) % n
        x0 = np.floor(fx).astype(int)
        y0 = np.floor(fy).astype(int)
        tx = fx - x0
        ty = fy - y0
        x1 = (x0 + 1) % n
        y1 = (y0 + 1) % n
        a = self.a
        return (a[y0, x0] * (1 - tx) * (1 - ty) + a[y0, x1] * tx * (1 - ty)
                + a[y1, x0] * (1 - tx) * ty + a[y1, x1] * tx * ty)


def aniso_noise(size, beta, seed, ax=1.0, ay=1.0):
    """Tileable 1/f noise stretched along one axis (ax, ay scale the frequencies)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    fy = np.fft.fftfreq(size)[:, None] * ay
    fx = np.fft.fftfreq(size)[None, :] * ax
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    spec = np.fft.fft2(white) / f ** (beta / 2.0)
    spec[0, 0] = 0
    n = np.real(np.fft.ifft2(spec))
    n -= n.min()
    return n / n.max()


def voronoi(size, count, seed, sx=1.0, sy=1.0):
    """Tileable Voronoi: returns (F1, F2, cell id) arrays. sx/sy stretch cells."""
    rng = np.random.default_rng(seed)
    pts = rng.uniform(0, 1, (count, 2))
    ys, xs = np.mgrid[0:size, 0:size] / size
    f1 = np.full((size, size), 9.0)
    f2 = np.full((size, size), 9.0)
    ids = np.zeros((size, size), int)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xs - px)
        dy = np.abs(ys - py)
        dx = np.minimum(dx, 1 - dx) / sx
        dy = np.minimum(dy, 1 - dy) / sy
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        ids = np.where(closer, i, ids)
        f1 = np.where(closer, d, f1)
    return f1, f2, ids


# ---------------------------------------------------------------- meshes from arrays

def mesh_from_arrays(name, verts, tris, cols=None, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set('co', verts.astype(np.float32).ravel())
    me.loops.add(len(tris) * 3)
    me.loops.foreach_set('vertex_index', tris.astype(np.int32).ravel())
    me.polygons.add(len(tris))
    me.polygons.foreach_set('loop_start', np.arange(0, len(tris) * 3, 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    if cols is not None:
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        rgba = np.ones((len(verts), 4), np.float32)
        rgba[:, :3] = cols
        attr.data.foreach_set('color', rgba.ravel())
    if smooth:
        me.shade_smooth()
    if mat:
        me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def grid(field, S, n, margin=0.06):
    """Ground surface over the tile plus a margin, heights from `field`."""
    xs = np.linspace(-margin, S + margin, n)
    X, Y = np.meshgrid(xs, xs)
    Z = field(X, Y)
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    i = np.arange(n - 1)
    a = (i[:, None] * n + i[None, :]).ravel()
    tris = np.concatenate([np.stack([a, a + 1, a + n + 1], 1), np.stack([a, a + n + 1, a + n], 1)])
    return verts, tris


_ico = {}


def ico(subdiv):
    if subdiv not in _ico:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
        bm.verts.ensure_lookup_table()
        v = np.array([p.co[:] for p in bm.verts])
        f = np.array([[p.index for p in face.verts] for face in bm.faces])
        bm.free()
        _ico[subdiv] = (v, f)
    return _ico[subdiv]


def random_rotation(rng):
    q = rng.standard_normal(4)
    q /= np.linalg.norm(q)
    w, x, y, z = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def wrapped(x, y, r, S):
    """Positions to place an object at so it tiles: itself plus copies across nearby edges."""
    out = [(x, y)]
    for dx in (-S, 0, S):
        for dy in (-S, 0, S):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if -r - 0.02 < nx < S + r + 0.02 and -r - 0.02 < ny < S + r + 0.02:
                out.append((nx, ny))
    return out


def stones(rng, S, height, count, rmin, rmax, palette, flat=(0.45, 0.75), sink=0.35, rough=0.25,
           elong=(1.0, 1.6), clusters=None):
    """Scatter lumpy stones. Returns (verts, tris, colours) for one merged mesh."""
    V, F, C = [], [], []
    off = 0
    pal = np.array([srgb(c) for c in palette])
    for _ in range(count):
        r = math.exp(rng.uniform(math.log(rmin), math.log(rmax)))
        if clusters is not None:
            while True:
                x, y = rng.uniform(0, S, 2)
                if rng.uniform() < clusters(x, y):
                    break
        else:
            x, y = rng.uniform(0, S, 2)
        v0, f0 = ico(2 if r > rmax * 0.4 else 1)
        dirs = rng.standard_normal((4, 3))
        bump = 1 + rough * sum(np.cos(v0 @ d * rng.uniform(1.5, 3.5) + rng.uniform(0, 6.28)) * 0.35 for d in dirs)
        v = v0 * bump[:, None]
        v = v * np.array([rng.uniform(*elong), 1.0, rng.uniform(*flat)])
        rot = random_rotation(rng)
        # Keep stones lying flat-ish: only spin around Z, plus a small tilt.
        tilt = random_rotation(rng)
        spin = rng.uniform(0, 2 * math.pi)
        rz = np.array([[math.cos(spin), -math.sin(spin), 0], [math.sin(spin), math.cos(spin), 0], [0, 0, 1]])
        v = v @ (rz @ (np.eye(3) * 0.85 + tilt * 0.15)).T if rng.uniform() < 0.8 else v @ rot.T
        v *= r
        zmin = v[:, 2].min()
        col = pal[rng.integers(len(pal))] * rng.uniform(0.75, 1.15)
        for px, py in wrapped(x, y, r * 1.6, S):
            ground = float(height(px, py))
            vv = v + np.array([px, py, ground - zmin - (v[:, 2].max() - zmin) * sink])
            V.append(vv)
            F.append(f0 + off)
            C.append(np.repeat(col[None], len(vv), 0))
            off += len(vv)
    return np.concatenate(V), np.concatenate(F), np.concatenate(C)


def blades(rng, S, height, count, length, width, colour_at, density=None):
    """Grass blades: thin bent strips leaning in random directions."""
    V, F, C = [], [], []
    off = 0
    for _ in range(count):
        while True:
            x, y = rng.uniform(0, S, 2)
            if density is None or rng.uniform() < density(x, y):
                break
        L = rng.uniform(*length)
        w = rng.uniform(*width)
        az = rng.uniform(0, 2 * math.pi)
        lean = rng.uniform(0.25, 1.25)
        d = np.array([math.cos(az), math.sin(az)])
        side = np.array([-d[1], d[0]])
        pts = []
        for t in (0.0, 0.5, 1.0):
            a = lean * t * 1.3
            horiz = L * (math.sin(a) * 0.9) * t
            up = L * t * math.cos(a * 0.8)
            pts.append((d * horiz, up))
        col = colour_at(x, y) * rng.uniform(0.8, 1.2)
        for px, py in wrapped(x, y, L, S):
            g = float(height(px, py)) - 0.002
            base = np.array([px, py])
            vv = []
            for (hp, up), ww in zip(pts, (w, w * 0.7, 0.0)):
                c = base + hp
                if ww == 0.0:
                    vv.append([c[0], c[1], g + up])
                else:
                    for s in (-1, 1):
                        p = c + side * ww * s
                        vv.append([p[0], p[1], g + up])
            vv = np.array(vv)
            F.append(np.array([[0, 1, 3], [0, 3, 2], [2, 3, 4]]) + off)
            shade = np.array([0.55, 0.55, 0.85, 0.85, 1.1])[:, None]
            C.append(col[None] * shade)
            V.append(vv)
            off += len(vv)
    return np.concatenate(V), np.concatenate(F), np.concatenate(C)


# ---------------------------------------------------------------- materials

def image_from_array(name, rgb):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Linear Rec.709'
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = rgb
    img.pixels.foreach_set(rgba.ravel())
    img.pack()  # the renderer only sees generated pixels once they are packed
    return img


def ground_material(name, img, S):
    """Diffuse-only material that shows a tile-sized image in object coordinates."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Specular IOR Level'].default_value = 0.0
    coord = nt.nodes.new('ShaderNodeTexCoord')
    scale = nt.nodes.new('ShaderNodeVectorMath')
    scale.operation = 'SCALE'
    scale.inputs['Scale'].default_value = 1.0 / S
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    t.extension = 'REPEAT'
    nt.links.new(coord.outputs['Object'], scale.inputs[0])
    nt.links.new(scale.outputs['Vector'], t.inputs['Vector'])
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def attr_material(name, speckle=0.25, speckle_scale=900.0):
    """Diffuse material coloured by the per-vertex 'Col' attribute, with fine speckle."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Specular IOR Level'].default_value = 0.0
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'Col'
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = speckle_scale
    noise.inputs['Detail'].default_value = 4.0
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.inputs['To Min'].default_value = 1 - speckle
    ramp.inputs['To Max'].default_value = 1 + speckle * 0.6
    mul = nt.nodes.new('ShaderNodeVectorMath')
    mul.operation = 'SCALE'
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Value'])
    nt.links.new(attr.outputs['Color'], mul.inputs[0])
    nt.links.new(ramp.outputs['Result'], mul.inputs['Scale'])
    nt.links.new(mul.outputs['Vector'], bsdf.inputs['Base Color'])
    return mat


def data_material(z0, z1):
    """Emission material that outputs (normal.x, normal.y, height) for the data render."""
    mat = bpy.data.materials.new('Data')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    sep_p = nt.nodes.new('ShaderNodeSeparateXYZ')
    nx = nt.nodes.new('ShaderNodeMapRange')
    ny = nt.nodes.new('ShaderNodeMapRange')
    hz = nt.nodes.new('ShaderNodeMapRange')
    for m in (nx, ny):
        m.inputs['From Min'].default_value = -1
        m.inputs['From Max'].default_value = 1
    hz.inputs['From Min'].default_value = z0
    hz.inputs['From Max'].default_value = z1
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes['Material Output']
    L = nt.links.new
    L(geo.outputs['Normal'], sep.inputs[0])
    L(geo.outputs['Position'], sep_p.inputs[0])
    L(sep.outputs['X'], nx.inputs['Value'])
    L(sep.outputs['Y'], ny.inputs['Value'])
    L(sep_p.outputs['Z'], hz.inputs['Value'])
    L(nx.outputs['Result'], comb.inputs['X'])
    L(ny.outputs['Result'], comb.inputs['Y'])
    L(hz.outputs['Result'], comb.inputs['Z'])
    L(comb.outputs['Vector'], em.inputs['Color'])
    L(em.outputs['Emission'], out.inputs['Surface'])
    return mat


# ---------------------------------------------------------------- render

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def render(name, S):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.render.resolution_x = scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 90
    scene.display_settings.display_device = 'sRGB'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1

    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = S
    cam.data.clip_end = 20
    cam.location = (S / 2, S / 2, 5)
    scene.collection.objects.link(cam)
    scene.camera = cam

    world = bpy.data.worlds.new('Sky')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    scene.world = world

    zs = [o.bound_box for o in scene.objects if o.type == 'MESH']
    z0 = min(min(c[2] for c in b) for b in zs)
    z1 = max(max(c[2] for c in b) for b in zs)

    # Colour: an even white sky, so only crevices and overhangs darken.
    bg.inputs['Color'].default_value = (1, 1, 1, 1)
    bg.inputs['Strength'].default_value = 1.0
    scene.view_settings.view_transform = 'Standard'
    scene.cycles.samples = 16 if FAST else 64
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.filepath = os.path.join(OUT, f'{name}_albedo.jpg')
    bpy.ops.render.render(write_still=True)

    # Data: normals and height as raw values.
    bg.inputs['Strength'].default_value = 0.0
    scene.view_layers[0].material_override = data_material(z0, z1)
    scene.view_settings.view_transform = 'Raw'
    scene.cycles.samples = 4 if FAST else 16
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 0
    scene.render.filepath = os.path.join(OUT, f'{name}_normal.jpg')
    bpy.ops.render.render(write_still=True)
    scene.view_layers[0].material_override = None
    print(f'rendered {name} (height range {z1 - z0:.3f} m)')


# ---------------------------------------------------------------- surfaces

def gravel():
    """Loose pit-run gravel: rounded and broken stones in coarse sand. Tile 2 m."""
    S = 2.0
    rng = np.random.default_rng(3)
    n = 512
    h = tex.fractal_noise(n, 2.6, 30) * 0.012 + tex.fractal_noise(n, 1.4, 31) * 0.002
    height = Field(h, S)
    sandn = tex.fractal_noise(n, 1.8, 32)
    sand = tex.lerp(srgb('#9c8a6c'), srgb('#b8a584'), sandn)
    sand *= (0.85 + 0.3 * tex.fractal_noise(n, 0.8, 33))[..., None]
    verts, tris = grid(height, S, 400)
    mesh_from_arrays('Sand', verts, tris, mat=ground_material('SandMat', image_from_array('sand', sand), S))
    k = 0.15 if FAST else 1.0
    pal = ['#8f8a82', '#a39d92', '#6f6a63', '#b5a58c', '#8a7358', '#5d5751', '#c8c2b6', '#9b7a5c', '#7a746b']
    mat = attr_material('Pebbles', 0.22)
    for i, (cnt, r0, r1) in enumerate([(int(6500 * k), 0.004, 0.016), (int(700 * k), 0.016, 0.032), (int(60 * k), 0.032, 0.06)]):
        v, f, c = stones(rng, S, height, cnt, r0, r1, pal, flat=(0.5, 0.8), rough=0.3)
        mesh_from_arrays(f'Stones{i}', v, f, c, mat)
    render('gravel', S)


def dirt():
    """Trodden brown soil with clods and scattered small stones. Tile 3 m."""
    S = 3.0
    rng = np.random.default_rng(5)
    n = 512
    h = tex.fractal_noise(n, 2.4, 50) * 0.035 + tex.fractal_noise(n, 1.5, 51) * 0.004
    height = Field(h, S)
    moist = tex.fractal_noise(n, 2.2, 52)
    soil = tex.lerp(srgb('#8a7152'), srgb('#5e4a36'), tex.smoothstep(0.35, 0.75, moist))
    soil *= (0.88 + 0.24 * tex.fractal_noise(n, 1.0, 53))[..., None]
    dry = tex.smoothstep(0.6, 0.85, tex.fractal_noise(n, 2.0, 54))
    soil = tex.lerp(soil, srgb('#a8916f'), dry * 0.6)
    verts, tris = grid(height, S, 420)
    mesh_from_arrays('Soil', verts, tris, mat=ground_material('SoilMat', image_from_array('soil', soil), S))
    k = 0.15 if FAST else 1.0
    clods = attr_material('Clods', 0.3, 400)
    v, f, c = stones(rng, S, height, int(900 * k), 0.008, 0.035, ['#7a6246', '#6a543b', '#8c7454'],
                     flat=(0.35, 0.6), rough=0.45, sink=0.5)
    mesh_from_arrays('Clods', v, f, c, clods)
    pebbles = attr_material('DirtStones', 0.2)
    v, f, c = stones(rng, S, height, int(1400 * k), 0.003, 0.014, ['#8f8a82', '#a39d92', '#7c7064', '#b5a58c', '#5d5751'],
                     flat=(0.5, 0.8), sink=0.45)
    mesh_from_arrays('DirtStones', v, f, c, pebbles)
    render('dirt', S)


def grass():
    """Rough pasture: tufty grass, some dry straw, bare soil patches. Tile 2 m."""
    S = 2.0
    rng = np.random.default_rng(9)
    n = 512
    h = tex.fractal_noise(n, 2.4, 70) * 0.02
    height = Field(h, S)
    soil = tex.lerp(srgb('#5a4834'), srgb('#6e5a42'), tex.fractal_noise(n, 1.6, 71))
    verts, tris = grid(height, S, 300)
    mesh_from_arrays('GrassSoil', verts, tris, mat=ground_material('GrassSoilMat', image_from_array('gsoil', soil), S))
    dens = Field(0.25 + 0.75 * tex.smoothstep(0.25, 0.6, tex.fractal_noise(256, 2.3, 72)), S)
    dryness = Field(tex.smoothstep(0.45, 0.85, tex.fractal_noise(256, 2.0, 73)), S)
    greens = [srgb(c) for c in ('#55702f', '#4a6428', '#667d36', '#3f5a24', '#72843f')]
    straw = srgb('#a39360')

    def colour_at(x, y):
        g = greens[rng.integers(len(greens))]
        d = float(dryness(x, y)) * rng.uniform(0.3, 1.0)
        return g * (1 - d) + straw * d

    k = 0.12 if FAST else 1.0
    mat = attr_material('Blades', 0.1, 200)
    v, f, c = blades(rng, S, height, int(52000 * k), (0.03, 0.1), (0.0018, 0.0035), colour_at, dens)
    mesh_from_arrays('Blades', v, f, c, mat)
    v, f, c = stones(rng, S, height, int(120 * k), 0.004, 0.02, ['#8f8a82', '#a39d92', '#7c7064'], sink=0.5)
    mesh_from_arrays('GrassStones', v, f, c, attr_material('GrassStones'))
    render('grass', S)


def rock():
    """A dug face in a sand and gravel pit: layered beds (fine sand, pebbly gravel, thin clay
    bands), stones sticking out of the gravel beds, and scrape marks from the bucket teeth.
    The image's up is 'up the wall'. Tile 4 m."""
    S = 4.0
    n = 256 if FAST else 768
    rng = np.random.default_rng(13)
    ys, xs = np.mgrid[0:n, 0:n] / n
    warp = tex.fractal_noise(n, 2.6, 90) - 0.5
    # Bed boundaries (fractions of the tile height) and what each bed is made of.
    edges = np.array([0.0, 0.14, 0.22, 0.41, 0.47, 0.63, 0.78, 0.83, 1.0])
    kinds = ['gravel', 'sand', 'gravel', 'clay', 'sand', 'gravel', 'clay', 'sand']
    yy = (ys + warp * 0.09 + np.sin(xs * 2 * np.pi) * 0.012) % 1.0
    bed = np.clip(np.searchsorted(edges, yy, side='right') - 1, 0, len(kinds) - 1)
    lo = edges[bed]
    hi = edges[bed + 1]
    inbed = (yy - lo) / (hi - lo)
    is_gravel = np.isin(bed, [i for i, k in enumerate(kinds) if k == 'gravel'])
    is_clay = np.isin(bed, [i for i, k in enumerate(kinds) if k == 'clay'])
    rough = tex.fractal_noise(n, 2.2, 93)
    grain = tex.fractal_noise(n, 1.2, 92)
    scrape = aniso_noise(n, 1.6, 95, ax=4.0, ay=0.25)   # vertical grooves from the bucket
    # Sand and clay erode back a little; bed edges are slightly undercut.
    h = (rough * 0.05 + grain * 0.006 + scrape * 0.02
         - np.where(is_gravel, 0.0, 0.02)
         - np.where(is_clay, 0.012, 0.0)
         - 0.012 * np.exp(-inbed * 12))
    height = Field(h, S)

    bed_cols = {'sand': ['#c9b48b', '#bfa87e'], 'gravel': ['#9e9180', '#a89a86'], 'clay': ['#7f6e5b', '#8a6a4c']}
    col = np.zeros((n, n, 3))
    for i, k in enumerate(kinds):
        c = srgb(bed_cols[k][i % 2])
        col[bed == i] = c
    col *= (0.82 + 0.3 * rough)[..., None]
    col *= (0.94 + 0.12 * grain)[..., None]
    col *= (0.93 + 0.12 * scrape)[..., None]
    stain = tex.smoothstep(0.55, 0.9, aniso_noise(n, 2.2, 94, ax=3.0, ay=0.4))
    col = tex.lerp(col, srgb('#8d6a45'), stain * 0.35)
    verts, tris = grid(height, S, n)
    mesh_from_arrays('Face', verts, tris, mat=ground_material('FaceMat', image_from_array('face', col), S))
    # Stones stuck in the gravel beds (and a few in the sand).
    k = 0.15 if FAST else 1.0
    gravel_bed = Field(np.where(is_gravel, 1.0, 0.04), S)
    pal = ['#8f8a82', '#a39d92', '#6f6a63', '#b5a58c', '#8a7358', '#5d5751', '#c8c2b6']
    v, f, c = stones(rng, S, height, int(2600 * k), 0.006, 0.05, pal, flat=(0.55, 0.85), rough=0.25,
                     sink=0.55, clusters=gravel_bed)
    mesh_from_arrays('Cobbles', v, f, c, attr_material('Cobbles', 0.2))
    render('rock', S)


def macro():
    """Large-scale variation: R, G, B are three unrelated soft noise fields (linear data)."""
    n = 512
    rgb = np.stack([tex.fractal_noise(n, 2.6, 100), tex.fractal_noise(n, 2.2, 101), tex.fractal_noise(n, 3.0, 102)], -1)
    img = bpy.data.images.new('macro', n, n, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((n, n, 4), np.float32)
    rgba[..., :3] = rgb
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(OUT, 'macro.jpg')
    img.file_format = 'JPEG'
    img.save()
    print('saved macro')


SURFACES = {'gravel': gravel, 'dirt': dirt, 'grass': grass, 'rock': rock, 'macro': macro}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = [a for a in sys.argv[1:] if not a.startswith('--')] or list(SURFACES)
    for name in names:
        reset()
        SURFACES[name]()
