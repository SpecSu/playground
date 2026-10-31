import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {LAB_ASSETS, getLabAsset, getLabClip, validateLabManifest} from '../src/animation-lab/manifest.ts';
import type {LabClipName, LabSpecies} from '../src/animation-lab/types.ts';

const expectedSpecies = [
 'cow', 'sheep', 'pig', 'bunny', 'duck', 'chicken', 'cat', 'dog', 'alpaca',
 'capybara', 'deer', 'fox', 'raccoon', 'hedgehog', 'penguin', 'wolf', 'tiger',
 'lion', 'bear', 'crocodile', 'owl', 'parrot', 'woodpecker', 'tit', 'toucan',
];
const baseClips = ['idle', 'walk', 'drink_enter', 'drink_loop', 'drink_exit', 'eat', 'rest', 'carried', 'react', 'pet', 'alert', 'celebrate'];
const flyingBirds = ['owl', 'parrot', 'woodpecker', 'tit', 'toucan'];
const pouncingSpecies = ['cat', 'fox', 'wolf', 'tiger', 'lion', 'bear'];
const runtimeUrl = new URL('../src/animation-lab/manifest.json', import.meta.url);
// Independent frozen approval fixture, tracked with the tests for clean source exports.
const sourceUrl = new URL('./fixtures/animation-lab-manifest.contract.json', import.meta.url);

// Deliberately permissive input fixture: the validator, not a cast, must reject corrupt values.
type ManifestInput = {
 schemaVersion: unknown;
 coordinateSystem: Record<string, unknown>;
 assets: Array<Record<string, unknown> & {anchors: Record<string, unknown>; clips: Array<Record<string, unknown>>}>;
};
function fixture(): ManifestInput {
 return JSON.parse(readFileSync(sourceUrl, 'utf8'));
}

test('runtime JSON preserves the approved frozen contract byte-for-byte', () => {
 const bytes = readFileSync(runtimeUrl);
 assert.equal(createHash('sha256').update(bytes).digest('hex'), 'f100c1c110d3ac2a93afe24d7aca4837c1e5634cd2a18d7f6430275fc7bc6f14');
 assert.deepEqual(bytes, readFileSync(sourceUrl));
 assert.doesNotThrow(() => validateLabManifest(JSON.parse(bytes.toString())));
});

test('catalog exposes exactly 25 unique species across the seven mechanical profiles', () => {
 assert.equal(LAB_ASSETS.length, 25);
 assert.deepEqual(LAB_ASSETS.map(asset => asset.id), expectedSpecies);
 assert.equal(new Set(LAB_ASSETS.map(asset => asset.id)).size, 25);
 assert.deepEqual([...new Set(LAB_ASSETS.map(asset => asset.profile))].sort(), ['flyingbird', 'groundbird', 'hoof', 'hopper', 'pawed', 'penguin', 'sprawlingreptile']);
 for (const id of ['capybara', 'hedgehog'] as const) assert.equal(getLabAsset(id).profile, 'pawed');
});

test('all 332 species/clip pairs have exactly the required base and species-specific actions', () => {
 const pairs: string[] = [];
 for (const asset of LAB_ASSETS) {
  const extras = flyingBirds.includes(asset.id) ? ['takeoff', 'fly', 'land', 'perch'] : pouncingSpecies.includes(asset.id) ? ['pounce', 'recoil'] : [];
  assert.deepEqual(asset.clips.map(clip => clip.name), [...baseClips, ...extras], asset.id);
  for (const clip of asset.clips) pairs.push(`${asset.id}/${clip.name}`);
 }
 assert.equal(pairs.length, 332);
 assert.equal(new Set(pairs).size, 332);
});

test('the original nine action durations remain exact for each of the five farm species', () => {
 const names = ['idle', 'walk', 'drink_enter', 'drink_loop', 'drink_exit', 'eat', 'rest', 'carried', 'react'] as const;
 const durations = {
  cow: [3, 1.2083333333333333, 1.0833333333333333, 2.5833333333333335, 1.2916666666666667, 2, 3, 3, 1.25],
  sheep: [3, 1.2083333333333333, 1.0833333333333333, 2.5833333333333335, 1.2916666666666667, 2, 3, 3, 1],
  pig: [3, 1.2083333333333333, 1.0833333333333333, 2.5833333333333335, 1.2916666666666667, 2, 3, 3, 1],
  bunny: [3, 0.9166666666666666, 1.1666666666666667, 2.75, 1.2083333333333333, 2, 3, 2.5, 1.25],
  duck: [3, 1, 1.2083333333333333, 2.5, 1.2083333333333333, 2, 3, 2.5, 1.25],
 };
 for (const id of ['cow', 'sheep', 'pig', 'bunny', 'duck'] as const) {
  assert.deepEqual(names.map(name => getLabClip(getLabAsset(id), name).durationSeconds), durations[id], id);
 }
});

