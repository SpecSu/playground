// node --import ./tools/v09a/three_loader.mjs tools/v09a/sim_model.mjs
// 合成模型自检：真实 synthesize / wildSynth 基因组 + 全造型词表强制覆盖 → 统计三角数 / 网格数 / 报错
import { synthesize, wildSynth, NATURAL_IDS, SHAPES } from '../../src/synth.js';
import { buildSynthModel, SYN_SHAPES, SYN_APPS } from '../../src/synth_model.js';
import { ITEM_BY_ID } from '../../src/items.js';

const warns = [];
const ow = console.warn; console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
const mk = (sp) => ({ sp, uid: sp, id: sp, cm: 40 });
const stats = [];
function run(v, tag) {
  try {
    const m = buildSynthModel(v);
    let meshes = 0; m.traverse((o) => { if (o.isMesh) meshes++; });
    const d = m.userData.normalizedDimensions;
    if (![d.x, d.y, d.z].every(Number.isFinite)) throw new Error('NaN dims');
    let nan = false; m.traverse((o) => { if (o.isMesh) { const a = o.geometry.getAttribute('position').array; for (let i = 0; i < a.length; i += 97) if (!Number.isFinite(a[i])) { nan = true; break; } } });
    if (nan) throw new Error('NaN position');
    stats.push({ tag, tris: m.userData.tris, meshes, dx: d.x });
  } catch (e) { stats.push({ tag, err: String(e.stack || e) }); }
}
const items = Object.keys(ITEM_BY_ID);
let seed = 1;
for (let i = 0; i < 160; i++) {
  const a = NATURAL_IDS[i % NATURAL_IDS.length], b = NATURAL_IDS[(i * 7 + 3) % NATURAL_IDS.length];
  const item = i % 2 ? items[i % items.length] : null;
  run(synthesize({ a: mk(a), b: mk(b), item, seed: seed++ }), `syn:${a}+${b}+${item}`);
}
for (let i = 0; i < 60; i++) run(wildSynth(1000 + i), `wild:${i}`);
// 强制覆盖每个造型值
const base = synthesize({ a: mk('clownfish'), b: mk('tuna'), seed: 5 });
const force = (patch, tag) => run({ ...base, syn: { ...base.syn, ...patch } }, tag);
for (const k of SHAPES.plan) force({ plan: k }, 'plan:' + k);
for (const k of SHAPES.head) force({ head: k }, 'head:' + k);
for (const k of SHAPES.mouth) force({ mouth: k }, 'mouth:' + k);
for (const k of SHAPES.dor) force({ dor: { k, h: 1, l: 1, x: 0.5 }, dor2: { k: 'shark', h: 0.6, l: 0.6, x: 0.28 } }, 'dor:' + k);
for (const k of SHAPES.tail) { force({ tail: { k, s: 1 } }, 'tail:' + k); force({ tail: { k, s: 1.4, n: 2 } }, 'tail2:' + k); }
for (const k of SHAPES.pect) force({ pect: { k, s: 1.2 } }, 'pect:' + k);
for (const a of SHAPES.app) force({ app: [a.replace(':N', ':8')] }, 'app:' + a);
for (const n of [0, 1, 3, 5, 8]) force({ eyes: { n, k: 1, stalk: n === 3 ? 1 : 0, lens: n === 5 ? 1 : 0 } }, 'eyes:' + n);
force({ asym: 1 }, 'asym');
force({ mat: 'paper', pect: { k: 'wing', s: 1.5 } }, 'paper-crane');
force({ plan: 'nope', head: 'zzz', mouth: 42, dor: { k: 'what' }, tail: { k: '??' }, pect: { k: null }, app: ['foo:3', null, 'tentacle:abc'], mat: 'unobtainium' }, 'garbage');
run({ sp: 'synth' }, 'no-syn');
run({ sp: 'synth', syn: null, cm: 2400 }, 'null-syn');

console.warn = ow;
const errs = stats.filter((s) => s.err), ok = stats.filter((s) => !s.err);
const tr = ok.map((s) => s.tris).sort((a, b) => a - b), ms = ok.map((s) => s.meshes).sort((a, b) => a - b);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
console.log(`models ${stats.length}  ok ${ok.length}  err ${errs.length}  warn ${warns.length}`);
console.log(`tris  p50 ${q(tr, 0.5)}  p90 ${q(tr, 0.9)}  max ${tr[tr.length - 1]}`);
console.log(`meshes p50 ${q(ms, 0.5)}  p90 ${q(ms, 0.9)}  max ${ms[ms.length - 1]}`);
const big = ok.filter((s) => s.tris > 6000).slice(0, 12); if (big.length) console.log('heavy:', big.map((s) => `${s.tag}=${s.tris}`).join('  '));
for (const e of errs.slice(0, 6)) console.log('ERR', e.tag, e.err.split('\n').slice(0, 3).join(' | '));
for (const w of [...new Set(warns)].slice(0, 8)) console.log('WARN', w.slice(0, 220));
const miss = (kind) => SHAPES[kind].filter((x) => !SYN_SHAPES[kind].includes(x));
console.log('vocab gaps:', JSON.stringify({ plan: miss('plan'), head: miss('head'), mouth: miss('mouth'), dor: miss('dor'), tail: miss('tail'), pect: miss('pect'), app: SHAPES.app.map((a) => a.split(':')[0]).filter((a) => !SYN_APPS.includes(a)) }));
