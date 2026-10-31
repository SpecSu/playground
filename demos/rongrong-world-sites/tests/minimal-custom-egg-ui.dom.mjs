import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import CreativeStudio from '../src/minimal/CreativeStudio.tsx';
import {MinimalAuthority} from '../src/minimal/authority.ts';
import {AccountClient} from '../src/minimal/account-client.ts';
import {createHash} from 'node:crypto';

test('actual Studio and AccountClient buy first, cancel without loss, configure a category, place then hatch',async()=>{
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let now=1793000000000,id=0,rows=new Map(),tail=Promise.resolve(),close=0,placed=null,failReply=false;
 const repository={transaction(work){const run=tail.then(async()=>{const next=structuredClone(rows);const result=await work({get:async(t,k)=>structuredClone(next.get(`${t}:${k}`))??null,put:async(t,k,v)=>next.set(`${t}:${k}`,structuredClone(v)),listOpenOffers:async()=>[]});rows=next;return result;});tail=run.catch(()=>{});return run;}};
 const uid=`uid_${'d'.repeat(64)}`,account={uid,handle:'demo',createdAt:now};const authority=new MinimalAuthority(repository,{clock:()=>now,newId:()=>`ui_${++id}`,fingerprint:async v=>createHash('sha256').update(v).digest('hex')});
 const send=async(route,command)=>authority[route](uid,{requestId:`setup_${++id}`,expectedRevision:(await authority.get(uid)).farm.revision,command});await authority.bootstrap(uid,{requestId:'new',mode:'new'});await send('command',{type:'welcome'});await repository.transaction(async tx=>{const f=await tx.get('farms',uid);f.state.player={x:1,z:1};await tx.put('farms',uid,f);});
 const client=new AccountClient(account,await authority.get(uid),async(input,init)=>{if(init?.method!=='POST')return Response.json({account,view:await authority.get(uid)});const result=await authority.creative(uid,JSON.parse(init.body));if(failReply){failReply=false;throw new Error('reply lost');}return Response.json(result);},w.localStorage);
 const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host);const props={client,onClose:()=>{close++;},onPlace:id=>{placed=id;},mode:'shop'};const byText=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text));const flush=()=>new Promise(r=>setTimeout(r,15));
 try{
  await act(async()=>root.render(createElement(CreativeStudio,props)));
  assert.equal(!!host.querySelector('textarea'),false,'no free-form wish before an egg exists');assert.equal(!!host.querySelector('[aria-label="自定义小伙伴"]'),false);assert.ok(byText('购买自定义蛋'));
  failReply=true;await act(async()=>{byText('购买自定义蛋').click();await flush();});assert.ok(client.pending);assert.equal((await authority.get(uid)).farm.state.coins,90);assert.equal(!!host.querySelector('textarea'),false);
  await act(async()=>{byText('重试上次指令').click();await flush();});assert.equal(client.pending,null);assert.equal(client.farm.creative.assets.length,1);assert.equal(client.farm.state.coins,90);
  await act(async()=>{byText('我的作品').click();});await act(async()=>{byText('打开蛋').click();});assert.ok(host.querySelector('textarea'));assert.ok(host.querySelector('[aria-label="自定义小伙伴"]'));assert.ok(host.querySelector('[aria-label="自定义物件"]'));assert.ok(host.textContent.includes('小伙伴'));assert.ok(!host.textContent.includes('自定义动物'));assert.equal(host.querySelector('[aria-label="生成地皮 · 未开放"]').disabled,true);
  await act(async()=>{byText('取消配置').click();});assert.equal(!!host.querySelector('textarea'),false);assert.equal(client.farm.creative.assets.length,1);assert.equal(client.farm.creative.jobs.length,0);assert.equal(client.farm.state.coins,90);
  await act(async()=>root.render(createElement(CreativeStudio,{...props,key:'reopen'})));await act(async()=>{byText('打开蛋').click();});await act(async()=>{host.querySelector('[aria-label="自定义物件"]').click();});assert.ok(host.querySelector('[aria-label="选择许愿松树样例"]'));assert.equal(!!host.querySelector('[aria-label="选择便便小伙伴样例"]'),false);
  await act(async()=>{byText('确认蛋内愿望').click();await flush();});assert.equal(client.farm.creative.jobs.length,1);assert.equal(client.farm.creative.assets[0].kind,'custom-egg');now+=2500;await act(async()=>client.refresh());
  await act(async()=>{byText('装入蛋').click();await flush();});assert.equal(client.farm.creative.assets[0].kind,'custom-egg');await act(async()=>{byText('放到空地孵化').click();});assert.equal(placed,client.farm.creative.assets[0].id);await send('creative',{type:'place',assetId:placed,at:{x:2,z:2}});await act(async()=>client.refresh());assert.equal(byText('打开 · 孵化').disabled,true);assert.ok(host.querySelector('progress'));
  now+=15000;await act(async()=>client.refresh());assert.equal(byText('打开 · 孵化').disabled,false);await act(async()=>{byText('打开 · 孵化').click();await flush();});assert.equal(client.farm.creative.assets[0].kind,'prop');assert.equal(client.farm.state.coins,90);assert.equal(client.farm.state.animals.length,0);assert.equal(close,0);
 }finally{await act(async()=>root.unmount());client.dispose();delete globalThis.IS_REACT_ACT_ENVIRONMENT;await w.happyDOM.close();}
});
