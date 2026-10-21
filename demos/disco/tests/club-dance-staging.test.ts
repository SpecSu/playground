import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ClubDanceStaging, danceStageActive, danceStageTiming, danceChartFeedback, danceCrowdChartFeedback, danceCrowdNoteOffset, danceDirectionalPose, DANCE_GESTURE_MS, danceStagePosition, DANCE_SELF_V, DANCE_STAGE_HEADING } from '../lib/club-dance-staging.ts';
import { danceStageCameraPose, CAMERA_FOV } from '../lib/club-camera.ts';
import { getTrackTiming, getMusicSectionEnergy } from '../lib/music-catalog.ts';
import { stagePosition } from '../lib/club-scene-math.ts';
import type { AvatarRig } from '../lib/club-scene-world.ts';

async function actualRig(id = 'self', slot = 0) {
  const { readFileSync } = await import('node:fs');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { createClubAvatar } = await import('../lib/club-avatar-rig.ts');
  const bytes = readFileSync(new URL('../public/avatars/human-jiji.glb', import.meta.url));
  const { scene: template } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = createClubAvatar('human-jiji', id, { template }); await model.ready;
  const root = new THREE.Group(); root.add(model.root);
  return {id, slot, preset:'human-jiji', root, model, motion:{slot,x:0,z:0,heading:0,speed:0,distance:0,walkBlend:0,action:'dance'}} as unknown as AvatarRig;
}
const skeletonPose = (rig: AvatarRig) => {
  const values: number[] = [...rig.root.position.toArray(), ...rig.root.quaternion.toArray(), ...rig.root.scale.toArray()];
  rig.model.root.traverse(node => { if ((node as THREE.Bone).isBone) values.push(...node.position.toArray(),...node.quaternion.toArray()); });
  return values;
};
const v = (p: {x: number; z: number}) => (p.x + p.z) * Math.SQRT1_2;
test('every viewer has a front centre position and all nine peers stay farther from the lens', () => {
  const own = danceStagePosition(0, true);
  assert.ok(Math.abs(own.x - own.z) < 1e-9);
  assert.ok(Math.abs(v(own) - DANCE_SELF_V) < 1e-9);
  for (let i = 0; i < 9; i++) {
    const peer = danceStagePosition(i, false);
    assert.ok(v(peer) < v(own) - 1.5, 'peers cannot stand in front of self');
    const u = Math.abs((peer.x - peer.z) * Math.SQRT1_2);
    assert.ok(u >= 3.19 || v(peer) < -4.5, 'peers flank the solid booth or stand safely behind the DJ');
  }
});

test('front camera projects own body to screen centre on portrait and landscape without clipping', () => {
  for (const aspect of [0.4, 0.75, 1, 1.8]) for (const height of [0.8, 1.8, 2.7, 4]) {
    const subject = { position: { ...danceStagePosition(0, true), y: 0 }, height, radius: 0.8, heading: DANCE_STAGE_HEADING };
    const pose = danceStageCameraPose(subject, aspect);
    assert.ok(v(pose.position) > v(subject.position), 'camera in front of +v-facing avatar');
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.08, 80);
    camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
    const centre = new THREE.Vector3(subject.position.x, height * 0.55, subject.position.z).project(camera);
    assert.ok(Math.abs(centre.x) < 1e-8 && Math.abs(centre.y) < 1e-8);
    for (const y of [0, height + 0.4]) for (const u of [-0.8, 0.8]) {
      const edge = stagePosition(u, DANCE_SELF_V);
      const point = new THREE.Vector3(edge.x, y, edge.z).project(camera);
      assert.ok(Math.abs(point.x) < 0.95 && Math.abs(point.y) < 0.95);
    }
    const dj = stagePosition(0, -0.55);
    assert.ok(Math.abs(new THREE.Vector3(dj.x, 2.7, dj.z).project(camera).x) < 1e-8, 'DJ remains centre rear at actual booth');
  }
});

