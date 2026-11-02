// v0.9 A：合成物种 —— 基因组（syn）→ 程序化雕塑模型
// - 复用 marine.js 的 Sculpture（薄膜鳍 + 放射鳍条 / 角膜眼 / 管状附肢），与 40 种天然物种同一套造型语言与 fishmat 皮肤
// - 身体 = 参数化截面放样（超椭圆截面 × 包络 × 头型 × 体节 / 细腰 / 拱背），每个顶点带 aSyn=(u, θ, y/H) 体表坐标 → 花纹 shader 用
// - 鼻尖 +x、背 +y（与 marine.js 一致）；模型最长水平维度归一化到 1.6（Fish 类再缩到 1m）
// - 身体永远不透明；鳍膜由 fishmat 按放射鳍条做轻微透光；器物部件（钥匙齿 / 马桶盖 / 齿轮…）是实心材质
import * as THREE from 'three';
import { Sculpture } from './marine.js';

const TAU = Math.PI * 2, PI = Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }
const WHITE = new THREE.Color('#ffffff');
const hex = (c) => '#' + new THREE.Color(c).getHexString();
const shade = (c, k) => { const o = new THREE.Color(c); o.multiplyScalar(k); return '#' + o.getHexString(); };
const mixc = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// ---------------- 基因组默认值（synth.js 产出完整基因组；这里兜底旧数据 / 手写数据） ----------------
export const G_DEFAULT = {
  v: 1, plan: 'fusiform', len: 1, ht: 0.17, wd: 0.62, sq: 2, arch: 0, hump: 0, belly: 0.5, peak: 0.55, ped: 0.3, seg: 0, waist: 0,
  head: 'round', mouth: 'smile', eyes: { n: 2, k: 1, stalk: 0, lens: 0 },
  dor: { k: 'shark', h: 1, l: 1, x: 0.5 }, dor2: null, tail: { k: 'fork', s: 1 }, pect: { k: 'std', s: 1 }, pelv: 1, anal: 1,
  app: [], pal: ['#547f87', '#f1e3d8', '#3c555d', '#5c7d88'], pat: { k: 'none', d: 4, a: 0.8, r: 0 }, mat: 'wet', glow: 0, irid: 0.3,
};
export function normGenome(g) {
  g = g && typeof g === 'object' ? g : {};
  const o = { ...G_DEFAULT, ...g };
  o.eyes = { ...G_DEFAULT.eyes, ...(g.eyes || {}) };
  o.dor = { ...G_DEFAULT.dor, ...(g.dor || {}) };
  o.tail = { ...G_DEFAULT.tail, ...(g.tail || {}) };
  o.pect = { ...G_DEFAULT.pect, ...(g.pect || {}) };
  o.pat = { ...G_DEFAULT.pat, ...(g.pat || {}) };
  o.pal = Array.isArray(g.pal) && g.pal.length >= 4 ? g.pal.slice(0, 4) : G_DEFAULT.pal.slice();
  o.app = Array.isArray(g.app) ? g.app.slice(0, 6) : [];
  for (const k of ['len', 'ht', 'wd', 'sq', 'arch', 'hump', 'belly', 'peak', 'ped', 'waist', 'glow', 'irid']) if (!Number.isFinite(+o[k])) o[k] = G_DEFAULT[k];
  o.len = clamp(+o.len, 0.6, 3.2); o.ht = clamp(+o.ht, 0.035, 0.5); o.wd = clamp(+o.wd, 0.25, 5); o.sq = clamp(+o.sq, 1.2, 6);
  o.peak = clamp(+o.peak, 0.3, 0.8); o.ped = clamp(+o.ped, 0, 1); o.seg = clamp(o.seg | 0, 0, 9); o.waist = clamp(+o.waist, 0, 0.7);
  return o;
}

// ---------------- 材质 ----------------
// 器物质感：身体 / 器物部件用；fishmat 见 userData.synPBR 时不覆盖这些 PBR 参数，见 userData.dry 时不加湿润高光
export const MATS = {
  wet: { metal: 0.08, rough: 0.4, coat: 0.7, coatR: 0.27 },
  matte: { metal: 0, rough: 0.8, coat: 0.06, coatR: 0.6, sheen: 0.35, dry: 1 },
  glaze: { metal: 0, rough: 0.22, coat: 1, coatR: 0.05 },
  ceramic: { metal: 0, rough: 0.16, coat: 1, coatR: 0.03 },
  metal: { metal: 0.82, rough: 0.3, coat: 0.3, coatR: 0.2 },
  brass: { metal: 0.9, rough: 0.34, coat: 0.2, coatR: 0.3 },
  gold: { metal: 1, rough: 0.24, coat: 0.45, coatR: 0.2 },
  pearl: { metal: 0.12, rough: 0.26, coat: 0.9, coatR: 0.1, irid: 1, sheen: 0.4 },
  satin: { metal: 0, rough: 0.5, coat: 0.1, coatR: 0.5, sheen: 1, dry: 1 },
  glow: { metal: 0, rough: 0.34, coat: 0.85, coatR: 0.12 },
  crystal: { metal: 0.08, rough: 0.1, coat: 1, coatR: 0.04, irid: 0.75 },
  paper: { metal: 0, rough: 0.92, coat: 0, coatR: 0.6, sheen: 0.25, dry: 1, flat: 1 },
};
// fishmat 皮肤参数（鳞片 / 光滑皮 …）
const SKINS = {
  wet: { type: 0, den: 44, bump: 0.42, irid: 0.3, metal: 0.1, coat: 0.85 },
  matte: { type: 1, den: 26, bump: 0.22, irid: 0, metal: 0, coat: 0.3 },
  glaze: { type: 1, den: 20, bump: 0.05, irid: 0, metal: 0, coat: 1 },
  ceramic: { type: 1, den: 10, bump: 0.02, irid: 0, metal: 0, coat: 1 },
  metal: { type: 1, den: 30, bump: 0.12, irid: 0, metal: 0.8, coat: 0.6 },
  brass: { type: 1, den: 30, bump: 0.12, irid: 0, metal: 0.8, coat: 0.5 },
  gold: { type: 0, den: 40, bump: 0.18, irid: 0, metal: 0.9, coat: 0.6 },
  pearl: { type: 0, den: 46, bump: 0.16, irid: 1, metal: 0.1, coat: 0.9 },
  satin: { type: 1, den: 30, bump: 0.08, irid: 0.1, metal: 0, coat: 0.35 },
  glow: { type: 1, den: 20, bump: 0.1, irid: 0.2, metal: 0, coat: 0.8 },
  crystal: { type: 1, den: 12, bump: 0.04, irid: 0.6, metal: 0, coat: 1 },
  paper: { type: 1, den: 12, bump: 0, irid: 0, metal: 0, coat: 0 },
};
export function physMat(color, kind = 'wet', o = {}) {
  const p = MATS[kind] || MATS.wet;
  const m = new THREE.MeshPhysicalMaterial({ color, metalness: p.metal, roughness: p.rough, clearcoat: p.coat, clearcoatRoughness: p.coatR, vertexColors: !!o.vc });
  if (p.irid) { m.iridescence = p.irid; m.iridescenceIOR = 1.3; m.iridescenceThicknessRange = [200, 620]; }
  if (p.sheen) { m.sheen = p.sheen; m.sheenRoughness = 0.42; m.sheenColor = new THREE.Color(o.vc ? '#ffffff' : color).lerp(WHITE, 0.45); }
  if (p.flat) m.flatShading = true;
  if (o.glow) { m.emissive = new THREE.Color(o.glowColor || color); m.emissiveIntensity = o.glow; }
  if (kind !== 'wet' || o.keep) m.userData.synPBR = true;
  if (p.dry) m.userData.dry = true;
  if (o.side) m.side = o.side;
  return m;
}
const METALLIC = new Set(['metal', 'brass', 'gold']);

// ---------------- 身体场：u ∈ [0,1] 尾→头，a = 截面角（0 = 背脊，π/2 = +z 体侧，π = 腹） ----------------
function headCurve(head, t) {
  switch (head) {
    case 'pointed': case 'bill': return Math.pow(Math.cos(t * PI / 2), 1.25);
    case 'blunt': case 'hammer': return Math.pow(Math.max(0, 1 - t ** 6), 0.4);
    case 'snub': case 'dome': return Math.pow(Math.max(0, 1 - t ** 3.2), 0.5);
    case 'tube': return t < 0.45 ? lerp(1, 0.3, sst(0, 0.45, t)) : 0.3 * Math.pow(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 8), 0.5);
    default: return Math.pow(Math.max(0, 1 - t ** 2.2), 0.55);
  }
}
export function makeField(g) {
  const L = 1.6 * g.len, H = g.ht * L, W = g.wd * H;
  const pk = g.peak, pedH = lerp(0.07, 0.36, g.ped), plan = g.plan, head = g.head;
  const nseg = g.seg | 0, waist = g.waist || 0, hump = g.hump || 0, bellyK = lerp(0.72, 1.22, g.belly ?? 0.5);
  const flat = plan === 'flat', sq = g.sq;
  const env = (u) => {
    let e;
    if (plan === 'diamond') e = u <= pk ? lerp(pedH, 1, u / pk) : Math.max(0, 1 - (u - pk) / (1 - pk)) ** 0.9;
    else if (u <= pk) { const t = u / pk; e = pedH + (1 - pedH) * Math.pow(1 - Math.pow(1 - t, 2.1), 0.8); }
    else e = headCurve(head, (u - pk) / (1 - pk));
    if (plan === 'box') e = Math.pow(e, 0.42);
    if (plan === 'eel') e = Math.pow(e, 0.5);
    if (plan === 'hourglass') e = Math.pow(e, 0.7);
    if (nseg) e *= 1 - 0.14 * Math.pow(Math.cos(PI * nseg * u) ** 2, 6) * sst(0.02, 0.12, u) * (1 - sst(0.86, 0.97, u));
    if (waist) e *= 1 - waist * Math.exp(-(((u - 0.47) / 0.1) ** 2));
    return Math.max(e, 0.004);
  };
  const ht = (u) => {
    let h = H * env(u) * (1 + hump * 0.45 * Math.exp(-(((u - pk) / 0.22) ** 2)));
    if (u > pk) {
      const t = (u - pk) / (1 - pk);
      if (head === 'bevel') h *= 1 - 0.62 * sst(0.05, 1, t);
      if (head === 'dome') h *= 1 + 0.2 * Math.exp(-(((t - 0.5) / 0.24) ** 2));
    }
    return h;
  };
  const hb = (u) => H * env(u) * bellyK;
  const wz = (u) => flat ? W * Math.pow(Math.max(0, Math.sin(PI * clamp(u * 0.9 + 0.07, 0, 1))), 0.55) * Math.min(1, env(u) * 3) : W * Math.pow(env(u), 0.9);
  const yc = (u) => g.arch * L * 0.17 * (1 - (2 * u - 1) ** 2);
  const x = (u) => -L / 2 + u * L;
  const e2 = 2 / sq;
  const pt = (u, a, ex = 1) => {
    const c = Math.cos(a), s = Math.sin(a);
    const yy = Math.sign(c) * Math.abs(c) ** e2;
    let zz = Math.sign(s) * Math.abs(s) ** e2;
    zz *= 1 - 0.12 * Math.max(c, 0) ** 3;
    return V3(x(u), yc(u) + (yy > 0 ? ht(u) : hb(u)) * yy * ex, wz(u) * zz * ex);
  };
  const nrm = (u, a) => {
    const p = pt(u, a);
    const du = pt(Math.min(u + 0.004, 1), a).sub(pt(Math.max(u - 0.004, 0), a));
    const da = pt(u, a + 0.02).sub(pt(u, a - 0.02));
    const n = da.clone().cross(du);
    const c = V3(x(u), yc(u), 0);
    if (n.lengthSq() < 1e-12) return p.sub(c).normalize();
    n.normalize();
    if (n.dot(p.clone().sub(c)) < 0) n.negate();
    return n;
  };
  const top = (u) => yc(u) + ht(u), bot = (u) => yc(u) - hb(u);
  const S = Math.max(H, L * 0.09);   // 附肢尺度（细长体型也不至于小到看不见）
  return { L, H, W, S, pk, plan, head, flat, env, ht, hb, wz, yc, x, pt, nrm, top, bot, uHead: pk + (1 - pk) * 0.5 };
}

