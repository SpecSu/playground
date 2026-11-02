import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as joystick from '../lib/club-joystick.ts';

const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const javascript = ts.transpileModule(file('../components/ClubJoystick.tsx'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Resolve the enabled button's simple selectors across both production sheets.
// Merely finding touch-action:none in the legacy CSS missed the v0.2 override.
function touchActionForButton(className) {
  const css = [file('../app/globals.css'), file('../components/FeedInterface.css')].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const matches = new Map([
    ['button', 1], [`.${className}`, 10],
    ['.feed-v020 button', 11], [`.feed-v020 .${className}`, 20],
  ]);
  let winning = { specificity: -1, value: 'auto' };
  for (const [, selectors, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const value = declarations.match(/(?:^|;)\s*touch-action\s*:\s*([^;]+)/)?.[1].trim();
    if (!value) continue;
    for (const selector of selectors.split(',').map(value => value.trim())) {
      const specificity = matches.get(selector);
      if (specificity !== undefined && specificity >= winning.specificity) winning = { specificity, value };
    }
  }
  return winning.value;
}

class TrackedTarget extends EventTarget {
  registrations = [];
  addEventListener(type, callback, options) {
    this.registrations.push({ type, options });
    super.addEventListener(type, callback, options);
  }
}

function harness(enabled = true) {
  const effects = [];
  const window = new TrackedTarget();
  const document = new TrackedTarget();
  document.visibilityState = 'visible';
  const calls = { input: [], stops: 0 };
  const context = vm.createContext({ exports: {}, window, document,
    require(specifier) {
      if (specifier === 'react') return {
        useRef: current => ({ current }), useCallback: callback => callback,
        useEffect: callback => effects.push(callback),
      };
      if (specifier === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (specifier === 'lucide-react') return { Move: () => null };
      if (specifier === '@/lib/club-joystick') return joystick;
      throw new Error(`Unexpected import ${specifier}`);
    },
  });
  vm.runInContext(javascript, context);
  const tree = context.exports.default({ enabled, resetKey: 0,
    onInput: (vector, active) => calls.input.push({ x: vector.x, y: vector.y, active }),
    onStop: () => { calls.stops++; },
  });
  const button = tree.props.children.find(child => child.type === 'button');
  const pad = new TrackedTarget();
  const captured = new Set();
  pad.getBoundingClientRect = () => ({ left: 100, top: 200, width: 60, height: 60 });
  pad.hasPointerCapture = id => captured.has(id);
  pad.setPointerCapture = id => captured.add(id);
  pad.releasePointerCapture = id => captured.delete(id);
  button.props.ref.current = pad;
  const thumb = { style: {} };
  button.props.children.find(child => child.props.ref).props.ref.current = thumb;
  const cleanups = effects.map(callback => callback()).filter(Boolean);
  calls.input.length = 0;
  return { button, pad, thumb, window, document, calls, captured,
    unmount: () => cleanups.forEach(cleanup => cleanup()),
    pointer(name, overrides = {}) {
      button.props[name]({ pointerId: 1, button: 0, isPrimary: true, clientX: 160, clientY: 230,
        currentTarget: pad, preventDefault() {}, stopPropagation() {}, ...overrides });
    },
  };
}

test('the real feed joystick wins the touch-action cascade without blocking other buttons', () => {
  assert.equal(touchActionForButton('joystick-pad'), 'none');
  assert.equal(touchActionForButton('dock-control'), 'manipulation');
});

test('native pad touches cancel scrolling with non-passive listeners, without any global touch lock', () => {
  const h = harness();
  for (const type of ['touchstart', 'touchmove']) {
    const event = new Event(type, { cancelable: true });
    h.pad.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, `${type} cannot become page scrolling`);
    assert.equal(h.pad.registrations.find(listener => listener.type === type)?.options.passive, false);
    for (const target of [h.window, h.document, new TrackedTarget()]) {
      const outside = new Event(type, { cancelable: true });
      target.dispatchEvent(outside);
      assert.equal(outside.defaultPrevented, false, 'unrelated controls and drawers remain native');
    }
  }
  assert.equal(h.calls.input.length, 0, 'native touch guards do not duplicate movement inputs');
  assert.equal(h.window.registrations.some(listener => listener.type.startsWith('touch')), false);
  assert.equal(h.document.registrations.some(listener => listener.type.startsWith('touch')), false);
  h.unmount();
  for (const type of ['touchstart', 'touchmove']) {
    const event = new Event(type, { cancelable: true });
    h.pad.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, 'unmount removes native touch listeners');
  }
});

test('disabled pads do not install native touch guards', () => {
  const h = harness(false);
  assert.equal(h.pad.registrations.some(listener => listener.type.startsWith('touch')), false);
  h.pointer('onPointerDown');
  assert.equal(h.calls.input.length, 0);
  h.unmount();
});

test('touch scroll suppression keeps pointer movement, 12px thumb travel and release intact', () => {
  const h = harness();
  h.pointer('onPointerDown');
  h.pad.dispatchEvent(new Event('touchstart', { cancelable: true }));
  h.pointer('onPointerMove', { clientX: 220 });
  h.pad.dispatchEvent(new Event('touchmove', { cancelable: true }));
  assert.deepEqual(h.calls.input.at(-1), { x: 1, y: 0, active: true });
  assert.equal(h.thumb.style.transform, 'translate(12px, 0px)');
  assert.equal(h.captured.has(1), true);
  h.pointer('onPointerUp');
  assert.deepEqual(h.calls.input.at(-1), { x: 0, y: 0, active: false });
  assert.equal(h.captured.size, 0);
  assert.equal(h.calls.stops, 1);
  h.unmount();
});

for (const exit of ['onPointerCancel', 'onLostPointerCapture', 'onBlur', 'window-blur', 'document-hide']) {
  test(`${exit} stops the drag and ignores stray moves after touch suppression`, () => {
    const h = harness();
    h.pointer('onPointerDown');
    if (exit === 'window-blur') h.window.dispatchEvent(new Event('blur'));
    else if (exit === 'document-hide') { h.document.visibilityState = 'hidden'; h.document.dispatchEvent(new Event('visibilitychange')); }
    else h.pointer(exit);
    assert.deepEqual(h.calls.input.at(-1), { x: 0, y: 0, active: false });
    assert.equal(h.captured.size, 0);
    assert.equal(h.calls.stops, 1);
    const count = h.calls.input.length;
    h.pointer('onPointerMove');
    assert.equal(h.calls.input.length, count);
    h.unmount();
  });
}
