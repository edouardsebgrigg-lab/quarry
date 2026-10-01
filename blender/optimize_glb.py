"""Compact normals/colours and remove unused UVs; preserve positions and rig transforms.

Uses core normalized byte colours and KHR_mesh_quantization signed-short normals.
No mesh simplification, texture resizing or external decoder/download is required.
"""
import json
from pathlib import Path
import struct
import sys


def optimize(path):
    raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
    views=doc['bufferViews'];accessors=doc.get('accessors',[]);semantics={}
    def textured(mat):
        if isinstance(mat,dict):return any('texture' in k.lower() or textured(v) for k,v in mat.items())
        if isinstance(mat,list):return any(textured(v) for v in mat)
        return False
    for mesh in doc.get('meshes',[]):
        for p in mesh['primitives']:
            if not textured(doc.get('materials',[])[p['material']] if 'material' in p else {}):
                for key in list(p['attributes']):
                    if key.startswith('TEXCOORD_'):del p['attributes'][key]
            for key,index in p['attributes'].items():semantics[index]=key
    additions={};quant=False
    for index,key in semantics.items():
        a=accessors[index]
        if a['componentType']!=5126 or key not in ['NORMAL','TANGENT','COLOR_0']:continue
        view=views[a['bufferView']];n=int(a['type'][-1]);stride=view.get('byteStride',n*4)
        start=view.get('byteOffset',0)+a.get('byteOffset',0)
        color=key=='COLOR_0';fmt='B' if color else 'h';component=5121 if color else 5122
        item=n if color else n*2;padded=(item+3)&~3;buf=bytearray()
        for row in range(a['count']):
            values=struct.unpack_from('<'+'f'*n,binary,start+row*stride)
            out=[max(0,min(255,round(v*255))) if color else max(-32767,min(32767,round(v*32767))) for v in values]
            buf.extend(struct.pack('<'+fmt*n,*out));buf.extend(b'\0'*(padded-item))
        vi=len(views);views.append({'buffer':0,'byteLength':len(buf),'byteStride':padded,'target':34962});additions[vi]=bytes(buf)
        a['bufferView']=vi;a.pop('byteOffset',None);a.pop('min',None);a.pop('max',None)
        a.update(componentType=component,normalized=True);quant|=not color
    used=set()
    for mesh in doc.get('meshes',[]):
        for p in mesh['primitives']:
            used.update(p['attributes'].values())
            if 'indices' in p:used.add(p['indices'])
            for target in p.get('targets',[]):used.update(target.values())
    for skin in doc.get('skins',[]):
        if 'inverseBindMatrices' in skin:used.add(skin['inverseBindMatrices'])
    for animation in doc.get('animations',[]):
        for sampler in animation['samplers']:used.update([sampler['input'],sampler['output']])
    mapping={old:new for new,old in enumerate(sorted(used))};doc['accessors']=[accessors[i] for i in sorted(used)]
    for mesh in doc.get('meshes',[]):
        for p in mesh['primitives']:
            p['attributes']={k:mapping[v] for k,v in p['attributes'].items()}
            if 'indices' in p:p['indices']=mapping[p['indices']]
            for target in p.get('targets',[]):
                for k in target:target[k]=mapping[target[k]]
    for skin in doc.get('skins',[]):
        if 'inverseBindMatrices' in skin:skin['inverseBindMatrices']=mapping[skin['inverseBindMatrices']]
    for animation in doc.get('animations',[]):
        for s in animation['samplers']:s['input']=mapping[s['input']];s['output']=mapping[s['output']]
    usedViews={a['bufferView'] for a in doc['accessors'] if 'bufferView' in a}|{im['bufferView'] for im in doc.get('images',[]) if 'bufferView' in im}
    for a in doc['accessors']:
        if 'sparse' in a:usedViews.update([a['sparse']['indices']['bufferView'],a['sparse']['values']['bufferView']])
    newViews=[];viewMap={};chunks=bytearray();dedup={}
    for i in sorted(usedViews):
        v=dict(views[i]);data=additions.get(i,binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
        key=(data,v.get('byteStride'),v.get('target'))
        if key in dedup:viewMap[i]=dedup[key];continue
        chunks.extend(b'\0'*((-len(chunks))%4));v['byteOffset']=len(chunks);chunks.extend(data)
        viewMap[i]=len(newViews);dedup[key]=len(newViews);newViews.append(v)
    for a in doc['accessors']:
        if 'bufferView' in a:a['bufferView']=viewMap[a['bufferView']]
        if 'sparse' in a:
            for k in ['indices','values']:a['sparse'][k]['bufferView']=viewMap[a['sparse'][k]['bufferView']]
    for im in doc.get('images',[]):
        if 'bufferView' in im:im['bufferView']=viewMap[im['bufferView']]
    doc['bufferViews']=newViews;doc['buffers'][0]['byteLength']=len(chunks)
    if quant:
        for key in ['extensionsUsed','extensionsRequired']:
            doc[key]=sorted(set(doc.get(key,[])+['KHR_mesh_quantization']))
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);chunks.extend(b'\0'*((-len(chunks))%4))
    result=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(chunks))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(chunks),0x004e4942)+chunks
    path.write_bytes(result)
    print(path.name,len(raw),'->',len(result))


if __name__=='__main__':
    for filename in sys.argv[1:]:optimize(Path(filename))