function bodyGeometry(F, g, back, belly) {
  const paper = g.mat === 'paper';
  const N = paper ? 18 : 58, R = paper ? 8 : 30;
  const pos = [], col = [], syn = [], idx = [];
  const cb = new THREE.Color(back), cl = new THREE.Color(belly), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const u = 0.5 - 0.5 * Math.cos(PI * i / (N - 1));
    const yc = F.yc(u);
    for (let j = 0; j <= R; j++) {
      const a = j / R * TAU;
      const p = F.pt(u, a);
      pos.push(p.x, p.y, p.z);
      c.copy(cl).lerp(cb, sst(-0.58, 0.64, Math.cos(a)));
      col.push(c.r, c.g, c.b);
      syn.push(u, j / R, (p.y - yc) / F.H);
      if (i < N - 1 && j < R) { const A = i * (R + 1) + j, B = A + R + 1; idx.push(A, A + 1, B, A + 1, B + 1, B); }
    }
  }
  // 尾端封口
  const ci = pos.length / 3, y0 = F.yc(0);
  pos.push(F.x(0) - 0.004, y0, 0); c.copy(cl).lerp(cb, 0.5); col.push(c.r, c.g, c.b); syn.push(0, 0, 0);
  for (let j = 0; j < R; j++) idx.push(ci, j + 1, j);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSyn', new THREE.Float32BufferAttribute(syn, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nr = geo.getAttribute('normal');
  for (let i = 0; i < N; i++) {
    const a = i * (R + 1), b = a + R;
    const nx = nr.getX(a) + nr.getX(b), ny = nr.getY(a) + nr.getY(b), nz = nr.getZ(a) + nr.getZ(b), l = Math.hypot(nx, ny, nz) || 1;
    nr.setXYZ(a, nx / l, ny / l, nz / l); nr.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return geo;
}
// 贴体壳片（甲板 / 龟壳 / 糖霜…）：身体某段 u∈[u0,u1]、截面角 |a|≤aMax 的外扩曲面
function shellGeometry(F, u0, u1, aMax, ex, nu = 14, na = 18) {
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = lerp(u0, u1, i / nu);
    const k = Math.sin(PI * i / nu) ** 0.25;   // 两端收边
    for (let j = 0; j <= na; j++) {
      const a = lerp(-aMax, aMax, j / na);
      const p = F.pt(u, a, 1 + (ex - 1) * k);
      pos.push(p.x, p.y, p.z);
      if (i < nu && j < na) { const A = i * (na + 1) + j, B = A + na + 1; idx.push(A, B, A + 1, A + 1, B, B + 1); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

// ---------------- 花纹 shader（只编译一次：25 种花纹族用 uniform 切换） ----------------
export const PAT_IDS = { none: 0, bars: 1, lines: 2, spots: 3, freckle: 4, mottle: 5, grad: 6, tiger: 7, stars: 8, scale: 9, stripe: 10, marble: 11, ring: 12, ocelli: 13, geo: 14, tux: 15, lateral: 16, galaxy: 17, sprinkle: 18, dial: 19, melon: 20, sunburst: 21, waffle: 22, orca: 23, ribs: 24 };
const SYN_GLSL = /* glsl */`
uniform float uSP, uSD, uSA, uSR, uSAsp, uSSeed, uSGlow;
uniform vec3 uSC0, uSC1, uSC2, uSC3;
varying vec3 vSyn;
float sH(vec2 p){ p = fract((p + uSSeed * 0.0137) * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 sH2(vec2 p){ float n = sH(p); return vec2(n, sH(p + n + 17.0)); }
float sN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sH(i), sH(i + vec2(1, 0)), f.x), mix(sH(i + vec2(0, 1)), sH(i + vec2(1, 1)), f.x), f.y); }
float sF(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * sN(p); p *= 2.03; a *= 0.5; } return s; }
float sA(float d, float w){ return smoothstep(w, -w, d); }
vec4 synPattern(vec3 base){
  float u = vSyn.x, a = vSyn.y, yn = vSyn.z;
  vec2 q = vec2(u * uSAsp, yn);
  float aw = max(fwidth(u * uSAsp), fwidth(yn)) * 0.9 + 1e-4;
  int P = int(uSP + 0.5);
  float d = uSD, m = 0.0, gl = 0.0, belly = 1.0;
  vec3 pc = uSC2;
  if (P == 1) {            // 竖环带（白带 + 深色描边）
    float x = u * d + 0.15; float f = abs(fract(x) - 0.5); float w = fwidth(x) + 1e-4;
    float core = sA(f - 0.1, w), edge = sA(f - 0.15, w);
    m = edge * step(0.08, u) * step(u, 0.93); pc = mix(uSC3, uSC2, core); belly = 0.0;
  } else if (P == 2) {     // 纵向条纹
    float y = yn * d * 0.55 + 0.5; float f = abs(fract(y) - 0.5); float w = fwidth(y) + 1e-4;
    m = sA(f - 0.14, w) * smoothstep(0.02, 0.15, u) * (1.0 - smoothstep(0.85, 0.97, u));
  } else if (P == 3) {     // 斑点（随机大小）
    vec2 p = q * d * 0.5; vec2 c = floor(p), f = fract(p); float w = fwidth(p.x) + 1e-4;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 gg = vec2(float(i), float(j)); vec2 o = sH2(c + gg);
      float r = 0.16 + 0.18 * o.y, on = step(0.25, sH(c + gg + 7.0));
      float k = sA(length(gg + o * 0.6 + 0.2 - f) - r, w) * on;
      if (k > m) { m = k; pc = mix(uSC2, uSC3, step(0.75, sH(c + gg + 3.0))); }
    }
  } else if (P == 4) {     // 雀斑（细小深色点，背部多）
    vec2 p = q * d * 1.3; vec2 c = floor(p), f = fract(p); vec2 o = sH2(c); float w = fwidth(p.x) + 1e-4;
    m = sA(length(f - 0.25 - o * 0.5) - 0.13 - 0.07 * o.y, w) * step(0.35, sH(c + 9.0)) * smoothstep(-0.45, 0.15, yn);
  } else if (P == 5) {     // 云斑 / 迷彩
    float n = sF(q * d * 0.35 + uSSeed);
    m = smoothstep(0.47, 0.53, n) * 0.85; pc = mix(uSC2, uSC3, smoothstep(0.62, 0.66, n));
  } else if (P == 6) {     // 渐变（尾 → 头）
    float t = clamp(1.0 - u + yn * 0.12 + (sN(q * 2.0) - 0.5) * 0.12, 0.0, 1.0);
    m = smoothstep(0.15, 1.0, t) * 0.95; belly = 0.6;
  } else if (P == 7) {     // 虎纹（背部波浪竖纹）
    float x = u * d + 0.18 * sin(yn * 5.0 + u * 9.0); float f = abs(fract(x) - 0.5); float w = fwidth(x) + 1e-4;
    m = sA(f - 0.12, w) * smoothstep(-0.15, 0.35, yn) * step(0.06, u) * step(u, 0.9);
  } else if (P == 8) {     // 星点（鲸鲨）
    vec2 p = q * d * 0.9; vec2 c = floor(p), f = fract(p); vec2 o = sH2(c); float w = fwidth(p.x) + 1e-4;
    m = sA(length(f - 0.3 - o * 0.4) - 0.12, w) * smoothstep(-0.35, 0.05, yn);
    m = max(m, sA(abs(fract(p.x + 0.5) - 0.5) - 0.03, w) * smoothstep(0.25, 0.6, yn) * 0.5);
  } else if (P == 9) {     // 鳞片描边
    vec2 p = q * d * 1.2 * vec2(1.0, 1.3); p.y += 0.5 * mod(floor(p.x), 2.0);
    vec2 f = fract(p); float w = fwidth(p.x) * 1.4 + 1e-4;
    m = sA(abs(length(f - vec2(0.0, 0.5)) - 0.58) - 0.06, w) * 0.75;
  } else if (P == 10) {    // 斜条纹（可波浪）
    float cr = cos(uSR), sr = sin(uSR); vec2 p = mat2(cr, sr, -sr, cr) * q * d * 0.5;
    float x = p.x + sin(p.y * 2.3 + uSSeed) * 0.15; float f = abs(fract(x) - 0.5); float w = fwidth(x) + 1e-4;
    m = sA(f - 0.2, w); pc = mix(uSC2, uSC3, step(0.5, fract(floor(x) * 0.5)) * 0.4);
  } else if (P == 11) {    // 大理石 / 墨渍
    vec2 p = q * d * 0.35; float n = sF(p * 1.4 + uSSeed);
    float f = abs(sin((p.x + p.y * 0.7 + n * 3.2) * 3.0));
    m = max(sA(f - 0.1, fwidth(f) + 0.02), smoothstep(0.55, 0.75, n) * 0.45); pc = mix(uSC2, uSC3, smoothstep(0.6, 0.8, n));
  } else if (P == 12) {    // 螺旋环带
    float x = u * d * 1.4 + a * 1.0; float f = abs(fract(x) - 0.5); float w = fwidth(x) + 1e-4;
    m = sA(f - 0.12, w) * 0.85; pc = mix(uSC2, uSC3, step(0.5, fract(floor(x) * 0.5)));
    m = max(m, sA(abs(fract(x * 3.0) - 0.5) - 0.06, w * 3.0) * 0.25);
  } else if (P == 13) {    // 眼斑 / 舷窗
    if (uSR < 0.5) {
      for (int i = 0; i < 3; i++) {
        vec2 c = vec2((0.32 + 0.17 * float(i)) * uSAsp, 0.18); float r = length(q - c);
        float rim = sA(abs(r - 0.25) - 0.055, aw), glass = sA(r - 0.2, aw);
        if (rim > 0.01 || glass > 0.01) { m = max(rim, glass); pc = mix(vec3(0.07, 0.11, 0.18) + vec3(0.35, 0.6, 0.8) * smoothstep(0.2, 0.0, length(q - c - vec2(-0.06, 0.07))), uSC2, rim); gl = max(gl, glass * 0.55); }
      }
    } else {
      vec2 c = vec2(0.16 * uSAsp, 0.2); float r = length(q - c);
      m = max(sA(r - 0.2, aw), sA(abs(r - 0.27) - 0.04, aw)); pc = mix(uSC1, uSC2, sA(r - 0.2, aw));
    }
    belly = 0.0;
  } else if (P == 14) {    // 几何：棋盘色块 / 冰晶三角网
    if (uSR < 0.5) {
      vec2 p = vec2(u * d * 1.1, a * d * 2.4); vec2 c = floor(p), f = fract(p); float w = fwidth(p.x) + 1e-4;
      float h = sH(c); pc = h < 0.25 ? uSC0 : h < 0.5 ? uSC1 : h < 0.75 ? uSC2 : uSC3;
      float gap = max(sA(0.06 - f.x, w), max(sA(f.x - 0.94, w), max(sA(0.06 - f.y, w), sA(f.y - 0.94, w))));
      pc = mix(pc, vec3(0.06), gap); m = 1.0; belly = 0.0;
    } else {
      vec2 p = q * d * 0.6; float w = fwidth(p.x) * 1.2 + 1e-4;
      float l1 = abs(fract(p.y) - 0.5), l2 = abs(fract(p.y * 0.5 + p.x * 0.866) - 0.5), l3 = abs(fract(p.y * 0.5 - p.x * 0.866) - 0.5);
      m = max(sA(l1 - 0.035, w), max(sA(l2 - 0.035, w), sA(l3 - 0.035, w))) * 0.8; pc = uSC1; gl = m * 0.25;
    }
  } else if (P == 15) {    // 燕尾服：黑背 + 白衬衫 V 领 + 纽扣
    float shirt = sA(yn - (-0.35 + 1.6 * max(u - 0.55, 0.0)), aw * 2.0) * step(0.5, u);
    pc = mix(uSC0, uSC1, shirt); m = 1.0; belly = 0.0;
    vec2 bq = vec2(fract(u * 14.0) - 0.5, abs(a - 0.5) * 6.0);
    float btn = sA(length(bq) - 0.18, 0.06) * step(0.6, u) * step(u, 0.85) * step(abs(a - 0.5), 0.05);
    pc = mix(pc, uSC2, btn);
  } else if (P == 16) {    // 侧线（霓虹灯管）
    float y = yn - 0.05 - 0.05 * sin(u * 9.0 + uSSeed); float w = fwidth(y) + 1e-4;
    float line = sA(abs(y) - 0.045, w), halo = smoothstep(0.25, 0.0, abs(y));
    m = max(line, halo * 0.35) * smoothstep(0.05, 0.15, u) * (1.0 - smoothstep(0.85, 0.95, u)); gl = line * 1.2 + halo * 0.2; belly = 0.0;
  } else if (P == 17) {    // 星云
    float n = sF(q * 0.9 + uSSeed);
    m = smoothstep(0.38, 0.78, n) * 0.85; pc = mix(uSC1, uSC2, smoothstep(0.5, 0.85, n)); gl = m * 0.25;
    vec2 p = q * d * 2.0; vec2 c = floor(p), f = fract(p); vec2 o = sH2(c);
    float st = smoothstep(0.09, 0.0, length(f - 0.2 - o * 0.6)) * step(0.55, sH(c + 4.0));
    m = max(m, st); pc = mix(pc, vec3(1.0, 0.98, 0.92), st); gl += st * 1.4; belly = 0.0;
  } else if (P == 18) {    // 甜甜圈：糖霜 + 彩针糖
    float edge = -0.08 + 0.1 * sin(u * 23.0 + uSSeed) + 0.05 * sin(u * 51.0);
    float ice = sA(edge - yn, aw * 2.0); pc = uSC2; m = ice;
    vec2 p = q * d * 1.6; vec2 c = floor(p), f = fract(p) - 0.5; float h = sH(c);
    float an = h * 6.283; f = mat2(cos(an), sin(an), -sin(an), cos(an)) * f;
    float rod = sA(max(abs(f.x) - 0.16, abs(f.y) - 0.04), 0.03) * step(0.35, h) * ice;
    vec3 rc = 0.55 + 0.4 * cos(6.283 * (fract(h * 7.0) + vec3(0.0, 0.33, 0.67)));
    pc = mix(pc, rc, rod); belly = 0.0;
  } else if (P == 19) {    // 表盘
    vec2 c = vec2(0.5 * uSAsp, 0.05); vec2 v = q - c; float r = length(v), R = 0.62;
    float face = sA(r - R, aw), rim = sA(abs(r - R - 0.05) - 0.045, aw);
    float ang = atan(v.y, v.x);
    float tick = sA(abs(fract(ang / 6.283 * 12.0 + 0.5) - 0.5) - 0.06, 0.02) * step(R * 0.78, r) * step(r, R * 0.93);
    vec2 h1 = vec2(cos(2.2), sin(2.2)), h2 = vec2(cos(0.5), sin(0.5));
    float hand1 = sA(abs(dot(v, vec2(-h1.y, h1.x))) - 0.035, aw) * step(0.0, dot(v, h1)) * step(dot(v, h1), R * 0.48);
    float hand2 = sA(abs(dot(v, vec2(-h2.y, h2.x))) - 0.022, aw) * step(0.0, dot(v, h2)) * step(dot(v, h2), R * 0.78);
    float hub = sA(r - 0.05, aw);
    pc = mix(uSC1, uSC2, max(max(tick, hand1), max(hand2, hub))); pc = mix(pc, uSC3, rim);
    m = max(face, rim); belly = 0.0;
  } else if (P == 20) {    // 西瓜：瓜皮纵纹 + 白边 + 红瓤黑籽
    float x = a * d * 2.0 + 0.06 * sin(u * 34.0) + 0.04 * sin(u * 71.0); float f = abs(fract(x) - 0.5); float w = fwidth(x) + 1e-4;
    float stripe = sA(f - 0.17, w * 2.0);
    float rindL = -0.38, flesh = sA(yn - (rindL - 0.1), aw * 2.0), rind = sA(yn - rindL, aw * 2.0) - flesh;
    pc = mix(uSC2, vec3(0.9, 0.94, 0.8), rind); pc = mix(pc, uSC1, flesh); m = max(stripe * (1.0 - rind - flesh), max(rind, flesh));
    vec2 p = q * 3.2; vec2 c = floor(p), ff = fract(p) - 0.5; vec2 o = sH2(c) - 0.5;
    float seed = sA(length((ff - o * 0.4) * vec2(1.0, 0.6)) - 0.1, 0.03) * flesh * step(0.4, sH(c + 2.0));
    pc = mix(pc, vec3(0.06, 0.05, 0.04), seed); belly = 0.0;
  } else if (P == 21) {    // 日落渐变（琴面）+ 音孔
    vec2 c = vec2(0.45 * uSAsp, 0.0); float t = length((q - c) / vec2(1.6, 1.0));
    pc = mix(uSC1, uSC2, smoothstep(0.35, 1.05, t)); m = 1.0;
    vec2 hc = vec2(0.64 * uSAsp, 0.06); float r = length(q - hc);
    pc = mix(pc, uSC2 * 0.4, sA(r - 0.2, aw)); pc = mix(pc, uSC1 * 1.1, sA(abs(r - 0.26) - 0.025, aw)); belly = 0.0;
  } else if (P == 22) {    // 甜筒：后段华夫格 + 前段奶油（滴落边）
    float edge = 0.48 + 0.035 * sin(a * 6.283 * 7.0) + 0.02 * sin(a * 6.283 * 13.0);
    float cone = sA(u - edge, 0.006);
    vec2 p = vec2(u * d * 3.0 + yn * 0.8, u * d * 3.0 - yn * 0.8); float w = fwidth(p.x) + 1e-4;
    float grid = max(sA(abs(fract(p.x) - 0.5) - 0.07, w), sA(abs(fract(p.y) - 0.5) - 0.07, w));
    pc = mix(uSC2, uSC2 * 0.62, grid); m = cone; belly = 0.0;
  } else if (P == 23) {    // 虎鲸：黑白分区 + 眼斑
    float wb = sA(yn - (-0.28 + 0.12 * sin(u * 6.0)), aw * 2.0) * step(0.22, u);
    float eye = sA(length(vec2((u - 0.8) * uSAsp * 0.55, yn - 0.3)) - 0.17, aw);
    pc = mix(uSC0, uSC1, max(wb, eye)); m = 1.0; belly = 0.0;
  } else if (P == 24) {    // 纵棱 + 刺座
    float x = a * d * 3.0; float f = abs(fract(x) - 0.5); float w = fwidth(x) + 1e-4;
    m = sA(f - 0.06, w) * 0.65; pc = uSC1;
    vec2 p = vec2(x, u * d * 3.0); vec2 c = floor(p + 0.5); float dot2 = sA(length((p - c) * vec2(1.0, 1.4)) - 0.11, 0.03);
    pc = mix(pc, vec3(0.96, 0.94, 0.86), dot2); m = max(m, dot2);
  }
  m *= mix(1.0, mix(0.55, 1.0, smoothstep(-0.85, -0.2, yn)), belly);
  return vec4(mix(base, pc, clamp(m * uSA, 0.0, 1.0)), gl * uSA);
}
`;
// Fish 构造时（stylize 之后、skinFish 之前）调用：toon.stylizeMaterial 会重设 onBeforeCompile，所以花纹注入必须在它之后链上
export function applySynthPattern(model, syn) {
  const g = normGenome(syn);
  const P = model.userData.synPat || {};
  const pid = PAT_IDS[g.pat.k] ?? 0;
  const C = g.pal.map((c) => new THREE.Color(c));
  const glowK = 0.35 + (g.glow || 0) * 1.6;
  const shared = {
    uSP: { value: pid }, uSD: { value: +g.pat.d || 4 }, uSA: { value: clamp(+g.pat.a || 0.8, 0, 1) }, uSR: { value: +g.pat.r || 0 },
    uSAsp: { value: P.asp || 6 }, uSSeed: { value: ((P.seed || 1) % 9973) / 97.3 }, uSGlow: { value: g.glow || 0 },
    uSC0: { value: C[0] }, uSC1: { value: C[1] }, uSC2: { value: C[2] }, uSC3: { value: C[3] },
    uSGlowC: { value: C[2].clone().lerp(WHITE, 0.25).multiplyScalar(glowK) },
  };
  model.traverse((o) => {
    if (!o.isMesh || !o.userData.synBody) return;
    const m = o.material; if (!m || m.userData.synPat) return;
    m.userData.synPat = true;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.() || '';
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, shared);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aSyn;\nvarying vec3 vSyn;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSyn = aSyn;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSGlowC;\n' + SYN_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\nvec4 synP = synPattern(diffuseColor.rgb); diffuseColor.rgb = synP.rgb; float synGl = synP.w;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uSGlowC * synGl;');
    };
    m.customProgramCacheKey = () => prevKey + '-syn1';
    m.needsUpdate = true;
  });
}

