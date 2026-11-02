#!/usr/bin/env python3
"""Surgical lower-coat arm-weight repair; never overwrites original GLB.
Blender: --python repair_coat_weights.py -- --input SOURCE --output NEW.glb
"""
import sys,json,argparse
from pathlib import Path

def smoothstep(lo,hi,x):
    t=max(0,min(1,(x-lo)/(hi-lo)));return t*t*(3-2*t)

def main():
    import bpy
    from mathutils import Vector
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(args.input).resolve();target=Path(args.output).resolve()
    if source==target:raise ValueError('Must not overwrite source')
    target.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(source))
    arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update()
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.vertex_groups)>0)
    names={g.index:g.name for g in obj.vertex_groups};groups={g.name:g for g in obj.vertex_groups}
    positions=[obj.matrix_world@v.co for v in obj.data.vertices];bottom=min(p.z for p in positions);height=max(p.z for p in positions)-bottom
    capsules=[]
    for bone in arm.data.bones:
        if any(t in bone.name for t in ['Hand','ForeArm']):capsules.append((arm.matrix_world@bone.head_local,arm.matrix_world@bone.tail_local,bone.name))
    def distance_segment(p,a,b):
        d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));return (p-a-t*d).length
    changes=[];protected=0
    for vertex,p in zip(obj.data.vertices,positions):
        z=(p.z-bottom)/height
        if z>=.57:continue
        old={names[g.group]:g.weight for g in vertex.groups}
        arm_names=[n for n in old if any(t in n for t in ['Shoulder','Arm','Hand'])]
        bad=sum(old[n] for n in arm_names)
        if bad<1e-5:continue
        # Real hands and lower sleeves retain their authored influence unchanged.
        nearest=min(distance_segment(p,a,b) for a,b,_ in capsules)/height
        lateral=abs(p.y)/height
        if nearest<.055 and lateral>.175:protected+=1;continue
        capsule_fade=1 if lateral<=.175 else smoothstep(.055,.08,nearest)
        strength=(1-smoothstep(.52,.57,z))*capsule_fade
        if strength<1e-5:continue
        new=dict(old);removed=0
        for name in arm_names:
            delta=old[name]*strength;new[name]-=delta;removed+=delta
        recipients={name:weight for name,weight in old.items() if any(k in name for k in ['Hips','UpLeg','Leg','Foot','ToeBase'])}
        total=sum(recipients.values())
        if total<1e-6:
            # Only a zero-lower-body-weight vertex needs a new nearest thigh influence.
            thighs=[b for b in arm.data.bones if 'UpLeg' in b.name]
            near=min(thighs,key=lambda b:distance_segment(p,arm.matrix_world@b.head_local,arm.matrix_world@b.tail_local))
            recipients={near.name:1};total=1
        for name,weight in recipients.items():new[name]=new.get(name,0)+removed*weight/total
        # Keep glTF's standard 4-influence skin limit, normalized after pruning.
        new=dict(sorted(((n,w) for n,w in new.items() if w>1e-7),key=lambda t:t[1],reverse=True)[:4]);total=sum(new.values());new={n:w/total for n,w in new.items()}
        for group_index in [g.group for g in vertex.groups]:groups[names[group_index]].remove([vertex.index])
        for name,weight in new.items():groups[name].add([vertex.index],weight,'REPLACE')
        changes.append({'vertex':vertex.index,'position':list(p),'old':old,'new':new,'removed_arm_weight':removed,'hand_capsule_distance':nearest,'lateral_fraction':lateral})
    arm.data.pose_position='POSE'
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);obj.select_set(True);bpy.context.view_layer.objects.active=arm
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_all_influences=False)
    report={'source':str(source),'output':str(target),'changed_vertices':len(changes),'protected_hand_forearm_vertices':protected,'mask':'full below normalized z .52, fade to zero .57; protect capsules .055 around rest hand/forearm only lateral |y|>.175, fade in to .08; medial coat fully eligible','redistribution':'Existing hips/thigh/leg/foot influences proportional; nearest thigh only if no lower-body weights. Top4 normalized.','geometry_textures_untouched':True,'changes':changes}
    target.with_suffix('.weight-repair.json').write_text(json.dumps(report,indent=2)+'\n');print('REPAIR_COMPLETE',len(changes),'protected',protected,'OUTPUT',target)
if __name__=='__main__':main()
