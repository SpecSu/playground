import assert from 'node:assert/strict';
import test from 'node:test';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { createFestivalBuilderAvatar } from '../lib/festival-builder-avatar.ts';
import { uploadedTemplate } from './helpers/uploaded-avatar.ts';
test('the short-legged cat keeps a natural paw axis while the attached hammer owns its working orientation',async()=>{
 const avatar=createClubAvatar('miaocuijiao','short-paw-work',{mode:'desert',template:await uploadedTemplate('miaocuijiao')}),builder=createFestivalBuilderAvatar(avatar);avatar.update(0,'dance',false,0);
 const hand=avatar.root.getObjectByName('hand_R')!,upper=avatar.root.getObjectByName('upperArm_R')!,handRest=hand.quaternion.clone(),upperRest=upper.quaternion.clone();
 try{for(const t of [0,.3,.7,1,1.25,1.6,4.4,11.9]){
  avatar.update(t,'dance',false,0);builder.update(t);
  assert.ok(hand.quaternion.angleTo(handRest)<.00001,`paw does not inherit the tool axis at ${t}`);
  assert.ok(upper.quaternion.angleTo(upperRest)<1.2,`short front leg stays below its chest at ${t}`);
  assert.equal(avatar.root.getObjectByName('festival-builder-hammer')!.parent,hand);
  assert.deepEqual(hand.scale.toArray(),[1,1,1]);
 }}finally{builder.dispose();avatar.dispose();}
});
