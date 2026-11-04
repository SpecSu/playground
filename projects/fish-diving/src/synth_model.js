// v0.9.1 A：合成物种 —— 「美的流形」上的形态融合（重构版）
// 反思：旧版把「不可预测」做成了部件随机拼接 + 狂野突变（针嘴、多眼、对称破缺、器物插件）→ 畸形低模拼装。
// 新方案：
//   ① 身体 = 亲本（天然物种主躯干侧视轮廓，取自 marine.js 同一套采样）在采样点上加权插值 → 再过「审美约束」
//      （体高比安全区、尾柄收束、头部圆润封顶、三遍平滑）→ 永远连续、光滑、比例协调，一眼看得出血统
//   ② 鳍 = 审美校准过的观赏鱼鳍型库（扇形背鳍 / 帆鳍 / 镰月 / 羽状棘鳍 / 飘纱；叉尾 / 新月 / 燕尾 / 琴尾 / 半月裙尾 / 斗鱼裙尾），
//      鳍根贴合背/腹轮廓长出来，薄膜 + 放射鳍条 + 根→梢渐变半透明；左右严格对称
//   ③ 华丽度 lux 1~4（= 稀有度）：鳍更长更飘、延长鳍丝、波纹鳍缘、珠光/金属鳞缘、发光鳍缘与流光
//   ④ 花纹 = 精致图案 shader（渐变 / 龙鳞 / 锦鲤斑 / 大理石 / 水墨 / 星点 / 环带 / 礼服 / 青花 / 冰裂 / 回纹 …）
// 鼻尖 +x、背 +y（与 marine.js 一致）；身体长 1.4，归一化后最长水平维度 1.6（Fish 类再缩到 1m）
import * as THREE from 'three';
import { Sculpture, marineBlueprint } from './marine.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const WHITE = new THREE.Color('#ffffff');
const HEX = /^#[0-9a-f]{6}$/i;
const hexOk = (c, d) => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : d);
const mixc = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const _h = { h: 0, s: 0, l: 0 };
// 注意：HSL 必须在 sRGB 空间算（THREE 默认在线性空间 → 暗色被误判为高饱和、明度阈值整体偏白 = 旧版「发灰发粉」的根因）
const hslOf = (c) => { new THREE.Color(c).getHSL(_h, THREE.SRGBColorSpace); return [_h.h, _h.s, _h.l]; };
const fromHsl = (h, s, l) => '#' + new THREE.Color().setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1), THREE.SRGBColorSpace).getHexString();
// HSL 短弧插值（色相走近路，饱和度不塌）
function hslArc(a, b, t) { const [h1, s1, l1] = hslOf(a), [h2, s2, l2] = hslOf(b); let d = h2 - h1; d -= Math.round(d); const h = s1 < 0.1 ? h2 : s2 < 0.1 ? h1 : h1 + d * t; return fromHsl(h, Math.max(lerp(s1, s2, t), Math.min(s1, s2)), lerp(l1, l2, t)); }
function hashStr(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }

// ---------------- 词表 ----------------
export const FIN_KINDS = {
  dor: ['soft', 'sickle', 'sail', 'crest', 'fan', 'plume', 'veil'],
  tail: ['fork', 'lunate', 'round', 'swallow', 'lyre', 'delta', 'veil'],
  pect: ['std', 'fan', 'long', 'bow'],
  pelv: ['std', 'fil'],
};
const KSET = Object.fromEntries(Object.entries(FIN_KINDS).map(([k, a]) => [k, new Set(a)]));
// 背鳍 → 臀鳍（上下呼应：神仙鱼 / 斗鱼式的对称美）
export const ANAL_OF = { soft: 'soft', sickle: 'sickle', sail: 'crest', crest: 'crest', fan: 'fan', plume: 'soft', veil: 'veil' };
export const PAT_IDS = { none: 0, grad: 1, scale: 2, koi: 3, marble: 4, cloud: 5, stars: 6, bands: 7, tux: 8, porcelain: 9, crackle: 10, fret: 11, ocelli: 12, neon: 13, leopard: 14, sunset: 15, pearlline: 16, mesh: 17, speckle: 18, spots: 19 };
// 器物质感（身体）：fishmat 见 userData.synPBR 时保留这些 PBR 参数
export const MATS = {
  wet: { metal: 0.12, rough: 0.38, coat: 0.75, coatR: 0.25 },
  satin: { metal: 0.04, rough: 0.42, coat: 0.45, coatR: 0.3, sheen: 0.35 },
  glaze: { metal: 0.02, rough: 0.24, coat: 1, coatR: 0.05 },
  ceramic: { metal: 0, rough: 0.16, coat: 1, coatR: 0.03 },
  metal: { metal: 0.7, rough: 0.22, coat: 0.8, coatR: 0.06 },
  brass: { metal: 0.66, rough: 0.24, coat: 0.8, coatR: 0.08, irid: 0.3 },
  gold: { metal: 0.68, rough: 0.2, coat: 0.95, coatR: 0.05, irid: 0.4 },
  pearl: { metal: 0.1, rough: 0.24, coat: 0.95, coatR: 0.08, irid: 1, sheen: 0.45 },
  glow: { metal: 0.04, rough: 0.3, coat: 0.85, coatR: 0.1 },
  crystal: { metal: 0.06, rough: 0.12, coat: 1, coatR: 0.04, irid: 0.8 },
};
const SKINS = {
  wet: { type: 0, den: 44, bump: 0.4 }, satin: { type: 1, den: 30, bump: 0.08 }, glaze: { type: 1, den: 20, bump: 0.04 },
  ceramic: { type: 1, den: 10, bump: 0.02 }, metal: { type: 0, den: 40, bump: 0.16 }, brass: { type: 0, den: 40, bump: 0.16 },
  gold: { type: 0, den: 42, bump: 0.2 }, pearl: { type: 0, den: 46, bump: 0.14 }, glow: { type: 1, den: 20, bump: 0.08 }, crystal: { type: 1, den: 12, bump: 0.04 },
};
// 天然物种 → 用作身体蓝本的「鱼形」物种（非鱼形生物取气质相近的鱼形轮廓）
export const BODY_PROXY = {
  squid: 'mackerel', cuttlefish: 'parrotfish', 'snow-crab': 'sea-bream', octopus: 'parrotfish', lobster: 'coelacanth', 'king-crab': 'giant-grouper',
  'manta-ray': 'sea-bream', flounder: 'sea-bream', starfish: 'butterflyfish', seahorse: 'lionfish', jellyfish: 'butterflyfish', 'mantis-shrimp': 'parrotfish',
  'sea-turtle': 'giant-grouper', bottle: 'salmon', duck: 'pufferfish', chest: 'giant-grouper',
};
export const proxyOf = (sp) => BODY_PROXY[sp] || sp;

export const G_DEFAULT = {
  v: 2, base: [['salmon', 1]], len: 1, ht: 1, eyeK: 1,
  dor: { k: 'soft', h: 1 }, anal: { k: 'soft', h: 1 }, tail: { k: 'fork', s: 1 }, pect: { k: 'std', s: 1 }, pelv: { k: 'std', s: 1 },
  pal: ['#547f87', '#f1e3d8', '#d9a35b', '#6f97a0', '#e9f2f4'], pat: { k: 'grad', d: 3, a: 0.75 }, mat: 'wet',
  irid: 0.3, glow: 0, finA: null, lux: null, fil: 0, scal: 0, scl: 0, mood: 'calm',
};

