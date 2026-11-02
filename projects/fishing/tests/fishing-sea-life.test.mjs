import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const load=async()=>{const api=await import('../lib/fishing-sea-life.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return null;throw error;});assert.ok(api,'the lightweight decorative sea-life factory exists');return api;};
const water=(x,z,t,reduced=false)=>-.17+Math.sin(x*.38+z*.14+(reduced?0:t)*.65)*.22;

test('sea dressing prebuilds four boats and a bounded decorative animal pool without textures or hit targets',async()=>{
 const {createFishingSeaLife}=await load(),sea=createFishingSeaLife(water);let meshes=0,triangles=0;const geometries=new Set(),materials=new Set();
 try{assert.equal(sea.boats.length,4);assert.equal(sea.root.getObjectByName('Dolphin pod').children.length,3);
  sea.root.traverse(o=>{assert.ok(!o.isLight&&!o.isSkinnedMesh);if(o.isMesh||o.isLine){meshes++;geometries.add(o.geometry);const p=o.geometry.attributes.position;for(const v of p.array)assert.ok(Number.isFinite(v));if(o.isMesh)triangles+=(o.geometry.index?.count??p.count)/3;assert.equal(o.castShadow,false);assert.equal(o.receiveShadow,false);const hits=[];o.raycast(new THREE.Raycaster(),hits);assert.equal(hits.length,0);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))assert.ok(!value?.isTexture);}}});
  assert.ok(meshes<=40,`${meshes} lightweight draw objects`);assert.ok(triangles<=6500,`${triangles} source triangles`);assert.ok(materials.size<=10);assert.ok(geometries.size<=32);
 }finally{sea.dispose();}
});

test('deterministic quiet cycles reserve whale events every two to three active minutes',async()=>{
 const {sampleFishingSeaLife}=await load(),starts=[];let previous='none',active=0;const kinds=new Set();
 for(let t=0;t<7200;t+=.25){const s=sampleFishingSeaLife(t);assert.deepEqual(s,sampleFishingSeaLife(t));assert.ok(Number.isFinite(s.progress)&&s.progress>=0&&s.progress<=1);if(s.kind!=='none'){active++;kinds.add(s.kind);}if(s.kind==='whale'&&previous!=='whale')starts.push(t);previous=s.kind;}
 assert.deepEqual([...kinds].sort(),['dolphins','shark','whale']);assert.ok(starts[0]<=180);for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=120&&starts[i]-starts[i-1]<=180,'other events cannot delay the reserved whale slot');assert.ok(active/(7200*4)<.25,'most of the sea stays quiet');
 for(const t of [NaN,Infinity,-50])assert.equal(sampleFishingSeaLife(t).kind,'none');
});

test('one animal event is visible at a time and dolphin companions leap with a phase offset',async()=>{
 const {createFishingSeaLife}=await load(),sea=createFishingSeaLife(water);sea.update(0);let podSeen=false,sharkSeen=false,spoutSeen=false,breachSeen=false;
 try{for(let t=0;t<=360;t+=.25){sea.update(t);const events=['Dolphin pod','Shark fin visit','Whale visit'].map(n=>sea.root.getObjectByName(n));assert.ok(events.filter(o=>o.visible).length<=1);sea.root.updateMatrixWorld(true);
  if(sea.state.kind==='dolphins'){podSeen=true;const heights=events[0].children.map(o=>o.position.y);if(sea.state.progress>.2&&sea.state.progress<.8)assert.ok(Math.max(...heights)-Math.min(...heights)>.02,'companions have staggered arcs');}
  if(sea.state.kind==='shark'){sharkSeen=true;assert.equal(events[1].children.length,1,'only the fin surfaces');}
  if(sea.state.kind==='whale'){if(sea.state.stage==='spout')spoutSeen=true;if(sea.state.stage==='breach')breachSeen=true;}
  // A rotated ring's enclosing box contains empty corners near the yacht; test
  // the actual visible geometry, not hidden body meshes or those empty corners.
  const point=new THREE.Vector3();for(const e of events)if(e.visible)e.traverseVisible(o=>{const positions=o.geometry?.attributes.position;if(!positions)return;for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);assert.ok(Math.hypot(point.x,point.z)>10,'visible event geometry stays outside the yacht/cast foreground');}});
 }assert.ok(podSeen&&sharkSeen&&spoutSeen&&breachSeen);}finally{sea.dispose();}
});

test('disabled and reduced-motion scenes do not advance the decorative clock or animate boats',async()=>{
 const {createFishingSeaLife}=await load(),sea=createFishingSeaLife(water);sea.update(100);sea.update(120);assert.equal(sea.state.kind,'dolphins');const age=sea.elapsed;sea.setActive(false);const before=sea.boats.map(b=>b.root.matrix.clone());sea.update(200);assert.equal(sea.elapsed,age);assert.equal(sea.root.visible,false);assert.ok(sea.boats.every((b,i)=>b.root.matrix.equals(before[i])));sea.setActive(true);sea.update(300);assert.equal(sea.elapsed,age,'resuming never catches up a hidden interval');sea.update(301);assert.equal(sea.elapsed,age+1);sea.update(400,true);const still=sea.boats.map(b=>b.root.position.clone());sea.update(900,true);assert.equal(sea.elapsed,age+1);assert.equal(sea.state.kind,'none');assert.ok(sea.boats.every((b,i)=>b.root.position.equals(still[i])));sea.dispose();
});

test('animation only reuses the existing finite geometry and follows the actual sea height',async()=>{
 const {createFishingSeaLife}=await load(),sea=createFishingSeaLife(water),objects=[];sea.root.traverse(o=>objects.push([o,o.geometry,o.material]));sea.update(0);
 for(const t of [1,22,70,130,180,350,7200]){sea.update(t);for(const b of sea.boats)assert.ok(Math.abs(b.root.position.y-water(b.x,b.z,t)-.03)<1e-8);for(const[o,g,m]of objects){assert.equal(o.geometry,g);assert.equal(o.material,m);assert.ok(o.position.toArray().every(Number.isFinite));assert.ok(o.quaternion.toArray().every(Number.isFinite));}}sea.dispose();
});

test('disposing sea dressing releases each owned geometry and material once and detaches it',async()=>{
 const {createFishingSeaLife}=await load(),sea=createFishingSeaLife(water),scene=new THREE.Scene(),resources=new Map();scene.add(sea.root);sea.root.traverse(o=>{if(o.geometry)resources.set(o.geometry,0);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[])resources.set(m,0);});for(const resource of resources.keys())resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));sea.dispose();sea.dispose();sea.update(999);assert.equal(sea.root.parent,null);assert.ok([...resources.values()].every(n=>n===1));
});

test('the complete whale landing rings follow the wave surface instead of being cut by its crests',async()=>{
 const{createFishingSeaLife,sampleFishingSeaLife}=await load(),sea=createFishingSeaLife(water),point=new THREE.Vector3();sea.update(0);let checked=0;
 try{for(let t=0;t<180;t+=.1){sea.update(t);if(sampleFishingSeaLife(t).stage!=='splash')continue;sea.root.updateMatrixWorld(true);for(const name of['Whale landing ripple 1','Whale landing ripple 2']){const ring=sea.root.getObjectByName(name),p=ring.geometry.attributes.position;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(ring.matrixWorld);const gap=point.y-water(point.x,point.z,t);assert.ok(gap>=.025&&gap<=.045,`ring gap ${gap} at ${t}s`);checked++;}}}assert.ok(checked>1000);}finally{sea.dispose();}
});
