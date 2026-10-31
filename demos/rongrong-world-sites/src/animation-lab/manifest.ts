import source from './manifest.json' with {type: 'json'};
import type {LabAsset, LabClip, LabClipName, LabManifest, LabProfile, LabSpecies} from './types.ts';

const speciesByProfile = {
 hoof: ['cow', 'sheep', 'pig', 'alpaca', 'deer'],
 pawed: ['cat', 'dog', 'capybara', 'fox', 'raccoon', 'hedgehog', 'wolf', 'tiger', 'lion', 'bear'],
 hopper: ['bunny'],
 sprawlingreptile: ['crocodile'],
 groundbird: ['duck', 'chicken'],
 flyingbird: ['owl', 'parrot', 'woodpecker', 'tit', 'toucan'],
 penguin: ['penguin'],
} as const satisfies Record<LabProfile, readonly LabSpecies[]>;
const speciesIds = Object.values(speciesByProfile).flat();
const baseClips = ['idle', 'walk', 'drink_enter', 'drink_loop', 'drink_exit', 'eat', 'rest', 'carried', 'react', 'pet', 'alert', 'celebrate'] as const;
const flightClips = ['takeoff', 'fly', 'land', 'perch'] as const;
const pounceClips = ['pounce', 'recoil'] as const;
const pouncingSpecies: readonly LabSpecies[] = ['cat', 'fox', 'wolf', 'tiger', 'lion', 'bear'];
const loopingClips: readonly LabClipName[] = ['idle', 'walk', 'drink_loop', 'eat', 'rest', 'carried', 'fly', 'perch'];

