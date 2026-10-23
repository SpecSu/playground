import test from 'node:test';
import assert from 'node:assert/strict';
import { initialOpening, advanceOpening, skipOpening, selectOpeningGuardian, completeOpening, openingPresentation, type OpeningState } from '../src/v5/opening.ts';
import type { GuardianKind } from '../src/v5/threat.ts';

const playing = { ready: true, visible: true, covered: false };
const resume = (state: OpeningState): OpeningState => JSON.parse(JSON.stringify(state));

test('opening shows the farm, rustle, approach and startled animals before offering a guardian', () => {
  let state = initialOpening();
  assert.equal(state.stage, 'establish');
  state = advanceOpening(state, 1.6, playing);
  assert.equal(state.stage, 'rustle');
  state = advanceOpening(state, 1.3, playing);
  assert.equal(state.stage, 'approach');
  state = advanceOpening(state, 4.5, playing);
  assert.equal(state.stage, 'startle');
  state = advanceOpening(state, 2, playing);
  assert.equal(state.stage, 'choose');
  assert.equal(state.guardian, null);
});

test('stage boundaries preserve elapsed remainder but never choose a guardian automatically', () => {
  const original = initialOpening();
  const approach = advanceOpening(original, 4, playing);
  assert.equal(approach.stage, 'approach');
  assert.equal(approach.elapsed, 1.1);
  assert.equal(original.stage, 'establish');
  const choosing = advanceOpening(approach, 500, playing);
  assert.equal(choosing.stage, 'choose');
  assert.equal(choosing.elapsed, 0);
  assert.deepEqual(advanceOpening(choosing, 500, playing), choosing);
});

test('asset loading, a hidden page and a covering panel pause each timed stage', () => {
  const stages: OpeningState[] = [
    initialOpening(),
    advanceOpening(initialOpening(), 1.6, playing),
    advanceOpening(initialOpening(), 2.9, playing),
    advanceOpening(initialOpening(), 7.4, playing),
    selectOpeningGuardian(skipOpening(initialOpening()), 'dog'),
  ];
  for (const state of stages) {
    for (const gates of [ { ...playing, ready: false }, { ...playing, visible: false }, { ...playing, covered: true } ]) {
      assert.deepEqual(advanceOpening(state, 100, gates), state);
    }
  }
});

test('skip reaches choice from every pre-choice phase without making a world decision', () => {
  for (const seconds of [0, 1.6, 2.9, 7.4]) {
    const state = advanceOpening(initialOpening(), seconds, playing);
    const skipped = skipOpening(state);
    assert.equal(skipped.stage, 'choose');
    assert.equal(skipped.elapsed, 0);
    assert.equal(skipped.guardian, null);
    assert.deepEqual(skipOpening(skipped), skipped);
  }
});

test('each chosen guardian receives a complete arrival before defense becomes playable', () => {
  for (const guardian of ['dog', 'cat', 'frog'] as const) {
    const arrival = selectOpeningGuardian(skipOpening(initialOpening()), guardian);
    assert.equal(arrival.stage, 'arrival');
    assert.equal(arrival.guardian, guardian);
    assert.equal(advanceOpening(arrival, 2.999, playing).stage, 'arrival');
    const defending = advanceOpening(advanceOpening(arrival, 2.999, playing), .001, playing);
    assert.equal(defending.stage, 'defend');
    assert.equal(defending.guardian, guardian);
    assert.deepEqual(advanceOpening(defending, 500, playing), defending);
  }
});

test('invalid, early and repeated selection cannot restart arrival or change the guardian', () => {
  const initial = initialOpening();
  assert.deepEqual(selectOpeningGuardian(initial, 'dog'), initial);
  const choosing = skipOpening(initial);
  assert.deepEqual(selectOpeningGuardian(choosing, 'wolf' as GuardianKind), choosing);
  const arrival = advanceOpening(selectOpeningGuardian(choosing, 'cat'), 1.2, playing);
  assert.deepEqual(selectOpeningGuardian(arrival, 'cat'), arrival);
  assert.deepEqual(selectOpeningGuardian(arrival, 'frog'), arrival);
  const defending = skipOpening(arrival);
  assert.deepEqual(selectOpeningGuardian(defending, 'dog'), defending);
});

