import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFishingRod} from '../lib/fishing-rod.ts';

const axis=new THREE.Vector3(.02,.9,.85).normalize();
const joint=new THREE.Vector3(.02,.9,.85);
const activeTip=new THREE.Vector3(.03,1.42,1.8);
const makeRod=t=>{
 const material=new THREE.MeshStandardMaterial(),rod=createFishingRod(material,material);
 t.after(()=>{rod.traverse(o=>{if(o.isMesh)o.geometry.dispose();});material.dispose();});
 return rod;
};
const shaftRings=rod=>{
 const shaft=rod.getObjectByName('rod-tip-segment');
 assert.equal(shaft.geometry.type,'TubeGeometry','flexible blank must be a continuous curved surface');
 const {tubularSegments,radialSegments}=shaft.geometry.parameters;
 const position=shaft.geometry.attributes.position;
 shaft.updateWorldMatrix(true,false);
 return Array.from({length:tubularSegments+1},(_,i)=>{
  const points=Array.from({length:radialSegments},(_,j)=>new THREE.Vector3().fromBufferAttribute(position,i*(radialSegments+1)+j).applyMatrix4(shaft.matrixWorld));
  const center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/radialSegments);
  return {center,radius:Math.max(...points.map(p=>p.distanceTo(center)))};
 });
};

test('active rod flex is tangent-continuous with the handle and has no elbow',t=>{
 const rod=makeRod(t),rings=shaftRings(rod);
 assert.ok(rings.length>=25,'enough longitudinal samples for a smooth silhouette');
 assert.ok(rings[0].center.distanceTo(joint)<1e-6,'stable lower handle axis and length');
 assert.ok(rings.at(-1).center.distanceTo(rod.tip)<1e-6,'line attachment is the actual rendered tip');
 const tangents=rings.slice(1).map((ring,i)=>ring.center.clone().sub(rings[i].center).normalize());
 assert.ok(tangents[0].angleTo(axis)<.015,'flex begins along the straight handle');
 for(let i=1;i<tangents.length;i++)assert.ok(tangents[i].angleTo(tangents[i-1])<.025,'curvature changes gradually, without a hard joint');
 assert.ok(tangents.at(-1).angleTo(axis)>.3,'active shaft has a readable curved tip');
});

test('rod blank tapers toward a fine tip and the reel stays restrained',t=>{
 const rod=makeRod(t),rings=shaftRings(rod),handle=rod.getObjectByName('rod-handle-segment');
 assert.ok(Math.max(handle.geometry.parameters.radiusTop,handle.geometry.parameters.radiusBottom)<=.018,'slender lower shaft');
 assert.ok(rings[0].radius<=.0121,'thin blank starts at no more than 24 mm diameter');
 assert.ok(rings.at(-1).radius<=.0041,'fine tip is no more than 8 mm diameter');
 assert.ok(rings.at(-1).radius<rings[0].radius*.4,'shaft tapers toward the tip');
 for(let i=1;i<rings.length;i++)assert.ok(rings[i].radius<=rings[i-1].radius+1e-7,'no widening segments');
 const reel=rod.getObjectByName('rod-reel');
 assert.ok(reel.geometry.parameters.radius<=.06&&reel.geometry.parameters.tube<=.013,'compact reel without an oversized gold ring');
 assert.ok(reel.position.x<-.08,'right-hand reel faces away from the torso');
});

test('rest pose preserves endpoints, fixed grip, and the complete straight rendered shaft',t=>{
 const rod=makeRod(t),handle=rod.getObjectByName('rod-handle-segment');
 const initialHandle=handle.matrix.clone(),geometry=rod.getObjectByName('rod-tip-segment').geometry;
 const straightTip=joint.clone().addScaledVector(axis,activeTip.distanceTo(joint));
 for(const progress of [0,.25,.5,.75,1,1.5,-.5]){
  rod.updateRestPose(progress);
  const rings=shaftRings(rod),clamped=THREE.MathUtils.clamp(progress,0,1);
  const expected=activeTip.clone().lerp(straightTip,clamped);
  assert.ok(rod.tip.distanceTo(expected)<1e-12,'public tip follows the existing endpoint interpolation');
  assert.ok(rings.at(-1).center.distanceTo(rod.tip)<1e-6);
  assert.ok(rings[0].center.distanceTo(joint)<1e-6);
  assert.equal(rod.getObjectByName('rod-tip-segment').geometry,geometry,'updates reuse GPU geometry');
  assert.ok(rings.every(r=>r.center.toArray().every(Number.isFinite)));
  if(clamped===1)for(const ring of rings)assert.ok(ring.center.clone().cross(axis).length()<1e-6,'whole resting blank is straight');
  handle.updateMatrix();
  if(progress===0)initialHandle.copy(handle.matrix);else assert.ok(handle.matrix.equals(initialHandle),'handle never moves relative to the grip');
 }
 rod.updateRestPose(0);assert.deepEqual(rod.tip.toArray(),[.03,1.42,1.8]);
});

test('compact reel and mount clear the armed dog props throughout casting',async t=>{
 const {uploadedAvatar}=await import('./helpers/uploaded-avatar.mjs');
 const {createFishingTriangleClearanceProbe}=await import('./helpers/fishing-triangle-clearance.mjs');
 const {createFishingAvatar}=await import('../lib/fishing-avatar.ts');
 const {sampleFishingAction}=await import('../lib/fishing-action-motion.ts');
 const avatar=createFishingAvatar('sword-shield-dog','rod-reel-clearance',{template:await uploadedAvatar('sword-shield-dog')});
 t.after(()=>avatar.dispose());
 const rod=makeRod(t),probe=createFishingTriangleClearanceProbe(avatar.root),failures=[];
 for(let elapsed=0;elapsed<=1500;elapsed+=100){
  const time=1000+elapsed,pose=sampleFishingAction({phase:'waiting',castAt:1000},time);
  avatar.updateFishing(time/1000,'waiting',false,.352,pose);
  rod.position.copy(avatar.rodPosition);rod.quaternion.copy(avatar.rodQuaternion);rod.updateRestPose(pose.restProgress);
  const result=probe({rod,checkProps:true});
  for(const kind of ['rodBody','rodProps'])if(result[kind].count)failures.push({elapsed,kind,count:result[kind].count,labels:result[kind].labels});
 }
 assert.deepEqual(failures,[],'actual reel triangles stay outside the preserved weapon meshes');
});
