import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as photo from '../lib/celebration-photo.ts';
import { photoReactHarness } from './helpers/photo-react-harness.mjs';
const path = new URL('../hooks/useFestivalMemoryPhoto.ts', import.meta.url);
const round = { index: 9, burnAt: 300_000, ashesAt: 335_000 };
const capture = { roundIndex: 9, capturedAt: 322_000, dataUrl: 'data:image/jpeg;base64,YWN0dWFs' };
function harness() {
  const config = { getSnapshot: () => ({ round, participants: [], ambientParticipants: [], installations: [], ambientInstallations: [] }), now: 322_000, active: true, blocked: false, onPresent() { config.presentations++; }, presentations: 0 };
  const h = photoReactHarness(path, () => config, { '@/lib/celebration-photo': photo });
  return Object.assign(h, { config });
}

test('capture integrates with clock ticks and opens exactly once after ashesAt', async () => {
  const h = harness(); await h.settle(); h.value.onCapture(capture); await h.settle();
  assert.equal(h.value.isOpen, false);
  h.config.now = 335_000; h.render(); await h.settle();
  assert.equal(h.value.isOpen, true); assert.equal(h.value.photo.dataUrl, capture.dataUrl);
  assert.equal(h.config.presentations, 1);
  h.value.dismiss(); await h.settle(); h.value.onCapture(capture); h.config.now++; h.render(); await h.settle();
  assert.equal(h.value.photo, null); assert.equal(h.value.isOpen, false); assert.equal(h.config.presentations, 1);
});

test('an active sheet is untouched while the captured photo waits, including after a round change', async () => {
  const h = harness(); h.config.blocked = true; h.render(); await h.settle();
  h.value.onCapture(capture); h.config.now = 340_000; h.render(); await h.settle();
  assert.equal(h.value.isOpen, false); assert.equal(h.config.presentations, 0);
  h.config.getSnapshot = () => ({ round: { index: 10, burnAt: 645_000, ashesAt: 680_000 }, participants: [], ambientParticipants: [], installations: [], ambientInstallations: [] });
  h.config.blocked = false; h.config.now = 350_000; h.render(); await h.settle();
  assert.equal(h.value.isOpen, true); assert.equal(h.value.photo.roundIndex, 9);
});

test('background visibility and focus defer opening, then resume without creating a new capture', async () => {
  const h = harness(); await h.settle(); h.value.onCapture(capture); await h.settle();
  h.document.visibilityState = 'hidden'; h.fire('visibilitychange');
  h.config.now = 336_000; h.render(); await h.settle(); assert.equal(h.value.isOpen, false);
  h.document.visibilityState = 'visible'; h.document.hasFocus = () => false; h.fire('visibilitychange'); await h.settle();
  assert.equal(h.value.isOpen, false);
  h.document.hasFocus = () => true; h.fire('focus'); await h.settle();
  assert.equal(h.value.isOpen, true); assert.equal(h.config.presentations, 1);
});

test('unmount cancels queued presentation and ignores a late scene callback', async () => {
  const h = harness(); await h.settle(); h.value.onCapture(capture); await h.settle();
  const lateCapture = h.value.onCapture;
  h.config.now = 336_000; h.render(); h.unmount(); await h.settle();
  assert.equal(h.config.presentations, 0);
  const dirtyBefore = h.dirty; lateCapture({ ...capture, roundIndex: 10 });
  assert.equal(h.dirty, dirtyBefore);
  for (const handlers of h.listeners.values()) assert.equal(handlers.size, 0);
});

test('an already open photo stays mounted while the native share sheet temporarily takes focus', async () => {
  const h = harness(); await h.settle(); h.value.onCapture(capture); h.config.now = 336_000; h.render(); await h.settle();
  assert.equal(h.value.isOpen, true);
  h.document.hasFocus = () => false; h.fire('blur'); await h.settle();
  assert.equal(h.value.isOpen, true, 'do not abort the native share promise or lose its status on blur');
  h.document.hasFocus = () => true; h.fire('focus'); await h.settle();
  assert.equal(h.config.presentations, 1);
});

test('capture freezes builder names before departure and later-round presentation', async () => {
  const h = harness();
  const snapshot = {round,participants:[{id:'one',name:'阿岚'}],ambientParticipants:[],installations:[{actorId:'one',roundIndex:9,createdAt:100}],ambientInstallations:[]};
  h.config.getSnapshot = () => snapshot;
  h.render(); await h.settle();
  snapshot.participants = [];
  h.value.onCapture(capture); await h.settle();
  snapshot.round = {...round,index:10}; snapshot.participants = [{id:'one',name:'后来者'}];
  h.config.now = 350_000; h.render(); await h.settle();
  assert.equal(h.value.isOpen,true);
  assert.deepEqual(h.value.photo.builderNames,['阿岚']);
});
