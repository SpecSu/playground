import * as THREE from 'three';
import {resolveAvatarId} from './avatar-cast.js';
import {createFishingAvatar} from './avatar-rig/fishing-avatar.js';
// One common conversion preserves the boat cast's authored differences, including
// the cow's existing root scale. No character is normalized to the tallest one.
export const AVATAR_WORLD_SCALE=1.5;
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
 const update=(time,moving,holding=carrying)=>{
  if(disposed)return;rig.updateFishing(0,holding?'holding':'idle',true,1,{rodVisible:false});
  const swing=moving?Math.sin(time*10)*.34:0,quad=kind==='miaocuijiao';
  for(const side of ['L','R']){const sign=side==='L'?1:-1;turn(`thigh_${side}`,sign*swing*(quad?.6:1));turn(`shin_${side}`,Math.max(0,-sign*swing)*.65);turn(`foot_${side}`,-sign*swing*.25);if(!holding){turn(`upperArm_${side}`,-sign*swing*(quad?.55:.42));turn(`forearm_${side}`,Math.max(0,sign*swing)*.18);}}
  // A shared vertical offset keeps feet and carried catch together while moving.
  visual.position.y=baseY+(moving?Math.abs(Math.sin(time*10))*.025:0);sync();
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
