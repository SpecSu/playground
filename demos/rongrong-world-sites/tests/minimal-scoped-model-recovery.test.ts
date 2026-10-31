import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import formalConfig from '../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import namedConfig from '../src/minimal/named-demo-resource-deployment.json' with {type:'json'};
import {createSignedInFarmModelPreparation} from '../src/minimal/signed-in-farm-models.ts';
import {createNamedDemoModelPreparation} from '../src/minimal/named-demo-models.ts';
import {AlpacaProviderRegistry} from '../src/minimal/alpaca-provider.ts';
import {PenguinProviderRegistry} from '../src/minimal/penguin-provider.ts';
const origin=formalConfig.target.id;
function fixture(){
 const alpaca=new AlpacaProviderRegistry(),penguin=new PenguinProviderRegistry();let loads=0,corrupt=false;
 const registry=(species:'alpaca'|'penguin')=>species==='alpaca'?alpaca:penguin;
 const options={retry:true,textureMode:'headers-only' as const,loadBytes:async(url:string)=>{loads++;const bytes=new Uint8Array(await readFile(new URL('../public'+url,import.meta.url)));if(corrupt)bytes[bytes.length-1]^=1;return bytes;}};
 const ready=()=>!!alpaca.get()&&!!penguin.get();
 const revoke=async()=>{await Promise.all([alpaca.prepare(null,null),penguin.prepare(null,null)]);};
 return {alpaca,penguin,registry,options,ready,revoke,loads:()=>loads,corrupt:()=>{corrupt=true;}};
}
for(const scope of ['signed-in-farm','named-demo'] as const)test(`${scope} revalidates actual GLBs after provider clear or runtime failure, not stale loaded metadata`,async()=>{
 const f=fixture();
 const formal=createSignedInFarmModelPreparation(formalConfig,{selected:async()=>{},ready:f.ready,main:(s,t,c)=>f.registry(s).prepareSignedInFarm(c,t,f.options),revoke:f.revoke});
 const named=createNamedDemoModelPreparation(namedConfig,{selected:async()=>{},ready:f.ready,main:(s,_d,t,c)=>f.registry(s).prepareNamedDemo(c,t,f.options),revoke:f.revoke});
 const prepare=()=>scope==='signed-in-farm'?formal.prepare({origin,sessionMode:scope}):named.prepare({origin,sessionMode:scope}),loaded=()=>scope==='signed-in-farm'?formal.loaded():named.loaded();
 await prepare();assert.equal(f.loads(),2);await f.alpaca.prepare(null,null);assert.equal(loaded(),null,'cleared provider must invalidate loaded status');
 await prepare();assert.equal(f.loads(),3);assert.equal(f.alpaca.get()?.admission.scope,scope==='signed-in-farm'?scope:undefined);
 f.penguin.reportRuntimeFailure(f.penguin.get()!.sha256,'actor failure');assert.equal(loaded(),null);await prepare();assert.equal(f.loads(),4);
 await f.alpaca.prepare(null,null);f.corrupt();await assert.rejects(prepare(),/actual asset validation failed/);assert.equal(loaded(),null);assert.equal(f.alpaca.get(),null);assert.equal(f.penguin.get(),null);
});

