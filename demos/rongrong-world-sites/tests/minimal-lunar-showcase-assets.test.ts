import test from 'node:test';import assert from 'node:assert/strict';
import formal from '../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import {createApprovedSignedInFarmResourceContext} from '../src/minimal/signed-in-farm-resources.ts';
import {createLunarShowcaseScope} from '../src/minimal/lunar-showcase-resources.ts';
import {LunarShowcaseAssetLibrary} from '../src/minimal/lunar-showcase-assets.ts';
import {lunarLoaderFixture} from './helpers/lunar-showcase-fixture.ts';
const scope=()=>createLunarShowcaseScope(createApprovedSignedInFarmResourceContext(formal,formal.target.id),formal.target.id);
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
test('no issued scope or no compiled candidate causes zero downloads and no fake fallback',async()=>{
 let loads=0;const {bytes,record}=await lunarLoaderFixture();assert.throws(()=>new LunarShowcaseAssetLibrary({} as never,[record]));
 const library=new LunarShowcaseAssetLibrary(scope(),[],{loadBytes:async()=>{loads++;return bytes;},textureMode:'headers-only'});await assert.rejects(library.instantiate('yellow-long-ear'),/not admitted/);assert.equal(loads,0);library.dispose();
});
test('actual bytes are SHA checked, cloned actors have independent bones/materials, and source metadata is immutable',async()=>{
 const {bytes,record}=await lunarLoaderFixture();let loads=0;const library=new LunarShowcaseAssetLibrary(scope(),[record],{loadBytes:async()=>{loads++;return bytes;},textureMode:'headers-only'});record.profile.bodyRadius=99;record.model.sha256='0'.repeat(64);
 const [a,b]=await Promise.all([library.instantiate('yellow-long-ear'),library.instantiate('yellow-long-ear')]);assert.equal(loads,1);assert.equal(a.definition.profile.bodyRadius,1);assert.notEqual(a.scene,b.scene);assert.notEqual(a.scene.getObjectByName('test-head'),b.scene.getObjectByName('test-head'));assert.throws(()=>{Object.assign(a.definition.profile,{bodyRadius:99});},TypeError);
 let frees=0;a.scene.traverse(o=>{if('geometry' in o)(o as {geometry:{addEventListener:(name:string,fn:()=>void)=>void}}).geometry.addEventListener('dispose',()=>frees++);});a.release();a.release();assert.equal(frees,0);b.release();library.dispose();assert.ok(frees>0);const old=frees;library.dispose();assert.equal(frees,old);
});
test('wrong hash fails closed and requires explicit retry; candidate clips cannot be invented',async()=>{
 const {bytes,record}=await lunarLoaderFixture();let bad=true,loads=0;const library=new LunarShowcaseAssetLibrary(scope(),[record],{loadBytes:async()=>{loads++;return bad?bytes.slice(1):bytes;},textureMode:'headers-only'});
 await assert.rejects(library.instantiate('yellow-long-ear'),/bytes|hash/);await assert.rejects(library.instantiate('yellow-long-ear'));assert.equal(loads,1);bad=false;const instance=await library.instantiate('yellow-long-ear',{retry:true});assert.equal(loads,2);instance.release();library.dispose();
 record.profile.actions[0].clip='invented';const missing=new LunarShowcaseAssetLibrary(scope(),[record],{loadBytes:async()=>bytes,textureMode:'headers-only'});await assert.rejects(missing.instantiate('yellow-long-ear'),/clip/);missing.dispose();
});
test('hung loads time out, ignore late resolution, and a later retry can recover',async()=>{
 const {bytes,record}=await lunarLoaderFixture(),first=deferred<Uint8Array>();let attempt=0,aborted=false;
 const library=new LunarShowcaseAssetLibrary(scope(),[record],{timeoutMs:10,textureMode:'headers-only',loadBytes:async(_url,signal)=>{signal?.addEventListener('abort',()=>{aborted=true;});return ++attempt===1?first.promise:bytes;}});
 await assert.rejects(library.instantiate('yellow-long-ear'),/timed out/);assert.equal(aborted,true);first.resolve(bytes);await new Promise(r=>setTimeout(r,20));assert.equal(library.status('yellow-long-ear'),'failed');const ready=await library.instantiate('yellow-long-ear',{retry:true});ready.release();library.dispose();
});
test('dispose makes pending and queued loads inert without a late clone attaching',async()=>{
 const {bytes,record}=await lunarLoaderFixture(),pending=deferred<Uint8Array>();const library=new LunarShowcaseAssetLibrary(scope(),[record],{loadBytes:()=>pending.promise,textureMode:'headers-only'});const loading=library.instantiate('yellow-long-ear');library.dispose();pending.resolve(bytes);await assert.rejects(loading,/disposed|cancelled/);assert.equal(library.status('yellow-long-ear'),'unavailable');
});
test('five actors do not exceed two active loads and disposal immediately cancels an uncooperative request',async()=>{
 const {bytes,record}=await lunarLoaderFixture();let active=0,maximum=0;const queue:(()=>void)[]=[];
 const ids=['yellow-long-ear','kunkun-chicken','red-scarf-person','pink-sheep','floral-vest-person'] as const;
 const library=new LunarShowcaseAssetLibrary(scope(),ids.map(id=>({...record,id})),{textureMode:'headers-only',loadBytes:()=>{active++;maximum=Math.max(maximum,active);return new Promise<Uint8Array>(resolve=>queue.push(()=>{active--;resolve(bytes);}));}});
 const jobs=ids.map(id=>library.instantiate(id));assert.equal(queue.length,2);
 for(let n=0;n<5;n++){while(!queue.length)await new Promise(r=>setTimeout(r,0));queue.shift()!();await new Promise(r=>setTimeout(r,0));}
 const instances=await Promise.all(jobs);assert.equal(maximum,2);instances.forEach(i=>i.release());library.dispose();
 const hung=new LunarShowcaseAssetLibrary(scope(),[record],{loadBytes:()=>new Promise(()=>{})});const work=hung.instantiate('yellow-long-ear');hung.dispose();await assert.rejects(work,/cancelled|disposed/);
});
test('zero measured underside is valid for a no-carry performer, without inventing carry permission',async()=>{
 const {bytes,record}=await lunarLoaderFixture();record.profile.transferUnderside=0;delete record.profile.carried;record.verification.carry=false;const library=new LunarShowcaseAssetLibrary(scope(),[record],{loadBytes:async()=>bytes,textureMode:'headers-only'});const actor=await library.instantiate('yellow-long-ear');assert.equal(actor.definition.verification.carry,false);assert.equal(actor.definition.profile.carried,undefined);actor.release();library.dispose();
});
test('text cues and root-turn exception are bounded per action rather than an unrestricted capability',async()=>{const {record}=await lunarLoaderFixture();for(const speech of [[{at:-1,duration:1,text:'x'}],[{at:0,duration:2,text:'x'}],[{at:0,duration:.2,text:''}],[{at:0,duration:.7,text:'a'},{at:.5,duration:.2,text:'b'}]]){const d=structuredClone(record);d.profile.actions[0].speech=speech;assert.throws(()=>new LunarShowcaseAssetLibrary(scope(),[d]),/speech/);}const d=structuredClone(record);d.profile.actions[0].rootMotion={kind:'in-place-yaw',turns:1};d.profile.actions[0].duration=8;assert.throws(()=>new LunarShowcaseAssetLibrary(scope(),[d]),/per-action root/);});
