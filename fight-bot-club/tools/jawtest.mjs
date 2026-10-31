// 鳄鱼张嘴穿地检查：整局里统计下颌尖最低世界高度
import * as THREE from 'three';
import { Sim, Fighter } from '../src/game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS } from '../src/mech/design.js';
import { createView } from '../src/mech/forms.js';
const hist = {};
let minTip = 9, minOpen = 9, maxJaw = 0, below = 0, frames = 0;
const P = new THREE.Vector3();
for (let i = 0; i < 16; i++) {
  const a = generateDesign(EXAMPLE_PROMPTS[i % 8], 'p', { form: 'croc' }), b = generateDesign(EXAMPLE_PROMPTS[(i + 3) % 8], 'q', { form: ['humanoid', 'trex', 'tank', 'croc'][i % 4] });
  const s = new Sim(); const A = new Fighter(a, 0), B = new Fighter(b, 1); s.setFighters(A, B); A.frozen = B.frozen = false;
  const V = [createView(a), createView(b)];
  let done = false, t = 0; s.on((k) => { if (k === 'ko') done = true; });
  while (!done && t < 200) {
    s.step(1 / 30); t += 1 / 30;
    V[0].update(A, 1 / 30, B); V[1].update(B, 1 / 30, A);
    const v = V[0]; v.root.updateMatrixWorld(true); v.anchors.jawTip.getWorldPosition(P);
    frames++; const ja = v.bones.xjaw.rotation.x; maxJaw = Math.max(maxJaw, ja);
    if (A.alive && A.y < 0.05) { minTip = Math.min(minTip, P.y); if (ja > 0.2) minOpen = Math.min(minOpen, P.y); if (P.y < 0) { below++; const key = (A.act ? A.act.type : 'none') + (v.dead ? ':dead' : '') + (ja > 0.1 ? ':open' : ':shut'); hist[key] = (hist[key] || 0) + 1; } }
  }
  // 胜利庆祝张嘴
  V[0].cele = 2; for (let k = 0; k < 60; k++) { V[0].update(A, 1 / 30, B); V[0].root.updateMatrixWorld(true); V[0].anchors.jawTip.getWorldPosition(P); if (A.alive) { minTip = Math.min(minTip, P.y); if (P.y < 0) below++; } }
  V.forEach((v) => v.dispose());
}
console.log({ frames, minTip: minTip.toFixed(3), minTipWhileOpen: minOpen.toFixed(3), maxJaw: maxJaw.toFixed(2), framesBelowGround: below, hist });
