"""Independent botanical art source. Blender 4.3; no game state or gameplay logic.
Local Z up authoring -> glTF Y up. Plant root on ground, geometry never normalized.
"""
import bpy, math, json, os, sys
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/world'
EVIDENCE=ROOT.parent/'art-evidence'
MATS={}
STANDARD_HEIGHTS={'radish':1.15,'daisy':.55,'tomato':1.9,'tulip':1.05,'pumpkin':.85,'sunflower':2.6,'dragonfruit':2.25,'iris':1.55,'grape':2.1,'phalaenopsis':1.35}

def srgb(v):
    return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4

def material(name, color, rough=.62, metal=0):
    if name in MATS:return MATS[name]
    m=bpy.data.materials.new(name);m.use_nodes=True
    rgb=tuple(srgb(int(color[i:i+2],16)/255) for i in (1,3,5))
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*rgb,1)
    n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*rgb,1);MATS[name]=m;return m

def reset():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    MATS.clear()
    scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=101;scene.render.fps=25

def empty(name, parent=None,loc=(0,0,0)):
    ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob.location=loc
    if parent:ob.parent=parent
    return ob

def parent(ob,p):
    if p:ob.parent=p
    return ob

def finish(ob,mat,p=None,smooth=True):
    if mat:ob.data.materials.append(mat)
    if smooth and ob.type=='MESH':
        for f in ob.data.polygons:f.use_smooth=True
    parent(ob,p);return ob

def mesh(name,verts,faces,mat,p=None,smooth=True):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    ob=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(ob)
    return finish(ob,mat,p,smooth)

def uv(name,loc,scale,mat,p=None,seg=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=(0,0,0))
    ob=bpy.context.object;ob.name=name;ob.location=loc;ob.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(ob,mat,p)

def curve(name,points,radius,mat,p=None,res=3):
    cv=bpy.data.curves.new(name,'CURVE');cv.dimensions='3D';cv.resolution_u=3;cv.bevel_depth=radius;cv.bevel_resolution=res
    sp=cv.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for a,v in zip(sp.bezier_points,points):a.co=v;a.handle_left_type='AUTO';a.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,cv);bpy.context.collection.objects.link(ob);finish(ob,mat,p)
    return ob

def cube(name,loc,scale,mat,bevel=0,p=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0));ob=bpy.context.object;ob.name=name;ob.location=loc;ob.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=ob.modifiers.new('soft manufactured edge','BEVEL');mod.width=bevel;mod.segments=3
        bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
        no=ob.modifiers.new('weighted corner normals','WEIGHTED_NORMAL');no.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=no.name)
    return finish(ob,mat,p)

def lathe(name,profile,mat,p=None,segments=28,lobes=0,lobe_amp=.0):
    vs=[];fs=[]
    for r,z in profile:
        for i in range(segments):
            a=2*pi*i/segments;rr=r*(1+lobe_amp*cos(lobes*a))
            vs.append((rr*cos(a),rr*sin(a),z))
    for j in range(len(profile)-1):
        for i in range(segments):
            k=j*segments+i;n=j*segments+(i+1)%segments;fs.append((k,n,n+segments,k+segments))
    fs.append(tuple(range(segments-1,-1,-1)));fs.append(tuple((len(profile)-1)*segments+i for i in range(segments)))
    return mesh(name,vs,fs,mat,p)

def leaf(name,length,width,rise,curl,mat,p,base=(0,0,0),angle=0,lobes=0,vein=True,fold=.7):
    """Single continuous thick, curved blade. Pivot is leaf base, not plant origin."""
    g=empty(name,p,base);g.rotation_euler.z=angle
    verts=[];faces=[];nu=14;nv=6
    for i in range(nu+1):
        t=i/nu
        w=width*(sin(pi*t)**.72)*(1+lobes*.24*sin(7*pi*t)**2)
        for j in range(nv+1):
            v=2*j/nv-1
            verts.append((length*t,w*v,rise*t+curl*t*t+.055*sin(pi*t)*v*v-.012*abs(v)))
    for i in range(nu):
        for j in range(nv):
            k=i*(nv+1)+j;faces.append((k,k+1,k+nv+2,k+nv+1))
    ob=mesh(name+' blade',verts,faces,mat,g)
    solid=ob.modifiers.new('leaf volume','SOLIDIFY');solid.thickness=.009
    bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=solid.name)
    if vein:
        vm=material('leaf veins','#71946A',.7)
        curve(name+' midrib',[(length*t,0,rise*t+curl*t*t+.008) for t in (0,.25,.5,.75,1)],.007,vm,g,res=1)
    g['organ']='leaf';g['fold']=fold
    return g

