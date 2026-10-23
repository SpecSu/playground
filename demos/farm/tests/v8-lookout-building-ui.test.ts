import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createEstate,currentProfile,commandEstate,estateSnapshot} from '../src/v5/estate.ts';
import {developmentActors,suggestDevelopment} from '../src/v5/development.ts';
import EstateView,{type EstateViewProps} from '../src/v5/EstateView.tsx';
const T=1_800_000_000_000;
function elevated(){let s=createEstate('building-ui',T);s=commandEstate(s,{id:'enter-ui',type:'enter'},T).state;const p=currentProfile(s);p.tutorial='done';p.threat=null;p.guardian='cat';p.guardianAt={x:7,z:5};p.layout.buildings.push({id:'watch',kind:'tower',x:7,z:1,rotation:0,paidCost:12,capacity:1,doors:[]});s=commandEstate(s,{id:'look-ui',type:'guardianCommand',session:p.session,command:{kind:'lookout'}},T).state;for(let i=1;i<=8;i++)s=commandEstate(s,{id:`pulse-ui-${i}`,type:'pulse',session:currentProfile(s).session},T+i*1000).state;assert.equal(currentProfile(s).guardianLookout?.phase,'watching');return s;}
test('quick development uses the certified tower entry rather than an upstairs ground obstacle',()=>{
 const p=currentProfile(elevated()),actors=developmentActors(p),entry=p.guardianLookout!.access.entry;
 assert.ok(actors.some(a=>a.x===entry.x&&a.z===entry.z));assert.ok(!actors.some(a=>a.x===Math.round(p.guardianAt.x)&&a.z===Math.round(p.guardianAt.z)));
 const plan=suggestDevelopment(p,'shelter');assert.ok(plan.edit);assert.equal(plan.preview?.ok,true);
});
test('full planner can preview unrelated construction while the guardian watches',()=>{
 const s=elevated(),props:EstateViewProps={data:estateSnapshot(s,T+8000),target:'pipi',sheet:'planner',camera:'overview',reduced:false,busy:false,message:'',error:'',assetStatus:'',worldRef:{current:null},onCommand:()=>{},onSheet:()=>{},onInspect:()=>{},onCamera:()=>{},onMove:()=>{},onStop:()=>{},onReduced:()=>{},onGhost:()=>{}};
 const html=renderToStaticMarkup(createElement(EstateView,props));assert.match(html,/这份方案可以应用/);assert.doesNotMatch(html,/动物或生活设施没有可达的回棚路线/);
});
