"""Check geometry buffers and unchanged positions after compacting Blender exports."""
import json
import math
from pathlib import Path
import struct
import sys
from check_review_exports import read_glb


def values(path,doc,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    raw=path.read_bytes();offset=28+struct.unpack_from('<I',raw,12)[0]+v.get('byteOffset',0)+a.get('byteOffset',0)
    formats={5120:('b',1,127),5121:('B',1,255),5122:('h',2,32767),5123:('H',2,65535),5125:('I',4,4294967295),5126:('f',4,1)}
    fmt,size,denominator=formats[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    stride=v.get('byteStride',size*n)
    for i in range(a['count']):
        row=struct.unpack_from('<'+fmt*n,raw,offset+i*stride)
        if a.get('normalized'):row=tuple(max(-1,x/denominator) for x in row)
        yield row


def main(base,staged,out):
    report=[]
    for path in sorted(base.glob('*.glb')):
        doc=read_glb(path);source=staged/path.name
        original=read_glb(source) if source.exists() else None
        vertices=0;error=0;checked=set()
        for i,mesh in enumerate(doc['meshes']):
            for j,p in enumerate(mesh['primitives']):
                position=p['attributes']['POSITION'];n=doc['accessors'][position]['count']
                if position not in checked:
                    points=list(values(path,doc,position));assert all(math.isfinite(v) for row in points for v in row),path
                    vertices+=n;checked.add(position)
                    if original:
                        op=original['meshes'][i]['primitives'][j]['attributes']['POSITION']
                        assert points==list(values(source,original,op)),(path,'positions changed')
                if 'indices' in p:assert all(0<=row[0]<n for row in values(path,doc,p['indices'])),(path,'out of range index')
                normal=p['attributes'].get('NORMAL')
                if normal is not None:
                    normals=list(values(path,doc,normal));assert all(math.isfinite(v) for row in normals for v in row),path
                    # Degenerate source normals can be zero; all actual normals must remain unit vectors.
                    errors=[abs(math.sqrt(sum(v*v for v in row))-1) for row in normals if sum(v*v for v in row)>.01]
                    error=max(error,max(errors,default=0));assert error<.002,(path,'non-unit normal',error)
        report.append({'model':path.stem,'vertices':vertices,'maxNormalLengthError':error,'positionsExactToStaging':original is not None})
    out.write_text(json.dumps(report,indent=2));print('PASS',len(report),'models; finite buffers, valid indices, unit normals and exact staged positions')


if __name__=='__main__':main(Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]))
