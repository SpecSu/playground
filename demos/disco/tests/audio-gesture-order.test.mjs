import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the production gesture and explicit-button closures without starting
// a browser or AudioContext. State flushes between pointerdown and click, just
// as React may do after an autoplay retry succeeds.
const source = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LiveFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
const buttons = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['requestSoundFromGesture', 'enableSound', 'toggleSound'].includes(node.name.getText(ast))) {
    const initializer = node.initializer;
    functions.set(node.name.getText(ast), (ts.isCallExpression(initializer) ? initializer.arguments[0] : initializer).getText(ast));
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'button') {
    const text = node.attributes.getText(ast);
    if (/className=.*sound-control/.test(text)) {
      const onClick = node.attributes.properties.find(attribute => attribute.name?.getText(ast) === 'onClick');
      buttons.push({ name: 'outer icon', handler: onClick.initializer.expression.getText(ast), marked: node.attributes.properties.some(attribute => attribute.name?.getText(ast) === 'data-sound-toggle') });
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(buttons.length, 1, 'the music strip has one direct sound toggle');
class Element {
  constructor(soundToggle) { this.soundToggle = soundToggle; }
  closest(selector) { return selector === '[data-sound-toggle]' && this.soundToggle ? this : null; }
}
function harness(button) {
  const state = { requests: 0, muted: false };
  const context = vm.createContext({
    Element, soundEnabled: false, soundError: null, soundNeedsGesture: true, muted: false,
    setMuted(value) { context.muted = value; },
    audio: { current: {
      setMuted(value) { state.muted = value; context.muted = value; },
      requestPlayback() { state.requests++; context.soundEnabled = true; context.soundNeedsGesture = false; },
    } },
  });
  const code = `globalThis.requestSoundFromGesture = ${functions.get('requestSoundFromGesture')}; globalThis.enableSound = ${functions.get('enableSound')}; globalThis.toggleSound = ${functions.get('toggleSound')}; globalThis.soundClick = ${button.handler};`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, state };
}

for (const button of buttons) test(`${button.name} sound control first tap enables sound despite state flushing between pointerdown and click`, () => {
  assert.equal(button.marked, true, 'capture gestures must leave the sound icon to its own click handler');
  const { context, state } = harness(button);
  const event = { isTrusted: true, target: new Element(button.marked) };
  context.requestSoundFromGesture(event); // pointerdown capture
  context.requestSoundFromGesture(event); // pointerup capture
  context.requestSoundFromGesture(event); // click capture
  context.soundClick();
  assert.equal(state.muted, false, 'the first sound-control tap must not unlock and immediately mute');
  assert.equal(state.requests, 1, 'explicit sound controls own their playback request');
  assert.equal(context.soundEnabled, true);
  context.requestSoundFromGesture(event);
  context.soundClick();
  assert.equal(state.muted, true, 'the next explicit tap still mutes for the session');
  assert.equal(state.requests, 1, 'muting must not enqueue another playback request');
});

test('ordinary trusted gestures retry sound while synthetic events do not', () => {
  const { context, state } = harness(buttons[0]);
  context.requestSoundFromGesture({ isTrusted: false, target: new Element(false) });
  assert.equal(state.requests, 0);
  context.requestSoundFromGesture({ isTrusted: true, target: new Element(false) });
  assert.equal(state.requests, 1);
});

test('ordinary gestures cannot undo an explicit mute and only the sound icon re-enables it', () => {
  const { context, state } = harness(buttons[0]);
  context.soundClick();
  context.soundClick();
  assert.equal(state.muted, true);
  for (let count = 0; count < 4; count++) context.requestSoundFromGesture({ isTrusted: true, target: new Element(false) });
  assert.equal(state.muted, true, 'ambient pointer, click, and keyboard retries never clear session mute');
  const requests = state.requests;
  const event = { isTrusted: true, target: new Element(true) };
  context.requestSoundFromGesture(event); // keyboard capture on the icon
  assert.equal(state.requests, requests);
  context.soundClick();
  assert.equal(state.muted, false);
  assert.equal(state.requests, requests + 1, 'explicit unmute synchronously requests playback');
});
