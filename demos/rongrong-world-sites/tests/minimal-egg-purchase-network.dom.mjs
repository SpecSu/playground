import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountClient, pendingAccountKey } from '../src/minimal/account-client.ts';
import { createMinimalState, minimalCommand } from '../src/minimal/model.ts';
const T = 1_800_000_000_000;
test('actual shop handles uncertain purchase retries, duplicate input, balances and abandoned sessions', async (t) => {
    const hooks = registerHooks({ load(url, c, next) { if (url.endsWith('/minimal/World.ts'))
            return { format: 'module', shortCircuit: true, source: `export class MinimalWorld{constructor(host,state,handlers){this.state=state;this.handlers=handlers;globalThis.__eggNetworkWorld=this;}update(s){this.state=s;}setCreativeAssets(){}setSelection(){}playerMotionSnapshot(){return {position:this.state.player,path:[],speed:0};}cancelWalk(){}walkTo(){return true;}setPlacementMode(v){this.placing=v;}setTerrainEditMode(){}setWeatherPreferences(){}setPlayerMotionVisible(){}perform(){}focus(){}zoom(){}dispose(){}screenPoint(){return{x:195,y:300};}}` }; if (url.endsWith('/feed/PhoneViewport.tsx'))
            return { format: 'module', shortCircuit: true, source: 'export default function P({children}){return children;}' }; return next(url, c); } });
    const w = new Window({ url: 'http://127.0.0.1:5190/?name=twx' });
    Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, localStorage: w.localStorage });
    const oldNow = Date.now;
    Date.now = () => T;
    const oldAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    const { default: App } = await import('../src/minimal/MinimalApp.tsx');
    const host = w.document.createElement('div');
    w.document.body.append(host);
    let root = createRoot(host);
    const flush = async () => { for (let i = 0; i < 10; i++)
        await new Promise(r => setTimeout(r, 0)); };
    const world = () => globalThis.__eggNetworkWorld;
    const setup = (name, accepted) => {
        const uid = `uid_${(name === 'twx' ? 'a' : 'b').repeat(64)}`, account = { uid, handle: '演示 · ' + name, createdAt: T }, state = createMinimalState(T);
        state.coins = 120;
        state.welcomeClaimed = true;
        state.player = { x: 1, z: 1 };
        let farm = { accountId: uid, farmId: 'farm-' + name, revision: 1, state, activeOfferId: null, initializedAt: T, origin: 'server-created', assetProvenance: {} };
        const view = () => ({ serverTime: T, dayKey: 'x', resetAt: T + 1, farm: structuredClone(farm), ownOffer: null, usedToday: false, serviceGate: 'client-migration-required' });
        let posts = 0, mutations = 0, release;
        const ids = [];
        const client = new AccountClient(account, view(), async (input, init) => { assert.equal(new URL(String(input), 'http://localhost').searchParams.get('name'), name); if (init?.method !== 'POST')
            return Response.json({ account, view: view() }); posts++; const body = JSON.parse(String(init.body)); ids.push(body.requestId); if (posts === 1) {
            if (accepted) {
                const result = minimalCommand(farm.state, body.command, T);
                assert.equal(result.accepted, true);
                for (const egg of result.state.eggs)
                    if (!egg.id.includes(':'))
                        egg.id = `${farm.farmId}:${egg.id}`;
                farm = { ...farm, state: result.state, revision: 2 };
                mutations++;
            }
            await new Promise(r => { release = r; });
            throw Error('lost response');
        } farm = { ...farm, revision: 2 }; return Response.json({ accepted, code: accepted ? 'ok' : 'stale-farm', message: accepted ? '已确认购买' : '进度已更新，本次未购买', serverTime: T, farm: structuredClone(farm) }); }, w.localStorage, name);
        return { client, release: () => release(), posts: () => posts, mutations: () => mutations, ids };
    };
    try {
        for (const accepted of [false, true])
            await t.test(`uncertain buy retry ${accepted ? 'accepted once' : 'rejected clears phantom placement'}`, async () => {
                w.localStorage.clear();
                const f = setup('twx', accepted);
                try {
                    await act(async () => root.render(createElement(App, { session: f.client })));
                    await act(async () => world().handlers.select({ kind: 'shop' }));
                    const buy = host.querySelector('[data-buy-theme="grassland"]');
                    assert.ok(buy);
                    await act(async () => { buy.click(); buy.click(); await flush(); });
                    assert.equal(f.posts(), 1);
                    assert.ok(host.querySelector('.egg-place-bar'));
                    await act(async () => f.client.refresh());
                    assert.ok(host.querySelector('.egg-place-bar'), 'an unrelated early refresh cannot settle a pending purchase');
                    await act(async () => { f.release(); await flush(); });
                    assert.ok(f.client.pending);
                    const requestId = f.client.pending.payload.requestId;
                    assert.ok(w.localStorage.getItem(pendingAccountKey(f.client.account.uid, requestId)));
                    const retry = host.querySelector('.account-connection-banner button');
                    await act(async () => { retry.click(); await flush(); });
                    assert.equal(f.client.pending, null);
                    assert.equal(f.ids[0], f.ids[1]);
                    assert.equal(f.client.farm.state.coins, accepted ? 90 : 120);
                    assert.equal(f.mutations(), accepted ? 1 : 0);
                    assert.equal(!!host.querySelector('.egg-place-bar'), accepted, 'only a confirmed bag egg may retain placement');
                }
                finally {
                    await act(async () => root.unmount());
                    f.client.dispose();
                    root = createRoot(host);
                }
            });
        await t.test('cancelling while pending keeps shop locked, late old-name result cannot reopen placement or alter next account', async () => {
            w.localStorage.clear();
            const first = setup('twx', true);
            await act(async () => root.render(createElement(App, { session: first.client })));
            await act(async () => world().handlers.select({ kind: 'shop' }));
            await act(async () => { host.querySelector('[data-buy-theme="grassland"]').click(); await flush(); });
            await act(async () => host.querySelector('[aria-label="取消放蛋"]').click());
            await act(async () => world().handlers.select({ kind: 'shop' }));
            assert.equal(host.querySelector('[data-buy-theme="grassland"]').disabled, true);
            assert.match(host.textContent, /确认|处理中/);
            const key = pendingAccountKey(first.client.account.uid, first.client.pending.payload.requestId), saved = w.localStorage.getItem(key);
            await act(async () => root.unmount());
            first.client.dispose();
            root = createRoot(host);
            const next = setup('test', false);
            await act(async () => root.render(createElement(App, { session: next.client })));
            await act(async () => { first.release(); await flush(); });
            assert.equal(next.client.farm.state.coins, 120);
            assert.equal(next.client.farm.state.eggs.length, 0);
            assert.equal(host.querySelector('.egg-place-bar'), null);
            assert.equal(w.localStorage.getItem(key), saved);
            assert.equal(next.client.pending, null);
            next.client.dispose();
        });
    }
    finally {
        await act(async () => root.unmount());
        hooks.deregister();
        Date.now = oldNow;
        if (oldAct)
            Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', oldAct);
        else
            Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
        await w.happyDOM.close();
    }
});
