import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real dock button's JSX and event handler without mounting the
// WebGL scene, playing audio, connecting to a room, or launching a browser.
const source = readFileSync(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LiveFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let cameraButton;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button') {
    const attributes = node.openingElement.attributes.getText(ast);
    if (/camera-control|选择本地视角/.test(attributes)) cameraButton = node.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);

function harness(joined = false) {
  assert.ok(cameraButton, 'the camera dock button exists');
  const pending = [];
  const context = vm.createContext({
    cameraMode: 'overview', cameraResetKey: 0, joined, sheet: null,
    Maximize: 'Maximize', ScanEye: 'ScanEye',
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    openSheet: value => { context.sheet = value; },
    setCameraMode: update => pending.push(() => { context.cameraMode = typeof update === 'function' ? update(context.cameraMode) : update; }),
    setCameraResetKey: update => pending.push(() => { context.cameraResetKey = typeof update === 'function' ? update(context.cameraResetKey) : update; }),
  });
  const compiled = ts.transpileModule(`globalThis.render = () => (${cameraButton});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInContext(compiled, context);
  return { context, render: () => context.render(), flush: () => { while (pending.length) pending.shift()(); } };
}

const label = button => button.props.children.find(child => child?.type === 'span').props.children.join('');
const icon = button => button.props.children.find(child => child?.type !== 'span');

for (const joined of [false, true]) {
  test(`one tap toggles the camera directly for ${joined ? 'participants' : 'spectators'} and a second tap returns`, () => {
    const ui = harness(joined);
    const overview = ui.render();
    assert.equal(overview.props.disabled, undefined);
    overview.props.onClick(); ui.flush();
    assert.equal(ui.context.cameraMode, 'third-person');
    assert.equal(ui.context.sheet, null, 'changing the camera never opens a drawer');
    assert.equal(ui.context.cameraResetKey, 1, 'a new view resets its orbit');
    ui.render().props.onClick(); ui.flush();
    assert.equal(ui.context.cameraMode, 'overview');
    assert.equal(ui.context.cameraResetKey, 2);
    assert.equal(ui.context.sheet, null);
  });
}

test('the button label, icon and accessible name describe the destination view in both directions', () => {
  const ui = harness();
  const overview = ui.render();
  assert.equal(label(overview), '沉浸');
  assert.equal(icon(overview).type, 'ScanEye');
  assert.equal(icon(overview).props['aria-hidden'], 'true');
  assert.equal(overview.props['aria-pressed'], undefined, 'a destination action is not a pressed-state toggle');
  assert.equal(overview.props['aria-label'], '切换到沉浸视角');
  assert.match(overview.props.title, /^切换到沉浸视角：/);
  overview.props.onClick(); ui.flush();
  const immersive = ui.render();
  assert.equal(label(immersive), '全景');
  assert.equal(icon(immersive).type, 'Maximize');
  assert.equal(icon(immersive).props['aria-hidden'], 'true');
  assert.equal(immersive.props['aria-pressed'], undefined);
  assert.equal(immersive.props['aria-label'], '切换到全景视角');
  assert.equal(immersive.props.title, '切换到全景视角：舞池尽收眼底');
  assert.equal(immersive.props['aria-haspopup'], undefined, 'direct action is not announced as a popup');
  immersive.props.onClick(); ui.flush();
  assert.equal(label(ui.render()), '沉浸');
  assert.equal(icon(ui.render()).type, 'ScanEye');
  assert.equal(ui.render().props['aria-label'], '切换到沉浸视角');
});

test('rapid taps compose against the latest mode and each reset remains distinct', () => {
  const ui = harness();
  const button = ui.render();
  button.props.onClick(); button.props.onClick(); ui.flush();
  assert.equal(ui.context.cameraMode, 'overview', 'two batched taps return to the original mode');
  assert.equal(ui.context.cameraResetKey, 2);
  button.props.onClick(); button.props.onClick(); button.props.onClick(); ui.flush();
  assert.equal(ui.context.cameraMode, 'third-person');
  assert.equal(ui.context.cameraResetKey, 5);
});

test('the immersive destination tooltip describes DJ fallback and updates after joining', () => {
  const ui = harness();
  assert.equal(ui.render().props.title, '切换到沉浸视角：从身后跟随 DJ 凤头鹦鹉');
  ui.context.joined = true;
  assert.equal(ui.render().props.title, '切换到沉浸视角：从身后跟随你的角色');
  assert.equal(ui.context.cameraMode, 'overview', 'membership changes do not change the selected mode');
  ui.render().props.onClick(); ui.flush();
  ui.context.joined = false;
  assert.equal(ui.render().props.title, '切换到全景视角：舞池尽收眼底');
  assert.equal(ui.context.cameraMode, 'third-person', 'membership changes do not reset the selected mode');
});
