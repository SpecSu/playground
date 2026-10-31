import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMinimalState,MINIMAL_STORAGE_KEY,LEGACY_MINIMAL_STORAGE_KEY,type MinimalStorage} from '../src/minimal/model.ts';
import {openFarmSession,LOCAL_HUNYUAN_STORAGE_KEY as KEY,LEGACY_BACKUP_KEY,LEGACY_ACK_KEY} from '../src/minimal/save-migration.ts';
const LEGACY=readFileSync(new URL('./fixtures/minimal-v2-save.json',import.meta.url),'utf8'),old=JSON.parse(LEGACY),NOW=old.updatedAt as number;
const current=JSON.stringify({...createMinimalState(NOW),coins:321,welcomeClaimed:true});
function storage(entries:[string,string][]=[]){const data=new Map(entries),writes:string[]=[];return {data,writes,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{writes.push(key);data.set(key,value);}};}
const open=(s:MinimalStorage)=>openFarmSession(s,NOW,{localHunyuan:true});
test('valid v2-only progress migrates into the isolated farm while every source and migration byte is retained',()=>{
 const s=storage([[LEGACY_MINIMAL_STORAGE_KEY,LEGACY],[LEGACY_BACKUP_KEY,'original backup bytes'],[LEGACY_ACK_KEY,'opaque prior choice']]),before=new Map(s.data),r=open(s);
 assert.equal(r.status,'ready');assert.equal(r.migrated,true);assert.ok(r.guard);assert.equal(r.state.coins,430);assert.equal(r.state.version,3);assert.equal(r.state.welcomeClaimed,old.welcomeClaimed);assert.deepEqual(r.state.animals.map(a=>a.id),old.animals.map((a:{id:string})=>a.id));assert.deepEqual(r.state.eggs.map(e=>e.id),old.eggs.map((e:{id:string})=>e.id));assert.deepEqual(r.state.player,old.player);assert.deepEqual(s.writes,[KEY]);assert.equal(s.getItem(MINIMAL_STORAGE_KEY),null);for(const [key,raw]of before)assert.equal(s.getItem(key),raw);
 assert.equal(r.guard.persist({...r.state,coins:431}),'saved');assert.equal(JSON.parse(s.getItem(KEY)!).coins,431);for(const [key,raw]of before)assert.equal(s.getItem(key),raw);
 s.data.set(LEGACY_MINIMAL_STORAGE_KEY,'later independently changed legacy');assert.equal(open(s).state.coins,431,'an established isolated farm must never import a later old source');
});
test('present isolated or v3 data never falls back to valid v2 when unsupported',()=>{
 for(const key of [KEY,MINIMAL_STORAGE_KEY])for(const raw of ['{bad','null',JSON.stringify({...createMinimalState(NOW),version:99}),LEGACY]){
  const s=storage([[LEGACY_MINIMAL_STORAGE_KEY,LEGACY],[key,raw]]),before=new Map(s.data),r=open(s);assert.equal(r.status,'blocked');assert.equal(r.guard,null);assert.deepEqual(s.data,before);assert.deepEqual(s.writes,[]);
 }
});
test('invalid or future legacy data stays blocked rather than creating an isolated empty farm',()=>{
 for(const raw of ['{bad','null',JSON.stringify({...old,version:99}),JSON.stringify({...old,coins:-1}),current]){const s=storage([[LEGACY_MINIMAL_STORAGE_KEY,raw]]),r=open(s);assert.equal(r.status,'blocked');assert.equal(r.guard,null);assert.equal(s.getItem(KEY),null);assert.equal(s.getItem(LEGACY_MINIMAL_STORAGE_KEY),raw);assert.deepEqual(s.writes,[]);}
});
test('valid v2 import does not discard opaque extra fields or write their raw source back',()=>{
 const legacy=JSON.stringify({...old,privateExtension:{note:'do not expose'},tiles:old.tiles.map((tile:object)=>({...tile,privateTileExtension:'keep'}))}),s=storage([[LEGACY_MINIMAL_STORAGE_KEY,legacy]]),r=open(s);assert.equal(r.status,'ready');const saved=JSON.parse(s.getItem(KEY)!);assert.deepEqual(saved.privateExtension,{note:'do not expose'});assert.ok(saved.tiles.every((tile:{privateTileExtension:string})=>tile.privateTileExtension==='keep'));assert.equal(s.getItem(LEGACY_MINIMAL_STORAGE_KEY),legacy);
});
test('v2 import read failures at first read, final preflight and post-write observation fail closed',()=>{
 for(const failRead of [1,2,4,5]){const s=storage([[LEGACY_MINIMAL_STORAGE_KEY,LEGACY]]);let reads=0;const r=open({getItem:key=>{if(key===LEGACY_MINIMAL_STORAGE_KEY&&++reads===failRead)throw Error('denied');return s.getItem(key);},setItem:s.setItem});assert.equal(r.status,'unavailable',String(failRead));assert.equal(r.guard,null);assert.equal(s.getItem(LEGACY_MINIMAL_STORAGE_KEY),LEGACY);assert.ok(s.writes.every(key=>key===KEY));if(failRead<5)assert.equal(s.getItem(KEY),null);}
});
test('v2 import write denial does not create a writable session or touch any original key',()=>{
 const s=storage([[LEGACY_MINIMAL_STORAGE_KEY,LEGACY],[LEGACY_BACKUP_KEY,'backup']]),before=new Map(s.data);let writes=0;const r=open({getItem:s.getItem,setItem:key=>{assert.equal(key,KEY);writes++;throw Error('quota');}});assert.equal(r.status,'unavailable');assert.equal(r.guard,null);assert.equal(writes,1);assert.deepEqual(s.data,before);
});
test('observed legacy changes before the initial write prevent stale v2 imports',()=>{
 for(const changedRead of [2,4]){const s=storage([[LEGACY_MINIMAL_STORAGE_KEY,LEGACY]]);let reads=0;const r=open({getItem:key=>{if(key===LEGACY_MINIMAL_STORAGE_KEY&&++reads===changedRead)s.data.set(key,'foreign legacy bytes');return s.getItem(key);},setItem:s.setItem});assert.equal(r.status,'conflict');assert.equal(r.guard,null);assert.equal(s.getItem(KEY),null);assert.equal(s.getItem(LEGACY_MINIMAL_STORAGE_KEY),'foreign legacy bytes');assert.deepEqual(s.writes,[]);}
});
test('a new v3 or isolated save observed before migration is never overwritten',()=>{
 for(const key of [KEY,MINIMAL_STORAGE_KEY]){const s=storage([[LEGACY_MINIMAL_STORAGE_KEY,LEGACY]]);let reads=0;const r=open({getItem:k=>{if(k===key&&++reads===2)s.data.set(k,current);return s.getItem(k);},setItem:s.setItem});assert.equal(r.status,'conflict');assert.equal(r.guard,null);assert.equal(s.getItem(key),current);assert.equal(s.getItem(LEGACY_MINIMAL_STORAGE_KEY),LEGACY);assert.deepEqual(s.writes,[]);}
});
test('a foreign legacy, v3 or destination change observed after copy cannot return a writable session',()=>{
 for(const key of [LEGACY_MINIMAL_STORAGE_KEY,MINIMAL_STORAGE_KEY,KEY]){const s=storage([[LEGACY_MINIMAL_STORAGE_KEY,LEGACY]]);const r=open({getItem:s.getItem,setItem:(k,raw)=>{s.setItem(k,raw);s.data.set(key,current);}});assert.equal(r.status,'conflict');assert.equal(r.guard,null);assert.equal(s.getItem(key),current);assert.deepEqual(s.writes,[KEY]);}
});
test('blocked diagnostics identify the actual source and reason without exposing original content',()=>{
 const cases=[{key:KEY,raw:'{private-content',source:'isolated-local',reason:'invalid-json'},{key:MINIMAL_STORAGE_KEY,raw:JSON.stringify({...old,version:99,privateNote:'secret'}),source:'v3-source',reason:'future-version'},{key:LEGACY_MINIMAL_STORAGE_KEY,raw:JSON.stringify({...old,coins:-1,privateNote:'secret'}),source:'v2-source',reason:'invalid-save'},{key:KEY,raw:LEGACY,source:'isolated-local',reason:'unexpected-version'}];
 for(const {key,raw,source,reason}of cases){const s=storage([[key,raw]]),r=open(s);assert.equal(r.status,'blocked');assert.equal(r.diagnostic?.source,source);assert.equal(r.diagnostic?.reason,reason);assert.deepEqual(Object.keys(r.diagnostic??{}).filter(key=>!['source','reason','version'].includes(key)),[]);assert.doesNotMatch(JSON.stringify(r.diagnostic),/secret|private-content/);assert.equal(s.getItem(key),raw);assert.deepEqual(s.writes,[]);}
});
