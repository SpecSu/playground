import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CLUB_SELF_MARKER_COLOR, CLUB_SELF_MARKER_EDGE_COLOR, CLUB_SELF_MARKER_FLOOR_OFFSET,
  CLUB_SELF_MARKER_MAX_RADIUS, clubSelfMarkerRadius, createClubSelfMarker,
  type ClubSelfMarkerAvatar, type ClubSelfMarkerFrame,
} from '../lib/club-self-marker.ts';
import type { AvatarPreset, Participant } from '../lib/room-types.ts';
import { SEAT_TTL_MS } from '../lib/room-types.ts';
import { UPLOADED_CAST, uploadedTemplate } from './helpers/uploaded-avatar.ts';

function setup() {
  const scene = new THREE.Scene();
  const marker = createClubSelfMarker(scene);
  const participants: Participant[] = [];
  const players = new Map<string, ClubSelfMarkerAvatar>();
  const frame: ClubSelfMarkerFrame = { ownId: null, participants, players, floorY: -0.025 };
  function add(id = 'self', preset: AvatarPreset = 'human-subeike', joinedAt = 100) {
    const participant: Participant = { id, preset, joinedAt, name: id, slot: participants.length, lastSeenAt: 100, action: 'dance', actionAt: 100 };
    const root = new THREE.Group(), modelRoot = new THREE.Group();
    root.add(modelRoot);
    scene.add(root);
    const avatar: ClubSelfMarkerAvatar = { id, preset, root, slot: participant.slot, participant, ambient: false, desiredVisible: true, motion: { x: 2, z: -3 }, model: { root: modelRoot, height: 2.146, loaded: true } };
    participants.push(participant);
    players.set(id, avatar);
    return avatar;
  }
  return { scene, marker, participants, players, frame, add };
}

test('ground marker doubles its support footprint with the navigation root without inheriting float offsets', () => {
  const { marker, frame, add } = setup();
  const own = add(); frame.ownId = own.id;
  marker.update(frame); const nativeRadius = marker.root.scale.x;
  own.root.scale.setScalar(2);
  own.model.root.position.set(1, 3, 2);
  marker.update(frame);
  assert.equal(marker.root.scale.x, nativeRadius * 2);
  assert.equal(marker.root.scale.z, nativeRadius * 2);
  assert.equal(marker.root.position.y, frame.floorY! + CLUB_SELF_MARKER_FLOOR_OFFSET);
  marker.dispose();
});

test('uploaded cast marker radii include the doubled rest-pose foot support and margin', async () => {
  const point = new THREE.Vector3();
  for (const preset of UPLOADED_CAST) {
    const source = await uploadedTemplate(preset); source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    let support = 0;
    source.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
      for (let vertex = 0; vertex < weights.count; vertex++) {
        let footWeight = 0;
        for (let component = 0; component < 4; component++) if (/^foot_[LR]$/.test(node.skeleton.bones[indices.getComponent(vertex, component)].name)) footWeight += weights.getComponent(vertex, component);
        if (footWeight <= .5) continue;
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        support = Math.max(support, Math.hypot(point.x, point.z));
      }
    });
    const radius = clubSelfMarkerRadius(preset, bounds.max.y - bounds.min.y) * 2;
    assert.ok(radius >= support * 2 + .2, `${preset}: scaled marker covers the real feet with margin`);
  }
});

