import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fishingSceneHarness,participant} from './helpers/fishing-scene-harness.mjs';

const changed=(a,b,message)=>assert.ok(a.distanceTo(b)>.1,message);
test('production canvas owns touch gestures rather than allowing page panning',async t=>{
 const h=await fishingSceneHarness();t.after(()=>h.dispose());
 assert.equal(h.canvas.style.touchAction,'none');
 assert.equal(h.event('pointerdown').defaultPrevented,true);
 assert.equal(h.event('pointermove',{clientY:345}).defaultPrevented,true);
});
for(const phase of ['idle','waiting','bite','escaped','holding'])test(`production RAF keeps yaw, pitch and zoom available while ${phase}`,async t=>{
 const p=participant(phase,phase==='bite'?{biteAt:1_799_999_998_000,expiresAt:1_800_000_100_000}:{});
 const h=await fishingSceneHarness({participants:[p],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());h.frames();
 const start=h.camera.position.clone();h.event('pointerdown');h.event('pointermove',{clientX:230});h.event('pointerup',{clientX:230});h.frames();
 const yaw=h.camera.position.clone();changed(start,yaw,'horizontal drag changes actual rendered camera');
 h.event('pointerdown');h.event('pointermove',{clientY:250});h.event('pointerup',{clientY:250});h.frames();
 const pitch=h.camera.position.clone();changed(yaw,pitch,'vertical drag changes actual rendered camera');
 h.event('pointerdown',{pointerId:1,clientX:100});h.event('pointerdown',{pointerId:2,clientX:200,isPrimary:false});
 h.event('pointermove',{pointerId:2,clientX:260,isPrimary:false});h.event('pointerup',{pointerId:2,clientX:260});h.event('pointerup',{pointerId:1,clientX:100});h.frames();
 const zoom=h.camera.position.clone();changed(pitch,zoom,'two-finger spread changes actual rendered camera');
 h.frames();assert.ok(h.camera.position.distanceTo(zoom)<.001,'steady phase does not overwrite manual camera next frame');
 const wheel=h.event('wheel',{deltaY:220,deltaMode:0});assert.equal(wheel.defaultPrevented,true);h.frames();changed(zoom,h.camera.position,'desktop wheel zoom reaches rendered camera');
});
test('new catch reveals once, preserves subsequent orbit and allows explicit camera mode switch',async t=>{
 const h=await fishingSceneHarness({participants:[participant('waiting')],ownId:'self',cameraMode:'deck'});t.after(()=>h.dispose());h.frames();const before=h.camera.position.clone();
 h.render({participants:[participant('holding')]});h.step();await h.settleCatches();h.frames();changed(before,h.camera.position,'new catch gets automatic framing');
 h.event('pointerdown');h.event('pointermove',{clientX:270,clientY:250});h.event('pointerup');h.frames();const manual=h.camera.position.clone();
 h.render({participants:[{...participant('holding'),lastSeenAt:h.now()}]});h.frames();assert.ok(manual.distanceTo(h.camera.position)<.001,'new snapshot for same catch does not reset orbit');
 h.render({cameraMode:'overview'});h.frames();changed(manual,h.camera.position,'camera toggle can leave catch closeup');
 const toggled=h.camera.position.clone();h.frames();assert.ok(toggled.distanceTo(h.camera.position)<.001,'holding does not force closeup again');
});
test('canvas event listeners and pointer capture are released on disposal',async()=>{
 const h=await fishingSceneHarness();h.event('pointerdown');assert.equal(h.canvas.captured.size,1);h.dispose();
 assert.equal(h.canvas.captured.size,0,'cleanup releases captured pointer');
 assert.equal(h.event('wheel',{deltaY:100,deltaMode:0}).defaultPrevented,false,'no dangling scroll interception');
});
test('camera touch containment leaves sheets and profile vertically scrollable',()=>{
 const css=readFileSync(new URL('../components/fishing/FishingFeed.css',import.meta.url),'utf8').replace(/\s+/g,'');
 assert.match(css,/\.fishing-shell\{[^}]*overscroll-behavior:none/);
 assert.match(css,/\.yacht-canvascanvas\{[^}]*touch-action:none/);
 assert.match(css,/\.fishing-sheet[^}]*\{[^}]*touch-action:pan-y/);
 assert.match(css,/\.fishing-feed\.profile-scroll[^}]*\{[^}]*touch-action:pan-y/);
 assert.doesNotMatch(css,/\.fishing-(?:shell|feed)\{[^}]*touch-action:none/,'canvas lock must not disable panel gestures');
});