def grow(ob,start,end,minimum=.001,axis=None,fold=0):
    # glTF animation is sampled by true server progress. Fixed root is never scaled.
    orig=ob.scale.copy();rotation=ob.rotation_euler.copy()
    ob['growth_start']=start;ob['growth_end']=end;ob['growth_minimum']=minimum
    for t in (0,start,max(start,(start+end)*.5),end,1):
        f=101 if t==1 else 1+round(t*100)
        q=min(1,max(0,(t-start)/max(.001,end-start)));q=q*q*(3-2*q)
        v=minimum+(1-minimum)*q
        ob.scale=orig.copy()
        if axis is None:ob.scale*=v
        else:ob.scale[axis]*=v
        ob.rotation_euler=rotation.copy();ob.rotation_euler.y+=fold*(1-q)
        ob.keyframe_insert('scale',frame=f);ob.keyframe_insert('rotation_euler',frame=f)
    ob.scale=orig;ob.rotation_euler=rotation

def green_set():
    return [material('foliage deep','#3F7757'),material('foliage mid','#649164'),material('foliage light','#82A46C')]

def radish():
    root=empty('Plant_radish');root['speciesId']='radish';greens=green_set()
    crown=empty('Radish_crown',root,(0,0,.47))
    for t in (0,.15,.525,.9,1):
        q=min(1,max(0,(t-.15)/.75));q=q*q*(3-2*q)
        crown.location.z=.04+.43*q;crown.keyframe_insert('location',frame=1+round(t*100))
    bulb=empty('Organ_radish_bulb',root)
    lathe('rose radish shoulder',[(.018,.005),(.07,.06),(.24,.14),(.33,.28),(.31,.4),(.18,.49),(.06,.51)],material('radish rose','#B85270',.4),bulb)
    lathe('cream root tip',[(.007,-.07),(.018,.005),(.07,.06),(.13,.09)],material('root cream','#E6D6AF'),bulb)
    grow(bulb,.15,.9,minimum=.035)
    for i in range(7):
        a=[0,pi,pi/3,4*pi/3,2*pi/3,5*pi/3,pi/2][i]+.2;le=leaf('Organ_leaf_'+str(i),.54+.11*sin(i*2),.13+.02*cos(i),.62+.12*cos(i*1.7),-.17,greens[i%3],crown,(0,0,0),a,lobes=1)
        grow(le,.02+i*.035,.60+i*.035,minimum=.30 if i<2 else .001,fold=-.65)
    return root

def moving_attachment(name,p,position,start,end,minimum=.1):
    g=empty(name,p)
    for t in (0,start,(start+end)*.5,end,1):
        q=min(1,max(0,(t-start)/max(.001,end-start)));q=q*q*(3-2*q);v=minimum+(1-minimum)*q
        g.location=Vector(position)*v;g.keyframe_insert('location',frame=1+round(t*100))
    return g

def petals(name,p,count,inner,length,width,mat,start=.55,end=.95,fold=-1.15,phase=0):
    # One petal-ring mesh, real closed-to-open shape key; not twelve separate draw calls.
    vs=[];closed=[];fs=[];nu=10;nv=4
    for k in range(count):
        a=phase+k*2*pi/count;ca=cos(a);sa=sin(a);offset=len(vs)
        for i in range(nu+1):
            t=i/nu;w=width*max(0,sin(pi*t))**.48;x=length*t
            for j in range(nv+1):
                y=(2*j/nv-1)*w;z=.025*sin(pi*t)-.035*t*t+.012*(y/max(width,.001))**2
                vs.append(((inner+x)*ca-y*sa,(inner+x)*sa+y*ca,z))
                cx=x*cos(fold)+z*sin(fold);cz=-x*sin(fold)+z*cos(fold)
                closed.append(((inner+cx)*ca-y*sa,(inner+cx)*sa+y*ca,cz))
        for i in range(nu):
            for j in range(nv):
                q=offset+i*(nv+1)+j;fs.append((q,q+1,q+nv+2,q+nv+1))
    ob=mesh(name,vs,fs,mat,p);ob.shape_key_add(name='Basis');key=ob.shape_key_add(name='Petals folded')
    for v,co in zip(key.data,closed):v.co=co
    for t,value in [(0,1),(start,1),((start+end)*.5,.5),(end,0),(1,0)]:key.value=value;key.keyframe_insert('value',frame=1+round(t*100))
    # Paper-thin petals would vanish edge-on; a very small backed surface is part of the asset.
    sol=ob.modifiers.new('soft petal volume','SOLIDIFY');sol.thickness=.008
    # Keep modifier unapplied so Blender can export the morph-compatible base and back faces.
    ob['organ']='petal-ring';return ob

