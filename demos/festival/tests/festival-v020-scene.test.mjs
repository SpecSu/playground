import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createDesertEnvironment } from '../src/desert/environment.ts';
import { festivalCeremonyAt } from '../src/desert/ceremony.ts';
const { FESTIVAL_MOVE_SPEED, FESTIVAL_CAMPFIRE_POSITIONS, FESTIVAL_MONUMENT_RADIUS, projectParticipant, movementDurationMs, getFestivalPlacementIssue } = await import('../lib/festival-types.ts');
const { CLUB_AVATAR_CATALOG } = await import('../lib/club-avatar-catalog.ts');

test('human walking is three times the original pace on shared projection while ambient pace stays gentle',()=>{
 const route={x:0,z:44,targetX:63,targetZ:44,moveAt:1000,heading:0};
 assert.equal(FESTIVAL_MOVE_SPEED,21);
 assert.equal(projectParticipant(route,2000).x,21);assert.equal(movementDurationMs(route),3000);
 assert.equal(projectParticipant({...route,ambient:true},2000).x,7);assert.equal(movementDurationMs({...route,ambient:true}),9000);
});

test('campfire centers are valid building ground when monument, artwork and boundary clearance are satisfied',()=>{
 const allowed=FESTIVAL_CAMPFIRE_POSITIONS.filter(([x,z])=>getFestivalPlacementIssue(0,x,z,[],[],1000)===null);
 assert.ok(allowed.length>=4);
 assert.equal(getFestivalPlacementIssue(0,22,25,[],[],1000),null);
 assert.equal(getFestivalPlacementIssue(0,FESTIVAL_MONUMENT_RADIUS,0,[],[],1000),'monument');
 assert.equal(getFestivalPlacementIssue(0,22,25,[{kind:0,x:22,z:25}],[],1000),'installation');
});

test('tent windows and real-road beads add bounded warm light only during the ceremony',()=>{
 const world=createDesertEnvironment();
 const tents=world.root.getObjectByName('festival-tent-lights');const roads=world.root.getObjectByName('festival-road-light-beads');
 assert.ok(tents);assert.ok(roads);assert.equal(tents.visible,false);assert.equal(roads.visible,false);
 assert.equal(tents.children.length,2);assert.equal(roads.children.length,2);
 assert.equal(tents.children[0].count,96);assert.ok(roads.children[0].count>400&&roads.children[0].count<700);
 const lamp=roads.children[0];assert.ok(lamp.isInstancedMesh);assert.equal(lamp.material.depthWrite,false);assert.equal(lamp.material.toneMapped,false);
 assert.ok(lamp.material.color.r>lamp.material.color.g&&lamp.material.color.g>lamp.material.color.b);
 const round={index:1,burnAt:300000,ashesAt:335000,endsAt:345000};
 world.update(22,festivalCeremonyAt(322000,round));assert.equal(tents.visible,true);assert.equal(roads.visible,true);
 assert.equal(roads.children[1].material.uniforms.uIntensity.value,1);
 const tentMaterials=[];world.root.traverse(node=>{if(node instanceof THREE.Mesh&&node.material.name==='festival-warm-tent')tentMaterials.push(node.material);});
 assert.equal(tentMaterials.length,5);assert.ok(tentMaterials.every(material=>material.emissiveIntensity===.30));
 world.update(45,festivalCeremonyAt(345000,round));assert.equal(roads.visible,false);assert.equal(tents.visible,false);assert.ok(tentMaterials.every(material=>material.emissiveIntensity===0));
 world.dispose();world.dispose();
});

test('avatar picker keeps named human identities and public portraits',()=>{
 for(const[id,label]of[['human-jiji','吉吉'],['human-subeike','苏贝壳'],['human-lx','LX'],['human-kelly','Kelly'],['human-bear','Bear熊'],['human-jiaxin','Jiaxin']]){
  const avatar=CLUB_AVATAR_CATALOG.find(avatar=>avatar.id===id);assert.equal(avatar.label,label);assert.equal(avatar.previewImage,`/avatars/portraits/${id}.webp`);
 }
 const scene=readFileSync(new URL('../components/DesertScene.tsx',import.meta.url),'utf8');
 assert.match(scene,/rgba\(255,255,255,.9\)/);
});
