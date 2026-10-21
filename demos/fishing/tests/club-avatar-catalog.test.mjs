import './room-loader.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const LEGACY_IDS=['cat','frog','dog','capybara','panda'];
const MEME_IDS=['banana-cat','sword-shield-dog'];
const ANIMAL_IDS=[...LEGACY_IDS,...MEME_IDS];
const HUMAN_IDS=['human-jiji','human-subeike','human-lx'];
const MONSTER_IDS=['monster-tower','monster-star'];
const ALL_IDS=[...ANIMAL_IDS,...HUMAN_IDS,...MONSTER_IDS];

async function catalogModule(){
  const url=new URL('../lib/club-avatar-catalog.ts',import.meta.url);
  assert.equal(await readFile(url,'utf8').then(()=>true,()=>false),true,'The shared visual avatar catalog must exist');
  return import(url.href);
}

test('catalog exposes twelve choices while the protocol accepts the retired blob ID',async()=>{
  const {CLUB_AVATAR_CATALOG}=await catalogModule();
  const {AVATAR_PRESETS,ROOM_CAPACITY}=await import('../lib/room-types.ts');
  assert.deepEqual(CLUB_AVATAR_CATALOG.map(avatar=>avatar.id),ALL_IDS);
  assert.deepEqual(AVATAR_PRESETS,[...ANIMAL_IDS,...HUMAN_IDS,'monster-blob',...MONSTER_IDS]);
  assert.equal(CLUB_AVATAR_CATALOG.length,12);
  assert.equal(new Set(AVATAR_PRESETS).size,13);
  assert.equal(ROOM_CAPACITY,10,'Avatar variety must not change live seat capacity');
});

test('existing saved animal choices keep their identity and human choices use approved labels without changing IDs',async()=>{
  const {CLUB_AVATAR_CATALOG,DEFAULT_AVATAR_PRESET}=await catalogModule();
  assert.deepEqual(CLUB_AVATAR_CATALOG.filter(avatar=>avatar.category==='animal').map(avatar=>avatar.id),ANIMAL_IDS);
  assert.deepEqual(CLUB_AVATAR_CATALOG.filter(avatar=>avatar.category==='human').map(avatar=>[avatar.id,avatar.label]),[
    ['human-jiji','女生'],['human-subeike','男生'],['human-lx','小哥'],
  ]);
  assert.deepEqual(CLUB_AVATAR_CATALOG.filter(avatar=>avatar.category==='monster').map(avatar=>avatar.id),MONSTER_IDS);
  assert.equal(DEFAULT_AVATAR_PRESET,'human-subeike');
  for(const preset of LEGACY_IDS){
    const saved=JSON.parse(JSON.stringify({name:'老朋友',preset}));
    assert.equal(CLUB_AVATAR_CATALOG.some(avatar=>avatar.id===saved.preset),true);
  }
});

test('every choice has immutable text and a nonempty preview without executable metadata',async()=>{
  const {CLUB_AVATAR_CATALOG}=await catalogModule();
  assert.ok(Object.isFrozen(CLUB_AVATAR_CATALOG));
  for(const avatar of CLUB_AVATAR_CATALOG){
    assert.ok(Object.isFrozen(avatar));
    assert.ok(avatar.label.length>0&&avatar.label.length<=8);
    assert.ok(avatar.previewIcon.length>0);
    assert.ok(Object.values(avatar).every(value=>typeof value==='string'));
  }
});

