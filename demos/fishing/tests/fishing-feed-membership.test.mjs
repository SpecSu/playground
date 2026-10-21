import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as types from '../lib/fishing-types.ts';
import * as catalog from '../lib/fishing-catalog.ts';
import * as avatars from '../lib/fishing-avatar-catalog.ts';
import * as roomTypes from '../lib/room-types.ts';
import * as profiles from '../lib/fishing-profile.ts';
import * as avatarLoading from '../lib/fishing-avatar-loading.ts';

const now=1_800_000_000_000;
const caught={id:'old-catch',speciesId:'sardine',lengthCm:20,weightKg:.1,caughtAt:now-1000};
const inventory={total:1,species:{},recent:[caught]};
function snapshot(role='participant',phase='holding'){
 const fishing={phase,catch:phase==='holding'?caught:undefined,castId:'old-cast',castAt:now-5000,biteAt:now-10,expiresAt:now+2900};
 return {roomId:'ocean',revision:1,serverNow:now,capacity:types.FISHING_CAPACITY,participants:role==='participant'?[{id:'self',name:'小浪',preset:'cat',slot:0,joinedAt:now-10000,lastSeenAt:now,fishing}]:[],ambientParticipants:[],events:[],self:{id:'self',role,lastSequence:1,fishing,inventory}};
}
function harness(initial,options={}){
 let room={snapshot:initial,connected:true,offset:0,pending:false,uncertain:false,error:'',perform:async()=>null,refresh:async()=>{},...options};
 let refIndex=0,stateIndex=0,effectIndex=0,tree;
 const refs=[],states=[],effects=[],pending=[],vibrations=[],commands=[],microtasks=[],preloads=[];
 const storage=new Map(Object.entries(options.storage??{}));
 room.perform=async input=>{commands.push(input);const result=options.perform?await options.perform(input):options.result??null;if(result&&!options.deferAvatarReady){const person=result.participants.find(p=>p.id===result.self.id);if(person)nodes().find(n=>n.props?.onAvatarStatus)?.props.onAvatarStatus(person.id,person.preset,'ready');}return result;};
 const react={useCallback:fn=>fn,useRef:value=>refs[refIndex++]??(refs[refIndex-1]={current:value}),useState:value=>{const i=stateIndex++;if(!(i in states))states[i]=value;return [states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];},useEffect:(fn,deps)=>{const i=effectIndex++,old=effects[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
 const jsx=(type,props)=>({type,props});
 const modules={'@/lib/fishing-avatar-loading':{...avatarLoading,preloadFishingAvatar:preset=>{preloads.push(preset);return options.preload?options.preload(preset):Promise.resolve();}},'@/lib/fishing-chat':{FISHING_EMOJIS:['😊','🎉','🐟','👏']},'@/lib/fishing-profile':profiles,'@/lib/fishing-types':options.types??types,'@/lib/fishing-catalog':catalog,'@/lib/fishing-avatar-catalog':avatars,'@/lib/room-types':roomTypes,'@/hooks/useFishingRoom':{useFishingRoom:()=>room},'@/hooks/useFishingOceanAudio':{useFishingOceanAudio:()=>({requestFromGesture(){},observeBite(){}})}};
 const context=vm.createContext({exports:{},require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx,jsxs:jsx}:modules[id]??new Proxy({},{get:(_,key)=>key==='__esModule'?true:String(key)}),document:{hidden:false},window:{matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})},navigator:{vibrate:value=>vibrations.push(value)},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},queueMicrotask:fn=>microtasks.push(fn),AbortController,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},Date,console});
 const source=readFileSync(new URL('../components/fishing/FishingFeed.tsx',import.meta.url),'utf8');
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 function render(patch={}){room={...room,...patch};refIndex=stateIndex=effectIndex=0;tree=context.exports.default();while(pending.length)pending.shift()();return tree;}
 function nodes(){const result=[];function walk(node){if(Array.isArray(node)){node.forEach(walk);return;}if(!node||typeof node!=='object')return;result.push(node);walk(node.props?.children);}walk(tree);return result;}
 render();while(microtasks.length)microtasks.shift()();render();return {render,nodes,vibrations,commands,storage,preloads,find:className=>nodes().find(n=>n.props?.className?.split(' ').includes(className)),text:()=>{function text(node){if(Array.isArray(node))return node.map(text).join('');if(typeof node==='string'||typeof node==='number')return String(node);return text(node?.props?.children??[]);}return text(tree);}};
}
for(const role of ['visitor','spectator','disconnected','expired','missing-member'])for(const phase of ['holding','bite'])test(`${role} hides retained ${phase} state without erasing inventory`,()=>{
 const s=snapshot(role==='visitor'||role==='spectator'?role:'participant',phase);
 if(role==='expired')s.participants[0].lastSeenAt=now-types.FISHING_SEAT_TTL;
 if(role==='missing-member')s.participants=[];
 const before=JSON.stringify(s),h=harness(s,{connected:role!=='disconnected'});
 assert.equal(h.find('catch-reveal'),undefined);
 assert.equal(h.find('bite-banner'),undefined);
 assert.ok(h.find('fishing-idle'),'inactive membership must not keep holding or bite CSS');
 assert.equal(h.find('fishing-primary').props.className.includes('collect'),false);
 assert.equal(h.vibrations.length,0);
 assert.match(h.text(),/背包 1/);
 assert.equal(JSON.stringify(s),before,'presentation must never delete the stored catch or backpack');
});
test('rejoining resumes held catch presentation and collect command',async()=>{
 const s=snapshot('visitor'),h=harness(s);assert.equal(h.find('catch-reveal'),undefined);
 h.render({snapshot:snapshot()});assert.ok(h.find('catch-reveal'));assert.ok(h.find('fishing-holding'));
 await h.find('fishing-primary').props.onClick();assert.equal(h.commands[0].type,'collect');assert.equal(h.commands[0].catchId,caught.id);
});
test('active participant gets bite alert and vibration',()=>{const h=harness(snapshot('participant','bite'));assert.ok(h.find('bite-banner'));assert.equal(h.vibrations.length,1);});
test('fishing guest copy uses ten real seats',()=>{const h=harness(snapshot('visitor'));assert.match(h.text(),/在线 0\/10/);assert.match(h.text(),/10 人游艇/);assert.ok(h.nodes().some(n=>n.props?.['aria-label']?.includes('最多10人')));});
test('visitor primary action opens join rather than collecting or reeling retained state',async()=>{
 for(const phase of ['holding','bite']){const h=harness(snapshot('visitor',phase));await h.find('fishing-primary').props.onClick();h.render();assert.equal(h.commands.length,0);assert.ok(h.nodes().some(n=>n.props?.title==='选个分身，一起上船'));}
});
test('disconnect disables fishing commands and reconnect restores held catch',()=>{
 const h=harness(snapshot());h.render({connected:false});assert.equal(h.find('fishing-primary').props.disabled,true);assert.equal(h.find('catch-reveal'),undefined);
 h.render({connected:true});assert.equal(h.find('fishing-primary').props.disabled,false);assert.ok(h.find('catch-reveal'));
});
test('ten occupied real seats show waiting action',()=>{
 const s=snapshot('spectator');s.participants=Array.from({length:10},(_,i)=>({...snapshot().participants[0],id:`other-${i}`,slot:i}));
 const h=harness(s);assert.match(h.text(),/在线 10\/10/);assert.match(h.text(),/等待空位/);
});
function openAboutFromSettings(h){
 h.nodes().find(n=>typeof n.props?.onOpenPanel==='function').props.onOpenPanel('settings');h.render();
 h.nodes().find(n=>n.type==='button'&&n.props?.children?.[0]==='玩法说明').props.onClick();h.render();
}
test('ocean header omits the floating how-to button while settings retain fishing instructions',()=>{
 const h=harness(snapshot('visitor'));
 assert.equal(h.find('ocean-about'),undefined);
 assert.equal(h.nodes().some(n=>n.props?.['aria-label']==='钓鱼玩法说明'),false);
 openAboutFromSettings(h);
 assert.ok(h.nodes().some(n=>n.props?.title==='今天，钓点快乐'));
});
test('about and join panels describe ten seats plus two ambient anglers',()=>{
 const h=harness(snapshot('visitor'));
 openAboutFromSettings(h);assert.match(h.text(),/最多 9 位朋友/);assert.match(h.text(),/另有 2 位氛围钓友/);
 (h.find('fishing-avatar-control')??h.find('fishing-primary')).props.onClick();h.render();assert.ok(h.nodes().some(n=>n.props?.description==='10 个真实钓位，随时加入。不用注册。'));
});

