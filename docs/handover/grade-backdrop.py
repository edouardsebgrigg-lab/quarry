"""Cinematic grade for the main-menu backdrop: a gentle contrast curve, a little more
saturation, warm highlights and cool shadows, and a soft vignette. Needs Pillow and numpy.
Usage: python3 grade-backdrop.py in.png out.jpg"""
import sys
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
im = ImageEnhance.Color(im).enhance(1.14)
a = np.asarray(im).astype(np.float32) / 255.0

# S-curve on luminance-ish (per channel, gentle)
def scurve(x, k=0.18):
    return x + k * (x - 0.5) * (1 - np.abs(2 * x - 1))
a = np.clip(scurve(a), 0, 1)

# split tone: shadows a touch teal, highlights warm
lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])[..., None]
shadow = np.clip(1 - lum * 1.8, 0, 1)
high = np.clip((lum - 0.45) * 1.8, 0, 1)
a = a + shadow * np.array([-0.018, 0.004, 0.022]) + high * np.array([0.035, 0.012, -0.03])

# vignette
h, w = a.shape[:2]
yy, xx = np.mgrid[0:h, 0:w]
d = np.sqrt(((xx - w * 0.58) / (w * 0.62)) ** 2 + ((yy - h * 0.52) / (h * 0.70)) ** 2)
vig = np.clip(1 - 0.38 * np.clip(d - 0.55, 0, 1) ** 1.6, 0.55, 1)[..., None]
a = np.clip(a * vig, 0, 1)

out = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
out.save(dst, quality=86, optimize=True, progressive=True)
print('graded', out.size)
