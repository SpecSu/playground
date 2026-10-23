/** Copy the live database read-only; migrate only the isolated copy. Never log player records. */
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {EstateStore} from '../server/estate-store.ts';
const source=resolve('.local/farm.sqlite'),copy=resolve(`.local/v7-migration-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
const live=new DatabaseSync(source,{readOnly:true});await backup(live,copy);live.close();
let db=new DatabaseSync(copy,{readOnly:true});assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');const originals=db.prepare('SELECT device,state FROM estates').all();db.close();
const store=new EstateStore(copy),now=Date.now();let profiles=0,animals=0,lots=0;
try{for(const row of originals){const before=JSON.parse(row.state),after=store.get(row.device,now);assert.equal(after.playerId,before.playerId);assert.equal(after.avatar,before.avatar);assert.equal(after.activeProfile,before.activeProfile);store.get(row.device,now);}}finally{store.close();}
db=new DatabaseSync(copy,{readOnly:true});
for(const row of originals){const before=JSON.parse(row.state),after=JSON.parse(db.prepare('SELECT state FROM estates WHERE device=?').get(row.device).state);
 for(const [key,p] of Object.entries(before.profiles)){if(!p)continue;const q=after.profiles[key];profiles++;assert.equal(q.runId,p.runId);assert.equal(q.materials,p.materials);assert.equal(q.onlineMs,p.onlineMs);assert.deepEqual(q.layout,p.layout);assert.equal(q.threat?.elapsed,p.threat?.elapsed);assert.equal(q.v7.version,7);
  for(const a of p.animals){const next=q.animals.find(b=>b.id===a.id);assert.ok(next);for(const field of ['name','personality','appearance'])assert.equal(next[field],a[field]);assert.equal(next.life.bond,a.life.bond);assert.deepEqual(next.life.habits,a.life.habits);assert.equal(next.husbandry?.rarity,a.husbandry?.rarity??(a.appearance==='starlit'?'green':'white'));animals++;}
  if(p.economy)assert.deepEqual(q.economy?.warehouse,p.economy.warehouse);for(const lot of [...(p.economy?.lots??[]),...(p.production?.pending??[])]){const next=[...(q.economy?.lots??[]),...(q.production?.pending??[])].find(l=>l.id===lot.id);assert.ok(next);assert.equal(next.amount,lot.amount);assert.equal(next.version,lot.version);lots++;}
 }
}assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
const result={copy,productionSourceReadOnly:true,integrity:'ok',estates:originals.length,profiles,animals,priorLotsPreserved:lots,identitiesRelationsLayoutsCoinsAndThreatClocksPreserved:true,sameTimeSettlementRepeated:true,resetExecuted:false};mkdirSync('verification',{recursive:true});writeFileSync('verification/v7-migration.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
