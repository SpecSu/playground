import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const { INSTALLATION_DESIGNS }=await import('../src/desert/installations.ts');
const avatars=await import('../lib/club-avatar-catalog.ts');
const roomTypes=await import('../lib/room-types.ts');
const festival=await import('../lib/festival-types.ts');
const visualMath=await import('../src/desert/visual-math.ts');
const motion=await import('../lib/festival-motion.ts');
const chat=await import('../lib/festival-chat.ts');

const source=fs.readFileSync(new URL('../components/DesertFeed.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('DesertFeed.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const feed=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='DesertFeed');
const returnNode=feed.body.statements.find(ts.isReturnStatement),names=[];
function bindings(binding){if(ts.isIdentifier(binding))names.push(binding.text);else for(const item of binding.elements)if(ts.isBindingElement(item))bindings(item.name);}
for(const statement of feed.body.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)bindings(declaration.name);
const js=ts.transpileModule(source.slice(0,returnNode.getStart(ast))+`globalThis.__scope={${names.join(',')}};\n`+source.slice(returnNode.getStart(ast)),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const component=name=>Object.assign(()=>null,{displayName:name});
const element=(type,props,key)=>({type,props:props??{},key});
const nodes=(tree,predicate)=>Array.isArray(tree)?tree.flatMap(n=>nodes(n,predicate)):tree&&typeof tree==='object'&&tree.props?[...(predicate(tree)?[tree]:[]),...nodes(tree.props.children,predicate)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree==null||typeof tree==='boolean'?'':typeof tree==='object'?text(tree.props?.children):String(tree);
function baseSnapshot(joined=true){const p={id:'self',name:'Sandy',preset:'cat',slot:0,joinedAt:1000,lastSeenAt:1000,x:0,z:44,targetX:0,targetZ:44,moveAt:1000,heading:Math.PI,emote:'dance',emoteAt:0};return{roomId:'main',revision:1,serverNow:1000,capacity:10,self:{id:'self',role:joined?'participant':'visitor',lastSequence:0},participants:joined?[p]:[],installations:[],round:festival.festivalRoundAt(1,1000,1500)};}
function lightingRoom(joined=true){const room=baseSnapshot(joined);room.installations=[{id:'art',actorId:'other',creatorName:'夜行者',kind:2,x:35,z:35,createdAt:-30000,roundIndex:1}];return room;}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function harness(joined=true){
 const slots=[],storage=new Map(),calls=[];let cursor=0,tree,room=baseSnapshot(joined),handler=async()=>true;const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useCallback(callback){return callback;},useEffect(){}};
 const memory={photo:null,isOpen:false,options:null,onCapture(){},dismiss(){memory.photo=null;memory.isOpen=false;}};
 const audio={muted:false,playing:false,needsGesture:false,unavailable:false,enabled:true,requests:[],requestFromGesture(){this.requests.push(calls.length);},toggleFromGesture(){audio.playing=!audio.playing;}};
 const api={snapshot:room,connection:'live',feedback:'',setFeedback(){},pending:false,send:async(command,silent)=>{calls.push({command,silent});return handler(command);},serverTime:()=>1500,getSnapshot:()=>room,reconnect:async()=>{}};
 const context=vm.createContext({exports:{},console,Date,Intl,Math,Promise,queueMicrotask:callback=>callback(),setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},navigator:{clipboard:{writeText:async()=>{}}},window:{location:{href:'https://desert.test'},addEventListener(){},removeEventListener(){}},require(specifier){if(specifier==='react')return hooks;if(specifier==='react/jsx-runtime')return{jsx:element,jsxs:element,Fragment:'Fragment'};if(specifier==='lucide-react')return new Proxy({},{get:(_,name)=>component(name)});if(specifier==='@/hooks/useFestivalMemoryPhoto')return{useFestivalMemoryPhoto:options=>{memory.options=options;return memory;}};if(specifier==='@/hooks/useFestivalRoom')return{useFestivalRoom:()=>api};if(specifier==='@/hooks/useFestivalAudio')return{useFestivalAudio:enabled=>{audio.enabled=enabled;return audio;}};if(specifier==='@/lib/club-avatar-catalog')return avatars;if(specifier==='@/lib/room-types')return roomTypes;if(specifier==='@/lib/festival-chat')return chat;if(specifier==='@/lib/festival-types')return festival;if(specifier==='@/lib/festival-motion')return motion;if(specifier==='@/src/desert/installations')return{INSTALLATION_DESIGNS};if(specifier==='@/src/desert/visual-math')return visualMath;if(specifier.endsWith('.css'))return{};if(specifier==='./ProfilePage')return{default:component('ProfilePage'),getProfileMedia:()=>[]};if(specifier.startsWith('./'))return{default:component(specifier.slice(2))};throw new Error(specifier);}});
 vm.runInContext(js,context);const render=()=>{cursor=0;api.snapshot=room;tree=context.exports.default();return context.__scope;};render();return{render,calls,storage,audio,memory,get scope(){return context.__scope;},get tree(){return tree;},setRoom(next){room=next;},setConnection(value){api.connection=value;},setHandler(next){handler=next;},button(label){const found=nodes(tree,n=>n.type==='button'&&(n.props['aria-label']===label||text(n).includes(label)))[0];assert.ok(found,`button ${label}`);return found;},components(name){return nodes(tree,n=>n.type?.displayName===name);}};
}
test('festival preserves canonical feed, status, author, profile and three-way navigation shell',()=>{
 const h=harness();for(const label of['关注','推荐','首页','我的','创建','通知','搜索'])assert.ok(h.button(label));
 assert.equal(h.components('PhoneViewport').length,1);assert.equal(h.components('ProfilePage').length,1);assert.equal(h.components('DesertScene').length,1);
 assert.equal(h.components('ProfilePage')[0].props.liveMedia.src,'/festival-preview.png');
 assert.ok(nodes(h.tree,n=>n.props.className==='status-bar').length);assert.ok(nodes(h.tree,n=>n.props.className==='creator-caption').length);
});
test('camera control cycles directly and shows the target view without a submenu',()=>{
 const h=harness();h.button('切换到沉浸视角').props.onClick();h.render();assert.equal(h.scope.view,'follow');assert.equal(h.scope.sheet,null);
 h.button('切换到俯瞰视角').props.onClick();h.render();assert.equal(h.scope.view,'aerial');h.button('切换到远眺视角').props.onClick();h.render();assert.equal(h.scope.view,'vista');
});
test('joystick release freezes bounded prediction and submits an authoritative stop despite inactive stick',async()=>{
 const h=harness();h.scope.onMove(7,44);h.scope.onJoystickInput({x:0,y:0},false);h.scope.stopMovement();
 assert.deepEqual(h.calls.map(x=>x.command.type),['move','stop']);assert.equal(h.scope.prediction.current.targetX,h.scope.prediction.current.x);assert.equal(h.scope.prediction.current.targetZ,h.scope.prediction.current.z);
 await Promise.resolve();
});
test('navigation clears build mode, freezes movement, keeps the shared scene mounted and exposes My',()=>{
 const h=harness();h.scope.setSelectedKind(2);h.render();h.scope.onMove(7,44);h.scope.selectPage('profile');h.render();assert.equal(h.scope.page,'profile');assert.equal(h.scope.selectedKind,null);assert.equal(h.components('DesertScene').length,1);assert.equal(h.calls.at(-1).command.type,'stop');
});
test('join submit is deduplicated and a late successful response cannot dismiss a newer drawer',async()=>{
 const h=harness(false),gate=deferred();h.scope.setName('Nomad');h.scope.openSheet('join');h.render();h.setHandler(()=>gate.promise);const first=h.scope.join({preventDefault(){}});const second=h.scope.join({preventDefault(){}});assert.equal(h.calls.length,1);h.scope.openSheet('about');h.render();h.setRoom(baseSnapshot(true));gate.resolve(true);await Promise.all([first,second]);h.render();assert.equal(h.scope.sheet,'about');
});
test('a full-room spectator is not falsely welcomed as a participant',async()=>{
 const h=harness(false);h.scope.setName('Nomad');h.scope.openSheet('join');h.render();h.setRoom({...baseSnapshot(false),self:{id:'self',role:'spectator',lastSequence:1}});await h.scope.join({preventDefault(){}});h.render();assert.equal(h.scope.sheet,'join');assert.match(h.scope.toast,/满员/);assert.equal(h.scope.view,'vista');
});
test('build is deduplicated and sends an arbitrary ground point with the current round identity',async()=>{
 const h=harness(),gate=deferred();h.scope.selectArt(5);h.render();assert.equal(h.scope.selectedKind,5);assert.equal(h.scope.view,'aerial');assert.equal(h.scope.sheet,null);h.setHandler(()=>gate.promise);h.scope.onPlace(-41.137,-35.271);h.scope.onPlace(-39.5,-34.9);assert.equal(h.calls.length,1);assert.equal(h.calls[0].command.kind,5);assert.equal(h.calls[0].command.x,-41.137);assert.equal(h.calls[0].command.z,-35.271);assert.equal(h.calls[0].command.roundIndex,1);assert.equal(h.calls[0].command.plotId,undefined);gate.resolve(true);await new Promise(r=>setImmediate(r));h.render();assert.equal(h.scope.selectedKind,null);
});
test('a rejected placement keeps its selection and late success cannot clear a newer design',async()=>{
 const h=harness();h.scope.selectArt(5);h.render();h.setHandler(async()=>false);h.scope.onPlace(-41,-35);await new Promise(r=>setImmediate(r));h.render();assert.equal(h.scope.selectedKind,5);
 const gate=deferred();h.setHandler(()=>gate.promise);h.scope.onPlace(-41,-35);h.scope.selectArt(8);h.render();gate.resolve(true);await new Promise(r=>setImmediate(r));h.render();assert.equal(h.scope.selectedKind,8);h.button('取消搭建').props.onClick();h.render();assert.equal(h.scope.selectedKind,null);
});
test('placement copy describes free ground and creation cards retain accessible selection without image backgrounds',()=>{
 const h=harness();h.scope.selectArt(5);h.render();assert.match(text(h.tree),/任意空旷沙地/);assert.doesNotMatch(text(h.tree),/发光的空地/);h.scope.openSheet('create');h.render();const cards=nodes(h.tree,n=>n.type==='button'&&String(n.props.className).startsWith('installation-card'));assert.equal(cards.filter(n=>n.props['aria-pressed']).length,1);assert.equal(cards[5].props['aria-pressed'],true);
 const css=fs.readFileSync(new URL('../components/DesertFeed.css',import.meta.url),'utf8');const backgrounds=[...css.matchAll(/\.desert-feed \.installation-(?:card|image)[^{]*\{([^}]+)\}/g)].map(match=>match[1]);assert.ok(backgrounds.every(rule=>!/(?:background:)(?!transparent)/.test(rule)),'Artwork tile/image backgrounds are transparent even when selected');
});
test('festival storage is independently namespaced and uses rendered preview assets for all twelve designs',()=>{
 const h=harness();h.scope.toggleLike();assert.equal(h.storage.get('dreamina-desert-festival:liked:v1'),'1');assert.ok(!source.includes('club_device'));assert.ok(!source.includes('LIVE_WORK_LIKE_KEY'));
 h.scope.openSheet('create');h.render();const cards=nodes(h.tree,n=>n.type==='button'&&String(n.props.className).startsWith('installation-card'));assert.equal(cards.length,12);for(const art of INSTALLATION_DESIGNS)assert.ok(fs.existsSync(new URL(`../public/installation-previews/${art.id}.png`,import.meta.url)));
});
test('scene includes bounded prediction, error recovery and full-length plain canvas text rather than unsafe HTML',()=>{
 const scene=fs.readFileSync(new URL('../components/DesertScene.tsx',import.meta.url),'utf8');assert.match(scene,/selectFestivalMovement/);assert.match(scene,/stepFestivalMotion/);assert.match(scene,/Frame failed/);assert.match(scene,/if\(alive&&!failed\)setStatus\('ready'\)/);assert.match(scene,/onContextLost=.*failScene\(\)/);assert.match(scene,/cancelAnimationFrame\(frame\)/);assert.doesNotMatch(scene,/innerHTML|dangerouslySetInnerHTML/);assert.match(scene,/speechBubbleLayout\(text,value=>measure.measureText\(value\).width\)/);assert.match(scene,/ctx.fillText\(speech.lines\[i\]/);
});
test('late leave and emote completions never dismiss a newer drawer',async()=>{
 for(const action of['leave','chooseEmote']){const h=harness(),gate=deferred();h.scope.openSheet(action==='leave'?'join':'actions');h.render();h.setHandler(()=>gate.promise);const promise=h.scope[action]('love');h.scope.openSheet('settings');h.render();gate.resolve(true);await promise;h.render();assert.equal(h.scope.sheet,'settings');}
});

test('a second click updates prediction immediately while the previous move reply is delayed',async()=>{
 const h=harness(),gate=deferred();h.setHandler(()=>gate.promise);
 h.scope.onMove(7,44);const first=h.scope.prediction.current.token;
 h.scope.onMove(15,44);
 assert.equal(h.scope.prediction.current.targetX,15,'Latest click must not be dropped by an in-flight network request');
 assert.ok(h.scope.prediction.current.token>first);
 gate.resolve(true);await new Promise(r=>setImmediate(r));
});

test('repeated stop signals preserve the pending stationary prediction',async()=>{
 const h=harness(),gate=deferred();h.setHandler(()=>gate.promise);
 h.scope.onMove(7,44);h.scope.stopMovement();const stop=h.scope.prediction.current;
 h.scope.stopMovement();
 assert.equal(h.scope.prediction.current,stop,'A duplicate release must not resume the old authoritative walk');
 gate.resolve(true);await new Promise(r=>setImmediate(r));
});

test('an old move completion cannot erase a newer click prediction',async()=>{
 const h=harness(),first=deferred(),second=deferred();let calls=0;h.setHandler(()=>++calls===1?first.promise:second.promise);
 h.scope.onMove(7,44);h.scope.onMove(15,44);const latest=h.scope.prediction.current;
 first.resolve(true);await new Promise(r=>setImmediate(r));assert.equal(h.scope.prediction.current,latest);
 second.resolve(true);await new Promise(r=>setImmediate(r));assert.equal(h.scope.prediction.current,null);
});

test('audio unlock runs inside join gesture before request and speaker is direct for visitors',async()=>{const h=harness(false);h.button('开启音乐与音效').props.onClick();h.render();assert.equal(h.audio.playing,true);assert.equal(h.scope.sheet,null);h.scope.setName('Nomad');h.render();await h.scope.join({preventDefault(){}});assert.equal(h.audio.requests[0],0,'gesture precedes network request');h.scope.selectPage('profile');h.render();assert.equal(h.audio.enabled,false);h.scope.selectPage('feed');h.render();assert.equal(h.audio.enabled,true);});

test('only accepted own movement advances camera intent, including direct movement entry',()=>{
 const h=harness();const before=h.components('DesertScene')[0].props.movementVersion?.current??0;
 assert.equal(h.scope.onMove(7,44),true);assert.equal(h.components('DesertScene')[0].props.movementVersion.current,before+1);
 const current=h.components('DesertScene')[0].props.movementVersion.current;
 for(const [x,z]of[[NaN,44],[0,0],[100,100]])assert.equal(h.scope.onMove(x,z),false);
 assert.equal(h.components('DesertScene')[0].props.movementVersion.current,current);
 const visitor=harness(false);assert.equal(visitor.scope.onMove(7,44),false);
});

test('active hammering blocks movement, replacement placement and stop cleanup while camera stays usable',()=>{
 const h=harness();const room=baseSnapshot();room.serverNow=1500;room.participants[0].buildTask={installationId:'work',arrivalAt:1500,finishAt:21500,facing:1};h.setRoom(room);h.render();
 h.scope.onJoystickInput({x:1,y:0},true);h.scope.stopMovement();assert.equal(h.calls.length,0);
 assert.equal(h.scope.onMove(7,44),false);assert.equal(h.scope.prediction.current,null);assert.equal(h.scope.movementVersion.current,0);
 h.scope.openSheet('about');h.scope.startCreate();h.scope.selectArt(2);h.scope.setSelectedKind(2);h.render();h.scope.onPlace(35,45);assert.equal(h.calls.length,0);
 assert.equal(h.components('ClubJoystick')[0].props.enabled,false);assert.match(text(h.tree),/搭建中/);assert.match(text(h.tree),/完成后可移动/);
 h.scope.closeSheet();h.render();h.button('切换到沉浸视角').props.onClick();h.render();assert.equal(h.scope.view,'follow');
});
test('approaching work can still be cancelled by a ground move',()=>{
 const h=harness();const room=baseSnapshot();room.participants[0].buildTask={installationId:'work',arrivalAt:2500,finishAt:22500,facing:1};h.setRoom(room);h.render();assert.equal(h.scope.onMove(7,44),true);assert.equal(h.calls[0].command.type,'move');
});


test('ceremony capture connects to deferred photo presentation and its overlay makes all background controls inert',()=>{
 const h=harness();const scene=h.components('DesertScene')[0];
 assert.equal(scene.props.onCelebrationPhoto,h.memory.onCapture);
 assert.equal(h.memory.options.active,true);assert.equal(h.memory.options.blocked,false);
 h.scope.focusChat();h.render();assert.equal(h.memory.options.blocked,true);assert.equal(h.scope.chatFocused,true);h.scope.closeChat();h.render();
 h.scope.closeSheet();h.scope.setSelectedKind(0);h.render();assert.equal(h.memory.options.blocked,true);
 h.scope.setSelectedKind(null);h.scope.selectPage('profile');h.render();assert.equal(h.memory.options.active,false);
 h.scope.selectPage('feed');h.memory.photo={roundIndex:1,capturedAt:322000,dataUrl:'data:image/jpeg;base64,YWN0dWFs'};h.memory.isOpen=true;h.render();
 assert.equal(h.components('FestivalMemoryPhoto').length,1);
 assert.equal(nodes(h.tree,n=>n.props['aria-label']==='首页')[0].props.inert,true);
 assert.equal(nodes(h.tree,n=>n.props.className==='profile-mount')[0].props.inert,true);
 assert.equal(nodes(h.tree,n=>n.props['aria-label']==='主导航')[0].props.inert,true);
 assert.equal(h.components('ClubJoystick')[0].props.enabled,false);
 assert.equal(h.components('FestivalMemoryPhoto')[0].props.onClose,h.memory.dismiss);
});

test('photo UI carries v0.3.3, paper border and bounded phone-safe controls',()=>{
 const h=harness();assert.match(text(h.tree),/v0\.3\.3/);
 const css=fs.readFileSync(new URL('../components/DesertFeed.css',import.meta.url),'utf8');
 assert.match(css,/\.festival-memory-layer[^}]*inset:0[^}]*z-index:40/);
 assert.match(css,/\.festival-memory-paper[^}]*padding:18px 18px 24px[^}]*background:#fffdf7/);
 assert.match(css,/\.festival-memory-dialog[^}]*overflow-y:auto/);
 assert.match(css,/\.festival-memory-actions button[^}]*min-height:44px/);
 assert.match(css,/\.festival-memory-actions button:focus-visible/);
});

