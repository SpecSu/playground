import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EstateStore} from '../server/estate-store.ts';
import {createEstate,currentProfile,type Estate,type EstateCommand} from '../src/v5/estate.ts';
import {createHusbandry,emptyStacks} from '../src/v5/herd-economy.ts';
import {createThreat} from '../src/v5/threat.ts';

const T=1_800_000_000_000;
const OWNER='economy-integration-owner';
function ready():Estate{
 const estate=createEstate(OWNER,T),p=currentProfile(estate);
 p.tutorial='done';p.opening!.stage='done';p.threat=null;p.guardian='dog';p.session='session';p.milestones.push('first-meal');
 return estate;
}
/** Each test owns a disposable database; no running service or real save is used. */
function withStore(fixture:Estate,run:(io:{command:(c:EstateCommand,at?:number)=>ReturnType<EstateStore['command']>;get:(at?:number)=>ReturnType<EstateStore['get']>;reopen:()=>void})=>void){
 const dir=mkdtempSync(join(tmpdir(),'farm-economy-integration-')),file=join(dir,'test.sqlite');
 let store=new EstateStore(file);
 const db=new DatabaseSync(file);db.prepare('INSERT INTO estates(device,state) VALUES(?,?)').run(OWNER,JSON.stringify(fixture));db.close();
 try{run({
  command:(c,at=T)=>store.command(OWNER,{session:'session',...c},at),
  get:(at=T)=>store.get(OWNER,at),
  reopen:()=>{store.close();store=new EstateStore(file);},
 });}finally{store.close();rmSync(dir,{recursive:true,force:true});}
}
function qualify(fixture:Estate){
 const p=currentProfile(fixture),a=p.animals[0];
 a.life.care.baby.feeds=1;a.life.lastEffectiveFeedAt=T-1;a.life.bond=23;
 a.husbandry=createHusbandry(T,'home',a.life);
 return {p,a};
}

test('legacy products migrate once through durable GET, and the old claim command cannot reimport them',()=>{
 const fixture=ready(),p=currentProfile(fixture),a=p.animals[0];
 for(const animal of p.animals)delete animal.husbandry;
 delete p.economy;delete p.upgrades;delete p.raidCycle;delete p.production;
 a.life.stage='adult';a.life.products.stored=4;a.life.products.settledAt=T-86_400_000;a.life.bond=55;
 withStore(fixture,io=>{
  const migrated=io.get();assert.equal(migrated.profile.production?.pending[0].amount,4);assert.equal(migrated.profile.animals[0].life.products.stored,0);
  const claim={id:'legacy-alias',type:'claimProducts',target:a.id};
  const first=io.command(claim);assert.equal(first.accepted,true,first.message);assert.equal(first.snapshot.profile.economy?.warehouse.white,4);assert.equal(first.snapshot.profile.materials,60);
  io.reopen();const reload=io.get();assert.equal(reload.profile.animals[0].life.bond,55);assert.equal(reload.profile.animals[0].husbandry?.pending.white,0);
  const retry=io.command(claim);assert.equal(retry.duplicate,true);assert.equal(retry.snapshot.profile.economy?.warehouse.white,4);
  const fresh=io.command({...claim,id:'legacy-alias-again'});assert.equal(fresh.accepted,false);assert.equal(fresh.snapshot.profile.economy?.warehouse.white,4);
  const later=io.command({id:'new-production',type:'claimWool',target:a.id},T+43_200_000);
  assert.equal(later.accepted,true,later.message);assert.deepEqual(later.snapshot.profile.economy?.warehouse,{...emptyStacks(),white:7});
  assert.equal(later.snapshot.profile.economy?.lots?.filter(l=>l.version==='legacy'&&l.tier==='white').reduce((n,l)=>n+l.amount,0),4);assert.equal(later.snapshot.profile.economy?.lots?.find(l=>l.version==='v7'&&l.animalId===a.id)?.amount,3);assert.equal(later.snapshot.profile.animals[0].id,a.id);assert.equal(later.snapshot.profile.animals[0].life.products.stored,0);
 });
});

test('V6 pauses pure label cultivation while preserving old balances and rarity',()=>{
 const fixture=ready(),{p,a}=qualify(fixture);p.economy!.warehouse={...emptyStacks(),white:2,blue:3};
 withStore(fixture,io=>{const r=io.command({id:'pause-cultivation',type:'cultivate',target:a.id,expectedRarity:'white'});assert.equal(r.accepted,false);assert.match(r.message,/已暂停/);assert.deepEqual(r.snapshot.profile.economy?.warehouse,p.economy!.warehouse);assert.equal(r.snapshot.profile.animals[0].husbandry?.rarity,'white');});
});

