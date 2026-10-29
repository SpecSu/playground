import sys,math,json,hashlib
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from restyle_jiji_headwear import Editor,tube,ellipsoid,bounds
from test_neck_attachment import array
# Exact names only. Other workers' V10 hair/collar materials must survive.
REMOVE={
 'V9 graphite woven newsboy cap','V9 lime seam','V9 ivory felt beret','V9 champagne edge','V9 small pearl beret pin',
 'NativeFit graphite woven newsboy cap','NativeFit lime seam','NativeFit ivory felt beret','NativeFit champagne edge','NativeFit small pearl beret pin',
 'Cyber graphite anodized metal','Lime light piping','Ear cushion charcoal','Headphone brushed chrome',
 'Champagne gold tiara setting','Warm ivory pearls','Pearl crystal facets',
}

def crown(style):
 # Closed low-profile cloth crown, with small asymmetric beret ease.
 seg=96;v=[];f=[]
 levels=[(0,.950,.073,.056),(.20,.959,.078,.062),(.48,.979,.077,.064),(.75,1.001,.058,.052),(.93,1.014,.027,.025),(1,1.017,.001,.001)] if style==1 else [(0,.952,.061,.052),(.2,.961,.076,.064),(.48,.980,.085,.070),(.75,1.002,.069,.058),(.93,1.015,.034,.029),(1,1.019,.001,.001)]
 from scipy.interpolate import PchipInterpolator
 base=np.array(levels);levels=PchipInterpolator(base[:,0],base,axis=0)(np.linspace(0,1,33)).tolist()
 for t,y,rx,rz in levels:
  for j in range(seg):
   a=2*math.pi*j/seg;fold=1+(.018*math.cos(8*a)*math.sin(math.pi*t) if style==1 else .009*math.cos(7*a)*math.sin(math.pi*t));tilt=(.009*math.sin(a)*rz/.070 if style==2 else 0)*t
   v.append([.026+rx*math.cos(a)*fold-(.004*t if style==2 else 0),(.952+(y-.952)*.78 if style==2 else .950+(y-.950)*.82)+tilt,.008+rz*math.sin(a)*fold+(.016*t if style==2 else 0)])
 for k in range(len(levels)-1):
  for j in range(seg):
   a=k*seg+j;b=k*seg+(j+1)%seg;c=b+seg;d=a+seg;f.extend([[a,b,c],[a,c,d]])
 for ring in [0,len(levels)-1]:
  center=len(v);v.append(np.mean(v[ring*seg:(ring+1)*seg],0).tolist())
  for j in range(seg):f.append([center,ring*seg+(j+1)%seg,ring*seg+j] if ring==0 else [center,ring*seg+j,ring*seg+(j+1)%seg])
 return v,f

def visor():
 # Rounded short crescent visor: inner edge follows band, outer edge rises away from eyes.
 v=[];f=[];n=48
 for depth in [0,1]:
  for row in range(5):
   r=row/4
   for j in range(n+1):
    a=-1.05+2.10*j/n;ext=.042*max(0,math.cos(a/1.05*math.pi/2))**.65
    v.append([.026+.061*math.cos(a)+r*ext,.950-.006*r+.003*r*r-depth*.002,.008+(.052+.006*r)*math.sin(a)])
 stride=5*(n+1)
 for depth in [0,1]:
  for row in range(4):
   for j in range(n):
    a=depth*stride+row*(n+1)+j;b=a+1;c=b+n+1;d=a+n+1
    f.extend([[a,b,c],[a,c,d]] if not depth else [[a,c,b],[a,d,c]])
 border=list(range(n+1))+[r*(n+1)+n for r in range(1,5)]+list(range(4*(n+1)+n-1,4*(n+1)-1,-1))+[r*(n+1) for r in range(3,0,-1)]
 for a,b in zip(border,border[1:]+border[:1]):f.extend([[a,a+stride,b+stride],[a,b+stride,b]])
 return v,f