test('approved A countdown is a separate centered plaque with left title and unchanged right sound',()=>{
 const h=harness();
 const strip=nodes(h.tree,n=>n.props.className==='festival-status-strip')[0];
 assert.ok(strip,'one shared top status strip');
 assert.equal(nodes(h.tree,n=>n.props.className==='ritual-row').length,0);
 assert.equal(nodes(h.tree,n=>n.props.className==='desert-scene-tag').length,0);
 assert.ok(text(strip).includes('火人节'));assert.ok(text(strip).includes('燃烧仪式倒计时'));assert.ok(!text(strip).includes('后燃烧仪式'));assert.equal(nodes(h.tree,n=>n.props['aria-label']==='查看火人节玩法').length,0);assert.ok(h.button('开启音乐与音效'));
 assert.equal(nodes(h.tree,n=>n.props['aria-label']==='视角回正').length,0);assert.ok(h.button('切换到沉浸视角'),'original dock view control stays available');
 const timer=nodes(strip,n=>n.props.role==='timer')[0];assert.ok(timer);assert.equal(nodes(timer,n=>n.type==='small').length,0);
 assert.equal(nodes(nodes(strip,n=>n.props.className==='festival-status-title')[0],n=>n.props.role==='timer').length,0,'countdown is independently centered outside the left title group');
});
test('visitors have only the original white join CTA and viewing camera in the dock',()=>{
 const h=harness(false),dock=nodes(h.tree,n=>n.props.className==='interaction-dock')[0];
 assert.deepEqual(nodes(dock,n=>n.type==='button').map(n=>n.props['aria-label']),['进入荒原','切换到沉浸视角']);
 assert.equal(h.components('ClubJoystick').length,0);
 assert.equal(nodes(h.tree,n=>n.type==='input'&&n.props['aria-label']==='说点什么...').length,0);
});
const composer=h=>nodes(h.tree,n=>n.type==='input'&&n.props['aria-label']==='说点什么...')[0];
const keyEvent=(key='Enter',nativeEvent={})=>({key,nativeEvent,prevented:false,preventDefault(){this.prevented=true;},currentTarget:{blur(){}}});
test('joined composer submits normalized text inline without creating a speech panel',async()=>{
 const h=harness();assert.ok(composer(h),'joined-only input');assert.equal(composer(h).props.placeholder,'说点什么...');
 composer(h).props.onChange({target:{value:'  在这里\n见 👨‍👩‍👧‍👦  '}});h.render();
 const event=keyEvent();composer(h).props.onKeyDown(event);await new Promise(r=>setImmediate(r));h.render();
 assert.equal(event.prevented,true);assert.equal(h.calls.length,1);assert.equal(h.calls[0].command.type,'say');
 assert.equal(h.calls[0].command.text,'在这里 见 👨‍👩‍👧‍👦');assert.equal(h.scope.text,'');assert.equal(h.scope.sheet,null);
 assert.equal(nodes(h.tree,n=>n.type==='textarea').length,0);
});
test('composition and candidate-confirming Enter never send, while a later deliberate Enter does',async()=>{
 const h=harness();assert.ok(composer(h));
 composer(h).props.onCompositionStart();composer(h).props.onChange({target:{value:'你好'}});h.render();
 composer(h).props.onKeyDown(keyEvent());assert.equal(h.calls.length,0);
 composer(h).props.onCompositionEnd({currentTarget:{value:'你好'}});h.render();
 composer(h).props.onKeyDown(keyEvent());assert.equal(h.calls.length,0,'composition-end companion Enter is ignored');
 h.scope.composedAt.current=-Infinity;
 for(const nativeEvent of[{isComposing:true},{keyCode:229}])composer(h).props.onKeyDown(keyEvent('Enter',nativeEvent));
 assert.equal(h.calls.length,0);composer(h).props.onKeyDown(keyEvent());await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);
});
test('composer rejects blank, offline and stale membership, and clamps 80 Unicode characters',async()=>{
 const h=harness();assert.ok(composer(h));
 composer(h).props.onChange({target:{value:'😀'.repeat(81)}});h.render();assert.equal([...h.scope.text].length,80);
 composer(h).props.onChange({target:{value:' \t\n\u202e '}});h.render();await h.scope.submitText({preventDefault(){}});assert.equal(h.calls.length,0);
 composer(h).props.onChange({target:{value:'hello'}});h.render();h.setRoom(baseSnapshot(false));await h.scope.submitText({preventDefault(){}});assert.equal(h.calls.length,0);
 h.setRoom({...baseSnapshot(),participants:[]});await h.scope.submitText({preventDefault(){}});assert.equal(h.calls.length,0);
});
test('failed, cancelled and racing chat retains draft without dismissing unrelated UI',async()=>{
 const h=harness();assert.ok(composer(h));composer(h).props.onChange({target:{value:'keep me'}});h.render();
 h.setHandler(async()=>false);await h.scope.submitText({preventDefault(){}});h.render();assert.equal(h.scope.text,'keep me');
 composer(h).props.onFocus();h.render();h.button('取消输入').props.onClick();h.render();assert.equal(h.scope.text,'keep me');assert.equal(h.scope.chatFocused,false);
 const gate=deferred();h.setHandler(()=>gate.promise);const first=h.scope.submitText({preventDefault(){}});h.scope.submitText({preventDefault(){}});
 composer(h).props.onChange({target:{value:'new draft'}});h.scope.openSheet('about');h.render();gate.resolve(true);await first;h.render();
 assert.equal(h.calls.length,2);assert.equal(h.scope.text,'new draft');assert.equal(h.scope.sheet,'about');
});
test('mock likes keep 962 as the stable baseline and toggle only this device delta',()=>{
 const h=harness();const count=()=>text(nodes(h.tree,n=>n.props.className==='feed-like-count')[0]);
 assert.equal(h.components('ProfilePage')[0].props.liveMedia.count,'0','sample play count is unrelated to feed likes');
 assert.equal(count(),'962');h.scope.toggleLike();h.render();assert.equal(count(),'963');h.scope.toggleLike();h.render();assert.equal(count(),'962');
});

