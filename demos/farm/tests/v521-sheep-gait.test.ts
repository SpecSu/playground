import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSheep} from '../src/sheep.ts';
import {legacyAnimal} from '../src/v5/estate-scene.ts';
import {createEstate,currentProfile} from '../src/v5/estate.ts';
test('walking legs use traveled distance rather than changing phase with unrelated animation time',()=>{
 const animal=legacyAnimal(currentProfile(createEstate('gait',1800000000000)).animals[0]),sheep=makeSheep(animal);
 const update=sheep.update as (...args:[typeof animal,number,undefined,number,number,boolean,boolean,boolean,number])=>void;
 const legs=sheep.root.children[0].children.filter(o=>o.position.y===.62);
 assert.equal(legs.length,4);
 update(animal,1,undefined,0,1,false,false,false,.25);const first=legs.map(l=>l.rotation.x);
 update(animal,1.137,undefined,0,1,false,false,false,.25);assert.deepEqual(legs.map(l=>l.rotation.x),first);
 update(animal,1.137,undefined,0,1,false,false,false,.35);assert.notDeepEqual(legs.map(l=>l.rotation.x),first);
});
