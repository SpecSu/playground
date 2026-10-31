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
// Exercise the production D1 adapter with real SQLite transactions, not the absent Node-only store.
function sqliteFixture(){
    const sql=new DatabaseSync(':memory:');
    sql.exec(readFileSync(new URL('../server/minimal-schema.sql',import.meta.url),'utf8'));
    const prepare=query=>{let args=[];const statement={bind(...values){args=values;return statement;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return statement;};
    let queue=Promise.resolve();
    const database={prepare,batch(statements){const run=queue.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}});queue=run.catch(()=>{});return run;}};
    return {repo:new MinimalD1Repository(database),close:()=>sql.close()};
}
test('actual App serializes movement arrival and retains only the latest unsubmitted destination', async (t) => {
    const hooks = registerHooks({ load(url, c, next) { if (url.endsWith('/minimal/World.ts'))
            return { format: 'module', shortCircuit: true, source: `export class MinimalWorld{constructor(host,state,handlers){this.state=state;this.handlers=handlers;this.walks=[];this.reconciles=0;this.snapshot=null;globalThis.__arrivalWorld=this;}update(s){this.state=s;}setCreativeAssets(){}setSelection(){}reconcilePlayer(){this.reconciles++;this.cancelWalk();}playerMotionSnapshot(){return this.snapshot??{position:this.state.player,path:this.state.playerPath,speed:0};}cancelWalk(){if(this.snapshot)this.snapshot.path=[];}walkTo(to,id){this.to=to;this.walkId=id;this.walks.push(to);return true;}setPlacementMode(){}setTerrainEditMode(){}setWeatherPreferences(){}setPlayerMotionVisible(){}perform(){}focus(){}zoom(){}dispose(){}screenPoint(){return{x:195,y:300};}}` }; if (url.endsWith('/feed/PhoneViewport.tsx'))
            return { format: 'module', shortCircuit: true, source: 'export default function P({children}){return children;}' }; return next(url, c); } });
    const w = new Window({ url: 'http://127.0.0.1:5190/?name=twx' });
    Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, localStorage: w.localStorage });
    let now = 1_800_000_000_000;
    const oldNow = Date.now;
    Date.now = () => now;
    const oldAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    const { default: App } = await import('../src/minimal/MinimalApp.tsx');
    const host = w.document.createElement('div');
    w.document.body.append(host);
    let root = createRoot(host);
    const flush = async () => { for (let i = 0; i < 12; i++)
        await new Promise(r => setTimeout(r, 0)); };
    const scene = () => globalThis.__arrivalWorld;
    const button = (text) => { const b = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text) || b.getAttribute('aria-label') === text); assert.ok(b, text); return b; };
    const setup = async (mode, hold = false, rejectMove = false) => { w.localStorage.clear(); let id = 0; const {repo,close}=sqliteFixture(), uid = `uid_${'e'.repeat(64)}`, account = { uid, handle: '演示 · twx', createdAt: now }; const authority = new MinimalAuthority(repo, { clock: () => now, newId: () => `arrival_${++id}`, fingerprint: async (v) => createHash('sha256').update(v).digest('hex') }); await authority.bootstrap(uid, { requestId: 'new', mode: 'new' }); await authority.command(uid, { requestId: 'welcome', expectedRevision: 1, command: { type: 'welcome' } }); await repo.transaction(async (tx) => { const f = (await tx.get('farms', uid)); f.state.player = { x: 1, z: 1 }; if (mode === 'care')
        f.state.animals.push({ id: f.farmId + ':sheep-care', species: 'sheep', name: '云朵', sex: 'female', size: 'normal', position: { x: 3, z: 3 }, activity: 'rest', activityUntil: now + 120_000, energy: 80, bond: 0, bornAt: now }); await tx.put('farms', uid, f); }); if (mode === 'egg')
        await authority.command(uid, { requestId: 'buy', expectedRevision: (await authority.get(uid)).farm.revision, command: { type: 'buyEgg' } }); const posted = [], targets = [], replies = [], gate = { release: null }; const client = new AccountClient(account, await authority.get(uid), async (_input, init) => { if (init?.method !== 'POST')
        return Response.json({ account, view: await authority.get(uid) }); const body = JSON.parse(String(init.body)); posted.push(body.command.type); if (body.command.type === 'move')
        targets.push(body.command.to); const result = await authority.command(uid, rejectMove && body.command.type === 'move' ? { ...body, expectedRevision: 0 } : body); replies.push(result.accepted); if (hold && posted.length === 1)
        await new Promise(r => gate.release = r); return Response.json(result); }, w.localStorage, 'twx'); await act(async () => root.render(createElement(App, { session: client }))); return { client, repo, close, posted, targets, replies, gate, actorId: client.farm.state.animals[0]?.id }; };
    const cleanup = async (f) => { f.gate.release?.(); await act(async () => root.unmount()); f.client.dispose(); f.close(); root = createRoot(host); };
    try {
        for (const mode of ['egg', 'care'])
            await t.test(`confirmed arrival performs ${mode === 'egg' ? 'placeEgg' : 'care'} without a redundant stopMove`, async () => { const f = await setup(mode); try {
                await act(async () => { if (mode === 'egg') {
                    button('蛋袋，1颗蛋').click();
                }
                else
                    scene().handlers.select({ kind: 'animal', id: f.actorId }); });
                await act(async () => { if (mode === 'egg')
                    button('神秘动物蛋').click();
                else
                    button('打招呼').click(); await flush(); });
                if (mode === 'egg')
                    await act(async () => { scene().handlers.select({ kind: 'tile', x: 2, z: 2 }); await flush(); });
                assert.deepEqual(f.posted, ['move']);
                const s = scene(), point = { ...s.to }, job = s.walkId;
                now += 10_000;
                s.snapshot = { position: point, path: [], speed: 0 };
                await act(async () => { s.handlers.arrive(point, job); await flush(); });
                assert.deepEqual(f.posted, ['move', mode === 'egg' ? 'placeEgg' : 'care'], 'arrival must not spend the mutation slot on stopMove');
                assert.ok(f.replies.every(Boolean));
                assert.equal(f.client.pending, null);
                await act(async () => { s.handlers.arrive(point, job); await flush(); });
                assert.equal(f.posted.length, 2, 'replayed arrival is inert');
                assert.equal(host.querySelector('.account-connection-banner'), null);
            }
            finally {
                await cleanup(f);
            } });
        await t.test('rapid clicks coalesce the latest destination while busy without false path/error feedback', async () => { const f = await setup('walk', true); try {
            await act(async () => { scene().handlers.select({ kind: 'tile', x: 2, z: 1 }); await flush(); });
            await act(async () => { scene().handlers.select({ kind: 'tile', x: 2, z: 2 }); scene().handlers.select({ kind: 'tile', x: 1, z: 2 }); await flush(); });
            assert.deepEqual(f.targets, [{ x: 2, z: 1 }]);
            assert.doesNotMatch(host.textContent, /这里暂时走不过去|上一条指令尚未确认/);
            await act(async () => { f.gate.release(); await flush(); });
            assert.deepEqual(f.targets, [{ x: 2, z: 1 }, { x: 1, z: 2 }]);
            assert.equal(f.posted.includes('stopMove'), false);
            assert.equal(f.client.pending, null);
            const reconciles = scene().reconciles;
            await act(async () => { await f.client.refresh(); await flush(); });
            assert.equal(scene().reconciles, reconciles, 'same-revision background refresh must not cancel an active walk');
        }
        finally {
            await cleanup(f);
        } });
        await t.test('rejected move ACK discards its early arrival and never sends placeEgg', async () => { const f = await setup('egg', true, true); try {
            await act(async () => button('蛋袋，1颗蛋').click());
            await act(async () => button('神秘动物蛋').click());
            await act(async () => { scene().handlers.select({ kind: 'tile', x: 2, z: 2 }); await flush(); });
            const s = scene(), point = { ...s.to };
            s.snapshot = { position: point, path: [], speed: 0 };
            await act(async () => { s.handlers.arrive(point, s.walkId); await flush(); });
            await act(async () => { f.gate.release(); await flush(); });
            assert.deepEqual(f.posted, ['move']);
            assert.equal(f.client.pending, null);
            assert.equal(f.client.farm.state.eggs[0].location, 'bag');
        }
        finally {
            await cleanup(f);
        } });
        await t.test('arrival before move ACK waits, then places once; cancel discards deferred action', async () => { for (const cancel of [false, true]) {
            const f = await setup('egg', true);
            try {
                await act(async () => button('蛋袋，1颗蛋').click());
                await act(async () => button('神秘动物蛋').click());
                await act(async () => { scene().handlers.select({ kind: 'tile', x: 2, z: 2 }); await flush(); });
                const s = scene(), point = { ...s.to };
                now += 10_000;
                s.snapshot = { position: point, path: [], speed: 0 };
                await act(async () => { s.handlers.arrive(point, s.walkId); await flush(); });
                assert.deepEqual(f.posted, ['move']);
                if (cancel)
                    await act(async () => button('取消放蛋').click());
                await act(async () => { f.gate.release(); await flush(); });
                assert.equal(f.posted.filter(x => x === 'placeEgg').length, cancel ? 0 : 1);
                assert.ok(f.replies.every(Boolean));
            }
            finally {
                await cleanup(f);
            }
        } });
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
