// Run with: node --import ./tests/view-loader.mjs --experimental-strip-types --test tests/minimal-connected-wishing-pool.dom.mjs
// Uses the upstream farm's existing happy-dom development dependency; no browser is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ConnectedWishingPool from '../src/minimal/ConnectedWishingPool.tsx';
import { AccountClient } from '../src/minimal/account-client.ts';
import { createMinimalState } from '../src/minimal/model.ts';
const now = 1_793_000_000_000;
const account = { uid: `uid_${'a'.repeat(64)}`, handle: 'alice', createdAt: now };
const publicOffer = { offerId: 'other-offer', revision: 1, expiresAt: now + 60_000, own: false, asset: { kind: 'prop', id: 'other-rock', name: '月亮礼物', portraitUrl: '', detail: '地皮摆件', origin: 'mock' }, accepts: ['prop'], differentSpeciesOnly: false };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const response = (value) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const button = (host, label) => { const result = Array.from(host.querySelectorAll('button')).find(item => item.textContent === label || item.getAttribute('aria-label') === label); assert.ok(result, `${label} exists`); return result; };
const click = async (host, label) => { await act(async () => { const target = button(host, label); target.focus(); target.click(); }); };
async function fixture(run, prepare) {
    const f = setup();
    try {
        prepare?.(f);
        await act(async () => f.render());
        await run(f);
    }
    finally {
        await act(async () => f.root.unmount());
        f.client.dispose();
        await f.window.happyDOM.close();
    }
}
function setup() {
    const window = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    const host = window.document.createElement('div');
    window.document.body.append(host);
    const opener = window.document.createElement('button');
    opener.textContent = '打开许愿池';
    window.document.body.prepend(opener);
    opener.focus();
    const farm = { accountId: account.uid, farmId: 'alice-farm', revision: 1, state: createMinimalState(now), activeOfferId: null, initializedAt: now, origin: 'server-created', assetProvenance: {}, creative: { version: 1, jobs: [], assets: [{ id: 'my-tree', kind: 'prop', templateId: 'wish-tree', name: '我的小树', prompt: '树', createdAt: now, jobId: 'tree-job', origin: 'mock', location: 'bag' }] } };
    const view = { serverTime: now, dayKey: '2026-10-26', resetAt: now + 60_000, farm, ownOffer: null, usedToday: false, serviceGate: 'client-migration-required' };
    const state = { farm: async () => response({ account, view }), offers: async () => response({ serverTime: now, offers: [], nextCursor: null }), post: async (_payload) => response({ accepted: true, code: 'ok', message: '已放入许愿池', serverTime: now, farm }), calls: [] };
    const fetcher = async (input, init) => { const url = String(input), method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : undefined; state.calls.push({ url, method, body }); if (method === 'POST')
        return state.post(body); if (url.includes('/offers'))
        return state.offers(); return state.farm(); };
    const client = new AccountClient(account, view, fetcher, window.localStorage, 'alice');
    const root = createRoot(host);
    let open = true;
    const render = () => root.render(open ? createElement(ConnectedWishingPool, { client, onClose: () => { open = false; render(); } }) : null);
    return { window, host, root, client, view, farm, state, render, opener };
}
test('a failed list read is not an empty pool and read retry can show a genuinely empty pool', async () => fixture(async (f) => {
    assert.match(f.host.textContent, /许愿列表暂时无法读取/);
    assert.doesNotMatch(f.host.textContent, /池里还没有许愿/);
    const read = deferred();
    f.state.offers = () => read.promise;
    await click(f.host, '重试读取许愿池');
    assert.ok(f.window.document.activeElement !== f.window.document.body, 'removing the retry control must not strand focus');
    assert.match(f.host.textContent, /正在寻找许愿/);
    assert.doesNotMatch(f.host.textContent, /池里还没有许愿|许愿列表暂时无法读取/);
    await act(async () => read.resolve(response({ serverTime: now, offers: [], nextCursor: null })));
    assert.match(f.host.textContent, /池里还没有许愿/);
    assert.equal(f.state.calls.filter(call => call.method === 'POST').length, 0);
    assert.ok(f.state.calls.every(call => new URL(call.url, 'https://farm.example').searchParams.get('name') === 'alice'));
}, f => { f.state.offers = async () => { throw new Error('许愿列表暂时无法读取'); }; }));
test('choosing and canceling preserve focus, and closing restores the connected opener', async () => fixture(async (f) => {
    await click(f.host, '发起许愿');
    await click(f.host, '选择我的小树');
    assert.ok(f.window.document.activeElement === f.host.querySelector('[data-exchange-confirm]'), 'focus must move to the confirmation, not body');
    await click(f.host, '重新选择');
    assert.ok(f.window.document.activeElement === button(f.host, '选择我的小树'), 'cancel restores the selected asset control');
    await click(f.host, '选择我的小树');
    await click(f.host, '关闭许愿池');
    assert.ok(f.window.document.activeElement === f.opener, 'close restores the opener');
}));
test('successful confirmation restores a live panel fallback even when the selected asset is gone', async () => fixture(async (f) => {
    await click(f.host, '发起许愿');
    await click(f.host, '选择我的小树');
    f.state.post = async () => { f.farm.creative.assets = []; f.farm.revision++; return response({ accepted: true, code: 'ok', message: '交换成功', serverTime: now, farm: f.farm }); };
    await click(f.host, '放入许愿池');
    assert.equal(f.host.querySelector('[data-exchange-confirm]'), null);
    assert.match(f.host.textContent, /交换成功/);
    assert.ok(f.window.document.activeElement === f.host.querySelector('[aria-label="许愿池内容"]'), 'confirmed asset removal falls back inside the panel');
    assert.equal(f.client.pending, null);
    await act(async () => f.window.document.activeElement.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.equal(f.host.children.length, 0);
    assert.ok(f.window.document.activeElement === f.opener);
}));
test('nested help keeps focus when an asynchronous farm refresh invalidates the selected asset', async () => fixture(async (f) => {
    await click(f.host, '发起许愿');
    await click(f.host, '选择我的小树');
    await click(f.host, '许愿池规则');
    const help = f.window.document.querySelector('[data-panel-help]');
    f.farm.creative.assets = [];
    f.farm.revision++;
    await act(async () => f.client.refresh());
    assert.ok(help.contains(f.window.document.activeElement), 'parent selection cleanup cannot steal focus from help');
    await act(async () => f.window.document.activeElement.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.equal(f.window.document.querySelector('[data-panel-help]'), null);
    assert.ok(f.window.document.activeElement === button(f.host, '许愿池规则'));
    assert.ok(f.host.querySelector('[role="dialog"]'), 'help Escape must not close its parent');
}));
test('read retry preserves an unknown mutation, blocks new trades and never replays its POST', async () => fixture(async (f) => {
    f.state.post = async () => { throw new Error('response lost after commit'); };
    await click(f.host, '发起许愿');
    await click(f.host, '选择我的小树');
    await click(f.host, '放入许愿池');
    const pending = structuredClone(f.client.pending);
    assert.ok(pending);
    assert.equal(button(f.host, '正在处理…').disabled, true);
    f.state.offers = async () => { throw new Error('列表离线'); };
    await click(f.host, '刷新许愿池');
    assert.deepEqual(f.client.pending, pending);
    assert.equal(f.state.calls.filter(call => call.method === 'POST').length, 1);
    f.state.offers = async () => response({ serverTime: now, offers: [publicOffer], nextCursor: null });
    await click(f.host, '刷新许愿池');
    assert.deepEqual(f.client.pending, pending);
    assert.equal(f.state.calls.filter(call => call.method === 'POST').length, 1);
    assert.equal(button(f.host, '正在处理…').disabled, true);
    f.state.post = async () => response({ accepted: true, code: 'ok', message: '已确认原指令', serverTime: now, farm: f.farm });
    await click(f.host, '重试上次指令');
    const posts = f.state.calls.filter(call => call.method === 'POST');
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[0].body, posts[1].body);
    assert.equal(f.client.pending, null);
    assert.match(f.host.textContent, /已确认原指令|月亮礼物/);
}));
test('a confirmed mutation remains successful when only its subsequent list refresh fails', async () => fixture(async (f) => {
    await click(f.host, '发起许愿');
    await click(f.host, '选择我的小树');
    f.state.offers = async () => { throw new Error('列表离线'); };
    await click(f.host, '放入许愿池');
    assert.match(f.host.textContent, /已放入许愿池/);
    assert.match(f.host.textContent, /列表离线/);
    assert.doesNotMatch(f.host.textContent, /池里还没有许愿|重试上次指令/);
    assert.equal(f.client.pending, null);
    f.state.offers = async () => response({ serverTime: now, offers: [publicOffer], nextCursor: null });
    await click(f.host, '重试读取许愿池');
    assert.ok(button(f.host, '查看月亮礼物的许愿'));
    assert.equal(f.state.calls.filter(call => call.method === 'POST').length, 1);
}));
test('an older list result cannot overwrite the newer post-command read', async () => fixture(async (f) => {
    const oldRead = deferred();
    f.state.offers = () => oldRead.promise;
    await click(f.host, '刷新许愿池');
    await click(f.host, '发起许愿');
    await click(f.host, '选择我的小树');
    f.state.offers = async () => response({ serverTime: now, offers: [publicOffer], nextCursor: null });
    await click(f.host, '放入许愿池');
    assert.ok(button(f.host, '查看月亮礼物的许愿'));
    await act(async () => oldRead.resolve(response({ serverTime: now - 1, offers: [], nextCursor: null })));
    assert.ok(button(f.host, '查看月亮礼物的许愿'));
    assert.doesNotMatch(f.host.textContent, /池里还没有许愿/);
}));
test('opening a public offer moves focus into the replacement asset picker', async () => fixture(async (f) => {
    await click(f.host, '查看月亮礼物的许愿');
    assert.ok(f.window.document.activeElement === button(f.host, '选择我的小树'), 'the removed public-offer control must hand off to the picker');
}, f => { f.state.offers = async () => response({ serverTime: now, offers: [publicOffer], nextCursor: null }); }));
test('an unmounted read neither requests the list afterward nor steals the restored opener focus', async () => fixture(async (f) => {
    const delayed = deferred();
    f.state.farm = () => delayed.promise;
    await click(f.host, '刷新许愿池');
    await click(f.host, '关闭许愿池');
    const listCalls = f.state.calls.filter(call => call.url.includes('/offers')).length;
    await act(async () => delayed.resolve(response({ account, view: f.view })));
    assert.equal(f.state.calls.filter(call => call.url.includes('/offers')).length, listCalls);
    assert.equal(f.host.children.length, 0);
    assert.ok(f.window.document.activeElement === f.opener);
}));
test('an unavailable selection returns focus to the live fallback rather than its disabled card', async () => fixture(async (f) => {
    await click(f.host, '发起许愿');
    await click(f.host, '选择我的小树');
    f.farm.creative.assets[0].location = 'ground';
    f.farm.revision++;
    await act(async () => f.client.refresh());
    assert.equal(f.host.querySelector('[data-exchange-confirm]'), null);
    assert.equal(button(f.host, '选择我的小树').disabled, true);
    assert.ok(f.window.document.activeElement === f.host.querySelector('[aria-label="许愿池内容"]'));
    assert.match(f.host.textContent, /状态变了/);
}));
