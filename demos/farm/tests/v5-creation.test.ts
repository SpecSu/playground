import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createCreation, reduceCreation, localVisitView, CREATION_RULES, LOCAL_VISITORS,
  type CreationState, type CreationContext, type CreationCommand, type BlueprintComponent,
} from '../src/v5/creation.ts';

const T = Date.UTC(2026, 9, 22, 12);
let sequence = 0;
const visitor = LOCAL_VISITORS[0].id;
const base: CreationContext = {
  now:T, ownerId:'owner', actorId:'owner', profileId:'natural', layoutVersion:1,
  materials:60, animalIds:['sheep-a'], hungerById:{'sheep-a':50},
  foodByAnimalId:{'sheep-a':'milk'},
  sourceEvents:[{id:'first-feed',title:'给幼羊喂了第一口奶',at:T-1000,layoutVersion:1}],
};
function run(state:CreationState,type:string,extra:Record<string,unknown>={},context:Partial<CreationContext>={}) {
  return reduceCreation(state,{id:`creation-${++sequence}`,type,...extra} as CreationCommand,{...base,...context});
}
const component = (id='leaf',region:BlueprintComponent['region']='shore',cost=2):BlueprintComponent => ({
  id,region,estimatedCost:cost,edit:{type:'place',id,kind:'decor',x:7,z:7},
});
function grant(state=createCreation('owner','natural'),who=visitor,extra:Record<string,unknown>={}) {
  const r=run(state,'grant',{visitorId:who,regions:['shore'],budget:8,editTypes:['place'],allowHelp:true,allowRemix:false,expiresAt:T+CREATION_RULES.helpExpiryMs,...extra});
  assert.equal(r.ok,true,r.message);return {state:r.state,grantId:r.state.grants.at(-1)!.id};
}
function enter(state:CreationState,grantId:string,who=visitor) {
  const r=run(state,'enterVisit',{mode:'local-visitor',grantId},{actorId:who});
  assert.equal(r.ok,true,r.message);return {state:r.state,visitId:r.state.visits.at(-1)!.id};
}
function help(state:CreationState,who=visitor) {
  const g=grant(state,who);const v=enter(g.state,g.grantId,who);
  const r=run(v.state,'submitHelp',{visitId:v.visitId,targetId:'sheep-a',food:'milk'},{actorId:who});
  assert.equal(r.ok,true,r.message);return {state:r.state,helpId:r.state.help.at(-1)!.id};
}
function proposal(state=createCreation('owner','natural'),extra:Record<string,unknown>={}) {
  const g=grant(state);const v=enter(g.state,g.grantId);
  const r=run(v.state,'submitProposal',{visitId:v.visitId,baseVersion:1,budget:8,scope:['shore'],components:[component()],...extra},{actorId:visitor});
  assert.equal(r.ok,true,r.message);return {state:r.state,proposalId:r.state.proposals.at(-1)!.id,grantId:g.grantId};
}

test('explicit templates preview without changing the scene, then apply and undo with monotonic versions',()=>{
  const initial=createCreation('owner','natural');
  const preview=run(initial,'themePreview',{theme:'lotus'});
  assert.equal(preview.ok,true);assert.equal(preview.state.theme,'pasture');assert.deepEqual(preview.effects,[]);
  const applied=run(preview.state,'themeApply',{draftId:preview.state.drafts[0].id});
  assert.equal(applied.state.theme,'lotus');assert.equal(applied.effects[0].type,'theme');
  const undo=run(applied.state,'themeUndo');assert.equal(undo.state.theme,'pasture');
  assert.equal(undo.state.themeVersions.at(-1)!.version,2);
  assert.equal(run(undo.state,'themeUndo').ok,false);
  assert.equal(run(initial,'themePreview',{theme:'a prompt secretly mapped to lotus'}).ok,false);
  assert.equal(run(initial,'generate',{prompt:'荷叶村'}).ok,false);
});