test('one scene-owned marker follows only an authoritative joined self, never the camera or DJ', () => {
  const { scene, marker, frame, add } = setup();
  const own = add(), other = add('other');
  assert.equal(marker.root.parent, scene);
  assert.equal(marker.root.visible, false);
  marker.update(frame);
  assert.equal(marker.root.visible, false, 'observer has no ring even with visible players');
  frame.ownId = 'self';
  marker.update(frame);
  assert.equal(marker.root.visible, true);
  assert.equal(marker.root.userData.participantId, 'self');
  assert.equal(marker.root.parent, scene, 'never parented to the dancing root');
  assert.equal(own.root.children.includes(marker.root), false);
  assert.equal(other.root.children.includes(marker.root), false);
  assert.equal(scene.children.filter(node => node.name === 'self-avatar-ground-marker').length, 1);
  const camera = new THREE.PerspectiveCamera();
  camera.userData.subjectId = 'other';
  marker.update({ ...frame, camera, viewportHeight: 700 });
  assert.equal(marker.root.userData.participantId, 'self', 'following another subject cannot transfer identity');
  own.ambient = true;
  marker.update(frame);
  assert.equal(marker.root.visible, false, 'ambient NPC is ineligible even in a malformed map');
  own.ambient = false;
  for (const djPreset of ['dj-kunkun', 'dj-cockatoo'] as const) {
    own.preset = djPreset;
    marker.update(frame);
    assert.equal(marker.root.visible, false, `${djPreset} is never eligible for a participant marker`);
  }
  marker.dispose();
});

test('leave, identity replacement, stale membership and avatar replacement fail closed without a duplicate', () => {
  const { marker, frame, add, participants, players, scene } = setup();
  const own = add();
  frame.ownId = 'self';
  marker.update(frame);
  assert.equal(marker.root.visible, true);
  frame.ownId = null;
  marker.update(frame);
  assert.equal(marker.root.visible, false);
  assert.equal(marker.root.userData.participantId, undefined);
  frame.ownId = 'self';
  marker.update({ ...frame, participants: [] });
  assert.equal(marker.root.visible, false, 'unexpired rendered entity cannot retain a left membership');
  participants[0] = { ...participants[0], joinedAt: 200 };
  marker.update(frame);
  assert.equal(marker.root.visible, false, 'same ID rejoining cannot highlight its previous membership');
  own.participant = participants[0];
  marker.update(frame);
  assert.equal(marker.root.visible, true);
  participants[0] = { ...participants[0], preset: 'frog' };
  marker.update(frame);
  assert.equal(marker.root.visible, false, 'new profile cannot mark the previous species during asset replacement');
  const replacement: ClubSelfMarkerAvatar = { ...own, preset: 'frog', participant: participants[0], root: new THREE.Group(), model: { root: new THREE.Group(), height: 1.071, loaded: false } };
  replacement.root.add(replacement.model.root);
  scene.add(replacement.root);
  players.set('self', replacement);
  marker.update(frame);
  assert.equal(marker.root.visible, false);
  replacement.model.loaded = true;
  marker.update(frame);
  assert.equal(marker.root.visible, true);
  assert.equal(marker.root.userData.joinedAt, 200);
  assert.equal(scene.children.filter(node => node.name === 'self-avatar-ground-marker').length, 1);
  players.delete('self');
  marker.update(frame);
  assert.equal(marker.root.visible, false);
  marker.dispose();
});

test('missing, hidden, detached, mismatched and unloaded rendered entities hide the ring', () => {
  const { scene, marker, frame, add } = setup();
  const own = add();
  frame.ownId = 'self';
  const changes: [() => void, () => void][] = [
    [() => { own.root.visible = false; }, () => { own.root.visible = true; }],
    [() => { own.model.root.visible = false; }, () => { own.model.root.visible = true; }],
    [() => { own.desiredVisible = false; }, () => { own.desiredVisible = true; }],
    [() => { own.model.loaded = false; }, () => { own.model.loaded = true; }],
    [() => { own.root.removeFromParent(); }, () => { scene.add(own.root); }],
    [() => { own.model.root.removeFromParent(); }, () => { own.root.add(own.model.root); }],
    [() => { own.id = 'other'; }, () => { own.id = 'self'; }],
    [() => { own.slot = 9; }, () => { own.slot = 0; }],
  ];
  for (const [change, restore] of changes) {
    marker.update(frame);
    assert.equal(marker.root.visible, true);
    change(); marker.update(frame);
    assert.equal(marker.root.visible, false);
    restore();
  }
  const carrier = new THREE.Group();
  scene.add(carrier); carrier.add(own.root); carrier.visible = false;
  marker.update(frame);
  assert.equal(marker.root.visible, false, 'hidden ancestor means the rendered avatar is absent');
  marker.dispose();
});