const profileKey='dreamina-fishing:profile:v1';
function joinForm(h){(h.find('fishing-avatar-control')??h.find('fishing-primary')).props.onClick();h.render();return h.nodes().find(n=>n.type==='form');}
function nickname(h){return h.nodes().find(n=>n.props?.id==='angler-name');}
function submitButton(h){return h.nodes().find(n=>n.props?.type==='submit');}
function setNickname(h,value){nickname(h).props.onChange({target:{value}});h.render();}

for(const role of ['visitor','participant'])test(`${role} picker keeps nickname and submit outside the independently scrolling choices`,()=>{
 const h=harness(snapshot(role,'idle')),form=joinForm(h);
 const sections=Array.from(form.props.children).filter(Boolean);
 assert.deepEqual(sections.map(node=>node.props.className),['fishing-avatar-identity','fishing-avatar-scroll','fishing-avatar-footer']);
 const [identity,scroll,footer]=sections;
 assert.ok(Array.from(identity.props.children).includes(nickname(h)),'nickname stays in the pinned top region');
 assert.equal(footer.props.children,submitButton(h),'the persistent footer owns the existing submit button');
 assert.equal(footer.props.children.props.children,role==='participant'?'保存分身':'登上游艇');
 assert.ok(Array.from(scroll.props.children).includes(h.find('avatar-grid')));
 assert.equal(h.find('avatar-grid').props.children.length,avatars.FISHING_AVATAR_CATALOG.length);
 assert.ok(h.nodes().some(node=>node.props?.avatarPicker===true),'only this Sheet opts into the picker layout');
 assert.equal(h.find('fishing-primary').props.type,undefined,'the outside fishing/join entry remains unchanged');
});