test('stale theme previews and repeat command IDs never emit duplicate effects',()=>{
  let s=createCreation('owner','natural');const a=run(s,'themePreview',{theme:'lotus'});s=a.state;
  const b=run(s,'themePreview',{theme:'starlit'});s=b.state;
  const command={id:'one-theme-apply',type:'themeApply',draftId:a.state.drafts[0].id} as CreationCommand;
  const first=reduceCreation(s,command,base);assert.equal(first.ok,true);
  assert.equal(run(first.state,'themeApply',{draftId:b.state.drafts[1].id}).ok,false);
  const repeat=reduceCreation(first.state,command,base);assert.equal(repeat.ok,false);assert.deepEqual(repeat.effects,[]);
});

test('visitor actors cannot write owner themes, works, grants, inventory, or difficulty',()=>{
  const s=createCreation('owner','natural');
  for(const type of ['themePreview','themeApply','themeUndo','saveWork','grant','revokeGrant','blueprintDraft','blueprintApply','acceptProposal','acceptHelp','inventory','difficulty']) {
    const r=run(s,type,{theme:'lotus'},{actorId:visitor});assert.equal(r.ok,false,type);assert.deepEqual(r.state,s);assert.deepEqual(r.effects,[]);
  }
  assert.equal(run(s,'themePreview',{theme:'lotus'},{profileId:'lab'}).ok,false);
});

test('private works freeze trusted event titles, scene version, capture metadata and never publish',()=>{
  const r=run(createCreation('owner','natural'),'saveWork',{title:'第一次回家',eventIds:['first-feed']},{
    capture:{camera:{position:{x:1,y:3,z:4},target:{x:2,y:0,z:2}},thumbnail:'data:image/png;base64,AA==',region:'home'},
  });
  assert.equal(r.ok,true);const work=r.state.works[0];assert.equal(work.visibility,'private');assert.equal(work.allowRemix,false);
  assert.deepEqual(work.events,base.sourceEvents);assert.equal(work.capture.layoutVersion,1);assert.equal(work.capture.profileId,'natural');
  assert.equal(work.capture.camera!.position.y,3);assert.ok(work.capture.thumbnail);assert.equal(work.source.kind,'local-draft');
  assert.equal(run(r.state,'saveWork',{title:'虚构来访',eventIds:['imaginary-friend']}).ok,false);
  assert.equal(run(r.state,'publish',{workId:work.id}).ok,false);
});

test('example visit projection has its own route and interactions, with no owner-world effects',()=>{
  const original=createCreation('owner','natural');const entered=run(original,'enterVisit',{mode:'example'});
  assert.equal(entered.ok,true);const visit=entered.state.visits[0];assert.equal(visit.label,'示例庄园');assert.equal(visit.projection,true);assert.equal(visit.readOnly,true);
  let r=run(entered.state,'visitMove',{visitId:visit.id});r=run(r.state,'visitInteract',{visitId:visit.id,interaction:'photo'});
  assert.equal(r.ok,true);assert.equal(r.state.visits[0].routeIndex,1);assert.equal(r.state.visits[0].interactions.length,1);assert.deepEqual(r.effects,[]);
  assert.deepEqual(r.state.themeVersions,original.themeVersions);assert.deepEqual(r.state.works,original.works);
  assert.equal(run(r.state,'submitHelp',{visitId:visit.id,targetId:'sheep-a',food:'milk'}).ok,false);
});

