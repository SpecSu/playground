#!/usr/bin/env python3
"""Private 3D original-photo material projection experiment; NOT a likeness guarantee.
No source-photo editing, image generation, billboard, remote calls, or web export.
"""
import argparse,json,math,sys
from pathlib import Path
import numpy as np


def smoothstep(lo,hi,x):
    t=max(0.,min(1.,(x-lo)/(hi-lo)));return t*t*(3-2*t)


def sculpt_head(point,head_weight):
    x,y,z=map(float,point)
    if head_weight<.5 or z<.817:return x,y,z
    front=smoothstep(-.015,.045,x);jaw=math.exp(-((z-.852)/.024)**2)
    # Bounded 12% lower-cheek/jaw broadening; retain authored front/back depth.
    y=.001+(y-.001)*(1+.22*jaw*front*smoothstep(.5,.8,head_weight))
    if z>.94:
        crown=min(1.,(z-.94)/.06);y*=1-.18*crown;x=.02+(x-.02)*(1-.10*crown);z=.94+(z-.94)*.65
    return x,y,z


FRAME_PATHS=[[(175,228),(187,219),(236,220),(251,230),(247,252),(236,263),(192,263),(178,251)],[(267,230),(279,221),(324,222),(338,232),(335,253),(323,263),(279,264),(267,253)]]
def frame_nearest_screen(x,y):
    best=(x,y);distance=1e6
    for path in FRAME_PATHS+[[ (251,232),(267,232) ]]:
        for (ax,ay),(bx,by) in zip(path,path[1:]+path[:1]):
            dx,dy=bx-ax,by-ay;t=max(0.,min(1.,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));px=ax+t*dx;py=ay+t*dy;d=math.hypot(x-px,y-py)
            if d<distance:distance=d;best=(px,py)
    return best[0],best[1],distance

def frame_mask_screen(x,y,depth):
    if depth<.065 or y<210 or y>272:return 0.
    distance=1e6
    for path in FRAME_PATHS:
        for (ax,ay),(bx,by) in zip(path,path[1:]+path[:1]):
            dx,dy=bx-ax,by-ay;t=max(0.,min(1.,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)))
            distance=min(distance,math.hypot(x-ax-t*dx,y-ay-t*dy))
    # Bridge is solid, but the lens interiors must never be painted black.
    if 250<x<269 and 226<y<237:distance=min(distance,abs(y-232))
    return (1-smoothstep(2.5,6.0,distance))*smoothstep(.065,.085,depth)

def photo_silhouette(x,y):
    # Explicit subject outline excludes source hoodie and room background.
    rows=[(285,350,55),(350,350,150),(450,350,172),(540,350,164),(620,355,161),(700,355,143),(770,355,116),(820,355,87),(850,355,49),(868,355,0)]
    if y<=rows[0][0] or y>=rows[-1][0]:return 0.
    for (ya,ca,wa),(yb,cb,wb) in zip(rows,rows[1:]):
        if ya<=y<=yb:
            t=(y-ya)/(yb-ya);center=ca+(cb-ca)*t;width=wa+(wb-wa)*t
            return smoothstep(5,23,min(x-(center-width),(center+width)-x,y-285,868-y))
    return 0.


def fit_tps(points,targets,regularization=1e-5):
    points=np.asarray(points,dtype=float);targets=np.asarray(targets,dtype=float)
    diff=points[:,None,:]-points[None,:,:];r2=np.sum(diff*diff,axis=-1);kernel=r2*np.log(r2+1e-12)
    n=len(points);poly=np.column_stack((np.ones(n),points));matrix=np.block([[kernel+regularization*np.eye(n),poly],[poly.T,np.zeros((3,3))]])
    coef=np.linalg.solve(matrix,np.vstack((targets,np.zeros((3,2)))))
    return points,coef


def evaluate_tps(model,points):
    control,coef=model;points=np.asarray(points,dtype=float);diff=points[:,None,:]-control[None,:,:];r2=np.sum(diff*diff,axis=-1);kernel=r2*np.log(r2+1e-12)
    return np.column_stack((kernel,np.ones(len(points)),points))@coef


