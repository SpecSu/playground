import './room-loader.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const LEGACY_REPLACEMENTS={cat:'miaocuijiao',frog:'milk-frog',dog:'sword-shield-dog',capybara:'feidudu',panda:'niulai','monster-blob':'feidudu','monster-tower':'niulai','monster-star':'milk-frog'};
const LEGACY_IDS=Object.keys(LEGACY_REPLACEMENTS);
const ANIMAL_IDS=['milk-frog','niulai','feidudu','miaocuijiao','banana-cat','sword-shield-dog'];
const HUMAN_IDS=['human-lx','human-kelly','human-bear','human-subeike','human-jiji','human-jiaxin'];
const ALL_IDS=[...ANIMAL_IDS,...HUMAN_IDS];
const LABELS=['奶蛙','牛来','肥嘟嘟','喵脆角','香蕉猫','刀盾狗','LX','Kelly','Bear熊','苏贝壳','吉吉','Jiaxin'];

async function catalogModule(){
  const url=new URL('../lib/club-avatar-catalog.ts',import.meta.url);
  assert.equal(await readFile(url,'utf8').then(()=>true,()=>false),true,'The shared visual avatar catalog must exist');
  return import(url.href);
}

test('catalog exposes twelve current choices while the protocol accepts all saved legacy IDs',async()=>{
  const {CLUB_AVATAR_CATALOG}=await catalogModule();
  const {CANONICAL_AVATAR_PRESETS,AVATAR_PRESETS,ROOM_CAPACITY}=await import('../lib/room-types.ts');
  assert.deepEqual(CLUB_AVATAR_CATALOG.map(avatar=>avatar.id),ALL_IDS);
  assert.deepEqual(CANONICAL_AVATAR_PRESETS,ALL_IDS);
  assert.deepEqual(AVATAR_PRESETS,[...ALL_IDS,...LEGACY_IDS]);
  assert.equal(CLUB_AVATAR_CATALOG.length,12);
  assert.equal(new Set(AVATAR_PRESETS).size,20);
  assert.equal(ROOM_CAPACITY,10,'Avatar variety must not change live seat capacity');
});

test('uploaded choices use the twelve agreed names and saved legacy choices resolve to current models',async()=>{
  const {CLUB_AVATAR_CATALOG,DEFAULT_AVATAR_PRESET}=await catalogModule();
  const {resolveAvatarPreset}=await import('../lib/room-types.ts');
  assert.deepEqual(CLUB_AVATAR_CATALOG.map(avatar=>avatar.label),LABELS);
  assert.deepEqual(CLUB_AVATAR_CATALOG.filter(avatar=>avatar.category==='animal').map(avatar=>avatar.id),ANIMAL_IDS);
  assert.deepEqual(CLUB_AVATAR_CATALOG.filter(avatar=>avatar.category==='human').map(avatar=>[avatar.id,avatar.label]),[
    ['human-lx','LX'],['human-kelly','Kelly'],['human-bear','Bear熊'],['human-subeike','苏贝壳'],['human-jiji','吉吉'],['human-jiaxin','Jiaxin'],
  ]);
  assert.equal(CLUB_AVATAR_CATALOG.some(avatar=>avatar.category==='monster'),false);
  assert.equal(DEFAULT_AVATAR_PRESET,'human-subeike');
  for(const preset of LEGACY_IDS){
    const saved=JSON.parse(JSON.stringify({name:'老朋友',preset}));
    assert.equal(CLUB_AVATAR_CATALOG.some(avatar=>avatar.id===resolveAvatarPreset(saved.preset)),true);
    assert.equal(saved.preset,preset,'resolving a saved choice does not rewrite stored data');
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
  for(const id of ALL_IDS){
    const avatar=CLUB_AVATAR_CATALOG.find(item=>item.id===id);
    assert.equal(avatar.previewImage,`/avatars/portraits/${id}.webp`);
    const bytes=await readFile(new URL(`../public${avatar.previewImage}`,import.meta.url));
    assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
    assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
    assert.ok(bytes.byteLength<30_000,'Portraits must stay lightweight for phone selection');
    assert.ok(bytes.byteLength>100);
  }
  const source=await readFile(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('ownAvatar.previewImage'),'The fixed own-profile control must show the same character thumbnail');
});

test('picker uses two animal rows and two human rows in the agreed order',async()=>{
  const {CLUB_AVATAR_CATALOG,CLUB_AVATAR_PICKER_OPTIONS}=await catalogModule();
  assert.ok(CLUB_AVATAR_PICKER_OPTIONS,'presentation order is separate from canonical metadata');
  assert.deepEqual(CLUB_AVATAR_PICKER_OPTIONS.map(avatar=>avatar.id),ALL_IDS);
  assert.deepEqual(CLUB_AVATAR_CATALOG.map(avatar=>avatar.id),ALL_IDS);
  const source=await readFile(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.ok(source.includes('CLUB_AVATAR_PICKER_OPTIONS.map('));
  assert.ok(source.includes("avatar.category === 'human' ? 'avatar-option-human'"));
  assert.match(css,/\.avatar-options\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css,/\.avatar-option(?:-human)?[^{}]*\{[^}]*grid-column/);
  assert.deepEqual(CLUB_AVATAR_PICKER_OPTIONS.slice(6).map(avatar=>avatar.id),HUMAN_IDS);
});

test('all legacy choices resolve to their agreed replacements and canonical choices remain stable',async()=>{
  const {AVATAR_PRESETS,resolveAvatarPreset}=await import('../lib/room-types.ts');
  const {CLUB_AVATAR_CATALOG}=await catalogModule();
  for(const preset of AVATAR_PRESETS){
    const resolved=resolveAvatarPreset(preset);
    assert.equal(resolved,LEGACY_REPLACEMENTS[preset]??preset);
    assert.equal(resolveAvatarPreset(resolved),resolved);
    assert.ok(CLUB_AVATAR_CATALOG.some(avatar=>avatar.id===resolved));
  }
  const source=await readFile(new URL('../components/LiveFeed.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('setPreset(resolveAvatarPreset(self.preset))'));
});

test('every uploaded character thumbnail retains a real transparent alpha channel',async()=>{
  for(const id of ALL_IDS){
    const bytes=await readFile(new URL(`../public/avatars/portraits/${id}.webp`,import.meta.url));
    assert.equal(bytes.subarray(12,16).toString('ascii'),'VP8X',`${id} is an alpha-capable WebP`);
    assert.ok(bytes[20]&0x10,`${id} retains alpha transparency`);
  }
});

test('each current choice has one matching public model path and portrait',async()=>{
  const {CLUB_AVATAR_CATALOG,CLUB_AVATAR_PICKER_OPTIONS}=await catalogModule();
  for(const [index,id] of ALL_IDS.entries()){
    const label=LABELS[index];
    assert.equal(CLUB_AVATAR_CATALOG.find(avatar=>avatar.id===id)?.label,label);
    assert.equal(CLUB_AVATAR_PICKER_OPTIONS.filter(avatar=>avatar.id===id).length,1);
    const avatar=CLUB_AVATAR_CATALOG.find(avatar=>avatar.id===id);
    assert.equal(avatar.modelUrl,`/avatars/cast-v1/${id}.glb`);
    const bytes=await readFile(new URL(`../public${avatar.modelUrl}`,import.meta.url));
    assert.equal(bytes.subarray(0,4).toString('ascii'),'glTF');
  }
});
