import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,commandEstate,currentProfile,type Estate} from '../src/v5/estate.ts';
import {createLife} from '../src/v5/life.ts';
const T=1_800_000_000_000;
let seq=0;
function run(s:Estate,type:string,extra:Record<string,unknown>={},now=T){return commandEstate(s,{id:`review-command-${++seq}`,type,session:currentProfile(s).session,...extra},now);}
function ready(){let s=createEstate('review-owner',T);s=run(s,'enter').state;currentProfile(s).tutorial='done';currentProfile(s).threat=null;return s;}

test('retained complete event locks even immediate gate edits until atomic egress',()=>{
 let s=ready();s=run(s,'guardian',{guardian:'dog'}).state;
 const p=currentProfile(s);p.threat=null;p.guardianReadyMs=0;
 s=run(s,'rehearse').state;const event=currentProfile(s).threat!;event.phase='complete';
 const shelter=currentProfile(s).layout.buildings.find(b=>b.kind==='shelter')!;
 // A second open door makes closing the original door otherwise a legal edit.
 shelter.doors.push({id:'review-second-door',x:0,z:2,open:true,paidCost:8});
 const before=currentProfile(s).layout.version;
 const result=run(s,'layout',{baseVersion:before,edit:{type:'door-state',id:shelter.id,doorId:shelter.doors[0].id,open:false}});
 assert.equal(result.accepted,false);assert.equal(currentProfile(result.state).layout.version,before);
 assert.match(result.message,/事件|守护|结束|锁定/);
 const pulse=run(result.state,'pulse',{},T+1000);assert.equal(pulse.accepted,true);
});

test('a stale tab cannot start care or cancel the replacement session job',()=>{
 let s=ready();const old=currentProfile(s).session;s=run(s,'enter',{},T+1).state;
 const stale=run(s,'feed',{session:old,target:'pipi',food:'milk'},T+2);
 assert.equal(stale.accepted,false);assert.equal(currentProfile(stale.state).job,null);
 const current=run(s,'feed',{target:'pipi',food:'milk'},T+3);assert.equal(current.accepted,true);
 const staleCancel=run(current.state,'cancel',{session:old},T+4);assert.equal(staleCancel.accepted,false);assert.equal(currentProfile(staleCancel.state).job?.id,currentProfile(current.state).job?.id);
});

test('visibility re-entry settles bounded offline needs before resetting pulse clock',()=>{
 let s=ready();currentProfile(s).animals[0].life.energy=40;
 s=run(s,'enter',{},T+3_600_000).state;
 const a=currentProfile(s).animals[0];assert.equal(a.life.hunger,35);assert.equal(a.life.energy,100);
 s=run(s,'pulse',{},T+3_601_000).state;assert.ok(currentProfile(s).animals[0].life.hunger<35);
});

test('lab memorial is a historical identity and cannot play, follow, rest or produce',()=>{
 let s=ready();s=run(s,'profile',{profile:'lab'}).state;const p=currentProfile(s);p.tutorial='done';
 const a=p.animals[0];a.life=createLife(T,{stage:'adult'});a.life.products.stored=4;a.memorial={at:T,eventId:'confirmed-lab-challenge'};p.position={...a.position};
 for(const [type,extra] of [['play',{target:a.id,action:'love'}],['follow',{target:a.id}],['rest',{target:a.id}],['claimProducts',{}]] as const){const r=run(s,type,extra,T+1000);assert.equal(r.accepted,false,type);assert.equal(currentProfile(r.state).materials,60,type);}
});

test('entered gameplay writes require the current explicit session token',()=>{
 const s=ready();
 const missing=commandEstate(s,{id:`review-missing-${++seq}`,type:'feed',target:'pipi',food:'milk'},T+1);
 assert.equal(missing.accepted,false);assert.equal(currentProfile(missing.state).job,null);
});

test('a delayed cancel bound to an earlier job cannot cancel a newer reservation',()=>{
 let s=ready();s=run(s,'feed',{target:'pipi',food:'milk'},T+1).state;const oldJob=currentProfile(s).job!.id;
 s=run(s,'cancel',{jobId:oldJob},T+2).state;
 s=run(s,'feed',{target:'momo',food:'milk'},T+3).state;const newJob=currentProfile(s).job!.id;
 const late=run(s,'cancel',{jobId:oldJob},T+4);assert.equal(late.accepted,false);assert.equal(currentProfile(late.state).job?.id,newJob);assert.equal(currentProfile(late.state).inventory.hand,3);
});

test('construction reservations invalidate cached animal paths before entering occupied cells',()=>{
 let s=ready();const p=currentProfile(s);p.animals[0].path=[{x:4,z:4},{x:5,z:4},{x:6,z:4},{x:7,z:4}];
 const built=run(s,'layout',{baseVersion:p.layout.version,edit:{type:'place',id:'review-obstacle',kind:'decor',x:6,z:4}},T+1);assert.equal(built.accepted,true,built.message);s=built.state;
 for(let i=1;i<=4;i++){s=run(s,'pulse',{},T+i*1000).state;const a=currentProfile(s).animals[0];assert.ok(!(Math.round(a.position.x)===6&&Math.round(a.position.z)===4),`tick${i} entered reserved footprint`);assert.ok(!a.path.some(q=>q.x===6&&q.z===4),`tick${i} kept blocked path`);}
});
test('a memorial outcome still awaiting event dismissal cannot accept a new feeding job',()=>{let s=ready();s=run(s,'guardian',{guardian:'dog'}).state;currentProfile(s).guardianReadyMs=0;s=run(s,'rehearse').state;const p=currentProfile(s);p.threat!.phase='complete';p.threat!.actors[0].status='memorial';p.position={...p.animals[0].position};const r=run(s,'feed',{target:p.animals[0].id,food:'milk'});assert.equal(r.accepted,false);assert.equal(currentProfile(r.state).job,null);});