test('assets use fixed isolated paths, positive strides, prototype labels and complete anchors', () => {
 for (const asset of LAB_ASSETS) {
  assert.equal(asset.url, `/models/animation-lab/${asset.id}.glb`);
  assert.equal(asset.source, `art-source/animation-lab/generated/${asset.id}/${asset.id}.blend`);
  assert.equal(asset.referencePack, flyingBirds.includes(asset.id) ? 'forest-bird-reference-pack-v1' : 'animal-reference-pack-v1');
  assert.equal(asset.status, 'prototype');
  assert.ok(Number.isFinite(asset.strideMeters) && asset.strideMeters > 0, asset.id);
  assert.ok(asset.label.trim() && asset.gaitDescription.trim() && asset.silhouette.trim());
  assert.deepEqual(asset.anchors.neck, [`${asset.id}_neck_01`, `${asset.id}_neck_02`]);
  assert.equal(asset.anchors.root, `${asset.id}_root`);
  assert.equal(asset.anchors.body, `${asset.id}_body`);
  assert.equal(asset.anchors.head, `${asset.id}_head`);
  assert.equal(asset.anchors.mouth, 'feeding-mouth');
  assert.equal(asset.anchors.support, 'animal-support');
  assert.equal(asset.anchors.ground, 'animal-ground');
  assert.equal(asset.anchors.headTarget, 'animal-head');
  assert.equal(asset.anchors.feet.length, asset.family === 'bird' ? 2 : 4);
  assert.equal(new Set(asset.anchors.feet).size, asset.anchors.feet.length);
 }
});

test('clips retain in-place root motion and exact loop/contact classifications', () => {
 const loops = ['idle', 'walk', 'drink_loop', 'eat', 'rest', 'carried', 'fly', 'perch'];
 for (const asset of LAB_ASSETS) for (const clip of asset.clips) {
  assert.equal(clip.rootMotion, false, `${asset.id}/${clip.name}`);
  assert.equal(clip.loop, loops.includes(clip.name), `${asset.id}/${clip.name}`);
  const contact = clip.name === 'carried' ? 'carried' : clip.name === 'fly' ? 'airborne'
   : ['celebrate', 'pounce', 'takeoff', 'land'].includes(clip.name) || (clip.name === 'walk' && (asset.id === 'bunny' || flyingBirds.includes(asset.id))) ? 'mixed' : 'grounded';
  assert.equal(clip.contactMode, contact, `${asset.id}/${clip.name}`);
  assert.ok(Number.isFinite(clip.durationSeconds) && clip.durationSeconds > 0);
  assert.ok(clip.tags.includes(asset.profile));
  assert.ok(clip.tags.every(tag => typeof tag === 'string' && tag.trim()));
 }
});

test('lookup helpers resolve the shared frozen objects and explain missing species or actions', () => {
 const cow = getLabAsset('cow');
 assert.equal(cow, LAB_ASSETS[0]);
 assert.equal(getLabClip(cow, 'idle'), cow.clips[0]);
 assert.throws(() => getLabAsset('dragon' as LabSpecies), /animation lab.*asset.*dragon/i);
 assert.throws(() => getLabClip(cow, 'fly'), /animation lab.*cow.*fly/i);
 assert.throws(() => getLabClip(cow, 'unknown' as LabClipName), /animation lab.*cow.*unknown/i);
});

test('the exported catalog is deeply frozen so consumers cannot corrupt later lookups', () => {
 const cow = getLabAsset('cow');
 for (const value of [LAB_ASSETS, cow, cow.anchors, cow.anchors.neck, cow.anchors.feet, cow.clips, cow.clips[0], cow.clips[0].tags]) assert.equal(Object.isFrozen(value), true);
 assert.throws(() => { cow.label = 'changed'; }, TypeError);
 assert.throws(() => { cow.clips[0].durationSeconds = 99; }, TypeError);
 assert.equal(getLabClip(getLabAsset('cow'), 'idle').durationSeconds, 3);
});

