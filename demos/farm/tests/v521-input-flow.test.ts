import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {Window} from 'happy-dom';
import {createElement,act} from 'react';
import {createEstate,currentProfile,commandEstate,estateSnapshot,type EstateCommand,type EstateSnapshot} from '../src/v5/estate.ts';
import {createThreat} from '../src/v5/threat.ts';
import type {GridPoint} from '../src/v5/layout.ts';
import type {EstateResponse} from '../server/estate-store.ts';

// Only WebGL is replaced: the actual React app, queue and estate reducer run.
// This verifies the command/UI chain, not Chrome hit testing or WebGL visuals.
type WorldBridge={callbacks?:{destination:(to:GridPoint)=>void;select:(id:string)=>void;assetsReady:(ready:boolean)=>void;place?:(to:GridPoint)=>void};latest?:EstateSnapshot};
const bridge:WorldBridge={};
Object.defineProperty(globalThis,'__inputRepairWorld',{value:bridge,configurable:true});
registerHooks({load(url,context,next){
 if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export default {};'};
 if(url.endsWith('/src/v5/EstateWorld.ts'))return {format:'module',shortCircuit:true,source:`export class EstateWorld {
 constructor(host,data,callbacks){globalThis.__inputRepairWorld.callbacks=callbacks;globalThis.__inputRepairWorld.latest=data;callbacks.assetsReady(true);}
 set(data){globalThis.__inputRepairWorld.latest=data;} stopInput(){} move(){} dispose(){} capture(){return undefined;}
 }`};
 return next(url,context);
}});

async function until(check:()=>boolean,label:string,ms=1800){
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){if(check())return;await act(async()=>{await delay(10);});}
 assert.ok(check(),label);
}

