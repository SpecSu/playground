/** Artist-authored one-cell boardwalk and one fixed rod station. No inventory/game state. */
import * as THREE from 'three';
import {SHARED_CELL_SIZE,GROUND_TOP_Y,SEA_SURFACE_Y} from './physical-contract.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
const TAU=Math.PI*2;
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
function box(parent,name,w,h,d,position,material,r=.025){
 const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,r),material);m.name=name;m.position.copy(position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function segment(parent,name,radius,material){
 const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,1,7),material);m.name=name;m.castShadow=true;parent.add(m);return m;
}
function setSegment(mesh,a,b){const delta=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=delta.length();mesh.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize());}
function loopMesh(radius,tube,material){const m=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,5,32),material);m.rotation.x=-Math.PI/2;return m;}

/** Local root, topY=0, place at groundY and rotate +Z toward the sea. */
export function createDockArt({cellSize=SHARED_CELL_SIZE}={}){
 const root=new THREE.Group();root.name='Art_ModularDock';
 const wood=new THREE.MeshStandardMaterial({color:'#A5754F',roughness:.62});
 const lightWood=new THREE.MeshStandardMaterial({color:'#B48459',roughness:.63});
 const edge=new THREE.MeshStandardMaterial({color:'#805B3E',roughness:.71});
 const rope=new THREE.MeshStandardMaterial({color:'#B7A078',roughness:.88});
 const boardCount=8,gap=.035,step=cellSize/boardCount;
 for(let i=0;i<boardCount;i++){
  box(root,'RoundedWarmWoodBoard',cellSize-.04,.14,step-gap,v(0,-.07,-cellSize/2+(i+.5)*step),i%3===0?lightWood:wood,.022);
 }
 for(const x of [-cellSize/2+.12,cellSize/2-.12]){
  box(root,'UndersideRail',.16,.24,cellSize-.02,v(x,-.25,0),edge,.025);
  for(const z of [-cellSize/2+.25,cellSize/2-.25]){
   const post=new THREE.Mesh(new THREE.CylinderGeometry(.12,.105,.80,12),edge);post.position.set(x,-.35,z);post.castShadow=true;root.add(post);
   const cap=new THREE.Mesh(new THREE.CylinderGeometry(.133,.133,.055,16),lightWood);cap.position.set(x,.07,z);cap.castShadow=true;root.add(cap);
   const wrap=loopMesh(.126,.018,rope);wrap.position.set(x,.015,z);root.add(wrap);
  }
 }
 root.userData={cellSize,topLocalY:0,outwardLocalAxis:'+Z',noWholeWorldScale:true};
 return {root,stationLocal:{x:0,y:0,z:0},walkTargetLocal:{x:0,y:0,z:.25},dispose:()=>disposeGroup(root)};
}