// =====================================================================================
// 构建器：基因组 → THREE.Group（buildSynthModel）
//   造型词表与 synth.js SHAPES 对齐；未知 id 一律回退到最接近的通用形状（不崩）
// =====================================================================================
const AX = { x: V3(1, 0, 0), y: V3(0, 1, 0), z: V3(0, 0, 1) };
const ALIAS = {
  plan: { round: 'globe', ball: 'globe', long: 'eel', snake: 'eel', square: 'box', cube: 'box' },
  head: { hammerhead: 'hammer', sword: 'bill', beak: 'bill', round2: 'round' },
  mouth: { teeth: 'fang', jaw: 'underbite', beard: 'whisker', open: 'gape' },
  dor: { spines: 'spiny', spike: 'spiny', spikes: 'spiny', comb: 'crest', toothed: 'saw', umbrella: 'canopy', mushroom: 'cap', pizza: 'wedge', feather: 'quill' },
  tail: { moon: 'lunate', crescent: 'lunate', double: 'fork', heel: 'stiletto', scissors: 'shears', keyring: 'ring', spiral: 'curl', oar: 'paddle', flame: 'rocket', sword: 'swallow' },
  pect: { normal: 'std', bowtie: 'bow', wings: 'wing', flipper: 'paddle', legs: 'leg', skirt: 'frill' },
};
const KNOWN = {
  plan: ['fusiform', 'deep', 'globe', 'eel', 'flat', 'box', 'seg', 'disc', 'hourglass', 'diamond'],
  head: ['round', 'pointed', 'blunt', 'bevel', 'snub', 'dome', 'tube', 'bill', 'hammer', 'spout'],
  mouth: ['smile', 'gape', 'beak', 'fang', 'tube', 'underbite', 'sucker', 'whisker', 'none'],
  dor: ['none', 'shark', 'sail', 'spiny', 'crest', 'ribbon', 'fan', 'finlet', 'lid', 'canopy', 'handle', 'key', 'gear', 'quill', 'wedge', 'saw', 'cap', 'crystal'],
  tail: ['fork', 'lunate', 'round', 'fan', 'swallow', 'shark', 'fluke', 'whip', 'lobe', 'stiletto', 'ribbon', 'paddle', 'hook', 'ring', 'shears', 'feather', 'anchor', 'curl', 'leaf', 'rocket', 'none'],
  pect: ['std', 'long', 'wing', 'fan', 'frill', 'leg', 'paddle', 'bow', 'none'],
};
const KSET = Object.fromEntries(Object.entries(KNOWN).map(([k, a]) => [k, new Set(a)]));
export const SYN_SHAPES = KNOWN;   // 构建器实际支持的造型 id（调试 / 自测用）
function shapeOf(kind, v, def) { let s = String(v ?? def); s = ALIAS[kind]?.[s] || s; return KSET[kind].has(s) ? s : def; }
function hashStr(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }

// 变径管（触手 / 角 / 眼柄 / 鞭尾 / 项链…）：外法线朝外（与 marine bodyGeometry 同绕序），两端封口
function tubeGeo(pts, r0, r1 = r0, o = {}) {
  const radial = o.radial ?? 8, seg = o.seg ?? 16, closed = !!o.closed;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p.clone() : V3(...p))), closed, 'catmullrom', 0.5);
  const fr = curve.computeFrenetFrames(seg, closed);
  const pos = [], idx = [], P = V3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(closed ? t % 1 : t, P);
    const N = fr.normals[i], B = fr.binormals[i];
    const rb = o.prof ? o.prof(t) : lerp(r0, r1, t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const r = Math.max(1e-4, rb * (o.rib ? 1 + o.rib * Math.cos(a * (o.ribN || 6) + t * (o.twist || 0)) : 1));
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(P.x + r * (ca * N.x + sa * B.x), P.y + r * (ca * N.y + sa * B.y), P.z + r * (ca * N.z + sa * B.z));
      if (i < seg && j < radial) { const A = i * (radial + 1) + j, C = A + radial + 1; idx.push(A, A + 1, C, A + 1, C + 1, C); }
    }
  }
  if (!closed) {
    const c0 = curve.getPointAt(0), c1 = curve.getPointAt(1), i0 = pos.length / 3, b = seg * (radial + 1);
    pos.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
    for (let j = 0; j < radial; j++) { idx.push(i0, j + 1, j); idx.push(i0 + 1, b + j, b + j + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
function smoothPts(points, k = 4) {
  const c = new THREE.CatmullRomCurve3(points.map(([x, y]) => V3(x, y, 0)), true, 'catmullrom', 0.35);
  return c.getPoints(points.length * k).slice(0, -1).map((p) => [p.x, p.y]);
}
// 实心挤出板（器物部件）：在 XY 平面、z 居中
function plateGeo(pts, depth, o = {}) {
  const P = o.smooth ? smoothPts(pts, o.smooth) : pts;
  const sh = new THREE.Shape(P.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of o.holes || []) sh.holes.push(h);
  const bev = o.bevel ?? depth * 0.35;
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: o.bs ?? 2, steps: 1, curveSegments: o.cs ?? 8 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}
const circlePath = (x, y, r, cw = true) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, TAU, cw); return p; };
const lathe = (prof, seg = 16) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg);
// 以法线为 +z 的局部基（x 尽量对齐鼻尖方向）
function quatN(n, fwd = AX.x) {
  const z = n.clone().normalize();
  let x = fwd.clone().addScaledVector(z, -fwd.dot(z));
  if (x.lengthSq() < 1e-6) x = AX.y.clone().addScaledVector(z, -z.y);
  x.normalize();
  const y = z.clone().cross(x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
const quatY = (dir) => new THREE.Quaternion().setFromUnitVectors(AX.y, dir.clone().normalize());

// ---------------- 构建上下文 ----------------
function makeCtx(g, seed) {
  const s = new Sculpture();
  s.sphere = new THREE.SphereGeometry(1, 14, 10);   // 低面数共享球（眼睛 / 小球部件）
  const F = makeField(g);
  const pal = g.pal;
  const names = {};
  const mats = new Map();
  const C = {
    s, g, F, pal, R: rng(seed ^ 0x9e3779b9), L: F.L, H: F.H, S: F.S, pk: F.pk,
    th: 0.013 * F.L / 1.6,                                  // 鳍膜厚度随体长
    finC: mixc(pal[3], pal[0], 0.12),
    uNeck: F.pk + (1 - F.pk) * 0.2, uHT: F.pk + (1 - F.pk) * 0.45,
    asym: clamp(+g.asym || 0, 0, 1),
    nm(base) { names[base] = (names[base] || 0) + 1; return names[base] > 1 ? `${base}-${names[base]}` : base; },
    // 器物 / 皮肤材质（缓存）：kind 见 MATS；wet 交给 fishmat 做湿润鱼皮
    mat(color, kind = 'wet', o = {}) {
      const key = `${hex(color)}|${kind}|${o.glow || 0}|${o.side || 0}|${o.glowColor || ''}`;
      let m = mats.get(key); if (!m) { m = physMat(color, kind, o); mats.set(key, m); } return m;
    },
    skin(color = pal[0]) { return C.mat(color, g.mat, g.mat === 'glow' ? { glow: 0.15 + 0.25 * (g.glow || 0) } : {}); },
    add(base, geo, mat, parent = s.root) {
      const m = new THREE.Mesh(geo, mat); m.name = C.nm(base); m.castShadow = true; m.receiveShadow = true;
      parent.add(m); s.parts[m.name] = m; return m;
    },
    group(base, pos = [0, 0, 0], parent = s.root) { return s.group(C.nm(base), pos, parent); },
    ball(base, pos, scl, mat, parent = s.root) { const m = C.add(base, s.sphere, mat, parent); m.position.copy(pos); m.scale.set(...scl); m.geometry.userData.shared = true; return m; },
    tube(base, pts, r0, r1, mat, o, parent) { return C.add(base, tubeGeo(pts, r0, r1, o), mat, parent); },
    // 头部 / 体表定位
    surf(u, a, ex = 1) { return F.pt(u, a, ex); },
    headTop(u = C.uHT) { return V3(F.x(u), F.top(u), 0); },
  };
  // 器物主材：体表本身是金属 / 瓷 / 金 → 器物跟随；否则按部件默认
  C.solidKind = (def) => (['metal', 'brass', 'gold', 'ceramic', 'glaze', 'crystal', 'pearl'].includes(g.mat) ? g.mat : def);
  return C;
}

// ---------------- 身体 + 头型附件 ----------------
function buildBody(C) {
  const { g, F, pal } = C;
  const bm = physMat('#ffffff', g.mat, { vc: true, glow: g.mat === 'glow' ? 0.14 + 0.3 * (g.glow || 0) : 0, glowColor: mixc(pal[0], pal[2], 0.5) });
  const body = C.add('body', bodyGeometry(F, g, pal[0], pal[1]), bm);
  body.userData.synBody = true;
  C.body = body;
}
function buildHeadExtras(C) {
  const { g, F, L, s } = C;
  if (g.head === 'hammer') {
    const u = F.pk + (1 - F.pk) * 0.8, h = F.ht(u) + F.hb(u);
    const span = Math.max(F.wz(u) * 2.3, 0.15 * L);
    const cy = F.yc(u) + 0.1 * F.ht(u);
    const geo = tubeGeo([[0, 0, -span], [0, 0, -span * 0.3], [0, 0, span * 0.3], [0, 0, span]], 1, 1, { radial: 12, seg: 16, prof: (t) => 0.25 + 0.75 * Math.sin(PI * clamp(t * 1.04 - 0.02, 0, 1)) ** 0.3 });
    geo.scale(Math.max(0.055 * L, h * 0.25), h * 0.2, 1);
    const m = C.add('syn-hammer', geo, C.skin(mixc(g.pal[0], g.pal[1], 0.15)));
    m.position.set(F.x(u) - 0.01 * L, cy, 0);
    C.hammerTips = [-1, 1].map((sd) => ({ p: V3(F.x(u) - 0.005 * L, cy + 0.005 * L, sd * span * 0.93), n: V3(0.35, 0.15, sd).normalize(), side: sd }));
  } else if (g.head === 'spout') {
    const u = F.pk + (1 - F.pk) * 0.82, r0 = Math.max(0.2 * F.ht(u), 0.018 * L);
    const b = V3(F.x(u), F.yc(u) - 0.1 * F.hb(u), 0);
    const pts = [b, b.clone().add(V3(0.1 * L, 0.0 * L, 0)), b.clone().add(V3(0.2 * L, 0.06 * L, 0)), b.clone().add(V3(0.25 * L, 0.15 * L, 0))];
    C.tube('syn-spout', pts, r0, r0 * 0.45, C.skin(), { radial: 12, seg: 16 });
    const lip = C.add('syn-spout-lip', new THREE.TorusGeometry(r0 * 0.5, r0 * 0.12, 6, 16), C.skin(shade(g.pal[0], 0.92)));
    lip.position.copy(pts[3]); lip.quaternion.copy(quatN(V3(0.45, 1, 0)));
    C.noseTip = pts[3];
  } else if (g.head === 'bill') {
    const u = 0.965, r0 = Math.max(0.3 * F.ht(u), 0.012 * L);
    const b = V3(F.x(u), F.yc(u) + 0.15 * F.ht(u), 0), len = 0.3 * L;
    C.tube('syn-bill', [b, b.clone().add(V3(len * 0.5, -0.004 * L, 0)), b.clone().add(V3(len, 0.004 * L, 0))], r0, r0 * 0.08, C.skin(shade(g.pal[0], 0.85)), { radial: 10, seg: 12 });
    C.billEnd = b.clone().add(V3(len, 0, 0)); C.billBase = b;
  }
}

// ---------------- 眼睛：0~8 只 / 眼柄 / 望远镜 / 锤头两端 / 比目鱼式偏眼 ----------------
function buildEyes(C) {
  const { g, F, L, S, s } = C;
  const n = clamp(Math.round(+g.eyes.n), 0, 8); if (!n) return;
  const k = clamp(+g.eyes.k || 1, 0.4, 2.2);
  const uE = F.pk + (1 - F.pk) * (g.head === 'bill' ? 0.4 : g.head === 'tube' ? 0.2 : 0.55);
  const r = clamp(0.2 * F.ht(uE), 0.022 * L, 0.058 * L) * k;
  const iris = mixc(g.pal[2], '#f2deb0', 0.55);
  const du = (2.5 * r) / L;
  const spots = [];
  const A = [0.95, 1.5, 0.5, 1.95], DU = [0, -1, -1.9, -0.6];
  if (n === 1) spots.push({ u: uE + (1 - uE) * 0.22, a: 1e-3, r: r * 1.35, side: 0 });
  else {
    const pairs = Math.floor(n / 2);
    for (let i = 0; i < pairs; i++) {
      const u = clamp(uE + DU[i % 4] * du, F.pk * 0.8, 0.97), rr = r * (1 - Math.min(i, 3) * 0.14);
      spots.push({ u, a: A[i % 4], r: rr, side: 1 }, { u, a: -A[i % 4], r: rr, side: -1 });
    }
    if (n % 2) spots.push({ u: Math.min(uE + du * 0.6, 0.97), a: 1e-3, r: r * 0.8, side: 0 });
  }
  if (C.asym > 0.6 && n === 2) spots[1] = { u: Math.min(uE + du * 0.9, 0.97), a: 0.42, r: r * 0.95, side: 1 };   // 比目鱼：双眼长到同一侧
  const stalk = clamp(+g.eyes.stalk || 0, 0, 1), lens = clamp(+g.eyes.lens || 0, 0, 1);
  spots.forEach((e, i) => {
    let p, nn;
    if (C.hammerTips && e.side && i < 2) { const t = C.hammerTips[e.side > 0 ? 1 : 0]; p = t.p.clone(); nn = t.n.clone(); }
    else { p = F.pt(e.u, e.a); nn = F.nrm(e.u, e.a); }
    const er = e.r * (1 + C.asym * 0.35 * (e.side || 0) * (i % 3 === 0 ? 1 : -1));
    const name = i === 0 ? 'eye-left' : i === 1 && spots[1].side < 0 ? 'eye-right' : `eye-${i + 1}`;
    if (stalk > 0.05) {   // 眼柄：先向上再外翻
      const dir = nn.clone().multiplyScalar(0.55).add(V3(0.12, 1, 0)).normalize();
      const len = (0.3 + 0.8 * stalk) * Math.max(S, 0.12 * L) * 0.7;
      const tip = p.clone().addScaledVector(dir, len);
      const mid = p.clone().addScaledVector(dir, len * 0.5).addScaledVector(nn, len * 0.12);
      C.tube('syn-stalk', [p.clone().addScaledVector(nn, -er * 0.3), mid, tip], er * 0.36, er * 0.26, C.skin(), { radial: 8, seg: 10 });
      p = tip; nn = V3(0.25, 0.25, e.side || 0.001).normalize();
    }
    if (lens > 0.05) {    // 伸缩望远镜筒（黄铜三节）
      const brass = C.mat(mixc('#c9a14a', g.pal[2], 0.15), 'brass');
      let q = p.clone().addScaledVector(nn, -er * 0.25), rr = er * 0.72;
      for (let j = 0; j < 3; j++) {
        const len = er * (0.62 - j * 0.08) * (0.6 + lens * 0.6);
        const cyl = C.add('prop-scope', new THREE.CylinderGeometry(rr, rr, len, 14, 1, true), C.mat(j % 2 ? shade(g.pal[0], 0.9) : mixc('#c9a14a', g.pal[2], 0.15), j % 2 ? 'satin' : 'brass', { side: THREE.DoubleSide }));
        cyl.position.copy(q).addScaledVector(nn, len / 2); cyl.quaternion.copy(quatY(nn));
        const ring = C.add('prop-scope-ring', new THREE.TorusGeometry(rr * 1.02, rr * 0.1, 6, 16), brass);
        ring.position.copy(q).addScaledVector(nn, len); ring.quaternion.copy(quatN(nn));
        q.addScaledVector(nn, len); rr *= 1.12;
      }
      p = q.addScaledVector(nn, -er * 0.15);
    }
    const grp = new THREE.Group(); grp.name = `${name}-socket`;
    grp.position.copy(p).addScaledVector(nn, -er * 0.16); grp.quaternion.copy(quatN(nn));
    s.root.add(grp);
    s.eye(name, [0, 0, 0], er, 1, grp, iris);
  });
}

// ---------------- 嘴型 ----------------
function uAtRadius(F, rad) { for (let u = 0.999; u > F.pk; u -= 0.004) if (Math.min(F.ht(u), F.wz(u)) >= rad) return u; return F.pk; }
function buildMouth(C) {
  const { g, F, L, S, pal } = C;
  const k = shapeOf('mouth', g.mouth, 'smile'); if (k === 'none') return;
  const dark = mixc(shade(pal[0], 0.35), '#1d1418', 0.4), teethM = C.mat('#f3eee4', 'glaze'), lipM = C.skin(mixc(pal[0], pal[1], 0.4));
  const uC = g.head === 'bill' ? 0.955 : 0.968;
  const cL = F.pt(uC, 0.68 * PI, 1.01), cR = F.pt(uC, -0.68 * PI, 1.01);
  const tipX = g.head === 'bill' ? F.x(0.975) : F.x(0.997);
  const tip = V3(tipX, lerp(F.yc(0.995), F.bot(0.99), 0.5) - 0.004 * L, 0);
  const rm = clamp(0.012 * S + 0.004 * L, 0.006, 0.05);
  const line = () => C.tube('mouth', [cL, tip.clone().add(V3(0.004 * L, -0.002 * L, 0)), cR], rm, rm, C.mat(dark, 'matte'), { radial: 6, seg: 10 });
  if (k === 'smile') line();
  else if (k === 'fang' || k === 'whisker') {
    line();
    if (k === 'fang') for (const sd of [-1, 1]) {
      const b = tip.clone().lerp(sd > 0 ? cL : cR, 0.45), len = clamp(0.06 * S + 0.012 * L, 0.02, 0.12);
      const f = C.add('prop-fang', new THREE.ConeGeometry(len * 0.22, len, 8), teethM); f.position.copy(b).add(V3(0, -len * 0.42, 0)); f.rotation.x = PI; f.rotation.z = -0.15;
    }
    else for (const sd of [-1, 1]) for (const j of [0, 1]) {
      const b = (sd > 0 ? cL : cR).clone(), len = (0.3 - j * 0.1) * L;
      C.tube('prop-barbel', [b, b.clone().add(V3(0.02 * L, -0.06 * L, sd * 0.02 * L)), b.clone().add(V3(-len * 0.4, -len * 0.45, sd * (0.05 + j * 0.03) * L)), b.clone().add(V3(-len * 0.8, -len * 0.35, sd * (0.06 + j * 0.05) * L))], rm * 0.9, rm * 0.2, C.skin(shade(pal[3], 0.85)), { radial: 5, seg: 12 });
    }
  } else if (k === 'gape' || k === 'sucker') {
    const Rm = clamp(0.36 * Math.min(F.ht(0.9), F.wz(0.9) * 1.2), 0.03 * L, 0.13 * L);
    const u = uAtRadius(F, Rm * 1.12), cy = F.yc(u) - (k === 'gape' ? 0.18 * F.hb(u) : 0);
    const c = V3(F.x(u) + Rm * 0.12, cy, 0);
    const hole = C.ball('mouth-hole', c.clone().add(V3(-Rm * 0.05, 0, 0)), [Rm * 0.35, Rm * 0.82, Rm * 0.82], C.mat('#241a1e', 'matte'));
    const ring = C.add(k === 'gape' ? 'mouth-lip' : 'mouth-sucker', new THREE.TorusGeometry(Rm * 0.9, Rm * (k === 'gape' ? 0.2 : 0.28), 10, 28), k === 'gape' ? C.mat(mixc(pal[1], '#ffffff', 0.2), C.solidKind('glaze')) : lipM);
    ring.position.copy(c); ring.rotation.y = PI / 2; ring.scale.set(1, k === 'gape' ? 0.82 : 1, 1);
    if (k === 'sucker') for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; C.ball('prop-tooth', c.clone().add(V3(Rm * 0.06, Math.cos(a) * Rm * 0.58, Math.sin(a) * Rm * 0.58)), [Rm * 0.07, Rm * 0.11, Rm * 0.07], teethM); }
    void hole;
  } else if (k === 'beak') {
    const u = 0.93, b = V3(F.x(u), F.yc(u), 0), h = Math.max(F.ht(u), 0.04 * L), len = clamp(0.5 * h, 0.04 * L, 0.14 * L);
    const bm = C.mat(mixc(pal[1], '#e6d7b4', 0.55), 'glaze');
    C.tube('prop-beak', [b.clone().add(V3(0, h * 0.15, 0)), b.clone().add(V3(len * 0.7, h * 0.05, 0)), b.clone().add(V3(len * 1.15, -h * 0.25, 0))], h * 0.42, h * 0.04, bm, { radial: 10, seg: 10 });
    C.tube('prop-beak', [b.clone().add(V3(0, -h * 0.3, 0)), b.clone().add(V3(len * 0.6, -h * 0.34, 0)), b.clone().add(V3(len * 0.9, -h * 0.22, 0))], h * 0.3, h * 0.04, bm, { radial: 10, seg: 8 });
  } else if (k === 'tube') {
    const u = 0.975, b = V3(F.x(u), F.yc(u) - 0.1 * F.hb(u), 0), r0 = clamp(0.25 * F.ht(0.95), 0.008 * L, 0.04 * L), len = 0.12 * L;
    C.tube('syn-snout', [b, b.clone().add(V3(len * 0.6, -0.004 * L, 0)), b.clone().add(V3(len, 0, 0))], r0, r0 * 0.8, C.skin(), { radial: 10, seg: 8 });
    const lip = C.add('mouth-lip', new THREE.TorusGeometry(r0 * 0.75, r0 * 0.28, 6, 14), lipM); lip.position.copy(b).add(V3(len, 0, 0)); lip.rotation.y = PI / 2;
  } else if (k === 'underbite') {
    line();
    const jaw = C.ball('syn-jaw', tip.clone().add(V3(0.004 * L, -0.012 * L, 0)), [0.035 * L, 0.018 * L + 0.1 * F.hb(0.97), Math.max(F.wz(0.95), 0.025 * L)], C.skin(mixc(pal[0], pal[1], 0.5)));
    for (const z of [-0.6, 0, 0.6]) { const t = C.add('prop-tooth', new THREE.ConeGeometry(0.006 * L, 0.022 * L, 6), teethM); t.position.copy(jaw.position).add(V3(0.02 * L, jaw.scale.y * 0.9, z * jaw.scale.z * 0.7)); }
  }
}

// ---------------- 正中鳍（背鳍 / 臀鳍）：轮廓 [[s, h]]，s 沿鳍基 前→后（可 >1 拖到身后），h 为高度倍数；鳍基贴着体表曲线并略陷入 ----------------
function medianFin(C, name, uF, uB, hD, outline, color, o = {}) {
  const { F } = C;
  const xF = F.x(uF), len = xF - F.x(uB), sg = o.down ? -1 : 1, sink = o.sink ?? 0.05 * C.S;
  const yAt = (s) => { const u = clamp(lerp(uF, uB, s), 0, 1); return o.down ? F.bot(u) : F.top(u); };
  const pts = outline.map(([s, h]) => [xF - s * len, yAt(s) + sg * h * hD]);
  for (let i = 6; i >= 0; i--) { const s = i / 6; pts.push([xF - s * len, yAt(s) - sg * sink]); }
  const fin = C.s.fin(C.nm(name), pts, color, [0, 0, 0], [0, 0, 0], o.parent || C.s.root, o.thick || C.th);
  return { fin, xF, len, yAt, P: (s, h) => V3(xF - s * len, yAt(s) + sg * h * hD, 0) };
}
const OUT = {
  shark: [[0, 0], [0.3, 0.72], [0.5, 0.98], [0.62, 1.0], [0.6, 0.8], [0.78, 0.3], [1, 0.04]],
  sail: [[0, 0], [0.04, 0.9], [0.2, 1.05], [0.5, 1.0], [0.8, 0.72], [0.96, 0.32], [1, 0.03]],
  crest: [[0, 0], [0.06, 0.8], [0.3, 1], [0.7, 0.95], [0.95, 0.6], [1.02, 0.1]],
  ribbon: [[0, 0], [0.08, 0.95], [0.3, 0.72], [0.7, 0.55], [1.05, 0.48], [1.35, 0.3], [1.55, 0.1], [1.2, 0.05], [1.0, 0.02]],
  anal: [[0, 0], [0.25, 0.85], [0.45, 1], [0.62, 0.72], [1, 0.05]],
};
function buildDorsal(C, d, tag = 'dorsal') {
  const { g, F, L, H, S, pk, pal, s } = C;
  const k = shapeOf('dor', d?.k, 'shark'); if (k === 'none') return;
  const hK = clamp(+d.h || 1, 0.25, 2.4), lK = clamp(+d.l || 1, 0.25, 3);
  const hD = (0.5 * H + 0.22 * S) * hK;
  const lu = clamp(0.28 * lK, 0.08, 0.75), c = clamp(Number.isFinite(+d.x) ? +d.x : 0.5, 0.2, 0.8);
  const uMax = pk + (1 - pk) * 0.22;
  const span = (l2) => { const uF = Math.min(c + l2 / 2, uMax); return [uF, Math.max(uF - l2, 0.04)]; };
  const grp = C.group(tag); grp.rotation.x = C.asym * 0.12 * (tag === 'dorsal' ? 1 : -1);
  const fin = C.finC, sink = 0.05 * S;
  const top = (u) => F.top(u);
  const solid = (col, kind, o) => C.mat(col, C.solidKind(kind), o);
  const mf = (nm, sp, h, out, col = fin, o = {}) => medianFin(C, nm, sp[0], sp[1], h, out, col, { parent: grp, ...o });
  switch (k) {
    case 'shark': case 'sail': case 'crest': case 'ribbon': {
      const sp = span(k === 'sail' ? lu * 1.7 : k === 'crest' ? lu * 2.2 : k === 'ribbon' ? lu * 1.2 : lu);
      const r = mf(`${tag}-fin`, sp, hD * (k === 'sail' ? 1.35 : k === 'crest' ? 0.5 : k === 'ribbon' ? 0.8 : 1), OUT[k]);
      if (k === 'ribbon') s.wiggle(r.fin, 'x', 0.05, 2.2, 0.5);
      break;
    }
    case 'spiny': case 'saw': {
      const sp = span(lu * (k === 'saw' ? 1.3 : 1.1)), n = clamp(Math.round(5 + lK * 3), 5, 12), out = [[0, 0]];
      const peaks = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), s0 = 0.03 + t * 0.9, h = lerp(1, 0.5, t) * (i === 0 ? 0.85 : 1);
        if (k === 'saw') { out.push([s0 + 0.035, h], [s0 + 0.07, h * 0.5]); }
        else { out.push([s0, h * 0.72]); if (i < n - 1) out.push([s0 + 0.45 / (n - 1) * 0.9 * 2, h * 0.38]); }
        peaks.push([s0, h]);
      }
      out.push([1, 0.04]);
      const r = mf(`${tag}-fin`, sp, hD, out);
      if (k === 'spiny') for (const [s0, h] of peaks) {
        const b = r.P(s0, -0.05), tip = r.P(s0 + 0.04, h * 1.12);
        s.spike(C.nm(`${tag}-spine`), [b.x, b.y, 0], [tip.x, tip.y, 0], 0.012 * S + 0.002 * L, shade(fin, 0.7), grp);
      }
      break;
    }
    case 'fan': {
      const sp = span(lu * 1.1), out = [[0, 0]], N = 11;
      for (let j = 1; j < N; j++) { const th = PI * (1 - j / N); out.push([0.5 + 0.5 * Math.cos(th), Math.sin(th) * (j % 2 ? 1 : 0.9)]); }
      out.push([1, 0.02]);
      const r = mf(`${tag}-fan`, sp, hD * 1.1, out);
      const stick = C.mat(mixc(pal[2], '#2a2224', 0.2), C.solidKind('glaze'));
      const b = r.P(0.5, -0.1);
      for (let j = 1; j < N; j += 2) { const th = PI * (1 - j / N), tip = r.P(0.5 + 0.48 * Math.cos(th), Math.sin(th) * 1.02); C.tube('prop-fanstick', [b, tip], 0.006 * S + 0.0015 * L, 0.004 * S + 0.001 * L, stick, { radial: 5, seg: 2 }, grp); }
      break;
    }
    case 'finlet': {
      const col = mixc(fin, pal[2], 0.5);
      for (let i = 0; i < 6; i++) { const u = lerp(Math.min(c, uMax), 0.08, i / 5); mf(`${tag}-finlet`, [u + 0.02, u - 0.02], hD * 0.38 * (1 - i * 0.08), OUT.shark, col); }
      break;
    }
    case 'key': {   // 黄铜钥匙齿：直柄 + 高低齿 + 斜尖（钥匙环在尾巴 tail:'ring'）
      const [uF, uB] = span(lu * 1.4), xF = F.x(uF), len = xF - F.x(uB), hs = hD * 0.3;
      const P = (s, off) => [xF - s * len, top(clamp(lerp(uF, uB, s), 0, 1)) + off];
      const pts = [P(0, -sink), P(-0.03, hs * 0.55), P(0.03, hs)];
      const nT = 6;
      for (let j = 0; j < nT; j++) { const s0 = 0.1 + j * 0.72 / nT, w = 0.72 / nT, t = hD * 0.55 * (0.35 + 0.65 * C.R()); pts.push(P(s0, hs), P(s0 + w * 0.22, hs + t), P(s0 + w * 0.62, hs + t), P(s0 + w * 0.86, hs)); }
      pts.push(P(0.9, hs), P(0.94, hs * 1.35), P(1, hs * 1.35), P(1, -sink));
      for (let i = 9; i >= 1; i--) pts.push(P(i / 10, -sink));
      const dep = 0.028 * S + 0.006 * L;
      C.add('prop-key', plateGeo(pts, dep, { bevel: dep * 0.18, bs: 1 }), solid(mixc(pal[0], '#d8b25e', 0.35), 'brass'), grp);
      const gp = []; for (let i = 0; i <= 8; i++) gp.push(P(0.04 + i * 0.11, hs * 0.42));
      for (const sd of [-1, 1]) { const t = C.tube('prop-key-groove', gp.map(([x, y]) => V3(x, y, sd * dep * 0.62)), dep * 0.16, dep * 0.16, solid(shade(mixc(pal[0], '#d8b25e', 0.35), 0.62), 'brass'), { radial: 5, seg: 12 }, grp); void t; }
      break;
    }
    case 'lid': {   // 马桶盖：贴背的椭圆座圈 + 向后掀起的盖板 + 铰链
      const R = clamp(0.62 * hD, 0.06 * L, 0.2 * L), xc = F.x(c), yc = top(c);
      const cer = solid(mixc(pal[0], '#ffffff', 0.18), 'ceramic');
      const seat = C.add('prop-seat', new THREE.TorusGeometry(R, R * 0.16, 8, 30), cer, grp);
      seat.rotation.x = PI / 2; seat.scale.set(1.22, 1, 1); seat.position.set(xc, yc - R * R / (2.4 * Math.max(H, R)) + R * 0.06, 0);
      const hinge = C.group('prop-lid-hinge', [xc - R * 1.26, seat.position.y + R * 0.1, 0], grp);
      hinge.rotation.z = 0.3;
      const a = R * 1.02, b = R * 1.2, ell = [];
      for (let i = 0; i < 28; i++) { const t = (i / 28) * TAU; ell.push([a * Math.cos(t), b + b * Math.sin(t) * (Math.sin(t) < 0 ? 0.92 : 1)]); }
      const lid = C.add('prop-lid', plateGeo(ell, R * 0.08, { bevel: R * 0.035 }), cer, hinge); lid.rotation.y = PI / 2;
      const chrome = C.mat('#d9dde0', 'metal');
      for (const z of [-0.55, 0.55]) { const h = C.add('prop-hinge', new THREE.CylinderGeometry(R * 0.07, R * 0.07, R * 0.3, 10), chrome, hinge); h.rotation.x = PI / 2; h.position.set(0, R * 0.02, z * R); }
      s.wiggle(hinge, 'z', 0.05, 1.3);
      break;
    }
    case 'canopy': {   // 伞盖：伞骨下垂的扇形分瓣 + 伞尖
      const Rc = clamp(hD * 0.85, 0.08 * L, 0.24 * L), hc = hD * 0.8, base = V3(F.x(c), top(c) - sink, 0);
      const um = C.group('prop-umbrella', [base.x, base.y, 0], grp); um.rotation.z = 0.28;
      const gold = C.mat(mixc(pal[2], '#c8a35a', 0.3), C.solidKind('brass'));
      C.tube('prop-shaft', [V3(0, 0, 0), V3(0, hc * 1.05, 0)], Rc * 0.035, Rc * 0.035, gold, { radial: 6, seg: 2 }, um);
      const geo = lathe([[0, Rc * 0.42], [Rc * 0.32, Rc * 0.38], [Rc * 0.66, Rc * 0.24], [Rc, 0]], 32), P = geo.getAttribute('position');
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), rr = Math.hypot(x, z) / Rc, ph = Math.atan2(z, x); P.setY(i, P.getY(i) - Rc * 0.12 * rr * rr * (1 - Math.abs(Math.cos(4 * ph)))); }
      geo.computeVertexNormals();
      const cv = C.add('prop-canopy', geo, C.mat(pal[0], C.solidKind('satin'), { side: THREE.DoubleSide }), um); cv.position.y = hc;
      for (let j = 0; j < 8; j++) { const ph = (j / 8) * TAU, pts = []; for (let i = 0; i <= 4; i++) { const r = Rc * i / 4; pts.push(V3(Math.cos(ph) * r, hc + Rc * 0.42 * (1 - (i / 4) ** 1.6) + Rc * 0.012, Math.sin(ph) * r)); } C.tube('prop-rib', pts, Rc * 0.016, Rc * 0.012, gold, { radial: 4, seg: 8 }, um); }
      C.ball('prop-finial', V3(0, hc + Rc * 0.47, 0), [Rc * 0.06, Rc * 0.1, Rc * 0.06], gold, um);
      break;
    }
    case 'handle': {   // 提梁：半圆拱
      const Rh = clamp(lu * L * 0.45, 0.07 * L, 0.2 * L) * Math.sqrt(hK), mat = C.mat(mixc(pal[2], pal[0], 0.3), C.solidKind('ceramic'));
      const arc = C.add('prop-handle', new THREE.TorusGeometry(Rh, Rh * 0.11, 10, 30, PI), mat, grp);
      arc.position.set(F.x(c), top(c) - Rh * 0.15, 0); arc.scale.set(1, 0.85 + 0.25 * hK, 1);
      for (const sd of [-1, 1]) C.ball('prop-handle-knob', V3(F.x(c) + sd * Rh, top(clamp(c + sd * Rh / L, 0, 1)) + Rh * 0.02, 0), [Rh * 0.2, Rh * 0.14, Rh * 0.2], mat, grp);
      break;
    }
    case 'gear': {   // 齿轮：齿形挤出 + 减重孔 + 啮合小齿轮（嘀嗒摆动）
      const R = clamp(hD * 0.75, 0.06 * L, 0.2 * L);
      const gearGeo = (Rg, nT) => {
        const pts = [], r0 = Rg * 0.8;
        for (let i = 0; i < nT; i++) { const a0 = (i / nT) * TAU, p = TAU / nT; for (const [f, r] of [[0, r0], [0.1, Rg], [0.4, Rg], [0.5, r0]]) pts.push([Math.cos(a0 + f * p) * r, Math.sin(a0 + f * p) * r]); }
        const holes = [circlePath(0, 0, Rg * 0.16)];
        for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; holes.push(circlePath(Math.cos(a) * Rg * 0.5, Math.sin(a) * Rg * 0.5, Rg * 0.15)); }
        return plateGeo(pts, Rg * 0.12, { bevel: Rg * 0.02, bs: 1, holes, cs: 6 });
      };
      const metal = C.mat(mixc(pal[2], '#9aa3ab', 0.25), C.solidKind('metal')), hub = C.mat(pal[1], C.solidKind('metal'));
      const g1 = C.group('prop-gear', [F.x(c), top(c) + R * 0.12, 0], grp);
      C.add('prop-gear', gearGeo(R, 14), metal, g1);
      const hb = C.add('prop-gear-hub', new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.22, 14), hub, g1); hb.rotation.x = PI / 2;
      const r2 = R * 0.52, a2 = 2.45;
      const g2 = C.group('prop-gear', [g1.position.x + Math.cos(a2) * (R + r2) * 0.9, g1.position.y + Math.sin(a2) * (R + r2) * 0.9 - R * 0.35, -R * 0.02], grp);
      C.add('prop-gear', gearGeo(r2, 8), C.mat(mixc(pal[0], '#b5763a', 0.4), C.solidKind('brass')), g2);
      s.wiggle(g1, 'z', 0.35, 1.2); s.wiggle(g2, 'z', -0.35 * R / r2, 1.2);
      break;
    }
    case 'quill': {   // 翎羽：羽轴 + 两侧羽片（带两道裂口）
      const [uF] = span(lu), b = V3(F.x(uF), top(uF) - sink, 0), len = lu * L;
      const crv = new THREE.CatmullRomCurve3([b, b.clone().add(V3(-len * 0.25, hD * 0.6, 0)), b.clone().add(V3(-len * 0.75, hD * 1.15, 0)), b.clone().add(V3(-len * 1.15, hD * 1.3, 0))]);
      const N = 14, up = [], dn = [];
      for (let i = 0; i <= N; i++) {
        const t = 0.1 + 0.9 * i / N, p = crv.getPointAt(t), tg = crv.getTangentAt(t), nx = -tg.y, ny = tg.x;
        const w = hD * 0.3 * Math.sin(PI * clamp((t - 0.08) / 0.94, 0, 1)) ** 0.65;
        const notch = (i === 6 || i === 10) ? 0.45 : 1;
        up.push([p.x + nx * w, p.y + ny * w]); dn.push([p.x - nx * w * notch, p.y - ny * w * notch]);
      }
      const p0 = crv.getPointAt(0.1);
      s.fin(C.nm(`${tag}-quill`), [[p0.x, p0.y], ...up, ...dn.reverse()], fin, [0, 0, 0], [0, 0, 0], grp, C.th);
      C.tube('prop-rachis', crv.getPoints(10), 0.012 * S + 0.002 * L, 0.003 * S, C.mat(mixc(pal[1], '#ffffff', 0.3), 'satin'), { radial: 6, seg: 14 }, grp);
      break;
    }
    case 'wedge': {   // 披萨角：芝士三角 + 饼边 + 香肠片
      const w = clamp(lu * L, 0.1 * L, 0.32 * L) * 0.9, xc = F.x(c), y0 = top(c), dep = 0.035 * S + 0.004 * L;
      const A = [xc, y0 - hD * 0.2], B = [xc + w * 0.42, y0 + hD], D = [xc - w * 0.58, y0 + hD * 0.88];
      C.add('prop-wedge', plateGeo([A, B, D], dep, { bevel: dep * 0.25, bs: 1 }), C.mat(pal[0], C.solidKind('matte')), grp);
      C.tube('prop-crust', [V3(B[0] + w * 0.03, B[1] + hD * 0.02, 0), V3((B[0] + D[0]) / 2, (B[1] + D[1]) / 2 + hD * 0.07, 0), V3(D[0] - w * 0.03, D[1] + hD * 0.02, 0)], hD * 0.085, hD * 0.085, C.mat(pal[3], 'matte'), { radial: 8, seg: 10 }, grp);
      for (const [u1, u2] of [[0.25, 0.3], [0.5, 0.15], [0.2, 0.62]]) {
        const x = A[0] + (B[0] - A[0]) * u1 + (D[0] - A[0]) * u2, y = A[1] + (B[1] - A[1]) * u1 + (D[1] - A[1]) * u2;
        const pp = C.add('prop-pepperoni', new THREE.CylinderGeometry(w * 0.085, w * 0.085, dep * 1.35, 14), C.mat(pal[2], 'matte'), grp); pp.rotation.x = PI / 2; pp.position.set(x, y, 0);
      }
      break;
    }
    case 'cap': {   // 菌盖：短柄 + 圆顶 + 白点
      const Rc = clamp(hD * 0.65, 0.06 * L, 0.2 * L), base = V3(F.x(c), top(c) - sink, 0), hs = hD * 0.32;
      C.tube('prop-stipe', [base, base.clone().add(V3(0, hs, 0))], Rc * 0.3, Rc * 0.26, C.mat(pal[1], 'matte'), { radial: 10, seg: 2 }, grp);
      const cap = C.add('prop-cap', lathe([[0, Rc * 0.72], [Rc * 0.5, Rc * 0.64], [Rc * 0.86, Rc * 0.38], [Rc * 1.0, Rc * 0.08], [Rc * 0.92, 0], [Rc * 0.35, Rc * 0.04], [0, Rc * 0.03]], 20), C.mat(pal[0], C.solidKind('matte')), grp);
      cap.position.copy(base).add(V3(0, hs, 0)); cap.rotation.z = 0.12;
      for (let i = 0; i < 8; i++) {
        const ph = i * 2.4, t = 0.18 + 0.68 * ((i * 0.618) % 1), r = Rc * Math.sin(t * PI / 2) * 0.93, y = Rc * 0.7 * Math.cos(t * PI / 2) * 0.98;
        const nrm = V3(Math.cos(ph) * Math.sin(t * PI / 2), Math.cos(t * PI / 2) * 1.4, Math.sin(ph) * Math.sin(t * PI / 2)).normalize();
        const sp = C.ball('prop-cap-spot', V3(Math.cos(ph) * r, y, Math.sin(ph) * r), [Rc * 0.13, Rc * 0.04, Rc * 0.13], C.mat(pal[2], 'matte'), cap); sp.quaternion.copy(quatY(nrm));
      }
      break;
    }
    case 'crystal': {   // 六棱晶簇
      const base = V3(F.x(c), top(c) - sink * 1.5, 0), cm = physMat(pal[2], 'crystal', { glow: 0.2 + 0.4 * (g.glow || 0), glowColor: pal[2] }); cm.flatShading = true;
      for (let i = 0; i < 6; i++) {
        const r = hD * (0.09 + 0.05 * C.R()), h = hD * (0.45 + 0.75 * (i === 0 ? 1 : C.R()));
        const m = C.add('prop-crystal', lathe([[0, -r], [r, 0], [r, h], [0, h + r * 1.7]], 6), cm, grp);
        m.position.copy(base).add(V3((i - 2.5) * hD * 0.09, 0, (C.R() - 0.5) * hD * 0.12));
        m.rotation.set((C.R() - 0.5) * 0.7, C.R() * PI, (i - 2.5) * 0.17);
      }
      break;
    }
  }
}