test('spectator stage camera has no personal subject and frames the actual DJ and stage', () => {
  for (const aspect of [0.5, 1.8]) {
    const pose = danceStageCameraPose(null, aspect);
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.08, 80);
    camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
    for (const [u, depth] of [[0, -0.55], [-4.9, 1.9], [4.9, 3.45]]) {
      const p = stagePosition(u, depth);
      const point = new THREE.Vector3(p.x, 1.5, p.z).project(camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1);
    }
  }
});

test('staging animates articulated rigs continuously and restores exact navigation without persistence', () => {
  const calls: unknown[][] = [];
  const root = new THREE.Group(); root.position.set(2, 0, -3); root.rotation.y = -0.4;
  const original = root.position.clone(), rotation = root.quaternion.clone();
  const motion = { slot: 0, x: 2, z: -3, heading: -0.4, speed: 1, distance: 5, walkBlend: 1, action: 'wave' as const };
  const rig = { id: 'self', slot: 0, root, motion, model: { root: new THREE.Group(), update: (...args: unknown[]) => calls.push(args) } } as unknown as AvatarRig;
  const stage = new ClubDanceStaging();
  for (const beat of [0, 30, 119.9]) {
    stage.apply([rig], 'self', beat, false, 0.8, 2000);
    assert.notDeepEqual(root.position, original);
    assert.equal(calls.at(-1)?.[1], 'dance');
    assert.equal((calls.at(-1)?.[4] as {walkBlend: number}).walkBlend, 0);
    assert.equal(rig.motion, motion);
    stage.restore();
    assert.deepEqual(root.position, original); assert.ok(root.quaternion.equals(rotation));
  }
  stage.restore(); assert.deepEqual(root.position, original);
});

test('shared countdown and full 60 seconds stage until the exact end', () => {
  const round = { id: 'r', startsAt: 5000, endsAt: 65000 };
  for (const now of [0, 4999, 5000, 64999]) assert.equal(danceStageActive(round, now), true);
  assert.equal(danceStageActive(round, 65000), false);
  assert.equal(danceStageActive(null, 5000), false);
});

test('directional beat feedback is short lived, reversible, and disabled for reduced motion', async () => {
  const rig = await actualRig(); const root = rig.root;
  const stage = new ClubDanceStaging();
  for (const direction of ['left', 'up', 'down', 'right'] as const) {
    stage.apply([rig], 'self', 4, false, 0.8, 1130, { direction, at: 1000 });
    const active = skeletonPose(rig);
    stage.apply([rig], 'self', 4, false, 0.8, 1500, { direction, at: 1000 });
    const expired = skeletonPose(rig);
    assert.notDeepEqual(active, expired);
    stage.apply([rig], 'self', 4, true, 0.8, 1130, { direction, at: 1000 });
    const reduced = skeletonPose(rig);
    stage.apply([rig], 'self', 4, true, 0.8, 1500, null);
    assert.deepEqual(skeletonPose(rig), reduced);
  }
  stage.restore(); assert.deepEqual(root.position.toArray(), [0, 0, 0]); rig.model.dispose();
});


test('round music owns avatar and lighting timing for countdown/play, then original track resumes untouched', () => {
  const original = { id: 'midnight-techno', startedAt: 1000 };
  const round = { id: 'round', trackId: 'arabic-nights', startsAt: 10_000, endsAt: 70_000 };
  for (const now of [6000, 10_000, 39_000, 69_999]) {
    const actual = danceStageTiming(original, round, now);
    const expected = getTrackTiming(round.trackId, round.startsAt, now);
    assert.equal(actual.beat, expected.absoluteBeat + expected.beatPhase);
    assert.deepEqual(actual.section, getMusicSectionEnergy(round.trackId, expected));
  }
  for (const now of [70_000, 71_000, 140_000]) {
    assert.deepEqual(danceStageTiming(original, round, now), danceStageTiming(original, null, now));
    const expected = getTrackTiming(original.id, original.startedAt, now);
    assert.equal(danceStageTiming(original, round, now).beat, expected.absoluteBeat + expected.beatPhase);
  }
  assert.deepEqual(original, { id: 'midnight-techno', startedAt: 1000 });
});

