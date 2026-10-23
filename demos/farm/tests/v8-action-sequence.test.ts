import test from 'node:test';
import assert from 'node:assert/strict';
import {feedingPoseAt,guardianPoseAt,wolfPoseAt,feedingApproach} from '../src/v5/action-sequence.ts';
import {createLayout} from '../src/v5/layout.ts';

test('feeding settles before reaching, eats while held, withdraws and ends in rest',()=>{
 assert.equal(feedingPoseAt(100,'milk').phase,'settle');
 assert.equal(feedingPoseAt(100,'milk').prop,false);
 assert.equal(feedingPoseAt(600,'milk').phase,'offer');
 assert.ok(feedingPoseAt(1600,'milk').crouch>.8);
 assert.equal(feedingPoseAt(1600,'milk').animal,'suckle');
 assert.equal(feedingPoseAt(1600,'feed').animal,'eat');
 assert.equal(feedingPoseAt(2700,'milk').phase,'recover');
 assert.equal(feedingPoseAt(3000,'milk').prop,false);
 assert.equal(feedingPoseAt(3000,'milk').reach,0);
 assert.equal(feedingPoseAt(-1,'milk').crouch,0);
 assert.equal(feedingPoseAt(NaN,'milk').prop,false);
});
test('feeding station never targets sheep centre and excludes occupied or blocked cells',()=>{
 const l=createLayout(),sheep={x:4,z:4};
 const station=feedingApproach(l,{x:5,z:7},sheep,[{x:5,z:4}]);
 assert.ok(station);assert.ok(Math.hypot(station.to.x-sheep.x,station.to.z-sheep.z)>=.8);
 assert.ok(Math.hypot(station.to.x-5,station.to.z-4)>.5);
 assert.deepEqual(station.path.at(-1),station.to);
 const blocked={...l,buildings:[...l.buildings,...[{x:3,z:4},{x:5,z:4},{x:4,z:3},{x:4,z:5}].map((q,i)=>({...q,id:`block-${i}`,kind:'decor' as const,rotation:0 as const,doors:[],paidCost:0,capacity:0}))]};
 assert.equal(feedingApproach(blocked,{x:5,z:7},sheep),null);
});
test('guardian species have distinct bounded defensive poses and no persistent dance',()=>{
 const dog=guardianPoseAt('dog','block',.7),cat=guardianPoseAt('cat','gather',.7),frog=guardianPoseAt('frog','bubble',.7);
 assert.ok(dog.shield>0&&dog.pounce===0&&dog.bubble===0);
 assert.ok(cat.pounce>0&&cat.shield===0&&cat.bubble===0);
 assert.ok(frog.bubble>0&&frog.shield===0&&frog.pounce===0);
 assert.equal(guardianPoseAt('dog',undefined,10).shield,0);
 assert.equal(guardianPoseAt('cat','watching',1).scan,guardianPoseAt('cat','watching',1.1).scan);
});
test('wolf intent poses separate observation, approach, windup and retreat without idle bobbing',()=>{
 assert.equal(wolfPoseAt('searching',0,0).gait,0);
 assert.equal(wolfPoseAt('searching',0,3).crouch,wolfPoseAt('searching',0,8).crouch);
 assert.ok(wolfPoseAt('windup',0,0).crouch>0);
 assert.ok(wolfPoseAt('retreating',1.5,1).tail<0);
 assert.ok(Math.abs(wolfPoseAt('searching',1.5,1).gait)>0);
});