test('pinch release rebases surviving finger without jumping or trapping page controls',async t=>{
 const h=await fishingSceneHarness();t.after(()=>h.dispose());h.frames();
 h.event('pointerdown',{pointerId:1,clientX:100});h.event('pointerdown',{pointerId:2,clientX:200,isPrimary:false});
 h.event('pointermove',{pointerId:1,clientX:80});h.event('pointermove',{pointerId:2,clientX:240,isPrimary:false});h.frames();
 const before=h.camera.position.clone();h.event('pointerup',{pointerId:2,clientX:240});h.event('pointermove',{pointerId:1,clientX:80});h.frames();
 assert.ok(before.distanceTo(h.camera.position)<.001,'same-position surviving finger is not a drag');
 h.event('pointermove',{pointerId:1,clientX:100});h.frames();changed(before,h.camera.position,'surviving finger resumes orbit from its current location');
 const panelEvent=h.pointer('wheel',{deltaY:120});h.document.dispatchEvent(panelEvent);assert.equal(panelEvent.defaultPrevented,false,'canvas listener never intercepts panel/document wheel');
});
for(const interruption of ['pointercancel','lostpointercapture','blur','hidden','disabled'])test(`interrupted ${interruption} gesture cannot resume with stale deltas`,async t=>{
 const h=await fishingSceneHarness();t.after(()=>h.dispose());h.frames();h.event('pointerdown');
 if(interruption==='pointercancel')h.event('pointercancel');
 if(interruption==='lostpointercapture')h.canvas.releasePointerCapture(1);
 if(interruption==='blur')h.window.dispatchEvent(new Event('blur'));
 if(interruption==='hidden'){h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));h.document.hidden=false;}
 if(interruption==='disabled'){h.render({enabled:false});h.step();h.render({enabled:true});}
 const before=h.camera.position.clone();h.event('pointermove',{clientX:300,clientY:230});h.frames();assert.ok(before.distanceTo(h.camera.position)<.001);
 assert.equal(h.canvas.captured.size,0);h.event('pointerdown');h.event('pointermove',{clientX:180});h.frames();changed(before,h.camera.position,'fresh gesture still works');
});

test('production action sampling shows rod casting and a flying float before steady waiting',async t=>{
 const p=participant('waiting',{castAt:1_800_000_000_000});
 const h=await fishingSceneHarness({participants:[p],ownId:'self',cameraMode:'deck',reducedMotion:false});t.after(()=>h.dispose());
 const angler=h.world.scene.getObjectByName('Angler 小浪'),rod=angler.children[1];
 const start=rod.quaternion.clone();h.step(260);assert.ok(1-Math.abs(start.dot(rod.quaternion))>.05,'windup rotates the actual fishing rod');
 const lines=[];h.world.scene.children.forEach(child=>{if(child.isLine)lines.push(child);});const line=lines[0];
 h.step(500);const mid=line.geometry.attributes.position;const flight={x:mid.getX(2),y:mid.getY(2),z:mid.getZ(2)};
 h.step(1000);const end=line.geometry.attributes.position;assert.ok(Math.hypot(flight.x-end.getX(2),flight.y-end.getY(2),flight.z-end.getZ(2))>1,'float visibly travels from the rod to the sea');
});
test('production haul lifts a catch from the water before turning into its showcase',async t=>{
 const p=participant('holding',{catch:{id:'haul-a',speciesId:'clownfish',lengthCm:14,weightKg:.08,caughtAt:1_800_000_000_000}});
 const h=await fishingSceneHarness({participants:[p],ownId:'self',cameraMode:'deck',reducedMotion:false});t.after(()=>h.dispose());
 const angler=h.world.scene.getObjectByName('Angler 小浪'),rod=angler.children[1],catchModel=angler.children[2];
 assert.equal(rod.visible,true,'rod remains in hand for the opening reel');assert.equal(catchModel.visible,false,'catch is initially below the sea');
 h.step(320);assert.equal(catchModel.visible,true);const water=catchModel.getWorldPosition(catchModel.position.clone());
 const line=h.world.scene.children.find(child=>child.isLine);
 const lineGap=point=>{const p=line.geometry.attributes.position;return Math.hypot(p.getX(2)-point.x,p.getY(2)-point.y,p.getZ(2)-point.z);};
 assert.ok(lineGap(water)<1e-5,'world-space line ends at the arriving fish, not its avatar-local coordinates');
 h.step(600);const lifted=catchModel.getWorldPosition(catchModel.position.clone());assert.ok(lifted.y>water.y+.5,'catch comes up out of the sea');
 assert.ok(lineGap(lifted)<1e-5,'line follows the fish while the boat and actor move');
 h.step(900);assert.equal(rod.visible,false,'rod stows once catch arrives');h.frames(20);assert.ok(Math.abs(angler.rotation.y)<.8,'avatar turns toward showcase only after lifting');
});

