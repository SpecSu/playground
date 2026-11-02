import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as actionState from '../lib/room-action-state.ts';
import { createOwnActionPreview, projectOwnAction, settleOwnActionPreview } from '../lib/club-action-preview.ts';

// Execute the real menu expressions and clock effect. No browser, scene, audio,
// network, or fake copy of the production selection/scheduling logic is used.
const source = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LiveFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const renderValues = new Map();
let clockEffect;
let clockDependencies;
let pressed;
let className;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['actionServerNow', 'selectedOwnAction'].includes(node.name.getText(ast))) {
    renderValues.set(node.name.getText(ast), node.initializer.getText(ast));
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && /setAction(?:Client)?Now/.test(node.arguments[0]?.getText(ast) ?? '')) {
    clockEffect = node.arguments[0].getText(ast);
    clockDependencies = node.arguments[1].getText(ast);
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'button' && node.attributes.getText(ast).includes('className={`move-button ')) {
    for (const attribute of node.attributes.properties) {
      if (attribute.name?.getText(ast) === 'aria-pressed') pressed = attribute.initializer.expression.getText(ast);
      if (attribute.name?.getText(ast) === 'className') className = attribute.initializer.expression.getText(ast);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(clockEffect && pressed && className, 'exercise the production action menu and its feedback clock');
const person = { id: 'me', name: 'Me', preset: 'frog', slot: 0, joinedAt: 100, lastSeenAt: 1000, action: 'wave', actionAt: 10_000, actionUntil: 16_000 };
const snapshot = participant => ({ self: { id: 'me', role: 'participant', lastSequence: 1 }, participants: [participant], serverNow: 10_000, groupAction: null });
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(participant = person, now = 1000, offset = 9000) {
  let localNow = now;
  let cleanup;
  let nextTimer = 0;
  const timers = new Map();
  const context = vm.createContext({
    ...actionState, displayedSelf: participant, snapshot: snapshot(participant),
    room: { status: 'live', serverOffsetMs: offset, lastSyncedAt: now },
    actionNow: 0, actionClientNow: 0, GROUP_ACTION_COOLDOWN_MS: 5000,
    Date: { now: () => localNow },
    setActionNow(value) { context.actionNow = value; },
    setActionClientNow(value) { context.actionClientNow = value; },
    setInterval(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay, next: localNow + delay }); return id; },
    clearInterval(id) { timers.delete(id); },
  });
  vm.runInContext(compile(`globalThis.clockEffect = ${clockEffect};`), context);
  return {
    context, timers,
    startClock() { cleanup?.(); cleanup = context.clockEffect(); },
    stopClock() { cleanup?.(); },
    advance(milliseconds) {
      const target = localNow + milliseconds;
      for (;;) {
        const earliest = [...timers.entries()].filter(([, timer]) => timer.next <= target).sort((a, b) => a[1].next - b[1].next)[0];
        if (!earliest) break;
        const [id, timer] = earliest;
        localNow = timer.next;
        timer.next += timer.delay;
        if (timers.has(id)) timer.callback();
      }
      localNow = target;
    },
    dependencies() { return vm.runInContext(clockDependencies, context); },
    selected(id) {
      context.id = id;
      for (const [name, expression] of renderValues) vm.runInContext(compile(`globalThis.${name} = ${expression};`), context);
      const aria = vm.runInContext(pressed, context);
      const styled = vm.runInContext(className, context).split(/\s+/).includes('selected');
      assert.equal(styled, aria, 'visual selection and accessibility state agree');
      return aria;
    },
  };
}

test('personal menu selection clears at the authoritative expiry without another room update', () => {
  const ui = harness();
  ui.startClock();
  assert.equal(ui.selected('wave'), true);
  ui.advance(5900);
  assert.equal(ui.selected('wave'), true);
  ui.advance(100);
  assert.equal(ui.selected('wave'), false, 'the retained last action must not stay highlighted after roaming resumes');
  assert.equal(ui.timers.size, 0, 'the feedback clock stops when there is nothing left to count down');
});

