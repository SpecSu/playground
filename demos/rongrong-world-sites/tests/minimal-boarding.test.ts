import test from 'node:test';
import assert from 'node:assert/strict';
import {boardingFixture,ALICE,BOB,EVE,NOW} from './helpers/boarding-fixture.ts';

test('specified real friend accepts a same-species adult pair without transferring ownership',async()=>{
 const {farm,invite,accept}=await boardingFixture();const beforeA=await farm(),beforeB=await farm(BOB);const invited=await invite();assert.equal(invited.accepted,true,invited.message);assert.equal(invited.boarding!.status,'pending');assert.equal((await farm()).activeBoardingId,invited.boarding!.id);assert.equal((await farm(BOB)).activeBoardingId??null,null,'inbound invitation is not consent to lock');const accepted=await accept(invited.boarding!.id,invited.boarding!.revision);assert.equal(accepted.accepted,true,accepted.message);assert.equal(accepted.boarding!.status,'active');assert.deepEqual((await farm()).state.animals.map(a=>a.id),beforeA.state.animals.map(a=>a.id));assert.deepEqual((await farm(BOB)).state.animals.map(a=>a.id),beforeB.state.animals.map(a=>a.id));assert.equal((await farm()).state.animals[0].lastBreedAttemptDay,(await farm(BOB)).state.animals[0].lastBreedAttemptDay);assert.equal((await farm()).state.eggs.length,0);
});

test('invitation projection reveals no private farm or pending random result to either participant or outsiders',async()=>{
 const {authority,invite,accept}=await boardingFixture();const invited=await invite();await accept(invited.boarding!.id,1);const a=await authority.boardingList(ALICE),b=await authority.boardingList(BOB),e=await authority.boardingList(EVE);assert.equal(a.invitations.length,1);assert.equal(b.invitations.length,1);assert.deepEqual(e.invitations,[]);assert.deepEqual(a.invitations,b.invitations);for(const bad of ['state','coins','assetProvenance','pendingEgg','success','player','subject','energy','bond'])assert.equal(Object.hasOwn(a.invitations[0],bad),false,bad);assert.deepEqual(Object.keys(a.invitations[0].parents[0]).sort(),['id','name','rarity','sex','species']);
});

test('server due settlement releases at most one egg and helper reward exactly once, including duplicate acceptance',async()=>{
 const {repo,authority,farm,invite,accept,setNow}=await boardingFixture();
 // Existing deterministic model sequence 0 at this createdAt is successful.
 const inv=await invite();const req={requestId:'accept-once',expectedRevision:(await farm(BOB)).revision,command:{type:'accept',invitationId:inv.boarding!.id,invitationRevision:1,animalId:(await farm(BOB)).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}};
 const accepted=await authority.boarding(BOB,req);assert.equal(accepted.accepted,true);assert.deepEqual(await authority.boarding(BOB,req),accepted);assert.equal((await farm(BOB)).state.coins,100);setNow(NOW+300_000);await Promise.all([authority.get(ALICE),authority.get(BOB),authority.boardingList(ALICE)]);const a=await farm(),b=await farm(BOB),terminal=(await authority.boardingList(ALICE)).invitations[0];assert.ok(['completed','failed'].includes(terminal.status));assert.equal(a.activeBoardingId,null);assert.equal(b.activeBoardingId,null);assert.equal(a.state.eggs.length,terminal.status==='completed'?1:0);assert.equal(b.state.coins,terminal.status==='completed'?105:100);assert.ok(a.state.eggs.every(e=>e.location==='bag'));assert.equal(a.state.animals.length,1);assert.equal(b.state.animals.length,1);assert.deepEqual(await authority.boarding(BOB,req),accepted);assert.deepEqual(await farm(),a);assert.deepEqual(await farm(BOB),b);assert.ok(repo.rows.size>0);void accept;
});

