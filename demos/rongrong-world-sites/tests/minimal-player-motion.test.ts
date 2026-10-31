import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePlayerMotion,MAX_PLAYER_SPEED,PLAYER_ACCELERATION} from '../src/minimal/player-motion.ts';

test('LX covers one cell in about 2.15 seconds with eased start and exact arrival',()=>{
 assert.equal(MAX_PLAYER_SPEED,.5);
 const point={x:0,z:0},path=[{x:1,z:0}];let speed=0,time=0;const samples:number[]=[];
 while(path.length&&time<5){const previous=speed,result=advancePlayerMotion(point,path,1/60,speed);speed=result.speed;time+=1/60;samples.push(speed);assert.ok(result.distance<=MAX_PLAYER_SPEED/60+1e-9);assert.ok(speed<=MAX_PLAYER_SPEED);if(path.length)assert.ok(Math.abs(speed-previous)<=PLAYER_ACCELERATION/60+1e-9);}
 assert.ok(time>2&&time<2.3,`one-cell walk takes ${time}s`);assert.ok(samples[0]<.08);assert.ok(samples.some(v=>v>=MAX_PLAYER_SPEED-.001));assert.ok(samples.at(-2)!<MAX_PLAYER_SPEED*.4);assert.equal(speed,0);assert.deepEqual(point,{x:1,z:0});
 for(let i=0;i<10;i++)assert.deepEqual(advancePlayerMotion(point,path,.25,speed),{speed:0,distance:0});
});

test('model ticks and render frames share convergence, waypoint traversal and no endpoint teleport',()=>{
 function run(dt:number){const p={x:0,z:0},path=[{x:1,z:0},{x:1,z:1}],speeds:number[]=[];let speed=0;for(let t=0;t<2;t+=dt){const result=advancePlayerMotion(p,path,Math.min(dt,2-t),speed);speed=result.speed;speeds.push(speed);}return {p,path,speed,speeds};}
 const model=run(.25),render=run(1/60);assert.ok(Math.hypot(model.p.x-render.p.x,model.p.z-render.p.z)<.0001);assert.ok(Math.abs(model.speed-render.speed)<.0001);
 const p={x:0,z:0},path=[{x:.02,z:0}];const first=advancePlayerMotion(p,path,1/60);assert.ok(p.x<.002,'nearby taps do not instantly teleport to target');let speed=first.speed;for(let i=0;i<120;i++)speed=advancePlayerMotion(p,path,1/60,speed).speed;assert.deepEqual(p,{x:.02,z:0});assert.equal(speed,0);
});

test('empty/cancelled route stops gait and a new route can restart gently',()=>{
 const p={x:0,z:0};assert.deepEqual(advancePlayerMotion(p,[],.25,.9),{speed:0,distance:0});
 const next=advancePlayerMotion(p,[{x:-1,z:0}],1/60,0);assert.ok(next.speed<.08);assert.ok(p.x<0&&p.x>-.002);
 assert.deepEqual(advancePlayerMotion(p,[],NaN),{speed:0,distance:0});
});
