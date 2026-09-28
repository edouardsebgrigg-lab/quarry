"""Builds every model, exports .glb files to assets/models/ and renders previews.

Run:  <python with bpy> blender/build_models.py [model ...]
(e.g. `blenv/bin/python blender/build_models.py truck`). See docs/models.md."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
import truck  # noqa: E402
import excavator  # noqa: E402
import props  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'models')
PREVIEWS = os.path.join(ROOT, 'docs', 'images', 'models')

MODELS = {
    'truck': (truck, ['rusty', 'used']),
    'excavator': (excavator, ['rusty', 'used']),
    'prop': (props, list(props.PARTS)),
}


def write_manifest():
    import json
    models = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.glb'))
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump({'models': models}, fh, indent=2)
        fh.write('\n')


def main(names):
    for name in names or MODELS:
        module, tiers = MODELS[name]
        for tier in tiers:
            lib.reset_scene()
            lib._images.clear()
            root = module.build(tier)
            path = os.path.join(OUT, f'{name}_{tier}.glb')
            lib.export_glb(root, path)
            print(f'exported {path} ({os.path.getsize(path) // 1024} KB)')
            if '--no-preview' not in sys.argv:
                if hasattr(module, 'pose'):
                    module.pose(root)  # show it working, after export (export keeps the rest pose)
                preview = module.PREVIEW(tier) if callable(module.PREVIEW) else module.PREVIEW
                lib.render_preview(os.path.join(PREVIEWS, f'{name}_{tier}.jpg'), **preview)


if __name__ == '__main__':
    main([a for a in sys.argv[1:] if not a.startswith('--')])
    write_manifest()