test('v3 layout keeps divider above the compact status, visitor author lower and keyboard composer reachable',()=>{
 const css=fs.readFileSync(new URL('../components/DesertFeed.css',import.meta.url),'utf8');
 assert.match(css,/\.festival-status-strip\{[^}]*top:96px[^}]*border-top:1px solid #ffffff1a/);
 assert.match(css,/\.festival-status-actions\{[^}]*gap:0/);
 assert.match(css,/\.burn-clock-digits\{[^}]*font-size:28px/);
 assert.match(css,/\.festival-status-title\{[^}]*font-size:12px[^}]*font-weight:400/);
 assert.doesNotMatch(css,/festival-help|desert-camera-stack/);
 assert.match(css,/\.desert-feed:not\(\.joined\) \.creator-caption\{top:619px/);
 assert.match(css,/\.festival-chat\{[^}]*top:633px/);
 assert.match(css,/\.chat-is-focused \.festival-chat\{[^}]*var\(--phone-visible-height/);
 assert.match(css,/\.festival-chat input\{[^}]*font-size:16px/);
 assert.match(css,/\.desert-feed:not\(\.joined\) \.join-control\{[^}]*background:#fff/);
});

test('native KeyboardEvent prototype IME flags are read directly and candidate selection is not prevented',()=>{
 const h=harness();composer(h).props.onChange({target:{value:'候选词'}});h.render();
 const event=keyEvent('Enter',Object.create({keyCode:229,isComposing:true}));composer(h).props.onKeyDown(event);
 assert.equal(h.calls.length,0);assert.equal(event.prevented,false,'IME candidate confirmation must reach the input method');
});

test('pasting multiline text inserts single-line spaces before native input sanitization',()=>{
 const h=harness();assert.equal(typeof composer(h).props.onPaste,'function');
 composer(h).props.onChange({target:{value:'hello world'}});h.render();
 const event={prevented:false,preventDefault(){this.prevented=true;},clipboardData:{getData:()=> '风\n和\t火 '},currentTarget:{selectionStart:6,selectionEnd:6}};
 composer(h).props.onPaste(event);h.render();assert.equal(event.prevented,true);assert.equal(h.scope.text,'hello 风 和 火 world');
});
test('composer is disabled offline and old membership responses cannot clear retained draft',async()=>{
 const h=harness();composer(h).props.onChange({target:{value:'stay'}});h.render();h.setConnection('offline');h.render();
 assert.equal(composer(h).props.disabled,true);await h.scope.submitText({preventDefault(){}});assert.equal(h.calls.length,0);
 h.setConnection('live');h.render();const gate=deferred();h.setHandler(()=>gate.promise);const sent=h.scope.submitText({preventDefault(){}});
 const room=baseSnapshot();room.participants[0].joinedAt=5000;h.setRoom(room);gate.resolve(true);await sent;h.render();assert.equal(h.scope.text,'stay');
});

test('an interrupted composition on blur unlocks later English input without dropping the draft',async()=>{
 const h=harness();composer(h).props.onFocus();composer(h).props.onCompositionStart();composer(h).props.onChange({target:{value:'unfinished'}});h.render();
 composer(h).props.onBlur();h.render();assert.equal(h.scope.composing.current,false);assert.equal(h.scope.chatFocused,false);assert.equal(h.scope.text,'unfinished');
 h.scope.composedAt.current=-Infinity;composer(h).props.onFocus();composer(h).props.onKeyDown(keyEvent());await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);
});

test('approved timer uses one correct phase-specific readout and a safe loading placeholder',()=>{
 const h=harness();
 const readout=()=>nodes(h.tree,n=>n.props.className==='burn-clock-digits');
 const caption=()=>nodes(h.tree,n=>n.props.className==='burn-clock-caption');
 assert.equal(readout().length,1);assert.equal(text(caption()[0]),'燃烧仪式倒计时');
 const room=lightingRoom();h.setRoom({...room,round:{...room.round,burnAt:900,ashesAt:2000,endsAt:3000}});h.render();
 assert.equal(readout().length,0);assert.equal(caption().length,0);assert.equal(nodes(h.tree,n=>n.props.className==='burn-clock-plate').length,0);assert.equal(text(nodes(h.tree,n=>n.props.className==='festival-phase-status')[0]),'燃烧仪式进行中');
 assert.equal(nodes(h.tree,n=>n.props.role==='timer').length,0);
 h.setRoom({...room,round:{...room.round,burnAt:500,ashesAt:900,endsAt:4000}});h.render();
 assert.equal(readout().length,0);assert.equal(caption().length,0);assert.equal(nodes(h.tree,n=>n.props.className==='burn-clock-plate').length,0);assert.equal(text(nodes(h.tree,n=>n.props.className==='festival-phase-status')[0]),'00:03 荒原重生');
 h.setRoom(null);h.render();assert.equal(text(readout()[0]),'--:--');assert.equal(text(caption()[0]),'燃烧仪式倒计时');
});
test('approved A geometry is 80 percent, translucent brown, and cannot move the mute hitbox',()=>{
 const css=fs.readFileSync(new URL('../components/DesertFeed.css',import.meta.url),'utf8');
 assert.match(css,/\.burn-clock\{[^}]*position:absolute[^}]*left:calc\(50% - 1px\)[^}]*pointer-events:none/);
 assert.match(css,/\.burn-clock-plate\{[^}]*width:113\.6px;height:40\.8px;[^}]*rgba\(63,39,23,\.34\)[^}]*rgba\(49,32,21,\.28\)/);
 assert.match(css,/\.burn-clock-digits\{[^}]*font-size:28px[^}]*font-variant-numeric:tabular-nums[^}]*text-shadow:/);
 assert.match(css,/\.burn-clock-caption\{[^}]*display:block[^}]*margin-top:4\.8px/);
 assert.match(css,/\.festival-sound-toggle\{width:44px;min-width:44px;height:44px;flex:none/);
 assert.match(css,/\.placement-banner\{[^}]*top:174px/);
 assert.ok(fs.existsSync(new URL('../public/fonts/festival-countdown-mono.ttf',import.meta.url)));
 assert.ok(fs.existsSync(new URL('../public/fonts/DEJAVU-LICENSE.txt',import.meta.url)));
});

