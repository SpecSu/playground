import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('LiveFeed.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let start;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='startDance')start=node.initializer.getText(ast);ts.forEachChild(node,visit);}visit(ast);
function harness(options={}){
 const events=[];const state={status:'live',snapshot:{self:{role:'participant'},danceRound:null},serverOffsetMs:0};
 const player={getStatus:()=>({muted:false,contextState:'running'}),requestPlayback:()=>{events.push('gesture');}};
 const rhythm={preload:async()=>{events.push('preload');return true;},getPreloadStatus:()=>({ready:true})};
 const connection={getState:()=>state};
 const c={joined:true,ready:true,danceLocked:false,dancePreparing:false,dancePreparingRef:{current:false},audio:{current:player},danceAudio:{current:rhythm},client:{current:connection},sheetSession:{current:1},pendingAction:{current:false},Date:{now:()=>1000},DANCE_SUBMIT_GRACE_MS:15000,
 setDancePreparing(value){c.preparing=value;},setDancePrepareError(value){c.error=value;},setToast(value){c.toast=value;},closeSheet(){events.push('close');},async perform(){events.push('command');return {};},...options};
 vm.createContext(c);vm.runInContext(ts.transpileModule(`globalThis.startDance=${start}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 return {c,events,player,rhythm,state};
}
test('start waits for gesture unlock and completed preload before creating shared round',async()=>{const h=harness();await h.c.startDance();assert.deepEqual(h.events,['gesture','preload','command','close']);assert.equal(h.c.preparing,false);});
test('loading failure never sends a shared start and permits explicit retry',async()=>{const h=harness();h.rhythm.preload=async()=>false;await h.c.startDance();assert.ok(h.c.error);assert.ok(!h.events.includes('command'));assert.equal(h.c.dancePreparingRef.current,false);h.rhythm.preload=async()=>true;await h.c.startDance();assert.ok(h.events.includes('command'));});
test('explicit mute is preserved and cannot silently start a disabled round',async()=>{const h=harness();h.player.getStatus=()=>({muted:true});await h.c.startDance();assert.ok(!h.events.includes('command'));assert.ok(h.c.error);});
test('closing preparation panel or leaving while loading cancels start',async()=>{for(const leave of [false,true]){const h=harness();h.rhythm.preload=async()=>{if(leave)h.state.snapshot.self.role='spectator';else h.c.sheetSession.current++;return true;};await h.c.startDance();assert.ok(!h.events.includes('command'));}});
test('preparing tile has accessible busy state, concise loading and retry text',()=>{assert.match(source,/aria-busy=\{dancePreparing\}/);assert.match(source,/准备音乐…/);assert.match(source,/点击重试/);});

test('duplicate taps while preparation awaits create only one round',async()=>{const h=harness();let finish;h.rhythm.preload=()=>new Promise(resolve=>finish=resolve);const first=h.c.startDance();await new Promise(resolve=>setImmediate(resolve));await h.c.startDance();assert.equal(h.events.filter(event=>event==='gesture').length,1);finish(true);await first;assert.equal(h.events.filter(event=>event==='command').length,1);});
test('a suspended context after decode cannot start a round',async()=>{const h=harness();h.player.getStatus=()=>({muted:false,contextState:'suspended'});await h.c.startDance();assert.ok(!h.events.includes('command'));assert.ok(h.c.error);});
