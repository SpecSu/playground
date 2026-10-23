import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
const REQUIRED=['root','hips','spine','chest','neck','head','upperArm_L','forearm_L','hand_L','upperArm_R','forearm_R','hand_R','thigh_L','shin_L','foot_L','thigh_R','shin_R','foot_R'];
/** A minimal rest-pose owner; authored geometry, root scale, and skin weights are unchanged. */
export function createClubAvatar(kind,id,{template}={}){
 if(!template)throw new Error('An already loaded boat template is required.');
 const root=new THREE.Group(),model=clone(template),joints=new Map(),skeletons=new Set();root.name=`avatar:${id}`;root.add(model);
 model.traverse(node=>{if(node.isBone)joints.set(node.name,{node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});if(node.isSkinnedMesh){skeletons.add(node.skeleton);node.frustumCulled=false;}});
 if(!skeletons.size||REQUIRED.some(name=>!joints.has(name)))throw new Error(`Incomplete original skeleton: ${kind}`);
 root.updateMatrixWorld(true);for(const skeleton of skeletons)skeleton.update();
 model.traverse(node=>{if(node.isSkinnedMesh){node.computeBoundingBox();node.computeBoundingSphere();}});
 const bounds=new THREE.Box3().setFromObject(root),height=bounds.max.y-bounds.min.y;
 const footprintRadius=Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x),Math.abs(bounds.min.z),Math.abs(bounds.max.z));
 let disposed=false;
 return {root,kind,height,footprintRadius,get loaded(){return !disposed;},ready:Promise.resolve(),
 update(){if(disposed)return;for(const {node,position,quaternion,scale}of joints.values()){node.position.copy(position);node.quaternion.copy(quaternion);node.scale.copy(scale);}},
 dispose(){if(disposed)return;disposed=true;for(const skeleton of skeletons)skeleton.dispose();joints.clear();root.clear();}
 };
}