test('picker footer retains pending, disconnected and uncertain submit guards',()=>{
 const h=harness(snapshot('participant','idle'));joinForm(h);
 for(const patch of [{pending:true},{connected:false},{uncertain:true},{snapshot:null}]){
  h.render({snapshot:snapshot('participant','idle'),pending:false,connected:true,uncertain:false,...patch});
  assert.equal(h.find('fishing-avatar-footer')?.props.children,submitButton(h));
  assert.equal(submitButton(h).props.disabled,true);
 }
});

for(const role of ['visitor','participant'])for(const value of ['', '   ', '<海风>', '海\u200b风', 'a'.repeat(17)])test(`${role} cannot submit invalid nickname ${JSON.stringify(value)}`,async()=>{
 const h=harness(snapshot(role,'idle'));joinForm(h);setNickname(h,value);
 assert.equal(submitButton(h).props.disabled,false,'invalid nicknames stay actionable to explain the problem');
 await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(h.commands.length,0,'the submit handler must independently reject invalid input');
 assert.equal(h.storage.has(profileKey),false,'rejected input cannot persist a fallback name');
});
test('new user nickname stays blank and asks for an explicitly chosen name',()=>{
 const h=harness(snapshot('visitor','idle'));joinForm(h);
 assert.equal(nickname(h).props.value,'');assert.equal(nickname(h).props.required,true);
 assert.notEqual(nickname(h).props.placeholder,'海风旅人');
});
test('legacy autogenerated nickname is cleared while preserving the chosen avatar',()=>{
 const h=harness(snapshot('visitor','idle'),{storage:{[profileKey]:JSON.stringify({name:'海风旅人',preset:'cat'})}});joinForm(h);
 assert.equal(nickname(h).props.value,'');assert.equal(submitButton(h).props.disabled,false);
 assert.equal(JSON.parse(h.storage.get(profileKey)).name,'');
 assert.equal(h.nodes().find(n=>n.props?.className==='option-card avatar-option selected').props.children.at(-1).props.children,avatars.FISHING_AVATAR_CATALOG.find(a=>a.id==='miaocuijiao').label);
});
for(const saved of [{name:' 小浪 ',preset:'cat'},{name:'海风旅人',preset:'cat',nameConfirmed:true}])test(`previous explicitly chosen nickname is retained: ${saved.name}`,()=>{
 const h=harness(snapshot('visitor','idle'),{storage:{[profileKey]:JSON.stringify(saved)}});joinForm(h);
 assert.equal(nickname(h).props.value,saved.name.trim());assert.equal(submitButton(h).props.disabled,false);
});
for(const role of ['visitor','participant'])test(`${role} submits a trimmed nickname and saves confirmation only after success`,async()=>{
 const result=snapshot('participant','idle'),h=harness(snapshot(role,'idle'),{result});joinForm(h);setNickname(h,'  海风旅人  ');
 assert.equal(submitButton(h).props.disabled,false);
 await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(h.commands[0].type,role==='participant'?'profile':'join');assert.equal(h.commands[0].name,'海风旅人');
 assert.deepEqual(JSON.parse(h.storage.get(profileKey)),{name:'海风旅人',preset:avatars.DEFAULT_FISHING_AVATAR_PRESET,nameConfirmed:true});
});
test('failed nickname save does not mark the name confirmed',async()=>{
 const h=harness(snapshot('visitor','idle'));joinForm(h);setNickname(h,'小浪');
 await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(h.storage.has(profileKey),false);
});
test('joined scene gets authoritative move callback and membership-gated own identity',async()=>{
 const h=harness(snapshot('participant','idle'));let scene=h.nodes().find(n=>n.props?.cameraMode==='overview');
 assert.equal(scene.props.ownId,'self');assert.equal(scene.props.seatMovementEnabled,true);
 await scene.props.onMoveSeat(7);assert.deepEqual({...h.commands[0]},{type:'move-seat',slot:7});
 for(const patch of [{pending:true},{uncertain:true},{connected:false},{snapshot:snapshot('visitor','idle')},{snapshot:snapshot('spectator','idle')}]){
  h.render({snapshot:snapshot('participant','idle'),connected:true,pending:false,uncertain:false,...patch});scene=h.nodes().find(n=>n.props?.cameraMode==='overview');
  assert.equal(scene.props.seatMovementEnabled,false);
  if(patch.connected===false||patch.snapshot)assert.equal(scene.props.ownId,null);
 }
});
test('walking to a seat blocks cast until the authoritative movement ends',async()=>{
 const s=snapshot('participant','idle');s.participants[0].movement={fromSlot:0,startedAt:now-100,endsAt:now+1900};
 const h=harness(s);assert.equal(h.find('fishing-primary').props.disabled,true);assert.match(h.text(),/正在前往.*钓位/);
 await h.find('fishing-primary').props.onClick();assert.equal(h.commands.length,0);
 s.serverNow=now+1900;h.render({snapshot:s});assert.equal(h.find('fishing-primary').props.disabled,false);
 await h.find('fishing-primary').props.onClick();assert.equal(h.commands[0].type,'cast');
});
test('bite progress uses the shared reel window and about copy stays in sync',()=>{
 const reelWindow=5000,s=snapshot('participant','bite');s.self.fishing.expiresAt=now+reelWindow/2;
 const h=harness(s,{types:{...types,REEL_WINDOW_MS:reelWindow}}),bar=h.nodes().find(n=>n.type==='i'&&n.props?.style?.width);
 assert.equal(bar.props.style.width,'50%');
 openAboutFromSettings(h);assert.match(h.text(),new RegExp(`看到咬钩，${reelWindow/1000} 秒内收竿`));
});

