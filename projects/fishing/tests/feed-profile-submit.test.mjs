import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';

// Exercise the real submit JSX without a browser, network, WebGL, or audio.
const source = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LiveFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submitJsx; let pendingExpression;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button' &&
    /className="join-button primary-button"/.test(node.openingElement.attributes.getText(ast))) submitJsx = node.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'profilePending') pendingExpression = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const javascript = ts.transpileModule(`const profilePending = ${pendingExpression}; globalThis.render = () => (${submitJsx});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
function render({ joined = false, busy = false, full = false, name = 'Dancer', ready = true, pending } = {}) {
  const context = vm.createContext({
    joined, full, name, ready,
    pending: pending ?? (busy ? { type: joined ? 'profile' : 'join' } : null),
    LoaderCircle: 'LoaderCircle',
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
  });
  vm.runInContext(javascript, context);
  return context.render();
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}

for (const joined of [false, true]) {
  test(`${joined ? 'save-avatar' : 'join-floor'} keeps one stable label while its independent pending indicator appears`, () => {
    const idle = render({ joined }); const busy = render({ joined, busy: true });
    const label = joined ? '保存形象' : '加入舞池';
    assert.equal(text(idle), label);
    assert.equal(text(busy), label, 'a request must not replace the label during a mobile repaint');
    assert.equal(nodes(busy, node => node.props?.className === 'profile-submit-label').length, 1);
    for (const button of [idle, busy]) {
      const slots = nodes(button, node => node.props?.className === 'profile-submit-status');
      assert.equal(slots.length, 1, 'the spinner slot stays mounted before and during the request');
      assert.equal(slots[0].props['aria-hidden'], 'true');
    }
    assert.equal(nodes(idle, node => node.type === 'LoaderCircle').length, 0);
    assert.equal(nodes(busy, node => node.type === 'LoaderCircle').length, 1);
    assert.equal(idle.props['aria-busy'], false);
    assert.equal(busy.props['aria-busy'], true);
    assert.equal(busy.props.disabled, true);
    assert.equal(render({ joined }).props.disabled, false, 'settling or retrying restores the same control');
  });
}

test('the full-room label is stable and existing blank-name/connection guards remain', () => {
  assert.equal(text(render({ full: true, busy: true })), '试试加入舞池');
  assert.equal(render({ name: '  ' }).props.disabled, true);
  assert.equal(render({ ready: false }).props.disabled, true);
});

test('unrelated room requests disable the control without announcing a profile submission', () => {
  for (const type of ['track', 'track-step', 'lights', 'leave', 'group-action']) {
    const button = render({ pending: { type } });
    assert.equal(button.props.disabled, true);
    assert.equal(button.props['aria-busy'], false);
    assert.equal(nodes(button, node => node.type === 'LoaderCircle').length, 0);
  }
});

const sheets = ['../app/globals.css', '../components/FeedInterface.css'].map(path =>
  postcss.parse(readFileSync(new URL(path, import.meta.url), 'utf8')));
function cascade(selectors) {
  const winners = new Map();
  for (const sheet of sheets) sheet.walkRules(rule => {
    const priority = Math.max(-1, ...rule.selectors.map(selector => selectors.get(selector) ?? -1));
    if (priority < 0) return;
    rule.walkDecls(declaration => {
      const previous = winners.get(declaration.prop);
      if (!previous || priority >= previous.priority) winners.set(declaration.prop, { value: declaration.value, priority });
    });
  });
  return Object.fromEntries([...winners].map(([key, { value }]) => [key, value]));
}
test('submit text and spinner occupy separate stable columns with an explicit readable line box', () => {
  const content = cascade(new Map([['.feed-v020 .profile-submit-content', 20]]));
  assert.equal(content.display, 'inline-grid');
  assert.equal(content['grid-template-columns'], '17px max-content 17px');
  assert.equal(content['column-gap'], '8px');
  assert.equal(content['align-items'], 'center');
  const label = cascade(new Map([['.feed-v020 .profile-submit-label', 20]]));
  assert.equal(label['grid-column'], '2');
  assert.equal(label['line-height'], '20px');
  assert.equal(label['white-space'], 'nowrap');
  const slot = cascade(new Map([['.feed-v020 .profile-submit-status', 20]]));
  assert.equal(slot['grid-column'], '3');
  assert.equal(slot.width, '17px'); assert.equal(slot.height, '17px');
});
