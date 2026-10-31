import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCanonicalState} from '../src/minimal/canonical-timeline.ts';
import {boardingFixture,ALICE,BOB,NOW} from './helpers/boarding-fixture.ts';

for(const terminal of ['completed','failed','canceled-active','canceled-pending','expired'] as const)test(`boarding ${terminal} seals both canonical clocks under the old locks before release`,async()=>{
 const f=await boardingFixture();for(const uid of [ALICE,BOB])await f.repo.change(uid,farm=>{farm.state.animals[0].activityUntil=NOW;farm.state.animals[0].path=[{x:1,z:2}];farm.state.animals[0].target={x:1,z:2};farm.state.animals[0].targetActivity='rest';});
 await f.repo.change(ALICE,farm=>{farm.state.sequence=terminal==='completed'?3:0;});const inv=await f.invite();const accepted=terminal==='completed'||terminal==='failed'||terminal==='canceled-active';if(accepted)await f.accept(inv.boarding!.id,1);
 const beforeA=await f.farm(),beforeB=await f.farm(BOB),at=NOW+(terminal==='expired'?600_000:terminal.startsWith('canceled')?30_000:300_000);f.setNow(at);
 if(terminal.startsWith('canceled'))await f.authority.boarding(BOB,{requestId:'terminal-cancel',expectedRevision:beforeB.revision,command:{type:'cancel',invitationId:inv.boarding!.id,invitationRevision:accepted?2:1}});else await f.authority.get(ALICE);
 const a=await f.farm(),b=await f.farm(BOB);for(const farm of [a,b]){assert.equal(farm.state.updatedAt,at,'released snapshot must not expose its pre-boarding time');assert.equal(farm.state.terrainGrowthAt,at);}
 assert.deepEqual(a.state.animals[0].position,beforeA.state.animals[0].position);if(accepted)assert.deepEqual(b.state.animals[0].position,beforeB.state.animals[0].position);
 assert.deepEqual(projectCanonicalState(a.state,at,null).animals[0].position,a.state.animals[0].position,'display cannot replay the reserved interval as free time');assert.equal(a.boardingAnimalId,null);if(accepted)assert.equal(b.boardingAnimalId,null);
 const original=beforeA.state.animals[0],parent=a.state.animals[0];for(const key of ['id','name','rarity','species','sex','bornAt','energy','bond'] as const)assert.deepEqual(parent[key],original[key]);assert.equal(parent.path,undefined);assert.equal(parent.target,undefined);assert.equal(parent.targetActivity,undefined);assert.equal(parent.drinkAnchor,undefined);assert.equal(parent.activity,'idle');assert.ok(parent.activityUntil>=at);
});

test('terminal settlement retains a simultaneous legacy wishing lock while ending only this boarding',async()=>{
 const f=await boardingFixture();await f.repo.change(ALICE,farm=>{farm.state.sequence=3;});const inv=await f.invite();await f.accept(inv.boarding!.id,1);
 await f.repo.transaction(async tx=>{for(const uid of [ALICE,BOB]){const farm=(await tx.get('farms',uid))!,animal={...structuredClone(farm.state.animals[0]),id:`${farm.farmId}:legacy-wish`,position:{x:1,z:3},activityUntil:NOW,path:[{x:2,z:3}],target:{x:2,z:3}};farm.state.animals.push(animal);farm.assetProvenance[animal.id]='server-created';farm.activeOfferId=`wish-${farm.farmId}`;await tx.put('offers',farm.activeOfferId,{offerId:farm.activeOfferId,ownerAccountId:uid,animalId:animal.id,revision:1,status:'open',createdAt:NOW,expiresAt:NOW+900_000,tradeId:null});await tx.put('farms',uid,farm);}});
 f.setNow(NOW+300_000);await f.authority.get(ALICE);for(const uid of [ALICE,BOB]){const farm=await f.farm(uid);assert.equal(farm.state.updatedAt,NOW+300_000);assert.ok(farm.activeOfferId);assert.deepEqual(farm.state.animals[1].position,{x:1,z:3});assert.deepEqual(farm.state.animals[1].path,[{x:2,z:3}]);assert.equal(farm.boardingAnimalId,null);}
});
