#!/usr/bin/env python3
"""Close actual cropped-head rims with skinned, multi-ring neck geometry.

Append-only GLB surgery preserves original face/outfit/UV/image/animation bytes.
New rim vertices copy donor position, UV, normal and skin influences exactly.
The neck descends into the existing torso; its lower end is capped and blended
onto Neck/Spine2. No camera edits, AI calls, face warps, or image regeneration.
"""
import argparse,collections,copy,json,math,struct,sys
from pathlib import Path
import numpy as np
import io
from PIL import Image
from optimize_glb import view_bytes
from optimize_glb import read_glb,validate,JSON_CHUNK,BIN_CHUNK
from test_neck_attachment import array,open_edges,check

def repair(source,dest):
 d,b,raw=read_glb(source)
 if Path(source).stem.startswith('lx'):assert d.get('extras',{}).get('neckRimCleanup'),'Run clean_neck_rim.py first: ragged LX garment rim cannot be safely extruded'
 original=copy.deepcopy(d);binary=bytearray(b);head=d['meshes'][0];p=head['primitives'][0];a=p['attributes'];ps=array(d,b,a['POSITION']);ns=array(d,b,a['NORMAL']);uv=array(d,b,a['TEXCOORD_0']);js=array(d,b,a['JOINTS_0']);ws=array(d,b,a['WEIGHTS_0']);lookup={tuple(round(x,6) for x in v):i for i,v in enumerate(ps)}
 # Only geometric cut rims, not sub-millimetre exporter degeneracies.
 edges=open_edges(d,b,{'primitives':[p]});adj=collections.defaultdict(set)
 for x,y in edges:adj[x].add(y);adj[y].add(x)
 components=[]
 while adj:
  stack=[next(iter(adj))];vs=set()
  while stack:
   v=stack.pop()
   if v in vs:continue
   vs.add(v);stack.extend(adj.pop(v,[]))
  if len(vs)>10:components.append(vs)
 assert components,'No open head crop rim: already repaired or wrong input'
 skin=d['skins'][0];joint_names=[d['nodes'][i]['name'] for i in skin['joints']];ni=joint_names.index('mixamorig:Neck');si=joint_names.index('mixamorig:Spine2')
 ib=array(d,b,skin['inverseBindMatrices']);anchor=np.linalg.inv(np.array(ib[ni]).reshape(4,4).T)[:3,3];base_y=float(anchor[1]-.018)
 # +Y is up in GLB. Existing donor front points along +X.
 # The crop UV runs along the discarded garment edge; stretching it produces
 # black stripes. Sample skin texels from the intact donor neck/cheek nearby,
 # keeping original atlas bytes and original face material completely intact.
 material=d['materials'][p['material']];texture=material['pbrMetallicRoughness']['baseColorTexture']['index'];im=d['images'][d['textures'][texture]['source']]
 pixels=np.asarray(Image.open(io.BytesIO(view_bytes(d,b,im['bufferView']))).convert('RGB'))/255.
 colors=np.array([pixels[min(pixels.shape[0]-1,max(0,int(v*pixels.shape[0]))),min(pixels.shape[1]-1,max(0,int(u*pixels.shape[1])))] for u,v in uv])
 pp=np.asarray(ps);mask=(colors[:,0]>colors[:,1]*1.06)&(colors[:,1]>colors[:,2]*1.02)&(colors[:,0]>.3)&(pp[:,1]<anchor[1]+.15)&(pp[:,1]>anchor[1]+.04)
 assert mask.sum()>20,'Insufficient intact skin texels'
 skin_points=pp[mask];skin_colors=colors[mask];median=np.median(skin_colors,axis=0)
 def skin_color(position):
  distances=np.sum((skin_points-position)**2,axis=1);nearest=np.argsort(distances)[:24];rgb=np.median(skin_colors[nearest],axis=0)*.75+median*.25
  return [float(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4) for c in rgb]+[1.]
 positions=[];normals=[];tex=[];joints=[];weights=[];indices=[];rim_pairs=[];vertex_colors=[];rings=9
 components.sort(key=len,reverse=True)
 for ci,comp in enumerate(components):
  ce=[(x,y) for x,y in edges if x in comp and y in comp];keys=sorted(comp);keyindex={v:i for i,v in enumerate(keys)};N=len(keys);start=len(positions)
  capweights=collections.defaultdict(float)
  for key in keys:
   for j,w in zip(js[lookup[key]],ws[lookup[key]]):capweights[j]+=w/N
  # Each crop component is closed independently (Jiji has a small hair island).
  for ring in range(rings):
   t=ring/(rings-1)
   for key in keys:
    i=lookup[key];top=np.array(ps[i]);v=top.copy();dx=top[0]-anchor[0];dz=top[2]-anchor[2];angle=math.atan2(dz,dx);target=np.array([anchor[0]+.034*math.cos(angle),base_y,anchor[2]+.035*math.sin(angle)])
    if ci:target=np.mean([ps[lookup[k]] for k in keys],axis=0)
    v=(1-t)*top+t*target;positions.append(v.tolist());tex.append(uv[i]);hair_cap=ci>0 or (Path(source).stem.startswith('jiji') and (abs(top[2]-anchor[2])>.044 or top[0]<anchor[0]-.02));vertex_colors.append(skin_color(top) if not hair_cap else [float(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4) for c in colors[i]]+[1.]);normal=np.array([math.cos(angle),0,math.sin(angle)])
    normals.append(normal.tolist())
    wd=collections.defaultdict(float)
    for j,w in zip(js[i],ws[i]):wd[j]+=w*(1-t)
    if ci==0:wd[ni]+=.65*t;wd[si]+=.35*t
    else:
     for j,w in capweights.items():wd[j]+=w*t
    sorted_w=sorted(wd.items(),key=lambda x:-x[1])[:4];total=sum(w for j,w in sorted_w);joints.append([j for j,w in sorted_w]+[0]*(4-len(sorted_w)));weights.append([w/total for j,w in sorted_w]+[0]*(4-len(sorted_w)))
    if ring==0:rim_pairs.append((i,len(positions)-1))
  # Use original triangle winding to ensure new faces oppose each cut edge.
  origids=[x[0] for x in array(d,b,p['indices'])];direction={}
  for k in range(0,len(origids),3):
   tri=[tuple(round(x,6) for x in ps[i]) for i in origids[k:k+3]]
   for x,y in zip(tri,tri[1:]+tri[:1]):direction[(x,y)]=True
  for x,y in ce:
   if (x,y) in direction:x,y=y,x
   ix,iy=keyindex[x],keyindex[y]
   for r in range(rings-1):
    q=start+r*N;indices.extend([q+ix,q+iy,q+N+iy,q+ix,q+N+iy,q+N+ix])
  center=len(positions);positions.append([float(anchor[0]),base_y,float(anchor[2])] if ci==0 else np.mean([ps[lookup[k]] for k in keys],axis=0).tolist());normals.append([0,-1,0]);tex.append(uv[lookup[keys[0]]]);joints.append([ni,si,0,0]);weights.append([.65,.35,0,0]);vertex_colors.append(skin_color(np.array(positions[-1])))
  if ci:
   cw=sorted(capweights.items(),key=lambda x:-x[1])[:4];total=sum(w for j,w in cw);joints[-1]=[j for j,w in cw]+[0]*(4-len(cw));weights[-1]=[w/total for j,w in cw]+[0]*(4-len(cw))
  for x,y in ce:
   if (x,y) in direction:x,y=y,x
   indices.extend([start+(rings-1)*N+keyindex[y],start+(rings-1)*N+keyindex[x],center])
 def add(values,typ,component=5126):
  vals=np.asarray(values,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(vals.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':vals.nbytes});ai=len(d['accessors']);ac={'bufferView':vi,'componentType':component,'count':len(values),'type':typ}
  if typ=='VEC3':ac.update(min=vals.min(0).tolist(),max=vals.max(0).tolist())
  d['accessors'].append(ac);return ai
 attrs={k:add(v,t,c) for k,v,t,c in [('POSITION',positions,'VEC3',5126),('NORMAL',normals,'VEC3',5126),('TEXCOORD_0',tex,'VEC2',5126),('JOINTS_0',joints,'VEC4',5123),('WEIGHTS_0',weights,'VEC4',5126),('COLOR_0',vertex_colors,'VEC4',5126)]}
 # Obsolete cylinder is not an anatomical bridge and intersects new skin.
 newmat=len(d['materials']);d['materials'].append({'name':'Reconstructed_neck_skin','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'roughnessFactor':.72,'metallicFactor':0},'doubleSided':False})
 head['primitives']=[p,{'attributes':attrs,'indices':add(indices,'SCALAR',5125),'material':newmat,'extras':{'repair':'closed-neck-attachment-v1'}}]
 # LX's semantic crop retained a narrow strip of black hoodie texels at the
 # back-neck rim. Replace only that neck-edge band material, never face pixels.
 if Path(source).stem.startswith('lx'):
  rim=np.array([ps[lookup[k]] for k in components[0]]);dist=np.min(np.sum((pp[:,None,:]-rim[None,:,:])**2,axis=2),axis=1)**.5
  band=(dist<.009)&(pp[:,1]<anchor[1]+.108)
  original_indices=[v[0] for v in array(d,b,p['indices'])];kept=[];repair_ids=[]
  for k in range(0,len(original_indices),3):
   tri=original_indices[k:k+3]
   (repair_ids if any(band[i] for i in tri) else kept).extend(tri)
  band_colors=[]
  for i,position in enumerate(pp):
   blend=max(0.,min(1.,(dist[i]-.005)/.007));orig=[float(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4) for c in colors[i]]+[1.];skin=skin_color(position)
   band_colors.append([(1-blend)*c+blend*o for c,o in zip(skin,orig)])
  ba=dict(a);ba.pop('TEXCOORD_0',None);ba['COLOR_0']=add(band_colors,'VEC4');band_normals=[]
  for i,position in enumerate(pp):
   radial=np.array([position[0]-anchor[0],0,position[2]-anchor[2]]);radial/=max(1e-8,np.linalg.norm(radial));blend=max(0.,min(1.,(dist[i]-.005)/.007));normal=(1-blend)*radial+blend*np.array(ns[i]);normal/=max(1e-8,np.linalg.norm(normal));band_normals.append(normal.tolist())
  ba['NORMAL']=add(band_normals,'VEC3');p['indices']=add(kept,'SCALAR',5125)
  head['primitives'].append({'attributes':ba,'indices':add(repair_ids,'SCALAR',5125),'material':newmat,'extras':{'repair':'neck-rim-garment-residue-only'}})

 d['buffers'][0]['byteLength']=len(binary);d.setdefault('extras',{})['neckAttachment']={'version':1,'boundaryVertices':sum(map(len,components)),'rings':rings,'baseY':base_y,'originalFaceAndOutfitBytesPreserved':True}
 jb=json.dumps(d,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary.extend(b'\0'*(-len(binary)%4));payload=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<II',len(jb),JSON_CHUNK)+jb+struct.pack('<II',len(binary),BIN_CHUNK)+binary
 dest=Path(dest);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(payload);dd,bb,_=read_glb(dest);validate(dd,bb)
 assert bb[:len(b)]==b,'Existing geometry/textures/animations changed'
 assert dd['animations']==original['animations'] and dd['skins']==original['skins']
 for i,k in rim_pairs:
  assert tuple(positions[k])==ps[i] and tuple(tex[k])==uv[i]
  # Original donor has only Head/Neck influences; exact copy at sewn edge.
  assert all(abs(dict(zip(joints[k],weights[k])).get(j,0)-w)<1e-6 for j,w in zip(js[i],ws[i]) if w)
 result=check(dest);result.update(added_vertices=len(positions),added_triangles=len(indices)//3,original_bytes_preserved=True,closed_boundary_components=[len(c) for c in components],base_y=base_y)
 print(json.dumps(result));return result
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('source');ap.add_argument('destination');args=ap.parse_args();repair(args.source,args.destination)
