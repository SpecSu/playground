import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRodStationArt} from '../lib/art/dock.js';
import {GROUND_TOP_Y, SEA_SURFACE_Y} from '../lib/art/physical-contract.js';
import {createLagoon} from '../lib/art/lagoon.js';

function parts(art) {
 const rays = art.root.getObjectByName('HookedAttentionRays');
 const fish = art.root.getObjectByName('HookedFishSilhouette');
 assert.ok(rays, 'ready needs comic attention rays');
 assert.ok(fish, 'ready needs an anonymous underwater fish silhouette');
 return {rays, fish};
}
function matrices(root) { root.updateMatrixWorld(true); const result=[]; root.traverse(n=>result.push(n.matrixWorld.toArray())); return result; }

test('only ready shows four intermittent yellow rays and an enduring fish cue', () => {
 const art=createRodStationArt();
 const {rays,fish}=parts(art);
 assert.equal(rays.children.length,4);
 for(const ray of rays.children) assert.ok(ray.material.color.r>.8 && ray.material.color.g>.45 && ray.material.color.b<.2, 'attention is yellow, not species colour');
 for(const state of ['idle','working']) {
  art.pose({state,time:.3}); assert.equal(rays.visible,false); assert.equal(fish.visible,false);
 }
 art.pose({state:'ready',time:.3,readyAge:900});
 assert.equal(rays.visible,true); assert.equal(fish.visible,true);
 art.pose({state:'ready',time:1.7,readyAge:901});
 assert.equal(rays.visible,false,'bursts leave a calm interval'); assert.equal(fish.visible,true);
 art.pose({state:'ready',time:280.3,readyAge:1000});
 assert.equal(rays.visible,true,'uncollected catches keep attracting attention');
 art.pose({state:'idle',time:280.31});
 assert.equal(rays.visible,false); assert.equal(fish.visible,false);
 art.dispose();
});

test('anonymous fish struggles near the float but stays wholly under the actual sea', () => {
 const art=createRodStationArt();art.root.position.y=GROUND_TOP_Y;
 const {fish}=parts(art);
 assert.equal(fish.userData.waterPass,'below');
 assert.equal(fish.userData.speciesId,undefined);
 art.pose({state:'ready',time:.15});const a=fish.position.clone();
 art.pose({state:'ready',time:.55});assert.ok(a.distanceTo(fish.position)>.08,'a visible low-frequency struggle, not a stationary marker');
 for(const direction of [0,Math.PI/2,Math.PI,3*Math.PI/2]) {
  art.root.rotation.y=direction;
  for(const cast of [{reach:1},{reach:.5},{reach:1,overflight:{distance:13,height:5.8}}]) {
   for(const time of [.0,.25,.55,1.5,2.8,99.7]) {
    art.pose({state:'ready',time,...cast});art.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(fish,true);
    assert.ok(bounds.max.y<SEA_SURFACE_Y-.035,'no fish geometry breaks the water surface');
    assert.ok(bounds.min.y>SEA_SURFACE_Y-.5,'silhouette stays near enough to the surface to read');
    const float=art.floatLocal();assert.ok(Math.hypot(fish.position.x-float.x,fish.position.z-float.z)<.6,'cue follows actual open-water cast');
    art.root.traverse(n=>assert.ok(n.matrixWorld.elements.every(Number.isFinite)));
   }
  }
 }
 art.dispose();
});

test('reduced motion retains readable static rays and fish without fluttering', () => {
 const art=createRodStationArt();const {rays,fish}=parts(art);
 art.pose({state:'ready',time:.3,reducedMotion:true});
 const initialRays=matrices(rays),initialFish=matrices(fish);
 assert.equal(rays.visible,true);assert.equal(fish.visible,true);
 for(const time of [1.7,7.9,999]) {
  art.pose({state:'ready',time,reducedMotion:true});
  assert.equal(rays.visible,true);assert.equal(fish.visible,true);
  assert.deepEqual(matrices(rays),initialRays);assert.deepEqual(matrices(fish),initialFish);
 }
 assert.equal(art.root.getObjectByName('HookedWaterSplashes').visible,false);
 art.dispose();
});

test('attention reuses a bounded object pool and does not move the fixed rod root', () => {
 const art=createRodStationArt(),{rays,fish}=parts(art);
 art.pose({state:'ready',time:0});
 const objects=[],geometries=[],materials=[];
 art.root.traverse(n=>{objects.push(n);if(n.isMesh){geometries.push(n.geometry);materials.push(n.material);}});
 assert.ok(rays.children.length+fish.children.length<=9,'small authored pool');
 const rootPosition=art.root.position.clone(),rootScale=art.root.scale.clone();
 for(let i=0;i<600;i++) art.pose({state:i%9===0?'working':'ready',time:i/30});
 const after=[];art.root.traverse(n=>after.push(n));assert.deepEqual(after,objects);
 let mesh=0;art.root.traverse(n=>{if(n.isMesh){assert.equal(n.geometry,geometries[mesh]);assert.equal(n.material,materials[mesh]);mesh++;}});
 assert.ok(art.root.position.equals(rootPosition));assert.ok(art.root.scale.equals(rootScale));
 art.dispose();
});

test('lagoon renders fish only in underwater capture and restores ready visibility', () => {
 const art=createRodStationArt(),{fish}=parts(art);art.pose({state:'ready',time:.3});
 const scene=new THREE.Scene();scene.add(art.root);
 const camera=new THREE.PerspectiveCamera();camera.position.set(8,10,15);camera.lookAt(0,0,0);
 let target=null;const seen=[];
 const renderer={toneMapping:THREE.NeutralToneMapping,clippingPlanes:[],shadowMap:{autoUpdate:true,needsUpdate:false},getRenderTarget:()=>target,setRenderTarget:t=>target=t,render(s){if(s===scene)seen.push(fish.visible);}};
 const water=createLagoon(scene,renderer,camera,{height:SEA_SURFACE_Y});
 water.render(.3);assert.deepEqual(seen,[true,false,false]);assert.equal(fish.visible,true);
 art.pose({state:'working',time:.4});seen.length=0;water.render(.4);
 assert.ok(seen.every(visible=>!visible));assert.equal(fish.visible,false);
 water.dispose();art.dispose();
});
