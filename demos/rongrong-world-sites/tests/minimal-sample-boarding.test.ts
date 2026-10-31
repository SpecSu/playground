import test from 'node:test';import assert from 'node:assert/strict';
import {createSampleBoardingAdapter,sampleBoardingCandidates} from '../src/minimal/sample-boarding.ts';
import {BOARDING_TERMS} from '../src/minimal/boarding-contract.ts';
const T=1_800_000_000_000;
test('demo boarding follows pending/active/completed with isolated nontransferable egg and helper reward',async()=>{
 let now=T;const a=createSampleBoardingAdapter({realmId:'viewer-a',now:()=>now,outcome:()=>true});const c=sampleBoardingCandidates('forest','viewer-a');
 assert.ok(c.visitor.id.startsWith('demo:'));assert.equal(c.visitor.nonTransferable,true);
 const idle=await a.read('forest');assert.equal(idle.status,'idle');assert.equal(idle.nonTransferable,true);
 const pending=await a.invite({sampleId:'forest',parentId:c.visitor.id,requestId:'invite-1'});assert.equal(pending.status,'pending');
 const active=await a.confirm({sampleId:'forest',partnerId:c.hosts[0].id,requestId:'accept-1'});assert.equal(active.status,'active');assert.equal(active.readyAt,T+BOARDING_TERMS.stayMs);
 now+=BOARDING_TERMS.stayMs;const done=await a.read('forest');assert.equal(done.status,'completed');assert.equal(done.demoEggs,1);assert.equal(done.demoCoins,BOARDING_TERMS.helperCoins);assert.equal(done.nonTransferable,true);assert.equal('farm' in done,false);assert.equal('accountId' in done,false);
 assert.deepEqual(await a.read('forest'),done);assert.deepEqual(await a.confirm({sampleId:'forest',partnerId:c.hosts[0].id,requestId:'accept-1'}),done,'retry never settles twice');
 const b=createSampleBoardingAdapter({realmId:'viewer-b',now:()=>now,outcome:()=>true});assert.equal((await b.read('forest')).demoEggs,0);assert.equal((await b.read('forest')).status,'idle');
});
test('failure cancellation expiry and explicit demo fast-forward never mint a formal asset',async()=>{
 let now=T;const a=createSampleBoardingAdapter({realmId:'viewer-a',now:()=>now,outcome:()=>false}),c=sampleBoardingCandidates('forest','viewer-a');
 const invite=()=>a.invite({sampleId:'forest',parentId:c.visitor.id,requestId:`invite-${now}`});await invite();now+=BOARDING_TERMS.inviteMs;assert.equal((await a.read('forest')).status,'expired');
 await invite();assert.equal((await a.cancel({sampleId:'forest',requestId:'cancel'})).status,'canceled');now++;
 await invite();await a.confirm({sampleId:'forest',partnerId:c.hosts[0].id,requestId:'confirm'});const fast=await a.fastForwardDemo('forest');assert.equal(fast.status,'failed');assert.equal(fast.demoEggs,0);assert.equal(fast.demoCoins,0);assert.equal(now,T+BOARDING_TERMS.inviteMs+1,'demo fast forward never changes real clock');
});
test('unknown hosts foreign parents mismatched partners and reused request payload fail closed',async()=>{
 const a=createSampleBoardingAdapter({realmId:'viewer-a',now:()=>T}),c=sampleBoardingCandidates('forest','viewer-a');
 await assert.rejects(a.read('uid_real'),/示例/);await assert.rejects(a.invite({sampleId:'forest',parentId:'real-animal',requestId:'bad'}),/演示伙伴/);
 await a.invite({sampleId:'forest',parentId:c.visitor.id,requestId:'one'});await assert.rejects(a.confirm({sampleId:'forest',partnerId:'real-animal',requestId:'bad2'}),/示例伙伴/);
 await assert.rejects(a.cancel({sampleId:'forest',requestId:'one'}),/请求/);assert.equal((await a.read('forest')).status,'pending');
 const b=createSampleBoardingAdapter({realmId:'viewer-b',now:()=>T});await assert.rejects(b.invite({sampleId:'forest',parentId:c.visitor.id,requestId:'cross-user'}),/演示伙伴/);
});
