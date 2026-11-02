import * as T from 'three';
import {createRootMotionLock} from '../src/stage.js';
import fs from 'node:fs';import assert from 'node:assert/strict';
for(const person of ['jiji','lx'])for(const outfit of [0,1,2]){
 const b=fs.readFileSync(new URL(`../public/assets/characters/${person}-${outfit}.glb`, import.meta.url)),len=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+len)),binary=b.subarray(28+len);
 const data=i=>{let a=j.accessors[i],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3,VEC4:4}[a.type],out=[];assert.equal(a.componentType,5126);for(let k=0;k<a.count;k++)for(let q=0;q<n;q++)out.push(binary.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+k*(v.byteStride||n*4)+q*4));return out};
 for(const anim of j.animations){
  const scene=new T.Scene(),wrapper=new T.Group(),nodes=j.nodes.map(n=>{let o=new T.Object3D();o.name=T.PropertyBinding.sanitizeNodeName(n.name||'');if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o;});
  j.nodes.forEach((n,i)=>(n.children||[]).forEach(k=>nodes[i].add(nodes[k])));scene.add(wrapper);j.scenes[j.scene||0].nodes.forEach(k=>wrapper.add(nodes[k]));const hips=nodes.find(n=>/hips$/i.test(n.name));const lock=createRootMotionLock(wrapper,hips);
  const tracks=anim.channels.map(c=>{const s=anim.samplers[c.sampler],path={translation:'position',rotation:'quaternion',scale:'scale'}[c.target.path];return new (path==='quaternion'?T.QuaternionKeyframeTrack:T.VectorKeyframeTrack)(nodes[c.target.node].name+'.'+path,data(s.input),data(s.output));});
  const clip=new T.AnimationClip(anim.name,-1,tracks),mixer=new T.AnimationMixer(wrapper);mixer.clipAction(clip).play();let original=[],corrected=[];
  for(let i=0;i<=120;i++){wrapper.position.set(0,0,0);mixer.setTime(clip.duration*i/121);wrapper.updateWorldMatrix(true,true);original.push(hips.getWorldPosition(new T.Vector3()).toArray());lock.apply();corrected.push(hips.getWorldPosition(new T.Vector3()).toArray());}
  const range=(arr,k)=>Math.max(...arr.map(a=>a[k]))-Math.min(...arr.map(a=>a[k]));const before=[0,1,2].map(k=>range(original,k)),after=[0,1,2].map(k=>range(corrected,k));assert(after[0]<1e-6&&after[2]<1e-6);for(let i=0;i<original.length;i++)assert(Math.abs(original[i][1]-corrected[i][1])<1e-6);console.log(JSON.stringify({person,outfit,clip:anim.name,beforeRange:before,afterRange:after,verticalUnchanged:true}));
 }
}