test('initial/default, legacy, missing and future personal actions have no selected menu button', () => {
  for (const participant of [undefined, { ...person, action: 'dance', actionUntil: 0 }, { ...person, actionUntil: undefined }, { ...person, actionAt: 11_000 }]) {
    const ui = harness(participant);
    if (participant === undefined) ui.context.displayedSelf = undefined;
    for (const action of ['dance', 'bounce', 'spin', 'wave']) assert.equal(ui.selected(action), false);
  }
});

test('expiry uses corrected server time and keeps ticking through reconnects', () => {
  const ui = harness(person, 1000, 9000);
  ui.context.room.status = 'reconnecting';
  ui.startClock();
  ui.advance(2000);
  ui.context.room.serverOffsetMs = 11_000;
  ui.startClock();
  assert.equal(ui.selected('wave'), true);
  ui.advance(2000);
  assert.equal(ui.selected('wave'), false, 'positive clock correction shortens remaining client time');
});

test('a negative server-clock correction does not retain a stale server-time high-water mark', () => {
  const ui = harness();
  ui.startClock();
  ui.advance(4000);
  ui.context.room.serverOffsetMs = 5000;
  ui.startClock();
  ui.advance(2000);
  assert.equal(ui.selected('wave'), true);
  ui.advance(4000);
  assert.equal(ui.selected('wave'), false);
});

test('an optimistic action is selected immediately, survives stale polls and expires without acknowledgement', () => {
  const room = snapshot({ ...person, action: 'dance', actionAt: 100, actionUntil: 0 });
  const preview = createOwnActionPreview(room, 'spin', 10_000, 1);
  const projected = projectOwnAction(room.participants, 'me', preview)[0];
  const ui = harness(projected);
  assert.equal(ui.selected('spin'), true);
  ui.startClock();
  ui.context.displayedSelf = projectOwnAction([...room.participants], 'me', preview)[0];
  ui.advance(6000);
  assert.equal(ui.selected('spin'), false);
});

test('repeating the same action reschedules expiry rather than using the earlier deadline', () => {
  const ui = harness();
  ui.startClock();
  const previousDependencies = [...ui.dependencies()];
  ui.advance(2000);
  const preview = createOwnActionPreview(snapshot(person), 'wave', 12_000, 2);
  ui.context.displayedSelf = projectOwnAction([person], 'me', preview)[0];
  assert.notDeepEqual([...ui.dependencies()], previousDependencies, 'React reruns the effect when a repeated action replaces the interval');
  ui.startClock();
  ui.advance(4000);
  assert.equal(ui.selected('wave'), true);
  ui.advance(2000);
  assert.equal(ui.selected('wave'), false);
});

test('an acknowledgement received after expiry never resurrects the selection', () => {
  const ui = harness();
  const preview = createOwnActionPreview(snapshot(person), 'spin', 10_000, 3);
  ui.context.displayedSelf = projectOwnAction([person], 'me', preview)[0];
  ui.startClock();
  ui.advance(7000);
  const accepted = { ...person, action: 'spin', actionAt: 10_050, actionUntil: 16_050 };
  ui.context.displayedSelf = projectOwnAction([accepted], 'me', settleOwnActionPreview(preview, 3))[0];
  ui.context.room.lastSyncedAt = 8000;
  ui.context.snapshot.serverNow = 17_000;
  assert.equal(ui.selected('spin'), false);
  ui.startClock();
  assert.equal(ui.timers.size, 0);
});

test('personal expiry does not stop the group feedback clock early, and cleanup removes its timer', () => {
  const ui = harness();
  ui.context.snapshot.groupAction = { endsAt: 25_000 };
  ui.startClock();
  ui.advance(6000);
  assert.equal(ui.selected('wave'), false);
  assert.equal(ui.timers.size, 1);
  ui.stopClock();
  assert.equal(ui.timers.size, 0);
});
