import test from 'node:test';import assert from 'node:assert/strict';
import {rotateTankSelection,tankPlacement} from '../lib/game/build-options.js';
const game={land:[{x:0,z:0},{x:1,z:0},{x:0,z:1},{x:1,z:1}],tank:[],docks:[],jobs:[],items:[],position:{x:1.6,z:2.08}};
test('valid first tank rotates both cells without an extra anchor tap',()=>{const m={kind:'tank',axis:'x',cell:{x:0,z:0},sourceId:'fish'};const r=rotateTankSelection(game,m);assert.equal(r.axis,'z');assert.deepEqual(r.cell,m.cell);assert.equal(r.sourceId,'fish');assert.deepEqual(tankPlacement(game,r.cell,r.axis),[{x:0,z:0},{x:0,z:1}]);assert.equal(game.tank.length,0);});
test('rotation with no legal alternative keeps the existing valid preview',()=>{const g={...game,land:[{x:0,z:0},{x:1,z:0},{x:2,z:0}]},m={kind:'tank',axis:'x',cell:{x:0,z:0}};assert.equal(rotateTankSelection(g,m),m);});
