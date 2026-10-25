import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import * as lagoon from '../lib/art/lagoon.js';
import {SHARED_CELL_SIZE,SEA_SURFACE_Y} from '../lib/art/physical-contract.js';
import {createShoreField} from '../lib/art/shore-field.js';

test('water patterns use an absolute 1.5 ruler from v26, not a compounded scale',()=>{
 assert.equal(lagoon.WATER_PATTERN_SCALE,1.5);
 for(const frequency of[2.3,3.7,6.8,11,12,3.5,4.8,7,14,.20,.12])assert.ok(Math.abs(frequency*SHARED_CELL_SIZE/lagoon.WATER_PATTERN_SCALE-frequency*SHARED_CELL_SIZE/1.5)<1e-12);
 const source=readFileSync(new URL('../lib/art/lagoon.js',import.meta.url),'utf8');
 assert.match(source,/waveHeight\(w\.xz\/uPatternScale,uTime\)\*\.34/);assert.doesNotMatch(source,/uTime\s*\/\s*uPatternScale/);
});
test('actual shader scales procedural coordinates and foam widths, while world masks and render matrices remain world anchored',()=>{
 const scene=new T.Scene(),c=new T.OrthographicCamera(-5,5,8,-8,.1,100);c.position.set(8,10,15);c.lookAt(0,0,0);c.updateMatrixWorld();let target=null,shading=null;
 const renderer={toneMapping:T.NeutralToneMapping,clippingPlanes:[],shadowMap:{autoUpdate:true,needsUpdate:false},getRenderTarget:()=>target,setRenderTarget:t=>target=t,render(s){const found=s.children.find(n=>n.material?.uniforms?.uPatternScale&&n.material?.fragmentShader.includes('vec3 extinction'));if(found)shading=found.material;}};
 const shore=createShoreField([{x:8,z:-2},{x:9,z:-2}],[{x:8,z:-3}]),w=lagoon.createLagoon(scene,renderer,c,{height:SEA_SURFACE_Y,shoreTexture:shore.texture});w.setShore(shore);w.render(42);
 assert.equal(shading.uniforms.uPatternScale.value,1.5);assert.equal(shading.uniforms.uTime.value,42);assert.equal(w.surface.position.y,SEA_SURFACE_Y);
 assert.match(shading.fragmentShader,/vec2 worldP=vWorld\.xz;vec2 p=worldP\/uPatternScale/);
 assert.match(shading.fragmentShader,/\(worldP-uBoatMask\.xy\)/);assert.match(shading.fragmentShader,/\(worldP-uShoreBounds\.xy\)/);assert.match(shading.fragmentShader,/\*uShoreScale\/uPatternScale/);
 assert.match(shading.fragmentShader,/uReflectionMatrix\*vec4\(vWorld,1\.\)/);assert.match(shading.fragmentShader,/uWaterHeight-bottom\.y/);
 w.dispose();shore.texture.dispose();
});
