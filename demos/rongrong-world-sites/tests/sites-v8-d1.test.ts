import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {EstateD1Store} from '../lib/estate-d1.ts';
import {ConvoyD1Store} from '../lib/convoy-d1.ts';
import {HarvestD1Store} from '../lib/harvest-d1.ts';
import {createEstate,type Estate} from '../src/v5/estate.ts';
import {createFarm} from '../src/model.ts';
const T=1_800_000_000_000;
class Statement{
 db:DatabaseSync;sql:string;args:SQLInputValue[];
 constructor(db:DatabaseSync,sql:string,args:SQLInputValue[]=[]){this.db=db;this.sql=sql;this.args=args;}
 bind(...args:SQLInputValue[]){return new Statement(this.db,this.sql,args);}
 async first<T>(){return this.db.prepare(this.sql).get(...this.args) as T??null;}
 execute(){const r=this.db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}};}
 async run(){return this.execute();}
}
function fixture(){
 const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
 let fail=false;const d1={prepare:(sql:string)=>new Statement(db,sql),batch:async(stmts:Statement[])=>{db.exec('BEGIN');try{const out=[];for(let i=0;i<stmts.length;i++){if(fail&&i===stmts.length-1){fail=false;throw new Error('injected batch failure');}out.push(stmts[i].execute());}db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}},withSession(){return this;}} as unknown as D1Database;
 return {db,d1,estate:new EstateD1Store(d1),convoy:new ConvoyD1Store(d1),harvest:new HarvestD1Store(d1),failNextBatch(){fail=true;},close(){db.close();}};
}
function seed(db:DatabaseSync,id:string,amount=12){const s=createEstate(id,T),p=s.profiles.home;p.tutorial='done';p.threat=null;p.runId=`run-${id}`;p.production!.pending=[{id:`${id}-ordinary`,version:'v7',tier:'white',amount,animalId:p.animals[0].id,source:'production',batchId:'period1',cycle:1},{id:`${id}-rare`,version:'v7',tier:'gold',amount:20,animalId:p.animals[0].id,source:'production',batchId:'period1',cycle:1}];db.prepare('INSERT INTO estates(device,state) VALUES(?,?)').run(id,JSON.stringify(s));return s;}
function saved(db:DatabaseSync,id:string){return JSON.parse(String(db.prepare('SELECT state FROM estates WHERE device=?').get(id)!.state)) as Estate;}
test('D1 estates migrate legacy without overwriting it, isolate identities, persist and bind retries to payload',async()=>{
 const f=fixture();try{const legacy=createFarm('owner',T);legacy.avatar='banana-cat';const original=JSON.stringify(legacy);f.db.prepare('INSERT INTO farm_states(device,state,revision,last_command) VALUES(?,?,0,?)').run('owner',original,'');
 const initial=await f.estate.get('owner',T);assert.equal(initial.storage,'cloud-d1');assert.equal(initial.avatar,'banana-cat');assert.equal(f.db.prepare('SELECT state FROM farm_states WHERE device=?').get('owner')!.state,original);
 const command={id:'enter-owner-1',type:'enter'},first=await f.estate.command('owner',command,T);assert.equal(first.accepted,true);
 assert.equal((await new EstateD1Store(f.d1).command('owner',command,T+100)).duplicate,true);
 assert.equal((await f.estate.command('owner',{...command,type:'avatar',avatar:'miaocuijiao'},T+100)).accepted,false);
 assert.equal((await f.estate.get('other',T)).avatar,'human-lx');assert.equal(saved(f.db,'owner').profiles.home.session,command.id);
 }finally{f.close();}
});
test('D1 convoy joins serialize to two identities and same command creates exactly one persisted room',async()=>{
 const f=fixture();try{const create={id:'create-room-1',type:'create',guardian:'cat' as const};const results=await Promise.all([f.convoy.command('a',create,T),f.convoy.command('a',create,T)]);assert.equal(results.filter(r=>r.duplicate).length,1);const roomId=results[0].snapshot!.room.id;assert.equal(f.db.prepare('SELECT count(*) n FROM convoy_rooms').get()!.n,1);
 const joins=await Promise.all(['b','c'].map(device=>f.convoy.command(device,{id:`join-room-${device}`,type:'join',roomId},T)));assert.equal(joins.filter(r=>r.accepted).length,1);assert.equal((await f.convoy.get('outsider',roomId,T)).snapshot,null);
 const move={id:'move-carrier-1',type:'move',roomId,sequence:1,x:4,z:4};assert.equal((await f.convoy.command('a',move,T)).accepted,true);assert.equal((await f.convoy.command('a',{...move,x:6},T)).accepted,false);assert.equal((await new ConvoyD1Store(f.d1).get('a',roomId,T+500)).snapshot!.sequence,1);
 }finally{f.close();}
});
test('D1 harvest races transfer the finite ordinary pool once with quotas and receipts in the same transaction',async()=>{
 const f=fixture();try{seed(f.db,'owner');const open=await f.harvest.command('owner',{id:'open-share-1',type:'open'},T),token=open.share!.token;
 const results=await Promise.all(['visitor','third'].map(device=>f.harvest.command(device,{id:`take-share-${device}`,type:'take',token},T)));assert.equal(results.filter(r=>r.accepted).length,1);const winner=results[0].accepted?'visitor':'third';assert.equal(saved(f.db,'owner').profiles.home.production!.pending.find(l=>l.tier==='white')!.amount,11);assert.equal(saved(f.db,'owner').profiles.home.production!.pending.find(l=>l.tier==='gold')!.amount,20);assert.equal(saved(f.db,winner).profiles.home.economy!.warehouse.white,1);
 assert.equal((await f.harvest.command(winner,{id:`take-share-${winner}`,type:'take',token},T)).duplicate,true);assert.equal(f.db.prepare('SELECT used FROM harvest_limits WHERE device=? AND role=?').get(winner,'visitor')!.used,1);assert.equal((await f.harvest.command(winner,{id:`take-share-${winner}`,type:'close'},T)).accepted,false);
 }finally{f.close();}
});
test('D1 failed batch rolls back both estate balances, ledger, quota and receipt and permits safe retry',async()=>{
 const f=fixture();try{seed(f.db,'owner',20);const token=(await f.harvest.command('owner',{id:'open-share-1',type:'open'},T)).share!.token;const before=JSON.stringify(saved(f.db,'owner'));f.failNextBatch();const command={id:'atomic-transfer-1',type:'take' as const,token};await assert.rejects(f.harvest.command('visitor',command,T),/injected batch failure/);
 assert.equal(JSON.stringify(saved(f.db,'owner')),before);assert.equal(f.db.prepare('SELECT state FROM estates WHERE device=?').get('visitor'),undefined);assert.equal(f.db.prepare('SELECT count(*) n FROM harvest_limits').get()!.n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM harvest_receipts WHERE device=?').get('visitor')!.n,0);
 assert.equal((await f.harvest.command('visitor',command,T)).received,2);
 }finally{f.close();}
});
test('D1 harvest capabilities rotate on reopen, reject self and isolate home/lab without giving identity away',async()=>{
 const f=fixture();try{seed(f.db,'owner');const token=(await f.harvest.command('owner',{id:'open-share-1',type:'open'},T)).share!.token;assert.match(token,/^[a-f0-9]{48}$/);assert.equal((await f.harvest.command('owner',{id:'self-take-1',type:'take',token},T)).accepted,false);
 await f.harvest.command('owner',{id:'close-share-1',type:'close'},T);assert.equal((await f.harvest.get('visitor',token,T)).accepted,false);const next=(await f.harvest.command('owner',{id:'reopen-share-1',type:'open'},T)).share!.token;assert.notEqual(next,token);
 const visitor=seed(f.db,'visitor');visitor.profiles.lab={...structuredClone(visitor.profiles.home),id:'lab',runId:'lab-run'};visitor.activeProfile='lab';f.db.prepare('UPDATE estates SET state=? WHERE device=?').run(JSON.stringify(visitor),'visitor');assert.equal((await f.harvest.command('visitor',{id:'cross-profile-1',type:'take',token:next,profile:'home'},T)).accepted,false);assert.equal(JSON.stringify(await f.harvest.get('visitor',next,T)).includes('"owner"'),false);
 }finally{f.close();}
});
test('legacy migration retains names, appearances, relationships, habits, memories and earned wool exactly once',async()=>{
 const f=fixture();try{const old=createFarm('established-owner',T-86_400_000);old.wool=17;old.stage=true;old.book={met:['pipi'],claimed:['first-feed'],rememberedVisits:8};old.animals[0].name='老朋友';old.animals[0].bond=10;old.animals[0].appearance='starlit';old.animals[0].habits.dance={count:3,stage:'invite',lastAt:T-1000};old.animals[0].experiences=[{text:'还记得第一次一起跳舞',at:T-1000}];old.animals[0].care.feedCount=3;const raw=JSON.stringify(old);f.db.prepare('INSERT INTO farm_states(device,state,revision,last_command) VALUES(?,?,?,?)').run(old.playerId,raw,old.revision,'legacy-receipt');f.db.prepare('INSERT INTO farm_commands(device,id,receipt) VALUES(?,?,?)').run(old.playerId,'legacy-receipt','{"accepted":true}');
 const migrated=await f.estate.get(old.playerId,T);const animal=migrated.profile.animals[0];assert.equal(animal.id,'pipi');assert.equal(animal.name,'老朋友');assert.equal(animal.appearance,'starlit');assert.equal(animal.life.bond,80);assert.equal(animal.life.habits.dance!.stage,'invite');assert.equal(animal.life.memory[0].text,'还记得第一次一起跳舞');assert.equal(migrated.profile.economy!.warehouse.white,17);assert.equal(migrated.profile.economy!.lots!.find(l=>l.source==='legacy-site-inventory')!.version,'legacy');assert.deepEqual(migrated.legacy,old);
 assert.equal((await new EstateD1Store(f.d1).get(old.playerId,T)).profile.economy!.warehouse.white,17);assert.equal(f.db.prepare('SELECT state FROM farm_states WHERE device=?').get(old.playerId)!.state,raw);assert.equal(f.db.prepare('SELECT receipt FROM farm_commands WHERE device=?').get(old.playerId)!.receipt,'{"accepted":true}');
 }finally{f.close();}
});
test('D1 rejection receipts prevent an invalid command ID being repurposed into a later mutation',async()=>{
 const f=fixture();try{
  const invalid={id:'invalid-create-1',type:'create',guardian:null} as unknown as import('../src/v7/convoy.ts').ConvoyCommand;
  assert.equal((await f.convoy.command('a',invalid,T)).accepted,false);assert.equal((await f.convoy.command('a',invalid,T)).duplicate,true);assert.equal((await f.convoy.command('a',{id:invalid.id,type:'create',guardian:'dog'},T)).accepted,false);assert.equal(f.db.prepare('SELECT count(*) n FROM convoy_rooms').get()!.n,0);
  const missing={id:'missing-room-1',type:'join',roomId:'none'};assert.equal((await f.convoy.command('a',missing,T)).accepted,false);assert.equal((await f.convoy.command('a',missing,T)).duplicate,true);
  const invalidHarvest={id:'invalid-harvest-1',type:'surprise'} as unknown as import('../src/v7/harvest.ts').HarvestCommand;
  assert.equal((await f.harvest.command('a',invalidHarvest,T)).accepted,false);assert.equal((await f.harvest.command('a',invalidHarvest,T)).duplicate,true);assert.equal((await f.harvest.command('a',{id:invalidHarvest.id,type:'close'},T)).accepted,false);
 }finally{f.close();}
});
test('owner claiming products races with a shared harvest without double-crediting either estate',async()=>{
 const f=fixture();try{seed(f.db,'owner',12);const token=(await f.harvest.command('owner',{id:'open-race-claim',type:'open'},T)).share!.token;
 const [claim,take]=await Promise.all([f.estate.command('owner',{id:'owner-claim-race',type:'claimProducts'},T),f.harvest.command('visitor',{id:'visitor-take-race',type:'take',token},T)]);assert.equal(claim.accepted,true);
 const own=saved(f.db,'owner').profiles.home,visitor=f.db.prepare('SELECT state FROM estates WHERE device=?').get('visitor');const received=visitor?(JSON.parse(String(visitor.state)) as Estate).profiles.home.economy!.warehouse.white:0;
 assert.equal(own.economy!.warehouse.white+received,12);assert.equal(own.economy!.warehouse.gold,20);assert.equal(own.production!.pending.length,0);assert.equal(received,take.accepted?1:0);assert.equal((await f.estate.command('owner',{id:'owner-claim-race',type:'claimProducts'},T)).duplicate,true);
 }finally{f.close();}
});
test('D1 owner and visitor daily quotas survive fresh sources, reset only at UTC day boundary, and reset invalidates shares',async()=>{
 const f=fixture();try{seed(f.db,'owner',12);const token=(await f.harvest.command('owner',{id:'open-daily-share',type:'open'},T)).share!.token;
 for(let i=0;i<4;i++){
  const owner=saved(f.db,'owner');owner.profiles.home.production!.pending.push({id:`fresh-source-${i}`,version:'v7',tier:'white',amount:10,animalId:owner.profiles.home.animals[0].id,source:'production',batchId:`extra-${i}`,cycle:i+2});f.db.prepare('UPDATE estates SET state=? WHERE device=?').run(JSON.stringify(owner),'owner');
  const result=await f.harvest.command(`guest-${i}`,{id:`daily-harvest-${i}`,type:'take',token},T);assert.equal(result.accepted,i<3,result.message);
 }
 assert.equal(f.db.prepare('SELECT used FROM harvest_limits WHERE device=? AND role=?').get('owner','owner')!.used,3);
 assert.equal((await f.harvest.command('guest-3',{id:'next-day-harvest',type:'take',token},T+86_400_000)).accepted,true);
 const owner=saved(f.db,'owner');owner.profiles.home.runId='a-new-run';f.db.prepare('UPDATE estates SET state=? WHERE device=?').run(JSON.stringify(owner),'owner');assert.equal((await f.harvest.get('visitor',token,T+86_400_000)).accepted,false);
 }finally{f.close();}
});
