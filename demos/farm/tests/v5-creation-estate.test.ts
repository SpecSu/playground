import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,settleEstate} from '../src/v5/estate.ts';
import {applyEstateCreation,type CreationProfile} from '../src/v5/creation-estate.ts';
import {LOCAL_VISITORS,CREATION_RULES,type CreationCommand,type BlueprintComponent} from '../src/v5/creation.ts';
import {tickConstruction,commitEdit,cancelConstruction,buildingFootprint,validateLayout} from '../src/v5/layout.ts';
import {createThreat} from '../src/v5/threat.ts';

const T=Date.UTC(2026,9,22,12);
let seq=0;
const visitor=LOCAL_VISITORS[0].id;
function fresh():CreationProfile {const p=createEstate('owner',T).profiles.home;p.tutorial='done';p.threat=null;return p;}
function run(p:CreationProfile,type:string,extra:Record<string,unknown>={},actor?:string,now=T){return applyEstateCreation(p,'owner',{command:{id:`estate-create-${++seq}`,type,...extra} as CreationCommand,...(actor?{actor}:{})},now);}
const decor=(id:string,x=7,z=7,cost=2):BlueprintComponent=>({id,region:'shore',estimatedCost:cost,edit:{type:'place',id,kind:'decor',x,z}});
function visit(p:CreationProfile,extra:Record<string,unknown>={}){
  const grant=run(p,'grant',{visitorId:visitor,regions:['shore'],budget:8,editTypes:['place'],expiresAt:T+CREATION_RULES.helpExpiryMs,allowHelp:true,...extra});assert.equal(grant.ok,true,grant.message);
  const enter=run(grant.profile,'enterVisit',{mode:'local-visitor',grantId:grant.profile.creation.grants.at(-1)!.id},visitor);assert.equal(enter.ok,true,enter.message);
  return {profile:enter.profile,visitId:enter.profile.creation.visits.at(-1)!.id};
}
function propose(p=fresh(),components=[decor('leaf-a'),decor('leaf-b',8,7)]){
  const v=visit(p);const r=run(v.profile,'submitProposal',{visitId:v.visitId,baseVersion:p.layout.version,budget:8,scope:['shore'],components},visitor);assert.equal(r.ok,true,r.message);
  return {profile:r.profile,proposalId:r.profile.creation.proposals.at(-1)!.id};
}
function finish(p:CreationProfile):CreationProfile {const n=structuredClone(p);const r=tickConstruction(n.layout,n.layout.construction!.durationMs);assert.equal(r.ok,true,r.reasons.join(';'));n.layout=r.layout;n.materials+=r.materialDelta;return n;}

test('estate helper applies theme, saves factual private context and rejects unsupported or visitor physics writes',()=>{
  let p=fresh();p.events.push({id:'fact',text:'给皮皮喂奶',at:T-1000});
  const preview=run(p,'themePreview',{theme:'lotus'});assert.equal(preview.ok,true);const applied=run(preview.profile,'themeApply',{draftId:preview.profile.creation.drafts[0].id});assert.equal(applied.ok,true);assert.equal(applied.profile.creation.theme,'lotus');assert.equal(applied.profile.materials,60);
  const saved=run(applied.profile,'saveWork',{title:'我的池岸',eventIds:['fact']});assert.equal(saved.ok,true);assert.equal(saved.profile.creation.works[0].events[0].title,'给皮皮喂奶');assert.equal(saved.profile.creation.works[0].capture.profileId,'home');
  p=saved.profile;const before=structuredClone(p);for(const actor of [visitor,'unverified-remote-id']){const r=run(p,'themeUndo',{},actor);assert.equal(r.ok,false);assert.deepEqual(r.profile,before);}
});

test('real help integration raises only hunger and waiting/expired ledgers survive rejected acceptance',()=>{
  const p=fresh();const a=p.animals[0];a.life.hunger=70;const before=structuredClone(a.life);const v=visit(p);
  const submit=run(v.profile,'submitHelp',{visitId:v.visitId,targetId:a.id,food:'milk'},visitor);assert.equal(submit.ok,true,submit.message);const helpId=submit.profile.creation.help[0].id;
  const full=structuredClone(submit.profile);full.animals[0].life.hunger=71;
  const waiting=run(full,'acceptHelp',{helpId});assert.equal(waiting.ok,false);assert.equal(waiting.profile.creation.help[0].status,'waiting');assert.equal(waiting.profile.animals[0].life.hunger,71);
  const accepted=run(submit.profile,'acceptHelp',{helpId});assert.equal(accepted.ok,true);assert.equal(accepted.profile.animals[0].life.hunger,100);
  assert.deepEqual({...accepted.profile.animals[0].life,hunger:before.hunger},before);assert.equal(accepted.profile.inventory.hand,p.inventory.hand);assert.deepEqual(accepted.profile.milestones,p.milestones);
  assert.equal(run(accepted.profile,'acceptHelp',{helpId}).ok,false);
  const expired=run(submit.profile,'acceptHelp',{helpId},undefined,T+CREATION_RULES.helpExpiryMs);assert.equal(expired.ok,false);assert.equal(expired.profile.creation.help[0].reservation,'refunded');assert.equal(expired.profile.creation.localVisitors[visitor].food,1);
});

