import './room-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
const { acceptFishingSnapshot, FishingTransport }=await import('../lib/fishing-client.ts');
const snap=(revision=1,sequence=0,now=100)=>({revision,serverNow:now,self:{id:'a',lastSequence:sequence}});
test('client rejects stale polls and accepts newer same-revision clock',()=>{assert.equal(acceptFishingSnapshot(snap(3,4),snap(2,3)),false);assert.equal(acceptFishingSnapshot(snap(3,4),snap(3,3,200)),false);assert.equal(acceptFishingSnapshot(snap(3,4),snap(3,4,200)),true);});
test('lost response retry reuses exact request id and sequence',async()=>{const bodies=[];let calls=0;const t=new FishingTransport(async(_url,init)=>{bodies.push(JSON.parse(init.body));if(++calls===1)throw new Error('offline');return Response.json(snap(2,1));});t.receive(snap());await assert.rejects(()=>t.send({type:'cast'}));const result=await t.send({type:'cast'});assert.equal(result.self.lastSequence,1);assert.deepEqual(bodies[0],bodies[1]);assert.equal(t.hasPending,false);});
test('different next intent cannot bypass unresolved command, and server rejection clears it',async()=>{const bodies=[];let calls=0;const t=new FishingTransport(async(_url,init)=>{bodies.push(JSON.parse(init.body));if(++calls===1)throw Error('timeout');return Response.json({error:{code:'INVALID_COMMAND',message:'already collected'},snapshot:snap(4,3)},{status:400});});t.receive(snap(1,0));await assert.rejects(()=>t.send({type:'collect',catchId:'catch-123'}));await assert.rejects(()=>t.send({type:'cast'}),/already collected/);assert.equal(bodies[1].type,'collect');assert.equal(t.hasPending,false);assert.equal(t.snapshot.self.lastSequence,3);});

const fishSnap=(phase='bite',seq=0,id='own',cast='cast-1',catchId='catch-1')=>({roomId:'ocean',revision:seq+1,serverNow:100+seq,self:{id,role:'participant',lastSequence:seq,fishing:{phase,...(phase==='holding'?{catch:{id:catchId,caughtAt:101},...(cast!=='cast-1'?{castId:cast}:{})}:{castId:cast})}},participants:[],ambientParticipants:[]});
test('own newly confirmed reel celebrates once including a heartbeat retry',async()=>{
 const heard=[],bodies=[];let calls=0;
 const t=new FishingTransport(async(_url,init)=>{bodies.push(JSON.parse(init.body));if(++calls===1)throw Error('lost response');return Response.json(fishSnap('holding',1));},id=>heard.push(id));
 t.receive(fishSnap());await assert.rejects(t.send({type:'reel'}));assert.deepEqual(heard,[]);
 await t.send({type:'heartbeat'});t.receive(fishSnap('holding',1));assert.deepEqual(heard,['catch-1']);assert.equal(bodies[1].type,'reel');
});
test('rehydration, NPC catches, old held catch and collect do not celebrate',async()=>{
 const heard=[];const t=new FishingTransport(async()=>Response.json(fishSnap('holding',2)),id=>heard.push(id));
 t.receive(fishSnap('holding',1));await t.send({type:'collect',catchId:'catch-1'});t.receive({...fishSnap('idle',3),participants:[{id:'other',fishing:{phase:'holding',catch:{id:'npc-catch'}}}]});assert.deepEqual(heard,[]);
});
test('poll-confirmed own reel sounds immediately, later acknowledgement stays silent',async()=>{
 const heard=[];let finish;const t=new FishingTransport(()=>new Promise(resolve=>{finish=resolve;}),id=>heard.push(id));
 t.receive(fishSnap());const sent=t.send({type:'reel'});t.receive(fishSnap('holding',1));assert.deepEqual(heard,['catch-1']);finish(Response.json(fishSnap('holding',1)));await sent;assert.deepEqual(heard,['catch-1']);
});
test('wrong identity, cast or stale holding snapshot cannot confirm local reel',async()=>{
 for(const variant of [fishSnap('holding',1,'other'),fishSnap('holding',1,'own','other-cast'),fishSnap('holding',0)]){
  const heard=[];const t=new FishingTransport(async()=>Response.json(variant),id=>heard.push(id));t.receive(fishSnap());await t.send({type:'reel'});assert.deepEqual(heard,[]);
 }
});

test('cast intent confirms only a new own successful cast once, including lost ACK retry',async()=>{
 const heard=[];let calls=0;const t=new FishingTransport(async()=>{if(++calls===1)throw Error('lost');return Response.json(fishSnap('waiting',1,'own','new-cast'));},undefined,id=>heard.push(id));
 t.receive(fishSnap('idle'));await assert.rejects(t.send({type:'cast'}));await t.send({type:'heartbeat'});t.receive(fishSnap('waiting',1,'own','new-cast'));assert.deepEqual(heard,['new-cast']);
});
test('failed casts, old snapshot rehydration and remote actors never confirm a swish',async()=>{
 for(const variant of [fishSnap('waiting',1,'other','new'),fishSnap('waiting',1),fishSnap('waiting',0,'own','new'),fishSnap('idle',1,'own','new')]){
  const heard=[];const t=new FishingTransport(async()=>Response.json(variant),undefined,id=>heard.push(id));t.receive(fishSnap('idle'));await t.send({type:'cast'});assert.deepEqual(heard,[]);
 }
 const heard=[];const rejected=new FishingTransport(async()=>Response.json({snapshot:fishSnap('waiting',1,'own','rejected'),error:{message:'no'}},{status:400}),undefined,id=>heard.push(id));rejected.receive(fishSnap('idle'));await assert.rejects(rejected.send({type:'cast'}));assert.deepEqual(heard,[]);
 const cold=new FishingTransport(undefined,undefined,id=>heard.push(id));cold.receive(fishSnap('waiting',1,'own','cold'));assert.deepEqual(heard,[]);
});
test('poll-confirmed local cast is emitted before ACK and never emitted again by it',async()=>{
 const heard=[];let finish;const t=new FishingTransport(()=>new Promise(resolve=>{finish=resolve;}),undefined,id=>heard.push(id));
 t.receive(fishSnap('idle'));const sent=t.send({type:'cast'});t.receive(fishSnap('waiting',1,'own','poll-cast'));assert.deepEqual(heard,['poll-cast']);finish(Response.json(fishSnap('waiting',1,'own','poll-cast')));await sent;assert.deepEqual(heard,['poll-cast']);
});
test('retryable cast rejection stays silent but a later accepted retry still confirms',async()=>{
 const heard=[];let calls=0;const t=new FishingTransport(async()=>++calls===1?Response.json({error:{message:'retry'}},{status:503}):Response.json(fishSnap('waiting',1,'own','retried')),undefined,id=>heard.push(id));
 t.receive(fishSnap('idle'));await assert.rejects(t.send({type:'cast'}));assert.deepEqual(heard,[]);await t.send({type:'heartbeat'});assert.deepEqual(heard,['retried']);
});
