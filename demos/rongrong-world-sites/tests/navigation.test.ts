import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyCommand,createFarm} from '../src/model.ts';
import {responseAt,sheepDestination,keepInMeadow} from '../src/navigation.ts';
test('shy sheep shows an immediate micro response before its delayed action',()=>{
 const r=applyCommand(createFarm('a',100000),{id:'test-nav-1',type:'act',action:'dance',target:'all'},100000);
 assert.equal(responseAt(r.event,'momo',100050)?.micro,true);
 assert.equal(responseAt(r.event,'momo',101700)?.micro,false);
 assert.equal(responseAt(r.event,'momo',109000),undefined);
});
test('navigation stays inside meadow and different sheep retain different approach radii',()=>{
 assert.deepEqual(keepInMeadow({x:100,z:-100}),{x:6,z:-4.5});
 const event=applyCommand(createFarm('a',100000),{id:'test-nav-2',type:'act',action:'love',target:'all'},100000).event!;
 const distances=event.reactions.map((r,i)=>{const p=sheepDestination({x:0,z:0},{x:0,z:0},r,i,0);return Math.hypot(p.x,p.z);});
 assert.ok(distances[0]<distances[1]);assert.ok(distances[1]<distances[2]);
});
