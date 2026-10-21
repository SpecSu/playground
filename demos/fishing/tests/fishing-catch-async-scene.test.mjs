import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {fishingSceneHarness,participant} from './helpers/fishing-scene-harness.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const angler=(h,name='小浪')=>h.world.yacht.getObjectByName(`Angler ${name}`);
const held=(id='async-catch')=>participant('holding',{catch:{id,speciesId:'clownfish',lengthCm:14,weightKg:.08,caughtAt:1_800_000_000_000}});
function controlledCatches(){
 const requests=[],poses=[];let syncCalls=0;
 return {requests,poses,get syncCalls(){return syncCalls;},create(avatar,kind,id){
  let ready=false;const destination=new THREE.Vector3(.1,.7,.65);
  return {...avatar,
   prepareCatch(){syncCalls++;throw new Error('Scene must not prepare catches synchronously');},
   positionCatch(){syncCalls++;throw new Error('Scene must not enter the lazy synchronous contact solve');},
   prepareCatchAsync(model,signal){ready=false;let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});requests.push({model,signal,kind,id,resolve(size=new THREE.Vector3(.4,.3,.2)){ready=true;resolve(size);},reject});return promise;},
   positionCatchReady(target){if(!ready)return false;target.copy(destination);return true;},
   updateFishing(...args){poses.push({id,phase:args[1],pose:args[4]});return avatar.updateFishing(...args);},
  };
 }};
}

test('Scene leaves delayed catch hidden and visibly reels while every RAF stays free of synchronous catch solves',async t=>{
 const jobs=controlledCatches();const h=await fishingSceneHarness({participants:[held()],ownId:'self',reducedMotion:false,qaCreateAvatar:jobs.create});t.after(()=>h.dispose());
 assert.equal(jobs.requests.length,1,'a visible catch starts the asynchronous preparation API');
 const model=jobs.requests[0].model,rod=angler(h).children[1],start=rod.quaternion.clone();
 assert.equal(model.visible,false);assert.equal(rod.visible,true);const renders=h.renders.length;h.frames(45);
 assert.ok(h.renders.length>renders+40,'pending preparation must not stop drawing');assert.equal(jobs.syncCalls,0);
 assert.equal(model.visible,false,'the unsolved geometry cannot flash at the root or in the hands');assert.equal(rod.visible,true);
 assert.ok(1-Math.abs(start.dot(rod.quaternion))>1e-5,'the pending rod keeps a small bounded reeling gesture');
 assert.ok(jobs.poses.slice(-30).every(({pose})=>pose.stage==='reel'&&pose.showcaseProgress===0&&!pose.settled));
 assert.match(h.labels.children[0].textContent,/收线|准备/);
 jobs.requests[0].resolve();await flush();h.step();assert.equal(model.visible,false,'ready starts a fresh readable arrival instead of skipping its haul');
 h.step(350);assert.equal(model.visible,true);const incoming=model.position.clone();h.step(1500);
 assert.equal(rod.visible,false);assert.ok(model.position.distanceTo(new THREE.Vector3(.1,.7,.65))<1e-8);assert.ok(incoming.distanceTo(model.position)>.1);assert.equal(jobs.syncCalls,0);
});

test('replaced catch aborts its job and ignores late completion and rejection',async t=>{
 const jobs=controlledCatches();const h=await fishingSceneHarness({participants:[held('old')],ownId:'self',qaCreateAvatar:jobs.create});t.after(()=>h.dispose());assert.equal(jobs.requests.length,1);
 const first=jobs.requests[0];let disposed=0;first.model.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));
 h.render({participants:[held('new')]});h.step();assert.equal(first.signal.aborted,true);assert.ok(disposed>0);assert.equal(first.model.parent,null);assert.equal(jobs.requests.length,2);
 first.resolve(new THREE.Vector3(90,90,90));await flush();h.step();assert.equal(jobs.requests[1].model.visible,false,'stale success cannot release the replacement');
 jobs.requests[1].resolve();await flush();h.step();assert.equal(jobs.requests[1].model.visible,true);assert.equal(jobs.syncCalls,0);
 h.render({participants:[held('third')]});h.step();const third=jobs.requests[2];h.render({participants:[held('fourth')]});h.step();third.reject(new Error('late old worker'));await flush();h.frames(3);assert.equal(jobs.requests.length,4,'stale rejection cannot restart or block the current catch');
});

for(const reason of ['idle','leave','dispose'])test(`${reason} aborts unfinished catch and late completion cannot restore it`,async t=>{
 const jobs=controlledCatches();const h=await fishingSceneHarness({participants:[held()],ownId:'self',qaCreateAvatar:jobs.create});if(reason!=='dispose')t.after(()=>h.dispose());assert.equal(jobs.requests.length,1);const request=jobs.requests[0];
 if(reason==='dispose')h.dispose();else{h.render({participants:reason==='leave'?[]:[participant()]});h.step();}
 assert.equal(request.signal.aborted,true);assert.equal(request.model.parent,null);const count=h.renders.length;
 request.resolve();await flush();h.step();assert.equal(request.model.parent,null);assert.equal(jobs.requests.length,1);
 if(reason==='dispose')assert.equal(h.renders.length,count);
});

