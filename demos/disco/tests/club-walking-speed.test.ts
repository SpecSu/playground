import assert from 'node:assert/strict';
import test from 'node:test';
import { movementVectorFromCamera, approachManualTarget, sweepManualPosition, isManualWalkable } from '../lib/club-manual-motion.ts';
import { ClickNavigation } from '../lib/club-click-navigation.ts';
import { MOVEMENT_SPEED_LIMIT } from '../lib/room-movement.ts';
import { clubRouteDurationMs } from '../lib/club-scene-motion.ts';
import { stablePhase } from '../lib/club-scene-math.ts';
const uv = (u: number, v: number) => ({ x: (u + v) * Math.SQRT1_2, z: (v - u) * Math.SQRT1_2 });
const gap = (a: {x:number;z:number}, b: {x:number;z:number}) => Math.hypot(a.x-b.x,a.z-b.z);

test('joystick and click travel exactly twice the original 1.8 m/s pace', () => {
 assert.equal(MOVEMENT_SPEED_LIMIT, 1.8 * 2);
 for (const [x,y] of [[1,0],[1,1],[.56,0]]) {
  const v = movementVectorFromCamera(x,y,{x:0,z:-1});
  const oldSpeed = 1.8 * (Math.min(1,Math.hypot(x,y))-.12)/.88;
  assert.ok(Math.abs(Math.hypot(v.x,v.z)-oldSpeed*2)<1e-10);
 }
 const start=uv(-3,4), nav=new ClickNavigation(uv(3,4));
 assert.ok(Math.abs(gap(start,nav.step(start,.1,[]))-.36)<1e-10);
});
test('remote catch-up keeps headroom above doubled movement speed', () => {
 const start=uv(-3,4), end=uv(3,4);
 assert.ok(Math.abs(gap(start,approachManualTarget(start,end,.1))-.72)<1e-10);
});
test('roaming halves six travel segments but preserves two full dance stops', () => {
 for(let slot=0;slot<10;slot++) {
  const segmentMs=2600+Math.floor(stablePhase(`club-route-speed:${slot}`)*900);
  assert.equal(clubRouteDurationMs(slot),segmentMs*(6/2+2*3));
 }
});
test('doubled movement still sweeps through long-frame booth and peer collisions', () => {
 const start=uv(-2.3,0), step=uv(MOVEMENT_SPEED_LIMIT*.1,0);
 const stopped=sweepManualPosition(start,step);
 assert.ok(isManualWalkable(stopped));
 assert.ok((stopped.x-stopped.z)*Math.SQRT1_2<=-2.11);
 const peer=uv(0,4), before=uv(-.5,4), next=sweepManualPosition(before,step,[peer]);
 assert.ok(gap(next,peer)>=.385-1e-5);
 assert.ok(gap(next,before)<=MOVEMENT_SPEED_LIMIT*.1+1e-8);
});
