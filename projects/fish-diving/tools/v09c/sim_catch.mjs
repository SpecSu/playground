// v0.9 C 钓获经济模拟：node tools/v09c/sim_catch.mjs [杆数=200] [轮数=1] [seed]
// 按 main.js 的真实流程逐杆模拟（海洋回流 → 道具 / 天然鱼 → 鱼嘴叼道具），直接调用 src 里的真实函数与概率常量。
// 输出：道具占比（平均几杆 1 个）、道具稀有度占比、合成鱼回流占比、天然鱼稀有度分布、天然鱼是否还带派对基因 / 装饰。
import { register } from 'node:module';
register('./three_loader.mjs', import.meta.url);

const CASTS = +(process.argv[2] || 200), ROUNDS = +(process.argv[3] || 1);
// 可复现随机
let seed = +(process.argv[4] || 20240909) >>> 0;
Math.random = () => ((seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x6d2b79f5) >>> 0) / 4294967296);
// localStorage / document 最小桩
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { rollCatch, isSynth, SPECIES_BY_ID, RARITY_ORDER } = await import('../../src/fishes.js');
const items = await import('../../src/items.js');
const { createMeta } = await import('../../src/meta.js');

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
function runRound() {
  mem.clear();
  const meta = createMeta();
  const st = { casts: 0, item: 0, itemCast: 0, itemMouth: 0, itemR: { common: 0, rare: 0, epic: 0, legendary: 0 }, synth: 0, synthOwn: 0, fish: 0, fishR: {}, gx: 0, deco: 0, wildTraits: 0 };
  for (let i = 0; i < CASTS; i++) {
    st.casts++;
    const tide = Math.random() < 0.12, perfectCast = Math.random() < 0.35;
    const L = meta.castLuck({ bait: false, perfectCast, tide });
    const first = meta.S.catches < 1;
    // ① 海洋回流（main.js wrapOceanCatch）
    const ov = first ? null : meta.rollOceanCatch({ luck: L.luck });
    let v;
    if (ov) v = ov;
    else v = rollCatch({ luck: L.luck, forceMinRarity: first ? 'uncommon' : L.min, itemP: first ? 0 : items.ITEM_CATCH_P, itemLuck: L.luck * 0.5 });
    if (v.item) { st.item++; st.itemCast++; st.itemR[items.ITEM_BY_ID[v.item.id].rarity]++; continue; }
    if (isSynth(v)) { st.synth++; if (v.fromOcean?.own) st.synthOwn++; }
    else {
      st.fish++; const r = SPECIES_BY_ID[v.sp].rarity; st.fishR[r] = (st.fishR[r] || 0) + 1;
      if (v.gx && ((v.gx.extras || []).length || v.gx.mat)) st.gx++;
      if (v.ugc?.decos?.length) st.deco++;
      if (v.traits?.length) st.wildTraits++;
      // ③ 鱼嘴叼道具
      if (Math.random() < items.ITEM_MOUTH_P) { const id = items.rollItemDrop(Math.random, {}); st.item++; st.itemMouth++; st.itemR[items.ITEM_BY_ID[id].rarity]++; }
    }
    meta.recordCatch(v, { perfect: false, perfectCast, tide, score: 10 });
  }
  st.codex = meta.codexProgress();
  return st;
}

const tot = { casts: 0, item: 0, itemCast: 0, itemMouth: 0, itemR: { common: 0, rare: 0, epic: 0, legendary: 0 }, synth: 0, synthOwn: 0, fish: 0, fishR: {}, gx: 0, deco: 0, wildTraits: 0 };
let last;
for (let k = 0; k < ROUNDS; k++) {
  const s = (last = runRound());
  for (const key of ['casts', 'item', 'itemCast', 'itemMouth', 'synth', 'synthOwn', 'fish', 'gx', 'deco', 'wildTraits']) tot[key] += s[key];
  for (const r in s.itemR) tot.itemR[r] += s.itemR[r];
  for (const r in s.fishR) tot.fishR[r] = (tot.fishR[r] || 0) + s.fishR[r];
}
const T = tot;
console.log(`== v0.9 C 钓获模拟：${ROUNDS} 轮 × ${CASTS} 杆 = ${T.casts} 杆（新存档，无幸运饵；鱼潮 12% / 完美抛竿 35%）==`);
console.log(`参数：ITEM_CATCH_P=${items.ITEM_CATCH_P}  ITEM_MOUTH_P=${items.ITEM_MOUTH_P}  道具稀有度权重=${items.ITEM_RARITY_ORDER.map((r) => r + ':' + items.ITEM_RARITY[r].w).join(' ')}  ITEM_LUCK_K=${items.ITEM_LUCK_K}`);
console.log(`道具：${T.item} 个 = ${pct(T.item, T.casts)} / 杆（平均 ${(T.casts / Math.max(1, T.item)).toFixed(1)} 杆 1 个；钓上 ${T.itemCast} + 鱼嘴 ${T.itemMouth}）`);
console.log(`道具稀有度：${Object.entries(T.itemR).map(([r, n]) => `${r} ${n}（${pct(n, T.item)}）`).join(' · ')}`);
console.log(`合成鱼回流：${T.synth} 条 = ${pct(T.synth, T.casts)} / 杆（其中自己放生游回 ${T.synthOwn}）`);
console.log(`天然鱼：${T.fish} 条；稀有度 ${RARITY_ORDER.map((r) => `${r} ${pct(T.fishR[r] || 0, T.fish)}`).join(' · ')}`);
console.log(`天然鱼带派对基因部件/材质：${T.gx}，带 UGC 装饰：${T.deco}（应为 0）；带天然稀有色变 traits：${pct(T.wildTraits, T.fish)}`);
console.log(`最后一轮图鉴：${last.codex.got}/${last.codex.all} 种（合成鱼单列 ${last.codex.synth} 条，不计入）`);
