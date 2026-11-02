import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {SEA_SURFACE_Y,GROUND_TOP_Y} from '../lib/art/physical-contract.js';
import {createGroundTemplate} from '../lib/art/ground-tile.js';
import {createDockArt,createRodStationArt} from '../lib/art/dock.js';
import {createShoreField} from '../lib/art/shore-field.js';

test('reference ground tint preserves original chroma and shore exposed fraction',()=>{
 const source=new T.Group();source.add(new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()));const ground=createGroundTemplate(source),m=ground.children[0].children[0].material,s={fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>'};m.onBeforeCompile(s);assert.match(s.fragmentShader,/vec3\(\.93,\.96,\.86\)/);assert.doesNotMatch(s.fragmentShader,/luminance|soilMask/);assert.equal(GROUND_TOP_Y,.45);
 const bottom=-.8655249926662445,top=.5007299926662445;assert.ok(Math.abs((top-SEA_SURFACE_Y)/(top-bottom)-.6785258308370431)<1e-7);
});
test('lowered sea retains submerged piles and coupled rod line, float, rings and splash',()=>{
 const dock=createDockArt();dock.root.position.y=GROUND_TOP_Y;dock.root.updateMatrixWorld(true);const piles=[];dock.root.traverse(n=>{if(n.geometry?.type==='CylinderGeometry'&&n.geometry.parameters.radiusTop===.12)piles.push(n)});assert.equal(piles.length,4);for(const n of piles){const b=new T.Box3().setFromObject(n);assert.ok(b.min.y<=SEA_SURFACE_Y-.099);assert.ok(Math.abs(b.max.y-.50)<1e-6);}
 const rod=createRodStationArt();rod.root.position.y=GROUND_TOP_Y;for(const state of ['working','ready'])for(let i=0;i<120;i++){rod.pose({state,time:i/30,readyAge:4});rod.root.updateMatrixWorld(true);const f=rod.root.getObjectByName('RespondingFloat'),ring=rod.root.getObjectByName('MatureSurfacePulse'),line=rod.root.getObjectByName('FishingLine');assert.ok(f.getWorldPosition(new T.Vector3()).y<=SEA_SURFACE_Y+.05);assert.ok(Math.abs(ring.getWorldPosition(new T.Vector3()).y-(SEA_SURFACE_Y+.025))<1e-6);const a=new T.Vector3(0,.5,0).applyMatrix4(line.matrixWorld),b=new T.Vector3(0,-.5,0).applyMatrix4(line.matrixWorld),tip=rod.rodTipLocal().applyMatrix4(rod.root.matrixWorld),end=rod.floatLocal().add(new T.Vector3(0,.2,0)).applyMatrix4(rod.root.matrixWorld);assert.ok(Math.min(a.distanceTo(tip)+b.distanceTo(end),a.distanceTo(end)+b.distanceTo(tip))<1e-6);}
 rod.dispose();dock.dispose();
});
test('dynamic shore restores reference depth with a shared rock floor, not fixed 2x2',async()=>{
 const {seabedHeight}=await import('../lib/art/seabed.js');for(const cells of[[{x:0,z:0}],[{x:20,z:-10},{x:21,z:-10},{x:20,z:-9}]]){const f=createShoreField(cells);for(const e of f.edges){const y=seabedHeight(e.x,e.z,f.distance(e.x,e.z,true),SEA_SURFACE_Y);assert.ok(SEA_SURFACE_Y-y>=1.35&&SEA_SURFACE_Y-y<=1.56);}f.texture.dispose();}
 assert.ok(seabedHeight(0,0,8,SEA_SURFACE_Y)<seabedHeight(0,0,0,SEA_SURFACE_Y)-3);for(const p of['lagoon.js','manor-lagoon.js'])assert.match(readFileSync(new URL('../lib/art/'+p,import.meta.url),'utf8'),/seabedHeight\(/);
 const shader=readFileSync(new URL('../lib/art/lagoon.js',import.meta.url),'utf8');for(const text of['vec3(1.9,.55,.24)','vec3(.002,.39,.71)','vec3(.002,.19,.52)','vec3(.4,.84,1.03)',"color:'#e5d8ac'"])assert.ok(shader.includes(text));
});
