// UGC 独一无二系统 v0.6：每条鱼 = 种子 → 花纹族 × 配色 × 密度 × 方向 + 0–2 件代码生成的装饰物 + 作品名
// - 花纹：一个共享的 shader（只编译一次），用 uniform 切换 13 种图案族；坐标为"鱼模型空间"，按部件静态矩阵贴合，鳍摆动时花纹跟着动
// - 装饰：利用包围盒 + 射线找到头顶/眼睛/背部/尾部的表面点，自动适配 20 种不同体型
import * as THREE from 'three';

// ---------------- 确定性随机 ----------------
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }
const pickR = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export const newSeed = () => (Math.random() * 4294967296) >>> 0;

// ---------------- 花纹族 / 调色板 / 装饰 ----------------
export const PATTERNS = ['条纹', '斑点', '波点', '渐变', '豹纹', '迷彩', '星星', '格纹', '鳞光', '像素', '人字纹', '爱心', '波纹', '火焰', '彩虹', '斑马'];
// v1.0：13 之后的花纹族（火焰/彩虹/斑马）只通过 gx.pattern 覆盖出现；野生种子仍只抽前 13 种，保证旧存档外观不变
export const BASE_PATTERNS = 13;
export const PAT = { flame: 13, rainbow: 14, zebra: 15 };
// [名字, 底色调 C1, 图案色 C2, 点缀色 C3]
// v3 柔和配色（对齐猛兽派对）：全部降饱和、偏自然（贝壳/珊瑚/海藻/沙/石色系），保留色相辨识度，无荧光
export const PALETTES = [
  ['薄荷', '#dcebe3', '#6fa592', '#f3f0e6'], ['落日', '#f1dfcc', '#cf8466', '#e2bd78'], ['星河', '#d6d9e6', '#56648f', '#ebe0b8'],
  ['樱花', '#f2e2e3', '#cc95a0', '#f8f3ee'], ['柠檬', '#f1ebcb', '#cfb35c', '#86a573'], ['深海', '#d2e0e8', '#3e6580', '#94c0b9'],
  ['奶油', '#f3eadb', '#c29c77', '#76573f'], ['电光', '#d9e8ee', '#5797b6', '#bf9fbd'], ['葡萄', '#e4dfec', '#8573a8', '#ddc684'],
  ['珊瑚', '#f1e0d8', '#cf8169', '#5c9d9a'], ['熊猫', '#eeece8', '#3b3e43', '#f8f6f2'], ['草莓', '#f1e0de', '#c06b6e', '#f3ebdb'],
  ['抹茶', '#e3ebd6', '#76945a', '#f1ecd9'], ['焦糖', '#efe2cf', '#a37148', '#4c3627'], ['极光', '#d9ece7', '#6a7bb0', '#80bb9c'],
  ['西瓜', '#e0ebd8', '#4c8559', '#cf7d7b'], ['蜜桃', '#f3e4da', '#d89e87', '#c68590'], ['海盐', '#e7eff2', '#73a2ba', '#f9f9f6'],
];
export const DECOS = {
  tophat: { label: '小礼帽', slot: 'head' }, crown: { label: '小皇冠', slot: 'head' }, party: { label: '派对帽', slot: 'head' },
  bow: { label: '蝴蝶结', slot: 'head' }, flower: { label: '小花', slot: 'head' }, antenna: { label: '触角小灯', slot: 'head' },
  halo: { label: '光环', slot: 'head' }, shades: { label: '墨镜', slot: 'face', fishy: true }, scarf: { label: '围巾', slot: 'neck', fishy: true },
  wreath: { label: '花环', slot: 'neck', fishy: true }, backpack: { label: '小背包', slot: 'back' }, sticker: { label: '星星贴纸', slot: 'side' },
  bubbles: { label: '气泡尾迹', slot: 'tail' },
};
const NOT_FISHY = new Set(['octopus', 'king-crab', 'snow-crab', 'manta-ray', 'lobster', 'squid', 'cuttlefish', 'starfish', 'jellyfish', 'mantis-shrimp', 'flounder']);
const SUFFIX = ['', '', ' No.', '·限定', ' Ver.2', '之梦', '日记', '·夏', ' Plus'];
const legacyAcc = { crown: 'crown', shades: 'shades', party: 'party', bow: 'bow', flower: 'flower' };

