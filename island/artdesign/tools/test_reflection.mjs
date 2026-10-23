// Rendering cadence regression: use the real water render orchestration with a GPU-free renderer.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier==='three')return {url:new URL('../scene-lab/vendor/three.module.js',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
const T=await import('../scene-lab/vendor/three.module.js');
const {createLagoon}=await import('../scene-lab/src/lagoon.js');
let clock=1000,target=null,reflections=0;
Object.defineProperty(globalThis,'performance',{value:{now:()=>clock}});
const camera=new T.PerspectiveCamera(32,1,.08,200);camera.position.set(0,8,14);camera.lookAt(0,0,0);
const renderer={shadowMap:{needsUpdate:false},toneMapping:T.NeutralToneMapping,clippingPlanes:[],
  getRenderTarget:()=>target,setRenderTarget:t=>target=t,
  render(scene,view){if(view!==camera)reflections++;this.shadowMap.needsUpdate=false;}};
const water=createLagoon(new T.Scene(),renderer,camera);
for(let frame=0;frame<12;frame++){
  clock+=1000/60;camera.position.x+=.1;camera.lookAt(0,0,0);water.render(clock/1000);
}
assert.equal(reflections,12,'Every moving-camera frame needs a matching reflection, even below the idle interval.');
assert.equal(water.stats.staleMovingFrames,0);
let before=reflections;clock+=1;water.resize(390,844,1.25);water.render(clock/1000);
assert.equal(reflections,before+1,'Resizing clears the target and must force a new reflection.');
before=reflections;clock+=1;water.setDusk(1);water.render(clock/1000);
assert.equal(reflections,before+1,'Lighting changes must invalidate the cached reflection.');
before=reflections;clock+=1;water.render(clock/1000);
assert.equal(reflections,before,'A stationary camera can reuse the reflection between animation updates.');
clock+=40;water.render(clock/1000);assert.equal(reflections,before+1);
assert.equal(target,null);water.dispose();
console.log('PASS: moving-camera reflection per frame, resize/light invalidation, idle reuse, target restoration.');