test('seat expiry hides an unchanged stale snapshot on resume and restores only fresh membership', () => {
  const { marker, frame, add, participants } = setup();
  const own = add(); frame.ownId = own.id;
  const seen = participants[0].lastSeenAt;
  marker.update({ ...frame, nowServer: seen + SEAT_TTL_MS - 1 });
  assert.equal(marker.root.visible, true, 'membership is still valid immediately before expiry');
  marker.update({ ...frame, nowServer: seen + SEAT_TTL_MS });
  assert.equal(marker.root.visible, false, 'exact server expiry boundary hides before a new snapshot');
  marker.update({ ...frame, nowServer: seen + SEAT_TTL_MS * 4 });
  assert.equal(marker.root.visible, false, 'hidden-tab resume cannot retain a stale marker');
  participants[0] = { ...participants[0], lastSeenAt: seen + SEAT_TTL_MS * 4 };
  marker.update({ ...frame, nowServer: participants[0].lastSeenAt });
  assert.equal(marker.root.visible, true, 'fresh authoritative heartbeat restores the same entity');
  marker.update({ ...frame, ownId: null, nowServer: participants[0].lastSeenAt });
  assert.equal(marker.root.visible, false, 'observer/disconnected role wins over a retained fresh member');
  marker.update({ ...frame, nowServer: participants[0].lastSeenAt - 50 });
  assert.equal(marker.root.visible, true, 'a small future lastSeenAt from clock correction is not expiry');
  for (const invalid of [NaN, Infinity, -Infinity]) {
    marker.update({ ...frame, nowServer: invalid });
    assert.equal(marker.root.visible, false, 'an explicitly invalid server clock fails closed');
    marker.update({ ...frame, nowServer: seen, participants: [{ ...participants[0], lastSeenAt: invalid }] });
    assert.equal(marker.root.visible, false, 'invalid membership timestamp cannot be treated as fresh');
  }
  marker.dispose();
});

test('retired blob membership matches its canonical feidudu avatar without accepting a different species', () => {
  const { marker, frame, add, participants } = setup();
  const own = add('self', 'monster-blob');
  frame.ownId = own.id;
  own.model.height = 1.733;
  marker.update(frame);
  assert.equal(marker.root.visible, true, 'stored legacy preset stays supported');
  const radius = marker.root.scale.x;
  own.preset = 'feidudu';
  marker.update(frame);
  assert.equal(marker.root.visible, true, 'resolved avatar identity matches legacy membership');
  assert.equal(marker.root.scale.x, radius);
  own.participant = { ...participants[0], preset: 'feidudu' };
  marker.update(frame);
  assert.equal(marker.root.visible, true, 'rendered participant metadata may also be canonical');
  participants[0] = { ...participants[0], preset: 'feidudu' };
  own.preset = 'monster-blob';
  marker.update(frame);
  assert.equal(marker.root.visible, true, 'canonical membership accepts the same legacy-backed model');
  own.preset = 'monster-tower';
  marker.update(frame);
  assert.equal(marker.root.visible, false, 'normalization does not accept other species');
  own.preset = 'feidudu';
  own.participant = { ...participants[0], preset: 'frog' };
  marker.update(frame);
  assert.equal(marker.root.visible, false, 'different rendered metadata remains ineligible');
  marker.dispose();
});

test('navigation determines ground X/Z while jumps, spins, body scale and carrier offsets cannot change its height', () => {
  const { scene, marker, frame, add } = setup();
  const own = add(); frame.ownId = own.id;
  const carrier = new THREE.Group();
  scene.add(carrier); carrier.add(own.root);
  const expectedY = frame.floorY! + CLUB_SELF_MARKER_FLOOR_OFFSET;
  for (let i = 0; i < 20; i++) {
    own.motion.x = i * 0.15; own.motion.z = -i * 0.2;
    own.root.position.set(50, 3 + i, 80);
    own.root.rotation.set(i, i * 0.7, i * 0.5);
    own.root.scale.setScalar(i % 2 ? 0.15 : 1.5);
    own.model.root.position.y = i * 0.9;
    own.model.root.rotation.z = i;
    carrier.position.set(2, 6, 4);
    marker.update(frame);
    assert.deepEqual(marker.root.position.toArray(), [own.motion.x, expectedY, own.motion.z]);
    assert.deepEqual(marker.root.rotation.toArray(), [0, 0, 0, 'XYZ']);
    assert.equal(marker.root.scale.y, 1);
  }
  frame.floorY = 2;
  marker.update(frame);
  assert.equal(marker.root.position.y, 2.02, 'a changed standing surface is explicit');
  marker.dispose();
});

