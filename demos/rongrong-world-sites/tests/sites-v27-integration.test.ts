import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

type Statement={bind:(...values:(string|number|null)[])=>Statement;first:<T>()=>Promise<T|null>;all:<T>()=>Promise<{results:T[]}>;run:()=>Promise<{meta:{changes:number}}>};
type TestEnv={DB?:unknown;FARM_MINIMAL_ONLINE?:string;FARM_OWNER_ACCOUNT_ID?:string;FARM_OWNER_SITE_SUBJECT?:string};
type Reply={account:{uid:string;handle:string};accepted:boolean;farm:{farmId:string};view:{farm:{farmId:string}|null};receipt:unknown;code:string};
const payload=async(response:Response|Promise<Response>):Promise<Reply>=>await (await response).json() as Reply;
const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>readFileSync(root+path,'utf8');
const baseline=JSON.parse(read('tests/fixtures/sites-v27-preservation.json'));
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const migrations=()=>JSON.parse(read('drizzle/meta/_journal.json')).entries as {tag:string}[];

async function fixture(t:{after:(fn:()=>void)=>void}){
 assert.ok(existsSync(root+'app/api/minimal/[action]/route.ts'),'Sites must expose the protected minimal route');
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 for(const migration of migrations())sql.exec(read(`drizzle/${migration.tag}.sql`));
 const queries:string[]=[];
 const prepare=(query:string):Statement=>{queries.push(query);let args:(string|number|null)[]=[];const statement:Statement={bind(...values){args=values;return statement;},async first<T>(){return (sql.prepare(query).get(...args)??null) as T|null;},async all<T>(){return {results:sql.prepare(query).all(...args) as T[]};},async run(){const result=sql.prepare(query).run(...args);return {meta:{changes:Number(result.changes)}};}};return statement;};
 let queue:Promise<unknown>=Promise.resolve();
 const db={prepare,batch(statements:Statement[]){const run=queue.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}});queue=run.catch(()=>{});return run;}};
 const bundled=await build({stdin:{contents:`export * from './app/api/minimal/[action]/route.ts';export {env as testEnv} from 'cloudflare:workers';`,resolveDir:root},bundle:true,write:false,platform:'neutral',format:'esm',metafile:true,plugins:[{name:'test-cloudflare-binding',setup(builder){builder.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env = {};',loader:'js'}));}}]});
 assert.ok(Object.keys(bundled.metafile!.inputs).every(path=>!/(?:minimal-store|server\/index|node:sqlite)/.test(path)),'Worker import graph must not include Node SQLite or standalone server');
 const module=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text+`\n//fixture ${crypto.randomUUID()}`).toString('base64')) as {GET:(r:Request)=>Promise<Response>;POST:(r:Request)=>Promise<Response>;testEnv:TestEnv};
 Object.assign(module.testEnv,{DB:db,FARM_MINIMAL_ONLINE:'1'});
 const invoke=async(path='session',subject:string|null='trusted-alice',body?:unknown,headers:Record<string,string>={},method?:string)=>module[body===undefined?'GET':'POST'](new Request('https://farm.example/api/minimal/'+path,{method:method??(body===undefined?'GET':'POST'),headers:{...(subject===null?{}:{'oai-authenticated-user-id':subject}),...(body===undefined?{}:{'Content-Type':'application/json',Origin:'https://farm.example'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 return {sql,queries,db,module,invoke};
}

test('V27 preserves all 35 original GLBs, account-info, access gate, bindings, legacy routes and old migrations',()=>{
 assert.equal(Object.keys(baseline.oldModels).length,35);
 for(const [path,expected] of Object.entries({...baseline.oldModels,...baseline.protectedFiles})){let bytes=readFileSync(root+path);if(path==='worker/index.ts')bytes=Buffer.from(bytes.toString().replace("import {rejectMixedNamedDemoRoute} from '../lib/sites-named-route.ts';\n",'').replace('      const namedRejection=rejectMixedNamedDemoRoute(request);if(namedRejection)return namedRejection;\n',''));assert.equal(hash(bytes),expected,path);}
 assert.deepEqual(migrations().slice(0,2),baseline.oldJournalEntries);
});

test('V27 appends exactly nine schema-only tables with JSON validity constraints and no seeded gate',()=>{
 const journal=migrations();assert.ok(journal.length>=3,'V27 migration remains the third entry; later additive migrations are permitted');
 const ddl=read(`drizzle/${journal[2].tag}.sql`);assert.doesNotMatch(ddl,/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\s/i);
 const sql=new DatabaseSync(':memory:');try{
  for(const entry of journal.slice(0,2))sql.exec(read(`drizzle/${entry.tag}.sql`));
  sql.prepare('INSERT INTO farm_states(device,state,revision,last_command) VALUES(?,?,?,?)').run('legacy-device','legacy-raw-state',17,'legacy-command');
  sql.prepare('INSERT INTO estates(device,state) VALUES(?,?)').run('legacy-estate','legacy-estate-raw-state');
  sql.exec(ddl);
  assert.deepEqual({...sql.prepare('SELECT * FROM farm_states').get()!},{device:'legacy-device',state:'legacy-raw-state',revision:17,last_command:'legacy-command'});
  assert.deepEqual({...sql.prepare('SELECT * FROM estates').get()!},{device:'legacy-estate',state:'legacy-estate-raw-state'});
  const tables=sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'minimal_%'").all().map(row=>row.name);assert.equal(tables.length,9);
  for(const table of tables.filter(name=>name!=='minimal_transaction_gate'))assert.throws(()=>sql.prepare(`INSERT INTO ${table}(key,value) VALUES(?,?)`).run('bad','not-json'),/CHECK constraint/);
  assert.equal(sql.prepare('SELECT count(*) n FROM minimal_transaction_gate').get()!.n,0);
 }finally{sql.close();}
});

test('actual Sites route fails closed for disabled runtime, missing identity, manual UID, cross-origin and stale account before touching D1',async t=>{
 const {module,invoke,queries}=await fixture(t);
 for(const value of [undefined,'0','true','01']){module.testEnv.FARM_MINIMAL_ONLINE=value;assert.equal((await invoke()).status,503);}
 module.testEnv.FARM_MINIMAL_ONLINE='1';
 assert.equal((await invoke('session',null,undefined,{'X-User-Id':'owner','X-Farm-Account':'owner',Cookie:'farm_device=owner'})).status,401);
 assert.equal((await invoke('session','   ')).status,401);
 assert.equal((await invoke('session','x'.repeat(513))).status,401);
 assert.equal((await invoke('session?uid=owner')).status,400);
 for(const headers of [{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}] as Record<string,string>[])assert.equal((await invoke('bootstrap','trusted-alice',{requestId:'cross',mode:'new'},headers)).status,403);
 assert.equal((await invoke('bootstrap','trusted-alice',{requestId:'stale',mode:'new'},{'X-Farm-Account':`uid_${'0'.repeat(64)}`})).status,409);
 assert.equal((await invoke('unknown')).status,404);
 assert.equal((await invoke('session','trusted-alice',undefined,{},'DELETE')).status,405);
 assert.equal(queries.length,0,'rejected requests cannot initialize storage');
});

test('actual Sites route derives UID, scopes farms/receipts, reserves owner explicitly, and always emits private identity headers',async t=>{
 const {invoke,module,sql}=await fixture(t);
 const alice='uid_'+hash(new TextEncoder().encode('farm-account-v1\0trusted-alice'));
 const session=await invoke();assert.equal(session.status,200);const data=await payload(session);assert.equal(data.account.uid,alice);assert.notEqual(data.account.handle,'twx');
 assert.equal(session.headers.get('Cache-Control'),'private, no-store');assert.equal(session.headers.get('X-Content-Type-Options'),'nosniff');assert.match(session.headers.get('Vary')!,/oai-authenticated-user-id/);assert.match(session.headers.get('Vary')!,/Cookie/);assert.equal(session.headers.get('Set-Cookie'),null);
 const start={requestId:'sites-new-alice',mode:'new'};const accepted=await payload(invoke('bootstrap','trusted-alice',start,{'X-Farm-Account':alice}));assert.equal(accepted.accepted,true);
 assert.deepEqual(await payload(invoke('bootstrap','trusted-alice',start,{'X-Farm-Account':alice})),accepted);
 assert.equal((await payload(invoke('farm','trusted-bob'))).view.farm,null);
 assert.equal((await payload(invoke('receipt?requestId=sites-new-alice','trusted-bob'))).receipt,null);
 assert.equal((await invoke('bootstrap','trusted-bob',{requestId:'forged-owner',mode:'import',legacySnapshot:{}})).status,403);
 const forged=await payload(invoke('bootstrap','trusted-bob',{requestId:'forged-uid',mode:'new',owner:alice}));assert.equal(forged.code,'invalid-request');
 module.testEnv.FARM_OWNER_ACCOUNT_ID='sharing-account-uuid-not-a-canonical-uid';assert.notEqual((await payload(invoke())).account.handle,'twx');
 module.testEnv.FARM_OWNER_ACCOUNT_ID=alice;assert.equal((await payload(invoke())).account.handle,'twx');assert.equal((await payload(invoke('farm'))).view.farm?.farmId,accepted.farm.farmId);
 assert.equal(sql.prepare('SELECT count(*) n FROM minimal_farms').get()!.n,1);
});

test('actual generated D1 schema tolerates eight concurrent initializations and preserves an existing gate',async t=>{
 const {module,invoke,sql,queries}=await fixture(t);
 await Promise.all(Array.from({length:8},()=>invoke('receipt?requestId=unknown')));
 assert.equal(sql.prepare('SELECT count(*) n FROM minimal_transaction_gate').get()!.n,1);
 sql.exec("UPDATE minimal_transaction_gate SET revision=37,token='existing-token' WHERE id='v1'");
 await Promise.all(Array.from({length:8},()=>invoke('receipt?requestId=unknown')));
 assert.deepEqual({...sql.prepare('SELECT revision,token FROM minimal_transaction_gate').get()!},{revision:37,token:'existing-token'});
 assert.ok(queries.every(query=>!/^\s*(CREATE|ALTER|DROP)\b/i.test(query)));
 delete module.testEnv.DB;const unavailable=await invoke();assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('Cache-Control'),'private, no-store');
});

test('all four creative catalog models are shipped and nine Hunyuan paths represent six unique verified assets',async()=>{
 const {CREATIVE_CATALOG}=await import('../src/minimal/creative-assets.ts');
 const {HUNYUAN_ENVIRONMENT_ASSETS}=await import('../src/minimal/hunyuan-environment-assets.ts');
 const assets=[...Object.values(HUNYUAN_ENVIRONMENT_ASSETS),...CREATIVE_CATALOG.map(template=>template.model.status==='ready'?template.model:null)];
 assert.equal(assets.length,9);const unique=new Set<string>();
 for(const asset of assets){assert.ok(asset);assert.equal(asset.source,'hunyuan-generated');const bytes=readFileSync(root+'public'+asset.url);assert.equal(hash(bytes),asset.sha256,asset.url);unique.add(asset.sha256);assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);}
 assert.equal(unique.size,6);
});

test('the exact pinned source sync stays intact without overwriting Sites-specific entry or legacy clients',()=>{
 const sync=JSON.parse(read('docs/sites-named-demo-source-sync.json'));
 assert.equal(sync.baseCommit,'a784b406380d7f692080f3a7240c6f612bf8bd75');assert.match(sync.candidateCommit,/^[a-f0-9]{40}$/);
 for(const [path,expected] of Object.entries(sync.copiedFiles))assert.equal(hash(readFileSync(root+path)),expected,path);
 const entry=read('src/main.tsx');assert.match(entry,/import\('\.\/minimal\/FarmEntry\.tsx'\)/);assert.doesNotMatch(entry,/createRoot\(/);
});


test('actual route rejects invalid bodies before mutation and missing schema stays closed without runtime DDL',async t=>{
 const {module,invoke,queries,sql}=await fixture(t);
 const invalid=await module.POST(new Request('https://farm.example/api/minimal/bootstrap',{method:'POST',headers:{'oai-authenticated-user-id':'trusted-alice','Content-Type':'application/json'},body:'{'}));assert.equal(invalid.status,400);
 assert.equal((await invoke('bootstrap','trusted-alice',{requestId:'wrong-type',mode:'new'},{'Content-Type':'text/plain'})).status,415);
 assert.equal((await invoke('bootstrap','trusted-alice',{requestId:'too-large',padding:'x'.repeat(131073)})).status,413);
 assert.equal(queries.length,0);
 sql.exec('DROP TABLE minimal_transaction_gate');const failed=await invoke();assert.equal(failed.status,503);assert.equal(failed.headers.get('Cache-Control'),'private, no-store');
 assert.ok(queries.every(query=>!/^\s*(CREATE|ALTER|DROP)\b/i.test(query)));
 assert.equal(sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='minimal_transaction_gate'").get()!.n,0);
});