test('local visitor help reserves exactly one donor food and acceptance changes only hunger via an effect',()=>{
  const h=help(createCreation('owner','natural'));assert.equal(h.state.localVisitors[visitor].food,0);
  assert.equal(h.state.help[0].reservation,'reserved');assert.equal(h.state.visits[0].label,'本地访客演示');
  const r=run(h.state,'acceptHelp',{helpId:h.helpId});assert.equal(r.ok,true);assert.equal(r.state.help[0].status,'accepted');assert.equal(r.state.help[0].reservation,'consumed');
  assert.deepEqual(r.effects,[{type:'acceptedHelp',transactionId:r.state.receipts.at(-1)!.id,helpId:h.helpId,targetId:'sheep-a',hungerDelta:30,bondDelta:0,manualCareMilestone:false}]);
  assert.equal(run(r.state,'acceptHelp',{helpId:h.helpId}).ok,false);
  assert.equal(run(r.state,'rejectHelp',{helpId:h.helpId}).ok,false);assert.equal(r.state.localVisitors[visitor].food,0);
});

test('help is one proposal per visitor per fixed UTC day even after rejecting and refunding',()=>{
  const h=help(createCreation('owner','natural'));const rejected=run(h.state,'rejectHelp',{helpId:h.helpId});assert.equal(rejected.ok,true);assert.equal(rejected.state.localVisitors[visitor].food,1);
  const r=run(rejected.state,'submitHelp',{visitId:h.state.visits[0].id,targetId:'sheep-a',food:'milk'},{actorId:visitor});assert.equal(r.ok,false);assert.equal(r.state.localVisitors[visitor].food,1);
  assert.equal(run(rejected.state,'rejectHelp',{helpId:h.helpId}).ok,false);
});

test('owner accepts at most two helps per UTC day across different visitors; next day permits a waiting gift',()=>{
  let s=createCreation('owner','natural');let last='';
  for(let i=0;i<3;i++) { const h=help(s,LOCAL_VISITORS[i].id);s=h.state;last=h.helpId;const r=run(s,'acceptHelp',{helpId:last});s=r.state;assert.equal(r.ok,i<2,r.message); }
  assert.equal(s.help.filter(h=>h.status==='accepted').length,2);assert.equal(s.help.at(-1)!.status,'waiting');
  const next=run(s,'acceptHelp',{helpId:last},{now:T+86400_000});assert.equal(next.ok,true);assert.equal(next.state.help.filter(h=>h.status==='accepted').length,3);
});

test('full target waits without consuming twice, incompatible and missing targets reject, expiry refunds once',()=>{
  const h=help(createCreation('owner','natural'));
  const full=run(h.state,'acceptHelp',{helpId:h.helpId},{hungerById:{'sheep-a':71}});assert.equal(full.ok,false);assert.equal(full.state.help[0].status,'waiting');assert.deepEqual(full.effects,[]);
  assert.equal(run(full.state,'acceptHelp',{helpId:h.helpId},{foodByAnimalId:{'sheep-a':'feed'}}).ok,false);
  assert.equal(run(full.state,'acceptHelp',{helpId:h.helpId},{animalIds:[]}).ok,false);
  const expired=run(full.state,'sweep',{},{now:T+CREATION_RULES.helpExpiryMs});assert.equal(expired.ok,true);assert.equal(expired.state.help[0].status,'expired');assert.equal(expired.state.localVisitors[visitor].food,1);
  const twice=run(expired.state,'sweep',{},{now:T+CREATION_RULES.helpExpiryMs+1});assert.equal(twice.state.localVisitors[visitor].food,1);
  assert.equal(run(twice.state,'acceptHelp',{helpId:h.helpId},{now:T+CREATION_RULES.helpExpiryMs+1}).ok,false);
});

