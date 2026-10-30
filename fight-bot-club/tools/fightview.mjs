// 无头整局：模拟 + 各形态视图联动（检查 NaN / 异常 / 悬空）
import { Sim, Fighter } from '../src/game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS } from '../src/mech/design.js';
import { createView } from '../src/mech/forms.js';
const forms = ['humanoid', 'dog', 'spider', 'hover', 'tank', 'wraith'];
let errs = 0, maxY = 0, n = 0;
for (let i = 0; i < 18; i++) {
  const fa = forms[i % 6], fb = forms[(i * 5 + 1) % 6];
  const a = generateDesign(EXAMPLE_PROMPTS[i % 8], 'p', { form: fa }), b = generateDesign(EXAMPLE_PROMPTS[(i + 3) % 8], 'q', { form: fb });
  const s = new Sim(); const A = new Fighter(a, 0), B = new Fighter(b, 1); s.setFighters(A, B); A.frozen = B.frozen = false;
  const V = [createView(a), createView(b)];
  let done = false; s.on((t, d) => { try { if (t === 'ko') done = true; if (t === 'shot' && d.f) V[d.f === A ? 0 : 1].onShot?.(d.side || 0); if (t === 'hit' && d.o) V[d.o === A ? 0 : 1].onHit?.(d); if (t === 'land' && d.f) V[d.f === A ? 0 : 1].onLand?.(d.heavy); } catch (e) { errs++; console.log(t, e.message); } });
  let t = 0;
  while (!done && t < 200) {
    s.step(1 / 30); t += 1 / 30;
    try { V[0].update(A, 1 / 30, B); V[1].update(B, 1 / 30, A); } catch (e) { errs++; console.log(fa, fb, e.stack.split('\n').slice(0, 2).join('|')); break; }
    for (const f of [A, B]) { if (!Number.isFinite(f.x + f.y + f.z)) errs++; maxY = Math.max(maxY, f.y); }
    for (const v of V) if (!Number.isFinite(v.root.position.x + v.bones.pelvis.position.y)) errs++;
  }
  n++; V.forEach((v) => v.dispose());
}
console.log({ matches: n, errs, maxY: maxY.toFixed(2) });
