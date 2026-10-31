import * as THREE from 'three';
import { generateDesign } from '../src/mech/design.js';
import { createView } from '../src/mech/forms.js';
import { Fighter } from '../src/game/sim.js';
const acts = [null, 'jab', 'heavy', 'shoot', 'block', 'hitstun', 'leap', 'sp_laser', 'ult_beam', 'dodge'];
const out = {};
for (const form of (process.argv[2] ? process.argv[2].split(',') : ['humanoid', 'dog', 'spider', 'tank', 'manta', 'tiger', 'turtle', 'croc', 'trex', 'flamingo'])) {
  let tris = 0, meshes = 0, errs = 0, minY = 1e9, maxY = -1e9, n = 30;
  for (let i = 0; i < n; i++) {
    const d = generateDesign(['黄金重装坦克，巨型铁拳', '霓虹刺客双刀', '深海远程炮台导弹', '废土电锯莽夫'][i % 4], 'x', { form });
    try {
      const v = createView(d); const f = new Fighter(d, 0); const o = new Fighter(d, 1); o.x = 3;
      for (let k = 0; k < 90; k++) {
        const at = acts[(k / 9 | 0) % acts.length];
        f.act = at ? { type: at, t: (k % 9) * 0.1, dur: 0.9, data: { hit: 0.4, phase: 1 }, fired: {} } : null;
        f.localV.f = Math.sin(k * 0.1) * 5; f.localV.s = Math.cos(k * 0.07) * 3; f.grounded = at !== 'leap';
        if (k === 80) v.dead = true;
        v.update(f, 1 / 30, o);
      }
      v.root.updateMatrixWorld(true);
      for (const m of v.meshes) { const p = m.geometry.attributes.position; tris += (m.geometry.index ? m.geometry.index.count : p.count) / 3; meshes++; for (let j = 0; j < p.array.length; j++) if (!Number.isFinite(p.array[j])) { errs++; break; } }
      v.dead = false; for (let k = 0; k < 30; k++) v.update(f, 1 / 30, o); v.root.updateMatrixWorld(true);
      const bb = new THREE.Box3(); for (const m of v.meshes) if (m.visible) bb.expandByObject(m);
      minY = Math.min(minY, bb.min.y); maxY = Math.max(maxY, bb.max.y);
      if (!v.anchorWorld('seat')) errs++;
      for (let s = 0; s < 2; s++) { const mz = v.muzzleWorld(s); if (!mz || !Number.isFinite(mz.x)) errs++; }
      if (!Number.isFinite(v.height)) errs++;
      v.dispose();
    } catch (e) { errs++; console.log(form, e.stack.split('\n').slice(0, 3).join(' | ')); }
  }
  out[form] = { avgTris: Math.round(tris / n), avgMeshes: +(meshes / n).toFixed(1), errs, minY: +minY.toFixed(2), maxY: +maxY.toFixed(2) };
}
console.table(out);