def apply(source,dest,style):
 ed=Editor(source);d=ed.d;off=np.zeros(3);head=d['meshes'][0];skin=d['skins'][0];joint=next(i for i,n in enumerate(skin['joints']) if d['nodes'][n]['name']=='mixamorig:Head')
 removed=[d['materials'][p['material']]['name'] for p in head['primitives'] if d['materials'][p['material']]['name'] in REMOVE]
 head['primitives']=[p for p in head['primitives'] if d['materials'][p['material']]['name'] not in REMOVE]
 cloth=ed.material('NativeFit graphite woven newsboy cap' if style==1 else 'NativeFit ivory felt beret',(.018,.023,.025) if style==1 else (.72,.67,.54),0,.83)
 trim=ed.material('NativeFit lime seam' if style==1 else 'NativeFit champagne edge',(.37,.62,.035) if style==1 else (.48,.30,.095),.15 if style==1 else .65,.4)
 def add(shape,mat):
  v,f=shape;v=np.array(v);f=np.array(f)
  # Tailor only the independent hat; face, skull and hair never move.
  x=v[:,0]-.026;z=v[:,2]-.008;y=v[:,1]-.950
  if style==1:
   t=np.clip(y/.058,0,1)
   v[:,0]=.026+x*np.where(x<0,.88,.94)+.007*np.sin(np.pi*t*.8)
   v[:,2]=.008+z*.92
   v[:,1]=.955+y*.86-.045*(v[:,0]-.026)
   # Short convex visor, not a long horizontal blade.
   brim=y<.0005
   extension=np.maximum(v[:,0]-.090,0)
   v[brim,0]-=extension[brim]*.35
   v[brim,1]-=.003*np.clip(extension[brim]/.030,0,1)
  else:
   t=np.clip(y/.060,0,1)
   v[:,0]=.026+x*.91
   v[:,2]=.008+z*.91-.018*t
   # Crown tilts with its snug band; existing slight tilt is removed first.
   v[:,1]=.950+y*.85+(.025+.145*np.minimum(1,t*2))*(v[:,2]-.008)
  tfit=np.clip((v[:,1]-.950)/.055,0,1)
  v[:,1]+=(.006 if style==1 else .010)+.007*tfit
  # Native scalp is centered at Z=0, unlike the previous cropped donor.
  v[:,2]-=.008
  rear=np.clip((.035-v[:,0])/.05,0,1);rear=rear*rear*(3-2*rear)
  v[:,2]*=1-.23*rear
  v[:,0]+=.006
  volume=np.sum(np.einsum('ij,ij->i',v[f[:,0]],np.cross(v[f[:,1]],v[f[:,2]])))/6
  if volume<0:f=f[:,::-1]
  prim=ed.primitive(v,f,mat,joint,off)
  normals=np.array(array(d,ed.b,prim['attributes']['NORMAL']));normals/=np.maximum(np.linalg.norm(normals,axis=1),1e-30)[:,None];prim['attributes']['NORMAL']=ed.add(normals,'VEC3');head['primitives'].append(prim)
 add(crown(style),cloth)
 if style==1:
  add(visor(),cloth)
  vv=[];ff=[]
  for y,rx,rz in [(.947,.074,.057),(.957,.074,.057),(.957,.071,.054),(.947,.071,.054)]:
   vv.extend([[.026+rx*math.cos(a),y,.008+rz*math.sin(a)] for a in np.linspace(0,2*math.pi,96,endpoint=False)])
  for k in range(4):
   for j in range(96):
    a=k*96+j;b=k*96+(j+1)%96;c=((k+1)%4)*96+(j+1)%96;dd=((k+1)%4)*96+j;ff.extend([[a,b,c],[a,c,dd]])
  add((vv,ff),cloth)
 band=[[.026+(.0745 if style==1 else .065)*math.cos(t),.949 if style==1 else .954,.008+(.0575 if style==1 else .056)*math.sin(t)] for t in np.linspace(0,2*math.pi,97)];add(tube(band,.0014,8),trim)
 if style==1:
  # Eight subtle stitched crown panels; each follows the shaped crown.
  for a in []:
   pts=[]
   for t,y,rx,rz in [(0,.951,.061,.052),(.2,.960,.073,.062),(.48,.980,.078,.065),(.75,1.002,.059,.053),(.93,1.015,.028,.026)]:pts.append([.026+rx*math.cos(a),y,.008+rz*math.sin(a)])
   add(tube(pts,.00048,6),trim)
  add(ellipsoid((.026,1.006,.008),(.004,.002,.004),20,8),cloth)
 else:
  pearl=ed.material('NativeFit small pearl beret pin',(.87,.81,.68),.08,.25)
  for x,y,z,r in [(.105,.978,.039,.004),(.109,.970,.032,.003),(.098,.974,.047,.003)]:add(ellipsoid((x,y,z),(r,r,r),16,10),pearl)
  add(tube([[.106,.963,.037],[.105,.979,.039],[.094,.990,.046]],.0012,8),trim)
 d.setdefault('extras',{})['nativeHatFit']={'style':'graphite-newsboy' if style==1 else 'ivory-beret','sourceSHA256':hashlib.sha256(Path(source).read_bytes()).hexdigest(),'removedMaterials':removed,'existingFaceNeckHairUntouched':True,'nativeFrame':True,'coordinateTransform':'none; native crown fit v2, lower fitted band with full scalp clearance','bounds':bounds(d,ed.b)}
 ed.save(dest);print(json.dumps(d['extras']['nativeHatFit']))
if __name__=='__main__':apply(sys.argv[1],sys.argv[2],int(sys.argv[3]))