test('revoking access invalidates pending help/proposals and stops visit reads and interactions',()=>{
  const h=help(createCreation('owner','natural'));const visitId=h.state.visits[0].id;const grantId=h.state.grants[0].id;
  const p=run(h.state,'submitProposal',{visitId,baseVersion:1,budget:8,scope:['shore'],components:[component()]},{actorId:visitor});assert.equal(p.ok,true);
  const revoked=run(p.state,'revokeGrant',{grantId});assert.equal(revoked.ok,true);assert.equal(revoked.state.help[0].status,'revoked');assert.equal(revoked.state.localVisitors[visitor].food,1);
  assert.equal(revoked.state.proposals[0].status,'revoked');assert.equal(revoked.state.visits[0].status,'revoked');
  assert.equal(run(revoked.state,'acceptHelp',{helpId:h.helpId}).ok,false);
  assert.equal(run(revoked.state,'acceptProposal',{proposalId:p.state.proposals[0].id}).ok,false);
  assert.equal(run(revoked.state,'visitInteract',{visitId,interaction:'wave'},{actorId:visitor}).ok,false);
  assert.equal(localVisitView(revoked.state,visitId,{...base,actorId:visitor}).ok,false);
});

test('visitor view is an allowlisted projection and cannot expose private works, drafts or owner records',()=>{
  const saved=run(createCreation('owner','natural'),'saveWork',{title:'只给自己看的成长',eventIds:['first-feed']});
  const g=grant(saved.state);const v=enter(g.state,g.grantId);
  const view=localVisitView(v.state,v.visitId,{...base,actorId:visitor});assert.equal(view.ok,true);
  assert.equal(JSON.stringify(view).includes('只给自己看的成长'),false);assert.equal(JSON.stringify(view).includes('first-feed'),false);
  if(view.ok){view.visit.route[0].x=100;assert.notEqual(v.state.visits[0].route[0].x,100);}
  assert.equal(localVisitView(v.state,v.visitId,{...base,actorId:LOCAL_VISITORS[1].id}).ok,false);
});

test('blueprint proposals bind scope, edit permission, current version, grant expiry and current budget',()=>{
  const p=proposal();
  assert.equal(run(p.state,'acceptProposal',{proposalId:p.proposalId},{layoutVersion:2}).ok,false);
  assert.equal(run(p.state,'acceptProposal',{proposalId:p.proposalId},{materials:1}).ok,false);
  assert.equal(run(p.state,'acceptProposal',{proposalId:p.proposalId},{now:T+CREATION_RULES.helpExpiryMs}).ok,false);
  const g=grant();const v=enter(g.state,g.grantId);
  for(const extra of [
    {scope:['home']}, {budget:9}, {baseVersion:0}, {components:[component('over','shore',9)]},
    {components:[{...component(),edit:{type:'remove',id:'shelter'}}]},
    {components:[{...component('lie'),edit:{type:'place',id:'lie',kind:'decor',x:1,z:1}}]},
  ]) assert.equal(run(v.state,'submitProposal',{visitId:v.visitId,baseVersion:1,budget:8,scope:['shore'],components:[component()],...extra},{actorId:visitor}).ok,false);
});

test('partial proposal acceptance returns a fresh complete validation plan and duplicate acceptance has no effects',()=>{
  const p=proposal(undefined,{components:[component('a'),component('b')]});
  const r=run(p.state,'acceptProposal',{proposalId:p.proposalId,componentIds:['b']});assert.equal(r.ok,true);
  const effect=r.effects[0];assert.equal(effect.type,'acceptedBlueprint');if(effect.type!=='acceptedBlueprint')return;
  assert.deepEqual(effect.components.map(c=>c.id),['b']);assert.equal(effect.estimatedCost,2);assert.equal(effect.baseVersion,1);assert.equal(effect.requiresSpatialValidation,true);
  assert.equal(effect.source.ownerId,visitor);assert.equal(effect.source.kind,'local-draft');
  assert.equal(r.state.proposals[0].status,'accepted');assert.equal(run(r.state,'acceptProposal',{proposalId:p.proposalId}).ok,false);
  assert.equal(run(p.state,'acceptProposal',{proposalId:p.proposalId,componentIds:['b','b']}).ok,false);
  assert.equal(run(p.state,'acceptProposal',{proposalId:p.proposalId,componentIds:['unknown']}).ok,false);
});

