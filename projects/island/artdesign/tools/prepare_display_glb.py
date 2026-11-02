"""Prepare a smaller display derivative. Geometry, UVs and source GLB remain unchanged."""
import argparse
from io import BytesIO
import json
from pathlib import Path
import struct
import hashlib
import numpy as np
from PIL import Image

def prepare(source):
    raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
    views=doc['bufferViews']; replacement={}; changes=[]
    normal_sources=set();color_sources=set();alpha_sources=set()
    for m in doc.get('materials',[]):
        if 'normalTexture' in m: normal_sources.add(doc['textures'][m['normalTexture']['index']]['source'])
        p=m.get('pbrMetallicRoughness',{})
        if 'baseColorTexture' in p:
            source_index=doc['textures'][p['baseColorTexture']['index']]['source'];color_sources.add(source_index)
            if m.get('alphaMode','OPAQUE')!='OPAQUE':alpha_sources.add(source_index)
    for i,image in enumerate(doc.get('images',[])):
        if 'bufferView' not in image:raise RuntimeError('Only embedded images are supported')
        vi=image['bufferView'];v=views[vi];start=v.get('byteOffset',0)
        original=Image.open(BytesIO(binary[start:start+v['byteLength']])).convert('RGBA' if i in alpha_sources else 'RGB'); before=original.size
        hero=source.parent.name in ('dog','tree')
        tiny=source.parent.name=='fish'
        max_size=(512 if tiny else 2048 if hero else 1024) if i in color_sources else (256 if tiny else 1024 if hero else 512)
        original.thumbnail((max_size,max_size),Image.Resampling.LANCZOS)
        if i in normal_sources:
            xyz=np.asarray(original,dtype=np.float32)/127.5-1
            xyz/=np.maximum(np.linalg.norm(xyz,axis=2,keepdims=True),1e-6)
            original=Image.fromarray(np.clip((xyz+1)*127.5,0,255).astype(np.uint8))
        output=BytesIO(); format='JPEG' if i in color_sources and i not in alpha_sources else 'PNG'
        original.save(output,format=format,**({'quality':93,'subsampling':0,'optimize':True} if format=='JPEG' else {'optimize':True}))
        image['mimeType']='image/jpeg' if format=='JPEG' else 'image/png';replacement[vi]=output.getvalue()
        changes.append({'image':i,'role':'baseColor' if i in color_sources else 'normal' if i in normal_sources else 'data','before':before,'after':original.size,'bytes':len(replacement[vi])})
    packed=bytearray()
    for i,v in enumerate(views):
        old=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        chunk=replacement.get(i,old)
        packed.extend(b'\0'*((-len(packed))%4));v['byteOffset']=len(packed);v['byteLength']=len(chunk);v['buffer']=0;packed.extend(chunk)
    doc['buffers']=[{'byteLength':len(packed)}];packed.extend(b'\0'*((-len(packed))%4))
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    out=b'glTF'+struct.pack('<IIII',2,28+len(j)+len(packed),len(j),0x4e4f534a)+j+struct.pack('<II',len(packed),0x004e4942)+packed
    target=source.with_name('display.glb');target.write_bytes(out)
    report={'source':str(source),'source_sha256':hashlib.sha256(raw).hexdigest(),'output':str(target),'output_sha256':hashlib.sha256(out).hexdigest(),'before_bytes':len(raw),'after_bytes':len(out),'images':changes,'geometry':'unchanged; buffer views repacked'}
    target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path,nargs='+');args=p.parse_args()
    for source in args.source:prepare(source)