// ---------------- 尾 ----------------
function buildTail(C) {
  const { g, F, L, H, S, s } = C;
  const k = shapeOf('tail', g.tail.k, 'fork');
  const n = (+g.tail.n >= 2 || g.tail.k === 'double') ? 2 : 1;
  const sK = clamp(+g.tail.s || 1, 0.4, 3.2);
  const h = Math.min((0.6 * H + 0.3 * S) * sK, (k === 'ribbon' || k === 'swallow' ? 0.32 : 0.5) * L), l = h * 0.95;
  for (let i = 0; i < n; i++) {
    const piv = C.group('tail', [F.x(0) + 0.012 * L, F.yc(0), 0]);
    if (n === 2) { piv.rotation.x = (i ? -1 : 1) * 0.5; piv.scale.setScalar(0.86); }
    piv.rotation.x += C.asym * 0.22;
    tailShape(C, k, piv, h, l);
    s.wiggle(piv, 'y', k === 'ribbon' || k === 'whip' ? 0.13 : 0.07, 3.8, i * 0.7);
  }
}
function tailShape(C, k, piv, h, l) {
  const { g, F, L, S, pal, s } = C;
  const fin = C.finC;
  const F2 = (pts, name = 'tail-fin', o = {}) => s.fin(C.nm(name), pts, o.color || fin, [0, 0, 0], o.rot || [0, 0, 0], piv, o.thick || C.th);
  const solid = (col, kind, o) => C.mat(col, C.solidKind(kind), o);
  let r0 = Math.max(F.ht(0.03), 0.012 * L);
  switch (k) {
    case 'none': return;
    case 'fork': F2([[0.06 * l, 0], [-l, h], [-l * 0.87, h * 0.33], [-l * 0.46, 0], [-l * 0.87, -h * 0.33], [-l, -h]]); return;
    case 'lunate': case 'fluke': {
      const p = [[0.06 * l, 0], [-l * 0.86, h], [-l * 1.05, h * 1.04], [-l * 0.68, h * 0.48], [-l * 0.43, 0], [-l * 0.68, -h * 0.48], [-l * 1.05, -h * 1.04], [-l * 0.86, -h]];
      F2(p, k === 'fluke' ? 'tail-fluke' : 'tail-fin', k === 'fluke' ? { rot: [PI / 2, 0, 0], thick: Math.max(C.th * 3.2, 0.04) } : {}); return;
    }
    case 'round': F2([[0.06 * l, 0], [-l * 0.4, h * 0.72], [-l * 0.85, h * 0.7], [-l * 1.06, h * 0.25], [-l * 1.06, -h * 0.25], [-l * 0.85, -h * 0.7], [-l * 0.4, -h * 0.72]]); return;
    case 'fan': {
      const p = [[0.06 * l, 0]];
      for (let j = 0; j <= 12; j++) { const th = lerp(0.95, -0.95, j / 12), r = l * 1.1 * (j % 2 ? 0.93 : 1); p.push([-r * Math.cos(th) + 0.04 * l, r * Math.sin(th) * h / l * 1.15]); }
      F2(p); return;
    }
    case 'swallow': F2([[0.06 * l, 0], [-l * 0.55, h * 0.55], [-l * 1.8, h * 1.2], [-l * 1.62, h * 0.98], [-l * 0.75, h * 0.22], [-l * 0.62, 0], [-l * 0.75, -h * 0.22], [-l * 1.62, -h * 0.98], [-l * 1.8, -h * 1.2], [-l * 0.55, -h * 0.55]]); return;
    case 'shark': { const q = h / 0.58; F2([[0.06, 0], [-0.31, 0.52], [-0.43, 0.58], [-0.36, 0.29], [-0.19, 0.035], [-0.4, -0.2], [-0.39, -0.27], [-0.18, -0.16]].map(([x, y]) => [x * q, y * q])); return; }
    case 'lobe': F2([[0.06 * l, 0], [-l * 0.45, h * 0.85], [-l * 0.75, h * 0.75], [-l * 0.7, h * 0.25], [-l * 1.15, h * 0.13], [-l * 1.25, 0], [-l * 1.15, -h * 0.13], [-l * 0.7, -h * 0.25], [-l * 0.75, -h * 0.75], [-l * 0.45, -h * 0.85]]); return;
    case 'whip': {
      C.tube('syn-whip', [V3(0.04 * l, 0, 0), V3(-l * 0.8, -h * 0.05, 0), V3(-l * 1.6, h * 0.04, h * 0.05), V3(-l * 2.5, h * 0.12, h * 0.12)], r0 * 0.9, r0 * 0.08, C.skin(), { radial: 7, seg: 20 }, piv);
      F2([[0.06 * l, 0], [-l * 0.3, h * 0.3], [-l * 0.5, h * 0.06], [-l * 0.5, -h * 0.06], [-l * 0.3, -h * 0.3]]); return;
    }
    case 'stiletto': {   // 细高跟：鞋底弧线的上叶 + 漆面细跟 + 鞋跟掌
      F2([[0.06 * l, 0], [-l * 0.4, h * 0.36], [-l * 1.15, h * 0.78], [-l * 1.26, h * 0.64], [-l * 0.6, h * 0.06], [-l * 0.2, -h * 0.12]]);
      const lac = C.mat(pal[0], C.solidKind('glaze'));
      const e = V3(-l * 0.4, -h * 1.15, 0);
      C.tube('prop-heel', [V3(-l * 0.08, -h * 0.04, 0), V3(-l * 0.26, -h * 0.5, 0), e], h * 0.1, h * 0.02, lac, { radial: 10, seg: 12 }, piv);
      C.ball('prop-heel-tip', e, [h * 0.045, h * 0.03, h * 0.045], C.mat('#141214', 'glaze'), piv);
      return;
    }
    case 'ribbon': {
      const p = F2([[0.06 * l, 0], [-l * 0.5, h * 0.62], [-l * 1.2, h * 0.5], [-l * 1.8, h * 0.24], [-l * 2.1, -h * 0.02], [-l * 1.65, -h * 0.2], [-l * 1.0, -h * 0.4], [-l * 0.4, -h * 0.48]]);
      s.wiggle(p, 'y', 0.08, 2.6, 1.1); return;
    }
    case 'paddle': F2([[0.06 * l, 0], [-l * 0.3, h * 0.35], [-l * 0.85, h * 0.62], [-l * 1.12, h * 0.4], [-l * 1.18, 0], [-l * 1.12, -h * 0.4], [-l * 0.85, -h * 0.62], [-l * 0.3, -h * 0.35]], 'tail-paddle', { thick: Math.max(0.05 * L / 1.6, 0.041) }); return;
    case 'hook': {   // 伞柄钩
      F2([[0.06 * l, 0], [-l * 0.35, h * 0.45], [-l * 0.48, h * 0.3], [-l * 0.48, -h * 0.3], [-l * 0.35, -h * 0.45]]);
      const m = solid(mixc(pal[2], '#8a5a2b', 0.25), 'glaze'), pts = [V3(0.04 * l, 0, 0), V3(-l * 0.6, h * 0.02, 0), V3(-l * 1.05, -h * 0.1, 0), V3(-l * 1.18, -h * 0.5, 0), V3(-l * 1.0, -h * 0.85, 0), V3(-l * 0.72, -h * 0.78, 0)];
      C.tube('prop-hook', pts, h * 0.085, h * 0.075, m, { radial: 10, seg: 22 }, piv);
      C.ball('prop-hook-end', pts[5], [h * 0.085, h * 0.085, h * 0.085], m, piv); return;
    }
    case 'ring': {   // 钥匙柄：三叶环 + 颈圈
      const R = h * 0.62, cx = -l * 0.25 - R, pts = [];
      for (let i = 0; i < 48; i++) { const t = (i / 48) * TAU, r = R * (0.84 + 0.16 * Math.cos(3 * t + PI)); pts.push([cx + Math.cos(t) * r, Math.sin(t) * r]); }
      const br = solid(mixc(pal[0], '#d8b25e', 0.35), 'brass'), dep = R * 0.11;
      C.add('prop-keybow', plateGeo(pts, dep, { bevel: dep * 0.3, holes: [circlePath(cx, 0, R * 0.36)], cs: 12 }), br, piv);
      const nk = C.add('prop-keyneck', new THREE.CylinderGeometry(r0 * 0.8, r0 * 0.95, -cx - R * 0.75, 12), br, piv); nk.rotation.z = PI / 2; nk.position.x = (cx + R * 0.75) / 2;
      const col = C.add('prop-keycollar', new THREE.TorusGeometry(r0 * 0.95, r0 * 0.28, 6, 16), br, piv); col.rotation.y = PI / 2; col.position.x = cx + R * 0.9;
      return;
    }
    case 'shears': {   // 剪刃双尾 + 轴钉
      const m = solid(mixc(pal[0], '#c9d0d6', 0.3), 'metal'), dep = h * 0.05;
      for (const sd of [-1, 1]) {
        const b = C.add('prop-blade', plateGeo([[0.04 * l, h * 0.07], [-l * 0.5, h * 0.09], [-l * 1.55, h * 0.01], [-l * 1.52, -h * 0.04], [-l * 0.5, -h * 0.1], [0.04 * l, -h * 0.12]], dep, { bevel: dep * 0.3, bs: 1 }), m, piv);
        b.position.set(-l * 0.15, 0, sd * dep * 0.7); b.rotation.z = sd * 0.26;
      }
      const pv = C.add('prop-screw', new THREE.CylinderGeometry(h * 0.06, h * 0.06, dep * 3.2, 12), C.mat(pal[2], 'metal'), piv); pv.rotation.x = PI / 2; pv.position.x = -l * 0.15;
      return;
    }
    case 'feather': {
      const crv = new THREE.CatmullRomCurve3([V3(0.04 * l, 0, 0), V3(-l * 0.6, h * 0.05, 0), V3(-l * 1.4, h * 0.18, 0)]);
      const N = 14, up = [], dn = [];
      for (let i = 0; i <= N; i++) { const t = 0.08 + 0.92 * i / N, p = crv.getPointAt(t), tg = crv.getTangentAt(t), w = h * 0.55 * Math.sin(PI * clamp((t - 0.05) / 0.97, 0, 1)) ** 0.6; const nt = (i === 5 || i === 9) ? 0.5 : 1; up.push([p.x - tg.y * w * nt, p.y + tg.x * w * nt]); dn.push([p.x + tg.y * w, p.y - tg.x * w]); }
      F2([[0.06 * l, 0], ...up, ...dn.reverse()], 'tail-feather');
      C.tube('prop-rachis', crv.getPoints(8), h * 0.035, h * 0.008, C.mat(mixc(pal[1], '#ffffff', 0.3), 'satin'), { radial: 6, seg: 12 }, piv); return;
    }
    case 'anchor': {   // 锚：杆 + 横档 + 弧臂 + 锚爪
      const m = solid(mixc(pal[0], '#4a5058', 0.3), 'metal'), rr = h * 0.05, Ra = h * 0.5, xe = -l * 0.85;
      C.tube('prop-anchor', [V3(0.04 * l, 0, 0), V3(xe, 0, 0)], rr, rr, m, { radial: 8, seg: 2 }, piv);
      const st = C.add('prop-anchor-stock', new THREE.CylinderGeometry(rr * 0.8, rr * 0.8, h * 0.6, 8), m, piv); st.rotation.x = PI / 2; st.position.x = -l * 0.22;
      const arc = C.add('prop-anchor-arm', new THREE.TorusGeometry(Ra, rr, 8, 20, PI), m, piv); arc.rotation.z = PI / 2; arc.position.x = xe + Ra;
      for (const sd of [-1, 1]) { const f = C.add('prop-anchor-fluke', new THREE.ConeGeometry(rr * 2.6, rr * 5, 4), m, piv); f.position.set(xe + Ra + rr * 1.5, sd * Ra, 0); f.rotation.z = -PI / 2 - sd * 0.5; f.scale.z = 0.4; }
      return;
    }
    case 'curl': C.tube('syn-curl', [V3(0.04 * l, 0, 0), V3(-l * 0.35, -h * 0.02, 0), V3(-l * 0.7, h * 0.12, 0), V3(-l * 0.82, h * 0.42, 0), V3(-l * 0.68, h * 0.68, 0), V3(-l * 0.45, h * 0.66, 0), V3(-l * 0.4, h * 0.48, 0), V3(-l * 0.5, h * 0.42, 0)], r0, r0 * 0.12, C.skin(), { radial: 10, seg: 26 }, piv); return;
    case 'leaf': {   // 枫叶：五裂掌状 + 细锯齿 + 叶柄
      const cx = -l * 0.62, p = [[0.06 * l, 0]];
      for (let i = 0; i <= 30; i++) { const th = lerp(-2.5, 2.5, i / 30), r = l * (0.3 + 0.42 * Math.abs(Math.cos(th * 1.25)) ** 1.6) * (i % 2 ? 0.95 : 1); p.push([cx - Math.cos(th) * r, Math.sin(th) * r * h / l]); }
      F2(p, 'tail-leaf');
      C.tube('prop-petiole', [V3(0.02 * l, 0, 0), V3(cx, 0, 0)], h * 0.03, h * 0.02, C.mat(shade(fin, 0.6), 'matte'), { radial: 5, seg: 2 }, piv); return;
    }
    case 'rocket': {   // 喷口 + 尾焰 + 三翼
      const met = solid('#c8cdd2', 'metal'); r0 = Math.max(r0, h * 0.24);
      const nz = C.add('prop-nozzle', lathe([[r0 * 0.95, 0], [r0 * 0.75, -l * 0.12], [r0 * 1.0, -l * 0.3], [r0 * 1.35, -l * 0.45], [r0 * 1.25, -l * 0.46]], 18), C.mat('#c8cdd2', 'metal', { side: THREE.DoubleSide }), piv); nz.rotation.z = -PI / 2;
      void met;
      const fl1 = new THREE.Mesh(new THREE.ConeGeometry(r0 * 1.15, l * 0.9, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#ffae4a', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
      fl1.name = 'flame'; fl1.rotation.z = PI / 2; fl1.position.x = -l * 0.45 - l * 0.45; piv.add(fl1);
      const fl2 = new THREE.Mesh(new THREE.ConeGeometry(r0 * 0.6, l * 0.5, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.9, depthWrite: false }));
      fl2.name = 'flame-core'; fl2.rotation.z = PI / 2; fl2.position.x = -l * 0.45 - l * 0.25; piv.add(fl2);
      const fm = C.mat(pal[2], C.solidKind('glaze'));
      for (let j = 0; j < 3; j++) {
        const f = C.add('prop-rocketfin', plateGeo([[0.1 * l, 0], [-l * 0.42, h * 0.62], [-l * 0.55, h * 0.58], [-l * 0.42, 0]], h * 0.04, { bevel: h * 0.012, bs: 1 }), fm, piv);
        f.rotation.x = (j / 3) * TAU + PI / 2; f.position.x = -l * 0.05;
      }
      return;
    }
    default: F2([[0.06 * l, 0], [-l, h], [-l * 0.87, h * 0.33], [-l * 0.46, 0], [-l * 0.87, -h * 0.33], [-l, -h]]);
  }
}

// ---------------- 胸鳍 ----------------
function buildPect(C) {
  const { g, F, L, H, S, pal, s } = C;
  const k = shapeOf('pect', g.pect.k, 'std'); if (k === 'none') return;
  const sK = clamp(+g.pect.s || 1, 0.3, 3.2);
  const uP = clamp(F.pk + (1 - F.pk) * 0.08, 0.3, 0.85), aP = 0.66 * PI;
  const pl0 = (0.38 * H + 0.22 * S) * sK, fin = C.finC;
  for (const side of [-1, 1]) {
    const ks = 1 + C.asym * 0.35 * side, l = pl0 * ks, h = l * 0.5;
    const p = F.pt(uP, side * aP); p.z *= 0.95;
    const pos = [p.x, p.y, p.z];
    const F2 = (pts, rot, name = `pectoral-${side}`, o = {}) => { const m = s.fin(C.nm(name), pts, o.color || fin, o.pos || pos, rot, s.root, o.thick || C.th); s.wiggle(m, 'x', o.amp ?? 0.17, 3.2, side * 0.65); return m; };
    const std = (q = 1) => F2([[0.12 * l * q, 0], [-l * q, -h * q], [-l * 0.68 * q, h * 0.17 * q], [0.02 * l * q, h * 0.28 * q]], [side * 0.6, side * -0.32, 0]);
    switch (k) {
      case 'std': std(); break;
      case 'long': F2([[0.12 * l, 0], [-l * 2.3, -h * 0.9], [-l * 2.1, -h * 0.55], [-l * 1.0, h * 0.1], [0.02 * l, h * 0.3]], [side * 0.75, side * -0.25, 0]); break;
      case 'wing': {
        if (g.mat === 'paper') {   // 纸鹤翼：折痕棱面
          const m = C.add(`pectoral-wing-${side}`, plateGeo([[0.1 * l, 0], [-l * 0.2, h * 0.5], [-l * 1.5, h * 2.7], [-l * 1.15, h * 0.7], [-l * 0.5, -h * 0.1]], C.th * 1.4, { bevel: 0 }), C.mat(mixc(pal[0], pal[1], 0.4), 'paper', { side: THREE.DoubleSide }));
          m.position.set(...pos); m.rotation.set(side * 1.15, side * -0.12, 0); s.wiggle(m, 'x', 0.22, 2.4, side * 0.65);
        } else F2([[0.12 * l, 0], [-l * 0.5, h * 0.7], [-l * 1.5, h * 1.6], [-l * 2.1, h * 1.35], [-l * 1.9, h * 0.6], [-l * 1.2, -h * 0.05], [-l * 0.5, -h * 0.25]], [side * 1.15, side * -0.12, 0], `pectoral-wing-${side}`, { amp: 0.22 });
        break;
      }
      case 'fan': { const q = [[0.12 * l, 0]]; for (let j = 0; j <= 10; j++) { const th = lerp(-1.3, 1.0, j / 10), r = l * 1.05 * (j % 2 ? 0.92 : 1); q.push([-Math.cos(th) * r * 0.9, Math.sin(th) * r * 0.75]); } F2(q, [side * 0.7, side * -0.35, 0]); break; }
      case 'frill': {   // 裙边鳍：沿体侧的波浪薄膜
        const u0 = 0.1, u1 = Math.min(F.pk + 0.22, 0.9), q = [], N = 16;
        for (let i = 0; i <= N; i++) { const u = lerp(u1, u0, i / N); q.push([F.x(u), F.wz(u) * 0.85 + (0.16 * H + 0.12 * S) * sK * (0.75 + 0.25 * Math.sin(i * 1.7)) * Math.sin(PI * (i / N)) ** 0.5]); }
        for (let i = N; i >= 0; i -= 4) { const u = lerp(u1, u0, i / N); q.push([F.x(u), F.wz(u) * 0.8]); }
        F2(q, [side * (PI / 2 + 0.35), 0, 0], `pectoral-frill-${side}`, { pos: [0, F.yc(0.5) - 0.3 * F.hb(0.5), 0], amp: 0.04 });
        break;
      }
      case 'leg': {   // 肉质叶状鳍（腔棘鱼）
        const b = V3(...pos), e = b.clone().add(V3(-l * 0.55, -l * 0.42, side * l * 0.25));
        C.tube('syn-leglobe', [b, b.clone().lerp(e, 0.5).add(V3(0, -l * 0.05, 0)), e], l * 0.17, l * 0.08, C.skin(mixc(pal[0], pal[1], 0.3)), { radial: 9, seg: 10 });
        F2([[0.05 * l, 0], [-l * 0.55, -h * 0.5], [-l * 0.62, 0], [-l * 0.5, h * 0.4]], [side * 0.5, side * -0.5, -0.6], `pectoral-${side}`, { pos: [e.x, e.y, e.z] });
        break;
      }
      case 'paddle': F2([[0.12 * l, 0], [-l * 0.4, -h * 0.6], [-l * 1.5, -h * 1.2], [-l * 1.7, -h * 0.95], [-l * 0.9, h * 0.15], [0.02 * l, h * 0.3]], [side * 1.0, side * -0.4, 0], `pectoral-paddle-${side}`, { thick: Math.max(0.05 * L / 1.6, 0.041) }); break;
      case 'bow': {   // 领结：喉侧一枚缎面蝴蝶结 + 小胸鳍
        std(0.6);
        const uT = F.pk + (1 - F.pk) * 0.3, aT = side * 0.78 * PI, q0 = F.pt(uT, aT), n = F.nrm(uT, aT);
        const b = clamp(0.3 * F.ht(uT) + 0.1 * S, 0.035 * L, 0.085 * L);
        const grp = C.group('prop-bow', [0, 0, 0]); grp.position.copy(q0).addScaledVector(n, b * 0.05); grp.quaternion.copy(quatN(n));
        const pts = [[0, 0.2 * b], [0.85 * b, 0.68 * b], [1.05 * b, 0.32 * b], [1.05 * b, -0.32 * b], [0.85 * b, -0.68 * b], [0, -0.2 * b], [-0.85 * b, -0.68 * b], [-1.05 * b, -0.32 * b], [-1.05 * b, 0.32 * b], [-0.85 * b, 0.68 * b]];
        const sat = C.mat(pal[2], 'satin');
        C.add('prop-bow', plateGeo(pts, b * 0.22, { smooth: 3, bevel: b * 0.12 }), sat, grp);
        C.ball('prop-bow-knot', V3(0, 0, b * 0.14), [b * 0.24, b * 0.3, b * 0.2], sat, grp);
        break;
      }
    }
  }
}
// ---------------- 腹鳍 / 臀鳍 ----------------
function buildVentral(C) {
  const { g, F, H, S, s } = C;
  const fin = C.finC;
  const pv = clamp(+g.pelv || 0, 0, 2), an = clamp(+g.anal || 0, 0, 2);
  if (pv > 0.05 && g.plan !== 'eel') for (const side of [-1, 1]) {
    const v = (0.24 * H + 0.14 * S) * pv, p = F.pt(clamp(F.pk - 0.05, 0.25, 0.8), side * 0.88 * PI);
    const m = s.fin(C.nm(`ventral-${side}`), [[0.1 * v, 0], [-v, -v * 0.55], [-v * 0.75, -v * 0.05], [0, v * 0.1]], fin, [p.x, p.y, p.z * 0.9], [side * 0.3, side * -0.15, 0], s.root, C.th);
    s.wiggle(m, 'x', 0.1, 2.6, side);
  }
  if (an > 0.05) {
    if (g.plan === 'eel') medianFin(C, 'anal-fin', 0.55, 0.03, (0.3 * H + 0.12 * S) * an, [[0, 0], [0.05, 0.6], [0.5, 0.7], [0.95, 0.6], [1.05, 0.1]], fin, { down: true });
    else medianFin(C, 'anal-fin', 0.36, 0.16, (0.32 * H + 0.12 * S) * an, OUT.anal, fin, { down: true });
  }
}

// ---------------- 附肢 / 饰物（app） ----------------
// 合并多块小几何（同材质的刺 / 珍珠 / 发光器 / 铆钉…）→ 1 个 draw call
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    pos.push(...g.getAttribute('position').array); nor.push(...g.getAttribute('normal').array);
    if (g !== g0) g.dispose();
    g0.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}
