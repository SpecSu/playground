import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{createGame,applyCommand,publicGame}from'../lib/game/state.js';
import{tankAnchors,tankPlacement}from'../lib/game/build-options.js';
import{constructionView}from'../lib/game/construction.js';
import{planLocalOperation,applyLocalOperation}from'../lib/game/local-operations.js';
const ctx=now=>({now,newId:()=>`build-${now}`});
test('first tank uses one empty cell, costs80, exposes10 capacity after exactly12s',()=>{
 const g=createGame('qa-single-tank',0);g.coins=200;
 assert.deepEqual(tankPlacement(g,{x:0,z:0}),[{x:0,z:0}]);assert.equal(tankAnchors(g).length,4);
 const s=applyCommand(g,{type:'construct',kind:'tank',cells:[{x:0,z:0}]},ctx(1000)).state;
 assert.equal(s.coins,120);assert.equal(publicGame(s,12999).tank.length,0);assert.equal(publicGame(s,13000).tank.length,1);
 const done=constructionView(s,13000);const e=applyCommand(done,{type:'construct',kind:'tank',cells:[{x:1,z:0}]},ctx(13001)).state;
 assert.equal(e.coins,40);assert.equal(publicGame(e,25001).tank.length,2);
});
test('existing and in-flight two-cell first tanks keep their footprint, price and timer',()=>{
 const g=createGame('qa-legacy-tank',0);g.coins=200;
 const s=applyCommand(g,{type:'build-tank',cells:[{x:0,z:0},{x:1,z:0}]},ctx(1000)).state;
 assert.equal(s.coins,40);assert.equal(s.constructions[0].readyAt,13000);const done=constructionView(s,13000);
 assert.deepEqual(done.tank,[{x:0,z:0},{x:1,z:0}]);assert.equal(done.coins,40);assert.deepEqual(constructionView(done,50000).tank,done.tank);
});
test('new first-tank UI has one-cell price and no orientation or two-cell prompt',()=>{
 const ui=fs.readFileSync('components/manor/Manor.tsx','utf8');assert.match(ui,/建鱼缸 · 10条/);assert.match(ui,/<Money value=\{80\}/);assert.match(ui,/鱼缸 · 10条/);assert.doesNotMatch(ui,/rotateTankSelection|占两块相邻的空地|建鱼缸 · 20条/);
});

test('local projection and server accept identical one-cell operation and start time',()=>{
 const g=createGame('qa-local-single',0);g.coins=200;const op=planLocalOperation(g,{type:'construct',kind:'tank',cells:[{x:0,z:0}]},{id:'single-op',now:1000});
 const local=applyLocalOperation(g,op).state,server=applyLocalOperation(g,op,{serverNow:5000}).state;
 assert.deepEqual(local,server);assert.equal(server.constructions[0].readyAt,13000);assert.equal(server.coins,120);
});