test('invalid navigation, membership or floor coordinates cannot leak a stale visible marker', () => {
  const { marker, frame, add } = setup();
  const own = add(); frame.ownId = own.id;
  for (const invalid of [NaN, Infinity, -Infinity]) {
    marker.update(frame);
    assert.equal(marker.root.visible, true);
    marker.update({ ...frame, floorY: invalid });
    assert.equal(marker.root.visible, false);
    own.motion.x = invalid; marker.update(frame);
    assert.equal(marker.root.visible, false);
    own.motion.x = 0; own.motion.z = invalid; marker.update(frame);
    assert.equal(marker.root.visible, false);
    own.motion.z = 0;
    marker.update({ ...frame, participants: [{ ...own.participant!, joinedAt: invalid }] });
    assert.equal(marker.root.visible, false);
  }
  marker.dispose();
});

test('legacy fixture footprints cover their rest-pose support geometry without counting heads or held props', async () => {
  const presets = ['human-subeike', 'human-jiji', 'human-lx', 'cat', 'frog', 'dog', 'capybara', 'panda', 'banana-cat', 'sword-shield-dog', 'monster-tower', 'monster-star'];
  for (const preset of presets) {
    const bytes = readFileSync(new URL(`../public/avatars/${preset}.glb`, import.meta.url));
    const source = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const point = new THREE.Vector3();
    let supportRadius = 0, supportVertices = 0;
    source.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      const indices = node.geometry.getAttribute('skinIndex'), weights = node.geometry.getAttribute('skinWeight');
      const positions = node.geometry.getAttribute('position');
      for (let vertex = 0; vertex < positions.count; vertex++) {
        let supportWeight = 0;
        for (let component = 0; component < 4; component++) {
          const name = node.skeleton.bones[indices.getComponent(vertex, component)]?.name;
          if (name === 'foot_L' || name === 'foot_R' || preset === 'capybara' && (name === 'hand_L' || name === 'hand_R')) supportWeight += weights.getComponent(vertex, component);
        }
        if (supportWeight <= 0.5) continue;
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        supportRadius = Math.max(supportRadius, Math.hypot(point.x, point.z));
        supportVertices++;
      }
    });
    const radius = clubSelfMarkerRadius(preset, bounds.max.y - bounds.min.y);
    assert.ok(supportVertices > 0, `${preset} has measured foot support`);
    assert.ok(radius > supportRadius + 0.1, `${preset} ring has clearance around real feet`);
    assert.ok(radius >= 0.48 && radius <= 0.76, `${preset} remains bounded at normal camera distance`);
    source.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose()); if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); } });
  }
  assert.ok(clubSelfMarkerRadius('frog', 1.071) > clubSelfMarkerRadius('banana-cat', 1.726));
  assert.ok(clubSelfMarkerRadius('capybara', 1.239) > clubSelfMarkerRadius('dog', 1.947));
  assert.equal(clubSelfMarkerRadius('monster-blob', 1.733), clubSelfMarkerRadius('monster-star', 1.733));
});

test('far-view minimum visibility is subtle and world-size capped; invalid heights and projections stay finite', () => {
  for (const preset of ['human-subeike', 'frog', 'capybara', 'banana-cat', 'unknown']) {
    for (const height of [0.01, 1, 2.2, 100, NaN, Infinity, -1]) {
      const base = clubSelfMarkerRadius(preset, height);
      for (const pixels of [0.0001, 1, 15, 30, 200, 0, -1, NaN, Infinity]) {
        const radius = clubSelfMarkerRadius(preset, height, pixels);
        assert.ok(Number.isFinite(radius));
        assert.ok(radius >= base && radius <= base * 1.18 + 1e-10);
        assert.ok(radius <= CLUB_SELF_MARKER_MAX_RADIUS);
      }
    }
  }
});

