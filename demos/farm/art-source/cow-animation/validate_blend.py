import bpy,json
from pathlib import Path
p=str(Path(__file__).resolve().parent)+'/'
bpy.ops.wm.open_mainfile(filepath=p+'cow-animated.blend');o=bpy.data.objects['Cow_Connected_Hide'];adj=[set()for v in o.data.vertices]
for e in o.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
seen=set();sizes=[]
for i in range(len(adj)):
 if i in seen:continue
 todo=[i];seen.add(i);size=0
 while todo:
  a=todo.pop();size+=1
  for b in adj[a]:
   if b not in seen:seen.add(b);todo.append(b)
 sizes.append(size)
import bmesh
bm=bmesh.new();bm.from_mesh(o.data)
report={'connected_hide_components':len(sizes),'component_vertex_counts':sizes,'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_edges for v in bm.verts),'white_hide_min_y':min(v.co.z for v in o.data.vertices),'all_meshes_have_armature_modifier':all(any(m.type=='ARMATURE' for m in x.modifiers)for x in bpy.data.objects if x.type=='MESH')}
assert len(sizes)==1 and report['nonmanifold_edges']==0 and report['all_meshes_have_armature_modifier'];open(p+'topology-report.json','w').write(json.dumps(report,indent=2));print('COW_TOPOLOGY',json.dumps(report))
