import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Window,type HTMLButtonElement as HappyButton} from 'happy-dom';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {MINIMAL_STORAGE_KEY,type MinimalState,type Point} from '../src/minimal/model.ts';
type Target={kind:'tile';x:number;z:number}|{kind:'animal';id:string}|{kind:'egg';id:string}|{kind:'shop'};
type StubWorld={handlers:{select:(target:Target)=>void;arrive:(p:Point)=>void};state:MinimalState;path:Point|null;actions:string[];disposed:boolean;placementMode:boolean};
const pause=(ms=30)=>new Promise(r=>setTimeout(r,ms));

test('egg UI: welcome once, physical shop purchase, ground incubation, overhead carry and explicit sale',async()=>{
 const hooks=registerHooks({load(url,context,next){
  if(url.endsWith('/minimal/World.ts'))return {format:'module',shortCircuit:true,source:`export class MinimalWorld{constructor(host,state,handlers){this.state=state;this.handlers=handlers;this.actions=[];globalThis.__eggTestWorld=this;}update(s){this.state=s;}walkTo(p){this.path=p;return true;}setPlacementMode(active){this.placementMode=active;}focus(){}zoom(){}cancelWalk(){this.path=null;}perform(a){this.actions.push(a);}dispose(){this.disposed=true;}screenPoint(){return {x:195,y:300};}}`};
  if(url.endsWith('/feed/PhoneViewport.tsx'))return {format:'module',shortCircuit:true,source:'export default function PhoneViewport({children}){return children;}'};
  return next(url,context);
 }});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement});
 const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
 const {default:MinimalApp}=await import('../src/minimal/MinimalApp.tsx');
 const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host as unknown as HTMLElement);
 const buttons=()=>Array.from(host.querySelectorAll<HappyButton>('button'));
 const click=async(text:string)=>{const b=buttons().find(b=>b.textContent?.includes(text));assert.ok(b,`button ${text} exists`);assert.equal(b.disabled,false,`${text} enabled`);b.click();await pause();};
 const saved=()=>JSON.parse(w.localStorage.getItem(MINIMAL_STORAGE_KEY)!) as MinimalState;
 const advance=async(ms:number)=>{now+=ms;await pause(280);};
 const arrive=async(scene:StubWorld)=>{assert.ok(scene.path);await advance(2500);scene.handlers.arrive(scene.path!);await pause();};
 try{
  root.render(createElement(MinimalApp));await pause();await pause();
  const scene=(globalThis as unknown as {__eggTestWorld:StubWorld}).__eggTestWorld;assert.ok(scene);assert.match(host.textContent!,/领取 120 金币/);assert.doesNotMatch(host.textContent!,/精力/);
  await click('领取 120');assert.equal(saved().coins,120);assert.equal(saved().welcomeClaimed,true);assert.equal(saved().animals.length,0);assert.doesNotMatch(host.textContent!,/领取 120 金币/);
  await click('去商店');assert.equal(buttons().some(b=>b.textContent?.includes('买一颗')),false,'purchase not offered before reaching shop');await arrive(scene);const buyButton=buttons().find(b=>b.textContent?.includes('买一颗'))!;buyButton.click();buyButton.click();await pause();assert.equal(saved().coins,90);assert.equal(saved().eggs.length,1);assert.match(host.textContent!,/点一块亮起的空地/);assert.equal(scene.placementMode,true);
  const eggId=saved().eggs[0].id;scene.handlers.select({kind:'shop'});await pause();assert.equal(scene.placementMode,true,'shop cannot steal placement mode');scene.handlers.select({kind:'tile',x:2,z:2});await pause();assert.equal(saved().eggs[0].location,'bag','placement waits for walk');const canceled=scene.path!;buttons().find(b=>b.getAttribute('aria-label')==='取消放蛋')!.click();await pause();scene.handlers.arrive(canceled);await pause();assert.equal(saved().eggs[0].location,'bag','canceled placement never consumes an egg');assert.equal(scene.placementMode,false);buttons().find(b=>b.getAttribute('aria-label')?.startsWith('蛋袋'))!.click();await pause();await click('神秘动物蛋');scene.handlers.select({kind:'tile',x:2,z:2});await pause();await arrive(scene);assert.equal(saved().eggs[0].location,'ground');assert.equal(scene.placementMode,false);assert.equal(buttons().some(b=>b.textContent?.includes('孵开看看')),false);
  await advance(11000);await click('孵开看看');assert.equal(saved().eggs.length,0);assert.equal(saved().animals.length,1);assert.equal(saved().lastHatch?.animalId,saved().animals[0].id);
  await advance(6000);const animalId=saved().animals[0].id;scene.handlers.select({kind:'animal',id:animalId});await pause();await arrive(scene);const wandered=scene.state.animals.find(a=>a.id===animalId)!;wandered.position=[{x:0,z:3},{x:3,z:3},{x:3,z:0}].sort((a,b)=>Math.hypot(b.x-scene.state.player.x,b.z-scene.state.player.z)-Math.hypot(a.x-scene.state.player.x,a.z-scene.state.player.z))[0];await click('举起来');assert.equal(saved().carriedAnimalId,null,'a wandering animal is approached before pickup');assert.ok(scene.path);await arrive(scene);await click('举起来');assert.equal(saved().carriedAnimalId,animalId);assert.equal(saved().animals.length,1,'carry never duplicates or removes the animal');scene.handlers.select({kind:'animal',id:animalId});await pause();assert.equal(buttons().some(b=>b.textContent?.includes('举起来')),false,'carrying never offers another pickup');assert.match(host.textContent!,/带去商店出售/);
  await click('带去商店出售');await arrive(scene);assert.equal(saved().animals.length,1,'arrival at shop does not auto-sell');assert.match(host.textContent!,/出售后会离开牧场/);const balance=saved().coins;await click('出售 ·');assert.equal(saved().animals.length,0);assert.equal(saved().carriedAnimalId,null);assert.ok(saved().coins>balance);assert.ok(saved().collection.length>0,'collection survives sale');assert.match(host.textContent!,/再挑一颗蛋/);assert.doesNotMatch(host.textContent!,/买第一颗蛋/);
  // New destination wins; an old arrival cannot open the newer target early.
  scene.handlers.select({kind:'tile',x:3,z:3});await pause();const oldDestination=scene.path!;scene.handlers.select({kind:'shop'});await pause();scene.handlers.arrive(oldDestination);await pause();assert.equal(host.querySelector('[aria-label="场景动作"]'),null);await arrive(scene);assert.ok(host.querySelector('[aria-label="场景动作"]'));
  // A canceled approach must not reopen a stale world card behind settings.
  scene.handlers.select({kind:'shop'});await pause();const stale=scene.path!;buttons().find(b=>b.getAttribute('aria-label')==='设置与说明')!.click();await pause();scene.handlers.arrive(stale);await pause();assert.equal(host.querySelector('[aria-label="场景动作"]'),null);
  assert.equal(saved().eggs.some(e=>e.id===eggId),false);buttons().find(b=>b.getAttribute('aria-label')==='关闭面板')!.click();await pause();scene.handlers.select({kind:'shop'});await pause();await arrive(scene);await click('买一颗');buttons().find(b=>b.getAttribute('aria-label')==='取消放蛋')!.click();await pause();scene.handlers.select({kind:'shop'});await pause();await arrive(scene);const beforeRebuy=saved().coins;await click('买一颗');assert.equal(saved().coins,beforeRebuy-30,'cancel placement unlocks a subsequent intentional purchase');assert.equal(saved().eggs.length,2);root.unmount();assert.equal(scene.disposed,true);
  const second=createRoot(host as unknown as HTMLElement);second.render(createElement(MinimalApp));await pause();await pause();assert.doesNotMatch(host.textContent!,/领取 120 金币/,'welcome cannot repeat after reload');second.unmount();
 }finally{Date.now=originalNow;hooks.deregister();await w.happyDOM.close();}
});
