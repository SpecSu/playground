import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import namedConfiguration from '../src/minimal/named-demo-resource-deployment.json' with {type:'json'};
import configuration from '../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import {createApprovedDemoResourceContext,isApprovedDemoResourceContext,assertApprovedDemoResourceContext,NAMED_DEMO_HOST} from '../src/minimal/named-demo-resources.ts';
import {createApprovedSignedInFarmResourceContext,isApprovedSignedInFarmResourceContext,assertApprovedSignedInFarmResourceContext,approvedSignedInFarmMainResource,approvedSignedInFarmSelectedAnimal,approvedSignedInFarmPreparation} from '../src/minimal/signed-in-farm-resources.ts';
import {signedInFarmServerResources} from '../server/signed-in-farm-resources.ts';
import {approvedDomainCommerce,domainSelectedAnimal,domainMainResource} from '../src/minimal/animal-resource-context.ts';
import {eggOffer} from '../src/minimal/egg-catalog.ts';
import {AlpacaProviderRegistry,ALPACA_RUNTIME_REVISION,alpacaProviderStatusLabel} from '../src/minimal/alpaca-provider.ts';
const origin=NAMED_DEMO_HOST,sha='bc31856677949756d99b1d57735199a52ddc20d45f3b9676e64dfa8a8b899344';
const create=()=>createApprovedSignedInFarmResourceContext(configuration,origin);

test('formal resource capabilities are distinct from named-demo, inspection and forged JSON capabilities',()=>{
 const formal=create(),demo=createApprovedDemoResourceContext(namedConfiguration,origin);
 assert.equal(isApprovedSignedInFarmResourceContext(formal),true);assert.equal(isApprovedDemoResourceContext(formal),false);assert.equal(isApprovedSignedInFarmResourceContext(demo),false);
 assert.throws(()=>assertApprovedDemoResourceContext(formal),/unissued/);assert.throws(()=>assertApprovedSignedInFarmResourceContext(demo),/unissued/);
 for(const forged of [{},{scope:'signed-in-farm'},JSON.parse(JSON.stringify(formal)),null]){assert.equal(isApprovedSignedInFarmResourceContext(forged),false);assert.throws(()=>assertApprovedSignedInFarmResourceContext(forged),/unissued/);}
});

test('signed-in admission is pinned to exact public origin, scope and original evidence identities',()=>{
 for(const wrong of ['https://evil.example','http://127.0.0.1:5190',origin+'/',origin+':443'])assert.throws(()=>createApprovedSignedInFarmResourceContext(configuration,wrong),/origin/);
 for(const mutate of [(c:typeof configuration)=>{c.scope='named-demo';},(c:typeof configuration)=>{c.evidenceReuse.sourceCodeCommit='0'.repeat(40);},(c:typeof configuration)=>{c.evidenceReuse.candidates.alpaca='0'.repeat(64);},(c:typeof configuration)=>{c.evidenceReuse.materializationSha256='0'.repeat(64);}]){const changed=structuredClone(configuration);mutate(changed);assert.throws(()=>createApprovedSignedInFarmResourceContext(changed,origin));}
});

test('formal metadata reuses the four exact verified artifacts without rewriting local or demo receipts',()=>{
 const before=JSON.stringify(namedConfiguration),formal=create();
 assert.equal(approvedSignedInFarmMainResource('alpaca',formal).sha256,sha);
 assert.equal(approvedSignedInFarmMainResource('penguin',formal).sha256,'d876b82ef3aa9da1cd27e270cd22e1c9d1951d9e7dd94e2c5229e3088765919f');
 assert.equal(approvedSignedInFarmSelectedAnimal('cow',formal)?.sha256,'fa3ab7f7e29d28d2a2f79c9a44856f561748a10c4933b897c1fd90469ee6a13a');
 assert.equal(approvedSignedInFarmSelectedAnimal('bunny',formal)?.sha256,'acaeb7453e9a47ea1d6583b649465a5e00345a5da026bef4e06e611299ca4ecf');
 assert.equal(approvedSignedInFarmSelectedAnimal('fox',formal),null);
 const preparation=approvedSignedInFarmPreparation(formal,'alpaca',{kind:'hosted',id:origin,runtimeRevision:ALPACA_RUNTIME_REVISION});
 assert.equal(preparation.sourceTarget.id,'http://127.0.0.1:5190');assert.equal(preparation.sourceTarget.kind,'local');assert.equal(JSON.stringify(namedConfiguration),before);
 assert.throws(()=>approvedSignedInFarmPreparation(formal,'alpaca',{kind:'hosted',id:'https://other.example',runtimeRevision:ALPACA_RUNTIME_REVISION}),/actual target/);
});

