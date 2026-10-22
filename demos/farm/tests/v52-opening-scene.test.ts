import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate, estateSnapshot} from '../src/v5/estate.ts';
import {findPath, isWalkable, type GridPoint} from '../src/v5/layout.ts';
import {guardianCommand} from '../src/v5/threat.ts';
import type {OpeningState, OpeningStage} from '../src/v5/opening.ts';
import {deriveOpeningScene, openingAttention} from '../src/v5/opening-scene.ts';

const now = 1_800_000_000_000;
const opening = (stage: OpeningStage, elapsed = 0, guardian: OpeningState['guardian'] = null): OpeningState =>
  ({version: 1, stage, elapsed, guardian});
const sample = () => estateSnapshot(createEstate('opening-presentation', now), now);
const distance = (a: GridPoint, b: GridPoint) => Math.hypot(a.x - b.x, a.z - b.z);
function onLegalEdge(p: GridPoint, data: ReturnType<typeof sample>) {
  const xs = [...new Set([Math.floor(p.x), Math.ceil(p.x)])];
  const zs = [...new Set([Math.floor(p.z), Math.ceil(p.z)])];
  assert.ok(Number.isInteger(p.x) || Number.isInteger(p.z), 'movement stays on cardinal edges');
  for (const x of xs) for (const z of zs) assert.ok(isWalkable(data.profile.layout, {x,z}), `legal cell ${x},${z}`);
}

test('establish and rustle hide wolves and guardian without touching source state', () => {
  const data = sample(), before = structuredClone(data);
  for (const stage of ['establish','rustle'] as const) {
    const scene = deriveOpeningScene(data, opening(stage, .5));
    assert.deepEqual(scene.profile.threat?.wolves, []);
    assert.equal(scene.profile.guardian, null);
    assert.notEqual(scene, data); assert.notEqual(scene.profile, data.profile);
    assert.deepEqual(scene.profile.animals.map(a=>a.life), data.profile.animals.map(a=>a.life));
  }
  assert.deepEqual(data, before);
});

test('approaching wolf walks legal cells from boundary and ends at frozen real spawn', () => {
  const data = sample(), original = data.profile.threat!.wolves[0].position;
  const start = deriveOpeningScene(data, opening('approach',0)).profile.threat!.wolves[0].position;
  assert.ok(distance(start, original) >= 3);
  assert.ok(data.profile.layout.owned.some(p=>distance(p,start)<.001));
  let prior = start;
  for (let i=1;i<=30;i++) {
    const scene = deriveOpeningScene(data, opening('approach', i/10));
    const p = scene.profile.threat!.wolves[0].position;
    onLegalEdge(p,data); assert.ok(distance(prior,p)<=1, 'small samples cannot jump across blockers'); prior=p;
  }
  assert.deepEqual(prior, original);
  assert.equal(data.profile.threat!.elapsed,0);
  assert.equal(data.profile.threat!.phase,'choosing');
});

test('startled animals retreat on legal paths and finish at saved assembly positions', () => {
  const data = sample(), before = structuredClone(data);
  let moved = false;
  for (let i=0;i<=20;i++) {
    const scene = deriveOpeningScene(data, opening('startle',i/10));
    for (const [index, animal] of scene.profile.animals.entries()) {
      onLegalEdge(animal.position,data);
      moved ||= distance(animal.position,data.profile.animals[index].position)>.01;
      const actor = scene.profile.threat!.actors.find(a=>a.id===animal.id)!;
      assert.deepEqual(actor.position,animal.position);
      assert.equal(actor.status,'waiting');
    }
  }
  assert.ok(moved);
  const final = deriveOpeningScene(data,opening('startle',2));
  assert.deepEqual(final.profile.animals.map(a=>a.position),data.profile.animals.map(a=>a.position));
  assert.deepEqual(data,before);
});

