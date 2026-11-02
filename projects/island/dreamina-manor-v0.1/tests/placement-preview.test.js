import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {placementPreview}from'../lib/world/placement-preview.js';import{displayActionLabel}from'../lib/game/presentation.js';
test('a first two-cell tank lights its full footprint without inventing a second selectable anchor',()=>{
 const candidates=[{x:0,z:0},{x:0,z:1}],footprint=[{x:0,z:0},{x:1,z:0}],out=placementPreview(candidates,footprint);
 assert.equal(out.filter(p=>p.selected).length,2);assert.deepEqual(out.filter(p=>p.selectable).map(p=>p.cell),candidates);assert.deepEqual(out.find(p=>!p.selectable).cell,{x:1,z:0});
 const turned=placementPreview([{x:0,z:0}], [{x:0,z:0},{x:0,z:1}]);assert.equal(turned.length,2);assert.equal(turned.some(p=>p.cell.x===1),false);assert.equal(placementPreview([],[]).length,0);
});
test('display labels name the actual destination and empty tank filter is temporary',()=>{
 assert.equal(displayActionLabel({kind:'fish'}),'放进鱼缸');assert.equal(displayActionLabel({kind:'plant'}),'摆在岛上');const ui=fs.readFileSync('components/manor/Manor.tsx','utf8');assert.match(ui,/<TankManager /);const manager=fs.readFileSync('components/manor/TankManager.tsx','utf8');assert.match(manager,/inside\?'收回':'展示'/);assert.match(ui,/返回鱼缸/);assert.match(ui,/查看全部/);assert.match(ui,/visibleHarvest=fishFromTank\?harvest.filter/);assert.match(ui,/target.kind==='placement-footprint'\|\|target.kind==='construction'\|\|target.kind==='miss'\)return/);assert.match(ui,/setFishFromTank\(false\);setTab\('bag'\)/);
});
test('tank observation frames completed tank, preserves player pose and does not follow fish',()=>{
 const scene=fs.readFileSync('lib/world/scene.js','utf8');assert.match(scene,/tankBounds\(state.tank/);assert.match(scene,/waterHeight:tankTargetHeight/);assert.match(scene,/ART.followOrbit\(camera,controls.target,observation.centre/);assert.doesNotMatch(scene,/fish.root.localToWorld\(fish.observationCentre/);assert.match(scene,/pan:framing.offset\(\)/);assert.match(scene,/framing.setOffset\(saved.pan\)/);assert.match(scene,/controls.minZoom=saved.minZoom/);assert.match(scene,/previousTankHeight-tankTargetHeight/);assert.match(scene,/camera.position.copy\(controls.target\).add\(viewRestore.offset\)/);
 const manual=scene.match(/const manualOrbit=\(\)=>\{([^}]*)/)[1];assert.doesNotMatch(manual,/restorePlayerView/);
 const ui=fs.readFileSync('components/manor/Manor.tsx','utf8');assert.match(ui,/tab==='tank'&&!collapsed&&!mode/);assert.match(ui,/restorePlayerView\?\.\(\);setTab\('bag'\)/);
});
