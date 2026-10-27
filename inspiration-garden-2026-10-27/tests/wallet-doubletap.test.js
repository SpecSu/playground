import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletDoubleTapController} from '../src/wallet-doubletap.js';

function harness(options={}){
 let at=1000,nextId=1;const timers=new Map(),singles=[],doubles=[];
 const controller=createWalletDoubleTapController({
  onSingleTap:event=>singles.push(event),onDoubleTap:event=>doubles.push(event),
  now:()=>at,setTimer:(fn,delay)=>{const id=nextId++;timers.set(id,{fn,at:at+delay});return id;},clearTimer:id=>timers.delete(id),...options,
 });
 function advance(ms){const end=at+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;at=next[1].at;timers.delete(next[0]);next[1].fn();}at=end;}
 const event=(extra={})=>({button:0,detail:1,clientX:20,clientY:20,timeStamp:at,...extra});
 return {controller,advance,event,singles,doubles,timers};
}

test('a single click waits for a possible second click and never replenishes coins',()=>{
 const h=harness(),event=h.event();h.controller.handleClick(event);
 assert.deepEqual(h.singles,[]);assert.deepEqual(h.doubles,[]);
 h.advance(400);assert.deepEqual(h.singles,[event]);assert.deepEqual(h.doubles,[]);
});

test('each independent click pair replenishes once without a reward cooldown',()=>{
 const h=harness();
 for(let pair=0;pair<3;pair++){
  h.controller.handleClick(h.event({detail:pair*2+1}));h.advance(80);
  h.controller.handleClick(h.event({detail:pair*2+2}));
  h.controller.handleDoubleClick(h.event({detail:pair*2+2}));h.advance(80);
 }
 assert.equal(h.doubles.length,3);h.advance(500);assert.equal(h.singles.length,0);
});

function pointer(h,type='touch',id=1,extra={}){
 return h.event({pointerType:type,pointerId:id,isPrimary:true,buttons:1,...extra});
}
function tapPointer(h,type='touch',id=1,extra={}){
 const down=pointer(h,type,id,extra);h.controller.handlePointerDown(down);h.advance(35);
 const up=pointer(h,type,id,{...extra,buttons:0});h.controller.handlePointerUp(up);return up;
}

for(const type of ['mouse','touch','pen'])test(`${type} pointer pairs trigger immediately once, not again for their click/dblclick aliases`,()=>{
 const h=harness();let last;
 for(let i=0;i<4;i++){
  last=tapPointer(h,type,i+1);h.controller.handleClick(h.event({detail:i+1,pointerType:type}));
  if(i%2)h.controller.handleDoubleClick(h.event({detail:i+1}));
  h.advance(60);
 }
 assert.equal(h.doubles.length,2);assert.equal(h.doubles[1],last);
 h.advance(500);assert.equal(h.singles.length,0);
});

test('the first single stays pending while a timely second pointer is held',()=>{
 const h=harness();tapPointer(h);h.advance(330);
 h.controller.handlePointerDown(pointer(h));h.advance(80);
 assert.equal(h.singles.length,0);
 h.controller.handlePointerUp(pointer(h,'touch',1,{buttons:0}));
 assert.equal(h.doubles.length,1);h.advance(500);assert.equal(h.singles.length,0);
});

test('a tap too late or too far away cannot form a pair',()=>{
 const h=harness();tapPointer(h);h.advance(450);tapPointer(h);h.advance(80);
 tapPointer(h,'touch',1,{clientX:80});h.advance(500);
 assert.equal(h.doubles.length,0);assert.equal(h.singles.length,3);
});

for(const finish of ['move','up','cancel'])test(`a second contact rejected on ${finish} cannot replenish or leak a click`,()=>{
 const h=harness();tapPointer(h);h.advance(80);h.controller.handlePointerDown(pointer(h));
 if(finish==='move'){
  h.controller.handlePointerMove(pointer(h,'touch',1,{clientX:80}));
  h.controller.handlePointerUp(pointer(h,'touch',1,{buttons:0}));
 }else if(finish==='up')h.controller.handlePointerUp(pointer(h,'touch',1,{clientX:80,buttons:0}));
 else h.controller.handlePointerCancel(pointer(h));
 h.controller.handleClick(h.event());h.advance(500);
 assert.equal(h.doubles.length,0);assert.equal(h.singles.length,0);
});