const _M4 = new THREE.Matrix4(), _S3 = new THREE.Vector3();
function placed(geo, pos, quat, scl) { _S3.set(...(Array.isArray(scl) ? scl : [scl, scl, scl])); return geo.applyMatrix4(_M4.compose(pos, quat || new THREE.Quaternion(), _S3)); }
// y 轴 = dir、z 轴尽量贴近 zHint 的正交基
function basisQ(yDir, zHint = AX.x) {
  const y = yDir.clone().normalize();
  let z = zHint.clone().addScaledVector(y, -zHint.dot(y));
  if (z.lengthSq() < 1e-6) z = AX.z.clone().addScaledVector(y, -y.z);
  z.normalize();
  const x = y.clone().cross(z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
const ringPts = (F, u, ex, n = 20) => { const p = []; for (let i = 0; i < n; i++) p.push(F.pt(u, (i / n) * TAU + 1e-3, ex)); return p; };

const APP_OK = new Set(['tentacle', 'arms', 'legs', 'claws', 'antennae', 'barbels', 'barbel', 'lure', 'horn', 'spikes', 'shell', 'crown', 'coronet', 'mane', 'tophat', 'pearls', 'photo', 'bells', 'band', 'plates', 'swirl', 'calyx', 'flower', 'strings', 'ribbons', 'gills']);
export const SYN_APPS = [...APP_OK];

function buildApps(C) {
  const seen = new Set();
  for (const raw of C.g.app) {
    const [b0, v] = String(raw).split(':');
    const b = b0 === 'barbel' ? 'barbels' : b0;
    if (!APP_OK.has(b) || seen.has(b + ':' + (v || ''))) continue;
    seen.add(b + ':' + (v || ''));
    try { APP[b]?.(C, v); } catch (e) { console.warn('[synth] app', raw, e); }
  }
}

const APP = {
  tentacle(C, v) {
    const { g, F, L, S, s, pal } = C;
    const n = clamp(parseInt(v, 10) || 8, 2, 14);
    const round = ['globe', 'disc', 'flat'].includes(g.plan) || g.head === 'dome';
    const u0 = round ? clamp(F.pk * 0.9, 0.35, 0.6) : clamp(F.pk + 0.04, 0.35, 0.8), du = round ? 0.18 : 0.1;
    const glass = ['crystal', 'glow'].includes(g.mat);
    const len = (round ? 0.75 : 0.5) * L * (glass ? 1.25 : 1);
    const r0 = clamp((glass ? 0.025 : 0.06) * S + 0.004 * L, 0.004 * L, 0.035 * L);
    const m = glass ? C.mat(mixc(pal[2], '#ffffff', 0.3), 'glow', { glow: 0.4 + 0.6 * (g.glow || 0) }) : C.skin(mixc(pal[0], pal[3], 0.3));
    for (let i = 0; i < n; i++) {
      const ph = (i / n) * TAU + 0.3, cu = Math.cos(ph), su = Math.sin(ph);
      const p = F.pt(clamp(u0 + cu * du, 0.05, 0.95), PI - 0.6 * su, 0.9);
      const grp = C.group('tentacle', [p.x, p.y, p.z]);
      const l = len * (0.8 + 0.4 * C.R()), out = V3(cu * 0.35, 0, su * 0.5);
      const pts = [V3(0, 0.02 * L, 0), V3(out.x * l * 0.3 - 0.05 * l, -0.25 * l, out.z * l * 0.3), V3(out.x * l * 0.4 - 0.2 * l, -0.6 * l, out.z * l * 0.45), V3(out.x * l * 0.3 - 0.42 * l, -0.85 * l, out.z * l * 0.5 + 0.06 * l * Math.sin(i))];
      C.tube('tentacle-arm', pts, r0, r0 * 0.12, m, { radial: 6, seg: 12 }, grp);
      s.wiggle(grp, 'z', 0.12, 1.8, i * 0.8); s.wiggle(grp, 'x', 0.08, 1.3, i * 1.3);
    }
  },
  arms(C, v) {   // 星状腕：水平放射、扁圆截面
    const { g, F, L, H, s, pal } = C;
    const n = clamp(parseInt(v, 10) || 5, 3, 9), c = V3(F.x(0.5), F.yc(0.5), 0);
    const r0 = clamp(0.7 * H, 0.04 * L, 0.12 * L), len = 0.5 * L;
    const m = C.skin(pal[0]);
    for (let i = 0; i < n; i++) {
      const ph = (i / n) * TAU;
      const grp = C.group('arm', [c.x, c.y, c.z]); grp.rotation.y = ph;
      const t = C.tube('arm-limb', [V3(0, 0, 0), V3(len * 0.5, 0.02 * L, 0), V3(len, -0.01 * L, 0)], r0, r0 * 0.18, m, { radial: 8, seg: 10 }, grp);
      t.scale.y = 0.5;
      s.wiggle(grp, 'z', 0.06, 1.2, i);
    }
  },
  legs(C, v) {   // 节肢步足：大腿外展上抬 → 膝 → 小腿下插
    const { g, F, L, S, s, pal } = C;
    const n = clamp(parseInt(v, 10) || 6, 2, 10), per = Math.max(1, Math.round(n / 2));
    const len = clamp(0.5 * S + 0.18 * L, 0.18 * L, 0.42 * L), r = clamp(0.035 * S + 0.006 * L, 0.006 * L, 0.025 * L);
    const m = C.skin(mixc(pal[0], pal[3], 0.25)), jm = C.skin(shade(pal[0], 0.8));
    for (const side of [-1, 1]) for (let j = 0; j < per; j++) {
      const u = clamp(lerp(F.pk + 0.08, Math.max(F.pk - 0.32, 0.12), per > 1 ? j / (per - 1) : 0.5), 0.08, 0.92);
      const p = F.pt(u, side * 0.64 * PI, 0.92);
      const grp = C.group('leg', [p.x, p.y, p.z]);
      const sw = (j - (per - 1) / 2) * 0.12;
      const knee = V3(-sw * len, 0.22 * len, side * 0.5 * len), foot = V3(-sw * len * 1.6 - 0.05 * len, -0.6 * len + (F.bot(u) - p.y), side * 0.78 * len);
      C.tube('leg-femur', [V3(0, 0, 0), knee.clone().multiplyScalar(0.5).add(V3(0, 0.04 * len, 0)), knee], r, r * 0.85, m, { radial: 6, seg: 6 }, grp);
      C.tube('leg-tibia', [knee, knee.clone().lerp(foot, 0.5).add(V3(0, 0.02 * len, side * 0.05 * len)), foot], r * 0.85, r * 0.2, m, { radial: 6, seg: 8 }, grp);
      C.ball('leg-knee', knee, [r * 1.05, r * 1.05, r * 1.05], jm, grp);
      s.wiggle(grp, 'x', 0.05, 2.4, j * 1.4 + (side > 0 ? 0 : PI));
    }
  },
  claws(C, v) {
    const { g, F, L, S, s, pal } = C;
    const q = clamp(0.35 * S + 0.07 * L, 0.08 * L, 0.2 * L), r = clamp(0.06 * q, 0.006 * L, 0.02 * L);
    const m = C.skin(mixc(pal[0], pal[3], 0.2)), tipM = C.mat(shade(pal[2], 0.7), 'glaze');
    const club = v === 'club';
    for (const side of [-1, 1]) {
      const p = F.pt(F.pk + (1 - F.pk) * 0.3, side * 0.6 * PI, 0.92);
      const grp = C.group('claw', [p.x, p.y, p.z]);
      const el = V3(0.25 * q, -0.08 * q, side * 0.45 * q), wr = V3(0.75 * q, 0.02 * q, side * 0.5 * q);
      C.tube('claw-arm', [V3(0, 0, 0), el, wr], r * 1.1, r * 0.9, m, { radial: 7, seg: 10 }, grp);
      if (club) {
        C.ball('claw-club', wr.clone().add(V3(0.12 * q, 0, 0)), [0.2 * q, 0.15 * q, 0.15 * q], C.mat(mixc(pal[2], pal[0], 0.2), 'glaze'), grp);
      } else {
        C.ball('claw-palm', wr.clone().add(V3(0.15 * q, 0, 0)), [0.24 * q, 0.13 * q, 0.1 * q], m, grp);
        const b = wr.clone().add(V3(0.32 * q, 0, 0));
        C.tube('claw-finger', [b.clone().add(V3(0, 0.05 * q, 0)), b.clone().add(V3(0.22 * q, 0.08 * q, 0)), b.clone().add(V3(0.38 * q, 0.0, 0))], 0.08 * q, 0.01 * q, tipM, { radial: 7, seg: 8 }, grp);
        C.tube('claw-finger', [b.clone().add(V3(0, -0.04 * q, 0)), b.clone().add(V3(0.18 * q, -0.07 * q, 0)), b.clone().add(V3(0.3 * q, -0.02 * q, 0))], 0.065 * q, 0.01 * q, m, { radial: 7, seg: 8 }, grp);
      }
      s.wiggle(grp, 'y', 0.12 * side, 1.5, side);
    }
  },
  antennae(C) {
    const { F, L, s, pal } = C;
    const m = C.skin(shade(pal[3], 0.75));
    for (const side of [-1, 1]) {
      const p = F.pt(0.93, side * 0.3, 0.95), grp = C.group('antenna', [p.x, p.y, p.z]);
      C.tube('antenna-whip', [V3(0, 0, 0), V3(0.1 * L, 0.12 * L, side * 0.04 * L), V3(0.02 * L, 0.26 * L, side * 0.12 * L), V3(-0.35 * L, 0.33 * L, side * 0.2 * L), V3(-0.75 * L, 0.26 * L, side * 0.26 * L)], 0.007 * L, 0.0012 * L, m, { radial: 5, seg: 20 }, grp);
      s.wiggle(grp, 'x', 0.08, 2.2, side);
    }
  },
  barbels(C) {
    const { F, L, s, pal } = C;
    const m = C.skin(shade(pal[3], 0.85)), rm = 0.006 * L;
    for (const side of [-1, 1]) {
      const b = F.pt(0.965, side * 0.72 * PI, 1.0), grp = C.group('barbel', [b.x, b.y, b.z]);
      for (const j of [0, 1]) { const len = (0.2 - j * 0.07) * L; C.tube('barbel-whisker', [V3(0, 0, 0), V3(0.02 * L, -0.05 * L, side * 0.015 * L), V3(-len * 0.4, -len * 0.5, side * (0.04 + 0.03 * j) * L), V3(-len * 0.8, -len * 0.4, side * (0.05 + 0.05 * j) * L)], rm, rm * 0.2, m, { radial: 5, seg: 10 }, grp); }
      s.wiggle(grp, 'z', 0.1, 1.6, side);
    }
  },
  gills(C) {
    const { F, L, pal } = C, u = F.pk + (1 - F.pk) * 0.45;
    for (const side of [-1, 1]) { const pts = []; for (let i = 0; i <= 6; i++) pts.push(F.pt(u - 0.02 * Math.sin(PI * i / 6), side * lerp(0.25, 0.85, i / 6) * PI, 1.01)); C.tube('gill', pts, 0.004 * L, 0.004 * L, C.mat(shade(pal[0], 0.55), 'matte'), { radial: 5, seg: 10 }); }
  },
  lure(C) {   // 头顶钓竿 + 发光饵球
    const { g, F, L, s, pal } = C;
    const b = C.headTop(F.pk + (1 - F.pk) * 0.6), grp = C.group('lure', [b.x, b.y - 0.005 * L, 0]);
    const tip = V3(0.26 * L, 0.13 * L, 0);
    C.tube('lure-rod', [V3(0, 0, 0), V3(0.05 * L, 0.15 * L, 0), V3(0.18 * L, 0.22 * L, 0), tip], 0.008 * L, 0.003 * L, C.skin(shade(pal[0], 0.85)), { radial: 6, seg: 14 }, grp);
    const gm = physMat(mixc(pal[2], '#fff6c8', 0.25), 'glow', { glow: 1.6 + (g.glow || 0), glowColor: mixc(pal[2], '#fff2b0', 0.4) });
    C.ball('lure-bulb', tip.clone().add(V3(0, -0.02 * L, 0)), [0.035 * L, 0.04 * L, 0.035 * L], gm, grp);
    s.wiggle(grp, 'z', 0.1, 1.4); s.wiggle(grp, 'x', 0.08, 1.1, 0.6);
  },
  horn(C, v) {
    const { g, F, L, S, s, pal } = C;
    const ivory = C.mat(mixc(pal[1], '#f2e8d2', 0.6), C.solidKind('glaze'));
    if (v === 'bill') {
      if (C.billEnd) return;
      const u = 0.965, r0 = Math.max(0.3 * F.ht(u), 0.012 * L), b = V3(F.x(u), F.yc(u) + 0.15 * F.ht(u), 0), len = 0.3 * L;
      C.tube('syn-bill', [b, b.clone().add(V3(len * 0.5, -0.004 * L, 0)), b.clone().add(V3(len, 0.004 * L, 0))], r0, r0 * 0.08, C.skin(shade(pal[0], 0.85)), { radial: 10, seg: 12 });
      return;
    }
    if (v === 'cephalic') {   // 蝠鲼头鳍：两片向前卷的厚膜
      for (const side of [-1, 1]) {
        const p = F.pt(0.975, side * 0.5 * PI, 0.9), l = clamp(0.12 * L, 0.05 * L, 0.2 * L);
        const m = s.fin(C.nm(`horn-cephalic-${side}`), [[0, 0.01 * L], [l * 0.6, 0.02 * L], [l, -0.005 * L], [l * 0.95, -0.04 * L], [l * 0.4, -0.05 * L], [0, -0.03 * L]], C.finC, [p.x, p.y, p.z], [side * 1.1, side * 0.15, 0], s.root, Math.max(C.th * 3.5, 0.041));
        s.wiggle(m, 'x', 0.08, 1.7, side);
      }
      return;
    }
    // 螺旋长角（独角鲸 / 独角兽）：棱纹螺旋锥
    const fore = !!C.billEnd || g.head === 'spout';
    const b = fore ? V3(F.x(0.9), F.top(0.9) - 0.01 * L, 0) : V3(F.x(0.985), F.yc(0.985) + 0.35 * F.ht(0.975), 0);
    const dir = fore ? V3(0.8, 0.6, 0).normalize() : V3(1, 0.05, 0).normalize(), len = 0.5 * L;
    const r0 = clamp(0.25 * S, 0.012 * L, 0.035 * L);
    C.tube('horn-spiral', [b, b.clone().addScaledVector(dir, len * 0.5), b.clone().addScaledVector(dir, len)], r0, r0 * 0.06, ivory, { radial: 10, seg: 36, rib: 0.16, ribN: 2, twist: 48 });
  },
  spikes(C) {   // 满身棘刺（斐波那契分布、沿法线）
    const { F, L, S, pal } = C, geos = [], cone = new THREE.ConeGeometry(1, 1, 6); cone.translate(0, 0.5, 0);
    const n = 30, len = clamp(0.22 * S, 0.02 * L, 0.07 * L);
    for (let i = 0; i < n; i++) {
      const u = lerp(0.14, 0.9, (i + 0.5) / n), a = ((i * 2.39996) % TAU) - PI;
      if (Math.abs(a) > 0.86 * PI) continue;
      const p = F.pt(u, a, 0.96), nn = F.nrm(u, a).add(V3(-0.35, 0, 0)).normalize();
      const k = 0.7 + 0.3 * Math.sin(i * 1.7);
      geos.push(placed(cone.clone(), p, quatY(nn), [len * 0.16, len * k, len * 0.16]));
    }
    cone.dispose();
    C.add('prop-spikes', mergeGeos(geos), C.mat(mixc(C.finC, pal[2], 0.4), C.solidKind('glaze')));
  },
  shell(C) {   // 背甲 + 六角盾片
    const { F, L, pal } = C, u0 = Math.max(F.pk - 0.34, 0.08), u1 = Math.min(F.pk + 0.16, 0.9);
    const sm = C.mat(mixc(pal[3], pal[2], 0.35), C.solidKind('glaze'));
    C.add('prop-shell', shellGeometry(F, u0, u1, 1.3, 1.14, 14, 18), sm);
    const hex = new THREE.CylinderGeometry(1, 1, 1, 6), geos = [];
    for (const [t, a] of [[0.2, 0], [0.5, 0], [0.8, 0], [0.33, 0.62], [0.67, 0.62], [0.33, -0.62], [0.67, -0.62]]) {
      const u = lerp(u0, u1, t), p = F.pt(u, a, 1.15), nn = F.nrm(u, a), rr = clamp(0.24 * (F.ht(u) + F.wz(u)) * 0.5, 0.02 * L, 0.08 * L);
      geos.push(placed(hex.clone(), p, quatY(nn), [rr, 0.12 * rr, rr]));
    }
    hex.dispose();
    C.add('prop-scutes', mergeGeos(geos), C.mat(mixc(pal[3], pal[1], 0.25), C.solidKind('glaze')));
  },
  crown(C) {
    const { F, L, pal } = C, u = F.pk + (1 - F.pk) * 0.45, b = C.headTop(u);
    const rc = clamp(0.5 * F.wz(u) + 0.15 * F.ht(u), 0.035 * L, 0.1 * L), hc = rc * 0.55;
    const gold = C.mat('#e0b64e', 'gold', { side: THREE.DoubleSide });
    const grp = C.group('prop-crown', [b.x, b.y - hc * 0.25, 0]); grp.rotation.z = -0.12;
    C.add('prop-crown', new THREE.CylinderGeometry(rc * 1.12, rc, hc, 16, 1, true), gold, grp).position.y = hc / 2;
    const gem = physMat(mixc(pal[2], '#ff3a5a', 0.3), 'crystal', { glow: 0.35, glowColor: pal[2] });
    const cone = new THREE.ConeGeometry(1, 1, 5), geos = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; geos.push(placed(cone.clone(), V3(Math.cos(a) * rc * 1.1, hc + rc * 0.22, Math.sin(a) * rc * 1.1), null, [rc * 0.2, rc * 0.45, rc * 0.2])); }
    cone.dispose();
    C.add('prop-crown-tips', mergeGeos(geos), gold, grp);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + PI / 6; C.ball('prop-crown-gem', V3(Math.cos(a) * rc * 1.06, hc * 0.45, Math.sin(a) * rc * 1.06), [rc * 0.09, rc * 0.09, rc * 0.09], gem, grp); }
  },
  coronet(C) {
    const { F, L, pal } = C, b = C.headTop(F.pk + (1 - F.pk) * 0.35), r = clamp(0.25 * F.ht(F.pk), 0.012 * L, 0.04 * L);
    const cone = new THREE.ConeGeometry(1, 1, 6), geos = [];
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; geos.push(placed(cone.clone(), b.clone().add(V3(Math.cos(a) * r * 0.6, r * 0.7, Math.sin(a) * r * 0.6)), quatY(V3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5)), [r * 0.3, r * 1.3, r * 0.3])); }
    geos.push(placed(new THREE.CylinderGeometry(1, 1.2, 1, 8), b.clone().add(V3(0, r * 0.3, 0)), null, [r * 0.7, r * 0.8, r * 0.7]));
    cone.dispose();
    C.add('prop-coronet', mergeGeos(geos), C.skin(mixc(pal[0], pal[2], 0.3)));
  },
  mane(C, v) {
    const { g, F, L, S, s, pal } = C, u = C.uNeck;
    if (v === 'knit') {   // 针织麻花领：两圈螺旋棱纹管
      const m = C.mat(mixc(pal[2], pal[1], 0.2), 'matte');
      for (const [du, ex] of [[0, 1.12], [-0.035, 1.1]]) C.tube('prop-knit', ringPts(F, clamp(u + du, 0.05, 0.95), ex, 16), clamp(0.18 * S, 0.018 * L, 0.05 * L), 0, m, { closed: true, radial: 8, seg: 40, prof: () => clamp(0.18 * S, 0.018 * L, 0.05 * L), rib: 0.22, ribN: 3, twist: 90 });
      return;
    }
    if (v === 'crest') {   // 头顶红色冠鬃：一排拉长鳍条
      const out = [[0, 0]], N = 7;
      for (let i = 0; i < N; i++) { const t = i / (N - 1); out.push([0.06 + t * 0.9, 1 - 0.55 * t + 0.25 * Math.sin(i * 2.1)], [0.1 + t * 0.9, 0.3 * (1 - t)]); }
      out.push([1.05, 0.03]);
      const r = medianFin(C, 'mane-crest', Math.min(0.99, F.pk + (1 - F.pk) * 0.85), F.pk + (1 - F.pk) * 0.25, 0.22 * L, out, mixc(pal[2], '#e2484f', 0.4));
      s.wiggle(r.fin, 'x', 0.05, 2.1);
      return;
    }
    // 花瓣鬃 / 毒棘长鬃：一圈向外后方展开的片
    const spine = v === 'spine', n = spine ? 9 : 12, col = spine ? mixc(pal[2], C.finC, 0.3) : mixc(pal[2], pal[1], 0.3);
    for (let i = 0; i < n; i++) {
      const a = spine ? lerp(-0.8, 0.8, i / (n - 1)) * PI : (i / n) * TAU + 0.2;
      const p = F.pt(u, a, 0.95), nn = F.nrm(u, a), dir = nn.clone().multiplyScalar(spine ? 0.75 : 0.9).add(V3(spine ? -0.7 : -0.35, 0, 0)).normalize();
      const grp = C.group('mane', [p.x, p.y, p.z]); grp.quaternion.copy(basisQ(dir, AX.x));
      const l = spine ? clamp(0.6 * S + 0.12 * L, 0.12 * L, 0.36 * L) : clamp(0.35 * S + 0.04 * L, 0.05 * L, 0.16 * L), w = spine ? l * 0.09 : l * 0.4;
      const pts = spine ? [[-w, 0], [-w * 0.6, l * 0.6], [0, l], [w * 0.8, l * 0.5], [w, 0]] : [[-w * 0.4, 0], [-w, l * 0.45], [-w * 0.6, l * 0.9], [0, l], [w * 0.6, l * 0.9], [w, l * 0.45], [w * 0.4, 0]];
      s.fin(C.nm(spine ? 'mane-spine' : 'mane-petal'), pts, col, [0, 0, 0], [0, 0, 0], grp, C.th);
      if (spine) C.tube('mane-ray', [V3(0, 0, 0), V3(0, l * 1.04, 0)], w * 0.25, w * 0.05, C.mat(shade(col, 0.6), 'matte'), { radial: 5, seg: 2 }, grp);
      s.wiggle(grp, 'x', 0.05, 1.8, i * 0.6);
    }
  },
  tophat(C) {
    const { F, L, pal } = C, u = F.pk + (1 - F.pk) * 0.4, b = C.headTop(u);
    const rc = clamp(0.45 * F.wz(u) + 0.2 * F.ht(u), 0.04 * L, 0.11 * L);
    const blk = C.mat('#1d1b22', 'satin'), band = C.mat(pal[2], 'satin');
    const grp = C.group('prop-tophat', [b.x, b.y - rc * 0.12, 0]); grp.rotation.z = -0.16; grp.rotation.x = 0.06;
    C.add('prop-hat-brim', new THREE.CylinderGeometry(rc * 1.6, rc * 1.6, rc * 0.07, 24), blk, grp);
    C.add('prop-hat-crown', new THREE.CylinderGeometry(rc * 1.02, rc * 0.95, rc * 1.35, 24), blk, grp).position.y = rc * 0.7;
    C.add('prop-hat-band', new THREE.CylinderGeometry(rc * 0.985, rc * 0.97, rc * 0.25, 24), band, grp).position.y = rc * 0.18;
  },
  pearls(C) {
    const { F, L, S, pal } = C, u = C.uNeck, n = 20, ring = ringPts(F, u, 1.04, n), geos = [], sp = new THREE.SphereGeometry(1, 10, 8);
    const r = clamp(0.07 * S + 0.004 * L, 0.009 * L, 0.024 * L);
    ring.forEach((p) => geos.push(placed(sp.clone(), p, null, r)));
    const low = F.pt(u, PI, 1.04);
    geos.push(placed(sp.clone(), low.clone().add(V3(0.005 * L, -r * 2.4, 0)), null, r * 1.8));
    sp.dispose();
    C.add('prop-pearls', mergeGeos(geos), C.mat(mixc(pal[1], '#f4efe6', 0.6), 'pearl'));
  },
  photo(C) {   // 体侧发光器阵列
    const { g, F, L, pal } = C, geos = [], sp = new THREE.SphereGeometry(1, 8, 6), r = 0.009 * L;
    for (const a of [0.62, 0.8]) for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
      const u = lerp(0.12, Math.min(F.pk + 0.3, 0.92), i / 9), p = F.pt(u, side * a * PI, 1.0);
      geos.push(placed(sp.clone(), p, null, r * (a > 0.7 ? 0.8 : 1)));
    }
    sp.dispose();
    C.add('prop-photophores', mergeGeos(geos), physMat(mixc(pal[2], '#ffffff', 0.25), 'glow', { glow: 1.4 + (g.glow || 0), glowColor: pal[2] }));
  },
  bells(C) {   // 双铃头冠（闹钟）
    const { F, L, pal } = C, u = F.pk + (1 - F.pk) * 0.4, b = C.headTop(u), rb = clamp(0.3 * F.wz(u) + 0.2 * F.ht(u), 0.03 * L, 0.08 * L);
    const met = C.mat(mixc(pal[3], '#d8b25e', 0.35), C.solidKind('brass'));
    for (const side of [-1, 1]) {
      const grp = C.group('prop-bell', [b.x, b.y + rb * 0.15, side * rb * 0.75]); grp.rotation.x = -side * 0.55;
      const bell = C.add('prop-bell', lathe([[0, rb * 0.95], [rb * 0.35, rb * 0.92], [rb * 0.75, rb * 0.65], [rb * 0.92, rb * 0.25], [rb * 1.0, 0], [rb * 0.9, rb * 0.02], [rb * 0.7, rb * 0.5], [0, rb * 0.75]], 18), met, grp); bell.position.y = rb * 0.2;
      C.ball('prop-bell-knob', V3(0, rb * 1.2, 0), [rb * 0.13, rb * 0.13, rb * 0.13], met, grp);
    }
    const arc = C.add('prop-bell-hammer', new THREE.TorusGeometry(rb * 0.8, rb * 0.06, 6, 16, PI), met); arc.position.set(b.x, b.y + rb * 0.75, 0); arc.rotation.y = PI / 2;
  },
  band(C) {   // 腰环 / 颈环
    const { g, F, L, S } = C, u = g.waist > 0.1 || g.plan === 'hourglass' ? 0.47 : Math.max(C.uNeck - 0.06, 0.3);
    const r = clamp(0.06 * S + 0.006 * L, 0.008 * L, 0.03 * L), gold = C.mat(mixc(g.pal[2], '#caa55a', 0.5), C.solidKind('brass'));
    for (const du of [-0.012, 0.012]) C.tube('prop-band', ringPts(F, clamp(u + du * (r / (0.02 * L)), 0.03, 0.97), 1.01, 24), r * 0.7, r * 0.7, gold, { closed: true, radial: 6, seg: 40 });
    C.tube('prop-band', ringPts(F, u, 1.0, 24), r * 1.1, r * 1.1, C.mat(shade(g.pal[2], 0.8), C.solidKind('metal')), { closed: true, radial: 6, seg: 40 });
  },
  plates(C) {   // 铆接甲板：沿背部叠瓦
    const { F, L, pal } = C, n = 5, u0 = 0.14, u1 = Math.min(F.pk + 0.2, 0.9), m = C.mat(mixc(pal[3], '#8a949c', 0.3), C.solidKind('metal'));
    const rv = [], sp = new THREE.SphereGeometry(1, 6, 4);
    for (let i = 0; i < n; i++) {
      const a0 = lerp(u0, u1, i / n), a1 = lerp(u0, u1, (i + 1.25) / n);
      C.add('prop-plate', shellGeometry(F, a0, Math.min(a1, 0.95), 1.15, 1.04 + i * 0.008, 6, 12), m);
      for (let j = -2; j <= 2; j++) rv.push(placed(sp.clone(), F.pt(Math.min(a1, 0.95) - 0.012, j * 0.42, 1.05 + i * 0.008), null, 0.006 * L));
    }
    sp.dispose();
    C.add('prop-rivets', mergeGeos(rv), C.mat('#cfd4d8', C.solidKind('metal')));
  },
  swirl(C) {   // 奶油旋顶：裱花螺旋
    const { F, L, pal } = C, u = F.pk, b = C.headTop(u), R = clamp(0.5 * F.wz(u) + 0.2 * F.ht(u), 0.05 * L, 0.14 * L), h = R * 1.5, pts = [];
    for (let i = 0; i <= 36; i++) { const t = i / 36, a = t * TAU * 3.2, rr = R * (1 - t * 0.92); pts.push(V3(b.x + Math.cos(a) * rr, b.y - R * 0.05 + h * t, Math.sin(a) * rr)); }
    C.tube('prop-swirl', pts, R * 0.3, R * 0.06, C.mat(mixc(pal[1], '#fff8ec', 0.4), 'satin'), { radial: 8, seg: 72, prof: (t) => R * (0.3 - 0.22 * t) * (t > 0.95 ? (1 - t) * 20 : 1), rib: 0.18, ribN: 6, twist: 0 });
  },
  calyx(C) {   // 花萼领 + 果柄（辣椒）
    const { F, L, S, s, pal } = C, u = 0.93, green = mixc(pal[2], '#3f6b2a', 0.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3, p = F.pt(u, a, 1.0), nn = F.nrm(u, a), dir = nn.clone().multiplyScalar(0.45).add(V3(-0.9, 0, 0)).normalize();
      const grp = C.group('calyx', [p.x, p.y, p.z]); grp.quaternion.copy(basisQ(dir, nn));
      const l = clamp(0.5 * S, 0.05 * L, 0.14 * L), w = l * 0.32;
      s.fin(C.nm('calyx-sepal'), [[-w * 0.5, 0], [-w, l * 0.4], [0, l], [w, l * 0.4], [w * 0.5, 0]], green, [0, 0, 0], [0, 0, 0], grp, Math.max(C.th * 3.5, 0.041));
    }
    const tip = V3(F.x(0.999), F.yc(0.999), 0), r = clamp(0.12 * S, 0.012 * L, 0.03 * L);
    C.tube('prop-stem', [tip.clone().add(V3(-0.01 * L, 0, 0)), tip.clone().add(V3(0.08 * L, 0.02 * L, 0)), tip.clone().add(V3(0.12 * L, 0.09 * L, 0))], r, r * 0.7, C.mat(shade(green, 0.8), 'glaze'), { radial: 7, seg: 10 });
  },
  flower(C) {   // 头顶开花
    const { F, L, s, pal } = C, b = C.headTop(F.pk + (1 - F.pk) * 0.35), r = clamp(0.35 * F.ht(F.pk), 0.04 * L, 0.09 * L);
    const grp = C.group('prop-flower', [b.x, b.y, 0]); grp.rotation.z = -0.25;
    C.tube('prop-flower-stem', [V3(0, -0.01 * L, 0), V3(0.01 * L, r * 0.6, 0), V3(0, r * 1.1, 0)], r * 0.07, r * 0.06, C.mat(mixc(pal[3], '#4f7a4a', 0.6), 'matte'), { radial: 5, seg: 6 }, grp);
    const pm = C.mat(mixc(pal[2], '#f6b8c8', 0.3), 'satin');
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; const p = C.ball('prop-petal', V3(Math.cos(a) * r * 0.5, r * 1.12, Math.sin(a) * r * 0.5), [r * 0.5, r * 0.1, r * 0.3], pm, grp); p.rotation.y = -a; p.rotation.z = 0.25; }
    C.ball('prop-flower-heart', V3(0, r * 1.18, 0), [r * 0.22, r * 0.14, r * 0.22], C.mat('#f2c84b', 'matte'), grp);
    s.wiggle(grp, 'x', 0.08, 1.5);
  },
  strings(C) {   // 琴弦：琴码 + 四根弦 + 弦轴
    const { F, L, pal } = C, uB = 0.4, xB = F.x(uB), hB = 0.05 * L;
    const wood = C.mat(mixc(pal[2], '#2a1d14', 0.4), 'glaze'), str = C.mat('#e6e1d3', 'metal');
    const zs = [-1.5, -0.5, 0.5, 1.5].map((k) => k * clamp(0.12 * F.wz(uB), 0.004 * L, 0.012 * L));
    for (const z of zs) {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const u = lerp(0.9, 0.12, i / 8), lift = hB * Math.max(0, 1 - Math.abs(u - uB) / 0.5) ** 1.2 + 0.006 * L; pts.push(V3(F.x(u), F.top(u) + lift, z)); }
      C.tube('prop-string', pts, 0.0022 * L, 0.0022 * L, str, { radial: 4, seg: 24 });
    }
    const bw = Math.abs(zs[0]) * 1.6, bp = [[-bw, 0], [-bw * 0.9, hB * 0.6], [-bw * 0.6, hB * 1.05], [bw * 0.6, hB * 1.05], [bw * 0.9, hB * 0.6], [bw, 0], [bw * 0.3, hB * 0.25], [-bw * 0.3, hB * 0.25]];
    const br = C.add('prop-bridge', plateGeo(bp, 0.008 * L, { bevel: 0.002 * L, bs: 1 }), C.mat('#e9d7b0', 'matte')); br.rotation.y = PI / 2; br.position.set(xB, F.top(uB) - 0.004 * L, 0);
    for (const z of zs) C.ball('prop-peg', V3(F.x(0.92), F.top(0.92) + 0.01 * L, z * 2.2), [0.008 * L, 0.012 * L, 0.008 * L], wood);
  },
  ribbons(C) {   // 拖地飘带
    const { F, L, S, s, pal } = C;
    for (const side of [-1, 1]) {
      const p = F.pt(Math.max(F.pk - 0.12, 0.2), side * 0.25 * PI, 0.98), grp = C.group('ribbon', [p.x, p.y, p.z]); grp.rotation.x = side * 0.5;
      const len = 0.8 * L, w = clamp(0.12 * S, 0.012 * L, 0.04 * L), up = [], dn = [], N = 18;
      for (let i = 0; i <= N; i++) { const t = i / N, x = -t * len, y = Math.sin(t * 7 + side) * 0.05 * L * t - t * 0.12 * L, ww = w * (1 - 0.6 * t); up.push([x, y + ww]); dn.push([x, y - ww]); }
      const m = s.fin(C.nm('ribbon-streamer'), [...up, ...dn.reverse()], mixc(pal[2], pal[1], 0.2), [0, 0, 0], [0, 0, 0], grp, C.th);
      s.wiggle(grp, 'y', 0.12, 2.2, side); void m;
    }
  },
};

