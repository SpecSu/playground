import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {handleMinimalApi,deriveAccountId} from '../server/minimal-api.ts';
import {handleNamedDemoApi} from '../server/minimal-demo.ts';
import {MinimalD1Repository,type MinimalD1Database,type MinimalD1Statement} from '../server/minimal-d1.ts';
import {MinimalAuthority} from '../src/minimal/authority.ts';
import type {MinimalResult} from '../src/minimal/cloud-contract.ts';
import type {BoardingPage} from '../src/minimal/boarding-contract.ts';
import {NOW} from './helpers/boarding-fixture.ts';
const fingerprint=async(s:string)=>createHash('sha256').update(s).digest('hex');
async function fixture(t:{after:(fn:()=>void)=>void}){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
 for(const entry of journal.entries)sql.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`,import.meta.url),'utf8'));
 const prepare=(query:string):MinimalD1Statement=>{let args:(string|number|null)[]=[];const statement:MinimalD1Statement={bind(...values){args=values;return statement;},async first<T>(){return (sql.prepare(query).get(...args)??null) as T|null;},async all<T>(){return {results:sql.prepare(query).all(...args) as T[]};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return statement;};
 let queue=Promise.resolve();const db:MinimalD1Database={prepare,batch(statements){const run=queue.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}});queue=run.then(()=>{},()=>{});return run;}};
 let now=NOW,id=0;const repository=new MinimalD1Repository(db),options={clock:()=>now,newId:()=>`d1_board_${++id}`,fingerprint},authority=new MinimalAuthority(repository,options);
 const invoke=(subject:string|null,path:string,body?:unknown,headers:Record<string,string>={})=>handleMinimalApi(new Request('https://farm.example/api/minimal/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),{enabled:true,subject,repository,...options});
 const alice=await deriveAccountId('alice'),bob=await deriveAccountId('bob');
 for(const [subject,uid,sex] of [['alice',alice,'female'],['bob',bob,'male']] as const){await invoke(subject,'session');await invoke(subject,'bootstrap',{requestId:'new',mode:'new'});await repository.transaction(async tx=>{const f=(await tx.get('farms',uid))!;f.state.welcomeClaimed=true;f.state.coins=100;f.state.sequence=3;f.state.animals=[{id:`${f.farmId}:parent`,name:subject,species:'cow',sex,size:'normal',rarity:'gold',position:{x:2,z:2},activity:'idle',activityUntil:NOW+1_000_000,energy:80,bond:30,bornAt:NOW-500_000}];f.assetProvenance[f.state.animals[0].id]='server-created';await tx.put('farms',uid,f);});}
 const farm=async(uid=alice)=>(await authority.get(uid)).farm!;
 const invite=async()=>await(await invoke('alice','boarding-command',{requestId:'invite',expectedRevision:(await farm()).revision,command:{type:'invite',targetUid:bob,animalId:(await farm()).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}})).json() as MinimalResult;
 return {sql,repository,db,options,authority,alice,bob,invoke,farm,invite,setNow:(v:number)=>{now=v;}};
}
test('protected API rejects missing auth origin spoof and named-demo boarding before any new storage access',async t=>{
 const {invoke,options}=await fixture(t);assert.equal((await invoke(null,'boarding')).status,401);assert.equal((await invoke('alice','boarding',undefined,{Origin:'https://evil.example'})).status,403);assert.equal((await invoke('alice','boarding',undefined,{'X-Farm-Account':`uid_${'0'.repeat(64)}`})).status,409);
 let touched=false;const response=await handleNamedDemoApi(new Request('https://farm.example/api/minimal/boarding?name=twx'),{...options,enabled:true,boundary:{kind:'sites-owner',ownerSubject:'alice'},repositoryForNamespace:()=>{touched=true;throw new Error('must not touch demo rows');}});assert.equal(response.status,403);assert.equal((await response.json() as {code:string}).code,'production-account-required');assert.equal(touched,false);
});
test('SQLite D1 CAS serializes duplicate acceptances and due settlement with no cross-account projection',async t=>{
 const {invoke,alice,bob,invite,authority,farm,setNow,sql}=await fixture(t);const invitation=await invite();assert.equal(invitation.accepted,true,invitation.message);const command={expectedRevision:(await farm(bob)).revision,command:{type:'accept',invitationId:invitation.boarding!.id,invitationRevision:1,animalId:(await farm(bob)).state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}};
 const responses=await Promise.all(['a','b','c'].map(requestId=>invoke('bob','boarding-command',{...command,requestId})));const results=await Promise.all(responses.map(async r=>await r.json() as MinimalResult));assert.equal(results.filter(r=>r.accepted).length,1);assert.ok(results.every(r=>r.farm?.accountId===bob));assert.equal((await farm()).state.eggs.length,0);setNow(NOW+300_000);
 await Promise.all([authority.get(alice),authority.get(bob),authority.boardingList(bob)]);const a=await farm(),b=await farm(bob);assert.equal(a.state.eggs.length,1);assert.equal(a.state.eggs[0].location,'bag');assert.equal(b.state.coins,105);assert.equal(a.activeBoardingId,null);assert.equal(b.activeBoardingId,null);assert.equal(a.state.animals.length,1);assert.equal(b.state.animals.length,1);
 const page=await(await invoke('bob','boarding')).json() as BoardingPage;assert.equal(page.invitations[0].status,'completed');assert.equal((await(await invoke('eve','boarding')).json() as BoardingPage).invitations.length,0);const stored=JSON.parse(sql.prepare('SELECT value FROM minimal_boardings').get()!.value as string);assert.equal(stored.pendingEgg,undefined);assert.equal(stored.eggOrigin,undefined);
});
test('boarding migration is additive and runtime table retains JSON validity checks',async t=>{
 const {sql}=await fixture(t);assert.ok(sql.prepare("SELECT name FROM sqlite_master WHERE name='minimal_boardings'").get());assert.throws(()=>sql.exec("INSERT INTO minimal_boardings(key,value) VALUES('bad','oops')"),/CHECK/);assert.ok(sql.prepare("SELECT name FROM sqlite_master WHERE name='farm_states'").get());
});

test('SQLite batch failure rolls back both accepted attempts, locks, pending result and receipt before safe retry',async t=>{
 const {sql,invite,invoke,farm,bob}=await fixture(t),inv=await invite(),beforeA=await farm(),beforeB=await farm(bob),gate=sql.prepare('SELECT revision,token FROM minimal_transaction_gate').get();
 sql.exec("CREATE TRIGGER fail_boarding_accept BEFORE UPDATE ON minimal_boardings WHEN json_extract(NEW.value,'$.status')='active' BEGIN SELECT RAISE(ABORT,'injected boarding write failure'); END");
 const request={requestId:'rollback-accept',expectedRevision:beforeB.revision,command:{type:'accept',invitationId:inv.boarding!.id,invitationRevision:1,animalId:beforeB.state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}};assert.equal((await invoke('bob','boarding-command',request)).status,503);assert.deepEqual(await farm(),beforeA);assert.deepEqual(await farm(bob),beforeB);assert.deepEqual(sql.prepare('SELECT revision,token FROM minimal_transaction_gate').get(),gate);assert.equal(sql.prepare("SELECT count(*) n FROM minimal_receipts WHERE json_extract(value,'$.requestId')='rollback-accept'").get()!.n,0);sql.exec('DROP TRIGGER fail_boarding_accept');const retried=await(await invoke('bob','boarding-command',request)).json() as MinimalResult;assert.equal(retried.accepted,true);assert.equal(retried.boarding!.status,'active');
});

test('competing wishing deposit and boarding invitation cannot reserve the same canonical animal twice',async t=>{
 const {invoke,farm,invite,authority,alice}=await fixture(t),a=await farm();const wishing=invoke('alice','wishing',{requestId:'wishing-race',expectedRevision:a.revision,command:{type:'deposit',animalId:a.state.animals[0].id,consent:'any-different-species'}}).then(async r=>await r.json() as MinimalResult);const results=await Promise.all([wishing,invite()]);assert.equal(results.filter(r=>r.accepted).length,1);const after=(await authority.get(alice)).farm!;assert.notEqual(!!after.activeOfferId,!!after.activeBoardingId);
});

test('terminal clock sealing rolls back with eggs rewards locks and receipt on a final-row SQL failure',async t=>{
 const {sql,invite,invoke,authority,farm,bob,alice,setNow}=await fixture(t),inv=await invite(),b=await farm(bob);
 const accepted=await(await invoke('bob','boarding-command',{requestId:'clock-accept',expectedRevision:b.revision,command:{type:'accept',invitationId:inv.boarding!.id,invitationRevision:1,animalId:b.state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}})).json() as MinimalResult;assert.equal(accepted.accepted,true);
 const snapshot=()=>Object.fromEntries(['minimal_farms','minimal_boardings','minimal_receipts','minimal_transaction_gate'].map(table=>[table,sql.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()])),before=snapshot();
 sql.exec("CREATE TRIGGER fail_terminal_clock BEFORE UPDATE ON minimal_boardings WHEN json_extract(NEW.value,'$.status')='completed' BEGIN SELECT RAISE(ABORT,'terminal clock failure'); END");setNow(NOW+300_000);
 const request={requestId:'clock-terminal-cancel',expectedRevision:accepted.farm!.revision,command:{type:'cancel',invitationId:inv.boarding!.id,invitationRevision:2}};
 assert.equal((await invoke('bob','boarding-command',request)).status,503);assert.deepEqual(snapshot(),before,'no advanced timestamp, idle reset, egg, coins, receipt or gate may partially commit');sql.exec('DROP TRIGGER fail_terminal_clock');
 await Promise.all([authority.get(alice),authority.get(bob),authority.boardingList(alice)]);const a=await farm(),afterB=await farm(bob);assert.equal(a.state.updatedAt,NOW+300_000);assert.equal(afterB.state.updatedAt,NOW+300_000);assert.equal(a.state.eggs.length,1);assert.equal(afterB.state.coins,105);assert.equal(a.boardingAnimalId,null);assert.equal(afterB.boardingAnimalId,null);const terminal=snapshot();await authority.get(alice);await authority.boardingList(bob);assert.deepEqual(snapshot(),terminal);
});
