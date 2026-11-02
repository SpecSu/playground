import './room-loader.mjs';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar, CLUB_AVATAR_KINDS } from '../lib/club-avatar-rig.ts';
import { UPLOADED_CAST, EXPECTED_HEIGHTS, uploadedTemplate, actualBounds, boneState } from './helpers/uploaded-avatar.ts';
import { makeClubWorld } from '../lib/club-scene-world.ts';

const actions = ['dance','bounce','spin','wave','love','laugh','punch','ghost'] as const;
const frames = [0,.125,.37,.72,1.2,1.76,2.4,3.55];

test('the production playable set contains exactly the new twelve models', () => {
  assert.deepEqual([...CLUB_AVATAR_KINDS], [...UPLOADED_CAST]);
});

for (const [index,kind] of UPLOADED_CAST.entries()) test(`${kind}: original scale and finite bounded actual skin under every personal action`, async () => {
  const source=await uploadedTemplate(kind);
  const avatar=createClubAvatar(kind,`mesh:${kind}`,{template:source});
  assert.ok(Math.abs(avatar.height-EXPECTED_HEIGHTS[index])<.0001,'no universal height normalization');
  let maxDelta=0;const first=boneState(avatar.root);
  for(const action of actions) for(const beat of frames){
    avatar.update(beat,action,false,1);
    const state=boneState(avatar.root);assert.ok(state.every(Number.isFinite));
    maxDelta=Math.max(maxDelta,...state.map((v,i)=>Math.abs(v-first[i])));
    avatar.root.traverse(n=>{if(n instanceof THREE.Bone)assert.ok(Math.abs(n.quaternion.length()-1)<.0001,`${kind}/${action}: normalized ${n.name}`)});
    const bounds=actualBounds(avatar.root);
    assert.ok(bounds.min.y>=-.045,`${kind}/${action}/${beat}: floor ${bounds.min.y}`);
    assert.ok(bounds.max.y-bounds.min.y<avatar.height*1.65+.4,`${kind}/${action}: bounded skin height`);
    assert.ok(bounds.max.x-bounds.min.x<2.5 && bounds.max.z-bounds.min.z<2.6,`${kind}/${action}: bounded body width/depth`);
  }
  assert.ok(maxDelta>.25,'real skeleton moves');
  avatar.update(1.25,'dance',false,.8);const pose=boneState(avatar.root);
  avatar.update(7.8,'ghost',false,1);avatar.update(1.25,'dance',false,.8);assert.deepEqual(boneState(avatar.root),pose,'pose is reconstructible');
  assert.deepEqual(avatar.root.scale.toArray(),[1,1,1]);
  avatar.dispose();
});

test('new DJ keeps its 20 percent authored adaptation and the current scene scale without stretching limbs', async () => {
  const source=await uploadedTemplate('dj-kunkun');
  const dj=createClubAvatar('dj-kunkun','house-dj',{template:source,mode:'dj'});
  assert.ok(Math.abs(dj.height-1.74)<.0001);
  const navigation=new THREE.Group(); navigation.scale.setScalar(CLUB_AVATAR_SCALE); navigation.position.z=-1.3; navigation.add(dj.root); dj.update(0,'dance',false,1);
  assert.ok(Math.abs(actualBounds(dj.root).max.y-actualBounds(dj.root).min.y)>2.5,'DJ is physically enlarged in the scene');
  const lengths=['L','R'].map(side=>{const a=dj.root.getObjectByName(`upperArm_${side}`)!,b=dj.root.getObjectByName(`forearm_${side}`)!,c=dj.root.getObjectByName(`hand_${side}`)!;return [a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3())),b.getWorldPosition(new THREE.Vector3()).distanceTo(c.getWorldPosition(new THREE.Vector3()))]});
  const scratch:number[]=[];
  for(const beat of frames){
    dj.update(beat,'dance',false,1);
    for(const [i,side] of ['L','R'].entries()){
      const a=dj.root.getObjectByName(`upperArm_${side}`)!.getWorldPosition(new THREE.Vector3());
      const b=dj.root.getObjectByName(`forearm_${side}`)!.getWorldPosition(new THREE.Vector3());
      const c=dj.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(a.distanceTo(b)-lengths[i][0])<.0001 && Math.abs(b.distanceTo(c)-lengths[i][1])<.0001);
      assert.ok(c.y>1.20&&c.y<1.35,`hand ${side} holds the feather surface over the original decks: ${c.y}`);
      if(i===0)scratch.push(c.z);
    }
  }
  assert.ok(Math.max(...scratch)-Math.min(...scratch)>.025);
  dj.dispose();
  const kinds:string[]=[];
  const world=makeClubWorld({createAvatar(kind){kinds.push(kind);return {root:new THREE.Group(),height:1.74,labelHeight:2,footprintRadius:.7,loaded:true,ready:Promise.resolve(),update(){},dispose(){}}}});
  assert.equal(world.dj.preset,'dj-kunkun');assert.equal(world.dj.name,'坤坤鸡');
  assert.equal(world.ambient.length,5);assert.equal(world.dj.root.position.y,0);assert.deepEqual(world.dj.root.scale.toArray(),[CLUB_AVATAR_SCALE,CLUB_AVATAR_SCALE,CLUB_AVATAR_SCALE]);
  assert.ok(!world.scene.getObjectByName('dj-standing-platform'));
  assert.equal(kinds.includes('dj-cockatoo'),false);world.dispose();
});

