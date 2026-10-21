import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import {FISHING_AVATAR_CATALOG} from '../lib/fishing-avatar-catalog.ts';
import {MARINE_SPECIES} from '../lib/fishing-catalog.ts';
import {createFishingAvatar} from '../lib/fishing-avatar.ts';
import {createMarineModel} from '../components/fishing/MarineModels.ts';
import {catchDisplayScale} from '../lib/fishing-world.ts';
import {uploadedAvatar} from './helpers/uploaded-avatar.mjs';
const cache = await import('../lib/fishing-catch-layouts.generated.ts').catch(()=>({FISHING_CATCH_LAYOUTS:{}}));

test('all 12 avatars and 20 fixed species have finite versioned offline layouts',()=>{
 assert.equal(cache.FISHING_CATCH_LAYOUT_VERSION,1);
 assert.equal(Object.keys(cache.FISHING_CATCH_LAYOUTS).length,240);
 for(const {id} of FISHING_AVATAR_CATALOG)for(const species of MARINE_SPECIES){
  const entry=cache.FISHING_CATCH_LAYOUTS[`${id}/${species.id}`];assert.ok(entry,`${id}/${species.id}`);
  assert.equal(entry.lengthCm,species.fixedCm);assert.equal(entry.scale,catchDisplayScale(species.fixedCm));
  for(const key of ['position','size','rotation','approachDirection','naturalSize'])assert.ok(entry[key].length===3&&entry[key].every(Number.isFinite),`${id}/${species.id}/${key}`);
 }
});
test('every canonical catch is installed from offline data without Worker creation or skin snapshots',async()=>{
 assert.equal(Object.keys(cache.FISHING_CATCH_LAYOUTS).length,240);
 const OriginalWorker=globalThis.Worker;let workerCalls=0;
 globalThis.Worker=class {constructor(){workerCalls++;throw Error('A fixed catch must never start a Worker');}};
 try{for(const {id}of FISHING_AVATAR_CATALOG){
  const avatar=createFishingAvatar(id,'precomputed',{template:await uploadedAvatar(id)});await avatar.ready;
  avatar.root.traverse(node=>{if(node instanceof THREE.SkinnedMesh)node.getVertexPosition=()=>{throw Error('A fixed catch must never skin a snapshot');};});
  try{for(const species of MARINE_SPECIES){
   const entry=cache.FISHING_CATCH_LAYOUTS[`${id}/${species.id}`],model=createMarineModel(species.id,species.fixedCm);model.scale.setScalar(catchDisplayScale(species.fixedCm));
   const size=await avatar.prepareCatchAsync(model),position=new THREE.Vector3();assert.equal(avatar.positionCatchReady(position),true);
   assert.deepEqual(size.toArray(),entry.size);assert.deepEqual(position.toArray(),entry.position);assert.deepEqual(model.rotation.toArray().slice(0,3),entry.rotation);
   assert.deepEqual(avatar.catchApproachDirection.toArray(),entry.approachDirection);assert.equal(avatar.root.userData.fishingCatchLayoutSource,'precomputed');
  }}finally{avatar.dispose();}
 }}finally{globalThis.Worker=OriginalWorker;}
 assert.equal(workerCalls,0);
});
test('precomputed build check verifies source and asset fingerprints',()=>{
 const result=spawnSync(process.execPath,['--experimental-strip-types','scripts/generate-fishing-catch-layouts.mjs','--check'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('an already-cancelled canonical catch cannot install a cached result',async()=>{
 const avatar=createFishingAvatar('human-subeike','cancel-cache',{template:await uploadedAvatar('human-subeike')});await avatar.ready;
 try{const species=MARINE_SPECIES[0],model=createMarineModel(species.id,species.fixedCm);model.scale.setScalar(catchDisplayScale(species.fixedCm));
  const controller=new AbortController();controller.abort();await assert.rejects(avatar.prepareCatchAsync(model,controller.signal),{name:'AbortError'});
  assert.equal(avatar.positionCatchReady(new THREE.Vector3()),false);
 }finally{avatar.dispose();}
});
