import './room-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import * as surface from '../lib/fishing-surface-contact.ts';
const solver=await import('../lib/fishing-catch-solver.ts').catch(()=>({}));
test('large exact geometry indices expose resumable construction instead of a long first step',()=>{
 assert.equal(typeof surface.createFishingProjectedSurfaceSteps,'function');assert.equal(typeof surface.createFishingTriangleIntersectionProbeSteps,'function');
 const triangles=Array.from({length:1000},(_,i)=>new THREE.Triangle(new THREE.Vector3(i*.001,0,0),new THREE.Vector3(i*.001,.02,0),new THREE.Vector3(i*.001,0,.02)));
 for(const generator of [surface.createFishingProjectedSurfaceSteps(triangles,'y',false),surface.createFishingTriangleIntersectionProbeSteps(triangles)])assert.equal(generator.next().done,false);
});
test('cooperative solver exists with a cancellable asynchronously scheduled entry',()=>{assert.equal(typeof solver.runFishingCatchSolve,'function');});
test('async avatar preparation matches the complete synchronous layout without blocking initial call',async()=>{
 const {createFishingAvatar}=await import('../lib/fishing-avatar.ts'),{uploadedAvatar}=await import('./helpers/uploaded-avatar.mjs'),{createMarineModel}=await import('../components/fishing/MarineModels.ts'),{catchDisplayScale}=await import('../lib/fishing-world.ts');
 const template=await uploadedAvatar('miaocuijiao'),expectedAvatar=createFishingAvatar('miaocuijiao','same',{template}),actualAvatar=createFishingAvatar('miaocuijiao','same',{template});
 assert.equal(typeof actualAvatar.prepareCatchAsync,'function');assert.equal(typeof actualAvatar.positionCatchReady,'function');
 const fish=()=>{const model=createMarineModel('tuna',160);model.scale.setScalar(catchDisplayScale(160));return model;};
 const expectedFish=fish(),actualFish=fish(),expectedSize=expectedAvatar.prepareCatch(expectedFish),expected=expectedAvatar.positionCatch(new THREE.Vector3(),expectedSize);
 let heartbeat=0;const timer=setInterval(()=>heartbeat++,1),pending=actualAvatar.prepareCatchAsync(actualFish);
 assert.equal(actualAvatar.positionCatchReady(new THREE.Vector3()),false);
 const size=await pending;clearInterval(timer);const position=new THREE.Vector3();assert.equal(actualAvatar.positionCatchReady(position),true);
 assert.deepEqual(size,expectedSize);assert.deepEqual(position,expected);assert.deepEqual(actualAvatar.catchApproachDirection,expectedAvatar.catchApproachDirection);assert.deepEqual(actualAvatar.root.userData.fishingCatchSolve,expectedAvatar.root.userData.fishingCatchSolve);assert.ok(heartbeat>5,'cooperative fallback yields to unrelated timers');
 expectedAvatar.dispose();actualAvatar.dispose();
});
test('aborting async avatar preparation never installs an obsolete layout',async()=>{
 const {createFishingAvatar}=await import('../lib/fishing-avatar.ts'),{uploadedAvatar}=await import('./helpers/uploaded-avatar.mjs'),{createMarineModel}=await import('../components/fishing/MarineModels.ts');
 const avatar=createFishingAvatar('milk-frog','cancel',{template:await uploadedAvatar('milk-frog')});assert.equal(typeof avatar.prepareCatchAsync,'function');
 const controller=new AbortController(),pending=avatar.prepareCatchAsync(createMarineModel('tuna',160),controller.signal);controller.abort();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(avatar.positionCatchReady(new THREE.Vector3()),false);avatar.dispose();
});
test('a paused exact intersection query cannot inherit another query deduplication stamp',()=>{
 const tri=(a,b,c)=>new THREE.Triangle(new THREE.Vector3(...a),new THREE.Vector3(...b),new THREE.Vector3(...c));
 const obstacles=Array.from({length:79},()=>tri([-.01,-.01,.01],[.01,-.01,.01],[0,.01,.01]));
 obstacles.push(tri([0,-.01,-.01],[0,.01,.01],[0,-.01,.01]));
 const subjects=[tri([-.02,-.02,0],[.02,-.02,0],[0,.02,0])],other=[tri([.005,-.01,.005],[.015,-.01,.005],[.01,.01,.005])],query=surface.createFishingTriangleIntersectionProbe(obstacles),offset=new THREE.Vector3();
 assert.equal(query(subjects,offset),true);const steps=query.steps(subjects,offset);assert.equal(steps.next().done,false);assert.equal(query(other,offset),false);
 let result=steps.next();while(!result.done)result=steps.next();assert.equal(result.value,true);
});
test('async layout preserves actual yacht-parent transforms rather than assuming a world-origin avatar',async()=>{
 const {createFishingAvatar}=await import('../lib/fishing-avatar.ts'),{uploadedAvatar}=await import('./helpers/uploaded-avatar.mjs'),{createMarineModel}=await import('../components/fishing/MarineModels.ts');
 const template=await uploadedAvatar('milk-frog');
 const build=()=>{const parent=new THREE.Group();parent.position.set(-3.2,.08,2.7);parent.rotation.set(.014,1.43,-.009);const avatar=createFishingAvatar('milk-frog','parented',{template}),fish=createMarineModel('pufferfish',55);fish.scale.setScalar(.7);parent.add(avatar.root,fish);parent.updateMatrixWorld(true);return{avatar,fish};};
 const expected=build(),actual=build();try{const size=expected.avatar.prepareCatch(expected.fish),position=expected.avatar.positionCatch(new THREE.Vector3(),size);const asyncSize=await actual.avatar.prepareCatchAsync(actual.fish);const asyncPosition=new THREE.Vector3();assert.equal(actual.avatar.positionCatchReady(asyncPosition),true);assert.deepEqual(asyncSize,size);assert.deepEqual(asyncPosition,position);assert.deepEqual(actual.avatar.catchApproachDirection,expected.avatar.catchApproachDirection);}finally{expected.avatar.dispose();actual.avatar.dispose();}
});