test('blueprint undo emits the original transaction only once and never includes growth rollback or currency grants',()=>{
  const p=proposal();const accepted=run(p.state,'acceptProposal',{proposalId:p.proposalId});const transactionId=accepted.state.proposalReceipts[0].transactionId;
  const undo=run(accepted.state,'undoProposal',{proposalId:p.proposalId},{layoutVersion:2});assert.equal(undo.ok,true);
  assert.deepEqual(undo.effects,[{type:'undoProposal',transactionId:undo.state.receipts.at(-1)!.id,proposalId:p.proposalId,originalTransactionId:transactionId,requiresSpatialValidation:true,restoreGrowth:false}]);
  assert.equal(undo.state.proposalReceipts[0].undoState,'undone');assert.equal(run(undo.state,'undoProposal',{proposalId:p.proposalId}).ok,false);
});

test('private remix requires a separate opt-in and copies only content with version-linked attribution',()=>{
  const p=proposal();const accepted=run(p.state,'acceptProposal',{proposalId:p.proposalId});
  const denied=run(accepted.state,'remixProposal',{proposalId:p.proposalId});assert.equal(denied.ok,false);
  assert.equal(accepted.state.grants[0].allowRemix,false);
  const r=run(accepted.state,'setProposalRemix',{proposalId:p.proposalId,allowRemix:true});assert.equal(r.ok,true);
  const remix=run(r.state,'remixProposal',{proposalId:p.proposalId});assert.equal(remix.ok,true);
  const draft=remix.state.drafts.at(-1)!;assert.equal(draft.kind,'blueprint');if(draft.kind!=='blueprint')return;
  assert.equal(draft.source.kind,'local-remix');assert.equal(draft.source.parent!.assetId,p.proposalId);assert.equal(draft.source.parent!.version,1);
  assert.equal(JSON.stringify(draft).includes('sheep-a'),false);assert.equal(JSON.stringify(draft).includes('hunger'),false);
  assert.equal(draft.baseVersion,1);assert.equal(draft.status,'draft');
});

test('owner blueprint drafts are structured content only and never directly mutate materials',()=>{
  const s=createCreation('owner','natural');const d=run(s,'blueprintDraft',{scope:['shore'],baseVersion:1,budget:8,components:[component()]});assert.equal(d.ok,true);
  assert.deepEqual(d.effects,[]);const a=run(d.state,'blueprintApply',{draftId:d.state.drafts[0].id});assert.equal(a.ok,true);assert.equal(a.effects[0].type,'acceptedBlueprint');
  assert.equal(run(a.state,'blueprintApply',{draftId:d.state.drafts[0].id}).ok,false);
  assert.equal(run(s,'blueprintDraft',{scope:['shore'],baseVersion:1,budget:8,components:[{...component(),edit:{type:'script',body:'anything'}}]}).ok,false);
});

test('an expired acceptance refunds the same reservation once without effects and immutable input survives malformed commands',()=>{
  const h=help(createCreation('owner','natural'));const before=JSON.stringify(h.state);
  const first=run(h.state,'acceptHelp',{helpId:h.helpId},{now:T+CREATION_RULES.helpExpiryMs});
  assert.equal(first.ok,false);assert.equal(first.state.help[0].status,'expired');assert.equal(first.state.localVisitors[visitor].food,1);assert.deepEqual(first.effects,[]);
  const second=run(first.state,'acceptHelp',{helpId:h.helpId},{now:T+CREATION_RULES.helpExpiryMs+1});assert.equal(second.state.localVisitors[visitor].food,1);
  assert.equal(JSON.stringify(h.state),before);
  for(const input of [null,[],{}, {type:'place',x:NaN,z:7}]){
    const r=run(h.state,'blueprintDraft',{scope:['shore'],baseVersion:1,budget:8,components:[{...component(),edit:input}]});assert.equal(r.ok,false);assert.equal(JSON.stringify(h.state),before);
  }
});
