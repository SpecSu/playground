// 合成引擎统计：node --import ./tools/v09a/three_loader.mjs tools/v09a/sim_synth.mjs [N]
// （three_loader 把裸模块 'three' 映射到 vendor/three.module.min.js，synth_model.js 才能在 node 里 import）
import * as S from '../../src/synth.js';
import { ITEMS } from '../../src/items.js';

const N = +process.argv[2] || 1000;
const rng = (s) => () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296);
const r = rng(20261103);
const pick = (a) => a[Math.floor(r() * a.length)];
const nat = (sp) => ({ uid: 'n' + Math.floor(r() * 1e9).toString(36), sp, cm: S.NATURAL[sp].cm * (0.8 + r() * 0.4), gen: 0, traits: r() < 0.15 ? [pick(['gold', 'rainbow', 'glow', 'pastel', 'neon'])] : [] });
const PROMPTS = ['', '', '', '想要会发光的', '凶一点', '粉色胖胖的', '长出翅膀', '透明水晶', '巨大', '触手', '黄金', '细长一点'];
const cnt = {}; const inc = (k, v) => { cnt[k] = cnt[k] || {}; cnt[k][v] = (cnt[k][v] || 0) + 1; };
const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(v / N * 100).toFixed(1)}%`).join(' ');
let wildAny = 0, wildSum = 0, errors = 0; const samples = []; const fps = new Set(); const names = new Set(); let maxJson = 0, cmMax = 0, cmMin = 1e9;
let pool = [];   // 合成鱼池：用于再次融合
for (let i = 0; i < N; i++) {
  try {
    const a = pool.length > 5 && r() < 0.25 ? pick(pool) : nat(pick(S.NATURAL_IDS));
    const b = pool.length > 5 && r() < 0.15 ? pick(pool) : nat(pick(S.NATURAL_IDS));
    const item = r() < 0.6 ? pick(ITEMS).id : null;
    const v = S.synthesize({ a, b, item, prompt: pick(PROMPTS), seed: (r() * 4294967296) >>> 0, creator: 'sim' });
    const g = v.syn;
    inc('plan', g.base.map((b) => b[0]).slice(0, 2).join('+').split('+').length + '祖'); inc('tail', g.tail.k + (g.tail.n === 2 ? '×2' : '')); inc('dor', g.dor.k); inc('pat', g.pat.k); inc('mat', g.mat); inc('rarity', v.rarity); inc('gen', v.gen);
    const W = g.wild || []; for (const w of W) inc('wild', w);
    if (W.length) wildAny++; wildSum += W.length;
    for (const k of ['len', 'ht', 'eyeK', 'irid', 'glow']) if (!Number.isFinite(g[k])) throw new Error('NaN ' + k);
    fps.add(v.fp); names.add(v.name); maxJson = Math.max(maxJson, JSON.stringify(g).length); cmMax = Math.max(cmMax, v.cm); cmMin = Math.min(cmMin, v.cm);
    if (v.sp !== 'synth' || !v.name || !v.fp || v.syn.tags.length < 3 || v.syn.tags.length > 4 || !('STUB' in S) === false) throw new Error('bad fields ' + v.name);
    if (pool.length < 200) pool.push(v); else pool[Math.floor(r() * 200)] = v;
    if (samples.length < 10 && i % 37 === 5) samples.push({ v, a, b, item });
  } catch (e) { errors++; if (errors < 4) console.error(e); }
}
console.log(`== ${N} 次合成  errors=${errors}  STUB导出=${'STUB' in S}`);
for (const k of ['plan', 'tail', 'dor', 'pat', 'mat', 'rarity', 'gen']) console.log(`[${k}] ${fmt(cnt[k])}`);
console.log(`[wild] 至少一个狂野突变 ${(wildAny / N * 100).toFixed(1)}%  平均 ${(wildSum / N).toFixed(2)} 个 | ${fmt(cnt.wild || {})}`);
console.log(`唯一指纹 ${fps.size}/${N}  唯一名字 ${names.size}/${N}  syn JSON 最大 ${maxJson}B  cm ${cmMin}~${cmMax}`);

// 确定性
const A0 = nat('great-white'), B0 = nat('pufferfish');
const x1 = S.synthesize({ a: A0, b: B0, item: 'toilet', prompt: '凶一点', seed: 42 }), x2 = S.synthesize({ a: A0, b: B0, item: 'toilet', prompt: '凶一点', seed: 42 });
const strip = (v) => JSON.stringify({ ...v, uid: 0, id: 0 });
console.log('确定性（同 seed 同输入）:', strip(x1) === strip(x2) ? 'OK' : 'FAIL');

// 同亲本不同 seed 的差异度
const keys = (g) => [g.base[0][0], g.len.toFixed(2), g.ht.toFixed(2), g.dor.k, g.tail.k, g.pect.k, g.pat.k, g.mat, g.pelv.k, g.fil > 0 ? 1 : 0, g.pal[0]];
const diffs = []; const vs = [];
for (let s = 0; s < 60; s++) vs.push(S.synthesize({ a: A0, b: B0, seed: 1000 + s }).syn);
for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) { const p = keys(vs[i]), q = keys(vs[j]); diffs.push(p.filter((x, k) => x !== q[k]).length / p.length); }
const uniqCombos = new Set(vs.map((g) => keys(g).slice(0, 8).join('|'))).size;
console.log(`同亲本(大白鲨×河豚, 无道具) 60 个 seed：平均基因差异 ${(diffs.reduce((a, b) => a + b, 0) / diffs.length * 100).toFixed(1)}%  部件组合唯一 ${uniqCombos}/60`);
const tw = []; for (let s = 0; s < 40; s++) tw.push(S.synthesize({ a: A0, b: B0, item: 'toilet', seed: 5000 + s }).syn);
console.log(`马桶道具 40 次：mat=ceramic ${tw.filter((g) => g.mat === 'ceramic').length}/40  porcelain/crackle ${tw.filter((g) => ['porcelain', 'crackle'].includes(g.pat.k)).length}/40`);

console.log('\n== 10 个样例');
for (const { v, a, b, item } of samples) {
  const g = v.syn, pn = (x) => (x.sp === 'synth' ? x.name : S.NATURAL[x.sp].name);
  console.log(`${v.name}  [${v.rarity}·G${v.gen}·${v.cm}cm·${v.fp}]  ← ${pn(a)} × ${pn(b)}${item ? ' + ' + item : ''}${v.prompt ? ' 「' + v.prompt + '」' : ''}`);
  console.log(`   tags: ${g.tags.join(' / ')}  | base:${g.base.map((b) => b[0] + ':' + b[1]).join(',')} len:${g.len} ht:${g.ht} dor:${g.dor.k} tail:${g.tail.k} pect:${g.pect.k} pelv:${g.pelv.k} pat:${g.pat.k} mat:${g.mat} lux:${g.lux} fil:${g.fil} pal:${g.pal.join(',')}`);
}
console.log('\n== previewHints / wildSynth / 换名');
console.log(JSON.stringify(S.previewHints({ a: A0, b: B0, item: 'toilet', prompt: '发光' })));
console.log(JSON.stringify(S.previewHints({ a: nat('octopus'), b: nat('sailfish'), item: null, prompt: '' })));
for (let i = 0; i < 4; i++) { const w = S.wildSynth(777 + i, '@海雾'); console.log(`wild: ${w.name} [${w.rarity} G${w.gen}] by ${w.creator} ← ${w.parents.map((p) => p.name).join(' × ')}${w.synItem ? ' + ' + w.synItem : ''} | ${S.synthTags(w).join('/')}`); }
const base = samples[0].v; console.log('换名:', [1, 2, 3, 4, 5].map((s) => S.synthName({ ...base, seed: s * 7919 })).join('  '));
console.log('天然鱼 synthTags:', S.synthTags(nat('hammerhead')).join('/'), '|', S.synthTags(nat('anglerfish')).join('/'));