test('both overview and perspective cameras use CSS-pixel scale with no dependence on body motion', () => {
  const { marker, frame, add } = setup();
  const own = add(); frame.ownId = own.id; own.motion = { x: 0, z: 0 };
  const overview = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 300);
  overview.position.set(0, 10, 10); overview.lookAt(0, 0, 0);
  marker.update({ ...frame, camera: overview, viewportHeight: 480 });
  const base = marker.root.scale.x;
  overview.left = -50; overview.right = 50; overview.top = 50; overview.bottom = -50; overview.updateProjectionMatrix();
  marker.update({ ...frame, camera: overview, viewportHeight: 480 });
  assert.equal(marker.root.scale.x, Math.min(base * 1.18, CLUB_SELF_MARKER_MAX_RADIUS));
  const perspective = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
  perspective.position.set(0, 8, 8); perspective.lookAt(0, 0, 0);
  marker.update({ ...frame, camera: perspective, viewportHeight: 480 });
  assert.equal(marker.root.scale.x, base);
  perspective.position.set(0, 80, 80); perspective.lookAt(0, 0, 0);
  marker.update({ ...frame, camera: perspective, viewportHeight: 480 });
  assert.ok(marker.root.scale.x > base && marker.root.scale.x <= CLUB_SELF_MARKER_MAX_RADIUS);
  marker.dispose();
});

test('A is exactly a thin yellow ring, fine dark edge and 15% fill with normal depth occlusion', () => {
  const { marker } = setup();
  assert.equal(marker.root.children.length, 3, 'no directional triangle, light or extra ornament');
  const fill = marker.root.getObjectByName('self-marker-fill') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  const edge = marker.root.getObjectByName('self-marker-edge') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  const ring = marker.root.getObjectByName('self-marker-ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  assert.equal(fill.material.opacity, 0.15);
  assert.equal(fill.material.color.getHex(), CLUB_SELF_MARKER_COLOR);
  assert.equal(ring.material.color.getHex(), CLUB_SELF_MARKER_COLOR);
  assert.equal(edge.material.color.getHex(), CLUB_SELF_MARKER_EDGE_COLOR);
  assert.ok(ring.geometry.parameters.outerRadius - ring.geometry.parameters.innerRadius < 0.08);
  assert.ok(edge.geometry.parameters.innerRadius < ring.geometry.parameters.innerRadius);
  assert.ok(edge.geometry.parameters.outerRadius > ring.geometry.parameters.outerRadius);
  for (const mesh of [fill, edge, ring]) {
    assert.ok(mesh.material instanceof THREE.MeshBasicMaterial);
    assert.equal(mesh.material.depthTest, true);
    assert.equal(mesh.material.depthWrite, false);
    assert.equal(mesh.material.toneMapped, false);
    assert.equal(mesh.material.fog, false);
    assert.equal(mesh.rotation.x, -Math.PI / 2);
    assert.equal(mesh.userData.floorPickThrough, true);
    assert.ok(CLUB_SELF_MARKER_FLOOR_OFFSET + mesh.position.y <= 0.025);
  }
  marker.dispose();
});

test('meshes and materials are pooled, never pulse, and unmount disposes only marker resources exactly once', () => {
  const { marker, scene, frame, add } = setup();
  const own = add(); frame.ownId = own.id;
  const meshes = marker.root.children as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  const geometries = meshes.map(mesh => mesh.geometry), materials = meshes.map(mesh => mesh.material);
  let geometryDisposals = 0, materialDisposals = 0;
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => geometryDisposals++));
  materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
  marker.update(frame);
  const scale = marker.root.scale.clone();
  const opacities = materials.map(material => material.opacity);
  for (let index = 0; index < 120; index++) {
    marker.update(frame);
    assert.ok(marker.root.scale.equals(scale));
    assert.deepEqual(materials.map(material => material.opacity), opacities);
    assert.deepEqual(marker.root.children.map(mesh => (mesh as THREE.Mesh).geometry), geometries);
  }
  marker.dispose(); marker.dispose(); marker.update(frame);
  assert.equal(geometryDisposals, 3);
  assert.equal(materialDisposals, 3);
  assert.equal(marker.root.visible, false);
  assert.equal(marker.root.parent, null);
  assert.equal(marker.root.children.length, 0);
  assert.equal(own.root.parent, scene, 'avatar ownership is untouched');
  assert.equal(own.model.root.parent, own.root);
});

