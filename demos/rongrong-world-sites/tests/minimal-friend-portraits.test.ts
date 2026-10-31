import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sampleFarm} from '../src/minimal/sample-farms.ts';

const portraits=[
 ['oasis','贝壳','beike','0d81f9d76094cf7957a988ed68f4c065abddd5b8e20d9ca565dca9027097d9a0'],
 ['glacier','加新','jiaxin','f13a3c1290f5f6e5fe1d2d36c30b765cb52d521b894f88e5ab657cb7800dd5c8'],
 ['forest','Rummons','rummons','f068affdfe1205d8bef01ce9d8041e76246fde160e3247c0d1d3bf136a601170'],
 ['lunar','吉吉','jiji','2ad1cbdfe33a9fbdf4b9900b44a25502b713ed1e7911d0f77a1dd1e42cb86a29'],
 [null,'咕咕','gugu','5d4a353a42629acaa3028c6eeb09ddd08620c9728900fa75e0a686a82211eb17'],
] as const;

for(const [sampleId,name,file,sha256] of portraits){
 test(`${name} display portrait preserves the supplied PNG bytes and has no embedded private metadata`,()=>{
  const bytes=readFileSync(new URL(`../public/assets/friends/${file}.png`,import.meta.url));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),853);assert.equal(bytes.readUInt32BE(20),1280);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256,'do not redraw, recrop or silently replace a supplied portrait');
  const chunks:string[]=[];for(let offset=8;offset<bytes.length;){const size=bytes.readUInt32BE(offset);chunks.push(bytes.subarray(offset+4,offset+8).toString());offset+=size+12;assert.ok(offset<=bytes.length);}
  assert.deepEqual(chunks,['IHDR','IDAT','IEND'],'originals contain no text, EXIF, hidden paths or other metadata to publish');
 });
 if(sampleId)test(`${name} display mapping retains the original isolated sample target`,()=>{
  const farm=sampleFarm(sampleId,1_800_000_000_000);
  assert.equal(farm.card.name,name);assert.equal(farm.card.avatar,`/assets/friends/${file}.png`);
  assert.deepEqual(farm.card.target,{kind:'sample',sampleId});assert.equal(farm.card.badge,'示例');
  assert.equal(farm.card.identityStatus,'unlinked-account');assert.equal(farm.state.coins,0);assert.deepEqual(farm.state.eggs,[]);
 });
}
