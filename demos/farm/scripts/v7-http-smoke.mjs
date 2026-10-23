/** Isolated server/SQLite transactions; fixture setup is explicit, never a visual test. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {createEstate} from '../src/v5/estate.ts';
const base=process.env.FARM_URL,file=process.env.FARM_DB;
if(!base||new URL(base).port==='5190'||!file||resolve(file)===resolve('.local/farm.sqlite'))throw new Error('Explicit isolated URL/database required');
const id=randomUUID(),now=Date.now(),state=createEstate(id,now),p=state.profiles.home;
p.tutorial='done';p.opening.stage='done';p.guardian='dog';p.threat=null;p.materials=100;p.animals[0].life.bond=37;
p.economy.warehouse.white=9;p.economy.warehouse.blue=3;p.economy.lots=[{id:'test-v7-white',tier:'white',amount:9,animalId:'pipi',version:'v7',source:'paid-production'},{id:'test-v7-blue',tier:'blue',amount:3,animalId:'pipi',version:'v7',source:'paid-production'}];
const db=new DatabaseSync(file);db.prepare('INSERT INTO estates(device,state) VALUES(?,?)').run(id,JSON.stringify(state));db.close();
let snapshot;const headers={'Content-Type':'application/json',Cookie:`farm_device=${id}`};
async function read(){const r=await fetch(base+'/api/estate',{headers});assert.equal(r.status,200);snapshot=await r.json();return snapshot;}
async function send(type,extra={},key=randomUUID()){const r=await fetch(base+'/api/estate',{method:'POST',headers,body:JSON.stringify({id:key,type,session:snapshot.profile.session,...extra})});assert.equal(r.status,200);const result=await r.json();snapshot=result.snapshot;return result;}
await read();assert.equal(snapshot.profile.animals[0].life.bond,37);
const buyId=randomUUID();assert.equal((await send('v7-buy-box',{tier:'white',species:'sheep'},buyId)).accepted,true);const box=snapshot.profile.v7.eggs[0];assert.equal(snapshot.profile.materials,40);
assert.equal((await send('v7-buy-box',{tier:'white',species:'sheep'},buyId)).duplicate,true);assert.equal(snapshot.profile.materials,40);
assert.equal((await send('v7-preview-hatch',{boxId:box.id})).accepted,true);const old=snapshot.profile.v7.preview;
assert.equal((await send('v7-cancel-hatch',{boxId:box.id})).accepted,true);
assert.equal((await send('v7-hatch',{boxId:box.id,expectedVersion:old.version,expectedLayoutVersion:old.layoutVersion,expectedCount:old.expectedCount})).accepted,false);
assert.equal((await send('v7-preview-hatch',{boxId:box.id})).accepted,true);const preview=snapshot.profile.v7.preview,key=randomUUID(),args={boxId:box.id,expectedVersion:preview.version,expectedLayoutVersion:preview.layoutVersion,expectedCount:preview.expectedCount};
assert.equal((await send('v7-hatch',args,key)).accepted,true);assert.equal(snapshot.profile.animals.length,4);assert.equal((await send('v7-hatch',args,key)).duplicate,true);assert.equal(snapshot.profile.animals.length,4);
const saleId=randomUUID();assert.equal((await send('v7-sell-wool',{tier:'white',amount:2,version:'v7'},saleId)).accepted,true);assert.equal(snapshot.profile.materials,44);assert.equal((await send('v7-sell-wool',{tier:'white',amount:2,version:'v7'},saleId)).duplicate,true);
assert.equal((await send('v7-synthesize',{tier:'white',amount:1})).accepted,true);assert.equal(snapshot.profile.economy.warehouse.green,1);assert.equal(snapshot.profile.materials,42);
assert.equal((await send('v7-buy-feed',{packs:1})).accepted,true);assert.equal(snapshot.profile.v7.productionFeed,34);assert.equal(snapshot.profile.materials,32);
const event={id:'fixture-real-care',text:'皮皮吃下第一口奶',at:now};
// Actual encounter uses only the existing server record, not a caller-provided factual event.
const e=await send('encounter-edit',{fantasyLine:'一起守住这片小家',eventId:event.id});assert.equal(e.accepted,false);
assert.equal((await send('encounter-edit',{fantasyLine:'一起守住这片小家'})).accepted,true);
const jobId=randomUUID(),beforeCoins=snapshot.profile.materials,beforeWool=structuredClone(snapshot.profile.economy.warehouse);
assert.equal((await send('encounter-submit',{avatar:'forged'},jobId)).accepted,false);const job=snapshot.profile.encounter.jobs.at(-1);assert.equal(job.status,'unavailable');assert.equal(job.avatar,'human-lx');assert.equal(job.durationSeconds,12);assert.equal(job.videoUrl,undefined);
assert.equal((await send('encounter-submit',{},jobId)).duplicate,true);assert.equal(snapshot.profile.encounter.jobs.length,1);assert.equal(snapshot.profile.materials,beforeCoins);assert.deepEqual(snapshot.profile.economy.warehouse,beforeWool);
await send('avatar',{avatar:'banana-cat'});await read();assert.equal(snapshot.playerId,id);assert.equal(snapshot.profile.animals[0].life.bond,37);assert.equal(snapshot.profile.animals.length,4);
for(const api of ['estate','convoy','harvest']){const r=await fetch(base+`/api/${api}`,{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:'{}'});assert.equal(r.status,403);}
console.log(JSON.stringify({actualHTTP:true,fixture:'isolated home profile with 100 coins and versioned wool',buyPreviewCancelHatch:true,cancelledPreviewRejected:true,duplicatePurchaseHatchSale:true,synthesisAndFeedAccounting:true,encounterUnavailablePersistedWithoutCharge:true,forgedEventRejected:true,avatarAndRelationsPreserved:true,sameOriginAllRoutes:true,webgl:'not verified'}));
