import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import CreativeStudio from '../src/minimal/CreativeStudio.tsx';
test('shop requires a purchased egg before categories and scene collection cannot start a free wish', async () => {
    const w = new Window();
    Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement });
    const old = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    const host = w.document.createElement('div');
    w.document.body.append(host);
    const root = createRoot(host);
    let shop = 0;
    try {
        await act(async () => root.render(createElement(CreativeStudio, { onClose: () => { }, onPlace: () => { }, onOpenShop: () => { shop++; }, mode: 'shop' })));
        const byName = (name) => [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent === name);
        assert.equal(byName('自定义动物'), undefined);
        assert.equal(byName('自定义物件'), undefined);
        assert.equal(!!host.querySelector('textarea'), false);
        assert.equal([...host.querySelectorAll('button')].find(b => b.textContent.includes('购买自定义蛋')).disabled, true, 'cloud account is required for purchase');
        await act(async () => root.render(createElement(CreativeStudio, { key: 'collection', onClose: () => { }, onPlace: () => { }, onOpenShop: () => { shop++; }, mode: 'collection' })));
        assert.equal(host.querySelector('textarea'), null);
        assert.equal(byName('自定义动物'), undefined);
        assert.equal([...host.querySelectorAll('button')].some(b => b.textContent?.includes('新愿望')), false);
        await act(async () => byName('到蛋蛋小铺创建').click());
        assert.equal(shop, 1);
    }
    finally {
        await act(async () => root.unmount());
        if (old)
            Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', old);
        else
            Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
        await w.happyDOM.close();
    }
});
