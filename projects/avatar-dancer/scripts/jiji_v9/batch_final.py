"""Losslessly batch same-material headwear primitives, preserving donor/neck slots."""
import collections,hashlib,json,struct,sys
from pathlib import Path
sys.path.insert(0,'dance-stage/scripts')
from restyle_jiji_headwear import Editor
from test_neck_attachment import array,check

def signature(d,b,mesh):
 result=collections.Counter()
 for p in mesh['primitives']:
  keys=sorted(p['attributes']);attrs={k:array(d,b,p['attributes'][k]) for k in keys};formats={k:'<'+{5126:'f',5125:'I',5123:'H',5121:'B'}[d['accessors'][p['attributes'][k]]['componentType']]*len(attrs[k][0]) for k in keys};rows=[b''.join(struct.pack(formats[k],*attrs[k][i]) for k in keys) for i in range(len(attrs['POSITION']))];ids=[i[0] for i in array(d,b,p['indices'])];prefix=str((p.get('material'),keys,formats)).encode()
  for i in range(0,len(ids),3):result[hashlib.sha256(prefix+b''.join(rows[j] for j in ids[i:i+3])).digest()]+=1
 return result

def merge(source,destination):
 ed=Editor(source);d=ed.d;node=next(n for n in d['nodes'] if 'mesh' in n and ('DONOR_HEAD' in n.get('name','') or 'CANONICAL' in n.get('name','')));mesh=d['meshes'][node['mesh']];before=len(mesh['primitives']);original=signature(d,ed.b,mesh);groups=collections.OrderedDict()
 for p in mesh['primitives'][2:]:
  key=(p.get('material'),p.get('mode',4),tuple((k,d['accessors'][ai]['type'],d['accessors'][ai]['componentType']) for k,ai in sorted(p['attributes'].items())));groups.setdefault(key,[]).append(p)
 merged=mesh['primitives'][:2]
 for key,ps in groups.items():
  if len(ps)==1:merged.extend(ps);continue
  attrs={k:[] for k,typ,comp in key[2]};indices=[];offset=0
  for p in ps:
   indices.extend(i[0]+offset for i in array(d,ed.b,p['indices']))
   for k in attrs:attrs[k].extend(array(d,ed.b,p['attributes'][k]))
   offset+=d['accessors'][p['attributes']['POSITION']]['count']
  merged.append({'attributes':{k:ed.add(attrs[k],typ,comp) for k,typ,comp in key[2]},'indices':ed.add(indices,'SCALAR',5125),'material':key[0],'extras':{'mergedHeadwearPrimitives':len(ps)}})
 mesh['primitives']=merged;assert signature(d,ed.b,mesh)==original,'Attributed triangle changed during batching'
 d['extras']['stageHeadwear']['batching']={'headPrimitivesBefore':before,'headPrimitivesAfter':len(merged),'exactAttributedTriangles':True};ed.save(destination);print(json.dumps({'asset':str(destination),'headPrimitivesBefore':before,'headPrimitivesAfter':len(merged),'exactAttributedTriangles':True}))
if __name__=='__main__':merge(sys.argv[1],sys.argv[2])
