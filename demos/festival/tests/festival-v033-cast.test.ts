import './room-loader.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar, CLUB_AVATAR_KINDS } from '../lib/club-avatar-rig.ts';
import { CLUB_AVATAR_CATALOG, CLUB_AVATAR_PICKER_OPTIONS } from '../lib/club-avatar-catalog.ts';
import { resolveAvatarPreset } from '../lib/room-types.ts';
import { createFestivalBuilderAvatar } from '../lib/festival-builder-avatar.ts';
import { createFestivalCelebrationAvatar } from '../src/desert/celebration-avatar.ts';
const { projectFestivalAmbientParticipants } = await import('../lib/festival-ambient.ts');
const { festivalRoundAt } = await import('../lib/festival-types.ts');
import { UPLOADED_CAST, EXPECTED_HEIGHTS, uploadedTemplate, actualBounds, boneState } from './helpers/uploaded-avatar.ts';

const names=['奶蛙','牛来','肥嘟嘟','喵脆角','香蕉猫','刀盾狗','LX','Kelly','Bear熊','苏贝壳','吉吉','Jiaxin'];
const world=(root:THREE.Object3D,name:string)=>root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());

test('festival v0.3.3 selects exactly the twelve named uploaded models in approved row order',()=>{
 assert.deepEqual(CLUB_AVATAR_KINDS,UPLOADED_CAST);
 assert.deepEqual(CLUB_AVATAR_PICKER_OPTIONS.map(a=>a.label),names);
 assert.deepEqual(CLUB_AVATAR_CATALOG.map(a=>a.id),UPLOADED_CAST);
 for(const avatar of CLUB_AVATAR_CATALOG){
  assert.equal(avatar.previewImage,`/avatars/portraits/${avatar.id}.webp`);
  const path=new URL(`../public/avatars/cast-v1/${avatar.id}.glb`,import.meta.url);
  assert.ok(existsSync(path),`${avatar.id} actual model exists`);
 }
});

