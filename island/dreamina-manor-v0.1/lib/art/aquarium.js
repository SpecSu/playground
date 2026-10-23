import * as THREE from 'three';
import {SHARED_CELL_SIZE,GROUND_TOP_Y,TANK_BASE_HEIGHT,TANK_FLOOR_Y,TANK_OUTER_EDGE_INSET} from './physical-contract.js';
import {tankWaterHeight} from '../game/tank-space.js';

const key=(x,z)=>`${x},${z}`;
const area=p=>p.reduce((a,v,i)=>{const n=p[(i+1)%p.length];return a+v[0]*n[1]-n[0]*v[1]},0)/2;

/** Integer-cell perimeter. CCW outside, CW holes, so filled area always lies left. */
export function aquariumOutline(cells,cellSize=SHARED_CELL_SIZE,inset=TANK_OUTER_EDGE_INSET){
 const set=new Set(cells.map(c=>key(c.x,c.z))),edges=[];
 for(const {x,z}of cells){
  if(!set.has(key(x,z-1)))edges.push([[x-.5,z-.5],[x+.5,z-.5]]);
  if(!set.has(key(x+1,z)))edges.push([[x+.5,z-.5],[x+.5,z+.5]]);
  if(!set.has(key(x,z+1)))edges.push([[x+.5,z+.5],[x-.5,z+.5]]);
  if(!set.has(key(x-1,z)))edges.push([[x-.5,z+.5],[x-.5,z-.5]]);
 }
 const starts=new Map(),used=new Set(),loops=[];
 for(let i=0;i<edges.length;i++){const k=edges[i][0].join(',');if(!starts.has(k))starts.set(k,[]);starts.get(k).push(i);}
 for(let i=0;i<edges.length;i++){
  if(used.has(i))continue;
  const loop=[];let n=i;
  while(!used.has(n)){
   used.add(n);loop.push(edges[n][0]);const previous=edges[n],options=starts.get(previous[1].join(','));
   if(!options?.length)throw new Error('Open aquarium edge');
   const dx=previous[1][0]-previous[0][0],dz=previous[1][1]-previous[0][1];
   n=[...options].sort((a,b)=>{const turn=k=>{const e=edges[k],x=e[1][0]-e[0][0],z=e[1][1]-e[0][1];return Math.atan2(dx*z-dz*x,dx*x+dz*z)};return turn(b)-turn(a)})[0];
  }
  const points=loop.filter((v,j)=>{
   const p=loop[(j+loop.length-1)%loop.length],q=loop[(j+1)%loop.length];
   return (v[0]-p[0])*(q[1]-v[1])-(v[1]-p[1])*(q[0]-v[0])!==0;
  }).map(p=>p.map(v=>v*cellSize));
  const offset=points.map((v,j)=>{
   const p=points[(j+points.length-1)%points.length],q=points[(j+1)%points.length];
   const a=new THREE.Vector2(v[0]-p[0],v[1]-p[1]).normalize(),b=new THREE.Vector2(q[0]-v[0],q[1]-v[1]).normalize();
   const na=new THREE.Vector2(-a.y,a.x),nb=new THREE.Vector2(-b.y,b.x);
   const delta=na.add(nb).multiplyScalar(inset/(1+a.dot(b)));
   return [v[0]+delta.x,v[1]+delta.y];
  });
  loops.push({points:offset,hole:area(points)<0});
 }
 return loops;
}
function shapesFromOutline(loops){
 const outers=loops.filter(l=>!l.hole).map(l=>new THREE.Shape(l.points.map(([x,z])=>new THREE.Vector2(x,-z))));
 // One connected aquarium has one outer. Holes, if later formed, stay land not invisible water.
 if(outers.length!==1)throw new Error('Aquarium art requires exactly one connected body');
 for(const l of loops.filter(l=>l.hole))outers[0].holes.push(new THREE.Path(l.points.map(([x,z])=>new THREE.Vector2(x,-z))));
 return outers[0];
}