test('blank nickname is rejected even when the form handler is called directly',async()=>{
 const h=harness(snapshot('visitor','idle'));const form=joinForm(h);
 await form.props.onSubmit({preventDefault(){}});assert.equal(h.commands.length,0);
});
test('feed and how-to panel display the current v0.3.5 release',()=>{
 const h=harness(snapshot('visitor','idle'));assert.match(h.text(),/v0\.3\.5/);
 openAboutFromSettings(h);assert.ok(h.nodes().some(n=>n.props?.description==='出海钓鱼 · v0.3.5'));
});

test('delayed ACK visual hop keeps cast and new seat requests locked until arrival',async()=>{
 const h=harness(snapshot('participant','idle'));let scene=h.nodes().find(n=>n.props?.cameraMode==='overview');
 assert.equal(typeof scene.props.onSeatMotionChange,'function');
 scene.props.onSeatMotionChange(true);h.render();scene=h.nodes().find(n=>n.props?.cameraMode==='overview');
 assert.equal(h.find('fishing-primary').props.disabled,true);assert.equal(scene.props.seatMovementEnabled,false);
 await h.find('fishing-primary').props.onClick();assert.equal(h.commands.length,0);
 scene.props.onSeatMotionChange(false);h.render();scene=h.nodes().find(n=>n.props?.cameraMode==='overview');
 assert.equal(h.find('fishing-primary').props.disabled,false);assert.equal(scene.props.seatMovementEnabled,true);
 const s=snapshot('participant','idle');s.participants[0].movement={fromSlot:0,startedAt:now-100,endsAt:now+1900};
 h.render({snapshot:s});scene=h.nodes().find(n=>n.props?.cameraMode==='overview');scene.props.onSeatMotionChange(false);h.render();
 assert.equal(h.find('fishing-primary').props.disabled,true,'visual completion cannot bypass the server movement clock');
 assert.equal(h.nodes().find(n=>n.props?.cameraMode==='overview').props.seatMovementEnabled,false);
});

