import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const base=process.env.FARM_URL||'http://127.0.0.1:5190';
const index=await fetch(base);assert.equal(index.status,200);const html=await index.text();
for(const path of [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(m=>m[1]))assert.equal((await fetch(base+path)).status,200,path);
const first=await fetch(base+'/api/farm');assert.equal(first.status,200);const cookie=first.headers.get('set-cookie').split(';')[0];const initial=await first.json();
const headers={'Content-Type':'application/json',Cookie:cookie};
async function post(type,extra={},id=randomUUID()){const r=await fetch(base+'/api/farm',{method:'POST',headers,body:JSON.stringify({id,type,...extra})});assert.equal(r.status,200);return r.json();}
const id=randomUUID();let r=await post('act',{action:'dance',target:'all'},id);assert.equal(r.accepted,true);assert.equal(r.event.reactions.length,3);
let duplicate=await post('act',{action:'dance',target:'all'},id);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.snapshot.animals[0].bond,3);
assert.equal((await post('act',{action:'bounce',target:'all'})).accepted,false);
r=await post('avatar',{avatar:'banana-cat'});assert.equal(r.snapshot.playerId,initial.playerId);assert.equal(r.snapshot.animals[0].bond,3);
console.log('HTTP: page/assets, device identity, avatar swap and rapid/duplicate commands passed');
for(let i=0;i<2;i++){await delay(12200);r=await post('act',{action:'dance',target:'all'});assert.equal(r.accepted,true);}
assert.equal(r.snapshot.animals[0].habits.dance.stage,'invite');
r=await post('visit');assert.equal(r.event.reactions.length,3);assert.ok(r.event.reactions.every(a=>a.source==='memory'));
await delay(6200);r=await post('rhythm');assert.equal(r.accepted,true);assert.equal(r.snapshot.animals[0].growthEligible,true);
r=await post('appearance',{target:'pipi',appearance:'starlit'});assert.equal(r.snapshot.animals[0].appearance,'starlit');
r=await post('appearance',{target:'pipi',appearance:'plain'});assert.equal(r.snapshot.animals[0].appearance,'plain');
r=await post('nextVisit');assert.equal(r.snapshot.demoMode,true);assert.equal(r.snapshot.woolReady,12);
const claimId=randomUUID();r=await post('claim',{},claimId);assert.equal(r.snapshot.wool,12);assert.equal((await post('claim',{},claimId)).snapshot.wool,12);assert.equal((await post('claim')).snapshot.wool,12);
r=await post('buy');assert.equal(r.snapshot.stage,true);assert.equal(r.snapshot.wool,4);assert.equal((await post('buy')).snapshot.wool,4);
const read=await fetch(base+'/api/farm',{headers:{Cookie:cookie}});const saved=await read.json();assert.equal(saved.avatar,'banana-cat');assert.equal(saved.animals[0].habits.dance.stage,'invite');assert.equal(saved.stage,true);
assert.equal((await fetch(base+'/api/farm',{method:'POST',headers:{...headers,Origin:'https://unrelated.invalid'},body:'{}'})).status,403);
for(const kind of ['milk-frog','miaocuijiao','banana-cat'])assert.equal((await fetch(base+`/avatars/cast-v1/${kind}.glb`)).status,200);
console.log(JSON.stringify({page:200,api:200,realSpacedLearning:true,savedGreeting:true,appearanceRoundTrip:true,offlineCap:12,woolAfterRepeatedPurchase:4,assets:3,originCheck:403}));
