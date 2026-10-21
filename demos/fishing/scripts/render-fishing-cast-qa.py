"""Render all production QA poses with original PBR textures and true fish ratios.

blender -b -t 8 --python scripts/render-fishing-cast-qa.py -- \
  --input .local-qa/v031/final-visual --views front,side --samples 8
Optional --ids, --stages, --details id,id, --detail-only, --tile-pixels 640.
Sheets use a shared metre scale within each stage/view, never per-avatar scaling.
"""
import bpy, json, pathlib, sys, math, argparse, subprocess
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--input',default='.local-qa/v031/final-visual')
parser.add_argument('--output',default=None)
parser.add_argument('--ids',default='')
parser.add_argument('--stages',default='')
parser.add_argument('--views',default='front,side')
parser.add_argument('--samples',type=int,default=8)
parser.add_argument('--tile-pixels',type=int,default=640)
parser.add_argument('--details',default='')
parser.add_argument('--detail-only',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
root=pathlib.Path(args.input).resolve();out=pathlib.Path(args.output).resolve() if args.output else root/'renders';out.mkdir(parents=True,exist_ok=True)
report=json.loads((root/'poses.json').read_text());poses=report['poses'] if isinstance(report,dict) else report
ids=set(filter(None,args.ids.split(',')));stages=set(filter(None,args.stages.split(',')));details=set(filter(None,args.details.split(',')))
poses=[p for p in poses if (not ids or p['id'] in ids) and (not stages or p['stage'] in stages)]
stage_order=list(dict.fromkeys(p['stage'] for p in poses));views=args.views.split(',')
source_hash=report.get('sourceHashes',{}).get('lib/fishing-avatar.ts','unknown')[:12]
manifest={'sourceHash':source_hash,'nativeScalePreserved':True,'note':'Shared metre scale within each sheet. Detail crops change camera framing only. GLB PBR maps are imported from original preserved binary texture bytes.','images':[]}

def mat(name,color,rough=.5,metal=0,vertex_colors=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 if vertex_colors:
  attr=m.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='source_color'
  mul=m.node_tree.nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;mul.inputs[2].default_value=(*color,1)
  m.node_tree.links.new(attr.outputs['Color'],mul.inputs[1]);m.node_tree.links.new(mul.outputs[0],bs.inputs['Base Color'])
 return m

def add_meshes(parts,parent):
 result=[]
 for part in parts:
  mesh=bpy.data.meshes.new(part['name']);vs=[(v[0],-v[2],v[1]) for v in part['vertices']];ix=part['indices'];mesh.from_pydata(vs,[],[ix[i:i+3] for i in range(0,len(ix),3)]);mesh.update()
  obj=bpy.data.objects.new(part['name'],mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=parent
  colors=part.get('vertexColors')
  if colors:
   attr=mesh.color_attributes.new(name='source_color',type='FLOAT_COLOR',domain='CORNER')
   for loop in mesh.loops:attr.data[loop.index].color=(*colors[loop.vertex_index],1)
  material=mat(part['name'],part.get('color',[1,1,1]),part.get('roughness',.5),part.get('metalness',0),bool(colors));obj.data.materials.append(material)
  for polygon in mesh.polygons:polygon.use_smooth=True
  result.append(obj)
 return result

def bounds(objects):
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();points=[]
 for obj in objects:
  if obj.type!='MESH' or obj.hide_render:continue
  evaluated=obj.evaluated_get(deps)
  points.extend(evaluated.matrix_world@Vector(corner) for corner in evaluated.bound_box)
 if not points:return Vector((-1,-1,0)),Vector((1,1,2))
 return Vector(tuple(min(p[i] for p in points) for i in range(3))),Vector(tuple(max(p[i] for p in points) for i in range(3)))

def text(body,location,size,material,align='CENTER'):
 bpy.ops.object.text_add(location=location,rotation=(math.pi/2,0,0));obj=bpy.context.object;obj.data.body=body;obj.data.align_x=align;obj.data.align_y='CENTER';obj.data.size=size;obj.data.materials.append(material);return obj

def configure_scene():
 bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene
 world=bpy.data.worlds.new('QA studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.78,.83,.9,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7;sc.world=world
 sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=args.samples;sc.cycles.use_denoising=False
 sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGB';sc.render.film_transparent=False
 sc.view_settings.view_transform='AgX';sc.render.resolution_percentage=100
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';sc.camera=cam
 return sc,cam

def annotate(path,title,labels=()):
 payload=json.dumps({'title':title,'labels':list(labels)})
 code="""import sys,json
from PIL import Image,ImageDraw,ImageFont
p=sys.argv[1];d=json.loads(sys.argv[2]);im=Image.open(p).convert('RGB');dr=ImageDraw.Draw(im);f='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';font=ImageFont.truetype(f,max(15,round(im.width/125)));head=ImageFont.truetype(f,max(17,round(im.width/105)));dr.rectangle((0,0,im.width,head.size+14),fill=(242,246,250));dr.text((12,6),d['title'],font=head,fill=(17,44,65));
for item in d['labels']:
 x,y,t=item;box=dr.textbbox((0,0),t,font=font);w=box[2]-box[0];dr.rectangle((x-w/2-7,y-5,x+w/2+7,y+font.size+7),fill=(238,243,248));dr.text((x-w/2,y),t,font=font,fill=(17,44,65))
im.save(p)"""
 subprocess.run(['python','-c',code,str(path),payload],check=True)

def render(sc,cam,path,center,width,height,pixels):
 cam.location=(center[0],-40,center[1]);cam.rotation_euler=(math.pi/2,0,0);cam.data.ortho_scale=max(width,height)
 sc.render.resolution_x=pixels;sc.render.resolution_y=max(300,round(pixels*height/width));sc.render.filepath=str(path)
 bpy.ops.render.render(write_still=True);print('QA_RENDER',path,flush=True)

for stage in stage_order:
 for view in views:
  sc,cam=configure_scene();ink=mat('QA labels',(.035,.075,.105));group=[]
  yaw={'front':0,'side':math.pi/2,'threequarter':math.pi/4}[view]
  for p in [p for p in poses if p['stage']==stage]:
   bpy.ops.object.empty_add();display=bpy.context.object;display.name='qa-display-'+p['id']
   before=set(sc.objects);bpy.ops.import_scene.gltf(filepath=str(root/p['file']));imported=list(set(sc.objects)-before)
   for obj in imported:
    if obj.parent is None:obj.parent=display
   meshes=json.loads((root/p['meshesFile']).read_text());added=add_meshes(meshes.get('rod',[])+meshes.get('fish',[]),display)
   display.rotation_euler.z=yaw;bpy.context.view_layer.update();lo,hi=bounds(imported+added)
   group.append({'pose':p,'display':display,'objects':imported+added,'low':lo,'high':hi})
  if not group:continue
  cols=min(4,len(group));rows=math.ceil(len(group)/cols);tile_w=max(g['high'].x-g['low'].x for g in group)+.55;tile_h=max(g['high'].z-g['low'].z for g in group)+.65
  tile_w=max(tile_w,1.8);tile_h=max(tile_h,2.0)
  for index,g in enumerate(group):
   col=index%cols;row=rows-1-index//cols;cx=(col+.5)*tile_w;bottom=row*tile_h+.36
   g['display'].location=(cx-(g['low'].x+g['high'].x)/2,0,bottom-g['low'].z);g['center']=(cx,bottom+(g['high'].z-g['low'].z)/2)
   g['label']=(cx,row*tile_h+.14,f"{index+1:02d}  {g['pose']['id']}  ({g['pose']['height']:.2f} m)")
  total_w=cols*tile_w;total_h=rows*tile_h+.40
  title=f'FISHING QA | {stage} | {view} | source {source_hash}'
  center=Vector((total_w/2,0,total_h/2))
  for offset,power,size in [((-5,-7,8),1800,10),((7,-4,5),1300,8),((2,5,7),1800,8)]:
   bpy.ops.object.light_add(type='AREA',location=center+Vector(offset));obj=bpy.context.object;obj.data.energy=power*max(1,len(group)/4);obj.data.size=size;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
  if not args.detail_only:
   path=out/f'{stage}-{view}-all{len(group)}.png';render(sc,cam,path,(total_w/2,total_h/2),total_w,total_h,cols*args.tile_pixels)
   annotate(path,title,[(x/total_w*sc.render.resolution_x,(1-y/total_h)*sc.render.resolution_y-9,t) for x,y,t in [g['label'] for g in group]])
   manifest['images'].append({'file':path.name,'stage':stage,'view':view,'ids':[g['pose']['id'] for g in group],'kind':'sheet','sharedMetreScale':True})
  for g in group:
   if g['pose']['id'] not in details:continue
   bpy.context.view_layer.update()
   wrists=g['pose'].get('wrists',{});points=[]
   for p in wrists.values():points.append(g['display'].matrix_world@Vector((p[0],-p[2],p[1])))
   target=sum(points,Vector())/len(points) if points else Vector((g['center'][0],0,g['center'][1]))
   spread=max((abs(p.x-target.x) for p in points),default=.2);width=max(.95,spread*2+.65);height=width*.85
   path=out/f'{g["pose"]["id"]}-{stage}-{view}-contact.png';render(sc,cam,path,(target.x,target.z+.09),width,height,1000)
   annotate(path,f"{g['pose']['id']} | {stage} | {view} | contact crop")
   manifest['images'].append({'file':path.name,'stage':stage,'view':view,'id':g['pose']['id'],'kind':'contact-detail'})
  (out/'render-manifest.json').write_text(json.dumps(manifest,indent=2))
print('QA_COMPLETE',len(manifest['images']),'images',flush=True)