async function mount(options:{stage?:'complete'|'retreat'|'done'|'choose';holdEnter?:boolean;loseFinish?:boolean;loseReset?:boolean;loseFeed?:boolean;failInitialGet?:boolean;feeding?:string;lostNatural?:boolean}={}){
 const browser=new Window({url:'http://farm-test.invalid/'});
 browser.document.body.innerHTML='<div id="root"></div>';
 const old=new Map<string,PropertyDescriptor|undefined>();
 for(const key of ['window','document','navigator','HTMLElement','MutationObserver','matchMedia','requestAnimationFrame','cancelAnimationFrame','ResizeObserver','self','Event','CustomEvent','getComputedStyle','HTMLCanvasElement','sessionStorage']){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  const value=key==='window'||key==='self'?browser:(browser as unknown as Record<string,unknown>)[key];
  if(value)Object.defineProperty(globalThis,key,{value:typeof value==='function'&&!/^[A-Z]/.test(key)?value.bind(browser):value,configurable:true});
 }
 old.set('IS_REACT_ACT_ENVIRONMENT',Object.getOwnPropertyDescriptor(globalThis,'IS_REACT_ACT_ENVIRONMENT'));
 Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true});
 const now=Date.now();let estate=createEstate('input-flow',now),lose=!!options.loseFinish,loseReset=!!options.loseReset,loseFeed=!!options.loseFeed,failGet=!!options.failInitialGet,releaseEnter:undefined|(()=>void);
 const profile=currentProfile(estate);profile.session='prior-session';
 const stage=options.stage??'complete';
 if(stage==='done'){profile.tutorial='done';profile.threat=null;profile.opening={version:1,stage:'done',elapsed:0,guardian:'dog'};}
 else if(stage!=='choose'){profile.tutorial='defend';profile.guardian='dog';profile.openingActed=true;profile.opening={version:1,stage:stage==='retreat'?'defend':'done',elapsed:0,guardian:'dog'};profile.threat!.phase='complete';}
 if(options.lostNatural){profile.guardian='dog';profile.threat=createThreat({id:'natural-lost',seed:5,mode:'reassure',guardian:'dog',actors:profile.animals.map(a=>({id:a.id,position:a.position}))},profile.layout);profile.threat.actors[0].status='lost';profile.threat.actors[0].reason='等待免费找回';}
 if(options.feeding){const result=commandEstate(estate,{id:'existing-feed',type:'feed',target:options.feeding,food:'milk',session:profile.session},now);assert.equal(result.accepted,true,result.message);estate=result.state;}
 const receipts=new Map<string,Pick<EstateResponse,'accepted'|'message'>>(),posts:EstateCommand[]=[],responses:EstateResponse[]=[];
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(_input,init)=>{
  if(init?.method!=='POST'){if(failGet){failGet=false;throw new Error('TEST initial connection failed');}return Response.json(estateSnapshot(estate,Date.now()));}
  const c=JSON.parse(String(init.body)) as EstateCommand;posts.push(c);
  if(c.type==='enter'&&options.holdEnter)await new Promise<void>(resolve=>{releaseEnter=resolve;});
  let receipt=receipts.get(c.id);const duplicate=!!receipt;
  if(!receipt){const result=commandEstate(estate,c,Date.now());estate=result.state;receipt={accepted:result.accepted,message:result.message};receipts.set(c.id,receipt);}
  const result={...receipt,duplicate,snapshot:estateSnapshot(estate,Date.now())};responses.push(result);
  if(c.type==='feed'&&loseFeed){loseFeed=false;throw new Error('TEST feed response lost');}
  if(c.type==='resetProfile'&&loseReset){loseReset=false;throw new Error('TEST reset response lost');}
  if(c.type==='finishTutorial'&&lose){lose=false;throw new Error('TEST response lost after saved finish');}
  return Response.json(result);
 };
 bridge.callbacks=undefined;bridge.latest=undefined;
 const {createRoot}=await import('react-dom/client');const {default:EstateApp}=await import('../src/v5/EstateApp.tsx');
 const root=createRoot(browser.document.getElementById('root') as unknown as Element);
 await act(async()=>{root.render(createElement(EstateApp));});
 if(!options.failInitialGet)await until(()=>!!bridge.callbacks,'World callbacks connected');
 return {browser,posts,responses,get profile(){return currentProfile(estate);},releaseEnter:async()=>{await act(async()=>releaseEnter?.());},
  move:async(to:GridPoint)=>{await act(async()=>bridge.callbacks!.destination(to));},
  close:async()=>{await act(async()=>root.unmount());globalThis.fetch=originalFetch;await browser.happyDOM.close();for(const [key,value] of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
 };
}

test('restoring the completed opening automatically unlocks the scene without opening a blocking card',async()=>{
 const h=await mount();try{
  await until(()=>h.profile.tutorial==='done','completed opening must finish without another confirmation');
  await until(()=>!h.browser.document.querySelector('[data-opening-stage]'),'blocking opening removed');
  assert.equal(h.posts.filter(c=>c.type==='finishTutorial').length,1);
  assert.equal(h.browser.document.querySelector('[role="dialog"]'),null);
  assert.equal(h.browser.document.querySelector('[aria-label="首页"]')?.hasAttribute('inert'),false);
  await h.move({x:6,z:7});await until(()=>h.posts.some(c=>c.type==='move'),'ground click submitted');
  assert.equal(h.responses.at(-1)?.accepted,true);assert.deepEqual(h.profile.path,[{x:6,z:7}]);
 }finally{await h.close();}
});

test('the automatic opening handshake waits for entry and reuses its saved request after response loss',async()=>{
 const h=await mount({holdEnter:true,loseFinish:true});try{
  assert.equal(h.posts.some(c=>c.type==='finishTutorial'),false,'cannot finish with the pre-entry session');
  await h.releaseEnter();
  await until(()=>h.browser.document.body.textContent.includes('TEST response lost'),'retry state visible');
  const finish=h.posts.find(c=>c.type==='finishTutorial');assert.ok(finish);
  await act(async()=>{const button=h.browser.document.querySelector('.opening-error button') as unknown as HTMLButtonElement;assert.ok(button);button.click();});
  await until(()=>!h.browser.document.querySelector('[data-opening-stage]'),'retry unlocks saved opening');
  const attempts=h.posts.filter(c=>c.type==='finishTutorial');assert.equal(attempts.length,2);assert.equal(attempts[0].id,attempts[1].id);
  assert.equal(h.browser.document.querySelector('[role="dialog"]'),null,'automatic retry retains silent completion intent');
  assert.equal(h.profile.inventory.hand,3);assert.equal(h.profile.materials,60);
 }finally{await h.close();}
});

test('a ground click queued during enter uses the replacement session when dispatched',async()=>{
 const h=await mount({stage:'done',holdEnter:true});try{
  await h.move({x:6,z:7});assert.equal(h.posts.some(c=>c.type==='move'),false);
  await h.releaseEnter();await until(()=>h.posts.some(c=>c.type==='move'),'queued click dispatched');
  const move=h.posts.find(c=>c.type==='move')!;assert.equal(move.session,h.profile.session);
  assert.equal(h.responses.at(-1)?.accepted,true);assert.deepEqual(h.profile.path,[{x:6,z:7}]);
 }finally{await h.close();}
});

test('the handshake never skips an unfinished opening or wolf retreat',async()=>{
 for(const stage of ['retreat','choose'] as const){const h=await mount({stage});try{
  await act(async()=>{await delay(240);});assert.equal(h.posts.some(c=>c.type==='finishTutorial'),false,stage);
  assert.notEqual(h.profile.tutorial,'done');assert.ok(h.browser.document.querySelector('[data-opening-stage]'));
 }finally{await h.close();}}
});

test('a rejected destination is visible on the home screen without turning it into a save failure',async()=>{
 const h=await mount({stage:'done'});try{
  await h.move({x:-100,z:-100});await until(()=>h.posts.some(c=>c.type==='move'),'invalid click submitted');
  const reason=h.responses.at(-1)?.message;assert.equal(h.responses.at(-1)?.accepted,false);assert.ok(reason);
  assert.ok(h.browser.document.querySelector('.creator-caption')?.textContent.includes(reason));
  assert.equal(!!h.browser.document.querySelector('.farm-toast button'),false,'a rule rejection has no uncertain-save retry');
  await h.move({x:6,z:7});await until(()=>h.profile.path.length>0,'a new legal click still works');
 }finally{await h.close();}
});

test('restoring a feed to a non-first animal retains the target until the player explicitly changes it',async()=>{
 const h=await mount({stage:'done',feeding:'momo'});try{
  await until(()=>h.posts.filter(c=>c.type==='pulse').length>=2,'online pulses resumed');
  assert.equal(h.profile.job?.target,'momo','reload must not cancel a saved feed because selection defaulted to pipi');
  assert.equal(h.posts.some(c=>c.type==='cancel'),false);
  await act(async()=>bridge.callbacks!.select('pipi'));
  await until(()=>h.profile.job===null,'explicit target change still cancels feed');
  assert.equal(h.profile.inventory.hand,3);
 }finally{await h.close();}
});

test('the first connection retry enters a session before starting the opening',async()=>{
 const h=await mount({stage:'choose',failInitialGet:true});try{
  assert.ok(h.browser.document.body.textContent.includes('TEST initial connection failed'));
  await act(async()=>{const retry=h.browser.document.querySelector('.farm-loading button') as unknown as HTMLButtonElement;assert.ok(retry);retry.click();});
  await until(()=>h.posts.some(c=>c.type==='enter'),'reconnection enters session');
  assert.notEqual(h.profile.session,'prior-session');
  await until(()=>h.posts.some(c=>c.type==='pulse'),'opening ticks after reconnection');
  assert.equal(h.responses.every(r=>r.accepted),true);
 }finally{await h.close();}
});

test('switching from settings to a fresh lab closes the old sheet so its opening can advance',async()=>{
 const h=await mount({stage:'done'});try{
  await act(async()=>{(h.browser.document.querySelector('[aria-label="庄园设置"]') as unknown as HTMLButtonElement).click();});
  await until(()=>!!h.browser.document.querySelector('[role="dialog"]'),'settings visible');
  await act(async()=>{const button=[...h.browser.document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.includes('独立演示档')) as unknown as HTMLButtonElement;assert.ok(button);button.click();});
  await until(()=>h.profile.id==='lab','lab profile selected');
  assert.equal(!!h.browser.document.querySelector('[role="dialog"]'),false,'old settings must not remain under the opening');
  await until(()=>h.posts.some(c=>c.type==='pulse'&&c.session===h.profile.session),'lab pulse sent');
  const pulse=h.posts.find(c=>c.type==='pulse'&&c.session===h.profile.session)!;
  assert.equal(pulse.presentationCovered,false);assert.ok(h.profile.opening!.elapsed>0);
 }finally{await h.close();}
});

test('changing the action target retains the action drawer and sends the chosen animal ID',async()=>{
 const h=await mount({stage:'done'});try{
  await act(async()=>{(h.browser.document.querySelector('[aria-label="打开互动菜单"]') as unknown as HTMLButtonElement).click();});
  await until(()=>!!h.browser.document.querySelector('.farm-targets'),'actions opened');
  await act(async()=>{const button=[...h.browser.document.querySelectorAll('.farm-targets button')].find(b=>b.textContent.includes('茉茉')) as unknown as HTMLButtonElement;assert.ok(button);button.click();});
  assert.equal(!!h.browser.document.querySelector('.farm-action-grid'),true,'target choice must retain all actions');
  assert.equal(!!h.browser.document.querySelector('[data-resident-id]'),false,'target choice is not an animal-card inspection');
  await act(async()=>{const dance=[...h.browser.document.querySelectorAll('.farm-action-grid button')].find(b=>b.textContent.includes('跳舞')) as unknown as HTMLButtonElement;assert.ok(dance);dance.click();});
  await until(()=>h.posts.some(c=>c.type==='play'),'action sent');
  assert.equal(h.posts.find(c=>c.type==='play')?.target,'momo');
  await act(async()=>bridge.callbacks!.select('pipi'));
  assert.ok(h.browser.document.querySelector('[data-resident-id="pipi"]'),'scene animal click still opens its own card');
 }finally{await h.close();}
});

test('reset asks for confirmation, cancel preserves state, and confirm starts exactly one fresh opening',async()=>{
 const h=await mount({stage:'done'});try{
  const doc=h.browser.document;
  await act(async()=>{(doc.querySelector('[aria-label="庄园设置"]') as unknown as HTMLButtonElement).click();});
  const openReset=()=>{const b=doc.querySelector('[data-command="request-reset"]') as unknown as HTMLButtonElement;assert.ok(b,'settings exposes reset');b.click();};
  await act(async()=>openReset());
  assert.ok(doc.querySelector('[data-reset-confirmation="home"]'),'clearly identifies current profile');
  assert.equal(h.posts.some(c=>c.type==='resetProfile'),false);
  await act(async()=>{(doc.querySelector('[data-command="cancel-reset"]') as unknown as HTMLButtonElement).click();});
  assert.equal(h.profile.tutorial,'done');assert.equal(h.posts.some(c=>c.type==='resetProfile'),false);
  await act(async()=>openReset());
  await act(async()=>{const b=doc.querySelector('[data-command="confirm-reset"]') as unknown as HTMLButtonElement;b.click();b.click();});
  await until(()=>h.posts.some(c=>c.type==='resetProfile'),'reset sent');
  assert.equal(h.posts.filter(c=>c.type==='resetProfile').length,1);
  await until(()=>!!doc.querySelector('[data-opening-stage="establish"]'),'fresh opening visible');
  assert.equal(doc.querySelector('[data-reset-confirmation]'),null);
  assert.equal(h.profile.tutorial,'choose');assert.equal(h.profile.inventory.hand,3);
  assert.equal(h.profile.events.length,0);assert.ok(h.profile.animals.every(a=>a.life.bond===0&&a.life.memory.length===0));
 }finally{await h.close();}
});

for(const phase of ['choose','retreat'] as const)test(`opening ${phase} can request a restart and cancel returns to the same opening`,async()=>{
 const h=await mount({stage:phase});try{
  const doc=h.browser.document,stage=h.profile.opening!.stage;
  await act(async()=>{const b=doc.querySelector('[data-opening-action="reset"]') as unknown as HTMLButtonElement;assert.ok(b);b.click();});
  assert.ok(doc.querySelector('[data-reset-confirmation="home"]'));
  await act(async()=>{(doc.querySelector('[data-command="cancel-reset"]') as unknown as HTMLButtonElement).click();});
  assert.equal(h.posts.some(c=>c.type==='resetProfile'),false);assert.equal(h.profile.opening!.stage,stage);
  assert.ok(doc.querySelector('[data-opening-stage]'));
 }finally{await h.close();}
});


test('a lost reset response keeps confirmation and retries the same command once',async()=>{
 const h=await mount({stage:'done',loseReset:true});try{
  const doc=h.browser.document;
  await act(async()=>{(doc.querySelector('[aria-label="庄园设置"]') as unknown as HTMLButtonElement).click();});
  await act(async()=>{(doc.querySelector('[data-command="request-reset"]') as unknown as HTMLButtonElement).click();});
  await act(async()=>{(doc.querySelector('[data-command="confirm-reset"]') as unknown as HTMLButtonElement).click();});
  await until(()=>doc.body.textContent.includes('TEST reset response lost'),'lost result remains retryable');
  assert.equal(h.profile.tutorial,'choose');assert.ok(doc.querySelector('[data-reset-confirmation]'));
  await act(async()=>{(doc.querySelector('.farm-sheet-error button') as unknown as HTMLButtonElement).click();});
  await until(()=>!!doc.querySelector('[data-opening-stage="establish"]'),'retry closes reset and shows opening');
  const requests=h.posts.filter(c=>c.type==='resetProfile');assert.equal(requests.length,2);assert.deepEqual(requests[1],requests[0]);
  assert.equal(h.profile.runId,requests[0].id);assert.equal(doc.querySelector('[data-reset-confirmation]'),null);
 }finally{await h.close();}
});

test('the first sound-button gesture starts music instead of immediately muting it',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
 class Param{value=0;setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}setTargetAtTime(){}}
 class AudioNode{gain=new Param();frequency=new Param();Q=new Param();onended:unknown=null;connect(){}disconnect(){}start(){}stop(){}}
 class Context{state='suspended';currentTime=0;destination=new AudioNode();createGain(){return new AudioNode();}createOscillator(){return new AudioNode();}createBiquadFilter(){return new AudioNode();}async resume(){this.state='running';}async close(){this.state='closed';}}
 Object.defineProperty(globalThis,'AudioContext',{value:Context,configurable:true});const h=await mount({stage:'done'});
 try{const button=h.browser.document.querySelector('.estate-sound')!;assert.match(button.textContent,/听音乐/);
  await act(async()=>{button.dispatchEvent(new h.browser.PointerEvent('pointerdown',{bubbles:true}));});
  await act(async()=>{(button as unknown as HTMLButtonElement).click();});
  assert.equal(button.getAttribute('aria-pressed'),'true','first sound interaction enables music');assert.equal(button.getAttribute('aria-label'),'关闭音乐与音效');
  await act(async()=>{button.dispatchEvent(new h.browser.PointerEvent('pointerdown',{bubbles:true}));(button as unknown as HTMLButtonElement).click();});assert.equal(button.getAttribute('aria-pressed'),'false');
 }finally{await h.close();if(previous)Object.defineProperty(globalThis,'AudioContext',previous);else Reflect.deleteProperty(globalThis,'AudioContext');}
});

