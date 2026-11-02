import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as construction from '../src/desert/visual-math.ts';
import { createInstallation, disposeInstallation } from '../src/desert/installations.ts';

test('construction lasts twelve seconds, resumes by server age and yields to burn', () => {
 const project = construction.installationConstruction;
 assert.equal(typeof project, 'function', 'shared construction projection exists');
 const born=100_000, burn=400_000;
 assert.equal(project(born,born,burn).progress,0);
 assert.equal(project(born+6_000,born,burn).progress,.5);
 assert.equal(project(born+12_000,born,burn).progress,1);
 assert.equal(project(born-100,born,burn).progress,0);
 assert.equal(project(born+100_000,born,burn).progress,1);
 assert.equal(project(burn,burn-1000,burn).progress,1/12);
 assert.equal(project(burn+10_000,burn-1000,burn).progress,1/12);
 assert.equal(project(burn,burn-1000,burn).active,false);
 assert.equal(project(born+6_000,born,burn).seconds,6);
 assert.equal(project(born+6_000,born,burn).active,true);
});
for(let kind=0;kind<12;kind++) test(`installation ${kind} retains batched geometry with staged per-piece growth`,()=>{
 const root=createInstallation(kind,83);const timings=new Set<number>();let count=0;
 root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;count++;
  const anchor=node.geometry.getAttribute('aBuildAnchor'),axis=node.geometry.getAttribute('aBuildAxis');
  assert.ok(anchor&&axis,'every mesh has original-piece construction attributes');
  assert.equal(anchor.count,node.geometry.getAttribute('position').count);
  for(let i=0;i<anchor.count;i++){
   const start=anchor.getW(i),duration=axis.getW(i);timings.add(Math.round(start*100));
   assert.ok(start>=0&&start+duration<=12.001);assert.ok(duration>=1.2);
   assert.ok(Math.abs(Math.hypot(axis.getX(i),axis.getY(i),axis.getZ(i))-1)<.0001);
  }
 });
 assert.ok(count<=12,'preserves existing draw-call budget');
 assert.ok(timings.size>=5,'multiple original pieces start at visibly different times');
 assert.ok(Math.min(...timings)<120,'foundation starts first');
 assert.ok(Math.max(...timings)>720,'upper details continue late in construction');
 disposeInstallation(root);
});

test('construction attaches identical color/shadow growth, dust, and disposes cleanly',async()=>{
 const rendererModule=await import('../src/desert/construction.ts').catch(()=>null);
 assert.ok(rendererModule,'construction renderer exists');
 const root=createInstallation(4,3);const scene=new THREE.Scene();scene.add(root);
 const effect=rendererModule.createInstallationConstruction(root,3);
 scene.add(effect.dust);
 const originalScale=root.scale.clone();
 effect.update(10,false);
 assert.equal(effect.seconds.value,10);assert.equal(effect.dust.visible,true);
 assert.deepEqual(root.scale,originalScale,'never scales the whole artwork');
 root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;
  assert.ok(node.customDepthMaterial);assert.ok(node.customDistanceMaterial);
  const surface=Array.isArray(node.material)?node.material[0]:node.material;
  for(const material of [surface,node.customDepthMaterial,node.customDistanceMaterial]){
   const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader} as unknown as Parameters<THREE.Material['onBeforeCompile']>[0];
   material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
   assert.equal(shader.uniforms.uConstructionSeconds,effect.seconds);
   assert.match(shader.vertexShader,/aBuildAnchor/);assert.match(shader.vertexShader,/transformed = aBuildAnchor/);
  }
 });
 effect.update(10,false,false);assert.equal(effect.dust.visible,false,'burn disables dust without finishing construction');
 assert.equal(effect.seconds.value,10);
 effect.update(12,false);assert.equal(effect.dust.visible,false);
 effect.update(10,true);assert.equal(effect.dust.visible,false,'reduced motion omits dust');
 effect.dispose();effect.dispose();assert.equal(effect.dust.parent,null);
 disposeInstallation(root);
});

test('offline deformation matches staged shader math and restores exact complete vertices',async()=>{
 const rendererModule=await import('../src/desert/construction.ts');
 const deform=rendererModule.deformConstructionVertex;
 assert.equal(typeof deform,'function','offline deformation reference exists');
 const position=new THREE.Vector3(2,5,1),anchor=new THREE.Vector4(1,1,1,2),axis=new THREE.Vector4(0,1,0,4);
 assert.deepEqual(deform(position,anchor,axis,0).toArray(),[1,1,1]);
 const half=deform(position,anchor,axis,4,true);
 assert.ok(Math.abs(half.x-1.93)<1e-9);assert.equal(half.y,3);assert.equal(half.z,1);
 assert.ok(deform(position,anchor,axis,4).y<half.y,'settle is optional');
 assert.deepEqual(deform(position,anchor,axis,20).toArray(),position.toArray());
 assert.deepEqual(position.toArray(),[2,5,1]);
});
