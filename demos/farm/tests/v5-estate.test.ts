import test from 'node:test';
import assert from 'node:assert/strict';
import { createFarm } from '../src/model.ts';
import { createEstate, commandEstate, currentProfile } from '../src/v5/estate.ts';
const now=1_800_000_000_000;
const cmd=(s:ReturnType<typeof createEstate>,type:string,data:Record<string,unknown>={},at=now)=>commandEstate(s,{id:`test-${type}-${at}`,type,session:currentProfile(s).session,...data},at);
test('V5 migration preserves identity, names, relationships, learned habits and legacy save',()=>{
 const old=createFarm('owner',now-10000);old.animals[1].name='棉花';old.animals[1].bond=6;old.animals[1].habits.love={count:3,stage:'invite',lastAt:now-5000};old.wool=9;
 const s=createEstate('owner',now,old),p=currentProfile(s);
 assert.equal(s.playerId,'owner');assert.equal(s.avatar,'human-lx');assert.equal(p.animals[1].name,'棉花');assert.equal(p.animals[1].life.bond,50);assert.equal(s.legacy?.wool,9);assert.equal(p.animals[1].life.habits.love?.count,3);
 assert.equal(p.materials,60);assert.equal(p.inventory.hand,3);assert.equal(p.inventory.pantry,3);assert.equal(p.layout.buildings.find(b=>b.kind==='shelter')?.capacity,6);
});
test('enter session and repeated feed keep a single reservation, movement cancels without cost',()=>{
 let s=createEstate('owner',now);currentProfile(s).tutorial='done';currentProfile(s).threat=null;s=cmd(s,'enter').state;const session=currentProfile(s).session;
 const first=cmd(s,'feed',{target:'pipi',food:'milk',session},now+10);assert.equal(first.accepted,true);s=first.state;
 const p=currentProfile(s);assert.equal(p.job?.type,'feed');assert.equal(p.inventory.hand,3);
 assert.equal(cmd(s,'feed',{target:'pipi',food:'milk',session},now+20).accepted,false);
 const moved=cmd(s,'move',{to:{x:4,z:7},session},now+30);assert.equal(moved.accepted,true);assert.equal(currentProfile(moved.state).job,null);assert.equal(currentProfile(moved.state).inventory.hand,3);
});
test('feeding walks to target, takes three online seconds, consumes once and saves actual memory',()=>{
 let s=createEstate('owner',now);s=cmd(s,'enter').state;let p=currentProfile(s);p.tutorial='done';p.threat=null;p.position={...p.animals[0].position};
 s=cmd(s,'feed',{target:'pipi',food:'milk',session:p.session},now+1).state;
 for(let i=1;i<=5;i++)s=cmd(s,'pulse',{session:currentProfile(s).session},now+i*1000).state;
 p=currentProfile(s);assert.equal(p.job,null);assert.equal(p.inventory.hand,2);assert.ok(p.animals[0].life.hunger>80);assert.equal(p.animals[0].life.care.baby.feeds,1);
 const after=p.animals[0].life.hunger; s=cmd(s,'pulse',{session:p.session},now+6000).state;assert.ok(currentProfile(s).animals[0].life.hunger<=after);
});
test('stale sessions and background gaps do not advance online jobs, offline never kills',()=>{
 let s=createEstate('owner',now);s=cmd(s,'enter').state;const old=currentProfile(s).session;s=cmd(s,'enter',{},now+1).state;
 assert.equal(cmd(s,'pulse',{session:old},now+1000).accepted,false);
 const p=currentProfile(s);p.tutorial='done';p.threat=null;p.position={...p.animals[0].position};s=cmd(s,'feed',{target:'pipi',food:'milk',session:p.session},now+2).state;
 s=cmd(s,'pulse',{session:p.session},now+86400000).state;assert.equal(currentProfile(s).inventory.hand,3);assert.ok(currentProfile(s).job);assert.equal(currentProfile(s).animals.length,3);
});
test('lab uses fresh separate actors and balances; avatar does not change relationship identity',()=>{
 let s=createEstate('owner',now);currentProfile(s).animals[0].life.bond=80;const before=structuredClone(currentProfile(s));
 s=cmd(s,'profile',{profile:'lab'}).state;assert.equal(s.activeProfile,'lab');assert.notEqual(currentProfile(s).animals[0].id,before.animals[0].id);assert.equal(currentProfile(s).animals[0].life.bond,0);
 s=cmd(s,'avatar',{avatar:'banana-cat'}).state;s=cmd(s,'profile',{profile:'home'}).state;assert.equal(s.playerId,'owner');assert.equal(currentProfile(s).animals[0].life.bond,80);assert.equal(currentProfile(s).materials,60);
});
test('natural challenge and legacy economy bypass are rejected',()=>{
 const s=createEstate('owner',now);assert.equal(cmd(s,'challenge',{confirmed:true,participants:['pipi']}).accepted,false);assert.equal(cmd(s,'claim').accepted,false);assert.equal(cmd(s,'nextVisit').accepted,false);
});
test('safe event completion exits actual shelter before normal pathfinding resumes',()=>{
 let s=createEstate('owner',now);s=cmd(s,'enter').state;s=cmd(s,'guardian',{guardian:'dog'},now+1).state;
 const p=currentProfile(s);p.tutorial='done';if(p.threat){p.threat.phase='complete';const a=p.threat.actors[0];a.status='safe';a.position={x:2,z:2};p.animals[0].position={x:2,z:2};}
 const r=cmd(s,'endEvent',{},now+1000);assert.equal(r.accepted,true);const after=currentProfile(r.state);assert.equal(after.threat,null);assert.ok(after.animals.every(a=>after.layout.owned.some(q=>q.x===Math.round(a.position.x)&&q.z===Math.round(a.position.z))));
});
test('visitor cannot call owner-only care or economic operations',()=>{const s=createEstate('owner',now);assert.equal(cmd(s,'feed',{target:'pipi',actor:'local-visitor-a'}).accepted,false);assert.equal(cmd(s,'layout',{edit:{type:'remove',id:'initial-trough'},baseVersion:1,actor:'local-visitor-a'}).accepted,false);});
test('guardian switch cooldown uses effective online time and does not expire offline',()=>{let s=createEstate('owner',now);s=cmd(s,'guardian',{guardian:'dog'}).state;currentProfile(s).tutorial='done';currentProfile(s).threat=null;s=cmd(s,'guardian',{guardian:'cat'},now+1000).state;assert.equal(cmd(s,'guardian',{guardian:'frog'},now+86400000).accepted,false);});
test('opening wolf is a real frozen threat before choosing and guardian selection resumes same event',()=>{let s=createEstate('opening',now);const p=currentProfile(s);assert.equal(p.threat?.phase,'choosing');assert.ok(p.threat!.wolves.length>0);const id=p.threat!.id;s=cmd(s,'enter').state;s=cmd(s,'pulse',{},now+1000).state;assert.equal(currentProfile(s).threat!.elapsed,0);s=cmd(s,'skipOpening',{},now+1001).state;s=cmd(s,'guardian',{guardian:'frog'},now+1002).state;assert.equal(currentProfile(s).threat!.id,id);assert.equal(currentProfile(s).threat!.phase,'active');});
test('optional assistance produces a real low-need reminder without spending or auto-building',()=>{let s=createEstate('assist',now);let p=currentProfile(s);p.threat=null;p.tutorial='done';s=cmd(s,'enter').state;p=currentProfile(s);p.assistance=true;p.animals[0].life.hunger=29;const hand=p.inventory.hand;const material=p.materials;s=cmd(s,'pulse',{},now+1000).state;p=currentProfile(s);assert.match(p.notice,/皮皮|饿|食物/);assert.equal(p.inventory.hand,hand);assert.equal(p.materials,material);assert.equal(p.layout.construction,undefined);});
test('dismantled trough returns stored food to the workbench without later capacity-clamp loss',()=>{let s=createEstate('trough-return',now);let p=currentProfile(s);p.threat=null;p.tutorial='done';p.inventory.pantry=10;p.troughFood={'initial-trough':6};p.layout.buildings=p.layout.buildings.filter(b=>b.id!=='initial-trough');s=cmd(s,'enter').state;s=cmd(s,'pulse',{},now+1000).state;p=currentProfile(s);assert.equal(p.inventory.pantry,16);assert.equal(p.troughFood?.['initial-trough'],undefined);for(let i=2;i<=35;i++)s=cmd(s,'pulse',{},now+i*1000).state;assert.equal(currentProfile(s).inventory.pantry,16);});