test('animal care closes only the compact card before sending, retaining target and visible motion',async()=>{
 const h=await mount({stage:'done'});try{const doc=h.browser.document,host=doc.querySelector('.farm-world');
  await act(async()=>bridge.callbacks!.select('momo'));await until(()=>!!doc.querySelector('[data-scene-card="animal"]'),'compact card opens');
  assert.equal(doc.querySelector('[aria-label="首页"]')?.hasAttribute('inert'),false);assert.equal(doc.querySelector('.sheet-backdrop'),null);
  await until(()=>!(doc.querySelector('[data-command="feed"]') as unknown as HTMLButtonElement).disabled,'ready to feed');
  await act(async()=>{const button=doc.querySelector('[data-command="feed"]') as unknown as HTMLButtonElement;button.click();button.click();});
  assert.equal(doc.querySelector('[role="dialog"]'),null,'the animation is not covered by its action card');assert.equal(doc.querySelector('.farm-world'),host);assert.equal(h.posts.filter(c=>c.type==='feed').length,1);
  assert.equal(h.profile.job?.target,'momo');await act(async()=>{await delay(260);});assert.equal(h.profile.job?.target,'momo','closing must not change target and cancel the job');
  assert.equal(h.posts.filter(c=>c.type==='pulse').at(-1)?.presentationCovered,false);assert.equal(h.posts.some(c=>c.type==='cancel'),false);
 }finally{await h.close();}
});
test('ground movement dismisses a nonmodal card and materials open simple choices first',async()=>{
 const h=await mount({stage:'done'});try{const doc=h.browser.document;
  await act(async()=>bridge.callbacks!.select('pipi'));await until(()=>!!doc.querySelector('[data-scene-card="animal"]'),'animal card');await h.move({x:6,z:7});assert.equal(doc.querySelector('[role="dialog"]'),null);assert.equal(h.responses.at(-1)?.accepted,true);
  await act(async()=>{(doc.querySelector('.farm-target-pill') as unknown as HTMLButtonElement).click();});await until(()=>!!doc.querySelector('[data-quick-build-panel]'),'simple material choices');assert.equal(doc.querySelector('.estate-map'),null);assert.equal(doc.querySelector('[aria-label="首页"]')?.hasAttribute('inert'),false);
  await act(async()=>{(doc.querySelector('[data-quick-planner]') as unknown as HTMLButtonElement).click();});await until(()=>!!doc.querySelector('.estate-map'),'advanced grid requires explicit choice');assert.equal(doc.querySelector('[aria-label="首页"]')?.hasAttribute('inert'),true);
 }finally{await h.close();}
});