test('every legacy fixture including the tall monster is centred by its actual loaded dimensions', async () => {
  const { readFileSync } = await import('node:fs');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { createClubAvatar } = await import('../lib/club-avatar-rig.ts');
  const { LEGACY_AVATAR_KINDS } = await import('./helpers/legacy-avatar.ts');
  for (const kind of LEGACY_AVATAR_KINDS) {
    const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
    const { scene: template } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = createClubAvatar(kind, `stage-${kind}`, { template });
    await model.ready;
    for (const aspect of [0.4, 0.75, 1.8]) {
      const subject = { position: { ...danceStagePosition(0, true), y: 0 }, height: model.height, radius: model.footprintRadius, heading: DANCE_STAGE_HEADING };
      const pose = danceStageCameraPose(subject, aspect);
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.08, 80);
      camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
      const center = new THREE.Vector3(subject.position.x, model.height * 0.55, subject.position.z).project(camera);
      assert.ok(Math.abs(center.x) < 1e-8 && Math.abs(center.y) < 1e-8, `${kind} actual model is centred`);
      for (const y of [0, model.height + 0.4]) {
        const p = new THREE.Vector3(subject.position.x, y, subject.position.z).project(camera);
        assert.ok(Math.abs(p.y) < 0.95, `${kind} head and feet remain in frame`);
      }
    }
    for (const direction of ['left', 'right', 'up', 'down'] as const) for (const aspect of [0.4, 0.75, 1.8]) {
      const subject = { position: { ...danceStagePosition(0, true), y: 0 }, height: model.height, radius: model.footprintRadius, heading: DANCE_STAGE_HEADING };
      const pose = danceStageCameraPose(subject, aspect);
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.08, 80);
      camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
      const gesture = danceDirectionalPose(direction, 220);
      const root = new THREE.Group();
      const offset = stagePosition(gesture.sideways, DANCE_SELF_V);
      root.position.set(offset.x, gesture.lift, offset.z); root.rotation.y = DANCE_STAGE_HEADING;
      root.rotateZ(gesture.lean); root.scale.set(gesture.scaleWide,gesture.scaleY,gesture.scaleWide);
      root.updateMatrixWorld();
      for (const x of [-model.footprintRadius, model.footprintRadius]) for (const y of [0, model.height + 0.4]) {
        const p = new THREE.Vector3(x, y, 0).applyMatrix4(root.matrixWorld).project(camera);
        assert.ok(Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95, `${kind} ${direction} gesture remains visible in ${aspect}`);
      }
    }
    model.dispose();
  }
});


test('chart timing and original rubber envelopes retain mirrored sway, high jump and squash rebound', () => {
  const chart = [{ id: 0, lane: 1 as const, atMs: 1000 }, { id: 1, lane: 0 as const, atMs: 1500 }];
  assert.deepEqual(danceChartFeedback(chart, 5000, 6200), { direction: 'up', at: 6000 });
  assert.equal(danceChartFeedback(chart, 5000, 5999), null);
  assert.equal(danceChartFeedback(chart, 5000, 7000), null);
  assert.equal(danceDirectionalPose('left', 220).sideways, -0.58);
  assert.equal(danceDirectionalPose('right', 220).sideways, 0.58);
  assert.equal(danceDirectionalPose('left', 220).lean, 0.24);
  assert.ok(danceDirectionalPose('up', 220).lift === 1.05);
  assert.ok(Math.abs(danceDirectionalPose('down', 220).scaleY - 0.57) < 1e-9);
  assert.ok(danceDirectionalPose('down', 350).lift > 0.2, 'original down rebounds upward');
  for (const direction of ['left', 'right', 'up', 'down'] as const) {
    assert.equal(danceDirectionalPose(direction, DANCE_GESTURE_MS).lift, 0);
    assert.equal(danceDirectionalPose(direction, DANCE_GESTURE_MS).scaleY, 1);
  }
});

