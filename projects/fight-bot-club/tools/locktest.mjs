// 远程连射锁死检测：近战 vs 机枪/脉冲远程，统计近战方被硬直占比与最长连续硬直   node tools/locktest.mjs
import { Sim, Fighter } from '../src/game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS } from '../src/mech/design.js';
const N = +(process.argv[2] || 120);
let pairs = 0, stunT = 0, totT = 0, maxRun = 0, runs = [], meleeWin = 0, rangedWin = 0, closeT = 0, durs = [];
for (let i = 0; pairs < N && i < N * 40; i++) {
  const a = generateDesign(EXAMPLE_PROMPTS[i % EXAMPLE_PROMPTS.length], 'p' + i), b = generateDesign(EXAMPLE_PROMPTS[(i * 7 + 3) % EXAMPLE_PROMPTS.length], 'q' + i);
  const R = [a, b].find((d) => d.range === 'ranged' && ['gatling', 'blaster'].includes(d.main)), M = [a, b].find((d) => d.range !== 'ranged');
  if (!R || !M) continue; pairs++;
  const s = new Sim(); const fr = new Fighter(R, 0), fm = new Fighter(M, 1); s.setFighters(fr, fm); fr.frozen = fm.frozen = false;
  let done = null; s.on((t, d) => { if (t === 'ko') done = d; if (t === 'ult') d.f.ultBoost = 1.3; });
  let t = 0, run = 0; const dt = 1 / 60;
  while (!done && t < 200) {
    s.step(dt); t += dt; totT += dt;
    const st = fm.act && fm.act.type === 'hitstun';
    if (st) { stunT += dt; run += dt; } else { if (run > 0) runs.push(run); maxRun = Math.max(maxRun, run); run = 0; }
    if (Math.hypot(fr.x - fm.x, fr.z - fm.z) < 4) closeT += dt;
  }
  durs.push(t);
  if (done) { if (done.winner === fm) meleeWin++; else rangedWin++; }
}
runs.sort((x, y) => x - y);
console.log({ pairs, meleeStunPct: (stunT / totT * 100).toFixed(1) + '%', maxStunRun: maxRun.toFixed(2), p95Run: (runs[Math.floor(runs.length * 0.95)] || 0).toFixed(2), runsOver1s: runs.filter((r) => r > 1).length, closePct: (closeT / totT * 100).toFixed(1) + '%', meleeWin, rangedWin, avgDur: (durs.reduce((x, y) => x + y, 0) / durs.length).toFixed(1) });
