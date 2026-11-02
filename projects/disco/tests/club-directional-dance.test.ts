import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LEGACY_AVATAR_KINDS } from './helpers/legacy-avatar.ts';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import type { AvatarRig } from '../lib/club-scene-world.ts';

const motion = { slot: 0, x: 0, z: 0, heading: 0, speed: 0, distance: 0, walkBlend: 0, action: 'dance' as const };
test('directional phrases turn mirrored hips/torso, jump with preload and land, and crouch without scaling', async () => {
  const { directionalDancePose } = await import('../lib/club-directional-dance.ts');
  const left = directionalDancePose('left', 220), right = directionalDancePose('right', 220);
  assert.ok(Math.abs(left.hipYaw) > 0.25 && Math.abs(left.torsoYaw) > 0.3);
  assert.equal(left.hipYaw, -right.hipYaw); assert.equal(left.torsoYaw, -right.torsoYaw);
  assert.ok(directionalDancePose('down', 220).crouch > 0.35);
  assert.ok(directionalDancePose('up', 60).crouch > 0);
  assert.ok(directionalDancePose('up', 220).lift > 0.75);
  assert.equal(directionalDancePose('up', 440).lift, 0);
});

test('all 13 legacy fixture rigs articulate elastic turns/crouches with fixed contact feet, preserved volume and reversible transforms', async () => {
  const { applyArticulatedDance } = await import('../lib/club-directional-dance.ts');
  for (const kind of LEGACY_AVATAR_KINDS) {
    const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
    const { scene: template } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = createClubAvatar(kind, kind, { template }); await model.ready;
    const root = new THREE.Group(); root.position.set(2,0,3); root.rotation.y = Math.PI/4; root.add(model.root);
    const rig = { id:kind,preset:kind,root,model,motion } as unknown as AvatarRig;
    const bones: THREE.Bone[] = []; let quadruped = false;
    model.root.traverse(n => { if ((n as THREE.Bone).isBone) bones.push(n as THREE.Bone); if (n.userData.speciesRig === 'quadruped') quadruped = true; });
    for (const direction of ['left','right','down','up'] as const) for (const age of [0,60,150,220,330,439,440]) for(const beat of [4,4.25,4.5,4.75]) {
      model.update(0,'dance',true,0.9,motion); root.position.y=0; root.updateMatrixWorld(true);
      const contacts = bones.filter(b => /^foot_[LR]$/.test(b.name) || quadruped && /^hand_[LR]$/.test(b.name));
      const feet = contacts.map(b=>b.getWorldPosition(new THREE.Vector3()));
      const sizes = bones.map(b=>b.scale.clone());
      const locals = bones.map(b=>b.position.clone());
      const lengths = bones.map(b=>b.parent ? b.getWorldPosition(new THREE.Vector3()).distanceTo(b.parent.getWorldPosition(new THREE.Vector3())) : 0);
      const originals = new Map<THREE.Object3D,{p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}>();
      const save = (node:THREE.Object3D) => { if(!originals.has(node)) originals.set(node,{p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()}); };
      applyArticulatedDance(rig, beat, {direction,at:1000},1000+age,save);
      root.updateMatrixWorld(true);
      contacts.forEach((b,i)=> {
        const p=b.getWorldPosition(new THREE.Vector3());
        if(direction!=='up' || age===0 || age>=440) assert.ok(p.distanceTo(feet[i])<0.0005,`${kind} ${direction} ${age} planted ${b.name}: ${p.distanceTo(feet[i])}`);
        else assert.ok(p.y >= feet[i].y-0.003,`${kind} jump never sinks ${b.name}`);
      });
      bones.forEach((b,i)=> {
        if(b.name==='spine'||b.name==='head') {
          assert.ok(Math.abs(b.scale.x*b.scale.y*b.scale.z-sizes[i].x*sizes[i].y*sizes[i].z)<1e-8,`${kind} preserves ${b.name} volume`);
          assert.ok(b.scale.y/sizes[i].y>0.75&&b.scale.y/sizes[i].y<1.3,`${kind} bounded elastic ${b.name}`);
        } else assert.ok(b.scale.equals(sizes[i]),`${kind} contact/other bone ${b.name} stays unscaled`);
        if(b.name!=='hips') assert.ok(b.position.equals(locals[i]),`${kind} ${b.name} stays attached to parent`);
        if(b.parent && /^(thigh|shin|foot)_[LR]$/.test(b.name)) assert.ok(Math.abs(b.getWorldPosition(new THREE.Vector3()).distanceTo(b.parent.getWorldPosition(new THREE.Vector3()))-lengths[i])<1e-5,`${kind} ${b.name} rigid length`);
      });
      if(age===220) {
        const hips=bones.find(b=>b.name==='hips')!;
        assert.ok(originals.has(hips),`${kind} articulates hips`);
        if(direction==='down') assert.ok(hips.position.y<originals.get(hips)!.p.y,`${kind} lowers pelvis rather than scaling`);
      }
      for(const [node,value] of originals) {node.position.copy(value.p);node.quaternion.copy(value.q);node.scale.copy(value.s);}
      assert.deepEqual(root.scale.toArray(),[1,1,1]);
    }
    model.dispose();
  }
});

