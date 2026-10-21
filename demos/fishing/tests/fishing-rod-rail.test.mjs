import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createYachtWorld,FISHING_RENDER_SEATS} from '../lib/fishing-world.ts';
import {createFishingRod} from '../lib/fishing-rod.ts';
import {fishingRailMeshes,createFishingRodRailProbe} from './helpers/fishing-rod-rail.mjs';
import {auditFishingRodRails} from './helpers/fishing-rod-rail-audit.mjs';

test('rod-rail audit includes actual narrowed main rails, aft rails and every upper rail',()=>{
 const world=createYachtWorld(),rails=fishingRailMeshes(world);
 assert.equal(FISHING_RENDER_SEATS.length,12);assert.equal(rails.length,62);
 assert.equal(rails.filter(r=>r.parent.name==='Upper-deck safety rail').length,12);
 assert.equal(createFishingRodRailProbe(world).railTriangles,1984);
 assert.ok(rails.some(r=>new THREE.Box3().setFromObject(r).max.z>6.7),'aft gate rails retained');
 assert.ok(rails.some(r=>new THREE.Box3().setFromObject(r).min.x<-3.1),'main rails include baked beam narrowing');
 world.dispose();
});

test('real rail surface probe detects a crossing and measures positive clearance',()=>{
 const world=createYachtWorld(),material=new THREE.MeshBasicMaterial(),rod=createFishingRod(material,material);
 world.yacht.add(rod);rod.position.set(3.1025,1.9,2);rod.updateRestPose(1);
 const probe=createFishingRodRailProbe(world,{clearanceLimit:.2});
 assert.ok(probe(rod).crossings.count>0,'visible cylinder surface intersects actual side rail');
 rod.position.set(3.25,2.3,2);rod.quaternion.setFromUnitVectors(new THREE.Vector3(.02,.9,.85).normalize(),new THREE.Vector3(0,1,0));
 const separated=probe(rod);assert.equal(separated.crossings.count,0);assert.ok(separated.clearance>0&&separated.clearance<.2,'nearby separated surfaces get a finite exact distance');
 world.dispose();
});

test('surface-distance measurement uses exact triangles and survives yacht rocking',()=>{
 const scene=new THREE.Scene(),yacht=new THREE.Group();scene.add(yacht);
 const material=new THREE.MeshBasicMaterial(),rail=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,2,8),material);yacht.add(rail);
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([.08,-2,-2,.08,2,-2,.08,0,2],3));
 const subject=new THREE.Mesh(geometry,material);yacht.add(subject);
 for(const rock of [false,true]){
  if(rock){yacht.position.set(.4,-.7,1.2);yacht.rotation.set(.21,-.37,.18);}
  const result=createFishingRodRailProbe({scene,yacht},{clearanceLimit:.2})(subject);
  assert.equal(result.crossings.count,0);assert.ok(Math.abs(result.clearance-.04)<1e-7,`exact facet/triangle distance: ${result.clearance}`);assert.equal(result.clearanceCapped,false);
 }
 geometry.dispose();rail.geometry.dispose();material.dispose();
});

test('all 12 uploaded avatars keep the complete rod clear of real rails at all 12 stations',async()=>{
 const result=await auditFishingRodRails({clearanceLimit:.02,minimumClearance:.01});
 assert.equal(result.avatarCount,12);assert.equal(result.slotCount,12);
 assert.ok(result.totalSamples>=6000,'idle, escape, cast, waiting, bite, visible haul and reduced-motion samples');
 assert.deepEqual(result.avatars.filter(a=>a.failures.length).map(a=>({id:a.id,samples:a.samples,crossingSamples:a.crossingSamples,lowClearanceSamples:a.lowClearanceSamples,minimum:a.minimum,phaseFailures:a.phaseFailures,slotFailures:a.slotFailures,first:a.failures[0]})),[]);
});