test('new song beat map and measured sections drive scene timing without a catalog lookup', async () => {
  const { DANCE_TRACK, DANCE_TRACK_BEATS_MS, DANCE_TRACK_SECTIONS } = await import('../lib/dance-track.ts');
  const track = { id: 'midnight-techno', startedAt: 1000 };
  const round = { id: 'song', version: 2 as const, trackId: DANCE_TRACK.id, startsAt: 10_000, endsAt: 10_000 + DANCE_TRACK.durationMs };
  DANCE_TRACK_BEATS_MS.forEach((at, index) => assert.equal(danceStageTiming(track, round, round.startsAt + at).beat, index));
  for (const cue of DANCE_TRACK_SECTIONS) assert.equal(danceStageTiming(track, round, round.startsAt + cue.startMs).section.energy, cue.energy);
  assert.equal(danceStageTiming(track, round, round.startsAt - 1).section.energy, 0);
  assert.deepEqual(danceStageTiming(track, round, round.endsAt), danceStageTiming(track, null, round.endsAt));
});

test('own follows actual presses while all nonself actors use locally offset chart poses', async () => {
  const { DANCE_TRACK_CHART, DANCE_TRACK } = await import('../lib/dance-track.ts');
  const round = { id: 'r', version: 2 as const, seed: 'ignored-for-authored', startsAt: 1000, endsAt: 1000 + DANCE_TRACK.durationMs };
  const left = DANCE_TRACK_CHART.find(note => note.lane === 0)!;
  const now = round.startsAt + left.atMs + 220;
  const rigs = await Promise.all(['self','human','npc'].map((id,slot)=>actualRig(id,slot)));
  rigs[2].ambient = true;
  const stage = new ClubDanceStaging();
  stage.apply(rigs, 'self', 4, false, 0.8, now, { direction: 'up', at: now - 220 }, round);
  assert.ok(rigs[0].root.position.y > 0.9, 'own key jumps instead of following chart sway');
  for (let i = 1; i < rigs.length; i++) {
    const expected = danceStagePosition(i - 1, false);
    const gesture=danceCrowdChartFeedback(DANCE_TRACK_CHART,round.startsAt,now,`${round.seed}:${rigs[i].id}`)!;
    const offset=stagePosition(danceDirectionalPose(gesture.direction,now-gesture.at).sideways,0);
    assert.deepEqual([rigs[i].root.position.x,rigs[i].root.position.z], [expected.x+offset.x,expected.z+offset.z]);
  }
  stage.restore();
  const idleStage = new ClubDanceStaging();
  idleStage.apply(rigs, 'self', 4, false, 0.8, now, null, round);
  assert.equal(rigs[0].root.position.y, 0, 'own does not jump from chart without a press');
  assert.deepEqual([rigs[0].root.position.x,rigs[0].root.position.z],Object.values(danceStagePosition(0,true)),'own does not sway from chart');
  idleStage.restore();
  const spectatorStage = new ClubDanceStaging();
  spectatorStage.apply(rigs, null, 4, false, 0.8, now, null, round);
  for (const rig of rigs) assert.ok(Math.abs(rig.root.rotation.z)>0.05,'spectator sees every actor perform local chart motion');
  spectatorStage.restore();
  for (const rig of rigs) {
    assert.deepEqual(rig.root.position.toArray(), [0, 0, 0]);
    assert.deepEqual(rig.root.scale.toArray(), [1, 1, 1]); rig.model.dispose();
  }
});

test('actual own rig keeps bouncing under rapid fresh off-chart up presses and restores after release', async () => {
  const rig=await actualRig(); const stage=new ClubDanceStaging();
  const round={id:'rapid',seed:'s',version:2 as const,startsAt:0,endsAt:51_120};
  let peaks=0, previous=0;
  for(let now=0;now<1600;now+=20) {
    stage.apply([rig],'self',now/500,false,0.9,now,{direction:'up',at:Math.floor(now/40)*40},round);
    const height=rig.root.position.y;
    if(height>0.8&&previous<=0.8) peaks++;
    previous=height;
  }
  assert.ok(peaks>=3,'off-chart repeated key presses generate complete visible jumps');
  stage.apply([rig],'self',5,false,0.9,2600,null,round);
  assert.equal(rig.root.position.y,0,'queued release settles without resuming chart animation');
  stage.restore(); assert.deepEqual(rig.root.position.toArray(),[0,0,0]);
  assert.deepEqual(rig.root.scale.toArray(),[1,1,1]);rig.model.dispose();
});