// 种子 → 全部外观参数（存档里也存一份，便于图鉴展示 & 以后服务端复现）
export function ugcFromSeed(seed, spId, legacy = null) {
  const r = rng(seed ^ 0x2545f491);
  const pat = Math.floor(r() * BASE_PATTERNS);
  const pi = Math.floor(r() * PALETTES.length);
  const P = PALETTES[pi];
  let c = [P[1], P[2], P[3]];
  if (r() < 0.3) c = [c[0], c[2] === '#ffffff' ? c[1] : c[2], c[2] === '#ffffff' ? c[2] : c[1]];   // 偶尔主次色互换
  const den = [3.2, 4.2, 5.4, 6.8, 8.5][Math.floor(r() * 5)] * (pat === 3 || pat === 12 ? 0.7 : pat === 5 ? 0.6 : 1);
  const rot = (Math.floor(r() * 8) / 8) * Math.PI * (pat === 0 || pat === 10 ? 0.5 : 1) + (pat === 0 ? Math.PI / 2 : 0) * (r() < 0.5 ? 1 : 0);
  const amt = 0.78 + r() * 0.18, tint = 0.18 + r() * 0.3, wave = r() < 0.5 ? r() : 0;
  // 装饰：0–2 件（30% / 45% / 25%），不同槽位，体型不合适的跳过
  const nDeco = (() => { const x = r(); return x < 0.3 ? 0 : x < 0.75 ? 1 : 2; })();
  const decos = [];
  const keys = Object.keys(DECOS).filter((k) => !(DECOS[k].fishy && NOT_FISHY.has(spId)));
  for (let i = 0; i < 12 && decos.length < nDeco; i++) {
    const k = pickR(r, keys);
    if (decos.some((d) => DECOS[d].slot === DECOS[k].slot)) continue;
    decos.push(k);
  }
  if (legacy && legacyAcc[legacy] && !decos.includes(legacy) && !(DECOS[legacy].fishy && NOT_FISHY.has(spId))) { decos.length = Math.min(decos.length, 1); if (decos[0] && DECOS[decos[0]].slot === DECOS[legacy].slot) decos.length = 0; decos.push(legacy); }
  let suf = pickR(r, SUFFIX); if (suf === ' No.') suf += 1 + (seed % 99);
  const title = `${P[0]}${PATTERNS[pat]}${suf}`;
  return { seed, pat, pal: pi, c, den: +den.toFixed(2), rot: +rot.toFixed(3), amt: +amt.toFixed(2), tint: +tint.toFixed(2), wave: +wave.toFixed(2), decos, title };
}
export const decoText = (u) => (u?.decos || []).map((d) => DECOS[d]?.label).filter(Boolean).join('、');

