import * as THREE from 'three';
import { createFishingWaterMaterial } from './fishing-water.ts';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export const FISHING_DECK_Y=1.54;
export const FISHING_YACHT_BEAM_SCALE=.73;
export const FISHING_SEATS=Array.from({length:10},(_,i)=>({x:(i%2===0?-3.05:3.05)*FISHING_YACHT_BEAM_SCALE,y:FISHING_DECK_Y,z:5.7-Math.floor(i/2)*1.62,heading:i%2===0?-Math.PI/2:Math.PI/2}));
export const FISHING_AMBIENT_SEATS=[{x:-1.5,y:3.58,z:-2.7,heading:-Math.PI/2},{x:1.5,y:3.58,z:-2.7,heading:Math.PI/2}];
export const FISHING_RENDER_SEATS=[...FISHING_SEATS,...FISHING_AMBIENT_SEATS];
export function catchDisplayScale(lengthCm:number){return Math.min(3.7,Math.max(.22,Math.pow(lengthCm/100,.73)*.85));}
export function disposeObject(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){if(o.geometry)geometries.add(o.geometry);const material=o.material;(Array.isArray(material)?material:[material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
export function createYachtWorld(){
 const scene=new THREE.Scene();scene.name='Azure Yacht · 出海钓鱼';scene.background=new THREE.Color('#65bdeb');scene.fog=new THREE.Fog('#a7dcf1',65,210);
 scene.add(new THREE.HemisphereLight('#e4faff','#146a91',2.3));const sun=new THREE.DirectionalLight('#fff0cf',3.2);sun.position.set(-16,25,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-14;sun.shadow.camera.right=14;sun.shadow.camera.top=16;sun.shadow.camera.bottom=-16;sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;scene.add(sun);const fill=new THREE.DirectionalLight('#93cfff',1);fill.position.set(15,12,-15);scene.add(fill);
 const mat=(color:string,roughness=.42,metalness=.05)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
 const white=mat('#fcfaf2',.28),teak=mat('#d8b88b',.65),woodLine=mat('#b58e63',.7),chrome=mat('#b8d3de',.22,.7),navy=mat('#12364e',.2,.4),glass=new THREE.MeshPhysicalMaterial({color:'#338eaa',roughness:.1,metalness:.32,transparent:true,opacity:.87,clearcoat:1}),cushion=mat('#efede6',.82),coral=mat('#f8896a',.6);
 const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const box=(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number,r=.08)=>mesh(new RoundedBoxGeometry(w,h,d,2,r),material,parent,x,y,z);
 const rod=(parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,r:number,material:THREE.Material)=>{const v=b.clone().sub(a);const m=mesh(new THREE.CylinderGeometry(r,r,v.length(),8),material,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;};
 const oceanGeo=new THREE.PlaneGeometry(280,280,180,180);oceanGeo.rotateX(-Math.PI/2);const waterSurface=createFishingWaterMaterial();const oceanMat=waterSurface.material;const ocean=mesh(oceanGeo,oceanMat,scene,0,-.17,0);ocean.name='Moving turquoise sea';ocean.castShadow=false;
 const underwater=mesh(new THREE.PlaneGeometry(2000,2000),mat('#169fc2'),scene,0,-2,0);underwater.name='Deep ocean floor';underwater.rotation.x=-Math.PI/2;underwater.castShadow=false;
 const yacht=new THREE.Group();yacht.name='Luxury yacht';scene.add(yacht);
 const hullShape=new THREE.Shape();hullShape.moveTo(-3.9,-6.8);hullShape.lineTo(3.9,-6.8);hullShape.quadraticCurveTo(4.5,-5.7,4.45,-2);hullShape.lineTo(3.7,5.6);hullShape.quadraticCurveTo(3,8,0,10);hullShape.quadraticCurveTo(-3,8,-3.7,5.6);hullShape.lineTo(-4.45,-2);hullShape.quadraticCurveTo(-4.5,-5.7,-3.9,-6.8);
 const hullGeo=new THREE.ExtrudeGeometry(hullShape,{depth:1.3,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.2,bevelThickness:.16,curveSegments:14});hullGeo.rotateX(-Math.PI/2);const hull=mesh(hullGeo,white,yacht,0,-.06,0);hull.name='Sculpted ivory hull';
 const deckGeo=new THREE.ExtrudeGeometry(hullShape,{depth:.07,bevelEnabled:true,bevelSegments:2,bevelSize:.06,bevelThickness:.03,curveSegments:14});deckGeo.rotateX(-Math.PI/2);const deck=mesh(deckGeo,teak,yacht,0,1.42,0);deck.name='Teak main deck';
 for(let x=-4;x<=4;x+=.28){const maxZ=6.55,minZ=-(9.2-Math.pow(Math.abs(x)/4,1.4)*4.5);box(yacht,.018,.012,maxZ-minZ,woodLine,x,1.52,(maxZ+minZ)/2,.004);}
 // Slender navy waterline and portholes make the craft read as a premium yacht.
 for(const sign of [-1,1]){box(yacht,.065,.18,8.4,navy,sign*4.34,.67,1.75,.03);for(let z=-3.4;z<6;z+=1.5){const p=mesh(new THREE.CylinderGeometry(.18,.18,.05,20),navy,yacht,sign*(z<0?4.05:4.35),.97,z);p.rotation.z=Math.PI/2;}}
 box(yacht,5.5,.26,2.1,white,0,.7,7.25,.17);box(yacht,4.9,.06,1.7,teak,0,.86,7.28,.06);for(let x=-2;x<=2;x+=.35)box(yacht,.017,.008,1.5,woodLine,x,.897,7.3,.003);
 // Panoramic bridge, floating roof and upholstered forward lounge.
 box(yacht,5.7,1.65,4.8,white,0,2.35,-4.2,.45);box(yacht,5.9,.9,3.8,glass,0,2.85,-4.15,.36);box(yacht,6.25,.28,5.2,white,0,3.42,-4.3,.25);box(yacht,4.4,.08,2.3,navy,0,3.61,-4.8,.06);box(yacht,4.15,.065,2.1,glass,0,3.66,-4.8,.05);
 box(yacht,3.8,.46,2.15,cushion,0,1.76,-7.4,.23);box(yacht,3.6,.5,.4,cushion,0,2.13,-6.56,.17);box(yacht,.8,.22,.75,coral,-1.1,2.1,-7.05,.13);box(yacht,.8,.22,.75,navy,1.1,2.1,-7.05,.13);
 rod(yacht,new THREE.Vector3(0,3.6,-3),new THREE.Vector3(0,5.25,-3),.055,chrome);rod(yacht,new THREE.Vector3(-.9,4.9,-3),new THREE.Vector3(.9,4.9,-3),.035,chrome);mesh(new THREE.SphereGeometry(.16,12,10),white,yacht,0,5.3,-3);
 // Rail with an open aft gate, repeated stations visually independent of guests.
 for(const sign of [-1,1]){const points:THREE.Vector3[]=[];for(let z=6;z>=-5;z-=1.1){const x=sign*(z< -2?4.1:4.25);rod(yacht,new THREE.Vector3(x,1.5,z),new THREE.Vector3(x,2.18,z),.028,chrome);points.push(new THREE.Vector3(x,2.18,z));}for(let i=1;i<points.length;i++)rod(yacht,points[i-1],points[i],.04,chrome);rod(yacht,new THREE.Vector3(sign*4.1,2.18,-5),new THREE.Vector3(sign*2.6,2.18,-7.8),.04,chrome);rod(yacht,new THREE.Vector3(sign*2.6,2.18,-7.8),new THREE.Vector3(0,2.18,-9.5),.04,chrome);}
 for(const x of [-2.65,2.65]){rod(yacht,new THREE.Vector3(x,1.5,6.7),new THREE.Vector3(x,2.12,6.7),.032,chrome);rod(yacht,new THREE.Vector3(x,2.12,6.7),new THREE.Vector3(Math.sign(x)*4.2,2.12,6.4),.04,chrome);}
 // Relaxed aft social area stays clear of the ten fishing berths.
 box(yacht,2.7,.5,.68,cushion,0,1.83,-.94,.15);box(yacht,2.7,.6,.21,cushion,0,2.2,-1.24,.1);box(yacht,.65,.18,.5,coral,-.75,2.1,-.91,.08);box(yacht,.65,.18,.5,navy,.75,2.1,-.91,.08);
 const table=mesh(new THREE.CylinderGeometry(.63,.67,.1,32),white,yacht,0,2.1,.55);table.name='Cocktail table';rod(yacht,new THREE.Vector3(0,1.5,.55),new THREE.Vector3(0,2.1,.55),.07,chrome);for(const x of [-.25,.2]){mesh(new THREE.CylinderGeometry(.07,.06,.17,12),glass,yacht,x,2.23,.53);rod(yacht,new THREE.Vector3(x,2.27,.53),new THREE.Vector3(x+.025,2.48,.53),.008,coral);}
 // A folded parasol, life ring, bollards and warm brass trims.
 const ring=mesh(new THREE.TorusGeometry(.4,.11,10,32),coral,yacht,-4.28,1.81,4.4);ring.rotation.y=Math.PI/2;for(const z of [-1.3,5.8])for(const x of [-3.9,3.9]){mesh(new THREE.CylinderGeometry(.11,.11,.18,12),chrome,yacht,x,1.65,z);rod(yacht,new THREE.Vector3(x-.22,1.75,z),new THREE.Vector3(x+.22,1.75,z),.065,chrome);}
 // Narrow only the authored craft, baking the world-axis width into its geometry.
 // Keeping yacht.scale at (1,1,1) preserves every later avatar's natural proportions.
 for(const child of yacht.children){if(child instanceof THREE.Mesh){child.updateMatrix();child.geometry.applyMatrix4(child.matrix);child.geometry.scale(FISHING_YACHT_BEAM_SCALE,1,1);child.position.set(0,0,0);child.quaternion.identity();child.scale.set(1,1,1);child.updateMatrix();}}
 // Keep the two upper-deck positions safe; station markers are shown only for an eligible player.
 const upperRails=new THREE.Group();upperRails.name='Upper-deck safety rail';yacht.add(upperRails);
 for(const sign of [-1,1]){for(const z of [-6.45,-5,-3.55,-2.05])rod(upperRails,new THREE.Vector3(sign*2.12,3.53,z),new THREE.Vector3(sign*2.12,4.04,z),.02,chrome);rod(upperRails,new THREE.Vector3(sign*2.12,4.04,-6.45),new THREE.Vector3(sign*2.12,4.04,-2.05),.028,chrome);rod(upperRails,new THREE.Vector3(sign*2.12,4.04,-2.05),new THREE.Vector3(sign*.5,4.04,-2.05),.025,chrome);}
 // White concentric lights sit just above each physical station. The transparent
 // center enlarges the tap target without drawing a filled disc over the teak.
 const seatMarkers=FISHING_RENDER_SEATS.map((seat,slot)=>{
  const root=new THREE.Group();root.name=`Fishing station ${slot+1}`;root.userData.slot=slot;root.visible=false;
  root.position.set(seat.x,seat.y+.065,seat.z);yacht.add(root);
  const material=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.92,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.50,48),material);ring.rotation.x=-Math.PI/2;ring.name='White station ring';root.add(ring);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.38,.62,48),material.clone());halo.rotation.x=-Math.PI/2;halo.position.y=-.002;halo.material.opacity=.16;root.add(halo);
  const hit=new THREE.Mesh(new THREE.CircleGeometry(.65,32),material.clone());hit.rotation.x=-Math.PI/2;hit.position.y=.004;hit.material.opacity=0;hit.userData.seatHit=true;root.add(hit);
  return {root,ring,halo,hit};
 });
 // Soft, low-poly volumes make white clouds visible from every deck-facing angle.
 const clouds=new THREE.Group();clouds.name='White cloudscape';clouds.rotation.y=-.12;scene.add(clouds);
 const cloudMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,metalness:0,emissive:'#e8f5ff',emissiveIntensity:.22});
 const cloudGeometry=new THREE.SphereGeometry(1,12,8);
 for(let i=0;i<22;i++){
  const cloud=new THREE.Group(),angle=i*Math.PI*2/22+.2,radius=78+(i%3)*14;
  cloud.position.set(Math.cos(angle)*radius,6+(i%4)*1.15,Math.sin(angle)*radius);cloud.rotation.y=Math.PI/2-angle;
  clouds.add(cloud);
  for(let j=0;j<5;j++){
   const puff=mesh(cloudGeometry,cloudMaterial,cloud,(j-2)*2.15,Math.sin(j*.9+i)*.4,Math.cos(j*1.8)*.7);
   puff.scale.set(2.5+(j%2)*.6,1.0+Math.sin(j*.8)*.7,1.6);puff.castShadow=false;puff.receiveShadow=false;
  }
 }
 const islandMat=mat('#78bfb1',.95),sand=mat('#e8d6ac',.9),leaf=mat('#479c89',.8);for(const [x,z,s] of [[-42,-42,1],[37,-62,1.5],[-30,-76,.7]]){const island=new THREE.Group();island.position.set(x,-.35,z);island.scale.setScalar(s);scene.add(island);const mound=mesh(new THREE.SphereGeometry(1,16,12),sand,island);mound.scale.set(8,1.4,4);const hill=mesh(new THREE.SphereGeometry(1,16,12),islandMat,island,0,.45,-.8);hill.scale.set(6,1.5,2.6);for(const tx of [-2,2]){rod(island,new THREE.Vector3(tx,.8,0),new THREE.Vector3(tx+.4,5,0),.12,woodLine);for(let j=0;j<5;j++){const frond=mesh(new THREE.SphereGeometry(1,10,6),leaf,island,tx+.4+Math.cos(j*1.25),4.75,Math.sin(j*1.25));frond.scale.set(2,.13,.45);frond.rotation.y=-j*1.25;frond.rotation.z=.13;}}}
 const birds=new THREE.Group();birds.name='Sea birds';scene.add(birds);const birdMat=new THREE.LineBasicMaterial({color:'#547e92'});for(let i=0;i<8;i++){const b=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.4,0,0),new THREE.Vector3(0,-.12,0),new THREE.Vector3(.4,0,0)]),birdMat);b.position.set(-25+i*7,8+(i%3)*2,-30-(i%2)*12);birds.add(b);}
 const positions=oceanGeo.attributes.position;let lastNormals=-Infinity,lastReducedMotion:boolean|undefined;
 const waveHeight=(x:number,z:number,t:number)=>Math.sin(x*.38+z*.14+t*.65)*.22+Math.sin(z*.29-x*.11+t*.47)*.13+Math.sin((x+z)*.58-t*.62)*.065;
 /** Absolute surface height, shared with fishing floats and line endpoints. */
 const waterHeightAt=(x:number,z:number,time:number,reducedMotion=false)=>ocean.position.y+waveHeight(x,z,reducedMotion?0:time);
 function animate(time:number,reducedMotion=false){
  const t=reducedMotion?0:time;
  yacht.position.y=Math.sin(t*.55)*.14;yacht.rotation.z=Math.sin(t*.42)*.018;yacht.rotation.x=Math.sin(t*.36)*.01;
  for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,waveHeight(x,z,t));}
  positions.needsUpdate=true;
  if(time-lastNormals>.15||lastReducedMotion!==reducedMotion){oceanGeo.computeVertexNormals();lastNormals=time;lastReducedMotion=reducedMotion;}
  waterSurface.animate(time,reducedMotion);
  clouds.position.x=Math.sin(t*.018)*1.4;birds.position.x=Math.sin(t*.04)*5;
 }
 animate(0);return {scene,yacht,deck,ocean,seatMarkers,seats:FISHING_SEATS,waterHeightAt,animate,dispose(){waterSurface.dispose();disposeObject(scene);}};
}
