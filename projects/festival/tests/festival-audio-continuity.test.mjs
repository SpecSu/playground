import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FestivalClock } = await import('../lib/festival-motion.ts');
import { audioHarness, audioRound } from './helpers/festival-audio-harness.mjs';

async function start(h) {h.audio.requestFromGesture(); await h.flush(); await h.tick(); assert.equal(h.music().length, 1);}

test('850 ms room polling and variable network latency never restart the continuous recording', async () => {
 let local = 0;
 const clock = new FestivalClock(() => local, 300000);
 clock.accept(300000, 0, 0);
 const h = audioHarness({getNow: () => clock.now()});
 await start(h);
 let nextPoll = 850, poll = 0;
 // Server replies may arrive near either edge of a high-latency request. This
 // exercises the actual shared clock's gradual correction, not wall-clock mocks.
 const offsets = [350, 350, 350, -350, -350, -350, 250, -250];
 for (local = 60; local <= 25000; local += 60) {
  h.context.currentTime = local / 1000;
  if (local >= nextPoll) {const offset = offsets[poll++ % offsets.length]; clock.accept(300000 + local + offset - 400, local - 800, local); nextPoll += 850;}
  await h.tick();
 }
 assert.equal(h.music().length, 1, 'NTP slewing must not stop and re-fade Arabic Nights');
 assert.equal(h.recordings().length, 3, 'effects are also continuous');
 assert.equal(h.context.decodes, 3, 'no repeated decode during sync');
 assert.equal(h.loads.length, 3, 'no repeated fetch during sync');
 h.audio.dispose();
});

test('a stalled main thread cannot cut a running hardware-audio playhead', async () => {
 const h = audioHarness(); await start(h);
 for (const elapsed of [60, 120, 1320, 1380, 4000, 4060, 10100, 24000]) {
  h.context.currentTime = elapsed / 1000; h.setNow(300000 + elapsed); await h.tick();
 }
 assert.equal(h.music().length, 1, 'timer lateness is not an audio clock discontinuity');
 assert.equal(h.recordings().length, 3);
 assert.equal(h.music()[0].disconnectedAt, null);
 assert.equal(h.music()[0].stops.filter(args => args.length === 0).length, 0);
 h.audio.dispose();
});

test('ordinary clock refinements never change the recording tempo or seek', async () => {
 const h = audioHarness(); await start(h);
 for (let elapsed = 60; elapsed <= 24000; elapsed += 60) {
  h.context.currentTime = elapsed / 1000; h.setNow(300000 + elapsed + 400); await h.tick();
 }
 assert.equal(h.music().length, 1);
 const rates = h.music()[0].playbackRate.events.filter(event => event[0] === 'set').map(event => event[1]);
 assert.ok(rates.every(rate => rate === 1), 'play the original recording at exactly its original tempo');
 assert.equal(h.music()[0].playbackRate.value, 1);
 assert.equal(h.music()[0].stops.length, 1, 'room polling never reschedules the fixed recording end');
 h.audio.dispose();
});

test('even large clock refinements leave an ongoing ceremony alone; a new round starts its own recording', async () => {
 const h = audioHarness(); await start(h);
 h.context.currentTime = 1; h.setNow(305000); await h.tick();
 assert.equal(h.music().length, 1); assert.ok(h.music()[0].connections.length);
 for (let elapsed = 1060; elapsed <= 4000; elapsed += 60) {h.context.currentTime = elapsed / 1000; h.setNow(304000 + elapsed); await h.tick();}
 assert.equal(h.music().length, 1, 'an ongoing short ceremony never chases synchronization');
 h.setRound({...audioRound, index: 2, startsAt: 345000, burnAt: 645000, ashesAt: 680000, endsAt: 690000});
 h.setNow(645000); await h.tick(); assert.equal(h.music().length, 2);
 assert.equal(h.music().filter(source => source.connections.length).length, 1);
 h.audio.dispose();
});

test('wall-clock jumps cannot perturb the monotonic shared clock or recording', async () => {
 let local = 0; const originalNow = Date.now;
 const clock = new FestivalClock(() => local, 300000); clock.accept(300000, 0, 0);
 const h = audioHarness({getNow: () => clock.now()});
 try {
  await start(h);
  for (local = 60; local <= 24000; local += 60) {
   Date.now = () => local % 120 ? 8000000000000 : -8000000000000;
   h.context.currentTime = local / 1000; await h.tick();
  }
  assert.equal(h.music().length, 1); assert.equal(clock.now(), 300000 + local);
 } finally {Date.now = originalNow; h.audio.dispose();}
});

test('a long daytime callback stall restores only the current pad, without replaying missed attacks', async () => {
 const h = audioHarness({now: 10000}); h.audio.requestFromGesture(); await h.flush(); await h.tick();
 const count = h.context.nodes.length;
 h.context.currentTime = 8; h.setNow(18000);
 for (const node of h.context.nodes) if (node.onended && node.stopArgs?.[0] <= 8) node.onended();
 await h.tick();
 const newSources = h.context.nodes.slice(count).filter(node => node.startArgs);
 assert.equal(newSources.length, 8, 'only one four-note pad and its quiet harmonics are restored');
 assert.ok(newSources.every(node => node.startArgs[0] >= 8 && node.startArgs[0] < 8.1));
 assert.ok(newSources.every(node => node.stopArgs[0] < 10.9), 'the sustaining pad ends with its current chord');
 await h.tick(); assert.equal(h.context.nodes.slice(count).filter(node => node.startArgs).length, 8, 'no duplicate recovered pad');
 h.audio.dispose();
});


test('actual ashes stop the old ceremony and a later clock refinement cannot restart it', async () => {
 const h = audioHarness(); await start(h);
 h.context.currentTime = 30; h.setNow(335000); await h.tick();
 assert.equal(h.music()[0].connections.length, 0, 'the room has ended the burn');
 h.context.currentTime = 30.06; h.setNow(332000); await h.tick();
 assert.equal(h.music().length, 1, 'a finished ceremony stays finished');
 h.audio.dispose();
});
