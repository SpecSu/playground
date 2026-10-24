import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Window,type HTMLButtonElement as HappyButton} from 'happy-dom';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {createMinimalState,minimalCommand,saveMinimalState,type MinimalState,type Point} from '../src/minimal/model.ts';

type StubWorld={handlers:{select:(target:{kind:'animal';id:string})=>void;arrive:(p:Point)=>void};state:MinimalState;path:Point|null;focusCalls:number;actions:string[]};
const pause=(ms=30)=>new Promise(r=>setTimeout(r,ms));
const bornAt=1_793_000_000_000;

function newbornState():MinimalState{
 let state=createMinimalState(bornAt-20_000);state.player={x:1,z:1};
 for(const command of [{type:'welcome'},{type:'buyEgg'}] as const){const reply=minimalCommand(state,command,bornAt-20_000);assert.equal(reply.accepted,true);state=reply.state;}
 const eggId=state.eggs[0].id;
 state=minimalCommand(state,{type:'placeEgg',eggId,at:{x:2,z:2}},bornAt-20_000).state;
 const hatch=minimalCommand(state,{type:'hatch',eggId},bornAt);assert.equal(hatch.accepted,true);
 hatch.state.lastHatch=null; // Test an open animal card, not the independent hatch reveal.
 return hatch.state;
}

test('animal card follows baby, juvenile and adult boundaries without a fake adult countdown or new modal',async()=>{
 const hooks=registerHooks({load(url,context,next){
  if(url.endsWith('/minimal/World.ts'))return {format:'module',shortCircuit:true,source:`export class MinimalWorld{constructor(host,state,handlers){this.state=state;this.handlers=handlers;this.path=null;this.focusCalls=0;this.actions=[];globalThis.__growthTestWorld=this;}update(s){this.state=s;}walkTo(p){this.path=p;return true;}setPlacementMode(){}setWeatherPreferences(){}focus(){this.focusCalls++;}zoom(){}cancelWalk(){this.path=null;}perform(a){this.actions.push(a);}dispose(){}screenPoint(){return {x:195,y:300};}}`};
  if(url.endsWith('/feed/PhoneViewport.tsx'))return {format:'module',shortCircuit:true,source:'export default function PhoneViewport({children}){return children;}'};
  return next(url,context);
 }});
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement});
 const originalNow=Date.now;let now=bornAt;Date.now=()=>now;
 const {default:MinimalApp}=await import('../src/minimal/MinimalApp.tsx');
 const host=w.document.createElement('div');w.document.body.append(host);let root=createRoot(host as unknown as HTMLElement);
 const scene=()=>(globalThis as unknown as {__growthTestWorld:StubWorld}).__growthTestWorld;
 const selectAnimal=async()=>{const world=scene();world.handlers.select({kind:'animal',id:world.state.animals[0].id});await pause();assert.ok(world.path);world.handlers.arrive(world.path);await pause();};
 const card=()=>{const value=host.querySelector('[aria-label="场景动作"]');assert.ok(value);return value;};
 try{
  assert.equal(saveMinimalState(w.localStorage,newbornState()),true);
  root.render(createElement(MinimalApp));await pause();await pause();await selectAnimal();
  for(const fixture of [
   {age:0,label:'幼崽',hint:'再过 60 秒成为少年',progress:0},
   {age:59_999,label:'幼崽',hint:'再过 1 秒成为少年',progress:99},
   {age:60_000,label:'少年',hint:'再过 60 秒成年',progress:0},
   {age:119_999,label:'少年',hint:'再过 1 秒成年',progress:99},
   {age:120_000,label:'成年',hint:'已长大',progress:null},
   {age:120_001,label:'成年',hint:'已长大',progress:null},
  ]){
   now=bornAt+fixture.age;await pause(280);
   assert.equal(card().querySelector('[aria-label="成长阶段"]')?.textContent,fixture.label,`stage at ${fixture.age}ms`);
   assert.ok(card().textContent?.includes(fixture.hint),`countdown at ${fixture.age}ms: ${card().textContent}`);
   const progress=card().querySelector('[role="progressbar"]');
   if(fixture.progress===null){assert.equal(progress,null);assert.doesNotMatch(card().textContent!,/再过|秒|分钟/);}
   else{assert.ok(progress);assert.equal(Number(progress.getAttribute('aria-valuenow')),fixture.progress);assert.equal(progress.getAttribute('aria-label'),'到下一阶段的成长进度');}
   assert.equal(host.querySelector('[role="dialog"]'),null,'stage transition never opens a modal');
   assert.equal(host.querySelector('.egg-reveal'),null,'stage transition never replays hatching');
  }
  assert.equal(scene().focusCalls,0,'growth never resets the camera');assert.deepEqual(scene().actions,[],'growth never interrupts another action');
  const settings=Array.from(host.querySelectorAll<HappyButton>('button')).find(b=>b.getAttribute('aria-label')==='设置与说明');assert.ok(settings);settings.click();await pause();
  const help=host.querySelector('[role="dialog"]')!.textContent!;assert.match(help,/幼崽.*少年.*成年/);assert.match(help,/每.*1 分钟/);assert.doesNotMatch(help,/成年约 1 分钟/);
  root.unmount();now=bornAt+86_400_000;root=createRoot(host as unknown as HTMLElement);root.render(createElement(MinimalApp));await pause();await pause();
  assert.equal(host.querySelector('[role="dialog"]'),null);assert.equal(host.querySelector('.egg-reveal'),null,'offline stages do not replay celebrations');
  await selectAnimal();assert.equal(card().querySelector('[aria-label="成长阶段"]')?.textContent,'成年');assert.ok(card().textContent?.includes('已长大'));assert.equal(card().querySelector('[role="progressbar"]'),null);
  root.unmount();now=bornAt+1000;const revealState=newbornState();revealState.animals[0].size='giant';revealState.animals[0].growth={version:1,scales:[.6,1.2,2.2]};revealState.lastHatch={animalId:revealState.animals[0].id,at:bornAt,position:{x:2,z:2}};assert.equal(saveMinimalState(w.localStorage,revealState),true);root=createRoot(host as unknown as HTMLElement);root.render(createElement(MinimalApp));await pause();await pause();
  const reveal=host.querySelector('.egg-reveal');assert.ok(reveal);assert.match(reveal.textContent!,/幼崽/,'a large eventual potential still hatches as a baby');assert.doesNotMatch(reveal.textContent!,/居然是巨型|大号|大大的/,'hatch copy never mistakes eventual potential for current size');
  root.unmount();now=bornAt+59_999;const legacy=newbornState();delete legacy.animals[0].growth;delete legacy.animals[0].growthAgeMs;assert.equal(saveMinimalState(w.localStorage,legacy),true);root=createRoot(host as unknown as HTMLElement);root.render(createElement(MinimalApp));await pause();await pause();await selectAnimal();
  assert.equal(card().querySelector('[aria-label="成长阶段"]')?.textContent,'少年');assert.ok(card().textContent?.includes('再过 1 秒成年'),'legacy card uses its preserved 60-second adult deadline');now=bornAt+60_000;await pause(280);assert.equal(card().querySelector('[aria-label="成长阶段"]')?.textContent,'成年');assert.ok(card().textContent?.includes('已长大'));assert.equal(card().querySelector('[role="progressbar"]'),null);
 }finally{root.unmount();Date.now=originalNow;hooks.deregister();await w.happyDOM.close();}
});