test('published festival model files preserve uploaded texture bytes and the revised 1.5m cow',()=>{
 const path=new URL('../public/avatars/cast-v1/manifest.json',import.meta.url);
 assert.ok(existsSync(path),'published model manifest exists');
 const manifest=JSON.parse(readFileSync(path,'utf8'));
 assert.deepEqual(manifest.models.map((row:{id:string})=>row.id),UPLOADED_CAST);
 for(const row of manifest.models){
  const bytes=readFileSync(new URL(`../public/avatars/cast-v1/${row.id}.glb`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  const data=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.ok(data.images.length>=3&&data.images.every((image:{bufferView:number})=>Number.isInteger(image.bufferView)));
  if(row.id==='niulai'){assert.equal(data.asset.extras.heightMetres,1.5);assert.deepEqual(data.nodes[data.scenes[0].nodes[0]].scale,[15/11,15/11,15/11]);}
 }
});

test('the four ambient visitors stay distinct canonical animals/humans without adding NPCs',()=>{
 const start=1_800_000_000_000;
 for(let index=0;index<24;index++){
  const round=festivalRoundAt(index,start,start);
  const people=projectFestivalAmbientParticipants(round,start+31_000,[]);
  assert.equal(people.length,4);assert.equal(new Set(people.map(p=>p.preset)).size,4);
  assert.ok(people.every(p=>(UPLOADED_CAST as readonly string[]).includes(p.preset)));
 }
});

test('legacy preset replacements are compared canonically so old rooms do not recreate avatars every frame',()=>{
 assert.equal(resolveAvatarPreset('cat'),'miaocuijiao');assert.equal(resolveAvatarPreset('monster-blob'),'feidudu');
 const source=readFileSync(new URL('../components/DesertScene.tsx',import.meta.url),'utf8');
 assert.match(source,/visual\.avatar\.kind!==resolveAvatarPreset\(p\.preset\)/);
 assert.ok(source.includes('avatar.root.scale.setScalar(FESTIVAL_AVATAR_SCENE_SCALE)'),'use shared festival scene scale');
});

for(const [index,kind] of UPLOADED_CAST.entries())test(`${kind}: original dimensions, true skin walking, held hammer and species-appropriate burn celebration`,async()=>{
 const path=new URL(`../public/avatars/cast-v1/${kind}.glb`,import.meta.url);assert.ok(existsSync(path),'real cast asset shipped');
 const avatar=createClubAvatar(kind,`festival:${kind}`,{mode:'desert',template:await uploadedTemplate(kind)});
 assert.ok(Math.abs(avatar.height-EXPECTED_HEIGHTS[index])<.0001,`original height ${avatar.height}`);
 avatar.root.scale.setScalar(4);avatar.update(0,'dance',false,0);
 const resting=actualBounds(avatar.root);assert.ok(Math.abs(resting.min.y)<.035,`rest floor ${resting.min.y}`);
 const first=boneState(avatar.root), poses=new Set<string>();
 for(const distance of [.13,.37,.71,1.1,1.8]){
  const x=12,z=-16,heading=.8;avatar.root.position.set(x,0,z);avatar.root.rotation.y=heading;
  avatar.update(distance,'dance',false,0,{slot:0,x,z,heading,speed:5.4,distance,walkBlend:1,action:'dance',sampleAtDistance:sample=>({x:x+Math.sin(heading)*(sample-distance),z:z+Math.cos(heading)*(sample-distance),heading})});
  poses.add(JSON.stringify(boneState(avatar.root)));const bounds=actualBounds(avatar.root);
  assert.ok(bounds.min.y>=-.08,`walking skin floor ${bounds.min.y}`);
  avatar.root.traverse(node=>{if(node instanceof THREE.Bone)assert.ok(Math.abs(node.quaternion.length()-1)<.0001,`${kind}: unit quaternion ${node.name}`);});
 }
 assert.ok(poses.size>=4);assert.notDeepEqual(boneState(avatar.root),first);
 avatar.update(0,'dance',false,0);const feet=['L','R'].map(side=>world(avatar.root,`foot_${side}`));
 const builder=createFestivalBuilderAvatar(avatar);let high:THREE.Vector3|undefined,low:THREE.Vector3|undefined;
 for(const t of [0,.7,1,1.3,1.6,4.4,11.9]){
  avatar.update(t,'dance',false,0);builder.update(t);
  const hammer=avatar.root.getObjectByName('festival-builder-hammer');assert.equal(hammer?.parent?.name,'hand_R');
  const head=world(avatar.root,'festival-builder-hammer-head');if(t===1)high=head;if(t===1.6)low=head;
  for(const [i,side]of ['L','R'].entries())assert.ok(world(avatar.root,`foot_${side}`).distanceTo(feet[i])<.008,`builder ${side} support`);
  assert.ok(boneState(avatar.root).every(Number.isFinite));assert.deepEqual(avatar.root.scale.toArray(),[4,4,4]);
 }
 assert.ok(high!.distanceTo(low!)>.1,'hammer visibly strikes');builder.update(null);assert.equal(avatar.root.getObjectByName('festival-builder-hammer'),undefined);
 const celebration=createFestivalCelebrationAvatar(avatar,kind),hops=new Set<number>();
 for(const t of [2,2.2,2.4,2.6,12,22]){
  avatar.update(t,'dance',false,0);const restingHands=['L','R'].map(side=>world(avatar.root,`hand_${side}`).y);celebration.update(t);
  for(const [index,side] of ['L','R'].entries()){
   const handY=world(avatar.root,`hand_${side}`).y;
   if(kind==='miaocuijiao')assert.ok(handY-celebration.lift*4>restingHands[index]+.08,`${kind}: short forepaw ${side} lifts without relying on body hopping`);
   else assert.ok(handY>world(avatar.root,`upperArm_${side}`).y+.03,`${kind}: celebrate ${side}`);
  }
  hops.add(celebration.lift);assert.ok(boneState(avatar.root).every(Number.isFinite));
 }
 assert.ok(hops.size>2);celebration.update(null);celebration.dispose();builder.dispose();avatar.dispose();
});

test('late-loaded cow joins an active construction or burn pose and disposes without resurrecting skin',async()=>{
 const source=await uploadedTemplate('niulai');
 for(const phase of ['build','burn'] as const){
  let resolve!:(value:THREE.Group)=>void;
  const late=createClubAvatar('niulai','late-festival',{mode:'desert',template:new Promise<THREE.Group>(done=>{resolve=done;})});
  const immediate=createClubAvatar('niulai','late-festival',{mode:'desert',template:source});
  const avatars=[late,immediate],builders=avatars.map(createFestivalBuilderAvatar),celebrations=avatars.map(a=>createFestivalCelebrationAvatar(a,'late-festival'));
  avatars.forEach((avatar,i)=>{avatar.root.scale.setScalar(4);avatar.root.position.set(12,0,-16);avatar.root.rotation.y=.8;avatar.update(5,'dance',false,0);if(phase==='build')builders[i].update(5);else celebrations[i].update(5);});
  resolve(source);await late.ready;
  avatars.forEach((avatar,i)=>{avatar.update(5.3,'dance',false,0);if(phase==='build')builders[i].update(5.3);else celebrations[i].update(5.3);});
  assert.deepEqual(boneState(late.root),boneState(immediate.root));
  const l=actualBounds(late.root),r=actualBounds(immediate.root);assert.ok(l.min.distanceTo(r.min)<1e-8&&l.max.distanceTo(r.max)<1e-8);
  builders.forEach(b=>b.dispose());celebrations.forEach(c=>c.dispose());avatars.forEach(a=>a.dispose());
 }
 let resolve!:(value:THREE.Group)=>void;const dead=createClubAvatar('niulai','left-before-load',{mode:'desert',template:new Promise<THREE.Group>(done=>{resolve=done;})});dead.dispose();resolve(source);await dead.ready;assert.equal(dead.loaded,false);assert.equal(dead.root.children.length,0);
});
