// v11 参战策略平衡：同一台机器人镜像对打（排除设计差异），只看策略间胜率   node tools/stratest.mjs [N]
import { Sim, Fighter, STRATEGY } from '../src/game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS } from '../src/mech/design.js';

const N = +(process.argv[2] || 240);
const KEYS = Object.keys(STRATEGY);
function duel(d1, s1, d2, s2) {
  const s = new Sim(); const a = new Fighter(d1, 0, s1), b = new Fighter(d2, 1, s2);
  s.setFighters(a, b); a.frozen = b.frozen = false; s.enableVote();
  let done = null; s.on((t, d) => { if (t === 'ko') done = d; if (t === 'ultVote') s.resolveVote(Math.random() < 0.5 ? a : b, 1.3); });
  let t = 0; const dt = 1 / 60;
  while (!done && t < 240) { s.step(dt); t += dt; }
  if (!done) return { w: a.hp / a.maxHp >= b.hp / b.maxHp ? 0 : 1, t };
  return { w: done.winner === a ? 0 : 1, t };
}
const res = {}; const durs = {};
for (const x of KEYS) for (const y of KEYS) if (x < y) {
  let wx = 0; const ts = [];
  for (let i = 0; i < N; i++) {
    const d = generateDesign(EXAMPLE_PROMPTS[i % EXAMPLE_PROMPTS.length], 'p');
    const swap = i % 2; // 左右互换消除站位偏差
    const r = swap ? duel(d, y, d, x) : duel(d, x, d, y);
    if ((r.w === 0) !== !!swap) wx++; ts.push(r.t);
  }
  res[`${x} vs ${y}`] = (wx / N).toFixed(2); durs[`${x} vs ${y}`] = (ts.reduce((p, q) => p + q, 0) / N).toFixed(1);
}
console.log('win rate of left strategy:', res);
console.log('avg duration (s):', durs);
