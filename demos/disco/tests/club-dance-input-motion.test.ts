import assert from 'node:assert/strict';
import test from 'node:test';
import { DanceInputMotion } from '../lib/club-dance-input-motion.ts';
import { danceDirectionalPose } from '../lib/club-dance-staging.ts';

test('fast fresh up presses continue complete jumps instead of restarting preload every frame', () => {
  const motion = new DanceInputMotion(); let peaks = 0; let previous = 0;
  for(let now=0;now<1600;now+=20) {
    const input={direction:'up' as const,at:Math.floor(now/40)*40};
    const output=motion.sample('round:self',input,now)!;
    const lift=danceDirectionalPose(output.direction,now-output.at).lift;
    if(lift>0.8 && previous<=0.8) peaks++;
    previous=lift;
  }
  assert.ok(peaks>=3,'rapid input produces repeated full-height bounces');
});
test('release completes current and queued bounce; different input and identity clear pending up', () => {
  const motion = new DanceInputMotion();
  assert.equal(motion.sample('r:self',{direction:'up',at:0},0)?.at,0);
  motion.sample('r:self',{direction:'up',at:80},80);
  assert.equal(motion.sample('r:self',{direction:'up',at:80},500)?.at,440);
  assert.equal(motion.sample('r:self',{direction:'up',at:80},881),null);
  motion.sample('r:self',{direction:'up',at:1000},1000);
  assert.equal(motion.sample('r:self',{direction:'left',at:1100},1100)?.direction,'left');
  assert.equal(motion.sample('new:other',null,1150),null);
});
