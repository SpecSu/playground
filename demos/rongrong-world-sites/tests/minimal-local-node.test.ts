import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,symlinkSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SHOP_APPROACH} from '../src/minimal/model.ts';
const root=resolve(import.meta.dirname,'..'),entry=join(root,'server/index-v34-local-demo.ts');
import {startLocal,api} from './helpers/local-node-http.ts';
test('v34 local Node entry exists and upgrades named-demo storage without enabling formal APIs',async t=>{
 assert.ok(existsSync(entry),'v34 must ship the current Node API adapter, not reuse the old r3 executable');
 const dir=mkdtempSync(join(tmpdir(),'farm-local-node-')),db=join(dir,'demo.sqlite'),legacy=join(dir,'legacy.sqlite'),dist=join(dir,'dist');mkdirSync(dist);writeFileSync(join(dist,'index.html'),'local test');writeFileSync(join(dist,'sample.glb'),Buffer.from('glTF'));writeFileSync(legacy,'legacy sentinel');const legacyBytes=readFileSync(legacy);t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const run=await startLocal(entry,db,legacy,dist);t.after(run.stop);
 assert.equal((await api('session')).status,503);assert.equal(existsSync(db),false);
 for(const name of ['', '../bad','twx&name=test'])assert.equal((await api('session?name='+name)).status,400);
 const a=(await api('session?name=twx')).body.account,b=(await api('session?name=test')).body.account;assert.notEqual(a.uid,b.uid);
 assert.equal((await api('session?name=twx',undefined,{Origin:'https://evil.example'})).status,403);
 assert.equal((await api('session?name=twx',undefined,{'X-Farm-Account':b.uid})).status,409);
 assert.equal((await api('boarding?name=twx')).status,403);assert.equal((await api('boarding-command?name=twx',{})).status,403);
 let farm=(await api('bootstrap?name=twx',{requestId:'local-bootstrap',mode:'new'})).body.farm;assert.equal(farm.revision,1);
 const request={requestId:'local-grant',expectedRevision:farm.revision,command:{type:'demoCoins',amount:10000}};
 const replies=await Promise.all([api('command?name=twx',request),api('command?name=twx',request)]);assert.deepEqual(replies[0].body,replies[1].body);assert.equal(replies[0].body.accepted,true);farm=replies[0].body.farm;assert.equal(farm.state.coins,10000);
 assert.equal((await api('command?name=twx',{...request,command:{type:'demoCoins',amount:50000}})).body.code,'request-id-reused');
 const sql=new DatabaseSync(db);t.after(()=>sql.close());assert.ok(sql.prepare("SELECT name FROM sqlite_master WHERE name='minimal_boardings'").get());const row=sql.prepare('SELECT key,value FROM minimal_farms').get() as {key:string;value:string};const stored=JSON.parse(row.value);stored.state.player={...SHOP_APPROACH};sql.prepare('UPDATE minimal_farms SET value=? WHERE key=?').run(JSON.stringify(stored),row.key);
 const purchase=(await api('creative?name=twx',{requestId:'local-custom-buy',expectedRevision:farm.revision,command:{type:'buy-egg'}})).body;assert.equal(purchase.accepted,true,purchase.message);assert.equal(purchase.farm.state.coins,9970);assert.equal(purchase.farm.creative!.assets[0].egg!.stage,'blank');
 const welcomed=(await api('command?name=twx',{requestId:'local-welcome',expectedRevision:purchase.farm.revision,command:{type:'welcome'}})).body;assert.equal(welcomed.accepted,true);
 const paint=(await api('command?name=twx',{requestId:'local-paint',expectedRevision:welcomed.farm.revision,command:{type:'paintTerrain',at:{x:1,z:1},appearance:'lunar'}})).body;assert.equal(paint.accepted,true,paint.message);assert.equal(paint.farm.state.tiles.find((v:{x:number;z:number})=>v.x===1&&v.z===1)!.appearance,'lunar');
 const beforeRows=sql.prepare('SELECT key,value FROM minimal_farms ORDER BY key').all(),beforeReceipts=sql.prepare('SELECT key,value FROM minimal_receipts ORDER BY key').all();sql.exec("CREATE TRIGGER fail_local_receipt BEFORE INSERT ON minimal_receipts WHEN json_extract(NEW.value,'$.requestId')='receipt-rollback' BEGIN SELECT RAISE(ABORT,'test'); END");const rollback={requestId:'receipt-rollback',expectedRevision:paint.farm.revision,command:{type:'demoCoins',amount:50000}};assert.equal((await api('command?name=twx',rollback)).status,503);assert.deepEqual(sql.prepare('SELECT key,value FROM minimal_farms ORDER BY key').all(),beforeRows);assert.deepEqual(sql.prepare('SELECT key,value FROM minimal_receipts ORDER BY key').all(),beforeReceipts);sql.exec('DROP TRIGGER fail_local_receipt');assert.equal((await api('command?name=twx',rollback)).body.accepted,true);
 assert.equal((await api('farm?name=test')).body.view.farm,null);assert.deepEqual(readFileSync(legacy),legacyBytes);
 const model=await fetch('http://127.0.0.1:5190/sample.glb?v=34');assert.equal(model.headers.get('content-type'),'model/gltf-binary');assert.equal(await model.text(),'glTF');
 await run.stop();const restarted=await startLocal(entry,db,legacy,dist);t.after(restarted.stop);assert.deepEqual((await api('command?name=twx',request)).body,replies[0].body);assert.equal((await api('farm?name=twx')).body.view.farm!.state.coins,60090);
});
test('local adapter rejects direct, symbolic and hardlink aliases of the legacy database before schema access',async t=>{
 assert.ok(existsSync(entry));const dir=mkdtempSync(join(tmpdir(),'farm-local-alias-')),legacy=join(dir,'legacy.sqlite'),dist=join(dir,'dist');mkdirSync(dist);writeFileSync(legacy,'protected');const link=join(dir,'linked.sqlite'),hard=join(dir,'hard.sqlite');symlinkSync(legacy,link);linkSync(legacy,hard);t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const db of [legacy,link,hard]){const run=await startLocal(entry,db,legacy,dist);try{assert.equal((await api('session?name=twx')).status,503);assert.equal(readFileSync(legacy,'utf8'),'protected');}finally{await run.stop();}}
});
