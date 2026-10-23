import test from 'node:test';import assert from 'node:assert/strict';
import {tankAnchors,tankPlacement} from '../lib/game/build-options.js';
const game={land:[{x:0,z:0},{x:1,z:0},{x:0,z:1},{x:1,z:1}],tank:[],docks:[],jobs:[],items:[],position:{x:.5,z:.65}};
test('single-cell starter exposes all four legal tiles without orientation',()=>{assert.deepEqual(tankAnchors(game),game.land);for(const c of game.land)assert.deepEqual(tankPlacement(game,c),[c]);assert.deepEqual(tankPlacement(game,null),[]);});
test('later expansion stays adjacent and keeps an accessible dry route',()=>{const g={...game,tank:[{x:0,z:0}]};assert.deepEqual(tankAnchors(g),[{x:1,z:0},{x:0,z:1}]);assert.equal(tankAnchors({...g,items:[{location:{kind:'land',cell:{x:1,z:0}}}]}).some(c=>c.x===1&&c.z===0),false);});
