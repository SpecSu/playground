// 水族馆环境（v3）：水体光学（逐通道吸收 + 深度光衰 + 背景水色同源）、焦散、光束、程序化岩石/珊瑚/海草/海葵/沙床、主题布景
// 全部 MeshStandardMaterial + onBeforeCompile 注入（共享 uniforms，换主题只改数值不重编译）；植被/珊瑚合并为少量 draw call
import * as THREE from 'three';
import { themeOf } from './aqua_themes.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
export const FLOOR_Y = -3.1;
const QL = (() => { try { const q = new URLSearchParams(location.search).get('q'); return q === 'low' ? 0 : q === 'medium' ? 1 : 2; } catch (e) { return 2; } })();
export const AQ_Q = QL;
const DENS = [0.6, 0.85, 1][QL];

// ---------------- 噪声（JS） ----------------
function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vn3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const a = lerp(lerp(h3(xi, yi, zi), h3(xi + 1, yi, zi), xf), lerp(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), xf), yf);
  const b = lerp(lerp(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), xf), lerp(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), xf), yf);
  return lerp(a, b, zf);
}
const fbm3 = (x, y, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vn3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s; };
let floorAmp = 0.7;
export const floorAt = (x, z) => FLOOR_Y + (vn3(x * 0.18, 0.3, z * 0.18) - 0.5) * floorAmp + (vn3(x * 0.6 + 7, 1.1, z * 0.6) - 0.5) * 0.12 - Math.max(0, -z - 12) * 0.06;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296); }

// ---------------- 共享 uniforms ----------------
export const W = {
  uT: { value: 0 }, uWTop: { value: new THREE.Color() }, uWHor: { value: new THREE.Color() }, uWDeep: { value: new THREE.Color() },
  uWDen: { value: 0.035 }, uAbs: { value: V(1.5, 1, 0.8) }, uDD: { value: 0.6 }, uWY0: { value: FLOOR_Y }, uWY1: { value: 5.5 },
  uCC: { value: new THREE.Color() }, uCK: { value: 1 }, uSunDir: { value: V(0.22, 1, 0.12).normalize() }, uTrans: { value: new THREE.Color() },
  uLava: { value: new THREE.Color('#d9773f') }, uIce: { value: new THREE.Color('#dfeef0') }, uSun: { value: new THREE.Color() },
  uSandC: { value: new THREE.Color() }, uMoss: { value: new THREE.Color() }, uMossK: { value: 0.5 },
  aqAO: { value: null }, aqAOB: { value: new THREE.Vector4(-14, -22, 1 / 28, 1 / 30) },
  // v4：雾起始距离 / 焦散全局系数 / 布景压暗与饱和度 / 鱼专用照明（key 方向+颜色、rim 颜色、[keyK, rimK, fogK, sat]）
  uFogN: { value: 6 }, uMid: { value: 0.3 }, uLift: { value: 0.07 }, uERim: { value: new THREE.Color('#6fa4cc') }, uERimK: { value: V(0, 0, 0) }, uCausG: { value: 0.6 }, uEnvK: { value: 0.9 }, uESat: { value: 1.1 },
  uFKeyDir: { value: V(-0.35, 0.8, 0.5).normalize() }, uFKey: { value: new THREE.Color('#fff3e0') }, uFRim: { value: new THREE.Color('#a8e8ff') },
  uFK: { value: new THREE.Vector4(0.55, 0.75, 0.4, 1.28) },
};
export function applyWater(th) {
  const w = th.water;
  W.uWTop.value.set(w.top); W.uWHor.value.set(w.hor); W.uWDeep.value.set(w.deep); W.uWDen.value = w.den; W.uAbs.value.set(...w.abs); W.uDD.value = w.dd;
  W.uCC.value.set(th.causCol); W.uCK.value = th.caus; W.uTrans.value.set(th.trans); W.uSun.value.set(th.sun);
  W.uSandC.value.set(th.sand.c1); W.uMoss.value.set(th.rock.moss); W.uMossK.value = th.rock.mossK;
  if (th.lava) W.uLava.value.set(th.lava);
  W.uFogN.value = w.fogN ?? 6; W.uMid.value = w.mid ?? 0.3; W.uLift.value = w.lift ?? 0.07; W.uCausG.value = 0.7;
  const e = th.env || {}, f = th.fish || {};
  W.uEnvK.value = e.k ?? 0.9; W.uESat.value = e.sat ?? 1.1; W.uERim.value.set(e.rim || '#6fa4cc'); W.uERimK.value.set(e.rimK ?? 0.05, e.fill ?? 0, 0);
  W.uFKey.value.set(f.key || '#fff3e0'); W.uFRim.value.set(f.rim || '#a8e8ff');
  W.uFK.value.set(f.keyK ?? 0.55, f.rimK ?? 0.75, f.fog ?? 0.4, f.sat ?? 1.28);
}

const NOISE_GLSL = `
float aqh3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float aqn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(aqh3(i), aqh3(i + vec3(1,0,0)), f.x), mix(aqh3(i + vec3(0,1,0)), aqh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(aqh3(i + vec3(0,0,1)), aqh3(i + vec3(1,0,1)), f.x), mix(aqh3(i + vec3(0,1,1)), aqh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float aqn2(vec2 p){ return aqn3(vec3(p, 0.37)); }
float aqfbm(vec3 p){ return aqn3(p) * 0.55 + aqn3(p * 2.07 + 3.1) * 0.28 + aqn3(p * 4.11 + 7.3) * 0.17; }
vec2 aqVor(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = vec3(aqh3(i + g), aqh3(i + g + 17.31), aqh3(i + g + 41.73)) * 0.85;
    vec3 r = g + o - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(sqrt(d1), sqrt(d2)); }`;
// 水色：背景与物体雾化同源（水平线 = hor，向下 → deep，向上 → top）
const WATER_GLSL = `
uniform vec3 uWTop, uWHor, uWDeep; uniform float uWDen, uDD, uWY0, uWY1; uniform vec3 uAbs;
vec3 aqWaterCol(vec3 d){ float y = d.y;
  return y < 0.0 ? mix(uWHor, uWDeep, smoothstep(0.0, -0.55, y)) : mix(uWHor, uWTop, pow(smoothstep(0.0, 0.9, y), 0.8)); }`;
const CAUS_GLSL = `
float causT(vec2 uv){ vec2 p = mod(uv * 6.28318, 6.28318) - 250.0; vec2 i = p; float c = 1.0; float inten = .005;
  for (int n = 0; n < 3; n++) { float t = uT * 0.5 * (1.0 - (3.5 / float(n + 1))); i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten))); }
  c /= 3.0; c = 1.17 - pow(c, 1.4); return pow(abs(c), 7.0); }`;
const HEIGHT = {
  // 沙：两组交叉沙纹（主纹 + 细纹）+ 颗粒；aqG = 波谷（碎屑沉积）
  sand: `float aqHeight(){ vec2 p = vCWP.xz; float w = aqn2(p * 0.33) * 3.2 + aqn2(p * 1.1) * 0.8;
    float r = sin(p.x * 3.6 + p.y * 1.4 + w) * 0.5 + 0.5; r = r * r;
    float r2 = sin(p.x * 9.0 - p.y * 5.5 + w * 1.7 + aqn2(p * 3.0) * 2.0) * 0.5 + 0.5; r2 = r2 * r2 * r2;
    aqG = (1.0 - r) * (0.6 + 0.4 * aqn2(p * 2.3));
    return r * 0.03 + r2 * 0.006 * aqLod + aqn2(p * 34.0) * 0.004 * aqLod + aqn2(p * 9.0) * 0.006; }`,
  brain: `float aqHeight(){ vec3 q = vOP * 2.6; float n = aqfbm(q) * 7.0 + aqn3(q * 2.3) * 1.6; float s = abs(sin(vOP.x * 15.0 + vOP.z * 8.0 + vOP.y * 5.0 + n * 3.0));
    aqG = 1.0 - smoothstep(0.05, 0.75, s); return smoothstep(0.1, 0.9, s) * 0.02 + aqn3(vOP * 40.0) * 0.0015 * aqLod + aqn3(vOP * 90.0) * 0.0008 * aqLod; }`,
  // 岩：域扭曲 fbm 大形 + 细裂缝 + 蚀孔 + 两级微颗粒（远处淡出防闪烁）；aqG = 缝隙/孔洞遮蔽
  rock: `float aqHeight(){ vec3 p = vCWP * 0.8;
    vec3 q = p * 1.6 + vec3(aqn3(p * 0.9), aqn3(p * 0.9 + 5.2), aqn3(p * 0.9 + 9.1)) * 1.3;
    float big = aqfbm(q);
    float cr = 1.0 - abs(aqn3(q * 2.2 + 3.0) * 2.0 - 1.0); cr = pow(cr, 5.0) * smoothstep(0.45, 0.7, aqn3(p * 0.7 + 11.0));
    float fw = clamp(length(fwidth(p)) * 14.0, 0.0, 1.0);          // 屏幕空间频率 → 细节淡出（防颗粒/闪烁）
    float pit = smoothstep(0.66, 0.8, aqn3(p * 9.0)) * (1.0 - fw);
    aqG = clamp(cr * 0.8 + pit * 0.45 + max(0.0, 0.42 - big) * 0.9, 0.0, 1.0);
    return big * 0.06 - cr * 0.016 - pit * 0.008 + aqn3(p * 20.0) * 0.004 * (1.0 - fw); }`,
  // 冰：大块冰裂面 + 内部裂纹线
  ice: `float aqHeight(){ vec3 p = vOP; float c = 1.0 - smoothstep(0.0, 0.05, abs(aqn3(p * 2.5) - 0.5)); aqG = c * 0.6; return aqn3(p * 6.0) * 0.016 + aqn3(p * 1.6) * 0.03 - c * 0.005; }`,
  bark: `float aqHeight(){ vec3 p = vOP; aqG = smoothstep(0.55, 0.8, aqn3(vec3(p.x * 30.0, p.y * 3.0, p.z * 30.0))); return aqn3(vec3(p.x * 30.0, p.y * 3.0, p.z * 30.0)) * 0.012 + aqn3(p * 18.0) * 0.006 + aqn3(p * 70.0) * 0.002 * aqLod; }`,
  // 珊瑚：Voronoi 珊瑚杯（息肉坑 + 隔壁脊）+ 低频起伏；aqG = 息肉坑
  coral: `float aqHeight(){
    #ifdef AQ_HQ
    float fw = 1.0 - clamp(length(fwidth(vOP * 30.0)) * 0.45, 0.0, 1.0);
    vec2 v = aqVor(vOP * 30.0); float cup = smoothstep(0.05, 0.38, v.x); float wall = 1.0 - smoothstep(0.0, 0.1, v.y - v.x);
    aqG = (1.0 - cup) * fw; return (cup * 0.6 + wall * 0.4) * 0.0045 * fw + aqn3(vOP * 8.0) * 0.008;
    #else
    float fw = 1.0 - clamp(length(fwidth(vOP * 30.0)) * 0.45, 0.0, 1.0); float c = aqn3(vOP * 30.0); aqG = smoothstep(0.6, 0.8, c) * fw; return -aqG * 0.004 + aqn3(vOP * 8.0) * 0.008;
    #endif
  }`,
};

