import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { makeClubWorld } from '../lib/club-scene-world.ts';
import { applyArticulatedDance } from '../lib/club-directional-dance.ts';
import { resolveAvatarPreset, type AvatarPreset } from '../lib/room-types.ts';
import type { AvatarRig } from '../lib/club-scene-world.ts';
import { uploadedTemplate, actualBounds, boneState } from './helpers/uploaded-avatar.ts';
import { readFileSync } from 'node:fs';

for(const [kind,beat]of [['niulai',3.685],['feidudu',1.625],['sword-shield-dog',2.65]]as const)test(`${kind}: short-leg landing preserves tail/body floor clearance`,async()=>{
 const model=createClubAvatar(kind,`dense:${kind}`,{template:await uploadedTemplate(kind)});
 for(const offset of [-.025,-.0125,0,.0125,.025]){model.update(beat+offset,'bounce',false,1);assert.ok(actualBounds(model.root).min.y>=-.035,`${kind} landing must not sink into the floor`)}
 model.update(0,'dance',false,1,undefined,{kind:'unison',version:2,phase:'perform',beat:1.8,weight:1,wave:0,activation:1});
 assert.ok(actualBounds(model.root).min.y>=-.01,`${kind} shared unison landing stays grounded`);
 model.dispose();
});

test('all retired preset names drive exactly the same uploaded key gesture as their canonical identity',async()=>{
 const aliases:AvatarPreset[]=['cat','frog','dog','capybara','panda','monster-blob','monster-tower','monster-star'];
 for(const alias of aliases){
  const canonical=resolveAvatarPreset(alias);const template=await uploadedTemplate(canonical);const a=createClubAvatar(canonical,'alias-key',{template}),b=createClubAvatar(canonical,'alias-key',{template});
  const ra=new THREE.Group(),rb=new THREE.Group();ra.add(a.root);rb.add(b.root);
  const base={id:'alias-key',slot:0,motion:{slot:0,x:0,z:0,heading:0,distance:0,speed:0,walkBlend:0,action:'dance'}};
  for(const direction of ['left','right','up','down']as const){
   a.update(0,'dance',true);b.update(0,'dance',true);
   applyArticulatedDance({...base,preset:alias,root:ra,model:a}as unknown as AvatarRig,4.25,{direction,at:1000},1220,()=>{});
   applyArticulatedDance({...base,preset:canonical,root:rb,model:b}as unknown as AvatarRig,4.25,{direction,at:1000},1220,()=>{});
   assert.deepEqual(boneState(a.root),boneState(b.root),`${alias} resolves before morphology branching`);
  }
  a.dispose();b.dispose();
 }
});

test('ranking avatars and photo export resolve old roster identities to the new portrait',()=>{
 const source=readFileSync(new URL('../components/DanceMachine.tsx',import.meta.url),'utf8');
 assert.equal((source.match(/preset\s*\?\s*resolveAvatarPreset\(preset\)/g)??[]).length,2);
});

test('scaled DJ skin stays outside the restored solid cabinet and countertop',async()=>{
 const dj=createClubAvatar('dj-kunkun','house-dj',{template:await uploadedTemplate('dj-kunkun'),mode:'dj'});
 const world=makeClubWorld({createAvatar(kind){return kind==='dj-kunkun'?dj:{root:new THREE.Group(),height:1.5,labelHeight:2,footprintRadius:.6,loaded:true,ready:Promise.resolve(),update(){},dispose(){}}}});
 const solids:THREE.Mesh[]=[];world.scene.getObjectByName('central-dj-booth')!.traverse(n=>{if(n instanceof THREE.Mesh&&(n.userData.cameraObstacle||n.name.startsWith('dj-tonearm-')))solids.push(n)});
 assert.ok(solids.length>=2);
 const point=new THREE.Vector3(),local=new THREE.Vector3();
 world.scene.updateMatrixWorld(true);
 const bounds=solids.map(solid=>{solid.geometry.computeBoundingBox();return{name:solid.name,box:solid.geometry.boundingBox!.clone().expandByScalar(-.055),inverse:solid.matrixWorld.clone().invert()}});
 const {ClubDanceStaging}=await import('../lib/club-dance-staging.ts');
 const stage=new ClubDanceStaging(),round={id:'r',seed:'s',version:2 as const,startsAt:1000,endsAt:52120};
 for(const [beat,bow] of [...[0,.25,.7,.72,1.25,1.72,2.25,2.7,2.72,3.25].map(beat=>[beat,false]as const),[0,true]as const]){
  dj.update(beat,'dance',false,1);
  if(bow)stage.apply([],null,0,false,1,round.endsAt+1500,null,round,world.dj);
  world.scene.updateMatrixWorld(true);
  dj.root.traverseVisible(n=>{if(!(n instanceof THREE.SkinnedMesh))return;
   for(let i=0;i<n.geometry.attributes.position.count;i++){
    n.getVertexPosition(i,point).applyMatrix4(n.matrixWorld);
    for(const solid of bounds){local.copy(point).applyMatrix4(solid.inverse);assert.ok(!solid.box.containsPoint(local),`${beat}/${bow}: DJ skin enters solid booth ${solid.name} at ${local.toArray()}`)}
   }
  });
  stage.restore();
 }
 world.dispose();
});

