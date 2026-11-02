// v10.1 投票大招：无头整局（共用倒计时 → ultVote → 随机胜者 → 强制放大招），统计时长/大招次数/卡死
import { Sim, Fighter } from '../src/game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS, FORM_LIST } from '../src/mech/design.js';
let errs = 0, stuck = 0; const lens = [], ults = [], votes = [], wait = [];
for (let i = 0; i < 120; i++) {
  const a = generateDesign(EXAMPLE_PROMPTS[i % 8], 'p', { form: FORM_LIST[i % 10] }), b = generateDesign(EXAMPLE_PROMPTS[(i + 3) % 8], 'q', { form: FORM_LIST[(i * 7 + 3) % 10] });
  const s = new Sim(); const A = new Fighter(a, 0), B = new Fighter(b, 1); s.setFighters(A, B); A.frozen = B.frozen = false; s.enableVote();
  let done = false, nu = 0, nv = 0, pend = null, vt = 0;
  s.on((t, d) => { if (t === 'ko') done = true; if (t === 'ult') { nu++; wait.push(s.time - vt); } if (t === 'ultVote') { nv++; pend = Math.random() < 0.5 ? d.a : d.b; } });
  let t = 0;
  while (!done && t < 99) {
    if (pend) { s.resolveVote(pend, 1.3); vt = s.time; pend = null; }
    s.step(1 / 30); t += 1 / 30;
    for (const f of [A, B]) if (!Number.isFinite(f.x + f.y + f.z + f.hp)) errs++;
    if (s.voteOpen && !pend) { stuck++; break; }
  }
  lens.push(t); ults.push(nu); votes.push(nv);
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
console.log({ matches: lens.length, errs, stuck, avgLen: avg(lens), timeouts: lens.filter((x) => x >= 99).length, avgVotes: avg(votes), avgUlts: avg(ults), maxUltDelay: Math.max(...wait).toFixed(2) });
