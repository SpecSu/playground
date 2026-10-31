import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Window} from 'happy-dom';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {metadata} from '../app/layout.tsx';
import Farm from '../src/main.tsx';
import {FarmBoundary} from '../src/FarmBoundary.tsx';
import FarmEntry from '../src/minimal/FarmEntry.tsx';
import {MINIMAL_STORAGE_KEY,LEGACY_MINIMAL_STORAGE_KEY} from '../src/minimal/model.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('hosted and local titles plus actual bootstrap/error shells use 绒绒世界 without renaming identity keys',()=>{
 assert.equal(metadata.title,'绒绒世界');assert.match(read('local/index.html'),/<title>绒绒世界<\/title>/);assert.doesNotMatch(metadata.description,/守护|装备|野兽/);
 assert.match(renderToStaticMarkup(createElement(Farm)),/绒绒世界/);
 const boundary=new FarmBoundary({children:null});boundary.state={error:'load failed'};assert.match(renderToStaticMarkup(boundary.render()),/<h1>绒绒世界<\/h1>/);
 const handlers={},root={querySelector:()=>null,style:{},textContent:''},calls=[];
 vm.runInNewContext(read('public/boot-guard.js'),{window:{addEventListener:(name,fn)=>handlers[name]=fn},document:{getElementById:()=>root},location:{pathname:'/'},fetch:(url,init)=>{calls.push([url,init]);return Promise.resolve();}});
 handlers.error({message:'test failure'});assert.match(root.textContent,/^绒绒世界启动遇到问题/);assert.equal(calls[0][0],'/api/diagnostics');
 assert.equal(MINIMAL_STORAGE_KEY,'dreamina-egg-farm-v3');assert.equal(LEGACY_MINIMAL_STORAGE_KEY,'dreamina-egg-farm-v2');
});
test('actual account-loading entry displays the new game brand while retaining origin, query and storage',async()=>{
 const w=new Window({url:'https://fluffy-farm-companions.tangguozhou.chatgpt.site/?name=brand-test'}),oldFetch=globalThis.fetch,events=[];
 Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,ResizeObserver:w.ResizeObserver,localStorage:w.localStorage,getComputedStyle:w.getComputedStyle.bind(w),requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w),IS_REACT_ACT_ENVIRONMENT:true});
 w.localStorage.setItem('brand-storage-sentinel','untouched');globalThis.fetch=(input)=>{events.push(String(input));return new Promise(()=>{});};
 const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host);
 try{await act(async()=>{root.render(createElement(FarmEntry));for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));});assert.equal(host.querySelector('h2')?.textContent,'绒绒世界');assert.match(host.textContent,/正在确认你的账号和存档/);assert.equal(w.location.search,'?name=brand-test');assert.equal(w.localStorage.getItem('brand-storage-sentinel'),'untouched');assert.ok(events.every(url=>url.startsWith('/api/minimal/')));}
 finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;await w.happyDOM.close();}
});
