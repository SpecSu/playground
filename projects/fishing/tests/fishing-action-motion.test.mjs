import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { sampleFishingAction } = await import('../lib/fishing-action-motion.ts');
const casting = { phase: 'waiting', castAt: 10_000, biteAt: 15_000, expiresAt: 18_000 };
const caught = { phase: 'holding', catch: { id: 'one', speciesId: 'tuna', lengthCm: 160, weightKg: 18, caughtAt: 20_000 } };

test('cast has a visible backswing, forward flick, airborne line and settled wait', () => {
  const windup = sampleFishingAction(casting, 10_300);
  const flick = sampleFishingAction(casting, 10_510);
  const flight = sampleFishingAction(casting, 10_850);
  const ready = sampleFishingAction(casting, 11_550);
  assert.equal(windup.stage, 'windup');
  assert.ok(windup.rodPitch < -1, 'rod rises back behind the angler');
  assert.ok(windup.bodyLean > .09);
  assert.equal(flick.stage, 'cast');
  assert.ok(flick.rodPitch > .15, 'forward flick changes rod angle by more than a radian');
  assert.ok(flick.gripReach > .07);
  assert.equal(flight.stage, 'flight');
  assert.ok(flight.castFlight > 0 && flight.castFlight < 1);
  assert.equal(ready.stage, 'waiting');
  assert.equal(ready.castFlight, 1);
  assert.equal(ready.settled, true);
});

test('reel pulls back first and lifts the catch before the showcase begins', () => {
  const reel = sampleFishingAction(caught, 20_200);
  const lift = sampleFishingAction(caught, 20_650);
  const reveal = sampleFishingAction(caught, 21_200);
  const hold = sampleFishingAction(caught, 21_450);
  assert.equal(reel.stage, 'reel');
  assert.ok(reel.rodPitch < -.5);
  assert.equal(reel.catchVisible, false);
  assert.equal(reel.showcaseProgress, 0);
  assert.equal(lift.stage, 'lift');
  assert.ok(lift.haulProgress > 0 && lift.haulProgress < 1);
  assert.equal(lift.catchVisible, true);
  assert.equal(lift.showcaseProgress, 0);
  assert.equal(lift.rodVisible, true);
  assert.ok(reveal.haulProgress < 1, 'fish keeps approaching until the supporting palms finish opening');
  assert.ok(reveal.showcaseProgress > 0 && reveal.showcaseProgress < 1);
  assert.equal(hold.stage, 'holding');
  assert.equal(hold.showcaseProgress, 1);
  assert.equal(hold.rodVisible, false);
  assert.equal(hold.lineVisible, false);
});

test('cast and catch keyframes are continuous and keep all normalized tracks bounded', () => {
  const tracks = ['rodPitch', 'bodyLean', 'gripLift', 'gripReach', 'castFlight', 'haulProgress', 'showcaseProgress'];
  for (const [state, start, duration] of [[casting, 10_000, 1600], [caught, 20_000, 1600]]) {
    let previous = sampleFishingAction(state, start);
    for (let ms = 1; ms <= duration; ms++) {
      const current = sampleFishingAction(state, start + ms);
      for (const name of tracks) {
        assert.ok(Number.isFinite(current[name]), name);
        assert.ok(Math.abs(current[name] - previous[name]) < .03, `${name} continuous at ${ms}ms`);
      }
      for (const name of ['castFlight', 'haulProgress', 'showcaseProgress']) assert.ok(current[name] >= 0 && current[name] <= 1);
      previous = current;
    }
  }
});

test('reduced motion uses stable end poses without hiding the line or completed catch', () => {
  assert.deepEqual(sampleFishingAction(casting, 10_100, true), sampleFishingAction(casting, 14_000, true));
  const waiting = sampleFishingAction(casting, 10_100, true);
  assert.equal(waiting.stage, 'waiting');
  assert.equal(waiting.lineVisible, true);
  assert.equal(waiting.castFlight, 1);
  const holding = sampleFishingAction(caught, 20_100, true);
  assert.equal(holding.stage, 'holding');
  assert.equal(holding.catchVisible, true);
  assert.equal(holding.showcaseProgress, 1);
});

test('missing timestamps settle gracefully, old actions do not replay and states stay immutable', () => {
  assert.equal(sampleFishingAction({phase:'waiting'}, 20_000).stage, 'waiting');
  assert.equal(sampleFishingAction({phase:'holding'}, 20_000).stage, 'holding');
  assert.equal(sampleFishingAction(casting, 90_000).stage, 'waiting');
  assert.equal(sampleFishingAction(caught, 90_000).stage, 'holding');
  const before = structuredClone(caught);
  sampleFishingAction(caught, 20_800);
  assert.deepEqual(caught, before);
  const bite = sampleFishingAction({...casting, phase:'bite'}, 15_400);
  assert.equal(bite.stage, 'bite');
  assert.equal(bite.lineVisible, true);
  for (const phase of ['idle', 'escaped']) {
    const pose = sampleFishingAction({phase}, 90_000);
    assert.equal(pose.lineVisible, false);
    assert.equal(pose.catchVisible, false);
  }
});

