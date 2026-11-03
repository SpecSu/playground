// genes_stub.js —— 阶段 1 B 用的「基因引擎」简易替身（按 DESIGN §4.1 契约同名导出）
// TODO(D): 阶段 2 换成 A 的 ./genes.js（接口一致，直接改 import 即可）
// 说明：stub 除了写 v.gx（交给 Fish 渲染）外，还会同步改 hue/traits/cm 等「现有 Fish 已能渲染」的字段，保证改造前后肉眼可见。
import { SPECIES, SPECIES_BY_ID, CREATORS, RARITY_ORDER, makeVariant } from './fishes.js';
import { newSeed, rng, ugcFromSeed } from './ugc.js';

const ME = '@我';   // 调用方（meta.js）会统一改写为 '@' + ROOM[0].name
export const GENE_TAGS = [
  { id: 'wings', label: '翅膀', emoji: '🪽', kw: ['翅膀', '翼', '飞', 'wing'] },
  { id: 'jelly', label: '果冻', emoji: '🍮', kw: ['果冻', '透明', 'jelly'] },
  { id: 'flame', label: '火焰', emoji: '🔥', kw: ['火焰', '火', '燃', 'fire', 'flame'] },
  { id: 'mech', label: '机械', emoji: '⚙️', kw: ['机械', '机器', '齿轮', 'robot', 'mech'] },
  { id: 'candy', label: '糖果', emoji: '🍬', kw: ['糖果', '糖', '甜', 'candy'] },
  { id: 'galaxy', label: '宇宙', emoji: '🌌', kw: ['宇宙', '星空', '银河', 'galaxy', 'space'] },
  { id: 'cat', label: '猫耳', emoji: '🐱', kw: ['猫', 'cat'] },
  { id: 'horn', label: '独角', emoji: '🦄', kw: ['独角', '角', 'horn', 'unicorn'] },
  { id: 'big', label: '巨大', emoji: '🐳', kw: ['巨大', '超大', '大', 'big', 'huge'] },
  { id: 'glow', label: '发光', emoji: '💡', kw: ['发光', '夜光', '荧光', 'glow'] },
  { id: 'plush', label: '毛绒', emoji: '🧸', kw: ['毛绒', '毛茸茸', '绒', 'plush'] },
  { id: 'crystal', label: '水晶', emoji: '💎', kw: ['水晶', '钻石', 'crystal'] },
  { id: 'rainbow', label: '彩虹', emoji: '🌈', kw: ['彩虹', 'rainbow'] },
  { id: 'eyes', label: '三只眼', emoji: '👀', kw: ['三眼', '多眼', '眼睛', 'eye'] },
  { id: 'gold', label: '黄金', emoji: '👑', kw: ['黄金', '金色', '金', 'gold'] },
  { id: 'party', label: '派对', emoji: '🎉', kw: ['派对', '蜡烛', '生日', 'party'] },
];
const EFFECT = {
  wings: { change: '长出翅膀', gx: { extras: ['wings'] }, name: '翅膀' },
  jelly: { change: '变成果冻身体', gx: { mat: 'jelly' }, trait: 'jelly', name: '果冻' },
  flame: { change: '背上燃起火焰', gx: { extras: ['flame'], palette: ['#ff4d2e', '#ff9a2e', '#ffd23f'], glow: 0.4 }, hue: 0.02, trait: 'glow', name: '火焰' },
  mech: { change: '装上螺旋桨和齿轮', gx: { mat: 'chrome', extras: ['propeller', 'gear'] }, name: '机械' },
  candy: { change: '糖果色外壳', gx: { mat: 'candy', palette: ['#ff8fc8', '#8fe9ff', '#fff07a'] }, trait: 'pastel', name: '糖果' },
  galaxy: { change: '身上装进一片星空', gx: { mat: 'galaxy', glow: 0.3 }, hue: 0.62, name: '星空' },
  cat: { change: '长出猫耳和胡须', gx: { extras: ['catEars', 'whiskers'] }, name: '猫耳' },
  horn: { change: '头上长出独角', gx: { extras: ['horn'] }, name: '独角' },
  big: { change: '体型变大', gx: { scaleK: 1.5 }, cmK: 1.5, name: '大块头' },
  glow: { change: '会在黑暗里发光', gx: { glow: 0.8 }, trait: 'glow', name: '发光' },
  plush: { change: '变得毛茸茸', gx: { mat: 'plush' }, trait: 'pastel', name: '毛绒' },
  crystal: { change: '背上长出水晶刺', gx: { mat: 'crystal', extras: ['crystalSpikes'] }, name: '水晶' },
  rainbow: { change: '彩虹镭射配色', gx: { mat: 'holo' }, trait: 'rainbow', name: '彩虹' },
  eyes: { change: '多长了一只眼睛', gx: { eyes: 3 }, name: '三眼' },
  gold: { change: '全身镀金', gx: { mat: 'gold' }, trait: 'gold', name: '黄金' },
  party: { change: '头顶插上生日蜡烛', gx: { extras: ['candles'] }, name: '派对' },
};
const FUN = ['wings', 'flame', 'cat', 'horn', 'eyes', 'party', 'jelly', 'glow'];

