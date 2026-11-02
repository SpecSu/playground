import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as photo from '../lib/celebration-photo.ts';
import { photoReactHarness, findNodes, nodeText } from './helpers/photo-react-harness.mjs';
const path = new URL('../components/FestivalMemoryPhoto.tsx', import.meta.url);
const captured = { builderNames: ['阿岚', '旅人'], roundIndex: 4099999, capturedAt: 1_792_000_000_000, dataUrl: 'data:image/jpeg;base64,YWN0dWFs' };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness(options = {}) {
  const file = new File(['photo'], 'photo.png', { type: 'image/png' }), saves = [], shares = [], config = { closed: 0 };
  let doc;
  const previous = { isConnected: true, closest: () => null, focus() { doc.activeElement = this; } };
  const saveButton = { disabled: true, focus() { doc.activeElement = this; } }, closeButton = { focus() { doc.activeElement = this; } };
  const panel = { focus() { doc.activeElement = this; }, contains(node) { return [this, saveButton, closeButton].includes(node); }, querySelectorAll() { return saveButton.disabled ? [closeButton] : [saveButton, closeButton]; } };
  const h = photoReactHarness(path, () => ({ photo: captured, onClose: close }), {
    '@/lib/celebration-photo': photo,
    '@/lib/celebration-photo-export': {
      prepareCelebrationPhoto: options.prepare ?? (async () => file),
      canChooseCelebrationPhotoLocation: () => options.picker ?? false,
      canShareCelebrationPhoto: () => options.canShare ?? false,
      shareCelebrationPhoto: (value, settings) => { shares.push({ value, settings }); return options.share ? options.share(value, settings) : Promise.resolve('shared'); },
      saveCelebrationPhoto: (value, settings) => { saves.push({ value, settings }); return options.save ? options.save(value, settings) : Promise.resolve('download-requested'); },
    },
  }, { document: { activeElement: previous }, refNode: panel });
  function close() { config.closed++; }
  doc = h.document;
  // The harness invokes mount effects synchronously, so the first focus uses the injected object.
  const button = text => { const found = findNodes(h.value, node => node.type === 'button' && nodeText(node) === text)[0]; assert.ok(found, `button ${text}`); return found; };
  return Object.assign(h, { config, file, saves, shares, panel, previous, saveButton, closeButton, button });
}

test('dialog uses the real frame, warm paper copy and explicit compact Save/Close controls', async () => {
  const h = harness(); await h.settle();
  const dialog = findNodes(h.value, node => node.props.role === 'dialog')[0];
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.equal(findNodes(h.value, node => node.type === 'img')[0].props.src, captured.dataUrl);
  assert.match(nodeText(h.value), /余烬之后/); assert.match(nodeText(h.value), /把形状还给风，把此刻留给我们。/);
  assert.doesNotMatch(nodeText(h.value), /4099999/);
  const credits = findNodes(h.value, node => node.props.className === 'festival-memory-builders')[0];
  assert.equal(nodeText(credits), '共建者 · 阿岚 · 旅人');
  assert.equal(h.button('保存照片').props.disabled, false); assert.equal(h.button('关闭').props.disabled, undefined);
});

test('Save waits for PNG preparation, deduplicates gestures and never claims a filesystem save', async () => {
  const ready = deferred(), shared = deferred(), h = harness({ prepare: () => ready.promise, save: () => shared.promise });
  await h.settle(); assert.equal(h.button('保存照片').props.disabled, true);
  ready.resolve(h.file); await h.settle();
  const click = h.button('保存照片').props.onClick; click(); click(); await h.settle();
  assert.equal(h.saves.length, 1); assert.doesNotMatch(nodeText(h.value), /已保存/);
  shared.resolve('download-requested'); await h.settle(); assert.match(nodeText(h.value), /已请求下载/); assert.doesNotMatch(nodeText(h.value), /已保存/);
});

test('picker cancellation stays in the dialog and denied save requires a fresh click to download', async () => {
  const outcomes = ['cancelled', 'save-blocked', 'download-requested'];
  const h = harness({ save: async () => outcomes.shift() }); await h.settle();
  h.button('保存照片').props.onClick(); await h.settle(); assert.match(nodeText(h.value), /已取消/); assert.equal(h.config.closed, 0);
  h.button('保存照片').props.onClick(); await h.settle(); assert.equal(h.saves.length, 2); assert.match(nodeText(h.value), /再次点击/);
  h.button('保存照片').props.onClick(); await h.settle(); assert.equal(h.saves[2].settings.downloadOnly, true);
});

