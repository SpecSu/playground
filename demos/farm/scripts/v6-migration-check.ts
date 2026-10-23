/** Read-only source snapshot; all EstateStore writes target a unique backup. */
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {EstateStore} from '../server/estate-store.ts';
import type {Estate,Profile} from '../src/v5/estate.ts';
import {TIERS,emptyStacks,type MaterialStacks} from '../src/v5/herd-economy.ts';
const source=resolve('.local/farm.sqlite'),stamp=new Date().toISOString().replace(/[:.]/g,'-'),copy=resolve(`.local/v6-migration-${stamp}.sqlite`);
const sourceDb=new DatabaseSync(source,{readOnly:true});
try{await backup(sourceDb,copy);}finally{sourceDb.close();}
const db=new DatabaseSync(copy);
const tableExists=(name:string)=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
const rows=(name:string)=>tableExists(name)?db.prepare(`SELECT * FROM ${name} ORDER BY device`).all():[];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const farmBefore=digest(rows('farms'));
const original=rows('estates') as {device:string;state:string}[];
const farmDevices=rows('farms').map(r=>String(r.device));
const devices=[...new Set([...original.map(r=>r.device),...farmDevices])];
const states=new Map(original.map(r=>[r.device,JSON.parse(r.state) as Estate]));
const legacyCounts=(p:Profile)=>{const total=emptyStacks();for(const t of TIERS)total[t]=p.economy?.warehouse[t]??0;for(const l of p.production?.pending??[])if(l.version==='legacy')total[l.tier]+=l.amount;if(!p.production)for(const a of p.animals){if(a.husbandry)for(const t of TIERS)total[t]+=a.husbandry.pending[t];else total.white+=a.life.products.stored;}return total;};
const pendingByAnimal=(p:Profile)=>Object.fromEntries(p.animals.map(a=>{const counts=emptyStacks();for(const l of p.production?.pending??[])if(l.version==='legacy'&&l.animalId===a.id)counts[l.tier]+=l.amount;if(!p.production){if(a.husbandry)for(const t of TIERS)counts[t]+=a.husbandry.pending[t];else counts.white+=a.life.products.stored;}return [a.id,counts];}));
const identity=(p:Profile)=>({id:p.id,runId:p.runId,createdAt:p.createdAt,animals:p.animals.map(a=>({id:a.id,name:a.name,personality:a.personality,preference:a.preference,appearance:a.appearance,color:a.color,bond:a.life.bond,habits:a.life.habits,care:a.life.care,memory:a.life.memory,memorial:a.memorial}))});
const warehouse=(p:Profile):MaterialStacks=>p.economy?.warehouse??emptyStacks();
const store=new EstateStore(copy),now=Date.now();let profiles=0,labProfiles=0,migratedProfiles=0;
try{for(const device of devices){store.get(device,now);const first=JSON.parse((db.prepare('SELECT state FROM estates WHERE device=?').get(device) as {state:string}).state) as Estate;const before=states.get(device);if(before){assert.equal(first.playerId,before.playerId);assert.equal(first.activeProfile,before.activeProfile);for(const [key,p] of Object.entries(before.profiles)){if(!p)continue;const q=first.profiles[key as 'home'|'lab']!;assert.ok(q);assert.deepEqual(identity(q),identity(p),'stable identity and relationships');assert.deepEqual(warehouse(q),warehouse(p),'warehouse totals');assert.deepEqual(legacyCounts(q),legacyCounts(p),'legacy entitlements');assert.deepEqual(pendingByAnimal(q),pendingByAnimal(p),'animal pending entitlements');assert.ok(q.production);}}
 store.get(device,now);const second=JSON.parse((db.prepare('SELECT state FROM estates WHERE device=?').get(device) as {state:string}).state) as Estate;
 for(const [key,p] of Object.entries(first.profiles)){if(!p)continue;profiles++;if(key==='lab')labProfiles++;if(!before?.profiles[key as 'home'|'lab']?.production)migratedProfiles++;const q=second.profiles[key as 'home'|'lab']!;assert.deepEqual(legacyCounts(q),legacyCounts(p),'repeat settle cannot mint legacy');assert.deepEqual(pendingByAnimal(q),pendingByAnimal(p));assert.deepEqual(q.economy,p.economy);assert.deepEqual(q.production,p.production);}
}}finally{store.close();}
assert.equal(digest(rows('farms')),farmBefore,'legacy farms table unchanged');const integrity=db.prepare('PRAGMA integrity_check').get();assert.equal(Object.values(integrity!)[0],'ok');db.close();
const report={checkedAt:new Date().toISOString(),sourceReadOnly:true,copy,devices:devices.length,existingEstates:states.size,existingEstateProfilesCompared:[...states.values()].reduce((n,s)=>n+Object.values(s.profiles).filter(Boolean).length,0),legacyFarmRows:farmDevices.length,profiles,labProfiles,migratedProfiles,checks:{stablePlayerAnimalRunIds:true,relationshipsPreserved:true,warehousePreserved:true,legacyEntitlementsBalanced:true,perAnimalPendingBalanced:true,repeatedSettleNoNewLegacy:true,allPersistedProfilesChecked:true,labProfilePresent:labProfiles>0,legacyFarmsTableUnchanged:true,integrity:'ok'},limitations:labProfiles===0?['Source snapshot contains no lab profile; inactive lab migration could not be observed in this real snapshot.']:[],passed:true};
mkdirSync('verification',{recursive:true});writeFileSync('verification/v6-migration.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
