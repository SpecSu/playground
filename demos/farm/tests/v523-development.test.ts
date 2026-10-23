import test from 'node:test';
import assert from 'node:assert/strict';
import type {HTMLButtonElement as HappyButton} from 'happy-dom';
import {createEstate,currentProfile,commandEstate} from '../src/v5/estate.ts';
import {initialOpening} from '../src/v5/opening.ts';
import {BUILDING_RULES,commitEdit,buildingFootprint,isOwned,tickConstruction} from '../src/v5/layout.ts';
const T=1_800_000_000_000;
function ready(){const s=createEstate('development-test',T),p=currentProfile(s);p.tutorial='done';p.opening=initialOpening('done');p.threat=null;p.guardian='dog';return s;}
async function module(){const m=await import('../src/v5/development.ts').catch(()=>null);assert.ok(m,'development proposals must use actual layout validation');return m;}
test('three development choices produce affordable legal owned-land plans without changing the save',async()=>{
 const {suggestDevelopment}=await module();const p=currentProfile(ready()),before=structuredClone(p);
 for(const kind of ['tower','shelter','factory'] as const){const plan=suggestDevelopment(p,kind);assert.ok(plan.edit,plan.reason);assert.ok(plan.preview?.ok,plan.preview?.reasons.join(' · '));assert.equal(plan.preview.cost,BUILDING_RULES[kind].cost);const b=plan.preview.after.buildings.find(b=>b.id===plan.edit!.id)!;assert.ok(buildingFootprint(b).every(c=>isOwned(p.layout,c)));assert.equal(plan.preview.metrics.unreachable.length,0);}
 assert.deepEqual(p,before);
});
test('a wild LX does not falsely make development illegal, while construction still reserves a real owned footprint',async()=>{
 const {suggestDevelopment}=await module();const p=currentProfile(ready());p.position={x:-3,z:4};const plan=suggestDevelopment(p,'shelter');assert.ok(plan.preview?.ok);assert.equal(plan.preview.metrics.capacity,12);const committed=commitEdit(p.layout,plan.edit!,{materials:p.materials,eventId:'develop',actors:p.animals.map(a=>a.position),baseVersion:p.layout.version});assert.ok(committed.ok);assert.equal(committed.layout.buildings.length,p.layout.buildings.length);assert.equal(committed.materialDelta,-24);assert.equal(tickConstruction(committed.layout,30_000).layout.buildings.length,p.layout.buildings.length+1);
});
test('insufficient material retains a real preview and a useful reason, with no free build',async()=>{
 const {suggestDevelopment}=await module();const p=currentProfile(ready());p.materials=2;const plan=suggestDevelopment(p,'tower');assert.ok(plan.edit);assert.equal(plan.preview?.ok,false);assert.ok(plan.preview?.reasons.includes('金币不足'));assert.equal(plan.preview?.cost,12);assert.equal(p.materials,2);
});
test('active event, occupied construction and the one-factory limit reject unavailable development',async()=>{
 const {suggestDevelopment}=await module();const s=ready(),p=currentProfile(s);p.threat=createEstate('threat',T).profiles.home.threat;assert.match(suggestDevelopment(p,'tower').reason??'',/事件/);p.threat=null;const plan=suggestDevelopment(p,'factory');const started=commitEdit(p.layout,plan.edit!,{materials:p.materials,eventId:'factory',actors:p.animals.map(a=>a.position)});p.layout=started.layout;assert.match(suggestDevelopment(p,'shelter').reason??'',/施工/);p.layout=tickConstruction(p.layout,10_000).layout;assert.match(suggestDevelopment(p,'factory').reason??'',/已有|一座/);
});
test('the exact preview uses the existing engine transaction and rejects stale confirmation',async()=>{
 const {suggestDevelopment}=await module();let s=ready();const p=currentProfile(s),plan=suggestDevelopment(p,'tower'),version=p.layout.version;
 s=commandEstate(s,{type:'enter',id:'session'},T).state;
 const result=commandEstate(s,{type:'layout',id:'build-development',session:currentProfile(s).session,edit:plan.edit!,baseVersion:version},T);assert.ok(result.accepted,result.message);assert.ok(currentProfile(result.state).layout.construction);
 const duplicate=commandEstate(result.state,{type:'layout',id:'build-development',session:currentProfile(result.state).session,edit:plan.edit!,baseVersion:version},T);assert.equal(currentProfile(duplicate.state).materials,currentProfile(result.state).materials);
 s=ready();currentProfile(s).layout.version++;const stale=commandEstate(s,{type:'layout',id:'stale',edit:plan.edit!,baseVersion:version},T);assert.equal(stale.accepted,false);assert.equal(currentProfile(stale.state).materials,60);
});
test('preview cache ignores clock-only snapshots but updates for navigation and ledger changes',async()=>{
 const {developmentPreviewKey}=await module();const p=currentProfile(ready()),key=developmentPreviewKey(p),copy=structuredClone(p);copy.lastPulseAt+=200;copy.onlineMs+=200;assert.equal(developmentPreviewKey(copy),key);copy.position.x+=.1;assert.equal(developmentPreviewKey(copy),key);copy.position.x+=1;assert.notEqual(developmentPreviewKey(copy),key);copy.position={...p.position};copy.materials--;assert.notEqual(developmentPreviewKey(copy),key);copy.materials=p.materials;copy.layout.version++;assert.notEqual(developmentPreviewKey(copy),key);
});
test('development panel previews before purchase and exploration sends a real move command',async()=>{
 const {Window}=await import('happy-dom');const {createElement,act}=await import('react');const {createRoot}=await import('react-dom/client');const {default:JourneyPanel}=await import('../src/v5/JourneyPanel.tsx');const {LANDMARKS}=await import('../src/v5/journey.ts');
 const window=new Window(),keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperties(globalThis,{window:{value:window,configurable:true},document:{value:window.document,configurable:true},navigator:{value:window.navigator,configurable:true},IS_REACT_ACT_ENVIRONMENT:{value:true,configurable:true}});
 const host=window.document.createElement('div');window.document.body.append(host);const root=createRoot(host as unknown as HTMLElement),commands:{type:string;extra?:Record<string,unknown>}[]=[];let closed=0;const p=currentProfile(ready());
 try{
  await act(async()=>root.render(createElement(JourneyPanel,{profile:p,busy:false,send:(type,extra)=>commands.push({type,extra}),onGhost:()=>{},onClose:()=>closed++})));
  assert.equal(host.querySelectorAll('[data-development-kind]').length,3);
  await act(async()=>host.querySelector<HappyButton>('[data-development-kind="tower"] button')!.click());
  assert.equal(commands.length,0,'choosing an option does not buy it');assert.ok(host.querySelector('[data-development-preview]'));
  await act(async()=>host.querySelector<HappyButton>('[data-command="develop"]')!.click());
  assert.equal(commands[0].type,'layout');assert.equal(commands[0].extra?.baseVersion,p.layout.version);assert.equal((commands[0].extra?.edit as {kind:string}).kind,'tower');assert.equal(closed,1);
  await act(async()=>host.querySelector<HappyButton>(`[data-landmark="${LANDMARKS[0].id}"]`)!.click());
  assert.deepEqual(commands[1],{type:'move',extra:{to:LANDMARKS[0].position}});assert.equal(closed,2);
 }finally{
  await act(async()=>root.unmount());for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}await window.happyDOM.close();
 }
});
test('development avoids a stationed guardian instead of placing the new tower over it',async()=>{
 const {suggestDevelopment,developmentActors}=await module();const p=currentProfile(ready());p.guardian='cat';p.guardianBehavior='station';p.guardianAt={x:8,z:1};
 assert.ok(developmentActors(p).some(point=>point.x===8&&point.z===1));
 const plan=suggestDevelopment(p,'tower');assert.ok(plan.preview?.ok);const building=plan.preview.after.buildings.find(b=>b.id===plan.edit?.id)!;assert.equal(buildingFootprint(building).some(point=>point.x===8&&point.z===1),false,'a selected guardian occupies real navigation space');
 p.guardian=null;assert.equal(developmentActors(p).some(point=>point.x===8&&point.z===1),false,'an unselected guardian position is not a phantom actor');
});
test('guardian cell changes invalidate the chosen development preview cache',async()=>{
 const {developmentPreviewKey}=await module();const p=currentProfile(ready());p.guardian='cat';p.guardianAt={x:8,z:1};const key=developmentPreviewKey(p);p.guardianAt.x+=.1;assert.equal(developmentPreviewKey(p),key);p.guardianAt.x+=1;assert.notEqual(developmentPreviewKey(p),key);p.guardianAt={x:8,z:1};p.guardian=null;assert.notEqual(developmentPreviewKey(p),key);
});