test('receipts for claiming, exchanging, two upgrades and explicit box hatching survive reopening without a second debit',()=>{
 const fixture=ready(),p=currentProfile(fixture);p.materials=100;p.animals[0].husbandry!.pending.gold=2;delete p.production;
 const commands:EstateCommand[]=[
  {id:'claim-once',type:'claimWool',target:p.animals[0].id},
  {id:'exchange-once',type:'exchangeWool',tier:'gold',amount:2,woolVersion:'legacy'},
  {id:'guardian-once',type:'upgradeGuardian',guardian:'dog',expectedLevel:1},
  {id:'shelter-once',type:'upgradeShelter',buildingId:'initial-shelter',expectedLevel:1},
  {id:'buy-once',type:'v7-buy-box',species:'sheep',tier:'white'},
  {id:'preview-once',type:'v7-preview-hatch',boxId:'box-buy-once'},
  {id:'hatch-once',type:'v7-hatch',boxId:'box-buy-once',expectedCount:3,expectedLayoutVersion:p.layout.version,expectedVersion:1},
 ];
 withStore(fixture,io=>{
  for(const command of commands){const result=io.command(command);assert.equal(result.accepted,true,result.message);}
  const before=io.get();assert.equal(before.profile.materials,24);assert.equal(before.profile.animals.length,4);assert.equal(before.profile.upgrades?.guardians.dog,2);assert.equal(before.profile.upgrades?.shelters['initial-shelter'],2);
  io.reopen();for(const command of [...commands].reverse()){const retry=io.command(command);assert.equal(retry.duplicate,true);assert.equal(retry.accepted,true);}
  const after=io.get();assert.deepEqual(after.profile.economy,before.profile.economy);assert.deepEqual(after.profile.upgrades,before.profile.upgrades);assert.equal(after.profile.materials,24);assert.deepEqual(after.profile.animals.map(a=>a.id),before.profile.animals.map(a=>a.id));
  for(const command of commands.slice(2,4)){const stale=io.command({...command,id:`${command.id}-fresh`});assert.equal(stale.accepted,false,command.type);assert.equal(stale.snapshot.profile.materials,24);}
 });
});

test('a rejected spend receipt cannot become a debit after stock changes',()=>{
 const fixture=ready(),p=currentProfile(fixture);p.animals[0].husbandry!.pending.blue=2;delete p.production;
 withStore(fixture,io=>{
  const request={id:'empty-exchange',type:'exchangeWool',tier:'blue',amount:2,woolVersion:'legacy'};
  const empty=io.command(request);assert.equal(empty.accepted,false);
  assert.equal(io.command({id:'fill-warehouse',type:'claimWool'}).accepted,true);
  io.reopen();const retry=io.command(request);assert.equal(retry.duplicate,true);assert.equal(retry.accepted,false);assert.equal(retry.snapshot.profile.materials,60);assert.equal(retry.snapshot.profile.economy?.warehouse.blue,2);
  const fresh=io.command({...request,id:'funded-exchange'});assert.equal(fresh.accepted,true);assert.equal(fresh.snapshot.profile.materials,68);assert.equal(fresh.snapshot.profile.economy?.warehouse.blue,0);
 });
});

test('completed feeding upgrades husbandry once without recoloring wool earned at the old level',()=>{
 const fixture=ready(),p=currentProfile(fixture),a=p.animals[0];p.position={...a.position};
 withStore(fixture,io=>{
  const at=T+43_200_000;
  const entered=io.command({id:'enter-after-interval',type:'enter'},at);assert.equal(entered.accepted,true);
  const session=entered.snapshot.profile.session;
  assert.equal(entered.snapshot.profile.production?.pending.filter(l=>l.animalId===a.id&&l.tier==='white').reduce((n,l)=>n+l.amount,0),2);
  const feed=io.command({id:'first-feed',type:'feed',target:a.id,food:'milk',session},at);assert.equal(feed.accepted,true,feed.message);
  for(let i=1;i<=4;i++){const tick=io.command({id:`feeding-pulse-${i}`,type:'pulse',session,presentationReady:true},at+i*1000);assert.equal(tick.accepted,true,tick.message);}
  const fed=io.get(at+4000),husbandry=fed.profile.animals[0].husbandry!;
  assert.equal(fed.profile.inventory.hand,2);assert.equal(fed.profile.animals[0].life.care.baby.feeds,1);assert.equal(husbandry.level,2);assert.equal(husbandry.effectiveFeeds,1);assert.equal(husbandry.pending.white,0);assert.equal(husbandry.pending.green,0);
  io.reopen();const repeat=io.command({id:'first-feed',type:'feed',target:a.id,food:'milk',session},at+4000);assert.equal(repeat.duplicate,true);assert.equal(repeat.snapshot.profile.inventory.hand,2);assert.equal(repeat.snapshot.profile.animals[0].husbandry?.effectiveFeeds,1);
  const later=io.get(at+43_200_000);assert.equal(later.profile.production?.pending.filter(l=>l.animalId===a.id&&l.tier==='white').reduce((n,l)=>n+l.amount,0),4);
 });
});