test('a lost feed result stays retryable after the compact card closes and reopens',async()=>{
 const h=await mount({stage:'done',loseFeed:true});try{const doc=h.browser.document;
  await act(async()=>bridge.callbacks!.select('momo'));
  await act(async()=>{(doc.querySelector('[data-command="feed"]') as unknown as HTMLButtonElement).click();});
  await until(()=>doc.body.textContent.includes('TEST feed response lost'),'failed result stays visible');
  assert.equal(!!doc.querySelector('[role="dialog"]'),false);assert.equal(h.profile.job?.target,'momo');
  await act(async()=>bridge.callbacks!.select('momo'));
  assert.ok(doc.querySelector('[data-scene-card="animal"]'));assert.ok(doc.querySelector('.farm-toast button'));
  assert.equal((doc.querySelector('[data-command="feed"]') as unknown as HTMLButtonElement).disabled,true);
  await act(async()=>{(doc.querySelector('.farm-toast button') as unknown as HTMLButtonElement).click();});
  const requests=h.posts.filter(c=>c.type==='feed');assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
  assert.equal(h.profile.inventory.hand,3);assert.equal(h.profile.job?.target,'momo');assert.equal(!!doc.querySelector('.farm-toast button'),false);
  const more=doc.querySelector('.compact-more') as unknown as HTMLButtonElement;more.focus();
  await act(async()=>{await delay(260);});assert.equal(Object.is(doc.activeElement,more),true,'quiet updates must not steal focus inside the card');
 }finally{await h.close();}
});

