import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {MinimalAuthority} from '../src/minimal/authority.ts';
import {AccountClient,pendingAccountKey,type AccountStorage,type FarmFetch} from '../src/minimal/account-client.ts';
import {MinimalD1Repository,type MinimalD1Database,type MinimalD1Statement} from '../server/minimal-d1.ts';
import type {MinimalResult,MinimalView} from '../src/minimal/cloud-contract.ts';

// Exact source graph captured byte-for-byte from the pre-purchase commit, not a
// reimplementation or canned receipt. Keep this portable across Sites source bundles
// without historical Git objects. Virtual URLs isolate relative imports; npm stays shared.
const archive=readFileSync(new URL('./fixtures/legacy-create-493f6e9.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(archive).digest('hex'),'ae855a23e6d967eade84bbda1dcab3b648a49f44b9eca4c81641a5eb5e002080');
const historical=JSON.parse(gunzipSync(archive).toString('utf8')) as {schema:string;sourceCommit:string;files:Record<string,{sha256:string;source:string}>};
assert.equal(historical.schema,'historical-source-graph/v1');assert.equal(historical.sourceCommit,'493f6e9d0e9ecbe7b5111d4202cf9ae97d6f1c3b');
const legacyRoot=new URL('./__legacy_493f6e9__/',import.meta.url).href;
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
const UID=`uid_${'a'.repeat(64)}`,FRIEND=`uid_${'b'.repeat(64)}`,NOW=1793000000000;
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
const oldWish={type:'create',templateId:'wish-tree',name:'升级前的树',prompt:'旧版本已经交给服务器的愿望'};

for(const singleton of [false,true])test(`committed old create without assetId replays through upgrade (${singleton?'legacy singleton':'per-request'} outbox)`,async t=>{
 const f=await fixture(t),oldClient=await f.client(true);f.lose('after');await assert.rejects(oldClient.creative(oldWish as never));
 const original=structuredClone(f.lastResult),request=structuredClone(f.lastRequest),pending=structuredClone(oldClient.pending!);assert.equal(original.accepted,true,'real old authority accepts its old create contract');assert.equal(original.farm!.creative!.jobs.length,1);assert.equal(original.farm!.creative!.assets.length,0);assert.equal(original.farm!.state.coins,120);assert.equal('assetId' in (pending.payload.command as object),false);
 assert.ok(await f.current.receipt(UID,request.requestId as string));
 if(singleton){const key=pendingAccountKey(UID,request.requestId as string);f.local.setItem(pendingAccountKey(UID),f.local.getItem(key)!);f.local.removeItem(key);}
 oldClient.dispose();f.advance(2500);f.upgrade();const reloaded=await f.client();assert.deepEqual(reloaded.pending,pending);assert.equal(reloaded.farm!.creative!.jobs[0].status,'ready');const revision=reloaded.farm!.revision;
 const replay=await reloaded.retry();await flush();assert.deepEqual(replay,original,'the original immutable receipt is returned before new validation');assert.equal(f.posted.at(-1),JSON.stringify(pending.payload));assert.equal(reloaded.pending,null);assert.equal(f.local.length,0);assert.ok(reloaded.farm!.revision>=revision);assert.equal(reloaded.farm!.creative!.jobs[0].status,'ready','old queued snapshot must not overwrite newer settled job');assert.equal(reloaded.farm!.creative!.jobs.length,1);
 const claim=await reloaded.creative({type:'claim',jobId:original.job!.id});await flush();assert.equal(claim.accepted,true);assert.equal(claim.farm!.creative!.assets.length,1);assert.equal(claim.farm!.creative!.assets[0].kind,'custom-egg');assert.equal(claim.farm!.creative!.assets[0].egg!.stage,'ready');assert.equal(claim.farm!.state.coins,120,'accepted old job is not charged retroactively');
 const duplicate=await reloaded.creative({type:'claim',jobId:original.job!.id});await flush();assert.equal(duplicate.code,'job-unavailable');assert.equal(reloaded.pending,null);assert.equal(reloaded.farm!.creative!.assets.length,1);
 const freeRetry=await f.current.creative(UID,{...request,requestId:'fresh-old-shape',expectedRevision:reloaded.farm!.revision});assert.equal(freeRetry.code,'invalid-request');assert.equal((await f.current.get(UID)).farm!.creative!.jobs.length,1);
});

test('unexecuted old create terminates after upgrade without a free job or a stuck outbox',async t=>{
 const f=await fixture(t),oldClient=await f.client(true);f.lose('before');await assert.rejects(oldClient.creative(oldWish as never));const pending=structuredClone(oldClient.pending!);assert.equal(await f.current.receipt(UID,pending.payload.requestId as string),null);oldClient.dispose();f.upgrade();const current=await f.client();const rejected=await current.retry();await flush();assert.equal(rejected.code,'invalid-request');assert.equal(rejected.accepted,false);assert.equal(current.pending,null);assert.equal(f.local.length,0);assert.equal(current.farm!.creative?.jobs.length??0,0);assert.equal(current.farm!.creative?.assets.length??0,0);assert.equal(current.farm!.state.coins,120);
 const again=await f.current.creative(UID,pending.payload);assert.deepEqual(again,rejected,'the new terminal rejection is itself replayable');assert.equal((await current.command({type:'stopMove'})).accepted,true,'normal commands are no longer blocked');await flush();assert.equal(current.pending,null);
});

test('real legacy client methods accept terminal current-authority rejections without validation deadlocks',async t=>{
 const f=await fixture(t);f.upgrade();const oldClient=await f.client(true);
 for(const [run,code] of [
  [()=>oldClient.bootstrap({mode:'new'}),'already-initialized'],
  [()=>oldClient.command({type:'welcome'}),'model-rejected'],
  [()=>oldClient.wishing({type:'withdraw',offerId:'missing',offerRevision:1}),'offer-unavailable'],
  [()=>oldClient.creative(oldWish as never),'invalid-request'],
 ] as const){const result=await run();await flush();assert.equal(result.code,code);assert.equal(result.accepted,false);assert.equal(oldClient.pending,null);assert.equal(f.local.length,0);}
});

test('new boarding error codes and an interrupted boarding request settle through the same upgraded codec',async t=>{
 const f=await fixture(t);f.upgrade();await f.current.bootstrap(FRIEND,{requestId:'friend-bootstrap',mode:'new'});
 await f.repository.transaction(async tx=>{for(const uid of [UID,FRIEND]){await tx.put('profiles',uid,{uid,handle:'正式测试伙伴',createdAt:NOW,ownerBound:false});const farm=(await tx.get('farms',uid))!;farm.state.animals=[{id:`${farm.farmId}:parent`,name:'成年羊',species:'sheep',sex:'female',size:'normal',position:{x:2,z:2},activity:'idle',energy:85,bond:0,bornAt:NOW-200000,activityUntil:NOW+600000}];farm.assetProvenance[farm.state.animals[0].id]='server-created';await tx.put('farms',uid,farm);}});
 const alice=await f.client(),animalId=alice.farm!.state.animals[0].id,consent='egg-to-initiator-helper-5-coins' as const;
 const unavailable=await alice.boarding({type:'cancel',invitationId:'missing',invitationRevision:1});await flush();assert.equal(unavailable.code,'boarding-unavailable');assert.equal(alice.pending,null);
 const missingFriend=await alice.boarding({type:'invite',targetUid:`uid_${'f'.repeat(64)}`,animalId,consent});await flush();assert.equal(missingFriend.code,'friend-unavailable');assert.equal(alice.pending,null);
 f.lose('after');await assert.rejects(alice.boarding({type:'invite',targetUid:FRIEND,animalId,consent}));const invitation=structuredClone(f.lastResult);assert.equal(invitation.accepted,true);assert.equal(alice.pending!.route,'boarding-command');alice.dispose();f.lose('none');const restored=await f.client();assert.equal((await restored.retry()).accepted,true);await flush();assert.equal(restored.pending,null);
 const busy=await restored.boarding({type:'invite',targetUid:FRIEND,animalId,consent});await flush();assert.equal(busy.code,'boarding-busy');assert.equal(restored.pending,null);
 const bobAccount={uid:FRIEND,handle:'好友',createdAt:NOW},bobLocal=storage(),bob=new AccountClient(bobAccount,await f.current.get(FRIEND),async(_input,init)=>init?.method==='POST'?Response.json(await f.current.boarding(FRIEND,JSON.parse(String(init.body)))):Response.json({account:bobAccount,view:await f.current.get(FRIEND)}),bobLocal);t.after(()=>bob.dispose());
 const mismatch=await bob.boarding({type:'accept',invitationId:invitation.boarding!.id,invitationRevision:1,animalId:bob.farm!.state.animals[0].id,consent});await flush();assert.equal(mismatch.code,'boarding-partner');assert.equal(bob.pending,null);assert.equal(bobLocal.length,0);assert.equal(f.local.length,0);
});
