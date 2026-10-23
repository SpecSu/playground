import test from 'node:test';
import assert from 'node:assert/strict';
import {Window,type HTMLButtonElement as HappyButton} from 'happy-dom';
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {createEstate,currentProfile,commandEstate,type Profile} from '../src/v5/estate.ts';
import {initialOpening} from '../src/v5/opening.ts';
import {buildingFootprint,type LayoutEdit} from '../src/v5/layout.ts';
const T=1_800_000_000_000;
function ready(){const estate=createEstate('quick-build',T),p=currentProfile(estate);p.tutorial='done';p.opening=initialOpening('done');p.threat=null;p.guardian='cat';p.guardianAt={x:8,z:1};return estate;}
async function mount(profile:Profile){
 const {default:QuickBuildPanel}=await import('../src/v5/QuickBuildPanel.tsx');
 const browser=new Window(),keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperties(globalThis,{window:{value:browser,configurable:true},document:{value:browser.document,configurable:true},navigator:{value:browser.navigator,configurable:true},IS_REACT_ACT_ENVIRONMENT:{value:true,configurable:true}});
 const host=browser.document.createElement('div');browser.document.body.append(host);const root=createRoot(host as unknown as HTMLElement),commands:{type:string;extra?:Record<string,unknown>}[]=[];const calls={closed:0,planner:0,theme:0,explore:0};let ghost:unknown;
 const render=async(p:Profile)=>act(async()=>root.render(createElement(QuickBuildPanel,{profile:p,busy:false,send:(type,extra)=>commands.push({type,extra}),onGhost:value=>{ghost=value;},onClose:()=>calls.closed++,onPlanner:()=>calls.planner++,onTheme:()=>calls.theme++,onExplore:()=>calls.explore++})));
 await render(profile);
 return {host,commands,calls,render,get ghost(){return ghost;},click:async(selector:string)=>act(async()=>{const button=host.querySelector<HappyButton>(selector);assert.ok(button,selector);button.click();}),cleanup:async()=>{await act(async()=>root.unmount());for(const key of keys){const d=previous.get(key);if(d)Object.defineProperty(globalThis,key,d);else Reflect.deleteProperty(globalThis,key);}await browser.happyDOM.close();}};
}
test('quick build presents three recognizable facilities without coordinate tables or rule paragraphs',async()=>{
 const h=await mount(currentProfile(ready()));try{assert.equal(h.host.querySelectorAll('[data-quick-kind]').length,3);assert.equal(h.host.querySelectorAll('[data-quick-kind] svg').length,3);for(const title of ['瞭望台','保护围栏','饲料坊'])assert.ok(h.host.textContent.includes(title));assert.doesNotMatch(h.host.textContent,/坐标|回棚路线|不可达|保护位|基准版本/);assert.equal(h.host.querySelector('input,select,.estate-map'),null);assert.equal(h.commands.length,0);}finally{await h.cleanup();}
});
test('preview costs nothing, protects the stationed companion and confirmation sends only one real transaction then closes',async()=>{
 const estate=ready(),p=currentProfile(estate),before=structuredClone(p),h=await mount(p);try{await h.click('[data-quick-kind="tower"]');assert.deepEqual(p,before);assert.equal(h.commands.length,0);assert.ok(h.ghost);assert.match(h.host.textContent,/建这里/);await h.click('[data-command="quick-build-confirm"]');await h.click('[data-command="quick-build-confirm"]');assert.equal(h.commands.length,1);assert.equal(h.calls.closed,1);const c=h.commands[0];assert.equal(c.type,'layout');assert.equal(c.extra?.baseVersion,p.layout.version);const result=commandEstate(estate,{id:'quick-confirm',type:c.type,session:p.session,...c.extra},T);assert.equal(result.accepted,true,result.message);const construction=currentProfile(result.state).layout.construction!;assert.ok(construction);assert.equal(construction.reservedCost,12);const edit=c.extra!.edit as Extract<LayoutEdit,{type:'place'}>;assert.equal(edit.kind,'tower');const b=construction.target.buildings.find(b=>b.id===edit.id)!;assert.equal(buildingFootprint(b).some(at=>at.x===8&&at.z===1),false);}finally{await h.cleanup();}
});
test('insufficient resources stay a short actionable state and never offer free construction',async()=>{
 const p=currentProfile(ready());p.materials=2;const h=await mount(p);try{await h.click('[data-quick-kind="tower"]');assert.match(h.host.textContent,/还差10金币/);const button=h.host.querySelector<HappyButton>('[data-command="quick-build-confirm"]');assert.ok(button?.disabled);await h.click('[data-command="quick-build-confirm"]');assert.equal(h.commands.length,0);assert.equal(h.calls.closed,0);await h.click('[data-quick-explore]');assert.equal(h.calls.explore,1);}finally{await h.cleanup();}
});
test('events and existing construction explain the pause, and planner/theme remain explicit secondary links',async()=>{
 const p=currentProfile(ready());p.threat=createEstate('threat',T).profiles.home.threat;const h=await mount(p);try{assert.match(h.host.textContent,/先陪大家回家/);assert.ok([...h.host.querySelectorAll<HappyButton>('[data-quick-kind]')].every(b=>b.disabled));await h.click('[data-quick-planner]');await h.click('[data-quick-theme]');assert.equal(h.calls.planner,1);assert.equal(h.calls.theme,1);assert.equal(h.commands.length,0);}finally{await h.cleanup();}
});
test('a changed layout requires selecting a fresh placement before confirmation',async()=>{
 const p=currentProfile(ready()),h=await mount(p);try{await h.click('[data-quick-kind="tower"]');const newer=structuredClone(p);newer.layout.version++;await h.render(newer);assert.ok(h.host.querySelector<HappyButton>('[data-command="quick-build-confirm"]')?.disabled);assert.match(h.host.textContent,/重新选/);await h.click('[data-command="quick-build-confirm"]');assert.equal(h.commands.length,0);}finally{await h.cleanup();}
});