// f: { caus, veg, bump, trans, back, lava, ice, sand }
export function aqInject(sh, f = {}) {
  const vs = sh.vertexShader, fs = sh.fragmentShader;
  if (!vs.includes('#include <common>') || !vs.includes('#include <project_vertex>') || !vs.includes('#include <begin_vertex>')) return false;
  if (!fs.includes('#include <common>') || !fs.includes('#include <emissivemap_fragment>') || !fs.includes('#include <tonemapping_fragment>')) return false;
  Object.assign(sh.uniforms, W);
  sh.uniforms.aqCK = { value: f.caus || 0 };
  if (f.sand) { sh.uniforms.aqC2 = { value: new THREE.Color(f.sand) }; }
  let defs = '';
  if (f.caus) defs += '#define AQ_CAUS\n';
  if (f.veg) defs += '#define AQ_VEG\n';
  if (f.bump) defs += '#define AQ_BUMP\n';
  if (f.trans) defs += '#define AQ_TRANS\n';
  if (f.back) defs += '#define AQ_BACK\n';
  if (f.lava) defs += '#define AQ_LAVA\n';
  if (f.ice) defs += '#define AQ_ICE\n';
  if (f.sand) defs += '#define AQ_SAND\n';
  if (f.leaf) defs += '#define AQ_LEAF\n';
  if (f.tip) defs += '#define AQ_TIP\n';
  if (f.top) defs += '#define AQ_TOP\n';
  if (f.local) defs += '#define AQ_LOCAL\n';
  if (f.fish) defs += '#define AQ_FISH\n';
  if (QL >= 1) defs += '#define AQ_HQ\n';
  let v = defs + vs.replace('#include <common>', `#include <common>
    uniform float uT; varying vec3 vCWP; varying vec3 vOP; varying float vH; varying vec2 vAqUv;
    #ifdef AQ_VEG
    attribute vec4 aVeg; attribute vec2 aV2;
    #endif`);
  v = v.replace('#include <begin_vertex>', `#include <begin_vertex>
    vOP = position; vH = 0.0; vAqUv = uv;
    #ifdef AQ_TIP
    vH = uv.y;
    #endif
    #ifdef AQ_VEG
    { float h = aVeg.w; vH = h; float ph = aVeg.x * 1.3 + aVeg.z * 0.9 + aV2.x * 6.28; float amp = aV2.y;
      float big = sin(uT * 0.5 + aVeg.x * 0.12 + aVeg.z * 0.05 + aV2.x * 0.6);
      float mid = sin(uT * 1.25 + ph + h * 2.6) * 0.32;
      float hi = sin(uT * 3.9 + ph * 2.0 + h * 9.0) * 0.05;
      float b = h * h;
      transformed.x += (big * 0.75 + 0.35 + mid) * amp * b + hi * amp * h;
      transformed.z += (cos(uT * 0.42 + ph * 0.5) * 0.45 + mid * 0.6) * amp * b * 0.6;
      transformed.y -= abs(big) * 0.12 * amp * b; }
    #endif`);
  v = v.replace('#include <project_vertex>', `#include <project_vertex>
    #ifdef USE_INSTANCING
    vCWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
    vCWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif`);
  sh.vertexShader = v;
  let g = defs + fs.replace('#include <common>', `#include <common>
    uniform float uT; uniform float aqCK; uniform vec3 uCC; uniform float uCK; uniform vec3 uSunDir, uTrans, uLava, uIce, uSandC, uMoss, uSun; uniform float uMossK;
    uniform float uFogN, uCausG, uEnvK, uESat, uMid, uLift; uniform vec3 uERim, uERimK; uniform vec3 uFKeyDir, uFKey, uFRim; uniform vec4 uFK;
    varying vec3 vCWP; varying vec3 vOP; varying float vH; varying vec2 vAqUv;
    #ifdef AQ_SAND
    uniform vec3 aqC2; uniform sampler2D aqAO; uniform vec4 aqAOB;
    #endif
    float aqG = 0.0; float aqH = 0.0; float aqLod = 1.0; float aqE = 0.0; float aqAOk = 1.0;
    ${NOISE_GLSL}${WATER_GLSL}${CAUS_GLSL}
    ${f.bump ? HEIGHT[f.bump] : ''}`);
  g = g.replace('#include <color_fragment>', `#include <color_fragment>
    aqLod = clamp(1.0 - length(vViewPosition) / 15.0, 0.0, 1.0);
    #ifdef AQ_BUMP
    aqH = aqHeight();
    #endif
    #ifdef AQ_SAND
    { vec2 xz = vCWP.xz;
      float pt = smoothstep(0.35, 0.75, aqn2(xz * 0.22) * 0.7 + aqn2(xz * 1.3) * 0.3);
      diffuseColor.rgb = mix(diffuseColor.rgb, aqC2, pt * 0.8);
      float gr = aqn2(xz * 70.0); diffuseColor.rgb *= 0.88 + 0.2 * mix(0.5, gr, aqLod);
      diffuseColor.rgb *= 0.86 + aqH * 5.0;
      // 波谷沉积：偏深偏绿灰的碎屑；波峰被冲刷得更亮
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.8, 0.76), aqG * 0.55);
      // 碎贝壳（亮米白/淡粉）+ 深色矿物颗粒（近处可见）
      float sh = smoothstep(0.8, 0.84, aqn2(xz * 13.0 + 11.0)) * step(0.45, aqn2(xz * 3.0)) + smoothstep(0.86, 0.9, aqn2(xz * 26.0 + 5.0)) * aqLod;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.91, 0.85) * mix(1.0, 0.86, aqn2(xz * 60.0)), clamp(sh, 0.0, 1.0) * 0.75);
      float dk = smoothstep(0.86, 0.9, aqn2(xz * 18.0 + 3.0)) + smoothstep(0.88, 0.92, aqn2(xz * 40.0 + 9.0)) * aqLod;
      diffuseColor.rgb *= 1.0 - clamp(dk, 0.0, 1.0) * 0.38;
      // 接触阴影 / 遮蔽（布景落地处的柔和压暗，CPU 画到一张 AO 图）
      vec2 auv = (xz - aqAOB.xy) * aqAOB.zw;
      if (auv.x > 0.0 && auv.x < 1.0 && auv.y > 0.0 && auv.y < 1.0) aqAOk = texture2D(aqAO, auv).r;
      diffuseColor.rgb *= mix(0.16, 1.0, aqAOk * aqAOk * aqAOk); }
    #endif
    #if defined(AQ_BUMP) && !defined(AQ_SAND)
    diffuseColor.rgb *= 0.84 + aqfbm(vCWP * 2.5) * 0.32;
    diffuseColor.rgb *= 1.0 - aqG * 0.5;
    #endif
    #ifdef AQ_LEAF
    { float u = vAqUv.x, h = vAqUv.y, side = abs(u - 0.5) * 2.0;
      float mid = 1.0 - smoothstep(0.0, 0.09, side);
      float sec = smoothstep(0.82, 1.0, sin((h * 46.0 - side * 4.0) * 3.14159)) * (1.0 - side) * (1.0 - mid);
      aqE = smoothstep(0.7, 1.0, side);
      diffuseColor.rgb *= 0.9 + 0.12 * aqn2(vec2(u * 10.0, h * 70.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.28 + vec3(0.03, 0.03, 0.01), mid * 0.65 + sec * 0.25);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 0.82), aqE * 0.45);
      diffuseColor.rgb *= mix(0.24, 1.0, smoothstep(0.0, 0.38, h));
      diffuseColor.rgb *= 1.0 - smoothstep(0.55, 1.0, aqn2(vec2(u * 3.0, h * 9.0) + vOP.xz)) * 0.18; }
    #endif
    #ifdef AQ_TIP
    { diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.0, 0.55, vH));
      diffuseColor.rgb *= 1.0 - aqG * 0.32;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.05, 1.0) + 0.04, smoothstep(0.7, 1.0, vH) * 0.85); }
    #endif
    #ifdef AQ_BACK
    if (!gl_FrontFacing) diffuseColor.rgb *= 0.42;
    #endif`);
  g = g.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    #ifdef AQ_BUMP
    { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(aqH), hy = dFdy(aqH);
      vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
      vec3 gg = sign(det) * (hx * r1 + hy * r2); normal = normalize(abs(det) * normal - gg); }
    #endif
    #ifdef AQ_TOP
    { vec3 wn = inverseTransformDirection(normal, viewMatrix);
      float up = smoothstep(0.25, 0.85, wn.y);
      float mn = aqfbm(vCWP * 1.6 + 2.0) + aqn3(vCWP * 9.0) * 0.18 - aqG * 0.25;
      float moss = up * smoothstep(0.46, 0.62, mn) * uMossK * 1.4;
      diffuseColor.rgb = mix(diffuseColor.rgb, uMoss * (0.75 + 0.45 * aqn3(vCWP * 28.0)), clamp(moss, 0.0, 0.85));
      diffuseColor.rgb = mix(diffuseColor.rgb, uSandC * 0.95, up * (1.0 - clamp(moss, 0.0, 1.0)) * smoothstep(0.3, 0.7, aqn3(vCWP * 3.0 + 7.0)) * 0.35);
      diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(-0.6, 0.2, wn.y));
      diffuseColor.rgb *= mix(0.28, 1.0, smoothstep(uWY0 - 0.25, uWY0 + 0.7, vCWP.y));   // 贴地接触压暗（大岩/柱/玄武岩）
      diffuseColor.rgb *= 1.0 + step(0.82, aqn3(vCWP * 16.0)) * 0.14 * aqLod - step(0.85, aqn3(vCWP * 23.0 + 4.0)) * 0.12 * aqLod;   // 矿物斑点 / 地衣点
      #ifdef AQ_LOCAL
      float sed = 1.0 - smoothstep(-0.12, 0.06, vOP.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, uSandC * 0.62, sed * 0.75);
      diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(-0.16, 0.28, vOP.y));            // 落地处接触压暗
      #endif
    }
    #endif`);
  g = g.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    #ifdef AQ_CAUS
    { vec3 wn = inverseTransformDirection(normal, viewMatrix); float up = smoothstep(-0.2, 0.9, wn.y);
      vec2 cuv = vCWP.xz * 0.27 + vec2(vCWP.y * 0.09, 0.0);
      float cz = causT(cuv) * 0.72 + causT(cuv * 1.7 + 3.1) * 0.32;
      float dk = clamp((vCWP.y - uWY0 + 2.0) / (uWY1 - uWY0 + 2.0), 0.35, 1.0);
      totalEmissiveRadiance += (diffuseColor.rgb * 0.85 + 0.06) * uCC * cz * aqCK * uCK * up * dk * 1.5 * uCausG; }
    #endif
    #if !defined(AQ_FISH) && !defined(AQ_SAND)
    // 布景冷色补光 + 边缘光（主题可调；火山暗部靠它勾出岩石结构）；朝上的面不加，避免远处发亮
    { vec3 Vv = normalize(vViewPosition); float nv = clamp(abs(dot(normal, Vv)), 0.0, 1.0);
      vec3 wn = inverseTransformDirection(normal, viewMatrix);
      float side = 1.0 - smoothstep(0.55, 0.95, wn.y);
      float er = pow(1.0 - nv, 2.2) * side * smoothstep(-0.7, 0.3, wn.y);
      float near = 1.0 - smoothstep(6.0, 16.0, length(vViewPosition));
      // 冷色侧向补光（来自左后方），只抬暗部的结构，不改变亮面
      float cf = clamp(dot(wn, normalize(vec3(-0.7, 0.25, -0.4))) * 0.5 + 0.5, 0.0, 1.0);
      totalEmissiveRadiance += uERim * (er * uERimK.x * (0.5 + 0.5 * near) + (diffuseColor.rgb * 1.5 + 0.03) * uERimK.y * cf * cf * (0.6 + 0.4 * side)); }
    #endif
    #ifdef AQ_FISH
    // 鱼专用照明（不影响布景）：柔和包裹主光 + 冷色轮廓光（上缘更强）→ 深色水体前轮廓清晰、色彩饱满
    { vec3 Vv = normalize(vViewPosition); vec3 Lk = normalize((viewMatrix * vec4(uFKeyDir, 0.0)).xyz);
      float nl = clamp((dot(normal, Lk) + 0.15) / 1.15, 0.0, 1.0);
      float nv = clamp(abs(dot(normal, Vv)), 0.0, 1.0); float rim = pow(1.0 - nv, 2.6);
      vec3 wn = inverseTransformDirection(normal, viewMatrix);
      float upk = 0.3 + 0.7 * smoothstep(-0.5, 0.7, wn.y);          // 顶光式轮廓：背脊亮、腹部弱 → 体积感
      vec3 rc = mix(uFRim, uFRim * diffuseColor.rgb * 2.0, 0.6);
      // 暗面补光：水体散射色的柔和环境光（暗部保留固有色相，不发死黑）
      vec3 amb = diffuseColor.rgb * mix(mix(uWTop, uERim, 0.6), vec3(1.0), 0.45) * (1.0 - nl) * 0.13 * (0.6 + 0.4 * smoothstep(-0.8, 0.4, wn.y));
      totalEmissiveRadiance += diffuseColor.rgb * uFKey * nl * nl * uFK.x + rc * rim * upk * uFK.y + amb; }
    #endif
    #ifdef AQ_TRANS
    { vec3 Vd = normalize(vCWP - cameraPosition); float bl = pow(max(dot(Vd, uSunDir), 0.0), 3.0);
      float nv = abs(dot(normal, normalize(vViewPosition))); float rimT = pow(1.0 - nv, 2.0);
      float tk = (0.3 + 0.7 * vH);
      #ifdef AQ_LEAF
      tk *= 1.0 + aqE * 1.3;
      #endif
      #ifdef AQ_TIP
      tk *= 0.6 + smoothstep(0.55, 1.0, vH) * 1.2;
      #endif
      totalEmissiveRadiance += diffuseColor.rgb * uTrans * (0.14 + 0.85 * bl + rimT * 0.45) * tk; }
    #endif
    #ifdef AQ_LAVA
    { float c = 1.0 - abs(aqn3(vOP * 3.5 + vec3(0.0, uT * 0.03, 0.0)) * 2.0 - 1.0); float gl = pow(c, 22.0) * smoothstep(0.35, 0.7, aqn3(vOP * 1.7 + 4.0));
      float pul = 0.75 + 0.25 * sin(uT * 1.3 + vOP.y * 4.0);
      float msk = smoothstep(0.3, 0.7, aqn3(vOP * 1.7 + 4.0));
      totalEmissiveRadiance += uLava * (gl * 2.8 + pow(c, 9.0) * 0.22 * msk + pow(c, 6.0) * 0.04) * pul * (0.4 + 0.6 * smoothstep(0.0, 0.8, vOP.y)); }
    #endif
    #ifdef AQ_ICE
    // 冰：厚处（正对视线）= 深蓝内散射，边缘 = 霜白柔边；折射方向偏移采样做"冰内"的云絮/气泡/裂纹层
    { vec3 Vv = normalize(vViewPosition); float nv = abs(dot(normal, Vv)); float fr = pow(1.0 - nv, 2.2);
      vec3 rd = inverseTransformDirection(refract(-Vv, normal, 0.76), viewMatrix);
      vec3 ip = vCWP * 1.1 + rd * 0.55;
      float cloud = aqfbm(ip * 1.7);
      float bub = smoothstep(0.86, 0.93, aqn3(ip * 16.0)) * aqLod;
      float vein = (1.0 - smoothstep(0.0, 0.04, abs(aqn3(ip * 2.2 + 5.0) - 0.5))) * 0.8;
      vec3 deep = vec3(0.16, 0.38, 0.52), mid = vec3(0.46, 0.7, 0.8), frost = vec3(0.86, 0.94, 0.97);
      vec3 ic = mix(deep, mid, smoothstep(0.25, 0.75, cloud) * 0.8 + fr * 0.4);
      ic = mix(ic, frost, clamp(fr * 0.7 + vein * 0.75 + aqG * 0.5, 0.0, 1.0));
      diffuseColor.rgb *= 0.45;
      totalEmissiveRadiance += ic * (0.42 + 0.25 * nv) + frost * bub * 0.25 + uIce * fr * 0.22; }
    #endif`);
  // 水体：深度光衰 + 逐通道吸收（红先衰减）→ 远处融入水色（在 tone mapping 前，与背景同一空间）
  g = g.replace('#include <tonemapping_fragment>', `{ vec3 dv = vCWP - cameraPosition; float d = length(dv); vec3 dir = dv / max(d, 1e-3);
      float dk = clamp((uWY1 - vCWP.y) / (uWY1 - uWY0), 0.0, 1.15);
      #ifdef AQ_FISH
      // 鱼：深度光衰与水体雾都大幅减弱（只保留一点纵深提示），不被水色吃掉饱和度
      gl_FragColor.rgb *= mix(1.0, uDD, dk * uFK.z * 0.6);
      float k1 = d - 7.0; float od = 0.5 * (k1 + sqrt(k1 * k1 + 8.0)) * 0.6 * uFK.z;
      #else
      gl_FragColor.rgb *= mix(1.0, uDD, dk) * uEnvK;
      // 雾只在远景起作用：uFogN 米内几乎通透 → 中景轻微 → 远景（>15m）迅速融进深色水体；软膝避免分层线
      float k1 = d - uFogN, k2 = d - 15.0;
      float od = 0.5 * (k1 + sqrt(k1 * k1 + 6.0)) * 0.55 + 0.5 * (k2 + sqrt(k2 * k2 + 10.0)) * 1.1;
      #endif
      #ifndef AQ_FISH
      // 中景空气透视：只给布景染一点水色（偏蓝青，不发灰），远处石头融向背景色而不是灰绿
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.55 + aqWaterCol(dir) * 0.7, smoothstep(3.0, 11.0, d) * uMid);
      // 近景暗部抬升到水色（in-scatter），岩石阴影不再是死黑，色相跟随水体
      gl_FragColor.rgb += mix(uWHor, uWTop, 0.3) * uLift;
      #endif
      vec3 T = exp(-uAbs * od * uWDen);
      vec3 wc = aqWaterCol(dir) + uSun * pow(max(dot(dir, uSunDir), 0.0), 6.0) * 0.05;
      gl_FragColor.rgb = gl_FragColor.rgb * T + wc * (1.0 - T);
      // 色彩分级（ACES 前）：补偿 ACES 去饱和；暗部保留色相
      float lu = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      #ifdef AQ_FISH
      gl_FragColor.rgb = max(mix(vec3(lu), gl_FragColor.rgb, uFK.w), 0.0);
      #else
      gl_FragColor.rgb = max(mix(vec3(lu), gl_FragColor.rgb, uESat), 0.0);
      #endif
    }
    #include <tonemapping_fragment>`).replace('#include <fog_fragment>', '');
  sh.fragmentShader = g;
  return true;
}
export function aqMat(params, f = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...params });
  m.onBeforeCompile = (sh) => aqInject(sh, f);
  const key = ['caus', 'veg', 'bump', 'trans', 'back', 'lava', 'ice', 'sand', 'leaf', 'tip', 'top', 'local', 'fish'].map((k) => (f[k] ? (k === 'bump' ? f.bump : k[0] + k[1]) : '')).join('');
  m.customProgramCacheKey = () => 'aq4|' + key;
  return m;
}

