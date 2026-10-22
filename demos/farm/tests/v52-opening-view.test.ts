import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OpeningOverlay, { type OpeningOverlayProps } from '../src/v5/OpeningOverlay.tsx';
import { initialOpening, advanceOpening, skipOpening, selectOpeningGuardian, completeOpening } from '../src/v5/opening.ts';

const playing = { ready: true, visible: true, covered: false };
const noop = () => {};
const props: OpeningOverlayProps = {
  opening: initialOpening(), ready: true, replay: false, busy: false,
  onSkip: noop, onSelect: noop, onDefend: noop, onExitReplay: noop, onCare: noop,
};
const render = (overrides: Partial<OpeningOverlayProps> = {}) => renderToStaticMarkup(createElement(OpeningOverlay, { ...props, ...overrides }));
const choosing = skipOpening(initialOpening());
const arrival = selectOpeningGuardian(choosing, 'dog');
const defending = skipOpening(arrival);

test('cinematic phases show the scene caption and skip without offering a premature guardian choice', () => {
  for (const seconds of [0, 1.6, 2.9, 5.9]) {
    const opening = advanceOpening(initialOpening(), seconds, playing);
    const html = render({ opening });
    assert.match(html, new RegExp(`data-opening-stage="${opening.stage}"`));
    assert.match(html, /跳过动画/);
    assert.match(html, /opening-overlay--blocking/);
    assert.doesNotMatch(html, /data-opening-guardian=|选择刀盾狗|选择喵脆角|选择奶蛙/);
  }
});

test('the choice sheet contains exactly three existing portraits and explains their different abilities', () => {
  const html = render({ opening: choosing });
  assert.equal((html.match(/data-opening-guardian=/g) ?? []).length, 3);
  for (const asset of ['sword-shield-dog', 'miaocuijiao', 'milk-frog']) assert.ok(html.includes(`/avatars/portraits/${asset}.webp`));
  for (const name of ['刀盾狗', '喵脆角', '奶蛙']) assert.ok(html.includes(`选择${name}`));
  assert.match(html, /入口/);
  assert.match(html, /引导/);
  assert.match(html, /安抚/);
  assert.match(html, /选择期间.*暂停/);
  assert.doesNotMatch(html, /跳过动画|phone-viewport|phone-screen/);
});

test('arrival waits for its animation and allows skipping directly to the selected guardian defense', () => {
  const html = render({ opening: arrival });
  assert.match(html, /data-opening-stage="arrival"/);
  assert.match(html, /刀盾狗赶来了/);
  assert.match(html, /跳过动画/);
  assert.doesNotMatch(html, /data-opening-guardian=|data-opening-action="defend"/);
});

test('defense exposes one clear ability action while leaving the scene available for movement', () => {
  const cases = [ ['dog', '守住入口'], ['cat', '引导幼崽'], ['frog', '安抚大家'] ] as const;
  for (const [kind, label] of cases) {
    const opening = skipOpening(selectOpeningGuardian(choosing, kind));
    const html = render({ opening });
    assert.match(html, /opening-overlay--defend/);
    assert.ok(html.includes(label));
    assert.equal((html.match(/data-opening-action="defend"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /data-opening-guardian=|跳过动画|opening-overlay--blocking/);
  }
});

test('independent replay is labeled honestly and can exit during every phase', () => {
  for (const opening of [initialOpening(), choosing, arrival, defending, completeOpening(defending)]) {
    const html = render({ opening, replay: true });
    assert.match(html, /独立开场演示 · 不改存档/);
    assert.match(html, /退出演示/);
  }
  assert.doesNotMatch(render(), /退出演示|独立开场演示/);
});

test('a completed real opening offers first care while a replay ends without a save mutation action', () => {
  const opening = completeOpening(defending);
  assert.match(render({ opening }), /data-opening-action="care"[^>]*>喂第一口/);
  const replay = render({ opening, replay: true });
  assert.match(replay, /退出演示/);
  assert.doesNotMatch(replay, /data-opening-action="care"|喂第一口/);
});

test('asset loading remains readable and never removes the pre-choice skip', () => {
  const html = render({ ready: false });
  assert.match(html, /准备.*场景/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /<button[^>]*data-opening-action="skip"(?![^>]*disabled)[^>]*>跳过动画/);
  const choice = render({ opening: choosing, ready: false });
  assert.equal((choice.match(/data-opening-guardian="[^"]+"[^>]*disabled/g) ?? []).length, 3);
});

test('busy state prevents duplicate choices and defense commands', () => {
  const html = render({ opening: choosing, busy: true });
  assert.equal((html.match(/data-opening-guardian="[^"]+"[^>]*disabled/g) ?? []).length, 3);
  assert.match(render({ opening: defending, busy: true }), /data-opening-action="defend"[^>]*disabled/);
});

test('save failure stays explicit and retry is offered only when supplied', () => {
  const html = render({ opening: choosing, error: '存档暂时没有保存', onRetry: noop });
  assert.match(html, /role="alert"/);
  assert.match(html, /存档暂时没有保存/);
  assert.match(html, /重试保存/);
  assert.equal((html.match(/data-opening-guardian="[^"]+"[^>]*disabled/g) ?? []).length, 3);
  assert.doesNotMatch(render({ error: '需要重试' }), /重试保存/);
});
test('wolf retreat suppresses the stale defense action and explains the short transition',()=>{
 const opening={...selectOpeningGuardian(choosing,'dog'),stage:'defend' as const};
 const html=render({opening,retreating:true} as Partial<OpeningOverlayProps>);
 assert.doesNotMatch(html,/data-opening-action="defend"/);assert.match(html,/狼正在退走/);
});
