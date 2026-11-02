import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const root = new URL('../public/avatars/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
async function asset(kind) {
  const bytes=readFileSync(new URL(`${kind}.glb`,root));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
test('all three humans share the polished sculpt revision and verified binary identity',async()=>{
  for(const kind of ['human-jiji','human-subeike','human-lx']) {
    const entry=manifest.avatars.find(a=>a.kind===kind);
    assert.equal(entry.revision,'rounded-cast-v2');
    const bytes=readFileSync(new URL(`${kind}.glb`,root));
    assert.equal(entry.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(entry.bytes,bytes.length);
    assert.ok(entry.triangles<28000,'polished figures stay within practical geometry budget');
    const scene=await asset(kind);
    assert.ok(scene.getObjectByName('head'));
  }
});
test('animals have species-specific shapes rather than a height-scaled human body',async()=>{
  const sizes = new Map();
  for(const [kind,min,max] of [['frog',1.02,1.12],['cat',1.40,1.49],['dog',1.89,2.01],['capybara',1.19,1.28],['panda',1.76,1.87]]) {
    const scene=await asset(kind);
    const box=new Box3().setFromObject(scene); const size=box.getSize(new Vector3());
    assert.ok(size.y>=min && size.y<=max,`${kind} height ${size.y} should be ${min}–${max}`);
    assert.ok(size.x<1.4,`${kind} rest footprint stays compact`);
    assert.ok(Math.abs(box.min.y)<.025,`${kind} feet meet the floor`);
    const entry=manifest.avatars.find(a=>a.kind===kind);
    assert.equal(entry.revision,'species-anatomy-v3');
    assert.equal(entry.sha256,createHash('sha256').update(readFileSync(new URL(`${kind}.glb`,root))).digest('hex'));
    assert.ok(entry.triangles<14_000,`${kind} retains the existing mobile animal budget`);
    sizes.set(kind,size);
  }
  assert.ok(sizes.get('dog').y/sizes.get('dog').x>2.3,'hound has a tall narrow silhouette');
  assert.ok(sizes.get('panda').x/sizes.get('dog').x>1.4,'panda is genuinely broader, not uniformly scaled');
  assert.ok(sizes.get('frog').x/sizes.get('frog').y>.95,'frog is broad and crouched');
  assert.ok(sizes.get('capybara').z/sizes.get('capybara').x>1.5,'capybara has a horizontal barrel');
});
test('species anatomies have different articulated proportions and a real quadruped contract',async()=>{
  const scenes = new Map();
  for(const kind of ['cat','frog','dog','capybara','panda']) {
    const scene=await asset(kind);scene.updateMatrixWorld(true);scenes.set(kind,scene);
    assert.equal(scene.getObjectByName(`${kind}_rig`).userData.speciesRig,kind==='capybara'?'quadruped':'animal-v2');
  }
  const joint=(kind,name)=>scenes.get(kind).getObjectByName(name).getWorldPosition(new Vector3());
  const legLength=kind=>joint(kind,'thigh_L').distanceTo(joint(kind,'shin_L'))+joint(kind,'shin_L').distanceTo(joint(kind,'foot_L'));
  assert.ok(legLength('dog')/legLength('panda')>1.7,'hound legs are proportionally much longer than panda legs');
  assert.ok(joint('frog','shin_L').x-joint('frog','thigh_L').x>.17,'frog knees splay outward into haunches');
  assert.ok(Math.abs(joint('capybara','chest').z-joint('capybara','hips').z)>.50,'quadruped spine spans front and back');
  assert.ok(Math.abs(joint('capybara','chest').y-joint('capybara','hips').y)<.08,'quadruped spine stays horizontal');
  for(const name of ['hand_L','hand_R','foot_L','foot_R']) assert.ok(joint('capybara',name).y<.10,'all four contact pivots sit close to the floor');
  for(const kind of ['cat','dog']) for(const name of ['tail','tailTip']) assert.ok(scenes.get(kind).getObjectByName(name)?.isBone,'tail chains are articulated');
  for(const name of ['ear_L','ear_R']) assert.ok(scenes.get('dog').getObjectByName(name)?.isBone,'hound ears are articulated');
});
test('dedicated cockatoo stays byte-identical through cast polish',()=>{
  const bytes=readFileSync(new URL('dj-cockatoo.glb',root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'8222a55f74f33c812980399e5e767a00d08668708befaf8baed5ddd28857b936');
});
