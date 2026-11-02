import { Sim, Fighter, TUNE } from '../src/game/sim.js';
import { generateDesign, ROLE_ADJ } from '../src/mech/design.js';
const P = { tank: '重装坦克', assassin: '敏捷刺客', gunner: '远程火力炮台', brawler: '莽夫拳击' };
const roles = Object.keys(P);
function gen(r) { for (;;) { const d = generateDesign(P[r], 'p'); if (d.role === r) return d; } }
function fight(a, b, sw) { const s = new Sim(); const fa = new Fighter(a, sw), fb = new Fighter(b, 1 - sw); s.setFighters(fa, fb); fa.frozen = fb.frozen = false; let done = null; s.on((t, d) => { if (t === 'ko') done = d; }); let t = 0; while (!done && t < 500) { s.step(1 / 60); t += 1 / 60; } return [done ? done.winner === fa : Math.random() < 0.5, t]; }
const ITER = +(process.argv[2] || 8), N = +(process.argv[3] || 40);
for (let it = 0; it < ITER; it++) {
  const w = {}, c = {}; const all = []; const pair = {};
  for (const ra of roles) for (const rb of roles) { if (ra >= rb) continue; let wa = 0; for (let i = 0; i < N; i++) { const [aw, t] = fight(gen(ra), gen(rb), i % 2); all.push(t); if (aw) wa++; w[aw ? ra : rb] = (w[aw ? ra : rb] || 0) + 1; c[ra] = (c[ra] || 0) + 1; c[rb] = (c[rb] || 0) + 1; } pair[ra + '>' + rb] = (wa / N).toFixed(2); }
  for (let i = 0; i < 4 * 12; i++) { const r = roles[i % 4]; all.push(fight(gen(r), gen(r), i % 2)[1]); }
  const avg = all.reduce((x, y) => x + y) / all.length;
  const wr = Object.fromEntries(roles.map((r) => [r, (w[r] || 0) / c[r]]));
  console.log(it, 'avg', avg.toFixed(1), 'dmg', TUNE.dmg.toFixed(3), 'wr', JSON.stringify(Object.fromEntries(roles.map(r => [r, wr[r].toFixed(2)]))), JSON.stringify(pair), 'adj', JSON.stringify(Object.fromEntries(roles.map(r => [r, ROLE_ADJ[r].toFixed(3)]))));
  for (const r of roles) ROLE_ADJ[r] *= Math.pow(0.5 / Math.max(0.03, Math.min(0.97, wr[r])), 0.12);
  const m = roles.reduce((x, r) => x * ROLE_ADJ[r], 1) ** 0.25; for (const r of roles) ROLE_ADJ[r] /= m;
  TUNE.dmg *= Math.pow(avg / 118, 0.9);
}