/** World-root group: do NOT position it again at tank centre. Full ground remains underneath. */
export function createAquariumArt({cells,cellSize=SHARED_CELL_SIZE,groundY=GROUND_TOP_Y,waterHeight=tankWaterHeight(cells??[])}={}){
 if(!cells?.length)throw new Error('Missing aquarium cells');
 const root=new THREE.Group();root.name='Art_ContinuousAboveGroundAquarium';
 const outline=aquariumOutline(cells,cellSize),shape=shapesFromOutline(outline);
 const floorY=groundY+(TANK_FLOOR_Y-GROUND_TOP_Y),surfaceY=floorY+waterHeight;
 const baseMaterial=new THREE.MeshStandardMaterial({color:'#D8D0B8',roughness:.67});
 const floorMaterial=new THREE.MeshStandardMaterial({color:'#AFCEC2',roughness:.61});
 const glassMaterial=new THREE.MeshPhysicalMaterial({color:'#C3DFDD',roughness:.16,metalness:0,transparent:true,opacity:.15,depthWrite:false,side:THREE.DoubleSide});
 const rimMaterial=new THREE.MeshStandardMaterial({color:'#DDE4D4',roughness:.40});
 const surfaceMaterial=new THREE.MeshPhysicalMaterial({color:'#65B6BA',roughness:.28,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide});
 // A soft, low-contrast grounding wash extends 12 cm beyond the thin plinth.
 // It is not a cutout: the original turf and its full cell thickness stay intact.
 const outer=aquariumOutline(cells,cellSize,TANK_OUTER_EDGE_INSET-.12),cp=[],cu=[],ci=[];
 for(let k=0;k<outline.length;k++){const a=outline[k].points,b=outer[k].points;for(let i=0;i<a.length;i++){const j=(i+1)%a.length,n=cp.length/3;for(const p of [a[i],a[j],b[j],b[i]])cp.push(p[0],groundY+.003,p[1]);cu.push(0,0,1,0,1,1,0,1);ci.push(n,n+1,n+2,n,n+2,n+3);}}
 const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(cp,3));cg.setAttribute('uv',new THREE.Float32BufferAttribute(cu,2));cg.setIndex(ci);
 const cm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){gl_FragColor=vec4(.17,.25,.21,.15*pow(1.-vUv.y,1.6));}'});
 const contact=new THREE.Mesh(cg,cm);contact.name='SoftPlinthContact';root.add(contact);
 const baseGeometry=new THREE.ExtrudeGeometry(shape,{depth:TANK_BASE_HEIGHT-.03,bevelEnabled:true,bevelSize:.025,bevelThickness:.015,bevelSegments:2,steps:1});
 baseGeometry.rotateX(-Math.PI/2);
 const base=new THREE.Mesh(baseGeometry,baseMaterial);base.name='ThinAboveGroundPlinth';base.position.y=groundY+.015;base.receiveShadow=true;base.castShadow=true;root.add(base);
 const floorGeometry=new THREE.ShapeGeometry(shape);floorGeometry.rotateX(-Math.PI/2);
 const floor=new THREE.Mesh(floorGeometry,floorMaterial);floor.name='ReadableBlueGreenFloor';floor.position.y=floorY;floor.receiveShadow=true;root.add(floor);
 const water=new THREE.Mesh(floorGeometry.clone(),surfaceMaterial);water.name='ContinuousWaterSurface';water.position.y=surfaceY;water.renderOrder=3;root.add(water);
 const edges=[];
 for(const loop of outline)for(let i=0;i<loop.points.length;i++){
  const a=loop.points[i],b=loop.points[(i+1)%loop.points.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=Math.atan2(-dz,dx);
  const glass=new THREE.Mesh(new THREE.BoxGeometry(length,waterHeight+.08,.035),glassMaterial);glass.name='OuterGlassOnly';glass.position.set((a[0]+b[0])/2,floorY+(waterHeight+.08)/2,(a[1]+b[1])/2);glass.rotation.y=angle;glass.renderOrder=4;root.add(glass);
  for(const [name,y,w]of [['ThinTopRim',surfaceY+.08,.045],['ThinBottomRim',floorY+.018,.065]]){
   const rim=new THREE.Mesh(new THREE.BoxGeometry(length,w,w),rimMaterial);rim.name=name;rim.position.set((a[0]+b[0])/2,y,(a[1]+b[1])/2);rim.rotation.y=angle;root.add(rim);
  }
  edges.push({a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]}});
 }
 root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);
 root.userData={artWorldRoot:true,floorY,surfaceY,waterHeight,landCutout:false,outline,sharedGlassCount:0};
 return {root,bounds,floorY,surfaceY,waterHeight,outline,edges,dispose(){
  const geos=new Set(),mats=new Set();root.traverse(n=>{if(n.isMesh){geos.add(n.geometry);mats.add(n.material);}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
 }};
}
