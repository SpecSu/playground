/** Real HTTP and SQLite, fresh cookie, isolated server only. No production save writes. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.FARM_URL;
if(!base||new URL(base).hostname!=='127.0.0.1'||new URL(base).port==='5190')throw new Error('Use isolated local test server/database');
let cookie='',snapshot;
async function read(){const r=await fetch(base+'/api/estate',{headers:cookie?{Cookie:cookie}:{}});assert.equal(r.status,200);if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return snapshot=await r.json();}
async function command(type,extra={},id=randomUUID()){
 const r=await fetch(base+'/api/estate',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({id,type,session:snapshot.profile.session,workshopVersion:snapshot.profile.workshop.version,worldVersion:snapshot.profile.layout.version,...extra})});
 assert.equal(r.status,200);const reply=await r.json();snapshot=reply.snapshot;return reply;
}
await read();await command('enter');await command('skipOpening');await command('guardian',{guardian:'dog'});await command('skipOpening');
const player=snapshot.playerId,materials=snapshot.profile.materials,bonds=snapshot.profile.animals.map(a=>[a.id,a.life.bond]);
const pattern={motif:'leaf',color:'#8ac676',scale:1.2,rotation:20,crop:{x:.1,y:.1,width:.8,height:.8}};
assert.equal((await command('workshop-draft',{recipe:'cape',pattern,animalId:'pipi'})).accepted,true);
const craftId=randomUUID();assert.equal((await command('workshop-craft',{},craftId)).accepted,true);
const item=snapshot.profile.workshop.items.at(-1);assert.equal(item.gift,true);assert.equal(item.paid.materials,0);assert.deepEqual(item.paid.wool,[]);assert.equal(snapshot.profile.materials,materials);
const replay=await command('workshop-craft',{},craftId);assert.equal(replay.duplicate,true);assert.equal(snapshot.profile.workshop.items.length,1);
assert.equal((await command('workshop-apply',{itemId:item.id})).accepted,true);assert.equal(snapshot.profile.workshop.equipment.cape,item.id);
await command('avatar',{avatar:'banana-cat'});await read();assert.equal(snapshot.playerId,player);assert.equal(snapshot.profile.workshop.equipment.cape,item.id);assert.deepEqual(snapshot.profile.animals.map(a=>[a.id,a.life.bond]),bonds);
const before=snapshot.profile.workshop.version;assert.equal((await command('workshop-update-pattern',{itemId:item.id,pattern:{...pattern,color:'#cc9966'}})).accepted,true);
const stale=await command('workshop-unequip',{slot:'cape',workshopVersion:before});assert.equal(stale.accepted,false);assert.equal(snapshot.profile.workshop.equipment.cape,item.id);
assert.equal((await command('workshop-revert',{itemId:item.id,assetVersion:1})).accepted,true);assert.equal(snapshot.profile.workshop.items[0].assetVersion,3);assert.equal(snapshot.profile.workshop.assets.at(-1).pattern.color,pattern.color);
const generateId=randomUUID(),jobCount=snapshot.profile.workshop.jobs.length;
assert.equal((await command('workshop-generate',{prompt:'一片叶子'},generateId)).accepted,false);assert.equal(snapshot.profile.workshop.jobs.at(-1).status,'unavailable');assert.equal((await command('workshop-generate',{prompt:'一片叶子'},generateId)).duplicate,true);assert.equal(snapshot.profile.workshop.jobs.length,jobCount+1);assert.equal(snapshot.profile.materials,materials);
const destroyId=randomUUID();assert.equal((await command('workshop-dismantle',{itemId:item.id},destroyId)).accepted,true);assert.equal((await command('workshop-dismantle',{itemId:item.id},destroyId)).duplicate,true);assert.equal(snapshot.profile.materials,materials);assert.equal(snapshot.profile.workshop.equipment.cape,undefined);
await read();assert.equal(snapshot.profile.workshop.items[0].destroyed,true);assert.equal(snapshot.profile.workshop.trialUsed,true);
assert.equal((await command('workshop-draft',{recipe:'banner',pattern})).accepted,true);assert.equal((await command('workshop-craft')).accepted,false,'no second free item or unearned wool');
assert.equal(snapshot.profile.production.slots.length,3);assert.equal(snapshot.profile.production.profile,'home');
console.log(JSON.stringify({http:true,realSqlite:true,freshTestIdentity:true,firstCraftGift:true,craftRetrySameId:true,equipPersistedAcrossAvatarAndReload:true,relationshipIdentityPreserved:true,staleVersionRejected:true,patternRevertNewVersion:true,generationUnavailableNoCharge:true,generationRetrySameId:true,giftDismantleNoProfit:true,trialNotReissued:true,defaultProductionSlots:3,webgl:'not verified'}));