def daisy():
    root=empty('Plant_daisy');root['speciesId']='daisy';greens=green_set()
    for i in range(6):
        le=leaf('Daisy_leaf_'+str(i),.20+.035*sin(i),.065,.06,-.04,greens[i%3],root,angle=i*2*pi/6,lobes=.2,fold=-.65)
        grow(le,.02+i*.025,.45+i*.045,minimum=.60 if i<2 else .001,fold=-.5)
    flowerPositions=[(-.11,.035,.46),(.14,.075,.35),(.035,-.14,.30)]
    for i,pos in enumerate(flowerPositions):
        stem=curve('Daisy_stem_'+str(i),[(0,0,0),(pos[0]*.45,pos[1]*.25,pos[2]*.48),pos],.012,greens[0],root,res=2)
        grow(stem,.12+i*.035,.68+i*.035,minimum=.10)
        head=moving_attachment('Daisy_flower_'+str(i),root,pos,.12+i*.035,.68+i*.035,.10);head.rotation_euler.x=.22+i*.11;head.rotation_euler.y=(-.1+i*.1)
        bloom=empty('Daisy_bloom_'+str(i),head)
        uv('Daisy_green_calyx_'+str(i),(0,0,-.02),(.055,.055,.037),greens[0],bloom,seg=12,rings=6)
        uv('Daisy_gold_center_'+str(i),(0,0,.012),(.048,.048,.028),material('flower center amber','#C99A43',.6),bloom,seg=16,rings=8)
        petals('Daisy_ivory_petals_'+str(i),bloom,12,.036,.082,.028,material('warm ivory petals','#EEE4C7',.62),.51+i*.025,.89+i*.025,phase=i*.3)
        grow(bloom,.38+i*.035,.80+i*.035,minimum=.025)
    return root

def sunflower():
    root=empty('Plant_sunflower');root['speciesId']='sunflower';greens=green_set()
    stem=curve('Sunflower_stem',[(0,0,0),(.02,0,.65),(-.06,.02,1.45),(-.10,.03,2.20)],.033,greens[0],root,res=3)
    grow(stem,.03,.72,minimum=.10,axis=2)
    for i,(height,angle) in enumerate([(.32,.1),(.72,pi+.25),(1.05,-.55),(1.48,pi-.35)]):
        attach=empty('Sunflower_leaf_attachment_'+str(i),root)
        for t in (0,.03,.375,.72,1):
            q=min(1,max(0,(t-.03)/.69));q=q*q*(3-2*q);attach.location=(-.02,0,height*(.1+.9*q));attach.keyframe_insert('location',frame=1+round(t*100))
        le=leaf('Sunflower_leaf_'+str(i),.57-.025*i,.23,.15,-.17,greens[(i+1)%3],attach,angle=angle,lobes=.20)
        grow(le,.02+i*.06,.54+i*.06,minimum=.28 if i<2 else .001,fold=-.75)
    head=empty('Sunflower_head',root);head.rotation_euler.x=1.04;head.rotation_euler.y=-.12
    for t in (0,.03,.375,.72,1):
        q=min(1,max(0,(t-.03)/.69));q=q*q*(3-2*q);head.location=(-.10,.03,2.2*(.1+.9*q));head.keyframe_insert('location',frame=1+round(t*100))
    core=empty('Sunflower_core',head)
    uv('Sunflower_back_calyx',(0,0,-.055),(.26,.26,.09),greens[0],core,seg=24,rings=10)
    uv('Sunflower_seed_disk',(0,0,.015),(.25,.25,.055),material('seed disk umber','#795338',.8),core,seg=28,rings=12)
    seeds=[]
    for ring,count in [(0,1),(.09,8),(.176,14)]:
        for k in range(count):
            a=k*2*pi/count+.32;seeds.append(uv('Seed', (ring*cos(a),ring*sin(a),.065-.018*ring/.176 if ring else .067),(.021,.026,.012),material('raised warm seeds','#A57A46',.8),core,seg=8,rings=5))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in seeds:ob.select_set(True)
    bpy.context.view_layer.objects.active=seeds[0];bpy.ops.object.join();seeds[0].name='Sunflower_seed_centers'
    grow(core,.40,.82,minimum=.04)
    ring=petals('Sunflower_outer_petals',head,18,.205,.34,.071,material('sunflower amber petals','#D7AB4B',.59),.58,.94,fold=-1.2)
    grow(ring,.43,.82,minimum=.025)
    inner=petals('Sunflower_inner_petals',head,12,.185,.23,.065,material('sunflower light petals','#E4BE62',.61),.62,.98,fold=-1.1,phase=.12)
    inner.location.z=.012;grow(inner,.48,.85,minimum=.025)
    return root

