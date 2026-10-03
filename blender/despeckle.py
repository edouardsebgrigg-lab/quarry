"""Clear stray leaves from a sprite atlas: opaque pixels with little else opaque around them.

A tree rendered with thousands of leaf quads has single leaves scattered well outside its
crown. On a card a few metres across, seen from the roadside, each of those is a square of
green floating in the air. Leaves at the crown's edge, among others, stay.

Used by trees.py when it renders the atlas. Also runs on its own (numpy and Pillow, no Blender):
    python3 blender/despeckle.py assets/textures/trees.png [radius] [keep]
"""
import sys

import numpy as np


def despeckle(rgba, radius=10, keep=0.14):
    """rgba: float or uint8 array (h, w, 4). Opaque pixels whose (2 * radius + 1) square has less
    than `keep` of its area opaque become transparent. Returns a new array."""
    a = rgba[..., 3].astype(np.float64)
    a = a / 255.0 if rgba.dtype == np.uint8 else a
    solid = (a > 0.5).astype(np.float64)
    h, w = solid.shape
    s = np.zeros((h + 1, w + 1))
    s[1:, 1:] = solid.cumsum(0).cumsum(1)
    y = np.arange(h)
    x = np.arange(w)
    y0 = np.clip(y - radius, 0, h)[:, None]
    y1 = np.clip(y + radius + 1, 0, h)[:, None]
    x0 = np.clip(x - radius, 0, w)[None, :]
    x1 = np.clip(x + radius + 1, 0, w)[None, :]
    count = s[y1, x1] - s[y0, x1] - s[y1, x0] + s[y0, x0]
    cover = count / ((y1 - y0) * (x1 - x0))
    out = rgba.copy()
    out[..., 3][(a > 0) & (cover < keep)] = 0
    return out


if __name__ == '__main__':
    from PIL import Image

    path = sys.argv[1]
    radius = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    keep = float(sys.argv[3]) if len(sys.argv) > 3 else 0.14
    img = np.array(Image.open(path).convert('RGBA'))
    out = despeckle(img, radius, keep)
    removed = int(((img[..., 3] > 0) & (out[..., 3] == 0)).sum())
    Image.fromarray(out).save(path, optimize=True)
    print(f'{path}: cleared {removed} stray pixels')
