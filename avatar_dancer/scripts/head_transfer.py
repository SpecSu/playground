#!/usr/bin/env python3
"""Private head-transfer prototype. NOT an identity repair certification.

Target must have mixamorig:Head/Neck. Donor may be static; crop bounds are
explicitly reviewed parameters, never inferred from a photo. Atlas islands keep
orientation; no AI image synthesis or face-shape warping is performed.
"""
import argparse,json,math,sys
from pathlib import Path


def neck_weights(z,cut,blend):
    t=max(0.,min(1.,(z-cut)/blend));t=t*t*(3-2*t)
    return t,1-t


def target_head_mask(z,head_weight,neck_weight,cut):
    return z>=cut and head_weight>=.5


def pack_rectangles(rects,size,padding):
    order=sorted(range(len(rects)),key=lambda i:rects[i][1],reverse=True)
    def attempt(gain):
        result=[None]*len(rects);x=y=row=0
        for i in order:
            w=max(1,math.ceil(rects[i][0]*gain))+2*padding;h=max(1,math.ceil(rects[i][1]*gain))+2*padding
            if w>size or h>size:return None
            if x+w>size:x=0;y+=row;row=0
            if y+h>size:return None
            result[i]=(x,y,w,h);x+=w;row=max(row,h)
        return result
    low,high=0.,size/max(max(r) for r in rects)
    for _ in range(40):
        mid=(low+high)/2
        if attempt(mid) is None:high=mid
        else:low=mid
    result=attempt(low)
    if result is None:raise ValueError('Atlas too small for island margins')
    return result,low


def crop_mesh(obj,keep_face):
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
    remove=[face for face in bm.faces if not keep_face(face)]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(obj.data);bm.free();obj.data.update()


def repack_atlas(obj,size,output_directory):
    """Preserve UV-island orientation and bilinearly resample original texels."""
    import bpy,numpy as np
    mesh=obj.data;uv=mesh.uv_layers.active
    if uv is None:raise ValueError('Donor needs UVs')
    if len([m for m in mesh.materials if m])!=1:raise ValueError('Prototype supports one donor atlas/material')
    original=np.asarray([tuple(loop.uv) for loop in uv.data],dtype=np.float64)
    parent=list(range(len(mesh.polygons)))
    def find(a):
        while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
        return a
    seen={}
    for face in mesh.polygons:
        for li in face.loop_indices:
            vi=mesh.loops[li].vertex_index;p=mesh.vertices[vi].co
            key=tuple(round(float(x),6) for x in (*p,*original[li]))
            if key in seen:parent[find(face.index)]=find(seen[key])
            else:seen[key]=face.index
    islands={}
    for face in mesh.polygons:islands.setdefault(find(face.index),[]).append(face.index)
    groups=list(islands.values());bounds=[]
    for faces in groups:
        ids=[li for fi in faces for li in mesh.polygons[fi].loop_indices];coords=original[ids]
        bounds.append((coords.min(0),coords.max(0),ids))
    positions,gain=pack_rectangles([(float(hi[0]-lo[0]),float(hi[1]-lo[1])) for lo,hi,_ in bounds],size,4)
    for (lo,hi,ids),(x,y,w,h) in zip(bounds,positions):
        for li in ids:uv.data[li].uv=((original[li]-lo)*gain+np.array([x+4,y+4]))/size
    packed=np.asarray([tuple(loop.uv) for loop in uv.data],dtype=np.float64)
    mesh.calc_loop_triangles()
    # Destination coverage with source UV coordinates is shared by color/normal/ORM.
    sx=np.zeros((size,size),dtype=np.float32);sy=np.zeros_like(sx);mask=np.zeros((size,size),dtype=bool)
    for tri in mesh.loop_triangles:
        ids=list(tri.loops);p=packed[ids]*size;q=original[ids]
        x0=max(0,int(math.floor(p[:,0].min())));x1=min(size,int(math.ceil(p[:,0].max())))
        y0=max(0,int(math.floor(p[:,1].min())));y1=min(size,int(math.ceil(p[:,1].max())))
        if x1<=x0 or y1<=y0:continue
        yy,xx=np.mgrid[y0:y1,x0:x1];xx=xx+.5;yy=yy+.5
        den=(p[1,1]-p[2,1])*(p[0,0]-p[2,0])+(p[2,0]-p[1,0])*(p[0,1]-p[2,1])
        if abs(den)<1e-12:continue
        a=((p[1,1]-p[2,1])*(xx-p[2,0])+(p[2,0]-p[1,0])*(yy-p[2,1]))/den
        b=((p[2,1]-p[0,1])*(xx-p[2,0])+(p[0,0]-p[2,0])*(yy-p[2,1]))/den;c=1-a-b
        inside=(a>=-1e-6)&(b>=-1e-6)&(c>=-1e-6)
        su=a*q[0,0]+b*q[1,0]+c*q[2,0];sv=a*q[0,1]+b*q[1,1]+c*q[2,1]
        sx[y0:y1,x0:x1][inside]=su[inside];sy[y0:y1,x0:x1][inside]=sv[inside];mask[y0:y1,x0:x1]|=inside
    material=mesh.materials[0].copy();material.name='Shared donor head compact atlas';mesh.materials[0]=material
    textures=[]
    for node in material.node_tree.nodes:
        if node.type!='TEX_IMAGE' or not node.image:continue
        source=node.image;sw,sh=source.size;pixels=np.empty(sw*sh*4,dtype=np.float32);source.pixels.foreach_get(pixels);pixels=pixels.reshape(sh,sw,4)
        u=np.clip(sx*sw-.5,0,sw-1);v=np.clip(sy*sh-.5,0,sh-1);x=np.floor(u).astype(int);y=np.floor(v).astype(int);x2=np.minimum(x+1,sw-1);y2=np.minimum(y+1,sh-1);fx=(u-x)[...,None];fy=(v-y)[...,None]
        sampled=(pixels[y,x]*(1-fx)+pixels[y,x2]*fx)*(1-fy)+(pixels[y2,x]*(1-fx)+pixels[y2,x2]*fx)*fy
        dest=np.zeros((size,size,4),dtype=np.float32);dest[mask]=sampled[mask];filled=mask.copy()
        for _ in range(4):
            before=filled.copy()
            for axis,shift in [(0,1),(0,-1),(1,1),(1,-1)]:
                available=np.roll(before,shift,axis=axis)&~filled
                if axis==0:available[0 if shift==1 else -1,:]=False
                else:available[:,0 if shift==1 else -1]=False
                neighbor=np.roll(dest,shift,axis=axis);dest[available]=neighbor[available];filled|=available
        dest[:,:,3]=1
        image=bpy.data.images.new('HEAD_'+source.name,width=size,height=size,alpha=True);image.colorspace_settings.name=source.colorspace_settings.name;image.pixels.foreach_set(dest.ravel());image.file_format='PNG';image.filepath_raw=str(output_directory/(image.name+'.png'));image.save();image.pack();node.image=image
        textures.append({'source':source.name,'source_size':[sw,sh],'atlas_size':[size,size],'colorspace':source.colorspace_settings.name,'texel_scale_ratio':gain/max(sw,sh)})
    return {'islands':len(groups),'atlas_size':size,'pixels_per_source_uv':gain,'rotation':False,'textures':textures,'estimated_rgba_mip_mib':len(textures)*size*size*4*4/3/1048576}


