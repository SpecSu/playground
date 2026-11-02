import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Tests intentionally run without a browser, WebGL context, or audio device.
const photo = await import('../lib/celebration-photo.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const round = { index: 12, burnAt: 300_000, ashesAt: 335_000 };
const capture = { roundIndex: 12, dataUrl: 'data:image/jpeg;base64,YWN0dWFsLWZyYW1l', capturedAt: 322_000 };
function initial() { assert.equal(typeof photo.createPhotoSession, 'function', 'photo session is implemented'); return photo.createPhotoSession(); }
function received() { return photo.receiveCelebrationPhoto(initial(), capture, round); }
const allowed = { now: 335_000, active: true, visible: true, blocked: false };

test('a captured real frame waits until its own round ashesAt', () => {
  const captured = received();
  assert.equal(captured.pending.dataUrl, capture.dataUrl);
  assert.equal(captured.pending.ashesAt, round.ashesAt);
  assert.equal(captured.displayed, null);
  assert.equal(photo.presentCelebrationPhoto(captured, { ...allowed, now: 334_999 }), captured);
  const presented = photo.presentCelebrationPhoto(captured, allowed);
  assert.equal(presented.displayed.dataUrl, capture.dataUrl);
  assert.equal(presented.pending, null);
});

test('snapshots alone never invent a photo or reopen a closed round', () => {
  const empty = initial();
  assert.equal(photo.presentCelebrationPhoto(empty, allowed), empty);
  const displayed = photo.presentCelebrationPhoto(received(), allowed);
  const closed = photo.dismissCelebrationPhoto(displayed);
  assert.equal(closed.displayed, null);
  assert.equal(closed.pending, null);
  assert.equal(photo.receiveCelebrationPhoto(closed, capture, round), closed);
  assert.equal(photo.presentCelebrationPhoto(closed, { ...allowed, now: 400_000 }), closed);
});

test('open sheets, hidden tabs and the profile defer the same photo without discarding it', () => {
  const captured = received();
  for (const blocker of [{ blocked: true }, { visible: false }, { active: false }]) {
    assert.equal(photo.presentCelebrationPhoto(captured, { ...allowed, ...blocker }), captured);
  }
  const shown = photo.presentCelebrationPhoto(captured, { ...allowed, now: 500_000 });
  assert.equal(shown.displayed.roundIndex, 12, 'stored ashesAt still works after the server advances to another round');
});

test('only one shown and the newest pending frame are retained across rounds', () => {
  let state = photo.presentCelebrationPhoto(received(), allowed);
  for (let index = 13; index < 80; index++) {
    state = photo.receiveCelebrationPhoto(state, { ...capture, roundIndex: index, capturedAt: index * 1000 + 22, dataUrl: `data:image/jpeg;base64,${index}` }, { index, burnAt: index * 1000, ashesAt: index * 1000 + 35 });
  }
  assert.equal(state.displayed.roundIndex, 12);
  assert.equal(state.pending.roundIndex, 79);
  assert.equal(photo.presentCelebrationPhoto(state, allowed), state, 'an open photo is never interrupted');
  const dismissed = photo.dismissCelebrationPhoto(state);
  assert.equal(photo.presentCelebrationPhoto(dismissed, allowed).displayed.roundIndex, 79);
  assert.equal(photo.receiveCelebrationPhoto(dismissed, capture, round), dismissed, 'late callbacks cannot restore old rounds');
});

test('mismatched rounds, remote images, invalid times and oversized captures are ignored', () => {
  const state = initial();
  for (const invalid of [
    { ...capture, roundIndex: 11 }, { ...capture, capturedAt: NaN },
    { ...capture, capturedAt: round.burnAt - 1 }, { ...capture, capturedAt: round.ashesAt },
    { ...capture, dataUrl: 'https://example.test/fake-photo.jpg' },
    { ...capture, dataUrl: 'data:image/svg+xml;base64,Zg==' },
    { ...capture, dataUrl: 'data:image/jpeg;base64,' },
    { ...capture, dataUrl: `data:image/jpeg;base64,${'x'.repeat(17_000_000)}` },
  ]) assert.equal(photo.receiveCelebrationPhoto(state, invalid, round), state);
  assert.equal(photo.receiveCelebrationPhoto(state, capture, null), state);
});

test('Polaroid layout preserves the complete frame and reserves generous white paper and caption space', () => {
  assert.equal(typeof photo.polaroidLayout, 'function');
  for (const [width, height] of [[1600, 1600], [800, 1600], [1600, 900]]) {
    const layout = photo.polaroidLayout(width, height);
    assert.ok(layout.width <= 1200 && layout.height <= 1800, 'export memory is bounded');
    assert.ok(layout.image.x >= layout.width * .055);
    assert.ok(layout.height - layout.image.y - layout.image.height >= layout.height * .13);
    assert.ok(Math.abs(layout.image.width / layout.image.height - width / height) < .005, 'no crop or distortion');
    assert.ok(layout.titleY > layout.image.y + layout.image.height);
    assert.ok(layout.captionY > layout.titleY && layout.dateY > layout.captionY);
    assert.ok(layout.dateY < layout.height);
  }
  assert.throws(() => photo.polaroidLayout(0, 400), /dimensions/i);
});

test('export paint draws the actual image, warm paper, title, poem and date', () => {
  assert.equal(typeof photo.paintCelebrationPhoto, 'function');
  const calls = [], context = {
    fillRect(...args) { calls.push(['fillRect', this.fillStyle, ...args]); },
    drawImage(...args) { calls.push(['drawImage', ...args]); },
    fillText(...args) { calls.push(['fillText', ...args]); },
  };
  const frame = { width: 1200, height: 1200 }, layout = photo.polaroidLayout(1200, 1200);
  photo.paintCelebrationPhoto(context, frame, layout, capture);
  assert.deepEqual(calls[0], ['fillRect', '#fffdf7', 0, 0, layout.width, layout.height]);
  const drawn = calls.find(call => call[0] === 'drawImage');
  assert.equal(drawn[1], frame, 'the captured frame is the only image source');
  assert.deepEqual(drawn.slice(2), [layout.image.x, layout.image.y, layout.image.width, layout.image.height]);
  const text = calls.filter(call => call[0] === 'fillText').map(call => call[1]).join('\n');
  assert.match(text, /余烬之后/);
  assert.match(text, /把形状还给风，把此刻留给我们。/);
  assert.match(text, /火人节 · 即梦/);
  assert.doesNotMatch(text, /第 12 轮/);
});

test('builder credits use actual round installation identities, retain observed departed names and omit unknown people', () => {
  const snapshot = { round, participants: [{id:'one', name:'阿岚'}, {id:'viewer', name:'旁观者'}], ambientParticipants:[{id:'ambient',name:'旅人'}], installations:[{actorId:'one',roundIndex:12,createdAt:100}, {actorId:'one',roundIndex:12,createdAt:200}, {actorId:'unknown',roundIndex:12,createdAt:100}, {actorId:'viewer',roundIndex:11,createdAt:100}], ambientInstallations:[{actorId:'ambient',roundIndex:12,createdAt:100}] };
  const roster = photo.rememberPhotoBuilders(null, snapshot);
  snapshot.participants = [];
  assert.deepEqual(photo.capturedPhotoBuilderNames(snapshot, roster, capture.capturedAt), ['阿岚', '旅人']);
  assert.deepEqual(photo.capturedPhotoBuilderNames(snapshot, null, capture.capturedAt), ['旅人']);
  const next = {...snapshot, round:{...round,index:13},ambientParticipants:[],ambientInstallations:[],installations:[{actorId:'one',roundIndex:13,createdAt:100}]};
  const nextRoster = photo.rememberPhotoBuilders(roster,next);
  assert.equal(nextRoster.names.size,0);
  assert.deepEqual(photo.capturedPhotoBuilderNames(next,nextRoster,capture.capturedAt),[]);
});

test('received credits are frozen for the photographed round', () => {
  const names = ['阿岚'];
  const state = photo.receiveCelebrationPhoto(initial(), {...capture,builderNames:names},round);
  names[0] = 'changed'; names.push('new arrival');
  assert.deepEqual(photo.presentCelebrationPhoto(state,allowed).displayed.builderNames,['阿岚']);
});

test('long multilingual builder credits wrap and export all lines within the paper', () => {
  const credited = {...capture,builderNames:Array.from({length:30},(_,i)=>`共建旅人${i}abcdefg`)};
  const lines = photo.celebrationPhotoBuilderLines(credited);
  assert.ok(lines.length > 1);
  assert.deepEqual(photo.celebrationPhotoBuilderLines(capture),[]);
  assert.deepEqual(photo.celebrationPhotoBuilderLines({builderNames:['  ']}),[]);
  const layout = photo.polaroidLayout(1600,1600,lines.length);
  assert.ok(layout.height <= 1800);
  assert.ok(layout.buildersY > layout.dateY);
  assert.ok(layout.buildersY + (lines.length-1)*layout.builderLineHeight + 10*layout.scale < layout.height);
  const calls=[];
  const context={fillRect(){},drawImage(){},fillText(text,x,y){calls.push({text,y,color:this.fillStyle});}};
  photo.paintCelebrationPhoto(context,{},layout,credited);
  assert.deepEqual(calls.slice(3).map(call=>call.text),lines);
  assert.ok(calls.slice(3).every(call=>call.color === '#969084' && call.y < layout.height));
  for (const name of credited.builderNames) assert.ok(lines.join('').includes(name));
});