test('real world membership and the tidal presentation carrier keep one marker anchored to navigation', async () => {
  const { makeClubWorld } = await import('../lib/club-scene-world.ts');
  const { createClubTidalWave } = await import('../lib/club-tidal-wave.ts');
  const world = makeClubWorld({ createAvatar: () => ({ root: new THREE.Group(), height: 2.146, labelHeight: 2.4, footprintRadius: 0.5, loaded: true, ready: Promise.resolve(), update() {}, dispose() {} }) });
  const marker = createClubSelfMarker(world.scene), wave = createClubTidalWave(world.scene);
  const participant: Participant = { id: 'self', name: 'Self', preset: 'human-subeike', slot: 0, joinedAt: 100, lastSeenAt: 100, action: 'dance', actionAt: 100 };
  const epoch = 1_791_806_400_000;
  const action = { id: 'test-wave', kind: 'wave' as const, version: 2 as const, startsAt: epoch, endsAt: epoch + 10000, beatMs: 500, sourceClockBySlot: Array.from({ length: 10 }, () => epoch) };
  world.syncParticipants([participant], 'self');
  const own = world.players.get('self')!;
  for (const elapsed of [1000, 2500, 5000, 7500, 9999]) {
    wave.prepareFrame();
    world.update(24, 'ice', false, 0.8, epoch + elapsed, undefined, { groupAction: action });
    wave.update(epoch + elapsed, action, false, [...world.players.values(), ...world.ambient]);
    marker.update({ ownId: 'self', participants: [participant], players: world.players, floorY: world.floor.position.y });
    assert.equal(marker.root.visible, true);
    assert.deepEqual(marker.root.position.toArray(), [own.motion.x, world.floor.position.y + CLUB_SELF_MARKER_FLOOR_OFFSET, own.motion.z]);
    assert.equal(marker.root.parent, world.scene);
    if (elapsed === 5000) assert.ok(own.model.root.getWorldPosition(new THREE.Vector3()).y > 1.3, 'animated body floats while marker stays on ground');
  }
  world.syncParticipants([], null);
  marker.update({ ownId: null, participants: [], players: world.players });
  assert.equal(marker.root.visible, false);
  marker.dispose(); wave.dispose(); world.dispose();
  assert.equal(world.scene.children.length, 0);
});

test('scene owns one marker lifecycle, updates it after the camera, and suppresses the old white halo', () => {
  const component = readFileSync(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');
  assert.match(component, /selfMarker = createClubSelfMarker\(world\.scene\)/);
  assert.match(component, /for \(const rig of world\.players\.values\(\)\) rig\.halo\.visible = false/);
  const update = component.indexOf('selfMarker?.update(');
  assert.ok(update > component.indexOf('camera = cameras.update('));
  assert.ok(update < component.indexOf('renderer.render(world.scene, camera)'));
  assert.match(component.slice(update, component.indexOf('renderer.render(world.scene, camera)')), /ownId: danceActive \|\| snapshot\.selfMarkerEnabled === false \? null : snapshot\.ownId, participants: snapshot\.participants, players: world\.players/);
  assert.match(component.slice(update, component.indexOf('renderer.render(world.scene, camera)')), /viewportHeight: height, floorY: world\.floor\.position\.y/);
  assert.match(component.slice(update, component.indexOf('renderer.render(world.scene, camera)')), /\bnowServer\s*\}/);
  assert.ok(component.indexOf('selfMarker?.dispose()') < component.indexOf('world?.dispose()'));
});