test('a newly acknowledged action receives its full gesture despite server response latency', async()=>{
 const {FishingActionTimeline}=await import('../lib/fishing-action-motion.ts');
 assert.equal(typeof FishingActionTimeline,'function');
 const timeline=new FishingActionTimeline();timeline.sample({phase:'idle'},10_000,0);timeline.sample({phase:'idle'},11_900,1_900);
 const delayed={...casting,castId:'delayed-cast'};
 const start=timeline.sample(delayed,12_000,2_000);
 assert.equal(start.stage,'windup');assert.ok(start.rodPitch<0&&start.rodPitch>-.6);
 assert.equal(timeline.sample(delayed,12_400,2_400).stage,'flight');
 assert.equal(timeline.sample(delayed,13_500,3_500).stage,'waiting');
 const haul=timeline.sample(caught,22_000,4_000);assert.equal(haul.stage,'reel');assert.equal(haul.catchVisible,false);
 assert.equal(timeline.sample(caught,22_700,4_700).stage,'lift');
 assert.equal(timeline.sample(caught,23_500,5_500).stage,'holding');
 assert.equal(timeline.sample(caught,23_500,5_500).settled,true);
});

test('cold observations honor elapsed server time and do not replay old actions',async()=>{
 const {FishingActionTimeline}=await import('../lib/fishing-action-motion.ts');
 assert.equal(typeof FishingActionTimeline,'function');
 const castTimeline=new FishingActionTimeline(),catchTimeline=new FishingActionTimeline();
 assert.equal(castTimeline.sample({...casting,castId:'old'},80_000,0).stage,'waiting');
 assert.equal(catchTimeline.sample(caught,80_000,0).stage,'holding');
 assert.equal(catchTimeline.sample(caught,80_000,0).settled,true);
 const freshTimeline=new FishingActionTimeline();assert.equal(freshTimeline.sample(casting,10_300,100).stage,'windup');
 assert.equal(freshTimeline.sample(casting,10_700,500).stage,'flight');
});

test('visual timelines are monotonic, never restart an observed ID, and yield to authoritative bite/escape',async()=>{
 const {FishingActionTimeline}=await import('../lib/fishing-action-motion.ts');
 assert.equal(typeof FishingActionTimeline,'function');
 const timeline=new FishingActionTimeline();timeline.sample({phase:'idle'},9_000,0);
 const state={...casting,castId:'same-id'};
 timeline.sample(state,12_000,500);
 const flight=timeline.sample(state,12_600,1_100);
 assert.equal(flight.stage,'flight');
 assert.deepEqual(timeline.sample(state,8_000,1_000),flight,'wall clock corrections cannot rewind a visible action');
 assert.equal(timeline.sample({...state,phase:'bite'},15_000,1_200).stage,'bite');
 assert.equal(timeline.sample({...state,phase:'escaped'},18_000,1_300).stage,'idle');
 assert.equal(timeline.sample(state,20_000,3_000).stage,'waiting');
 timeline.sample({phase:'idle'},21_000,3_500);
 assert.equal(timeline.sample(state,21_000,3_500).stage,'waiting','same cast ID cannot replay after an idle observation');
 const reduced=new FishingActionTimeline();reduced.sample({phase:'idle'},9000,0);
 assert.equal(reduced.sample(state,12000,100,true).stage,'waiting');
 assert.equal(reduced.sample(state,12050,150,false).stage,'waiting','turning motion back on must not replay an already displayed result');
});

test('stale remote records and a suspended return never replay missed actions',async()=>{
 const {FishingActionTimeline}=await import('../lib/fishing-action-motion.ts');
 const stale=new FishingActionTimeline();stale.sample({phase:'idle'},79_000,1_000);
 assert.equal(stale.sample({...casting,castId:'stale-remote'},80_000,1_100).stage,'waiting');
 assert.equal(stale.sample(caught,80_000,1_200).stage,'holding');
 assert.equal(stale.sample(caught,80_000,1_200).settled,true);
 const resumed=new FishingActionTimeline();resumed.sample({phase:'idle'},19_900,1_000);
 const resumedPose=resumed.sample(caught,22_200,30_000);
 assert.equal(resumedPose.stage,'holding');assert.equal(resumedPose.settled,true);
});

test('resting has a one-handed blend that joins the cast smoothly and never shows a line',()=>{
 for(const phase of ['idle','escaped'])for(const reduced of [false,true]){
  const pose=sampleFishingAction({phase},1000,reduced);
  assert.equal(pose.restProgress,1);assert.equal(pose.lineVisible,false);assert.equal(pose.rodVisible,true);
 }
 assert.equal(sampleFishingAction(casting,10000).restProgress,1);
 assert.ok(sampleFishingAction(casting,10100).restProgress>0);
 assert.equal(sampleFishingAction(casting,10300).restProgress,0);
 assert.equal(sampleFishingAction(casting,14000).restProgress,0);
 assert.equal(sampleFishingAction(casting,10000,true).restProgress,0);
});
