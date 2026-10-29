import * as THREE from 'three';
const V=()=>new THREE.Vector3();
/** Existing bones only. No facial/finger animation and no geometry edits. */
export function createAftershowPoses(model,bones,ready){
 const copy=p=>p.map(n=>({p:n.p.clone(),q:n.q.clone(),s:n.s.clone()}));
 const apply=p=>{bones.forEach((n,i)=>{n.position.copy(p[i].p);n.quaternion.copy(p[i].q);n.scale.copy(p[i].s)});model.updateWorldMatrix(true,true);model.updateMatrixWorld(true)};
 const find=s=>bones.find(n=>n.name.endsWith(s)),world=n=>n.getWorldPosition(V());
 const rotateWorld=(bone,angle)=>{if(!bone)return;const q=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));model.updateWorldMatrix(true,true);model.updateMatrixWorld(true)};
 apply(ready);
 const headBone=find('Head'),readyHeadQ=headBone?.getWorldQuaternion(new THREE.Quaternion());
 for(const [name,angle]of [['Spine2',-8],['Neck',-8],['Head',-22]])rotateWorld(find(name),angle*Math.PI/180);
 const look=copy(ready);bones.forEach((n,i)=>look[i].q.copy(n.quaternion));
 const upper=find('RightArm'),elbow=find('RightForeArm'),hand=find('RightHand'),head=find('Head');
 const bounds=new THREE.Box3().makeEmpty(),localBounds=new THREE.Box3().makeEmpty(),point=V();
 model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const p=mesh.geometry.attributes.position,si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;if(!p||!si||!sw)return;mesh.skeleton.update();for(let i=0;i<p.count;i++){let weight=0;for(let j=0;j<4;j++){const b=mesh.skeleton.bones[si.getComponent(i,j)];if(b?.name.endsWith('Head'))weight+=sw.getComponent(i,j)}if(weight>.5){mesh.getVertexPosition(i,point);bounds.expandByPoint(point.applyMatrix4(mesh.matrixWorld));if(head)localBounds.expandByPoint(head.worldToLocal(point.clone()))}}});
 let target=null;
 function aim(bone,child,direction){const from=world(child).sub(world(bone)).normalize(),q=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(from,direction.clone().normalize()));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));model.updateWorldMatrix(true,true);model.updateMatrixWorld(true)}
 if(upper&&elbow&&hand&&head&&!bounds.isEmpty()){
  const shoulder=world(upper),a=world(elbow).distanceTo(shoulder),b=world(hand).distanceTo(world(elbow));
  const side=Math.sign(shoulder.x-world(head).x)||-1;
  // Wrist is outside the actual head/hair silhouette. The closed native hand
  // is a comic nose-side suggestion, never a fabricated articulated finger.
  const headTurn=head.getWorldQuaternion(new THREE.Quaternion()).multiply(readyHeadQ.clone().invert());
  target=world(head).add(new THREE.Vector3(side*.18,-.015,bounds.max.x-bounds.min.x>.48?.29:.25).applyQuaternion(headTurn));
  const direction=target.clone().sub(shoulder),distance=Math.min(direction.length(),(a+b)*.97);direction.normalize();target.copy(shoulder).addScaledVector(direction,distance);
  const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
  const pole=new THREE.Vector3(side*.35,-1,.15).addScaledVector(direction,-new THREE.Vector3(side*.35,-1,.15).dot(direction)).normalize();
  const elbowTarget=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,height);
  aim(upper,elbow,elbowTarget.sub(shoulder));aim(elbow,hand,target.clone().sub(world(elbow)));
  // Turn the existing whole palm inward, without inventing finger articulation.
  const center=V();let count=0;
  model.traverse(m=>{if(!m.isSkinnedMesh)return;m.skeleton.update();const si=m.geometry.attributes.skinIndex,sw=m.geometry.attributes.skinWeight;for(let i=0;i<si.count;i++){let weight=0;for(let j=0;j<4;j++)if(m.skeleton.bones[si.getComponent(i,j)]===hand)weight+=sw.getComponent(i,j);if(weight>.7){m.getVertexPosition(i,point);center.add(point.applyMatrix4(m.matrixWorld));count++}}});
  if(count){center.divideScalar(count).sub(world(hand)).normalize();const toward=new THREE.Vector3(-side*.7,.7,0).normalize().applyQuaternion(headTurn);const q=hand.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(center,toward));hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));model.updateMatrixWorld(true);}

 }
 const gesture=copy(look);bones.forEach((n,i)=>gesture[i].q.copy(n.quaternion));
 apply(ready);
 return {look,gesture,diagnostics:{headBounds:bounds.isEmpty()?null:{min:bounds.min.toArray(),max:bounds.max.toArray()},headLocalBounds:localBounds.isEmpty()?null:{min:localBounds.min.toArray(),max:localBounds.max.toArray()},wristTarget:target?.toArray()||null}};
}