test('partial walking blends keep actual uploaded bone rotations normalized under elastic ancestor scale',async()=>{
 const {clubMotionAtDistance}=await import('../lib/club-scene-motion.ts');
 for(const kind of ['niulai','human-jiji','human-lx','human-jiaxin']as const){
  const model=createClubAvatar(kind,`blend:${kind}`,{template:await uploadedTemplate(kind)});
  for(const walkBlend of [.05,.25,.5,.75,.95]){
   const distance=1.05,position=clubMotionAtDistance(0,distance);model.root.position.set(position.x,0,position.z);model.root.rotation.y=position.heading;
   model.update(3.5,'dance',false,1,{...position,slot:0,speed:.8,distance,walkBlend,action:'dance'});
   model.root.traverse(n=>{if(n instanceof THREE.Bone)assert.ok(Math.abs(n.quaternion.length()-1)<.0001,`${kind}/${walkBlend} ${n.name} quaternion is a rotation`)});
   assert.ok(actualBounds(model.root).min.y>=-.045);
  }
  model.dispose();
 }
});


test('new resident DJ curtain bow keeps hands on decks and restores the native pose',async()=>{
 const {ClubDanceStaging}=await import('../lib/club-dance-staging.ts');
 const model=createClubAvatar('dj-kunkun','house-dj',{template:await uploadedTemplate('dj-kunkun'),mode:'dj'});
 const root=new THREE.Group();root.scale.setScalar(CLUB_AVATAR_SCALE);root.position.z=-1.3;root.add(model.root);
 const rig={id:'house-dj',preset:'dj-kunkun',slot:0,root,model,motion:{slot:0,x:0,z:0,heading:0,distance:0,speed:0,walkBlend:0,action:'dance'}}as unknown as AvatarRig;
 const stage=new ClubDanceStaging(),round={id:'r',seed:'s',version:2 as const,startsAt:1000,endsAt:52120};
 model.update(0,'dance',true,1);root.updateMatrixWorld(true);
 const initial=boneState(model.root);
 for(const age of [1000,1250,1500,1800,2100,2399]){
  stage.apply([],null,0,false,1,round.endsAt+age,null,round,rig);root.updateMatrixWorld(true);
  for(const side of ['L','R'])assert.ok(model.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3()).y>=1.139,'short wings stay above deck top');
  stage.restore();assert.deepEqual(boneState(model.root),initial);
 }
 model.dispose();
});


test('short-legged sword dog uses its available walking crouch clearance',async()=>{
 const {clubMotionAtDistance}=await import('../lib/club-scene-motion.ts');
 const kind='sword-shield-dog',model=createClubAvatar(kind,`blend:${kind}`,{template:await uploadedTemplate(kind)});
 for(const distance of [.95,1,1.05,1.1,1.15]){
  const position=clubMotionAtDistance(0,distance);model.root.position.set(position.x,0,position.z);model.root.rotation.y=position.heading;
  model.update(3.5,'dance',false,1,{...position,slot:0,speed:.8,distance,walkBlend:1,action:'dance'});
  assert.ok(actualBounds(model.root).min.y>=-.01);
 }
 model.dispose();
});

test('shorter uploaded human bodies use proportionate unison crouch depth',async()=>{
 for(const kind of ['human-lx','human-jiji','human-jiaxin','human-subeike']as const){
  const model=createClubAvatar(kind,`group:${kind}`,{template:await uploadedTemplate(kind)});
  model.update(0,'dance',false,1,undefined,{kind:'unison',version:2,phase:'perform',beat:1.8,weight:1,wave:0,activation:1});
  assert.ok(actualBounds(model.root).min.y>=-.01,`${kind} unison floor clearance`);model.dispose();
 }
});

