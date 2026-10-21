import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {FishingCatchCelebration,createFishingConfetti,FISHING_CONFETTI_DURATION_MS} from '../lib/fishing-confetti.ts';
const idle={ownerId:'self',catchId:undefined,rarity:undefined,closeup:false,visible:true,reducedMotion:false};
const caught=(id='one',rarity='rare')=>({...idle,catchId:id,rarity,closeup:true});
test('only three rare tiers celebrate a new confirmed own catch once',()=>{
 for(const rarity of ['common','uncommon','rare','epic','legendary']){
  const gate=new FishingCatchCelebration(false);gate.sample(idle,0);
  assert.equal(gate.sample(caught('one',rarity),100),['rare','epic','legendary'].includes(rarity)?rarity:null);
  assert.equal(gate.sample(caught('one',rarity),150),null);
  gate.sample(idle,200);assert.equal(gate.sample(caught('one',rarity),250),null);
 }
});
test('cold held catch, owner changes and suppressed effects never replay',()=>{
 const gate=new FishingCatchCelebration(false);assert.equal(gate.sample(caught(),0),null);
 assert.equal(gate.sample(caught(),100),null);
 assert.equal(gate.sample({...caught('two'),reducedMotion:true},200),null);
 assert.equal(gate.sample(caught('two'),300),null);
 assert.equal(gate.sample({...caught('three'),visible:false},400),null);
 assert.equal(gate.sample(caught('three'),500),null);
 assert.equal(gate.sample({...caught('four'),ownerId:'peer'},600),null);
});
test('waits for closeup, expires stale candidates and interrupt consumes them',()=>{
 const gate=new FishingCatchCelebration(false);gate.sample(idle,0);
 assert.equal(gate.sample({...caught(),closeup:false},10),null);
 assert.equal(gate.sample(caught(),1400),'rare');
 gate.sample({...caught('two'),closeup:false},1500);assert.equal(gate.sample(caught('two'),7000),null);
 gate.sample({...caught('three'),closeup:false},7100);gate.interrupt();assert.equal(gate.sample(caught('three'),7200),null);
});
test('pooled full-screen strips are tiered, finite and release GPU resources',()=>{
 const camera=new THREE.PerspectiveCamera(35,390/758,.15,240),fx=createFishingConfetti(camera);
 const counts=[];for(const rarity of ['rare','epic','legendary']){fx.start(rarity,0);counts.push(fx.mesh.count);fx.update(800);assert.equal(fx.mesh.visible,true);
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3();for(let i=0;i<fx.mesh.count;i++){fx.mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix).project(camera);assert.ok(Math.abs(position.x)<1);assert.ok(position.y<1.7&&position.y>-1.7);}
 fx.update(FISHING_CONFETTI_DURATION_MS);assert.equal(fx.mesh.visible,false);assert.equal(fx.mesh.count,0);}
 assert.ok(counts[0]<counts[1]&&counts[1]<counts[2]);fx.start('rare',4000);fx.stop();assert.equal(fx.mesh.visible,false);
 let geometry=0,material=0;fx.mesh.geometry.addEventListener('dispose',()=>geometry++);fx.mesh.material.addEventListener('dispose',()=>material++);fx.dispose();fx.dispose();assert.equal(geometry,1);assert.equal(material,1);assert.equal(camera.children.length,0);
});

test('temporary first-three override uses fresh catches only, then normal rarity',()=>{
 const gate=new FishingCatchCelebration(true);assert.equal(gate.sample(caught('saved','legendary'),0),null);
 assert.equal(gate.sample(caught('saved','legendary'),10),null);
 for(const [i,rarity] of ['rare','epic','legendary'].entries()){
  const record=caught(`fresh-${i}`,'common');assert.equal(gate.sample(record,100+i*100),rarity);
  assert.equal(gate.sample(record,120+i*100),null);
  gate.interrupt();assert.equal(gate.sample(record,130+i*100),null);
 }
 assert.equal(gate.sample(caught('fourth','common'),500),null);
 assert.equal(gate.sample(caught('fifth','epic'),600),'epic');
 const reload=new FishingCatchCelebration(true);reload.sample(caught('fifth','epic'),0);
 assert.equal(reload.sample(caught('new-visit','common'),100),'rare');
});
test('test override does not consume slots for no owner or cold owner hydration',()=>{
 const gate=new FishingCatchCelebration(true);gate.sample({...idle,ownerId:null},0);
 gate.sample({...caught('npc','legendary'),ownerId:null},10);
 gate.sample(caught('saved','common'),20);
 assert.equal(gate.sample(caught('first-own','common'),30),'rare');
});

test('strip dimensions stay legible in CSS pixels at mobile and desktop sizes',()=>{
 for(const [width,height] of [[390,758],[780,1000]]){
  const camera=new THREE.PerspectiveCamera(35,width/height,.15,240),fx=createFishingConfetti(camera);fx.start('legendary',0);fx.update(800,width,height);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  for(let i=0;i<fx.mesh.count;i++){
   fx.mesh.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);
   const widthPx=scale.x*camera.projectionMatrix.elements[0]/2*width/2,heightPx=scale.y*camera.projectionMatrix.elements[5]/2*height/2;
   assert.ok(widthPx>=3.59&&widthPx<=4.81);assert.ok(heightPx>=7.99&&heightPx<=11.01);
  }
  fx.dispose();
 }
});

test('full-screen shower stays dispersed across five columns and all quadrants over time',()=>{
 for(const rarity of ['rare','epic','legendary']){
  const camera=new THREE.PerspectiveCamera(35,390/758,.15,240),fx=createFishingConfetti(camera);fx.start(rarity,0);
  for(const time of [300,900,1600,2200]){
   fx.update(time);const matrix=new THREE.Matrix4(),points=[];
   for(let i=0;i<fx.mesh.count;i++){fx.mesh.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix).project(camera);if(Math.abs(p.y)<1)points.push(p);}
   assert.ok(points.length>=20,`${rarity} ${time}: enough visible pieces`);
   assert.equal(new Set(points.map(p=>Math.min(4,Math.floor((p.x+1)*2.5)))).size,5,`${rarity} ${time}: all horizontal bands`);
   assert.equal(new Set(points.map(p=>`${p.x<0}:${p.y<0}`)).size,4,`${rarity} ${time}: all quadrants`);
   assert.ok(points.some(p=>Math.abs(p.x)<.2),'center is included at sparse density');
   let closePairs=0;for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++)if(Math.hypot((points[a].x-points[b].x)*195,(points[a].y-points[b].y)*379)<14)closePairs++;
   assert.equal(closePairs,0,`${rarity} ${time}: no clump closer than 14 px`);
  }
  fx.dispose();
 }
});
test('all tiers use the same three macaron colors with only density changing',()=>{
 for(const [rarity,count] of [['rare',36],['epic',54],['legendary',72]]){
  const camera=new THREE.PerspectiveCamera(35,390/758,.15,240),fx=createFishingConfetti(camera);fx.start(rarity,0);
  assert.equal(fx.mesh.count,count);const colors=new Set(),color=new THREE.Color();for(let i=0;i<count;i++){fx.mesh.getColorAt(i,color);colors.add(color.getHexString());}
  assert.deepEqual([...colors].sort(),['a8d8ff','ff9baa','ffe5a3']);fx.dispose();
 }
});