// ---------------- 花纹 shader ----------------
const GLSL_PARS = /* glsl */`
uniform float uPat, uDen, uRot, uSeed, uAmt, uTint, uWave, uPartAmt;
uniform vec3 uC1, uC2, uC3, uBMin, uBInv;
varying vec3 vFP; varying vec3 vFN;
float ugH(vec2 p){ p = fract((p + uSeed * 0.013) * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 ugH2(vec2 p){ float n = ugH(p); return vec2(n, ugH(p + n + 17.0)); }
float ugN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ugH(i), ugH(i + vec2(1, 0)), f.x), mix(ugH(i + vec2(0, 1)), ugH(i + vec2(1, 1)), f.x), f.y); }
float ugF(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * ugN(p); p *= 2.03; a *= 0.5; } return s; }
float ugA(float d, float w){ return smoothstep(w, -w, d); }
float ugStar(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994375, -0.587785252292); const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x); p -= 2.0 * max(dot(k1, p), 0.0) * k1; p -= 2.0 * max(dot(k2, p), 0.0) * k2; p.x = abs(p.x); p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1); float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y); }
float ugHeart(vec2 p){ p.x = abs(p.x);
  if (p.y + p.x > 1.0) return length(p - vec2(0.25, 0.75)) - 0.35355;
  vec2 a = p - vec2(0.0, 1.0), b = p - 0.5 * max(p.x + p.y, 0.0);
  return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y); }
vec3 ugcPattern(vec3 base){
  vec3 fp = vFP, fn = normalize(vFN);
  vec3 q = clamp((fp - uBMin) * uBInv, 0.0, 1.0);
  float wt = smoothstep(0.62, 0.92, abs(fn.y));
  vec2 p = mix(fp.xy, fp.xz, wt);
  float cr = cos(uRot), sr = sin(uRot);
  p = mat2(cr, sr, -sr, cr) * p * uDen;
  float w = max(fwidth(p.x), fwidth(p.y)) * 0.75 + 1e-4;
  int P = int(uPat + 0.5);
  float m = 0.0; vec3 pc = uC2;
  if (P == 0) {            // 条纹（可波浪）
    float x = p.x + sin(p.y * 2.3 + uSeed) * 0.22 * uWave;
    m = ugA(abs(fract(x) - 0.5) - 0.2, w);
    pc = mix(uC2, uC3, step(0.5, fract(floor(x) * 0.5)) * 0.35);
  } else if (P == 1) {     // 斑点（随机大小）
    vec2 c = floor(p), f = fract(p);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)); vec2 o = ugH2(c + g);
      float r = 0.12 + 0.2 * o.y, on = step(0.28, ugH(c + g + 7.0));
      float d = length(g + o * 0.6 + 0.2 - f) - r;
      float k = ugA(d, w) * on; if (k > m) { m = k; pc = mix(uC2, uC3, step(0.72, ugH(c + g + 3.0))); }
    }
  } else if (P == 2) {     // 波点（错位网格）
    vec2 g = p; g.x += 0.5 * mod(floor(g.y), 2.0);
    m = ugA(length(fract(g) - 0.5) - 0.22, w);
    pc = mix(uC2, uC3, step(0.5, fract((floor(g.x) + floor(g.y)) * 0.5)) * 0.5);
  } else if (P == 3) {     // 渐变（三色晕染）
    float t = clamp(dot(q.xy - 0.5, vec2(cr, sr)) * 1.5 + 0.5 + (ugN(p * 0.8) - 0.5) * 0.25, 0.0, 1.0);
    pc = mix(uC2, uC3, smoothstep(0.2, 0.85, t)); m = 0.55 + 0.35 * smoothstep(0.0, 1.0, abs(t - 0.5) * 2.0);
  } else if (P == 4) {     // 豹纹（环斑）
    vec2 c = floor(p), f = fract(p); float d1 = 8.0; vec2 id = c;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)); vec2 o = ugH2(c + g) * 0.8 + 0.1;
      float d = length((g + o - f) * vec2(1.0, 1.25)); if (d < d1) { d1 = d; id = c + g; }
    }
    float r = 0.3 + 0.1 * ugH(id);
    float ring = ugA(abs(d1 - r) - 0.075 - ugN(p * 3.0) * 0.04, w);
    float core = ugA(d1 - (r - 0.07), w);
    m = max(ring, core * 0.55); pc = mix(uC3, uC2, ring);
  } else if (P == 5) {     // 迷彩（三色色块）
    float n = ugF(p * 0.7 + uSeed * 0.1);
    float a = ugA(0.5 - n, w * 0.5), b = ugA(0.6 - n, w * 0.5);
    m = a; pc = mix(uC2, uC3, b);
  } else if (P == 6) {     // 星星
    vec2 c = floor(p), f = fract(p) - 0.5; float hh = ugH(c);
    f += (ugH2(c + 5.0) - 0.5) * 0.2;
    float an = hh * 6.283; f = mat2(cos(an), sin(an), -sin(an), cos(an)) * f;
    m = ugA(ugStar(f, 0.2 + 0.12 * fract(hh * 7.0), 0.45), w) * step(0.22, hh);
    pc = mix(uC2, uC3, step(0.6, fract(hh * 13.0)));
  } else if (P == 7) {     // 格纹（苏格兰）
    float a = ugA(abs(fract(p.x) - 0.5) - 0.17, w), b = ugA(abs(fract(p.y) - 0.5) - 0.17, w);
    float l = max(ugA(abs(fract(p.x + 0.5) - 0.5) - 0.03, w), ugA(abs(fract(p.y + 0.5) - 0.5) - 0.03, w));
    m = max(max(a, b) * 0.6, a * b); pc = mix(uC2, uC2 * 0.7, a * b);
    m = max(m, l * 0.55); pc = mix(pc, uC3, l * 0.8);   // v3：细线减弱，避免读成"线框网格"
  } else if (P == 8) {     // 鳞光（鳞片描边 + 流光）
    vec2 g = p * vec2(1.0, 1.35); g.y += 0.5 * mod(floor(g.x), 2.0);
    vec2 f = fract(g); float d = length(f - vec2(0.0, 0.5));
    float edge = ugA(abs(d - 0.58) - 0.055, w * 1.4);
    float sheen = 0.5 + 0.5 * sin(q.x * 10.0 + q.y * 6.0 + uSeed);
    m = edge * 0.85 + 0.2 * sheen; pc = mix(uC2, uC3, sheen);
  } else if (P == 9) {     // 像素
    vec2 c = floor(p * 1.25); float hh = ugH(c);
    m = step(0.5, hh); pc = mix(uC2, uC3, step(0.8, hh));
    vec2 f = fract(p * 1.25); m *= step(0.06, f.x) * step(0.06, f.y) * 0.25 + 0.75;
  } else if (P == 10) {    // 人字纹 / 锯齿
    float y = p.y + abs(fract(p.x) - 0.5) * 1.4;
    m = ugA(abs(fract(y) - 0.5) - 0.18, w * 1.5);
    pc = mix(uC2, uC3, step(0.5, fract(floor(y) * 0.5)) * 0.6);
  } else if (P == 11) {    // 爱心
    vec2 c = floor(p), f = fract(p) - 0.5; float hh = ugH(c);
    float s = 2.4 + hh * 1.0;
    m = ugA(ugHeart(f * s + vec2(0.0, 0.5)) / s, w) * step(0.2, hh);
    pc = mix(uC2, uC3, step(0.65, fract(hh * 11.0)));
  } else if (P == 13) {    // 火焰（hot-rod 火舌：从鼻尖向后舔）
    float tg = abs(fract(q.y * 3.2 + 0.35 * sin(q.x * 7.0 + uSeed)) - 0.5) * 2.0;
    float reach = 0.62 - 0.4 * tg + (ugN(p * 1.3) - 0.5) * 0.12;
    float x = 1.0 - q.x;
    m = ugA(x - reach, w * 0.5 + 0.012);
    pc = mix(uC3, uC2, smoothstep(reach * 0.25, reach * 0.95, x));
  } else if (P == 14) {    // 彩虹（斜向柔和色带）
    float hu = fract(dot(q.xy, vec2(0.9, 1.4)) * 1.2 + uSeed * 0.05);
    vec3 hc = clamp(abs(mod(hu * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    pc = mix(hc, vec3(1.0), 0.18); m = 0.88;
  } else if (P == 15) {    // 斑马（有机条纹）
    float x = p.x * 0.8 + ugN(p * 0.55) * 1.6;
    m = ugA(abs(fract(x) - 0.5) - 0.2, w * 1.2);
    pc = mix(uC2, uC3, step(0.8, ugH(vec2(floor(x), 3.0))) * 0.4);
  } else {                 // 波纹（同心环）
    vec2 ctr = vec2(0.25 * sin(uSeed), 0.1 * cos(uSeed * 1.7)) * uDen;
    float d = length(p - ctr);
    m = ugA(abs(fract(d * 0.5) - 0.5) - 0.17, w);
    pc = mix(uC2, uC3, step(0.5, fract(d * 0.25)));
  }
  // 肚皮略淡：图案主要长在背和身侧，像真的鱼
  m *= mix(0.6, 1.0, smoothstep(-0.85, -0.25, fn.y));
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float l1 = max(dot(uC1, vec3(0.299, 0.587, 0.114)), 0.05);
  vec3 tinted = mix(base, clamp(uC1 * (lum / l1) * 1.08, 0.0, 1.0), uTint);   // 保亮度换色相：不洗白
  return mix(tinted, pc, clamp(m, 0.0, 1.0) * uAmt * uPartAmt);
}
`;

