"""Asset-specific conservative eyewear thinning; no face removal or head graft.
Run with Blender --factory-startup --python SCRIPT -- --input SOURCE.glb --output PRIVATE.glb.
The fitted ellipse bounds were checked against actual front/45-degree renders of Jiaxin.
"""
import bpy,math,json,sys,argparse
from pathlib import Path
a=argparse.ArgumentParser();a.add_argument("--input",required=True);a.add_argument("--output",required=True);args=a.parse_args(sys.argv[sys.argv.index("--")+1:]);out=Path(args.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
if "public" in out.parts:raise ValueError("Private candidate output only")

for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
o=next(o for o in bpy.context.scene.objects if o.type=='MESH');selected=[]
for v in o.data.vertices:
 x,y,z=v.co;cy=.0235 if y>0 else -.0235;r=math.sqrt(((y-cy)/.0195)**2+((z-.8975)/.0137)**2)
 if x>(.074-.18*abs(y)) and .66<r<1.40 and abs(y)>.0065 and .881<z<.913:
  selected.append(v.index)
  nr=1+(r-1)*.16;v.co.y=cy+(y-cy)*nr/r;v.co.z=.8975+(z-.8975)*nr/r;plane=.078-.22*abs(y);v.co.x=plane+(x-plane)*.20
s=set(selected);m=bpy.data.materials.new('Thin warm titanium glasses');m.diffuse_color=(.075,.060,.047,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.075,.060,.047,1);o.data.materials.append(m);faces=[]
for p in o.data.polygons:
 if all(v in s for v in p.vertices):p.material_index=len(o.data.materials)-1;faces.append(p.index)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS');print(len(selected),len(faces));json.dump({'input':str(Path(args.input).resolve()),'modified_vertices':selected,'retinted_faces':faces,'faces_removed':0,'neck_geometry_unchanged':True,'note':'Asset-specific frame approximation, not identity-equivalent reconstruction.'},open(out.with_suffix('.glasses.json'),'w'))
