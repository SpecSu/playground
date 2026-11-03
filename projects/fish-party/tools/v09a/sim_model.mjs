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
for (const k of SHAPES.dor) force({ dor: { k, h: 1.2 } }, 'dor:' + k);
for (const k of SHAPES.tail) force({ tail: { k, s: 1.3 } }, 'tail:' + k);
for (const k of SHAPES.pect) force({ pect: { k, s: 1.2 } }, 'pect:' + k);
for (const k of SHAPES.pat) force({ pat: { k, d: 3, a: 0.9 } }, 'pat:' + k);
for (const k of SHAPES.mat) force({ mat: k, lux: 4, fil: 1, scl: 1, glow: 0.8 }, 'mat:' + k);
for (const sp of NATURAL_IDS) force({ base: [[sp, 1]] }, 'base:' + sp);
// 旧 v0.9 存档基因（v1 格式）兼容
const V1 = { plan: 'globe', head: 'spout', mouth: 'gape', dor: { k: 'lid', h: 1, l: 1, x: 0.5 }, dor2: { k: 'shark', h: 0.6 }, tail: { k: 'anchor', s: 1.4, n: 2 }, pect: { k: 'wing', s: 1.5 }, eyes: { n: 5, k: 1.3, stalk: 1, lens: 1 }, app: ['bells', 'lure:bulb', 'tentacle:8'], asym: 1, wild: ['photo'], pat: { k: 'dial', d: 3 }, mat: 'paper', pal: ['#c04a3c', '#f1ebe0', '#2a2a2e', '#b8892f'], anc: { pufferfish: 0.5, swordfish: 0.5 }, tags: ['a', 'b', 'c'] };
run({ sp: 'synth', syn: V1, rarity: 'epic', cm: 50 }, 'legacy-v1');
for (const plan of ['fusiform', 'deep', 'globe', 'eel', 'flat', 'box', 'seg', 'disc', 'hourglass', 'diamond']) run({ sp: 'synth', syn: { ...V1, plan, anc: undefined }, rarity: 'rare' }, 'legacy-plan:' + plan);
force({ base: [['nope', 1]], dor: { k: 'what' }, tail: { k: '??' }, pect: { k: null }, pal: [1, null], pat: 7, mat: 'unobtainium', len: NaN, ht: 'x' }, 'garbage');
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
console.log('vocab gaps:', JSON.stringify({ dor: miss('dor'), tail: miss('tail'), pect: miss('pect') }), 'apps:', SYN_APPS.length);
// 天然鱼三角数对照
const { createMarineModel } = await import('../../src/marine.js');
const nt = []; for (const sp of NATURAL_IDS) { try { const m = createMarineModel(sp); if (!m) continue; let t = 0; m.traverse((o) => { if (o.isMesh) { const g = o.geometry; t += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } }); nt.push(t); } catch (e) { } }
console.log(`natural tris avg ${Math.round(nt.reduce((a, b) => a + b, 0) / nt.length)} (n=${nt.length})  synth avg ${Math.round(tr.reduce((a, b) => a + b, 0) / tr.length)}`);
