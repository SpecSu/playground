"""Original approved 苏贝壳 sculpt. Regenerates isolated review files only."""
import bpy, bmesh, math, json, sys, argparse
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from pathlib import Path

ROOT=Path(__file__).resolve().parent
TAU=math.tau
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',type=Path,default=ROOT/'generated');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=args.output_dir.resolve();ROOT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
PARTS=[]
def V(x,z,front=0):return (x,-front,z)
def lerp(a,b,t):return a+(b-a)*t
def clamp(x):return max(0,min(1,x))
def smooth(x):x=clamp(x);return x*x*(3-2*x)
def linear(x):return ((x+.055)/1.055)**2.4 if x>.04045 else x/12.92
def material(name,hexcolor,roughness,group):
    m=bpy.data.materials.new(name);m.use_nodes=True
    rgb=[linear(int(hexcolor[i:i+2],16)/255) for i in (0,2,4)]
    m.diffuse_color=(*rgb,1);bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=roughness;bs.inputs['Specular IOR Level'].default_value=.27
    m['surface_group']=group
    return m
M={
 'skin':material('Skin_peach','FAC07A',.56,'skin'),
 'blush':material('Skin_ear_warmth','E59B70',.56,'skin'),
 'hair':material('Hair_chestnut','65402D',.55,'hair'),
 'hair_light':material('Hair_warm_planes','705039',.55,'hair'),
 'hair_dark':material('Hair_deep_planes','482B20',.55,'hair'),
 'jacket':material('Jacket_ivory','EADCC3',.83,'cloth'),
 'jacket_shadow':material('Jacket_inner','DFD0B4',.83,'cloth'),
 'tee':material('Shirt_cotton','FFFFFF',.83,'cloth'),
 'pants':material('Trousers_sand','B9A384',.83,'cloth'),
 'cuff':material('Trousers_cuff','CDBB9B',.83,'cloth'),
 'seam':material('Shoe_seams','D5C9B3',.83,'cloth'),
 'sole':material('Shoe_sole','E9DFC9',.83,'cloth'),
 'white':material('Eyes_white','FFFBF0',.36,'gloss'),
 'ink':material('Eyes_ink','201B1A',.36,'gloss'),
 'face_ink':material('Graphic_ink','171716',.83,'cloth'),
 'mouth':material('Smile_warm_dark','41221D',.56,'skin'),
 'tongue':material('Smile_tongue','D77863',.56,'skin'),
 'gold':material('Sunglasses_honey','EDAD25',.22,'gloss'),
 'frame':material('Sunglasses_frame','8C6332',.22,'gloss'),
}

JOINTS={'root':V(0,0),'hips':V(0,.71),'spine':V(0,.91),'chest':V(0,1.10),'neck':V(0,1.235),'head':V(0,1.60)}
for side,sgn in [('L',1),('R',-1)]:
    for name,co in {'upperArm':V(.25,1.10),'forearm':V(.365,.895,.012),'hand':V(.427,.746,.048),'thigh':V(.13,.69),'shin':V(.144,.405,.016),'foot':V(.155,.125,.012)}.items():JOINTS[name+'_'+side]=(co[0]*sgn,co[1],co[2])

def weights_z(z):
    if z<.71:return {'hips':1}
    if z<.91:
        t=smooth((z-.71)/.20);return {'hips':1-t,'spine':t}
    if z<1.10:
        t=smooth((z-.91)/.19);return {'spine':1-t,'chest':t}
    return {'chest':1}

def mesh(name,verts,faces,color,bone='head',weights=None):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.materials.append(M[color]);data.update()
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob['avatar_part']=True;PARTS.append(ob)
    for polygon in data.polygons:polygon.use_smooth=True
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    groups={}
    for i,co in enumerate(verts):
        w=weights[i] if weights is not None else ({bone:1} if isinstance(bone,str) else bone(co))
        total=sum(w.values())
        for joint,weight in w.items():
            if weight<=1e-6:continue
            if joint not in groups:groups[joint]=ob.vertex_groups.new(name=joint)
            groups[joint].add([i],weight/total,'REPLACE')
    return ob

