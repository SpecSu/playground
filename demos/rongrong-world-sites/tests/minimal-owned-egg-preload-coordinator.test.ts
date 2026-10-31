import test from 'node:test';
import assert from 'node:assert/strict';
import {OwnedEggModelPreloader} from '../src/minimal/owned-egg-preload.ts';
import {AnimalAssetLibrary} from '../src/minimal/animal-assets.ts';
import type {Species} from '../src/minimal/model.ts';
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('all currently owned species are latched before a reentrant preload; duplicate and empty updates do nothing',()=>{
 const batches:Species[][]=[];const eggs=[{species:'cow' as const},{species:'cow' as const},{species:'duck' as const}];
 const coordinator=new OwnedEggModelPreloader(species=>{batches.push(species);coordinator.update(eggs);return Promise.resolve([]);});
 coordinator.update([]);assert.deepEqual(batches,[]);coordinator.update(eggs);assert.deepEqual(batches,[['cow','duck']]);for(let i=0;i<100;i++)coordinator.update(eggs);assert.equal(batches.length,1);
 coordinator.update([{species:'duck'},{species:'bunny'}]);assert.deepEqual(batches,[['cow','duck'],['bunny']]);coordinator.dispose();
});

test('synchronous and asynchronous optional-warmup failures cannot escape or retry in a scene',async()=>{
 for(const synchronous of [true,false]){let attempts=0;const coordinator=new OwnedEggModelPreloader(()=>{attempts++;if(synchronous)throw new Error('sync failure');return Promise.reject(new Error('async failure'));});assert.doesNotThrow(()=>coordinator.update([{species:'pig'}]));await settle();for(let i=0;i<100;i++)coordinator.update([{species:'pig'}]);await settle();assert.equal(attempts,1);coordinator.dispose();}
});

test('disposal blocks later species without cancelling pending template work',async()=>{
 let finish!:(value:unknown)=>void;const attempts:Species[][]=[];const pending=new Promise(resolve=>{finish=resolve;});const coordinator=new OwnedEggModelPreloader(species=>{attempts.push(species);return pending;});coordinator.update([{species:'sheep'}]);coordinator.dispose();coordinator.dispose();coordinator.update([{species:'duck'},{species:'sheep'}]);assert.deepEqual(attempts,[['sheep']]);finish([]);await pending;await settle();coordinator.update([{species:'bunny'}]);assert.equal(attempts.length,1);
});

test('a later scene gets one new attempt after real shared-library rejection eviction',async()=>{
 let requests=0;const library=new AnimalAssetLibrary(async()=>{requests++;throw new Error('controlled offline template');});const first=new OwnedEggModelPreloader(species=>library.preload(species));first.update([{species:'duck'}]);await settle();first.update([{species:'duck'}]);assert.equal(requests,1);first.dispose();const second=new OwnedEggModelPreloader(species=>library.preload(species));second.update([{species:'duck'}]);await settle();assert.equal(requests,2);second.update([{species:'duck'}]);await settle();assert.equal(requests,2);second.dispose();
});
