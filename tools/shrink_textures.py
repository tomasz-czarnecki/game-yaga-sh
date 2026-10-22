"""Makes the textures inside a .glb smaller, so the game loads faster on a phone.

    uv run --no-project --with pillow python tools/shrink_textures.py assets/models/yaga/yaga-dressed.glb [max px]

Every image is shrunk to at most `max px` (default 1024) on its longest side and saved again in its own format
(WebP and JPEG at quality 85, PNG lossless). Everything else in the file (meshes, skeleton, animations, materials)
is copied unchanged, and that is checked before the file is written. Run it after exporting a new model from
Blender, then update the model's rough size at its loadGLB(...) call in boot() (code/app.js).
"""
import io
import json
import struct
import sys

from PIL import Image

SAVE = {'image/webp': ('WEBP', {'quality': 85, 'method': 6}), 'image/jpeg': ('JPEG', {'quality': 85, 'optimize': True}),
        'image/png': ('PNG', {'optimize': True})}


def unpack(b):
    """The bytes of a .glb file -> (its JSON, its binary chunk)."""
    n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), b[28 + n:28 + n + struct.unpack('<I', b[20 + n:24 + n])[0]]


def pack(gltf, binary):
    """(JSON, binary chunk) -> the bytes of a .glb file, each chunk padded to 4 bytes."""
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    binary += b'\0' * (-len(binary) % 4)
    head = struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(binary))
    return head + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binary), b'BIN\0') + binary


def view(gltf, binary, i):
    v = gltf['bufferViews'][i]
    return binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]


def shrink(data, mime, max_px):
    """One image -> (new bytes, old size, new size). An image already small enough is kept as it is."""
    im = Image.open(io.BytesIO(data))
    w, h = im.size
    if max(w, h) <= max_px:
        return data, (w, h), (w, h)
    k = max_px / max(w, h)
    small = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
    fmt, options = SAVE[mime]
    out = io.BytesIO()
    small.save(out, fmt, **options)
    return out.getvalue(), (w, h), small.size


def main(path, max_px):
    original = open(path, 'rb').read()
    gltf, binary = unpack(original)
    images = {im['bufferView']: im for im in gltf.get('images', [])}
    new_views, report = {}, []
    for i, im in images.items():
        old = view(gltf, binary, i)
        new_views[i], before, after = shrink(old, im['mimeType'], max_px)
        report.append(f"  {im.get('name', str(i))[:34]:35} {before[0]}x{before[1]} {len(old) / 1e6:5.2f} MB -> {after[0]}x{after[1]} {len(new_views[i]) / 1e6:5.2f} MB")

    # lay the binary chunk out again, in the same order, with the new images in place
    out = json.loads(json.dumps(gltf))
    parts, offset = [], 0
    for i, v in enumerate(out['bufferViews']):
        data = new_views.get(i, view(gltf, binary, i))
        v['byteOffset'], v['byteLength'] = offset, len(data)
        parts.append(data + b'\0' * (-len(data) % 4))
        offset += len(parts[-1])
    out['buffers'][0]['byteLength'] = offset
    result = pack(out, b''.join(parts))

    # check before writing: apart from the images, every piece of data and the rest of the JSON are unchanged
    check, check_bin = unpack(result)
    for i in range(len(gltf['bufferViews'])):
        if i not in images:
            assert view(gltf, binary, i) == view(check, check_bin, i), f'bufferView {i} changed'
    rest = lambda g: {k: v for k, v in g.items() if k not in ('bufferViews', 'buffers')}
    assert rest(gltf) == rest(check), 'the JSON changed outside bufferViews and buffers'

    open(path, 'wb').write(result)
    print(f'{path}: {len(original) / 1e6:.2f} MB -> {len(result) / 1e6:.2f} MB '
          f'({len(gltf.get("animations", []))} animations; everything but the images unchanged)')
    print('\n'.join(report))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1024)
