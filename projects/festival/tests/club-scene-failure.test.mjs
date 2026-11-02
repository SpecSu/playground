import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the component's actual closure rather than copying its recovery code.
// No DOM, WebGL, browser, audio, or network is started by this test.
const source = readFileSync(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ClubScene.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let failureHandler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'markFailed') failureHandler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(failureHandler, 'ClubScene declares its graphics failure handler');
function harness(stopThrows = false) {
  const state = { stops: 0, cancelled: [], graphics: [], avatar: [], warnings: [] };
  const originalError = new Error('render failed');
  const context = {
    alive: true, lost: false, frame: 17,
    stopMovement: () => { state.stops++; if (stopThrows) throw new Error('movement cleanup failed'); },
    cancelAnimationFrame: id => state.cancelled.push(id),
    setGraphics: value => state.graphics.push(value),
    setAvatarStatus: value => state.avatar.push(value),
    console: { warn: (...args) => state.warnings.push(args) },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`globalThis.markFailed = ${failureHandler}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { state, context, originalError };
}

test('graphics failure still cancels rendering and exposes recovery when movement cleanup throws', () => {
  const { state, context, originalError } = harness(true);
  assert.doesNotThrow(() => context.markFailed('frame-error', originalError));
  assert.equal(context.lost, true);
  assert.equal(state.stops, 1);
  assert.deepEqual(state.cancelled, [17]);
  assert.equal(state.graphics.length, 1);
  assert.equal(state.graphics[0].status, 'failed');
  assert.equal(state.graphics[0].reason, 'frame-error');
  assert.ok(state.warnings.some(args => args.includes(originalError)), 'original render failure is retained');
  context.markFailed('frame-error', originalError);
  assert.equal(state.stops, 1, 'a failed scene is handled only once');
});

test('avatar failure retains its specific recovery status', () => {
  const { state, context, originalError } = harness();
  context.markFailed('avatar-assets', originalError);
  assert.deepEqual(state.avatar, ['failed']);
  assert.deepEqual(state.cancelled, [17]);
  assert.equal(state.graphics[0].reason, 'avatar-assets');
});
