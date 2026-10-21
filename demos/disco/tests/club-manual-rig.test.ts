import { LEGACY_AVATAR_KINDS } from './helpers/legacy-avatar.ts';
import { MOVEMENT_SPEED_LIMIT } from '../lib/room-movement.ts';
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import test from 'node:test';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createClubAvatar} from '../lib/club-avatar-rig.ts';import {ManualWalkTrail} from '../lib/club-manual-motion.ts';

test('maximum-speed manual turns keep every legacy fixture skin finite and above the floor',async()=>{
 const vertex=new THREE.Vector3();
 for(const kind of LEGACY_AVATAR_KINDS){
  const bytes=readFileSync(new URL(`../public/avatars/${kind}.glb`,import.meta.url));const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const avatar=createClubAvatar(kind,'manual-gait-envelope',{template:scene});const trail=new ManualWalkTrail({x:-3,z:3},Math.PI/2);let maximumRadius=0;
  try{
   for(let frame=1;frame<=40;frame++){
    const d=frame*(MOVEMENT_SPEED_LIMIT/40);const point=frame<20?{x:-3+d,z:3}:{x:-3+19*(MOVEMENT_SPEED_LIMIT/40),z:3+(frame-19)*(MOVEMENT_SPEED_LIMIT/40)};const heading=frame<20?Math.PI/2:0;
    trail.append(point,heading);const motion=trail.motion(0,point,heading,MOVEMENT_SPEED_LIMIT,'dance');avatar.root.position.set(point.x,0,point.z);avatar.root.rotation.y=heading;avatar.update(frame/40,'dance',false,1,motion);
    avatar.root.traverseVisible(node=>{if(!(node instanceof THREE.Mesh))return;for(let i=0;i<node.geometry.attributes.position.count;i++){node.getVertexPosition(i,vertex).applyMatrix4(node.matrixWorld);assert.ok(Number.isFinite(vertex.x+vertex.y+vertex.z),`${kind} finite manual skin`);assert.ok(vertex.y>=-.04,`${kind} feet do not sink: ${vertex.y}`);maximumRadius=Math.max(maximumRadius,Math.hypot(vertex.x-point.x,vertex.z-point.z));}});
   }
   assert.ok(maximumRadius<=1.05,`${kind} manual walking keeps a sensible skin envelope: ${maximumRadius}`);
  }finally{avatar.dispose();}
 }
});