test('adult effective feeding can still raise husbandry after lifecycle care stops incrementing',()=>{
 const fixture=ready(),p=currentProfile(fixture),a=p.animals[0];a.life.stage='adult';a.life.care.baby.feeds=3;a.life.care.juvenile.feeds=2;a.life.lastEffectiveFeedAt=T-1_860_000;a.husbandry=createHusbandry(T,'home',a.life);p.position={...a.position};
 withStore(fixture,io=>{
  const feed=io.command({id:'adult-feed',type:'feed',target:a.id,food:'feed'});assert.equal(feed.accepted,true,feed.message);
  for(let i=1;i<=4;i++)assert.equal(io.command({id:`adult-pulse-${i}`,type:'pulse',presentationReady:true},T+i*1000).accepted,true);
  io.reopen();const result=io.get(T+4000).profile.animals[0];assert.equal(result.life.stage,'adult');assert.equal(result.life.care.juvenile.feeds,2);assert.equal(result.husbandry?.effectiveFeeds,6);assert.equal(result.husbandry?.level,4);
  io.get(T+5000);assert.equal(io.get(T+6000).profile.animals[0].husbandry?.effectiveFeeds,6);
 });
});

test('active guarding locks cultivation, guardian and shelter upgrades, and adoption without resource changes',()=>{
 const fixture=ready(),{p,a}=qualify(fixture);p.economy!.warehouse.white=10;p.materials=100;
 p.threat=createThreat({id:'guarding-lock',seed:12,mode:'reassure',guardian:'dog',actors:p.animals.map(animal=>({id:animal.id,position:animal.position}))},p.layout);
 withStore(fixture,io=>{
  const before=io.get();
  for(const request of [
   {id:'locked-cultivate',type:'cultivate',target:a.id,expectedRarity:'white'},
   {id:'locked-guardian',type:'upgradeGuardian',guardian:'dog',expectedLevel:1},
   {id:'locked-shelter',type:'upgradeShelter',buildingId:'initial-shelter',expectedLevel:1},
   {id:'locked-adopt',type:'adopt',expectedCount:3},
  ]){const r=io.command(request);assert.equal(r.accepted,false);assert.match(r.message,/先完成这次守护/);assert.equal(r.snapshot.profile.materials,100);assert.deepEqual(r.snapshot.profile.economy,before.profile.economy);assert.deepEqual(r.snapshot.profile.upgrades,before.profile.upgrades);assert.equal(r.snapshot.profile.animals.length,3);assert.equal(r.snapshot.profile.animals[0].husbandry?.rarity,'white');}
  io.reopen();assert.equal(io.get().profile.threat?.id,'guarding-lock');
 });
});

test('offline production has a finite cap and cannot regenerate its discarded backlog on immediate repeated claims',()=>{
 withStore(ready(),io=>{
  const at=T+30*86_400_000;
  const first=io.command({id:'month-return',type:'claimWool'},at);assert.equal(first.accepted,true,first.message);assert.equal(first.snapshot.profile.economy?.warehouse.white,36);
  io.reopen();for(let i=0;i<3;i++){const repeat=io.command({id:`empty-return-${i}`,type:'claimWool'},at);assert.equal(repeat.accepted,false);assert.equal(repeat.snapshot.profile.economy?.warehouse.white,36);}
  const next=io.command({id:'one-real-interval',type:'claimWool'},at+43_200_000);assert.equal(next.accepted,true,next.message);assert.equal(next.snapshot.profile.economy?.warehouse.white,42);
 });
});