const SKIP = /eye|pupil|glint|mouth|smile|nostril|sucker|gill|lips/;
const FINNY = /fin|tail|fluke|dorsal|sail|wing|finlet|keel|clavus|tower|frill|ruffled|ray|oar|ribbon|crest|horn/;
const SIGNATURE = /stripe|palette|band/;   // 物种标志性花纹（小丑鱼白环、蓝吊黑斑）减弱叠加，保证可辨识

export function applyPattern(model, u) {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const box = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh && !o.userData.isOutline) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
  const size = box.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.01, 0.01, 0.01));
  const shared = {
    uPat: { value: u.pat }, uDen: { value: u.den }, uRot: { value: u.rot }, uSeed: { value: (u.seed % 9973) / 97.3 },
    uAmt: { value: u.amt }, uTint: { value: u.tint }, uWave: { value: u.wave || 0 },
    uC1: { value: mute(u.c[0], 0.75) }, uC2: { value: mute(u.c[1], 0.75) }, uC3: { value: mute(u.c[2], 0.75) },   // 旧存档里的高饱和色也一起柔化
    uBMin: { value: box.min.clone() }, uBInv: { value: new THREE.Vector3(1 / size.x, 1 / size.y, 1 / size.z) },
  };
  model.traverse((o) => {
    if (!o.isMesh || SKIP.test(o.name) || o.userData.isOutline) return;
    const m = o.material; if (!m || m.userData.ugc || m.isShaderMaterial) return;
    m.userData.ugc = true;
    const m2f = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const part = SIGNATURE.test(o.name) ? 0.45 : FINNY.test(o.name) ? 0.7 : 1.0;
    const prev = m.onBeforeCompile; const prevKey = m.customProgramCacheKey?.() || '';
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, shared);
      sh.uniforms.uM2F = { value: m2f }; sh.uniforms.uPartAmt = { value: part };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uM2F;\nvarying vec3 vFP; varying vec3 vFN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFP = (uM2F * vec4(transformed, 1.0)).xyz; vFN = mat3(uM2F) * objectNormal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GLSL_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = ugcPattern(diffuseColor.rgb);');
    };
    m.customProgramCacheKey = () => prevKey + '-ugc1';
    m.needsUpdate = true;
  });
}

