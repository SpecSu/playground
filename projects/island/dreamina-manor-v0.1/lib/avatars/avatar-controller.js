import * as THREE from 'three';
import {CHARACTER_PLANT_VISUAL_SCALE} from '../art/physical-contract.js';
import {advanceWalkPhase,walkAngles} from './walk-gait.js';
import {resolveAvatarId} from './avatar-cast.js';
import {createFishingAvatar} from './avatar-rig/fishing-avatar.js';
// One common conversion preserves the boat cast's authored differences, including
// the cow's existing root scale. No character is normalized to the tallest one.
export const AVATAR_WORLD_SCALE=1.5*CHARACTER_PLANT_VISUAL_SCALE;
const rotation=new THREE.Quaternion(),euler=new THREE.Euler();
function geometryClone(node){const data=node.userData;node.userData={};const out=node.clone(false);node.userData=data;out.clear();for(const child of node.children)out.add(geometryClone(child));return out;}

/** The island owns placement; this adapter owns only real joints and carry contact. */
export function createIslandAvatar(value,template){
 const kind=resolveAvatarId(value),rig=createFishingAvatar(kind,`island-${kind}`,{template}),visual=new THREE.Group();visual.add(rig.root);visual.scale.setScalar(AVATAR_WORLD_SCALE);visual.name='original-boat-avatar';
 const bones=new Map();rig.root.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
 rig.root.updateMatrixWorld(true);const restBounds=new THREE.Box3().setFromObject(rig.root);const baseY=-Math.min(0,restBounds.min.y)*AVATAR_WORLD_SCALE;visual.position.y=baseY;
 let disposed=false,generation=0,carrying=false,controller=null,pending=Promise.resolve(),carryPosition=new THREE.Vector3(0,1.08,.49),carryRotation=new THREE.Euler(),carryError=null;
 const turn=(name,x,y=0,z=0)=>{const bone=bones.get(name);if(bone)bone.quaternion.multiply(rotation.setFromEuler(euler.set(x,y,z))).normalize();};
 const sync=()=>{visual.parent?.updateWorldMatrix(true,false);visual.updateMatrixWorld(true);rig.root.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});};
 // Cache neutral parent-space joint axes, not the fishing IK pose.
 rig.update(0,'dance',true,0);sync();
 const axes=new Map(),point=new THREE.Vector3(),forward=new THREE.Vector3(),parentInverse=new THREE.Matrix4();
 for(const side of ['L','R'])for(const [name,child]of [['thigh','shin'],['shin','foot'],['foot','toe'],['upperArm','forearm'],['forearm','hand']]){const bone=bones.get(`${name}_${side}`),end=bones.get(`${child}_${side}`);if(!bone||!end)continue;parentInverse.copy(bone.parent.matrixWorld).invert();const start=bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(parentInverse),finish=end.getWorldPosition(new THREE.Vector3()).applyMatrix4(parentInverse);forward.set(0,0,1).transformDirection(rig.root.matrixWorld).transformDirection(parentInverse);const axis=finish.sub(start).normalize().cross(forward).normalize();if(axis.lengthSq()>.1)axes.set(bone,{axis});}
 const soles=[];rig.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const skin=mesh.geometry.attributes.skinIndex,weight=mesh.geometry.attributes.skinWeight;if(!skin||!weight)return;const candidates=[];for(let i=0;i<skin.count;i++){let supported=false,front=false;for(let j=0;j<4;j++){const name=mesh.skeleton.bones[skin.getComponent(i,j)]?.name??'';if(weight.getComponent(i,j)>.25){if(/^(foot|toe)_/.test(name))supported=true;else if(kind==='miaocuijiao'&&/^hand_/.test(name)){supported=true;front=true;}} }if(supported){mesh.getVertexPosition(i,point);candidates.push({mesh,index:i,y:point.y,front});}}candidates.sort((a,b)=>a.y-b.y);soles.push(...candidates);});
 let gaitPhase=0,lastGaitTime=0,gaitGain=0;
 const update=(time,moving,holding=carrying,distance)=>{
  if(disposed)return;
  if(holding)rig.updateFishing(0,'holding',true,1,{rodVisible:false});else rig.update(0,'dance',true,0);
  const dt=Math.max(0,Math.min(.05,time-lastGaitTime));lastGaitTime=time;
  gaitGain+=(Number(moving)-gaitGain)*(1-Math.exp(-dt*16));
  if(moving)gaitPhase=advanceWalkPhase(gaitPhase,distance??dt*5.16,rig.height*AVATAR_WORLD_SCALE);
  const apply=(name,angle)=>{const bone=bones.get(name),axis=axes.get(bone)?.axis;if(bone&&axis)bone.quaternion.premultiply(rotation.setFromAxisAngle(axis,angle)).normalize();};
  for(const side of ['L','R']){const a=walkAngles(gaitPhase,side),gain=gaitGain;apply(`thigh_${side}`,a.hip*gain);apply(`shin_${side}`,a.knee*gain);apply(`foot_${side}`,a.foot*gain);if(!holding){apply(`upperArm_${side}`,a.arm*gain*(kind==='miaocuijiao'?1.25:1));apply(`forearm_${side}`,Math.max(0,-a.arm)*.35*gain);}}
  visual.position.y=baseY;sync();
  // Ground the sampled real sole skin, keeping the held object's shared offset.
  let low=0;for(const sample of soles){if(holding&&sample.front)continue;sample.mesh.getVertexPosition(sample.index,point).applyMatrix4(sample.mesh.matrixWorld);if(visual.parent)visual.parent.worldToLocal(point);low=Math.min(low,point.y);}
  visual.position.y+=Math.min(.35,Math.max(0,-low));sync();
 };
 function clearCarry(){generation++;controller?.abort();controller=null;carrying=false;carryError=null;carryPosition.set(0,1.08,.49);pending=Promise.resolve();}
 function prepareCarry(model,fish){
  clearCarry();const ownGeneration=generation;carrying=true;controller=new AbortController();const signal=controller.signal;
  update(0,false,true);
  // Provisional anchor uses actual wrists, not the previous primitive avatar's
  // fixed offset. Exact contact is solved outside the animation/input stack.
  carryPosition.copy(rig.catchPosition).multiplyScalar(AVATAR_WORLD_SCALE);carryPosition.y+=baseY;
  const probe=geometryClone(model);probe.scale.copy(model.scale).divideScalar(AVATAR_WORLD_SCALE);probe.position.set(0,0,0);probe.rotation.set(0,0,0);probe.userData={speciesId:fish.speciesId,lengthCm:fish.size};
  pending=rig.prepareCatchAsync(probe,signal,point=>{if(disposed||signal.aborted||ownGeneration!==generation)return;carryPosition.copy(point).multiplyScalar(AVATAR_WORLD_SCALE);carryPosition.y+=baseY;model.rotation.copy(probe.rotation);}).then(()=>{
   if(disposed||signal.aborted||ownGeneration!==generation)return false;
   const point=new THREE.Vector3();if(!rig.positionCatchReady(point))return false;
   carryPosition.copy(point).multiplyScalar(AVATAR_WORLD_SCALE);carryPosition.y+=baseY;carryRotation.copy(probe.rotation);model.rotation.copy(carryRotation);update(0,false,true);return true;
  }).catch(error=>{if(error?.name!=='AbortError'&&!disposed&&ownGeneration===generation){carryError=String(error?.message??error);return false;}return false;});
  return pending;
 }
 update(0,false,false);
 return {kind,visual,rig,height:rig.height*AVATAR_WORLD_SCALE,get pending(){return pending;},get carryError(){return carryError;},get carryPosition(){return carryPosition;},update,prepareCarry,clearCarry,
 applyCarry(held){held.position.copy(carryPosition);held.position.y+=visual.position.y-baseY;},
 dispose(){if(disposed)return;disposed=true;clearCarry();rig.dispose();visual.clear();}
 };
}
