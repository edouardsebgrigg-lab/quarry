"""Verify self-contained review GLBs and protected rigs against production assets.

Usage: python3 blender/check_review_exports.py /absolute/review/output
No Blender or third-party Python dependencies required.
"""
import argparse
import json
from pathlib import Path
import struct


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and length == len(data), path
    size, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A, path
    doc = json.loads(data[20:20 + size])
    offset = 20 + size
    binary_size, binary_kind = struct.unpack_from('<II', data, offset)
    assert binary_kind == 0x004E4942 and offset + 8 + binary_size == len(data), path
    assert doc['buffers'][0]['byteLength'] <= binary_size
    assert len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
    for view in doc['bufferViews']:
        assert view['buffer'] == 0
        assert view.get('byteOffset', 0) + view['byteLength'] <= binary_size
    for image in doc.get('images', []):
        assert 'uri' not in image and image['bufferView'] < len(doc['bufferViews'])
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            assert all(i < len(doc['accessors']) for i in primitive['attributes'].values())
    return doc


def rig(doc, names):
    parents = {c: n.get('name') for n in doc['nodes'] for c in n.get('children', [])}
    result = {}
    for i, node in enumerate(doc['nodes']):
        if node.get('name') in names:
            result[node['name']] = {'parent': parents.get(i),
                'translation': node.get('translation', [0, 0, 0]),
                'rotation': node.get('rotation', [0, 0, 0, 1]),
                'scale': node.get('scale', [1, 1, 1]), 'matrix': node.get('matrix')}
    return result


def main(out, production=None):
    production = production or Path(__file__).resolve().parent.parent / 'assets/models'
    reports = []
    for path in sorted(out.glob('*/*.glb')):
        name = path.stem
        checks = json.loads((path.parent / 'checks.json').read_text())
        doc = read_glb(path)
        original = read_glb(production / path.name)
        names = set(checks['rig'])
        actual, expected = rig(doc, names), rig(original, names)
        assert set(actual) == names == set(expected), name
        for part in names:
            assert actual[part]['parent'] == expected[part]['parent'], (name, part)
            for transform in ['translation', 'rotation', 'scale', 'matrix']:
                a, b = actual[part][transform], expected[part][transform]
                assert (a is None) == (b is None), (name, part, transform)
                if a is not None:
                    assert all(abs(x-y) < 1e-5 for x, y in zip(a,b)), (name, part, transform)
        maps = sum('normalTexture' in m and 'metallicRoughnessTexture' in m.get('pbrMetallicRoughness', {}) for m in doc['materials'])
        assert maps > 0, name
        if checks['panes_opened']:
            assert any(m.get('alphaMode') == 'BLEND' and m['name'].startswith('Review_Glass') for m in doc['materials']), name
        reports.append({'asset': name, 'protected_parts': len(names), 'embedded_images': len(doc['images']),
                        'pbr_materials': maps, 'glb_bytes': path.stat().st_size})
    assert len(reports) == 14, len(reports)
    (out / 'export-checks.json').write_text(json.dumps(reports, indent=2))
    print('PASS: 14 self-contained GLBs; protected names, parents and rest transforms match production')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('out', type=Path)
    parser.add_argument('--production', type=Path, help='Directory of original GLBs to compare rigs against')
    args = parser.parse_args()
    main(args.out, args.production)
