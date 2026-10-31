import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createMinimalState, minimalCommand } from '../src/minimal/model.ts';
import EggShopCatalog from '../src/minimal/EggShopCatalog.tsx';
import { TerrainUpgrade } from '../src/minimal/TerrainCare.tsx';
const T = 1_800_000_000_000;
test('five visible theme cards distinguish exploration locks from empty asset pools and buy real ready themes', async () => {
    const w = new Window({ width: 390, height: 844 });
    Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement });
    const host = w.document.createElement('div');
    w.document.body.append(host);
    const root = createRoot(host);
    let state = createMinimalState(T);
    state.welcomeClaimed = true;
    state.coins = 120;
    state.player = { x: 1, z: 1 };
    const explored = [];
    const render = () => flushSync(() => root.render(createElement(EggShopCatalog, { state, disabledReason: '', onBuy: theme => { state = minimalCommand(state, { type: 'buyEgg', theme }, T).state; }, onExplore: point => explored.push(point) })));
    try {
        render();
        assert.equal(host.querySelectorAll('[data-egg-theme]').length, 5);
        for (const label of ['草原动物蛋', '森林动物蛋', '湿地动物蛋', '沙漠动物蛋', '冰川动物蛋'])
            assert.ok(host.textContent.includes(label));
        const forest = host.querySelector('[data-egg-theme="forest"]');
        assert.match(forest.textContent, /先探索森林/);
        assert.equal(forest.querySelector('[data-buy-theme]').disabled, true);
        flushSync(() => forest.querySelector('.egg-theme-explore').click());
        assert.equal(explored.length, 1);
        assert.ok(state.tiles.some(t => !t.owned && t.naturalTerrain === 'grove' && t.x === explored[0].x));
        for (const theme of ['desert', 'glacier']) {
            const card = host.querySelector(`[data-egg-theme="${theme}"]`);
            assert.match(card.textContent, /尚未就绪/);
            assert.equal(card.querySelector('[data-buy-theme]').disabled, true);
        }
        flushSync(() => host.querySelector('[data-buy-theme="grassland"]').click());
        assert.equal(state.coins, 90);
        assert.ok(['cow', 'sheep', 'pig'].includes(state.eggs[0].species));
        state.exploredBiomes.push('forest', 'desert');
        render();
        assert.ok(host.querySelector('[data-buy-theme="forest"]'));
        assert.equal(host.querySelector('[data-buy-theme="desert"]').disabled, true);
        assert.match(host.querySelector('[data-egg-theme="desert"]').textContent, /已探索/);
    }
    finally {
        root.unmount();
        await w.happyDOM.close();
    }
});
test('sand and ice cultivation levels remain visible but expose no paid empty upgrade', async () => {
    const w = new Window();
    Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement });
    const host = w.document.createElement('div');
    w.document.body.append(host);
    const root = createRoot(host), state = createMinimalState(T);
    state.coins = 100;
    state.hatchedCount = 1;
    try {
        flushSync(() => root.render(createElement(TerrainUpgrade, { tile: { x: 2, z: 2, terrain: 'desert', owned: true, level: 2 }, state, onUpgrade: () => { throw Error('must not charge'); } })));
        assert.match(host.textContent, /Lv.2/);
        assert.match(host.textContent, /不提供额外照料容量/);
        assert.equal(host.querySelector('.terrain-upgrade-action'), null);
    }
    finally {
        root.unmount();
        await w.happyDOM.close();
    }
});
test('every unavailable card has a real disabled purchase, lock state and associated short reason; balance updates reopen it', async () => {
    const w = new Window();
    Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement });
    const host = w.document.createElement('div');
    w.document.body.append(host);
    const root = createRoot(host);
    const state = createMinimalState(T);
    state.welcomeClaimed = true;
    state.player = { x: 1, z: 1 };
    state.coins = 29;
    let buys = 0;
    const render = (disabledReason = '') => flushSync(() => root.render(createElement(EggShopCatalog, { state, disabledReason, onBuy: () => { buys++; }, onExplore: () => { } })));
    try {
        render();
        assert.equal(host.querySelectorAll('[data-buy-theme]').length, 5);
        for (const theme of ['grassland', 'forest', 'wetland', 'desert', 'glacier']) {
            const card = host.querySelector(`[data-egg-theme="${theme}"]`);
            const button = card.querySelector('[data-buy-theme]');
            assert.equal(button.disabled, true);
            assert.ok(card.classList.contains('is-locked'));
            assert.ok(card.querySelector('[data-purchase-lock]'));
            const reason = w.document.getElementById(button.getAttribute('aria-describedby'));
            assert.ok(reason?.textContent);
            button.click();
        }
        assert.equal(buys, 0);
        assert.match(host.querySelector('[data-egg-theme="grassland"]').textContent, /还差 1 金币/);
        state.coins = 30;
        render();
        let button = host.querySelector('[data-buy-theme="grassland"]');
        assert.equal(button.disabled, false);
        assert.equal(host.querySelector('[data-egg-theme="grassland"]').classList.contains('is-locked'), false);
        render('上一条指令待确认');
        button = host.querySelector('[data-buy-theme="grassland"]');
        assert.equal(button.disabled, true);
        assert.match(host.textContent, /上一条指令待确认/);
        state.coins = 0;
        render();
        assert.equal(button.disabled, true);
        assert.match(host.textContent, /还差 30 金币/);
    }
    finally {
        root.unmount();
        await w.happyDOM.close();
    }
});
