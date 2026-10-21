import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { UPLOADED_CAST, uploadedTemplate, actualBounds, boneState } from './helpers/uploaded-avatar.ts';
import { applyArticulatedDance } from '../lib/club-directional-dance.ts';
import { ClubDanceStaging } from '../lib/club-dance-staging.ts';
import { clubMotionAtDistance } from '../lib/club-scene-motion.ts';
import type { AvatarRig } from '../lib/club-scene-world.ts';

for(const kind of UPLOADED_CAST) test(`${kind}: group actions, train and walking deform the actual uploaded skin safely`,async()=>{
 const model=createClubAvatar(kind,`shared:${kind}`,{template:await uploadedTemplate(kind)});
 for(const groupKind of ['unison','wave','battle','grid','train'] as const)for(const beat of [0,.25,.7,1.325,2.375,3.3]){
  model.update(30,'dance',false,1,undefined,{kind:groupKind,version:groupKind==='train'?3:2,phase:'perform',beat,weight:1,wave:(1-Math.cos(beat*Math.PI*2))/2,activation:1,trainPhase:'ride',trainLift:.64,trainHop:0});
  const b=actualBounds(model.root);
  assert.ok(b.min.y>=-.045,`${kind}/${groupKind}/${beat} floor ${b.min.y}`);
  assert.ok(b.max.y-b.min.y<model.height*1.7+.4,`${kind}/${groupKind} safe extent`);
  assert.ok(model.labelHeight>=b.max.y-.05,`${kind}/${groupKind}/${beat} label ${model.labelHeight} vs ${b.max.y}`);
 }
 for(const distance of [0,.1,.25,.4,.8,1.2]){
  const position=clubMotionAtDistance(0,distance);
  model.root.position.set(position.x,0,position.z);model.root.rotation.y=position.heading;
  model.update(distance,'dance',false,.9,{...position,slot:0,speed:.8,distance,walkBlend:1,action:'dance'});
  const b=actualBounds(model.root);assert.ok(b.min.y>=-.045,`${kind} moving floor ${b.min.y}`);
  assert.ok(b.max.x-b.min.x<2.5&&b.max.z-b.min.z<2.5,`${kind} local walking body`);
 }
 model.dispose();
});

for(const kind of UPLOADED_CAST)test(`${kind}: all four dance keys keep planted contacts, safe skin and reversible pose`,async()=>{
 const model=createClubAvatar(kind,`keys:${kind}`,{template:await uploadedTemplate(kind)});const root=new THREE.Group();root.add(model.root);
 const motion={slot:0,x:0,z:0,heading:0,speed:0,distance:0,walkBlend:0,action:'dance' as const};
 const rig={id:kind,preset:kind,slot:0,root,model,motion} as unknown as AvatarRig;
 const contacts:THREE.Bone[]=[];model.root.traverse(n=>{if(n instanceof THREE.Bone&&(/^foot_[LR]$/.test(n.name)||kind==='miaocuijiao'&&/^hand_[LR]$/.test(n.name)))contacts.push(n)});
 for(const direction of ['left','right','up','down'] as const)for(const age of [0,80,150,220,330,440]){
  model.update(0,'dance',true,1);root.position.y=0;root.updateMatrixWorld(true);
  const before=boneState(model.root);const feet=contacts.map(b=>b.getWorldPosition(new THREE.Vector3()));
  const saved=new Map<THREE.Object3D,{p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}>();
  applyArticulatedDance(rig,4.25,{direction,at:1000},1000+age,n=>{if(!saved.has(n))saved.set(n,{p:n.position.clone(),q:n.quaternion.clone(),s:n.scale.clone()})});
  root.updateMatrixWorld(true);const b=actualBounds(root);
  assert.ok(b.min.y>=-.045,`${kind}/${direction}/${age} floor ${b.min.y}`);
  assert.ok(b.max.y-b.min.y<model.height*1.7+.4);
  contacts.forEach((bone,i)=>{const pos=bone.getWorldPosition(new THREE.Vector3());if(direction!=='up'||age===0||age===440)assert.ok(pos.distanceTo(feet[i])<.001,`${kind}/${direction} planted ${bone.name}: ${pos.distanceTo(feet[i])}`);else assert.ok(pos.y>=feet[i].y-.001)});
  for(const [node,v]of saved){node.position.copy(v.p);node.quaternion.copy(v.q);node.scale.copy(v.s)}
  assert.deepEqual(boneState(model.root),before);
 }
 model.dispose();
});