test('multiple simultaneous contacts invalidate the whole sequence until all are released',()=>{
 const h=harness();tapPointer(h);h.advance(80);
 h.controller.handlePointerDown(pointer(h,'touch',1));h.controller.handlePointerDown(pointer(h,'touch',2,{isPrimary:false}));
 h.controller.handlePointerUp(pointer(h,'touch',2,{isPrimary:false,buttons:0}));h.controller.handlePointerUp(pointer(h,'touch',1,{buttons:0}));
 h.controller.handleClick(h.event());h.advance(500);
 assert.equal(h.doubles.length,0);assert.equal(h.singles.length,0);
 tapPointer(h);h.advance(70);tapPointer(h);assert.equal(h.doubles.length,1);
});

test('replayed click and pointer events cannot fabricate a second intent',()=>{
 const h=harness(),click=h.event();h.controller.handleClick(click);h.controller.handleClick(click);
 assert.equal(h.doubles.length,0);h.advance(500);assert.equal(h.singles.length,1);
 const down=pointer(h);h.controller.handlePointerDown(down);h.controller.handlePointerDown(down);h.advance(30);
 const up=pointer(h,'touch',1,{buttons:0});h.controller.handlePointerUp(up);h.controller.handlePointerUp(up);
 assert.equal(h.doubles.length,0);h.advance(500);assert.equal(h.singles.length,2);
});

test('nonprimary, secondary-button and held contacts cannot replenish coins',()=>{
 const h=harness();
 tapPointer(h,'mouse',1,{button:2});h.advance(60);tapPointer(h,'mouse',1,{button:2});
 tapPointer(h,'touch',1,{isPrimary:false});h.advance(60);tapPointer(h,'touch',1,{isPrimary:false});
 h.advance(500);assert.equal(h.doubles.length,0);assert.equal(h.singles.length,0);
 h.controller.handlePointerDown(pointer(h));h.advance(700);h.controller.handlePointerUp(pointer(h,'touch',1,{buttons:0}));
 h.advance(50);tapPointer(h);assert.equal(h.doubles.length,0);
});

test('readiness is checked at both gesture and delayed single callback boundaries',()=>{
 let ready=true;const h=harness({isReady:()=>ready});
 h.controller.handleClick(h.event());ready=false;h.advance(500);assert.equal(h.singles.length,0);
 ready=true;tapPointer(h);h.advance(60);ready=false;tapPointer(h);ready=true;h.advance(80);tapPointer(h);
 assert.equal(h.doubles.length,0);
 h.advance(500);assert.equal(h.singles.length,1);
 ready=false;h.controller.handleClick(h.event());h.advance(80);h.controller.handleClick(h.event());
 h.advance(500);assert.equal(h.doubles.length,0);assert.equal(h.singles.length,1);
});

test('cancelPending drops hidden-page timers and orphan event tails without disabling future pairs',()=>{
 const h=harness();tapPointer(h);h.advance(60);h.controller.cancelPending();
 h.controller.handlePointerUp(pointer(h,'touch',1,{buttons:0}));h.controller.handleClick(h.event());h.controller.handleDoubleClick(h.event({detail:2}));
 h.advance(500);assert.equal(h.singles.length,0);assert.equal(h.doubles.length,0);assert.equal(h.timers.size,0);
 tapPointer(h);h.advance(60);tapPointer(h);assert.equal(h.doubles.length,1);
});

test('dispose cancels timers and permanently disables every entry point',()=>{
 const h=harness();h.controller.handleClick(h.event());h.controller.dispose();h.controller.dispose();
 h.advance(500);tapPointer(h);h.advance(60);tapPointer(h);h.controller.handleClick(h.event());h.controller.handleDoubleClick(h.event({detail:2}));h.advance(500);
 assert.equal(h.singles.length,0);assert.equal(h.doubles.length,0);assert.equal(h.timers.size,0);
});

test('keyboard or assistive activation remains a single action, not a coin-replenishment shortcut',()=>{
 const h=harness();h.controller.handleClick(h.event({detail:0,pointerType:'',pointerId:-1,isPrimary:false}));h.advance(70);h.controller.handleClick(h.event({detail:0,pointerType:'',pointerId:-1,isPrimary:false}));
 assert.equal(h.singles.length,2);assert.equal(h.doubles.length,0);
});

test('the controller does not prevent browser defaults or consume propagation',()=>{
 const h=harness(),extra={preventDefault(){assert.fail('must preserve browser defaults');},stopPropagation(){assert.fail('must preserve propagation');}};
 tapPointer(h,'touch',1,extra);h.advance(60);tapPointer(h,'touch',1,extra);
 h.controller.handleClick(h.event(extra));h.controller.handleDoubleClick(h.event(extra));
 assert.equal(h.doubles.length,1);
});

