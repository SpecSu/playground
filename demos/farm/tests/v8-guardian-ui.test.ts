import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Window,type HTMLButtonElement} from 'happy-dom';
import EstateView,{type EstateViewProps} from '../src/v5/EstateView.tsx';
import {createEstate,estateSnapshot} from '../src/v5/estate.ts';
const T=1_800_000_000_000;
function markup(tower:boolean,busy=false){
 const data=estateSnapshot(createEstate('v8-guardian-ui',T),T),p=data.profile;
 p.tutorial='done';p.threat=null;p.guardian='cat';
 p.layout.buildings=p.layout.buildings.filter(b=>b.kind!=='tower');
 if(tower)p.layout.buildings.push({id:'test-tower',kind:'tower',x:8,z:3,rotation:0,capacity:1,doors:[],paidCost:12});
 const props:EstateViewProps={data,target:'pipi',sheet:'guardian',camera:'overview',reduced:false,busy,message:'',error:'',assetStatus:'',worldRef:{current:null},onCommand:()=>{},onSheet:()=>{},onInspect:()=>{},onCamera:()=>{},onMove:()=>{},onStop:()=>{},onReduced:()=>{},onGhost:()=>{}};
 return renderToStaticMarkup(createElement(EstateView,props));
}
test('guardian panel exposes an explicit lookout task only when a tower exists',async()=>{
 const w=new Window();try{
  w.document.body.innerHTML=markup(false);
  let b=w.document.querySelector<HTMLButtonElement>('[data-guardian-lookout]');assert.ok(b);assert.equal(b.disabled,true);assert.match(w.document.body.textContent,/先建观察台/);
  w.document.body.innerHTML=markup(true);b=w.document.querySelector<HTMLButtonElement>('[data-guardian-lookout]');assert.ok(b);assert.equal(b.disabled,false);assert.match(b.textContent??'',/登台眺望/);
  assert.match(w.document.body.textContent,/到达台顶/);
  w.document.body.innerHTML=markup(true,true);assert.equal(w.document.querySelector<HTMLButtonElement>('[data-guardian-lookout]')?.disabled,true);
 }finally{await w.happyDOM.close();}
});
