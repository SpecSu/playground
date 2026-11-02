import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../lib/fishing-catch-broadcast.ts').catch(() => ({}));
const event = (id, at, actorId='friend') => ({id,at,actorId,name:'海风朋友',type:'catch',speciesId:'tuna',lengthCm:123});
const npc = (id, caughtAt) => ({id:'ambient:one',name:'船长',ambient:true,fishing:{phase:'holding',catch:{id,caughtAt,speciesId:'clownfish',lengthCm:12}}});
const snapshot = (serverNow, events=[], ambientParticipants=[]) => ({serverNow,events,ambientParticipants,self:{id:'me'}});

test('broadcast detector exists and baselines initial historical human and NPC catches', () => {
 assert.equal(typeof mod.createCatchBroadcastTracker, 'function');
 const tracker=mod.createCatchBroadcastTracker();
 assert.deepEqual(tracker.observe(snapshot(1000,[event('old',900)],[npc('old-npc',950)])),[]);
 assert.deepEqual(tracker.observe(snapshot(1100,[event('old',900)],[npc('old-npc',950)])),[]);
});
test('new human event survives immediate collection, includes both NPCs, and never repeats holding fish',()=>{
 const tracker=mod.createCatchBroadcastTracker();tracker.observe(snapshot(1000));
 const s=snapshot(2000,[event('new',1500),event('mine',1600,'me')],[npc('npc-a',1700),{...npc('npc-b',1800),id:'ambient:two'}]);
 const found=tracker.observe(s);
 assert.equal(found.length,3);assert.deepEqual(found.map(x=>x.id),['human:new','ambient:npc-a','ambient:npc-b']);
 assert.equal(found[0].name,'海风朋友');assert.equal(found[0].speciesId,'tuna');assert.equal(found[0].lengthCm,123);
 assert.deepEqual(tracker.observe({...s,serverNow:2500}),[]);
 assert.deepEqual(tracker.observe(snapshot(2800)),[]);
 assert.deepEqual(tracker.observe({...s,serverNow:3000}),[]);
});
test('NPC catch broadcasts use their original panel names while human catch names stay custom',async()=>{
 const {projectFishingAmbientParticipants}=await import('../lib/fishing-ambient.ts');
 const tracker=mod.createCatchBroadcastTracker(),start=20000*86400000;
 tracker.observe(snapshot(start,[],projectFishingAmbientParticipants(start)));
 const names=new Map();
 for(let now=start+250;now<=start+60000;now+=250){
  const human={...event('custom-player',start+250),name:'阿遥'};
  for(const item of tracker.observe(snapshot(now,[human],projectFishingAmbientParticipants(now))))names.set(item.actorId,item.name);
 }
 assert.equal(names.get('ambient:ocean:0'),'香蕉猫');
 assert.equal(names.get('ambient:ocean:1'),'奶蛙');
 assert.equal(names.get('friend'),'阿遥');
});
test('reconnect ignores unseen stale catches and ignores self, invalid, future and non-catch events',()=>{
 const tracker=mod.createCatchBroadcastTracker();tracker.observe(snapshot(1000));
 assert.deepEqual(tracker.observe(snapshot(50000,[event('stale',2000),event('future',60000),{...event('bad',49000),speciesId:'fake'},{...event('join',49000),type:'join'},event('mine',49000,'me')],[npc('old-hold',3000)])),[]);
 assert.equal(tracker.observe(snapshot(50100,[event('fresh',50000)])).length,1);
});
test('single banner lasts 4.5 seconds, has at most three queued, and dropped catches do not replay',()=>{
 assert.equal(typeof mod.advanceCatchBroadcasts,'function');
 const incoming=Array.from({length:8},(_,i)=>({id:String(i),at:1000}));
 const a=mod.advanceCatchBroadcasts(mod.emptyCatchBroadcasts(),incoming,1000,true);
 assert.equal(a.current.id,'0');assert.equal(a.queue.length,3);
 assert.strictEqual(mod.advanceCatchBroadcasts(a,[],5499,true),a);
 const b=mod.advanceCatchBroadcasts(a,[],5500,true);assert.equal(b.current.id,'1');assert.equal(b.queue.length,2);
 const hidden=mod.advanceCatchBroadcasts(b,[],5600,false);assert.equal(hidden.current,null);assert.deepEqual(hidden.queue,[]);
 assert.equal(mod.advanceCatchBroadcasts(hidden,[],6000,true).current,null);
});
test('queued catches expire rather than announcing old fish after a long pause',()=>{
 const a=mod.advanceCatchBroadcasts(mod.emptyCatchBroadcasts(),[{id:'one',at:1000},{id:'two',at:1000}],1000,true);
 assert.equal(mod.advanceCatchBroadcasts(a,[],20000,true).current,null);
});

test('rendered banner announces nickname, fish and rarity without size metrics politely and respects reduced-motion setting',async()=>{
 const {readFileSync}=await import('node:fs');const {default:ts}=await import('typescript');const {default:vm}=await import('node:vm');
 const catalog=await import('../lib/fishing-catalog.ts');
 const exports={};const jsx=(type,props,key)=>({type,props,key});
 const code=ts.transpileModule(readFileSync(new URL('../components/fishing/FishingCatchBroadcast.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const current={id:'human:new',name:'海风朋友',speciesId:'tuna',lengthCm:123,at:1000};
 vm.runInNewContext(code,{exports,require(name){if(name==='react')return {useRef:()=>({current:null}),useEffect:()=>{},useState:()=>[{current},()=>{}]};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='lucide-react')return {Fish:'fish-icon'};if(name.endsWith('fishing-catalog'))return catalog;if(name.endsWith('fishing-catch-broadcast'))return mod;throw Error(name);}});
 const rendered=exports.default({snapshot:null,enabled:true,serverOffsetMs:0,reducedMotion:true});
 assert.equal(rendered.props['aria-live'],'polite');assert.equal(rendered.props.role,'status');
 assert.equal(rendered.props.children.props['data-reduced-motion'],true);
 const text=JSON.stringify(rendered);for(const word of ['海风朋友','蓝鳍金枪鱼','史诗'])assert.ok(text.includes(word),word);
 assert.doesNotMatch(text,/1\.23|123|\bcm\b|\bkg\b/);
 assert.equal(exports.default({snapshot:null,enabled:false,serverOffsetMs:0,reducedMotion:true}).props.children,null);
});
