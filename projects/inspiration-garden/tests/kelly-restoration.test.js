import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createPlantControl,stepPlantControl} from '../src/plant-controls.js';
import {createExhibitControl,stepExhibitControl} from '../src/exhibit-controls.js';
const read=path=>JSON.parse(fs.readFileSync(path));
const before=read('tests/fixtures/pre-kelly-wonderland.json');
const landmarks=read('tests/fixtures/kelly-interaction-landmarks.json');
test('optional authored landmarks remain supported independently of the restored Kelly artwork',()=>{
 for(const geometry of [landmarks.giant_piano_sunflower,landmarks.keyboard_corn]){
  let state=null;for(const [note,[x,y]]of geometry.keyboardKeys.entries()){const e={x,y,at:1000+note*100,geometry};const result=state?stepPlantControl(state,{...e,type:'move'}):createPlantControl('keyboard',e);assert.equal(result.events[0].note,note);state=result.state;assert.equal(stepPlantControl(state,{...e,type:'hold',at:e.at+10}).events.length,0);}
 }
 const drums=landmarks.drum_pumpkin;for(const [zone,[x,y]]of drums.drumZones.entries())assert.equal(createPlantControl('drum',{x,y,at:0,geometry:drums}).events[0].zone,zone);
 const geometry=landmarks.portrait_rehearsal_pavilion;let state=null;for(const [note,[x,y]]of geometry.rehearsalZones.entries()){const e={x,y,at:1000+note*100,geometry};const result=state?stepExhibitControl(state,{...e,type:'move'}):createExhibitControl('rehearsal',e);assert.equal(result.events[0].note,note);state=result.state;assert.equal(stepExhibitControl(state,{...e,type:'hold'}).events.length,0);}
});
const restored=read('tests/fixtures/kelly-v26-restoration.json');
test('Kelly retains the v26 musical landmarks and footprint after the requested denser ordinary planting',()=>{
 const kelly=read('assets/garden-compositions.json').gardens.find(g=>g.id==='demo-kelly-music'),old=before.gardens.find(g=>g.id===kelly.id);
 assert.equal(kelly.rows.join('').replaceAll('.','').length,28);assert.deepEqual(kelly.buildings,old.buildings);assert.deepEqual(kelly.palette,old.palette);
 for(const plant of old.plants)assert.deepEqual(kelly.plants.find(p=>p.id===plant.id),plant);
 assert.deepEqual(kelly.cells.map(({x,z})=>[x,z]),old.cells.map(({x,z})=>[x,z]));
});
test('Kelly restores all five v26 sprite definitions with original frames and anchors, without stale landmark geometry',()=>{
 const sprites=read('assets/art-manifest.json').sprites;
 for(const [id,old]of Object.entries(before.sprites)){assert.deepEqual(sprites[id],old,id);assert.equal(sprites[id].interactionLandmarks,undefined);}
 for(const [path,hash]of Object.entries(restored.imageHashes))assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash,path);
});
test('Kelly restores the v26 selfie and source association while other three selfies remain byte-identical',()=>{
 const photos=read('assets/photo-samples-manifest.json').photos;assert.deepEqual(photos['demo-kelly-music'],restored.photo);
 const album=read('assets/memory-album-manifest.json');assert.equal(album.image,restored.sourceImage);assert.deepEqual(album.frames['kelly-friend-photo'],restored.source);
 for(const [id,entry]of Object.entries(before.otherPhotos))assert.deepEqual(photos[id],entry);
 for(const [path,hash]of Object.entries(before.photoHashes))assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash);
});
test('restored Kelly artwork uses the original five keys, two drum zones and three rehearsal targets without repeated holds',()=>{
 const sprites=read('assets/art-manifest.json').sprites;
 for(const id of ['giant_piano_sunflower','keyboard_corn']){
  const geometry=sprites[id].interactionLandmarks;let state=null;
  for(const [note,x]of [.1,.3,.5,.7,.9].entries()){const e={x,y:.5,at:1000+note*100,geometry};const r=state?stepPlantControl(state,{...e,type:'move'}):createPlantControl('keyboard',e);assert.equal(r.events[0].note,note);state=r.state;assert.equal(stepPlantControl(state,{...e,type:'hold',at:e.at+10}).events.length,0);}
 }
 for(const [zone,x]of [.25,.75].entries())assert.equal(createPlantControl('drum',{x,y:.5,at:0,geometry:sprites.drum_pumpkin.interactionLandmarks}).events[0].zone,zone);
 let state=null;for(const [note,[x,y]]of [[.31,.33],[.5,.37],[.39,.69]].entries()){const e={x,y,at:1000+note*100,geometry:sprites.portrait_rehearsal_pavilion.interactionLandmarks};const r=state?stepExhibitControl(state,{...e,type:'move'}):createExhibitControl('rehearsal',e);assert.equal(r.events[0].note,note);state=r.state;assert.equal(stepExhibitControl(state,{...e,type:'hold'}).events.length,0);}
});
import * as authored from '../src/interaction-landmarks.js';
test('full-frame contact conversion round trips authored points at normal and maximum zoom with sway and scale',()=>{
 for(const zoom of [1,2.2])for(const point of [[.3,.4],[.8,.55]]){const art={x:412,y:300,width:214*zoom,height:214*zoom,anchor:[.51,.79],angle:.13,sx:1.02,sy:.97};const screen=authored.landmarkScreenPoint(art,point),local=authored.landmarkContactPoint(art,screen);assert.ok(Math.abs(local.x-point[0])<1e-10);assert.ok(Math.abs(local.y-point[1])<1e-10);}
});
