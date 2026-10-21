import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {fishingSceneHarness,participant} from './helpers/fishing-scene-harness.mjs';
const other=(phase='idle')=>({...participant(phase),id:'other',name:'海风',slot:1});
const labelText=label=>label.children?.length?label.children.map(child=>child.textContent).join(' '):label.textContent;
function tapLabel(h,index=1){const label=h.labels.children[index];label.dispatchEvent(h.pointer('pointerdown'));label.dispatchEvent(h.pointer('pointerup'));}

test('name and character state occupy separate smaller-color label elements',async t=>{
 const h=await fishingSceneHarness({participants:[participant('waiting')],ownId:'self'});t.after(()=>h.dispose());const label=h.labels.children[0];
 assert.equal(label.children.length,3,'speech, name and status have separate elements');
 assert.equal(label.children[0].className,'yacht-person-speech');
 assert.equal(label.children[1].className,'yacht-person-name');assert.match(label.children[1].textContent,/小浪/);
 assert.equal(label.children[2].className,'yacht-person-state');assert.equal(label.children[2].textContent,'垂钓中');
});
test('tapping a label selects its angler and keeps focus through own catches until departure',async t=>{
 const h=await fishingSceneHarness({participants:[participant(),other()],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());h.frames();const before=h.camera.position.clone();
 tapLabel(h);h.frames();assert.ok(before.distanceTo(h.camera.position)>2,'selected person changes rendered orbit subject');assert.equal(h.labels.children[1].attributes['aria-pressed'],'true');
 h.event('pointerdown');h.event('pointermove',{clientX:210});h.event('pointerup',{clientX:210});h.frames();const watched=h.camera.position.clone();
 h.render({participants:[participant('holding'),other()]});h.step();await h.settleCatches();h.frames();assert.ok(watched.distanceTo(h.camera.position)<.001,'own catch never steals a watched subject');
 h.render({participants:[participant('holding')]});h.frames();assert.equal(h.labels.children[0].attributes['aria-pressed'],'true','leaving subject falls back to own angler');
 assert.ok(watched.distanceTo(h.camera.position)>1);assert.match(labelText(h.labels.children[0]),/小浪/);
});
test('label drag and pinch orbit without selecting a different angler',async t=>{
 const h=await fishingSceneHarness({participants:[participant(),other()],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());const label=h.labels.children[1];
 label.dispatchEvent(h.pointer('pointerdown'));label.dispatchEvent(h.pointer('pointermove',{clientX:220}));label.dispatchEvent(h.pointer('pointerup',{clientX:220}));h.frames();
 assert.notEqual(label.attributes['aria-pressed'],'true','a drag beginning on a label is not a selection');
 label.dispatchEvent(h.pointer('pointerdown'));label.dispatchEvent(h.pointer('pointerdown',{pointerId:2,clientX:240}));label.dispatchEvent(h.pointer('pointerup',{pointerId:2,clientX:240}));label.dispatchEvent(h.pointer('pointerup'));h.frames();
 assert.notEqual(label.attributes['aria-pressed'],'true','pinch release cannot become a tap');
});
test('avatar geometry is tappable and camera toolbar changes clear explicit subject focus',async t=>{
 const h=await fishingSceneHarness({participants:[participant(),other()],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());h.frames();
 const angler=h.world.scene.getObjectByName('Angler 海风');const point=angler.localToWorld(new THREE.Vector3(0,1,0)).project(h.camera);const position={clientX:(point.x*.5+.5)*390,clientY:(-.5*point.y+.5)*758};
 h.event('pointerdown',position);h.event('pointerup',position);h.frames();assert.equal(h.labels.children[1].attributes['aria-pressed'],'true','tap raycasts actual avatar mesh');
 h.render({cameraMode:'overview'});h.frames();assert.notEqual(h.labels.children[1].attributes['aria-pressed'],'true');assert.ok(h.camera.position.length()>40);
});

test('all20 canonical catches from legacy maximum records stay framed around a watched angler throughout manual orbit',async t=>{
 const {MARINE_SPECIES}=await import('../lib/fishing-catalog.ts');
 const h=await fishingSceneHarness({participants:[participant(),other()],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());tapLabel(h);h.step();
 for(const species of MARINE_SPECIES){
  const caught=other('holding');caught.fishing.catch={id:`max-${species.id}`,speciesId:species.id,lengthCm:species.maxCm,weightKg:1,caughtAt:h.now()-3000};
  h.render({participants:[participant(),caught]});h.step();await h.settleCatches();h.step();
  for(let orbit=0;orbit<5;orbit++){
   h.event('pointerdown');h.event('pointermove',{clientX:150+85,clientY:300+(orbit%2?25:-25)});h.event('pointerup',{clientX:235});h.event('wheel',{deltaY:-1000,deltaMode:0});h.step();
   const angler=h.world.scene.getObjectByName('Angler 海风'),catchModel=angler.children[2];assert.ok(catchModel?.visible);
   const bounds=new THREE.Box3().setFromObject(angler.children[0]).union(new THREE.Box3().setFromObject(catchModel));
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const p=new THREE.Vector3(x,y,z).project(h.camera);assert.ok(Math.abs(p.x)<.99&&Math.abs(p.y)<.99,`${species.id}, orbit${orbit}: ${p.x},${p.y}`);
   }
  }
 }
});

test('mixed canvas-label pinch is one gesture and never taps either angler',async t=>{
 const h=await fishingSceneHarness({participants:[participant(),other()],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());
 h.event('pointerdown',{pointerId:1,clientX:100});const label=h.labels.children[1];
 label.dispatchEvent(h.pointer('pointerdown',{pointerId:2,clientX:200}));h.event('pointermove',{pointerId:1,clientX:80});
 label.dispatchEvent(h.pointer('pointerup',{pointerId:2,clientX:200}));h.event('pointerup',{pointerId:1,clientX:80});h.step();
 assert.notEqual(label.attributes['aria-pressed'],'true','a cross-target pinch may not become a label selection');assert.equal(label.captured.size,0);assert.equal(h.canvas.captured.size,0);
});

test('deck framing leaves a usable cloud skyline below the top HUD',async t=>{
 const h=await fishingSceneHarness({participants:[participant()],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());
 assert.equal(h.camera.view.offsetY,24,'deck framing needs a lower offset than the full-boat overview');
 const cloudscape=h.world.scene.getObjectByName('White cloudscape');assert.ok(cloudscape);
 const visible=[];cloudscape.traverse(object=>{if(!object.isMesh)return;const p=object.getWorldPosition(new THREE.Vector3()).project(h.camera),x=(p.x*.5+.5)*390,y=(-p.y*.5+.5)*758;if(x>0&&x<390&&y>195&&y<300)visible.push(object);});
 assert.ok(visible.length>0,'at least one real cloud lies in the unobscured skyline');
});

test('departure without a local angler restores the full-yacht overview',async t=>{
 const h=await fishingSceneHarness({participants:[other()],ownId:null,cameraMode:'overview'});t.after(()=>h.dispose());tapLabel(h,0);h.step();assert.equal(h.labels.children[0].attributes['aria-pressed'],'true');
 h.render({participants:[]});h.step();assert.ok(h.camera.position.length()>40,'no dangling target remains when the only guest leaves');assert.equal(h.camera.view.offsetY,66);assert.equal(h.labels.children.length,0);
});
test('disabled label controls cannot change focus and release all cross-target captures',async t=>{
 const h=await fishingSceneHarness({participants:[participant(),other()],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());const label=h.labels.children[1];
 h.event('pointerdown',{pointerId:1});label.dispatchEvent(h.pointer('pointerdown',{pointerId:2}));h.render({enabled:false});h.step();
 assert.equal(h.canvas.captured.size,0);assert.equal(label.captured.size,0);tapLabel(h);h.render({enabled:true});h.step();assert.notEqual(label.attributes['aria-pressed'],'true');
});
