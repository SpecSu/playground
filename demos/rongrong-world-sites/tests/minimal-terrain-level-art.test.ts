import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTerrain,terrainSurfaceHeight,terrainVisualStamp} from '../src/minimal/scenery-art.ts';
import type {Terrain,Tile} from '../src/minimal/model.ts';
for(const terrain of ['meadow','creek','pond','grove','hill'] as Terrain[])test(`${terrain} cultivation has stable base, corner accents and unchanged contact surface`,()=>{
 const tile:Tile={x:2,z:2,terrain,owned:true};
 const baseline=makeTerrain(tile),one=makeTerrain({...tile,level:1}),two=makeTerrain({...tile,level:2}),three=makeTerrain({...tile,level:3});
 assert.equal(baseline.root.children.length,one.root.children.length);
 assert.equal(one.root.getObjectByName('cultivation-level-1'),undefined);
 const lush=two.root.getObjectByName('cultivation-level-2'),scenic=three.root.getObjectByName('cultivation-level-3');assert.ok(lush&&scenic);assert.ok(scenic.children.length>lush.children.length);
 assert.deepEqual(two.root.userData.target,baseline.root.userData.target);assert.equal(two.hit.geometry.attributes.position.count,baseline.hit.geometry.attributes.position.count);
 for(const x of [-.8,0,.8])for(const z of [-.8,0,.8])assert.equal(terrainSurfaceHeight({...tile,level:3},x,z),terrainSurfaceHeight(tile,x,z));
 assert.equal(terrainVisualStamp([tile]),terrainVisualStamp([{...tile,level:1}]));assert.notEqual(terrainVisualStamp([tile]),terrainVisualStamp([{...tile,level:2}]));
 assert.equal(makeTerrain({...tile,owned:false,level:3}).root.getObjectByName('cultivation-level-3'),undefined);
});