test('accepted help resets the offline needs baseline so a subsequent read cannot erase the benefit',()=>{
  const p=fresh();p.animals[0].life.hunger=40;p.animals[0].offlineNeeds={pulseAt:T-10000,hunger:55,energy:80};
  const v=visit(p);const submit=run(v.profile,'submitHelp',{visitId:v.visitId,targetId:p.animals[0].id,food:'milk'},visitor);assert.equal(submit.ok,true);
  const accepted=run(submit.profile,'acceptHelp',{helpId:submit.profile.creation.help[0].id},undefined,T+1000);assert.equal(accepted.ok,true);assert.equal(accepted.profile.animals[0].life.hunger,70);assert.equal(accepted.profile.animals[0].offlineNeeds,undefined);assert.equal(accepted.profile.animals[0].life.lastSettledAt,T+1000);
  const estate=createEstate('owner',T);estate.profiles.home=accepted.profile;const settled=settleEstate(estate,T+7000);assert.ok(settled.profiles.home.animals[0].life.hunger>69);
});

test('a multi-component accepted blueprint reserves exact cost and queues one atomic online construction',()=>{
  const p=propose();const before=structuredClone(p.profile);const r=run(p.profile,'acceptProposal',{proposalId:p.proposalId});assert.equal(r.ok,true,r.message);
  assert.equal(r.profile.materials,56);assert.equal(r.profile.layout.version,1);assert.ok(r.profile.layout.construction);assert.equal(r.profile.layout.construction!.reservedCost,4);assert.equal(r.profile.layout.construction!.durationMs,20000);
  assert.equal(r.profile.layout.construction!.target.buildings.filter(b=>b.id.startsWith('leaf-')).length,2);assert.equal(r.profile.layout.buildings.filter(b=>b.id.startsWith('leaf-')).length,0);
  assert.equal(r.profile.creationLayouts!.length,1);assert.equal(r.profile.creationLayouts![0].paid,4);assert.equal(r.profile.creationLayouts![0].afterVersion,2);
  const finished=finish(r.profile);assert.equal(finished.layout.version,2);assert.equal(finished.layout.buildings.filter(b=>b.id.startsWith('leaf-')).length,2);assert.equal(finished.materials,56);assert.equal(validateLayout(finished.layout,finished.animals.map(a=>a.position)).ok,true);
  assert.deepEqual(p.profile,before);assert.equal(run(finished,'acceptProposal',{proposalId:p.proposalId}).ok,false);
});

test('invalid second component, exact-price increase, stale world or busy construction roll back the entire candidate',()=>{
  for(const components of [[decor('a'),decor('b',7,7)], [decor('underquoted',7,7,0)]]){
    const p=propose(undefined,components);const r=run(p.profile,'acceptProposal',{proposalId:p.proposalId});assert.equal(r.ok,false);assert.deepEqual(r.profile,p.profile);assert.equal(r.profile.materials,60);assert.equal(r.profile.creation.proposals[0].status,'pending');
  }
  const p=propose();const stale=structuredClone(p.profile);stale.layout.version=2;assert.equal(run(stale,'acceptProposal',{proposalId:p.proposalId}).ok,false);
  const busy=structuredClone(p.profile);const built=commitEdit(busy.layout,{type:'place',id:'other',kind:'decor',x:8,z:6},{eventId:'other',materials:60,actors:busy.animals.map(a=>a.position)});assert.equal(built.ok,true);busy.layout=built.layout;
  const r=run(busy,'acceptProposal',{proposalId:p.proposalId});assert.equal(r.ok,false);assert.deepEqual(r.profile,busy);
});