// ---------------- 旧存档（v1 基因组）→ v2 重映射：不崩、并渲染成新方案下的好看鱼 ----------------
const OLD_DOR = { shark: 'sickle', sail: 'sail', spiny: 'plume', crest: 'crest', ribbon: 'veil', fan: 'fan', finlet: 'sickle', lid: 'sail', canopy: 'sail', cap: 'soft', handle: 'crest', key: 'crest', gear: 'crest', quill: 'plume', wedge: 'sickle', saw: 'plume', crystal: 'fan', none: 'soft' };
const OLD_TAIL = { fork: 'fork', lunate: 'lunate', round: 'round', fan: 'round', swallow: 'swallow', shark: 'lunate', fluke: 'lunate', whip: 'veil', lobe: 'round', stiletto: 'swallow', ribbon: 'veil', paddle: 'round', hook: 'lyre', ring: 'delta', shears: 'swallow', feather: 'veil', anchor: 'lyre', curl: 'veil', leaf: 'round', rocket: 'fork', none: 'round' };
const OLD_PECT = { std: 'std', long: 'long', wing: 'long', fan: 'fan', frill: 'fan', leg: 'std', paddle: 'fan', bow: 'bow', none: 'std' };
const OLD_PAT = { bars: 'bands', lines: 'neon', spots: 'spots', freckle: 'speckle', mottle: 'cloud', grad: 'grad', tiger: 'bands', stars: 'stars', scale: 'scale', stripe: 'bands', marble: 'marble', galaxy: 'stars', tux: 'tux', ring: 'bands', ocelli: 'ocelli', geo: 'mesh', melon: 'bands', lateral: 'neon', sprinkle: 'speckle', dial: 'ocelli', sunburst: 'sunset', waffle: 'mesh', none: 'grad' };
const OLD_MAT = { matte: 'satin', paper: 'satin' };
const OLD_PLAN = { fusiform: 'salmon', deep: 'sea-bream', globe: 'pufferfish', eel: 'moray-eel', flat: 'sea-bream', box: 'giant-grouper', seg: 'mackerel', disc: 'butterflyfish', hourglass: 'parrotfish', diamond: 'butterflyfish' };
function remapV1(g) {
  const anc = g.anc && typeof g.anc === 'object' ? g.anc : {};
  const top = Object.entries(anc).filter(([k, w]) => marineBlueprint(proxyOf(k)) && +w > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const base = top.length ? top.map(([k, w]) => [proxyOf(k), +w]) : [[OLD_PLAN[g.plan] || 'salmon', 1]];
  const pal = Array.isArray(g.pal) ? g.pal : [];
  const dk = OLD_DOR[g.dor?.k] || 'soft';
  return {
    v: 2, base, anc, len: 1, ht: 1, eyeK: 1,
    dor: { k: dk, h: 1 }, anal: { k: ANAL_OF[dk], h: 1 }, tail: { k: OLD_TAIL[g.tail?.k] || 'fork', s: 1 }, pect: { k: OLD_PECT[g.pect?.k] || 'std', s: 1 }, pelv: { k: 'std', s: 1 },
    pal: harmonizePal([pal[0], pal[1], pal[2], pal[3]]),
    pat: { k: OLD_PAT[g.pat?.k] || 'grad', d: 3, a: 0.8 }, mat: OLD_MAT[g.mat] || (MATS[g.mat] ? g.mat : 'wet'),
    irid: clamp(+g.irid || 0.3, 0, 1), glow: clamp(+g.glow || 0, 0, 0.8), lux: null, item: g.item || null, tags: Array.isArray(g.tags) ? g.tags : [],
  };
}
// 调色板和谐化：饱和度 / 明度落在安全区，点缀色只允许 类比(≤0.09) / 三角(≈0.33) / 互补(≈0.5) 关系；腹色永远更亮
export function harmonizePal(p) {
  const back = hexOk(p[0], G_DEFAULT.pal[0]);
  let [hb, sb, lb] = hslOf(back);
  // 配色约束：要么「饱和体色」（sat≥0.42），要么「素体 + 艳鳍」（白瓷/银/珍珠体 → 点缀色必须鲜明，鳍染点缀色）
  // 灰调只允许「白瓷/珍珠白」(亮) 或「礼服墨黑」(暗)；中间的灰 → 染上点缀色相，避免脏灰
  let neutral = sb < 0.2;
  if (neutral && lb > 0.3 && lb < 0.74) { const [ha0, sa0] = hslOf(hexOk(p[2], back)); if (sa0 > 0.2) { hb = ha0; sb = 0.3; neutral = false; } }
  // 珍珠白 / 白瓷：很亮的浅色 → 当作中性素体（饱和度压低成「带一丝色相的珠白」），不当作粉彩
  if (!neutral && lb > 0.76 && sb < 0.75) { neutral = true; sb = Math.min(sb, 0.22); lb = Math.max(lb, 0.84); }
  if (!neutral) sb = clamp(sb, 0.55, 0.9);
  lb = clamp(lb, neutral ? 0.1 : 0.28, neutral ? 0.94 : 0.54);   // 宝石色：主色不许发白发粉（粉彩 = 廉价）
  // 去脏：暖黄区低明度 = 土褐 → 提亮成金；黄绿区低饱和 = 脏绿 → 提纯成翠
  if (!neutral && hb > 0.04 && hb < 0.17 && lb < 0.5) { lb = 0.5; sb = Math.max(sb, 0.72); }
  // 柠檬黄 = 廉价 → 推向万寿菊金（更暖、更深、更像鎏金）
  if (!neutral && hb >= 0.115 && hb < 0.17) { hb = lerp(hb, 0.105, 0.6); sb = Math.max(sb, 0.82); lb = Math.min(lb, 0.5); }
  if (!neutral && hb >= 0.17 && hb < 0.36) { sb = Math.max(sb, 0.58); if (hb < 0.26) hb = lerp(hb, 0.36, 0.5); }
  const b0 = fromHsl(hb, sb, lb);
  const belly = hexOk(p[1], fromHsl(hb + 0.02, sb * 0.35, 0.9));
  let [hy, sy, ly] = hslOf(belly);
  // 腹色：比背亮但保持同族色相与饱和度（参照鲯鳅 青背金腹），避免整条鱼被奶白腹色洗淡
  if (!neutral) { hy = hb + clamp(((hy - hb + 1.5) % 1) - 0.5, -0.06, 0.06); sy = Math.max(sy, sb * 0.7); }
  ly = neutral ? clamp(ly, Math.min(0.94, lb + 0.04), 0.95) : clamp(ly, lb + 0.1, Math.min(0.8, lb + 0.28)); sy = Math.min(sy, 0.85);
  let acc = hexOk(p[2], fromHsl(hb + 0.5, 0.6, 0.55));
  let [ha, sa, la] = hslOf(acc);
  if (sa > 0.15 && sb > 0.15 && !neutral) {
    const d = ((ha - hb) % 1 + 1) % 1, dd = Math.min(d, 1 - d), sgn = d <= 0.5 ? 1 : -1;
    const ok = [0.05, 0.33, 0.5].reduce((best, t) => (Math.abs(dd - t) < Math.abs(dd - best) ? t : best), 0.05);
    if (Math.abs(dd - ok) > 0.035 && dd > 0.09) ha = hb + sgn * ok;
  }
  if (neutral) { sa = Math.max(sa, 0.62); la = clamp(la, 0.38, 0.62); }
  sa = clamp(sa, 0.35, 0.88); la = clamp(la, 0.24, 0.8);
  // 点缀色与体色明度拉开（对比度）
  if (Math.abs(la - lb) < 0.14) la = clamp(lb > 0.5 ? lb - 0.2 : lb + 0.2, 0.24, 0.8);
  acc = fromHsl(ha, sa, la);
  // 鳍色：与体色同族但偏向点缀色，饱和度不低于体色（鳍是华丽感的主要载体）
  let fin = neutral ? mixc(hexOk(p[3], acc), acc, 0.45) : hexOk(p[3], b0);   // 非素体：鳍保持自身色相（RGB 混点缀色会混出橄榄 / 柠檬绿）
  { const [hf, sf, lf] = hslOf(fin); fin = fromHsl(hf, clamp(Math.max(sf, neutral ? 0.6 : sb * 0.95, 0.55), 0, 0.92), clamp(lf, 0.32, 0.62)); }
  const edge = hexOk(p[4], fromHsl(ha, sa * 0.6, Math.max(0.78, la)));
  return [b0, fromHsl(hy, sy, ly), acc, fin, edge];
}
const numIn = (x, a, b, d) => (Number.isFinite(+x) ? clamp(+x, a, b) : d);
const finIn = (o, kind, d) => { o = o && typeof o === 'object' ? o : {}; return { ...o, k: KSET[kind].has(o.k) ? o.k : d, h: numIn(o.h, 0.7, 1.6, 1), s: numIn(o.s, 0.7, 1.6, 1) }; };
export function normGenome(g) {
  g = g && typeof g === 'object' ? g : {};
  if (g.v !== 2) g = remapV1(g);
  const o = { ...G_DEFAULT, ...g };
  let base = Array.isArray(g.base) ? g.base.filter((b) => Array.isArray(b) && typeof b[0] === 'string' && +b[1] > 0).slice(0, 3) : [];
  base = base.map(([sp, w]) => [proxyOf(sp), +w]).filter(([sp]) => marineBlueprint(sp));
  if (!base.length) base = [['salmon', 1]];
  const ws = base.reduce((s, b) => s + b[1], 0);
  o.base = base.map(([sp, w]) => [sp, Math.round((w / ws) * 1000) / 1000]);
  o.dor = finIn(g.dor, 'dor', 'soft');
  o.anal = finIn(g.anal, 'dor', ANAL_OF[o.dor.k]);
  o.tail = finIn(g.tail, 'tail', 'fork');
  o.pect = finIn(g.pect, 'pect', 'std');
  o.pelv = finIn(g.pelv, 'pelv', 'std');
  const pal = Array.isArray(g.pal) ? g.pal : [];
  o.pal = [0, 1, 2, 3, 4].map((i) => hexOk(pal[i], G_DEFAULT.pal[i]));
  const pt = g.pat && typeof g.pat === 'object' ? g.pat : {};
  o.pat = { k: PAT_IDS[pt.k] != null ? pt.k : 'grad', d: numIn(pt.d, 1, 8, 3), a: numIn(pt.a, 0, 1, 0.75) };
  o.mat = MATS[g.mat] ? g.mat : OLD_MAT[g.mat] || 'wet';
  o.len = numIn(g.len, 0.85, 1.2, 1); o.ht = numIn(g.ht, 0.85, 1.2, 1); o.eyeK = numIn(g.eyeK, 0.8, 1.3, 1);
  o.irid = numIn(g.irid, 0, 1, 0.3); o.glow = numIn(g.glow, 0, 1, 0);
  o.finA = g.finA == null ? null : numIn(g.finA, 0.62, 1, 0.8);
  o.lux = g.lux == null ? null : Math.round(numIn(g.lux, 1, 4, 1));
  o.fil = g.fil ? 1 : 0; o.scal = g.scal ? 1 : 0; o.scl = numIn(g.scl, 0, 1, 0);
  o.anc = g.anc && typeof g.anc === 'object' ? g.anc : {};
  o.app = []; o.wild = [];
  o.tags = Array.isArray(g.tags) ? g.tags.slice(0, 4) : [];
  return o;
}

// ---------------- 形态融合：亲本轮廓插值 + 审美约束 ----------------
const KS = 97;
const BL = 1.4;    // 身体长度（雕塑坐标）
function sampleBP(bp, u) {
  const U = bp.u; let i = 1;
  while (i < U.length - 1 && U[i] < u) i++;
  const t = clamp((u - U[i - 1]) / Math.max(U[i] - U[i - 1], 1e-6), 0, 1);
  return [lerp(bp.h[i - 1], bp.h[i], t), lerp(bp.w[i - 1], bp.w[i], t)];
}
export function morphProfile(g) {
  const U = [], H = new Float64Array(KS), W = new Float64Array(KS);
  for (let i = 0; i < KS; i++) U.push(i / (KS - 1));
  for (const [sp, w] of g.base) {
    const bp = marineBlueprint(sp) || marineBlueprint('salmon');
    for (let i = 0; i < KS; i++) { const [h, wd] = sampleBP(bp, U[i]); H[i] += h * w; W[i] += wd * w; }
  }
  // 宽高比（截面）先算好，再统一约束高度
  const R = new Float64Array(KS);
  for (let i = 0; i < KS; i++) R[i] = W[i] / Math.max(H[i], 1e-4);
  const kH = g.ht / g.len;
  for (let i = 0; i < KS; i++) H[i] *= kH;
  let mh = 0, pi = 0; for (let i = 0; i < KS; i++) if (H[i] > mh) { mh = H[i]; pi = i; }
  const rPk = clamp(R[pi], 0.2, 1.0), compressed = rPk < 0.5;
  const target = clamp(mh, 0.118, compressed ? 0.33 : 0.235);   // 圆截面体（河豚系）限高：杜绝「球身」
  for (let i = 0; i < KS; i++) H[i] *= target / mh;
  mh = target;
  for (let i = 0; i < KS; i++) {
    const u = U[i];
    // 尾柄：收束成优雅的细腰（上限）且不细成线（下限）
    if (u < 0.36) H[i] = Math.min(H[i], mh * (0.16 + 0.84 * Math.pow(sst(0, 0.36, u), 0.9)));
    if (u > 0.015 && u < 0.14) H[i] = Math.max(H[i], mh * 0.11);
    // 头部：圆润封顶（不准出现平头墙 / 针状细吻）
    if (u > 0.78) H[i] = Math.min(H[i], mh * Math.sqrt(Math.max(0, 1 - ((u - 0.78) / 0.226) ** 2)));
    if (u > 0.8 && u < 0.995) H[i] = Math.max(H[i], mh * 0.46 * Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2)));
    R[i] = clamp(R[i], 0.22, compressed ? 0.62 : 0.9);
  }
  for (let pass = 0; pass < 4; pass++) {
    const h0 = H.slice(), r0 = R.slice();
    for (let i = 1; i < KS - 1; i++) { H[i] = (h0[i - 1] + 2 * h0[i] + h0[i + 1]) / 4; R[i] = (r0[i - 1] + 2 * r0[i] + r0[i + 1]) / 4; }
  }
  H[0] = mh * 0.05; H[KS - 1] = mh * 0.06;
  for (let i = 0; i < KS; i++) W[i] = H[i] * R[i];
  return { U, H, W, mh, compressed, rPk };
}

