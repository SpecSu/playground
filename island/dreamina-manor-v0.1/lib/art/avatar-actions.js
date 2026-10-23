import * as THREE from 'three';
export const ART_ACTION_DURATION_MS=Object.freeze({plant:1100,harvest:700,fish:700,place:650});
/** Additive art pose. Call after controller.update each frame, which resets the original rig.
 * No timing, inventory, position or transaction decisions live here. Avatar +Z faces target. */
export function createAvatarActionPose(rig){
 const bones=new Map();rig.root.traverse(n=>{if(n.isBone)bones.set(n.name,n);});
 const q=new THREE.Quaternion(),e=new THREE.Euler();
 // The original cast includes quadrupeds and differently authored elbows. Choose the
 // small reach direction from each real joint axis, rather than forcing human signs.
 rig.root.updateMatrixWorld(true);
 const forward=new THREE.Vector3(0,0,1).applyQuaternion(rig.root.getWorldQuaternion(new THREE.Quaternion()));
 const reachAxes={};
 for(const side of ['L','R'])for(const segment of ['upperArm','forearm']){
  const b=bones.get(`${segment}_${side}`),hand=bones.get(`hand_${side}`);let chosen={axis:0,sign:-1,strength:0};
  if(b&&hand){const lever=hand.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3()));
   for(let axis=0;axis<3;axis++){const basis=new THREE.Vector3().setComponent(axis,1).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));const derivative=basis.cross(lever).dot(forward);if(Math.abs(derivative)>chosen.strength)chosen={axis,sign:Math.sign(derivative),strength:Math.abs(derivative)};}}
  reachAxes[`${segment}_${side}`]=chosen;
 }
 const turn=(name,x=0,y=0,z=0)=>{const b=bones.get(name);if(b)b.quaternion.multiply(q.setFromEuler(e.set(x,y,z))).normalize();};
 const reachTurn=(name,angle)=>{const a=reachAxes[name],v=[0,0,0];if(a){v[a.axis]=a.sign*angle;turn(name,...v);}};
 const smooth=t=>t*t*(3-2*t);
 function pose({action,progress=0,reducedMotion=false,holding=false}={}){
  if(!action)return;
  const p=THREE.MathUtils.clamp(progress,0,1);
  // Settle into intent, make contact at mid-action, then stand. No extra blocking duration.
  const reach=smooth(Math.min(1,p/.30))*(1-smooth(Math.max(0,(p-.70)/.30)));
  const pulse=reducedMotion?reach*.55:reach;
  const isFish=['fish','钓','cast'].includes(action),isPlace=['place','放'].includes(action),isPlant=['plant','播种'].includes(action);
  const bend=isPlant?.25:isFish?.055:isPlace?.10:.17;
  turn('hips',bend*pulse);turn('spine',(isPlant?.17:bend*.65)*pulse);turn('head',(isPlant?.16:.10)*pulse);
  turn('thigh_L',(isPlant?-.14:-.07)*pulse);turn('thigh_R',(isPlant?-.14:-.07)*pulse);
  turn('shin_L',(isPlant?.22:.11)*pulse);turn('shin_R',(isPlant?.22:.11)*pulse);
  // A carried object remains on the left. The free right hand can still sow.
  if(!holding||isPlant){
   const flick=isPlant&&!reducedMotion&&p>.33&&p<.70?Math.sin((p-.33)/.37*Math.PI*4)*Math.sin((p-.33)/.37*Math.PI):0;
   reachTurn('upperArm_R',(isPlant?.72:isFish?.46:.38)*pulse);turn('upperArm_R',0,0,-.10*pulse);
   reachTurn('forearm_R',(isPlant?.38:.18)*pulse);turn('hand_R',.10*pulse+.18*flick,0,.12*flick);
  }
  if(!holding){
   reachTurn('upperArm_L',(isPlace?.30:.17)*pulse);turn('upperArm_L',0,0,.035*pulse);
   reachTurn('forearm_L',.10*pulse);
  }
  rig.root.updateMatrixWorld(true);rig.root.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});
 }
 pose.handWorld=(out=new THREE.Vector3())=>(bones.get('hand_R')??rig.root).getWorldPosition(out);
 return pose;
}
/** Crop lifts towards the hand in the final quarter, never erupts in a whole-world scale pop. */
export function plantHarvestAccent(progress,reducedMotion=false){
 const p=THREE.MathUtils.clamp(progress,0,1),lift=Math.max(0,(p-.35)/.65);
 return {liftY:reducedMotion?0:.18*lift*lift,tiltZ:reducedMotion?0:Math.sin(p*Math.PI)*.055,scale:1};
}

/** World-root sowing accent. No species, reward, inventory or random outcome is fabricated.
 * Call after the original-rig pose. Leave pending=true only until the real receipt arrives.
 * Failure/cancellation: root.visible=false or dispose; never replay the whole action. */
export function createSowingAccent({groundY=.45}={}){
 const root=new THREE.Group();root.name='NeutralSowingAccent';root.visible=false;
 const soil=new THREE.MeshStandardMaterial({color:'#947752',roughness:.94});
 const seedMat=new THREE.MeshStandardMaterial({color:'#E5D2A0',roughness:.7});
 const leafMat=new THREE.MeshStandardMaterial({color:'#68855B',roughness:.86});
 const pebbleGeo=new THREE.IcosahedronGeometry(.045,0),leafGeo=new THREE.SphereGeometry(.11,10,6);
 const spot=new THREE.Group();spot.name='PendingSeedCotyledons';root.add(spot);
 const earth=new THREE.Mesh(new THREE.CylinderGeometry(.25,.22,.025,20),soil);earth.position.y=.014;spot.add(earth);
 for(const sign of [-1,1]){const leaf=new THREE.Mesh(leafGeo,leafMat);leaf.scale.set(1,.24,.48);leaf.position.set(sign*.075,.085,.015);leaf.rotation.z=sign*.30;spot.add(leaf);}
 const seeds=new THREE.Group();seeds.name='SowingSeeds';root.add(seeds);
 const pieces=[];for(let i=0;i<8;i++){const m=new THREE.Mesh(pebbleGeo,i%3===0?soil:seedMat);m.scale.setScalar(.80+i%3*.15);seeds.add(m);pieces.push(m);}
 const origin=new THREE.Vector3(),destination=new THREE.Vector3();
 return {root,update({progress=0,handWorld,targetWorld,pending=false,reducedMotion=false}={}){
  if(!targetWorld||!handWorld){root.visible=false;return;}
  const p=THREE.MathUtils.clamp(progress,0,1);root.position.set(targetWorld.x,groundY,targetWorld.z);
  root.visible=p>0&&(p<1||pending);spot.visible=p>=.56;seeds.visible=!reducedMotion&&p>=.32&&p<.94;
  origin.copy(handWorld).sub(root.position);
  for(let i=0;i<pieces.length;i++){
   const t=(p-(.32+i*.035))/.31,m=pieces[i];m.visible=seeds.visible&&t>=0&&t<=1;if(!m.visible)continue;
   const angle=i*2.399;destination.set(Math.cos(angle)*.17,.04,Math.sin(angle)*.17);
   m.position.copy(origin).lerp(destination,t);m.position.y+=Math.sin(t*Math.PI)*.24;
   m.rotation.set(t*3+i,t*5,t*4-i);
  }
 },dispose(){pebbleGeo.dispose();leafGeo.dispose();earth.geometry.dispose();soil.dispose();seedMat.dispose();leafMat.dispose();root.clear();}};
}
