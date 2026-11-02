import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

async function feedbackModule() {
  const url = new URL('../lib/music-control-feedback.ts', import.meta.url);
  assert.ok(existsSync(url), 'Track switching needs visible command/loading/error feedback');
  return import(url.href);
}

const idle = { changing: false, loading: false, error: null, needsGesture: false, pendingRoom: false, coolingDown: false };

test('song changes show immediate busy feedback until the server confirms without claiming playback', async () => {
  const { musicControlFeedback } = await feedbackModule();
  const feedback = musicControlFeedback({ ...idle, changing: true });
  assert.equal(feedback.busy, true);
  assert.match(feedback.message, /正在切换/);
  assert.doesNotMatch(feedback.message, /正在播放|已播放/);
  assert.equal(musicControlFeedback(idle).message, null);
});

test('server-confirmed audio loading stays visible after the request spinner finishes', async () => {
  const { musicControlFeedback } = await feedbackModule();
  const feedback = musicControlFeedback({ ...idle, loading: true, coolingDown: true });
  assert.equal(feedback.busy, true);
  assert.match(feedback.message, /准备声音/);
  assert.doesNotMatch(feedback.message, /正在播放/);
});

test('failure and browser gesture recovery remain actionable rather than indefinite loading', async () => {
  const { musicControlFeedback } = await feedbackModule();
  const failed = musicControlFeedback({ ...idle, error: 'Download failed', coolingDown: true });
  assert.equal(failed.busy, false);
  assert.match(failed.message, /重试/);
  const gesture = musicControlFeedback({ ...idle, needsGesture: true });
  assert.equal(gesture.busy, false);
  assert.match(gesture.message, /任意操作/);
  assert.match(musicControlFeedback({ ...idle, pendingRoom: true }).message, /同步房间/);
  assert.match(musicControlFeedback({ ...idle, coolingDown: true }).message, /稍等/);
});