test('drag placement proposals reach the chosen building without submitting movement until confirm',async()=>{
 const h=await mount({stage:'done'});try{const doc=h.browser.document;
  await act(async()=>{(doc.querySelector('.farm-target-pill') as unknown as HTMLButtonElement).click();});
  await act(async()=>{(doc.querySelector('[data-quick-kind="tower"]') as unknown as HTMLButtonElement).click();});
  assert.ok(bridge.callbacks?.place,'world must receive placement callback');
  const before=h.posts.length;await act(async()=>bridge.callbacks!.place!({x:9,z:5}));
  assert.equal(h.posts.slice(before).some(c=>c.type==='move'||c.type==='layout'),false,'dragging is only a preview');
  await until(()=>!(doc.querySelector('[data-command="quick-build-confirm"]') as unknown as HTMLButtonElement)?.disabled,'legal drag confirmation');
  await act(async()=>{(doc.querySelector('[data-command="quick-build-confirm"]') as unknown as HTMLButtonElement).click();});
  await until(()=>h.posts.some(c=>c.type==='layout'),'placed layout request');const request=h.posts.find(c=>c.type==='layout')!;assert.equal((request.edit as {x:number}).x,9);assert.equal((request.edit as {z:number}).z,5);
 }finally{await h.close();}
});

test('a natural-event rescue command uncovers the scene so the rescue actually advances',async()=>{
 const h=await mount({stage:'done',lostNatural:true});try{const doc=h.browser.document;
  await act(async()=>bridge.callbacks!.select('guardian'));await until(()=>!!doc.querySelector('[role="dialog"]'),'guardian open');
  const find=()=>[...doc.querySelectorAll('button')].find(b=>b.textContent==='免费找回');await until(()=>!!find()&&!find()!.disabled,'find-back ready');
  await act(async()=>find()!.click());assert.equal(!!doc.querySelector('[role="dialog"]'),false,'rescue must uncover paused world');
  await until(()=>h.posts.some(c=>c.type==='pulse'&&c.presentationCovered===false),'uncovered pulse');
  await until(()=>h.profile.threat?.actors[0].status!=='lost','real rescue begins');assert.ok(h.posts.some(c=>c.type==='rescue'&&c.findBack===true));
 }finally{await h.close();}
});
