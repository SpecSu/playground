import * as THREE from 'three';

// The merged meme GLB has no separate accessory nodes. Its nineteen authored
// weapon islands retain these vertex colors and rigid hand skin weights. Gold
// palms/fingers use C28D54 and are deliberately excluded from this allowlist.
// Source: scripts/avatars/meme-cast/generate_memes.py, dog().
const WEAPON_COLORS = [0x353230, 0xc2b38e, 0xaab4bc, 0xe0e7e8, 0xa88e58, 0x696c69, 0xb8a371, 0x777d78]
  .map(hex => new THREE.Color().setHex(hex, THREE.SRGBColorSpace));
const COLOR_TOLERANCE = 0.00004; // GLB colors are normalized unsigned shorts.

/**
 * Remove the dog's authored sword/shield only from an already-cloned fishing
 * rig. createClubAvatar owns these geometries: edit them in place so its normal
 * dispose path still releases every resource. Never pass the cached GLB scene.
 * Returns the number of removed triangles; repeat calls are harmless.
 */
export function removeFishingAvatarProps(root: THREE.Object3D, kind: string): number {
  if (kind !== 'sword-shield-dog') return 0;
  let removed = 0;
  root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh) || Array.isArray(node.material) || node.material.name !== 'Meme_vinyl') return;
    const geometry = node.geometry, index = geometry.index;
    const color = geometry.getAttribute('color'), weights = geometry.getAttribute('skinWeight'), joints = geometry.getAttribute('skinIndex');
    const attributes = Object.entries(geometry.attributes);
    // This filter is intentionally scoped to the checked-in indexed GLB layout.
    // Fail closed for a changed asset instead of risking a partial body cut.
    if (!index || !color || !weights || !joints || geometry.groups.length || Object.keys(geometry.morphAttributes).length
      || attributes.some(([, attribute]) => !(attribute instanceof THREE.BufferAttribute))) return;
    const weaponHand = new Uint8Array(color.count);
    for (let vertex = 0; vertex < color.count; vertex++) {
      if (!WEAPON_COLORS.some(value => Math.abs(color.getX(vertex) - value.r) < COLOR_TOLERANCE
        && Math.abs(color.getY(vertex) - value.g) < COLOR_TOLERANCE
        && Math.abs(color.getZ(vertex) - value.b) < COLOR_TOLERANCE)) continue;
      let hand = 0, handWeight = 0, otherWeight = 0;
      for (let channel = 0; channel < weights.itemSize; channel++) {
        const weight = weights.getComponent(vertex, channel);
        if (weight <= 0) continue;
        const name = node.skeleton.bones[joints.getComponent(vertex, channel)]?.name;
        const side = name === 'hand_L' ? 1 : name === 'hand_R' ? 2 : 0;
        if (side && (!hand || hand === side)) { hand = side; handWeight += weight; }
        else otherWeight += weight;
      }
      if (handWeight > .999 && otherWeight < .001) weaponHand[vertex] = hand;
    }
    const retained: number[] = [];
    let meshRemoved = 0;
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = index.getX(offset), b = index.getX(offset + 1), c = index.getX(offset + 2);
      if (weaponHand[a] && weaponHand[a] === weaponHand[b] && weaponHand[a] === weaponHand[c]) meshRemoved++;
      else retained.push(a, b, c);
    }
    if (!meshRemoved) return;
    const oldVertices = [...new Set(retained)];
    const newVertex = new Map(oldVertices.map((vertex, replacement) => [vertex, replacement]));
    for (const [name, attribute] of attributes) {
      const source = attribute as THREE.BufferAttribute;
      const compact = new THREE.BufferAttribute(source.array.slice(0, oldVertices.length * source.itemSize), source.itemSize, source.normalized);
      compact.name = source.name;
      compact.setUsage(source.usage);
      compact.gpuType = source.gpuType;
      oldVertices.forEach((vertex, replacement) => compact.copyAt(replacement, source, vertex));
      geometry.setAttribute(name, compact);
    }
    geometry.setIndex(retained.map(vertex => newVertex.get(vertex)!));
    geometry.setDrawRange(0, retained.length);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    node.computeBoundingBox();
    node.computeBoundingSphere();
    removed += meshRemoved;
  });
  return removed;
}
