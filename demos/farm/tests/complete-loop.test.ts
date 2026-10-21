import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as model from '../src/model.ts';
import {FarmStore} from '../server/store.ts';
const T=1_800_000_000_000;let seq=0;
const cmd=(type:string,extra:Record<string,unknown>={})=>({id:`complete-${++seq}`,type,...extra});
const run=(s:model.Farm,type:string,time:number,extra:Record<string,unknown>={})=>model.applyCommand(s,cmd(type,extra),time);

test('LX is the default player and switching body preserves every relationship',()=>{
 let s=model.createFarm('owner',T);assert.equal(s.avatar,'human-lx');assert.equal(s.version,2);
 s=run(s,'act',T,{action:'dance',target:'all'}).state;const animals=structuredClone(s.animals);
 s=run(s,'avatar',T+1,{avatar:'banana-cat'}).state;s=run(s,'avatar',T+2,{avatar:'human-lx'}).state;
 assert.equal(s.avatar,'human-lx');assert.equal(s.playerId,'owner');assert.deepEqual(s.animals,animals);
});
test('legacy SQLite migration changes default to LX once while preserving identity, wool, habits and facilities',()=>{
 const dir=mkdtempSync(join(tmpdir(),'farm-upgrade-')),file=join(dir,'farm.sqlite');
 try{
  const legacy=structuredClone(model.createFarm('old-owner',T)) as unknown as Record<string,unknown>;legacy.version=1;legacy.avatar='miaocuijiao';legacy.wool=7;legacy.stage=true;legacy.revision=5;delete legacy.book;delete legacy.company;
  const animals=legacy.animals as model.Animal[];animals[0].bond=9;animals[0].habits.dance={count:3,stage:'invite',lastAt:T};animals[0].appearance='starlit';animals.forEach(a=>delete (a as Partial<model.Animal>).care);
  const db=new DatabaseSync(file);db.exec('CREATE TABLE farms(device TEXT PRIMARY KEY,state TEXT NOT NULL)');db.prepare('INSERT INTO farms VALUES(?,?)').run('old-owner',JSON.stringify(legacy));db.close();
  let store=new FarmStore(file);const upgraded=store.get('old-owner',T+1000);
  assert.equal(upgraded.avatar,'human-lx');assert.equal(upgraded.playerId,'old-owner');assert.equal(upgraded.wool,7);assert.equal(upgraded.stage,true);assert.equal(upgraded.animals[0].habits.dance?.stage,'invite');assert.equal(upgraded.animals[0].bond,9);assert.equal(upgraded.animals[0].appearance,'starlit');assert.equal(upgraded.animals[0].care.feedCount,0);
  store.command('old-owner',cmd('avatar',{avatar:'banana-cat'}),T+2000);store.close();store=new FarmStore(file);assert.equal(store.get('old-owner',T+3000).avatar,'banana-cat');store.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('feeding has individual cooldown, visible personality reactions and only three relationship credits',()=>{
 let s=model.createFarm('a',T);const first=run(s,'feed',T,{target:'momo'});assert.equal(first.accepted,true);assert.equal(first.event?.kind,'feed');assert.equal(first.event?.reactions[0].animalId,'momo');assert.equal(first.event?.reactions[0].micro,'ear');assert.equal(first.state.animals[0].bond,0);assert.equal(first.state.animals[1].bond,1);
 const rapid=run(first.state,'feed',T+7000,{target:'momo'});assert.equal(rapid.accepted,false);assert.deepEqual(rapid.state,first.state);
 s=first.state;for(let i=1;i<6;i++)s=run(s,'feed',T+i*46000,{target:'momo'}).state;
 assert.equal(s.animals[1].care.feedCount,3);assert.equal(s.animals[1].bond,3);assert.ok(s.animals[1].experiences.some(e=>e.text.includes('青草')));
 assert.equal(run(s,'feed',T+400000,{target:'missing'}).accepted,false);
});
test('company needs twenty seconds and settles once, while refresh, long absence and wrong target cannot claim it',()=>{
 let s=model.createFarm('a',T);const start=run(s,'company',T,{target:'pipi'});assert.equal(start.accepted,true);assert.equal(start.state.company?.animalId,'pipi');assert.equal(start.state.animals[0].bond,0);
 assert.equal(run(start.state,'finishCompany',T+19000).accepted,false);
 const finished=run(start.state,'finishCompany',T+20000);assert.equal(finished.accepted,true);assert.equal(finished.state.company,null);assert.equal(finished.state.animals[0].care.companyCount,1);assert.equal(finished.state.animals[0].bond,1);
 assert.equal(run(finished.state,'finishCompany',T+21000).accepted,false);assert.equal(run(finished.state,'company',T+30000,{target:'pipi'}).accepted,false);
 const refresh=run(start.state,'visit',T+5000).state;assert.equal(refresh.company,null);assert.equal(run(refresh,'finishCompany',T+25000).accepted,false);
 const expired=run(start.state,'finishCompany',T+61000);assert.equal(expired.state.animals[0].bond,0);assert.equal(expired.state.company,null);
 assert.equal(run(s,'company',T,{target:'missing'}).accepted,false);
 s=finished.state;for(let i=1;i<5;i++){s=run(s,'company',T+i*321000,{target:'pipi'}).state;s=run(s,'finishCompany',T+i*321000+20000).state;}assert.equal(s.animals[0].care.companyCount,3);assert.equal(s.animals[0].bond,3);
});
test('milestone rewards require real progress and cannot be claimed again with a different command ID or after reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'farm-milestones-')),file=join(dir,'farm.sqlite');
 try{let store=new FarmStore(file);assert.equal(store.command('a',cmd('questClaim',{quest:'meet'}),T).accepted,false);
 for(const target of ['pipi','momo','doudou'])assert.equal(store.command('a',cmd('inspect',{target}),T+1).accepted,true);
 const claim=cmd('questClaim',{quest:'meet'});assert.equal(store.command('a',claim,T+2).snapshot.wool,1);assert.equal(store.command('a',claim,T+3).snapshot.wool,1);assert.equal(store.command('a',cmd('questClaim',{quest:'meet'}),T+4).snapshot.wool,1);
 store.close();store=new FarmStore(file);assert.equal(store.command('a',cmd('questClaim',{quest:'meet'}),T+5).snapshot.wool,1);store.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('natural care and memory route earns the stage without offline wool or demo fast-forward',()=>{
 let s=model.createFarm('a',T);const apply=(type:string,at:number,extra:Record<string,unknown>={})=>{const r=run(s,type,T+at,extra);assert.equal(r.accepted,true,`${type}: ${r.message}`);s=r.state;};
 for(const target of ['pipi','momo','doudou'])apply('inspect',0,{target});apply('questClaim',1,{quest:'meet'});
 apply('feed',0,{target:'pipi'});apply('questClaim',1,{quest:'feed'});
 apply('act',6000,{action:'dance',target:'all'});apply('questClaim',6001,{quest:'dance'});
 apply('company',12000,{target:'momo'});apply('act',19000,{action:'dance',target:'all'});apply('act',32000,{action:'dance',target:'all'});
 apply('finishCompany',33000);apply('questClaim',33001,{quest:'company'});apply('questClaim',33002,{quest:'learn'});
 apply('rhythm',40000);apply('questClaim',40001,{quest:'rhythm'});apply('visit',47000);apply('questClaim',47001,{quest:'memory'});
 assert.equal(s.wool,8);assert.equal(s.demoMode,false);assert.equal(model.snapshot(s,T+47002).woolReady,0);
 apply('buy',47002);assert.equal(s.stage,true);assert.equal(s.wool,0);apply('questClaim',47003,{quest:'stage'});assert.equal(s.wool,1);
 apply('stagePlay',48000);assert.equal(s.animals[0].habits.bounce?.count,1);
});
test('one demo visit cannot replenish the same offline interval repeatedly',()=>{
 let s=model.createFarm('a',T);s=run(s,'nextVisit',T+1).state;s=run(s,'claim',T+2).state;assert.equal(s.wool,12);
 const repeated=run(s,'nextVisit',T+3);assert.equal(repeated.accepted,false);assert.equal(model.snapshot(repeated.state,T+3).woolReady,0);
});
test('care receipts survive restart and repeated new IDs cannot settle a completed company twice',()=>{
 const dir=mkdtempSync(join(tmpdir(),'farm-care-receipt-')),file=join(dir,'farm.sqlite');
 try{let store=new FarmStore(file);const feed=cmd('feed',{target:'pipi'}),start=cmd('company',{target:'momo'}),finish=cmd('finishCompany');
 store.command('a',feed,T);store.command('a',feed,T+1000);store.command('a',start,T+6000);store.command('a',finish,T+26000);store.close();
 store=new FarmStore(file);const repeated=store.command('a',finish,T+27000);assert.equal(repeated.duplicate,true);assert.equal(repeated.snapshot.animals[0].care.feedCount,1);assert.equal(repeated.snapshot.animals[1].care.companyCount,1);assert.equal(repeated.snapshot.animals[1].bond,1);
 const newId=store.command('a',cmd('finishCompany'),T+28000);assert.equal(newId.accepted,false);assert.equal(newId.snapshot.animals[1].bond,1);store.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
