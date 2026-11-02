import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const component = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');

test('startup and direct app gestures request sound without delaying room controls', () => {
  assert.match(component, /player\.requestPlayback\(\)/);
  for (const handler of ['onPointerDownCapture', 'onPointerUpCapture', 'onClickCapture', 'onKeyDownCapture']) {
    assert.ok(component.includes(`${handler}={requestSoundFromGesture}`), `${handler} unlocks on the first trusted interaction`);
  }
  assert.match(component, /if \(event\.isTrusted\) audio\.current\?\.requestPlayback\(\)/);
  assert.doesNotMatch(component, /await audio\.current\?\.(?:unlock|requestPlayback)/);
});

test('actual browser state and session mute drive sound controls while only explicit enable clears mute', () => {
  assert.match(component, /setSoundNeedsGesture\(status\.needsGesture\)/);
  assert.match(component, /setMuted\(status\.muted\)/);
  const enable = component.slice(component.indexOf('const enableSound ='), component.indexOf('const perform ='));
  assert.match(enable, /setMuted\(false\)/);
  assert.match(enable, /requestPlayback\(\)/);
  const root = component.match(/<main className="app-shell[^"]*"[^>]+>/)?.[0] ?? '';
  assert.ok(root, 'the active app root is inspected');
  assert.doesNotMatch(root, /setMuted/);
});

test('joining or editing a profile requests sound without clearing an explicit mute', () => {
  const join = component.slice(component.indexOf('const join ='), component.indexOf('const invite ='));
  assert.doesNotMatch(join, /enableSound|setMuted/);
  assert.match(join, /audio\.current\?\.requestPlayback\(\)/);
});

// Unlock permission is not evidence that a buffer is playing: loading, rejected
// resume, suspended contexts and zero volume must not render an active indicator.
test('all sound indicators reflect actual playback rather than historical unlock permission', () => {
  assert.match(component, /setSoundPlaying\(status\.playing\)/);
  assert.doesNotMatch(component, /soundEnabled && !muted/);
  assert.match(component, /aria-pressed=\{soundPlaying\}/);
  assert.match(component, /soundPlaying \? <Volume2 \/> : <VolumeX \/>/);
});