def tomato():
    root=empty('Plant_tomato');root['speciesId']='tomato';greens=green_set()
    stem=curve('Tomato_stem',[(0,0,0),(.015,0,.7),(0,0,1.62)],.025,greens[0],root,res=3);grow(stem,.02,.67,minimum=.11,axis=2)
    for i,(h,a) in enumerate([(.25,.45),(.48,3.6),(.85,1.4),(1.08,4.5),(1.35,.3),(1.58,3.5)]):
        anchor=moving_attachment('Tomato_leaf_attachment_'+str(i),root,(0,0,h),.02,.67,.11)
        cluster=empty('Tomato_compound_leaf_'+str(i),anchor);cluster.rotation_euler.z=a
        leaf('Tomato_main_leaf_'+str(i),.31,.095,.13,-.08,greens[(i+1)%3],cluster,lobes=.9)
        for side in [-1,1]:leaf('Tomato_side_leaf_'+str(i)+'_'+str(side),.19,.066,.08,-.05,greens[i%3],cluster,base=(.08,0,.025),angle=side*.67,lobes=.7,vein=False)
        grow(cluster,.02+i*.05,.49+i*.035,minimum=.32 if i<2 else .001,fold=-.70)
    for i,(h,x,y,r) in enumerate([(1.0,-.32,-.02,.24),(1.27,.30,.02,.22),(1.55,-.24,.015,.18),(1.69,.21,.015,.155)]):
        anchor=moving_attachment('Tomato_fruit_branch_'+str(i),root,(0,0,h),.02,.67,.11)
        branch=curve('Tomato_branch_'+str(i),[(0,0,0),(x*.6,y,.1),(x,y,-.03)],.014,greens[0],anchor,res=2);start=.17+i*.035;end=.65+i*.04;grow(branch,start,end,minimum=.001)
        endPoint=moving_attachment('Tomato_fruit_anchor_'+str(i),anchor,(x,y,-.03),start,end,.001)
        fruit=empty('Tomato_fruit_'+str(i),endPoint)
        color=['#C35944','#C96649','#B94A40','#CE7150'][i]
        lathe('Tomato_lobed_fruit_'+str(i),[(.03,0),(.65*r,-.09*r),(r,-.58*r),(.96*r,-1.22*r),(.62*r,-1.70*r),(.01,-1.83*r)],material('ripe tomato '+str(i),color,.42),fruit,segments=32,lobes=7,lobe_amp=.055)
        for k in range(5):leaf('Tomato_calyx_'+str(i)+'_'+str(k),r*.63,.028,.014,-.016,greens[0],fruit,angle=k*2*pi/5,vein=False)
        grow(fruit,.43+i*.035,.88+i*.025,minimum=.025)
    return root

def succulent(name,points,radius,mat,p):
    vs=[];fs=[];segments=18
    points=[Vector(q) for q in points]
    for j,c in enumerate(points):
        tangent=(points[min(len(points)-1,j+1)]-points[max(0,j-1)]).normalized();u=tangent.cross(Vector((0,1,0))).normalized();v=tangent.cross(u).normalized()
        for i in range(segments):
            a=2*pi*i/segments;r=radius*(1+.22*cos(3*a))*(.14 if j==len(points)-1 else .72 if j==len(points)-2 else 1);vs.append(tuple(c+u*(r*cos(a))+v*(r*sin(a))))
    for j in range(len(points)-1):
        for i in range(segments):k=j*segments+i;n=j*segments+(i+1)%segments;fs.append((k,n,n+segments,k+segments))
    fs.append(tuple(range(segments-1,-1,-1)));fs.append(tuple((len(points)-1)*segments+i for i in range(segments)))
    return mesh(name,vs,fs,mat,p)

