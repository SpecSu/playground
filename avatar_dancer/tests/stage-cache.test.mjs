import test from 'node:test';import assert from 'node:assert/strict';import {createOwnedAssetCache} from '../src/stage.js';
function harness(){let pending={},released=[];let cache=createOwnedAssetCache(url=>new Promise((resolve,reject)=>pending[url]={resolve,reject}),r=>released.push(r), {maxIdle: 0});return{cache,pending,released}}
test('displayed asset survives until successful new switch',async()=>{let{cache,pending,released}=harness();cache.setWanted(['a']);let a=cache.get('a');await Promise.resolve();pending.a.resolve('A');await a;cache.setActive(['a']);cache.setWanted(['b']);assert.deepEqual(released,[]);let b=cache.get('b');await Promise.resolve();pending.b.resolve('B');await b;assert.deepEqual(released,[]);cache.setActive(['b']);assert.deepEqual(released,['A']);assert.equal(cache.size,1)});
test('late cancelled load released immediately, shared latest URL protected',async()=>{let{cache,pending,released}=harness();cache.setWanted(['a']);let a=cache.get('a');await Promise.resolve();cache.setWanted(['b']);let b=cache.get('b');await Promise.resolve();assert.equal(cache.get('b'),b);pending.b.resolve('B');await b;cache.setActive(['b']);pending.a.resolve('A');await a;assert.deepEqual(released,['A']);assert.equal(cache.size,1)});
test('dispose releases pending completion and rejects new loads',async()=>{let{cache,pending,released}=harness();cache.setWanted(['a']);let a=cache.get('a');await Promise.resolve();cache.clear();pending.a.resolve('A');await a;assert.deepEqual(released,['A']);assert.equal(cache.size,0);await assert.rejects(cache.get('b'),/disposed/)});
test('failed new request retains old displayed model',async()=>{let{cache,pending,released}=harness();cache.setWanted(['a']);let a=cache.get('a');await Promise.resolve();pending.a.resolve('A');await a;cache.setActive(['a']);cache.setWanted(['b']);let b=cache.get('b');await Promise.resolve();pending.b.reject(new Error('404'));await assert.rejects(b,/404/);assert.deepEqual(released,[]);assert.equal(cache.size,1)});


test('A→B→A reuses parsed model without another load', async () => {
  const loads = [], released = [];
  const cache = createOwnedAssetCache(async url => { loads.push(url); return {url}; }, value => released.push(value.url));
  async function select(url) { cache.setWanted([url]); const model = await cache.get(url); cache.setActive([url]); return model; }
  const a = await select('a'); await select('b');
  assert.equal(await select('a'), a);
  assert.deepEqual(loads, ['a', 'b']); assert.deepEqual(released, []);
  await select('c');
  assert.deepEqual(released, ['b']); assert.equal(cache.size, 2);
  cache.clear(); assert.deepEqual(released.sort(), ['a', 'b', 'c']);
});

test('idle byte budget evicts expensive models without releasing displayed model', async () => {
  const released = [];
  const cache = createOwnedAssetCache(async url => ({url, bytes: url === 'a' ? 12 : 4}), value => released.push(value.url),
    {maxIdle: 2, maxIdleBytes: 8, estimateBytes: value => value.bytes});
  for (const url of ['a', 'b', 'c', 'd']) { cache.setWanted([url]); await cache.get(url); cache.setActive([url]); }
  assert.deepEqual(released, ['a']); assert.equal(cache.size, 3);
  cache.setWanted(['e']); assert(!released.includes('d'));
});

test('late obsolete completion cannot evict recent reusable model', async () => {
  const pending = {}, released = [];
  const cache = createOwnedAssetCache(url => new Promise(resolve => pending[url] = resolve), value => released.push(value));
  cache.setWanted(['old']); const old = cache.get('old'); await Promise.resolve();
  for (const url of ['a','b']) { cache.setWanted([url]); const promise = cache.get(url); await Promise.resolve(); pending[url](url); await promise; cache.setActive([url]); }
  pending.old('old'); await old;
  assert.deepEqual(released, ['old']);
  cache.setWanted(['a']); assert.equal(await cache.get('a'), 'a');
});

test('reused real rig keeps source bind pose and all three clips after clone animation', async () => {
  const fs = await import('node:fs');
  const THREE = await import('three');
  const {GLTFLoader} = await import('three/addons/loaders/GLTFLoader.js');
  const {clone} = await import('three/addons/utils/SkeletonUtils.js');
  const {normalizeCharacterBind, disposeClonedSkeletons} = await import('../src/stage.js');
  let parses = 0;
  const cache = createOwnedAssetCache(async url => {
    // Real geometry/rig/animation through GLTFLoader, excluding browser-only image decoding.
    const bytes = fs.readFileSync(new URL('../public/assets/characters/' + url + '.glb', import.meta.url));
    const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20,20+jsonLength));
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    delete json.materials; delete json.images; delete json.textures;
    const encoded = Buffer.from(JSON.stringify(json)); const padded = Buffer.alloc(Math.ceil(encoded.length/4)*4, 32); encoded.copy(padded);
    const binaryChunk = bytes.subarray(20+jsonLength);
    const glb = Buffer.alloc(20+padded.length+binaryChunk.length);
    glb.write('glTF'); glb.writeUInt32LE(2,4); glb.writeUInt32LE(glb.length,8);
    glb.writeUInt32LE(padded.length,12); glb.writeUInt32LE(0x4e4f534a,16);
    padded.copy(glb,20); binaryChunk.copy(glb,20+padded.length); parses++;
    return new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
  }, () => {});
  async function select(url) { cache.setWanted([url]); const value = await cache.get(url); cache.setActive([url]); return value; }
  const a = await select('jiji-0');
  const sourcePose = [];
  a.scene.traverse(node => { if(node.isBone) sourcePose.push([...node.position,...node.quaternion,...node.scale]); });
  const copy = clone(a.scene); normalizeCharacterBind(copy);
  const mixer = new THREE.AnimationMixer(copy);
  for (const clip of a.animations) { mixer.stopAllAction(); mixer.clipAction(clip).play(); mixer.update(.37); }
  mixer.stopAllAction(); mixer.uncacheRoot(copy); disposeClonedSkeletons(copy);
  await select('jiji-1'); const revisited = await select('jiji-0');
  assert.equal(revisited,a); assert.equal(parses,2); assert.equal(revisited.animations.length,3);
  const afterPose = [];
  revisited.scene.traverse(node => { if(node.isBone) afterPose.push([...node.position,...node.quaternion,...node.scale]); });
  assert.deepEqual(afterPose,sourcePose); assert.equal(afterPose.length,23);
  cache.clear();
});