test('crowd offsets are deterministic per actor/note, bounded and never use frame randomness', () => {
  const chart = [{id:0,lane:0 as const,atMs:2000},{id:1,lane:1 as const,atMs:2500}];
  const offsets=new Set<number>();
  for(const id of ['human-a','human-b','npc-a','npc-b','late-viewer']) for(let note=0;note<30;note++) {
    const offset=danceCrowdNoteOffset(id,note); offsets.add(offset);
    assert.equal(offset,danceCrowdNoteOffset(id,note)); assert.ok(Math.abs(offset)<=90);
  }
  assert.ok(offsets.size>10,'crowd phases vary naturally');
  const offset=danceCrowdNoteOffset('human-a',0);
  const expected={direction:'left',at:1000+2000+offset};
  assert.deepEqual(danceCrowdChartFeedback(chart,1000,expected.at+200,'human-a'),expected);
  assert.deepEqual(danceCrowdChartFeedback(chart,1000,expected.at+200,'human-a'),expected,'late render reconstructs same phase');
  assert.equal(danceCrowdChartFeedback(chart,1000,expected.at-1,'human-a'),null);
});

test('direction keys add mirrored turns and bent-knee actions beneath the original root rubber', async () => {
  const rig = await actualRig();
  rig.root.scale.setScalar(2);
  for (const direction of ['left', 'right', 'up', 'down'] as const) {
    const stage = new ClubDanceStaging();
    stage.apply([rig], 'self', 4.25, false, 0.9, 1220, null);
    const hips = rig.model.root.getObjectByName('hips')!;
    const spine = rig.model.root.getObjectByName('spine')!;
    const shin = rig.model.root.getObjectByName('shin_L')!;
    const native = { hips: hips.quaternion.clone(), pelvisY: hips.position.y, spine: spine.quaternion.clone(), shin: shin.quaternion.clone() };
    stage.restore();
    stage.apply([rig], 'self', 4.25, false, 0.9, 1220, { direction, at: 1000 });
    const origin = danceStagePosition(0, true);
    const sideways = ((rig.root.position.x - origin.x) - (rig.root.position.z - origin.z)) * Math.SQRT1_2;
    if (direction === 'left' || direction === 'right') {
      assert.ok(Math.abs(sideways - (direction === 'left' ? -0.58 : 0.58)) < 1e-9, 'original lateral rubber remains');
      const relative = native.hips.clone().invert().multiply(hips.quaternion);
      const yaw = new THREE.Euler().setFromQuaternion(relative).y;
      assert.ok(direction === 'left' ? yaw < -0.2 : yaw > 0.2, `${direction} really turns the pelvis in its direction`);
      assert.ok(native.spine.angleTo(spine.quaternion) > 0.3, 'torso follows the key');
    }
    if (direction === 'up') {
      assert.equal(rig.root.position.y, 1.05, 'one jump envelope, without doubled lift');
      assert.ok(Math.abs(rig.root.scale.y - 2.28) < 1e-9, '2x base scale survives root stretch');
      assert.ok(native.shin.angleTo(shin.quaternion) > 0.1, 'jump visibly tucks the knees');
    }
    if (direction === 'down') {
      assert.ok(Math.abs(rig.root.scale.y - 1.14) < 1e-9);
      assert.equal(rig.root.scale.x, 2.5);
      assert.ok(hips.position.y < native.pelvisY - 0.05, 'crouch lowers the pelvis');
      assert.ok(native.shin.angleTo(shin.quaternion) > 0.2, 'crouch bends the knees');
    }
    stage.restore();
    assert.deepEqual(rig.root.scale.toArray(), [2, 2, 2]);
  }
  rig.model.dispose();
});
