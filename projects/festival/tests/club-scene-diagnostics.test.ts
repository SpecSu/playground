import assert from 'node:assert/strict';
import test from 'node:test';
import { graphicsFailureMessage, type GraphicsFailureReason } from '../lib/club-scene-diagnostics.ts';

test('graphics initialization errors are not mislabeled as unavailable browser support', () => {
  assert.match(graphicsFailureMessage('context-unavailable').description, /WebGL2/);
  for (const reason of ['renderer-initialization', 'scene-initialization', 'viewport-initialization', 'frame-error'] as const) {
    const message = graphicsFailureMessage(reason);
    assert.doesNotMatch(message.description, /WebGL2/);
    assert.match(message.title, /画面/);
    assert.match(message.description, /重试/);
  }
});

test('every public diagnostic code maps to useful Chinese recovery copy', () => {
  const reasons: GraphicsFailureReason[] = ['context-unavailable', 'renderer-initialization', 'scene-initialization', 'viewport-initialization', 'frame-error', 'context-lost', 'avatar-assets'];
  for (const reason of reasons) {
    const message = graphicsFailureMessage(reason);
    assert.ok(message.title.length > 0);
    assert.match(message.description, /房间/);
  }
  assert.match(graphicsFailureMessage('context-lost').title, /暂停/);
});

test('missing avatar assets are diagnosed separately from missing WebGL support', () => {
  const message = graphicsFailureMessage('avatar-assets');
  assert.match(message.title, /角色/);
  assert.doesNotMatch(message.description, /WebGL2/);
});