def sphere(name,center,scale,color,bone='head',n=24,m=14):
    verts=[(center[0],center[1],center[2]+scale[2])];faces=[]
    for j in range(1,m):
        p=math.pi*j/m
        for i in range(n):
            t=TAU*i/n;verts.append((center[0]+scale[0]*math.sin(p)*math.cos(t),center[1]+scale[1]*math.sin(p)*math.sin(t),center[2]+scale[2]*math.cos(p)))
    bottom=len(verts);verts.append((center[0],center[1],center[2]-scale[2]))
    for i in range(n):faces.append((0,1+i,1+(i+1)%n))
    for j in range(m-2):
        for i in range(n):a=1+j*n+i;b=1+j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    for i in range(n):faces.append((bottom,1+(m-2)*n+(i+1)%n,1+(m-2)*n+i))
    return mesh(name,verts,faces,color,bone)

def cubic(a,b,c,d,t):return (1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d
def bezier(points,steps=20):
    a,b,c,d=map(Vector,points);return [cubic(a,b,c,d,i/steps) for i in range(steps+1)]

def sweep(name,points,widths,depths,color,bone='head',sides=12,weights=None):
    verts=[];faces=[];ws=[]
    for j,p in enumerate(points):
        p=Vector(p);t=j/(len(points)-1)
        tangent=(Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])).normalized()
        side=tangent.cross(Vector((0,1,0))).normalized()
        if side.length<.1:side=Vector((1,0,0))
        depth=tangent.cross(side).normalized()
        w=widths[j] if isinstance(widths,list) else widths;d=depths[j] if isinstance(depths,list) else depths
        for i in range(sides):
            angle=TAU*i/sides;verts.append(p+side*math.cos(angle)*w+depth*math.sin(angle)*d)
            ws.append(weights(t) if weights else ({bone:1} if isinstance(bone,str) else bone(verts[-1])))
        if j:
            for i in range(sides):a=(j-1)*sides+i;b=(j-1)*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
    for j in (0,len(points)-1):
        idx=len(verts);verts.append(points[j]);ws.append(ws[j*sides])
        for i in range(sides):a=j*sides+i;b=j*sides+(i+1)%sides;faces.append((idx,b,a) if j==0 else (idx,a,b))
    return mesh(name,verts,faces,color,bone,ws)

def line(name,points,radius,color,bone='head'):
    return sweep(name,points,radius,radius,color,bone,sides=10)

# Smooth profile interpolation retains broad cheeks and a soft jaw without intersections.
HEAD=[(1.235,.030,.040,.012),(1.255,.115,.098,.018),(1.300,.222,.155,.018),(1.370,.288,.208,.012),(1.460,.330,.237,.006),(1.570,.346,.251,.000),(1.690,.346,.250,-.008),(1.790,.328,.237,-.015),(1.885,.263,.211,-.025),(1.957,.148,.135,-.030),(1.989,.025,.030,-.030)]
def profile_at(z,profile=HEAD):
    k=min(len(profile)-2,max(0,next((i for i in range(len(profile)-1) if z<=profile[i+1][0]),len(profile)-2)))
    t=clamp((z-profile[k][0])/(profile[k+1][0]-profile[k][0]));out=[]
    for axis in (1,2,3):
        p0=profile[max(0,k-1)][axis];p1=profile[k][axis];p2=profile[k+1][axis];p3=profile[min(len(profile)-1,k+2)][axis]
        out.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    return out
EXP=2.30
def head_front(x,z):
    rx,rd,f=profile_at(z)
    return f+rd*max(0,1-(abs(x)/rx)**EXP)**(1/EXP)
verts=[];faces=[];sides=48;levels=35
for j in range(levels):
    z=lerp(HEAD[0][0],HEAD[-1][0],j/(levels-1));rx,rd,f=profile_at(z)
    for i in range(sides):
        t=TAU*i/sides;ct=math.cos(t);st=math.sin(t)
        verts.append((rx*math.copysign(abs(ct)**(2/EXP),ct),-f+rd*math.copysign(abs(st)**(2/EXP),st),z))
    if j:
        for i in range(sides):a=(j-1)*sides+i;b=(j-1)*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