/** Fixed rod. Working/mature variations are authored poses; caller supplies factual state. */
export function createRodStationArt(){
 const root=new THREE.Group();root.name='Art_FixedRodStation';
 const warmWood=new THREE.MeshStandardMaterial({color:'#926640',roughness:.57});
 const charcoal=new THREE.MeshStandardMaterial({color:'#31504A',roughness:.38});
 const metal=new THREE.MeshStandardMaterial({color:'#8D998D',roughness:.32,metalness:.45});
 const lineMat=new THREE.MeshBasicMaterial({color:'#DAD9B9',transparent:true,opacity:.88});
 const ropeMat=new THREE.MeshStandardMaterial({color:'#52796A',roughness:.8});
 const accentMat=new THREE.MeshStandardMaterial({color:'#D5B260',roughness:.4,metalness:.28});
 const floatMat=new THREE.MeshStandardMaterial({color:'#BD664B',roughness:.45});
 const creamMat=new THREE.MeshStandardMaterial({color:'#EBDEBC',roughness:.48});
 box(root,'SmallRodRest',.42,.1,.62,v(0,.05,1.36),warmWood,.035);
 const rest=segment(root,'RodRestPeg',.047,warmWood);setSegment(rest,v(0,.10,1.36),v(0,.58,1.36));
 const collar=new THREE.Mesh(new THREE.TorusGeometry(.08,.018,5,12),metal);collar.position.set(0,.58,1.36);root.add(collar);
 const ring=loopMesh(.43,.025,ropeMat);ring.name='IdleStationRope';ring.position.set(0,.04,1.24);root.add(ring);
 const matureRing=loopMesh(.47,.027,accentMat);matureRing.name='PersistentMatureRing';matureRing.position.set(0,.055,1.24);root.add(matureRing);
 const rods=Array.from({length:9},(_,i)=>segment(root,'FlexibleRod_'+i,.028*(1-i*.055),charcoal));
 const reel=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.075,16),metal);reel.rotation.z=Math.PI/2;reel.position.set(.08,.72,1.53);root.add(reel);
 const castGroup=new THREE.Group();castGroup.name='VisibleCastAndFloat';root.add(castGroup);
 const fishingLine=segment(castGroup,'FishingLine',.008,lineMat);
 const float=new THREE.Group();float.name='RespondingFloat';castGroup.add(float);
 const body=new THREE.Mesh(new THREE.SphereGeometry(.1,14,8),floatMat);body.scale.set(.85,1.6,.85);float.add(body);
 const cap=new THREE.Mesh(new THREE.SphereGeometry(.077,12,8),creamMat);cap.position.y=.11;cap.scale.y=.5;float.add(cap);
 const floatStem=segment(float,'FloatStem',.018,creamMat);setSegment(floatStem,v(0,.1,0),v(0,.34,0));
 const waterRing=loopMesh(.30,.013,accentMat);waterRing.name='MatureSurfacePulse';castGroup.add(waterRing);
 const curve=new THREE.CubicBezierCurve3();
 const base=v(0,.59,1.36),p1=v(.035,1.55,1.9),p2=v(.17,1.95,2.65),tip=v(.25,1.62,3.44);
 let lastState='idle';
 function pose({state='idle',time=0,readyAge=Infinity,reducedMotion=false}={}){
  const ready=state==='ready',active=ready||state==='working';lastState=state;
  castGroup.visible=active;matureRing.visible=ready;ring.visible=!ready;
  // Continual low-frequency tug, not an attention loop that stops after a timer.
  const beat=reducedMotion?0:Math.max(0,Math.sin(time*TAU/3.2));
  const pull=ready?(reducedMotion?.25:.22+.38*beat*beat):(active&&!reducedMotion?.025*Math.sin(time*1.7):0);
  const arrival=ready&&!reducedMotion&&readyAge>=0&&readyAge<1.2?Math.sin(Math.PI*readyAge/1.2)**2:0;
  curve.v0.copy(base);curve.v1.copy(p1);curve.v2.copy(p2).add(v(0,-pull*.45,arrival*.04));curve.v3.copy(tip).add(v(0,-pull-arrival*.26,.12*pull));
  for(let i=0;i<rods.length;i++)setSegment(rods[i],curve.getPoint(i/rods.length),curve.getPoint((i+1)/rods.length));
  float.position.set(.25+(reducedMotion?0:Math.sin(time*1.1)*.035),SEA_SURFACE_Y-GROUND_TOP_Y+.035-pull*.32-arrival*.14,3.88);
  setSegment(fishingLine,curve.v3,float.position.clone().add(v(0,.2,0)));
  body.material=ready?accentMat:floatMat;
  waterRing.visible=ready;waterRing.position.set(float.position.x,SEA_SURFACE_Y-GROUND_TOP_Y+.025,float.position.z);
  const pulse=reducedMotion?1:1+.65*beat+arrival*.75;waterRing.scale.setScalar(pulse);
  matureRing.scale.setScalar(reducedMotion?1:1+.035*beat);
 }
 pose();
 root.userData={artPoseController:true,hitTargetIncludes:['SmallRodRest','FlexibleRod','RespondingFloat'],outwardLocalAxis:'+Z'};
 return {root,pose,get state(){return lastState},floatLocal:()=>float.position.clone(),rodTipLocal:()=>curve.v3.clone(),dispose:()=>disposeGroup(root)};
}
function disposeGroup(root){const g=new Set(),m=new Set();root.traverse(n=>{if(n.isMesh){g.add(n.geometry);m.add(n.material);}});g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());}