test('628 mock likes remain the baseline while this device adds and removes exactly one',()=>{
 const h=harness(snapshot('visitor','idle'));const count=()=>h.find('feed-like-count').props.children;
 assert.equal(count(),628);h.find('feed-like').props.onClick();h.render();assert.equal(count(),629);assert.equal(h.storage.get('dreamina-fishing:liked:v1'),'true');
 h.find('feed-like').props.onClick();h.render();assert.equal(count(),628);assert.equal(h.storage.get('dreamina-fishing:liked:v1'),'false');
});
test('inactive visitors have no personal dock controls and joined chat never runs during an uncertain prior command',async()=>{
 const guest=harness(snapshot('visitor','idle'));assert.equal(guest.find('fishing-avatar-control'),undefined);assert.equal(guest.find('fishing-emote-control'),undefined);assert.match(guest.text(),/登上游艇/);
 const h=harness(snapshot('participant','idle'),{uncertain:true});const composer=h.nodes().find(n=>typeof n.props?.onSend==='function');assert.equal(composer.props.disabled,true);assert.equal(await composer.props.onSend('别丢掉这一句'),false);assert.equal(h.commands.length,0);
});
test('chat acknowledges only a new matching own speech field rather than a previous action snapshot',async()=>{
 const original=snapshot('participant','idle'),result=snapshot('participant','idle');result.participants[0].chat={id:'old-chat',text:'上一句',createdAt:now,expiresAt:now+8000};
 const h=harness(original,{result});let composer=h.nodes().find(n=>typeof n.props?.onSend==='function');assert.equal(await composer.props.onSend('这一句'),false);
 result.participants[0].chat={id:'new-chat',text:'这一句',createdAt:now,expiresAt:now+8000};composer=h.nodes().find(n=>typeof n.props?.onSend==='function');assert.equal(await composer.props.onSend('这一句'),true);
});

for(const value of ['', '   ', '\t\n'])test(`empty nickname ${JSON.stringify(value)} gives exact toast and focus without sending`,async()=>{
 const h=harness(snapshot('visitor','idle'));joinForm(h);setNickname(h,value);
 let focused=0;const input=nickname(h);if(input.props.ref)input.props.ref.current={focus(){focused++;}};
 const form=h.nodes().find(n=>n.type==='form');
 assert.equal(submitButton(h).props.disabled,false);
 assert.equal(form.props.noValidate,true,'native required popup must not swallow the custom toast');
 await form.props.onSubmit({preventDefault(){}});h.render();
 assert.equal(h.find('toast').props.children,'请输入昵称');assert.equal(focused,1);assert.equal(h.commands.length,0);
});

