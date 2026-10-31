import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {installFixture} from './helpers/network-motion-fixture.mjs';
import {createMinimalState,MINIMAL_STORAGE_KEY} from '../src/minimal/model.ts';
const flush=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,0));};
function saved(now){const s=createMinimalState(now);s.welcomeClaimed=true;s.coins=120;s.hatchedCount=1;s.collection=['sheep'];s.guardian='dog';s.wolfEvent={startedAt:now,endsAt:now+18000,helped:false};return s;}
test('actual World does not allocate guardian/wolves or leave a hidden scene/picking footprint for old saved events',async()=>{
 const f=await installFixture();let world;
 try{
  const {MinimalWorld}=await import('../src/minimal/World.ts'),state=saved(f.now),original=structuredClone(state),host=f.w.document.createElement('div');f.w.document.body.append(host);world=new MinimalWorld(host,state,{select(){},arrive(){},now:()=>f.now});await flush();
  assert.equal(!!world.guardian,false,'paused guardian must not even request its model');assert.equal(world.guardRoot.children.length,0);assert.equal(!!world.scene.getObjectById(world.guardRoot.id),false);assert.deepEqual(world.wolves,[]);
  const before=JSON.stringify(world.environmentPlacements);world.guardRoot.position.set(0,0,0);world.guardPath=[];world.updateEnvironment(f.mono,true);assert.equal(JSON.stringify(world.environmentPlacements),before,'dormant guardian does not reserve decoration/avoidance space');
  for(const guardian of ['cat','frog','dog']){world.update({...state,guardian});f.advance(1000);world.animate(f.mono);assert.equal(!!world.guardian,false);assert.deepEqual(world.wolves,[]);}
  assert.deepEqual(state,original);assert.ok(world.playerRoot.parent===world.scene,'player remains in normal scene');
 }finally{world?.dispose();await f.dispose();}
});
test('actual MinimalApp keeps discovery and care available while saved wolf event remains archived',async()=>{
 const f=await installFixture();let root;
 try{
  const state=saved(f.now);f.w.localStorage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(state));const {default:MinimalApp}=await import('../src/minimal/MinimalApp.tsx'),host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(MinimalApp));await flush();});
  assert.equal(host.querySelector('.egg-farm')?.getAttribute('aria-label'),'绒绒世界');assert.equal(!!host.querySelector('.has-wolves'),false);assert.equal(!!host.querySelector('.egg-wolf'),false);assert.ok(host.querySelector('[aria-label="伙伴与发现"]'));assert.ok(host.querySelector('[aria-label="牧场自动照料"]'));assert.ok(!host.textContent.includes('刀盾狗'));assert.deepEqual(JSON.parse(f.w.localStorage.getItem(MINIMAL_STORAGE_KEY)).wolfEvent,state.wolfEvent);
  await act(async()=>host.querySelector('[aria-label="牧场自动照料"]').click());assert.ok(host.querySelector('[role="dialog"]'),'ordinary care panel opens without guard confirmation');
 }finally{if(root)await act(async()=>root.unmount());await f.dispose();}
});
test('actual settings help does not advertise retired wolf music',async()=>{
 const f=await installFixture();let root;
 try{
  f.w.localStorage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(saved(f.now)));const {default:MinimalApp}=await import('../src/minimal/MinimalApp.tsx'),host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(MinimalApp));await flush();});
  await act(async()=>host.querySelector('[aria-label="设置与说明"]').click());await act(async()=>host.querySelector('[aria-label="牧场玩法"]').click());const text=f.w.document.querySelector('[data-panel-help]').textContent;assert.ok(!/小狼|刀盾狗|野兽|紧张/.test(text));assert.match(text,/背景音乐/);assert.match(text,/模拟天气/);
 }finally{if(root)await act(async()=>root.unmount());await f.dispose();}
});
