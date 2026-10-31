import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {MinimalAuthority} from '../src/minimal/authority.ts';
import {AccountClient,type AccountStorage,type FarmFetch} from '../src/minimal/account-client.ts';
import {MinimalD1Repository,type MinimalD1Database,type MinimalD1Statement} from '../server/minimal-d1.ts';
import type {MinimalResult,MinimalView} from '../src/minimal/cloud-contract.ts';

// Exact source graph captured byte-for-byte from the published P0 v36 commit, not a
// reimplementation or canned receipt. Keep this portable across Sites source bundles
// without historical Git objects. Virtual URLs isolate relative imports; npm stays shared.
const archive=readFileSync(new URL('./fixtures/defense-v36-7de3105.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(archive).digest('hex'),'a19c07d46da757c38697d704a011986c980ff0d740ec551d74d258ed930fefcb');
const historical=JSON.parse(gunzipSync(archive).toString('utf8')) as {schema:string;sourceCommit:string;files:Record<string,{sha256:string;source:string}>};
assert.equal(historical.schema,'historical-source-graph/v1');assert.equal(historical.sourceCommit,'7de310505c5ef4dae428ba4964f8494b0cdeef50');
const legacyRoot=new URL('./__defense_v36__/',import.meta.url).href;
const legacyHooks=registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith(legacyRoot))return {url:specifier,shortCircuit:true};
  if(context.parentURL?.startsWith(legacyRoot)&&specifier.startsWith('.'))return {url:new URL(specifier,context.parentURL).href,shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){
  if(!url.startsWith(legacyRoot))return next(url,context);
  const path=decodeURIComponent(url.slice(legacyRoot.length));
  const saved=historical.files[path];assert.ok(saved,`Missing exact historical module ${path}`);
  const source=saved.source;assert.equal(createHash('sha256').update(source).digest('hex'),saved.sha256,`Historical module identity ${path}`);
  if(path.endsWith('.json'))return {format:'json',source,shortCircuit:true};
  return {format:'module',source:stripTypeScriptTypes(source,{mode:'strip',sourceUrl:url}),shortCircuit:true};
 },
});
const {AccountClient:LegacyClient}=await import(legacyRoot+'src/minimal/account-client.ts') as {AccountClient:typeof AccountClient};
const {MinimalAuthority:LegacyAuthority}=await import(legacyRoot+'src/minimal/authority.ts') as {MinimalAuthority:typeof MinimalAuthority};
legacyHooks.deregister();
const UID=`uid_${'a'.repeat(64)}`,NOW=1793000000000;
const flush=async()=>{for(let i=0;i<4;i++)await new Promise<void>(r=>setImmediate(r));};
const storage=():AccountStorage=>{const map=new Map<string,string>();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);},removeItem:k=>{map.delete(k);},key:i=>[...map.keys()][i]??null,get length(){return map.size;}};};
async function fixture(t:{after:(fn:()=>void)=>void}){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../server/minimal-schema.sql',import.meta.url),'utf8'));t.after(()=>sql.close());
 const prepare=(query:string):MinimalD1Statement=>{let args:(string|number|null)[]=[];const s:MinimalD1Statement={bind(...values){args=values;return s;},async first<T>(){return (sql.prepare(query).get(...args)??null) as T|null;},async all<T>(){return {results:sql.prepare(query).all(...args) as T[]};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return s;};
 let queue:Promise<unknown>=Promise.resolve();const db:MinimalD1Database={prepare,batch(statements){const run=queue.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}});queue=run.catch(()=>{});return run;}};
 const repository=new MinimalD1Repository(db);let now=NOW,id=0;
 const options={clock:()=>now,newId:()=>`upgrade_${++id}`,fingerprint:async(v:string)=>createHash('sha256').update(v).digest('hex')};
 const old=new LegacyAuthority(repository,options),current=new MinimalAuthority(repository,options),local=storage(),account={uid:UID,handle:'升级测试',createdAt:NOW};
 await old.bootstrap(UID,{requestId:'old-bootstrap',mode:'new'});await old.command(UID,{requestId:'old-welcome',expectedRevision:1,command:{type:'welcome'}});
 let authority=old,loss:'none'|'before'|'after'='none',lastRequest:Record<string,unknown>|undefined,lastResult:MinimalResult|undefined;const posted:string[]=[];
 const fetcher:FarmFetch=async(input,init)=>{
  if(init?.method!=='POST')return Response.json({account,view:await authority.get(UID)});
  const body=JSON.parse(String(init.body)),route=new URL(String(input),'http://local.invalid').pathname.split('/').at(-1);posted.push(String(init.body));lastRequest=body;
  if(loss==='before')throw new Error('offline before commit');
  if(route==='creative')lastResult=await authority.creative(UID,body);
  else if(route==='command')lastResult=await authority.command(UID,body);
  else if(route==='wishing')lastResult=await authority.wishing(UID,body);
  else if(route==='bootstrap')lastResult=await authority.bootstrap(UID,body);
  else if(route==='boarding-command')lastResult=await authority.boarding(UID,body);
  else throw new Error('unexpected route '+route);
  if(loss==='after')throw new Error('ACK lost after commit');return Response.json(lastResult);
 };
 const clients:AccountClient[]=[];t.after(()=>clients.forEach(c=>c.dispose()));
 const client=async(legacy=false,view?:MinimalView)=>{const c=new (legacy?LegacyClient:AccountClient)(account,view??await authority.get(UID),fetcher,local);clients.push(c);return c;};
 return {sql,repository,old,current,local,account,client,posted,get lastRequest(){return lastRequest!;},get lastResult(){return lastResult!;},upgrade:()=>{authority=current;loss='none';},lose:(value:typeof loss)=>{loss=value;},advance:(ms:number)=>{now+=ms;}};
}
const oldCommands=[{type:'guardian',guardian:'cat'},{type:'wolf'},{type:'help'}] as const;
for(const command of oldCommands)for(const singleton of [false,true])test(`unexecuted v36 ${command.type} ${singleton?'singleton':'per-request'} outbox finishes rejected and unlocks normal care`,async t=>{
 const f=await fixture(t);await f.repository.transaction(async tx=>{const farm=(await tx.get('farms',UID))!;farm.state.wolfEvent=command.type==='help'?{startedAt:NOW,endsAt:NOW+18000,helped:false}:null;await tx.put('farms',UID,farm);});
 const old=await f.client(true),before=structuredClone(old.farm);f.lose('before');await assert.rejects(old.command(command));const request=f.posted.at(-1)!;assert.ok(old.pending);
 if(singleton){const originalKey=Array.from({length:f.local.length},(_,i)=>f.local.key!(i)!).find(k=>k.endsWith(String(old.pending!.payload.requestId)))!;const raw=f.local.getItem(originalKey)!;f.local.removeItem(originalKey);f.local.setItem(`dreamina-farm-pending-v1:${UID}`,raw);}
 f.upgrade();const current=await f.client();const result=await current.retry();await flush();
 assert.equal(result.accepted,false);assert.equal(result.code,'model-rejected');assert.equal(result.message,'守护与野兽来袭玩法已暂停，继续照顾小伙伴吧');assert.equal(f.posted.at(-1),request);assert.equal(current.pending,null);assert.equal(f.local.length,0);assert.deepEqual(result.farm,before);assert.equal((await current.command({type:'stopMove'})).accepted,true);
});
for(const command of oldCommands)test(`executed v36 ${command.type} receipt replays exactly after upgrade instead of re-executing`,async t=>{
 const f=await fixture(t);await f.repository.transaction(async tx=>{const farm=(await tx.get('farms',UID))!;farm.state.wolfEvent=command.type==='help'?{startedAt:NOW,endsAt:NOW+18000,helped:false}:null;await tx.put('farms',UID,farm);});
 const old=await f.client(true);f.lose('after');await assert.rejects(old.command(command));const committed=structuredClone(f.lastResult),request=f.posted.at(-1);assert.equal(committed.accepted,true);
 const before=(await f.old.get(UID)).farm;f.upgrade();const current=await f.client();const result=await current.retry();await flush();assert.deepEqual(result,committed);assert.equal(f.posted.at(-1),request);assert.equal(current.pending,null);assert.deepEqual((await f.current.get(UID)).farm,before);assert.equal((await current.command({type:'stopMove'})).accepted,true);
});
test('v36 paid purchase receipt remains immutable and never charges twice when upgrading during a saved event',async t=>{
 const f=await fixture(t);await f.repository.transaction(async tx=>{const farm=(await tx.get('farms',UID))!;farm.state.player={x:1,z:1};farm.state.wolfEvent={startedAt:NOW,endsAt:NOW+18000,helped:false};await tx.put('farms',UID,farm);});
 const old=await f.client(true);f.lose('after');await assert.rejects(old.command({type:'buyEgg'}));const paid=structuredClone(f.lastResult);assert.equal(paid.farm!.state.coins,90);assert.equal(paid.farm!.state.eggs.length,1);f.upgrade();const current=await f.client();assert.deepEqual(await current.retry(),paid);await flush();assert.equal(current.pending,null);assert.equal((await f.current.get(UID)).farm!.state.coins,90);assert.equal((await f.current.get(UID)).farm!.state.eggs.length,1);
});
test('malformed guardian payload is terminal invalid-request, never silently applied',async t=>{
 const f=await fixture(t);f.upgrade();const current=await f.client();const result=await current.command({type:'guardian',guardian:'bogus'} as never);assert.equal(result.code,'invalid-request');assert.equal(current.pending,null);assert.equal((await current.command({type:'stopMove'})).accepted,true);
});
test('canonical saved event and past nextWolfAt survive a long gap, commit and read without validator lock',async t=>{
 const f=await fixture(t);await f.repository.transaction(async tx=>{const farm=(await tx.get('farms',UID))!;farm.state.guardian='frog';farm.state.nextWolfAt=NOW-1;farm.state.wolfEvent={startedAt:NOW-1000,endsAt:NOW+1000,helped:true};await tx.put('farms',UID,farm);});f.upgrade();f.advance(7*86400000);const current=await f.client(),before=structuredClone(current.farm!.state);assert.equal((await current.command({type:'stopMove'})).accepted,true);await current.refresh();assert.equal(current.pending,null);assert.equal(current.farm!.state.guardian,'frog');assert.equal(current.farm!.state.nextWolfAt,before.nextWolfAt);assert.deepEqual(current.farm!.state.wolfEvent,before.wolfEvent);assert.equal(current.farm!.state.coins,before.coins);
});