def dragonfruit():
    root=empty('Plant_dragonfruit');root['speciesId']='dragonfruit';greens=green_set()
    stem=succulent('Dragonfruit_tricorn_stem',[(0,0,0),(0,0,.35),(.015,0,.9),(-.015,0,1.45),(-.055,.01,1.87),(-.08,.01,1.98)],.105,greens[1],root);grow(stem,.02,.70,minimum=.10,axis=2)
    for i,(height,side) in enumerate([(.95,-1),(1.35,1)]):
        attach=moving_attachment('Dragonfruit_arm_attach_'+str(i),root,(0,0,height),.02,.70,.10)
        arm=succulent('Dragonfruit_fleshy_arm_'+str(i),[(0,0,0),(.12*side,0,.20),(.26*side,0,.29),(.285*side,-.035,.11)],.083,greens[(i+1)%3],attach)
        start=.17+i*.07;end=.69+i*.07;grow(arm,start,end,minimum=.001)
        tip=moving_attachment('Dragonfruit_fruit_anchor_'+str(i),attach,(.285*side,-.035,.11),start,end,.001)
        fruit=empty('Dragonfruit_berry_'+str(i),tip)
        lathe('Dragonfruit_magenta_body_'+str(i),[(.018,0),(.105,-.055),(.175,-.15),(.18,-.27),(.11,-.39),(.016,-.44)],material('dragonfruit magenta','#BA507B',.49),fruit,segments=28,lobes=5,lobe_amp=.025)
        for row,(z,rad) in enumerate([(-.07,.085),(-.23,.15),(-.36,.10)]):
            for k in range(5):
                a=k*2*pi/5+row*.42;leaf('Dragonfruit_bract_'+str(i)+'_'+str(row)+'_'+str(k),.073,.026,.075,.018,material('dragonfruit lime bracts','#94AC71',.6),fruit,base=(rad*cos(a),rad*sin(a),z),angle=a,vein=False)
        grow(fruit,.50+i*.04,.91+i*.04,minimum=.02)
    return root
def sculpted_petals(name,p,count,profile,width,mat,start=.48,end=.94,phase=0,closed=.12):
    """Upright cupped or falling petals. Profile (radius,height) traces their visible silhouette."""
    # Catmull-Rom cross sections keep the sculptural cup/falls soft without a dense asset.
    source=profile;profile=[]
    for j in range(len(source)-1):
        a=Vector(source[max(0,j-1)]);b=Vector(source[j]);c=Vector(source[j+1]);d=Vector(source[min(len(source)-1,j+2)])
        for step in range(4):
            t=step/4;v=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);profile.append(tuple(v))
    profile.append(source[-1])
    verts=[];shut=[];faces=[];nu=len(profile)-1;nv=8
    for k in range(count):
        a=phase+k*2*pi/count;ca=cos(a);sa=sin(a);offset=len(verts)
        for i,(r,z) in enumerate(profile):
            t=i/nu;w=width*max(.035,sin(pi*t)**.55)
            for j in range(nv+1):
                v=2*j/nv-1;y=w*v;zz=z+.028*v*v*sin(pi*t)
                verts.append((r*ca-y*sa,r*sa+y*ca,zz))
                rr=closed*r;shut.append((rr*ca-y*.55*sa,rr*sa+y*.55*ca,z+(r-rr)*.75))
        for i in range(nu):
            for j in range(nv):q=offset+i*(nv+1)+j;faces.append((q,q+1,q+nv+2,q+nv+1))
    ob=mesh(name,verts,faces,mat,p);ob.shape_key_add(name='Basis');key=ob.shape_key_add(name='Bud closed')
    for v,co in zip(key.data,shut):v.co=co
    for t,value in [(0,1),(start,1),((start+end)*.5,.5),(end,0),(1,0)]:key.value=value;key.keyframe_insert('value',frame=1+round(t*100))
    sol=ob.modifiers.new('petal soft thickness','SOLIDIFY');sol.thickness=.008
    return ob

