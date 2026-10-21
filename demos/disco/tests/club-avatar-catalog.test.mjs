import './room-loader.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CHOICES = [
  ['milk-frog', '奶蛙'], ['niulai', '牛来'], ['feidudu', '肥嘟嘟'],
  ['miaocuijiao', '喵脆角'], ['banana-cat', '香蕉猫'], ['sword-shield-dog', '刀盾狗'],
  ['human-lx', 'LX'], ['human-kelly', 'Kelly'], ['human-bear', 'Bear熊'],
  ['human-subeike', '苏贝壳'], ['human-jiji', '吉吉'], ['human-jiaxin', 'Jiaxin'],
];
const CANONICAL_IDS = CHOICES.map(([id]) => id);
const LEGACY_ALIASES = {
  cat: 'miaocuijiao', frog: 'milk-frog', dog: 'sword-shield-dog',
  capybara: 'feidudu', panda: 'niulai', 'monster-blob': 'feidudu',
  'monster-tower': 'niulai', 'monster-star': 'milk-frog',
};

async function catalogModule() {
  return import('../lib/club-avatar-catalog.ts');
}

test('catalog exposes exactly the approved twelve named choices in four-row order', async () => {
  const { CLUB_AVATAR_CATALOG, CLUB_AVATAR_PICKER_OPTIONS, DEFAULT_AVATAR_PRESET } = await catalogModule();
  assert.deepEqual(CLUB_AVATAR_CATALOG.map(avatar => [avatar.id, avatar.label]), CHOICES);
  assert.deepEqual(CLUB_AVATAR_PICKER_OPTIONS.map(avatar => [avatar.id, avatar.label]), CHOICES);
  assert.equal(CLUB_AVATAR_CATALOG.length, 12);
  assert.deepEqual(CLUB_AVATAR_CATALOG.filter(avatar => avatar.category === 'animal').map(avatar => avatar.id), CANONICAL_IDS.slice(0, 6));
  assert.deepEqual(CLUB_AVATAR_CATALOG.filter(avatar => avatar.category === 'human').map(avatar => avatar.id), CANONICAL_IDS.slice(6));
  assert.equal(DEFAULT_AVATAR_PRESET, 'human-subeike');
});

test('new canonical choices and every legacy protocol identity resolve to a selectable avatar', async () => {
  const { AVATAR_PRESETS, CANONICAL_AVATAR_PRESETS, ROOM_CAPACITY, resolveAvatarPreset } = await import('../lib/room-types.ts');
  const { CLUB_AVATAR_CATALOG } = await catalogModule();
  assert.deepEqual(CANONICAL_AVATAR_PRESETS, CANONICAL_IDS);
  assert.deepEqual(new Set(AVATAR_PRESETS), new Set([...CANONICAL_IDS, ...Object.keys(LEGACY_ALIASES)]));
  assert.equal(AVATAR_PRESETS.length, 20, 'Legacy IDs stay readable but do not become picker choices');
  assert.equal(ROOM_CAPACITY, 10, 'Avatar variety must not change live seat capacity');
  for (const preset of AVATAR_PRESETS) {
    const saved = JSON.parse(JSON.stringify({ name: '老朋友', preset }));
    const resolved = resolveAvatarPreset(saved.preset);
    assert.equal(resolved, LEGACY_ALIASES[preset] ?? preset);
    assert.ok(CLUB_AVATAR_CATALOG.some(avatar => avatar.id === resolved));
    assert.equal(resolveAvatarPreset(resolved), resolved, 'Resolution is stable for canonical IDs');
  }
});

test('every immutable choice exposes its own public model and portrait assets', async () => {
  const { CLUB_AVATAR_CATALOG, CLUB_AVATAR_PICKER_OPTIONS, CLUB_AVATAR_MODEL_URLS } = await catalogModule();
  assert.ok(Object.isFrozen(CLUB_AVATAR_CATALOG));
  assert.ok(Object.isFrozen(CLUB_AVATAR_PICKER_OPTIONS));
  assert.ok(CLUB_AVATAR_MODEL_URLS, 'The canonical model URL map is exported');
  assert.ok(Object.isFrozen(CLUB_AVATAR_MODEL_URLS));
  assert.deepEqual(Object.keys(CLUB_AVATAR_MODEL_URLS), CANONICAL_IDS);
  for (const avatar of CLUB_AVATAR_CATALOG) {
    assert.ok(Object.isFrozen(avatar));
    assert.ok(avatar.label.length > 0 && avatar.label.length <= 8);
    assert.ok(avatar.previewIcon.length > 0);
    assert.equal(avatar.previewImage, `/avatars/portraits/${avatar.id}.webp`);
    assert.equal(avatar.modelUrl, `/avatars/cast-v1/${avatar.id}.glb`);
    assert.equal(CLUB_AVATAR_MODEL_URLS[avatar.id], avatar.modelUrl);
    assert.ok(Object.values(avatar).every(value => typeof value === 'string'));
  }
});

test('selector keeps saved-profile resolution and the shared portrait in the own-profile control', async () => {
  const source = await readFile(new URL('../components/LiveFeed.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.ok(source.includes('CLUB_AVATAR_PICKER_OPTIONS.map('));
  assert.ok(source.includes('aria-pressed={preset === avatar.id}'));
  assert.ok(source.includes('选择形象'));
  assert.ok(source.includes('resolveAvatarPreset(saved?.preset)'));
  assert.ok(source.includes('CLUB_AVATAR_CATALOG.some(avatar => avatar.id === savedPreset)'));
  assert.ok(source.includes('setPreset(resolveAvatarPreset(self.preset))'));
  assert.ok(source.includes("type: joined ? 'profile' : 'join'"));
  assert.ok(source.includes('ownAvatar.previewImage'));
  assert.ok(css.includes('max-height:calc(100% - 40px);overflow-y:auto'));
});

test('all twelve portrait files are lightweight WebP images with a real transparent alpha channel', async () => {
  for (const id of CANONICAL_IDS) {
    const bytes = await readFile(new URL(`../public/avatars/portraits/${id}.webp`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8X', `${id} is an alpha-capable WebP`);
    assert.ok(bytes[20] & 0x10, `${id} retains alpha transparency`);
    assert.ok(bytes.byteLength < 30_000, 'Portraits must stay lightweight for phone selection');
    assert.ok(bytes.byteLength > 100);
  }
});

test('initial five NPCs use the requested cast while preserving stable IDs, seats and the separate DJ', async () => {
  const { CLUB_AMBIENT_CAST } = await import('../lib/club-ambient-cast.ts');
  assert.deepEqual(CLUB_AMBIENT_CAST.map(({ preset, name }) => [preset, name]), [
    ['milk-frog', '奶蛙'], ['niulai', '牛来'], ['banana-cat', '香蕉猫'],
    ['miaocuijiao', '喵脆角'], ['sword-shield-dog', '刀盾狗'],
  ]);
  assert.deepEqual(Object.fromEntries(CLUB_AMBIENT_CAST.map(({ id, slot }) => [id, slot])), {
    'ambient-capy': 2, 'ambient-tower': 3, 'ambient-momo': 1, 'ambient-luna': 5, 'ambient-pepper': 4,
  });
  assert.equal(CLUB_AMBIENT_CAST.some(({ preset }) => preset === 'dj-cockatoo'), false);
  assert.equal(CLUB_AMBIENT_CAST.find(({ id }) => id === 'ambient-momo').action, 'wave');
});
