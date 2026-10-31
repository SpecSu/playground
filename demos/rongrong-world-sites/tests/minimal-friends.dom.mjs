import test from 'node:test';import assert from 'node:assert/strict';
import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
import {installFixture} from './helpers/network-motion-fixture.mjs';
const flush=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setTimeout(r,0));};
test('reference-inspired friends drawer shows honest examples, sortable rankings and large visit controls',async()=>{
 const f=await installFixture();let root;
 try{const {FriendsPanel}=await import('../src/minimal/FriendsPanel.tsx');const host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);let target;
 await act(async()=>root.render(createElement(FriendsPanel,{onClose(){},onVisit:v=>target=v})));
 assert.equal(host.querySelectorAll('[data-friend-row]').length,5);assert.equal(host.querySelectorAll('.friend-sample-badge').length,5);assert.match(host.textContent,/示例热度/);assert.doesNotMatch(host.textContent,/金币/);
 const expected=[['贝壳','beike','oasis'],['加新','jiaxin','glacier'],['Rummons','rummons','forest'],['吉吉','jiji','lunar'],['咕咕','gugu','school-playground']];
 const verifyPortraits=async()=>{for(const [name,file,sampleId] of expected){const row=[...host.querySelectorAll('[data-friend-row]')].find(r=>r.querySelector('strong')?.textContent===name);assert.ok(row,`${name} display row`);const portrait=row.querySelector('img');assert.ok(portrait,`${name} supplied portrait`);assert.equal(portrait.getAttribute('src'),`/assets/friends/${file}.png`);assert.equal(portrait.getAttribute('alt'),`${name}的展示头像`);assert.equal(portrait.style.objectFit,'cover');assert.equal(portrait.style.objectPosition,'center top');await act(async()=>row.querySelector('.friend-visit').click());assert.deepEqual(target,{kind:'sample',sampleId});}};
 await verifyPortraits();
 const buttons=[...host.querySelectorAll('button')];await act(async()=>buttons.find(b=>b.textContent==='本周').click());assert.match(host.querySelector('[data-friend-row]').textContent,/加新/);await verifyPortraits();const week=buttons.find(b=>b.textContent==='本周');week.focus();await act(async()=>root.render(createElement(FriendsPanel,{onClose(){},onVisit:v=>target=v})));assert.ok(f.w.document.activeElement===week,'parent updates must not steal tab focus');
 await act(async()=>host.querySelector('[data-friend-row] .friend-visit').click());assert.deepEqual(target,{kind:'sample',sampleId:'glacier'});
 await act(async()=>buttons.find(b=>b.getAttribute('aria-label')==='好友与示例说明').click());assert.match(f.w.document.body.textContent,/不是真人好友/);assert.match(f.w.document.body.textContent,/按你提供的顺序/);assert.match(f.w.document.body.textContent,/不代表真实账号在线/);assert.doesNotMatch(f.w.document.body.textContent,/主题占位|待原始资料可读/);
 }finally{if(root)await act(async()=>root.unmount());await f.dispose();}
});
test('actual visitor React/World keeps carry temporary, rejects sale and disposes on switch without touching home',async()=>{
 const f=await installFixture();let root,home;
 try{const {VisitorFarm}=await import('../src/minimal/VisitorFarm.tsx');const {MinimalWorld}=await import('../src/minimal/World.ts');const {createMinimalState}=await import('../src/minimal/model.ts');
 const {sampleFarm}=await import('../src/minimal/sample-farms.ts');const homeState=sampleFarm('forest',f.now).state;homeState.animals[0].id='own-sheep';homeState.coins=817;const homeBaseline=JSON.stringify(homeState);const homeHost=f.w.document.createElement('div');f.w.document.body.append(homeHost);home=new MinimalWorld(homeHost,homeState,{select(){},arrive(){}});await flush();let homeResourceDisposed=0,homeTriangles=0;home.animals.get('own-sheep').art.root.traverse(o=>{if(o.geometry){homeTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;o.geometry.addEventListener('dispose',()=>homeResourceDisposed++);}if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.addEventListener('dispose',()=>homeResourceDisposed++);});assert.ok(homeTriangles>1000,'actual GLB loaded in retained home');home.zoom(.4);const camera=home.camera.position.clone(),zoom=home.camera.zoom;home.setPlayerMotionVisible(false);
 const host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);let wentHome=0;const props={onHome:()=>wentHome++,onFriends(){}};
 const render=async id=>act(async()=>{root.render(createElement(VisitorFarm,{...props,sampleId:id}));await flush();});
 await render('forest');let world=f.world();assert.notEqual(world,home);assert.match(host.textContent,/Rummons的岛/);assert.match(host.textContent,/示例/);
 const button=label=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===label||b.getAttribute('aria-label')===label);assert.ok(b,label);return b;};
 const animal=world.state.animals[0];await act(async()=>world.handlers.select({kind:'animal',id:animal.id}));await act(async()=>button('举起来').click());assert.equal(world.state.carriedAnimalId,animal.id);assert.doesNotMatch(host.textContent,/出售|换走|放进背包/);
 await act(async()=>button('放下来').click());assert.equal(world.state.carriedAnimalId,null);await act(async()=>button('打招呼').click());assert.equal(world.state.coins,0);assert.equal(world.state.lastCompanionGiftDay,undefined);
 const stale=world.handlers.arrive;await render('glacier');assert.equal(world.disposed,true);world=f.world();assert.equal(world.state.carriedAnimalId,null);const current=JSON.stringify(world.state);await act(async()=>stale({x:2,z:3},1));assert.equal(JSON.stringify(world.state),current);
 for(const id of ['oasis','lunar','forest','glacier']){const old=world;await render(id);world=f.world();assert.equal(old.disposed,true);assert.equal(host.querySelectorAll('canvas').length,1);}
 await act(async()=>button('回家').click());assert.equal(wentHome,1);assert.equal(world.disposed,true);assert.equal(JSON.stringify(homeState),homeBaseline);assert.ok(home.camera.position.equals(camera));assert.equal(home.camera.zoom,zoom);assert.equal(home.playerMotionVisible,false);home.setPlayerMotionVisible(true);assert.equal(home.playerMotionVisible,true);assert.equal(f.w.localStorage.length,0);assert.equal(homeResourceDisposed,0,'disposing visitor must not dispose retained home GLB resources');assert.equal(home.animals.get('own-sheep').art.root.userData.animationStatus,'ready');console.log(JSON.stringify({homeTriangles,homeResourceDisposed,visitorSwitches:6,maxVisitorCanvases:1,homeCameraDelta:home.camera.position.distanceTo(camera),homeCoins:homeState.coins,storageWrites:f.w.localStorage.length}));
 }finally{if(root)await act(async()=>root.unmount());home?.dispose();await f.dispose();}
});
test('sample boarding UI requires consent and keeps successful demo eggs and helper coins explicitly separate',async()=>{
 const f=await installFixture();let root;
 try{const {SampleBoardingPanel}=await import('../src/minimal/SampleBoardingPanel.tsx');const {createSampleBoardingAdapter}=await import('../src/minimal/sample-boarding.ts');const adapter=createSampleBoardingAdapter({realmId:'viewer-a',now:()=>f.now,outcome:()=>true});const host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);const props={realmId:'viewer-a',sampleId:'forest',adapter,onClose(){}};
 await act(async()=>{root.render(createElement(SampleBoardingPanel,props));await flush();});
 const button=text=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);return b;};assert.equal(button('发出演示邀请').disabled,true);
 await act(async()=>host.querySelector('input[type=checkbox]').click());await act(async()=>{button('发出演示邀请').click();await flush();});assert.match(host.textContent,/待确认/);
 await act(async()=>{button('模拟好友同意').click();await flush();});assert.match(host.textContent,/演示寄养中/);
 await act(async()=>{button('快进这次演示').click();await flush();});assert.match(host.textContent,/演示蛋 1/);assert.match(host.textContent,/帮手演示金币 5/);assert.match(host.textContent,/不可带回正式牧场/);assert.equal(f.w.localStorage.length,0);
 let release;const lateAdapter={...adapter,read:()=>new Promise(r=>release=r)};
 await act(async()=>root.render(createElement(SampleBoardingPanel,{...props,adapter:lateAdapter})));const result=await adapter.read('forest');await act(async()=>{root.render(createElement(SampleBoardingPanel,{...props,sampleId:'glacier'}));await flush();});await act(async()=>{release(result);await flush();});assert.match(host.textContent,/冰川港湾/);assert.doesNotMatch(host.textContent,/演示蛋 1/);
 }finally{if(root)await act(async()=>root.unmount());await f.dispose();}
});
test('a delayed demo poll cannot roll a confirmed invitation back to idle',async()=>{
 const f=await installFixture();let root;
 try{const {SampleBoardingPanel}=await import('../src/minimal/SampleBoardingPanel.tsx');const {createSampleBoardingAdapter}=await import('../src/minimal/sample-boarding.ts');const service=createSampleBoardingAdapter({realmId:'a',now:()=>f.now});let reads=0,release;const adapter={...service,read:async id=>{const result=await service.read(id);return ++reads===2?new Promise(r=>release=()=>r(result)):result;}};const host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(SampleBoardingPanel,{sampleId:'forest',realmId:'a',adapter,onClose(){}}));await flush();});await act(async()=>{f.advance(1000);await flush();});assert.ok(release);
 await act(async()=>host.querySelector('input').click());await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='发出演示邀请').click();await flush();});assert.match(host.textContent,/待确认/);await act(async()=>{release();await flush();});assert.match(host.textContent,/待确认/);assert.equal([...host.querySelectorAll('button')].some(b=>b.textContent==='发出演示邀请'),false);
 }finally{if(root)await act(async()=>root.unmount());await f.dispose();}
});

test('a failed superseded demo poll cannot surface after a confirmed command',async()=>{
 const f=await installFixture();let root;
 try{const {SampleBoardingPanel}=await import('../src/minimal/SampleBoardingPanel.tsx');const {createSampleBoardingAdapter}=await import('../src/minimal/sample-boarding.ts');const service=createSampleBoardingAdapter({realmId:'a',now:()=>f.now});let reads=0,reject;const adapter={...service,read:async id=>++reads===2?new Promise((_r,j)=>reject=j):service.read(id)};const host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(SampleBoardingPanel,{sampleId:'forest',realmId:'a',adapter,onClose(){}}));await flush();});await act(async()=>{f.advance(1000);await flush();});await act(async()=>host.querySelector('input').click());await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='发出演示邀请').click();await flush();});await act(async()=>{reject(new Error('迟到的旧错误'));await flush();});assert.match(host.textContent,/待确认/);assert.doesNotMatch(host.textContent,/迟到的旧错误/);
 }finally{if(root)await act(async()=>root.unmount());await f.dispose();}
});
