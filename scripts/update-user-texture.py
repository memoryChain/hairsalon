"""在几何和 UV 完全兼容时，从新版 GLB 更新运行时贴图。"""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[1]

def load(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    return raw, json.loads(raw[20:20+size]), raw[28+size:]

def view(doc, binary, index):
    item = doc['bufferViews'][index]
    start = item.get('byteOffset', 0)
    return binary[start:start+item['byteLength']]

def update():
    old, original, old_binary = load(ROOT/'preview/model-review/user-head.glb')
    new, upgraded, new_binary = load(ROOT/'sceneresource/user-head/UserCharacter_HD_Source.glb')
    before = original['meshes'][0]['primitives'][0]
    after = upgraded['meshes'][0]['primitives'][0]
    for semantic in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'indices'):
        a = before['indices'] if semantic == 'indices' else before['attributes'][semantic]
        b = after['indices'] if semantic == 'indices' else after['attributes'][semantic]
        aa, bb = original['accessors'][a], upgraded['accessors'][b]
        assert aa == bb, f'{semantic} accessor 不兼容'
        assert view(original, old_binary, aa['bufferView']) == view(upgraded, new_binary, bb['bufferView']), f'{semantic} 数据发生变化，需要重新适配'
    image = upgraded['images'][0]
    assert image['mimeType'] == 'image/jpeg', '贴图格式需要重新评估'
    jpeg = view(upgraded, new_binary, image['bufferView'])
    texture = ROOT/'assets/resources/character/user-body.jpg'
    texture.parent.mkdir(parents=True, exist_ok=True)
    texture.write_bytes(jpeg)
    uv = upgraded['accessors'][after['attributes']['TEXCOORD_0']]
    assert uv['componentType'] == 5126 and uv['type'] == 'VEC2'
    data = view(upgraded, new_binary, uv['bufferView'])
    values = struct.unpack_from('<'+'f'*(uv['count']*2), data, uv.get('byteOffset', 0))
    target = ROOT/'assets/resources/scalp/user-head.json'
    model = json.loads(target.read_text(encoding='utf-8'))
    model['characterMesh']['uvs'] = values
    target.write_text(json.dumps(model, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps(dict(compatible=True, textureBytes=len(jpeg), textureSha256=hashlib.sha256(jpeg).hexdigest()), ensure_ascii=False))

if __name__ == '__main__':
    update()
