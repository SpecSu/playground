import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import formal from '../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import {createApprovedSignedInFarmResourceContext} from '../src/minimal/signed-in-farm-resources.ts';
import {createLunarShowcaseScope} from '../src/minimal/lunar-showcase-resources.ts';import {LunarShowcaseAssetLibrary} from '../src/minimal/lunar-showcase-assets.ts';
import {LunarShowcaseScene} from '../src/minimal/lunar-showcase-scene.ts';import {lunarLoaderFixture} from './helpers/lunar-showcase-fixture.ts';
async function setup(){const {bytes,record}=await lunarLoaderFixture(),scope=createLunarShowcaseScope(createApprovedSignedInFarmResourceContext(formal,formal.target.id),formal.target.id),library=new LunarShowcaseAssetLibrary(scope,[record],{loadBytes:async()=>bytes,textureMode:'headers-only'}),parent=new THREE.Group(),player=new THREE.Vector3(-1,0,3),support=new THREE.Vector3(-1,1.4,3);
 const scene=new LunarShowcaseScene(parent,library,{player:()=>player,carrySupport:()=>support,playerHeading:()=>0,groundHeight:()=>0,landing:()=>new THREE.Vector3(1,0,3)});await scene.ready;return {scene,parent,player,support};}
test('actual cloned skeletal clip moves bones without changing distinct identity or staged root position',async()=>{
 const {scene}=await setup();try{const actor=scene.rootFor('yellow-long-ear')!,start=actor.position.clone(),head=actor.getObjectByName('test-head')!,q=head.quaternion.clone();assert.equal(scene.action('yellow-long-ear','greet').accepted,true);scene.tick(.25);assert.ok(head.quaternion.angleTo(q)>.01);assert.ok(actor.position.equals(start));assert.equal(actor.userData.target.kind,'showcase');assert.equal(actor.userData.species,undefined);assert.equal(scene.snapshot()[0].actionId,'greet');scene.setPaused(true);const before=head.quaternion.clone();scene.tick(60);assert.ok(head.quaternion.equals(before));scene.setPaused(false);scene.tick(.25);assert.equal(scene.snapshot()[0].actionId,'greet');}finally{scene.dispose();}
});
test('temporary carry uses active-time lift and safe landing, never teleports or enters animal state',async()=>{
 const {scene,support}=await setup();try{const root=scene.rootFor('yellow-long-ear')!,start=root.position.clone();assert.equal(scene.action('yellow-long-ear','pickup').accepted,true);assert.ok(root.position.equals(start));scene.tick(.1);assert.ok(Math.abs(root.position.x-start.x)<1e-8&&Math.abs(root.position.z-start.z)<1e-8);assert.ok(root.position.y>start.y);scene.setPaused(true);const paused=root.position.clone();scene.tick(20);assert.ok(root.position.equals(paused));scene.setPaused(false);for(let i=0;i<8;i++)scene.tick(.1);root.updateMatrixWorld(true);assert.ok(root.getObjectByName('test-support')!.getWorldPosition(new THREE.Vector3()).distanceTo(support)<1e-5);assert.equal(scene.carriedId(),'yellow-long-ear');assert.equal(scene.action('yellow-long-ear','greet').accepted,false);assert.equal(scene.action('yellow-long-ear','putdown').accepted,true);for(let i=0;i<8;i++)scene.tick(.1);assert.equal(scene.carriedId(),null);assert.ok(root.position.distanceTo(new THREE.Vector3(1,0,3))<1e-5);assert.equal(scene.snapshot()[0].actionId,null);}finally{scene.dispose();}
});
test('dispose releases cloned skins and staged roots once and cannot revive actions',async()=>{
 const {scene,parent}=await setup();const root=scene.rootFor('yellow-long-ear')!;let count=0;root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.addEventListener('dispose',()=>count++);});scene.dispose();const freed=count;scene.dispose();scene.tick(20);assert.equal(scene.action('yellow-long-ear','greet').accepted,false);assert.equal(parent.children.length,0);assert.equal(count,freed);assert.ok(freed>0);
});
test('repeated interruption starts each fade at the currently displayed aggregate pose',async()=>{
 const {scene}=await setup();try{const head=scene.rootFor('yellow-long-ear')!.getObjectByName('test-head')!;for(let i=0;i<20;i++){scene.action('yellow-long-ear',i%2?'stop':'greet');scene.tick(.04);const q=head.quaternion.clone();scene.action('yellow-long-ear',i%2?'greet':'stop');scene.tick(.000001);assert.ok(head.quaternion.angleTo(q)<.0001,'new fade must not snap to a prior clip or bind pose');}}finally{scene.dispose();}
});

test('completed aggregate fades converge to the pure target even for constant target tracks',async()=>{
 const {scene}=await setup();try{
  // A constant idle root track reproduces PropertyMixer cached-value suppression.
  const actor=(scene as unknown as {actors:Map<string,{instance:{animations:THREE.AnimationClip[]};mixer:THREE.AnimationMixer}>}).actors.get('yellow-long-ear')!;
  for(const clip of actor.instance.animations){clip.tracks.push(new THREE.VectorKeyframeTrack('test-root.position',[0,1],clip.name==='greet'?[0,.02,0,0,.02,0]:[0,0,0,0,0,0]));actor.mixer.uncacheClip(clip);}
  const root=scene.rootFor('yellow-long-ear')!.getObjectByName('test-root')!;
  for(let cycle=0;cycle<20;cycle++){
   scene.action('yellow-long-ear','greet');for(let i=0;i<15;i++)scene.tick(.02);
   scene.action('yellow-long-ear','stop');for(let i=0;i<10;i++)scene.tick(.02);
   assert.ok(Math.abs(root.position.y)<1e-9,`constant idle must settle exactly, got ${root.position.y}`);
   scene.setPaused(true);scene.tick(10);assert.ok(Math.abs(root.position.y)<1e-9);scene.setPaused(false);
  }
 }finally{scene.dispose();}
});
