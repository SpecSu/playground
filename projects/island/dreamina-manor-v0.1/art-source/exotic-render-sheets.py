import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
folder=Path(__file__).resolve().parents[2]/'manor-next-content-20261024/exotic-evidence'
names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['shape-sheet','growth-gold-sheet']
for name in names:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=str(folder/(name+'.glb')));meta=json.loads((folder/(name+'.json')).read_text())
 for ref in meta.get('references',[]):
  before=set(bpy.context.scene.objects)
  bpy.ops.import_scene.gltf(filepath=str(Path(__file__).resolve().parents[1]/'public/assets/avatars/cast-v1/milk-frog.glb'))
  added=set(bpy.context.scene.objects)-before
  bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();verts=[]
  for obj in [o for o in added if o.type=='MESH' and o.visible_get()]:
   evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh();verts.extend(evaluated.matrix_world@v.co for v in mesh.vertices);evaluated.to_mesh_clear()
  lo=Vector(tuple(min(v[i] for v in verts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in verts) for i in range(3)))
  s=1.8/(hi.z-lo.z);group=bpy.data.objects.new('1.8m character reference',None);bpy.context.collection.objects.link(group)
  for o in added:
   if o.parent not in added:o.parent=group
  group.scale=(s,s,s);group.location=(ref['x']-(lo.x+hi.x)*s/2,0,ref['y']-lo.z*s)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.world.color=(.65,.65,.65)
 lighting=[((-7,-8,10),1300,8),((8,-4,6),950,7)] if name!='same-scale' else [((-10,-14,27),3800,18),((10,-10,10),2400,15)]
 for loc,energy,size in lighting:
  bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,meta['targetY']))-l.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,2,3),rotation=(math.pi/2,0,0));m=bpy.data.materials.new('review ivory');m.diffuse_color=(.84,.87,.81,1);bpy.context.object.data.materials.append(m)
 if name=='same-scale':
  m.use_nodes=True;n=m.node_tree.nodes;n.clear();e=n.new('ShaderNodeEmission');e.inputs[0].default_value=(.78,.82,.76,1);o=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(e.outputs[0],o.inputs['Surface'])
 ink=bpy.data.materials.new('review ink');ink.diffuse_color=(.08,.16,.12,1)
 if name=='same-scale':
  ink.use_nodes=True;n=ink.node_tree.nodes;n.clear();e=n.new('ShaderNodeEmission');e.inputs[0].default_value=(.035,.065,.045,1);o=n.new('ShaderNodeOutputMaterial');ink.node_tree.links.new(e.outputs[0],o.inputs['Surface'])
 for label in meta['labels']:
  bpy.ops.object.text_add(location=(label['x'],-.02,label['y']),rotation=(math.pi/2,0,0));t=bpy.context.object;t.data.body=label['text'];t.data.align_x='CENTER';t.data.size=.19 if name=='same-scale' else .15;t.data.extrude=0;t.data.materials.append(ink)
 bpy.ops.object.camera_add(location=(0,-25,meta['targetY']));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=max(meta['width'],meta['height']);cam.rotation_euler=(Vector((0,0,meta['targetY']))-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.resolution_x=2000;scene.render.resolution_y=round(2000*meta['height']/meta['width']);scene.render.resolution_percentage=100;scene.render.filepath=str(folder/(name+'.png'));bpy.ops.render.render(write_still=True);print('RENDERED_SHEET',name,flush=True)