test('Escape closes, Tab stays within the dialog, and unmount restores prior focus', async () => {
  const h = harness(); await h.settle(); h.saveButton.disabled = false;
  let prevented = 0, stopped = 0;
  h.document.activeElement = h.closeButton; h.fire('keydown', { key: 'Tab', preventDefault() { prevented++; } });
  assert.equal(h.document.activeElement, h.saveButton);
  h.fire('keydown', { key: 'Tab', shiftKey: true, preventDefault() { prevented++; } });
  assert.equal(h.document.activeElement, h.closeButton);
  h.fire('keydown', { key: 'Escape', preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
  assert.equal(h.config.closed, 1); assert.equal(stopped, 1); assert.equal(prevented, 3);
  h.unmount(); assert.equal(h.document.activeElement, h.previous);
});

test('closing aborts export and late save completion cannot set state after unmount', async () => {
  const shared = deferred(), h = harness({ save: () => shared.promise }); await h.settle();
  h.button('保存照片').props.onClick(); await h.settle();
  const signal = h.saves[0].settings.signal;
  h.unmount(); assert.equal(signal.aborted, true);
  const dirtyBefore = h.dirty; shared.resolve('saved'); await h.settle(); assert.equal(h.dirty, dirtyBefore);
});


test('Share is optional and separate from Save, with no surprise download after cancellation or denial', async () => {
  const h = harness({ canShare: true, share: async () => 'cancelled' }); await h.settle();
  assert.equal(h.button('分享').props.disabled, false);
  h.button('保存照片').props.onClick();
  assert.equal(h.saves.length, 1, 'Save invokes its prepared-file API directly in the click');
  assert.equal(h.shares.length, 0);
  await h.settle();
  h.button('分享').props.onClick();
  assert.equal(h.shares.length, 1, 'Share invokes its prepared-file API directly in the click');
  await h.settle();
  assert.match(nodeText(h.value), /已取消分享/);
  assert.equal(h.saves.length, 1);
  assert.equal(h.config.closed, 0);
  const denied = harness({ canShare: true, share: async () => 'share-blocked' }); await denied.settle();
  denied.button('分享').props.onClick(); await denied.settle();
  assert.match(nodeText(denied.value), /保存照片/);
  assert.equal(denied.saves.length, 0);
  const unsupported = harness(); await unsupported.settle();
  assert.equal(findNodes(unsupported.value, node => node.type === 'button' && nodeText(node) === '分享').length, 0);
});

test('folder-picker and browser-download hints are truthful, and saved is shown only for committed file', async () => {
  const local = harness({ picker: true, save: async () => 'saved' }); await local.settle();
  assert.match(nodeText(local.value), /选择保存位置/);
  local.button('保存照片').props.onClick(); await local.settle();
  assert.match(nodeText(local.value), /已保存 PNG/);
  const fallback = harness(); await fallback.settle();
  assert.match(nodeText(fallback.value), /浏览器下载设置/);
  fallback.button('保存照片').props.onClick(); await fallback.settle();
  assert.match(nodeText(fallback.value), /已请求下载/);
  assert.match(nodeText(fallback.value), /浏览器下载设置/);
  assert.doesNotMatch(nodeText(fallback.value), /已保存/);
});

test('Save and Share cannot overlap, and every close route aborts pending work immediately', async () => {
  for (const route of ['button', 'escape', 'backdrop']) {
    const pending = deferred(), h = harness({ canShare: true, share: () => pending.promise }); await h.settle();
    const share = h.button('分享').props.onClick, save = h.button('保存照片').props.onClick;
    share(); share(); save(); await h.settle();
    assert.equal(h.shares.length, 1); assert.equal(h.saves.length, 0);
    assert.equal(h.button('保存照片').props.disabled, true);
    assert.equal(h.button('分享').props.disabled, true);
    if (route === 'button') h.button('关闭').props.onClick();
    else if (route === 'escape') h.fire('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
    else findNodes(h.value, node => node.props.className === 'festival-memory-backdrop')[0].props.onClick();
    assert.equal(h.config.closed, 1);
    assert.equal(h.shares[0].settings.signal.aborted, true, 'do not wait for parent unmount to cancel');
    const dirty = h.dirty; pending.resolve('shared'); await h.settle();
    assert.equal(h.dirty, dirty);
    assert.doesNotMatch(nodeText(h.value), /分享操作已完成/);
  }
});

test('preparation retry needs a new Save gesture after PNG becomes ready', async () => {
  let prepares = 0;
  const h = harness({ prepare: async () => { if (!prepares++) throw new Error('temporary decode error'); return new File(['png'], 'retry.png', { type: 'image/png' }); } });
  await h.settle(); assert.match(nodeText(h.value), /重试/);
  h.button('保存照片').props.onClick(); await h.settle();
  assert.equal(prepares, 2); assert.equal(h.saves.length, 0);
  assert.equal(h.button('保存照片').props.disabled, false);
  h.button('保存照片').props.onClick(); assert.equal(h.saves.length, 1);
  await h.settle(); assert.match(nodeText(h.value), /已请求下载/);
});