// ---------------- 代码生成的装饰物 ----------------
// v3：装饰物颜色统一降饱和（与 parts.muteColor 同一套规则）
const _mh = { h: 0, s: 0, l: 0 };
function mute(c, k = 0.62) { const col = new THREE.Color(c); col.getHSL(_mh); col.setHSL(_mh.h, _mh.s * k, THREE.MathUtils.clamp(_mh.l * 0.92 + 0.06, 0, 0.92)); return col; }
const std = (c, o = {}) => { const oo = { ...o }; if (oo.emissive) { oo.emissive = mute(oo.emissive, 0.55); oo.emissiveIntensity = (oo.emissiveIntensity ?? 1) * 0.7; } return new THREE.MeshStandardMaterial({ color: mute(c), roughness: 0.45, ...oo }); };
const CORE = /body|mantle|head|carapace|shell|face|stripe|cephalofoil|segment/;
const raycaster = new THREE.Raycaster();
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

// 在鱼的 body 空间里找锚点（Fish 构造时 root 处于单位变换，世界 = body 空间）
export function findAnchors(fish) {
  const model = fish.model, b = fish.b0, len = fish.len0;
  const core = [], all = [];
  model.traverse((o) => { if (o.isMesh) { all.push(o); if (CORE.test(o.name) && !/fin|eye/.test(o.name)) core.push(o); } });
  const targets = core.length ? core : all;
  const ray = (ox, oy, oz, dx, dy, dz, list = targets) => {
    raycaster.set(_v.set(ox, oy, oz), _d.set(dx, dy, dz).normalize()); raycaster.far = 20;
    const h = raycaster.intersectObjects(list, false); return h.length ? h[0] : null;
  };
  // 眼睛：用模型部件位置（左右两只）
  const parts = model.userData.parts || {};
  const eyes = [];
  for (const [k, o] of Object.entries(parts)) {
    if (/^eye(-left|-right|-1|--1)?(-rim)?$/.test(k) && (k.endsWith('-rim') || /^eye-(-?1)$/.test(k)) && o.isMesh) {
      const p = o.getWorldPosition(new THREE.Vector3()); const s = o.getWorldScale(new THREE.Vector3());
      eyes.push({ p, r: Math.max(s.x, s.y) });
    }
  }
  const sp = fish.sp.id;
  let hx;
  if (sp === 'octopus' || sp === 'king-crab' || sp === 'snow-crab' || sp === 'starfish' || sp === 'jellyfish') {
    const big = parts.mantle || parts.carapace; hx = big ? big.getWorldPosition(new THREE.Vector3()).x : (b.min.x + b.max.x) / 2;
  } else if (eyes.length) hx = eyes.reduce((s, e) => s + e.p.x, 0) / eyes.length - len * 0.035;
  else hx = b.max.x - len * 0.22;
  const top = ray(hx, b.max.y + 2, 0, 0, -1, 0), bot = ray(hx, b.min.y - 2, 0, 0, 1, 0);
  const headTop = top ? top.point.clone() : new THREE.Vector3(hx, b.max.y, 0);
  const headBot = bot ? bot.point.clone() : new THREE.Vector3(hx, b.min.y, 0);
  const th = Math.max(0.05, headTop.y - headBot.y);
  // 头部尺寸：鱼越扁越小；长条鱼（皇带鱼）不会戴一顶巨帽
  const S = THREE.MathUtils.clamp(Math.max(th * 1.08, len * 0.2), 0.16, 0.46);   // 抱在怀里也要看得清
  // 脖子（围巾/花环）：眼睛后方一点的横截面
  const nx = hx - len * 0.1 - S * 0.25;
  const nt = ray(nx, b.max.y + 2, 0, 0, -1, 0), nb = ray(nx, b.min.y - 2, 0, 0, 1, 0), ns = ray(nx, (nt && nb ? (nt.point.y + nb.point.y) / 2 : 0), b.max.z + 2, 0, 0, -1);
  const neck = { x: nx, cy: nt && nb ? (nt.point.y + nb.point.y) / 2 : 0, ry: nt && nb ? (nt.point.y - nb.point.y) / 2 : th / 2, rz: ns ? Math.abs(ns.point.z) : th / 2 };
  // 背部：核心身体中段
  const cb = new THREE.Box3(); targets.forEach((o) => cb.expandByObject(o));
  const bx = THREE.MathUtils.lerp(cb.min.x, cb.max.x, sp === 'octopus' ? 0.3 : 0.42);
  const bt = ray(bx, b.max.y + 2, 0, 0, -1, 0);
  const back = bt ? bt.point.clone() : new THREE.Vector3(bx, cb.max.y, 0);
  // 身侧（贴纸）：中段偏上
  const sx = THREE.MathUtils.lerp(cb.min.x, cb.max.x, 0.45), sy = THREE.MathUtils.lerp(cb.min.y, cb.max.y, 0.58);
  const side = [];
  for (const s of [1, -1]) { const h = ray(sx, sy, s * (b.max.z + 2), 0, 0, -s); if (h) side.push({ p: h.point.clone(), n: h.face.normal.clone().transformDirection(h.object.matrixWorld) }); }
  const tail = new THREE.Vector3(cb.min.x, (cb.min.y + cb.max.y) / 2, 0);
  return { headTop, th, S, eyes, neck, back, side, tail, len, sp };
}