// ---------------- 几何累加器（合并 draw call） ----------------
class Acc {
  constructor() { this.p = []; this.c = []; this.uv = []; this.veg = []; this.v2 = []; this.i = []; this.n = 0; }
  vert(p, c, uv = [0, 0], veg = [0, 0, 0, 0], v2 = [0, 0]) { this.p.push(p.x, p.y, p.z); this.c.push(c.r, c.g, c.b); this.uv.push(uv[0], uv[1]); this.veg.push(...veg); this.v2.push(...v2); return this.n++; }
  tri(a, b, c) { this.i.push(a, b, c); }
  // 追加一个 BufferGeometry（矩阵变换 + 逐顶点颜色函数）
  addGeo(geo, m4, colFn, vegFn = null) {
    const P = geo.attributes.position, UV = geo.attributes.uv, base = this.n, v = V(), lp = V(), c = new THREE.Color();
    for (let k = 0; k < P.count; k++) {
      lp.fromBufferAttribute(P, k); v.copy(lp).applyMatrix4(m4); colFn(c, v, lp, k);
      this.vert(v, c, UV ? [UV.getX(k), UV.getY(k)] : [0, 0], vegFn ? vegFn(v, lp) : undefined, vegFn ? vegFn.v2 : undefined);
    }
    if (geo.index) for (let k = 0; k < geo.index.count; k++) this.i.push(base + geo.index.getX(k)); else for (let k = 0; k < P.count; k++) this.i.push(base + k);
    geo.dispose();
  }
  build(veg = false) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (veg) { g.setAttribute('aVeg', new THREE.Float32BufferAttribute(this.veg, 4)); g.setAttribute('aV2', new THREE.Float32BufferAttribute(this.v2, 2)); }
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}
// 焊接非索引几何（Icosahedron 是非索引的 → 光滑法线需要焊接）
function weld(geo) {
  const P = geo.attributes.position, map = new Map(), pos = [], idx = [];
  for (let k = 0; k < P.count; k++) {
    const x = P.getX(k), y = P.getY(k), z = P.getZ(k), key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let id = map.get(key); if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(x, y, z); } idx.push(id);
  }
  geo.dispose();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

// ---------------- 贴图 ----------------
function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _fanTex = null;
function fanTex() {
  if (_fanTex) return _fanTex;
  const r = rng(77);
  _fanTex = canvasTex(256, 256, (g, w, h) => {
    g.strokeStyle = '#fff'; g.lineCap = 'round'; const tips = [];
    const br = (x, y, a, len, wd, d) => { const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len; g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * 8, (y + y2) / 2, x2, y2); g.stroke(); tips.push([x2, y2]);
      if (d < 6) { br(x2, y2, a + 0.12 + r() * 0.3, len * 0.8, wd * 0.72, d + 1); br(x2, y2, a - 0.12 - r() * 0.3, len * 0.8, wd * 0.72, d + 1); } };
    br(w / 2, h, Math.PI / 2, 46, 8, 0);
    g.lineWidth = 1.4; g.globalAlpha = 0.85;     // 网状横连
    for (let k = 0; k < 900; k++) { const a = tips[(r() * tips.length) | 0], b = tips[(r() * tips.length) | 0]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d > 4 && d < 16) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } }
  }, false);
  return _fanTex;
}
const glowTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.5)'); gr.addColorStop(0.6, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
export { glowTex };

