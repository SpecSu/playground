import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {AccountClient,connectFarmAccount,type AccountStorage,type FarmFetch} from '../src/minimal/account-client.ts';
import {handleMinimalApi} from '../server/minimal-api.ts';
import {MinimalD1Repository,type MinimalD1Database,type MinimalD1Statement} from '../server/minimal-d1.ts';
import type {MinimalResult} from '../src/minimal/cloud-contract.ts';
import {createHash} from 'node:crypto';
const T=1_793_000_000_000;
const flush=async()=>{for(let i=0;i<3;i++)await new Promise<void>(resolve=>setImmediate(resolve));};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
function storage():AccountStorage{const values=new Map<string,string>();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);},key:i=>[...values.keys()][i]??null,get length(){return values.size;}};}
async function setup(t:{after:(fn:()=>void)=>void}){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../server/minimal-schema.sql',import.meta.url),'utf8'));
 const prepare=(query:string):MinimalD1Statement=>{let args:(string|number|null)[]=[];const s:MinimalD1Statement={bind(...values){args=values;return s;},async first<T>(){return (sql.prepare(query).get(...args)??null) as T|null;},async all<T>(){return {results:sql.prepare(query).all(...args) as T[]};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return s;};
 const db:MinimalD1Database={prepare,async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const repository=new MinimalD1Repository(db);let subject='recovery-test-account',now=T;
 const sent:string[]=[];let intercept:((input:RequestInfo|URL,init:RequestInit|undefined,normal:()=>Promise<Response>)=>Promise<Response>)|undefined;
 const fetcher:FarmFetch=async(input,init)=>{if(init?.method==='POST')sent.push(String(init.body));const normal=()=>handleMinimalApi(new Request(new URL(String(input),'https://test.invalid'),{...init,headers:{...Object.fromEntries(new Headers(init?.headers)), 'oai-authenticated-user-id':subject}}),{enabled:true,subject,repository,clock:()=>now++,newId:()=>crypto.randomUUID(),fingerprint:async s=>createHash('sha256').update(s).digest('hex')});return intercept?intercept(input,init,normal):normal();};
 const local=storage(),connected=await connectFarmAccount(fetcher,local);assert.equal(connected.status,'online');if(connected.status!=='online')throw new Error('fixture');const client=connected.client;
 await client.bootstrap({mode:'new'});await flush();
 t.after(()=>{client.dispose();sql.close();});
 return {client,fetcher,local,sql,sent,advance:(ms:number)=>{now+=ms;},setSubject:(s:string)=>{subject=s;},setIntercept:(fn:typeof intercept)=>{intercept=fn;},newClient:()=>new AccountClient(client.account,structuredClone(client.view),fetcher,local)};
}
test('a confirmed POST settles the outbox and updates authority without waiting on a slow GET',async t=>{
 const f=await setup(t),get=deferred<Response>(),post=deferred<void>();let finished=false;
 f.setIntercept(async(_,init,normal)=>{if(init?.method==='POST'){const response=await normal();post.resolve();return response;}return get.promise;});
 const operation=f.client.command({type:'welcome'}).then(result=>{finished=true;return result;});await post.promise;await flush();
 try{assert.equal(finished,true,'confirmed command must not remain locked behind a read');assert.equal(f.client.busy,false);assert.equal(f.client.pending,null);assert.equal(f.client.farm!.state.coins,120);assert.equal(f.client.farm!.revision,2);}finally{get.resolve(Response.json({account:f.client.account,view:f.client.view}));await operation;}
});
test('a failed follow-up read cannot turn a confirmed accepted or rejected command into unknown',async t=>{
 const f=await setup(t);f.setIntercept((_,init,normal)=>{if(init?.method==='POST')return normal();throw new Error('GET offline');});
 const accepted=await f.client.command({type:'welcome'});assert.equal(accepted.accepted,true);assert.equal(f.client.pending,null);assert.equal(f.client.farm!.state.coins,120);
 const rejected=await f.client.command({type:'welcome'});assert.equal(rejected.accepted,false);assert.equal(f.client.pending,null);assert.equal(f.client.farm!.state.coins,120);
});
test('response loss keeps the exact request through reload and retries a committed purchase without double spending',async t=>{
 const f=await setup(t);await f.client.command({type:'welcome'});await f.client.command({type:'move',to:{x:1,z:1}});f.advance(10_000);await flush();
 f.setIntercept(async(_,init,normal)=>{const response=await normal();if(init?.method==='POST')throw new Error('response lost after commit');return response;});
 await assert.rejects(f.client.command({type:'buyEgg',theme:'grassland'}));const raw=f.sent.at(-1);assert.ok(f.client.pending);assert.equal(f.local.length,1);
 f.setIntercept(undefined);const reloaded=f.newClient();t.after(()=>reloaded.dispose());const result=await reloaded.retry();await flush();
 assert.equal(result.accepted,true);assert.equal(f.sent.at(-1),raw);assert.equal(reloaded.pending,null);assert.equal(reloaded.farm!.state.coins,90);assert.equal(reloaded.farm!.state.eggs.length,1);assert.equal(f.local.length,0);
 const receipts=f.sql.prepare('SELECT COUNT(*) n FROM minimal_receipts').get()!;assert.equal(receipts.n,4);
});
test('unknown retry stays pending and does not allow a replacement request',async t=>{
 const f=await setup(t);f.setIntercept(async()=>{throw new Error('offline');});await assert.rejects(f.client.command({type:'welcome'}));const first=f.sent.at(-1);await assert.rejects(f.client.retry());assert.equal(f.sent.at(-1),first);const sent=f.sent.length;await assert.rejects(f.client.command({type:'move',to:{x:0,z:0}}));assert.equal(f.sent.length,sent);assert.equal(f.local.length,1);
});
test('replaying a recorded rejection clears pending without accepting or changing its command',async t=>{
 const f=await setup(t);f.setIntercept(async(_,init,normal)=>{const response=await normal();if(init?.method==='POST')throw new Error('lost rejection');return response;});
 await assert.rejects(f.client.command({type:'buyEgg',theme:'grassland'}));const raw=f.sent.at(-1);f.setIntercept(undefined);const result=await f.client.retry();assert.equal(result.accepted,false);assert.equal(f.client.pending,null);assert.equal(f.sent.at(-1),raw);assert.equal(f.client.farm!.state.eggs.length,0);
});
test('authentication change retains the old account outbox and never executes it for the new account',async t=>{
 const f=await setup(t);f.setIntercept(async()=>{throw new Error('offline');});await assert.rejects(f.client.command({type:'welcome'}));const raw=f.sent.at(-1);f.setIntercept(undefined);f.setSubject('other-account');await assert.rejects(f.client.retry(),/账号已变化/);assert.equal(f.sent.at(-1),raw);assert.ok(f.client.pending);assert.equal(f.local.length,1);f.setSubject('recovery-test-account');assert.equal((await f.client.retry()).accepted,true);
});
test('stale background GET and immutable old receipt cannot roll a newer canonical revision backwards',async t=>{
 const f=await setup(t),oldView=structuredClone(f.client.view);await f.client.command({type:'welcome'});await flush();const newView=structuredClone(f.client.view);
 f.setIntercept((_,init,normal)=>init?.method==='POST'?normal():Promise.resolve(Response.json({account:f.client.account,view:{...oldView,serverTime:newView.serverTime+1000}})));
 await f.client.refresh();assert.equal(f.client.farm!.revision,2);assert.equal(f.client.farm!.state.coins,120);
});
test('a malformed successful HTTP response is not an acknowledgement',async t=>{
 const f=await setup(t);f.setIntercept(async()=>Response.json({accepted:true,code:'ok',serverTime:T,farm:null}));await assert.rejects(f.client.command({type:'welcome'}));assert.ok(f.client.pending);assert.equal(f.local.length,1);assert.equal(f.client.farm!.state.coins,0);
});
test('disposing an account during POST prevents late authority and outbox changes',async t=>{
 const f=await setup(t),post=deferred<Response>();f.setIntercept((_,init,normal)=>init?.method==='POST'?post.promise:normal());const task=f.client.command({type:'welcome'});await flush();f.client.dispose();post.resolve(Response.json({accepted:true,code:'ok',message:'ok',serverTime:T,farm:f.client.farm}));await assert.rejects(task);assert.equal(f.local.length,1);assert.equal(f.client.farm!.state.coins,0);
});

for(const phase of ['fetch','body'] as const)test(`a hung ${phase} times out without dropping the immutable outbox`,async t=>{
 const f=await setup(t);t.mock.timers.enable({apis:['setTimeout']});const held=deferred<Response>(),body=deferred<unknown>();
 f.setIntercept((_,init,normal)=>init?.method==='POST'?phase==='fetch'?held.promise:Promise.resolve({ok:true,json:()=>body.promise} as Response):normal());
 let error:unknown;const task=f.client.command({type:'welcome'}).catch(e=>{error=e;});await flush();const pending=JSON.stringify(f.client.pending);
 t.mock.timers.tick(15_000);await flush();
 try{assert.equal(f.client.busy,false,'timeout must release the in-flight gate');assert.match(String(error),/连接|超时/);assert.equal(JSON.stringify(f.client.pending),pending);assert.equal(f.local.length,1);}finally{f.client.dispose();held.resolve(Response.json({}));body.resolve({});await task;}
});
test('retrying an old immutable receipt after a newer refresh never rolls back the current farm',async t=>{
 const f=await setup(t);f.setIntercept(async(_,init,normal)=>{const response=await normal();if(init?.method==='POST')throw new Error('lost response');return response;});await assert.rejects(f.client.command({type:'welcome'}));
 f.setIntercept(undefined);const otherStorage=storage(),other=new AccountClient(f.client.account,structuredClone(f.client.view),f.fetcher,otherStorage);t.after(()=>other.dispose());await other.refresh();assert.equal((await other.command({type:'move',to:{x:1,z:1}})).accepted,true);await flush();await f.client.refresh();assert.equal(f.client.farm!.revision,3);
 const result=await f.client.retry();assert.equal(result.farm!.revision,2);assert.equal(f.client.farm!.revision,3);assert.equal(f.client.pending,null);
});
test('a timed-out late POST cannot settle or overwrite a later retry and next request',async t=>{
 const f=await setup(t);t.mock.timers.enable({apis:['setTimeout']});const late=deferred<Response>();f.setIntercept((_,init,normal)=>init?.method==='POST'?late.promise:normal());const first=f.client.command({type:'welcome'}).catch(()=>{});await flush();t.mock.timers.tick(15_000);await first;const request=f.sent.at(-1);
 f.setIntercept(undefined);await f.client.retry();await flush();assert.equal(f.sent.at(-1),request);await f.client.command({type:'move',to:{x:1,z:1}});await flush();const revision=f.client.farm!.revision;
 late.resolve(Response.json({accepted:true,code:'ok',message:'late',serverTime:T+50000,farm:{...f.client.farm,revision:2}}));await flush();assert.equal(f.client.farm!.revision,revision);assert.equal(f.client.pending,null);assert.equal(f.local.length,0);
});
test('outbox removal failure preserves the same request and blocks a second economic operation',async t=>{
 const f=await setup(t),remove=f.local.removeItem;f.local.removeItem=()=>{throw new Error('storage unavailable');};await assert.rejects(f.client.command({type:'welcome'}));const raw=f.sent.at(-1);assert.equal(f.client.farm!.state.coins,120);assert.ok(f.client.pending);assert.equal(f.local.length,1);const count=f.sent.length;await assert.rejects(f.client.command({type:'welcome'}));assert.equal(f.sent.length,count);
 f.local.removeItem=remove;const result=await f.client.retry();assert.equal(result.accepted,true);assert.equal(f.sent.at(-1),raw);assert.equal(f.client.farm!.state.coins,120);assert.equal(f.client.pending,null);
});
test('confirmed offer and trade receipts update locks and daily usage before a follow-up GET',async t=>{
 const f=await setup(t);const oldFarm=structuredClone(f.client.farm!),day='2026-10-26',at=Date.parse('2026-10-26T02:00:00Z');
 // Complete API-shaped receipts: transport is the only controlled boundary here.
 let next:MinimalResult={accepted:true,code:'ok',message:'deposited',serverTime:at,farm:{...oldFarm,revision:2,activeOfferId:'offer_one'},offer:{offerId:'offer_one',ownerAccountId:f.client.account.uid,animalId:'animal_one',revision:1,status:'open',createdAt:at,expiresAt:at+100000,tradeId:null}};
 f.setIntercept(async(_,init)=>{if(init?.method!=='POST')throw new Error('read offline');return Response.json(next);});
 await f.client.wishing({type:'deposit',animalId:'animal_one',consent:'any-different-species'});assert.equal(f.client.view.ownOffer?.offerId,'offer_one');assert.equal(f.client.view.dayKey,day);assert.equal(f.client.view.usedToday,false);
 next={...next,farm:{...oldFarm,revision:3,activeOfferId:null},offer:{...next.offer!,status:'withdrawn',revision:2}};await f.client.wishing({type:'withdraw',offerId:'offer_one',offerRevision:1});assert.equal(f.client.view.ownOffer,null);assert.equal(f.client.view.usedToday,false);
 next={...next,farm:{...oldFarm,revision:4,activeOfferId:null},tradeId:'trade_one'};await f.client.wishing({type:'accept',offerId:'other',offerRevision:1,ownAnimalId:'animal_one'});assert.equal(f.client.view.usedToday,true);
 next={accepted:true,code:'ok',message:'next day',serverTime:at+86_400_000,farm:{...oldFarm,revision:5,activeOfferId:null}};await f.client.command({type:'stopMove'});assert.equal(f.client.view.usedToday,false);assert.equal(f.client.view.dayKey,'2026-10-27');assert.equal(f.client.view.resetAt,Date.parse('2026-10-27T16:00:00Z'));
});
test('the completion notification can start the next command without the old finally unlocking it',async t=>{
 const f=await setup(t),held=deferred<Response>();let next:Promise<MinimalResult>|undefined,posted=0;
 f.setIntercept((_,init,normal)=>init?.method==='POST'&&++posted===2?held.promise:normal());const unsubscribe=f.client.subscribe(()=>{if(!f.client.busy&&!f.client.pending&&!next){next=f.client.command({type:'move',to:{x:1,z:1}});}});
 await f.client.command({type:'welcome'});await flush();unsubscribe();assert.ok(next);assert.equal(f.client.busy,true);assert.equal((f.client.pending!.payload.command as {type:string}).type,'move');
 held.resolve(Response.json({accepted:false,code:'model-rejected',message:'not walking',serverTime:T+1000,farm:f.client.farm}));await next;assert.equal(f.client.busy,false);assert.equal(f.client.pending,null);
});
test('replaying a same-revision receipt cannot rewind the presentation clock when refresh is offline',async t=>{
 const f=await setup(t);await f.client.command({type:'welcome'});await flush();t.mock.timers.enable({apis:['Date'],now:Date.now()});t.mock.timers.tick(60_000);const before=f.client.now();
 const result:MinimalResult={accepted:false,code:'model-rejected',message:'unchanged',serverTime:f.client.view.serverTime,farm:f.client.farm};f.setIntercept(async(_,init)=>{if(init?.method!=='POST')throw new Error('offline read');return Response.json(result);});
 await f.client.command({type:'welcome'});assert.ok(f.client.now()>=before,'acknowledgement must not discard elapsed local presentation time');
});
