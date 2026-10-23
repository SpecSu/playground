import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Window} from 'happy-dom';
import WorkshopPanel from '../src/v5/WorkshopPanel.tsx';
import {createEstate,currentProfile} from '../src/v5/estate.ts';
test('a new player can see the gift, honest connection status and material cost without hiding the scene',async()=>{
 const p=currentProfile(createEstate('ui',1800000000000));p.tutorial='done';p.threat=null;
 const w=new Window();try {w.document.body.innerHTML=renderToStaticMarkup(createElement(WorkshopPanel,{profile:p,busy:false,send:()=>{},onPreview:()=>{},onGhost:()=>{}}));
 assert.ok(w.document.querySelector('[data-workshop]'));assert.match(w.document.body.textContent,/首件.*赠送/);assert.ok(w.document.querySelector('[data-workshop-save-draft]'));
 assert.match(w.document.body.textContent,/生成服务未连接/);assert.equal(w.document.querySelector('[data-workshop-generate]')?.getAttribute('disabled'),'');
 assert.equal(w.document.querySelector('[aria-modal="true"]'),null);
 } finally {await w.happyDOM.close();}
});

test('actual React banner trial mounts a Three object at the requested ground cell and cancels without spending',async()=>{
 // Real React effects and Three geometry; this does not verify WebGL appearance.
 const {act}=await import('react'),{Group}=await import('three'),{WorkshopScene}=await import('../src/v5/world-workshop.ts');
 const browser=new Window({url:'http://workshop-test.invalid/'}),prior=new Map<string,PropertyDescriptor|undefined>();
 for(const key of ['window','document','navigator','HTMLElement','MutationObserver','self','Event','CustomEvent','getComputedStyle']){
  prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));const value=key==='window'||key==='self'?browser:(browser as unknown as Record<string,unknown>)[key];
  if(value)Object.defineProperty(globalThis,key,{value:typeof value==='function'&&!/^[A-Z]/.test(key)?value.bind(browser):value,configurable:true});
 }
 prior.set('IS_REACT_ACT_ENVIRONMENT',Object.getOwnPropertyDescriptor(globalThis,'IS_REACT_ACT_ENVIRONMENT'));Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true});
 const {createRoot}=await import('react-dom/client');
 const host=browser.document.createElement('div');browser.document.body.append(host);const root=createRoot(host as unknown as Element);
 const p=currentProfile(createEstate('three-preview-ui',1800000000000));p.tutorial='done';p.threat=null;p.guardian='dog';
 const scene=new Group(),guardian=new Group(),view=new WorkshopScene(scene),point={x:5,z:5};scene.add(guardian);view.sync(p.workshop,p.layout,guardian,p.guardian);
 const before=JSON.stringify(p);let ghost:{x:number;z:number;kind:'decor';valid:boolean;interactive?:boolean}|undefined;let commands=0;
 const click=async(label:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,`button ${label}`);await act(async()=>{button.click();});};
 try{
  await act(async()=>{root.render(createElement(WorkshopPanel,{profile:p,busy:false,send:()=>{commands++;},placementPoint:point,onPreview:(draft,position)=>view.preview(draft,position),onGhost:value=>{ghost=value;}}));});
  await click('庭院旗面');await click('在场景试穿');
  const flag=scene.getObjectByName('workshop-banner');assert.ok(flag,'React effect forwards the draft and ground position to real Three assembly');assert.equal(flag.position.x,-.5);assert.equal(flag.position.z,-.5);
  assert.deepEqual(ghost,{...point,kind:'decor',valid:true,interactive:true});assert.equal(JSON.stringify(p),before);assert.equal(commands,0);
  await click('结束试穿');assert.equal(scene.getObjectByName('workshop-banner'),undefined);assert.equal(ghost,undefined);assert.equal(JSON.stringify(p),before);assert.equal(commands,0);
 }finally{
  await act(async()=>root.unmount());view.dispose();await browser.happyDOM.close();for(const [key,descriptor] of prior){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
 }
});