def tulip():
    root=empty('Plant_tulip');root['speciesId']='tulip';greens=green_set()
    stem=curve('Tulip_stem',[(0,0,0),(.018,0,.34),(.035,0,.70)],.017,greens[0],root,res=2);grow(stem,.02,.68,minimum=.09,axis=2)
    for i,a in enumerate([.3,3.7]):
        le=leaf('Tulip_cupped_leaf_'+str(i),.35,.105,.60,-.10,greens[(i+1)%3],root,angle=a,fold=-.6)
        grow(le,.01+i*.06,.65+i*.04,minimum=.22,fold=-.35)
    head=moving_attachment('Tulip_flower',root,(.035,0,.70),.02,.68,.09)
    bloom=empty('Tulip_bloom',head)
    for layer in range(2):
        prof=[(.02,0),(.09,.04),(.145,.115),(.175,.21),(.185,.29),(.215,.35)]
        ob=sculpted_petals('Tulip_'+['outer_rose','inner_peach'][layer],bloom,3,prof,.13,material('tulip '+['rose petal','#'][layer],['#BA6B83','#DCA0A4'][layer],.53),.48+.03*layer,.94,phase=layer*pi/3,closed=.20)
        if layer:ob.scale=(.87,.87,.94)
    uv('Tulip_calyx',(0,0,0),(.055,.055,.045),greens[0],bloom,seg=14,rings=8)
    grow(bloom,.31,.79,minimum=.035)
    return root

def pumpkin():
    root=empty('Plant_pumpkin');root['speciesId']='pumpkin';greens=green_set()
    fruit=empty('Pumpkin_fruit',root,(0,0,.01))
    lathe('Pumpkin_eight_ribs',[(.035,0),(.25,.04),(.46,.15),(.51,.34),(.44,.54),(.26,.65),(.055,.63)],material('pumpkin burnt amber','#C98743',.57),fruit,segments=64,lobes=8,lobe_amp=.105)
    curve('Pumpkin_cork_stem',[(0,0,.62),(-.015,.015,.75),(.06,.02,.80)],.041,material('pumpkin stem olive','#64774C'),fruit,res=3)
    grow(fruit,.16,.95,minimum=.035)
    for i,a in enumerate([.5,3.6]):
        le=leaf('Pumpkin_leaf_'+str(i),.49,.23,.15,-.10,greens[i],root,base=(0,0,.02),angle=a,lobes=1,fold=-.3)
        grow(le,.01+i*.04,.56+i*.05,minimum=.25 if i==0 else .15,fold=-.40)
    vine=curve('Pumpkin_living_vine',[(.04,0,.04),(.42,-.17,.06),(.57,-.11,.10),(.59,.03,.13),(.50,.08,.12)],.014,greens[1],root,res=2);grow(vine,.09,.70,minimum=.07)
    return root

def iris():
    root=empty('Plant_iris');root['speciesId']='iris';greens=green_set()
    for i,(a,h) in enumerate([(-.2,.95),(2.8,.86),(1.8,.67),(4.8,.74)]):
        le=leaf('Iris_sword_leaf_'+str(i),.24,.055,h,-.06,greens[i%3],root,angle=a,vein=True)
        grow(le,.01+i*.045,.61+i*.025,minimum=.18 if i<2 else .03,fold=-.28)
    stem=curve('Iris_stem',[(0,0,0),(.015,.01,.68),(-.015,.02,1.17)],.018,greens[0],root,res=2);grow(stem,.04,.70,minimum=.09,axis=2)
    head=moving_attachment('Iris_flower',root,(-.015,.02,1.17),.04,.70,.09)
    bloom=empty('Iris_bloom',head);bloom.rotation_euler.x=.13
    sculpted_petals('Iris_three_standards',bloom,3,[(.025,0),(.07,.08),(.13,.19),(.14,.30),(.09,.39),(.04,.40)],.115,material('iris upper lavender','#A5A0CB',.6),.51,.96,phase=.3,closed=.3)
    sculpted_petals('Iris_three_falls',bloom,3,[(.02,0),(.13,.04),(.25,.01),(.33,-.09),(.34,-.21),(.30,-.27)],.14,material('iris velvet purple','#7778AC',.62),.55,.97,phase=.3+pi/3,closed=.12)
    for k in range(3):
        a=.3+pi/3+k*2*pi/3
        le=leaf('Iris_golden_beard_'+str(k),.22,.024,.035,-.06,material('iris throat gold','#D7B975',.7),bloom,angle=a,vein=False)
    grow(bloom,.35,.84,minimum=.035)
    return root

def merge_static(objects,name):
    if not objects:return
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=name
    return objects[0]

