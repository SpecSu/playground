import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {loadGeometry} from './helpers/load-rig.mjs';import {normalizeCharacterBind,createRootMotionLock} from '../src/stage.js';import {createInputMotionController} from '../src/input-motion.js';
export const restPose={clip:'dance_01',time:3.475,arms:{clip:'dance_01',time:1}};
async function fixture(path){const g=await loadGeometry('jiaxin-0',path?{path}:{});normalizeCharacterBind(g.scene);g.scene.rotation.y=-Math.PI/2;return g}
const bonesOf=model=>{const b=[];model.traverse(n=>{if(n.isBone)b.push(n)});return b};const pose=b=>b.map(n=>({p:n.position.clone(),q:n.quaternion.clone(),s:n.scale.clone()}));
function sample(g,clip,time){for(const track of g.animations.find(c=>c.name===clip).tracks){const p=T.PropertyBinding.parseTrackName(track.name),n=T.PropertyBinding.findNode(g.scene,p.nodeName);n[p.propertyName].fromArray(track.createInterpolant().evaluate(time));}}
const paths=[['shipped Jiaxin',null],...(process.env.REST_POSE_RIG?[['body candidate',process.env.REST_POSE_RIG]]:[])];
for(const [label,path] of paths)test(label+': explicit rest changes only requested arm quaternions over base-pose TRS',async()=>{
 const g=await fixture(path),b=bonesOf(g.scene);sample(g,'dance_01',1);const arms=pose(b);sample(g,'dance_01',3.475);const body=pose(b);
 const fresh=await fixture(path),actual=bonesOf(fresh.scene),c=createInputMotionController(fresh.scene,fresh.animations,{restPose});
 actual.forEach((n,i)=>{assert(n.position.distanceTo(body[i].p)<1e-7,n.name+' position');assert(n.scale.distanceTo(body[i].s)<1e-7,n.name+' scale');const expected=/(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand)/.test(n.name)?arms[i].q:body[i].q;assert(n.quaternion.toArray().every((value,j)=>Math.abs(value-expected.toArray()[j])<1e-7),n.name+' rotation')});assert.equal(c.getDiagnostics().ready.time,3.475);assert.equal(c.getDiagnostics().ready.configured,true);assert(c.getDiagnostics().ready.handsBelowShoulders);
});
test('missing or invalid override preserves existing automatic rest selection',async()=>{
 const g=await fixture(),reference=createInputMotionController(g.scene,g.animations),expected=pose(bonesOf(g.scene));
 for(const config of [undefined,{bind:true,clip:'dance_01',time:1},{bind:true,arms:{clip:'dance_01',time:1}},{clip:'missing',time:1},{clip:'dance_01',time:-1},{clip:'dance_01',time:999},{clip:'dance_01',time:3.475,arms:{clip:'missing',time:1}}]){const f=await fixture(),c=createInputMotionController(f.scene,f.animations,{restPose:config});const actual=pose(bonesOf(f.scene));actual.forEach((n,i)=>{assert(n.p.equals(expected[i].p));assert(n.q.equals(expected[i].q));assert(n.s.equals(expected[i].s))});assert.equal(c.getDiagnostics().ready.time,reference.getDiagnostics().ready.time)}
});
for(const [label,path] of paths)test(label+': configured rest supports greeting, all hits, settle and pause with grounded stance',async()=>{
 const g=await fixture(path),wrapper=new T.Group;wrapper.add(g.scene);const b=bonesOf(g.scene),find=s=>b.find(n=>n.name.endsWith(s)),c=createInputMotionController(g.scene,g.animations,{restPose}),lock=createRootMotionLock(wrapper,find('Hips'));lock.apply();const ready=pose(b),feet=['LeftFoot','RightFoot'].map(find),world=n=>n.getWorldPosition(new T.Vector3()),initialFeet=feet.map(world);const step=s=>{for(let i=0;i<s*60;i++){const previous=b.map(n=>n.quaternion.clone());c.update(1/60);lock.apply();b.forEach((n,j)=>assert(n.quaternion.angleTo(previous[j])<T.MathUtils.degToRad(8),'bounded temporal motion'));}};
 assert(world(feet[0]).distanceTo(world(feet[1]))>.20);step(4);feet.forEach((n,i)=>assert(world(n).distanceTo(initialFeet[i])<1e-4));assert(b.some((n,i)=>n.quaternion.angleTo(ready[i].q)>.1));c.setMode('paused');const paused=pose(b);step(4);b.forEach((n,i)=>assert(n.quaternion.equals(paused[i].q)));c.setMode('playing');step(4);
 for(let lane=0;lane<4;lane++){assert(c.hit(lane,'perfect'));step(.25);assert(b.some((n,i)=>n.quaternion.angleTo(ready[i].q)>.05));step(4);b.forEach((n,i)=>assert(n.quaternion.equals(ready[i].q)))}
});
// Blender re-export may round float32 positions by <0.3 micrometres; 1µm is
// still orders of magnitude below the approved centimetre-scale body changes.
// Dimensionless decomposed scales allow 1e-5 (0.001%) exporter roundoff.
if(process.env.REST_POSE_RIG&&process.env.BODY_REFERENCE_RIG)test('integrated candidate retains the approved body bone positions/scales and position animation keys',async()=>{
 const reference=await loadGeometry('',{path:process.env.BODY_REFERENCE_RIG}),candidate=await loadGeometry('',{path:process.env.REST_POSE_RIG}),actual=new Map(bonesOf(candidate.scene).map(b=>[b.name,b]));
 for(const bone of bonesOf(reference.scene)){const got=actual.get(bone.name);assert(got,'body bone preserved: '+bone.name);assert(got.position.distanceTo(bone.position)<1e-6,bone.name+' approved body position');assert(got.scale.distanceTo(bone.scale)<1e-5,bone.name+' approved body scale')}
 for(const clip of reference.animations){const found=candidate.animations.find(c=>c.name===clip.name);assert(found,'body clip retained: '+clip.name);for(const track of clip.tracks.filter(t=>t.name.endsWith('.position'))){const got=found.tracks.find(t=>t.name===track.name);assert(got,'position track retained: '+track.name);assert.deepEqual(got.times,track.times);assert.equal(got.values.length,track.values.length);assert(got.values.every((value,i)=>Math.abs(value-track.values[i])<1e-6),'corrected bone-length keys retained within float32 re-export precision: '+track.name)}}
});
for(const [label,path] of paths)test(label+': opt-in native bind rest retains exact initial TRS with low hands, level feet and broad shoulders',async()=>{
 const g=await fixture(path),b=bonesOf(g.scene),initial=pose(b),c=createInputMotionController(g.scene,g.animations,{restPose:{bind:true}});
 b.forEach((n,i)=>{assert(n.position.equals(initial[i].p));assert(n.quaternion.equals(initial[i].q));assert(n.scale.equals(initial[i].s))});
 const d=c.getDiagnostics().ready;assert.equal(d.configured,true);assert.equal(d.source,'bind');assert.equal(d.clip,null);
 const find=s=>b.find(n=>n.name.endsWith(s)),world=n=>n.getWorldPosition(new T.Vector3());g.scene.updateMatrixWorld(true);const hips=world(find('Hips')),neck=world(find('Neck')),left=world(find('LeftFoot')),right=world(find('RightFoot'));
 assert(Math.abs(left.y-right.y)<.005);assert(left.distanceTo(right)>.22);for(const side of ['Left','Right']){assert(world(find(side+'Hand')).y<hips.y+.025);assert(world(find(side+'Arm')).y>neck.y-.015)}
 c.setMode('lobby');for(let i=0;i<240;i++)c.update(1/60);assert(world(find('LeftFoot')).distanceTo(left)<1e-5);assert(world(find('RightFoot')).distanceTo(right)<1e-5);assert(b.some((n,i)=>n.quaternion.angleTo(initial[i].q)>.1),'native rest still greets naturally');c.setMode('paused');const frozen=pose(b);for(let i=0;i<60;i++)c.update(1/60);b.forEach((n,i)=>assert(n.quaternion.equals(frozen[i].q)));
 c.setMode('playing');for(let i=0;i<180;i++)c.update(1/60);b.forEach((n,i)=>assert(n.quaternion.equals(initial[i].q)));c.hit(0,'perfect');for(let i=0;i<120;i++)c.update(1/60);for(let i=0;i<240;i++)c.update(1/60);b.forEach((n,i)=>assert(n.quaternion.equals(initial[i].q)));
});
