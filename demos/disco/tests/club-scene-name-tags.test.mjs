import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { makeClubWorld } from '../lib/club-scene-world.ts';

// Exercise the production DOM synchronization without starting WebGL or a browser.
const source = readFileSync(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ClubScene.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let syncTags;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'syncTags') syncTags = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(syncTags, 'the scene declares its label synchronizer');
const javascript = ts.transpileModule(`globalThis.syncTags = ${syncTags}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function element() {
  return {
    style: {}, dataset: {}, attributes: {}, children: [], parent: null,
    get firstElementChild() { return this.children[0]; },
    appendChild(child) { this.children.push(child); child.parent = this; },
    setAttribute(name, value) { this.attributes[name] = value; },
    remove() {
      if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    },
  };
}

test('DJ has no name tag while NPC and player nicknames survive updates and cleanup', () => {
  const world = makeClubWorld({ createAvatar() {
    return { root: new THREE.Group(), height: 2, labelHeight: 2.2, footprintRadius: .6,
      loaded: true, ready: Promise.resolve(), update() {}, dispose() {} };
  } });
  const tags = new Map(), emotionBubbles = new Map(), chatBubbles = new Map(), labelsHost = element();
  const context = vm.createContext({ world, tags, emotionBubbles, chatBubbles, labelsHost, document: { createElement: element } });
  vm.runInContext(javascript, context);
  const assertLabels = () => {
    const visible = [...world.players.values(), ...world.ambient].filter(rig => rig.root.visible);
    assert.deepEqual([...tags.keys()].sort(), visible.map(rig => rig.id).sort());
    assert.equal(tags.has(world.dj.id), false, 'the resident DJ never gets an HTML name tag');
    for (const rig of visible) {
      const tag = tags.get(rig.id);
      assert.equal(tag.firstElementChild.textContent, rig.name);
      assert.equal(tag.title, rig.name);
      assert.equal(tag.attributes['aria-label'], rig.name);
    }
    assert.equal(world.dj.root.visible, true, 'the DJ model remains visible');
    assert.equal(world.dj.model.root.parent, world.dj.root);
    assert.equal(world.getCameraSubject(null).id, world.dj.id, 'spectator immersive view still follows the DJ');
  };
  try {
    context.syncTags();
    assertLabels();
    assert.equal(tags.size, 5);
    const player = { id: 'player', name: '我的自填昵称', preset: 'milk-frog', slot: 2,
      joinedAt: 0, lastSeenAt: 0, action: 'dance', actionAt: 0 };
    world.syncParticipants([player], player.id);
    context.syncTags();
    assertLabels();
    assert.ok(chatBubbles.has(player.id));
    assert.ok(emotionBubbles.has(player.id));
    world.syncParticipants([{ ...player, name: '第二个自填昵称' }], player.id);
    context.syncTags();
    assertLabels();
    const count = labelsHost.children.length;
    context.syncTags();
    assert.equal(labelsHost.children.length, count, 'repeated sync does not duplicate labels');
    world.syncParticipants([], null);
    // A stale DJ tag is removed, rather than retained as an empty visible plate.
    const staleDjTag = element();
    labelsHost.appendChild(staleDjTag);
    tags.set(world.dj.id, staleDjTag);
    context.syncTags();
    assertLabels();
    assert.equal(staleDjTag.parent, null);
    assert.equal(chatBubbles.size, 0);
    assert.equal(emotionBubbles.size, 0);
    assert.equal(labelsHost.children.length, 5);
  } finally { world.dispose(); }
});
