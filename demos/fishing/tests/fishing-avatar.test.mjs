import './room-loader.mjs';import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const {createFishingAvatar}=await import('../lib/fishing-avatar.ts');
async function template(kind){const b=readFileSync(new URL(`../public/avatars/${kind}.glb`,import.meta.url));return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}
test('fishing pose plants feet, supports catch with both arms and stays finite',async()=>{for(const kind of ['human-subeike','cat','frog','capybara','panda']){const a=createFishingAvatar(kind,'test',{template:await template(kind)});a.updateFishing(1,'waiting',false,1);const before=a.root.getObjectByName('hand_L').quaternion.clone();a.updateFishing(2,'holding',false,1);assert.ok(before.angleTo(a.root.getObjectByName('hand_L').quaternion)>.01,kind+' holding pose differs');a.root.traverse(o=>{for(const n of [...o.position.toArray(),...o.quaternion.toArray()])assert.ok(Number.isFinite(n));});assert.deepEqual(a.root.position.toArray(),[0,0,0]);a.dispose();}});

test('cast and haul move every fishing rig while feet stay planted and the rod follows both wrists',async()=>{
 const THREE=await import('three');const {sampleFishingAction}=await import('../lib/fishing-action-motion.ts');
 const {AVATAR_PRESETS,resolveAvatarPreset}=await import('../lib/room-types.ts');
 const rootPoint=(avatar,name)=>avatar.root.worldToLocal(avatar.root.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
 const cast={phase:'waiting',castAt:1000};
 const caught={phase:'holding',catch:{id:'rig-catch',speciesId:'tuna',lengthCm:160,weightKg:18,caughtAt:5000}};
 for(const kind of AVATAR_PRESETS){
  const avatar=createFishingAvatar(kind,'anchored',{template:await template(resolveAvatarPreset(kind))});
  const outer=new THREE.Group();outer.position.set(-2.23,1.54,2.4);outer.rotation.set(.004,-Math.PI/2,.006);outer.add(avatar.root);outer.updateMatrixWorld(true);
  avatar.updateFishing(1,'waiting',false,1,sampleFishingAction(cast,3000));
  assert.ok(avatar.rodPosition instanceof THREE.Vector3,'avatar exposes root-local rod anchor');
  assert.ok(avatar.rodQuaternion instanceof THREE.Quaternion);
  const restHand=rootPoint(avatar,'hand_R');
  const feet=['foot_L','foot_R'].map(name=>rootPoint(avatar,name));
  for(const [state,now] of [[cast,1300],[cast,1510],[cast,1800],[caught,5250],[caught,5700]]){
   const pose=sampleFishingAction(state,now);avatar.updateFishing(now/1000,state.phase,false,1,pose);
   const right=rootPoint(avatar,'hand_R'),left=rootPoint(avatar,'hand_L');
   assert.ok(right.distanceTo(avatar.rodPosition)<1e-5,`${kind} right hand holds rod`);
   const axis=new THREE.Vector3(.02,.9,.85).normalize().applyQuaternion(avatar.rodQuaternion);
   const between=left.clone().sub(right);assert.ok(between.length()>.04,`${kind} has distinct grip points`);
   if(kind!=='sword-shield-dog')assert.ok(axis.dot(between.normalize())>.99999,`${kind} both hands remain on rod axis in ${pose.stage}`);
   for(const [i,name] of ['foot_L','foot_R'].entries())assert.ok(rootPoint(avatar,name).distanceTo(feet[i])<1e-5,`${kind} ${name} stays planted`);
   assert.deepEqual(avatar.root.scale.toArray(),[1,1,1]);
   if(now===1300)assert.ok(right.distanceTo(restHand)>.12,`${kind} has a readable windup gesture`);
  }
  avatar.dispose();
 }
});

test('idle and escaped hold an upright rod in one hand, free arm relaxed, feet unchanged',async()=>{
 const THREE=await import('three');const {sampleFishingAction}=await import('../lib/fishing-action-motion.ts');
 const {AVATAR_PRESETS,resolveAvatarPreset}=await import('../lib/room-types.ts');
 const point=(a,name)=>a.root.worldToLocal(a.root.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
 for(const kind of AVATAR_PRESETS){
  const a=createFishingAvatar(kind,'resting',{template:await template(resolveAvatarPreset(kind))});
  a.updateFishing(1,'waiting');const feet=['foot_L','foot_R'].map(n=>point(a,n));const activeLeft=point(a,'hand_L');
  for(const phase of ['idle','escaped'])for(const reduced of [false,true]){
   a.updateFishing(2,phase,reduced,1,sampleFishingAction({phase},2000,reduced));
   const axis=new THREE.Vector3(.02,.9,.85).normalize().applyQuaternion(a.rodQuaternion);
   assert.ok(axis.dot(new THREE.Vector3(0,1,0))>.9999,kind+' resting rod is upright');
   assert.ok(point(a,'hand_R').distanceTo(a.rodPosition)<1e-5,kind+' grip anchored');
   const left=point(a,'hand_L'),shoulder=point(a,'upperArm_L');
   assert.ok(left.y<shoulder.y-.025,kind+' free arm hangs below shoulder');
   assert.ok(left.distanceTo(activeLeft)>.025,kind+' free arm differs from fishing grip');
   assert.ok(new THREE.Vector3().crossVectors(left.clone().sub(a.rodPosition),axis).length()>.1,kind+' free hand is away from rod');
   for(const [i,n]of ['foot_L','foot_R'].entries())assert.ok(point(a,n).distanceTo(feet[i])<1e-5,kind+' grounded feet');
  }
  a.dispose();
 }
});

test('late model load applies the latest fishing pose before ready and cannot revive disposed instances',async(t)=>{
 const THREE=await import('three');const source=await template('cat');
 const hadWindow=Object.hasOwn(globalThis,'window'),oldWindow=globalThis.window;
 globalThis.window={};t.after(()=>{if(hadWindow)globalThis.window=oldWindow;else delete globalThis.window;});
 let finish;t.mock.method(GLTFLoader.prototype,'loadAsync',()=>new Promise(resolve=>{finish=resolve;}));
 const a=createFishingAvatar('cat','late-fishing'),disposed=createFishingAvatar('cat','disposed-fishing');
 a.updateFishing(1,'waiting');a.updateFishing(2,'idle');disposed.updateFishing(1,'waiting');disposed.dispose();
 finish({scene:source});await Promise.all([a.ready,disposed.ready]);
 const expected=createFishingAvatar('cat','late-fishing',{template:source});expected.updateFishing(2,'idle');
 assert.ok(a.rodPosition.distanceTo(expected.rodPosition)<1e-6,'latest pose and rod anchor applied before ready');
 assert.ok(a.rodQuaternion.angleTo(expected.rodQuaternion)<1e-6);
 assert.equal(a.footprintRadius,expected.footprintRadius,'late-loaded species footprint must update marker sizing');
 assert.ok(new THREE.Vector3(.02,.9,.85).normalize().applyQuaternion(a.rodQuaternion).y>.9999);
 assert.equal(disposed.loaded,false);assert.equal(disposed.root.children.length,0);
 a.dispose();expected.dispose();
});

test('upright resting shaft clears each avatar body and head',async()=>{
 const THREE=await import('three');const {AVATAR_PRESETS,resolveAvatarPreset}=await import('../lib/room-types.ts');
 for(const kind of AVATAR_PRESETS){const a=createFishingAvatar(kind,'rod-clearance',{template:await template(resolveAvatarPreset(kind))});
  a.updateFishing(0,'idle',true);
  for(const [x,z] of [[0,0],[.03,0],[-.03,0],[0,.03],[0,-.03]]){
   const ray=new THREE.Raycaster(a.rodPosition.clone().add(new THREE.Vector3(x,.15,z)),new THREE.Vector3(0,1,0),0,2.2);
   const hits=ray.intersectObject(a.root,true).filter(hit=>hit.object.visible);
   assert.deepEqual(hits.map(hit=>hit.object.name),[],kind+' resting shaft thickness must clear body/head');
  }a.dispose();
 }
});

test('fishing dog removes weapon triangles immediately and after a delayed load',async(t)=>{
 const source=await template('sword-shield-dog');
 const triangles=root=>{let total=0;root.traverse(o=>{if(o.isMesh)total+=o.geometry.index.count/3;});return total;};
 const total=triangles(source),a=createFishingAvatar('sword-shield-dog','synchronous-props',{template:source});
 assert.equal(triangles(a.root),total-1876,'synchronous fishing instance is already weapon-free');
 const hadWindow=Object.hasOwn(globalThis,'window'),oldWindow=globalThis.window;
 globalThis.window={};t.after(()=>{if(hadWindow)globalThis.window=oldWindow;else delete globalThis.window;});
 let finish;t.mock.method(GLTFLoader.prototype,'loadAsync',()=>new Promise(resolve=>{finish=resolve;}));
 const late=createFishingAvatar('sword-shield-dog','late-props');late.updateFishing(2,'waiting');
 finish({scene:source});await late.ready;
 assert.equal(triangles(late.root),total-1876,'late load is weapon-free before ready');
 assert.equal(triangles(source),total,'cached source unchanged');
 a.dispose();late.dispose();
});