// ---------------- 布景构件 ----------------
const COL = (h) => new THREE.Color(h);
function rockGeo(r, detail, opt) {
  const g = weld(new THREE.IcosahedronGeometry(1, detail)); const P = g.attributes.position, v = V(), sd = r() * 50;
  const disp = new Float32Array(P.count);
  for (let k = 0; k < P.count; k++) {
    v.fromBufferAttribute(P, k);
    const n = fbm3(v.x * 1.1 + sd, v.y * 1.1, v.z * 1.1, 4);
    const rid = 1 - Math.abs(vn3(v.x * 2.6 + sd, v.y * 2.6 - 3, v.z * 2.6) * 2 - 1);
    const fc = Math.floor(vn3(v.x * 1.7 + sd, v.y * 1.7, v.z * 1.7 + 4) * 5) / 5;
    let rr = 0.62 + n * 0.75 - rid * rid * 0.15 * (opt.sharp ?? 1) + fc * 0.07;
    if (opt.strata) rr += Math.sin(v.y * 14 + n * 3) * 0.018;
    disp[k] = rr;
  }
  // 圆润倒角：沿网格邻接对位移做两次 Laplacian 平滑（去掉刀锋般的棱，保留大形）
  {
    const I = g.index.array, nb = Array.from({ length: P.count }, () => new Set());
    for (let k = 0; k < I.length; k += 3) { const a = I[k], b = I[k + 1], c = I[k + 2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
    for (let it = 0; it < 1; it++) {
      const d2 = disp.slice();
      for (let k = 0; k < P.count; k++) { let s = 0; for (const j of nb[k]) s += d2[j]; disp[k] = d2[k] * 0.45 + (s / nb[k].size) * 0.55; }
    }
  }
  for (let k = 0; k < P.count; k++) {
    v.fromBufferAttribute(P, k).multiplyScalar(disp[k]);
    // 底部软压平（不再出现硬折线）：-0.02 以下逐渐压扁
    if (v.y < -0.02) { const u = -0.02 - v.y; v.y = -0.02 - u * 0.25 - u * 0.75 / (1 + u * 6); }
    P.setXYZ(k, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const N = g.attributes.normal, cols = new Float32Array(P.count * 3), c = new THREE.Color(), c1 = COL(opt.c1), c2 = COL(opt.c2), moss = COL(opt.moss);
  for (let k = 0; k < P.count; k++) {
    v.fromBufferAttribute(P, k);
    c.copy(c1).lerp(c2, clamp(vn3(v.x * 2 + sd, v.y * 2, v.z * 2) * 1.4 - 0.2, 0, 1));
    const ao = clamp((disp[k] - 0.72) * 1.6 + 0.75, 0.42, 1.05) * clamp(0.7 + (v.y + 0.12) * 0.5, 0.55, 1);
    c.multiplyScalar(ao);
    const ny = N.getY(k), mk = clamp((ny - 0.45) * 2.2, 0, 1) * clamp(vn3(v.x * 3 + 9, v.y * 3, v.z * 3 + sd) * 2.2 - 0.6, 0, 1) * opt.mossK;
    c.lerp(moss.clone().multiplyScalar(ao), mk);
    cols.set([c.r, c.g, c.b], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
// 叶片（带状）：L/C/R 三列（中脉更亮），逐段渐细、扭转、可波浪边
function blade(acc, root, o, r) {
  const segs = o.segs, dir = o.dir, tilt = o.tilt || 0, base = COL(o.c0), tip = COL(o.c1), c = new THREE.Color(), rows = [];
  const fx = Math.cos(dir), fz = Math.sin(dir);
  for (let i = 0; i <= segs; i++) {
    const h = i / segs, L = o.len * h;
    const hor = L * Math.sin(tilt) + (o.lean || 0) * h * h, y = L * Math.cos(tilt) - (o.droop || 0) * h * h * o.len;
    const p = V(root.x + fx * hor, root.y + y, root.z + fz * hor);
    let wd = o.w * (o.shape ? o.shape(h) : Math.pow(1 - h, 0.6) * (0.55 + 0.45 * Math.sin(Math.min(1, h * 5) * Math.PI / 2)));
    if (o.ruffle) wd *= 1 + Math.sin(h * o.len * 9 + r() * 0.5) * o.ruffle;
    const a = dir + Math.PI / 2 + (o.twist || 0) * h;
    const sx = Math.cos(a) * wd / 2, sz = Math.sin(a) * wd / 2;
    c.copy(base).lerp(tip, Math.pow(h, 0.8));
    const veg = [root.x, root.y, root.z, h], v2 = [o.seed, o.amp];
    const cl = c.clone().multiplyScalar(0.84), cc = c.clone().multiplyScalar(1.12);
    const fold = wd * 0.18;
    rows.push([
      acc.vert(V(p.x - sx, p.y, p.z - sz), cl, [0, h], veg, v2),
      acc.vert(V(p.x + fx * fold, p.y, p.z + fz * fold), cc, [0.5, h], veg, v2),
      acc.vert(V(p.x + sx, p.y, p.z + sz), cl, [1, h], veg, v2),
    ]);
  }
  for (let i = 0; i < segs; i++) { const A = rows[i], B = rows[i + 1]; for (let j = 0; j < 2; j++) { acc.tri(A[j], B[j], A[j + 1]); acc.tri(A[j + 1], B[j], B[j + 1]); } }
}
// 改写 uv.y（珊瑚 shader 用 uv.y 作"根→尖"参数：根部暗、尖端透光提亮）
function uvY(geo, fn) { const P = geo.attributes.position, U = geo.attributes.uv; for (let k = 0; k < P.count; k++) U.setY(k, fn(P.getX(k), P.getY(k), P.getZ(k), U.getY(k))); return geo; }
const bentQuat = (dir) => new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());

// ---------------- 主构建 ----------------
// ctx: { hwAt(z) }；返回 { group, update(t, cam), dispose(), lights: [...], bubbleSrc: [...] }
export function buildEnv(themeId, ctx) {
  const th = themeOf(themeId), r = rng(0x9e37 + [...themeId].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const R = (a, b) => a + r() * (b - a);
  floorAmp = th.sand.amp;
  applyWater(th);
  const group = new THREE.Group(), disp = [], upd = [];
  const add = (o) => { group.add(o); return o; };
  const M = (m) => { disp.push(m); return m; };
  const occ = [];
  const free = (x, z, rad) => { for (const o of occ) if (Math.hypot(o[0] - x, o[1] - z) < o[2] + rad) return false; return true; };
  const take = (x, z, rad) => occ.push([x, z, rad]);
  const hw = (z) => ctx.hwAt(z);
  // 接触阴影 / 落地遮蔽：布景登记 → 最后画到一张俯视 AO 图，沙床 shader 采样（完全贴合起伏地形，0 额外 draw call）
  const aoList = []; let aoTex = null;
  const ao = (x, z, rad, k = 0.5, sx = 1, sz = 1, rot = 0) => aoList.push([x, z, rad, k, sx, sz, rot]);
  // 放置：low = 全底面（矮物）；side = 屏幕两侧；back = 远景
  function spot(kind, rad, tries = 14) {
    for (let k = 0; k < tries; k++) {
      let x, z;
      if (kind === 'low') { z = R(-8.5, 0.6); x = R(-1, 1) * (hw(z) * 1.05); }
      else if (kind === 'front') { z = R(-2.6, 0.9); x = R(-1, 1) * hw(z) * 0.95; }
      else if (kind === 'side') { z = R(-11, -1.2); const s = r() < 0.5 ? -1 : 1; x = s * (hw(z) * R(0.62, 1.15)); }
      else { z = R(-17, -8); x = R(-9, 9); }
      if (free(x, z, rad)) { take(x, z, rad); return [x, z]; }
    }
    return null;
  }

  // ---- 水体背景 ----
  const skyMat = M(new THREE.ShaderMaterial({
    uniforms: { ...W },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `${WATER_GLSL} uniform float uT, uESat; uniform vec3 uSunDir, uSun; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); vec3 c = aqWaterCol(d);
        float sd = dot(d, uSunDir);
        float rip = sin(d.x * 40.0 + uT * 0.8 + sin(d.z * 23.0 + uT * 0.5) * 1.7) * sin(d.z * 31.0 - uT * 0.6);
        // 水面方向的柔光（克制，不形成大片发白）
        c += uSun * (smoothstep(0.55, 0.95, sd) * 0.2 * (0.8 + 0.2 * rip) + pow(max(sd, 0.0), 28.0) * 0.3);
        c *= mix(1.0, uDD, smoothstep(0.0, -0.6, d.y) * 0.6);
        // 深邃感：左右两侧与下方更深（视觉暗角，把视线收向中央的鱼）
        c *= 1.0 - 0.32 * smoothstep(0.15, 0.75, abs(d.x)) * (1.0 - 0.5 * smoothstep(0.1, 0.5, d.y));
        float lu = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(mix(vec3(lu), c, uESat), 0.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  const sky = add(new THREE.Mesh(new THREE.SphereGeometry(110, 32, 20), skyMat)); sky.renderOrder = -10; sky.frustumCulled = false;
  upd.push((t, cam) => sky.position.copy(cam.position));

  // ---- 沙床 ----
  {
    const seg = [90, 130, 160][QL];
    const geo = new THREE.PlaneGeometry(130, 130, seg, seg); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    // 中心区域加密：把顶点向中心挤（近处细腻、远处粗）
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), z = p.getZ(i); const k = (u) => Math.sign(u) * Math.pow(Math.abs(u) / 65, 1.8) * 65; x = k(x); z = k(z); p.setXYZ(i, x, floorAt(x, z), z); }
    geo.computeVertexNormals();
    add(new THREE.Mesh(geo, M(aqMat({ color: th.sand.c1, roughness: 1 }, { caus: 2.8, bump: 'sand', sand: th.sand.c2 }))));
  }
  // ---- 碎石 / 贝壳 ----
  {
    const n = Math.round(180 * DENS), pebA = COL(th.rock.c2), pebB = COL(th.ice ? '#e4ecee' : th.sand.c1);
    const pg = rockGeo(r, 1, { c1: th.rock.c1, c2: th.rock.c2, moss: th.rock.moss, mossK: 0.2 });
    const im = add(new THREE.InstancedMesh(pg, M(aqMat({ roughness: 0.85 }, { caus: 1.0 })), n));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const z = R(-10, 2.5), x = R(-1.2, 1.2) * hw(z), s = R(0.025, 0.1) * (r() < 0.12 ? 2 : 1);
      q.setFromEuler(new THREE.Euler(R(-0.3, 0.3), R(0, 6), R(-0.3, 0.3)));
      m4.compose(V(x, floorAt(x, z) + s * 0.05, z), q, V(s * R(1, 1.5), s * R(0.4, 0.7), s)); im.setMatrixAt(i, m4);
      im.setColorAt(i, c.copy(pebA).lerp(pebB, r()).lerp(COL(th.sand.c1), 0.25).multiplyScalar(0.8 + r() * 0.35));
    }
    // 扇贝（放射肋纹半球壳）
    const sg = new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2); const sp = sg.attributes.position, v = V();
    for (let k = 0; k < sp.count; k++) { v.fromBufferAttribute(sp, k); const a = Math.atan2(v.z, v.x); const rib = 1 + Math.abs(Math.sin(a * 9)) * 0.08; sp.setXYZ(k, v.x * rib, v.y * 0.35, v.z * rib * 0.9); }
    sg.computeVertexNormals();
    const ns = Math.round(40 * DENS), sm = add(new THREE.InstancedMesh(sg, M(aqMat({ color: '#ffffff', roughness: 0.6 }, { caus: 1.0 })), ns));
    const shellC = ['#efe2cf', '#e6cdb6', '#d9c3b0', '#f2e8dc', '#d8b9a0'];
    for (let i = 0; i < ns; i++) {
      const z = R(-6, 2.2), x = R(-1, 1) * hw(z), s = R(0.04, 0.08);
      q.setFromEuler(new THREE.Euler(R(-0.25, 0.25), R(0, 6), R(-0.25, 0.25)));
      m4.compose(V(x, floorAt(x, z) - 0.005, z), q, V(s, s, s)); sm.setMatrixAt(i, m4); sm.setColorAt(i, c.set(shellC[i % shellC.length]));
    }
  }

  // ---- 岩石（高细分 + 噪声位移 + 缝隙 AO + 顶部苔藓 + 微细节 bump） ----
  const rockMat = M(aqMat({ vertexColors: true, roughness: 1.0 }, { caus: 1.0, bump: 'rock', top: true, local: true }));
  const rockGeos = [0, 1, 2, 3].map((i) => rockGeo(r, i < 2 ? [3, 4, 4][QL] : [2, 3, 4][QL], { ...th.rock, sharp: th.basalt ? 1.8 : 1, strata: themeId === 'kelp' || themeId === 'ruins' }));
  const rockList = [[], [], [], []];
  function putRock(x, z, s, sy = 0.6, gi = -1) {
    const gidx = gi >= 0 ? gi : (r() * 4) | 0;
    const o = { x, z, s, sy, ry: R(0, 6), sx: R(0.9, 1.35), sz: R(0.8, 1.1) }; rockList[gidx].push(o);
    ao(x, z, s * 1.3, 0.8, o.sx, o.sz, -o.ry); ao(x, z, s * 0.85, 0.6, o.sx, o.sz, -o.ry);
  }
  {
    const n = Math.round(th.rock.n * (0.7 + 0.3 * DENS));
    // 构图：左右两组主岩 + 远景大岩 + 前景小岩
    const hero = [[-1, -4.2, 1.1], [1, -3.0, 0.9], [-1, -9.5, 2.2], [1, -11, 2.8]];
    hero.forEach(([sd, z, s], i) => { const x = sd * (hw(z) * R(0.95, 1.12)); take(x, z, s * 0.8); putRock(x, z, s, R(0.55, 0.85), i % 4); });
    for (let i = 0; i < n; i++) {
      const big = i < n * 0.35;
      const at = spot(big ? 'side' : (r() < 0.5 ? 'low' : 'back'), big ? 1.0 : 0.5); if (!at) continue;
      const far = at[1] < -8, s = big ? R(0.6, 1.2) : far ? R(1.2, 3.0) : R(0.18, 0.45);
      putRock(at[0], at[1], s, R(0.5, 0.9));
    }
  }

  // ---- 珊瑚 ----
  const coralAcc = new Acc();
  const CP = th.coral.map(COL);
  const pc = () => CP[(r() * CP.length) | 0];
  const m4 = new THREE.Matrix4();
  function staghorn(x, z, k, col) {
    const base = V(x, floorAt(x, z) - 0.04, z), tipC = col.clone().lerp(COL('#fbf1e4'), 0.45), baseC = col.clone().multiplyScalar(0.8);
    const branch = (p0, dir, len, rad, d) => {
      const geo = uvY(new THREE.CylinderGeometry(rad * 0.8, rad, len, 8, 3, true), (x, y, z, u) => (d * 0.25 + u * 0.25) + (d >= 2 ? u * 0.3 : 0)); geo.translate(0, len / 2, 0);
      const P = geo.attributes.position; for (let i = 0; i < P.count; i++) { const n = vn3(P.getX(i) * 40 + d, P.getY(i) * 30 + x, P.getZ(i) * 40) * 0.25; P.setX(i, P.getX(i) * (1 + n)); P.setZ(i, P.getZ(i) * (1 + n)); }
      m4.compose(p0, bentQuat(dir), V(1, 1, 1));
      const yb = base.y, H = 0.9 * k;
      const cf = (c, v) => c.copy(baseC).lerp(tipC, clamp((v.y - yb) / H, 0, 1));
      coralAcc.addGeo(geo, m4, cf);
      const p1 = p0.clone().addScaledVector(dir.clone().normalize(), len);
      const tip = uvY(new THREE.SphereGeometry(rad * 0.74, 7, 4), () => (d >= 2 ? 1 : 0.8)); m4.compose(p1, new THREE.Quaternion(), V(1, 1, 1)); coralAcc.addGeo(tip, m4, cf);
      if (d < 3) {
        const nb = d === 0 ? 3 : d === 1 ? 3 : 2;
        for (let i = 0; i < nb; i++) {
          const a = R(0, Math.PI * 2), sp = R(0.35, 0.7);
          const nd = dir.clone().normalize().add(V(Math.cos(a) * sp, 0.15, Math.sin(a) * sp)).normalize();
          branch(p0.clone().lerp(p1, R(0.55, 0.95)), nd, len * R(0.62, 0.8), rad * 0.74, d + 1);
        }
      }
    };
    ao(x, z, 0.42 * k, 0.5);
    for (let i = 0; i < 3; i++) branch(base.clone().add(V(R(-0.14, 0.14) * k, 0, R(-0.14, 0.14) * k)), V(R(-0.5, 0.5), 1, R(-0.5, 0.5)), 0.3 * k, 0.075 * k, 0);
  }
  function tableCoral(x, z, k, col) {
    const y0 = floorAt(x, z) - 0.03, hh = 0.32 * k, Rr = 0.55 * k; ao(x, z, Rr * 1.25, 0.5);
    const st = uvY(new THREE.CylinderGeometry(0.05 * k, 0.09 * k, hh, 8, 2), (x, y) => (y / hh + 0.5) * 0.35); st.translate(0, hh / 2, 0);
    m4.makeTranslation(x, y0, z); const dc = col.clone().multiplyScalar(0.6); coralAcc.addGeo(st, m4, (c) => c.copy(dc));
    const disc = uvY(new THREE.CylinderGeometry(Rr, Rr * 0.75, 0.05 * k, 40, 1, false), (x, y, z) => 0.35 + 0.65 * Math.hypot(x, z) / Rr); const P = disc.attributes.position, sd = r() * 10;
    for (let i = 0; i < P.count; i++) { const px = P.getX(i), pz = P.getZ(i), a = Math.atan2(pz, px), d = Math.hypot(px, pz) / Rr; P.setY(i, P.getY(i) + Math.sin(a * 5 + sd) * 0.04 * k * d + d * d * 0.05 * k + (vn3(px * 9, sd, pz * 9) - 0.5) * 0.03 * k); P.setX(i, px * (1 + (vn3(a * 2, sd, 0) - 0.5) * 0.25 * d)); }
    m4.makeTranslation(x, y0 + hh, z); const lc = col.clone().lerp(COL('#f2ebdf'), 0.25);
    coralAcc.addGeo(disc, m4, (c, v, lp) => c.copy(dc).lerp(lc, clamp(Math.hypot(lp.x, lp.z) / Rr, 0, 1) * (lp.y > 0 ? 1 : 0.5)));
  }
  function tubes(x, z, k, col) {
    const n = 3 + ((r() * 4) | 0); const y0 = floorAt(x, z) - 0.04; ao(x, z, 0.36 * k, 0.5);
    for (let i = 0; i < n; i++) {
      const hh = R(0.25, 0.75) * k, rad = R(0.05, 0.09) * k;
      const geo = new THREE.CylinderGeometry(rad * 1.15, rad * 0.8, hh, 12, 4, true); geo.translate(0, hh / 2, 0);
      const P = geo.attributes.position; for (let j = 0; j < P.count; j++) { const n2 = 1 + (vn3(P.getX(j) * 50, P.getY(j) * 12 + i, P.getZ(j) * 50) - 0.5) * 0.2; P.setX(j, P.getX(j) * n2); P.setZ(j, P.getZ(j) * n2); }
      const p0 = V(x + R(-0.18, 0.18) * k, y0, z + R(-0.15, 0.15) * k);
      m4.compose(p0, bentQuat(V(R(-0.25, 0.25), 1, R(-0.25, 0.25))), V(1, 1, 1));
      const c0 = col.clone().multiplyScalar(0.6), c1 = col.clone().lerp(COL('#efe6d8'), 0.2);
      coralAcc.addGeo(geo, m4, (c, v, lp) => c.copy(c0).lerp(c1, clamp(lp.y / hh, 0, 1)));
    }
  }
  // 脑珊瑚：实例化半球 + 沟壑 shader（迷宫等值线）
  const brainList = [];
  // 扇形珊瑚：网格 alpha + 半透明背光 + 轻摆
  const fanAcc = new Acc();
  function seaFan(x, z, s, col) {
    const geo = new THREE.PlaneGeometry(1.25, 1, 6, 6); geo.translate(0, 0.5, 0);
    const P = geo.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin(P.getX(i) * 2.2) * 0.08 + (vn3(P.getX(i) * 3, P.getY(i) * 3, 1) - 0.5) * 0.06);
    const root = V(x, floorAt(x, z) - 0.06, z); ao(x, z, 0.4 * s, 0.35);
    m4.compose(root, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R(-0.6, 0.6), 0)), V(s, s, s));
    const fn = (v, lp) => [root.x, root.y, root.z, clamp(lp.y, 0, 1)]; fn.v2 = [r(), 0.12 * s];
    const c0 = col.clone().multiplyScalar(0.7);
    fanAcc.addGeo(geo, m4, (c, v, lp) => c.copy(c0).lerp(col, clamp(lp.y * 1.4, 0, 1)), fn);
  }

  const mix = th.mix, D = (n) => Math.round(n * DENS + (n > 0 && DENS < 1 ? 0.4 : 0));
  // 前景/中景主角珊瑚群（矮，落在画面下 1/3）
  for (let i = 0; i < D(mix.stag); i++) { const at = spot(i < 3 ? 'front' : 'low', 0.45); if (at) staghorn(at[0], at[1], R(0.8, 1.5) * (at[1] < -5 ? 1.5 : 1), pc()); }
  for (let i = 0; i < D(mix.table); i++) { const at = spot('low', 0.7); if (at) tableCoral(at[0], at[1], R(0.8, 1.4), pc()); }
  for (let i = 0; i < D(mix.tube); i++) { const at = spot(i < 1 ? 'front' : 'low', 0.35); if (at) tubes(at[0], at[1], R(0.8, 1.3), pc()); }
  for (let i = 0; i < D(mix.brain); i++) { const at = spot(i < 2 ? 'front' : 'low', 0.5); if (at) { const o = { x: at[0], z: at[1], s: R(0.3, 0.65) * (at[1] < -5 ? 1.6 : 1), c: pc() }; brainList.push(o); ao(o.x, o.z, o.s * 1.45, 0.6); } }
  for (let i = 0; i < D(mix.fan); i++) { const at = spot('side', 0.6); if (at) seaFan(at[0], at[1], R(1.2, 2.2), pc()); }

  // ---- 植被：海草丛 / 海带 / 海葵 ----
  const vegAcc = new Acc();
  const G0 = themeId === 'ruins' ? ['#4f5f4c', '#7f8a6a'] : themeId === 'polar' ? ['#5d6d62', '#a3ad94'] : themeId === 'sunset' ? ['#5f6a3e', '#b8b07a'] : themeId === 'volcano' ? ['#4a4a3a', '#86806a'] : ['#4d6a45', '#a2ad74'];
  function grassClump(x, z, k = 1) {
    const n = 7 + ((r() * 8) | 0), y0 = floorAt(x, z) - 0.03; ao(x, z, 0.32 * k, 0.6);
    for (let i = 0; i < n; i++) {
      const a = R(0, Math.PI * 2), rr = R(0, 0.14) * k, root = V(x + Math.cos(a) * rr, y0, z + Math.sin(a) * rr);
      blade(vegAcc, root, { segs: [4, 6, 7][QL], len: R(0.3, 0.85) * k, w: R(0.04, 0.075) * k, dir: a + R(-0.6, 0.6), tilt: R(0.05, 0.4), lean: R(0, 0.12), twist: R(-1, 1), c0: G0[0], c1: G0[1], seed: r(), amp: 0.16 * k }, r);
    }
  }
  const K0 = th.kelpC || (themeId === 'polar' ? ['#5a5a3c', '#a59a64'] : ['#4f5530', '#b0a05a']);
  function kelpPlant(x, z, H) {
    const n = 3 + ((r() * 3) | 0), y0 = floorAt(x, z) - 0.05; ao(x, z, 0.65, 0.45);
    for (let i = 0; i < n; i++) {
      const root = V(x + R(-0.25, 0.25), y0, z + R(-0.25, 0.25)), hh = H * R(0.6, 1.05);
      blade(vegAcc, root, { segs: [10, 16, 20][QL], len: hh, w: R(0.42, 0.62), dir: R(0, 6.28), tilt: R(0, 0.12), lean: R(-0.3, 0.3), twist: R(-2.5, 2.5), ruffle: 0.22, c0: K0[0], c1: K0[1], seed: r(), amp: 0.55 + hh * 0.06,
        shape: (h) => (0.35 + 0.65 * Math.sin(Math.min(1, h * 3) * Math.PI / 2)) * (1 - h * 0.45) }, r);
    }
  }
  function anemone(x, z, k, tipHex) {
    const y0 = floorAt(x, z) - 0.02, colH = 0.12 * k; ao(x, z, 0.28 * k, 0.5);
    const col = new THREE.CylinderGeometry(0.09 * k, 0.12 * k, colH, 14, 2); col.translate(0, colH / 2, 0);
    m4.makeTranslation(x, y0, z); const cc = COL(tipHex).multiplyScalar(0.55);
    const fn0 = (v) => [x, y0, z, 0]; fn0.v2 = [0, 0];
    vegAcc.addGeo(col, m4, (c) => c.copy(cc), fn0);
    const n = [28, 40, 54][QL];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 * 3.0 + R(-0.2, 0.2), ring = (i % 3) / 3, rr = (0.03 + ring * 0.06) * k;
      const root = V(x + Math.cos(a) * rr, y0 + colH, z + Math.sin(a) * rr);
      blade(vegAcc, root, { segs: 5, len: R(0.2, 0.32) * k, w: 0.022 * k, dir: a, tilt: 0.25 + ring * 0.8 + R(0, 0.2), droop: 0.1, c0: COL(tipHex).multiplyScalar(0.75).getHexString().replace(/^/, '#'), c1: COL(tipHex).lerp(COL('#f6efe4'), 0.45).getHexString().replace(/^/, '#'), seed: r(), amp: 0.08 * k, shape: (h) => 1 - h * 0.7 }, r);
    }
  }
  for (let i = 0; i < D(mix.grass); i++) { const at = spot(r() < 0.3 ? 'front' : r() < 0.6 ? 'low' : 'side', 0.18, 6); if (at) grassClump(at[0], at[1], R(0.8, 1.3) * (at[1] < -6 ? 1.6 : 1)); }
  for (let i = 0; i < D(mix.kelp); i++) {
    const at = i < mix.kelp * 0.6 ? spot('side', 0.5, 8) : spot('back', 0.6, 8); if (!at) continue;
    kelpPlant(at[0], at[1], mix.kelpH * R(0.7, 1.1) * (at[1] < -8 ? 1.3 : 1));
  }
  const anC = themeId === 'ruins' ? ['#c9c2a0', '#b4a9b4'] : themeId === 'polar' ? ['#ece4da', '#d6c3bb'] : ['#d6a58a', '#cdb4c0', '#d9cfa8'];
  for (let i = 0; i < D(mix.anemone); i++) { const at = spot(i < 2 ? 'front' : 'low', 0.3); if (at) anemone(at[0], at[1], R(0.9, 1.4), anC[i % anC.length]); }

  // ---- 主题专属布景 ----
  const extraAcc = new Acc();     // 用岩石 bump 材质（柱子 / 冰 / 根系 / 玄武岩）
  const barkAcc = new Acc();      // 木质（沉船 / 红树林根）
  const lights = [];
  const bubbleSrc = [];
  if (th.columns) {
    const stoneA = COL('#8b8778'), stoneB = COL('#a39c88'), moss = COL('#5f6b52');
    const column = (x, z, hh, tiltZ = 0, lying = false) => {
      const rad = 0.32, geo = new THREE.CylinderGeometry(rad * 0.92, rad, hh, 32, Math.round(hh * 9), false); geo.translate(0, hh / 2, 0);
      const P = geo.attributes.position, v = V(), sd = r() * 9, drum = R(0.85, 1.05);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i); const a = Math.atan2(v.z, v.x), rr = Math.hypot(v.x, v.z);
        const top = hh - Math.max(0, vn3(a * 1.5 + sd, 0, 0)) * 0.5 - Math.sin(a + sd) * 0.15;
        if (rr > 0.01) {
          // 凹槽（圆润的余弦凹槽而非尖角）+ 风化缺口 + 鼓段接缝 + 断口倒角
          const fl = 1 - Math.pow(0.5 + 0.5 * Math.cos(a * 16), 2) * 0.05;
          const er = 1 - Math.max(0, fbm3(v.x * 4 + sd, v.y * 3, v.z * 4, 3) - 0.5) * 0.55;
          const sm = v.y % drum, seam = 1 - 0.04 * Math.exp(-Math.pow(Math.min(sm, drum - sm) / 0.06, 2));
          const over = Math.max(0, v.y - top + 0.12), bev = 1 - Math.min(0.28, over * over * 9);
          const k = fl * er * seam * bev; v.x *= k; v.z *= k;
        }
        if (v.y > top) v.y = top - (rr < 0.01 ? 0 : Math.max(0, vn3(v.x * 9, sd, v.z * 9) - 0.4) * 0.06);
        P.setXYZ(i, v.x, v.y, v.z);
      }
      const q = lying ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R(0, 3), Math.PI / 2)) : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R(0, 6), tiltZ));
      m4.compose(V(x, floorAt(x, z) - (lying ? -0.12 : 0.1), z), q, V(1, 1, 1));
      extraAcc.addGeo(geo, m4, (c, wv, lp) => { c.copy(stoneA).lerp(stoneB, vn3(lp.x * 3, lp.y * 2, lp.z * 3)); const ao = clamp(0.62 + (wv.y - FLOOR_Y) * 0.15, 0.6, 1); c.multiplyScalar(ao); c.lerp(moss, clamp(vn3(lp.x * 2, lp.y * 1.5, lp.z * 2) * 2 - 1.05, 0, 0.7)); });
      const pl = new THREE.BoxGeometry(0.9, 0.22, 0.9, 3, 1, 3); m4.compose(V(x, floorAt(x, z) - 0.02, z), q, V(1, 1, 1));
      if (!lying) extraAcc.addGeo(pl, m4, (c) => c.copy(stoneA).multiplyScalar(0.7));
      ao(x, z, lying ? hh * 0.6 : 0.85, 0.6, lying ? 1 : 1, lying ? 0.35 : 1);
    };
    column(-hw(-5.5) * 0.85, -5.5, 3.8, 0.04); column(hw(-7.5) * 0.8, -7.5, 2.4, -0.06); column(-hw(-12) * 0.5, -12, 5.2); column(hw(-13) * 0.65, -13.5, 4.2, 0.03);
    column(R(-0.8, 0.8), -6.8, 3.2, 0, true);
    take(-hw(-5.5) * 0.85, -5.5, 0.6); take(hw(-7.5) * 0.8, -7.5, 0.6);
  }
  if (th.wreck) {
    // 沉船龙骨 + 肋骨（远景左侧，半埋）
    const wood = COL('#4f4134'), woodL = COL('#6b5a48');
    const cx = -3.2, cz = -10.5, len = 6;
    const keel = new THREE.BoxGeometry(len, 0.22, 0.3, 12, 1, 1);
    m4.compose(V(cx, floorAt(cx, cz) + 0.05, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0.06)), V(1, 1, 1));
    barkAcc.addGeo(keel, m4, (c, v, lp) => c.copy(wood).lerp(woodL, vn3(lp.x * 3, 0, 0)));
    for (let i = 0; i < 7; i++) {
      const u = (i / 6 - 0.5) * len * 0.85, w = 1.2 + Math.sin((i / 6) * Math.PI) * 0.6, hh = 1.6 + Math.sin((i / 6) * Math.PI) * 0.6;
      const broken = r() < 0.4 ? R(0.45, 0.8) : 1;
      for (const sd of [-1, 1]) {
        const pts = []; for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI / 2 * broken; pts.push(V(0, hh * (1 - Math.cos(a)), sd * w * Math.sin(a))); }
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.06, 5, false);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0));
        const off = V(u, 0, 0).applyQuaternion(q);
        m4.compose(V(cx + off.x, floorAt(cx, cz) + 0.05, cz + off.z), q, V(1, 1, 1));
        barkAcc.addGeo(tube, m4, (c, v) => c.copy(wood).multiplyScalar(0.8 + vn3(v.x * 2, v.y * 2, v.z * 2) * 0.4));
      }
    }
    take(cx, cz, 2.5); ao(cx, cz, 3.6, 0.55, 1, 0.45, -0.5);
  }
  if (th.ice) {
    // 冰盖 + 冰柱（上方）、冰块（底部，硬朗多面）
    const iceMat = M(aqMat({ color: '#dbe8ec', roughness: 0.22, metalness: 0, flatShading: true }, { caus: 0.5, ice: true }));
    const ceil = new THREE.PlaneGeometry(70, 70, 40, 40); ceil.rotateX(Math.PI / 2);
    const P = ceil.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, -fbm3(x * 0.25, 2, z * 0.25, 3) * 1.2); }
    ceil.computeVertexNormals();
    const cm = add(new THREE.Mesh(ceil, iceMat)); cm.position.set(0, 7.2, -8);
    const icAcc = new Acc(), ic = COL('#d6e6ea'), icb = COL('#8fb0bc');
    for (let i = 0; i < Math.round(26 * DENS); i++) {
      const z = R(-20, -3), x = R(-1.3, 1.3) * hw(z) * 1.4, hh = R(0.8, 3.2) * (z < -10 ? 1.4 : 1);
      const g = new THREE.ConeGeometry(R(0.12, 0.35), hh, 6, 4); g.rotateX(Math.PI); g.translate(0, -hh / 2, 0);
      m4.compose(V(x, 6.8 - fbm3(x * 0.25, 2, (z + 8) * 0.25, 3) * 1.2 + 0.4, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(-0.08, 0.08), R(0, 6), 0)), V(1, 1, 1));
      icAcc.addGeo(g, m4, (c) => c.copy(ic));
    }
    for (let i = 0; i < Math.round(9 * DENS); i++) {
      const at = spot(i < 4 ? 'side' : 'low', 0.6); if (!at) continue; const s = R(0.35, 1.0) * (at[1] < -6 ? 1.8 : 1); ao(at[0], at[1], s * 1.6, 0.45);
      const g = weld(new THREE.IcosahedronGeometry(1, 3)); const p = g.attributes.position; const sd = r() * 9;
      for (let k = 0; k < p.count; k++) { const x0 = p.getX(k), y0 = p.getY(k), z0 = p.getZ(k); const fq = vn3(x0 * 2.2 + sd, y0 * 2.2, z0 * 2.2) * 4, ff = fq - Math.floor(fq), facet = (Math.floor(fq) + THREE.MathUtils.smoothstep(ff, 0.42, 0.58)) / 4; const n = 0.78 + facet * 0.22 + vn3(x0 * 1.4 + sd, y0 * 1.4, z0 * 1.4) * 0.35; p.setXYZ(k, x0 * n * 1.2, Math.max(-0.2, y0 * n * 0.85), z0 * n); }
      g.computeVertexNormals();
      m4.compose(V(at[0], floorAt(at[0], at[1]) + s * 0.2, at[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(-0.2, 0.2), R(0, 6), R(-0.2, 0.2))), V(s, s, s));
      icAcc.addGeo(g, m4, (c, v, lp) => c.copy(icb).lerp(ic, clamp(lp.y * 0.6 + 0.5, 0, 1)));
    }
    const ig = icAcc.build(); if (ig) add(new THREE.Mesh(ig, M(aqMat({ vertexColors: true, roughness: 0.18 }, { caus: 0.6, ice: true, bump: 'ice' }))));
  }
  if (th.roots) {
    // 红树林：从水面上方垂下的拱形支柱根（两侧 + 远景），根部附着藻色
    const bark = COL(th.bark?.[0] || '#5a4a3a'), algae = COL(th.bark?.[1] || '#6f7448');
    const rootArc = (x0, z0, x1, z1, top, rad) => {
      const y1 = floorAt(x1, z1) - 0.1, pts = []; ao(x1, z1, rad * 4, 0.45);
      // 支柱根：从树干中段斜出 → 向外拱起 → 扎进泥沙（二次贝塞尔）
      const cx = lerp(x0, x1, 0.85), cz = lerp(z0, z1, 0.85), cy = top + 0.3;
      for (let k = 0; k <= 12; k++) { const u = k / 12, a = (1 - u) * (1 - u), b2 = 2 * u * (1 - u), c2 = u * u; pts.push(V(a * x0 + b2 * cx + c2 * x1, a * top + b2 * cy + c2 * y1, a * z0 + b2 * cz + c2 * z1)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, rad, 9, false);
      { const P2 = tube.attributes.position, nn = P2.count / 25; for (let i = 0; i < P2.count; i++) { const seg = Math.floor(i / 10) / 24; } }
      const P = tube.attributes.position; for (let i = 0; i < P.count; i++) { const n = (vn3(P.getX(i) * 6, P.getY(i) * 6, P.getZ(i) * 6) - 0.5) * rad * 0.5; P.setX(i, P.getX(i) + n); P.setZ(i, P.getZ(i) + n); }
      barkAcc.addGeo(tube, new THREE.Matrix4(), (c, v) => c.copy(bark).multiplyScalar(0.8 + vn3(v.x * 3, v.y * 3, v.z * 3) * 0.35).lerp(algae, clamp((FLOOR_Y + 1.6 - v.y) / 1.6, 0, 0.8)));
    };
    const trunks = [[-1, -6.0], [1, -7.5], [-1, -12], [1, -14], [0, -17]];
    for (const [sd, z] of trunks) {
      const x = sd ? sd * hw(z) * R(0.75, 1.0) : R(-2, 2), top = 7;
      take(x, z, 1.0); ao(x, z, 1.2, 0.55);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.28 + R(-0.4, 0.4), d = R(1.2, 2.6), y0 = R(0.8, 3.2); rootArc(x + Math.cos(a) * 0.25, z + Math.sin(a) * 0.25, x + Math.cos(a) * d, z + Math.sin(a) * d * 0.7, y0, R(0.07, 0.13)); }
      const tr = new THREE.CylinderGeometry(0.3, 0.36, 9, 12, 8); tr.translate(0, 4.5, 0); m4.makeTranslation(x, 0.3, z);
      barkAcc.addGeo(tr, m4, (c, v) => c.copy(bark).multiplyScalar(0.75 + vn3(v.x * 3, v.y * 4, v.z * 3) * 0.3));
    }
  }
  if (th.basalt) {
    // 玄武岩柱群（六棱柱，高低错落）
    const b1 = COL('#3a3838'), b2 = COL('#4d4a48');
    const cluster = (x, z, n, hmax) => {
      ao(x, z, 1.25, 0.6);
      for (let i = 0; i < n; i++) {
        const rr = R(0.18, 0.3), hh = R(0.4, hmax), px = x + R(-0.7, 0.7), pz = z + R(-0.6, 0.6);
        // 六棱柱 + 顶部倒角（Lathe 轮廓：底 → 肩 → 倒角 → 顶面），断面略不平
        const tb = R(0.02, 0.07), g = new THREE.LatheGeometry([V(0.001, 0), V(rr * 1.04, 0), V(rr, hh - 0.06), V(rr * 0.9, hh - tb * 0.3), V(rr * 0.55, hh), V(0.001, hh + tb * 0.2)], 6);
        m4.compose(V(px, floorAt(px, pz) - 0.1, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(-0.05, 0.05), R(0, 1), R(-0.05, 0.05))), V(1, 1, 1));
        const cb = R(0, 0.6); extraAcc.addGeo(g, m4, (c, v, lp) => c.copy(b1).lerp(b2, cb).multiplyScalar(lp.y > hh - 0.07 ? 1.18 : clamp(0.55 + lp.y / hh * 0.45, 0.5, 1)));
      }
    };
    cluster(-hw(-4) * 0.85, -4, 9, 2.0); cluster(hw(-6) * 0.8, -6, 11, 2.6); cluster(-2, -12, 12, 4); cluster(4, -13, 10, 3.5);
  }
  if (th.vents) {
    // 热泉烟囱：锥形 + 熔岩裂纹微光 + 顶部暖光 + 气泡柱
    const ventMat = M(aqMat({ color: '#3d3a39', roughness: 0.95 }, { caus: 0.4, lava: true, bump: 'rock' }));
    const vpos = [[-hw(-3.5) * 0.92, -3.5], [hw(-6) * 0.85, -6], [-0.8, -10.5]];
    vpos.forEach(([x, z], i) => {
      const hh = [1.1, 1.6, 2.4][i], g = new THREE.CylinderGeometry(0.12, 0.5, hh, 20, 10, true); g.translate(0, hh / 2, 0);
      const P = g.attributes.position; for (let k = 0; k < P.count; k++) { const n = 1 + (vn3(P.getX(k) * 5, P.getY(k) * 4, P.getZ(k) * 5) - 0.5) * 0.5; P.setX(k, P.getX(k) * n); P.setZ(k, P.getZ(k) * n); }
      g.computeVertexNormals();
      const m = add(new THREE.Mesh(g, ventMat)); const y0 = floorAt(x, z) - 0.05; m.position.set(x, y0, z); take(x, z, 0.6); ao(x, z, 0.9, 0.6);
      const glow = add(new THREE.Sprite(M(new THREE.SpriteMaterial({ map: glowTex, color: '#d98a55', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))));
      glow.position.set(x, y0 + hh + 0.05, z); glow.scale.setScalar(1.1);
      upd.push((t) => { glow.material.opacity = 0.26 + Math.sin(t * 1.7 + i) * 0.06; });
      bubbleSrc.push(V(x, y0 + hh, z), V(x, y0 + hh, z));
      if (i < 2) lights.push({ pos: V(x, y0 + hh + 0.3, z), col: '#e08a50', I: 4.0, dist: 5 });
    });
  }

  // ---- 提交合并几何 ----
  {
    const B = W.aqAOB.value, S = [256, 384, 512][QL];
    const tex = canvasTex(S, S, (g2) => {
      g2.fillStyle = '#fff'; g2.fillRect(0, 0, S, S);
      for (const [x, z, rad, k, sx, sz, rot] of aoList) {
        const px = (x - B.x) * B.z * S, py = (z - B.y) * B.w * S, rp = rad * B.z * S;
        if (px < -rp * 2 || px > S + rp * 2 || py < -rp * 2 || py > S + rp * 2) continue;
        g2.save(); g2.translate(px, py); g2.rotate(rot); g2.scale(sx, sz);
        const gr = g2.createRadialGradient(0, 0, 0, 0, 0, rp);
        const kk = Math.min(0.95, k * 1.3);   // v4.1：接触阴影加强（核心更实、边缘软）
        gr.addColorStop(0, `rgba(0,0,0,${kk})`); gr.addColorStop(0.45, `rgba(0,0,0,${kk * 0.85})`); gr.addColorStop(0.75, `rgba(0,0,0,${kk * 0.35})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g2.fillStyle = gr; g2.beginPath(); g2.arc(0, 0, rp, 0, Math.PI * 2); g2.fill(); g2.restore();
      }
    }, false);
    tex.flipY = false; tex.needsUpdate = true; disp.push(tex); W.aqAO.value = aoTex = tex;
  }
  rockList.forEach((list, gi) => {
    if (!list.length) { rockGeos[gi].dispose(); return; }
    const im = add(new THREE.InstancedMesh(rockGeos[gi], rockMat, list.length)); const q = new THREE.Quaternion();
    list.forEach((o, i) => { q.setFromAxisAngle(V(0, 1, 0), o.ry); m4.compose(V(o.x, floorAt(o.x, o.z) + o.s * o.sy * 0.08, o.z), q, V(o.s * o.sx, o.s * o.sy, o.s * o.sz)); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere();
  });
  if (brainList.length) {
    const g = weld(new THREE.IcosahedronGeometry(1, [3, 4, 4][QL])); const P = g.attributes.position, v = V();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); v.multiplyScalar(1 + (vn3(v.x * 2, v.y * 2, v.z * 2) - 0.5) * 0.18); if (v.y < 0) v.y *= 0.12; P.setXYZ(i, v.x, v.y * 0.78, v.z); }
    g.computeVertexNormals();
    const im = add(new THREE.InstancedMesh(g, M(aqMat({ color: '#ffffff', roughness: 0.82 }, { caus: 0.85, bump: 'brain', trans: 0.3 })), brainList.length));
    const q = new THREE.Quaternion();
    brainList.forEach((o, i) => { q.setFromAxisAngle(V(0, 1, 0), R(0, 6)); m4.compose(V(o.x, floorAt(o.x, o.z) - 0.03, o.z), q, V(o.s * R(1, 1.25), o.s, o.s)); im.setMatrixAt(i, m4); im.setColorAt(i, o.c.clone().lerp(COL('#efe7da'), 0.15)); });
    im.computeBoundingSphere();
  }
  const cg = coralAcc.build(); if (cg) add(new THREE.Mesh(cg, M(aqMat({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide }, { caus: 0.85, trans: 0.55, back: true, bump: 'coral', tip: true }))));
  const fg = fanAcc.build(true); if (fg) add(new THREE.Mesh(fg, M(aqMat({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, alphaMap: fanTex(), alphaTest: 0.4 }, { caus: 0.4, veg: true, trans: 0.6 }))));
  const vg = vegAcc.build(true); if (vg) { const m = add(new THREE.Mesh(vg, M(aqMat({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide }, { caus: 0.5, veg: true, trans: 1, leaf: true })))); m.frustumCulled = false; }
  const eg = extraAcc.build(); if (eg) add(new THREE.Mesh(eg, M(aqMat({ vertexColors: true, roughness: 0.92 }, { caus: 0.9, bump: 'rock', top: true }))));
  const bg = barkAcc.build(); if (bg) add(new THREE.Mesh(bg, M(aqMat({ vertexColors: true, roughness: 0.9 }, { caus: 0.7, bump: 'bark' }))));

  // ---- 光束（v4：细、淡、少、边缘软、随深度衰减；只放在远景，不再有横穿鱼群的近景大光柱） ----
  const rayMat = (seed, col, op) => M(new THREE.ShaderMaterial({
    uniforms: { uT: W.uT, uSeed: { value: seed }, uCol: { value: COL(col) }, uOp: { value: op } },
    vertexShader: 'varying vec2 vUv; varying float vD, vWY; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vWY = wp.y; vec4 mv = viewMatrix * wp; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uT, uSeed, uOp; uniform vec3 uCol; varying vec2 vUv; varying float vD, vWY;
      void main(){ float x = vUv.x - 0.5 + sin(vUv.y * 5.0 + uT * 0.35 + uSeed * 7.0) * 0.07 + sin(vUv.y * 13.0 - uT * 0.5 + uSeed) * 0.025;   // 水流扰动：光束轻微弯曲摆动
        float prof = exp(-x * x * 10.0) * smoothstep(0.5, 0.05, abs(x));                    // 软边：高斯 + 两侧归零
        float st = 0.8 + 0.2 * sin(vUv.y * 9.0 - uT * 0.6 + uSeed * 9.0) * sin(vUv.x * 11.0 + uT * 0.2);  // 沿光束方向的柔和明暗流动
        float fade = pow(vUv.y, 2.4) * smoothstep(-1.5, 5.5, vWY);                             // 越深越淡：中下部基本消失
        float near = smoothstep(6.0, 12.0, vD);
        float a = prof * st * fade * near * uOp * (0.8 + 0.2 * sin(uT * 0.35 + uSeed * 5.0));
        gl_FragColor = vec4(uCol * a, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  const rays = [];
  const RW = th.rays.w || [0.4, 0.9];
  for (let i = 0; i < Math.round(th.rays.n * (0.6 + 0.4 * DENS)); i++) {
    const w = R(RW[0], RW[1]), h = 18;
    const m = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rayMat(r(), th.rays.col, th.rays.op * R(0.7, 1))));
    const z = R(-16, -6), x = R(-6, 6);
    m.scale.set(w, h, 1); m.position.set(x, 8.5 - h / 2 + 1.5, z); m.renderOrder = -2;
    rays.push({ m, x, ph: r() * 6, sp: R(0.08, 0.18) });
  }
  upd.push((t, cam) => { for (const o of rays) { o.m.position.x = o.x + Math.sin(t * o.sp + o.ph) * 0.3; o.m.rotation.set(0, Math.atan2(cam.position.x - o.m.position.x, cam.position.z - o.m.position.z), 0); o.m.rotateZ(-0.14); } });

  // ---- 粒子（GPU 驱动）：悬浮微粒 / 浮游光点 / 冰晶 / 余烬 / 金色尘 ----
  const ptsMat = (o) => M(new THREE.ShaderMaterial({
    uniforms: { uT: W.uT, uCol: { value: COL(o.col) }, uSize: { value: o.size }, uPx: ctx.uPx, uRise: { value: o.rise }, uTw: { value: o.tw || 0 }, uOp: { value: o.op ?? 0.6 }, uH: { value: o.H || 10 }, uY0: { value: o.y0 ?? FLOOR_Y }, uWob: { value: o.wob ?? 0.15 }, uRing: { value: o.ring ? 1 : 0 } },
    vertexShader: `uniform float uT, uSize, uPx, uRise, uTw, uH, uY0, uWob; attribute float aSeed; varying float vA;
      void main(){ vec3 p = position; float s = aSeed;
        p.y = uY0 + mod(p.y - uY0 + uT * uRise * (0.6 + s * 0.8), uH);
        p.x += sin(uT * 0.3 + s * 40.0) * uWob + sin(uT * 2.1 + s * 17.0) * uWob * 0.15; p.z += cos(uT * 0.25 + s * 23.0) * uWob;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
        gl_PointSize = clamp(uSize * (0.6 + s * 0.8) * uPx / max(d, 0.3), 1.0, 64.0);
        float edge = smoothstep(0.0, 0.6, p.y - uY0) * smoothstep(0.0, 0.8, uY0 + uH - p.y);
        vA = edge * smoothstep(0.4, 2.0, d) * exp(-d * 0.045) * (1.0 - uTw + uTw * pow(0.5 + 0.5 * sin(uT * (1.0 + s * 2.0) + s * 60.0), 3.0));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uOp, uRing; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
        float a = uRing > 0.5 ? (smoothstep(0.5, 0.42, d) * (0.18 + 0.82 * smoothstep(0.28, 0.44, d)) + smoothstep(0.14, 0.0, length(c - vec2(-0.14, -0.14))) * 0.9) : pow(1.0 - d * 2.0, 1.6);
        gl_FragColor = vec4(uCol, a * vA * uOp);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  }));
  function points(n, box, o, srcs = null) {
    const pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (srcs) { const s = srcs[i % srcs.length]; pos.set([s.x + R(-0.06, 0.06), s.y + R(0, o.sy ?? o.H), s.z + R(-0.06, 0.06)], i * 3); }
      else pos.set([R(-box.x, box.x), R(box.y0, box.y1), R(box.z0, box.z1)], i * 3);
      sd[i] = r();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    g.boundingSphere = new THREE.Sphere(V(0, 0, -4), 60);
    const p = add(new THREE.Points(g, ptsMat(o))); p.renderOrder = 4; return p;
  }
  const PT = th.particles, NP = Math.round(PT.n * DENS);
  const box = { x: 9, y0: FLOOR_Y, y1: 7, z0: -15, z1: 7.5 };
  const ptype = {
    snow: { col: PT.col, size: 0.03, rise: -0.05, op: 0.42, H: 10.5, wob: 0.18 },
    plankton: { col: PT.col, size: 0.035, rise: 0.02, op: 0.55, H: 10.5, tw: 0.8, add: true, wob: 0.25 },
    ice: { col: PT.col, size: 0.04, rise: -0.03, op: 0.7, H: 10.5, tw: 0.7, wob: 0.12 },
    ember: { col: PT.col, size: 0.03, rise: 0.12, op: 0.5, H: 10.5, tw: 0.5, add: true, wob: 0.1 },
    gold: { col: PT.col, size: 0.035, rise: -0.02, op: 0.55, H: 10.5, tw: 0.6, add: true, wob: 0.22 },
  }[PT.type];
  points(NP, box, ptype);
  if (PT.type !== 'snow') points(Math.round(NP * 0.5), box, { col: '#e8e6dc', size: 0.022, rise: -0.04, op: 0.35, H: 10.5 });
  if (th.glow) {
    // 深海：克制的生物冷光（贴近岩石/柱子底部的小光点，缓慢明灭）
    const gp = []; for (let i = 0; i < Math.round(th.glow.n * DENS); i++) { const z = R(-13, 0), x = R(-1.2, 1.2) * hw(z); gp.push(V(x, floorAt(x, z) + R(0.05, 0.9), z)); }
    if (th.columns) for (const [cx, cz] of [[-hw(-5.5) * 0.85, -5.5], [hw(-7.5) * 0.8, -7.5]]) for (let i = 0; i < 18; i++) { const a = R(0, 6.28), d = R(0.3, 0.5); gp.push(V(cx + Math.cos(a) * d, floorAt(cx, cz) + R(0.1, 2.6), cz + Math.sin(a) * d)); }
    points(gp.length, null, { col: th.glow.col, size: 0.05, rise: 0.0, op: 0.7, H: 100, y0: -50, sy: 0, tw: 1, add: true, wob: 0.04 }, gp);
  }
  // 气泡串：岩缝 / 热泉
  {
    const nsrc = th.bubbles;
    for (let i = 0; i < nsrc; i++) { const z = R(-8, 0), x = R(-0.8, 0.8) * hw(z); bubbleSrc.push(V(x, floorAt(x, z) + 0.1, z)); }
    if (bubbleSrc.length) {
      const ys = bubbleSrc.map((s) => s.y);
      const nb = Math.round((th.vents ? 110 : 22 * bubbleSrc.length) * DENS);
      points(nb, null, { col: '#eef4f2', size: th.vents ? 0.06 : 0.05, rise: th.vents ? 0.9 : 0.65, op: 0.8, H: 9, y0: Math.min(...ys), wob: 0.035, ring: true }, bubbleSrc);
    }
  }

  // ---- 前景虚化（近景海草 + 岩缘剪影，压在画面底角，不挡鱼） ----
  {
    const fgTex = canvasTex(256, 512, (g, w, h) => {
      g.filter = 'blur(4px)'; g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(0, h); g.bezierCurveTo(10, h * 0.72, 90, h * 0.66, 150, h * 0.8); g.bezierCurveTo(200, h * 0.86, 230, h * 0.9, 256, h); g.closePath(); g.fill();
      for (let i = 0; i < 4; i++) {
        const x0 = 40 + i * 45, top = 40 + i * 70, sw = 9 + i * 2, ph = i * 1.3; const L = [], Rr = [];
        for (let y = h; y >= top; y -= 12) { const k = (y - top) / (h - top), cx = x0 + Math.sin(y * 0.008 + ph) * 26 * (1 - k * 0.6), ww = sw * (0.25 + 0.75 * Math.sqrt(k)); L.push([cx - ww, y]); Rr.push([cx + ww, y]); }
        g.beginPath(); L.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); Rr.reverse().forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.fill();
      }
    }, false);
    disp.push(fgTex);
    const fgc = COL(th.water.deep).lerp(COL(th.water.hor), 0.25).multiplyScalar(0.7);
    const fgs = [];
    for (const [x, z, w, hh, s] of [[-0.7, 6.4, 0.9, 1.7, 1], [0.78, 6.7, 0.7, 1.3, -1]]) {
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(w, hh), M(new THREE.MeshBasicMaterial({ color: fgc, alphaMap: fgTex, transparent: true, opacity: 0.62, depthWrite: false, fog: false }))));
      m.geometry.translate(0, hh / 2, 0); m.position.set(x, -1.45, z); m.scale.x = s; m.renderOrder = 20; fgs.push({ m, x, ph: r() * 6 });
    }
    upd.push((t) => { for (const f of fgs) { f.m.rotation.z = Math.sin(t * 0.45 + f.ph) * 0.035; f.m.position.x = f.x + Math.sin(t * 0.33 + f.ph) * 0.025; } });
  }

  return {
    group, theme: th, lights, bubbleSrc,
    // 缓存复用：重新挂回场景时恢复全局状态（水体 uniforms / 地形起伏 / 接触阴影图）
    activate() { floorAmp = th.sand.amp; applyWater(th); W.aqAO.value = aoTex; },
    update(t, cam) { for (const f of upd) f(t, cam); },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of disp) m.dispose?.();
      group.parent?.remove(group);
    },
  };
}
