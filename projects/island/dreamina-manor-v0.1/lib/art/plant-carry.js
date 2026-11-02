/** Upright botanical presentation, independently authored from fish carry.
 * Call actor.update(time,moving,true), then this controller.update().
 * Does not alter item size, inventory, avatar root position, or fish carrying. */
import * as THREE from 'three';
import {createFishingSurfaceContact} from '../avatars/avatar-rig/fishing-surface-contact.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export function createPlantCarry(actor,model,{speciesId='radish'}={}){
 const rig=actor.rig,parent=actor.visual.parent;if(!parent||model.parent!==parent)throw new Error('Plant carry and avatar must share their player root');
 actor.update(0,false,true);parent.updateMatrixWorld(true);
 const bones=new Map();rig.root.traverse(n=>{if(n.isBone)bones.set(n.name,n);});
 const upper=bones.get('upperArm_L'),fore=bones.get('forearm_L'),wrist=bones.get('hand_L');
 if(!upper||!fore||!wrist)throw new Error('Original avatar lacks plant-carry joints');
 const inPlayer=n=>parent.worldToLocal(n.getWorldPosition(V()));
 const shoulder=inPlayer(upper),elbow=inPlayer(fore),hand=inPlayer(wrist),reach=shoulder.distanceTo(elbow)+elbow.distanceTo(hand);
 const initialScale=model.scale.clone();model.position.set(0,0,0);model.rotation.set(0,0,0);parent.updateMatrixWorld(true);
 const inv=new THREE.Matrix4().copy(parent.matrixWorld).invert(),box=new THREE.Box3();
 model.traverse(n=>{if(n.isMesh){n.geometry.computeBoundingBox();box.union(n.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,n.matrixWorld)));}});
 const size=box.getSize(V()),bulb=speciesId==='radish'||speciesId==='pumpkin';
 const tilt=speciesId==='pumpkin'?-.10:-.20;model.rotation.z=tilt;
 // Grasp the real low stem/root, never the flower head. Bulbs sit outside the palm.
 const grip=V(bulb?-Math.min(.22,size.x*.19):0,box.min.y+size.y*(speciesId==='radish'?.26:speciesId==='pumpkin'?.29:.11),0);
 grip.applyAxisAngle(V(0,0,1),tilt);
 const handQ=wrist.getWorldQuaternion(new THREE.Quaternion());
 const relativeHandQ=parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handQ);
 const contact=createFishingSurfaceContact(rig.root,rig.height);contact.update();
 const points=contact.palmPoints.L;
 const palmRoot=points.length?new THREE.Box3().setFromPoints(points).getCenter(V()):rig.root.worldToLocal(wrist.getWorldPosition(V()));
 const palmWorld=rig.root.localToWorld(palmRoot.clone());
 const palmOffset=wrist.worldToLocal(palmWorld.clone());
 const targetPalm=shoulder.clone().add(V(reach*.67,-reach*.43,reach*.43));
 // Floor clearance is real, not a shrink-to-fit trick.
 const rotatedBox=box.clone().applyMatrix4(new THREE.Matrix4().makeRotationZ(tilt));
 // Short original forelimbs hold nearer the lower root, rather than lifting the
 // wrist beyond its real reach or burying a giant plant in the ground.
 grip.y=Math.min(grip.y,targetPalm.y+rotatedBox.min.y-.045);
 let lastError=0;
 const q=new THREE.Quaternion(),pq=new THREE.Quaternion(),wq=new THREE.Quaternion();
 const aim=(bone,start,end,dest)=>{q.setFromUnitVectors(end.clone().sub(start).normalize(),dest.clone().sub(start).normalize());bone.getWorldQuaternion(wq);bone.parent.getWorldQuaternion(pq).invert();bone.quaternion.copy(pq.multiply(q.multiply(wq))).normalize();bone.updateWorldMatrix(false,true);};
 const solve=(goal)=>{
  const a=upper.getWorldPosition(V()),b=fore.getWorldPosition(V()),c=wrist.getWorldPosition(V()),l1=a.distanceTo(b),l2=b.distanceTo(c),dir=goal.clone().sub(a);
  const d=THREE.MathUtils.clamp(dir.length(),Math.abs(l1-l2)+1e-5,l1+l2-1e-5);dir.normalize();const along=(l1*l1-l2*l2+d*d)/(2*d),side=Math.sqrt(Math.max(0,l1*l1-along*along));
  const bend=V(1,-.7,.5).transformDirection(parent.matrixWorld);bend.addScaledVector(dir,-bend.dot(dir)).normalize();
  const e=a.clone().addScaledVector(dir,along).addScaledVector(bend,side),t=a.clone().addScaledVector(dir,d);aim(upper,a,b,e);aim(fore,fore.getWorldPosition(V()),wrist.getWorldPosition(V()),t);
 };
 function update(){
  parent.updateMatrixWorld(true);model.scale.copy(initialScale);model.rotation.set(0,0,tilt);
  const nowShoulder=inPlayer(upper),delta=nowShoulder.clone().sub(shoulder);
  const worldQ=parent.getWorldQuaternion(new THREE.Quaternion()).multiply(relativeHandQ);
  const p=targetPalm.clone().add(delta),worldPalm=parent.localToWorld(p.clone());
  // Palm local displacement is converted through actual wrist scale, not a guessed hand joint.
  const scale=wrist.getWorldScale(V());const offset=palmOffset.clone().multiply(scale).applyQuaternion(worldQ);
  solve(worldPalm.clone().sub(offset));wrist.parent.getWorldQuaternion(pq).invert();wrist.quaternion.copy(pq.multiply(worldQ)).normalize();
  rig.root.updateMatrixWorld(true);rig.root.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});
  const actualPalm=wrist.localToWorld(palmOffset.clone());parent.worldToLocal(actualPalm);
  // Anchor to the solved palm, including the small reach clamp; no visual hand gap.
  model.position.copy(actualPalm).sub(grip);model.updateMatrixWorld(true);lastError=actualPalm.distanceTo(p);
 }
 update();
 return {update,dispose(){},get reachClampError(){return lastError;},gripLocal:grip.clone(),side:'L',upright:true,physicalScale:initialScale.clone()};
}
