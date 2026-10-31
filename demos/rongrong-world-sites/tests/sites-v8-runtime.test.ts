import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';
import type {Estate, EstateSnapshot} from '../src/v5/estate.ts';
import type {EstateD1Reply} from '../lib/estate-d1.ts';
import type {ConvoyReply} from '../src/v7/convoy.ts';
import type {HarvestReply} from '../src/v7/harvest.ts';

/** These fixture-only SQL hooks exist solely inside this in-memory test Worker.
 * They are never part of the Sites entrypoint or deployment bundle. */
const source=`
import {handleSitesApi} from './lib/sites-api.ts';
import {createEstate} from './src/v5/estate.ts';
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/fixture/sql'){const {sql,args=[]}=await request.json();return Response.json(await env.DB.prepare(sql).bind(...args).all());}
 if(path==='/fixture/seed'){
  const {device,amount,now}=await request.json(),state=createEstate(device,now),p=state.profiles.home;p.tutorial='done';p.threat=null;p.runId='fixture-'+device;
  p.production.pending=[{id:'ordinary',version:'v7',tier:'white',amount,animalId:p.animals[0].id,source:'production',batchId:'one',cycle:1},{id:'rare',version:'v7',tier:'gold',amount:20,animalId:p.animals[0].id,source:'production',batchId:'one',cycle:1}];
  await env.DB.prepare('INSERT INTO estates(device,state) VALUES(?,?)').bind(device,JSON.stringify(state)).run();return Response.json({ok:true});
 }
 if(path==='/api/estate'||path==='/api/convoy'||path==='/api/harvest')return handleSitesApi(request,path.slice(5),env.DB);
 return new Response('not found',{status:404});
}};
`;
const owner='11111111-1111-4111-8111-111111111111',visitor='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333';
type SqlRow=Record<string,unknown>;
async function runtime(){
 const bundle=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../',import.meta.url)),sourcefile:'sites-v8-test-worker.ts',loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false,target:'es2022'});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',d1Databases:['DB'],cf:false,inspectorPort:0,log:new Log(LogLevel.NONE)});
 const post=async(path:string,body:unknown,device?:string)=>mf.dispatchFetch('https://farm.example'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://farm.example',...(device?{Cookie:'farm_device='+device}:{})},body:JSON.stringify(body)});
 const sql=async(query:string,args:unknown[]=[])=>(await (await post('/fixture/sql',{sql:query,args})).json() as {results:SqlRow[]}).results;
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await sql(statement);
 return {mf,post,sql,async seed(device:string,amount=12){await post('/fixture/seed',{device,amount,now:Date.now()});},async get(path:string,device?:string){return mf.dispatchFetch('https://farm.example'+path,{headers:device?{Cookie:'farm_device='+device}:{}});}};
}
test('real Worker D1 API persists independent identities on the migrated schema and never trusts user headers',{timeout:30_000},async()=>{
 const f=await runtime();try{
  const a=await f.get('/api/estate'),cookie=a.headers.get('Set-Cookie')!;assert.match(cookie,/HttpOnly/);const initial=await a.json() as EstateSnapshot;assert.equal(initial.storage,'cloud-d1');
  const id=cookie.match(/^farm_device=([^;]+)/)![1];const r=await f.post('/api/estate',{id:'runtime-enter-1',type:'enter'},id);assert.equal((await r.json() as EstateD1Reply).accepted,true);
  const retry=await f.post('/api/estate',{id:'runtime-enter-1',type:'enter'},id);assert.equal((await retry.json() as EstateD1Reply).duplicate,true);
  const other=await f.mf.dispatchFetch('https://farm.example/api/estate',{headers:{'X-User-Id':id,'X-Device-Id':id}});assert.notEqual((await other.json() as EstateSnapshot).playerId,id);
  assert.equal((await f.sql('SELECT count(*) n FROM estates'))[0].n,2);assert.equal((await f.sql('SELECT count(*) n FROM estate_commands'))[0].n,1);
  const forbidden=await f.mf.dispatchFetch('https://farm.example/api/estate',{headers:{Origin:'https://evil.example'}});assert.equal(forbidden.status,403);await forbidden.text();
 }finally{await f.mf.dispose();}
});
test('real Worker D1 serializes convoy membership and atomic cross-estate harvest under races',{timeout:30_000},async()=>{
 const f=await runtime();try{
  const creates=await Promise.all([f.post('/api/convoy',{id:'runtime-create-1',type:'create',guardian:'dog'},owner),f.post('/api/convoy',{id:'runtime-create-1',type:'create',guardian:'dog'},owner)]);const rooms=await Promise.all(creates.map(r=>r.json())) as ConvoyReply[];assert.equal(rooms.filter(r=>r.duplicate).length,1);const roomId=rooms[0].snapshot!.room.id;
  const joins=await Promise.all([visitor,third].map(device=>f.post('/api/convoy',{id:'runtime-join-1',type:'join',roomId},device)));assert.equal((await Promise.all(joins.map(r=>r.json())) as ConvoyReply[]).filter(r=>r.accepted).length,1);
  await f.seed(owner);const open=await (await f.post('/api/harvest',{id:'runtime-open-1',type:'open'},owner)).json() as HarvestReply;assert.equal(open.accepted,true);const token=open.share!.token;
  const takes=await Promise.all([visitor,third].map(device=>f.post('/api/harvest',{id:'runtime-take-1',type:'take',token},device)));const results=await Promise.all(takes.map(r=>r.json())) as HarvestReply[];assert.equal(results.filter(r=>r.accepted).length,1);
  const state=JSON.parse(String((await f.sql('SELECT state FROM estates WHERE device=?',[owner]))[0].state)) as Estate;assert.equal(state.profiles.home.production!.pending.find(l=>l.tier==='white')!.amount,11);assert.equal(state.profiles.home.production!.pending.find(l=>l.tier==='gold')!.amount,20);
  assert.equal((await f.sql('SELECT sum(used) n FROM harvest_limits WHERE role=?',['visitor']))[0].n,1);const winner=results[0].accepted?visitor:third;assert.equal((await (await f.post('/api/harvest',{id:'runtime-take-1',type:'take',token},winner)).json() as HarvestReply).duplicate,true);
 }finally{await f.mf.dispose();}
});
test('real D1 batch failure rolls back a partially executed owner debit before retry',{timeout:30_000},async()=>{
 const f=await runtime();try{
  await f.seed(owner,20);const open=await (await f.post('/api/harvest',{id:'rollback-open-1',type:'open'},owner)).json() as HarvestReply;const command={id:'rollback-take-1',type:'take',token:open.share!.token};
  const before=(await f.sql('SELECT state FROM estates WHERE device=?',[owner]))[0].state;
  await f.sql(`CREATE TRIGGER abort_test_visitor BEFORE INSERT ON estates WHEN NEW.device='${visitor}' BEGIN SELECT RAISE(ABORT, 'test visitor save failure'); END`);
  const failed=await f.post('/api/harvest',command,visitor);assert.equal(failed.status,503);await failed.text();
  assert.equal((await f.sql('SELECT state FROM estates WHERE device=?',[owner]))[0].state,before);assert.equal((await f.sql('SELECT count(*) n FROM harvest_limits'))[0].n,0);assert.equal((await f.sql('SELECT count(*) n FROM harvest_receipts WHERE device=?',[visitor]))[0].n,0);
  await f.sql('DROP TRIGGER abort_test_visitor');const retry=await (await f.post('/api/harvest',command,visitor)).json() as HarvestReply;assert.equal(retry.received,2);assert.equal(retry.duplicate,false);
 }finally{await f.mf.dispose();}
});
test('real Worker requires acknowledged cookie before first create or join, even after lost bootstrap responses',{timeout:30_000},async()=>{
 const f=await runtime();try{
  const create={id:'initial-create-1',type:'create',guardian:'dog'};
  const lost=await f.post('/api/convoy',create);assert.equal(lost.status,428);await lost.text();
  const retried=await f.post('/api/convoy',create);assert.equal(retried.status,428);const creator=retried.headers.get('Set-Cookie')!.match(/^farm_device=([^;]+)/)![1];await retried.text();
  assert.equal((await f.sql('SELECT count(*) n FROM convoy_rooms'))[0].n,0);
  const made=await (await f.post('/api/convoy',create,creator)).json() as ConvoyReply;assert.equal(made.accepted,true);const roomId=made.snapshot!.room.id;assert.equal((await (await f.post('/api/convoy',create,creator)).json() as ConvoyReply).duplicate,true);
  const join={id:'initial-join-1',type:'join',roomId};
  const lostJoin=await f.post('/api/convoy',join);assert.equal(lostJoin.status,428);await lostJoin.text();
  const retriedJoin=await f.post('/api/convoy',join);assert.equal(retriedJoin.status,428);const guard=retriedJoin.headers.get('Set-Cookie')!.match(/^farm_device=([^;]+)/)![1];await retriedJoin.text();
  const before=JSON.parse(String((await f.sql('SELECT state FROM convoy_rooms WHERE id=?',[roomId]))[0].state)) as {members:unknown[]};assert.equal(before.members.length,1);
  assert.equal((await (await f.post('/api/convoy',join,guard)).json() as ConvoyReply).snapshot!.selfRole,'guard');assert.equal((await (await f.post('/api/convoy',join,guard)).json() as ConvoyReply).duplicate,true);
  assert.equal((await f.sql('SELECT count(*) n FROM convoy_rooms'))[0].n,1);assert.equal((await f.sql('SELECT count(*) n FROM convoy_receipts'))[0].n,2);
 }finally{await f.mf.dispose();}
});