// =====================================================================================
// 入口：buildSynthModel(v) → THREE.Group（与 createMarineModel 同结构：normalized-sculpture / marineRig / parts）
// =====================================================================================
const STAGES = [
  ['head', buildHeadExtras], ['eyes', buildEyes], ['mouth', buildMouth],
  ['dorsal', (C) => buildDorsal(C, C.g.dor, 'dorsal')],
  ['dorsal2', (C) => { const d = C.g.dor2; if (d && d.k && d.k !== 'none') buildDorsal(C, { h: 0.7, l: 0.6, x: 0.3, ...d }, 'dorsal2'); }],
  ['tail', buildTail], ['pect', buildPect], ['ventral', buildVentral], ['app', buildApps],
];
export function buildSynthModel(v) {
  const src = v && typeof v === 'object' ? (v.syn || (v.plan ? v : null)) : null;
  const g = normGenome(src);
  // 造型 id 归一（未知 → 兜底），保证下游 switch 永远命中
  g.plan = shapeOf('plan', g.plan, 'fusiform'); g.head = shapeOf('head', g.head, 'round');
  if (!MATS[g.mat]) g.mat = 'wet';
  const seed = (Number.isFinite(+v?.seed) ? +v.seed : hashStr(JSON.stringify(src || {}))) >>> 0;
  const C = makeCtx(g, seed);
  buildBody(C);
  for (const [nm, fn] of STAGES) { try { fn(C); } catch (e) { console.warn('[synth] stage', nm, e); } }
  const s = C.s, model = new THREE.Group();
  model.name = 'synth-model';
  // 归一化：最长水平维度 → 1.6；超长飘带 / 触手允许溢出（按身体长度封顶，避免身体被压成一粒）
  const bounds = new THREE.Box3().setFromObject(s.root), size = bounds.getSize(V3()), center = bounds.getCenter(V3());
  const bodyB = new THREE.Box3().setFromObject(C.body), bc = bodyB.getCenter(V3());
  const span = clamp(Math.max(size.x, size.z, 0.01), C.L * 0.9, C.L * 1.55);
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
  model.userData.synPat = { asp: clamp(C.L / Math.max(C.H * 2, 0.02), 1, 14), seed };
  model.userData.synGenome = g;
  model.userData.synSkin = SKINS[g.mat] || SKINS.wet;
  model.userData.tris = Math.round(tris);
  return model;
}
// Fish 用：skinFish 之后把器物质感（金属 / 瓷 / 纸…）的 PBR 参数还原、按材质换皮肤（鳞片 / 光滑）
export function synthAfterSkin(model, swim) {
  const sk = model.userData.synSkin;
  if (swim?.U?.uSk0 && sk) { const u = swim.U.uSk0.value; u.x = sk.type; u.y = sk.den * 0.7; u.z = sk.bump; }
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material, p = m?.userData?.synKeep; if (!p) return;
    for (const key in p) m[key] = p[key];
  });
}
// skinFish 之前：记下需要保留的 PBR 参数
export function synthBeforeSkin(model) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material; if (!m?.userData?.synPBR || !m.isMeshPhysicalMaterial) return;
    m.userData.synKeep = { metalness: m.metalness, roughness: m.roughness, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness, iridescence: m.iridescence, sheen: m.sheen };
  });
}