const dockButtons=h=>Array.from(h.find('fishing-dock').props.children).flat().filter(Boolean);
const dockOrder=h=>dockButtons(h).map(n=>n.props.className.split(' ')[0]==='fishing-primary'?'primary':n.props['aria-label'].startsWith('管理')?'avatar':n.props['aria-label'].startsWith('打开')?'bag':n.props['aria-label'].startsWith('切换')?'camera':'emote');
for(const [phase,options] of [['idle',{}],['waiting',{}],['bite',{}],['holding',{}],['escaped',{}],['idle',{pending:true}],['bite',{pending:true}],['holding',{pending:true}],['idle',{uncertain:true}]])test(`joined dock DOM keeps primary first and all five slots during ${phase} ${JSON.stringify(options)}`,()=>{
 const s=snapshot('participant',phase);if(phase==='waiting')s.self.fishing.biteAt=now+5000;
 const h=harness(s,options);
 assert.deepEqual(dockOrder(h),['primary','avatar','bag','emote','camera']);
 assert.equal(dockButtons(h)[0].props.onClick instanceof Function||typeof dockButtons(h)[0].props.onClick==='function',true);
 const scene=h.nodes().find(n=>typeof n.props?.onSeatMotionChange==='function');scene.props.onSeatMotionChange(true);h.render();
 assert.deepEqual(dockOrder(h),['primary','avatar','bag','emote','camera']);
});
test('visitor dock retains the large join action followed by bag and view',()=>{
 assert.deepEqual(dockOrder(harness(snapshot('visitor','idle'))),['primary','bag','camera']);
});
test('every secondary dock control uses the same icon slot before its label',()=>{
 for(const preset of ['cat',...avatars.FISHING_AVATAR_CATALOG.filter(a=>a.previewImage).map(a=>a.id)]){
  const s=snapshot('participant','idle');s.participants[0].preset=preset;const h=harness(s);
  for(const button of dockButtons(h).slice(1)){
   assert.equal(button.props.children[0].props.className,'fishing-dock-icon');
   assert.equal(button.props.children[1].type,'span');
  }
 }
});

const flushLoading=()=>new Promise(resolve=>setImmediate(resolve));
test('selection warms the chosen GLB before a submit or server join',async()=>{
 const h=harness(snapshot('visitor','idle'));joinForm(h);await flushLoading();assert.ok(h.preloads.includes(avatars.DEFAULT_FISHING_AVATAR_PRESET));
 const option=h.nodes().find(n=>n.props?.className?.includes('avatar-option')&&!n.props.className.includes('selected'));option.props.onClick();h.render();await flushLoading();assert.ok(h.preloads.length>=2);assert.equal(h.commands.length,0);
});
test('join stays busy through preload, server ACK and first rendered avatar receipt',async()=>{
 let finish;const preload=new Promise(resolve=>{finish=resolve;});const result=snapshot('participant','idle');result.participants[0].preset=avatars.DEFAULT_FISHING_AVATAR_PRESET;
 const h=harness(snapshot('visitor','idle'),{result,preload:()=>preload,deferAvatarReady:true});joinForm(h);setNickname(h,'小浪');const submit=h.nodes().find(n=>n.type==='form').props.onSubmit;
 const pending=submit({preventDefault(){}});h.render();assert.equal(submitButton(h).props.disabled,true);assert.match(h.text(),/加载分身/);assert.equal(h.commands.length,0);
 await submit({preventDefault(){}});assert.equal(h.commands.length,0,'same-tick duplicate submit cannot start another operation');finish();await flushLoading();h.render();assert.equal(h.commands.length,1);assert.ok(submitButton(h));assert.match(h.text(),/登船准备/);assert.equal(h.find('toast'),undefined);
 const scene=h.nodes().find(n=>n.props?.onAvatarStatus);assert.equal(scene.props.prepareAvatars,true);assert.equal(scene.props.enabled,false);
 scene.props.onAvatarStatus('self',avatars.DEFAULT_FISHING_AVATAR_PRESET,'ready');await pending;h.render();assert.equal(submitButton(h),undefined);assert.equal(h.find('toast').props.children,'已登上游艇');
});
test('failed preload leaves the picker retryable and never sends join',async()=>{
 let fail=true;const h=harness(snapshot('visitor','idle'),{preload:()=>fail?Promise.reject(new Error('offline')):Promise.resolve()});joinForm(h);setNickname(h,'小浪');await flushLoading();
 await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();assert.equal(h.commands.length,0);assert.match(h.text(),/分身加载失败/);assert.equal(submitButton(h).props.disabled,false);
 fail=false;await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();assert.equal(h.commands.length,1);
});
test('closing during preload prevents late join, persistence and success',async()=>{
 let finish;const preload=new Promise(resolve=>{finish=resolve;});const h=harness(snapshot('visitor','idle'),{preload:()=>preload,result:snapshot('participant','idle')});joinForm(h);setNickname(h,'小浪');
 const pending=h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.nodes().find(n=>n.props?.avatarPicker).props.onClose();h.render();finish();await pending;h.render();assert.equal(h.commands.length,0);assert.equal(h.storage.has(profileKey),false);assert.equal(h.find('toast'),undefined);
});
test('closing after ACK cancels render wait and ignores a late model completion',async()=>{
 const h=harness(snapshot('visitor','idle'),{result:snapshot('participant','idle'),deferAvatarReady:true});joinForm(h);setNickname(h,'小浪');const pending=h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await flushLoading();h.render();
 h.nodes().find(n=>n.props?.avatarPicker).props.onClose();await pending;h.render();h.nodes().find(n=>n.props?.onAvatarStatus).props.onAvatarStatus('self','cat','ready');h.render();assert.equal(h.find('toast'),undefined);assert.equal(h.storage.has(profileKey),false);
});
test('leaving after join ACK cancels pending appearance and ignores its late render receipt',async()=>{
 const joined=snapshot('participant','idle'),left=snapshot('visitor','idle');joined.participants[0].preset=avatars.DEFAULT_FISHING_AVATAR_PRESET;
 const h=harness(snapshot('visitor','idle'),{perform:async input=>input.type==='leave'?left:joined,deferAvatarReady:true});joinForm(h);setNickname(h,'小浪');const pending=h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await flushLoading();h.render({snapshot:joined});
 await h.find('leave-button').props.onClick();await pending;h.render({snapshot:left});h.nodes().find(n=>n.props?.onAvatarStatus).props.onAvatarStatus('self',avatars.DEFAULT_FISHING_AVATAR_PRESET,'ready');h.render();assert.equal(h.find('toast'),undefined);assert.equal(h.storage.has(profileKey),false);assert.deepEqual(h.commands.map(c=>c.type),['join','leave']);
});