const clone = (o) => JSON.parse(JSON.stringify(o));
const rarOf = (v) => v.rarity || SPECIES_BY_ID[v.sp]?.rarity || 'common';
const baseGx = () => ({ scale: 1, stretch: [1, 1, 1], eyes: 2, eyeK: 1, mat: null, glow: 0, palette: null, pattern: null, extras: [], parts: { tail: null, fins: null, head: null } });
const newId = () => newSeed().toString(36) + Date.now().toString(36).slice(-4);

export function rollMutation(r = Math.random, luckBoost = 0) {
  const x = r();
  if (x < 0.005 * (1 + luckBoost)) return 'giant+rare';
  if (x < 0.065 * (1 + luckBoost)) return 'rare';
  if (x < 0.145 * (1 + luckBoost)) return 'giant';
  return null;
}

function applyMutation(v, mut, r, changes) {
  if (!mut) return;
  if (mut.includes('giant')) {
    const k = 1.8 + r() * 0.7; v.cm = Math.round(v.cm * k * 10) / 10; v.gx.scale = Math.min(2.5, (v.gx.scale || 1) * k);
    if (!v.nick.startsWith('巨型')) v.nick = '巨型' + v.nick;
    changes.push(`⚠️ 巨大化突变 ×${k.toFixed(1)}`);
  }
  if (mut.includes('rare')) {
    const m = ['holo', 'galaxy', 'gold', 'crystal'][(r() * 4) | 0]; v.gx.mat = m; v.gx.glow = Math.max(v.gx.glow, 0.6);
    v.rarity = r() < 0.4 ? 'legendary' : 'epic';
    if (!v.traits.includes(m === 'gold' ? 'gold' : 'rainbow')) v.traits.push(m === 'gold' ? 'gold' : 'rainbow');
    changes.push(`⚠️ 珍稀突变：${{ holo: '镭射', galaxy: '星空', gold: '黄金', crystal: '水晶' }[m]}材质`);
  }
  v.mut = mut;
}

function addTrait(v, t) { if (t && !v.traits.includes(t)) { v.traits.push(t); if (v.traits.length > 3) v.traits.shift(); } }

export async function imageHints(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 48, 48);
    const d = g.getImageData(0, 0, 48, 48).data; const bins = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
      const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; bins.set(k, b);
    }
    const top = [...bins.values()].sort((a, b) => b.n - a.n);
    const hex = (b) => '#' + [b.r, b.g, b.b].map((x) => Math.round(x / b.n).toString(16).padStart(2, '0')).join('');
    const out = [];
    for (const b of top) { const h = hex(b); if (!out.some((o) => dist(o, h) < 60)) out.push(h); if (out.length === 3) break; }
    while (out.length < 3) out.push(out[0] || '#ff5fa2');
    return { palette: out };
  } finally { URL.revokeObjectURL(url); }
}
function dist(a, b) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
function hueOfHex(h) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return 0; const d = mx - mn; let hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return hh / 6; }

