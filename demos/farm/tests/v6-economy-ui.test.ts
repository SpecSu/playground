import test from 'node:test';
import assert from 'node:assert/strict';
import {Window,type HTMLButtonElement as HappyButton} from 'happy-dom';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import FarmCyclePanel from '../src/v5/FarmCyclePanel.tsx';
import {createEstate,currentProfile} from '../src/v5/estate.ts';
import {createProduction} from '../src/v5/v6-production.ts';
const T=1800000000000;
test('V6 product controls explain batches and dispatch real processing and workshop actions',async()=>{
 const w=new Window();Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement});
 const p=currentProfile(createEstate('v6-ui',T));p.production=createProduction(T,'home',p.animals.map(a=>a.id));p.economy!.warehouse.white=4;p.economy!.lots=[{id:'white',tier:'white',amount:4,animalId:p.animals[0].id,version:'v6',source:'production'}];
 const calls:unknown[]=[];const host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host as unknown as HTMLElement);root.render(createElement(FarmCyclePanel,{profile:p,now:T,busy:false,send:(...args:unknown[])=>calls.push(args),onCraft:()=>calls.push('craft')}));await new Promise(r=>setTimeout(r,30));
 assert.match(host.textContent!,/3\/6.*生产位/);assert.match(host.textContent!,/每12小时.*2份白毛/);assert.match(host.textContent!,/每天12份白毛/);assert.equal(host.querySelector('[data-cultivate]'),null);
 (host.querySelector<HappyButton>('[data-craft]')!).click();assert.deepEqual(calls,['craft']);(host.querySelector<HappyButton>('[data-process-green]')!).click();assert.deepEqual(calls[1],['processGreen',{amount:1}]);root.unmount();await w.happyDOM.close();
});
