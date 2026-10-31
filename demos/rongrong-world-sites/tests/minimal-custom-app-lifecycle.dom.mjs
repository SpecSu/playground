import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { Window } from 'happy-dom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { MinimalAuthority } from '../src/minimal/authority.ts';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {MinimalD1Repository} from '../server/minimal-d1.ts';
import { AccountClient } from '../src/minimal/account-client.ts';
import { validateMinimalSave } from '../src/minimal/model.ts';
test('actual App custom care/pickup/putdown/sale keeps original IDs through prediction and canonical authority', async () => {
    const sql = new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../server/minimal-schema.sql',import.meta.url),'utf8'));
    const prepare=query=>{let args=[];const s={bind(...v){args=v;return s;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return s;};
    const repo = new MinimalD1Repository({prepare,async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}});
    let now = 1_800_000_000_000, id = 0;
    const uid = `uid_${'c'.repeat(64)}`, account = { uid, handle: '演示 · twx', createdAt: now };
    const authority = new MinimalAuthority(repo, { clock: () => now, newId: () => `custom_ui_${++id}`, fingerprint: async (v) => createHash('sha256').update(v).digest('hex') });
    const command = async (route, value) => authority[route](uid, { requestId: `setup_${++id}`, expectedRevision: (await authority.get(uid)).farm.revision, command: value });
    await authority.bootstrap(uid, { requestId: 'new', mode: 'new' });
    await command('command', { type: 'welcome' });
    await repo.transaction(async tx=>{const farm=await tx.get('farms',uid);farm.state.player={x:1,z:1};await tx.put('farms',uid,farm);});
    const bought=await command('creative',{type:'buy-egg'}), purchasedId=bought.farm.creative.assets[0].id;
    const started = await command('creative', { type: 'create', assetId:purchasedId, templateId: 'poop-pal', name: '云朵团团', prompt: '固定样例的照料与出售回归' });
    now += 2500;
    await authority.get(uid);
    const claimed = await command('creative', { type: 'claim', jobId: started.job.id }), assetId = claimed.farm.creative.assets[0].id;
    await command('creative', { type: 'place', assetId, at: { x: 2, z: 2 } });
    now += 15000;
    await command('creative', { type: 'hatch', assetId });
    await repo.transaction(async (tx) => { const farm = (await tx.get('farms', uid)); farm.state.player = { x: 1, z: 1 }; await tx.put('farms', uid, farm); });
    const initial = (await authority.get(uid)).farm;
    assert.equal(initial.state.animals.some(a => a.id === assetId), true, 'released fixed sample must be a lifecycle actor before mounting');
    const hooks = registerHooks({ load(url, c, next) { if (url.endsWith('/minimal/World.ts'))
            return { format: 'module', shortCircuit: true, source: `export class MinimalWorld{constructor(host,state,handlers){this.state=state;this.handlers=handlers;globalThis.__customAppWorld=this;}update(s){this.state=s;}setCreativeAssets(a){this.assets=a;}setSelection(){}playerMotionSnapshot(){return{position:this.state.player,path:[],speed:0};}cancelWalk(){}walkTo(){return true;}setPlacementMode(){}setTerrainEditMode(){}setWeatherPreferences(){}setPlayerMotionVisible(){}perform(){}focus(){}zoom(){}dispose(){}screenPoint(){return{x:195,y:300};}}` }; if (url.endsWith('/feed/PhoneViewport.tsx'))
            return { format: 'module', shortCircuit: true, source: 'export default function P({children}){return children;}' }; return next(url, c); } });
    const w = new Window({ url: 'http://127.0.0.1:5190/?name=twx' });
    Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, localStorage: w.localStorage });
    const oldNow = Date.now;
    Date.now = () => now;
    const oldAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    const gate = { release: null };
    const posted = [];
    const client = new AccountClient(account, await authority.get(uid), async (input, init) => { assert.equal(new URL(String(input), 'http://localhost').searchParams.get('name'), 'twx'); if (init?.method !== 'POST')
        return Response.json({ account, view: await authority.get(uid) }); const body = JSON.parse(String(init.body)); posted.push(body.command.type); const result = await authority.command(uid, body); await new Promise(r => { gate.release = r; }); return Response.json(result); }, w.localStorage, 'twx');
    const host = w.document.createElement('div');
    w.document.body.append(host);
    const root = createRoot(host), flush = async () => { for (let i = 0; i < 10; i++)
        await new Promise(r => setTimeout(r, 0)); };
    const world = () => globalThis.__customAppWorld;
    const button = (label) => { const b = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(label) || b.getAttribute('aria-label') === label); assert.ok(b, label); return b; };
    const confirmed = async (label, exists = true) => { await act(async () => { button(label).click(); await flush(); }); assert.equal(validateMinimalSave(world().state), true, 'prediction must be a valid save'); if (exists) {
        assert.ok(world().state.animals.some(a => a.id === assetId));
        assert.equal(world().state.animals.some(a => a.id.endsWith(':' + assetId)), false);
    } assert.ok(gate.release, 'action must reach actual authority'); await act(async () => { gate.release(); gate.release = null; await flush(); }); assert.equal(client.pending, null); assert.equal(validateMinimalSave(client.farm.state), true); assert.equal(client.farm.state.animals.some(a => a.id === assetId), exists); };
    try {
        const { default: App } = await import('../src/minimal/MinimalApp.tsx');
        await act(async () => root.render(createElement(App, { session: client })));
        await act(async () => world().handlers.select({ kind: 'animal', id: assetId }));
        assert.match(host.textContent, /云朵团团/);
        assert.doesNotMatch(host.querySelector('.egg-animal-meta')?.textContent ?? '', /小猪/);
        await confirmed('举起来');
        assert.equal(client.farm.state.carriedAnimalId, assetId);
        await confirmed('放下');
        assert.equal(client.farm.state.carriedAnimalId, null);
        await act(async () => world().handlers.select({ kind: 'animal', id: assetId }));
        await confirmed('打招呼');
        assert.equal(client.farm.state.animals[0].bond, 1);
        await act(async () => new Promise(r => setTimeout(r, 1000)));
        await confirmed('举起来');
        await act(async () => world().handlers.select({ kind: 'shop' }));
        assert.match(host.querySelector('.egg-context h2')?.textContent ?? '', /云朵团团/);
        const before = client.farm.state.coins;
        await confirmed('出售 ·', false);
        assert.equal(client.farm.state.coins, before + 40);
        assert.equal(client.farm.creative.assets.some(a => a.id === assetId), false);
        assert.deepEqual(posted, ['pickup', 'putdown', 'care', 'pickup', 'sellAnimal']);
    }
    finally {
        gate.release?.();
        await act(async () => root.unmount());
        client.dispose();
        sql.close();
        hooks.deregister();
        Date.now = oldNow;
        if (oldAct)
            Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', oldAct);
        else
            Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
        await w.happyDOM.close();
    }
});
