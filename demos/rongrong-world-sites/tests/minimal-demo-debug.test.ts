import test from 'node:test';import assert from 'node:assert/strict';
import {demoDebugFixture} from './helpers/demo-debug-fixture.ts';
import {SHOP_APPROACH} from '../src/minimal/model.ts';
import {AccountClient,type AccountStorage} from '../src/minimal/account-client.ts';
const grant=(requestId:string,expectedRevision:number,amount:unknown=10000)=>({requestId,expectedRevision,command:{type:'demoCoins',amount}});
test('duplicate concurrent grants serialize to one receipt and the inclusive safety limit does not overflow',async t=>{
 const f=demoDebugFixture();t.after(f.close);const a=await f.start();
 const results=await Promise.all(Array.from({length:4},()=>f.call('command'+a.suffix,grant('concurrent',1))));assert.ok(results.every(r=>r.body.accepted));for(const r of results)assert.deepEqual(r.body,results[0].body);assert.equal(f.stored(a.account.uid).farm.state.coins,10000);
 const row=f.stored(a.account.uid);row.farm.state.coins=999_990_000;f.sql.prepare('UPDATE minimal_farms SET value=? WHERE key=?').run(JSON.stringify(row.farm),row.key);
 const limit=(await f.call('command'+a.suffix,grant('limit',row.farm.revision))).body;assert.equal(limit.accepted,true);assert.equal(limit.farm!.state.coins,1_000_000_000);const rejected=(await f.call('command'+a.suffix,grant('over',limit.farm!.revision))).body;assert.equal(rejected.accepted,false);assert.equal(f.stored(a.account.uid).farm.state.coins,1_000_000_000);
});
test('verified demo grants exact allowed amounts once and never interprets reused IDs as another grant',async t=>{
 const f=demoDebugFixture();t.after(f.close);const a=await f.start();const req=grant('grant',a.farm.revision);
 const result=(await f.call('command'+a.suffix,req)).body;assert.equal(result.accepted,true,result.message);assert.equal(result.farm!.state.coins,10000);assert.equal(result.farm!.revision,a.farm.revision+1);
 assert.deepEqual((await f.call('command'+a.suffix,req)).body,result);assert.equal((await f.call('command'+a.suffix,grant('grant',a.farm.revision,50000))).body.code,'request-id-reused');
 const next=(await f.call('command'+a.suffix,grant('next',result.farm!.revision,50000))).body;assert.equal(next.accepted,true);assert.equal(next.farm!.state.coins,60000);
 assert.equal((await f.call('command'+a.suffix,grant('stale',a.farm.revision))).body.code,'stale-farm');assert.equal(f.stored(a.account.uid).farm.state.coins,60000);
});
test('formal twx handle, forged JSON privilege and disabled or unverified demo routes cannot mint',async t=>{
 const f=demoDebugFixture();t.after(f.close);f.env.FARM_OWNER_SITE_SUBJECT='alice';const formal=await f.start(null);assert.equal(formal.account.handle,'twx');const before=f.stored(formal.account.uid).farm;
 const result=(await f.call('command',grant('formal',before.revision))).body;assert.equal(result.accepted,false);assert.deepEqual(f.stored(formal.account.uid).farm,before);
 const demo=await f.start('twx');for(const command of [{...grant('body-uid',1),uid:demo.account.uid},{...grant('body-scope',1),demoIdentity:{kind:'named-demo',name:'twx'}},{...grant('body-grant',1),demoDebugAccountId:demo.account.uid}])assert.equal((await f.call('command'+demo.suffix,command)).body.accepted,false);
 for(const [subject,headers,env,status] of [[null,{},f.env,401],['alice',{}, {...f.env,FARM_NAMED_DEMO:'0'},503],['alice',{Origin:'https://evil.example'},f.env,403],['alice',{'X-Farm-Account':formal.account.uid},f.env,409]] as const){const n=f.queries.length;assert.equal((await f.call('command?name=twx',grant('blocked',1),subject,headers,env)).status,status);assert.equal(f.queries.length,n);}
 assert.equal((await f.call('command?name=twx&subject=alice',grant('query',1))).status,400);assert.equal(f.stored(demo.account.uid).farm.state.coins,0);
});
test('malformed grants and unsafe or capped balances reject without changing coins',async t=>{
 const f=demoDebugFixture();t.after(f.close);const a=await f.start('test');
 for(const [i,amount] of [0,-10000,1,9999,10001,50001,10000.5,'10000',null,{},[],Number.MAX_SAFE_INTEGER].entries())assert.equal((await f.call('command'+a.suffix,grant('bad_'+i,1,amount))).body.accepted,false);
 assert.equal(f.stored(a.account.uid).farm.state.coins,0);
 for(const [i,coins] of [999_990_001,Number.MAX_SAFE_INTEGER,Infinity,0.5].entries()){const row=f.stored(a.account.uid);row.farm.state.coins=coins;f.sql.prepare('UPDATE minimal_farms SET value=? WHERE key=?').run(JSON.stringify(row.farm),row.key);const response=(await f.call('command'+a.suffix,grant('limit_'+i,1))).body;assert.equal(response.accepted,false);assert.equal(f.stored(a.account.uid).farm.state.coins,Number.isFinite(coins)?coins:null);}
});
test('receipt write failure rolls back coin grant and a retry safely commits once',async t=>{
 const f=demoDebugFixture();t.after(f.close);const a=await f.start();const before=f.snapshot(),req=grant('rollback',1);
 f.sql.exec("CREATE TRIGGER fail_grant BEFORE INSERT ON minimal_receipts WHEN json_extract(NEW.value,'$.requestId')='rollback' BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END");
 assert.equal((await f.call('command'+a.suffix,req)).status,503);assert.deepEqual(f.snapshot(),before);f.sql.exec('DROP TRIGGER fail_grant');assert.equal((await f.call('command'+a.suffix,req)).body.accepted,true);assert.equal(f.stored(a.account.uid).farm.state.coins,10000);
});
test('debug-funded eggs and offers remain in one demo namespace, never formal or another subject',async t=>{
 const f=demoDebugFixture();t.after(f.close);const a=await f.start(),b=await f.start('test'),formal=await f.start(null),other=await f.start('twx','bob');const formalBefore=f.stored(formal.account.uid).farm,otherBefore=f.stored(other.account.uid).farm;
 const placed=f.stored(a.account.uid);placed.farm.state.player={...SHOP_APPROACH};f.sql.prepare('UPDATE minimal_farms SET value=? WHERE key=?').run(JSON.stringify(placed.farm),placed.key);const welcomed=(await f.call('command'+a.suffix,{requestId:'welcome',expectedRevision:1,command:{type:'welcome'}})).body;assert.equal(welcomed.accepted,true);const added=(await f.call('command'+a.suffix,grant('fund',welcomed.farm!.revision,50000))).body;assert.equal(added.accepted,true);const bought=(await f.call('command'+a.suffix,{requestId:'buy',expectedRevision:added.farm!.revision,command:{type:'buyEgg'}})).body;assert.equal(bought.accepted,true,bought.message);
 const offer=(await f.call('wishing'+a.suffix,{requestId:'deposit',expectedRevision:bought.farm!.revision,command:{type:'depositAsset',asset:{kind:'egg',id:bought.farm!.state.eggs[0].id},accepts:['egg'],consent:'listed-kinds'}})).body;assert.equal(offer.accepted,true,offer.message);
 assert.equal((await f.call('offers'+b.suffix)).body.offers.length,1);assert.equal((await f.call('offers')).body.offers.length,0);assert.equal((await f.call('offers?name=twx',undefined,'bob')).body.offers.length,0);
 const forged=(await f.call('wishing',{requestId:'steal',expectedRevision:formalBefore.revision,command:{type:'acceptAsset',offerId:offer.offer!.offerId,offerRevision:1,asset:{kind:'egg',id:bought.farm!.state.eggs[0].id}}})).body;assert.equal(forged.accepted,false);assert.deepEqual(f.stored(formal.account.uid).farm,formalBefore);assert.deepEqual(f.stored(other.account.uid).farm,otherBefore);assert.equal(f.sql.prepare('SELECT count(*) n FROM minimal_wishing_trades').get()!.n,0);
});
test('actual AccountClient lost ACK survives reload, cannot be replaced, and old receipt cannot revert newer balance',async t=>{
 const f=demoDebugFixture();t.after(f.close);const a=await f.start(),initial=(await f.call('farm'+a.suffix)).body.view;const map=new Map<string,string>(),storage:AccountStorage={get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);},removeItem:k=>{map.delete(k);}};
 let lose=true;const ids:string[]=[];const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{const path=String(input).replace('/api/minimal/',''),body=init?.body?JSON.parse(String(init.body)):undefined;if(body)ids.push(body.requestId);const response=await f.request(path,body);if(body&&lose){lose=false;throw Error('lost grant ACK');}return response;};
 const client=new AccountClient(a.account,initial,fetcher,storage,'twx');t.after(()=>client.dispose());await assert.rejects(client.command({type:'demoCoins',amount:10000}));assert.ok(client.pending);assert.equal(f.stored(a.account.uid).farm.state.coins,10000);await assert.rejects(client.command({type:'demoCoins',amount:50000}),/上一条/);
 const newer=(await f.call('command'+a.suffix,grant('second-client',2,50000))).body;assert.equal(newer.accepted,true);
 const reloaded=new AccountClient(a.account,(await f.call('farm'+a.suffix)).body.view,fetcher,storage,'twx');t.after(()=>reloaded.dispose());assert.ok(reloaded.pending);const replay=await reloaded.retry();assert.equal(replay.accepted,true);assert.equal(reloaded.pending,null);assert.equal(reloaded.farm!.state.coins,60000);assert.equal(new Set(ids).size,1);assert.equal(map.size,0);
});
