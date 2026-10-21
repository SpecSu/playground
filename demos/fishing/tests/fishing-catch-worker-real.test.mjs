import './room-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {Worker as NodeWorker}from'node:worker_threads';import * as THREE from 'three';
import {createFishingAvatar}from'../lib/fishing-avatar.ts';import{createMarineModel}from'../components/fishing/MarineModels.ts';import{catchDisplayScale}from'../lib/fishing-world.ts';import{uploadedAvatar}from'./helpers/uploaded-avatar.mjs';
test('actual module Worker computes identical full catch layouts while main-thread timers continue',async()=>{
 const OriginalWorker=globalThis.Worker,errors=[];let workerCount=0,completed=0;
 class WorkerBridge extends EventTarget {
  constructor(){super();workerCount++;this.worker=new NodeWorker(new URL('./helpers/fishing-node-worker.mjs',import.meta.url),{execArgv:['--experimental-strip-types']});this.worker.on('message',data=>{if(data.error)errors.push(String(data.error));else completed++;this.dispatchEvent(new MessageEvent('message',{data}));});this.worker.on('error',error=>{errors.push(error.message);this.dispatchEvent(new Event('error'));});}
  postMessage(message){this.worker.postMessage(message);}
  terminate(){void this.worker.terminate();}
 }
 globalThis.Worker=WorkerBridge;
 try {
  for(const id of ['human-subeike','miaocuijiao','sword-shield-dog']){
   const template=await uploadedAvatar(id),expectedAvatar=createFishingAvatar(id,'worker',{template}),actualAvatar=createFishingAvatar(id,'worker',{template});
   try {for(const [species,cm]of [['clownfish',14],['pufferfish',55],['tuna',160],['manta-ray',400]]){
    const fish=()=>{const group=createMarineModel(species,cm);group.scale.setScalar(catchDisplayScale(cm));return group;};
    const expectedFish=fish(),actualFish=fish(),expectedSize=expectedAvatar.prepareCatch(expectedFish),expected=expectedAvatar.positionCatch(new THREE.Vector3(),expectedSize);
    let heartbeat=0;const timer=setInterval(()=>heartbeat++,1);let size;try{size=await actualAvatar.prepareCatchAsync(actualFish);}finally{clearInterval(timer);}
    const actual=new THREE.Vector3();assert.equal(actualAvatar.positionCatchReady(actual),true);
    assert.deepEqual(actual,expected,`${id}/${species} position`);assert.deepEqual(size,expectedSize,`${id}/${species} dimensions`);
    assert.deepEqual(actualAvatar.catchApproachDirection,expectedAvatar.catchApproachDirection,`${id}/${species} arrival`);
    assert.deepEqual(actualAvatar.root.userData.fishingCatchSolve,expectedAvatar.root.userData.fishingCatchSolve,`${id}/${species} candidates`);
    assert.ok(heartbeat>3,`${id}/${species} must not occupy the main thread for the solve`);
   }} finally {expectedAvatar.dispose();actualAvatar.dispose();}
  }
  assert.ok(workerCount>0);assert.equal(completed,12);assert.deepEqual(errors,[]);
 } finally {globalThis.Worker=OriginalWorker;}
});
