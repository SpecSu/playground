// 走位可看性统计：贴脸占比 / 距离分布 / 大幅拉开次数 / 走位跳次数 / 每分钟距离变化量，按体型风格汇总
// 用法：node tools/spacingtest.mjs [sim.js 路径]
const simPath = process.argv[2] || '../src/game/sim.js';
const { Sim, Fighter } = await import(simPath);
const { generateDesign, EXAMPLE_PROMPTS } = await import('../src/mech/design.js');
const forms = ['humanoid', 'dog', 'spider', 'tank', 'manta', 'tiger', 'turtle', 'croc', 'trex', 'flamingo'];
const ST = { manta: 'kite', flamingo: 'kite', spider: 'kite', trex: 'pounce', tiger: 'pounce', croc: 'pounce', tank: 'heavy', turtle: 'heavy', dog: 'agile', humanoid: 'agile' };
const agg = {}; const hist = new Array(8).fill(0); let tot = { T: 0, close: 0, far: 0, sep: 0, hops: 0, dd: 0, hits: 0, lens: [] , errs: 0 };
for (let i = 0; i < 60; i++) {
  const fa = forms[i % 10], fb = forms[(i * 3 + 1) % 10];
  const a = generateDesign(EXAMPLE_PROMPTS[i % 8], 'p', { form: fa, seed: 1000 + i }), b = generateDesign(EXAMPLE_PROMPTS[(i + 3) % 8], 'q', { form: fb, seed: 5000 + i });
  const s = new Sim(); const A = new Fighter(a, 0), B = new Fighter(b, 1); s.setFighters(A, B); A.frozen = B.frozen = false; if (process.env.VOTE) s.enableVote();
  let done = false, hops = [0, 0], hits = 0; s.on((t, d) => { if (t === 'ko') done = true; if (t === 'ultVote') s.resolveVote(Math.random() < 0.5 ? A : B); if (t === 'jump' && d.f && d.kind === 'dodge') hops[d.f === A ? 0 : 1]++; if (t === 'hit') hits++; });
  let t = 0, close = 0, far = 0, sep = 0, wasClose = true, prevD = 0, dd = 0, T = 0;
  while (!done && t < 180) {
    s.step(1 / 30); t += 1 / 30;
    if (!Number.isFinite(A.x + B.x + A.z + B.z)) { tot.errs++; break; }
    if (s.voteOpen || A.act?.type?.startsWith('ult_') || B.act?.type?.startsWith('ult_')) continue;
    const d = Math.hypot(A.x - B.x, A.z - B.z); T++; hist[Math.min(7, Math.floor(d / 2))]++;
    if (d < 3.2) { close++; wasClose = true; } else if (d > 7) { far++; if (wasClose) { sep++; wasClose = false; } }
    if (prevD) dd += Math.abs(d - prevD); prevD = d;
  }
  for (const [k, F, h] of [[fa, A, hops[0]], [fb, B, hops[1]]]) { const g = agg[ST[k]] ??= { n: 0, hops: 0, T: 0 }; g.n++; g.hops += h; g.T += T; }
  Object.assign(tot, { T: tot.T + T, close: tot.close + close, far: tot.far + far, sep: tot.sep + sep, hops: tot.hops + hops[0] + hops[1], dd: tot.dd + dd, hits: tot.hits + hits }); tot.lens.push(t);
}
const min = tot.T / 30 / 60;
console.log({ closePct: (100 * tot.close / tot.T).toFixed(1) + '%', farPct: (100 * tot.far / tot.T).toFixed(1) + '%', separationsPerMin: (tot.sep / min).toFixed(1), hopsPerMin: (tot.hops / min).toFixed(1), distChangePerSec: (tot.dd / (tot.T / 30)).toFixed(2), hitsPerMin: (tot.hits / min).toFixed(1), avgLen: (tot.lens.reduce((a, b) => a + b) / tot.lens.length).toFixed(1), errs: tot.errs });
console.log('dist hist (2m bins):', hist.map((h) => (100 * h / tot.T).toFixed(0) + '%').join(' '));
console.log(Object.fromEntries(Object.entries(agg).map(([k, g]) => [k, 'hops/min ' + (g.hops / (g.T / 30 / 60)).toFixed(1)])));