test('guardian arrival follows a real home route and hands off to actual gameplay position', () => {
  const data = sample(); data.profile.guardian='cat';
  data.profile.threat=guardianCommand(data.profile.threat!,data.profile.layout,{kind:'select',guardian:'cat'}).state;
  const before=structuredClone(data), positions:GridPoint[]=[];
  for(let i=0;i<=30;i++) {
    const scene=deriveOpeningScene(data,opening('arrival',i/10,'cat'));
    assert.equal(scene.profile.guardian,'cat');
    assert.equal(scene.profile.threat!.guardian?.kind,'cat');
    const p=scene.profile.threat!.guardian!.position;
    onLegalEdge(p,data); positions.push(p);
    assert.deepEqual(scene.profile.guardianAt,p);
  }
  assert.ok(distance(positions[0],positions.at(-1)!)>1);
  assert.deepEqual(positions.at(-1),data.profile.guardianAt);
  assert.ok(findPath(data.profile.layout,positions[0],positions.at(-1)!));
  assert.deepEqual(data,before);
});

test('normal defend and completed opening use true positions with an independent clone', () => {
  const data=sample();data.profile.threat!.wolves[0].position={x:0,z:4};
  for(const stage of ['defend','done'] as const) {
    const scene=deriveOpeningScene(data,opening(stage,3,'dog'));
    assert.deepEqual(scene,data); assert.notEqual(scene,data);
    scene.profile.materials=0;assert.equal(data.profile.materials,60);
  }
});

test('real completed tutorial retreats from the saved fractional wolf pose in defend and done', () => {
  const data=sample(),event=data.profile.threat!;
  event.phase='complete';event.elapsed=7.4;
  event.wolves[0].position={x:4,z:2.5};event.wolves[0].status='approach';
  event.actors.forEach(a=>a.status='safe');
  const before=structuredClone(data),saved=event.wolves[0].position;
  for(const stage of ['defend','done'] as const) {
    const state=opening(stage,0,'dog');
    const start=deriveOpeningScene(data,state,{retreatProgress:0});
    assert.deepEqual(start.profile.threat!.wolves[0].position,saved);
    assert.equal(start.profile.threat!.wolves[0].status,'approach');
    const middle=deriveOpeningScene(data,state,{retreatProgress:.5});
    const end=deriveOpeningScene(data,state,{retreatProgress:1});
    const midWolf=middle.profile.threat!.wolves[0],endWolf=end.profile.threat!.wolves[0];
    assert.ok(distance(midWolf.position,saved)>.1);
    assert.ok(distance(midWolf.position,endWolf.position)>.1);
    assert.equal(midWolf.status,'approach');assert.equal(endWolf.status,'retreated');
    assert.ok(!data.profile.layout.owned.some(p=>p.x===endWolf.position.x-1&&p.z===endWolf.position.z)
      ||!data.profile.layout.owned.some(p=>p.x===endWolf.position.x+1&&p.z===endWolf.position.z)
      ||!data.profile.layout.owned.some(p=>p.x===endWolf.position.x&&p.z===endWolf.position.z-1)
      ||!data.profile.layout.owned.some(p=>p.x===endWolf.position.x&&p.z===endWolf.position.z+1));
    let prior=saved;
    for(let i=0;i<=20;i++) {
      const scene=deriveOpeningScene(data,state,{retreatProgress:i/20}),wolf=scene.profile.threat!.wolves[0];
      onLegalEdge(wolf.position,data);assert.ok(distance(prior,wolf.position)<=1);prior=wolf.position;
      assert.deepEqual(wolf.path,event.wolves[0].path);assert.equal(wolf.pathIndex,event.wolves[0].pathIndex);
      assert.deepEqual(scene.profile.threat!.actors,event.actors);
      assert.deepEqual(scene.profile.threat!.events,event.events);
      assert.equal(scene.profile.threat!.elapsed,event.elapsed);
      assert.deepEqual(scene.profile.inventory,data.profile.inventory);
      assert.deepEqual(scene.profile.animals,data.profile.animals);
    }
    assert.deepEqual(deriveOpeningScene(data,state,{retreatProgress:.5}),middle);
  }
  assert.deepEqual(data,before);
});

