import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountClient,type AccountStorage} from '../src/minimal/account-client.ts';
import {createMinimalState} from '../src/minimal/model.ts';
import type {CanonicalFarm,MinimalResult,MinimalView} from '../src/minimal/cloud-contract.ts';
const T=1_800_000_000_000;
const account={uid:`uid_${'c'.repeat(64)}`,handle:'timeline',createdAt:T};
function storage():AccountStorage{const values=new Map<string,string>();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);},key:i=>[...values.keys()][i]??null,get length(){return values.size;}};}
function farm(revision=1):CanonicalFarm{return {accountId:account.uid,farmId:'farm_timeline',revision,state:createMinimalState(T),activeOfferId:null,initializedAt:T,origin:'server-created',assetProvenance:{}};}
function view(serverTime=T,canonical=farm()):MinimalView{return {serverTime,farm:canonical,ownOffer:null,dayKey:'2027-01-15',resetAt:T+86_400_000,usedToday:false,serviceGate:'client-migration-required'};}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise<void>(r=>setImmediate(r));};

test('account presentation follows monotonic elapsed time, not wall-clock jumps',t=>{
 let wall=T,elapsed=100;
 t.mock.method(Date,'now',()=>wall);t.mock.method(performance,'now',()=>elapsed);
 const client=new AccountClient(account,view(),async()=>{throw Error('No request expected');},storage());t.after(()=>client.dispose());
 assert.equal(client.now(),T);
 elapsed+=1500;wall+=60_000;
 assert.equal(client.now(),T+1500,'changing device wall clock must not move actors sixty seconds');
 elapsed+=500;wall-=120_000;
 assert.equal(client.now(),T+2000,'turning wall clock back cannot rewind the presentation');
});

test('delayed GET and ACK keep elapsed presentation time without double-counting response latency',async t=>{
 let elapsed=0;t.mock.method(performance,'now',()=>elapsed);
 const get=deferred<Response>(),post=deferred<Response>();let reads=0;
 const client=new AccountClient(account,view(),async(_input,init)=>init?.method==='POST'?post.promise:++reads===1?get.promise:Promise.reject(Error('Background refresh offline')),storage());t.after(()=>client.dispose());
 const reading=client.refresh();elapsed=3000;
 get.resolve(Response.json({account,view:view(T+500)}));await reading;
 assert.equal(client.now(),T+3000,'older response timestamp must not discard already elapsed time');
 const writing=client.command({type:'stopMove'});elapsed=4500;
 const result:MinimalResult={accepted:true,code:'ok',message:'stopped',serverTime:T+3500,farm:farm(2)};
 post.resolve(Response.json(result));await writing;await flush();
 assert.equal(client.now(),T+4500);assert.equal(client.farm!.revision,2);assert.equal(client.pending,null);
 elapsed=5000;assert.equal(client.now(),T+5000);
});

test('an older same-revision receipt settles its outbox without publishing the old snapshot again',async t=>{
 const post=deferred<Response>();let nextView=view(T+5000);let rejectBackground=false;
 const client=new AccountClient(account,view(),async(_input,init)=>init?.method==='POST'?post.promise:rejectBackground?Promise.reject(Error('offline')):Response.json({account,view:nextView}),storage());t.after(()=>client.dispose());
 const writing=client.command({type:'stopMove'});await client.refresh();
 let lastView=client.view,changedViews=0;const unsubscribe=client.subscribe(()=>{if(client.view!==lastView){changedViews++;lastView=client.view;}});t.after(unsubscribe);
 rejectBackground=true;nextView=view();
 post.resolve(Response.json({accepted:false,code:'model-rejected',message:'unchanged',serverTime:T,farm:farm()} satisfies MinimalResult));
 const result=await writing;await flush();
 assert.equal(result.accepted,false);assert.equal(client.pending,null);assert.equal(client.busy,false);
 assert.equal(client.view.serverTime,T+5000);assert.equal(changedViews,0,'a stale immutable receipt is an ACK, not a newer simulation snapshot');
});

test('out-of-order lower-revision GET cannot replace newer authority even with a newer timestamp',async t=>{
 const delayed=deferred<Response>();let reads=0;
 const client=new AccountClient(account,view(),async()=>++reads===1?delayed.promise:Response.json({account,view:view(T+1000,farm(3))}),storage());t.after(()=>client.dispose());
 const first=client.refresh();await client.refresh();delayed.resolve(Response.json({account,view:view(T+2000,farm(2))}));await first;
 assert.equal(client.farm!.revision,3);assert.equal(client.view.serverTime,T+1000);
});

test('a higher canonical revision wins over an older worker timestamp without rewinding clock or daily state',async t=>{
 let elapsed=0;t.mock.method(performance,'now',()=>elapsed);
 const current={...view(T+5000),dayKey:'2027-01-15',resetAt:T+86_400_000,usedToday:true};
 const incoming={...view(T+4000,farm(2)),dayKey:'2027-01-15',usedToday:false};incoming.farm!.state.coins=120;
 const client=new AccountClient(account,current,async()=>Response.json({account,view:incoming}),storage());t.after(()=>client.dispose());
 elapsed=1500;const before=client.now();await client.refresh();
 assert.equal(client.farm!.revision,2,'revision is the authority order, not worker wall clock');
 assert.equal(client.farm!.state.coins,120);assert.equal(client.view.serverTime,T+5000);assert.equal(client.now(),before);
 assert.equal(client.view.dayKey,current.dayKey);assert.equal(client.view.resetAt,current.resetAt);assert.equal(client.view.usedToday,true);
});