// The runtime recovery router has no URL-selected demo mode: binding requires an
// opaque issued context and the independently observed current document origin.
import {createFarmModelRecovery} from '../src/minimal/farm-model-recovery.ts';
import {createApprovedSignedInFarmResourceContext} from '../src/minimal/signed-in-farm-resources.ts';
import {createApprovedDemoResourceContext} from '../src/minimal/named-demo-resources.ts';
for(const scope of ['signed-in-farm','named-demo'] as const)test(`${scope} scoped recovery preserves healthy providers and rehashes revoked providers without configured fallback`,async()=>{
 const f=fixture();let actualOrigin=origin,fallbacks=0;
 const formal=createSignedInFarmModelPreparation(formalConfig,{selected:async()=>{},ready:f.ready,main:(s,t,c)=>f.registry(s).prepareSignedInFarm(c,t,f.options),revoke:f.revoke});
 const named=createNamedDemoModelPreparation(namedConfig,{selected:async()=>{},ready:f.ready,main:(s,_d,t,c)=>f.registry(s).prepareNamedDemo(c,t,f.options),revoke:f.revoke});
 const prepare=()=>scope==='signed-in-farm'?formal.prepare({origin,sessionMode:scope}):named.prepare({origin,sessionMode:scope});
 const context=scope==='signed-in-farm'?createApprovedSignedInFarmResourceContext(formalConfig,origin):createApprovedDemoResourceContext(namedConfig,origin);
 const recovery=createFarmModelRecovery({origin:()=>actualOrigin,provider:s=>f.registry(s).get(),configured:async()=>{fallbacks++;await f.revoke();return false;}});
 recovery.bind(context,origin,prepare);await prepare();
 assert.equal(await recovery.prepare('alpaca',{retry:true}),true);assert.equal(f.loads(),2,'healthy scope is not cleared or fetched again');
 f.alpaca.reportRuntimeFailure(f.alpaca.get()!.sha256,'actor failed');await f.penguin.prepare(null,null);
 assert.deepEqual(await Promise.all([recovery.prepare('alpaca',{retry:true}),recovery.prepare('penguin',{retry:true})]),[true,true]);assert.equal(f.loads(),4);
 assert.equal(f.alpaca.get()?.admission.scope,scope==='signed-in-farm'?scope:undefined);assert.equal(f.alpaca.get()?.admission.approval,'demo-only');
 actualOrigin='https://evil.example';await assert.rejects(recovery.prepare('alpaca',{retry:true}),/origin mismatch/);actualOrigin=origin;
 const other=scope==='signed-in-farm'?createApprovedDemoResourceContext(namedConfig,origin):createApprovedSignedInFarmResourceContext(formalConfig,origin);
 assert.throws(()=>recovery.bind(other,origin,prepare),/scope change/);
 await f.revoke();f.corrupt();await assert.rejects(recovery.prepare('alpaca',{retry:true}),/actual asset validation failed/);assert.equal(fallbacks,0);assert.equal(f.alpaca.get(),null);
});
test('unbound recovery retains configured behavior but never accepts a forged scoped binding',async()=>{
 let calls=0;const recovery=createFarmModelRecovery({origin:()=>origin,provider:()=>null,configured:async()=>{calls++;return false;}});
 assert.throws(()=>recovery.bind({} as never,origin,async()=>{}),/unissued/);assert.equal(await recovery.prepare('alpaca',{retry:true}),false);assert.equal(calls,1);
});

test('actual World retry and AnimalAssetLibrary missing-provider path keep the bound formal scope',async()=>{
 const {MinimalWorld}=await import('../src/minimal/World.ts');
 const {AnimalAssetLibrary}=await import('../src/minimal/animal-assets.ts');
 const {bindFarmModelRecovery}=await import('../src/minimal/farm-model-recovery.ts');
 const {alpacaProvider,ALPACA_RUNTIME_REVISION}=await import('../src/minimal/alpaca-provider.ts');
 const {penguinProvider,PENGUIN_RUNTIME_REVISION}=await import('../src/minimal/penguin-provider.ts');
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');Object.defineProperty(globalThis,'location',{configurable:true,value:{origin}});
 const context=createApprovedSignedInFarmResourceContext(formalConfig,origin);let loads=0;
 const options={retry:true,textureMode:'headers-only' as const,loadBytes:async(url:string)=>{loads++;return new Uint8Array(await readFile(new URL('../public'+url,import.meta.url)));}};
 const recover=async()=>{for(const species of ['alpaca','penguin'] as const){const registry=species==='alpaca'?alpacaProvider:penguinProvider;assert.equal(await registry.prepareSignedInFarm(context,{kind:'hosted',id:origin,runtimeRevision:species==='alpaca'?ALPACA_RUNTIME_REVISION:PENGUIN_RUNTIME_REVISION},options),true);}};
 try{
  bindFarmModelRecovery(context,origin,recover);await recover();
  const cowArt={root:{userData:{animationStatus:'failed'}},retryAnimation:async()=>{cowArt.root.userData.animationStatus='ready';return true;}};
  const scene=Object.assign(Object.create(MinimalWorld.prototype),{disposed:false,animals:new Map([['cow',{art:cowArt}]]),state:{animals:[{id:'cow',species:'cow'}]},reportAnimalModels:()=>{},animalModelStatus:()=>({loading:0,failed:0})});
  assert.deepEqual(await scene.retryAnimalModels(),{ready:1,failed:0});assert.equal(loads,2);assert.equal(alpacaProvider.get()?.admission.scope,'signed-in-farm');assert.equal(penguinProvider.get()?.admission.scope,'signed-in-farm');
  alpacaProvider.reportRuntimeFailure(alpacaProvider.get()!.sha256,'actor failure');const library=new AnimalAssetLibrary(async()=>{throw new Error('legacy asset fallback must not run');});
  const instance=await library.instantiate('alpaca',{retry:true});instance.release();assert.equal(loads,3);assert.equal(alpacaProvider.get()?.admission.scope,'signed-in-farm');assert.equal(penguinProvider.get()?.admission.scope,'signed-in-farm');
 }finally{await Promise.all([alpacaProvider.prepare(null,null),penguinProvider.prepare(null,null)]);if(previous)Object.defineProperty(globalThis,'location',previous);else Reflect.deleteProperty(globalThis,'location');}
});