def main():
    import bpy
    from mathutils import Vector,Matrix
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--target',required=True);parser.add_argument('--donor',required=True);parser.add_argument('--output',required=True);parser.add_argument('--atlas-size',type=int,default=1536);parser.add_argument('--donor-cut-fraction',type=float,default=.70);parser.add_argument('--donor-half-width',type=float,default=.30);parser.add_argument('--donor-yaw',type=float,default=0);parser.add_argument('--test-rigged-donor',action='store_true');parser.add_argument('--export-static-donor')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);target=Path(args.target).resolve();donor=Path(args.donor).resolve();output=Path(args.output).resolve()
    if output in [target,donor]:raise ValueError('Never overwrite input assets')
    output.parent.mkdir(parents=True,exist_ok=True);textures=output.parent/(output.stem+'-head-atlas');textures.mkdir(exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(target))
    arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.vertex_groups)>0)
    arm.data.pose_position='REST';bpy.context.view_layer.update();names={g.index:g.name for g in body.vertex_groups}
    headbone=arm.data.bones['mixamorig:Head'];neckbone=arm.data.bones['mixamorig:Neck'];head_anchor=arm.matrix_world@headbone.head_local;neck_anchor=arm.matrix_world@neckbone.head_local;cut=head_anchor.z-.003
    selected=set();target_points=[]
    for vertex in body.data.vertices:
        weights={names[g.group]:g.weight for g in vertex.groups};p=body.matrix_world@vertex.co
        if target_head_mask(p.z,weights.get('mixamorig:Head',0),weights.get('mixamorig:Neck',0),cut):selected.add(vertex.index);target_points.append(p)
    if not target_points:raise ValueError('Target head mask is empty')
    top=max(p.z for p in target_points);target_center=Vector(((min(p.x for p in target_points)+max(p.x for p in target_points))/2,(min(p.y for p in target_points)+max(p.y for p in target_points))/2,cut))
    target_vertices_before=len(body.data.vertices);crop_mesh(body,lambda face:sum(v.index in selected for v in face.verts)<len(face.verts)/2)
    old_objects=set(bpy.context.scene.objects);old_actions=set(bpy.data.actions);bpy.ops.import_scene.gltf(filepath=str(donor));donor_objects=set(bpy.context.scene.objects)-old_objects;donor_arms=[o for o in donor_objects if o.type=='ARMATURE']
    for a in donor_arms:a.data.pose_position='REST'
    bpy.context.view_layer.update();source=next(o for o in donor_objects if o.type=='MESH' and not all(c.hide_render for c in o.users_collection))
    source_points=[source.matrix_world@v.co for v in source.data.vertices];donor_bottom=min(p.z for p in source_points);donor_height=max(p.z for p in source_points)-donor_bottom
    keep=set()
    if args.test_rigged_donor:
        if not donor_arms:raise ValueError('Test rigged donor flag needs rigged donor')
        da=donor_arms[0];dh=da.matrix_world@da.data.bones['mixamorig:Head'].head_local;dn=da.matrix_world@da.data.bones['mixamorig:Neck'].head_local;donor_cut=dh.z-.003;dn_names={g.index:g.name for g in source.vertex_groups}
        for vertex,p in zip(source.data.vertices,source_points):
            weights={dn_names[g.group]:g.weight for g in vertex.groups}
            if target_head_mask(p.z,weights.get('mixamorig:Head',0),weights.get('mixamorig:Neck',0),donor_cut):keep.add(vertex.index)
    else:
        donor_cut=donor_bottom+args.donor_cut_fraction*donor_height;center_y=(min(p.y for p in source_points)+max(p.y for p in source_points))/2
        keep={v.index for v,p in zip(source.data.vertices,source_points) if p.z>=donor_cut and abs(p.y-center_y)<=args.donor_half_width*donor_height}
    head=source.copy();head.data=source.data.copy();head.name='DONOR_HEAD_PRIVATE_TEST';bpy.context.scene.collection.objects.link(head);head.parent=None;head.matrix_world=source.matrix_world.copy();head.modifiers.clear();head.vertex_groups.clear();crop_mesh(head,lambda face:sum(v.index in keep for v in face.verts)>=len(face.verts)/2)
    if len(head.data.vertices)<50:raise ValueError('Donor selection too small; review boundary')
    hpoints=[head.matrix_world@v.co for v in head.data.vertices];donor_top=max(p.z for p in hpoints);donor_center=Vector(((min(p.x for p in hpoints)+max(p.x for p in hpoints))/2,(min(p.y for p in hpoints)+max(p.y for p in hpoints))/2,donor_cut));scale=(top-cut)/(donor_top-donor_cut);rotation=Matrix.Rotation(math.radians(args.donor_yaw),3,'Z')
    for vertex,p in zip(head.data.vertices,hpoints):vertex.co=target_center+rotation@(p-donor_center)*scale
    head.matrix_world=Matrix.Identity(4)
    for obj in donor_objects:bpy.data.objects.remove(obj,do_unlink=True)
    for action in set(bpy.data.actions)-old_actions:bpy.data.actions.remove(action)
    source_images=[n.image for m in head.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
    if source_images and all(max(image.size)<=args.atlas_size for image in source_images):
        atlas={'reuse_small_source_atlas':True,'textures':[{'source':image.name,'atlas_size':list(image.size),'texel_scale_ratio':1} for image in source_images],'estimated_rgba_mip_mib':sum(image.size[0]*image.size[1]*4*4/3/1048576 for image in source_images)}
    else:
        atlas=repack_atlas(head,args.atlas_size,textures)
        if any(t['texel_scale_ratio']<1 for t in atlas['textures']):raise ValueError('Atlas would downsample source texels; increase --atlas-size')
    if args.export_static_donor:
        bpy.ops.object.select_all(action='DESELECT');head.select_set(True);bpy.context.view_layer.objects.active=head
        bpy.ops.export_scene.gltf(filepath=str(Path(args.export_static_donor).resolve()),export_format='GLB',use_selection=True,export_animations=False,export_skins=False)
    head_group=head.vertex_groups.new(name='mixamorig:Head');neck_group=head.vertex_groups.new(name='mixamorig:Neck');blend=min(.03,(top-cut)*.20)
    for vertex in head.data.vertices:
        hw,nw=neck_weights(vertex.co.z,cut,blend)
        if hw:head_group.add([vertex.index],hw,'REPLACE')
        if nw:neck_group.add([vertex.index],nw,'REPLACE')
    head.parent=arm;head.matrix_parent_inverse=arm.matrix_world.inverted();modifier=head.modifiers.new('Target head skin','ARMATURE');modifier.object=arm
    arm.data.pose_position='POSE';bpy.ops.object.select_all(action='DESELECT')
    for obj in [arm,body,head]:obj.select_set(True)
    bpy.context.view_layer.objects.active=arm;bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_all_influences=False)
    report={'status':'PRIVATE PIPELINE TEST; NOT identity repair approval','target':str(target),'donor':str(donor),'output':str(output),'target_neck_cut_z':cut,'target_head_top':top,'target_removed_vertices':target_vertices_before-len(body.data.vertices),'donor_cut_z':donor_cut,'donor_head_vertices':len(head.data.vertices),'donor_uniform_scale':scale,'donor_yaw_degrees':args.donor_yaw,'head_center_translation':list(target_center),'head_neck_blend_height':blend,'atlas':atlas,'limitations':['LX short-hair test only; Jiji long hair requires explicit boundary review.','No seam welding; high collar is expected to hide reviewed neck boundary.','Donor jaw/face geometry is uniformly scaled, never face-warped.']}
    output.with_suffix('.head-transfer.json').write_text(json.dumps(report,indent=2)+'\n');print('HEAD_TRANSFER_TEST_COMPLETE',output)

if __name__=='__main__':main()