test('pending expires without consuming attempts; active cancellation consumes attempts but never awards rewards',async()=>{
 const {authority,farm,invite,accept,send,setNow}=await boardingFixture();let inv=await invite();setNow(NOW+600_000);assert.equal((await farm()).activeBoardingId,null);assert.equal((await authority.boardingList(BOB)).invitations[0].status,'expired');assert.equal((await farm()).state.animals[0].lastBreedAttemptDay,undefined);inv=await invite();const active=await accept(inv.boarding!.id,1);assert.equal(active.accepted,true);const result=await send({type:'cancel',invitationId:inv.boarding!.id,invitationRevision:2},BOB);assert.equal(result.accepted,true);assert.equal(result.boarding!.status,'canceled');setNow(NOW+1_000_000);assert.equal((await farm()).activeBoardingId,null);assert.equal((await farm(BOB)).activeBoardingId,null);assert.equal((await farm()).state.eggs.length,0);assert.equal((await farm(BOB)).state.coins,100);assert.ok((await farm()).state.animals[0].lastBreedAttemptDay);assert.equal((await invite()).accepted,false);
});

test('locks prevent ordinary carry sale exchange and pairing while allowing unrelated movement',async()=>{
 const {authority,farm,invite,repo}=await boardingFixture();const inv=await invite(),animalId=(await farm()).state.animals[0].id;
 for(const command of [{type:'pickup',animalId},{type:'breed',animalIds:[animalId,'other']}]){const r=await authority.command(ALICE,{requestId:JSON.stringify(command).replace(/[^a-z0-9]/gi,'').slice(0,90),expectedRevision:(await farm()).revision,command});assert.equal(r.code,'animal-locked');}
 const exchange=await authority.wishing(ALICE,{requestId:'exchange',expectedRevision:(await farm()).revision,command:{type:'depositAsset',asset:{kind:'animal',id:animalId},accepts:['egg'],consent:'listed-kinds'}});assert.equal(exchange.code,'animal-locked');
 await repo.change(ALICE,f=>{f.state.carriedAnimalId=animalId;f.state.player={x:1,z:1};});assert.equal((await authority.command(ALICE,{requestId:'sale',expectedRevision:(await farm()).revision,command:{type:'sellAnimal'}})).code,'animal-locked');assert.equal((await farm()).state.coins,100);
 assert.equal((await authority.command(ALICE,{requestId:'move',expectedRevision:(await farm()).revision,command:{type:'stopMove'}})).accepted,true);assert.equal((await farm()).activeBoardingId,inv.boarding!.id);
});

