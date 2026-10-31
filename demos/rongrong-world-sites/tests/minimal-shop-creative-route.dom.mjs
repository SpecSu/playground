import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMinimalState, MINIMAL_STORAGE_KEY } from '../src/minimal/model.ts';
test('actual App creates only through shop and scene collection returns explicitly to that shop', async () => {
    const hooks = registerHooks({ load(url, c, next) { if (url.endsWith('/minimal/World.ts'))
            return { format: 'module', shortCircuit: true, source: `export class MinimalWorld{constructor(host,state,handlers){this.state=state;this.handlers=handlers;globalThis.__shopCreativeWorld=this;}update(s){this.state=s;}setCreativeAssets(){}setSelection(){}playerMotionSnapshot(){return{position:this.state.player,path:[],speed:0};}cancelWalk(){}walkTo(){return true;}setPlacementMode(){}setTerrainEditMode(){}setWeatherPreferences(){}setPlayerMotionVisible(){}perform(){}focus(){}zoom(){}dispose(){}screenPoint(){return{x:195,y:300};}}` }; if (url.endsWith('/feed/PhoneViewport.tsx'))
            return { format: 'module', shortCircuit: true, source: 'export default function P({children}){return children;}' }; return next(url, c); } });
    const w = new Window({ url: 'http://127.0.0.1:5190/' });
    Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, localStorage: w.localStorage });
    const old = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    const s = createMinimalState(Date.now());
    s.welcomeClaimed = true;
    s.coins = 120;
    s.player = { x: 1, z: 1 };
    w.localStorage.setItem(MINIMAL_STORAGE_KEY, JSON.stringify(s));
    const host = w.document.createElement('div');
    w.document.body.append(host);
    const root = createRoot(host);
    try {
        const { default: App } = await import('../src/minimal/MinimalApp.tsx');
        await act(async () => root.render(createElement(App)));
        const world = globalThis.__shopCreativeWorld;
        assert.equal(host.querySelector('[aria-label="创作工坊"]'), null);
        await act(async () => host.querySelector('[aria-label="设置与说明"]').click());
        assert.equal(host.querySelector('[aria-label="打开创作工坊"]'), null);
        await act(async () => host.querySelector('[aria-label="关闭面板"]').click());
        await act(async () => world.handlers.select({ kind: 'shop' }));
        let shop = host.querySelector('[aria-label="蛋蛋小铺自定义"]');
        assert.ok(shop);
        await act(async () => shop.click());
        assert.ok([...host.querySelectorAll('button')].find(b=>b.textContent.includes('购买自定义蛋')));
        assert.equal(!!host.querySelector('[aria-label="自定义动物"]'),false, 'categories require an owned egg');
        await act(async () => host.querySelector('[aria-label="返回蛋蛋小铺 · 自定义"]').click());
        shop = host.querySelector('[aria-label="蛋蛋小铺自定义"]');
        assert.equal(w.document.activeElement, shop);
        await act(async () => world.handlers.select({ kind: 'creative', id: 'sample' }));
        assert.ok(host.querySelector('[aria-label="我的作品"]'));
        assert.equal(host.querySelector('textarea'), null);
        await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '到蛋蛋小铺创建').click());
        assert.ok(host.querySelector('[aria-label="蛋蛋小铺自定义"]'));
        assert.equal(host.querySelector('[aria-label="自定义动物"]'), null, 'return to shop does not bypass purchase/start controls');
    }
    finally {
        await act(async () => root.unmount());
        hooks.deregister();
        if (old)
            Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', old);
        else
            Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
        await w.happyDOM.close();
    }
});
