import sys,copy,json,struct
from pathlib import Path
sys.path.insert(0,'dance-stage/scripts');from optimize_glb import read_glb,view_bytes,validate,JSON_CHUNK,BIN_CHUNK
j,b,_=read_glb(sys.argv[1]);d=copy.deepcopy(j)
materials=sorted({p['material']for m in d['meshes']for p in m['primitives']});mm={old:new for new,old in enumerate(materials)};d['materials']=[d['materials'][i]for i in materials]
for m in d['meshes']:
 for p in m['primitives']:p['material']=mm[p['material']]
def texture_refs(o):
 out=[]
 if isinstance(o,dict):
  for k,v in o.items():
   if k.endswith('Texture')and isinstance(v,dict)and'index'in v:out.append(v)
   else:out+=texture_refs(v)
 elif isinstance(o,list):
  for v in o:out+=texture_refs(v)
 return out
refs=texture_refs(d['materials']);ts=sorted({v['index']for v in refs});tm={x:i for i,x in enumerate(ts)}
for v in refs:v['index']=tm[v['index']]
d['textures']=[d['textures'][i]for i in ts];ims=sorted({t['source']for t in d['textures']});im={x:i for i,x in enumerate(ims)}
for t in d['textures']:t['source']=im[t['source']]
d['images']=[d['images'][i]for i in ims]
used=set()
for m in d['meshes']:
 for p in m['primitives']:
  used.update(p['attributes'].values());used.add(p['indices'])
for s in d.get('skins',[]):used.add(s['inverseBindMatrices'])
for a in d.get('animations',[]):
 for s in a['samplers']:used.update([s['input'],s['output']])
ac=sorted(used);am={x:i for i,x in enumerate(ac)};d['accessors']=[d['accessors'][i]for i in ac]
for m in d['meshes']:
 for p in m['primitives']:p['attributes']={k:am[v]for k,v in p['attributes'].items()};p['indices']=am[p['indices']]
for s in d.get('skins',[]):s['inverseBindMatrices']=am[s['inverseBindMatrices']]
for a in d.get('animations',[]):
 for s in a['samplers']:s['input']=am[s['input']];s['output']=am[s['output']]
views=sorted({a['bufferView']for a in d['accessors']}|{im['bufferView']for im in d['images']});vm={x:i for i,x in enumerate(views)};out=bytearray();newviews=[]
for vi in views:
 raw=view_bytes(j,b,vi);out.extend(b'\0'*(-len(out)%4));v=copy.deepcopy(j['bufferViews'][vi]);v['byteOffset']=len(out);v['buffer']=0;out.extend(raw);newviews.append(v)
for a in d['accessors']:a['bufferView']=vm[a['bufferView']]
for im in d['images']:im['bufferView']=vm[im['bufferView']]
d['bufferViews']=newviews;d['buffers']=[{'byteLength':len(out)}];jb=json.dumps(d,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);out.extend(b'\0'*(-len(out)%4));raw=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(out))+struct.pack('<II',len(jb),JSON_CHUNK)+jb+struct.pack('<II',len(out),BIN_CHUNK)+out;Path(sys.argv[2]).write_bytes(raw);validate(d,out);print('COMPACT',len(raw))
