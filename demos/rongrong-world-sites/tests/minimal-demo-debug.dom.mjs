import test from 'node:test';import assert from 'node:assert/strict';import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
import {installFixture} from './helpers/network-motion-fixture.mjs';
import {demoDebugFixture} from './helpers/demo-debug-fixture.ts';
import {AccountClient} from '../src/minimal/account-client.ts';
const flush=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,0));};
const button=(host,label)=>{const b=[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent===label);assert.ok(b,`missing ${label}`);return b;};
test('actual Settings reports outbox storage failure without POST or credit and can recover after storage returns',async()=>{
 const f=await installFixture(),api=demoDebugFixture();let root,client;try{
  const a=await api.start(),view=(await api.call('farm'+a.suffix)).body.view,map=new Map([['untouched-local-save','keep exact bytes']]);let fail=true,posts=0;
  const storage={get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem(k,v){if(fail)throw Error('quota');map.set(k,v);},removeItem:k=>map.delete(k)};
  client=new AccountClient(a.account,view,async(input,init)=>{if(init?.method==='POST')posts++;return api.request(String(input).replace('/api/minimal/',''),init?.body?JSON.parse(String(init.body)):undefined);},storage,'twx');
  const {default:App}=await import('../src/minimal/MinimalApp.tsx'),host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(App,{session:client}));await flush();});await act(async()=>button(host,'设置与说明').click());
  await act(async()=>{button(host,'演示金币 +1万').click();await flush();});assert.equal(posts,0);assert.equal(client.pending,null);assert.equal(api.stored(a.account.uid).farm.state.coins,0);assert.equal(map.get('untouched-local-save'),'keep exact bytes');assert.match(host.querySelector('[aria-label="演示调试"] [role="status"]')?.textContent??'',/浏览器暂时无法保存指令/);
  fail=false;await act(async()=>{button(host,'演示金币 +1万').click();await flush();});assert.equal(posts,1);assert.equal(client.farm.state.coins,10000);assert.doesNotMatch(host.querySelector('[aria-label="演示调试"]').textContent,/无法保存/);assert.equal(map.size,1);
 }finally{if(root)await act(async()=>root.unmount());client?.dispose();api.close();await f.dispose();}
});
test('changing the demo client hides previous request feedback and a late result cannot label the new account',async()=>{
 const f=await installFixture(),api=demoDebugFixture();let root,a,b,release;try{
  const first=await api.start(),second=await api.start('test'),viewA=(await api.call('farm'+first.suffix)).body.view,viewB=(await api.call('farm'+second.suffix)).body.view;
  const fetcher=async(input,init)=>{const response=await api.request(String(input).replace('/api/minimal/',''),init?.body?JSON.parse(String(init.body)):undefined);if(init?.method==='POST')return new Promise(resolve=>{release=()=>resolve(response);});return response;};
  a=new AccountClient(first.account,viewA,fetcher,f.w.localStorage,'twx');b=new AccountClient(second.account,viewB,fetcher,f.w.localStorage,'test');
  const {default:Controls}=await import('../src/minimal/DemoDebugControls.tsx'),host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(Controls,{client:a}));await flush();});await act(async()=>{button(host,'演示金币 +1万').click();await flush();});assert.ok(a.pending);assert.ok(release);
  await act(async()=>{root.render(createElement(Controls,{client:b}));await flush();});assert.equal(button(host,'演示金币 +1万').disabled,false);await act(async()=>{release();await flush();});assert.equal(host.querySelector('[role="status"]'),null);assert.equal(b.farm.state.coins,0);assert.equal(b.pending,null);assert.equal(api.stored(first.account.uid).farm.state.coins,10000);
 }finally{release?.();if(root)await act(async()=>root.unmount());a?.dispose();b?.dispose();api.close();await f.dispose();}
});
test('actual Settings grants demo coins through durable client only, locks pending, and retry never doubles credit',async()=>{
 const f=await installFixture(),api=demoDebugFixture();let root,client;try{const a=await api.start(),view=(await api.call('farm'+a.suffix)).body.view,posts=[];let lose=true;
 const fetcher=async(input,init)=>{const path=String(input).replace('/api/minimal/',''),body=init?.body?JSON.parse(String(init.body)):undefined;if(body)posts.push(body);const response=await api.request(path,body);if(body?.command?.type==='demoCoins'&&lose){lose=false;throw Error('lost ACK');}return response;};
 client=new AccountClient(a.account,view,fetcher,f.w.localStorage,'twx');const {default:App}=await import('../src/minimal/MinimalApp.tsx'),host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);
 await act(async()=>{root.render(createElement(App,{session:client}));await flush();});await act(async()=>button(host,'设置与说明').click());assert.match(host.textContent,/演示调试/);assert.match(host.textContent,/仅演示账号/);
 await act(async()=>{button(host,'演示金币 +1万').click();await flush();});assert.ok(client.pending);assert.equal(api.stored(a.account.uid).farm.state.coins,10000);assert.equal(button(host,'演示金币 +1万').disabled,true);assert.equal(button(host,'演示金币 +5万').disabled,true);assert.equal(posts.filter(p=>p.command?.type==='demoCoins').length,1);
 await act(async()=>{button(host,'重试').click();await flush();});assert.equal(client.pending,null);assert.equal(client.farm.state.coins,10000);assert.equal(host.querySelector('.egg-coins b').textContent,'10000');
 await act(async()=>{button(host,'演示金币 +5万').click();await flush();});assert.equal(client.farm.state.coins,60000);assert.equal(host.querySelector('.egg-coins b').textContent,'60000');const grants=posts.filter(p=>p.command?.type==='demoCoins');assert.equal(grants.length,3);assert.equal(grants[0].requestId,grants[1].requestId);assert.notEqual(grants[1].requestId,grants[2].requestId);
 }finally{if(root)await act(async()=>root.unmount());client?.dispose();api.close();await f.dispose();}
});
test('formal and offline Settings do not expose demo grant controls even with name=twx URL',async()=>{
 const f=await installFixture(),api=demoDebugFixture();let root,client;try{const a=await api.start(null),view=(await api.call('farm')).body.view;client=new AccountClient(a.account,view,async(input,init)=>api.request(String(input).replace('/api/minimal/',''),init?.body?JSON.parse(String(init.body)):undefined),f.w.localStorage);const {default:App}=await import('../src/minimal/MinimalApp.tsx'),host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);
 for(const session of [client,undefined]){await act(async()=>{root.render(createElement(App,{key:session?'formal':'local',session}));await flush();});await act(async()=>button(host,'设置与说明').click());assert.equal(host.querySelector('[aria-label="演示调试"]'),null);assert.equal([...host.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')?.startsWith('演示金币')),false);}
 }finally{if(root)await act(async()=>root.unmount());client?.dispose();api.close();await f.dispose();}
});