test('actual footprints must stay inside the granted scope and cannot cover an actor',()=>{
  const p=fresh();const v=visit(p,{regions:['home'],budget:24});
  const crossing:BlueprintComponent={id:'crossing',region:'home',estimatedCost:24,edit:{type:'place',id:'crossing',kind:'shelter',x:5,z:8}};
  const proposal=run(v.profile,'submitProposal',{visitId:v.visitId,baseVersion:1,budget:24,scope:['home'],components:[crossing]},visitor);assert.equal(proposal.ok,true,proposal.message);
  const r=run(proposal.profile,'acceptProposal',{proposalId:proposal.profile.creation.proposals[0].id});assert.equal(r.ok,false);assert.match(r.message,/区域|授权/);assert.deepEqual(r.profile,proposal.profile);
  const occupied=propose(undefined,[decor('occupied',7,7)]);occupied.profile.animals[0].position={x:7,z:7};const blocked=run(occupied.profile,'acceptProposal',{proposalId:occupied.proposalId});assert.equal(blocked.ok,false);assert.deepEqual(blocked.profile,occupied.profile);
});

test('partial owner acceptance recomputes actual cost and final navigation rather than charging the full proposal',()=>{
  const p=propose();const r=run(p.profile,'acceptProposal',{proposalId:p.proposalId,componentIds:['leaf-b']});assert.equal(r.ok,true,r.message);assert.equal(r.profile.materials,58);assert.equal(r.profile.layout.construction!.reservedCost,2);
  const built=finish(r.profile);assert.ok(built.layout.buildings.some(b=>b.id==='leaf-b'));assert.equal(built.layout.buildings.some(b=>b.id==='leaf-a'),false);
});

test('proposal undo restores geometry and remaining paid cost once without rolling back animal growth',()=>{
  const p=propose();const accepted=run(p.profile,'acceptProposal',{proposalId:p.proposalId});const built=finish(accepted.profile);built.animals[0].life.bond=47;built.animals[0].life.care.baby.feeds=2;const life=structuredClone(built.animals[0].life);
  const r=run(built,'undoProposal',{proposalId:p.proposalId});assert.equal(r.ok,true,r.message);assert.equal(r.profile.materials,60);assert.equal(r.profile.layout.version,3);assert.deepEqual(r.profile.layout.buildings,p.profile.layout.buildings);assert.deepEqual(r.profile.animals[0].life,life);
  assert.equal(r.profile.creationLayouts![0].refunded,4);assert.equal(run(r.profile,'undoProposal',{proposalId:p.proposalId}).ok,false);assert.equal(run(accepted.profile,'undoProposal',{proposalId:p.proposalId}).ok,false);
});

test('intervening demolition or cancelled construction cannot combine with undo to over-refund',()=>{
  const p=propose();const accepted=run(p.profile,'acceptProposal',{proposalId:p.proposalId});let built=finish(accepted.profile);
  const removed=commitEdit(built.layout,{type:'remove',id:'leaf-a'},{eventId:'demolish',materials:built.materials,actors:[built.position,...built.animals.map(a=>a.position)]});assert.equal(removed.ok,true);built.layout=removed.layout;built.materials+=removed.materialDelta;built=finish(built);
  const r=run(built,'undoProposal',{proposalId:p.proposalId});assert.equal(r.ok,false);assert.deepEqual(r.profile,built);assert.ok(built.materials<60);
  const cancelled=structuredClone(accepted.profile);const cancel=cancelConstruction(cancelled.layout,'cancel-creation-job');assert.equal(cancel.ok,true);cancelled.layout=cancel.layout;cancelled.materials+=cancel.materialDelta;assert.equal(cancelled.materials,60);
  const afterCancel=run(cancelled,'undoProposal',{proposalId:p.proposalId});assert.equal(afterCancel.ok,false);assert.deepEqual(afterCancel.profile,cancelled);
  const repeat=cancelConstruction(cancelled.layout,'cancel-again');assert.equal(repeat.materialDelta,0);
});

