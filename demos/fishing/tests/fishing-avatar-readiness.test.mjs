import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const path=new URL('../lib/fishing-avatar-loading.ts',import.meta.url);
async function loading(){assert.ok(existsSync(path),'fishing avatar loading adapter exists');return import(path.href);}
test('fetch warming cannot satisfy readiness; only a matching rendered model does',async()=>{
 const {FishingAvatarReadiness}=await loading(),ready=new FishingAvatarReadiness(),controller=new AbortController();let complete=false;
 const waiting=ready.waitFor('self','cat',controller.signal).then(()=>{complete=true;});ready.report('self','cat','loading');ready.report('peer','cat','ready');ready.report('self','dog','ready');await Promise.resolve();assert.equal(complete,false);
 ready.report('self','cat','ready');await waiting;assert.equal(complete,true);
});
test('failure can be cleared for retry and canceled wait never completes late',async()=>{
 const {FishingAvatarReadiness}=await loading(),ready=new FishingAvatarReadiness();
 const first=ready.waitFor('self','cat',new AbortController().signal);ready.report('self','cat','error');await assert.rejects(first,/加载失败/);
 ready.clear('self','cat');const controller=new AbortController(),retry=ready.waitFor('self','cat',controller.signal);controller.abort();ready.report('self','cat','ready');await assert.rejects(retry,{name:'AbortError'});
 await ready.waitFor('self','cat',new AbortController().signal);
});
test('scene failure invalidates prior receipts and rejects pending and future waits until recovery',async()=>{
 const {FishingAvatarReadiness}=await loading(),ready=new FishingAvatarReadiness();ready.report('self','cat','ready');ready.failScene();await assert.rejects(ready.waitFor('self','cat',new AbortController().signal),/3D/);
 ready.report('self','cat','ready');await ready.waitFor('self','cat',new AbortController().signal);
});
test('retry clears a failed receipt without discarding an already rendered same-avatar receipt',async()=>{
 const {FishingAvatarReadiness}=await loading(),ready=new FishingAvatarReadiness();ready.report('self','cat','error');ready.clearFailure('self','cat');
 let resolved=false;const retry=ready.waitFor('self','cat',new AbortController().signal).then(()=>{resolved=true;});await Promise.resolve();assert.equal(resolved,false);ready.report('self','cat','ready');await retry;
 ready.clearFailure('self','cat');await ready.waitFor('self','cat',new AbortController().signal);
});
test('selection warming shares the exact fishing GLB cache with live rigs and failed downloads retry',async t=>{
 const {readFileSync}=await import('node:fs'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {createClubAvatar}=await import('../lib/club-avatar-rig.ts'),{fishingAvatarModelUrl}=await import('../lib/fishing-avatar-catalog.ts'),{preloadFishingAvatar}=await loading();
 const bytes=readFileSync(new URL('../public/avatars/cat.glb',import.meta.url));const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{value:{},configurable:true});t.after(()=>{if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window;});
 const urls=[];let failed=false;t.mock.method(GLTFLoader.prototype,'loadAsync',async url=>{urls.push(url);if(url.includes('milk-frog')&&!failed){failed=true;throw Error('offline');}return {scene:source};});
 await preloadFishingAvatar('cat');const avatar=createClubAvatar('miaocuijiao','warm-live',{modelUrl:fishingAvatarModelUrl('cat')});await avatar.ready;assert.equal(avatar.loaded,true);assert.deepEqual(urls,['/avatars/cast-v1/miaocuijiao.glb']);avatar.dispose();
 await assert.rejects(preloadFishingAvatar('milk-frog'),/offline/);await preloadFishingAvatar('milk-frog');assert.equal(urls.filter(url=>url.includes('milk-frog')).length,2);
});
function visibilityClock(t){
 const document=new EventTarget();document.hidden=false;const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{value:document,configurable:true});t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 let now=0,id=0;const timers=new Map();t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'setTimeout',(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;});t.mock.method(globalThis,'clearTimeout',id=>timers.delete(id));
 return {document,timers,advance(ms){now+=ms;for(const [key,timer]of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}},hide(value){document.hidden=value;document.dispatchEvent(new Event('visibilitychange'));}};
}
test('hidden pages pause the render deadline and resume with the remaining visible-time budget',async t=>{
 const {FishingAvatarReadiness}=await loading(),clock=visibilityClock(t),ready=new FishingAvatarReadiness();let outcome='pending';const waiting=ready.waitFor('self','cat',new AbortController().signal).then(()=>{outcome='ready';},()=>{outcome='timeout';});
 clock.advance(20000);clock.hide(true);clock.advance(120000);await Promise.resolve();assert.equal(outcome,'pending','background time must not cause a model timeout');assert.equal(clock.timers.size,0,'no deadline timer runs in the background');
 clock.hide(false);clock.advance(24999);await Promise.resolve();assert.equal(outcome,'pending');clock.advance(1);await waiting;assert.equal(outcome,'timeout','returning to the tab preserves the already spent 20 seconds');
});
test('starting hidden waits for visibility and abort removes the visibility listener',async t=>{
 const {FishingAvatarReadiness}=await loading(),clock=visibilityClock(t),ready=new FishingAvatarReadiness(),controller=new AbortController();clock.hide(true);
 const waiting=ready.waitFor('self','cat',controller.signal);assert.equal(clock.timers.size,0);controller.abort();await assert.rejects(waiting,{name:'AbortError'});clock.hide(false);assert.equal(clock.timers.size,0,'canceled waits cannot restart their timeout on a later visibility event');
});
