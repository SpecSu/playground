"""Reviewed LX source-specific garment mask; inspect before using on another donor."""
import bpy,sys,json,argparse,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent));from head_transfer import crop_mesh
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True);args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()));o=next(o for o in bpy.context.scene.objects if o.type=='MESH');m=o.data;m.calc_loop_triangles();img=next(n.image for n in m.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.name.startswith('Color'));w,h=img.size;px=np.empty(w*h*4,dtype=np.float32);img.pixels.foreach_get(px);px=px.reshape(h,w,4);uv=m.uv_layers.active;colors={}
for l in m.loops:
 u,v=uv.data[l.index].uv;colors.setdefault(l.vertex_index,[]).append(px[min(h-1,max(0,int(v*h))),min(w-1,max(0,int(u*w))),:3])
keep=set()
for v in m.vertices:
 p=o.matrix_world@v.co;r,g,b=np.mean(colors[v.index],axis=0);skin=r>g*1.04 and r>b*1.05 and r>.08
 neck=((p.x-.02)/.15)**2+(p.y/.125)**2<1
 if p.z>-.19 and (p.z>.06 or skin or neck):keep.add(v.index)
crop_mesh(o,lambda f:sum(v.index in keep for v in f.verts)>=len(f.verts)/2)

# Remove tiny disconnected garment islands left by semantic neck mask.
m=o.data;parent=list(range(len(m.vertices)))
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
coordinates={}
for v in m.vertices:
 key=tuple(round(x,5) for x in v.co)
 if key in coordinates:parent[find(v.index)]=find(coordinates[key])
 else:coordinates[key]=v.index
for e in m.edges:parent[find(e.vertices[0])]=find(e.vertices[1])
counts={}
for v in m.vertices:counts[find(v.index)]=counts.get(find(v.index),0)+1
kept={v.index for v in m.vertices if counts[find(v.index)]>=500}
crop_mesh(o,lambda face:all(v.index in kept for v in face.verts))

bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.gltf(filepath=str(Path(args.output).resolve()),export_format='GLB',use_selection=True,export_animations=False,export_skins=False)
print('CLEANHEAD',len(o.data.vertices))