function child(v, seed) {
  const n = clone(v);
  n.id = newId(); n.uid = n.id; n.seed = seed >>> 0;
  n.gx = Object.assign(baseGx(), clone(v.gx || {}));
  n.gen = (v.gen || 0) + 1; n.creator = ME; n.parents = [v.uid || v.id]; n.mut = null; n.fromOcean = null;
  n.history = (v.history || []).slice(-6);
  n.traits = (v.traits || []).slice();
  return n;
}

export function designFromPrompt(v, { prompt = '', palette = null } = {}, seed = newSeed()) {
  const r = rng(seed); const n = child(v, seed); const changes = [];
  const p = String(prompt).toLowerCase();
  let hits = GENE_TAGS.filter((t) => t.kw.some((k) => p.includes(k)));
  if (!hits.length && !palette) { const a = FUN[(r() * FUN.length) | 0]; let b = FUN[(r() * FUN.length) | 0]; if (b === a) b = FUN[(FUN.indexOf(a) + 3) % FUN.length]; hits = [a, b].map((id) => GENE_TAGS.find((t) => t.id === id)); changes.push('🧬 基因自己有了想法'); }
  const names = [];
  for (const t of hits) {
    const e = EFFECT[t.id]; if (!e) continue;
    changes.push(`${t.emoji} ${e.change}`); names.push(e.name);
    const g = e.gx;
    if (g.extras) n.gx.extras = [...new Set([...n.gx.extras, ...g.extras])];
    if (g.mat) n.gx.mat = g.mat;
    if (g.palette) n.gx.palette = g.palette;
    if (g.glow) n.gx.glow = Math.max(n.gx.glow, g.glow);
    if (g.eyes) n.gx.eyes = g.eyes;
    if (g.scaleK) n.gx.scale = Math.min(1.8, n.gx.scale * g.scaleK);
    if (e.cmK) n.cm = Math.round(n.cm * e.cmK * 10) / 10;
    if (e.hue != null) n.hue = e.hue - 0.0;
    addTrait(n, e.trait);
  }
  if (palette) { n.gx.palette = palette.slice(0, 3); n.hue = hueOfHex(palette[0]) - 0.05; n.sat = 1.2; changes.push('🎨 颜色来自你的图片'); }
  n.cm = Math.round(n.cm * (0.9 + r() * 0.4) * 10) / 10;
  if (r() < 0.3) { const i = RARITY_ORDER.indexOf(rarOf(n)); if (i < 4) { n.rarity = RARITY_ORDER[i + 1]; changes.push('⬆️ 稀有度提升'); } }
  const sp = SPECIES_BY_ID[n.sp];
  n.nick = `${names.slice(0, 2).join('') || '变异'}${sp.name}`;
  n.ugc = ugcFromSeed(seed, n.sp); n.title = n.ugc.title;
  const mut = rollMutation(r); applyMutation(n, mut, r, changes);
  n.history.push({ t: Date.now(), type: 'prompt', prompt: String(prompt).slice(0, 60), image: palette || undefined, from: v.uid || v.id });
  return { v: n, changes, mut };
}