test('avatar replacement cancels its pending catch and prepares against the new avatar only',async t=>{
 const jobs=controlledCatches();const h=await fishingSceneHarness({participants:[held()],ownId:'self',qaTemplates:['dog'],qaCreateAvatar:jobs.create});t.after(()=>h.dispose());assert.equal(jobs.requests.length,1);
 h.render({participants:[{...held(),preset:'dog'}]});h.step();assert.equal(jobs.requests[0].signal.aborted,true);assert.equal(jobs.requests.length,2);assert.equal(jobs.requests[1].kind,'dog');
 jobs.requests[0].resolve();await flush();h.step();assert.equal(jobs.requests[1].model.visible,false);jobs.requests[1].resolve();await flush();h.step();assert.equal(jobs.requests[1].model.visible,true);assert.equal(jobs.syncCalls,0);
});

test('worker failure keeps the catch hidden, retries with a cooldown, and never falls back to a frame-thread solve',async t=>{
 const jobs=controlledCatches();const h=await fishingSceneHarness({participants:[held()],ownId:'self',qaCreateAvatar:jobs.create});t.after(()=>h.dispose());assert.equal(jobs.requests.length,1);
 jobs.requests[0].reject(new Error('worker unavailable'));await flush();h.frames(20);assert.equal(jobs.requests.length,1,'failure must not retry each animation frame');assert.equal(jobs.requests[0].model.visible,false);assert.equal(angler(h).children[1].visible,true);assert.match(h.labels.children[0].textContent,/重试/);
 h.step(3000);assert.equal(jobs.requests.length,2,'a bounded cooldown permits recovery');jobs.requests[1].resolve();await flush();h.step();assert.equal(jobs.requests[1].model.visible,true);assert.equal(jobs.syncCalls,0);
});

test('remote catch also waits for its solved layout before display',async t=>{
 const jobs=controlledCatches();const remote={...held(),id:'remote',name:'远处旅人',slot:4};const h=await fishingSceneHarness({participants:[participant(),remote],ownId:'self',qaCreateAvatar:jobs.create});t.after(()=>h.dispose());assert.equal(jobs.requests.length,1);assert.equal(jobs.requests[0].id,'remote');assert.equal(jobs.requests[0].model.visible,false);assert.equal(angler(h,'远处旅人').children[1].visible,true);
 jobs.requests[0].resolve();await flush();h.step();assert.equal(jobs.requests[0].model.visible,true);assert.equal(jobs.syncCalls,0);
});


test('ambient NPC catches use the same asynchronous gate and cancellation as real anglers',async t=>{
 const {projectFishingAmbientParticipants}=await import('../lib/fishing-ambient.ts');
 let now=1_800_000_000_000,ambient;
 for(let i=0;i<50;i++,now+=1000){ambient=projectFishingAmbientParticipants(now);if(ambient.some(p=>p.fishing.phase==='holding'))break;}
 const heldNpc=ambient.find(p=>p.fishing.phase==='holding');assert.ok(heldNpc);
 const jobs=controlledCatches();const h=await fishingSceneHarness({ambientParticipants:ambient,qaNow:now,qaCreateAvatar:jobs.create});t.after(()=>h.dispose());
 const job=jobs.requests.find(request=>request.id===heldNpc.id);assert.ok(job);assert.equal(job.model.visible,false);assert.equal(angler(h,heldNpc.name).children[1].visible,true);
 job.resolve();await flush();h.step();assert.equal(job.model.visible,true);assert.equal(jobs.syncCalls,0);
 h.render({ambientParticipants:[]});h.step();assert.equal(job.model.parent,null);
});

test('an old restored catch waits for layout but does not replay a new catch celebration gesture',async t=>{
 const jobs=controlledCatches(),person=held();person.fishing.catch.caughtAt-=60_000;
 const h=await fishingSceneHarness({participants:[person],ownId:'self',reducedMotion:false,qaCreateAvatar:jobs.create});t.after(()=>h.dispose());assert.equal(jobs.requests.length,1);assert.equal(jobs.requests[0].model.visible,false);
 jobs.requests[0].resolve();await flush();h.step();assert.equal(jobs.requests[0].model.visible,true);assert.equal(angler(h).children[1].visible,false);assert.equal(jobs.poses.at(-1).pose.settled,true);
});