test('runtime validation rejects malformed schema, coordinates and asset collections', () => {
 for (const value of [null, [], {}, {schemaVersion: 1}, {...fixture(), schemaVersion: 2}, {...fixture(), coordinateSystem: null}, {...fixture(), assets: {}}]) {
  assert.throws(() => validateLabManifest(value), /Invalid animation lab manifest/i);
 }
 for (const [field, value] of [['up', '+Z'], ['forward', '-Z'], ['groundY', 1], ['units', 'centimeters']] as const) {
  const data = fixture(); data.coordinateSystem[field] = value;
  assert.throws(() => validateLabManifest(data), new RegExp(`coordinateSystem.${field}`));
 }
 for (const mutate of [
  (data: ManifestInput) => { data.assets.pop(); },
  (data: ManifestInput) => { data.assets[1].id = 'cow'; },
  (data: ManifestInput) => { data.assets[0].id = 'dragon'; },
 ]) {
  const data = fixture(); mutate(data);
  assert.throws(() => validateLabManifest(data), /assets/);
 }
});

test('runtime validation checks every asset field rather than trusting imported JSON', () => {
 const badValues: Array<[string, unknown]> = [
  ['label', ''], ['family', 'fish'], ['profile', 'unknown'], ['status', 'production'],
  ['url', '/models/cow.glb'], ['source', 'art-source/cow.blend'], ['referencePack', 'unknown'],
  ['strideMeters', 0], ['strideMeters', -1], ['strideMeters', Infinity], ['strideMeters', NaN],
  ['gaitDescription', ' '], ['silhouette', null], ['anchors', null], ['clips', {}],
 ];
 for (const [field, value] of badValues) {
  const data = fixture(); data.assets[0][field] = value;
  assert.throws(() => validateLabManifest(data), new RegExp(`assets\\[0\\].${field}`), field);
 }
 for (const [field, value] of [['profile', 'pawed'], ['family', 'bird']] as const) {
  const data = fixture(); data.assets[0][field] = value;
  assert.throws(() => validateLabManifest(data), new RegExp(`assets\\[0\\].${field}`));
 }
});

test('runtime validation rejects missing, malformed and duplicate anchors', () => {
 for (const [field, value] of [
  ['root', 'wrong_root'], ['body', null], ['head', 3], ['mouth', ''], ['support', 'wrong'],
  ['ground', 'wrong'], ['headTarget', 'wrong'], ['neck', ['cow_neck_01']],
  ['neck', ['cow_neck_01', 'wrong']], ['feet', []], ['feet', ['x', 'x', 'x', 'x']],
 ] as Array<[string, unknown]>) {
  const data = fixture(); data.assets[0].anchors[field] = value;
  assert.throws(() => validateLabManifest(data), new RegExp(`assets\\[0\\].anchors.${field}`), field);
 }
});

test('runtime validation rejects invalid clip fields and incorrect semantic flags', () => {
 for (const [field, value] of [
  ['name', 'dance'], ['durationSeconds', 0], ['durationSeconds', NaN], ['durationSeconds', Infinity],
  ['loop', 'true'], ['loop', false], ['rootMotion', true], ['contactMode', 'airborne'],
  ['tags', null], ['tags', []], ['tags', ['hoof', 1]], ['tags', ['hoof', ' ']],
 ] as Array<[string, unknown]>) {
  const data = fixture(); data.assets[0].clips[0][field] = value;
  assert.throws(() => validateLabManifest(data), new RegExp(`assets\\[0\\].clips\\[0\\].${field}`), field);
 }
});

test('runtime validation rejects missing, duplicate and unapproved extra actions', () => {
 for (const mutate of [
  (data: ManifestInput) => { data.assets[0].clips.pop(); },
  (data: ManifestInput) => { data.assets[0].clips[1] = {...data.assets[0].clips[0]}; },
  (data: ManifestInput) => { data.assets[20].clips.pop(); },
  (data: ManifestInput) => { data.assets[6].clips.pop(); },
  (data: ManifestInput) => { data.assets[7].clips.push({...data.assets[6].clips[12]}); },
 ]) {
  const data = fixture(); mutate(data);
  assert.throws(() => validateLabManifest(data), /assets\[\d+\].clips/);
 }
});