test('consent target ownership species maturity sex and attempts are server validated',async()=>{
 const f=await boardingFixture(),{send,invite,accept,farm,repo}=f;const id=(await farm()).state.animals[0].id;
 for(const targetUid of ['name:twx',ALICE,`uid_${'c'.repeat(64)}`])assert.equal((await send({type:'invite',targetUid,animalId:id,consent:'egg-to-initiator-helper-5-coins'})).accepted,false);
 assert.equal((await send({type:'invite',targetUid:BOB,animalId:(await farm(BOB)).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'})).code,'foreign-animal');
 assert.equal((await send({type:'invite',targetUid:BOB,animalId:id,consent:'other'})).code,'invalid-request');const inv=await invite();assert.equal((await send({type:'accept',invitationId:inv.boarding!.id,invitationRevision:1,animalId:(await farm(EVE)).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'},EVE)).code,'boarding-unavailable');
 for(const change of [(f:Awaited<ReturnType<typeof farm>>)=>{f.state.animals[0].sex='female';},(f:Awaited<ReturnType<typeof farm>>)=>{f.state.animals[0].sex='male';f.state.animals[0].species='pig';},(f:Awaited<ReturnType<typeof farm>>)=>{f.state.animals[0].species='cow';f.state.animals[0].bornAt=NOW;}]){await repo.change(BOB,change);assert.equal((await accept(inv.boarding!.id,1)).accepted,false);}
});

test('cancel versus due settlement and concurrent duplicate acceptance have one atomic outcome',async()=>{
 const {authority,invite,farm,setNow}=await boardingFixture();const inv=await invite();const req={expectedRevision:(await farm(BOB)).revision,command:{type:'accept',invitationId:inv.boarding!.id,invitationRevision:1,animalId:(await farm(BOB)).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}};const accepted=await Promise.all(['one','two'].map(requestId=>authority.boarding(BOB,{...req,requestId})));assert.equal(accepted.filter(r=>r.accepted).length,1);const revision=(await farm()).revision;setNow(NOW+300_000);await Promise.all([authority.boarding(ALICE,{requestId:'cancel-at-due',expectedRevision:revision,command:{type:'cancel',invitationId:inv.boarding!.id,invitationRevision:2}}),authority.get(BOB)]);assert.equal((await farm()).activeBoardingId,null);assert.equal((await farm(BOB)).activeBoardingId,null);assert.ok((await farm()).state.eggs.length<=1);assert.ok((await farm(BOB)).state.coins<=105);
});

test('transaction errors roll back invitation and every canonical reservation',async()=>{
 const {repo,invite,farm}=await boardingFixture();const a=await farm(),b=await farm(BOB);repo.failWrites=true;await assert.rejects(invite(),/Injected failure/);repo.failWrites=false;assert.deepEqual(await farm(),a);assert.deepEqual(await farm(BOB),b);
});

test('gold parents use ordinary independent rarity rather than gold inheritance',async()=>{
 const {repo,invite,accept,setNow,farm}=await boardingFixture();await repo.change(ALICE,f=>{f.state.sequence=3;});const inv=await invite();assert.equal((await accept(inv.boarding!.id,1)).accepted,true);setNow(NOW+300_000);const a=await farm();assert.equal(a.state.eggs.length,1);assert.notEqual(a.state.eggs[0].rarity,'gold');assert.equal(a.state.eggs[0].parents!.length,2);assert.equal(a.state.animals[0].rarity,'gold');assert.equal((await farm(BOB)).state.animals[0].rarity,'gold');
});

test('known failed draw unlocks both animals without an egg or helper coins',async()=>{
 const {invite,accept,setNow,farm,authority}=await boardingFixture();const inv=await invite();await accept(inv.boarding!.id,1);setNow(NOW+300_000);assert.equal((await authority.boardingList(BOB)).invitations[0].status,'failed');assert.equal((await farm()).state.eggs.length,0);assert.equal((await farm(BOB)).state.coins,100);assert.equal((await farm()).activeBoardingId,null);assert.equal((await farm(BOB)).activeBoardingId,null);
});

test('accepted success reserves exactly one capacity slot against purchases',async()=>{
 const {repo,invite,accept,farm,authority}=await boardingFixture();await repo.change(ALICE,f=>{f.state.sequence=3;});const inv=await invite();await accept(inv.boarding!.id,1);await repo.change(ALICE,f=>{f.state.player={x:1,z:1};f.state.eggs=Array.from({length:14},(_,i)=>({id:`${f.farmId}:extra_${i}`,source:'shop',species:'cow',sex:'male',size:'normal',location:'bag',boughtAt:NOW}));});const result=await authority.command(ALICE,{requestId:'capacity-purchase',expectedRevision:(await farm()).revision,command:{type:'buyEgg'}});assert.equal(result.code,'capacity-full');assert.equal((await farm()).state.coins,100);
});

test('midnight keeps the accepted day quota and allows only a new next-day attempt after settlement',async()=>{
 const {repo,invite,accept,setNow,farm,authority}=await boardingFixture();const midnight=Date.parse('2026-10-26T16:00:00Z');setNow(midnight-60_000);await repo.change(ALICE,f=>{f.state.sequence=3;});const inv=await invite();await accept(inv.boarding!.id,1);const acceptedDay=(await farm()).state.animals[0].lastBreedAttemptDay;setNow(midnight+240_000);await authority.get(BOB);assert.equal((await farm()).state.animals[0].lastBreedAttemptDay,acceptedDay);assert.equal((await farm()).activeBoardingId,null);assert.equal((await invite()).accepted,true);
});

test('counterparty clock regression cannot cancel or mint; original reservation remains intact',async()=>{
 const {repo,invite,accept,send,farm}=await boardingFixture();const inv=await invite();await accept(inv.boarding!.id,1);await repo.change(BOB,f=>{f.state.updatedAt=NOW+1000;});const result=await send({type:'cancel',invitationId:inv.boarding!.id,invitationRevision:2});assert.equal(result.code,'clock-regressed');assert.equal((await farm()).activeBoardingId,inv.boarding!.id);assert.equal((await farm(BOB)).activeBoardingId,inv.boarding!.id);
});

test('a full expired inbound list is lazily released without requiring the recipient to log in',async()=>{
 const {repo,invite,setNow,send,farm}=await boardingFixture();const inv=await invite();const row=repo.rows.get(`boardings:${inv.boarding!.id}`);await repo.change(BOB,f=>{f.boardingInbox=Array.from({length:20},(_,i)=>`expired_${i}`);});for(let i=0;i<20;i++)repo.rows.set(`boardings:expired_${i}`,{...(row as object),id:`expired_${i}`,status:'pending',expiresAt:NOW-1});setNow(NOW+600_000);await farm();const result=await send({type:'invite',targetUid:BOB,animalId:(await farm()).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'});assert.equal(result.accepted,true,result.message);
});

test('canceling a known successful draw does not restore the successful-day quota or allow same-parent rerolls',async()=>{
 const {repo,invite,accept,send,farm}=await boardingFixture();await repo.change(ALICE,f=>{f.state.sequence=3;});const inv=await invite();await accept(inv.boarding!.id,1);const day=(await farm()).state.breedingDay;assert.ok(day);await send({type:'cancel',invitationId:inv.boarding!.id,invitationRevision:2});assert.equal((await farm()).state.breedingDay,day);assert.equal((await farm()).state.eggs.length,0);assert.equal((await invite()).accepted,false);assert.equal((await farm(BOB)).state.coins,100);
});

test('client-supplied actor reward outcome and time fields cannot enter an invitation',async()=>{
 const {authority,farm}=await boardingFixture();const base={requestId:'forged',expectedRevision:(await farm()).revision,command:{type:'invite',targetUid:BOB,animalId:(await farm()).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}};for(const [key,value] of [['actor',BOB],['helperCoins',5000],['pendingEgg',{}],['readyAt',NOW]] as const){const result=await authority.boarding(ALICE,{...base,requestId:`forged_${key}`,command:{...base.command,[key]:value}});assert.equal(result.code,'invalid-request');}assert.equal((await farm()).activeBoardingId,undefined);
});

test('a crossing-midnight ordinary pairing cannot consume the reserved boarding egg slot',async()=>{
 const {repo,invite,accept,setNow,farm,authority}=await boardingFixture();const midnight=Date.parse('2026-10-26T16:00:00Z');setNow(midnight-60_000);await repo.change(ALICE,f=>{f.state.sequence=3;});const inv=await invite();await accept(inv.boarding!.id,1);setNow(midnight+1_000);await repo.change(ALICE,f=>{const original=f.state.animals[0];f.state.animals.push({...structuredClone(original),id:`${f.farmId}:extra-male`,sex:'male',lastBreedAttemptDay:undefined},{...structuredClone(original),id:`${f.farmId}:extra-female`,sex:'female',lastBreedAttemptDay:undefined});f.state.eggs=Array.from({length:12},(_,i)=>({id:`${f.farmId}:extra_${i}`,source:'shop',species:'cow',sex:'male',size:'normal',location:'bag',boughtAt:NOW}));});const state=await farm();const result=await authority.command(ALICE,{requestId:'midnight-capacity-breed',expectedRevision:state.revision,command:{type:'breed',animalIds:state.state.animals.slice(1).map(a=>a.id)}});assert.equal(result.code,'capacity-full');
});

test('inbox contamination cannot reveal or settle an invitation for a nonparticipant',async()=>{
 const {repo,invite,authority,setNow}=await boardingFixture();const inv=await invite();await repo.change(EVE,f=>{f.boardingInbox=[inv.boarding!.id];});setNow(NOW+600_000);assert.deepEqual((await authority.boardingList(EVE)).invitations,[]);assert.equal((repo.rows.get(`boardings:${inv.boarding!.id}`) as {status:string}).status,'pending');
});
test('outer execution validates request IDs before storage even for direct boarding calls',async()=>{
 const {repo,authority,farm}=await boardingFixture(),a=await farm(),before=structuredClone(repo.rows);for(const requestId of [undefined,'','has space','x'.repeat(101),123]){const result=await authority.boarding(ALICE,{requestId,expectedRevision:a.revision,command:{type:'invite',targetUid:BOB,animalId:a.state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}});assert.equal(result.code,'invalid-request');}assert.deepEqual(repo.rows,before);
});
test('ordinary egg hatch is net-zero occupancy and preserves space for the reserved boarding egg',async()=>{
 const {repo,invite,accept,authority,farm,setNow}=await boardingFixture();await repo.change(ALICE,f=>{f.state.sequence=3;});const inv=await invite();await accept(inv.boarding!.id,1);await repo.change(ALICE,f=>{f.state.player={x:3,z:2};f.state.eggs=Array.from({length:14},(_,i)=>({id:`${f.farmId}:extra_${i}`,source:'shop',species:'cow',sex:'male',size:'normal',location:'bag',boughtAt:NOW}));Object.assign(f.state.eggs[0],{location:'ground',position:{x:3,z:2},placedAt:NOW-20_000,readyAt:NOW,incubation:{requiredMs:15000,elapsedMs:15000,checkedAt:NOW}});});const before=await farm(),reply=await authority.command(ALICE,{requestId:'net-zero-hatch',expectedRevision:before.revision,command:{type:'hatch',eggId:before.state.eggs[0].id}});assert.equal(reply.accepted,true,reply.message);assert.equal(reply.farm!.state.animals.length+reply.farm!.state.eggs.length,15);setNow(NOW+300_000);const after=await farm();assert.equal(after.state.animals.length+after.state.eggs.length,16);assert.equal((await farm(BOB)).state.coins,105);
});
test('a reserved ordinary slot does not block a legacy bag creature hatch that adds no world animal',async()=>{
 const {repo,invite,accept,authority,farm}=await boardingFixture();const inv=await invite();await accept(inv.boarding!.id,1);await repo.change(ALICE,f=>{f.state.eggs=Array.from({length:14},(_,i)=>({id:`${f.farmId}:extra_${i}`,source:'shop',species:'cow',sex:'male',size:'normal',location:'bag',boughtAt:NOW}));f.creative={version:1,jobs:[],assets:[{id:'legacy-egg',kind:'custom-egg',templateId:'poop-pal',name:'旧蛋',prompt:'旧愿望',createdAt:NOW-10000,jobId:'legacy',origin:'mock',location:'bag'}]};});const result=await authority.creative(ALICE,{requestId:'legacy-hatch-with-reservation',expectedRevision:(await farm()).revision,command:{type:'hatch',assetId:'legacy-egg'}});assert.equal(result.accepted,true,result.message);assert.equal(result.farm!.state.animals.length,1);assert.equal(result.farm!.creative!.assets[0].kind,'custom-creature');const place=await authority.creative(ALICE,{requestId:'place-with-reservation',expectedRevision:(await farm()).revision,command:{type:'place',assetId:'legacy-egg',at:{x:0,z:1}}});assert.equal(place.code,'capacity-full');
});

test('a reserved animal slot still permits a prop placement that cannot add a world animal',async()=>{
 const {repo,invite,accept,authority,farm}=await boardingFixture();const inv=await invite();await accept(inv.boarding!.id,1);await repo.change(ALICE,f=>{f.state.eggs=Array.from({length:14},(_,i)=>({id:`${f.farmId}:extra_${i}`,source:'shop',species:'cow',sex:'male',size:'normal',location:'bag',boughtAt:NOW}));f.creative={version:1,jobs:[],assets:[{id:'tree',kind:'prop',templateId:'wish-tree',name:'树',prompt:'样例树',createdAt:NOW-10000,jobId:'tree-job',origin:'mock',location:'bag'}]};});const result=await authority.creative(ALICE,{requestId:'prop-with-reservation',expectedRevision:(await farm()).revision,command:{type:'place',assetId:'tree',at:{x:3,z:0}}});assert.equal(result.accepted,true,result.message);assert.equal(result.farm!.state.animals.length,1);
});
