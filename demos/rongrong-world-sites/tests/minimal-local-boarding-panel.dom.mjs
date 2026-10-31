import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import BoardingPanel from '../src/minimal/BoardingPanel.tsx';

test('actual boarding panel keeps offline/demo and hosted entry identities separate without requesting or migrating data',async()=>{
 for(const origin of ['http://127.0.0.1:5190','http://localhost:5190','https://fluffy-farm-companions.tangguozhou.chatgpt.site'])for(const named of [false,true]){
  const w=new Window({url:origin+'/?name=twx&uid=private&save=must-not-copy'});
  Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement});
  Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true});
  w.localStorage.setItem('existing-save','unchanged');
  let reads=0;
  const client=named?{demoName:'twx',account:{uid:'private'},now:()=>0,subscribe:()=>()=>{},boardings(){reads++;throw new Error('No local real-friend request');},refresh(){reads++;throw new Error('No local real-friend request');}}:undefined;
  const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host);
  try{
   await act(async()=>{root.render(createElement(BoardingPanel,{client,onClose(){}}));await new Promise(resolve=>setImmediate(resolve));});
   const entry=host.querySelector('[data-production-entry]');assert.ok(entry);
   const local=origin.startsWith('http:');
   assert.equal(entry.getAttribute('href'),local?'https://fluffy-farm-companions.tangguozhou.chatgpt.site/':'/');
   assert.equal(host.textContent.includes('真人寄养在在线牧场使用'),local);
   assert.equal(new URL(entry.href).search,'');
   assert.equal(host.querySelector('input[aria-label="好友码"]'),null);
   assert.equal(reads,0);assert.equal(w.localStorage.length,1);assert.equal(w.localStorage.getItem('existing-save'),'unchanged');
  }finally{await act(async()=>root.unmount());await w.happyDOM.close();}
 }
});