for(const reason of ['hidden','disabled','disabled preparation'])test(`${reason} suspends unfinished catch work and resumes with a fresh generation`,async t=>{
 const jobs=controlledCatches();const h=await fishingSceneHarness({participants:[held()],ownId:'self',qaCreateAvatar:jobs.create});t.after(()=>h.dispose());const original=jobs.requests[0];assert.ok(original);
 if(reason==='hidden'){h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));}else{h.render({enabled:false,prepareAvatars:reason==='disabled preparation'});h.step();}
 assert.equal(h.world.scene.getObjectByName('Nearby boats and quiet sea life').visible,false,'decorative sea activity pauses alongside catch work');assert.equal(original.signal.aborted,true,'background state aborts pending CPU work immediately');h.frames(20);assert.equal(jobs.requests.length,1,'background preparation cannot queue another solve');
 original.resolve();await flush();h.step();assert.equal(original.model.visible,false,'late background completion stays hidden');
 if(reason==='hidden'){h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));}else h.render({enabled:true});
 h.step();assert.equal(h.world.scene.getObjectByName('Nearby boats and quiet sea life').visible,true);assert.equal(jobs.requests.length,2,'foreground return can safely prepare the same catch again');assert.equal(jobs.requests[1].signal.aborted,false);
 jobs.requests[1].resolve();await flush();h.step();assert.equal(jobs.requests[1].model.visible,true);assert.equal(jobs.syncCalls,0);
});

test('own catch status reports transitions once and ignores remote and stale worker completions',async t=>{
 const jobs=controlledCatches(),events=[];const peer={...held('peer-catch'),id:'peer',name:'朋友',slot:1};
 const h=await fishingSceneHarness({participants:[held('first'),peer],ownId:'self',qaCreateAvatar:jobs.create,onOwnCatchStatus:(...args)=>events.push(args)});t.after(()=>h.dispose());
 assert.deepEqual(events,[['first','preparing']]);h.frames(4);assert.equal(events.length,1);
 jobs.requests.find(r=>r.id==='peer').resolve();await flush();h.step();assert.equal(events.length,1,'remote readiness is not own readiness');
 const first=jobs.requests.find(r=>r.id==='self');h.render({participants:[held('second'),peer]});h.step();assert.deepEqual(events,[['first','preparing'],['second','preparing']]);
 first.resolve();await flush();h.step();assert.equal(events.length,2,'stale catch success cannot update the feed');
 jobs.requests.at(-1).resolve();await flush();h.frames(4);assert.deepEqual(events,[['first','preparing'],['second','preparing'],['second','ready']]);
});

test('own catch failure and recovery report error, preparing and ready without blocking collection',async t=>{
 const jobs=controlledCatches(),events=[];const h=await fishingSceneHarness({participants:[held()],ownId:'self',qaCreateAvatar:jobs.create,onOwnCatchStatus:(...args)=>events.push(args)});t.after(()=>h.dispose());
 jobs.requests[0].reject(new Error('retry'));await flush();h.frames(4);assert.deepEqual(events,[['async-catch','preparing'],['async-catch','error']]);
 h.step(3000);assert.deepEqual(events.at(-1),['async-catch','preparing']);const retry=jobs.requests[1];
 h.render({participants:[participant()]});h.step();assert.equal(retry.signal.aborted,true,'collection authority immediately cancels unfinished display work');retry.resolve();await flush();h.step();assert.equal(events.some(([,status])=>status==='ready'),false);
});

test('all twenty species render one canonical size for different legacy catch lengths without bypassing async readiness',async t=>{
 const {MARINE_SPECIES}=await import('../lib/fishing-catalog.ts'),{catchDisplayScale}=await import('../lib/fishing-world.ts');
 const jobs=controlledCatches(),h=await fishingSceneHarness({participants:[participant()],ownId:'self',qaCreateAvatar:jobs.create});t.after(()=>h.dispose());
 for(const species of MARINE_SPECIES){
  const sizes=[];
  for(const lengthCm of [species.minCm,species.maxCm]){
   const person=held(`${species.id}-${lengthCm}`);person.fishing.catch={...person.fishing.catch,speciesId:species.id,lengthCm};h.render({participants:[person]});h.step();
   const model=jobs.requests.at(-1).model;assert.equal(model.visible,false,`${species.id}: canonical geometry still waits for its layout`);
   assert.equal(model.userData.lengthCm,species.fixedCm,`${species.id}: model metadata uses the canonical layout-cache key`);
   assert.equal(model.scale.x,catchDisplayScale(species.fixedCm));
   sizes.push(new THREE.Vector3(...Object.values(model.userData.normalizedDimensions)).multiply(model.scale).toArray());
   assert.equal(person.fishing.catch.lengthCm,lengthCm,'legacy stored data stays intact');
  }
  assert.deepEqual(sizes[0],sizes[1],`${species.id}: different historical measurements cannot change displayed geometry`);
 }
 assert.equal(jobs.syncCalls,0);jobs.requests.at(-1).resolve();await flush();h.step();assert.equal(jobs.requests.at(-1).model.visible,true);
});