function tube(pts, r, mat, seg = 16) { return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8), mat); }

// 返回 { group, anim?(t) }；所有尺寸以 A.S（头部尺寸）为基准
export function buildDeco(kind, A, seed) {
  const g = new THREE.Group(), S = A.S, r = rng(seed ^ (kind.length * 7919));
  let anim = null;
  const tilt = (r() - 0.5) * 0.35;
  if (kind === 'tophat') {
    const blk = std(pickR(r, ['#23262e', '#3b2b5a', '#7a2433', '#1f4b6e'])), band = std(pickR(r, ['#ff6b57', '#ffd23f', '#ffffff', '#22c3a0']));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 24), blk); brim.position.y = 0.03; g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.62, 24), blk); crown.position.y = 0.36; g.add(crown);
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.12, 24), band); rib.position.y = 0.14; g.add(rib);
    g.scale.setScalar(S * 0.62); g.position.copy(A.headTop).add(new THREE.Vector3(0, -S * 0.04, 0)); g.rotation.z = -0.18 + tilt;
  } else if (kind === 'crown') {
    const gold = std('#ffcf3f', { metalness: 0.75, roughness: 0.3 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.22, 20, 1, true), gold); band.material.side = THREE.DoubleSide; band.position.y = 0.11; g.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), gold); sp.position.set(Math.cos(a) * 0.42, 0.34, Math.sin(a) * 0.42); g.add(sp);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), std(['#ff4d6d', '#4dc9ff', '#7dff9a'][i % 3], { roughness: 0.2 })); gem.position.set(Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45); g.add(gem);
    }
    g.scale.setScalar(S * 0.6); g.position.copy(A.headTop).add(new THREE.Vector3(0, -S * 0.05, 0)); g.rotation.z = tilt * 0.6;
  } else if (kind === 'party') {
    const c1 = pickR(r, ['#ff5fa2', '#5fb6ff', '#ffb84d', '#8a4dff']);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.0, 20), std(c1)); cone.position.y = 0.5; g.add(cone);
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.09, 0.035, 6, 20), std(i % 2 ? '#ffe14d' : '#ffffff')); t.rotation.x = Math.PI / 2; t.position.y = 0.16 + i * 0.27; g.add(t); }
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), std('#ffe14d')); pom.position.y = 1.02; g.add(pom);
    g.scale.setScalar(S * 0.62); g.position.copy(A.headTop).add(new THREE.Vector3(0, -S * 0.03, 0)); g.rotation.z = -0.3 + tilt;
  } else if (kind === 'bow') {
    const m = std(pickR(r, ['#ff5f7e', '#ff9ec4', '#5fb6ff', '#ffd23f', '#b07cff']));
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), m); w.scale.set(0.45, 0.7, 1); w.position.z = s * 0.28; w.rotation.x = s * 0.5; g.add(w); }
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m); g.add(k);
    g.scale.setScalar(S * 0.55); g.position.copy(A.headTop).add(new THREE.Vector3(-S * 0.05, S * 0.08, 0)); g.rotation.x = 0.35; g.rotation.z = tilt;
  } else if (kind === 'flower') {
    const pc = pickR(r, ['#ffb3d1', '#ffffff', '#ffd84a', '#b9a8ff', '#ff8a7a']);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std(pc)); p.scale.set(1, 0.35, 0.62); p.position.set(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24); p.rotation.y = -a; g.add(p); }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), std('#ffcf3a')); c.position.y = 0.05; g.add(c);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), std('#4fbf6b')); stem.position.y = -0.15; g.add(stem);
    g.scale.setScalar(S * 0.72); g.position.copy(A.headTop).add(new THREE.Vector3(0, S * 0.12, 0)); g.rotation.set(0.3, 0, 0.35 + tilt);
  } else if (kind === 'antenna') {
    const stalkM = std('#3a3f4a');
    const tip = new THREE.Vector3(0.55, 1.05, 0);
    g.add(tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.6, 0), new THREE.Vector3(0.3, 1.05, 0), tip], 0.04, stalkM, 20));
    const col = pickR(r, ['#fff27a', '#7dfcff', '#ff9ef0', '#9dff8a']);
    const bulbM = std(col, { emissive: col, emissiveIntensity: 1.6, roughness: 0.2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), bulbM); bulb.position.copy(tip).add(new THREE.Vector3(0.04, -0.1, 0)); g.add(bulb);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: mute(col), transparent: true, opacity: 0.25, depthWrite: false })); glow.position.copy(bulb.position); glow.name = 'fx-glow'; g.add(glow);
    g.scale.setScalar(S * 0.75); g.position.copy(A.headTop).add(new THREE.Vector3(0, -S * 0.02, 0));
    anim = (t) => { const k = 0.5 + 0.5 * Math.sin(t * 3.2); bulbM.emissiveIntensity = 1.1 + k * 0.9; glow.scale.setScalar(0.9 + k * 0.25); g.rotation.z = Math.sin(t * 2.1) * 0.08; };
  } else if (kind === 'halo') {
    const col = pickR(r, ['#ffe27a', '#bff7ff', '#ffc4ef']);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 36), std(col, { emissive: col, emissiveIntensity: 1.2, roughness: 0.25 }));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    // r1：翻车鱼身体又高又圆，旧锚点让光环悬在背鳍前缘、看着偏后 → 往前挪到眼睛正上方并压低
    const mola = A.sp === 'sunfish';
    g.scale.setScalar(S * 0.7); const y0 = A.headTop.y + S * (mola ? 0.26 : 0.42); g.position.set(A.headTop.x + S * (mola ? 0.3 : -0.05), y0, 0); g.rotation.z = mola ? -0.28 : -0.15;
    anim = (t) => { g.position.y = y0 + Math.sin(t * 2.4) * S * 0.04; ring.rotation.z = t * 0.6; };
  } else if (kind === 'shades') {
    const frame = std(pickR(r, ['#15181e', '#ff4d6d', '#ffffff', '#2b6cff']), { roughness: 0.3 });
    const lens = std(pickR(r, ['#1a1d24', '#3b2a5c', '#0f4a5a']), { metalness: 0.5, roughness: 0.15 });
    const eyes = A.eyes.length >= 2 ? A.eyes.slice(0, 2) : [{ p: new THREE.Vector3(A.headTop.x + S * 0.2, A.headTop.y - A.th * 0.35, A.th * 0.35), r: S * 0.2 }, { p: new THREE.Vector3(A.headTop.x + S * 0.2, A.headTop.y - A.th * 0.35, -A.th * 0.35), r: S * 0.2 }];
    const tops = [];
    for (const e of eyes) {
      const s = Math.sign(e.p.z) || 1, R = Math.max(e.r * 1.45, S * 0.16);
      const lg = new THREE.Group(); lg.position.copy(e.p).add(new THREE.Vector3(R * 0.12, 0, s * R * 0.42));
      const ln = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.92, R * 0.18, 20), lens); ln.rotation.x = Math.PI / 2; lg.add(ln);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.13, 8, 24), frame); lg.add(rim);
      g.add(lg); tops.push(lg.position.clone().add(new THREE.Vector3(0, R * 0.55, 0)));
    }
    if (tops.length === 2) {
      const mid = tops[0].clone().lerp(tops[1], 0.5); mid.y = Math.max(tops[0].y, tops[1].y) + S * 0.06; mid.x += S * 0.05;
      g.add(tube([tops[0], mid, tops[1]], Math.max(0.006, S * 0.03), frame, 18));
    }
  } else if (kind === 'scarf' || kind === 'wreath') {
    const N = A.neck, ry = N.ry * 1.08 + 0.008, rz = N.rz * 1.1 + 0.008;
    const ringG = new THREE.Group(); ringG.position.set(N.x, N.cy, 0); g.add(ringG);
    if (kind === 'scarf') {
      const c1 = pickR(r, ['#ff6b57', '#22b894', '#5f7bff', '#ffc61a', '#ff7fb0']), c2 = pickR(r, ['#ffffff', '#fff2a8', '#20262e']);
      const tor = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 10, 36), std(c1, { roughness: 0.85 }));
      tor.rotation.y = Math.PI / 2; tor.scale.set(rz, ry, Math.min(ry, rz) * 0.9); ringG.add(tor);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(1, 0.165, 6, 36), std(c2, { roughness: 0.85 }));
      stripe.rotation.y = Math.PI / 2; stripe.scale.set(rz * 1.002, ry * 1.002, Math.min(ry, rz) * 0.3); ringG.add(stripe);
      // 垂下的两条围巾尾巴
      for (const s of [0, 1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.16), std(s ? c2 : c1, { roughness: 0.85 }));
        const k = Math.min(ry, rz) * 1.6; tail.scale.setScalar(k);
        tail.position.set(-0.02 - s * 0.05 * k, -ry * 0.75 - 0.15 * k, rz * 0.95); tail.rotation.set(0.2, 0, 0.25 + s * 0.25); ringG.add(tail);
      }
      anim = (t) => { ringG.children.slice(2).forEach((c, i) => { c.rotation.z = 0.25 + i * 0.25 + Math.sin(t * 4 + i) * 0.12; }); };
    } else {
      const leaf = std('#4fbf6b', { roughness: 0.7 });
      const tor = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 36), leaf); tor.rotation.y = Math.PI / 2; tor.scale.set(rz, ry, Math.min(ry, rz) * 1.4); ringG.add(tor);
      const cols = ['#ffb3d1', '#ffffff', '#ffd84a', '#b9a8ff', '#ff8a7a'];
      const n = 9, fs = Math.min(ry, rz) * 0.28 + 0.01;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r();
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), std(cols[(i + Math.floor(r() * 5)) % 5], { roughness: 0.6, flatShading: true }));
        f.scale.set(fs, fs * 0.7, fs); f.position.set(0, Math.sin(a) * ry, Math.cos(a) * rz); ringG.add(f);
      }
    }
  } else if (kind === 'backpack') {
    const c1 = pickR(r, ['#ff6b57', '#ffc61a', '#22b894', '#5f7bff', '#ff7fb0']);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.62, 0.62, 2, 2, 2), std(c1, { roughness: 0.8 })); bag.position.y = 0.3; g.add(bag);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.64), std('#ffffff', { roughness: 0.8 })); flap.position.y = 0.6; g.add(flap);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.08), std('#ffffff', { roughness: 0.8 })); pocket.position.set(0, 0.24, 0.34); pocket.rotation.y = 0; g.add(pocket);
    const pocket2 = pocket.clone(); pocket2.position.z = -0.34; g.add(pocket2);
    const strapM = std('#3a3f4a');
    for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 20, Math.PI), strapM); st.rotation.y = Math.PI / 2; st.rotation.z = Math.PI; st.position.set(s * 0.18, 0.05, 0); st.scale.set(1, 0.9, 1); g.add(st); }
    g.scale.setScalar(S * 0.55); g.position.copy(A.back).add(new THREE.Vector3(0, -S * 0.08, 0));
  } else if (kind === 'sticker') {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.42 : 1; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) shape.lineTo(x, y); else shape.moveTo(x, y); }
    shape.closePath();
    const col = pickR(r, ['#ffd23f', '#ff7fb0', '#7dfcff', '#ffffff', '#ff6b57']);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.05, bevelSegments: 1 });
    const mat = std(col, { roughness: 0.35 }), edge = std('#ffffff', { roughness: 0.5 });
    for (const sd of A.side) {
      const st = new THREE.Group();
      const m1 = new THREE.Mesh(geo, mat); m1.position.z = 0.02; st.add(m1);
      const m2 = new THREE.Mesh(new THREE.ShapeGeometry(shape), edge); m2.scale.setScalar(1.18); st.add(m2);
      st.scale.setScalar(S * 0.42); st.position.copy(sd.p).addScaledVector(sd.n, 0.004);
      st.lookAt(st.position.clone().add(sd.n)); st.rotateZ(r() * 0.8 - 0.4);
      g.add(st);
    }
  } else if (kind === 'bubbles') {
    const bm = new THREE.MeshStandardMaterial({ color: '#dff8ff', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.55, emissive: '#bdf3ff', emissiveIntensity: 0.25, depthWrite: false });
    const bs = [];
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), bm); b.name = 'fx-bubble'; b.userData.ph = i / 7; b.userData.r = 0.5 + r() * 0.6; b.userData.z = (r() - 0.5) * 0.6; g.add(b); bs.push(b); }
    g.position.copy(A.tail);
    const L = A.len;
    anim = (t) => {
      for (const b of bs) {
        const k = (t * 0.35 + b.userData.ph) % 1;
        b.position.set(-k * L * 0.45, Math.sin(k * 6 + b.userData.ph * 9) * L * 0.03 + k * L * 0.12, b.userData.z * L * 0.15);
        b.scale.setScalar(L * 0.022 * b.userData.r * (0.5 + k) * (k < 0.85 ? 1 : (1 - k) / 0.15));
      }
    };
    anim(0);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = !o.material.transparent; });
  return { group: g, anim };
}
