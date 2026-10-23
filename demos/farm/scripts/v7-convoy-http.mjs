import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.FARM_TEST_URL;
if(!base||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)||new URL(base).port==='5190')throw new Error('Set FARM_TEST_URL to an isolated test server; live 5190 is prohibited');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function client(){let cookie='',sequence=0;return {
 async request(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{origin:base,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(response.status,200);const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];const reply=await response.json();if(reply.snapshot)sequence=Math.max(sequence,reply.snapshot.sequence);return reply;},
 command(type,extras={}){return this.request('/api/convoy',{id:randomUUID(),type,...(!['create','join','pulse','pause'].includes(type)?{sequence:++sequence}:{}),...extras});},
 get(room){return this.request(`/api/convoy?room=${room}`);},cookie:()=>cookie
};}
const carrier=client(),guard=client(),third=client();
const creation={id:randomUUID(),type:'create',guardian:'dog',route:'short'};
const made=await carrier.request('/api/convoy',creation);assert.equal(made.accepted,true);const roomId=made.snapshot.room.id;
const duplicate=await carrier.request('/api/convoy',creation);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.snapshot.room.id,roomId);
const joined=await guard.command('join',{roomId});assert.equal(joined.accepted,true);assert.equal(joined.snapshot.selfRole,'guard');assert.notEqual(carrier.cookie(),guard.cookie());
assert.equal((await third.command('join',{roomId})).accepted,false);assert.equal((await third.get(roomId)).snapshot,null);
assert.equal((await carrier.command('ability',{roomId})).accepted,false);assert.equal((await guard.command('gate',{roomId,open:true})).accepted,false);
assert.equal((await carrier.command('move',{roomId,x:14,z:4})).accepted,false);
await carrier.command('pause',{roomId});const paused=await guard.command('pause',{roomId});const before=paused.snapshot.room.elapsed;await sleep(1200);
const resumed=await carrier.get(roomId);assert.equal(resumed.snapshot.room.elapsed,before);await guard.get(roomId);
await carrier.command('move',{roomId,x:7,z:4});await guard.command('move',{roomId,x:7,z:4});
let snapshot=joined.snapshot,opened=false,skill=false,waitedAtGate=false;const deadline=Date.now()+60_000;
while(Date.now()<deadline){
 const a=await carrier.get(roomId);const b=await guard.get(roomId);snapshot=b.snapshot;const room=snapshot.room;
 assert.equal(a.snapshot.selfRole,'carrier');assert.equal(b.snapshot.selfRole,'guard');assert.equal(room.members.filter(m=>m.online).length,2);
 if(room.phase!=='active')break;
 if(!opened&&Math.hypot(room.guard.x-8,room.guard.z-4)<=1.5){
  const openRequest={id:randomUUID(),type:'gate',roomId,sequence:snapshot.sequence+1,open:true};const gate=await guard.request('/api/convoy',openRequest);assert.equal(gate.accepted,true);assert.equal((await guard.request('/api/convoy',openRequest)).duplicate,true);opened=true;
  assert.equal((await carrier.command('move',{roomId,x:14,z:4})).accepted,true);
 }
 if(!room.gates.short){assert.ok(room.cart.x<=7);waitedAtGate=true;}
 if(room.gates.short&&room.guard.path.length===0)await guard.command('move',{roomId,x:Math.min(15,Math.round(room.cart.x+1)),z:Math.round(room.cart.z)});
 if(room.elapsed>=6&&Math.hypot(room.guard.x-room.wolf.x,room.guard.z-room.wolf.z)<=4&&room.elapsed>=room.cooldownUntil){const effect=await guard.command('ability',{roomId});if(effect.accepted){skill=true;assert.equal((await guard.command('ability',{roomId})).accepted,false);}}
 await sleep(200);
}
assert.equal(opened,true);assert.equal(waitedAtGate,true);assert.equal(skill,true);assert.equal(snapshot.room.phase,'success');assert.equal(snapshot.room.result.reward,0);assert.equal(snapshot.room.result.assetTransfer,false);
const terminal=JSON.stringify(snapshot.room.result);await carrier.command('pause',{roomId});await guard.command('pause',{roomId});await sleep(300);
const reconnect=await guard.command('join',{roomId});assert.equal(reconnect.snapshot.selfRole,'guard');assert.equal(JSON.stringify(reconnect.snapshot.room.result),terminal);
console.log(JSON.stringify({ok:true,roomId,distinctCookies:true,realGate:true,guardianSkill:true,pausedOffline:true,reconnect:true,result:reconnect.snapshot.room.result},null,2));
