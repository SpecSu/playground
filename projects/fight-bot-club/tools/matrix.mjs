import { Sim, Fighter } from '../src/game/sim.js';
import { generateDesign } from '../src/mech/design.js';
const P = { tank: '重装坦克', assassin: '敏捷刺客', gunner: '远程火力炮台', brawler: '莽夫拳击' };
const roles = Object.keys(P); const N = +(process.argv[2] || 60); const all = [];
const out = {};
for (const ra of roles) for (const rb of roles) {
  if (ra >= rb) continue; let wa = 0; const ds = [];
  for (let i = 0; i < N; i++) {
    const a = generateDesign(P[ra], 'p'), b = generateDesign(P[rb], 'q');
    if (a.role !== ra || b.role !== rb) { i--; continue; }
    const s = new Sim(); const fa = new Fighter(a, i % 2), fb = new Fighter(b, 1 - i % 2); s.setFighters(fa, fb); fa.frozen = fb.frozen = false;
    let done = null; s.on((t, d) => { if (t === 'ko') done = d; });
    let t = 0; while (!done && t < 400) { s.step(1 / 60); t += 1 / 60; }
    if (done && done.winner === fa) wa++; ds.push(t); all.push(t);
  }
  out[ra + '>' + rb] = [(wa / N).toFixed(2), (ds.reduce((x, y) => x + y) / N).toFixed(0)];
}
for (const r of roles) { const ds = []; for (let i = 0; i < 20; i++) { const a = generateDesign(P[r], 'p'), b = generateDesign(P[r], 'q'); const s = new Sim(); const fa = new Fighter(a, 0), fb = new Fighter(b, 1); s.setFighters(fa, fb); fa.frozen = fb.frozen = false; let done = null; s.on((t, d) => { if (t === 'ko') done = d; }); let t = 0; while (!done && t < 400) { s.step(1 / 60); t += 1 / 60; } ds.push(t); all.push(t);} out[r + ' mirror'] = ['-', (ds.reduce((x, y) => x + y) / 20).toFixed(0)]; }
console.log(out); console.log('avg all', (all.reduce((x, y) => x + y) / all.length).toFixed(1));
