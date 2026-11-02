import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeClubWorld} from '../lib/club-scene-world.ts';
test('DJ decks fill the intact countertop with mixer controls between the enlarged platters',()=>{
 const fixture=()=>({root:new THREE.Group(),height:1.5,labelHeight:2,footprintRadius:.6,loaded:true,ready:Promise.resolve(),update(){},dispose(){}});
 const world=makeClubWorld({createAvatar:fixture});
 const booth=world.scene.getObjectByName('central-dj-booth')!;
 for(const side of ['left','right']){
  const platter=booth.getObjectByName(`dj-platter-${side}`) as THREE.Mesh;
  assert.ok(platter);assert.ok(platter.scale.x>=.52);
  assert.ok(Math.abs(platter.parent!.position.x)<=.84);
 }
 const mixer=booth.getObjectByName('dj-center-mixer')!;assert.ok(mixer);assert.equal(mixer.position.x,0);assert.ok(Math.abs(mixer.position.z)<.1);
 assert.ok(booth.getObjectByName('dj-crossfader'));
 assert.ok(booth.getObjectByName('dj-pad-0-0'));
 world.dispose();
});
