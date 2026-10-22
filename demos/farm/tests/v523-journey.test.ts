import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,commandEstate,currentProfile,settleEstate,layoutPreview,type Estate} from '../src/v5/estate.ts';
import {initialOpening} from '../src/v5/opening.ts';
const T=1_800_000_000_000;
let sequence=0;
function ready(){let s=createEstate('journey-owner',T);const p=currentProfile(s);p.tutorial='done';p.opening=initialOpening('done');p.threat=null;p.guardian='dog';s=commandEstate(s,{id:'enter',type:'enter'},T).state;return s;}
function command(s:Estate,type:string,extra:Record<string,unknown>={},at=currentProfile(s).lastPulseAt){const r=commandEstate(s,{id:`journey-${++sequence}`,type,session:currentProfile(s).session,...extra},at);assert.equal(r.accepted,true,r.message);return r.state;}
function pulses(s:Estate,count:number){for(let i=0;i<count;i++)s=command(s,'pulse',{},currentProfile(s).lastPulseAt+1000);return s;}
function walkTo(s:Estate,to:{x:number;z:number}){s=command(s,'move',{to});for(let i=0;currentProfile(s).path.length&&i<100;i++)s=pulses(s,1);assert.equal(currentProfile(s).path.length,0);assert.ok(Math.hypot(currentProfile(s).position.x-to.x,currentProfile(s).position.z-to.z)<.01);return s;}
async function journey(){const module=await import('../src/v5/journey.ts').catch(()=>null);assert.ok(module,'the journey module must expose the actual state-driven next step');return module;}
test('walking outside owned land discovers a landmark exactly once without granting build rights',async()=>{
 const {LANDMARKS,discoveredLandmarkIds}=await journey();let s=ready();const p=currentProfile(s),owned=p.layout.owned.length,materials=p.materials;
 s=walkTo(s,LANDMARKS[0].position);assert.deepEqual(discoveredLandmarkIds(currentProfile(s)),[LANDMARKS[0].id]);assert.equal(currentProfile(s).materials,materials+8);assert.equal(currentProfile(s).layout.owned.length,owned);
 s=pulses(s,3);s=JSON.parse(JSON.stringify(s));s=command(s,'enter',{},currentProfile(s).lastPulseAt);s=pulses(s,1);
 assert.equal(currentProfile(s).materials,materials+8);assert.equal(currentProfile(s).events.filter(e=>e.id===`discovery-${LANDMARKS[0].id}`).length,1);
});
test('GET settlement, offline gaps, covered background and unfinished opening never award discovery',async()=>{
 const {LANDMARKS,discoveredLandmarkIds}=await journey();let s=ready();currentProfile(s).position={...LANDMARKS[0].position};
 s=settleEstate(s,T+86_400_000);assert.deepEqual(discoveredLandmarkIds(currentProfile(s)),[]);
 s=command(s,'pulse',{},T+86_400_000);assert.deepEqual(discoveredLandmarkIds(currentProfile(s)),[]);
 s=command(s,'pulse',{presentationPaused:true},T+86_401_000);assert.deepEqual(discoveredLandmarkIds(currentProfile(s)),[]);
 s=createEstate('opening',T);s=command(s,'enter');currentProfile(s).position={...LANDMARKS[0].position};s=pulses(s,1);assert.deepEqual(discoveredLandmarkIds(currentProfile(s)),[]);
});
test('post-tutorial journey advances from real feeding to regions, discovery, completed building, rehearsal and expansion',async()=>{
 const {currentJourneyGoal,LANDMARKS}=await journey();let s=ready();assert.equal(currentJourneyGoal(currentProfile(s)).id,'first-meal');
 for(const id of currentProfile(s).animals.map(a=>a.id)){s=command(s,'feed',{target:id,food:'milk'});for(let i=0;currentProfile(s).job&&i<30;i++)s=pulses(s,1);assert.ok(currentProfile(s).milestones.includes(`fed-${id}`));}
 assert.equal(currentJourneyGoal(currentProfile(s)).id,'walk-home');for(const point of [{x:4,z:8},{x:8,z:4},{x:8,z:8}])s=walkTo(s,point);
 assert.equal(currentJourneyGoal(currentProfile(s)).id,'discover-valley');for(const landmark of LANDMARKS)s=walkTo(s,landmark.position);
 assert.equal(currentJourneyGoal(currentProfile(s)).id,'develop');const before=currentProfile(s).materials;
 s=command(s,'layout',{edit:{type:'place',id:'journey-tower',kind:'tower',x:8,z:1},baseVersion:currentProfile(s).layout.version});assert.equal(currentJourneyGoal(currentProfile(s)).id,'construction');
 s=pulses(s,10);assert.ok(currentProfile(s).layout.buildings.some(b=>b.id==='journey-tower'));assert.equal(currentProfile(s).materials,before); // 12 build cost and 12 first-arrangement reward
 assert.equal(currentJourneyGoal(currentProfile(s)).id,'rehearse');s=walkTo(s,{x:5,z:5});s=command(s,'rehearse');assert.equal(currentJourneyGoal(currentProfile(s)).id,'event');
 for(let i=0;i<180&&currentProfile(s).threat?.phase!=='complete';i++)s=pulses(s,1);
 const threat=currentProfile(s).threat!;assert.equal(threat.phase,'complete');for(const a of threat.actors.filter(a=>a.status==='lost')){s=command(s,'rescue',{target:a.id,findBack:true});s=pulses(s,1);}
 s=command(s,'endEvent');assert.equal(currentJourneyGoal(currentProfile(s)).id,'survey');s=walkTo(s,{x:11,z:4});s=command(s,'survey');s=pulses(s,5);
 assert.equal(currentJourneyGoal(currentProfile(s)).id,'expand');s=command(s,'layout',{edit:{type:'expand'},baseVersion:currentProfile(s).layout.version});s=pulses(s,60);assert.equal(currentProfile(s).layout.owned.length,180);assert.equal(currentJourneyGoal(currentProfile(s)).id,'free-explore');
});
test('guidance gives usable alternatives for empty food, satiated animals, and a low construction budget',async()=>{
 const {currentJourneyGoal,LANDMARKS}=await journey();const s=ready(),p=currentProfile(s);p.inventory.hand=0;assert.equal(currentJourneyGoal(p).action.kind,'refill');
 for(const a of p.animals)a.life.hunger=90;assert.notEqual(currentJourneyGoal(p).action.kind,'inspect');assert.match(currentJourneyGoal(p).detail,/吃饱/);
 p.milestones.push('first-meal','walk-home');p.journey={discovered:LANDMARKS.map(l=>l.id)};p.materials=0;const goal=currentJourneyGoal(p);assert.equal(goal.action.kind,'development');assert.match(goal.detail,/材料|回收/);
});
test('cancelled construction does not satisfy development and old saved completed buildings do',async()=>{
 const {currentJourneyGoal,LANDMARKS}=await journey();let s=ready(),p=currentProfile(s);p.milestones.push('first-meal','walk-home');p.journey={discovered:LANDMARKS.map(l=>l.id)};
 s=command(s,'layout',{edit:{type:'place',id:'cancelled-tower',kind:'tower',x:8,z:1},baseVersion:p.layout.version});s=command(s,'cancelBuild');assert.equal(currentJourneyGoal(currentProfile(s)).id,'develop');
 s=command(s,'layout',{edit:{type:'place',id:'finished-tower',kind:'tower',x:8,z:1},baseVersion:currentProfile(s).layout.version});s=pulses(s,10);p=currentProfile(s);p.milestones=p.milestones.filter(m=>m!=='journey-developed');assert.equal(currentJourneyGoal(p).id,'rehearse');
});
test('reset clears discoveries only for the selected profile; old saves without journey remain readable',async()=>{
 const {LANDMARKS,discoveredLandmarkIds,currentJourneyGoal}=await journey();let s=ready();s=walkTo(s,LANDMARKS[0].position);const home=structuredClone(currentProfile(s));s=command(s,'profile',{profile:'lab'});s=command(s,'resetProfile',{profile:'lab',confirmed:true});assert.deepEqual(s.profiles.home,home);assert.deepEqual(discoveredLandmarkIds(currentProfile(s)),[]);
 s=command(s,'profile',{profile:'home'});s=command(s,'resetProfile',{profile:'home',confirmed:true});assert.deepEqual(discoveredLandmarkIds(currentProfile(s)),[]);assert.equal(currentProfile(s).materials,60);assert.equal(currentJourneyGoal(currentProfile(s)).id,'opening');
 delete currentProfile(s).journey;assert.deepEqual(discoveredLandmarkIds(currentProfile(s)),[]);assert.ok(currentJourneyGoal(currentProfile(s)).title);
});
test('LX can return from wilderness to feed and validate construction without being counted as an evacuation animal',()=>{
 let s=ready();s=walkTo(s,{x:-3,z:4});s=command(s,'feed',{target:'pipi',food:'milk'});for(let i=0;currentProfile(s).job&&i<30;i++)s=pulses(s,1);assert.ok(currentProfile(s).milestones.includes('fed-pipi'));
 s=walkTo(s,{x:14,z:4});const p=currentProfile(s);assert.equal(layoutPreview(p,{type:'place',id:'wild-tower',kind:'tower',x:8,z:1}).ok,true);s=command(s,'layout',{edit:{type:'place',id:'wild-tower',kind:'tower',x:8,z:1},baseVersion:p.layout.version});assert.ok(currentProfile(s).layout.construction);
});
test('a wild LX can apply a real owned-land blueprint while animals and guardian still block occupied construction',()=>{
 const draft=(s:Estate)=>command(s,'creation',{command:{id:`draft-${++sequence}`,type:'blueprintDraft',scope:['meadow'],baseVersion:currentProfile(s).layout.version,budget:12,components:[{id:'blueprint-tower',region:'meadow',estimatedCost:12,edit:{type:'place',id:'blueprint-tower',kind:'tower',x:8,z:1}}]}});
 let s=walkTo(ready(),{x:14,z:4});s=draft(s);const before=currentProfile(s).materials;s=command(s,'creation',{command:{id:`apply-${++sequence}`,type:'blueprintApply',draftId:currentProfile(s).creation.drafts.at(-1)!.id}});assert.equal(currentProfile(s).materials,before);s=pulses(s,10);assert.ok(currentProfile(s).layout.buildings.some(b=>b.id==='blueprint-tower'));
 for(const blocker of ['animal','guardian'] as const){let blocked=walkTo(ready(),{x:14,z:4});const p=currentProfile(blocked);if(blocker==='animal')p.animals[0].position={x:8,z:1};else p.guardianAt={x:8,z:1};blocked=draft(blocked);const r=commandEstate(blocked,{id:`blocked-${blocker}`,type:'creation',session:currentProfile(blocked).session,command:{id:`blocked-blueprint-${blocker}`,type:'blueprintApply',draftId:currentProfile(blocked).creation.drafts.at(-1)!.id}},currentProfile(blocked).lastPulseAt);assert.equal(r.accepted,false);assert.equal(currentProfile(r.state).materials,currentProfile(blocked).materials);assert.equal(currentProfile(r.state).layout.construction,undefined);}
});
test('finishing the real opening immediately provides a care goal without granting a new reward',async()=>{
 const {currentJourneyGoal}=await journey();let s=createEstate('journey-owner',T);s=command(s,'enter');s=command(s,'skipOpening');s=command(s,'guardian',{guardian:'frog'});s=command(s,'skipOpening');s=command(s,'guardianCommand',{command:{kind:'calm'}});
 for(let i=0;i<60&&currentProfile(s).opening?.stage!=='done';i++)s=command(s,'pulse',{presentationReady:true},currentProfile(s).lastPulseAt+1000);
 assert.equal(currentProfile(s).opening?.stage,'done');s=command(s,'finishTutorial');assert.equal(currentJourneyGoal(currentProfile(s)).id,'first-meal');assert.equal(currentProfile(s).materials,60);
});
test('direct building preview and commit protect a stationed guardian from being swallowed by construction',()=>{
 let s=ready();currentProfile(s).guardian='cat';s=command(s,'guardianCommand',{command:{kind:'station',target:{x:8,z:1}}});s=pulses(s,5);s=walkTo(s,{x:14,z:4});
 const before=structuredClone(currentProfile(s)),edit={type:'place' as const,id:'occupied-guardian-tower',kind:'tower' as const,x:8,z:1};assert.deepEqual(before.guardianAt,{x:8,z:1});
 assert.equal(layoutPreview(before,edit).ok,false,'preview must reject a facility covering the actual guardian');
 const r=commandEstate(s,{id:'guarded-build',type:'layout',session:before.session,edit,baseVersion:before.layout.version},before.lastPulseAt);assert.equal(r.accepted,false);assert.equal(currentProfile(r.state).materials,before.materials);assert.equal(currentProfile(r.state).layout.construction,undefined);
 s=pulses(r.state,10);assert.equal(currentProfile(s).layout.buildings.some(b=>b.id===edit.id),false);assert.deepEqual(currentProfile(s).guardianAt,{x:8,z:1});
});
