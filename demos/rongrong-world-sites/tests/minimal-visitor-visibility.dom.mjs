import test from 'node:test';import assert from 'node:assert/strict';
import {createElement,act} from 'react';import {createRoot} from 'react-dom/client';
import {installFixture} from './helpers/network-motion-fixture.mjs';
import {createMinimalState,MINIMAL_STORAGE_KEY} from '../src/minimal/model.ts';
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));};
const button=(host,name)=>{const b=[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent===name);assert.ok(b,name);return b;};
test('late World creation while document hidden must remain paused',async()=>{
 const f=await installFixture();let root;
 try{Object.defineProperty(f.w.document,'visibilityState',{get:()=> 'hidden',configurable:true});Object.defineProperty(f.w.document,'hidden',{get:()=>true,configurable:true});
 const {VisitorFarm}=await import('../src/minimal/VisitorFarm.tsx');const host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);
 await act(async()=>{root.render(createElement(VisitorFarm,{sampleId:'forest',onHome(){},onFriends(){}}));await flush();});
 assert.equal(f.world().playerMotionVisible,false,'new visitor World must use current hidden state even if hidden before dynamic import resolves');
 }finally{if(root)await act(async()=>root.unmount());await f.dispose();}
});
test('window blur during visit must not resume home presentation or write formal local farm',async()=>{
 const f=await installFixture();let root;
 try{const state=createMinimalState(f.now);state.welcomeClaimed=true;state.coins=777;state.nextWolfAt=Number.MAX_SAFE_INTEGER;f.w.localStorage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(state));
 const {default:App}=await import('../src/minimal/MinimalApp.tsx');const host=f.w.document.createElement('div');f.w.document.body.append(host);root=createRoot(host);
 await act(async()=>{root.render(createElement(App));await flush();});const home=f.world();
 await act(async()=>button(host,'好友牧场').click());await act(async()=>{button(host,'串门：Rummons的芦苇水乡（示例）').click();await flush();});assert.equal(home.playerMotionVisible,false);
 const before=f.w.localStorage.getItem(MINIMAL_STORAGE_KEY),homeBefore=home.state.updatedAt;
 await act(async()=>{f.advance(5000);await flush();});assert.equal(f.w.localStorage.getItem(MINIMAL_STORAGE_KEY),before,'periodic tick paused');
 await act(async()=>{f.w.dispatchEvent(new f.w.Event('blur'));await flush();});
 console.log(JSON.stringify({scenario:'visitor-blur',homeBefore,homeAfter:home.state.updatedAt,formalStorageChanged:f.w.localStorage.getItem(MINIMAL_STORAGE_KEY)!==before,storedUpdatedAt:JSON.parse(f.w.localStorage.getItem(MINIMAL_STORAGE_KEY)).updatedAt}));
 assert.equal(home.state.updatedAt,homeBefore,'global blur must not advance hidden home timeline');
 assert.equal(f.w.localStorage.getItem(MINIMAL_STORAGE_KEY),before,'visitor/global blur must not write formal farm');
 }finally{if(root)await act(async()=>root.unmount());await f.dispose();}
});
