// v10 新招式无头压测：每个小招/大招 × 10 形态，强制发招，检查 NaN / 卡死 / 锁朝向泄漏 / 伤害 / 事件
import { Sim, Fighter } from '../src/game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS, FORM_LIST, SPECIAL_NAMES, ULT_NAMES } from '../src/mech/design.js';
import { createView } from '../src/mech/forms.js';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const moves = [...Object.keys(SPECIAL_NAMES).map((k) => ['sp', k]), ...Object.keys(ULT_NAMES).map((k) => ['ult', k])].filter(([, k]) => !only || only.includes(k));
let bad = 0; const rows = [];
for (const [kind, mv] of moves) {
  let dmgSum = 0, n = 0, errs = 0, stuck = 0, lockLeak = 0, maxY = 0; const ev = {};
  for (let i = 0; i < FORM_LIST.length * 2; i++) {
    const fa = FORM_LIST[i % FORM_LIST.length], fb = FORM_LIST[(i * 3 + 1) % FORM_LIST.length];
    const a = generateDesign(EXAMPLE_PROMPTS[i % 8], 'p', { form: fa }), b = generateDesign(EXAMPLE_PROMPTS[(i + 3) % 8], 'q', { form: fb });
    if (kind === 'sp') a.special = mv; else a.ult = mv;
    const s = new Sim(); const A = new Fighter(a, 0), B = new Fighter(b, 1); s.setFighters(A, B); A.frozen = B.frozen = false;
    const dist = kind === 'sp' ? 4 + (i % 4) * 1.5 : 5 + (i % 3) * 2;
    A.x = -dist / 2; B.x = dist / 2; A.z = B.z = (i % 5) - 2; A.yaw = Math.PI / 2; B.yaw = -Math.PI / 2;
    const V = [createView(a), createView(b)];
    let hp0 = B.hp, started = false, endT = -1;
    s.on((t, d) => { ev[t] = (ev[t] || 0) + 1; if (t === 'actEnd' && d.f === A && d.type === (kind + '_' + mv)) endT = s.time; });
    for (let k = 0; k < 30 * 6; k++) {
      if (!started && A.grounded && !A.act) { started = true; if (kind === 'sp') s.startSpecial(A, B); else s.startUlt(A, B); }
      s.step(1 / 30);
      try { V[0].update(A, 1 / 30, B); V[1].update(B, 1 / 30, A); } catch (e) { errs++; console.log(mv, fa, fb, e.stack.split('\n').slice(0, 3).join(' | ')); break; }
      for (const f of [A, B]) { if (!Number.isFinite(f.x + f.y + f.z + f.yaw + f.hp)) errs++; maxY = Math.max(maxY, f.y); }
      if (endT >= 0 && s.time - endT > 0.6) break;
      if (!B.alive || !A.alive) break;
    }
    if (A.act && A.act.type === kind + '_' + mv && A.alive && B.alive) stuck++;
    if (A.lockYaw != null && !(A.act && A.act.data && A.act.data.lockOwn)) lockLeak++;
    dmgSum += hp0 - B.hp; n++; V.forEach((v) => v.dispose());
  }
  const avg = Math.round(dmgSum / n);
  if (errs || stuck || lockLeak) bad++;
  rows.push({ move: kind + '_' + mv, avgDmg: avg, errs, stuck, lockLeak, maxY: +maxY.toFixed(1), ev: Object.keys(ev).filter((k) => !['act', 'actEnd', 'swing', 'hit', 'shot', 'step'].includes(k)).slice(0, 8).join(',') });
}
console.table(rows);
console.log(bad ? `BAD ${bad}` : 'ALL OK');