test('replay defence is a safe isolated visual event, shows chosen ability then wolf retreat', () => {
  const data=sample();data.profile.tutorial='done';data.profile.threat=null;
  data.profile.guardian='dog';data.profile.materials=87;
  data.profile.animals[0].life.bond=55;
  const before=structuredClone(data);
  for(const kind of ['dog','cat','frog'] as const) {
    const scene=deriveOpeningScene(data,opening('defend',2,kind),{replay:true});
    assert.equal(scene.profile.threat!.mode,'tutorial');
    assert.equal(scene.profile.threat!.rewards,0);
    assert.deepEqual(scene.profile.threat!.wolves[0].spawn,{x:0,z:4});
    assert.equal(scene.profile.threat!.guardian?.kind,kind);
    assert.equal(scene.profile.guardian,kind);
    assert.equal(scene.profile.threat!.guardian?.ability,kind==='dog'?'block':kind==='cat'?'gather':'calm');
    assert.equal(scene.profile.materials,87);
    assert.deepEqual(scene.profile.inventory,before.profile.inventory);
    assert.deepEqual(scene.profile.animals.map(a=>a.life),before.profile.animals.map(a=>a.life));
    const end=deriveOpeningScene(data,opening('defend',9,kind),{replay:true});
    assert.ok(end.profile.threat!.wolves.every(w=>w.status==='retreated'));
  }
  assert.deepEqual(data,before);
});

test('completed replay holds its final retreat pose until the caller closes the replay', () => {
  const data=sample();data.profile.threat=null;data.profile.tutorial='done';
  for(const kind of ['dog','cat','frog'] as const) {
    const last=deriveOpeningScene(data,opening('defend',8,kind),{replay:true});
    const done=deriveOpeningScene(data,opening('done',0,kind),{replay:true});
    assert.deepEqual(done.profile.threat,last.profile.threat);
    assert.deepEqual(done.profile.guardianAt,last.profile.guardianAt);
    assert.deepEqual(done.profile.animals,last.profile.animals);
  }
  assert.equal(data.profile.threat,null);
});

test('replay uses a different legal boundary if the visible gate is obstructed', () => {
  const data=sample(),gate={x:0,z:4};
  data.profile.layout.buildings.push({id:'gate-blocker',kind:'decor',...gate,rotation:0,paidCost:2,doors:[],capacity:0});
  const before=structuredClone(data);
  const scene=deriveOpeningScene(data,opening('defend',0,'frog'),{replay:true});
  assert.ok(scene.profile.threat!.wolves.length>0);
  for(const wolf of scene.profile.threat!.wolves) {
    assert.notDeepEqual(wolf.spawn,gate);
    assert.ok(isWalkable(data.profile.layout,wolf.spawn));
    assert.ok(scene.profile.threat!.doors.some(door=>findPath(data.profile.layout,wolf.spawn,door.position)));
  }
  assert.deepEqual(data,before);
});

test('camera attention is a finite grid focus and returns control to player after opening', () => {
  const data=sample();
  for(const stage of ['establish','rustle','approach','startle','choose','arrival','defend'] as const) {
    const focus=openingAttention(data,opening(stage,1,'frog'));
    assert.ok(focus&&Number.isFinite(focus.x)&&Number.isFinite(focus.z));
  }
  assert.equal(openingAttention(data,opening('done')),null);
});

test('camera attention follows the presented moving guardian and wolf from the original snapshot', () => {
  const data=sample(); data.profile.guardian='frog';
  data.profile.threat=guardianCommand(data.profile.threat!,data.profile.layout,{kind:'select',guardian:'frog'}).state;
  for(const elapsed of [0,.5,1.5,3]) {
    const state=opening('arrival',elapsed,'frog'),scene=deriveOpeningScene(data,state);
    assert.deepEqual(openingAttention(data,state),scene.profile.threat!.guardian!.position);
    const approach=opening('approach',elapsed),wolves=deriveOpeningScene(data,approach).profile.threat!.wolves;
    assert.deepEqual(openingAttention(data,approach),wolves[0].position);
  }
});