test('an unready click clears the earlier candidate rather than pairing across a blocked interval',()=>{
 let ready=true;const h=harness({isReady:()=>ready});h.controller.handleClick(h.event());h.advance(70);
 ready=false;h.controller.handleClick(h.event());ready=true;h.advance(70);h.controller.handleClick(h.event());
 assert.equal(h.doubles.length,0);h.advance(500);assert.equal(h.singles.length,1);
});

test('a duplicate event copied by an adapter is still one click intent',()=>{
 const h=harness(),click=h.event();h.controller.handleClick(click);h.controller.handleClick({...click});
 assert.equal(h.doubles.length,0);h.advance(500);assert.equal(h.singles.length,1);
});

test('a canceled timer delivered late cannot consume a newer pending single',()=>{
 const h=harness();h.controller.handleClick(h.event());const oldTimer=[...h.timers.values()][0].fn;
 h.controller.cancelPending();h.advance(80);h.controller.handleClick(h.event());oldTimer();
 assert.equal(h.singles.length,0);h.advance(80);h.controller.handleClick(h.event());
 assert.equal(h.doubles.length,1);h.advance(500);assert.equal(h.singles.length,0);
});

test('a single callback that closes the ready gate cannot leave a new pending candidate',()=>{
 let ready=true;const h=harness({isReady:()=>ready,onSingleTap:()=>{ready=false;}});
 h.controller.handleClick(h.event());h.advance(70);h.controller.handleClick(h.event({clientX:100}));
 assert.equal(h.timers.size,0);ready=true;h.advance(70);h.controller.handleClick(h.event({clientX:100}));
 assert.equal(h.doubles.length,0);
});

for(const id of [1,2])test(`a copied pointerup cannot erase the first tap or newer contact ${id}`,()=>{
 const h=harness(),first=tapPointer(h);h.controller.handlePointerUp({...first});h.advance(60);
 h.controller.handlePointerDown(pointer(h,'touch',id));h.controller.handlePointerUp({...first});h.advance(35);
 h.controller.handlePointerUp(pointer(h,'touch',id,{buttons:0}));
 assert.equal(h.doubles.length,1);h.advance(500);assert.equal(h.singles.length,0);
});

for(const pointerType of ['touch',undefined])test(`late ${pointerType??'legacy mouse'} click aliases cannot reward again after a pointer pair`,()=>{
 const h=harness();tapPointer(h,'touch',1);h.advance(60);tapPointer(h,'touch',2);
 assert.equal(h.doubles.length,1);h.advance(500);
 h.controller.handleClick(h.event({detail:1,pointerType,pointerId:1}));h.advance(25);
 h.controller.handleClick(h.event({detail:2,pointerType,pointerId:2}));h.controller.handleDoubleClick(h.event({detail:2}));
 assert.equal(h.doubles.length,1);h.advance(500);assert.equal(h.singles.length,0);
 tapPointer(h,'touch',3);h.advance(60);tapPointer(h,'touch',4);
 assert.equal(h.doubles.length,2);
});

test('canceling a pointer sequence never reclassifies its late click tails as fresh intent',()=>{
 const h=harness();tapPointer(h);h.controller.cancelPending();h.advance(700);
 h.controller.handleClick(h.event({pointerType:'touch'}));h.advance(50);
 h.controller.handleClick(h.event({pointerType:'touch',detail:2}));h.advance(500);
 assert.equal(h.doubles.length,0);assert.equal(h.singles.length,0);
});

test('pointer events observed while unready still identify late click aliases after readiness returns',()=>{
 let ready=false;const h=harness({isReady:()=>ready});tapPointer(h);h.advance(60);tapPointer(h);
 ready=true;h.advance(700);h.controller.handleClick(h.event({pointerType:'touch'}));h.advance(50);
 h.controller.handleClick(h.event({pointerType:'touch',detail:2}));h.advance(500);
 assert.equal(h.doubles.length,0);assert.equal(h.singles.length,0);
 h.controller.handleClick(h.event({detail:0,pointerType:'',pointerId:-1,isPrimary:false}));assert.equal(h.singles.length,1);
 tapPointer(h);h.advance(60);tapPointer(h);assert.equal(h.doubles.length,1);
});
