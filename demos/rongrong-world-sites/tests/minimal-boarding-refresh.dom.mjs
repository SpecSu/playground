import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import BoardingPanel from '../src/minimal/BoardingPanel.tsx';
import {AccountClient,pendingAccountKey} from '../src/minimal/account-client.ts';
import {boardingFixture,ALICE,BOB,NOW} from './helpers/boarding-fixture.ts';
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
async function fixture(t,{terminal='completed',pending=false}={}){
 const w=new Window({url:'https://farm.example/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const timers=new Map();let sequence=0;w.setInterval=fn=>{const id=++sequence;timers.set(id,fn);return id;};w.clearInterval=id=>timers.delete(id);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),f=await boardingFixture();
 await f.repo.change(ALICE,farm=>{farm.state.sequence=terminal==='failed'?0:3;});const invitation=await f.invite();if(terminal!=='expired')await f.accept(invitation.boarding.id,1);
 const accounts=new Map([[ALICE,{uid:ALICE,handle:'Alice',createdAt:NOW}],[BOB,{uid:BOB,handle:'Bob',createdAt:NOW}]]),requests=[];let intercept=null,failFarm=false;
 const fetcher=async(input,init)=>{const route=new URL(String(input),'https://farm.example').pathname.split('/').at(-1),uid=new Headers(init?.headers).get('X-Farm-Account');requests.push({route,uid,method:init?.method??'GET'});
  if(intercept){const response=await intercept({route,uid,init});if(response)return response;}
  if(route==='boarding-command')return Response.json(await f.authority.boarding(uid,JSON.parse(String(init.body))));
  if(route==='boarding')return Response.json(await f.authority.boardingList(uid));
  if(route==='farm'){if(failFarm)throw new Error('controlled farm read failure');return Response.json({account:accounts.get(uid),view:await f.authority.get(uid)});}
  throw new Error('unexpected write '+route);
 };
 const clients=[];const makeClient=async uid=>{const client=new AccountClient(accounts.get(uid),await f.authority.get(uid),fetcher,w.localStorage);clients.push(client);return client;};
 const originalPending={version:1,uid:ALICE,route:'creative',payload:{requestId:'old-unconfirmed-create',expectedRevision:2,command:{type:'create',templateId:'wish-tree',name:'旧愿望',prompt:'保留升级前未确认请求'}}};
 if(pending)w.localStorage.setItem(pendingAccountKey(ALICE,'old-unconfirmed-create'),JSON.stringify(originalPending));
 const client=await makeClient(ALICE);
 const render=async value=>{await act(async()=>{root.render(value?createElement(BoardingPanel,{client:value,onClose(){}}):null);await flush();});};
 await render(client);
 t.after(async()=>{await act(async()=>root.unmount());clients.forEach(c=>c.dispose());await w.happyDOM.close();});
 const poll=async()=>{await act(async()=>{for(const callback of timers.values())callback();await flush();});};
 const end=async()=>{if(terminal==='canceled'){await f.send({type:'cancel',invitationId:invitation.boarding.id,invitationRevision:2},BOB);}else f.setNow(NOW+(terminal==='expired'?600_000:300_000));};
 return {f,w,host,root,client,requests,render,makeClient,poll,end,originalPending,setIntercept:fn=>{intercept=fn;},failFarm:value=>{failFarm=value;}};
}

for(const terminal of ['completed','failed','canceled','expired'])test(`boarding polling synchronizes home locks and rewards after ${terminal}`,async t=>{
 const f=await fixture(t,{terminal});assert.ok(f.client.farm.activeBoardingId);await f.end();await f.poll();
 assert.equal(f.client.farm.activeBoardingId,null,'the list must refresh the real canonical account, not only its cards');assert.equal(f.client.farm.boardingAnimalId,null);assert.equal(f.client.farm.boardingReservedEgg,false);
 assert.equal(f.client.farm.state.eggs.length,terminal==='completed'?1:0);assert.ok(f.host.querySelector('input[aria-label="好友码"]'),'unlocked compose form is restored without another user command');assert.equal(f.host.querySelector('[role="alert"]'),null);
});

test('a boarding poll never treats canonical refresh as the ACK of a restored legacy creative outbox',async t=>{
 const f=await fixture(t,{pending:true});const stored=f.w.localStorage.getItem(pendingAccountKey(ALICE,'old-unconfirmed-create'));await f.end();await f.poll();
 assert.equal(f.client.farm.activeBoardingId,null);assert.deepEqual(f.client.pending,f.originalPending);assert.equal(f.w.localStorage.getItem(pendingAccountKey(ALICE,'old-unconfirmed-create')),stored);assert.equal(f.requests.some(r=>r.method==='POST'),false);assert.match(f.host.textContent,/重试上次指令/);
});

test('farm refresh failure remains explicit and cannot present a newly settled list as synchronized',async t=>{
 const f=await fixture(t);await f.end();f.failFarm(true);await f.poll();assert.ok(f.client.farm.activeBoardingId);assert.match(f.host.querySelector('[role="alert"]')?.textContent??'',/牧场.*同步|同步.*牧场/);assert.doesNotMatch(f.host.textContent,/最多 1 枚蛋已放进你的背包/);
 f.failFarm(false);await f.poll();assert.equal(f.client.farm.activeBoardingId,null);assert.equal(f.host.querySelector('[role="alert"]'),null);assert.match(f.host.textContent,/最多 1 枚蛋已放进你的背包/);
});

test('an obsolete list cannot start a farm refresh after a newer list or unmount',async t=>{
 const f=await fixture(t),old=deferred();let first=true;f.setIntercept(async({route})=>{if(route==='boarding'&&first){first=false;return old.promise;}});
 await f.poll();await f.end();await act(async()=>{f.host.querySelector('[data-refresh-boarding]').click();await flush();});assert.equal(f.client.farm.activeBoardingId,null);const reads=f.requests.filter(r=>r.route==='farm').length;
 await act(async()=>{old.resolve(Response.json({serverTime:NOW,invitations:[]}));await flush();});assert.equal(f.requests.filter(r=>r.route==='farm').length,reads);assert.match(f.host.textContent,/配对成功/);
 const closing=deferred();f.setIntercept(async({route})=>route==='boarding'?closing.promise:undefined);await f.poll();await f.render(null);const closedReads=f.requests.filter(r=>r.route==='farm').length;
 await act(async()=>{closing.resolve(Response.json({serverTime:NOW,invitations:[]}));await flush();});assert.equal(f.requests.filter(r=>r.route==='farm').length,closedReads);assert.equal(f.host.textContent,'');
});

test('switching clients while a farm refresh waits cannot publish the old participants or error',async t=>{
 const f=await fixture(t),delayed=deferred();let gate=true;f.setIntercept(async({route,uid})=>route==='farm'&&uid===ALICE&&gate?delayed.promise:undefined);await f.end();await f.poll();
 assert.ok(f.requests.some(r=>r.route==='farm'&&r.uid===ALICE));const bob=await f.makeClient(BOB);await f.render(bob);assert.match(f.host.textContent,/5 普通金币已到账/);
 gate=false;await act(async()=>{delayed.resolve(Response.json({code:'offline',message:'old account failure'},{status:503}));await flush();});assert.doesNotMatch(f.host.textContent,/old account failure/);assert.match(f.host.textContent,/5 普通金币已到账/);assert.equal(bob.farm.state.coins,105);
});

test('5s background polling cannot starve two sequential 3.4s account reads',async t=>{
 const f=await fixture(t);await f.end();let clock=0;const deliveries=[];
 f.setIntercept(async({route,uid})=>{
  const value=route==='boarding'?await f.f.authority.boardingList(uid):{account:{uid,handle:'Alice',createdAt:NOW},view:await f.f.authority.get(uid)};
  return new Promise(resolve=>deliveries.push({at:clock+3400,deliver:()=>resolve(Response.json(value))}));
 });
 await f.poll();
 for(const at of [3400,5000,6800,8400,10000,11800,13400,15000,16800,18400,20000,21800]){
  clock=at;await act(async()=>{for(const item of [...deliveries])if(item.at<=clock){deliveries.splice(deliveries.indexOf(item),1);item.deliver();}await flush();});
  if(at%5000===0)await f.poll();
 }
 assert.equal(f.client.farm.activeBoardingId,null);assert.match(f.host.textContent,/最多 1 枚蛋已放进你的背包/,'a full successful read cycle must reach the UI despite slower-than-interval latency');
 assert.ok(f.requests.filter(r=>r.route==='boarding').length<=4,'background ticks coalesce instead of perpetually superseding live reads');
});


test('a confirmed command refresh supersedes an older background read without changing its outbox',async t=>{
 const f=await fixture(t),old=deferred(),stale=await f.f.authority.boardingList(ALICE);let first=true;
 f.setIntercept(async({route})=>{if(route==='boarding'&&first){first=false;return old.promise;}});await f.poll();
 const cancel=[...f.host.querySelectorAll('button')].find(b=>b.textContent.includes('取消寄养'));assert.ok(cancel);
 await act(async()=>{cancel.click();await flush();});assert.equal(f.requests.filter(r=>r.method==='POST').length,0,'reviewing cancellation does not mutate');await act(async()=>{f.host.querySelector('[data-confirm-cancel]').click();await flush();});assert.equal(f.client.pending,null);assert.equal(f.client.farm.activeBoardingId,null);assert.match(f.host.textContent,/已取消/);
 await act(async()=>{old.resolve(Response.json(stale));await flush();});assert.match(f.host.textContent,/已取消/);assert.doesNotMatch(f.host.textContent,/服务端结算约/);assert.equal(f.requests.filter(r=>r.method==='POST').length,1);
});
