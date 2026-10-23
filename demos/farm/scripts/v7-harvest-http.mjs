/** Isolated actual HTTP/two-device harvest checks; never touches the live DB. */
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'farm-v7-harvest-http-')),file=join(dir,'isolated.sqlite'),port=Number(process.env.HARVEST_TEST_PORT??5194),base=`http://127.0.0.1:${port}`;
if(port===5190)throw new Error('Do not use the live server port');
const child=spawn(process.execPath,['--experimental-strip-types','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),FARM_DB:file,FARM_DIST:join(dir,'no-static-needed')},stdio:['ignore','pipe','pipe']});let serverOutput='';child.stdout.on('data',b=>serverOutput+=String(b));child.stderr.on('data',b=>serverOutput+=String(b));let db;
function device(){let cookie='';return {async request(path,command){const r=await fetch(base+path,{method:command?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(command?{'Content-Type':'application/json',Origin:base}:{})},...(command?{body:JSON.stringify(command)}:{})});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];assert.equal(r.status,200);return r.json();}};}
const owner=device(),visitor=device(),third=device();
try{
 let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Test server exited: '+serverOutput);if(serverOutput.includes(`http://127.0.0.1:${port}`)){ready=true;break;}await delay(100);}assert.ok(ready,'isolated server ready');
 const ownerState=await owner.request('/api/estate');await third.request('/api/estate');
 db=new DatabaseSync(file);for(const snapshot of [ownerState]){const estate=JSON.parse(String(db.prepare('SELECT state FROM estates WHERE device=?').get(snapshot.playerId).state)),p=estate.profiles.home;p.threat=null;p.tutorial='done';p.opening={...p.opening,stage:'done'};p.production.pending=snapshot===ownerState?[...Array.from({length:6},(_,i)=>({id:`http-white-${i}`,tier:i%2?'green':'white',amount:2,version:'v7',animalId:p.animals[i%3].id,source:'isolated-http-fixture',batchId:`period${i}`,cycle:i})),{id:'http-gold',tier:'gold',amount:20,version:'v7',animalId:p.animals[0].id,source:'isolated-http-fixture',batchId:'rare-period',cycle:1}]:[];db.prepare('UPDATE estates SET state=? WHERE device=?').run(JSON.stringify(estate),snapshot.playerId);}
 const beforeOwner=await owner.request('/api/estate');const opened=await owner.request('/api/harvest',{id:randomUUID(),type:'open'});assert.equal(opened.accepted,true);assert.equal(opened.share.available,1);const token=opened.share.token;
 const countBefore=db.prepare('SELECT COUNT(*) AS count FROM estates').get().count;const preview=await visitor.request(`/api/harvest?token=${token}`);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM estates').get().count,countBefore,'share preview does not start visitor estate or opening');assert.equal(preview.share.own,false);assert.equal(preview.share.available,1);assert.equal('owner' in preview.share,false);
 const command={id:randomUUID(),type:'take',token};await visitor.request('/api/harvest',command); // Deliberately discard first response to model a lost acknowledgement.
 const retry=await visitor.request('/api/harvest',command);assert.equal(retry.accepted,true);assert.equal(retry.duplicate,true);assert.equal(retry.received,1);
 const afterOwner=await owner.request('/api/estate'),afterVisitor=await visitor.request('/api/estate'),sum=p=>p.production.pending.filter(l=>l.tier==='white'||l.tier==='green').reduce((n,l)=>n+l.amount,0);
 assert.equal(sum(afterOwner.profile),sum(beforeOwner.profile)-1);assert.equal(afterOwner.profile.production.pending.find(l=>l.tier==='gold').amount,20);assert.equal(afterOwner.profile.economy.warehouse.gold,beforeOwner.profile.economy.warehouse.gold);assert.equal(afterVisitor.profile.economy.warehouse.white+afterVisitor.profile.economy.warehouse.green,1);
 assert.notEqual(afterVisitor.playerId,ownerState.playerId);assert.equal(afterVisitor.profile.tutorial,'choose');assert.equal(afterVisitor.profile.guardian,null);assert.equal(afterVisitor.profile.threat.phase,'choosing');assert.equal(afterVisitor.profile.threat.elapsed,0);assert.equal(afterVisitor.profile.onlineMs,0);assert.ok(afterVisitor.profile.animals.every(a=>a.life.bond===0&&a.life.memory.length===0));assert.equal((await visitor.request('/api/harvest',{id:randomUUID(),type:'take',token})).accepted,false);assert.equal((await owner.request('/api/harvest',{id:randomUUID(),type:'close'})).accepted,true);assert.equal((await third.request('/api/harvest',{id:randomUUID(),type:'take',token})).accepted,false);
 console.log(JSON.stringify({actualHttp:true,freshVisitorNoEstateOrTutorialProgress:true,independentDeviceCookies:true,explicitOwnerOpen:true,poolSmallLotsFloor:true,crossEstateDebitCredit:true,rareAndWarehouseProtected:true,lostAcknowledgementSameIdOnce:true,visitorDailyCap:true,ownerRevocation:true,isolatedPort:port}));
}finally{db?.close();child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL');})]);rmSync(dir,{recursive:true,force:true});}
