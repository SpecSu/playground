import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const catalogPath = new URL('../lib/fishing-avatar-catalog.ts',import.meta.url);
const names=['奶蛙','牛来','肥嘟嘟','喵脆角','香蕉猫','刀盾狗','LX','Kelly','Bear熊','苏贝壳','吉吉','Jiaxin'];
const ids=['milk-frog','niulai','feidudu','miaocuijiao','banana-cat','sword-shield-dog','human-lx','human-kelly','human-bear','human-subeike','human-jiji','human-jiaxin'];
test('fishing has exactly the approved twelve identities in row-major order',async()=>{
 assert.ok(existsSync(catalogPath),'fishing-specific uploaded cast catalog exists');
 const {FISHING_AVATAR_CATALOG,FISHING_AVATAR_PRESETS}=await import(catalogPath.href);
 assert.deepEqual(FISHING_AVATAR_CATALOG.map(a=>a.label),names);
 assert.deepEqual(FISHING_AVATAR_CATALOG.map(a=>a.id),ids);
 assert.deepEqual(FISHING_AVATAR_PRESETS,ids);
 for(const a of FISHING_AVATAR_CATALOG){assert.equal(a.modelUrl,`/avatars/cast-v1/${a.id}.glb`);assert.equal(a.previewImage,`/avatars/portraits/${a.id}.webp`);}
});
test('fishing NPC models and names match the character panel across days',async()=>{
 const {projectFishingAmbientParticipants}=await import('../lib/fishing-ambient.ts');
 const {FISHING_AVATAR_CATALOG}=await import(catalogPath.href);
 for(const day of [20000,20001,20042]){
  const participants=projectFishingAmbientParticipants(day*86400000,[3,8]);
  assert.deepEqual(participants.map(p=>p.preset),['banana-cat','milk-frog']);
  assert.deepEqual(participants.map(p=>p.name),['香蕉猫','奶蛙']);
  assert.deepEqual(participants.map(p=>p.slot),[3,8]);
  for(const person of participants)assert.equal(person.name,FISHING_AVATAR_CATALOG.find(a=>a.id===person.preset).label);
 }
});
test('picker explicitly has three columns, four rows, real portraits and a nickname above it',()=>{
 const feed=readFileSync(new URL('../components/fishing/FishingFeed.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../components/fishing/FishingFeed.css',import.meta.url),'utf8');
 assert.match(feed,/FISHING_AVATAR_CATALOG\.map/);
 assert.ok(feed.indexOf('id="angler-name"')<feed.indexOf('FISHING_AVATAR_CATALOG.map'));
 assert.match(css,/\.fishing-sheet \.avatar-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.fishing-sheet \.avatar-option>img\{[^}]*object-fit:contain/);
});

test('legacy fishing profiles migrate to visible new choices without losing a chosen nickname',async()=>{
 const {readFishingProfile}=await import('../lib/fishing-profile.ts');
 const {resolveFishingAvatarPreset}=await import(catalogPath.href);
 const aliases={frog:'milk-frog',cat:'miaocuijiao',dog:'sword-shield-dog',capybara:'feidudu',panda:'niulai','monster-blob':'feidudu','monster-tower':'niulai','monster-star':'milk-frog'};
 for(const [old,next] of Object.entries(aliases)){
  assert.equal(resolveFishingAvatarPreset(old),next);
  assert.deepEqual(readFishingProfile(JSON.stringify({name:'老朋友',preset:old,nameConfirmed:true})),{name:'老朋友',preset:next,nameConfirmed:true});
 }
});

test('all twelve panel identities pass real server validation and unsupported uploads remain excluded',async()=>{
 const {validateFishingCommand}=await import('../lib/fishing-server.ts');
 for(const preset of ids)assert.equal(validateFishingCommand({roomId:'ocean',requestId:'cast-profile-'+preset,sequence:1,type:'join',name:'旅人',preset}).preset,preset);
 for(const preset of ['alien-cat','dj-cockatoo','kun-kun-chicken','external-url'])assert.throws(()=>validateFishingCommand({roomId:'ocean',requestId:'invalid-'+preset,sequence:1,type:'join',name:'旅人',preset}));
});

test('all twelve portrait files are transparent 512px WebP without opaque backgrounds',async()=>{
 const {FISHING_AVATAR_CATALOG}=await import(catalogPath.href);
 for(const avatar of FISHING_AVATAR_CATALOG){
  const bytes=readFileSync(new URL(`../public${avatar.previewImage}`,import.meta.url));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.ok(bytes.length<250000);
  const chunk=bytes.subarray(12,16).toString();assert.ok(chunk==='VP8X'||chunk==='VP8L');
  if(chunk==='VP8L'){const bits=bytes.readUInt32LE(21);assert.equal((bits&0x3fff)+1,512);assert.equal(((bits>>14)&0x3fff)+1,512);assert.ok(bits&(1<<28));}
  else assert.ok(bytes[20]&0x10);
 }
});

test('transparent model heads preserve their full silhouette instead of inheriting circular thumbnail clipping',()=>{
 const css=readFileSync(new URL('../components/fishing/FishingFeed.css',import.meta.url),'utf8');
 assert.match(css,/\.fishing-sheet \.avatar-option>img\{[^}]*border-radius:0/);
});
