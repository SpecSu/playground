// 无头跑批：校准单局时长与胜率分布   node tools/simtest.mjs
import { Sim, Fighter } from '../src/game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS } from '../src/mech/design.js';

const N = +(process.argv[2] || 300);
const formWin = {}, formCnt = {};
const durs = []; const gaps = []; const BOOST = +(process.argv[3] || 1.5); const roleWin = {}; const roleCnt = {}; let upsets = 0; const kinds = {};
for (let i = 0; i < N; i++) {
  const a = generateDesign(EXAMPLE_PROMPTS[i % 8], 'p');
  const b = generateDesign(EXAMPLE_PROMPTS[(i * 3 + 1) % 8], 'q');
  const s = new Sim(); const fa = new Fighter(a, 0), fb = new Fighter(b, 1);
  s.setFighters(fa, fb); fa.frozen = fb.frozen = false;
  let done = null; let lastU = -1; s.on((t, d) => { if (t === 'ko') done = d; if (t === 'ult') { d.f.ultBoost = BOOST; if (lastU >= 0) gaps.push(s.time - lastU); lastU = s.time; } if (t === 'act') kinds[d.type] = (kinds[d.type] || 0) + 1; });
  let t = 0; const dt = 1 / 60;
  while (!done && t < 400) { s.step(dt); t += dt; }
  durs.push(t);
  if (done) {
    const w = done.winner.d.role; roleWin[w] = (roleWin[w] || 0) + 1; const fw = done.winner.d.form; formWin[fw] = (formWin[fw] || 0) + 1;
  }
  roleCnt[a.role] = (roleCnt[a.role] || 0) + 1; formCnt[a.form] = (formCnt[a.form] || 0) + 1; formCnt[b.form] = (formCnt[b.form] || 0) + 1; roleCnt[b.role] = (roleCnt[b.role] || 0) + 1;
}
gaps.sort((x, y) => x - y); console.log('ult gap avg', (gaps.reduce((x, y) => x + y, 0) / gaps.length).toFixed(1), 'p50', gaps[gaps.length >> 1]?.toFixed(1), 'ults/match', (gaps.length / N + 1).toFixed(1));
durs.sort((x, y) => x - y);
const avg = durs.reduce((x, y) => x + y, 0) / N;
console.log('avg', avg.toFixed(1), 'p10', durs[Math.floor(N * 0.1)].toFixed(1), 'p50', durs[Math.floor(N * 0.5)].toFixed(1), 'p90', durs[Math.floor(N * 0.9)].toFixed(1), 'timeouts', durs.filter((d) => d >= 400).length);
console.log('role win rate', Object.fromEntries(Object.keys(roleCnt).map((r) => [r, ((roleWin[r] || 0) / roleCnt[r]).toFixed(2)])));
console.log('form win rate', Object.fromEntries(Object.keys(formCnt).map((r) => [r, ((formWin[r] || 0) / formCnt[r]).toFixed(2)])));
