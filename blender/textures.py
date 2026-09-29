"""Procedural, tileable textures (numpy only). Each function returns an (H, W, 4) float RGBA array."""
import numpy as np


def fractal_noise(size, beta=2.0, seed=0):
    """Tileable 1/f noise in 0..1 made in frequency space (so it wraps seamlessly)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    fx = np.fft.fftfreq(size)[:, None]
    fy = np.fft.fftfreq(size)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    spectrum = np.fft.fft2(white) / f ** (beta / 2.0)
    spectrum[0, 0] = 0
    n = np.real(np.fft.ifft2(spectrum))
    n -= n.min()
    return n / n.max()


def scratches(size, count, seed, length=(8, 60), strength=1.0):
    """Thin random lines (wrapping at the edges). Returns 0..1 mask."""
    rng = np.random.default_rng(seed)
    mask = np.zeros((size, size))
    for _ in range(count):
        x, y = rng.uniform(0, size, 2)
        ang = rng.uniform(0, np.pi)
        ln = rng.uniform(*length)
        t = np.linspace(0, ln, int(ln * 2))
        xs = ((x + np.cos(ang) * t) % size).astype(int)
        ys = ((y + np.sin(ang) * t) % size).astype(int)
        mask[ys, xs] = np.maximum(mask[ys, xs], strength * rng.uniform(0.4, 1.0))
    return mask


def to_rgba(rgb):
    h, w, _ = rgb.shape
    out = np.ones((h, w, 4))
    out[..., :3] = np.clip(rgb, 0, 1)
    return out


def lerp(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def paint_worn(size=1024, seed=1):
    """Light grey worn paint, meant to be tinted by the material colour (yellow, orange...).
    Chips show dark metal, scratches are lighter, mottling adds depth."""
    base = 0.9 + 0.08 * (fractal_noise(size, 2.2, seed) - 0.5)
    mott = fractal_noise(size, 1.6, seed + 1)
    chips_n = fractal_noise(size, 2.6, seed + 2)
    chips = smoothstep(0.80, 0.84, chips_n)
    scr = scratches(size, 260, seed + 3, (6, 40), 0.5)
    v = base * (0.93 + 0.07 * mott) + scr * 0.08
    rgb = np.stack([v, v, v], axis=-1)
    metal = np.array([0.18, 0.17, 0.16])
    rgb = lerp(rgb, metal, chips * 0.9)
    grime = smoothstep(0.55, 0.9, fractal_noise(size, 2.0, seed + 4)) * 0.18
    rgb = rgb * (1 - grime[..., None])
    return to_rgba(rgb)


def rust(size=1024, seed=7):
    """Faded orange-brown paint with patches of flaking rust."""
    n1 = fractal_noise(size, 2.2, seed)
    n2 = fractal_noise(size, 1.4, seed + 1)
    n3 = fractal_noise(size, 2.8, seed + 2)
    paint = lerp([0.62, 0.30, 0.13], [0.72, 0.42, 0.20], n2)
    rust_c = lerp([0.30, 0.12, 0.05], [0.52, 0.22, 0.08], n3)
    mask = smoothstep(0.42, 0.62, n1 * 0.7 + n3 * 0.3)
    rgb = lerp(paint, rust_c, mask)
    streak = smoothstep(0.6, 1.0, fractal_noise(size, 3.0, seed + 5)) * 0.3
    rgb = rgb * (1 - streak[..., None] * 0.5)
    rgb += scratches(size, 150, seed + 3, (5, 30), 0.3)[..., None] * np.array([0.2, 0.12, 0.08])
    return to_rgba(rgb)


def metal_grime(size=512, seed=11):
    """Dark greasy steel for chassis, tracks, rims."""
    n = fractal_noise(size, 2.0, seed)
    d = fractal_noise(size, 1.5, seed + 1)
    v = 0.22 + 0.12 * n
    rgb = np.stack([v, v * 0.97, v * 0.93], axis=-1)
    dirt = smoothstep(0.5, 0.85, d)[..., None] * np.array([0.10, 0.07, 0.03])
    rgb = rgb + dirt
    rgb += scratches(size, 120, seed + 2, (4, 20), 0.25)[..., None] * 0.2
    return to_rgba(rgb)


def rubber(size=512, seed=21):
    n = fractal_noise(size, 1.8, seed)
    d = smoothstep(0.55, 0.9, fractal_noise(size, 2.2, seed + 1))
    v = 0.06 + 0.04 * n
    rgb = np.stack([v, v, v], axis=-1) + d[..., None] * np.array([0.12, 0.09, 0.06])
    return to_rgba(rgb)


def planks(size=512, seed=31):
    """Painted cladding panels for the site office."""
    n = fractal_noise(size, 1.8, seed)
    rows = 8
    y = np.arange(size)[:, None] / size * rows
    seam = (np.abs((y % 1.0) - 0.5) > 0.47).astype(float)
    v = 0.86 + 0.06 * (n - 0.5)
    rgb = np.stack([v, v, v], axis=-1) * (1 - 0.35 * seam)[..., None]
    grime = smoothstep(0.6, 0.95, fractal_noise(size, 2.4, seed + 1))[..., None] * 0.2
    return to_rgba(rgb * (1 - grime))


def concrete(size=512, seed=41):
    n = fractal_noise(size, 2.0, seed)
    s = fractal_noise(size, 3.0, seed + 1)
    v = 0.58 + 0.12 * n - 0.1 * smoothstep(0.7, 0.9, s)
    rgb = np.stack([v, v * 0.98, v * 0.94], axis=-1)
    return to_rgba(rgb)


def wood(size=512, seed=61):
    """Weathered, silvery timber: grain lines along U, warped a little, with dark splits."""
    n = fractal_noise(size, 1.1, seed)
    warp = fractal_noise(size, 2.6, seed + 1)
    rows = (np.arange(size)[:, None] + (warp * 24).astype(int)) % size
    grain = n[rows, 0]
    grain = np.repeat(grain, 1, axis=1) if grain.shape[1] == size else np.tile(grain, (1, size))
    v = 0.78 + 0.35 * (grain - 0.5)
    splits = smoothstep(0.93, 0.99, grain) * 0.45
    weather = fractal_noise(size, 2.0, seed + 2)
    rgb = np.stack([v, v * 0.95, v * 0.86], axis=-1)
    rgb = lerp(rgb, [0.62, 0.61, 0.58], weather * 0.55)  # sun-bleached grey
    rgb = rgb * (1 - splits[..., None])
    return to_rgba(rgb)


def plastic(size=256, seed=71):
    """Slightly mottled moulded plastic (to be tinted), with dirt streaks."""
    n = fractal_noise(size, 1.8, seed)
    d = smoothstep(0.6, 0.95, fractal_noise(size, 2.4, seed + 1))
    v = 0.9 + 0.06 * (n - 0.5)
    rgb = np.stack([v, v, v], axis=-1) * (1 - d[..., None] * 0.25)
    return to_rgba(rgb)


def brick(size=1024, seed=81):
    """Old red brick in stretcher bond with pale lime mortar; every brick a little different."""
    rng = np.random.default_rng(seed)
    rows, cols = 16, 4  # courses and bricks per course in one tile
    y = np.arange(size)[:, None] / size * rows
    course = np.floor(y).astype(int) % rows
    x = np.arange(size)[None, :] / size * cols + (course % 2) * 0.5
    col = np.floor(x).astype(int) % cols
    fx = x % 1.0
    fy = y % 1.0
    mortar = ((fx < 0.035) | (fx > 0.965) | (fy < 0.09) | (fy > 0.91)).astype(float)
    shade = rng.uniform(0.75, 1.1, (rows, cols))
    hue = rng.uniform(-0.06, 0.06, (rows, cols))
    s = shade[course, col]
    h = hue[course, col]
    n = fractal_noise(size, 2.3, seed + 1)
    base = np.stack([0.56 + h, 0.27 + h * 0.5, 0.2 + np.zeros_like(h)], axis=-1) * (s * (0.9 + 0.2 * n))[..., None]
    burnt = smoothstep(0.7, 0.9, fractal_noise(size, 2.6, seed + 2))[..., None] * 0.35
    base = base * (1 - burnt)
    mort = np.stack([0.72, 0.69, 0.62])[None, None, :] * (0.9 + 0.1 * n)[..., None]
    rgb = lerp(base, mort, mortar)
    grime = smoothstep(0.55, 0.95, fractal_noise(size, 1.6, seed + 3))[..., None] * 0.15
    return to_rgba(rgb * (1 - grime))


def slate(size=512, seed=91):
    """Grey-blue roof slates in staggered rows."""
    rng = np.random.default_rng(seed)
    rows, cols = 10, 6
    y = np.arange(size)[:, None] / size * rows
    row = np.floor(y).astype(int) % rows
    x = np.arange(size)[None, :] / size * cols + (row % 2) * 0.5
    col = np.floor(x).astype(int) % cols
    fx = x % 1.0
    fy = y % 1.0
    gap = ((fx < 0.03) | (fx > 0.97)).astype(float) * 0.6 + (fy > 0.92).astype(float) * 0.8
    shade = rng.uniform(0.8, 1.1, (rows, cols))[row, col]
    n = fractal_noise(size, 2.0, seed + 1)
    v = (0.27 + 0.06 * n) * shade
    rgb = np.stack([v, v * 1.02, v * 1.1], axis=-1) * (1 - 0.5 * np.clip(gap, 0, 1))[..., None]
    moss = smoothstep(0.68, 0.9, fractal_noise(size, 2.2, seed + 2))[..., None] * np.array([0.05, 0.08, 0.0])
    return to_rgba(rgb + moss)


def rooftile(size=512, seed=95):
    """Red clay pantiles: rounded rows that catch the light, weathered darker in patches."""
    rng = np.random.default_rng(seed)
    rows, cols = 10, 8
    y = np.arange(size)[:, None] / size * rows
    row = np.floor(y).astype(int) % rows
    x = np.arange(size)[None, :] / size * cols
    col = np.floor(x).astype(int) % cols
    fx = x % 1.0
    fy = y % 1.0
    roll = 0.75 + 0.25 * np.sin(fx * np.pi)
    lip = (fy > 0.88).astype(float)
    shade = rng.uniform(0.82, 1.08, (rows, cols))[row, col]
    n = fractal_noise(size, 2.0, seed + 1)
    rgb = np.stack([0.55, 0.25, 0.15])[None, None, :] * (roll * shade * (0.9 + 0.2 * n))[..., None]
    rgb = rgb * (1 - 0.45 * lip)[..., None]
    lichen = smoothstep(0.7, 0.92, fractal_noise(size, 2.4, seed + 2))[..., None] * np.array([0.1, 0.1, 0.04])
    return to_rgba(rgb + lichen)


def render(size=512, seed=97):
    """Painted render (pebbledash-ish): off-white with speckle and a few damp streaks."""
    n = fractal_noise(size, 2.5, seed)
    speck = (np.random.default_rng(seed).random((size, size)) > 0.9).astype(float) * 0.04
    v = 0.86 + 0.06 * (n - 0.5) - speck
    streak = smoothstep(0.62, 0.9, fractal_noise(size, 2.0, seed + 1)) * 0.12
    rgb = np.stack([v, v * 0.98, v * 0.93], axis=-1) * (1 - streak[..., None])
    return to_rgba(rgb)


def checker_plate(size=512, seed=99):
    """Galvanised steel checker plate (weighbridge deck, steps)."""
    n = fractal_noise(size, 2.0, seed)
    y, x = np.mgrid[0:size, 0:size] / size * 24
    u = (x + y) % 2.0
    w = (x - y) % 2.0
    bump = ((np.abs(u - 1.0) < 0.12) & ((np.floor(x) + np.floor(y)) % 2 == 0)) | \
           ((np.abs(w - 1.0) < 0.12) & ((np.floor(x) + np.floor(y)) % 2 == 1))
    v = 0.5 + 0.1 * n + bump * 0.12
    rgb = np.stack([v, v, v * 0.97], axis=-1)
    grime = smoothstep(0.5, 0.9, fractal_noise(size, 1.6, seed + 1))[..., None] * 0.3
    return to_rgba(rgb * (1 - grime))


def cladding(size=512, seed=101):
    """Profiled steel sheet (vertical ribs) in faded paint, for sheds (tint with the material)."""
    n = fractal_noise(size, 2.0, seed)
    x = np.arange(size)[None, :] / size * 8
    rib = 0.8 + 0.2 * np.cos(x * 2 * np.pi) ** 8
    v = (0.86 + 0.06 * (n - 0.5)) * rib
    rgb = np.stack([v, v, v], axis=-1) * np.ones((size, 1, 1))
    streak = smoothstep(0.6, 0.9, fractal_noise(size, 2.2, seed + 1))[..., None] * 0.18
    return to_rgba(rgb * (1 - streak))
