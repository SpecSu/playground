import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openFarmSession,LEGACY_ACK_KEY,LEGACY_BACKUP_KEY} from '../src/minimal/save-migration.ts';
import {createMinimalState,MINIMAL_STORAGE_KEY,LEGACY_MINIMAL_STORAGE_KEY} from '../src/minimal/model.ts';
const NOW=1800000000000;
test('diagnostic text differentiates source, malformed data and future schema without suggesting deletion',async()=>{
 const {farmSaveDiagnosticMessage}=await import('../src/minimal/farm-save-diagnostics.ts');
 assert.match(farmSaveDiagnosticMessage({source:'isolated-local',reason:'invalid-json'}),/本机独立存档.*读取格式/);
 assert.match(farmSaveDiagnosticMessage({source:'v3-source',reason:'future-version',version:99}),/原v3存档.*较新版本.*99/);
 assert.match(farmSaveDiagnosticMessage({source:'v2-source',reason:'invalid-save',version:2}),/旧v2存档.*校验/);
 assert.match(farmSaveDiagnosticMessage({source:'isolated-local',reason:'unexpected-version',version:2}),/所在位置.*2/);
 assert.match(farmSaveDiagnosticMessage({source:'migration-choice',reason:'invalid-migration-record'}),/升级选择记录/);
 assert.match(farmSaveDiagnosticMessage(undefined),/原始进度已保留/);
 for(const text of [farmSaveDiagnosticMessage(undefined),farmSaveDiagnosticMessage({source:'isolated-local',reason:'invalid-save'})])assert.match(text,/请勿清除浏览器数据/);
});
test('default mode exposes raw-free diagnostics for current, legacy and migration-choice blocks without writes',()=>{
 const legacy=JSON.parse(readFileSync(new URL('./fixtures/minimal-v2-save.json',import.meta.url),'utf8'));
 const cases=[{rows:[[MINIMAL_STORAGE_KEY,'{bad']],source:'v3-source',reason:'invalid-json'},{rows:[[LEGACY_MINIMAL_STORAGE_KEY,JSON.stringify({...legacy,coins:-1})]],source:'v2-source',reason:'invalid-save'},{rows:[[MINIMAL_STORAGE_KEY,JSON.stringify(createMinimalState(NOW))],[LEGACY_ACK_KEY,'{"privateNote":"secret"}'],[LEGACY_BACKUP_KEY,'null']],source:'migration-choice',reason:'invalid-migration-record'}];
 for(const {rows,source,reason}of cases){const data=new Map(rows as [string,string][]),before=new Map(data);let writes=0;const r=openFarmSession({getItem:key=>data.get(key)??null,setItem:()=>{writes++;}},NOW);assert.equal(r.status,'blocked');assert.equal(r.diagnostic?.source,source);assert.equal(r.diagnostic?.reason,reason);assert.doesNotMatch(JSON.stringify(r.diagnostic),/secret/);assert.equal(writes,0);assert.deepEqual(data,before);}
});
