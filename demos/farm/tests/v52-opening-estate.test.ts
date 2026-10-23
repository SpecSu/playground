import test from 'node:test';import assert from 'node:assert/strict';
import {createEstate,currentProfile,commandEstate} from '../src/v5/estate.ts';
const T=1800000000000;
test('opening permits movement but gates guardian choice and freezes arrival danger',()=>{
 let s=createEstate('intro',T),t=T;const run=(type:string,extra:Record<string,unknown>={})=>{const r=commandEstate(s,{id:`${type}-${++t}`,type,session:currentProfile(s).session,...extra},t);if(r.accepted)s=r.state;return r;};
 run('enter');assert.equal(currentProfile(s).opening?.stage,'establish');assert.equal(run('guardian',{guardian:'dog'}).accepted,false);assert.equal(run('move',{to:{x:6,z:7}}).accepted,true);assert.equal(currentProfile(s).threat?.elapsed,0);
 const material=currentProfile(s).materials;run('skipOpening');assert.equal(currentProfile(s).opening?.stage,'choose');assert.equal(run('guardian',{guardian:'dog'}).accepted,true);assert.equal(currentProfile(s).opening?.stage,'arrival');assert.equal(run('guardian',{guardian:'cat'}).accepted,false);
 t+=1000;run('pulse',{presentationReady:false});assert.equal(currentProfile(s).opening?.elapsed,0);assert.equal(currentProfile(s).threat?.elapsed,0);
 t+=1000;run('pulse',{presentationReady:true,presentationCovered:true});assert.equal(currentProfile(s).opening?.elapsed,0);
 run('skipOpening');assert.equal(currentProfile(s).opening?.stage,'defend');assert.equal(currentProfile(s).materials,material);assert.equal(currentProfile(s).guardian,'dog');
});
test('fresh enter resumes saved cinematic; completed old profiles are not forced to replay',()=>{
 let s=createEstate('resume',T);const p=currentProfile(s);delete p.opening;p.tutorial='done';p.threat=null;p.animals[0].life.bond=63;
 const r=commandEstate(s,{id:'enter-old',type:'enter'},T+1);s=r.state;assert.equal(currentProfile(s).opening?.stage,'done');assert.equal(currentProfile(s).animals[0].life.bond,63);
 const fresh=createEstate('new',T);fresh.profiles.home.opening!.stage='approach';fresh.profiles.home.opening!.elapsed=1.4;
 const restored=commandEstate(JSON.parse(JSON.stringify(fresh)),{id:'resume',type:'enter'},T+1000000).state;assert.equal(currentProfile(restored).opening?.stage,'approach');assert.equal(currentProfile(restored).opening?.elapsed,1.4);assert.equal(currentProfile(restored).threat?.elapsed,0);
});
test('readiness and covering pause the playable tutorial too, not just arrival',()=>{
 let s=createEstate('paused-defense',T);s=commandEstate(s,{id:'enter',type:'enter'},T).state;
 const run=(type:string,extra:Record<string,unknown>,at:number)=>{s=commandEstate(s,{id:`${type}-${at}`,type,session:currentProfile(s).session,...extra},at).state;};
 run('skipOpening',{},T+1);run('guardian',{guardian:'frog'},T+2);run('skipOpening',{},T+3);
 run('guardianCommand',{command:{kind:'calm'}},T+4);run('pulse',{presentationReady:false},T+1000);assert.equal(currentProfile(s).threat!.elapsed,0);
 run('pulse',{presentationReady:true,presentationCovered:true},T+2000);assert.equal(currentProfile(s).threat!.elapsed,0);
 run('pulse',{presentationReady:true,presentationCovered:false},T+3000);assert.ok(currentProfile(s).threat!.elapsed>0);
});
test('three guardian introductions require an operation, retreat visibly, resume safely and complete once',()=>{
 for(const guardian of ['dog','cat','frog'] as const){
  let s=createEstate(`journey-${guardian}`,T),at=T;let sequence=0;
  const run=(type:string,extra:Record<string,unknown>={},delta=1)=>{at+=delta;const r=commandEstate(s,{id:`journey-${guardian}-${++sequence}`,type,session:currentProfile(s).session,...extra},at);assert.equal(r.accepted,true,`${guardian} ${type}: ${r.message}`);s=JSON.parse(JSON.stringify(r.state));};
  run('enter');for(let i=0;i<11;i++)run('pulse',{presentationReady:true},1000);assert.equal(currentProfile(s).opening!.stage,'choose');
  run('guardian',{guardian});for(let i=0;i<4;i++)run('pulse',{presentationReady:true},1000);assert.equal(currentProfile(s).opening!.stage,'defend');assert.equal(currentProfile(s).threat!.elapsed,0);
  const p=currentProfile(s),wolf=p.threat!.wolves[0];run('guardianCommand',{command:{kind:guardian==='dog'?'block':guardian==='cat'?'gather':'calm',target:guardian==='dog'?wolf.position:p.animals[0].position,...(guardian==='dog'?{wolfId:wolf.id}:{})}});
  for(let i=0;i<40&&currentProfile(s).opening!.stage!=='done';i++)run('pulse',{presentationReady:true},1000);
  assert.equal(currentProfile(s).threat!.phase,'complete');assert.equal(currentProfile(s).opening!.stage,'done');assert.equal(currentProfile(s).openingRetreatMs,3000);assert.equal(currentProfile(s).materials,60);
  run('finishTutorial');assert.equal(currentProfile(s).tutorial,'done');assert.equal(currentProfile(s).threat,null);assert.equal(currentProfile(s).guardian,guardian);assert.equal(currentProfile(s).animals.length,3);
  const duplicate=commandEstate(s,{id:'again',type:'finishTutorial',session:currentProfile(s).session},at+1);assert.equal(duplicate.accepted,false);assert.equal(currentProfile(duplicate.state).materials,60);
 }
});