# Manually reviewed visible image-space correspondences, not identity recognition.
# Current mesh frontal 512px camera: center z=.90, orthographic scale=.26, front +X.
LANDMARKS=[
 ((256,64),(353,290)),((159,145),(185,430)),((351,147),(510,432)),
 ((170,215),(198,570)),((344,214),(505,550)),
 ((218,241),(267,594)),((297,241),(418,590)),
 ((257,256),(349,618)),((257,291),(355,689)),((244,295),(328,700)),((272,295),(383,699)),
 ((258,328),(357,771)),((238,325),(315,763)),((278,325),(399,763)),((257,375),(358,849)),
 ((180,289),(215,698)),((334,289),(492,691)),((204,344),(247,811)),((312,344),(467,807)),
 ((166,264),(196,632)),((349,264),(514,617)),
 ((175,225),(190,568)),((214,264),(260,641)),((248,235),(325,573)),
 ((337,224),(505,551)),((303,263),(433,628)),((269,231),(359,568)),
]


def main():
    import bpy
    from mathutils import Vector
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',required=True);parser.add_argument('--photo',required=True);parser.add_argument('--output-dir',required=True);parser.add_argument('--samples',type=int,default=64)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(args.input).resolve();photo_path=Path(args.photo).resolve();out=Path(args.output_dir).resolve();out.mkdir(parents=True,exist_ok=True)
    if 'public' in out.parts:raise ValueError('Private output only; never public')
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(source))
    scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update()
    obj=next(o for o in scene.objects if o.type=='MESH' and len(o.vertex_groups)>0);mesh=obj.data;names={g.index:g.name for g in obj.vertex_groups};matrix=obj.matrix_world.copy();inverse=matrix.inverted();original=[matrix@v.co for v in mesh.vertices]
    head_weights=[sum(g.weight for g in v.groups if names[g.group]=='mixamorig:Head') for v in mesh.vertices]
    modified=0;max_shift=0
    for vertex,point,weight in zip(mesh.vertices,original,head_weights):
        new=Vector(sculpt_head(point,weight))
        px=256+point.y/.26*512;py=256-(point.z-.90)/.26*512;fm=frame_mask_screen(px,py,point.x)
        if fm>.05 and weight>.5:
            line_x,line_y,_=frame_nearest_screen(px,py)
            nx=line_x+(px-line_x)*.50;ny=line_y+(py-line_y)*.50
            new.y+=(nx-px)*.26/512;new.z-=(ny-py)*.26/512
        shift=(new-point).length
        if shift>1e-8:modified+=1;max_shift=max(max_shift,shift)
        vertex.co=inverse@new
    mesh.update();bpy.context.view_layer.update()
    controls=np.asarray([p for p,q in LANDMARKS],dtype=float)/512;targets=np.asarray([q for p,q in LANDMARKS],dtype=float)
    model=fit_tps(controls,targets)
    projected=np.asarray([[256+p.y/.26*512,256-(p.z-.90)/.26*512] for p in original])/512
    image_points=evaluate_tps(model,projected)
    photo=bpy.data.images.load(str(photo_path),check_existing=False);photo.name='PRIVATE_ORIGINAL_LX_DO_NOT_WEB_EXPORT';photo.pack();pw,ph=photo.size
    base_uv=mesh.uv_layers.active.name;uv=mesh.uv_layers.new(name='PRIVATE_PhotoProjection');mask=mesh.color_attributes.new(name='PRIVATE_PhotoBlend',type='FLOAT_COLOR',domain='CORNER')
    for attr_name in ['PRIVATE_HeadRegion','PRIVATE_FrameBlack','PRIVATE_SkinTint','PRIVATE_HairMatte']:
        mesh.color_attributes.new(name=attr_name,type='FLOAT_COLOR',domain='CORNER')
    uv=mesh.uv_layers['PRIVATE_PhotoProjection'];mask=mesh.color_attributes['PRIVATE_PhotoBlend'];head_attr=mesh.color_attributes['PRIVATE_HeadRegion'];frame_attr=mesh.color_attributes['PRIVATE_FrameBlack'];tint_attr=mesh.color_attributes['PRIVATE_SkinTint'];hair_attr=mesh.color_attributes['PRIVATE_HairMatte']
    normal_matrix=matrix.to_3x3();normals=np.asarray([tuple((normal_matrix@v.normal).normalized()) for v in mesh.vertices]);neighbors=[set() for _ in mesh.vertices]
    for edge in mesh.edges:
        a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
    groups={}
    for i,p in enumerate(original):
        if head_weights[i]>.4:groups.setdefault(tuple(round(float(q),5) for q in p),[]).append(i)
    for _ in range(3):
        old=normals.copy()
        for group in groups.values():
            ids=set(group)
            for i in group:ids.update(neighbors[i])
            average=old[list(ids)].mean(0);average/=max(1e-9,np.linalg.norm(average))
            for i in group:normals[i]=average
    color_image=next(n.image for n in mesh.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.name.startswith('Color_'));cw,ch=color_image.size;color_pixels=np.empty(cw*ch*4,dtype=np.float32);color_image.pixels.foreach_get(color_pixels);color_pixels=color_pixels.reshape(ch,cw,4);old_uv=mesh.uv_layers[base_uv]
    counts=0
    for loop in mesh.loops:
        i=loop.vertex_index;x,y=image_points[i];uv.data[loop.index].uv=(float(x/pw),float(1-y/ph));p=original[i];normal=normals[i]
        head_region=smoothstep(.5,.8,head_weights[i])*smoothstep(.815,.838,p.z)
        alpha=head_region*smoothstep(-.15,.60,float(normal[0]))*smoothstep(-.05,.025,p.x)*photo_silhouette(float(x),float(y))
        screen_x=256+p.y/.26*512;screen_y=256-(p.z-.90)/.26*512;_,_,rim_distance=frame_nearest_screen(screen_x,screen_y)
        if p.x>.065 and 212<screen_y<272:alpha*=smoothstep(5,9,rim_distance)
        alpha=max(0.,min(1.,alpha));mask.data[loop.index].color=(1,1,1,alpha)
        head_attr.data[loop.index].color=(1,1,1,head_region)
        px=256+p.y/.26*512;py=256-(p.z-.90)/.26*512;frame_attr.data[loop.index].color=(1,1,1,frame_mask_screen(px,py,p.x)*head_region)
        cu,cv=old_uv.data[loop.index].uv;rgb=color_pixels[min(ch-1,max(0,int(cv*ch))),min(cw-1,max(0,int(cu*cw))),:3]
        skin_tint=head_region*smoothstep(.2,.45,float(rgb[0]))*smoothstep(.01,.10,float(rgb[0]-rgb[1]))*(1-smoothstep(.935,.96,p.z))
        tint_attr.data[loop.index].color=(1,1,1,skin_tint)
        dark=1-smoothstep(.22,.48,float(max(rgb)))
        hair_strength=max(smoothstep(.952,.970,p.z),smoothstep(.932,.952,p.z)*dark)
        if abs(p.y)>.045 and p.x<.035:hair_strength=max(hair_strength,smoothstep(.905,.930,p.z)*dark)
        hair_attr.data[loop.index].color=(1,1,1,head_region*hair_strength)
        if alpha>.5:counts+=1
    del color_pixels
    mesh.uv_layers.active_index=mesh.uv_layers.find(base_uv)
    for layer in mesh.uv_layers:layer.active_render=layer.name==base_uv
    materials=[]
    for index,material in enumerate(list(mesh.materials)):
        if not material or not material.use_nodes:continue
        material=material.copy();material.name='PRIVATE_PHOTO_PROJECTED_'+material.name;mesh.materials[index]=material;nodes=material.node_tree.nodes;links=material.node_tree.links
        shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');image=nodes.new('ShaderNodeTexImage');image.image=photo;image.extension='CLIP';image.interpolation='Linear';mapping=nodes.new('ShaderNodeUVMap');mapping.uv_map='PRIVATE_PhotoProjection';links.new(mapping.outputs['UV'],image.inputs['Vector'])
        blend=nodes.new('ShaderNodeVertexColor');blend.layer_name='PRIVATE_PhotoBlend'
        base_socket=shader.inputs['Base Color'];old_color=base_socket.links[0].from_socket if base_socket.is_linked else None;base_value=tuple(base_socket.default_value)
        head_node=nodes.new('ShaderNodeVertexColor');head_node.layer_name='PRIVATE_HeadRegion';frame_node=nodes.new('ShaderNodeVertexColor');frame_node.layer_name='PRIVATE_FrameBlack';tint_node=nodes.new('ShaderNodeVertexColor');tint_node.layer_name='PRIVATE_SkinTint';hair_node=nodes.new('ShaderNodeVertexColor');hair_node.layer_name='PRIVATE_HairMatte'
        warm=nodes.new('ShaderNodeMixRGB');warm.blend_type='MULTIPLY';warm.inputs[2].default_value=(1,.91,.87,1);links.new(tint_node.outputs['Alpha'],warm.inputs[0]);warm.inputs[1].default_value=base_value
        if old_color:links.new(old_color,warm.inputs[1])
        mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX';links.new(blend.outputs['Alpha'],mix.inputs[0]);links.new(warm.outputs[0],mix.inputs[1])
        links.new(image.outputs['Color'],mix.inputs[2]);frame_mix=nodes.new('ShaderNodeMixRGB');frame_mix.blend_type='MIX';frame_mix.inputs[2].default_value=(.008,.009,.011,1);links.new(frame_node.outputs['Alpha'],frame_mix.inputs[0]);links.new(mix.outputs[0],frame_mix.inputs[1]);hair_mix=nodes.new('ShaderNodeMixRGB');hair_mix.blend_type='MULTIPLY';hair_mix.inputs[2].default_value=(.14,.13,.12,1);links.new(hair_node.outputs['Alpha'],hair_mix.inputs[0]);links.new(frame_mix.outputs[0],hair_mix.inputs[1]);links.new(hair_mix.outputs[0],base_socket)
        inverse_blend=nodes.new('ShaderNodeMath');inverse_blend.operation='SUBTRACT';inverse_blend.inputs[0].default_value=1;links.new(head_node.outputs['Alpha'],inverse_blend.inputs[1])
        def mix_scalar(socket,target):
            old=socket.links[0].from_socket if socket.is_linked else None;value=float(socket.default_value)
            left=nodes.new('ShaderNodeMath');left.operation='MULTIPLY';left.inputs[0].default_value=value
            if old:links.new(old,left.inputs[0])
            links.new(inverse_blend.outputs[0],left.inputs[1]);right=nodes.new('ShaderNodeMath');right.operation='MULTIPLY';right.inputs[1].default_value=target;links.new(head_node.outputs['Alpha'],right.inputs[0]);add=nodes.new('ShaderNodeMath');add.operation='ADD';links.new(left.outputs[0],add.inputs[0]);links.new(right.outputs[0],add.inputs[1]);links.new(add.outputs[0],socket)
        mix_scalar(shader.inputs['Metallic'],0);mix_scalar(shader.inputs['Roughness'],.60)
        old_rough=shader.inputs['Roughness'].links[0].from_socket;hair_rough=nodes.new('ShaderNodeMapRange');hair_rough.inputs['From Min'].default_value=0;hair_rough.inputs['From Max'].default_value=1;hair_rough.inputs['To Min'].default_value=.60;hair_rough.inputs['To Max'].default_value=.90;links.new(hair_node.outputs['Alpha'],hair_rough.inputs['Value'])
        # Restrict .60-.90 roughness to head; body still uses its original ORM.
        head_mix=nodes.new('ShaderNodeMath');head_mix.operation='MAXIMUM';links.new(old_rough,head_mix.inputs[0]);links.new(hair_rough.outputs[0],head_mix.inputs[1]);head_apply=nodes.new('ShaderNodeMix');head_apply.data_type='FLOAT';links.new(head_node.outputs['Alpha'],head_apply.inputs[0]);links.new(old_rough,head_apply.inputs[2]);links.new(head_mix.outputs[0],head_apply.inputs[3]);links.new(head_apply.outputs[0],shader.inputs['Roughness'])
        # Reduce hair-only mirror highlights without changing face/costume specular.
        spec=shader.inputs['Specular IOR Level'];specmix=nodes.new('ShaderNodeMapRange');specmix.inputs['To Min'].default_value=float(spec.default_value);specmix.inputs['To Max'].default_value=.08;links.new(hair_node.outputs['Alpha'],specmix.inputs['Value']);links.new(specmix.outputs[0],spec)
        for n in list(nodes):
            if n.type=='NORMAL_MAP':mix_scalar(n.inputs['Strength'],.35)
        assert mapping.uv_map=='PRIVATE_PhotoProjection' and blend.layer_name=='PRIVATE_PhotoBlend', 'Explicit data layer names required'
        materials.append(material.name)
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False;scene.cycles.max_bounces=5
    scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.49,.52,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.view_settings.view_transform='AgX'
    def at(screen_x,front,z):return Vector((front,screen_x,z))
    def point(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    for name,position,energy,size,color in [('Key',(-1.2,1.7,2),90,1.2,(1,.94,.88)),('Fill',(1.4,1,1.1),45,1.5,(.88,.94,1)),('Rim',(.5,-1.1,1.6),100,1,(1,1,1))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color;light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=at(*position);point(light,(0,0,.65))
    camera=bpy.data.objects.new('SAME_ORTHOGRAPHIC_3D_INSPECTION',bpy.data.cameras.new('SAME_ORTHOGRAPHIC_3D_INSPECTION'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=.26;camera.data.clip_start=.005;camera.data.clip_end=100
    rendered=[]
    for label,angle in [('front',0),('three-quarter-left',45),('three-quarter-right',-45)]:
        radians=math.radians(angle);camera.location=at(math.sin(radians)*3.2,math.cos(radians)*3.2,.91);point(camera,(0,0,.90));scene.render.filepath=str(out/f'lx-original-photo-3D-candidate-{label}.png');bpy.ops.render.render(write_still=True);rendered.append({'view':label,'angle_degrees':angle,'image':scene.render.filepath})
    camera.location=at(0,3.2,.91);point(camera,(0,0,.9));bpy.ops.wm.save_as_mainfile(filepath=str(out/'PRIVATE_lx-original-photo-3D-candidate.blend'))
    report={'status':'PRIVATE EXPERIMENT; NOT accepted identity repair; no web GLB exported','source_mesh':str(source),'private_photo':str(photo_path),'landmarks':LANDMARKS,'geometry':{'original_vertices':len(mesh.vertices),'modified_head_vertices':modified,'max_rest_displacement':max_shift,'depth_x_unchanged':True,'jaw_width_max_factor':1.22,'hair_crown_z_compression':{'above':.94,'factor':.45},'frame_cross_section_scale':.50,'bones':len(arm.data.bones),'animations':len(bpy.data.actions),'all_skin_weights_unchanged':True},'material':{'photo_projection':'Thin-plate-spline UV mapping using manually reviewed frontal visible features','photo_mixed_loop_corners_over_half':counts,'front_metallic':0,'front_roughness':.60,'explicit_source_hoodie_background_exclusion':True,'head_and_hair_metallic_zero':True,'matte_black_rectangularized_existing_glasses':True,'original_normals_strength_at_full_projection':.35,'private_source_photo_packed_in_blend':True,'WEB_EXPORT_FORBIDDEN_UNTIL_HEAD_ATLAS_BAKE_AND_IMAGE_AUDIT':True},'renders':rendered,'limitations':['Single frontal photo cannot recover true profile or hidden surfaces.','Photo contains baked lighting; side texture/depth remains based on existing mesh.','Existing glasses geometry is not reconstructed from the photo and can mismatch photo frames.','No flat billboard: all image samples are material UVs on original depth-bearing skinned mesh.']}
    (out/'candidate-provenance-and-limitations.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print('PRIVATE_CANDIDATE_COMPLETE',out)

if __name__=='__main__':main()
