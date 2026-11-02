import { uploadedTemplate } from './helpers/uploaded-avatar.ts';
import assert from 'node:assert/strict';import test from 'node:test';import * as THREE from 'three';
import {createClubAvatar,CLUB_AVATAR_KINDS} from '../lib/club-avatar-rig.ts';import {ManualWalkTrail} from '../lib/club-manual-motion.ts';

test('uploaded festival cast: maximum-speed manual turns keep every skin finite and above the floor',async()=>{
 const vertex=new THREE.Vector3();
 for(const kind of CLUB_AVATAR_KINDS){
  const scene=await uploadedTemplate(kind);
  const avatar=createClubAvatar(kind,'manual-gait-envelope',{mode:'desert',template:scene});const trail=new ManualWalkTrail({x:-3,z:3},Math.PI/2);let maximumRadius=0;
  try{
   for(let frame=1;frame<=40;frame++){
    const d=frame*.045;const point=frame<20?{x:-3+d,z:3}:{x:-3+.855,z:3+(frame-19)*.045};const heading=frame<20?Math.PI/2:0;
    trail.append(point,heading);const motion=trail.motion(0,point,heading,1.8,'dance');avatar.root.position.set(point.x,0,point.z);avatar.root.rotation.y=heading;avatar.update(frame/20,'dance',false,1,motion);
    avatar.root.traverseVisible(node=>{if(!(node instanceof THREE.Mesh))return;for(let i=0;i<node.geometry.attributes.position.count;i++){node.getVertexPosition(i,vertex).applyMatrix4(node.matrixWorld);assert.ok(Number.isFinite(vertex.x+vertex.y+vertex.z),`${kind} finite manual skin`);assert.ok(vertex.y>=-.04,`${kind} feet do not sink: ${vertex.y}`);maximumRadius=Math.max(maximumRadius,Math.hypot(vertex.x-point.x,vertex.z-point.z));}});
   }
   assert.ok(maximumRadius<=1.05,`${kind} manual walking keeps a sensible skin envelope: ${maximumRadius}`);
  }finally{avatar.dispose();}
 }
});