def grape():
    root=empty('Plant_grape');root['speciesId']='grape';greens=green_set()
    wood=material('grape woody stem','#8B7151',.8)
    main=curve('Grape_vine',[(0,0,0),(-.04,0,.7),(.04,0,1.34),(-.13,0,1.9)],.032,wood,root,res=3);grow(main,.02,.68,minimum=.08)
    for i,(h,a) in enumerate([(.45,.1),(.84,3.5),(1.2,.3),(1.58,3.35),(1.85,.1)]):
        att=moving_attachment('Grape_leaf_attach_'+str(i),root,(0,0,h),.02,.68,.08)
        le=leaf('Grape_lobed_leaf_'+str(i),.44,.21,.10,-.065,greens[(i+1)%3],att,angle=a,lobes=1,fold=-.6)
        grow(le,.02+i*.055,.54+i*.04,minimum=.25 if i<2 else .001,fold=-.6)
    for i,(h,x,y) in enumerate([(1.38,-.32,-.03),(1.83,.30,-.02),(.98,.25,-.02)]):
        att=moving_attachment('Grape_cluster_attach_'+str(i),root,(0,0,h),.02,.68,.08)
        branch=curve('Grape_hanging_branch_'+str(i),[(0,0,0),(x*.6,y,.10),(x,y,-.025)],.012,wood,att,res=2);grow(branch,.18+i*.04,.71+i*.035,minimum=.001)
        end=moving_attachment('Grape_bunch_anchor_'+str(i),att,(x,y,-.025),.18+i*.04,.71+i*.035,.001)
        bunch=empty('Grape_bunch_'+str(i),end);berries=[]
        mats=[material('grape dusty purple','#827097',.43),material('grape plum','#746287',.44),material('grape bloom highlight','#9985A8',.49)]
        for row,(z,rad,count) in enumerate([(-.08,.092,5),(-.22,.11,6),(-.36,.068,4),(-.47,.005,1)]):
            for k in range(count):
                a=k*2*pi/count+row*.6;berries.append(uv('berry',(rad*cos(a),rad*sin(a),z),(.087,.079,.095),mats[(row+k+i)%3],bunch,seg=14,rings=8))
        merge_static(berries,'Grape_individual_berries_'+str(i));grow(bunch,.43+i*.035,.92+i*.025,minimum=.025)
    return root

def orchid_flower(name,parent,mat,lipmat):
    g=empty(name,parent)
    # Flower faces camera-side; two butterfly wings and three tapered sepals, not a daisy ring.
    for i,(a,length,width) in enumerate([(0,.245,.155),(pi,.245,.155),(pi/2,.235,.095),(pi*7/6,.22,.078),(pi*11/6,.22,.078)]):
        pet=leaf(name+'_petal_'+str(i),length,width,.025,-.015,mat,g,angle=a,vein=False)
    uv(name+'_heart',(0,0,.035),(.036,.046,.029),material('orchid cream center','#EBDAB0'),g,seg=14,rings=8)
    lip=leaf(name+'_lip',.13,.065,.06,-.08,lipmat,g,angle=-pi/2,vein=False)
    uv(name+'_throat',(0,-.025,.045),(.018,.022,.018),material('orchid golden throat','#C6A05A'),g,seg=12,rings=6)
    return g

def phalaenopsis():
    root=empty('Plant_phalaenopsis');root['speciesId']='phalaenopsis';greens=green_set()
    for i,a in enumerate([.3,3.4,1.7,4.9]):
        le=leaf('Orchid_strap_leaf_'+str(i),.53-.04*i,.12,.09,-.06,greens[i%2],root,angle=a,vein=True)
        grow(le,.015+i*.045,.59+i*.035,minimum=.32 if i<2 else .001,fold=-.25)
    stem=curve('Orchid_arching_flower_spike',[(0,0,0),(-.12,0,.55),(-.08,0,.96),(.22,-.01,1.13),(.52,-.02,1.03)],.013,greens[0],root,res=3);grow(stem,.18,.74,minimum=.015)
    for i,pos in enumerate([(-.095,-.015,.70),(-.07,-.015,.96),(.19,-.025,1.12),(.44,-.03,1.07)]):
        head=empty('Orchid_flower_attachment_'+str(i),root)
        # z follows stem emergence; lateral arch remains true, flowers start near stem.
        for t in (0,.18,.46,.74,1):
            q=min(1,max(0,(t-.18)/.56));q=q*q*(3-2*q);head.location=Vector(pos)*(.015+.985*q);head.keyframe_insert('location',frame=1+round(t*100))
        head.rotation_euler=(pi/2-.18,0,-.18+.12*i)
        flower=orchid_flower('Orchid_butterfly_'+str(i),head,material('orchid pale mauve petals','#DDC7D7',.56),material('orchid magenta lip','#AD7094',.54))
        grow(flower,.39+i*.055,.80+i*.045,minimum=.015,fold=-.3)
    return root

