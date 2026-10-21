import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../components/DesertFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('DesertFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions = new Map();
let click;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['EMOTES', 'chooseEmote'].includes(node.name.getText(ast))) {
    expressions.set(node.name.getText(ast), node.initializer.getText(ast));
  }
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onClick' && node.initializer?.expression?.getText(ast).includes('chooseEmote(emote.id)')) {
    click = node.initializer.expression.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(sendResult = true) {
  const sent = [];
  let closed = 0;
  const context = vm.createContext({ sheetGeneration: { current: 1 }, send: async command => { sent.push(JSON.parse(JSON.stringify(command))); return sendResult; }, closeSheet: () => closed++ });
  for (const [name, expression] of expressions) vm.runInContext(compile(`globalThis.${name} = ${expression};`), context);
  assert.ok(click, 'use the real rendered option click handler');
  return { context, sent, get closed() { return closed; }, async click(id) { context.emote = context.EMOTES.find(option => option.id === id); assert.ok(context.emote, `${id} is available in the panel`); vm.runInContext(compile(`(${click})()`), context); await new Promise(resolve => setImmediate(resolve)); } };
}

test('ghost panel option sends the literal emoji through existing shared chat', async () => {
  const ui = harness();
  await ui.click('ghost');
  assert.equal(ui.context.emote.icon, '👻');
  assert.equal(ui.context.emote.name, '鬼脸');
  assert.deepEqual(ui.sent, [{ type: 'say', text: '👻' }]);
  assert.equal(ui.closed, 1);
});

test('existing action options remain intact and keep sending their original emote commands', async () => {
  const ui = harness();
  for (const id of ['wave', 'love', 'laugh', 'spin', 'dance']) await ui.click(id);
  assert.deepEqual(ui.sent, ['wave', 'love', 'laugh', 'spin', 'dance'].map(emote => ({ type: 'emote', emote })));
  assert.equal(ui.context.EMOTES.length, 6);
});

test('failed ghost send keeps the panel open', async () => {
  const ui = harness(false);
  await ui.click('ghost');
  assert.equal(ui.closed, 0);
});
