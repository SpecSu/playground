import test from 'node:test';import assert from 'node:assert/strict';
import {SCHOOL_PLAYGROUND_FRIEND as friend} from '../src/minimal/playground-friend.ts';
import {sampleFarm} from '../src/minimal/sample-farms.ts';
test('fifth display friend stays an unlinked sample and cannot expand ordinary farm or boarding tiles',()=>{assert.equal(friend.name,'咕咕');assert.equal(friend.avatar,'/assets/friends/gugu.png');assert.equal(friend.badge,'示例');assert.equal(friend.identityStatus,'unlinked-account');assert.deepEqual(friend.target,{kind:'sample',sampleId:'school-playground'});assert.equal('uid' in friend.target,false);assert.throws(()=>sampleFarm(friend.target.sampleId,0),/未知示例/);});
