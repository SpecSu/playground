import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,currentProfile,commandEstate,type Estate} from '../src/v5/estate.ts';
const now=1_800_000_000_000;
function ready(){let s=createEstate('lookout-owner',now);s=commandEstate(s,{id:'session',type:'enter'},now).state;const p=currentProfile(s);p.tutorial='done';p.threat=null;p.guardian='cat';p.guardianReadyMs=0;p.guardianAt={x:7,z:5};p.layout.buildings.push({id:'watch',kind:'tower',x:7,z:1,rotation:0,paidCost:12,capacity:1,doors:[]});return s;}
function cmd(s:Estate,type:string,data:Record<string,unknown>={},at=now){return commandEstate(s,{id:`${type}-${at}`,type,session:currentProfile(s).session,...data},at);}
test('lookout is an independent job and never locks or spends the player feed transaction',()=>{
 let s=ready();const r=cmd(s,'guardianCommand',{command:{kind:'lookout'}});assert.equal(r.accepted,true,r.message);s=r.state;assert.ok(currentProfile(s).guardianLookout);assert.equal(currentProfile(s).job,null);
 s=cmd(s,'move',{to:{x:6,z:8}},now+1).state;assert.ok(currentProfile(s).guardianLookout);
 for(let i=1;i<=8;i++)s=cmd(s,'pulse',{},now+i*1000).state;
 const p=currentProfile(s);assert.equal(p.guardianLookout?.phase,'watching');assert.equal(p.guardianLookout?.height,2.23);assert.deepEqual(p.position,{x:6,z:8});
});
test('changing guard order on platform walks down instead of teleporting to ground',()=>{
 let s=ready();s=cmd(s,'guardianCommand',{command:{kind:'lookout'}}).state;for(let i=1;i<=8;i++)s=cmd(s,'pulse',{},now+i*1000).state;
 const before={...currentProfile(s).guardianAt};s=cmd(s,'guardianCommand',{command:{kind:'follow'}},now+8001).state;
 assert.deepEqual(currentProfile(s).guardianAt,before);assert.equal(currentProfile(s).guardianLookout?.phase,'descent');assert.equal(currentProfile(s).guardianLookout?.height,2.23);
 for(let i=9;i<=13;i++)s=cmd(s,'pulse',{},now+i*1000).state;assert.equal(currentProfile(s).guardianLookout?.height??0,0);
});
test('an occupied lookout cannot be moved or demolished before returning',()=>{
 let s=ready();s=cmd(s,'guardianCommand',{command:{kind:'lookout'}}).state;const p=currentProfile(s);
 const r=cmd(s,'layout',{edit:{type:'remove',id:'watch'},baseVersion:p.layout.version},now+1);assert.equal(r.accepted,false);assert.match(r.message,/高台|守望|下台/);
});

function watching(){let s=ready();s=cmd(s,'guardianCommand',{command:{kind:'lookout'}}).state;for(let i=1;i<=8;i++)s=cmd(s,'pulse',{},now+i*1000).state;assert.equal(currentProfile(s).guardianLookout?.phase,'watching');return s;}
test('starting a rehearsal on the tower transfers the real elevated traversal without throwing or snapping',()=>{
 const s=watching(),before=structuredClone(currentProfile(s).guardianLookout!);const r=cmd(s,'rehearse',{},now+8001);assert.equal(r.accepted,true,r.message);const p=currentProfile(r.state);
 assert.deepEqual(p.threat?.guardian?.position,before.position);assert.deepEqual(p.threat?.guardian?.lookout,before);assert.equal(p.guardianLookout?.height,2.23);
 const next=cmd(r.state,'pulse',{presentationReady:true},now+8100).state;assert.ok(currentProfile(next).threat!.guardian!.lookout!.height>2.08);
});
test('a natural raid launching while watching preserves the same occupied platform and descent state',async()=>{
 const {advanceFarmRaids}=await import('../src/v5/estate-cycle.ts');const s=watching(),p=currentProfile(s),before=structuredClone(p.guardianLookout!);p.milestones.push('first-meal');p.raidCycle!.phase='ready';p.raidCycle!.pending={id:'natural-on-tower',seed:17,risk:p.raidCycle!.risk,wolves:1};
 assert.doesNotThrow(()=>advanceFarmRaids(p,now+8001,{ready:true,covered:false}));assert.equal(p.threat?.id,'natural-on-tower');assert.deepEqual(p.threat?.guardian?.position,before.position);assert.deepEqual(p.threat?.guardian?.lookout,before);assert.equal(p.raidCycle!.phase,'active');
 const next=cmd(s,'pulse',{presentationReady:true},now+8100).state;assert.ok(currentProfile(next).threat!.guardian!.lookout!.height>2.08);
});

test('an elevated guardian does not falsely block unrelated building work',async()=>{
 const {layoutPreview}=await import('../src/v5/estate.ts');const s=watching(),p=currentProfile(s),edit={type:'place' as const,id:'unrelated',kind:'decor' as const,x:8,z:7};
 const preview=layoutPreview(p,edit);assert.equal(preview.ok,true,preview.reasons.join(';'));const r=cmd(s,'layout',{edit,baseVersion:p.layout.version},now+8001);assert.equal(r.accepted,true,r.message);
});
test('a blueprint cannot remove an occupied tower even when demolition footprint is empty',()=>{
 let s=ready();s=cmd(s,'guardianCommand',{command:{kind:'lookout'}}).state;
 const draft=cmd(s,'creation',{command:{id:'remove-draft',type:'blueprintDraft',baseVersion:1,budget:0,scope:['meadow'],components:[{id:'remove-watch',region:'meadow',estimatedCost:0,edit:{type:'remove',id:'watch'}}]}},now+1);assert.equal(draft.accepted,true,draft.message);
 const applied=cmd(draft.state,'creation',{command:{id:'remove-apply',type:'blueprintApply',draftId:'remove-draft'}},now+2);assert.equal(applied.accepted,false);assert.match(applied.message,/高台|守望|下台/);const before=currentProfile(draft.state),after=currentProfile(applied.state);assert.equal(after.materials,before.materials);assert.deepEqual(after.layout,before.layout);assert.deepEqual(after.creation,before.creation);assert.deepEqual(after.creationLayouts,before.creationLayouts);assert.deepEqual(after.guardianLookout,before.guardianLookout);
});

test('a tower scheduled for demolition cannot acquire a new lookout reservation',()=>{
 const s=ready(),p=currentProfile(s);const removed=cmd(s,'layout',{edit:{type:'remove',id:'watch'},baseVersion:p.layout.version},now+1);assert.equal(removed.accepted,true,removed.message);assert.deepEqual(currentProfile(removed.state).layout.construction!.footprint,[]);
 const r=cmd(removed.state,'guardianCommand',{command:{kind:'lookout',buildingId:'watch'}},now+2);assert.equal(r.accepted,false);assert.match(r.message,/高台|入口/);assert.equal(currentProfile(r.state).guardianLookout,undefined);
});
