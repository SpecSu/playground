import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const { FESTIVAL_MONUMENT_RADIUS, FESTIVAL_MOVE_SPEED } = await import('../lib/festival-types.ts');
const subject = async () => {
 assert.ok(existsSync(new URL('../lib/festival-motion.ts', import.meta.url)), 'Festival presentation reconciles movement rather than assigning discontinuous network positions');
 return import('../lib/festival-motion.ts');
};
const route = (patch={}) => ({x:0,z:44,targetX:35,targetZ:44,moveAt:1000,heading:Math.PI/2,...patch});

test('accepted delayed movement never snaps or reverses progress and converges to the server target', async()=>{
 const {stepFestivalMotion}=await subject();
 for(const latency of [150,500,1000]) {
  let state=null,lastX=0;const predicted=route(),authoritative=route({moveAt:1000+latency});
  for(let now=1000;now<=8500;now+=1000/60){
   const source=now<1000+latency*2?predicted:authoritative;
   state=stepFestivalMotion(state,source,now,1/60);
   assert.ok(state.x>=lastX-1e-6,`Forward movement reversed at ${latency}ms latency`);
   assert.ok(Math.hypot(state.x-lastX,state.z-44)<=FESTIVAL_MOVE_SPEED/60*1.5+.001,'No response produces a teleport');
   lastX=state.x;
  }
  assert.ok(Math.abs(state.x-35)<1e-5);assert.equal(state.z,44);
 }
});

test('prediction expiry and rejection reconcile at bounded speed without mutating authority',async()=>{
 const {stepFestivalMotion,selectFestivalMovement}=await subject();
 const p={id:'self',...route({targetX:0})},before=structuredClone(p);
 const prediction={actorId:'self',...route(),token:1,expiresAt:2500};
 let state=null;
 for(let now=1000;now<=2400;now+=20)state=stepFestivalMotion(state,selectFestivalMovement(p,prediction,now),now,.02);
 const atExpiry=stepFestivalMotion(state,selectFestivalMovement(p,prediction,2501),2501,.02);
 assert.ok(Math.hypot(atExpiry.x-state.x,atExpiry.z-state.z)<=FESTIVAL_MOVE_SPEED*.02+.001,'Expiry cannot teleport back to the stale server origin');
 for(let now=2520;now<=5000;now+=20)state=stepFestivalMotion(state,p,now,.02);
 assert.ok(Math.abs(state.x)<1e-5,'Rejected prediction eventually returns to authority');
 assert.deepEqual(p,before);
 assert.equal(selectFestivalMovement(p,{...prediction,actorId:'other'},1500),p);
});

test('retargeting keeps continuous gait distance and a predicted stop freezes the displayed point',async()=>{
 const {stepFestivalMotion}=await subject();
 let state=null;
 for(let now=1000;now<=1600;now+=20)state=stepFestivalMotion(state,route(),now,.02);
 const before=state;
 const turn=route({x:state.x,z:state.z,targetX:state.x,targetZ:65,moveAt:1620});
 state=stepFestivalMotion(state,turn,1640,.02);
 assert.ok(state.distance>=before.distance,'Changing movement origin cannot reset walk cycle');
 const stop={...turn,x:state.x,z:state.z,targetX:state.x,targetZ:state.z,moveAt:1640,heading:state.heading};
 const atStop={...state};
 for(let now=1660;now<=2500;now+=20)state=stepFestivalMotion(state,stop,now,.02);
 assert.equal(state.x,atStop.x);assert.equal(state.z,atStop.z);assert.equal(state.distance,atStop.distance);
 assert.ok(state.walkBlend<.001,'Walking settles smoothly after releasing the joystick');
});

test('a long RAF interruption remains bounded and rendered paths never enter the monument',async()=>{
 const {stepFestivalMotion}=await subject();
 const source=route({x:-40,z:0,targetX:40,targetZ:0});
 let state=stepFestivalMotion(null,source,1000,1/60);
 const before=state;
 state=stepFestivalMotion(state,source,5000,4);
 assert.ok(Math.hypot(state.x-before.x,state.z-before.z)<=FESTIVAL_MOVE_SPEED*.05*1.5+.001,'A slow frame cannot jump four seconds of walking');
 for(let now=5020;now<=20000;now+=20){state=stepFestivalMotion(state,source,now,.02);assert.ok(Math.hypot(state.x,state.z)>=FESTIVAL_MONUMENT_RADIUS-1e-6);}
 assert.ok(Math.hypot(state.x-40,state.z)<.01);
});

test('clock samples slew without time reversal or dependency on wall-clock jumps',async()=>{
 const {FestivalClock}=await subject();
 let local=0;const clock=new FestivalClock(()=>local,1000);
 clock.accept(1000,0,0);local=1000;assert.equal(clock.now(),2000);
 clock.accept(1100,0,1000);assert.equal(clock.now(),2000);
 local=1100;assert.ok(clock.now()>=2090&&clock.now()<=2100);
 const before=clock.now();clock.accept(8000,1090,1100);assert.equal(clock.now(),before);
 local=1200;assert.ok(clock.now()-before<=110);
});

test('3x prediction arriving before a one-second authority echo stays put, but cancel and a new target win',async()=>{
 const {stepFestivalMotion}=await subject();
 const predicted=route({targetX:12});let shown=null;
 for(let now=1000;now<=2000;now+=20)shown=stepFestivalMotion(shown,predicted,now,.02);
 assert.equal(shown.x,12,'21 units/sec reaches this target before the delayed echo');
 const arrived=shown,lateEcho=route({targetX:12,moveAt:2000});
 for(let now=2020;now<=2500;now+=20){shown=stepFestivalMotion(shown,lateEcho,now,.02);assert.equal(shown.x,12,'same-target authority must not pull arrival backwards');}
 const cancelled=stepFestivalMotion(arrived,route({targetX:0,moveAt:2000}),2020,.02);
 assert.ok(cancelled.x<12,'a rejected or cancelled prediction still reconciles to authority');
 const retargeted=stepFestivalMotion(arrived,route({x:12,targetX:-12,moveAt:2000}),2020,.02);
 assert.ok(retargeted.x<12,'a genuinely newer destination wins over the arrival guard');
});