test('late uploaded model replays only the newest pose and cannot resurrect a disposed avatar', async()=>{
 let resolve!:(value:THREE.Group)=>void;
 const pending=new Promise<THREE.Group>(done=>{resolve=done});
 const late=createClubAvatar('niulai','late-cow',{template:pending});
 late.update(.3,'dance',false,.1);late.update(2.375,'bounce',false,1,undefined,{kind:'unison',version:2,phase:'perform',beat:2.375,weight:1,wave:0});
 const source=await uploadedTemplate('niulai');const immediate=createClubAvatar('niulai','late-cow',{template:source});
 immediate.update(2.375,'bounce',false,1,undefined,{kind:'unison',version:2,phase:'perform',beat:2.375,weight:1,wave:0});
 resolve(source);await late.ready;assert.deepEqual(boneState(late.root),boneState(immediate.root));
 const expected=actualBounds(immediate.root),received=actualBounds(late.root);assert.ok(expected.min.distanceTo(received.min)<1e-8&&expected.max.distanceTo(received.max)<1e-8);
 let resolveDisposed!:(value:THREE.Group)=>void;const abandoned=createClubAvatar('niulai','abandoned',{template:new Promise<THREE.Group>(done=>{resolveDisposed=done})});
 abandoned.dispose();resolveDisposed(source);await abandoned.ready;assert.equal(abandoned.loaded,false);assert.equal(abandoned.root.children.length,0);
 late.dispose();immediate.dispose();
});

test('DJ head and beak clear the original mixer surface throughout the scratch cycle',async()=>{
 const dj=createClubAvatar('dj-kunkun','house-dj',{template:await uploadedTemplate('dj-kunkun'),mode:'dj'});
 const world=makeClubWorld({createAvatar(kind){return kind==='dj-kunkun'?dj:{root:new THREE.Group(),height:1.5,labelHeight:2,footprintRadius:.6,loaded:true,ready:Promise.resolve(),update(){},dispose(){}}}});
 const point=new THREE.Vector3();
 for(let frame=0;frame<64;frame++){
  dj.update(frame/8,'dance',false,1);world.scene.updateMatrixWorld(true);
  dj.root.traverseVisible(node=>{if(!(node instanceof THREE.SkinnedMesh))return;
   const weights=node.geometry.attributes.skinWeight,ids=node.geometry.attributes.skinIndex;
   for(let i=0;i<weights.count;i++){
    let headWeight=0;for(let k=0;k<4;k++)if(['head','neck'].includes(node.skeleton.bones[ids.getComponent(i,k)].name))headWeight+=weights.getComponent(i,k);
    if(headWeight<.7)continue;
    node.getVertexPosition(i,point).applyMatrix4(node.matrixWorld);
    assert.ok(point.y>=1.145,`head/beak must not enter table or discs: ${point.y}`);
   }
  });
 }
 world.dispose();
});
