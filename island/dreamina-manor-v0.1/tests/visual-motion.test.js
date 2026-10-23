import test from 'node:test';import assert from 'node:assert/strict';
import {createVisualMotion} from '../lib/client/visual-motion.js';
import {createGame,applyCommand} from '../lib/game/state.js';
test('delayed acknowledgement never delays the first local displacement or rewinds it',()=>{
 const game=createGame('qa-motion',1000),motion=createVisualMotion();motion.observe(game,{islandUid:game.ownerUid,revision:0});
 const cmd={type:'begin-work',action:'plant',target:{kind:'land',cell:{x:0,z:0}},tier:1};
 const token=motion.predict(game,game,cmd,game.position,1000),first=motion.position(1016);
 assert.notDeepEqual(first,game.position);assert.equal(game.seeds[0],1);assert.equal(game.jobs.length,0);
 const server=applyCommand(game,cmd,{now:3000,seed:1,newId:()=> 'server-intent'}).state;
 const before=motion.position(3016);motion.observe(server,{islandUid:game.ownerUid,revision:server.revision});motion.acknowledge(token,server.pending,server.revision);
 assert.deepEqual(motion.position(3016),before);assert.equal(motion.state().pending.startedAt,1000);
});
test('offline walking is local only, explicit rejection corrects, stale ack cannot replace a newer target',()=>{
 const g=createGame('qa-motion',0),m=createVisualMotion();m.observe(g,{islandUid:g.ownerUid,revision:0});
 const a=m.predict(g,g,{type:'move',point:{x:0,z:0}},g.position,1000);const p=m.position(1100);
 m.reject(a,{uncertain:true});assert.deepEqual(m.position(1100),p);
 const b=m.predict(g,g,{type:'move',point:{x:1,z:1}},p,1100);m.acknowledge(a,{id:'old'},1);assert.equal(m.current().token,b);assert.equal(m.current().serverId,null);
 m.reject(a);assert.equal(m.current().token,b);m.reject(b);assert.deepEqual(m.position(1200),g.position);
 assert.equal(g.coins,24);assert.deepEqual(g.seeds,[1,0,0,0,0]);
});
test('later authoritative completion or another device intent wins without changing inventory locally',()=>{
 const g=createGame('qa-motion',0),m=createVisualMotion();m.observe(g,{islandUid:g.ownerUid,revision:0});
 const token=m.predict(g,g,{type:'move',point:{x:1,z:1}},g.position,1000);m.acknowledge(token,{id:'mine'},1);
 m.observe({...g,pending:null,position:{x:1,z:1}},{islandUid:g.ownerUid,revision:2});assert.equal(m.current(),null);assert.deepEqual(m.position(3000),{x:1,z:1});
});
