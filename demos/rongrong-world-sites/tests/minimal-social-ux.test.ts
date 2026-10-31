import test from 'node:test';import assert from 'node:assert/strict';
import {boardingAnimalIssue,boardingFarmIssue,boardingTargetIssue,encodeFriendCode,boardingCandidates} from '../src/minimal/boarding-ui.ts';
import {boardingFixture,ALICE,BOB,NOW} from './helpers/boarding-fixture.ts';
import {dayKey,MINIMAL_RULES} from '../src/minimal/model.ts';
test('boarding presentation supplies truthful concise reasons without admitting ineligible animals',async()=>{
 const f=await boardingFixture(),farm=await f.farm(),adult=farm.state.animals[0];assert.equal(boardingAnimalIssue(farm,adult,NOW),null);
 const young={...adult,id:'young',bornAt:NOW};assert.match(boardingAnimalIssue(farm,young,NOW)!,/未成年/);
 const used={...adult,id:'used',lastBreedAttemptDay:dayKey(NOW)};assert.match(boardingAnimalIssue(farm,used,NOW)!,/今天已尝试/);
 const held={...adult,id:'held',activity:'carried' as const};assert.match(boardingAnimalIssue(farm,held,NOW)!,/先放下/);
 farm.state.animals.push(young,used,held);assert.deepEqual(boardingCandidates(farm,NOW).map(a=>a.id),[adult.id]);
 assert.match(boardingAnimalIssue(farm,adult,NOW,{...adult,sex:adult.sex})!,/异性/);
});
test('self codes farm locks daily success and capacity have explicit presentation blockers',async()=>{
 assert.match(boardingTargetIssue(ALICE,encodeFriendCode(ALICE))!,/自己的好友码/);assert.match(boardingTargetIssue(ALICE,'' )!,/好友码/);assert.match(boardingTargetIssue(ALICE,'twx')!,/完整好友码/);assert.equal(boardingTargetIssue(ALICE,encodeFriendCode(BOB)),null);
 const f=await boardingFixture(),farm=await f.farm();assert.equal(boardingFarmIssue(farm,NOW),null);farm.activeBoardingId='active';assert.match(boardingFarmIssue(farm,NOW)!,/寄养/);farm.activeBoardingId=null;farm.activeOfferId='offer';assert.match(boardingFarmIssue(farm,NOW)!,/许愿池/);farm.activeOfferId=null;
 farm.state.breedingDay=dayKey(NOW);assert.match(boardingFarmIssue(farm,NOW)!,/今日.*产蛋/);assert.equal(boardingFarmIssue(farm,NOW,false),null,'recipient farm success quota is not the initiator quota');farm.state.breedingDay=null;farm.state.animals=Array.from({length:MINIMAL_RULES.maxAnimals},(_,i)=>({...farm.state.animals[0],id:`full-${i}`}));assert.match(boardingFarmIssue(farm,NOW)!,/空间/);
});