test('ceremony plain status shares the title baseline without shifting the sound control',()=>{
 const css=fs.readFileSync(new URL('../components/DesertFeed.css',import.meta.url),'utf8');
 assert.match(css,/\.festival-phase-status\{[^}]*position:absolute[^}]*top:50%[^}]*transform:translate\(-50%,-50%\)[^}]*font-size:12px;line-height:18px/);
 assert.match(css,/\.festival-status-title\{[^}]*font-size:12px;line-height:18px/);
 assert.doesNotMatch(css,/\.burn-clock\.is-burning/);
 const h=harness(),room=lightingRoom();h.setRoom({...room,round:{...room.round,burnAt:900,ashesAt:2000,endsAt:3000}});h.render();
 const actions=nodes(h.tree,n=>n.props.className==='festival-status-actions')[0];
 assert.equal(nodes(actions,n=>n.props.className==='festival-sound-toggle').length,1);
});


test('artworks retain the ordinary dock without lighting controls or creator-selection UI',()=>{
 const h=harness(),room=lightingRoom();room.installations[0].lighting={mode:'spark',palette:'ice',startedAt:100};room.monumentLighting={mode:'pulse',palette:'solar',startedAt:100};h.setRoom(room);h.render();
 assert.equal(nodes(h.tree,n=>n.props.className==='interaction-dock').length,1);assert.equal(h.components('ClubJoystick').length,1);
 assert.equal(h.components('DesertScene')[0].props.onSelectArtwork,undefined);assert.equal(h.components('DesertScene')[0].props.lightingPreview,undefined);
 assert.doesNotMatch(source,/lightingTarget|lightingOptimistic|setArtworkLighting|LIGHT_PALETTES|festival-lighting-panel|作品灯光选择/);
 assert.equal(h.calls.length,0);
 const css=fs.readFileSync(new URL('../components/DesertFeed.css',import.meta.url),'utf8');assert.doesNotMatch(css,/festival-lighting/);
 assert.match(css,/\.desert-feed\.joined \.join-control\{width:66px;height:52px;gap:3px;border:0;border-radius:12px;background:#ffffff08/);
 assert.match(css,/\.festival-memory-paper\{[^}]*transform:none/);
});