def consolidate_static_clusters(root):
    # These organs grow as one group; joining their static leaves/petals reduces draw calls,
    # while independently animated organs and morph petals are kept completely separate.
    bpy.context.scene.frame_set(101);bpy.context.view_layer.update()
    jobs=[]
    for group in root.children_recursive:
        if group.name.startswith('Tomato_fruit_') and not group.name.startswith(('Tomato_fruit_branch','Tomato_fruit_anchor')):
            jobs.append((group,'Tomato_calyx_',group.name+'_joined_calyx'))
        elif group.name.startswith('Dragonfruit_berry_'):
            jobs.append((group,'Dragonfruit_bract_',group.name+'_joined_bracts'))
        elif group.name.startswith('Orchid_butterfly_') and '_petal_' not in group.name:
            jobs.append((group,group.name+'_petal_',group.name+'_joined_wings'))
    for group,prefix,name in jobs:
        objects=[o for o in group.children_recursive if o.type=='MESH' and o.name.startswith(prefix) and not o.data.shape_keys]
        if len(objects)<2:continue
        joined=merge_static(objects,name);matrix=joined.matrix_world.copy();joined.parent=group;joined.matrix_world=matrix

def tile():
    root=empty('Tile');root['size']=3.2;root['groundLocalY']=0
    # Smooth continuous slab, no separate stonework or grass clutter.
    cube('warm cream soil',(0,0,-.39),(3.2,3.2,.66),material('soil ivory','#DECFAD',.88),.10,root)
    cube('sage turf',(0,0,-.06),(3.2,3.2,.12),material('turf sage','#B5C491',.86),.055,root)
    return root

def bounds(root):
    bpy.context.scene.frame_set(101);bpy.context.view_layer.update();pts=[]
    for ob in root.children_recursive:
        if ob.type in ('MESH','CURVE'):
            for b in ob.bound_box:pts.append(ob.matrix_world@Vector(b)-root.matrix_world.translation)
    if not pts:return {}
    mi=[min(p[i] for p in pts) for i in range(3)];ma=[max(p[i] for p in pts) for i in range(3)]
    # Blender XYZ -> glTF X,Y=Z,Z=-Y.
    return {'min':[mi[0],mi[2],-ma[1]],'max':[ma[0],ma[2],-mi[1]],'size':[ma[0]-mi[0],ma[2]-mi[2],ma[1]-mi[1]]}

def export(root,dest):
    dest.parent.mkdir(parents=True,exist_ok=True)
    bpy.context.scene.frame_set(101)
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for x in root.children_recursive:x.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_extras=True,export_animations=True,export_animation_mode='SCENE',export_anim_scene_split_object=False,export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_materials='EXPORT')
    return bounds(root)

def render(root,dest,size=768,with_tile=False):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=False
    scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast' if False else 'None'
    scene.view_settings.exposure=0;scene.view_settings.gamma=1
    scene.world.color=(.35,.35,.35)
    if with_tile:
        tr=tile();tr.location.z=-.015
    floor=material('preview background','#5B9FA1',.85)
    cube('preview ocean',(0,0,-.7),(200,200,.1),floor)
    for name,loc,energy,sz in [('key',(-3,-4,7),550,5),('fill',(4,-1,4),220,4)]:
        bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name=name;light.data.energy=energy;light.data.shape='DISK';light.data.size=sz
        light.rotation_euler=(Vector((0,0,.5))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(5,-7,6));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=6 if with_tile else 2.9
    cam.rotation_euler=(Vector((0,0,.5))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=size;scene.render.resolution_y=size;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(dest)
    bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['radish']
    name=args[0];reset();root=globals()[name]();consolidate_static_clusters(root)
    if name in STANDARD_HEIGHTS:
        root.scale*=STANDARD_HEIGHTS[name]/bounds(root)['size'][1]
        bpy.context.view_layer.update()
    dest=OUT/('tile.glb' if name=='tile' else 'plants/'+name+'.glb');bb=export(root,dest)
    stats={'speciesId':name,'path':'/assets/world/'+('tile.glb' if name=='tile' else 'plants/'+name+'.glb'),'bounds':bb,'animation':'Scene','durationSeconds':4,'rootAtGround':True,'bytes':dest.stat().st_size,'objects':len(root.children_recursive)}
    (dest.with_suffix('.json')).write_text(json.dumps(stats,ensure_ascii=False,indent=2))
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art-source'/('source-'+name+'.blend')))
    if '--render' in args:render(root,EVIDENCE/(name+'-mature.png'),with_tile=True)
    print('ART_ASSET_COMPLETE',json.dumps(stats))
