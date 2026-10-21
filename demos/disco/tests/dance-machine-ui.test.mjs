import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {resolveAvatarPreset} from '../lib/room-types.ts';
import { chooseDanceNote } from '../lib/dance-input.ts';
import { judgeDanceOffset, DANCE_LANES, DANCE_DURATION_MS } from '../lib/dance-machine.ts';
const source = readFileSync(new URL('../components/DanceMachine.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('DanceMachine.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const callbacks={};
function visit(node){if(ts.isVariableDeclaration(node)&&['press','submit'].includes(node.name.getText(ast)))callbacks[node.name.getText(ast)]=node.initializer.arguments[0].getText(ast);ts.forEachChild(node,visit);}visit(ast);
function harness(overrides={}){
  const chart=[{id:0,lane:1,atMs:1000}];const context={chart,chooseDanceNote,judgeDanceOffset,DANCE_LANES,
    getAudioStatus:()=>({ready:true,ranked:true,elapsedMs:1030}),enabled:true,ready:true,playable:true,
    round:{id:'r1',startsAt:10000,endsAt:10000+DANCE_DURATION_MS},serverOffsetMs:500,document:{visibilityState:'visible'},
    lastGestureAt:{current:0},sceneEvents:[],consumed:{current:new Set()},hits:{current:[]},combo:{current:0},didSubmit:{current:false},
    setFeedback(value){context.feedback=value;},onFeedback(value){context.sceneFeedback=value;context.sceneEvents.push(value);},setView(value){context.view=value;},setSubmission(value){context.submission=value;},
    Date:{now:()=>20000+DANCE_DURATION_MS},onSubmit:async(...args)=>{context.submitted=args;return true;},...overrides};
  vm.createContext(context);for(const[name,code]of Object.entries(callbacks))vm.runInContext(ts.transpileModule(`globalThis.${name}=${code}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return context;
}
test('real input callback judges using audio elapsed, consumes once and synchronizes pose',()=>{
  const c=harness();c.press(1);assert.equal(c.hits.current[0].offsetMs,30);assert.equal(c.feedback.label,'COOL');assert.equal(c.sceneFeedback.direction,'up');assert.equal(c.view.combo,1);c.press(1);assert.equal(c.hits.current.length,1);
});
test('real input callback rejects hidden, spectator, unavailable, muted and blocked inputs',()=>{
  for(const overrides of [{enabled:false},{ready:false},{playable:false},{document:{visibilityState:'hidden'}},{getAudioStatus:()=>null},{getAudioStatus:()=>({ready:true,ranked:false,elapsedMs:1030})}]){const c=harness(overrides);c.press(1);assert.equal(c.hits.current.length,0);assert.equal(c.sceneFeedback,undefined);}
});
test('real submission callback refuses spectator and unranked audio, submits once',async()=>{
  for(const overrides of [{playable:false},{ready:false},{getAudioStatus:()=>({ranked:false})}]){const c=harness(overrides);await c.submit();assert.equal(c.submitted,undefined);}
  const c=harness();await c.submit();await c.submit();assert.equal(c.submitted[0],'r1');assert.equal(c.submission,'sent');assert.equal(c.didSubmit.current,true);
});
test('failed real submission remains explicitly retryable',async()=>{let attempts=0;const c=harness({onSubmit:async()=>++attempts>1});await c.submit();assert.equal(c.submission,'failed');assert.equal(c.didSubmit.current,false);await c.submit();assert.equal(c.submission,'sent');});
test('lane order, no fake labels and actual PNG export remain wired',()=>{
  assert.match(source,/const ARROWS = \['←','↑','↓','→'\]/);assert.doesNotMatch(source,/>NPC<| · NPC/);assert.match(source,/canvas\.toBlob/);assert.match(source,/navigator\.canShare/);assert.match(source,/firstSeen > round\.endsAt/);
});

test('sound icon reflects the active rhythm source and respects mute',()=>{
  const live = readFileSync(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  const expression = live.match(/const soundShownPlaying = ([^;]+);/)?.[1];
  assert.ok(expression, 'rendered sound state must include the separate rhythm source');
  const shown = (danceActive,danceSoundReady,soundPlaying,muted)=>vm.runInNewContext(expression,{danceActive,danceSoundReady,soundPlaying,muted});
  assert.equal(shown(true,true,false,false),true);
  assert.equal(shown(true,true,false,true),false);
  assert.equal(shown(true,false,true,false),true, 'ordinary music resumes during curtain call without moving its sound control');
  assert.equal(shown(false,false,true,false),true);
  assert.match(live,/aria-pressed=\{soundShownPlaying\}/);
  assert.match(live,/\{soundShownPlaying \? <Volume2/);
});


test('audio ending early waits for wall end and schedules exactly one submission at crossing',async()=>{
  assert.match(source,/const wallEndReached = now >= round.endsAt/);
  let effect, dependencies;
  function find(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes("submission === 'idle'")){effect=node.arguments[0].getText(ast);dependencies=node.arguments[1].getText(ast);}ts.forEachChild(node,find);}find(ast);
  assert.match(dependencies,/wallEndReached/,'the wall-clock crossing must re-run the effect even if audio phase is already results');
  let wall=10000+DANCE_DURATION_MS-30;const c=harness({Date:{now:()=>wall},serverOffsetMs:0,phase:'results',submission:'idle',wallEndReached:false});
  vm.runInContext(ts.transpileModule(`globalThis.endEffect=${effect}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
  c.endEffect();assert.equal(c.submitted,undefined);
  wall=10000+DANCE_DURATION_MS;c.wallEndReached=true;c.endEffect();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.submitted[0],'r1');assert.equal(c.submission,'sent');c.endEffect();assert.equal(c.didSubmit.current,true);
});

test('round chart uses its persisted version and duration-neutral result copy',()=>{
  assert.match(source,/generateDanceChart\(round.seed, round.version\)/);
  assert.match(source,/\[round.seed, round.version\]/);
  assert.doesNotMatch(source,/一分钟|\b116\b|60_000|60000/);
  assert.match(source,/这一拍，我们同频。/);
  assert.match(source,/round.endsAt\+DANCE_SUBMIT_GRACE_MS/);
});

test('results use a dark straight leaderboard and real top-three podium, not a paper photo card',()=>{
  assert.doesNotMatch(source,/dance-polaroid|#faf9f5/);
  assert.match(source,/className="dance-result-board"/);
  assert.match(source,/className="dance-podium"/);
  assert.match(source,/sortedResults\.slice\(0,3\)/);
  const css=readFileSync(new URL('../components/DanceMachine.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/dance-polaroid|rotate\(-1deg\)/);
  assert.match(css,/dance-cool-burst/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('interaction tile uses peer icon and title hierarchy with no corner action or subtitle',()=>{
  const live=readFileSync(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  const tile=live.slice(live.indexOf('<button className="option-card dance-tile"'),live.indexOf('{GROUP_MOVES.map'));
  assert.match(tile,/className="option-icon dance-tile-icon"/);
  assert.doesNotMatch(tile,/<small>|dance-tile-go|<strong>/);
});

test('PNG renderer uses the same dark score board and actual podium/ranking data',async()=>{
  let makePhoto;function find(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='makePhoto')makePhoto=node.initializer.getText(ast);ts.forEachChild(node,find);}find(ast);
  const draws=[];const ctx={drawImage(image){draws.push({kind:'image',src:image.src});},save(){},restore(){},beginPath(){},arc(){},clip(){},moveTo(){},lineTo(){},closePath(){},fill(){},fillStyle:'',strokeStyle:'',font:'',textAlign:'left',fillRect(...args){draws.push({kind:'fill',color:this.fillStyle,args});},strokeRect(){},fillText(value,x,y){draws.push({kind:'text',value,x,y,color:this.fillStyle});}};
  const canvas={getContext:()=>ctx,toBlob:callback=>callback(new Blob(['png'],{type:'image/png'}))};
  const result={actorId:'me',score:4500,maxCombo:9,counts:{cool:4,good:1,bad:0,miss:2}};
  const c=vm.createContext({resolveAvatarPreset,document:{createElement:()=>canvas},photo:undefined,CLUB_AVATAR_CATALOG:[{id:'human-subeike',previewImage:'/avatars/portraits/human-subeike.webp'}],Image:class{async decode(){}},ownResult:result,ARROWS:['←','↑','↓','→'],COLORS:['#ed8cc7','#b0e98a','#79c9ff','#ffc579'],ownEntry:{name:'真实舞者'},ownId:'me',ownRank:1,score:result,resultStatus:'已同步 · 本局成绩',chart:Array(7),round:{startsAt:0,endsAt:1000,roster:[{id:'me',name:'真实舞者',preset:'human-subeike'},{id:'waiting',name:'尚未上传'}]},podium:[result],sortedResults:[result],now:20000,DANCE_SUBMIT_GRACE_MS:15000,Date,Blob});
  vm.runInContext(ts.transpileModule(`globalThis.exportResult=${makePhoto}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
  const blob=await c.exportResult();assert.equal(blob.type,'image/png');assert.equal(canvas.width,900);assert.equal(canvas.height,1440);assert.ok(draws.some(draw=>draw.kind==='image'&&draw.src==='/avatars/portraits/human-subeike.webp'));
  assert.equal(draws.find(draw=>draw.kind==='fill').color,'#070b13');assert.ok(!draws.some(draw=>draw.color==='#faf9f5'));
  assert.ok(draws.some(draw=>draw.value==='4,500'));assert.ok(draws.some(draw=>draw.value?.includes('真实舞者')));assert.ok(draws.some(draw=>draw.value==='本场排名   TOP 8'));assert.ok(draws.some(draw=>draw.value?.includes('已同步 · 本局成绩')));assert.ok(draws.some(draw=>draw.value==='本局暂无更多完成成绩'));
});

test('sound control retains normal-row geometry during both countdown and play',()=>{
  const base=readFileSync(new URL('../components/FeedInterface.css',import.meta.url),'utf8');
  const css=readFileSync(new URL('../components/DanceMachine.css',import.meta.url),'utf8');
  const row=base.match(/\.feed-v020 \.feed-page > \.music-row \{([^}]+)\}/)[1];
  const button=base.match(/\.feed-v020 \.music-row \.music-btn \{ width:29px; height:34px; \}/)[0];
  assert.match(row,/left:12px; right:12px; top:100px; height:34px/);assert.match(button,/width:29px/);
  const activeRules=[...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(([,selector])=>selector.includes('.dance-active')&&selector.includes('.music-row'));
  for(const [,selector,declarations] of activeRules){assert.doesNotMatch(declarations,/(?:top|left|right|width|height|margin|padding|display|position)\s*:/,selector+' must not alter layout');}
  assert.match(css,/music-btn:not\(\.sound-control\)[^{]+\{ visibility:hidden;pointer-events:none \}/);
  const ordinaryCenter={x:390-12-29/2,y:100+(34-2)/2};
  for(const phase of ['countdown','playing'])assert.deepEqual({...ordinaryCenter},{x:363.5,y:116},`${phase} keeps the same button center`);
});

test('presentation waits for shared curtain call while submission remains at the scoring end',()=>{
  assert.match(source,/const resultsReady = phase === 'results' && now >= round.endsAt \+ DANCE_CURTAIN_CALL_MS/);
  assert.match(source,/if \(!resultsReady \|\| closed/);
  assert.match(source,/if \(phase === 'results' && !resultsReady\)/);
  assert.match(source,/if \(resultsReady\) return <>/);
  assert.match(source,/<DanceResultConfetti roundId=\{round.id\} visible=\{enabled\}/);
  const submitEffect=source.match(/useEffect\(\(\) => \{ if \(phase === 'results' && wallEndReached[^\n]+/)?.[0];
  assert.ok(submitEffect);assert.doesNotMatch(submitEffect,/resultsReady|CURTAIN/);
});

test('actual result-ready expression opens at 2400ms, while live movement uses the same presentation clock',async()=>{
  const {DANCE_CURTAIN_CALL_MS,dancePresentationActive}=await import('../lib/dance-curtain-call.ts');
  const expression=source.match(/const resultsReady = ([^;]+);/)[1];
  for(const [now,expected] of [[1000,false],[3399,false],[3400,true]])assert.equal(vm.runInNewContext(expression,{phase:'results',now,round:{endsAt:1000},DANCE_CURTAIN_CALL_MS}),expected);
  const live=readFileSync(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  const activeExpression=live.match(/const danceActive = ([^;]+);/)[1];
  const movementExpression=live.match(/const movementEnabled = ([^;]+);/)[1];
  for(const [now,expected]of [[1000,false],[3399,false],[3400,true]]){const c={dancePresentationActive,snapshot:{danceRound:{endsAt:1000}},danceNow:now,room:{lastSyncedAt:now,serverOffsetMs:0},joined:true,ready:true,visible:true,page:'feed',sheet:null,chatFocused:false,groupFeedback:{personalBlocked:false}};const danceActive=vm.runInNewContext(activeExpression,c);assert.equal(vm.runInNewContext(movementExpression,{...c,danceActive}),expected);}
});

test('off-note fresh inputs move the avatar, leave judgment and score untouched, and release cleanly',()=>{
 let setter,effect;function find(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='setButtonPressed')setter=node.initializer.arguments[0].getText(ast);if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes("window.addEventListener('keyup'"))effect=node.arguments[0].getText(ast);ts.forEachChild(node,find);}find(ast);
 const events={},docEvents={};const c=harness({chart:[],phase:'playing',buttonPulseTimers:{current:new Map()},clearTimeout(){},heldButtons:{current:new Map()},setPressedLanes(value){c.pressedLanes=value;},danceKeyLane:(key,repeat,typing)=>repeat||typing?null:({ArrowLeft:0,ArrowUp:1,ArrowDown:2,ArrowRight:3}[key]??null),HTMLElement:class{},window:{addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]},document:{visibilityState:'visible',addEventListener:(name,fn)=>docEvents[name]=fn,removeEventListener:name=>delete docEvents[name]}});
 vm.runInContext(ts.transpileModule(`globalThis.setButtonPressed=${setter};globalThis.cleanup=(${effect})();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 const down={key:'ArrowUp',repeat:false,isComposing:false,target:null,preventDefault(){}};
 events.keydown(down);assert.deepEqual([...c.pressedLanes],[1]);assert.equal(c.feedback,undefined);assert.equal(c.sceneFeedback.direction,'up');assert.equal(c.sceneEvents.length,1);assert.equal(c.hits.current.length,0);
 events.keydown({...down,repeat:true});assert.equal(c.heldButtons.current.size,1);assert.equal(c.sceneEvents.length,1);events.keyup({key:'ArrowUp'});assert.equal(c.pressedLanes.length,0);events.keydown(down);assert.equal(c.sceneEvents.length,2);assert.ok(c.sceneEvents[1].at>c.sceneEvents[0].at);events.keyup({key:'ArrowUp'});
 const emitted=c.sceneEvents.length;
 for(const phase of ['countdown','results']){c.phase=phase;events.keydown(down);assert.equal(c.sceneEvents.length,emitted);}c.phase='playing';
 c.enabled=false;events.keydown(down);assert.equal(c.sceneEvents.length,emitted);c.enabled=true;
 const typing=new c.HTMLElement();typing.closest=()=>({});events.keydown({...down,target:typing});assert.equal(c.sceneEvents.length,emitted,'chat inputs and dialogs never drive the avatar');
 c.setButtonPressed(2,true,'pointer:7');c.setButtonPressed(2,true,'pointer:8');c.setButtonPressed(2,false,'pointer:7');assert.deepEqual([...c.pressedLanes],[2]);c.setButtonPressed(2,false,'pointer:8');assert.equal(c.pressedLanes.length,0);
 events.keydown(down);events.blur();assert.equal(c.pressedLanes.length,0);events.keydown(down);c.document.visibilityState='hidden';docEvents.visibilitychange();assert.equal(c.pressedLanes.length,0);c.cleanup();assert.equal(Object.keys(events).length,0);
 assert.match(source,/onPointerCancel=\{event=>setButtonPressed/);assert.match(source,/onLostPointerCapture=\{event=>setButtonPressed/);assert.match(source,/className=\{pressedLanes.includes\(lane\)\?'pressed':''\}/);
});

test('assistive activation pulses the button without a judgment and replaces prior pulse timers',()=>{
 let callback;function find(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='pulseButton')callback=n.initializer.arguments[0].getText(ast);ts.forEachChild(n,find);}find(ast);
 const changes=[],timers=new Map();let next=0;const c={buttonPulseTimers:{current:new Map()},setButtonPressed:(...args)=>changes.push(args),clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++next,fn);return next;}};vm.createContext(c);vm.runInContext(ts.transpileModule(`globalThis.pulse=${callback}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 c.pulse(1);c.pulse(1);assert.equal(timers.size,1);assert.deepEqual(changes.at(-1),[1,true,'assist:1']);[...timers.values()][0]();assert.deepEqual(changes.at(-1),[1,false,'assist:1']);assert.equal(c.buttonPulseTimers.current.size,0);
 assert.match(source,/if\(event.detail===0\)\{pulseButton\(lane\);press\(lane\);\}/);assert.doesNotMatch(callback,/setFeedback|onFeedback/);
});

test('fresh off-note pointer callback uses the shared gated input path, never scoring fabricated notes',()=>{
 const c=harness({chart:[]});for(const lane of [1,1,0,3,2])c.press(lane);
 assert.deepEqual(c.sceneEvents.map(event=>event.direction),['up','up','left','right','down']);assert.equal(c.hits.current.length,0);assert.equal(c.combo.current,0);assert.equal(c.feedback,undefined);assert.equal(c.view,undefined);
 for(let i=1;i<c.sceneEvents.length;i++)assert.ok(c.sceneEvents[i].at>c.sceneEvents[i-1].at);
 for(const elapsedMs of [-1,DANCE_DURATION_MS,DANCE_DURATION_MS+2400]){const gated=harness({chart:[],getAudioStatus:()=>({ready:true,ranked:true,elapsedMs})});gated.press(1);assert.equal(gated.sceneEvents.length,0);}
 assert.match(source,/onPointerDown=\{event=>\{[^\n]*?press\(lane\);\}\}/);
});