test('a dance-stage skeleton inspected before its async load is animated after becoming ready',async()=>{
 let resolve!:(value:THREE.Group)=>void;
 const template=new Promise<THREE.Group>(done=>{resolve=done});
 const model=createClubAvatar('human-jiaxin','late-keys',{template});const root=new THREE.Group();root.add(model.root);
 const rig={id:'late-keys',preset:'human-jiaxin',slot:0,root,model,motion:{slot:0,x:0,z:0,heading:0,distance:0,speed:0,walkBlend:0,action:'dance'}} as unknown as AvatarRig;
 const stage=new ClubDanceStaging();stage.apply([rig],'late-keys',4,false,.9,1000,{direction:'left',at:850});stage.restore();
 resolve(await uploadedTemplate('human-jiaxin'));await model.ready;
 model.update(0,'dance',true);const quiet=boneState(root);
 stage.apply([rig],'late-keys',4,false,.9,1100,{direction:'left',at:950});
 assert.notDeepEqual(boneState(root),quiet,'late-loaded bones never get trapped in an empty cache');
 stage.restore();model.dispose();
});

test('production direction keys articulate all twelve uploaded bodies at native and doubled scene scale', async () => {
 for (const kind of UPLOADED_CAST) {
  const model = createClubAvatar(kind, `production-stage:${kind}`, { template: await uploadedTemplate(kind) });
  const root = new THREE.Group(); root.add(model.root);
  const rig = { id: kind, preset: kind, slot: 0, root, model, motion: { slot: 0, x: 0, z: 0, heading: 0, distance: 0, speed: 0, walkBlend: 0, action: 'dance' } } as unknown as AvatarRig;
  for (const scale of [1, 2]) for (const direction of ['left', 'right', 'down', 'up'] as const) for (const age of [80, 220, 365]) {
   root.scale.setScalar(scale);
   model.update(0, 'dance', true);
   const original = boneState(model.root);
   const stage = new ClubDanceStaging();
   stage.apply([rig], kind, 4.25, false, 1, 1000 + age, null);
   const native = boneState(model.root);
   const nativeHips = model.root.getObjectByName('hips')!.position.y;
   stage.restore();
   stage.apply([rig], kind, 4.25, false, 1, 1000, { direction, at: 1000 });
   assert.deepEqual(boneState(model.root), native, `${kind}: gesture starts continuously from the native pose`);
   stage.restore();
   stage.apply([rig], kind, 4.25, false, 1, 1000 + age, { direction, at: 1000 });
   const bounds = actualBounds(root);
   const state = boneState(model.root);
   assert.ok(state.every(Number.isFinite), `${kind}/${direction}/${age}: finite joints`);
   model.root.traverse(node => { if (node instanceof THREE.Bone) assert.ok(Math.abs(node.quaternion.length() - 1) < 1e-8, `${kind}/${direction}: ${node.name} remains a pure rotation`); });
   assert.notDeepEqual(state, native, `${kind}/${direction}: key changes actual joints beyond native dance`);
   assert.ok(bounds.min.y >= -0.045 * scale, `${kind}/${direction}/${age}/${scale}x: production skin floor ${bounds.min.y}`);
   assert.ok(bounds.max.y - bounds.min.y < (model.height * 2 + 0.4) * scale, `${kind}: bounded skin extent`);
   if (direction === 'down' && age === 220) assert.ok(model.root.getObjectByName('hips')!.position.y < nativeHips - 0.005, `${kind}: visible crouch at both scene scales`);
   stage.restore();
   assert.deepEqual(boneState(model.root), original, `${kind}: every bone transform is restored`);
   assert.deepEqual(root.scale.toArray(), [scale, scale, scale], `${kind}: scene scale is restored`);
   stage.apply([rig], kind, 4.25, false, 1, 1800, null);
   assert.deepEqual(boneState(model.root), native, `${kind}: release returns to native dance`);
   stage.restore();
  }
  model.dispose();
 }
});