test('restoring a removed paid facility reclaims its earlier demolition refund before restoring its paid-cost ledger',()=>{
  let p=fresh();const existing=commitEdit(p.layout,{type:'place',id:'old-decor',kind:'decor',x:7,z:7},{eventId:'old-paid',materials:60,actors:[p.position,...p.animals.map(a=>a.position)]});assert.equal(existing.ok,true);p.layout=existing.layout;p.materials+=existing.materialDelta;p=finish(p);
  const v=visit(p,{editTypes:['remove'],budget:0});const component:BlueprintComponent={id:'remove-old',region:'shore',estimatedCost:0,edit:{type:'remove',id:'old-decor'}};
  const proposed=run(v.profile,'submitProposal',{visitId:v.visitId,baseVersion:p.layout.version,budget:0,scope:['shore'],components:[component]},visitor);assert.equal(proposed.ok,true,proposed.message);const proposalId=proposed.profile.creation.proposals.at(-1)!.id;
  const applied=run(proposed.profile,'acceptProposal',{proposalId});assert.equal(applied.ok,true,applied.message);const removed=finish(applied.profile);assert.equal(removed.materials,59);
  const undo=run(removed,'undoProposal',{proposalId});assert.equal(undo.ok,true,undo.message);assert.equal(undo.profile.materials,58);assert.equal(undo.profile.layout.buildings.find(b=>b.id==='old-decor')!.paidCost,2);
  const cells=undo.profile.layout.buildings.flatMap(buildingFootprint);assert.ok(cells.some(c=>c.x===7&&c.z===7));
  const poor=structuredClone(removed);poor.materials=0;const denied=run(poor,'undoProposal',{proposalId});assert.equal(denied.ok,false);assert.deepEqual(denied.profile,poor);
});

test('the complete source footprint is checked even when its origin is inside the grant',()=>{
  let p=fresh();const built=commitEdit(p.layout,{type:'place',id:'cross-region-tower',kind:'tower',x:5,z:9},{eventId:'owner-tower',materials:60,actors:[p.position,...p.animals.map(a=>a.position)]});assert.equal(built.ok,true,built.reasons.join(';'));p.layout=built.layout;p.materials+=built.materialDelta;p=finish(p);
  const v=visit(p,{regions:['home'],editTypes:['remove'],budget:0});const component:BlueprintComponent={id:'remove-crossing',region:'home',estimatedCost:0,edit:{type:'remove',id:'cross-region-tower'}};
  const proposed=run(v.profile,'submitProposal',{visitId:v.visitId,baseVersion:p.layout.version,budget:0,scope:['home'],components:[component]},visitor);assert.equal(proposed.ok,true,proposed.message);
  const accepted=run(proposed.profile,'acceptProposal',{proposalId:proposed.profile.creation.proposals.at(-1)!.id});assert.equal(accepted.ok,false);assert.match(accepted.message,/区域|授权/);assert.deepEqual(accepted.profile,proposed.profile);
});

test('example visits follow the shared graph and reject a stale layout snapshot',()=>{
  const p=fresh();const entered=run(p,'enterVisit',{mode:'example'});assert.equal(entered.ok,true,entered.message);const visitId=entered.profile.creation.visits[0].id;
  const moved=run(entered.profile,'visitMove',{visitId});assert.equal(moved.ok,true,moved.message);assert.deepEqual(moved.profile.position,p.position);assert.deepEqual(moved.profile.animals,p.animals);
  const stale=structuredClone(moved.profile);stale.layout.version+=1;const r=run(stale,'visitInteract',{visitId,interaction:'photo'});assert.equal(r.ok,false);assert.deepEqual(r.profile,stale);
});

test('completed retained threat records keep apply and undo locked until event egress',()=>{
  const p=propose();const blocked=structuredClone(p.profile);blocked.threat=createThreat({id:'retained-event',seed:3,mode:'rehearsal',actors:blocked.animals.map(a=>({id:a.id,position:a.position})),guardian:'dog',guardianPosition:blocked.guardianAt},blocked.layout);blocked.threat.phase='complete';
  const apply=run(blocked,'acceptProposal',{proposalId:p.proposalId});assert.equal(apply.ok,false);assert.deepEqual(apply.profile,blocked);assert.match(apply.message,/事件|锁定/);
  const accepted=run(p.profile,'acceptProposal',{proposalId:p.proposalId});const built=finish(accepted.profile);built.threat=blocked.threat;
  const undo=run(built,'undoProposal',{proposalId:p.proposalId});assert.equal(undo.ok,false);assert.deepEqual(undo.profile,built);
});

test('memorial animal IDs cannot receive help or count as active navigation actors',()=>{
  const p=fresh();const gone={...structuredClone(p.animals[0]),id:'gone-sheep',position:{x:99,z:99},memorial:{at:T-1,eventId:'old-lab-event'}};p.animals.push(gone);
  const v=visit(p);const denied=run(v.profile,'submitHelp',{visitId:v.visitId,targetId:gone.id,food:'milk'},visitor);assert.equal(denied.ok,false);assert.equal(denied.profile.creation.localVisitors[visitor].food,1);
  const proposed=propose(p);const applied=run(proposed.profile,'acceptProposal',{proposalId:proposed.proposalId});assert.equal(applied.ok,true,applied.message);assert.deepEqual(applied.profile.animals.at(-1),gone);
});