for j,z in [(0,HEAD[0][0]-.003),(levels-1,HEAD[-1][0]+.003)]:
    idx=len(verts);verts.append((0,-profile_at(z)[2],z))
    for i in range(sides):a=j*sides+i;b=j*sides+(i+1)%sides;faces.append((idx,b,a) if j==0 else (idx,a,b))
mesh('Head_continuous',verts,faces,'skin')

# Surface-conforming graphic face patches are real geometry, not camera-facing cards.
def face_patch(name,outline,color,offset=.010,rings=5,bulge=.002,concave=False):
    cx=sum(p[0] for p in outline)/len(outline);cz=sum(p[1] for p in outline)/len(outline)
    if concave:
        boundary=[Vector((x,z,0)) for x,z in outline]
        raw_triangles=tessellate_polygon([boundary])
        triangles=[tuple(boundary[i] if isinstance(i,int) else i for i in triangle) for triangle in raw_triangles]
        verts=[];faces=[];indices={};sub=3
        def add(x,z):
            key=(round(x,8),round(z,8))
            if key not in indices:
                indices[key]=len(verts);verts.append(V(x,z,head_front(x,z)+offset))
            return indices[key]
        for a,b,c in triangles:
            grid={}
            for i in range(sub+1):
                for j in range(sub-i+1):
                    p=a+(b-a)*(i/sub)+(c-a)*(j/sub);grid[i,j]=add(p.x,p.y)
            for i in range(sub):
                for j in range(sub-i):
                    faces.append((grid[i,j],grid[i+1,j],grid[i,j+1]))
                    if i+j<sub-1:faces.append((grid[i+1,j],grid[i+1,j+1],grid[i,j+1]))
        ob=mesh(name,verts,faces,color)
        ob['outline_area']=abs(sum(outline[i][0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*outline[i][1] for i in range(len(outline)))/2)
        return ob
    verts=[V(cx,cz,head_front(cx,cz)+offset+bulge)];faces=[];n=len(outline)
    for ring in range(1,rings+1):
        u=ring/rings
        for x,z in outline:
            x=lerp(cx,x,u);z=lerp(cz,z,u);verts.append(V(x,z,head_front(x,z)+offset+bulge*(1-u*u)))
        if ring==1:
            for i in range(n):faces.append((0,1+i,1+(i+1)%n))
        else:
            start=1+(ring-2)*n
            for i in range(n):a=start+i;b=start+(i+1)%n;faces.append((a,b,b+n,a+n))
    return mesh(name,verts,faces,color)

def oval(cx,cz,rx,rz,n=40,tilt=0):
    return [(cx+rx*math.cos(TAU*i/n),cz+rz*math.sin(TAU*i/n)+tilt*math.cos(TAU*i/n)) for i in range(n)]

for s in (-1,1):
    sphere('Ear_'+str(s),V(s*.338,1.548,-.007),(.067,.062,.095),'skin',n=24,m=14)
    sphere('Ear_inner_'+str(s),V(s*.367,1.549,.040),(.028,.014,.056),'blush',n=18,m=10)
    x=s*.137
    face_patch('Eye_white_'+str(s),oval(x,1.635,.104,.062,48,tilt=s*.007),'white',.006,6,.002)
    face_patch('Pupil_'+str(s),oval(x+.026,1.638,.039,.054,36),'face_ink',.011,5,.001)
    # A flat matte stroke conforms to the curved skin instead of an eyelid tube.
    outline=[]
    for i in range(25):
        t=math.pi*i/24;xx=x+.108*math.cos(t);zz=1.640+.069*math.sin(t)+s*.007*math.cos(t)
        outline.append((xx,zz))
    for i in range(24,-1,-1):
        t=math.pi*i/24;xx=x+.101*math.cos(t);zz=1.635+.057*math.sin(t)+s*.007*math.cos(t)
        outline.append((xx,zz))
    face_patch('Upper_eyelid_'+str(s),outline,'face_ink',.014,4,0,concave=True)
    # Thick, softly curved eyebrows have a solid tapered silhouette.
    outline=[]
    for i in range(19):
        u=i/18;xx=x-.084+u*.166;zz=1.767+.018*math.sin(math.pi*u)+s*(u-.5)*.014
        outline.append((xx,zz))
    for i in range(18,-1,-1):
        u=i/18;xx=x-.084+u*.166;zz=1.733+.018*math.sin(math.pi*u)+s*(u-.5)*.014
        outline.append((xx,zz))
    face_patch('Brow_'+str(s),outline,'face_ink',.008,6,0,concave=True)

# The reference's small L-like nose is a matte graphic on the true 3D head.
points=[(.008,1.568),(.005,1.557),(.002,1.546),(-.001,1.534),(-.004,1.523),(-.002,1.517),(.005,1.515),(.014,1.515),(.025,1.517)]
left=[];right=[]
for i,(x,z) in enumerate(points):
    before=Vector(points[max(0,i-1)]);after=Vector(points[min(len(points)-1,i+1)]);d=(after-before).normalized();n=Vector((-d.y,d.x));w=.0065*(.8 if i in (0,len(points)-1) else 1)
    left.append((x+n.x*w,z+n.y*w));right.append((x-n.x*w,z-n.y*w))
face_patch('Graphic_nose',left+list(reversed(right)),'face_ink',.008,4,0,concave=True)
# Wide smile: a rising upper lip and rounded lower curve, fully outside the skin.
outline=[]
for i in range(25):
    u=i/24;x=lerp(-.103,.103,u);z=1.439-.012*math.sin(math.pi*u)+.014*u;outline.append((x,z))
for i in range(24,-1,-1):
    u=i/24;x=lerp(-.103,.103,u);z=1.439-.070*math.sin(math.pi*u)+.014*u;outline.append((x,z))
face_patch('Smile_opening',outline,'mouth',.014,8,.001)
teeth=[]
for i in range(25):
    u=i/24;x=lerp(-.092,.092,u);teeth.append((x,1.439-.012*math.sin(math.pi*u)+.012*u))
for i in range(24,-1,-1):
    u=i/24;x=lerp(-.092,.092,u);teeth.append((x,1.437-.029*math.sin(math.pi*u)+.012*u))
face_patch('Smile_teeth',teeth,'white',.020,5,.001)

# Hair cap wraps the skull. Its varied hairline rises at the off-center part.
verts=[];faces=[];rings=17;ns=64
for j in range(rings):
    u=j/(rings-1)
    for i in range(ns):
        theta=TAU*i/ns;front=max(0,-math.sin(theta))
        # Full back/side coverage; the front sweep leaves a broad readable forehead.
        bottom=1.38+.10*abs(math.cos(theta))+.47*front+.05*front*max(0,math.cos(theta))
        top=2.060;z=lerp(bottom,top,u)
        if z<1.93:
            hx,hd,hf=profile_at(z);rx=hx+.016;rd=hd+.016
            ct=math.cos(theta);st=math.sin(theta)
            verts.append((rx*math.copysign(abs(ct)**(2/EXP),ct),-hf+rd*math.copysign(abs(st)**(2/EXP),st),z))
        else:
            rx=.355*math.sqrt(max(.0003,1-((z-1.715)/.350)**2));rd=.268*math.sqrt(max(.0003,1-((z-1.715)/.350)**2))
            verts.append((rx*math.cos(theta),.022+rd*math.sin(theta),z))
    if j:
        for i in range(ns):a=(j-1)*ns+i;b=(j-1)*ns+(i+1)%ns;faces.append((a,b,b+ns,a+ns))
cap=len(verts);verts.append((0,.022,2.067))
for i in range(ns):faces.append(((rings-1)*ns+i,(rings-1)*ns+(i+1)%ns,cap))
mesh('Hair_cap',verts,faces,'hair')

def hair_lock(name,control,maxwidth,maxdepth,color='hair'):
    points=bezier(control,24);width=[];depth=[]
    for j in range(len(points)):
        t=j/(len(points)-1)
        envelope=(1-t)**.62*smooth(t/.16)
        width.append(max(.001,maxwidth*envelope));depth.append(max(.0008,maxdepth*envelope))
    sweep(name,points,width,depth,color,sides=14)

hair_lock('Hair_sweep_main',[V(.070,2.010,.02),V(-.12,2.13,.105),V(-.36,1.93,.188),V(-.335,1.718,.130)],.175,.028,'hair')
hair_lock('Hair_sweep_front',[V(.130,2.010,.095),V(-.03,2.100,.24),V(-.23,1.91,.31),V(-.242,1.740,.25)],.132,.022,'hair_light')
hair_lock('Hair_fringe_center',[V(.120,1.999,.085),V(.095,2.035,.25),V(-.03,1.85,.31),V(-.075,1.755,.26)],.092,.018,'hair')
hair_lock('Hair_part_right',[V(.120,2.000,.03),V(.35,2.035,.08),V(.33,1.86,.20),V(.308,1.752,.12)],.111,.020,'hair')
hair_lock('Hair_crown_plane',[V(.100,1.990,-.04),V(.04,2.18,-.02),V(-.26,2.08,.05),V(-.337,1.95,.072)],.138,.024,'hair_light')

# Body solids use shaped ellipse profiles; clothes are actual panels rather than tubes.
def body(name,profile,color,depth=.70):
    verts=[];faces=[];weights=[];n=40
    for j,(z,r,f) in enumerate(profile):
        for i in range(n):
            t=TAU*i/n;co=(r*math.cos(t),-f+r*depth*math.sin(t),z);verts.append(co);weights.append(weights_z(z))
        if j:
            for i in range(n):a=(j-1)*n+i;b=(j-1)*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    for j in (0,len(profile)-1):
        idx=len(verts);z,r,f=profile[j];verts.append(V(0,z,f));weights.append(weights_z(z))
        for i in range(n):faces.append((idx,j*n+(i+1)%n,j*n+i) if j==0 else (idx,j*n+i,j*n+(i+1)%n))
    return mesh(name,verts,faces,color,weights=weights)

body('Tee',[ (.698,.183,0),(.712,.194,0),(.775,.201,0),(.90,.212,0),(1.01,.220,0),(1.105,.235,0),(1.14,.215,0),(1.182,.093,0)],'tee',.67)
body('Trouser_waist',[(.584,.030,0),(.605,.110,0),(.650,.175,0),(.675,.185,0),(.73,.185,0),(.758,.179,0)],'pants',.70)
sweep('Neck',[V(0,1.15),V(0,1.22),V(0,1.27)],[.078,.075,.075],[.071,.070,.070],'skin',weights=lambda t:{'neck':1-t,'head':t})

def panel(name,coords,color,bone=None,thickness=.012,bevel=.007):
    # Surface polygon with real edge thickness and rounded tailored edges.
    verts=[Vector(co) for co in coords];faces=[tuple(range(len(verts)))]
    ob=mesh(name,verts,faces,color,bone or (lambda co:weights_z(co[2])))
    solid=ob.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=thickness;solid.offset=0
    bevelmod=ob.modifiers.new('Soft tailored edges','BEVEL');bevelmod.width=bevel;bevelmod.segments=3
    bpy.context.view_layer.objects.active=ob
    for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob

for s in (-1,1):
    # Wide quiet front planes make the lapels readable at stage size.
    panel('Jacket_front_'+str(s),[V(s*.066,.695,.152),V(s*.198,.733,.116),V(s*.234,.96,.079),V(s*.249,1.10,.060),V(s*.123,1.183,.079),V(s*.095,1.092,.155)],'jacket',thickness=.019,bevel=.008)
    panel('Lapel_'+str(s),[V(s*.099,.88,.169),V(s*.089,1.08,.177),V(s*.107,1.179,.106),V(s*.158,1.148,.112),V(s*.194,1.072,.137),V(s*.143,1.043,.173)],'jacket',thickness=.018,bevel=.006)

# The rear garment follows the torso volume with clearance, rather than cutting
# through the convex shirt like two flat panels would.
verts=[];faces=[];ws=[];n=33
back_profile=[(.718,.205,.145),(.745,.216,.154),(.80,.222,.160),(.92,.232,.168),(1.04,.242,.174),(1.11,.249,.177),(1.15,.223,.158),(1.184,.108,.090)]
for j,(z,rx,rd) in enumerate(back_profile):
    for i in range(n):
        t=lerp(-.68,math.pi+.68,i/(n-1));verts.append((rx*math.cos(t),rd*math.sin(t),z));ws.append(weights_z(z))
    if j:
        for i in range(n-1):a=(j-1)*n+i;faces.append((a,a+1,a+1+n,a+n))
back=mesh('Jacket_back_wrap',verts,faces,'jacket',weights=ws)
solid=back.modifiers.new('Rear fabric thickness','SOLIDIFY');solid.thickness=.012;solid.offset=0
bpy.context.view_layer.objects.active=back;bpy.ops.object.modifier_apply(modifier=solid.name)

def limb_weights(side,upper,lower,t,transition=.50):
    blend=smooth((t-(transition-.13))/.26)
    return {upper+'_'+side:1-blend,lower+'_'+side:blend}

for side,s in [('L',1),('R',-1)]:
    a,e,h=[Vector(JOINTS[k+'_'+side]) for k in ('upperArm','forearm','hand')]
    # Curved sleeve, with rolled cuff ending before the wrist.
    sleeve=bezier([a+Vector((-s*.040,.003,.009)),a.lerp(e,.65)+Vector((0,.008,.009)),e.lerp(h,.25),e.lerp(h,.60)],20)
    widths=[(.018+.089*smooth((j/20)/.24))*(1-.22*(j/20)) for j in range(21)]
    sweep('Sleeve_'+side,sleeve,widths,[v*.83 for v in widths],'jacket',weights=lambda t,side=side:limb_weights(side,'upperArm','forearm',t,.71),sides=18)
    fore=bezier([e.lerp(h,.38),e.lerp(h,.55),h+Vector((-s*.003,0,.065)),h],14)
    sweep('Forearm_'+side,fore,[lerp(.063,.052,j/14) for j in range(15)],[lerp(.058,.047,j/14) for j in range(15)],'skin',weights=lambda t,side=side:{'forearm_'+side:1-smooth((t-.83)/.17),'hand_'+side:smooth((t-.83)/.17)},sides=18)
    cuff_start=e.lerp(h,.52);cuff_end=e.lerp(h,.65)
    sweep('Rolled_cuff_'+side,[cuff_start,cuff_start.lerp(cuff_end,.22),cuff_start.lerp(cuff_end,.8),cuff_end],[.087,.090,.089,.084],[.076,.079,.078,.074],'jacket',bone='forearm_'+side,sides=20)
    sphere('Hand_mitten_'+side,tuple(h+Vector((s*.008,-.003,-.034))),(.062,.047,.089),'skin','hand_'+side,n=24,m=16)
    thumb=bezier([h+Vector((-s*.035,-.012,.010)),h+Vector((-s*.078,-.025,.009)),h+Vector((-s*.074,-.049,-.025)),h+Vector((-s*.064,-.048,-.047))],12)
    sweep('Thumb_'+side,thumb,[.024*(1-.42*(j/12)) for j in range(13)],.022,'skin','hand_'+side,sides=12)
    hip,knee,foot=[Vector(JOINTS[k+'_'+side]) for k in ('thigh','shin','foot')]
    leg=bezier([hip+Vector((0,0,.018)),hip.lerp(knee,.58),knee.lerp(foot,.35),foot+Vector((0,0,.074))],24)
    widths=[.105-.015*(j/24)+.010*math.sin(math.pi*j/24) for j in range(25)]
    sweep('Trouser_leg_'+side,leg,widths,[v*.87 for v in widths],'pants',weights=lambda t,side=side:limb_weights(side,'thigh','shin',t,.57),sides=20)
    sweep('Trouser_cuff_'+side,[foot+Vector((0,0,.074)),foot+Vector((0,0,.117))],[.096,.098],[.088,.090],'cuff','shin_'+side,sides=24)
    sweep('Ankle_'+side,[foot+Vector((0,0,.010)),foot+Vector((0,0,.096))],.056,.053,'skin','foot_'+side,sides=16)
    # Low-profile sneaker has a rounded-square sole and a deliberately flatter top.
    sx=foot.x
    sphere('Sneaker_'+side,V(sx,.099,.089),(.128,.205,.086),'tee','foot_'+side,n=28,m=16)
    sphere('Sole_'+side,V(sx,.038,.093),(.131,.209,.037),'sole','foot_'+side,n=28,m=12)
    # Toe-cap seam and two understated laces.
    points=[]
    for j in range(29):
        x=lerp(-.110,.110,j/28);z=.128+.012*(1-(x/.110)**2)
        f=.089+.205*math.sqrt(max(.001,1-(x/.128)**2-((z-.099)/.086)**2))+.008
        points.append(V(sx+x,z,f))
    line('Toe_seam_'+side,points,.0045,'seam','foot_'+side)
    for j in range(2):
        points=[];f=.084+j*.035
        for k in range(15):
            x=lerp(-.056,.056,k/14);z=.099+.086*math.sqrt(max(.001,1-(x/.128)**2-((f-.089)/.205)**2))+.005
            points.append(V(sx+x,z,f))
        line('Lace_'+side+str(j),points,.006,'tee','foot_'+side)

# Hanging sunglasses: two rounded lenses with a slim bent frame.
for z in (1.073,.974):
    lens=sphere('Golden_lens',V(.017,z,.166),(.039,.010,.047),'gold','chest',n=24,m=16)
    outline=[V(.017+.042*math.cos(TAU*i/40),z+.050*math.sin(TAU*i/40),.179) for i in range(41)]
    line('Sunglass_rim',outline,.005,'frame','chest')
line('Sunglass_bridge',[V(.016,1.03,.179),V(.016,1.021,.18)],.006,'frame','chest')
line('Sunglass_arm',[V(.003,1.114,.174),V(.015,1.17,.141),V(.028,1.176,.122)],.006,'frame','chest')

# Existing 18-joint local-axis convention is kept exactly for the sample.
adata=bpy.data.armatures.new('subeike_skeleton');arm=bpy.data.objects.new('subeike_rig',adata);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
parents={'hips':'root','spine':'hips','chest':'spine','neck':'chest','head':'neck'}
for side in ('L','R'):parents.update({'upperArm_'+side:'chest','forearm_'+side:'upperArm_'+side,'hand_'+side:'forearm_'+side,'thigh_'+side:'hips','shin_'+side:'thigh_'+side,'foot_'+side:'shin_'+side})
for name,co in JOINTS.items():b=adata.edit_bones.new(name);b.head=co;b.tail=Vector(co)+Vector((0,0,.10));b.roll=0
for name,parent in parents.items():adata.edit_bones[name].parent=adata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for ob in PARTS:
    ob.parent=arm;mod=ob.modifiers.new('Dance deformation','ARMATURE');mod.object=arm

bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'subeike-sample.blend'))
# Four draw groups retain surface hierarchy and each part's authored color.
group_materials={}
for group,rough in [('skin',.56),('hair',.55),('cloth',.83),('gloss',.36)]:
    m=bpy.data.materials.new('Sample_'+group);m.use_nodes=True;bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.27
    vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='avatar_color';m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color']);group_materials[group]=m
