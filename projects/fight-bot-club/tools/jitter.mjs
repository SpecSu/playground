// 抖动检测：真实对局，每台机型按 60fps 驱动视图，统计每根骨骼每帧的角度变化
// 指标：p99.9 角速度 & 「来回翻转」次数（连续两帧方向相反且幅度都 > 阈值 = 高频抖动）
// T0 > 0 时让视图时钟从很大的值开始（模拟玩了很久之后），旧的 sin(t*频率) 相位跳变会在这里暴露
import { Sim, Fighter } from '../src/game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS } from '../src/mech/design.js';
import { createView } from '../src/mech/forms.js';
const forms = ['humanoid', 'dog', 'spider', 'tank', 'manta', 'tiger', 'turtle', 'croc', 'trex', 'flamingo'];
const T0 = +(process.argv[2] || 600), DT = 1 / 60;
const res = {};
for (const form of forms) {
  let flips = 0, frames = 0; const speeds = []; const worst = {};
  for (let m = 0; m < 4; m++) {
    const a = generateDesign(EXAMPLE_PROMPTS[m % 8], 'p', { form }), b = generateDesign(EXAMPLE_PROMPTS[(m + 3) % 8], 'q', { form: forms[(forms.indexOf(form) + 1 + m) % 12] });
    const s = new Sim(); const A = new Fighter(a, 0), B = new Fighter(b, 1); s.setFighters(A, B); A.frozen = B.frozen = false;
    const v = createView(a), vb = createView(b); v.time = T0; vb.time = T0;
    let done = false; s.on((t, d) => { if (t === 'ko') done = true; if (t === 'hit' && d.o === A) v.onHit?.(d); if (t === 'land' && d.f === A) v.onLand?.(d.heavy); });
    const prev = {}, pd = {}; let t = 0;
    while (!done && t < 60) {
      s.step(DT); t += DT; v.update(A, DT, B); vb.update(B, DT, A); frames++;
      for (const [name, bn] of Object.entries(v.bones)) {
        const r = bn.rotation; const cur = [r.x, r.y, r.z];
        if (prev[name]) for (let k = 0; k < 3; k++) {
          const dv = cur[k] - prev[name][k]; const w = Math.abs(dv) / DT; speeds.push(w);
          const key = name + 'xyz'[k];
          if (w > 6 && pd[key] && Math.sign(dv) !== Math.sign(pd[key]) && Math.abs(pd[key]) / DT > 6) { flips++; worst[key] = (worst[key] || 0) + 1; }
          pd[key] = dv;
        }
        prev[name] = cur;
      }
    }
    v.dispose(); vb.dispose();
  }
  speeds.sort((x, y) => x - y);
  const top = Object.entries(worst).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => k + ':' + n).join(' ');
  res[form] = { frames, 'p99.9 rad/s': +speeds[Math.floor(speeds.length * 0.999)].toFixed(1), flipsPerMin: +(flips / frames * 3600).toFixed(1), top };
}
console.table(res);
