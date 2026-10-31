import test from 'node:test';
import assert from 'node:assert/strict';
import {createMinimalState,minimalCommand,advanceMinimalState,validateMinimalSave,saveMinimalState,loadMinimalState,MINIMAL_STORAGE_KEY,type MinimalState,type MinimalCommand} from '../src/minimal/model.ts';
import {projectCanonicalState} from '../src/minimal/canonical-timeline.ts';
import {MinimalAudioScenes} from '../src/minimal/audio.ts';
const T=1_793_000_000_000;
function farm():MinimalState {const s=minimalCommand(createMinimalState(T),{type:'welcome'},T).state;s.player={x:1,z:1};s.animals=[{id:'animal-1',name:'原来的羊',species:'sheep',sex:'female',size:'normal',position:{x:2,z:1},activity:'idle',activityUntil:T+100000,energy:80,bond:0,bornAt:T}];s.sequence=1;s.hatchedCount=1;s.collection=['sheep'];return s;}
const defense=(s:MinimalState)=>({guardian:s.guardian,wolfEvent:s.wolfEvent,nextWolfAt:s.nextWolfAt});
test('quiet legacy farm never spawns wolves online or changes the retained deadline',()=>{
 const s=farm();s.nextWolfAt=T+1000;const before=structuredClone(s);let next=s;
 for(let i=1;i<=6;i++)next=advanceMinimalState(next,T+i*1000);
 assert.equal(next.wolfEvent,null);assert.deepEqual(defense(next),defense(s));assert.equal(next.coins,s.coins);assert.deepEqual(s,before);
});
for(const helped of [false,true])for(const catchup of ['local','canonical'] as const)test(`saved ${helped?'helped':'active'} event stays dormant through ${catchup} expiry without reward or data loss`,()=>{
 const s=farm();s.guardian='cat';s.wolfEvent={startedAt:T-1000,endsAt:T+2000,helped};const before=structuredClone(s),now=T+600000;
 const next=catchup==='canonical'?projectCanonicalState(s,now,null):advanceMinimalState(s,now);
 assert.deepEqual(defense(next),defense(s));assert.equal(next.coins,s.coins);assert.equal(next.animals.length,1);assert.equal(next.animals[0].id,s.animals[0].id);assert.ok(next.animals[0].growthAgeMs!>0);assert.deepEqual(s,before);
 const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 assert.equal(validateMinimalSave(next),true);assert.equal(saveMinimalState(storage,next),true);assert.ok(values.get(MINIMAL_STORAGE_KEY));assert.deepEqual(defense(loadMinimalState(storage,now+1000)),defense(s));
});
for(const command of [{type:'wolf'},{type:'help'},{type:'guardian',guardian:'dog'},{type:'guardian',guardian:'cat'},{type:'guardian',guardian:'frog'}] satisfies MinimalCommand[])test(`obsolete ${command.type}${'guardian' in command?':'+command.guardian:''} command is recognized but inert`,()=>{
 const s=farm();s.wolfEvent={startedAt:T-1000,endsAt:T+9000,helped:false};const reply=minimalCommand(s,command,T);
 assert.equal(reply.accepted,false);assert.equal(reply.message,'守护与野兽来袭玩法已暂停，继续照顾小伙伴吧');assert.deepEqual(defense(reply.state),defense(s));assert.equal(reply.state.coins,s.coins);
});
test('new farm can welcome, buy, place, hatch and care without choosing a guardian',()=>{
 let s=createMinimalState(T);const send=(c:MinimalCommand,now=s.updatedAt)=>{const r=minimalCommand(s,c,now);assert.equal(r.accepted,true,r.message);s=r.state;};
 send({type:'welcome'});s.player={x:1,z:1};send({type:'buyEgg'});const id=s.eggs[0].id;send({type:'placeEgg',eggId:id,at:{x:1,z:1}});send({type:'hatch',eggId:id},T+10000);send({type:'care',animalId:s.animals[0].id});assert.equal(s.coins,90);assert.equal(s.animals[0].bond,1);assert.equal(s.wolfEvent,null);
});
test('saved guardian selection is not a requirement for ordinary commands',()=>{
 const s=farm();s.guardian='frog';s.wolfEvent={startedAt:T,endsAt:T+18000,helped:false};const reply=minimalCommand(s,{type:'care',animalId:s.animals[0].id},T);assert.equal(reply.accepted,true);assert.equal(reply.state.animals[0].bond,1);assert.deepEqual(defense(reply.state),defense(s));
});
test('saved events never produce arrival, warning, tense or recovery audio',()=>{
 const s=farm(),adapter=new MinimalAudioScenes();const quiet={scope:`minimal-farm:${T}`,eventId:null,warning:false,active:false,complete:false};assert.deepEqual(adapter.update(s),quiet);
 s.wolfEvent={startedAt:T,endsAt:T+18000,helped:false};assert.deepEqual(adapter.update(s),quiet);s.updatedAt=T+20000;assert.deepEqual(adapter.update(s),quiet);s.wolfEvent=null;assert.deepEqual(adapter.update(s),quiet);
});