test('actual skinned gesture envelopes remain inside the fixed front camera for all 13 legacy fixtures', async () => {
  const { ClubDanceStaging, danceStagePosition, DANCE_STAGE_HEADING } = await import('../lib/club-dance-staging.ts');
  const { danceStageCameraPose, CAMERA_FOV } = await import('../lib/club-camera.ts');
  for(const kind of LEGACY_AVATAR_KINDS) {
    const bytes=readFileSync(new URL(`../public/avatars/${kind}.glb`,import.meta.url));
    const {scene:template}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const model=createClubAvatar(kind,kind,{template}); await model.ready;
    const root=new THREE.Group();root.add(model.root);
    const rig={id:'self',preset:kind,slot:0,root,model,motion} as unknown as AvatarRig;
    const stage=new ClubDanceStaging();
    const anchor={...danceStagePosition(0,true),y:0};
    for(const direction of ['left','right','up','down'] as const) for(const age of [80,220,365]) {
      stage.apply([rig],'self',4.25,false,0.9,1000+age,{direction,at:1000});
      root.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(model.root,true);
      assert.ok(bounds.min.y>=-0.04,`${kind} ${direction} skin stays above floor: ${bounds.min.y}`);
      for(const aspect of [0.4,0.75,1.8]) {
        const pose=danceStageCameraPose({position:anchor,heading:DANCE_STAGE_HEADING,height:model.height,radius:model.footprintRadius},aspect);
        const camera=new THREE.PerspectiveCamera(CAMERA_FOV,aspect,0.08,80);
        camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
        for(const x of [bounds.min.x,bounds.max.x]) for(const y of [bounds.min.y,bounds.max.y]) for(const z of [bounds.min.z,bounds.max.z]) {
          const point=new THREE.Vector3(x,y,z).project(camera);
          assert.ok(Math.abs(point.x)<0.97&&Math.abs(point.y)<0.97,`${kind} ${direction} ${age} remains framed at ${aspect}`);
        }
      }
      stage.restore();
    }
    model.dispose();
  }
});

test('repeated stage frames restore the first root/hip snapshot despite multiple save requests', async () => {
  const { ClubDanceStaging } = await import('../lib/club-dance-staging.ts');
  const bytes=readFileSync(new URL('../public/avatars/human-jiji.glb',import.meta.url));
  const {scene:template}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const model=createClubAvatar('human-jiji','self',{template});await model.ready;
  const root=new THREE.Group();root.position.set(-2.3,0,4.1);root.rotation.y=-0.7;root.add(model.root);
  model.update(0,'dance',true,0.9,motion);
  const rig={id:'self',slot:0,preset:'human-jiji',root,model,motion} as unknown as AvatarRig;
  const originals=new Map<THREE.Object3D,{p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}>();
  root.traverse(node=>{if(node===root||(node as THREE.Bone).isBone)originals.set(node,{p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()});});
  const stage=new ClubDanceStaging();
  for(let frame=0;frame<240;frame++) {
    const direction=(['left','up','down','right'] as const)[frame%4];
    stage.apply([rig],'self',frame/20,false,0.9,1220,{direction,at:1000});
    stage.restore();
    for(const [node,expected] of originals) {
      assert.ok(node.position.distanceTo(expected.p)<1e-9,`${node.name} position has no frame${frame} residue`);
      assert.ok(node.quaternion.angleTo(expected.q)<1e-7,`${node.name} rotation has no frame${frame} residue`);
      assert.ok(node.scale.equals(expected.s),`${node.name} scale has no frame${frame} residue`);
    }
  }
  model.dispose();
});
