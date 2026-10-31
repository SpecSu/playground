import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {AnimalAssetLibrary} from '../src/minimal/animal-assets.ts';
import type {LegacySpecies} from '../src/minimal/species.ts';
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function actual(species:LegacySpecies){const bytes=await readFile(new URL(`../public/models/farm/${species}-animated.glb`,import.meta.url));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}

test('demand-driven template loading caps active work at two without dropping requested species',async()=>{
 const names:LegacySpecies[]=['cow','sheep','pig','bunny','duck'];
 const assets=new Map(await Promise.all(names.map(async name=>[name,await actual(name)] as const)));
 const starts:string[]=[],finish=new Map<string,(value:GLTF)=>void>();let active=0,maximum=0;
 const library=new AnimalAssetLibrary(url=>{const name=names.find(name=>url.includes(`/${name}-animated.glb`))!;starts.push(name);active++;maximum=Math.max(maximum,active);return new Promise<GLTF>(resolve=>finish.set(name,value=>{active--;resolve(value);}));});
 const pending=names.map(name=>library.instantiate(name));
 assert.deepEqual(starts,['cow','sheep'],'the owned catalog must not start five fetch/decode jobs at once');
 for(const name of names){assert.ok(finish.has(name),`${name} starts after capacity is released`);finish.get(name)!(assets.get(name)!);await pending[names.indexOf(name)];}
 const instances=await Promise.all(pending);assert.equal(maximum,2);assert.deepEqual(starts,names);instances.forEach(instance=>instance.release());
});

test('duplicate consumers share one template job and a failed job releases capacity for later species and explicit retry',async()=>{
 const cow=await actual('cow'),pig=await actual('pig'),duck=await actual('duck');const attempts:string[]=[];let rejectCow!:(error:Error)=>void,finishPig!:(value:GLTF)=>void;
 const library=new AnimalAssetLibrary(url=>{const name=['cow','pig','duck'].find(name=>url.includes(`/${name}-animated.glb`))!;attempts.push(name);if(name==='cow'&&attempts.filter(s=>s==='cow').length===1)return new Promise<GLTF>((_,reject)=>{rejectCow=reject;});if(name==='pig')return new Promise<GLTF>(resolve=>{finishPig=resolve;});return Promise.resolve(name==='cow'?cow:duck);});
 const a=library.instantiate('cow'),b=library.instantiate('cow'),p=library.instantiate('pig'),d=library.instantiate('duck');
 const failures=Promise.all([assert.rejects(a,/controlled failure/),assert.rejects(b,/controlled failure/)]);
 assert.deepEqual(attempts,['cow','pig']);rejectCow(new Error('controlled failure'));await failures;await settle();assert.deepEqual(attempts,['cow','pig','duck']);finishPig(pig);const retry=await library.instantiate('cow');const other=await Promise.all([p,d]);assert.deepEqual(attempts,['cow','pig','duck','cow']);[retry,...other].forEach(instance=>instance.release());
});
