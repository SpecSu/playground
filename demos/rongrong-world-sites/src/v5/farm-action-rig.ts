import * as THREE from 'three';
import type {FeedingPose,GuardianPose} from './action-sequence.ts';

type Rest={bone:THREE.Bone;position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3};
/** Exclusive grounded action layer. Navigation owns the outer root; this owns bones only. */
export class FarmActionRig{
 private joints=new Map<string,Rest>();
 private root:THREE.Group;
 constructor(root:THREE.Group){this.root=root;root.traverse(node=>{if(node instanceof THREE.Bone)this.joints.set(node.name,{bone:node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});});}
 reset(){for(const rest of this.joints.values()){rest.bone.position.copy(rest.position);rest.bone.quaternion.copy(rest.quaternion);rest.bone.scale.copy(rest.scale);}this.matrices();}
 private matrices(){this.root.updateWorldMatrix(true,true);this.root.updateMatrixWorld(true);this.root.traverse(node=>{if(node instanceof THREE.SkinnedMesh)node.skeleton.update();});}
 private rotate(name:string,x:number,y=0,z=0){const rest=this.joints.get(name);if(rest)rest.bone.quaternion.copy(rest.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)));}
 private position(name:string){return this.joints.get(name)?.bone.getWorldPosition(new THREE.Vector3());}
 attach(prop:THREE.Object3D):boolean{const hand=this.joints.get('hand_R')?.bone;if(!hand)return false;hand.add(prop);prop.position.set(0,0,0);const scale=hand.getWorldScale(new THREE.Vector3());prop.scale.set(1/scale.x,1/scale.y,1/scale.z);return true;}
 private aim(bone:THREE.Bone,start:THREE.Vector3,end:THREE.Vector3,destination:THREE.Vector3){
  const from=end.clone().sub(start).normalize(),to=destination.clone().sub(start).normalize();if(from.lengthSq()<.1||to.lengthSq()<.1)return;
  const delta=new THREE.Quaternion().setFromUnitVectors(from,to),world=bone.getWorldQuaternion(new THREE.Quaternion()),parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(delta.multiply(world))).normalize();bone.updateWorldMatrix(false,true);
 }
 private solve(a:string,b:string,c:string,target:THREE.Vector3,bendLocal:THREE.Vector3){
  const upper=this.joints.get(a)?.bone,lower=this.joints.get(b)?.bone,tip=this.joints.get(c)?.bone;if(!upper||!lower||!tip)return;
  const origin=upper.getWorldPosition(new THREE.Vector3()),middle=lower.getWorldPosition(new THREE.Vector3()),end=tip.getWorldPosition(new THREE.Vector3());
  const first=origin.distanceTo(middle),second=middle.distanceTo(end);if(first<.0001||second<.0001)return;
  const direction=target.clone().sub(origin),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(first-second)+.0001,first+second-.0001);direction.normalize();
  const along=(first*first-second*second+distance*distance)/(2*distance),side=Math.sqrt(Math.max(0,first*first-along*along));
  const bend=bendLocal.clone().transformDirection(this.root.matrixWorld);bend.addScaledVector(direction,-bend.dot(direction));if(bend.lengthSq()<.0001)bend.set(1,0,0);bend.normalize();
  const elbow=origin.clone().addScaledVector(direction,along).addScaledVector(bend,side),destination=origin.clone().addScaledVector(direction,distance);
  this.aim(upper,origin,middle,elbow);lower.getWorldPosition(middle);tip.getWorldPosition(end);this.aim(lower,middle,end,destination);
 }
 private crouch(amount:number,forward=0,depth=.17){
  const feet=['L','R'].map(side=>({side,position:this.position(`foot_${side}`),quaternion:this.joints.get(`foot_${side}`)?.bone.getWorldQuaternion(new THREE.Quaternion())}));
  const hips=this.joints.get('hips');if(hips){hips.bone.position.y-=amount*depth;hips.bone.position.z+=forward;}
  this.matrices();
  for(const foot of feet)if(foot.position){this.solve(`thigh_${foot.side}`,`shin_${foot.side}`,`foot_${foot.side}`,foot.position,new THREE.Vector3(0,0,1));const bone=this.joints.get(`foot_${foot.side}`)?.bone;if(bone&&foot.quaternion)bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(foot.quaternion));}
 }
 feed(pose:FeedingPose,mouth:THREE.Vector3){
  this.reset();if(pose.reach<=0)return;
  const shoulder=this.position('upperArm_R'),elbow=this.position('forearm_R'),wrist=this.position('hand_R'),thigh=this.position('thigh_R'),shin=this.position('shin_R'),foot=this.position('foot_R');
  const scale=this.root.getWorldScale(new THREE.Vector3()).y,armReach=shoulder&&elbow&&wrist?shoulder.distanceTo(elbow)+elbow.distanceTo(wrist):.6,legReach=thigh&&shin&&foot?thigh.distanceTo(shin)+shin.distanceTo(foot):.8;
  const drop=shoulder?THREE.MathUtils.clamp(shoulder.y-mouth.y-armReach*.7,.17*scale,Math.max(.17*scale,legReach*.65)):.17*scale;
  this.crouch(pose.crouch,0,drop/scale);this.rotate('spine',pose.reach*.22);this.rotate('chest',pose.reach*.08);this.rotate('head',pose.reach*.16);this.matrices();
  for(const side of ['R','L']){const hand=this.position(`hand_${side}`);if(!hand)continue;const target=mouth.clone();if(side==='L'){const offset=new THREE.Vector3(.16,-.06,-.08).transformDirection(this.root.matrixWorld);target.addScaledVector(offset,.14);}target.lerpVectors(hand,target,pose.reach*(side==='R'?1:.7));this.solve(`upperArm_${side}`,`forearm_${side}`,`hand_${side}`,target,new THREE.Vector3(side==='L'?1:-1,-.65,0));}
  this.matrices();
 }
 /** A small friendly wave, not an unreachable hand-to-mouth IK target.
  * The fresh base pose keeps ownership of hips, feet and navigation. */
 greet(pose:{weight:number;wave:number}){
  const weight=THREE.MathUtils.clamp(pose.weight,0,1),wave=THREE.MathUtils.clamp(pose.wave,-1,1);
  this.rotate('upperArm_R',-.18*weight,0,(-1.65+wave*.18)*weight);
  this.rotate('forearm_R',0,0,-.35*weight);
  this.rotate('hand_R',0,.18*wave*weight,.16*wave*weight);
  this.matrices();
 }
 guardian(pose:GuardianPose){
  this.reset();this.crouch(pose.crouch,pose.pounce*.09);this.rotate('spine',pose.pounce*.26-pose.bubble*.06);this.rotate('head',-.08*pose.bubble,pose.scan);
  this.rotate('upperArm_L',-.2*pose.shield-1.15*pose.bubble-.55*pose.pounce,-.65*pose.shield,.2*pose.shield+.22*pose.bubble);
  this.rotate('forearm_L',-.35*pose.shield-.65*pose.bubble-.7*pose.pounce);
  this.rotate('upperArm_R',-.22*pose.shield-1.15*pose.bubble-.75*pose.pounce,.2*pose.shield,-.22*pose.bubble);
  this.rotate('forearm_R',-.25*pose.shield-.65*pose.bubble-.6*pose.pounce);this.matrices();
 }
}