test('held catch shows species and rarity without any legacy length or weight display',()=>{
 const s=snapshot();s.self.fishing.catch={...caught,lengthCm:987,weightKg:654};s.participants[0].fishing=s.self.fishing;
 const before=JSON.stringify(s),h=harness(s),species=catalog.getSpecies(caught.speciesId);
 assert.ok(h.find('catch-reveal'));assert.match(h.text(),new RegExp(species.name));assert.match(h.text(),new RegExp(catalog.RARITIES[species.rarity].label));
 assert.doesNotMatch(h.text(),/9\.87|987|654|\d(?:[.,]\d+)?\s*(?:cm|m|kg)\b|最大|尺寸|长度|体长|重量/);
 assert.equal(JSON.stringify(s),before,'presentation does not rewrite legacy catch records');
});
test('size-free catch reveal preserves preparation, error and ready statuses with collection available',async()=>{
 const h=harness(snapshot()),status=()=>h.nodes().find(n=>n.props?.onOwnCatchStatus).props.onOwnCatchStatus;
 assert.match(h.text(),/正在收线，准备展示渔获/);assert.equal(h.find('fishing-primary').props.disabled,false);
 status()(caught.id,'error');h.render();assert.match(h.text(),/展示准备中，可直接收进背包/);
 status()(caught.id,'ready');h.render();assert.match(h.text(),new RegExp(catalog.getSpecies(caught.speciesId).description));
 assert.doesNotMatch(h.text(),/\d(?:[.,]\d+)?\s*(?:cm|m|kg)\b/);
 await h.find('fishing-primary').props.onClick();assert.equal(h.commands[0].type,'collect');assert.equal(h.commands[0].catchId,caught.id);
});
test('backpack history and gameplay instructions avoid size wording',()=>{
 const h=harness(snapshot('visitor','idle'));
 h.nodes().find(n=>n.props?.['aria-label']?.startsWith('打开背包')).props.onClick();h.render();
 assert.match(h.text(),/图鉴保留每种数量，最近 60 只保留单独记录/);assert.doesNotMatch(h.text(),/最大|尺寸|长度|体长|重量/);
 openAboutFromSettings(h);assert.match(h.text(),/20 种海洋生物/);assert.doesNotMatch(h.text(),/尺寸|长度|体长|重量/);
});
