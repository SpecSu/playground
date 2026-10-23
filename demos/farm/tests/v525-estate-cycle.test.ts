import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createEstate,currentProfile,commandEstate,settleEstate,type Estate} from '../src/v5/estate.ts';import {EstateStore} from '../server/estate-store.ts';import {createThreat} from '../src/v5/threat.ts';
const T=1_800_000_000_000;let seq=0;
function ready(){const s=createEstate('cycle-owner',T),p=currentProfile(s);p.tutorial='done';p.opening!.stage='done';p.threat=null;p.guardian='dog';p.milestones.push('first-meal');p.session='session';return s;}
function cmd(s:Estate,type:string,extra:Record<string,unknown>={},at=T){return commandEstate(s,{id:`cycle-${++seq}`,type,session:currentProfile(s).session,...extra},at);}
test('fresh and migrated estates have one persistent graded economy without reimporting old products',()=>{
 const s=ready(),p=currentProfile(s);assert.ok(p.economy,'fresh estate initializes warehouse');assert.ok(p.animals.every(a=>a.husbandry),'every animal keeps its care level');assert.equal(p.production?.slots.length,3,'fresh estate enables three V6 production slots');
 delete p.economy;delete p.raidCycle;delete p.production;delete p.v7;for(const a of p.animals)delete a.husbandry;p.animals[0].life.products.stored=2;
 const next=settleEstate(s,T+86400000),q=currentProfile(next);assert.equal(q.animals[0].husbandry?.pending.white,0);assert.deepEqual(q.production?.pending.map(l=>({amount:l.amount,tier:l.tier,animalId:l.animalId,version:l.version,source:l.source})),[{amount:2,tier:'white',animalId:p.animals[0].id,version:'legacy',source:'legacy-pending'}]);assert.equal(q.animals[0].life.products.stored,0);assert.equal(q.animals[0].husbandry?.settledAt,T+86400000);
 const again=currentProfile(settleEstate(next,T+86400000));assert.deepEqual(again.production,q.production);assert.equal(again.economy?.warehouse.white,0);assert.equal(again.animals[0].id,p.animals[0].id);assert.equal(again.animals[0].life.bond,p.animals[0].life.bond);
});
test('actual store claims graded wool and exchanges it exactly once across retries',()=>{
 const dir=mkdtempSync(join(tmpdir(),'farm-cycle-')),store=new EstateStore(join(dir,'test.sqlite'));try{
  const fixture=ready();fixture.playerId='grade-owner';const db=new DatabaseSync(join(dir,'test.sqlite'));db.prepare('INSERT INTO estates(device,state) VALUES(?,?)').run('grade-owner',JSON.stringify(fixture));db.close();
  let s=store.get('grade-owner',T);s=store.command('grade-owner',{id:'enter',type:'enter'},T).snapshot;
  // A short revisit earns no V6 wool; a complete 12h period yields two per slot.
  const session=s.profile.session;
  const early=store.command('grade-owner',{id:'too-early',type:'claimWool',session},T+600001);assert.equal(early.accepted,false);assert.equal(early.snapshot.profile.economy?.warehouse.white,0);
  const claim=store.command('grade-owner',{id:'claim',type:'claimWool',session},T+43_200_000);
  assert.equal(claim.accepted,true,claim.message);assert.equal(claim.snapshot.profile.economy?.warehouse.white,6);assert.ok(claim.snapshot.profile.economy?.lots?.every(l=>l.version==='v7'&&l.claimedBy==='claim'&&l.animalId));
  const again=store.command('grade-owner',{id:'claim',type:'claimWool',session},T+43_200_000);assert.equal(again.duplicate,true);assert.equal(again.snapshot.profile.economy?.warehouse.white,6);
  const exchange=store.command('grade-owner',{id:'exchange',type:'v7-sell-wool',session,tier:'white',amount:6,version:'v7'},T+43_200_000);assert.equal(exchange.accepted,true,exchange.message);assert.equal(exchange.snapshot.profile.materials,72);
  const retry=store.command('grade-owner',{id:'exchange',type:'v7-sell-wool',session,tier:'white',amount:6,version:'v7'},T+43_200_001);assert.equal(retry.snapshot.profile.materials,72);assert.equal(retry.snapshot.profile.economy?.warehouse.white,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('guardian and enclosure upgrades spend once per expected level and keep animal identity',()=>{
 let s=ready();const ids=currentProfile(s).animals.map(a=>a.id),first=cmd(s,'upgradeGuardian',{guardian:'dog',expectedLevel:1});assert.equal(first.accepted,true,first.message);s=first.state;
 assert.equal(currentProfile(s).upgrades?.guardians.dog,2);assert.equal(currentProfile(s).materials,36);assert.equal(cmd(s,'upgradeGuardian',{guardian:'dog',expectedLevel:1}).accepted,false);
 const shelter=cmd(s,'upgradeShelter',{buildingId:'initial-shelter',expectedLevel:1});assert.equal(shelter.accepted,true,shelter.message);s=shelter.state;assert.equal(currentProfile(s).materials,20);assert.equal(currentProfile(s).upgrades?.shelters['initial-shelter'],2);assert.equal(currentProfile(s).layout.buildings[0].capacity,6);assert.deepEqual(currentProfile(s).animals.map(a=>a.id),ids);
});
test('a new resident needs paid explicit box current preview and spare reachable protection capacity',()=>{
 let s=ready();currentProfile(s).materials=200;const old=cmd(s,'adopt',{expectedCount:3});assert.equal(old.accepted,false);assert.equal(currentProfile(old.state).materials,200);
 const buy=cmd(s,'v7-buy-box',{species:'sheep',tier:'white'});assert.equal(buy.accepted,true);s=buy.state;const box=currentProfile(s).v7!.eggs[0];const pre=cmd(s,'v7-preview-hatch',{boxId:box.id});assert.equal(pre.accepted,true);s=pre.state;
 const first=cmd(s,'v7-hatch',{boxId:box.id,expectedCount:3,expectedLayoutVersion:currentProfile(s).layout.version,expectedVersion:currentProfile(s).v7!.revision});assert.equal(first.accepted,true,first.message);const p=currentProfile(first.state);assert.equal(p.animals.length,4);assert.equal(p.materials,140);assert.ok(p.animals[3].husbandry);assert.equal(cmd(first.state,'v7-hatch',{boxId:box.id,expectedCount:3}).accepted,false);
 const noBeds=ready();currentProfile(noBeds).materials=200;currentProfile(noBeds).layout.buildings=[];const bought=cmd(noBeds,'v7-buy-box',{species:'sheep',tier:'white'}),box2=currentProfile(bought.state).v7!.eggs[0];const preview=cmd(bought.state,'v7-preview-hatch',{boxId:box2.id});assert.equal(currentProfile(preview.state).v7!.preview!.ok,false);assert.equal(cmd(preview.state,'v7-hatch',{boxId:box2.id,expectedCount:3,expectedVersion:currentProfile(preview.state).v7!.revision,expectedLayoutVersion:currentProfile(preview.state).layout.version}).accepted,false);
});
test('natural threat time pauses with hidden scene readiness or modal coverage, then resumes only online dt',()=>{
 const s=ready(),p=currentProfile(s);p.threat=createThreat({id:'natural-test',seed:5,mode:'reassure',guardian:'dog',actors:p.animals.map(a=>({id:a.id,position:a.position}))},p.layout);
 const paused=cmd(s,'pulse',{presentationReady:false},T+1000);assert.equal(currentProfile(paused.state).threat?.elapsed,0);
 const covered=cmd(paused.state,'pulse',{presentationReady:true,presentationCovered:true},T+2000);assert.equal(currentProfile(covered.state).threat?.elapsed,0);
 const resume=cmd(covered.state,'pulse',{presentationReady:true,presentationCovered:false},T+2500);assert.ok(Math.abs(currentProfile(resume.state).threat!.elapsed-.5)<1e-6);
});
test('adopting after a memorial always gives the new stable ID a saved name',()=>{
 const s=ready(),p=currentProfile(s);p.animals[0].memorial={at:T,eventId:'independent-test-challenge'};
 p.materials=200;const buy=cmd(s,'v7-buy-box',{species:'sheep',tier:'white'});const box=currentProfile(buy.state).v7!.eggs[0];const preview=cmd(buy.state,'v7-preview-hatch',{boxId:box.id});const q=currentProfile(preview.state);const r=cmd(preview.state,'v7-hatch',{boxId:box.id,expectedCount:2,expectedVersion:q.v7!.revision,expectedLayoutVersion:q.layout.version});assert.equal(r.accepted,true,r.message);
 const added=currentProfile(r.state).animals.at(-1)!;assert.equal(typeof added.name,'string');assert.ok(added.name.length>0);
 assert.notEqual(added.id,'pipi');assert.equal(JSON.parse(JSON.stringify(added)).name,added.name);
});
