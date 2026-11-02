import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { createFestivalCelebrationAvatar } from '../src/desert/celebration-avatar.ts';
import { uploadedTemplate } from './helpers/uploaded-avatar.ts';
for(const kind of ['miaocuijiao','human-jiji'] as const)test(`${kind}: short celebratory hands remain visible beyond the actual torso or hair silhouette`,async()=>{
 const avatar=createClubAvatar(kind,'visible-cheer',{mode:'desert',template:await uploadedTemplate(kind)}),celebration=createFestivalCelebrationAvatar(avatar,'visible-cheer'),point=new THREE.Vector3();
 avatar.update(0,'dance',false,0);const frontRest=avatar.root.getObjectByName('upperArm_R')!.quaternion.clone();
 try{for(const t of [2,2.4,12]){avatar.update(t,'dance',false,0);celebration.update(t);avatar.root.updateMatrixWorld(true);
  if(kind==='miaocuijiao')assert.ok(avatar.root.getObjectByName('upperArm_R')!.quaternion.angleTo(frontRest)<1.2,'short forelegs stay in their natural low range instead of folding through the chest');
  for(const side of ['L','R']){
   const hand=avatar.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3()),core=new THREE.Box3(),paw=new THREE.Box3();
   avatar.root.traverse(node=>{if(!(node instanceof THREE.SkinnedMesh))return;node.skeleton.update();const w=node.geometry.attributes.skinWeight,ids=node.geometry.attributes.skinIndex;
    for(let i=0;i<w.count;i++){let coreWeight=0,pawWeight=0;for(let c=0;c<4;c++){const name=node.skeleton.bones[ids.getComponent(i,c)].name;if(['hips','spine','chest','neck','head'].includes(name))coreWeight+=w.getComponent(i,c);if([`forearm_${side}`,`hand_${side}`].includes(name))pawWeight+=w.getComponent(i,c);}
     node.getVertexPosition(i,point).applyMatrix4(node.matrixWorld);if(coreWeight>.5&&Math.abs(point.y-hand.y)<.04)core.expandByPoint(point);if(pawWeight>.5)paw.expandByPoint(point);
    }
   });
   assert.ok(!core.isEmpty()&&!paw.isEmpty());
   const clearance=kind==='miaocuijiao'?(side==='L'?paw.max.x-core.max.x:core.min.x-paw.min.x):paw.max.z-core.max.z;
   assert.ok(clearance>.01,`${kind}/${side}/${t}: visible-paw clearance ${clearance}`);
  }
 }}finally{celebration.dispose();avatar.dispose();}
});