// ---------------- 花纹 / 鳍膜 shader（身体 aSyn=(u, a, y/H)；鳍 aSyn=(根→梢 r, 角度, -1)） ----------------
const SYN_GLSL = /* glsl */`
uniform float uSHue, uSP, uSD, uSA, uSAsp, uSSeed, uSGlow, uSF, uSFA, uSEdge, uSLux, uSScl, uSTime, uSIri, uSGlit;
uniform vec3 uSC0, uSC1, uSC2, uSC3, uSC4, uSC5, uSGlowC;
varying vec3 vSyn;
float sH(vec2 p){ p = fract((p + uSSeed * 0.0137) * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 sH2(vec2 p){ float n = sH(p); return vec2(n, sH(p + n + 17.0)); }
float sN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sH(i), sH(i + vec2(1, 0)), f.x), mix(sH(i + vec2(0, 1)), sH(i + vec2(1, 1)), f.x), f.y); }
float sF(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * sN(p); p *= 2.03; a *= 0.5; } return s; }
vec2 sV(vec2 p){ vec2 c = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 o = sH2(c + g) * 0.8 + 0.1; float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2 - d1); }
float sA(float d, float w){ return smoothstep(w, -w, d); }
float sScale(vec2 q, float dens){
  vec2 p = vec2(q.x * dens * 1.5, q.y * dens * 1.15); float row = floor(p.y); p.x += mod(row, 2.0) * 0.5;
  vec2 f = fract(p); float e = length((f - vec2(1.0, 0.5)) * vec2(1.0, 1.1)); float w = fwidth(p.x) * 1.4 + 1e-3;
  return sA(abs(e - 0.62) - 0.05, w) * (1.0 - smoothstep(0.25, 0.6, w)); }
float synGlit = 0.0;
// 色相旋转（YIQ）：鳍膜沿径向的细微色相漂移 = 观赏鱼鳍的「虹彩渐变」
vec3 synHue(vec3 c, float a){
  const mat3 toY = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toR = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 y = toY * c; float cs = cos(a * 6.2831853), sn = sin(a * 6.2831853);
  y.yz = vec2(y.y * cs - y.z * sn, y.y * sn + y.z * cs);
  return max(toR * y, 0.0);
}
// 珠光虹彩色：以调色板点缀 / 鳍缘为主、掺一点克制的光谱色（不跳出配色）
vec3 synIri(float t){
  vec3 rb = 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
  vec3 pc = mix(uSC2, uSC4, 0.5 + 0.5 * sin(t * 6.2831853));
  return mix(pc, rb, 0.4);
}
vec4 synFin(vec3 base){
  float r = vSyn.x, an = vSyn.y;
  // 根部承接体色 → 中段饱和鳍色 → 外缘染点缀色 → 梢部珠光亮缘（观赏鱼鳍的多段渐变）
  vec3 c = mix(base, uSC3 * 1.08, smoothstep(0.05, 0.45, r) * 0.6);
  c = mix(c, uSC5, smoothstep(0.35, 0.92, r) * (0.45 + 0.1 * uSLux));   // uSC5 = 鳍色→点缀色的 HSL 短弧中点（不经过灰）
  // 华丽度签名：传说 = 双色晕染，神话 = 鳍膜彩虹渐变（色相沿根→梢旋转，且随时间极慢流动）
  c = synHue(c, (r - 0.35) * uSHue + step(3.5, uSLux) * uSHue * 0.12 * sin(uSTime * 0.35 + an * 3.0));
  c = mix(c, uSC4, smoothstep(0.78, 1.0, r) * uSEdge);
  // 细密放射鳍条：根部深、梢部变成珠光细线
  float ry = an * (11.0 + 3.0 * uSLux); float rw = fwidth(ry) * 1.6 + 1e-3;
  float ray = sA(abs(fract(ry) - 0.5) - 0.06, rw) * smoothstep(0.06, 0.25, r) * (1.0 - smoothstep(0.25, 0.6, rw));
  c = mix(c, mix(c * 0.6, mix(c, uSC4, 0.6) * 1.15, smoothstep(0.35, 0.95, r) * step(1.5, uSLux)), ray * 0.32);
  // 鳍膜上的细带（史诗+：两道随鳍条起伏的亮带，像斗鱼鳍的色环）
  float bd = smoothstep(0.07, 0.0, abs(r - 0.62 - 0.006 * sin(an * 9.0))) * 0.7 + smoothstep(0.05, 0.0, abs(r - 0.84)) * 0.5 * step(2.5, uSLux);
  c = mix(c, mix(c, uSC4, 0.7) * 1.05, bd * 0.32 * step(1.5, uSLux));
  float gl = smoothstep(0.78, 1.0, r) * uSGlow * (1.0 + 0.6 * step(3.5, uSLux));
  // 神话：鳍膜流光（从鳍根向鳍梢一波波推过去）
  gl += uSGlow * 0.9 * smoothstep(0.82, 1.0, sin(r * 9.0 - uSTime * 2.4 + an * 2.0) * 0.5 + 0.5) * smoothstep(0.15, 0.6, r) * step(3.5, uSLux);
  return vec4(c, gl);
}
vec4 synBody(vec3 base){
  float u = vSyn.x, a = vSyn.y, yn = vSyn.z;
  vec2 q = vec2(u * uSAsp, yn);
  float aw = max(fwidth(q.x), fwidth(q.y)) + 1e-4;
  int P = int(uSP + 0.5); float d = uSD, gl = 0.0, bk = 1.0;
  float inner = smoothstep(0.07, 0.15, u) * (1.0 - smoothstep(0.88, 0.95, u));
  vec3 c = base, dark = uSC0 * 0.38;
  if (P == 1) {            // 渐变：尾段晕染点缀色
    float t = smoothstep(0.72, 0.04, u + (sN(q * 1.5) - 0.5) * 0.1 - yn * 0.06);
    c = mix(c, uSC2, t * 0.9 * uSA); bk = 0.7;
  } else if (P == 2) {     // 龙鳞：错位鳞片 + 鳞缘金属描边
    float m = sScale(q, d * 1.5) * inner;
    c = mix(c, uSC4, m * uSA * 0.85); c = mix(c, uSC2, smoothstep(0.6, 0.0, u) * 0.35 * uSA); bk = 0.5;
  } else if (P == 3) {     // 锦鲤斑：大块有机色斑，腹部留白
    float n = sF(q * d * 0.32 + uSSeed * 3.1);
    float m = sA(0.53 - n, 0.012 + aw) * smoothstep(-0.6, -0.15, yn) * inner;
    c = mix(c, uSC2, m * uSA);
    float n2 = sF(q * d * 0.7 + 7.7 + uSSeed);
    c = mix(c, dark, sA(0.71 - n2, 0.01 + aw) * smoothstep(-0.2, 0.3, yn) * inner * 0.6 * uSA * step(2.5, uSLux)); bk = 0.0;
  } else if (P == 4) {     // 大理石：细脉 + 柔和云影
    float n = sF(q * d * 0.3 + uSSeed);
    float v = abs(sin((q.x * 0.55 + q.y * 1.4 + n * 5.0) * 1.6));
    float m = (1.0 - smoothstep(0.0, 0.1 + aw * 3.0, v)) * 0.75 + smoothstep(0.55, 0.78, n) * 0.3;
    c = mix(c, uSC2, m * uSA * inner);
  } else if (P == 5) {     // 水墨云纹
    float n = sF(q * d * 0.26 + uSSeed);
    c = mix(c, uSC2, smoothstep(0.44, 0.74, n) * 0.85 * smoothstep(-0.7, 0.1, yn) * uSA);
  } else if (P == 6) {     // 星点：疏朗的亮点 + 微闪
    vec2 p = q * d * 1.5; vec2 cc = floor(p), f = fract(p); vec2 o = sH2(cc);
    float k = sA(length(f - 0.2 - o * 0.6) - (0.05 + 0.06 * o.y), fwidth(p.x) * 1.2 + 1e-3) * step(0.42, sH(cc + 5.0));
    c = mix(c, uSC4, k * uSA); gl = k * (0.35 + 0.9 * uSGlow) * (0.65 + 0.35 * sin(uSTime * 2.0 + o.x * 40.0)); bk = 0.4;
  } else if (P == 7) {     // 环带：随体弯曲的柔边环带 + 深色细描边
    float x = u * d + 0.18 + yn * yn * 0.05 * d; float f = abs(fract(x) - 0.5); float w = fwidth(x) * 1.2 + 1e-4;
    float core = sA(f - 0.1, w), edge = sA(f - 0.135, w);
    float m = edge * smoothstep(0.1, 0.16, u) * (1.0 - smoothstep(0.9, 0.95, u));
    c = mix(c, mix(dark, uSC2, core), m * uSA); bk = 0.0;
  } else if (P == 8) {     // 礼服：深色背 + 白色衬衫前胸（V 领）+ 细条纹
    float shirt = sA(yn - (-0.15 - 2.6 * (0.66 - u)) , aw * 2.0) * step(0.4, u);
    float pin = sA(abs(fract(yn * d * 2.2) - 0.5) - 0.035, fwidth(yn * d * 2.2) + 1e-3) * 0.16 * (1.0 - shirt) * smoothstep(-0.2, 0.3, yn);
    c = mix(c, uSC4, pin * uSA); c = mix(c, uSC1, shirt * uSA); bk = 0.0;
  } else if (P == 9) {     // 青花：缠枝卷草 + 团花 + 首尾弦纹
    float n = sF(q * d * 0.32 + uSSeed);
    float line = 1.0 - smoothstep(0.0, 0.022 + aw * 2.0, abs(fract(n * 3.0) - 0.5) - 0.0);
    line *= smoothstep(0.35, 0.6, sF(q * 0.8 + 9.1));
    float blob = smoothstep(0.66, 0.69, sF(q * d * 0.9 + 3.1)) * 0.7;
    float ring = sA(abs(u - 0.84) - 0.012, aw) + sA(abs(u - 0.8) - 0.006, aw) + sA(abs(u - 0.16) - 0.012, aw);
    float ridge = smoothstep(0.72, 0.82, yn);
    float m = max(max(line * 0.85, blob * 0.9) * smoothstep(0.17, 0.2, u) * (1.0 - smoothstep(0.77, 0.79, u)), max(ring, ridge));
    c = mix(c, uSC2, clamp(m, 0.0, 1.0) * uSA); bk = 0.0;
  } else if (P == 10) {    // 冰裂纹（开片）
    vec2 v1 = sV(q * d * 0.9 + uSSeed), v2 = sV(q * d * 2.3 + 4.0);
    float m = max(1.0 - smoothstep(0.0, 0.035 + aw, v1.y), (1.0 - smoothstep(0.0, 0.025 + aw, v2.y)) * 0.45);
    c = mix(c, uSC2, m * uSA * 0.8); bk = 0.2;
  } else if (P == 11) {    // 回纹：侧线带上一列「回」字 + 上下弦线
    float band = sA(abs(yn - 0.02) - 0.3, aw) * inner * smoothstep(0.2, 0.3, u) * (1.0 - smoothstep(0.68, 0.76, u));
    vec2 p = vec2(q.x / 0.6 * d * 0.8, (yn - 0.02) / 0.6 + 0.5); vec2 f = fract(p); float sq = max(abs(f.x - 0.5), abs(f.y - 0.5)); float w = fwidth(p.x) * 1.2 + 1e-3;
    float hui = max(sA(abs(sq - 0.4) - 0.045, w), sA(abs(sq - 0.17) - 0.05, w));
    float rail = sA(abs(abs(yn - 0.02) - 0.33) - 0.012, aw) * inner;
    c = mix(c, uSC2, (hui * band * 0.3 + rail * 0.55) * uSA);
    c = mix(c, uSC4, sScale(q, d * 1.3) * 0.25 * (1.0 - band) * inner);
  } else if (P == 12) {    // 孔雀眼斑
    float e = length(vec2((u - 0.27) * uSAsp * 0.45, yn - 0.32));
    c = mix(c, dark, sA(abs(e - 0.2) - 0.035, aw) * uSA); c = mix(c, uSC4, sA(e - 0.165, aw) * uSA); c = mix(c, uSC2, sA(e - 0.11, aw) * uSA);
    float e2 = length(vec2((u - 0.6) * uSAsp * 0.45, yn - 0.42));
    float k2 = step(2.5, uSLux);
    c = mix(c, dark, sA(abs(e2 - 0.13) - 0.025, aw) * uSA * k2); c = mix(c, uSC2, sA(e2 - 0.1, aw) * uSA * k2);
  } else if (P == 13) {    // 霓虹侧线
    float y0 = 0.12 + 0.04 * sin(u * 6.0);
    float s = sA(abs(yn - y0) - 0.1, aw * 1.5) * smoothstep(0.1, 0.2, u) * (1.0 - smoothstep(0.84, 0.92, u));
    float s2 = sA(abs(yn - y0 - 0.17) - 0.025, aw) * smoothstep(0.2, 0.3, u) * (1.0 - smoothstep(0.78, 0.86, u));
    c = mix(c, uSC2, s * uSA); c = mix(c, uSC4, s2 * uSA * 0.8); gl = s * (0.2 + uSGlow);
  } else if (P == 14) {    // 玫瑰斑
    vec2 v = sV(q * d * 0.85 + uSSeed);
    float ring = sA(abs(v.x - 0.27) - 0.07, aw * 3.0), core = sA(v.x - 0.18, aw * 3.0);
    c = mix(c, uSC2, core * 0.55 * uSA * inner); c = mix(c, dark, ring * uSA * inner * smoothstep(-0.5, 0.0, yn)); bk = 0.3;
  } else if (P == 15) {    // 晚霞：腹 → 点缀 → 背 三段柔和渐变
    float t = clamp(yn * 0.5 + 0.5 + (sN(q * 1.4) - 0.5) * 0.16 + (0.5 - u) * 0.12, 0.0, 1.0);
    vec3 col = t < 0.5 ? mix(uSC1, uSC2, t * 2.0) : mix(uSC2, uSC0, (t - 0.5) * 2.0);
    c = mix(c, col, uSA * 0.9); bk = 0.0;
  } else if (P == 16) {    // 发光点阵：侧线与腹线两列珠点
    float p = u * uSAsp * d * 0.9; float fx = (fract(p) - 0.5) / (d * 0.9);
    float r1 = length(vec2(fx, yn - 0.06)), p2 = p + 0.5, fx2 = (fract(p2) - 0.5) / (d * 0.9), r2 = length(vec2(fx2, yn + 0.5));
    float k = max(sA(r1 - 0.055, aw), sA(r2 - 0.045, aw) * 0.85) * inner;
    c = mix(c, uSC4, k * uSA); gl = k * (0.3 + uSGlow);
  } else if (P == 17) {    // 网纹 / 蕾丝
    vec2 v = sV(q * d * 0.7 + uSSeed);
    c = mix(c, uSC2, (1.0 - smoothstep(0.0, 0.05 + aw, v.y)) * uSA * 0.85 * inner);
  } else if (P == 18) {    // 金箔碎点
    vec2 p = q * d * 3.0; vec2 cc = floor(p); vec2 o = sH2(cc);
    float k = sA(length(fract(p) - 0.5 - (o - 0.5) * 0.6) - 0.07 - 0.06 * o.y, fwidth(p.x) * 1.2 + 1e-3) * step(0.55, sH(cc + 3.0));
    c = mix(c, mix(uSC4, uSC2, step(0.5, o.x)), k * uSA); gl = k * uSGlow * 0.5; bk = 0.5;
  } else if (P == 19) {    // 圆斑
    vec2 p = q * d * 0.6; vec2 cc = floor(p), f = fract(p); vec2 o = sH2(cc);
    float k = sA(length(f - 0.25 - o * 0.5) - (0.14 + 0.1 * o.y), fwidth(p.x) * 2.0 + 1e-3) * step(0.3, sH(cc + 7.0)) * smoothstep(-0.55, -0.2, yn);
    c = mix(c, uSC2, k * uSA * inner);
  }
  // 华丽叠层：金属鳞缘（史诗+）、背脊加深、珠光腹、闪鳞（史诗+）、流光（神话）
  c = mix(c, mix(uSC4, vec3(1.0, 0.93, 0.72), 0.25), sScale(q, uSD * 1.6 + 2.0) * uSScl * 0.45 * inner * smoothstep(-0.7, 0.2, yn));
  c = mix(c, uSC0 * 0.78, smoothstep(0.62, 0.98, yn) * 0.28);
  c = mix(c, mix(uSC1, uSC4, 0.5) * 1.05, smoothstep(-0.25, -0.9, yn) * 0.22 * step(1.5, uSLux));
  {
    vec2 gp = q * vec2(9.0, 7.0) + uSSeed; vec2 gc = floor(gp); vec2 go = sH2(gc + 11.0);
    float gd = length(fract(gp) - 0.25 - go * 0.5);
    synGlit = sA(gd - 0.11, fwidth(gp.x) * 1.5 + 1e-3) * step(0.6, sH(gc + 31.0)) * inner * smoothstep(-0.55, 0.1, yn);
    synGlit *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uSTime * 1.7 + go.x * 37.0), 4.0);
  }
  gl += uSGlow * 0.55 * exp(-pow((fract(u * 0.7 - uSTime * 0.12) - 0.5) * 7.0, 2.0)) * smoothstep(-0.4, 0.5, yn) * step(3.5, uSLux);
  c = mix(base, c, mix(1.0, smoothstep(-0.88, -0.3, yn), bk));
  return vec4(c, gl);
}
`;
// Fish 构造时（stylize 之后、skinFish 之前）调用
export function applySynthPattern(model, syn) {
  const g = model.userData.synGenome || normGenome(syn);
  const P = model.userData.synPat || {};
  const lux = model.userData.synLux || g.lux || 1;
  const C = g.pal.map((c) => new THREE.Color(c));
  const glow = Math.max(g.glow || 0, [0, 0, 0.2, 0.42][lux - 1] || 0);   // 传说+：克制的鳍缘发光
  const shared = {
    uSHue: { value: lux >= 4 ? (g.mat === 'gold' || g.mat === 'brass' ? 0.05 : 0.24) : lux >= 3 ? 0.08 : 0.02 * lux },
    uSP: { value: PAT_IDS[g.pat.k] ?? 1 }, uSD: { value: g.pat.d }, uSA: { value: g.pat.a },
    uSAsp: { value: P.asp || 5 }, uSSeed: { value: ((P.seed || 1) % 9973) / 97.3 }, uSGlow: { value: glow },
    uSFA: { value: P.finA ?? 0.8 }, uSEdge: { value: P.edge ?? 0.5 }, uSLux: { value: lux }, uSScl: { value: g.scl || 0 }, uSTime: { value: 0 },
    uSIri: { value: clamp(0.25 + 0.5 * (g.irid || 0), 0, 1) * [0.55, 0.75, 0.95, 1.1][lux - 1] }, uSGlit: { value: [0.5, 0.85, 1.1, 1.35][lux - 1] },
    uSC0: { value: C[0] }, uSC1: { value: C[1] }, uSC2: { value: C[2] }, uSC3: { value: C[3] }, uSC4: { value: C[4] }, uSC5: { value: new THREE.Color(hslArc(g.pal[3], g.pal[2], 0.5)) },
    uSGlowC: { value: C[4].clone().lerp(C[2], 0.35).multiplyScalar(0.6 + glow * 1.4) },
  };
  const t0 = performance.now();
  model.traverse((o) => {
    if (!o.isMesh || !(o.userData.synBody || o.userData.synFin)) return;
    const m = o.material; if (!m || m.userData.synPat) return;
    m.userData.synPat = true;
    const fin = !!o.userData.synFin, U = { ...shared, uSF: { value: fin ? 1 : 0 } };
    if (o.userData.synBody) o.onBeforeRender = () => { shared.uSTime.value = (performance.now() - t0) / 1000; };
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.() || '';
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aSyn;\nvarying vec3 vSyn;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSyn = aSyn;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + SYN_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
vec4 synP = uSF > 0.5 ? synFin(diffuseColor.rgb) : synBody(diffuseColor.rgb); diffuseColor.rgb = synP.rgb; float synGl = synP.w;
if (uSF > 0.5) diffuseColor.a *= mix(1.0, uSFA, smoothstep(0.5, 1.0, vSyn.x));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uSGlowC * synGl;
{ // 菲涅尔珠光变色 + 闪鳞（视角相关）
  vec3 sVd = normalize(vViewPosition); float sNv = clamp(abs(dot(normal, sVd)), 0.0, 1.0);
  float sFr = pow(1.0 - sNv, 2.4);
  if (uSF > 0.5) totalEmissiveRadiance += synIri(vSyn.x * 0.8 + vSyn.y * 0.35 + sFr * 0.6 + uSTime * 0.03) * (0.06 + sFr * 0.45) * uSIri * smoothstep(0.15, 0.9, vSyn.x);
  else totalEmissiveRadiance += synIri(sFr * 0.9 + vSyn.x * 0.6 + vSyn.z * 0.15 + uSTime * 0.03) * sFr * uSIri * 0.45;
  float sTw = pow(max(0.0, sin(dot(normal, vec3(17.3, 41.9, 29.1)) * 2.0 + uSTime * 0.8)), 6.0);
  totalEmissiveRadiance += mix(vec3(1.0, 0.97, 0.9), uSC4, 0.35) * synGlit * uSGlit * (0.35 + 1.4 * sTw);
}`);
    };
    m.customProgramCacheKey = () => prevKey + (fin ? '-syn3f' : '-syn3b');
    m.needsUpdate = true;
  });
}

// =====================================================================================
// 构建器：基因组 → THREE.Group
// =====================================================================================
const X = (u) => (u - 0.5) * BL;
function makeCtx(g, seed, lux) {
  const M = morphProfile(g);
  const at = (A, u) => { const f = clamp(u, 0, 1) * (KS - 1), i = Math.min(KS - 2, Math.floor(f)), t = f - i; return lerp(A[i], A[i + 1], t) * BL; };
  return { g, M, lux, seed, s: new Sculpture(), Hh: (u) => at(M.H, u), Ww: (u) => at(M.W, u), mhW: M.mh * BL };
}
// 截面超椭圆：给定 y/H 求体表 z（与 marine.js bodyGeometry 截面公式一致）
function surfZ(C, u, yf) {
  const c = Math.pow(Math.abs(clamp(yf, -0.999, 0.999)), 1 / 0.94), sn = Math.sqrt(1 - c * c);
  return Math.pow(sn, 0.86) * (1 - 0.14 * Math.pow(yf > 0 ? c : 0, 3)) * C.Ww(u);
}
// 鳍膜坐标：根→梢 r ∈ [0,1]（给渐变 / 透光 / 发光鳍缘用）
function finSyn(mesh) {
  const geo = mesh.geometry, F = geo.userData.fin, a = geo.getAttribute('aFin');
  mesh.userData.synFin = true;
  if (!F || !a) return;
  const n = a.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = a.getX(i), y = a.getY(i);
    arr[i * 3] = clamp((Math.hypot(x, y) - F.dmin) / Math.max(F.dmax - F.dmin, 1e-4), 0, 1);
    arr[i * 3 + 1] = clamp((Math.atan2(y, x) - F.amin) / Math.max(F.amax - F.amin, 1e-4), 0, 1);
    arr[i * 3 + 2] = -1;
  }
  geo.setAttribute('aSyn', new THREE.Float32BufferAttribute(arr, 3));
}
// 波纹鳍缘：外缘相邻点之间插入向内收的中点（克制的皇冠尾感）
function scallop(pts, amp) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i < pts.length - 1) {
      const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
      const dx = cx - m[0], dy = cy - m[1], dl = Math.hypot(dx, dy) || 1;
      out.push([m[0] + dx / dl * amp, m[1] + dy / dl * amp]);
    }
  }
  return out;
}
const CTRL_U = [0, 0.035, 0.09, 0.18, 0.3, 0.43, 0.56, 0.68, 0.79, 0.87, 0.93, 0.975, 1];
function buildBody(C) {
  const { g, s } = C;
  const prof = CTRL_U.map((u) => [X(u), Math.max(C.Hh(u), 0.003), Math.max(C.Ww(u), 0.003)]);
  // 金属系：体色向金属本色靠拢（保持一点亲本色相），避免「生锈 / 脏金」
  const MET_TINT = { gold: ['#f5c65a', '#fff0c2', 0.72], brass: ['#eaa957', '#fbe3b4', 0.62], metal: ['#dbe4ee', '#f6f8fb', 0.4] }[g.mat];
  const back = MET_TINT ? mixc(g.pal[0], MET_TINT[0], MET_TINT[2]) : g.pal[0], belly = MET_TINT ? mixc(g.pal[1], MET_TINT[1], MET_TINT[2]) : g.pal[1];
  const body = s.body('body', prof, back, belly, 0.1);
  const p = MATS[g.mat] || MATS.wet, m = body.material;
  m.metalness = p.metal; m.roughness = p.rough; m.clearcoat = p.coat; m.clearcoatRoughness = p.coatR;
  const ir = Math.max(p.irid || 0, (g.irid || 0) * 0.85, [0.3, 0.45, 0.6, 0.75][C.lux - 1] || 0);   // 稀有度越高越有镭射珠光
  if (ir > 0.25) { m.iridescence = ir; m.iridescenceIOR = 1.35; m.iridescenceThicknessRange = [260, 780]; }
  if (p.sheen || C.lux >= 2) { m.sheen = Math.max(p.sheen || 0, 0.15 + 0.07 * C.lux); m.sheenRoughness = 0.38; m.sheenColor = new THREE.Color(g.pal[4]).lerp(new THREE.Color(g.pal[2]), 0.4); }
  if (g.mat === 'glow' || g.glow > 0.3) { m.emissive = new THREE.Color(g.pal[2]); m.emissiveIntensity = 0.06 + g.glow * 0.16; }
  if (g.mat !== 'wet' || ir > 0.25) m.userData.synPBR = true;
  body.userData.synBody = true;
  const pos = body.geometry.getAttribute('position'), n = pos.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), u = clamp(x / BL + 0.5, 0, 1);
    arr[i * 3] = u; arr[i * 3 + 1] = Math.atan2(Math.abs(z), y) / Math.PI; arr[i * 3 + 2] = clamp(y / Math.max(C.Hh(u), 1e-4), -1, 1);
  }
  body.geometry.setAttribute('aSyn', new THREE.Float32BufferAttribute(arr, 3));
  C.body = body;
}
function buildEyes(C) {
  const uE = C.M.mh < 0.14 ? 0.885 : 0.865;
  const hE = C.Hh(uE), yf = 0.27;
  const r = clamp(hE * 0.34, 0.022, 0.068) * C.g.eyeK;
  const z = Math.max(surfZ(C, uE, yf) - r * 0.12, r * 0.45);
  C.s.eyes(X(uE), hE * yf, z, r, C.lux >= 3 ? '#ffdc94' : '#fff6da');
  C.eye = { u: uE, r };
}
function buildHead(C) {
  const { g, s } = C;
  const hM = C.Hh(0.97);
  s.mouth(X(1) - 0.006, -hM * 0.2, clamp(C.Ww(0.965) * 0.7, 0.01, 0.04), mixc(g.pal[0], '#3a2626', 0.55));
  const uG = clamp(C.eye.u - 0.07 - C.eye.r / BL * 1.6, 0.62, 0.82);
  s.gills(X(uG), C.Hh(uG) * 0.02, surfZ(C, uG, 0) * 0.985, C.Hh(uG) * 0.48, mixc(g.pal[0], '#101418', 0.3));
}
// ---- 背鳍 / 臀鳍：鳍根沿背（腹）轮廓长出来；外缘 = 审美校准过的观赏鱼鳍型 ----
const PLUME = (fl) => { const o = [[0, 0.05]], n = 7; for (let i = 0; i < n; i++) { const t = i / (n - 1) * 0.92; o.push([t + 0.05, (1.25 - 0.5 * t) * (1 + 0.22 * fl)]); if (i < n - 1) o.push([t + 0.5 / (n - 1) * 0.92 + 0.03, 0.78 * (1.12 - 0.5 * t)]); } o.push([1.0, 0.3], [1.03, 0.06]); return o; };
const DOR = {
  soft: { f: 0.74, b: 0.3, k: 0.62, pts: () => [[0, 0.05], [0.1, 0.55], [0.3, 0.82], [0.5, 0.78], [0.62, 0.6], [0.75, 0.8], [0.9, 0.65], [1.02, 0.1]] },
  sickle: { f: 0.62, b: 0.42, k: 0.85, pts: (fl) => [[0, 0.04], [0.2, 0.55], [0.42, 1.0], [0.66 + fl * 0.28, 1.12 + fl * 0.22], [0.6, 0.7], [0.72, 0.32], [1, 0.06]] },
  sail: { f: 0.8, b: 0.22, k: 1.02, pts: () => [[0, 0.05], [0.04, 0.85], [0.18, 1.12], [0.4, 1.15], [0.62, 1.02], [0.82, 0.75], [0.96, 0.38], [1.03, 0.06]] },
  crest: { f: 0.82, b: 0.12, k: 0.55, pts: (fl) => [[0, 0.04], [0.06, 0.55 + fl * 0.35], [0.22, 0.68], [0.45, 0.66], [0.7, 0.6], [0.9, 0.48], [1.04, 0.08]] },
  fan: { f: 0.72, b: 0.3, k: 0.95, pts: (fl) => [[0, 0.04], [0.06, 0.62], [0.2, 1.02], [0.42, 1.26], [0.66, 1.3 + fl * 0.12], [0.88, 1.12 + fl * 0.1], [1.04, 0.72], [1.06, 0.3], [1.03, 0.06]] },
  plume: { f: 0.8, b: 0.36, k: 0.95, pts: PLUME },
  veil: { f: 0.66, b: 0.24, k: 0.85, pts: (fl) => [[0, 0.04], [0.08, 0.42], [0.24, 0.74], [0.46, 0.98], [0.72, 1.12], [1.0 + fl * 0.1, 1.08 + fl * 0.08], [1.24 + fl * 0.18, 0.86], [1.34 + fl * 0.22, 0.56], [1.26, 0.3], [1.04, 0.06]] },
};
const ANAL_PLACE = { soft: [0.42, 0.18, 0.7], sickle: [0.38, 0.26, 0.6], sail: [0.5, 0.14, 0.62], crest: [0.5, 0.1, 0.75], fan: [0.52, 0.22, 0.92], plume: [0.42, 0.18, 0.7], veil: [0.5, 0.13, 0.85] };
// 华丽度 → 鳍长倍率（稀有起明显变长；传说 / 神话 = 帆状背臀鳍）
const LUX_DOR = [1.18, 1.45, 1.75, 2.0], LUX_ANAL = [1.1, 1.4, 1.7, 1.95];
function medianFin(C, name, kind, sgn, kScale, place, color) {
  const D = DOR[kind] || DOR.soft, uF = place ? place[0] : D.f, uB = place ? place[1] : D.b;
  const Hs = Math.min(D.k * kScale * (0.12 + 0.36 * C.mhW) * (sgn > 0 ? LUX_DOR : LUX_ANAL)[C.lux - 1], Math.max(C.mhW * (0.9 + 0.3 * C.lux), 0.16));
  const xAt = (t) => lerp(X(uF), X(uB), t), yB = (t) => C.Hh(lerp(uF, uB, clamp(t, 0, 1)));
  let edge = D.pts(C.g.fil).map(([t, y]) => [xAt(t), sgn * (yB(t) * 0.94 + y * Hs)]);
  if (C.g.scal) edge = scallop(edge, Hs * 0.022);
  const root = []; for (let i = 0; i <= 6; i++) root.push([xAt(i / 6), sgn * yB(i / 6) * 0.78]);
  // 起点放在鳍根中段 → 放射鳍条从根部向外扇开
  const poly = [...root.slice(3), ...edge.slice().reverse(), ...root.slice(0, 3)];
  const mesh = C.s.fin(name, poly, color);
  finSyn(mesh);
  C.s.wiggle(mesh, 'x', 0.04 + 0.012 * C.lux, 2.4, sgn > 0 ? 1.3 : 2.1);
  return mesh;
}
// ---- 尾鳍 ----
const TAIL_K = { fork: [1, 1], lunate: [1.05, 0.85], round: [0.85, 1.0], swallow: [1, 0.95], lyre: [1, 0.85], delta: [1.05, 0.8], veil: [1.1, 0.85] };
function tailOutline(k, T, l, hp, fl, lux = 1) {
  // 斗鱼式裙尾：上叶略短、下叶长而下垂，外缘带柔和的波浪褶（华丽度越高褶越多）
  if (k === 'veil') {
    const o = [[0.04, hp], [-l * 0.35, T * 0.66]], n = 9 + lux * 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = lerp(0.5, -0.62, t) * Math.PI;
      const R = 1 + 0.035 * Math.sin(t * Math.PI * (2 + lux)) * Math.min(1, lux / 2);
      o.push([-l * (0.55 + 1.4 * Math.cos(a * 0.92)) * R, (Math.sin(a) * T * (a < 0 ? 1.2 : 1.02) - T * 0.08 * t) * R]);
    }
    o.push([-l * 0.4, -T * 0.7], [0.04, -hp]);
    return o;
  }
  // 半月裙尾：上下缘展开接近 180°，外缘是一道饱满的 D 形弧
  if (k === 'delta') {
    const o = [[0.04, hp], [-l * 0.18, T * 0.86]], n = 8 + lux * 2;
    for (let i = 0; i <= n; i++) {
      const a = lerp(0.47, -0.47, i / n) * Math.PI, R = 1 + 0.025 * Math.sin(i / n * Math.PI * (2 + lux)) * Math.min(1, lux / 3);
      o.push([-(l * 0.3 + l * 1.25 * Math.cos(a)) * R, T * 1.12 * Math.sin(a) * R]);
    }
    o.push([-l * 0.18, -T * 0.86], [0.04, -hp]);
    return o;
  }
  const top = {
    fork: [[0.04, hp], [-l * 0.55, T * 0.62], [-l * (1 + fl * 0.22), T * (1 + fl * 0.12)], [-l * 0.86, T * 0.36], [-l * 0.5, 0]],
    lunate: [[0.04, hp], [-l * 0.6, T * 0.7], [-l * (1.05 + fl * 0.28), T * (1.05 + fl * 0.14)], [-l * 0.72, T * 0.5], [-l * 0.45, 0]],
    round: [[0.04, hp], [-l * 0.55, T * 0.8], [-l * 0.9, T * 0.72], [-l * 1.02, 0]],
    swallow: [[0.04, hp], [-l * 0.7, T * 0.7], [-l * (1.55 + fl * 0.25), T * 1.08], [-l * 1.12, T * 0.42], [-l * 0.55, 0]],
    lyre: [[0.04, hp], [-l * 0.5, T * 0.7], [-l * 1.0, T * 1.0], [-l * (1.75 + fl * 0.3), T * 1.36], [-l * 1.05, T * 0.62], [-l * 0.62, 0]],
  }[k] || [[0.04, hp], [-l, T], [-l * 0.5, 0]];
  return [...top, ...top.slice(0, -1).reverse().map(([x, y]) => [x, -y])];
}
function buildTail(C) {
  const { g, s } = C, k = g.tail.k, [tk, lk] = TAIL_K[k] || TAIL_K.fork;
  const T = (0.13 + 0.34 * C.mhW) * g.tail.s * tk * [1.1, 1.3, 1.5, 1.7][C.lux - 1];
  const flow = k === 'veil' || k === 'delta' || k === 'lyre';
  // 尾鳍比例约束：随华丽度放宽（稀有 0.55 → 神话 0.9 体长；尾高 1.6 → 2.4 倍体高）—— 华丽但仍是一条鱼
  const EXT = { veil: 1.95, lyre: 2.05, swallow: 1.8, delta: 1.55, fork: 1.22, lunate: 1.33, round: 1.02 };
  const T2 = Math.min(T, Math.max(C.mhW * (1.35 + 0.27 * C.lux), 0.2));
  let l = T2 * lk * (flow ? 1 + 0.2 * C.lux : 1 + 0.08 * C.lux);
  l = Math.min(l, BL * (flow ? 0.43 + 0.12 * C.lux : 0.5 + 0.04 * C.lux) / (EXT[k] || 1.3));
  const hp = Math.max(C.Hh(0.05), C.mhW * 0.12) * 0.9;
  const pivot = s.group('tail', [X(0.035), 0, 0]);
  let out = tailOutline(k, T2, l, hp, g.fil, C.lux);
  if (g.scal && !flow) out = [out[0], ...scallop(out.slice(1, -1), T2 * 0.02), out[out.length - 1]];
  const mesh = s.fin('tail-fluke', [[0.07, 0], ...out], g.pal[3], [0, 0, 0], [0, 0, 0], pivot);
  finSyn(mesh);
  s.wiggle(pivot, 'y', flow ? 0.12 : 0.06, flow ? 2.2 : 3.8);
}
// ---- 胸鳍 / 腹鳍（左右严格镜像） ----
function pectOutline(k, l, h) {
  return {
    std: [[0.04, 0], [-l, -h * 0.55], [-l * 0.75, h * 0.2], [0, h * 0.3]],
    fan: [[0.04, 0], [-l * 0.55, -h * 0.75], [-l * 0.95, -h * 0.35], [-l * 1.0, h * 0.15], [-l * 0.6, h * 0.45], [0, h * 0.3]],
    long: [[0.04, 0], [-l * 0.9, -h * 0.5], [-l * 1.75, -h * 0.85], [-l * 1.15, -h * 0.15], [-l * 0.3, h * 0.25], [0, h * 0.28]],
    bow: [[0.04, 0], [-l * 0.5, -h * 0.78], [-l * 0.86, -h * 0.62], [-l * 0.6, 0], [-l * 0.86, h * 0.62], [-l * 0.5, h * 0.78], [0, h * 0.25]],
  }[k] || [[0.04, 0], [-l, -h * 0.55], [-l * 0.75, h * 0.2], [0, h * 0.3]];
}
function buildPect(C) {
  const { g, s } = C, k = g.pect.k;
  const uP = clamp(C.eye.u - 0.17, 0.55, 0.75), yf = -0.36;
  const l = (0.11 + 0.3 * C.mhW) * g.pect.s * [1.08, 1.22, 1.38, 1.5][C.lux - 1], h = l * 0.62;
  const z = surfZ(C, uP, yf) * 0.92, col = mixc(g.pal[3], g.pal[1], 0.22);
  let pts = pectOutline(k, l, h);
  if (g.scal && k !== 'std') pts = [pts[0], ...scallop(pts.slice(1, -1), l * 0.035), pts[pts.length - 1]];
  for (const side of [-1, 1]) {
    const rot = k === 'bow' ? [side * 0.2, side * -0.55, 0] : [side * 0.6, side * -0.32, 0];
    const fin = s.fin(`pectoral-${side}`, pts, col, [X(uP), C.Hh(uP) * yf, side * z], rot);
    finSyn(fin);
    s.wiggle(fin, 'x', 0.16, 3.0, side * 0.65);
  }
}
function buildPelv(C) {
  const { g, s } = C, k = g.pelv.k;
  const uV = clamp(C.eye.u - 0.27, 0.48, 0.66), yf = -0.8;
  const l = (0.06 + 0.2 * C.mhW) * g.pelv.s, h = l, L = C.lux;
  // 丝状腹鳍：史诗+ 变成细长飘带（斗鱼 / 神仙鱼式的腹鳍长丝）
  const pts = k === 'fil'
    ? [[0.03, 0], [-l * 0.3, -h * 0.55], [-l * (0.8 + 0.3 * L), -h * (1.0 + 0.22 * L)], [-l * (1.5 + 0.5 * L), -h * (1.4 + 0.32 * L)], [-l * (1.0 + 0.32 * L), -h * (0.8 + 0.2 * L)], [-l * 0.45, -h * 0.35], [-l * 0.12, -h * 0.05]]
    : [[0.03, 0], [-l * 0.35, -h * 0.9], [-l * 0.7, -h * 0.75], [-l * 0.2, -h * 0.08]];
  const z = surfZ(C, uV, yf) * 0.7;
  for (const side of [-1, 1]) {
    const fin = s.fin(`pelvic-${side}`, pts, g.pal[3], [X(uV), C.Hh(uV) * yf, side * z], [side * 0.3, 0, 0]);
    finSyn(fin);
    s.wiggle(fin, 'x', 0.1, 2.4, side * 0.5 + 1);
  }
}
const STAGES = [
  ['eyes', buildEyes], ['head', buildHead],
  ['dorsal', (C) => medianFin(C, 'dorsal-fin', C.g.dor.k, 1, C.g.dor.h, null, C.g.pal[3])],
  ['anal', (C) => { const k = C.g.anal.k, pl = ANAL_PLACE[k] || ANAL_PLACE.soft; medianFin(C, 'anal-fin', k, -1, pl[2] * C.g.anal.h, pl, C.g.pal[3]); }],
  ['tail', buildTail], ['pect', buildPect], ['pelv', buildPelv],
];
const RAR_LUX = { rare: 1, epic: 2, legendary: 3, mythic: 4 };
export const SYN_SHAPES = FIN_KINDS;
export const SYN_APPS = [];
export function buildSynthModel(v) {
  const src = v && typeof v === 'object' ? (v.syn || (v.base || v.plan ? v : null)) : null;
  const g = normGenome(src);
  // 旧存档 / 外部基因组：华丽度按稀有度推导
  if (g.lux == null) {
    const lux = RAR_LUX[v?.rarity] || 1;
    g.lux = lux; g.fil = lux >= 2 ? 1 : 0; g.scal = lux >= 3 ? 1 : 0; g.scl = Math.max(g.scl, lux >= 3 ? 0.6 : 0);
    if (lux >= 4) g.glow = Math.max(g.glow, 0.5);
  }
  const lux = g.lux;
  const seed = (Number.isFinite(+v?.seed) ? +v.seed : hashStr(JSON.stringify(src || {}))) >>> 0;
  const C = makeCtx(g, seed, lux);
  buildBody(C);
  C.eye = { u: 0.865, r: 0.04 };
  for (const [nm, fn] of STAGES) { try { fn(C); } catch (e) { console.warn('[synth] stage', nm, e); } }
  const s = C.s, model = new THREE.Group();
  model.name = 'synth-model';
  const bounds = new THREE.Box3().setFromObject(s.root), size = bounds.getSize(V3()), center = bounds.getCenter(V3());
  const bodyB = new THREE.Box3().setFromObject(C.body), bc = bodyB.getCenter(V3());
  const span = clamp(Math.max(size.x, size.z, 0.01), BL * 1.0, BL * 1.42);
  const k = 1.6 / span;
  center.y = lerp(center.y, bc.y, 0.5);
  if (size.x > span) center.x = lerp(center.x, bc.x, 0.6);
  s.root.scale.setScalar(k);
  s.root.position.copy(center).multiplyScalar(-k);
  s.root.name = 'normalized-sculpture';
  model.add(s.root);
  let tris = 0;
  s.root.traverse((o) => { if (o.isMesh) { const gi = o.geometry; tris += (gi.index ? gi.index.count : gi.getAttribute('position').count) / 3; } });
  model.userData.marineRig = { motions: s.motions, parts: s.parts, speciesId: 'synth' };
  model.userData.parts = s.parts;
  model.userData.speciesId = 'synth';
  model.userData.standardLength = 1.6;
  model.userData.lengthCm = Number.isFinite(+v?.cm) ? +v.cm : undefined;
  model.userData.normalizedDimensions = { x: size.x * k, y: size.y * k, z: size.z * k };
  model.userData.synPat = { asp: clamp(1 / (2 * C.M.mh), 1.4, 6), seed, finA: Math.max(0.6, Math.min(g.finA ?? 1, [0.9, 0.82, 0.76, 0.72][lux - 1])), edge: 0.3 + 0.1 * lux };
  model.userData.synLux = lux;
  model.userData.synGenome = g;
  model.userData.synSkin = SKINS[g.mat] || SKINS.wet;
  model.userData.tris = Math.round(tris);
  return model;
}
// Fish 用：skinFish 之后把器物质感的 PBR 参数还原、按材质换皮肤（鳞片 / 光滑）
export function synthAfterSkin(model, swim) {
  const sk = model.userData.synSkin;
  if (swim?.U?.uSk0 && sk) { const u = swim.U.uSk0.value; u.x = sk.type; u.y = sk.den * 0.7; u.z = sk.bump; }
  const lux = model.userData.synLux || 1, g = model.userData.synGenome;
  const edgeC = g ? new THREE.Color(g.pal[4]).lerp(new THREE.Color(g.pal[2]), 0.3) : WHITE;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    // 鳍膜：薄纱珠光（虹彩 + 绒面掠射光，稀有度越高越强）
    if (o.userData.synFin && m?.isMeshPhysicalMaterial) {
      m.iridescence = [0.35, 0.55, 0.75, 0.9][lux - 1]; m.iridescenceIOR = 1.35; m.iridescenceThicknessRange = [300, 820];
      m.sheen = 0.3 + 0.12 * lux; m.sheenRoughness = 0.35; m.sheenColor = edgeC.clone();
      m.roughness = 0.34; m.clearcoat = Math.max(m.clearcoat, 0.45); m.clearcoatRoughness = 0.12;
    }
    const p = m?.userData?.synKeep; if (!p) return;
    for (const key in p) m[key] = p[key];
  });
}
// skinFish 之前：记下需要保留的 PBR 参数
export function synthBeforeSkin(model) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material; if (!m?.userData?.synPBR || !m.isMeshPhysicalMaterial) return;
    m.userData.synKeep = { metalness: m.metalness, roughness: m.roughness, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness, iridescence: m.iridescence, iridescenceThicknessRange: m.iridescenceThicknessRange, sheen: m.sheen, sheenColor: m.sheenColor, sheenRoughness: m.sheenRoughness };
  });
}
