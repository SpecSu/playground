import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/minimal/model.ts';
const now=Date.UTC(2026,9,25,4);
function fixture(){const s=m.createMinimalState(now);s.welcomeClaimed=true;s.coins=0;s.player={x:1,z:1};s.animals=[{id:'adult',name:'小牛',species:'cow',sex:'female',size:'normal',growth:{version:1,scales:[.6,.8,1]},growthAgeMs:120000,bornAt:now-120000,position:{x:2,z:1},activity:'idle',energy:70,bond:0,activityUntil:now+999999}];return s;}
const greet=(s:m.MinimalState,at=now,id='adult')=>m.minimalCommand(s,{type:'care',animalId:id},at);
test('first successful adult greeting atomically awards ten game coins and today marker',()=>{
 const r=greet(fixture());assert.equal(r.accepted,true);assert.equal(r.state.coins,10);assert.equal(r.state.lastCompanionGiftDay,'2026-10-25');assert.equal(r.state.animals[0].bond,1);assert.equal(r.state.animals[0].energy,78);assert.match(r.message,/10/);
});
test('repeated greeting remains ordinary interaction, and a second animal cannot award twice',()=>{
 const s=greet(fixture()).state;s.animals.push({...s.animals[0],id:'another',bond:0});const again=greet(s);assert.equal(again.accepted,true);assert.equal(again.state.coins,10);assert.equal(again.state.animals[0].bond,2);
 const other=greet(again.state,now,'another');assert.equal(other.state.coins,10);assert.equal(other.state.animals[1].bond,1);
});
test('helper exists and missing old marker is eligible while future and malformed markers are not',()=>{
 assert.equal(typeof m.canClaimCompanionGift,'function');const s=fixture();assert.equal(m.canClaimCompanionGift(s,s.animals[0],now),true);
 for(const lastCompanionGiftDay of ['2026-10-26','2026-02-30','bad'])assert.equal(m.canClaimCompanionGift({...s,lastCompanionGiftDay},s.animals[0],now),false);
});
test('valid future day survives save checks, invalid real-calendar dates do not',()=>{
 const s=fixture();assert.equal(m.validateMinimalSave(s),true);assert.equal(m.validateMinimalSave({...s,lastCompanionGiftDay:'2028-02-29'}),true);
 for(const lastCompanionGiftDay of ['2026-02-29','2026-04-31','2026-13-01','2026-00-01','2026-1-01','',null,12])assert.equal(m.validateMinimalSave({...s,lastCompanionGiftDay}),false,String(lastCompanionGiftDay));
});
test('UTC+8 midnight renews once and rollback cannot reclaim an earlier day',()=>{
 const midnight=Date.UTC(2026,9,25,16),s=fixture();s.animals[0].activityUntil=midnight+999999;
 const first=greet(s,midnight-1);assert.equal(first.state.lastCompanionGiftDay,'2026-10-25');assert.equal(first.state.coins,10);
 const next=greet(first.state,midnight);assert.equal(next.state.lastCompanionGiftDay,'2026-10-26');assert.equal(next.state.coins,20);
 const backwards=greet(next.state,midnight-1);assert.equal(backwards.accepted,false);assert.equal(backwards.state.coins,20);
 const again=greet(backwards.state,midnight);assert.equal(again.state.coins,20);
});
test('baby juvenile carried distant unknown and unwelcomed greetings never consume eligibility',()=>{
 for(const age of [0,60000,119999]){const s=fixture();s.animals[0].bornAt=now-age;s.animals[0].growthAgeMs=age;const r=greet(s);assert.equal(r.accepted,true);assert.equal(r.state.coins,0);assert.equal(r.state.lastCompanionGiftDay,undefined);}
 for(const kind of ['carried','distant','unknown','unwelcomed']){const s=fixture();if(kind==='carried'){s.carriedAnimalId='adult';s.animals[0].activity='carried';}if(kind==='distant')s.player={x:3,z:3};if(kind==='unwelcomed')s.welcomeClaimed=false;const r=greet(s,now,kind==='unknown'?'missing':'adult');assert.equal(r.accepted,false,kind);assert.equal(r.state.coins,0);assert.equal(r.state.lastCompanionGiftDay,undefined);}
});
test('bonus accelerated adulthood and preserved legacy adulthood both qualify only at actual threshold',()=>{
 const s=fixture();s.animals[0].bornAt=now-100000;s.animals[0].growthAgeMs=119999;s.animals[0].growthBonusMs=19999;
 assert.equal(m.canClaimCompanionGift(s,s.animals[0],now),false);s.animals[0].growthBonusMs=20000;assert.equal(m.canClaimCompanionGift(s,s.animals[0],now),true);
 delete s.animals[0].growth;delete s.animals[0].growthBonusMs;s.animals[0].bornAt=now-59999;s.animals[0].growthAgeMs=59999;assert.equal(m.canClaimCompanionGift(s,s.animals[0],now),false);s.animals[0].bornAt=now-60000;assert.equal(m.canClaimCompanionGift(s,s.animals[0],now),true);
});
test('offline simulation and loading never mint or accumulate greeting gifts',()=>{
 const s=fixture();s.lastCompanionGiftDay='2026-10-20';const advanced=m.advanceMinimalState(s,now+3*86400000);assert.equal(advanced.coins,0);assert.equal(advanced.lastCompanionGiftDay,'2026-10-20');
 let raw=JSON.stringify(s);const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};const loaded=m.loadMinimalState(storage,now);assert.equal(loaded.coins,0);assert.equal(loaded.lastCompanionGiftDay,'2026-10-20');
 loaded.player={...loaded.animals[0].position};const greeted=greet(loaded);assert.equal(greeted.state.coins,10);assert.equal(greeted.state.lastCompanionGiftDay,'2026-10-25');
});
test('save reload retains claimed day and valid future date without resetting original assets',()=>{
 const s=fixture();s.coins=777;s.lastCompanionGiftDay='2028-02-29';const storage={getItem:()=>JSON.stringify(s),setItem(){}};const restored=m.loadMinimalState(storage,now);
 assert.equal(restored.coins,777);assert.equal(restored.animals[0].id,'adult');assert.equal(restored.lastCompanionGiftDay,'2028-02-29');assert.equal(greet(restored).state.coins,777);
});
test('helper uses canonical owned animal rather than a forged adult and rejects invalid times',()=>{
 const s=fixture();s.animals[0].bornAt=now;s.animals[0].growthAgeMs=0;assert.equal(m.canClaimCompanionGift(s,{...s.animals[0],bornAt:0,growthAgeMs:120000},now),false);
 for(const at of [NaN,Infinity,Number.MAX_VALUE,now-1])assert.equal(m.canClaimCompanionGift(s,s.animals[0],at),false);
 assert.equal(m.canClaimCompanionGift(s,{...s.animals[0],id:'foreign'},now),false);
});
test('out-of-schema calendar years cannot mint an unsaveable gift marker',()=>{
 const s=fixture();assert.equal(m.canClaimCompanionGift(s,s.animals[0],Date.UTC(10000,0,1)),false);
});
