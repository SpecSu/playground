import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FarmStore} from '../server/store.ts';
const T=1_800_000_000_000;
test('duplicate command IDs return one event and a fresh snapshot without applying twice',()=>{
 const store=new FarmStore(':memory:');
 const c={id:'same-command',type:'act',action:'dance',target:'all'};
 const a=store.command('a',c,T); const b=store.command('a',c,T+30_000);
 assert.equal(b.duplicate,true); assert.equal(b.snapshot.animals[0].bond,a.snapshot.animals[0].bond);
 assert.equal(b.event?.id,a.event?.id); assert.equal(b.snapshot.now,T+30_000); store.close();
});
test('SQLite reopen preserves distinct device farms, habits, chosen avatar and stable player ID',()=>{
 const dir=mkdtempSync(join(tmpdir(),'farm-test-')); const file=join(dir,'farm.sqlite');
 try { let store=new FarmStore(file); store.command('a',{id:'learn-1',type:'act',action:'dance',target:'all'},T);
 store.command('a',{id:'look-1',type:'avatar',avatar:'banana-cat'},T+1); store.close();
 store=new FarmStore(file); const a=store.get('a',T+20000),b=store.get('b',T+20000);
 assert.equal(a.playerId,'a'); assert.equal(a.avatar,'banana-cat'); assert.equal(a.animals[0].habits.dance?.count,1);
 assert.equal(b.animals[0].bond,0); assert.equal(b.avatar,'miaocuijiao'); store.close();
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('retrying collection and purchase after restart cannot duplicate rewards or charges',()=>{
 const dir=mkdtempSync(join(tmpdir(),'farm-test-')); const file=join(dir,'farm.sqlite');
 try { let store=new FarmStore(file); store.get('a',T);
 const claim={id:'collect-1',type:'claim'},buy={id:'purchase-1',type:'buy'};
 store.command('a',claim,T+86400_000); const a=store.command('a',buy,T+86400_000); store.close();
 store=new FarmStore(file); const b=store.command('a',claim,T+86400_000),c=store.command('a',buy,T+86400_000);
 assert.equal(a.snapshot.wool,4); assert.equal(b.snapshot.wool,4); assert.equal(c.snapshot.wool,4); assert.equal(c.snapshot.stage,true); store.close();
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
