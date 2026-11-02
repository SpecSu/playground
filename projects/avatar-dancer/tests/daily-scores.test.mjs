import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createDailyScores, DAILY_SCORE_KEY} from '../src/daily-scores.js';
import {RhythmGame} from '../src/rhythm.js';

function memoryStorage(initial={}) {
 const values=new Map(Object.entries(initial));
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};
}
const today=()=>new Date(2026,9,29,12);
const self=ledger=>ledger.getRows().find(row=>row.self).score;

test('new ledger starts at zero, uses stable demo friends, sorted without mutating future reads',()=>{
 const ledger=createDailyScores({storage:memoryStorage({'encore-best-score':'999999'}),now:today});
 const rows=ledger.getRows();assert.equal(self(ledger),0);assert.equal(rows.filter(r=>r.self).length,1);assert.equal(rows.find(r=>r.self).name,'你');
 assert.deepEqual(rows.map(r=>r.score),[88500,72650,51350,0]);
 rows[0].score=0;assert.equal(ledger.getRows()[0].score,88500);
});

test('only completed rounds count once, new retries count, and totals survive reopening',()=>{
 const storage=memoryStorage();const ledger=createDailyScores({storage,now:today});
 let time=0;const game=new RhythmGame({getTime:()=>time,onEnd:state=>ledger.recordCompleted(state)});
 game.start([{time:1,lane:0}],{duration:2});time=1;game.hit(0);game.pause();ledger.recordCompleted(game.state);game.reset();assert.equal(self(ledger),0);
 time=0;game.start([{time:1,lane:0}],{duration:2});time=1;game.hit(0);time=2;game.update();
 ledger.recordCompleted(game.state);assert.equal(self(ledger),1000);
 assert.equal(self(createDailyScores({storage,now:today})),1000);
 time=0;game.start([{time:1,lane:0}],{duration:2});time=1.1;game.hit(0);time=2;game.update();assert.equal(self(ledger),1650);
 assert.equal(storage.values.size,1);
});

test('uses completion local date, resets at midnight, never recounts a previous completed state',()=>{
 let now=new Date(2026,9,29,23,59);const storage=memoryStorage();const ledger=createDailyScores({storage,now:()=>now});
 const old={status:'ended',score:1000};ledger.recordCompleted(old);
 now=new Date(2026,9,30,0,1);assert.equal(self(ledger),0);ledger.recordCompleted(old);assert.equal(self(ledger),0);
 ledger.recordCompleted({status:'ended',score:650});assert.equal(self(ledger),650);
 const saved=JSON.parse(storage.getItem(DAILY_SCORE_KEY));assert.equal(saved.day,'2026-10-30');assert.equal(saved.total,650);
 assert.equal(self(createDailyScores({storage,now:()=>new Date(2026,9,31)})),0);
});

test('malformed or obsolete persistence and invalid round scores do not poison total',()=>{
 for(const value of ['oops','null','{}',JSON.stringify({day:'2026-10-29',total:-1}),JSON.stringify({day:'2026-10-29',total:'1000'}),JSON.stringify({day:'2026-10-28',total:999})]){
 const ledger=createDailyScores({storage:memoryStorage({[DAILY_SCORE_KEY]:value}),now:today});assert.equal(self(ledger),0);
 for(const score of [-1,NaN,Infinity,'1000',1.5])ledger.recordCompleted({status:'ended',score});assert.equal(self(ledger),0);
 ledger.recordCompleted({status:'ended',score:650});assert.equal(self(ledger),650);
 }
});

test('unavailable storage still tracks daily scores in memory without breaking game',()=>{
 const storage={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}};
 const ledger=createDailyScores({storage,now:today});const round={status:'ended',score:1000};ledger.recordCompleted(round);ledger.recordCompleted(round);assert.equal(self(ledger),1000);
});

// UTC is already tomorrow here; daily grouping must follow the player's device.
test('daily grouping uses device-local calendar date rather than UTC',()=>{
 const moduleUrl=new URL('../src/daily-scores.js',import.meta.url).href;
 const result=spawnSync(process.execPath,['--input-type=module','-e',`
   import {createDailyScores} from ${JSON.stringify(moduleUrl)};
   let saved;const storage={getItem(){return null},setItem(key,value){saved=JSON.parse(value)}};
   const ledger=createDailyScores({storage,now:()=>new Date('2026-10-30T01:00:00Z')});
   ledger.recordCompleted({status:'ended',score:1000});
   process.stdout.write(saved.day);
 `],{env:{...process.env,TZ:'America/Los_Angeles'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'2026-10-29');
});
