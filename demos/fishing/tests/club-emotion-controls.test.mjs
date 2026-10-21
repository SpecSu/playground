import './room-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { activePersonalAction } from '../lib/room-action-state.ts';
import { createOwnActionPreview, projectOwnAction, settleOwnActionPreview } from '../lib/club-action-preview.ts';

const source = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LiveFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expected = [
  { id: 'love', label: '喜欢', emoji: '❤️' },
  { id: 'laugh', label: '大笑', emoji: '🤣' },
  { id: 'punch', label: '挥拳', emoji: '🥊' },
  { id: 'ghost', label: '搞怪', emoji: '👻' },
];
let choices;
let row;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'EMOTION_MOVES') choices = node.initializer.getText(ast);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'div' && /className="emotion-controls"/.test(node.openingElement.attributes.getText(ast))) row = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

function renderRow(selectedOwnAction = null, personalActionsReady = true) {
  assert.ok(choices && row, 'the personal panel renders the emoji emotion row');
  const clicked = [];
  const context = vm.createContext({ React, selectedOwnAction, personalActionsReady, chooseMove: id => clicked.push(id) });
  const code = ts.transpileModule(`const EMOTION_MOVES = ${choices}; globalThis.element = (${row});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  vm.runInContext(code, context);
  return { element: context.element, buttons: context.element.props.children, clicked };
}

test('the personal panel renders exactly four compact accessible emoji controls in the approved order', () => {
  const { element, buttons, clicked } = renderRow();
  assert.equal(element.props.role, 'group');
  assert.equal(element.props['aria-label'], '选择你的表情动作');
  assert.equal(buttons.length, expected.length);
  for (const [index, choice] of expected.entries()) {
    const button = buttons[index];
    assert.equal(button.type, 'button');
    assert.equal(button.props['aria-label'], choice.label);
    assert.equal(button.props.title, choice.label);
    assert.equal(button.props.disabled, false);
    assert.equal(button.props['aria-pressed'], false);
    const [icon, label] = button.props.children;
    assert.equal(icon.props['aria-hidden'], true);
    assert.equal(icon.props.children, choice.emoji);
    assert.equal(label.props.children, choice.label);
    button.props.onClick();
    assert.equal(clicked[index], choice.id);
  }
  const html = renderToStaticMarkup(element);
  assert.equal((html.match(/<button /g) ?? []).length, 4);
  for (const choice of expected) assert.ok(html.includes(choice.emoji));
  const css = readFileSync(new URL('../components/FeedInterface.css', import.meta.url), 'utf8').replace(/\s+/g, '');
  assert.match(css, /\.personal-actions-grid\.emotion-controls\{display:contents/);
  assert.match(css, /\.option-grid\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.option-card\{[^}]*min-height:71px/);
});

test('emoji controls reuse disabled readiness and exact six-second personal highlighting', () => {
  for (const { id } of expected) {
    const participant = { action: id, actionAt: 1000, actionUntil: 7000 };
    for (const now of [999, 1000, 6999, 7000, 12000]) {
      const selected = activePersonalAction(participant, now);
      const { buttons } = renderRow(selected, false);
      for (const [index, button] of buttons.entries()) {
        const pressed = expected[index].id === selected;
        assert.equal(button.props.disabled, true);
        assert.equal(button.props['aria-pressed'], pressed);
        assert.equal(button.props.className.split(/\s+/).includes('selected'), pressed);
      }
    }
  }
});

test('every emoji immediately previews only its owner and rolls back without changing the canonical room', () => {
  const person = id => ({ id, name: id, preset: 'cat', slot: id === 'me' ? 0 : 1, joinedAt: 100, lastSeenAt: 100, action: 'dance', actionAt: 100, actionUntil: 0 });
  const snapshot = { self: { id: 'me', role: 'participant' }, participants: [person('me'), person('other')], serverNow: 100 };
  for (const { id } of expected) {
    const before = structuredClone(snapshot);
    const preview = createOwnActionPreview(snapshot, id, 1500, 1);
    const projected = projectOwnAction(snapshot.participants, 'me', preview);
    assert.equal(projected[0].action, id);
    assert.equal(projected[0].actionAt, 1500);
    assert.equal(projected[0].actionUntil, 7500);
    assert.equal(projected[1], snapshot.participants[1]);
    assert.equal(activePersonalAction(projected[0], 7500), null);
    assert.deepEqual(snapshot, before);
    assert.equal(projectOwnAction(snapshot.participants, 'me', settleOwnActionPreview(preview, 1)), snapshot.participants);
    assert.equal(createOwnActionPreview({ ...snapshot, self: { ...snapshot.self, role: 'spectator' } }, id, 1500, 2), null);
  }
});
