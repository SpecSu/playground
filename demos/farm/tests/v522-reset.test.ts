import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFarm} from '../src/model.ts';
import {commandEstate,createEstate,currentProfile,type Estate,type EstateCommand} from '../src/v5/estate.ts';
import {EstateStore} from '../server/estate-store.ts';

const T=1_800_000_000_000;
function ready(){
 const legacy=createFarm('reset-owner',T-1000);legacy.animals[0].name='以前的名字';legacy.animals[0].bond=9;legacy.animals[0].experiences=[{at:T-500,text:'以前的共同经历'}];legacy.avatar='banana-cat';
 let s=createEstate('reset-owner',T,legacy);
 s=commandEstate(s,{id:'home-enter',type:'enter'},T).state;
 s=commandEstate(s,{id:'lab-enter',type:'profile',profile:'lab'},T+1).state;
 s=commandEstate(s,{id:'home-return',type:'profile',profile:'home'},T+2).state;
 for(const p of Object.values(s.profiles)){
  if(!p)continue;p.materials=91;p.inventory.hand=1;p.inventory.pantry=12;p.tutorial='done';p.opening={version:1,stage:'done',elapsed:5,guardian:'frog'};p.guardian='frog';p.threat=null;
  p.animals[0].name='相处很久的羊';p.animals[0].appearance='starlit';p.animals[0].life.bond=75;p.animals[0].life.memory=[{kind:'play',at:T,text:'一起跳过舞'}];p.animals[0].life.care.baby.feeds=5;
  p.animals[0].life.habits.dance={count:3,stage:'invite',lastAt:T,sessions:['old'],days:['old'],imported:false};
  p.position={x:9,z:4};p.path=[{x:8,z:4}];p.job={id:'old-feed',type:'feed',target:p.animals[0].id,food:'milk',progress:2400,phase:'act',to:{x:4,z:4}};
  p.events=[{id:'old',text:'以前的事件',at:T}];p.milestones=['first-meal'];p.regions=['pen','home'];p.factory.stock=7;p.surveyed=true;p.sharedRhythm=true;
 }
 return s;
}
function reset(s:Estate,extra:Partial<EstateCommand>={},now=T+100){
 const p=currentProfile(s);return commandEstate(s,{id:'reset-once',type:'resetProfile',profile:p.id,session:p.session,confirmed:true,...extra},now);
}
for(const profile of ['home','lab'] as const){
 test(`confirmed reset clears only ${profile} gameplay and creates a new opening session`,()=>{
  let s=ready();if(profile==='lab')s=commandEstate(s,{id:'switch-lab',type:'profile',profile:'lab'},T+3).state;
  const other=profile==='home'?'lab':'home',untouched=structuredClone(s.profiles[other]),original=structuredClone(s);
  const r=reset(s);assert.equal(r.accepted,true,r.message);const p=currentProfile(r.state);
  assert.deepEqual(s,original,'pure reset never mutates the supplied state');
  assert.equal(r.state.playerId,s.playerId);assert.equal(r.state.avatar,'banana-cat');assert.equal(r.state.activeProfile,profile);assert.deepEqual(r.state.profiles[other],untouched);assert.equal(r.state.revision,s.revision+1);
  let expected=createEstate(s.playerId,T+100);
  if(profile==='lab')expected=commandEstate(expected,{id:'expected-lab',type:'profile',profile:'lab'},T+100).state;
  const fresh=currentProfile(expected);fresh.session='reset-once';fresh.runId='reset-once';fresh.notice=r.message;
  assert.deepEqual(p,fresh,'all current gameplay fields return to a fresh profile, without legacy import');
  assert.equal(p.opening?.stage,'establish');assert.equal(p.animals[0].life.memory.length,0);assert.equal(p.animals[0].life.bond,0);assert.equal(p.animals[0].life.ageMultiplier,profile==='lab'?240:1);
 });
}
test('reset rejects missing confirmation, mismatched profile, stale or empty session and visitor without mutations',()=>{
 const s=ready();const attempts:Partial<EstateCommand>[]=[{confirmed:false},{confirmed:undefined},{profile:'lab'},{profile:undefined},{session:'stale'},{session:undefined},{actor:'local-visitor-a'}];
 for(const extra of attempts){const before=structuredClone(s),r=reset(s,extra);assert.equal(r.accepted,false,JSON.stringify(extra));assert.deepEqual(r.state,before);assert.deepEqual(s,before);}
 const empty=ready();currentProfile(empty).session='';const r=reset(empty,{session:''});assert.equal(r.accepted,false);assert.deepEqual(r.state,empty);
});
test('reset is available during an incomplete opening and invalidates delayed pre-reset commands',()=>{
 let s=createEstate('opening-reset',T);s=commandEstate(s,{id:'before-reset-session',type:'enter'},T).state;
 const r=reset(s);assert.equal(r.accepted,true,r.message);assert.equal(currentProfile(r.state).opening?.stage,'establish');
 const stale=commandEstate(r.state,{id:'late-skip',type:'skipOpening',session:'before-reset-session'},T+101);assert.equal(stale.accepted,false);assert.deepEqual(stale.state,r.state);
 const newSkip=commandEstate(r.state,{id:'new-skip',type:'skipOpening',session:'reset-once'},T+102);assert.equal(newSkip.accepted,true);assert.equal(currentProfile(newSkip.state).opening?.stage,'choose');
});
test('SQLite retry of a saved reset never discards newer progress, even after reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'farm-reset-'));const file=join(dir,'isolated.sqlite');let store:EstateStore|undefined;
 try{
  store=new EstateStore(file);const entered=store.command('owner',{id:'initial-enter',type:'enter'},T);const request={id:'persisted-reset',type:'resetProfile',profile:'home',session:entered.snapshot.profile.session,confirmed:true};
  const first=store.command('owner',request,T+1);assert.equal(first.accepted,true,first.message);assert.equal(first.snapshot.profile.runId,request.id);assert.equal(first.duplicate,false);
  let session=first.snapshot.profile.session;
  const send=(id:string,type:string,extra:Record<string,unknown>={},now=T+2)=>{const r=store!.command('owner',{id,type,session,...extra},now);assert.equal(r.accepted,true,r.message);session=r.snapshot.profile.session;return r;};
  send('new-skip','skipOpening');send('new-guardian','guardian',{guardian:'cat'});send('skip-arrival','skipOpening');const named=send('new-name','rename',{target:'pipi',name:'全新演示'});
  store.close();store=new EstateStore(file);
  const retry=store.command('owner',request,T+3);assert.equal(retry.accepted,true);assert.equal(retry.duplicate,true);assert.deepEqual(retry.snapshot.profile,named.snapshot.profile);
  const saved=store.get('owner',T+3);assert.equal(saved.profile.animals[0].name,'全新演示');assert.equal(saved.profile.guardian,'cat');assert.equal(saved.profile.runId,request.id);
  const delayed=store.command('owner',{...request,id:'late-distinct-reset'},T+4);assert.equal(delayed.accepted,false);assert.equal(delayed.snapshot.profile.animals[0].name,'全新演示');
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