export function fuseFish(a, b, seed = newSeed()) {
  const r = rng(seed);
  const base = r() < 0.5 ? a : b, other = base === a ? b : a;
  const n = child(base, seed); n.parents = [a.uid || a.id, b.uid || b.id];
  const ga = Object.assign(baseGx(), a.gx || {}), gb = Object.assign(baseGx(), b.gx || {});
  const fromA = [], fromB = [];
  const tag = (x) => (x === base ? fromA : fromB);
  tag(base).push(`${SPECIES_BY_ID[base.sp].name}的身体`);
  n.gx.parts = { tail: other.sp, fins: r() < 0.5 ? other.sp : null, head: null }; tag(other).push(`${SPECIES_BY_ID[other.sp].name}的尾巴`);
  n.gx.extras = [...new Set([...(ga.extras || []), ...(gb.extras || [])])].slice(0, 4);
  if (ga.extras?.length) fromA.push('附加部件'); if (gb.extras?.length) fromB.push('附加部件');
  const colorFrom = r() < 0.5 ? a : b; n.hue = colorFrom.hue; n.sat = colorFrom.sat; n.gx.palette = (colorFrom.gx && colorFrom.gx.palette) || null; tag(colorFrom === a ? a : b).push('配色');
  n.gx.mat = ga.mat || gb.mat; n.gx.glow = Math.max(ga.glow || 0, gb.glow || 0);
  n.traits = [...new Set([...(a.traits || []), ...(b.traits || [])])].slice(0, 3);
  if (a.traits?.length) fromA.push(a.traits[0]); if (b.traits?.length) fromB.push(b.traits[0]);
  n.cm = Math.round(((a.cm + b.cm) / 2) * (0.95 + r() * 0.35) * 10) / 10;
  const ri = Math.max(RARITY_ORDER.indexOf(rarOf(a)), RARITY_ORDER.indexOf(rarOf(b)));
  n.rarity = RARITY_ORDER[Math.min(4, ri + (r() < 0.35 ? 1 : 0))];
  n.nick = `${SPECIES_BY_ID[other.sp].name.slice(0, 2)}${SPECIES_BY_ID[base.sp].name}`;
  n.ugc = ugcFromSeed(seed, n.sp); n.title = n.ugc.title;
  const changes = [];
  const mut = rollMutation(r, 0.3); applyMutation(n, mut, r, changes);
  n.history.push({ t: Date.now(), type: 'fuse', from: n.parents.join('+') });
  return { v: n, fromA, fromB, mut, changes };
}

export function releaseValue(v) {
  const base = { common: 20, uncommon: 40, rare: 80, epic: 160, legendary: 320 }[rarOf(v)] || 20;
  const sp = SPECIES_BY_ID[v.sp];
  const sizeK = Math.max(0.6, Math.min(2.5, (v.cm || sp?.cm || 20) / (sp?.cm || 20)));
  return Math.round(base * sizeK * (1 + 0.3 * (v.gen || 0)) * (v.mut ? 2 : 1));
}

const LBL = { wings: '🪽翅膀', flame: '🔥火焰', propeller: '🚁螺旋桨', gear: '⚙️齿轮', catEars: '🐱猫耳', whiskers: '〰️胡须', horn: '🦄独角', crystalSpikes: '💎水晶刺', candles: '🕯️蜡烛' };
const MAT = { jelly: '🍮果冻', candy: '🍬糖果', chrome: '🪞金属', plush: '🧸毛绒', crystal: '💎水晶', galaxy: '🌌星空', gold: '👑黄金', holo: '🌈镭射', lava: '🌋熔岩' };
export function geneSummary(v) {
  const g = v.gx || {}; const out = [];
  for (const e of g.extras || []) out.push(LBL[e] || e);
  if (g.mat) out.push(MAT[g.mat] || g.mat);
  if (g.eyes > 2) out.push(`👀${g.eyes}只眼`);
  if (g.glow >= 0.5) out.push('💡发光');
  if (g.palette) out.push('🎨定制配色');
  if (g.parts?.tail) out.push(`🧬${SPECIES_BY_ID[g.parts.tail]?.name || ''}尾巴`);
  if (v.mut) out.push(v.mut.includes('rare') ? '✨珍稀变异' : '🐳巨大化');
  return out;
}

export function oceanCatch(seed = newSeed()) {
  const r = rng(seed);
  const pool = SPECIES.filter((s) => s.rarity !== 'legendary' || r() < 0.3);
  const sp = pool[(r() * pool.length) | 0];
  const v = makeVariant(sp);
  const ids = Object.keys(EFFECT).filter((k) => k !== 'big');
  const n = 1 + ((r() * 3) | 0); const picked = [];
  while (picked.length < n) { const k = ids[(r() * ids.length) | 0]; if (!picked.includes(k)) picked.push(k); }
  const prompt = picked.map((k) => GENE_TAGS.find((t) => t.id === k).label).join('');
  const res = designFromPrompt(v, { prompt }, seed ^ 0x5bd1);
  const nv = res.v;
  nv.creator = CREATORS[(r() * CREATORS.length) | 0];
  nv.fromOcean = { by: nv.creator };
  nv.gen = 1 + ((r() * 3) | 0);
  return nv;
}
