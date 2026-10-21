import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const {createYachtWorld}=await import('../lib/fishing-world.ts');

test('water has detailed mipmapped normal data rather than painted crest meshes',()=>{
 const world=createYachtWorld(),material=world.ocean.material,texture=material.normalMap;
 assert.ok(texture?.isDataTexture,'small ripples need a generated normal texture');
 assert.equal(texture.image.width,256);assert.equal(texture.image.height,256);
 assert.equal(texture.wrapS,THREE.RepeatWrapping);assert.equal(texture.wrapT,THREE.RepeatWrapping);
 assert.equal(texture.colorSpace,THREE.NoColorSpace);assert.equal(texture.generateMipmaps,true);
 assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);
 assert.equal(world.scene.getObjectByName('Ocean glints'),undefined);
 assert.equal(world.scene.getObjectByName('Rolling wave crests'),undefined);
 const data=texture.image.data;let low=255,high=0;
 for(let i=0;i<data.length;i+=4){low=Math.min(low,data[i]);high=Math.max(high,data[i]);assert.ok(data[i+2]>180);assert.equal(data[i+3],255);}
 assert.ok(high-low>80,'surface contains varied normal slopes');
 let disposed=false;texture.addEventListener('dispose',()=>{disposed=true;});world.dispose();assert.ok(disposed,'owned GPU texture is released');
});

test('ripple shader advances both drift layers and freezes with reduced motion',()=>{
 const world=createYachtWorld(),material=world.ocean.material;
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
 material.onBeforeCompile(shader,{});
 assert.ok(shader.uniforms.waterTime,'shader has a shared animation clock');
 assert.match(shader.fragmentShader,/waterNormalA/);assert.match(shader.fragmentShader,/waterNormalB/);
 assert.match(shader.fragmentShader,/waterFresnel/);
 world.animate(7);assert.equal(shader.uniforms.waterTime.value,7);
 world.animate(10,true);assert.equal(shader.uniforms.waterTime.value,0);
 world.animate(99,true);assert.equal(shader.uniforms.waterTime.value,0);
 world.animate(12);assert.equal(shader.uniforms.waterTime.value,12);
 assert.equal(material.transmission,0,'no fullscreen refraction pass');
 assert.equal(material.metalness,0,'water is dielectric');
 world.dispose();
});

test('normal tiles are deterministic, normalized, and continuous across wrap boundaries',async()=>{
 const {createWaterNormalTexture}=await import('../lib/fishing-water.ts');
 const a=createWaterNormalTexture(),b=createWaterNormalTexture();
 assert.deepEqual(a.image.data,b.image.data);
 const data=a.image.data,n=a.image.width;
 let seam=0,interior=0;
 const difference=(a,b)=>Math.abs(data[a]-data[b])+Math.abs(data[a+1]-data[b+1]);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=(y*n+x)*4;
  const length=Math.hypot(data[i]/127.5-1,data[i+1]/127.5-1,data[i+2]/127.5-1);
  assert.ok(Math.abs(length-1)<.012,'encoded normals stay unit length');
  if(x===n-1)seam+=difference(i,y*n*4);else interior+=difference(i,i+4);
  if(y===n-1)seam+=difference(i,x*4);else interior+=difference(i,i+n*4);
 }
 assert.ok(seam/(n*2)<interior/(n*(n-1)*2)*1.5,'wrapping does not introduce a visible discontinuity');
 a.dispose();b.dispose();
});