function invalid(path: string, expected: string): never {
 throw new Error(`Invalid animation lab manifest at ${path}: expected ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
 if (!isRecord(value)) invalid(path, 'an object');
 return value;
}

function array(value: unknown, path: string): unknown[] {
 if (!Array.isArray(value)) invalid(path, 'an array');
 return value;
}

function nonemptyString(value: unknown, path: string): void {
 if (typeof value !== 'string' || !value.trim()) invalid(path, 'a nonempty string');
}

function positiveNumber(value: unknown, path: string): void {
 if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) invalid(path, 'a finite positive number');
}

function exact(value: unknown, expected: string | number | boolean, path: string): void {
 if (value !== expected) invalid(path, JSON.stringify(expected));
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], path: string): T {
 const match = choices.find(choice => choice === value);
 if (match === undefined) invalid(path, `one of ${choices.join(', ')}`);
 return match;
}

function exactStrings(value: unknown, expected: readonly string[], path: string): void {
 const strings = array(value, path);
 if (strings.length !== expected.length) invalid(path, `${expected.length} entries`);
 for (const [index, entry] of strings.entries()) exact(entry, expected[index], `${path}[${index}]`);
}

function requiredClips(id: LabSpecies, profile: LabProfile): readonly LabClipName[] {
 return [...baseClips, ...(profile === 'flyingbird' ? flightClips : pouncingSpecies.includes(id) ? pounceClips : [])];
}

function contactMode(name: LabClipName, profile: LabProfile): LabClip['contactMode'] {
 if (name === 'carried') return 'carried';
 if (name === 'fly') return 'airborne';
 if (['celebrate', 'pounce', 'takeoff', 'land'].includes(name)) return 'mixed';
 if (name === 'walk' && (profile === 'hopper' || profile === 'flyingbird')) return 'mixed';
 return 'grounded';
}

function validateAnchors(value: unknown, id: LabSpecies, bird: boolean, path: string): void {
 const anchors = record(value, path);
 for (const key of ['root', 'body', 'head'] as const) exact(anchors[key], `${id}_${key}`, `${path}.${key}`);
 exactStrings(anchors.neck, [`${id}_neck_01`, `${id}_neck_02`], `${path}.neck`);
 for (const [key, name] of Object.entries({mouth: 'feeding-mouth', support: 'animal-support', ground: 'animal-ground', headTarget: 'animal-head'})) {
  exact(anchors[key], name, `${path}.${key}`);
 }
 const feet = bird ? [`${id}_L_contact`, `${id}_R_contact`]
  : ['front_L', 'front_R', 'back_L', 'back_R'].map(limb => `${id}_${limb}_contact`);
 exactStrings(anchors.feet, feet, `${path}.feet`);
}

function validateClips(value: unknown, id: LabSpecies, profile: LabProfile, path: string): void {
 const clips = array(value, path);
 const required = requiredClips(id, profile);
 if (clips.length !== required.length) invalid(path, `${required.length} required clips for ${id}`);
 const names = new Set<LabClipName>();
 for (const [index, entry] of clips.entries()) {
  const clipPath = `${path}[${index}]`;
  const clip = record(entry, clipPath);
  const name = oneOf(clip.name, required, `${clipPath}.name`);
  if (names.has(name)) invalid(`${clipPath}.name`, `a unique clip name for ${id}`);
  names.add(name);
  positiveNumber(clip.durationSeconds, `${clipPath}.durationSeconds`);
  exact(clip.loop, loopingClips.includes(name), `${clipPath}.loop`);
  exact(clip.rootMotion, false, `${clipPath}.rootMotion`);
  exact(clip.contactMode, contactMode(name, profile), `${clipPath}.contactMode`);
  const tags = array(clip.tags, `${clipPath}.tags`);
  for (const [tagIndex, tag] of tags.entries()) nonemptyString(tag, `${clipPath}.tags[${tagIndex}]`);
  if (!tags.includes(profile)) invalid(`${clipPath}.tags`, `the ${profile} profile tag`);
 }
}

/** Check untrusted JSON before exposing it as the lab's structural contract. */
export function validateLabManifest(value: unknown): asserts value is LabManifest {
 const manifest = record(value, 'manifest');
 exact(manifest.schemaVersion, 1, 'schemaVersion');
 const coordinateSystem = record(manifest.coordinateSystem, 'coordinateSystem');
 for (const [key, expected] of Object.entries({up: '+Y', forward: '+Z', groundY: 0, units: 'meters'})) {
  exact(coordinateSystem[key], expected, `coordinateSystem.${key}`);
 }
 const assets = array(manifest.assets, 'assets');
 if (assets.length !== speciesIds.length) invalid('assets', `${speciesIds.length} species`);
 const ids = new Set<LabSpecies>();
 for (const [index, entry] of assets.entries()) {
  const path = `assets[${index}]`;
  const asset = record(entry, path);
  const id = oneOf(asset.id, speciesIds, `${path}.id`);
  if (ids.has(id)) invalid(`${path}.id`, 'a unique species ID');
  ids.add(id);
  const profile = oneOf(asset.profile, ['hoof', 'pawed', 'hopper', 'sprawlingreptile', 'groundbird', 'flyingbird', 'penguin'] as const, `${path}.profile`);
  const expectedProfile = Object.entries(speciesByProfile).find(([, species]) => species.some(candidate => candidate === id))?.[0];
  exact(profile, expectedProfile ?? '', `${path}.profile`);
  const bird = profile === 'groundbird' || profile === 'flyingbird' || profile === 'penguin';
  exact(asset.family, bird ? 'bird' : 'fourfoot', `${path}.family`);
  for (const key of ['label', 'gaitDescription', 'silhouette'] as const) nonemptyString(asset[key], `${path}.${key}`);
  exact(asset.status, 'prototype', `${path}.status`);
  exact(asset.url, `/models/animation-lab/${id}.glb`, `${path}.url`);
  exact(asset.source, `art-source/animation-lab/generated/${id}/${id}.blend`, `${path}.source`);
  exact(asset.referencePack, profile === 'flyingbird' ? 'forest-bird-reference-pack-v1' : 'animal-reference-pack-v1', `${path}.referencePack`);
  positiveNumber(asset.strideMeters, `${path}.strideMeters`);
  validateAnchors(asset.anchors, id, bird, `${path}.anchors`);
  validateClips(asset.clips, id, profile, `${path}.clips`);
 }
}

function freezeManifest(manifest: LabManifest): void {
 Object.freeze(manifest.coordinateSystem);
 for (const asset of manifest.assets) {
  Object.freeze(asset.anchors.neck);
  Object.freeze(asset.anchors.feet);
  Object.freeze(asset.anchors);
  for (const clip of asset.clips) {
   Object.freeze(clip.tags);
   Object.freeze(clip);
  }
  Object.freeze(asset.clips);
  Object.freeze(asset);
 }
 Object.freeze(manifest.assets);
 Object.freeze(manifest);
}

const manifest: unknown = source;
validateLabManifest(manifest);
freezeManifest(manifest);

export const LAB_ASSETS: readonly LabAsset[] = manifest.assets;

export function getLabAsset(id: LabSpecies): LabAsset {
 const asset = LAB_ASSETS.find(candidate => candidate.id === id);
 if (!asset) throw new Error(`Animation lab asset not found: ${String(id)}`);
 return asset;
}

export function getLabClip(asset: LabAsset, name: LabClipName): LabClip {
 const clip = asset.clips.find(candidate => candidate.name === name);
 if (!clip) throw new Error(`Animation lab asset ${asset.id} has no clip: ${String(name)}`);
 return clip;
}