for ob in PARTS:
    attr=ob.data.color_attributes.new(name='avatar_color',type='FLOAT_COLOR',domain='CORNER')
    old=list(ob.data.materials)
    for p in ob.data.polygons:
        rgba=old[p.material_index].diffuse_color
        for loop in p.loop_indices:attr.data[loop].color=rgba
    group=old[0]['surface_group'];ob.data.materials.clear();ob.data.materials.append(group_materials[group])
bpy.ops.object.select_all(action='DESELECT')
for ob in PARTS:ob.select_set(True)
bpy.context.view_layer.objects.active=PARTS[0];bpy.ops.object.join();joined=bpy.context.object;joined.name='Subeike_redesign_skin'
bpy.ops.object.select_all(action='DESELECT');joined.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(ROOT/'human-subeike-sample.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_yup=True,export_apply=False,export_extras=True)
tris=sum(len(p.vertices)-2 for p in joined.data.polygons)
(ROOT/'sample-metrics.json').write_text(json.dumps({'triangles':tris,'bytes':(ROOT/'human-subeike-sample.glb').stat().st_size,'rig':'club-v1-18-joints','material_groups':4,'purpose':'regeneration of user-approved shape; review before replacing shipping artifact','provenance':'Original geometry and materials authored for the supplied reference; no external assets'},indent=2))
print('SAMPLE_READY',tris,'triangles',flush=True)