test('selector consumes the shared catalog and keeps labels, pressed state and scrollable sheet',async()=>{
  const source=await readFile(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.ok(source.includes('CLUB_AVATAR_PICKER_OPTIONS.map('));
  assert.ok(source.includes('aria-pressed={preset === avatar.id}'));
  assert.ok(source.includes('选择形象'));
  assert.equal(source.includes('选个喜欢的小动物'),false);
  assert.ok(source.includes('resolveAvatarPreset(saved?.preset)'));
  assert.ok(source.includes('CLUB_AVATAR_CATALOG.some(avatar => avatar.id === savedPreset)'));
  assert.ok(source.includes("type: joined ? 'profile' : 'join'"));
  assert.ok(css.includes('max-height:calc(100% - 40px);overflow-y:auto'));
  assert.ok(css.includes('width:402px;height:874px;'));
  assert.equal(source.includes('16 小节循环'),false);
});

test('uploaded-character choices use the generated public portrait thumbnails',async()=>{
  const {CLUB_AVATAR_CATALOG}=await catalogModule();
  for(const id of HUMAN_IDS){
    const avatar=CLUB_AVATAR_CATALOG.find(item=>item.id===id);
    assert.equal(avatar.previewImage,`/avatars/portraits/${id}.webp`);
    const bytes=await readFile(new URL(`../public${avatar.previewImage}`,import.meta.url));
    assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
    assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
    assert.ok(bytes.byteLength<250_000,'512px transparent 3D portraits stay under 250 KB');
    assert.ok(bytes.byteLength>100);
  }
  const source=await readFile(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('ownAvatar.previewImage'),'The fixed own-profile control must show the same character thumbnail');
});

test('picker reserves the last row for all three humans without changing canonical identities',async()=>{
  const {CLUB_AVATAR_CATALOG,CLUB_AVATAR_PICKER_OPTIONS}=await catalogModule();
  assert.ok(CLUB_AVATAR_PICKER_OPTIONS,'presentation order is separate from canonical metadata');
  assert.deepEqual(CLUB_AVATAR_PICKER_OPTIONS.map(avatar=>avatar.id),[...ANIMAL_IDS,...MONSTER_IDS,...HUMAN_IDS]);
  assert.deepEqual(CLUB_AVATAR_CATALOG.map(avatar=>avatar.id),ALL_IDS);
  const source=await readFile(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.ok(source.includes('CLUB_AVATAR_PICKER_OPTIONS.map('));
  assert.ok(source.includes("avatar.category === 'human' ? 'avatar-option-human'"));
  assert.match(css,/\.avatar-options\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css,/\.avatar-option(?:-human)?[^{}]*\{[^}]*grid-column/);
  assert.deepEqual(CLUB_AVATAR_PICKER_OPTIONS.slice(9).map(avatar=>avatar.id),HUMAN_IDS);
});

test('retired blob choices resolve to the existing star without changing other identities',async()=>{
  const {AVATAR_PRESETS,resolveAvatarPreset}=await import('../lib/room-types.ts');
  const {CLUB_AVATAR_CATALOG}=await catalogModule();
  for(const preset of AVATAR_PRESETS){
    const resolved=resolveAvatarPreset(preset);
    assert.equal(resolved,preset==='monster-blob'?'monster-star':preset);
    assert.ok(CLUB_AVATAR_CATALOG.some(avatar=>avatar.id===resolved));
  }
  const source=await readFile(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('setPreset(resolveAvatarPreset(self.preset))'));
});

test('human head thumbnails retain a real transparent alpha channel',async()=>{
  for(const id of HUMAN_IDS){
    const bytes=await readFile(new URL(`../public/avatars/portraits/${id}.webp`,import.meta.url));
    const chunk=bytes.subarray(12,16).toString('ascii');
    assert.ok(chunk==='VP8X'||chunk==='VP8L',`${id} is an alpha-capable WebP`);
    assert.ok(chunk==='VP8L' ? (bytes.readUInt32LE(21)&(1<<28)) : (bytes[20]&0x10),`${id} retains alpha transparency`);
  }
});

test('banana cat and sword-shield dog are independent named choices without replacing legacy pets',async()=>{
  const {CLUB_AVATAR_CATALOG,CLUB_AVATAR_PICKER_OPTIONS}=await catalogModule();
  for(const [id,label] of [['banana-cat','香蕉猫'],['sword-shield-dog','刀盾狗']]){
    assert.equal(CLUB_AVATAR_CATALOG.find(avatar=>avatar.id===id)?.label,label);
    assert.equal(CLUB_AVATAR_PICKER_OPTIONS.filter(avatar=>avatar.id===id).length,1);
  }
  assert.equal(CLUB_AVATAR_CATALOG.find(avatar=>avatar.id==='cat')?.label,'猫咪');
  assert.equal(CLUB_AVATAR_CATALOG.find(avatar=>avatar.id==='dog')?.label,'小狗');
});