test('signed-in domain capability opens only existing verified ecology and supplies each exact measured profile',()=>{
 const formal=create();assert.equal(approvedDomainCommerce(formal),true);
 assert.deepEqual(eggOffer({exploredBiomes:['desert']},'desert',formal).species,['alpaca']);
 assert.deepEqual(eggOffer({exploredBiomes:['glacier']},'glacier',formal).species,['penguin']);
 assert.equal(domainSelectedAnimal('cow',formal)?.sha256,'fa3ab7f7e29d28d2a2f79c9a44856f561748a10c4933b897c1fd90469ee6a13a');
 assert.equal(domainMainResource('alpaca',formal)?.sha256,sha);
 assert.equal(approvedDomainCommerce(),false);assert.throws(()=>approvedDomainCommerce({} as never));
});

test('formal server resource selection requires trusted signed-in subject and never interprets name or client claims as formal scope',()=>{
 for(const subject of [null,'',' ','x'.repeat(513)])assert.equal(signedInFarmServerResources(origin+'/api/minimal/farm',subject),undefined);
 for(const query of ['?name=twx','?name=test','?name='])assert.equal(signedInFarmServerResources(origin+'/api/minimal/farm'+query,'verified-subject'),undefined);
 assert.equal(isApprovedSignedInFarmResourceContext(signedInFarmServerResources(origin+'/api/minimal/farm','verified-subject')),true);
 assert.throws(()=>signedInFarmServerResources('https://other.example/api/minimal/farm','verified-subject'),/origin/);
});

test('formal provider still hashes and parses actual bytes and retains explicit unmeasured mobile quality',async()=>{
 const bytes=new Uint8Array(await readFile(new URL(`../public/models/farm/hunyuan/alpaca-${sha}.glb`,import.meta.url))),registry=new AlpacaProviderRegistry(),formal=create();let loads=0;
 const ready=await registry.prepareSignedInFarm(formal,{kind:'hosted',id:origin,runtimeRevision:ALPACA_RUNTIME_REVISION},{textureMode:'headers-only',loadBytes:async url=>{loads++;assert.equal(url,`/models/farm/hunyuan/alpaca-${sha}.glb`);return bytes;}});
 assert.equal(ready,true);assert.equal(loads,1);assert.equal(registry.get()?.sha256,sha);assert.equal(registry.status().state,'demo-ready');assert.equal(registry.status().admission?.scope,'signed-in-farm');assert.equal(registry.status().admission?.mobilePerformance?.status,'unmeasured');assert.match(alpacaProviderStatusLabel(registry.status()),/手机性能未测/);assert.doesNotMatch(alpacaProviderStatusLabel(registry.status()),/生产资源已验证/);
 const bad=bytes.slice();bad[bad.length-1]^=1;const failed=new AlpacaProviderRegistry();assert.equal(await failed.prepareSignedInFarm(formal,{kind:'hosted',id:origin,runtimeRevision:ALPACA_RUNTIME_REVISION},{textureMode:'headers-only',loadBytes:async()=>bad}),false);assert.equal(failed.get(),null);assert.match(failed.status().error!,/bytes\/hash/);
});

test('a later explicit clear cannot be undone by scoped preparation suspended at its import boundary',async()=>{
 const registry=new AlpacaProviderRegistry(),formal=create();let loads=0;
 const pending=registry.prepareSignedInFarm(formal,{kind:'hosted',id:origin,runtimeRevision:ALPACA_RUNTIME_REVISION},{textureMode:'headers-only',loadBytes:async()=>{loads++;return new Uint8Array(await readFile(new URL(`../public/models/farm/hunyuan/alpaca-${sha}.glb`,import.meta.url)));}});
 await registry.prepare(null,null);assert.equal(await pending,false);assert.equal(registry.status().state,'unavailable');assert.equal(registry.get(),null);assert.equal(loads,0);
});

test('newest scoped preparation wins across formal and named scope without a stale error revoking it',async()=>{
 const bytes=new Uint8Array(await readFile(new URL(`../public/models/farm/hunyuan/alpaca-${sha}.glb`,import.meta.url))),target={kind:'hosted',id:origin,runtimeRevision:ALPACA_RUNTIME_REVISION},options={textureMode:'headers-only' as const,loadBytes:async()=>bytes};
 for(const order of ['formal-last','named-last'] as const){const registry=new AlpacaProviderRegistry(),formal=create(),named=createApprovedDemoResourceContext(namedConfiguration,origin);
  const earlier=order==='formal-last'?registry.prepareNamedDemo(named,target,options):registry.prepareSignedInFarm(formal,target,options);
  const later=order==='formal-last'?registry.prepareSignedInFarm(formal,target,options):registry.prepareNamedDemo(named,target,options);
  assert.equal(await earlier,false);assert.equal(await later,true);assert.equal(registry.get()?.admission.scope,order==='formal-last'?'signed-in-farm':undefined);
 }
 const registry=new AlpacaProviderRegistry(),stale=registry.prepareSignedInFarm({} as never,target,options),later=registry.prepareSignedInFarm(create(),target,options);
 assert.equal(await stale,false);assert.equal(await later,true);assert.equal(registry.get()?.sha256,sha);
});
