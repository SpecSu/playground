import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('joystick is joined-only and gated by page visibility, overlays and group priority, not ordinary pending commands', () => {
  const ui = file('../components/LiveFeed.tsx');
  assert.match(ui, /joined && self && <ClubJoystick/);
  assert.match(ui, /const movementEnabled = Boolean\(joined && ready && visible && page === 'feed' && !sheet && !groupFeedback.personalBlocked\)/);
  assert.match(ui, /movements=\{movements\} movementControl=\{movementControl\} onMovementSample=\{onMovementSample\}/);
  assert.match(ui, /恢复自动漫游/);
  assert.match(ui, /pendingAutoRequest.current = true; selectPage\('feed'\)/);
  assert.match(ui, /onSnapshot: snapshot => movement.observeSnapshot\(snapshot\)/);
});

test('pointer lifecycle has capture, cancel, loss, blur and keyboard exits', () => {
  const ui = file('../components/ClubJoystick.tsx');
  for (const contract of ['setPointerCapture', 'releasePointerCapture', 'onPointerCancel', 'onLostPointerCapture', 'onBlur={stop}', 'visibilitychange', 'onKeyDown', 'onKeyUp', 'aria-describedby="joystick-help"']) assert.ok(ui.includes(contract), contract);
  assert.match(ui, /event.preventDefault\(\); event.stopPropagation\(\)/);
});

test('compact dock joystick keeps a bounded thumb and an independent pointer surface', () => {
  const css = file('../components/FeedInterface.css').replace(/\s+/g, '');
  const base = file('../app/globals.css');
  const ui = file('../components/ClubJoystick.tsx');
  assert.match(css, /\.club-joystick\{position:relative;left:auto;bottom:auto;width:64px;height:64px/);
  assert.match(css, /\.joystick-pad\{[^}]*width:60px;height:60px/);
  assert.match(css, /\.joystick-thumb\{[^}]*width:32px;height:32px/);
  assert.match(base, /touch-action:none/);
  assert.match(ui, /vector\.x \* 12/);
  assert.match(ui, /vector\.y \* 12/);
  assert.ok(32 / 2 + 12 < 60 / 2, 'the full-tilt thumb stays inside the ring');
  assert.match(css, /\.auto-roam-button\{[^}]*min-height:36px/);
});