test('actual DJ wing surfaces scratch close above the platters without deep intersection',async()=>{
 const dj=createClubAvatar('dj-kunkun','house-dj',{template:await uploadedTemplate('dj-kunkun'),mode:'dj'});
 const world=makeClubWorld({createAvatar(kind){return kind==='dj-kunkun'?dj:{root:new THREE.Group(),height:1.5,labelHeight:2,footprintRadius:.6,loaded:true,ready:Promise.resolve(),update(){},dispose(){}}}});
 world.scene.updateMatrixWorld(true);
 const booth=world.scene.getObjectByName('central-dj-booth')!;
 const decks=booth.children.filter(n=>n instanceof THREE.Group&&Math.abs(n.position.y-1.10)<1e-6);
 assert.equal(decks.length,2);
 const discs=decks.flatMap(deck=>deck.children.filter((n):n is THREE.Mesh=>n instanceof THREE.Mesh&&n.geometry instanceof THREE.CylinderGeometry)).map(n=>({inverse:n.matrixWorld.clone().invert(),scale:n.getWorldScale(new THREE.Vector3())}));
 const point=new THREE.Vector3(),local=new THREE.Vector3();
 const closest=[Infinity,Infinity];
 for(let frame=0;frame<=80;frame++){
  const nearest=discs.map(()=>Infinity);
  dj.update(frame/20,'dance',false,1);world.scene.updateMatrixWorld(true);
  dj.root.traverseVisible(n=>{if(!(n instanceof THREE.SkinnedMesh))return;
   for(let i=0;i<n.geometry.attributes.position.count;i++){
    n.getVertexPosition(i,point).applyMatrix4(n.matrixWorld);
    for(const [index,disc]of discs.entries()){local.copy(point).applyMatrix4(disc.inverse);const radial=1-.001/disc.scale.x,half=.5-.001/disc.scale.y;
     assert.ok(!(local.x*local.x+local.z*local.z<radial*radial&&Math.abs(local.y)<half),`${frame/20}: actual wing surface enters platter by more than 1 mm`);
     if(local.x*local.x+local.z*local.z<radial*radial&&local.y>=.5-.001/disc.scale.y)nearest[index]=Math.min(nearest[index],(local.y-.5)*disc.scale.y);
    }
   }
  });
  for(let side=0;side<2;side++){const gap=Math.min(...nearest.slice(side*3,side*3+3));assert.ok(gap<.07,`${frame/20}: wing stays close enough to scratch its platter, gap ${gap}`);closest[side]=Math.min(closest[side],gap)}
 }
 assert.ok(closest.every(gap=>gap<.025),`both short-wing surfaces approach within 2.5 cm during their scratch cycle without forcing penetration: ${closest}`);
 world.dispose();
});

test('short bodies keep floor clearance in backflip recovery and curtain bow',async()=>{
 const {ClubDanceStaging}=await import('../lib/club-dance-staging.ts');
 for(const kind of ['feidudu','sword-shield-dog']as const){
  const model=createClubAvatar(kind,`dense:${kind}`,{template:await uploadedTemplate(kind)});
  if(kind==='feidudu')for(const beat of [3.275,3.28,3.3]){model.update(beat,'wave',false,1);assert.ok(actualBounds(model.root).min.y>=-.01,'low tail stays above the floor during flip recovery')}
  else {
   model.update(0,'dance',false,1,undefined,{kind:'unison',version:2,phase:'perform',beat:3.365,weight:1,wave:0,activation:1});assert.ok(actualBounds(model.root).min.y>=-.01);
   const root=new THREE.Group();root.add(model.root);const rig={id:kind,preset:kind,slot:0,root,model,motion:{slot:0,x:0,z:0,heading:0,distance:0,speed:0,walkBlend:0,action:'dance'}}as unknown as AvatarRig;
   const stage=new ClubDanceStaging(),round={id:'r',seed:'s',version:2 as const,startsAt:1000,endsAt:52120};stage.apply([rig],kind,0,false,1,round.endsAt+1500,null,round);
   assert.ok(actualBounds(root).min.y>=-.01,'wide sword-dog bow preserves body clearance');stage.restore();
  }
  model.dispose();
 }
});


test('DJ polite curtain nod clears the central mixer as well as the cabinet',async()=>{
 const {ClubDanceStaging}=await import('../lib/club-dance-staging.ts');
 const model=createClubAvatar('dj-kunkun','house-dj',{template:await uploadedTemplate('dj-kunkun'),mode:'dj'}),root=new THREE.Group();root.scale.setScalar(CLUB_AVATAR_SCALE);root.position.z=-1.3;root.add(model.root);
 const rig={id:'house-dj',preset:'dj-kunkun',slot:0,root,model,motion:{slot:0,x:0,z:0,heading:0,distance:0,speed:0,walkBlend:0,action:'dance'}}as unknown as AvatarRig;
 const stage=new ClubDanceStaging(),round={id:'r',seed:'s',version:2 as const,startsAt:1000,endsAt:52120},p=new THREE.Vector3();
 for(let age=1000;age<2400;age+=100){
  stage.apply([],null,0,false,1,round.endsAt+age,null,round,rig);root.updateMatrixWorld(true);
  model.root.traverse(n=>{if(!(n instanceof THREE.SkinnedMesh))return;const weights=n.geometry.attributes.skinWeight,ids=n.geometry.attributes.skinIndex;
   for(let i=0;i<weights.count;i++){let head=0;for(let c=0;c<4;c++)if(['head','neck'].includes(n.skeleton.bones[ids.getComponent(i,c)].name))head+=weights.getComponent(i,c);if(head<.7)continue;n.getVertexPosition(i,p).applyMatrix4(n.matrixWorld);assert.ok(p.y>=1.12,`bow ${age}: head/beak clears mixer, ${p.y}`)}
  });stage.restore();
 }
 model.dispose();
});