test('skipping guardian arrival preserves the selected companion and stops at defense', () => {
  const arrival = selectOpeningGuardian(skipOpening(initialOpening()), 'frog');
  const defending = skipOpening(arrival);
  assert.equal(defending.stage, 'defend');
  assert.equal(defending.guardian, 'frog');
  assert.equal(defending.elapsed, 0);
  assert.deepEqual(skipOpening(defending), defending);
});

test('defense completion is explicit, idempotent and cannot bypass the opening', () => {
  const initial = initialOpening();
  assert.deepEqual(completeOpening(initial), initial);
  const defending = skipOpening(selectOpeningGuardian(skipOpening(initial), 'dog'));
  const done = completeOpening(defending);
  assert.equal(done.stage, 'done');
  assert.equal(done.guardian, 'dog');
  assert.deepEqual(completeOpening(done), done);
  assert.deepEqual(skipOpening(done), done);
  assert.deepEqual(advanceOpening(done, 500, playing), done);
});

test('serialized progress resumes the same scene without replaying earlier stages', () => {
  const approach = advanceOpening(initialOpening(), 4.8, playing);
  assert.deepEqual(advanceOpening(resume(approach), .9, playing), advanceOpening(approach, .9, playing));
  const arrival = advanceOpening(selectOpeningGuardian(skipOpening(initialOpening()), 'cat'), 2, playing);
  assert.equal(advanceOpening(resume(arrival), 1, playing).stage, 'defend');
  assert.equal(advanceOpening(resume(arrival), .5, playing).guardian, 'cat');
});

test('existing defense and completed tutorial saves never replay the cinematic', () => {
  assert.equal(initialOpening('choose').stage, 'establish');
  assert.equal(initialOpening('defend').stage, 'defend');
  assert.equal(initialOpening('done').stage, 'done');
  assert.equal(advanceOpening(initialOpening('done'), 500, playing).stage, 'done');
});

test('invalid time cannot skip scenes or poison serializable progress', () => {
  const initial = initialOpening();
  for (const dt of [NaN, Infinity, -Infinity, -1, 0]) assert.deepEqual(advanceOpening(initial, dt, playing), initial);
  const state = advanceOpening(initial, .8, playing);
  assert.equal(openingPresentation(state).progress, .5);
  assert.deepEqual(resume(state), state);
});

test('presentation provides normalized animation progress, focus and short actionable captions', () => {
  const phases = [initialOpening(), advanceOpening(initialOpening(), 1.6, playing), advanceOpening(initialOpening(), 2.9, playing), advanceOpening(initialOpening(), 7.4, playing), skipOpening(initialOpening()), selectOpeningGuardian(skipOpening(initialOpening()), 'dog'), initialOpening('defend'), initialOpening('done')];
  for (const state of phases) {
    const presentation = openingPresentation(state);
    assert.ok(presentation.progress >= 0 && presentation.progress <= 1);
    assert.ok(presentation.caption.length > 0 && presentation.caption.length <= 45);
    assert.ok(presentation.focus);
  }
  const choice = openingPresentation(skipOpening(initialOpening()));
  assert.equal(choice.requiresChoice, true);
  assert.equal(choice.canSkip, false);
  assert.equal(openingPresentation(initialOpening('defend')).controlsLocked, false);
  assert.equal(openingPresentation(initialOpening()).controlsLocked, false);
  const captions = new Set((['dog', 'cat', 'frog'] as const).map(kind => openingPresentation(selectOpeningGuardian(skipOpening(initialOpening()), kind)).caption));
  assert.equal(captions.size, 3);
});