test('scene animates only the two ambient actors authorized by its separate snapshot field',async t=>{
 const {projectFishingAmbientParticipants}=await import('../lib/fishing-ambient.ts');
 const ambient=projectFishingAmbientParticipants(1_800_000_000_000).map((p,i)=>({...p,slot:i*5}));
 const h=await fishingSceneHarness({ambientParticipants:ambient});t.after(()=>h.dispose());
 const anglers=()=>h.world.yacht.children.filter(child=>child.name.startsWith('Angler '));
 assert.equal(anglers().length,2);assert.equal(h.labels.children.length,2);
 assert.ok(anglers().every(group=>group.position.y<2),'ambient positions follow the server-assigned main-deck seats');
 h.step(40_000);assert.equal(anglers().length,2,'local projection advances the same ambient actors');
 assert.ok(h.labels.children.every(label=>!label.textContent.includes('NPC')),'ambient names stay natural');
 h.render({ambientParticipants:[]});h.step();assert.equal(anglers().length,0,'removing server ambience removes its rendered actors');
});

test('delayed cast and reel acknowledgements still run one visual gesture without extending the bite phase',async t=>{
 const h=await fishingSceneHarness({participants:[participant('idle')],ownId:'self',cameraMode:'deck',reducedMotion:false});t.after(()=>h.dispose());
 const angler=h.world.scene.getObjectByName('Angler 小浪'),rod=angler.children[1];const rest=rod.quaternion.clone();
 const cast=participant('waiting',{castId:'late-cast',castAt:h.now()-2000,biteAt:h.now()+1000,expiresAt:h.now()+4000});
 h.render({participants:[cast]});h.step();h.frames(5);assert.ok(rest.angleTo(rod.quaternion)>.3,'late cast ACK still swings back from the upright rest pose');
 const windup=rod.quaternion.clone();
 h.step(1100);assert.match(h.labels.children[0].textContent,/咬钩/,'server deadline takes priority over visual casting');
 assert.ok(windup.angleTo(rod.quaternion)>.6,'active bite grip differs clearly from the cast backswing');
 const caught=participant('holding',{castId:'late-cast',catch:{id:'late-catch',speciesId:'clownfish',lengthCm:14,weightKg:.08,caughtAt:h.now()-2000}});
 h.render({participants:[caught]});h.step();assert.equal(rod.visible,true,'late reel ACK does not skip hauling');await h.settleCatches();
 h.frames(50);assert.equal(rod.visible,false,'one-shot haul finishes');
 h.render({participants:[{...caught,lastSeenAt:h.now()}]});h.step();assert.equal(rod.visible,false,'same catch snapshot cannot restart hauling');
});

test('default overview fits the actual narrow yacht with sea gutters in the 390×758 portrait view',async t=>{
 const THREE=await import('three');const h=await fishingSceneHarness();t.after(()=>h.dispose());
 const hull=h.world.scene.getObjectByName('Sculpted ivory hull');h.world.scene.updateMatrixWorld(true);
 let minX=Infinity,maxX=-Infinity;const vertex=new THREE.Vector3();
 for(let i=0;i<hull.geometry.attributes.position.count;i++){vertex.fromBufferAttribute(hull.geometry.attributes.position,i).applyMatrix4(hull.matrixWorld).project(h.camera);minX=Math.min(minX,vertex.x);maxX=Math.max(maxX,vertex.x);}
 assert.equal(h.camera.view.offsetY,66,'production vertical framing offset is present');
 assert.ok(minX>=-.8&&maxX<=.8,`at least 10% sea gutter on both sides: ${minX}, ${maxX}`);
});

test('portrait overview keeps the yacht readable rather than fitting empty bounding-box corners',async t=>{
 const THREE=await import('three');const h=await fishingSceneHarness();t.after(()=>h.dispose());
 const distance=h.camera.position.distanceTo(new THREE.Vector3(0,1,0));
 assert.ok(distance>=52&&distance<=58,`readable default overview stays near55 units, got ${distance}`);
});
