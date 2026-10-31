import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import configuration from '../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import {createSignedInFarmModelPreparation} from '../src/minimal/signed-in-farm-models.ts';
import {isApprovedSignedInFarmResourceContext,approvedSignedInFarmMainResource} from '../src/minimal/signed-in-farm-resources.ts';
import {isApprovedDemoResourceContext} from '../src/minimal/named-demo-resources.ts';
import {AlpacaProviderRegistry,ALPACA_RUNTIME_REVISION} from '../src/minimal/alpaca-provider.ts';
import {PenguinProviderRegistry,PENGUIN_RUNTIME_REVISION} from '../src/minimal/penguin-provider.ts';
import {prepareLocalAnimalModels,localAnimalDeploymentStatus,selectedLocalAnimal} from '../src/minimal/local-animal-models.ts';
const origin=configuration.target.id,options={origin,sessionMode:'signed-in-farm' as const};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};

test('signed-in coordinator rejects unverified modes, wrong origins and modified evidence before loading',async()=>{
 let calls=0;const dependencies={selected:async()=>{calls++;},main:async()=>{calls++;return true;},revoke:async()=>{calls++;}};
 const runtime=createSignedInFarmModelPreparation(configuration,dependencies);
 for(const sessionMode of ['named-demo','account','anonymous',undefined])await assert.rejects(runtime.prepare({...options,sessionMode} as never),/server-verified/);
 for(const badOrigin of ['http://127.0.0.1:5190','https://evil.example',origin+'/'])await assert.rejects(runtime.prepare({...options,origin:badOrigin}),/origin/);
 const changed=structuredClone(configuration);changed.evidenceReuse.candidates.cow='0'.repeat(64);
 await assert.rejects(createSignedInFarmModelPreparation(changed,dependencies).prepare(options),/identity/);
 assert.equal(calls,0);assert.equal(runtime.loaded(),null);
});

test('concurrent signed-in preparation coalesces and publishes only after all four resources succeed',async()=>{
 const gate=deferred(),calls:string[]=[];
 const runtime=createSignedInFarmModelPreparation(configuration,{
  selected:async()=>{calls.push('cow+bunny');await gate.promise;},
  main:async(species,target,context)=>{calls.push(species);assert.equal(runtime.loaded(),null);assert.equal(isApprovedSignedInFarmResourceContext(context),true);assert.equal(isApprovedDemoResourceContext(context),false);assert.deepEqual(target,{kind:'hosted',id:origin,runtimeRevision:species==='alpaca'?ALPACA_RUNTIME_REVISION:PENGUIN_RUNTIME_REVISION});assert.equal(approvedSignedInFarmMainResource(species,context).sha256,configuration.evidenceReuse.candidates[species]);return true;},
  revoke:async()=>{calls.push('revoke');},
 });
 const first=runtime.prepare(options),second=runtime.prepare(options);assert.equal(first,second);assert.equal(runtime.loaded(),null);
 await assert.rejects(runtime.prepare({...options,origin:'https://evil.example'}),/origin/);
 gate.resolve();await first;
 assert.deepEqual(calls,['cow+bunny','alpaca','penguin']);
 assert.deepEqual(runtime.loaded(),{origin,scope:'signed-in-farm',approval:'demo-only',mobilePerformance:'unmeasured'});assert.equal(Object.isFrozen(runtime.loaded()),true);
 await runtime.prepare(options);assert.deepEqual(calls,['cow+bunny','alpaca','penguin']);
 await assert.rejects(runtime.prepare({...options,origin:'http://127.0.0.1:5190'}),/origin/);
 await assert.rejects(runtime.prepare({...options,sessionMode:'named-demo'} as never),/server-verified/);
});

test('failed selected models revoke main providers, never publish loaded, and allow explicit retry',async()=>{
 let attempt=0,revokes=0,main=0;
 const runtime=createSignedInFarmModelPreparation(configuration,{selected:async()=>{if(++attempt===1)throw new Error('selected SHA failure');},main:async()=>{main++;return true;},revoke:async()=>{revokes++;}});
 await assert.rejects(runtime.prepare(options),/selected SHA failure/);assert.equal(runtime.loaded(),null);assert.equal(main,0);assert.equal(revokes,1);
 await runtime.prepare(options);assert.equal(attempt,2);assert.equal(main,2);assert.equal(runtime.loaded()?.scope,'signed-in-farm');
});

test('failed or rejected main preparation revokes partial resources before retry',async()=>{
 for(const rejection of [false,true]){
  let fail=true,revokes=0;const calls:string[]=[];
  const runtime=createSignedInFarmModelPreparation(configuration,{selected:async()=>{},main:async species=>{calls.push(species);if(species==='penguin'&&fail){if(rejection)throw new Error('penguin parse failure');return false;}return true;},revoke:async()=>{revokes++;}});
  await assert.rejects(runtime.prepare(options),rejection?/penguin parse failure/:/penguin actual asset validation failed/);assert.equal(runtime.loaded(),null);assert.equal(revokes,1);
  fail=false;await runtime.prepare(options);assert.deepEqual(calls,['alpaca','penguin','alpaca','penguin']);assert.equal(runtime.loaded()?.approval,'demo-only');
 }
});

test('actual four verified GLBs pass existing validators without production or mobile-performance promotion',async()=>{
 const alpaca=new AlpacaProviderRegistry(),penguin=new PenguinProviderRegistry();
 const read=async(url:string)=>new Uint8Array(await readFile(new URL('../public'+url,import.meta.url)));
 const runtime=createSignedInFarmModelPreparation(configuration,{
  selected:()=>prepareLocalAnimalModels(selection=>read(selection.url)),
  main:(species,target,context)=>(species==='alpaca'?alpaca:penguin).prepareSignedInFarm(context,target,{textureMode:'headers-only',loadBytes:read}),
  revoke:async()=>{await Promise.all([alpaca.prepare(null,null),penguin.prepare(null,null)]);},
 });
 await runtime.prepare(options);assert.equal(localAnimalDeploymentStatus(),'ready');
 for(const species of ['cow','bunny'] as const)assert.equal(selectedLocalAnimal(species)?.sha256,configuration.evidenceReuse.candidates[species]);
 for(const provider of [alpaca,penguin]){assert.equal(provider.status().state,'demo-ready');assert.equal(provider.status().admission?.scope,'signed-in-farm');assert.equal(provider.status().admission?.approval,'demo-only');assert.equal(provider.status().admission?.mobilePerformance?.status,'unmeasured');}
 assert.equal(runtime.loaded()?.mobilePerformance,'unmeasured');
});


test('failed load stays coalesced until revocation completes, never overlapping retry with cleanup',async()=>{
 const revoking=deferred(),entered=deferred();let selectedCalls=0;
 const runtime=createSignedInFarmModelPreparation(configuration,{selected:async()=>{selectedCalls++;throw new Error('invalid selected bytes');},main:async()=>true,revoke:async()=>{entered.resolve();await revoking.promise;}});
 const first=runtime.prepare(options),failure=assert.rejects(first,/invalid selected bytes/);await entered.promise;
 assert.equal(runtime.loaded(),null);assert.equal(runtime.prepare(options),first);assert.equal(selectedCalls,1);
 revoking.resolve();await failure;assert.equal(runtime.loaded(),null);
});
