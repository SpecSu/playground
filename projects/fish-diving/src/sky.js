// 天空：程序化渐变 + 太阳光晕 + FBM 积云。同一份 GLSL 被天空球与海面反射共用，保证反射与天空完全一致。
// v1.0 渲染回退：恢复 v0.9（旷野之息式）天空配色/云/太阳；保留一道很淡的自然彩虹（派对元素，弱化）。
import * as THREE from 'three';
import { RAINBOW, rainbowDir, SOFT_ENV } from './style.js';

export const skyUniforms = {
  uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uZenith: { value: new THREE.Color('#3b8fe0') },
  uHorizon: { value: new THREE.Color('#bfe6f5') },
  uCloudColor: { value: new THREE.Color('#ffffff') },
  uCloudShadow: { value: new THREE.Color('#a9bdd6') },
  uCloudCover: { value: 0.5 },
  uSkyTime: { value: 0 },
  uSunDisk: { value: 1.0 },
  uMid: { value: new THREE.Color('#9ccff2') },   // 美术升级：三段渐变中段（通透浅蓝）
  uRainbowDir: { value: rainbowDir() },
  uRainbow: { value: new THREE.Vector3(RAINBOW.radius, RAINBOW.width, RAINBOW.alpha) },
};

// octaves 参数：天空球用 5 层，海面反射用 3 层（更省）
export function skyGLSL(octaves = 5, withClouds = true) {
  return /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uCloudColor;
uniform vec3 uCloudShadow;
uniform float uCloudCover;
uniform float uSkyTime;
uniform float uSunDisk;
uniform vec3 uRainbowDir;
uniform vec3 uRainbow;

float skyHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = skyHash(i);
  float b = skyHash(i + vec2(1.0, 0.0));
  float c = skyHash(i + vec2(0.0, 1.0));
  float d = skyHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float skyFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < ${octaves}; i++) {
    v += a * skyNoise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}

vec3 skyHue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
// 自然彩虹：很淡、柔边、加色叠加（不做粉彩化），地平线以下与高空淡出
vec3 skyRainbow(vec3 d) {
  float ang = acos(clamp(dot(d, uRainbowDir), -1.0, 1.0));
  float k = (ang - (uRainbow.x - uRainbow.y)) / (2.0 * uRainbow.y);
  if (k < 0.0 || k > 1.0) return vec3(0.0);
  vec3 c = mix(skyHue(0.78 * (1.0 - k)), vec3(1.0, 0.96, 0.92), 0.55);   // v1.2：粉彩化
  float a = sin(k * 3.1415926);
  a *= a * smoothstep(0.0, 0.06, d.y) * (1.0 - smoothstep(0.22, 0.5, d.y));
  return c * a * uRainbow.z;
}

vec3 skyBase(vec3 d) {
  float h = max(d.y, 0.0);
  // 美术升级（光遇向）：三段渐变 —— 暖桃色地平线 → 通透浅蓝 → 天顶蓝，空气感更有层次
  float tH = smoothstep(0.0, 0.11, h);
  vec3 col = mix(uHorizon, uMid, tH);
  // 桃色↔蓝色直接插值会经过灰色：过渡带补一点暖白亮度，保持通透不发灰
  col += vec3(1.0, 0.97, 0.93) * (tH * (1.0 - tH)) * 0.22;
  col = mix(col, uZenith, pow(smoothstep(0.04, 0.85, h), 0.6));
  float sd = max(dot(d, uSunDir), 0.0);
  // 太阳方向的地平线暖辉（米氏散射：越靠近地平线越宽）
  vec2 hz = normalize(d.xz + 1e-4), sz = normalize(uSunDir.xz + 1e-4);
  float sideSun = max(dot(hz, sz), 0.0);
  col += uSunColor * pow(sideSun, 3.0) * exp(-h * 7.0) * 0.16;
  // 反太阳侧淡淡的粉紫带（维纳斯带的柔和版）
  col = mix(col, col * vec3(1.03, 0.98, 0.96), pow(1.0 - sideSun, 2.0) * exp(-h * 10.0) * 0.6);   // v1.2：暖奶油带（去粉紫）
  // 太阳光晕：宽柔晕 + 中晕 + 紧致日冕（HDR，交给 Bloom 柔化）
  col += uSunColor * (pow(sd, 5.0) * 0.16 + pow(sd, 32.0) * 0.32 + pow(sd, 380.0) * 0.9);
  // 地平线薄雾亮带
  col = mix(col, uHorizon * 1.04 + uSunColor * 0.04, exp(-h * 40.0) * 0.4);
  if (d.y < 0.0) col = uHorizon * 1.02;
  return col;
}

vec4 skyClouds(vec3 d) {
  if (d.y < 0.005) return vec4(0.0);
  vec2 uv = d.xz / (d.y + 0.09) * 0.55;
  uv += vec2(uSkyTime * 0.006, uSkyTime * 0.0025);
  float n = skyFbm(uv);
  float cover = uCloudCover;
  // 柔边更宽：棉絮状体积云，而不是剪纸边
  float c = smoothstep(1.0 - cover, 1.0 - cover + 0.42, n);
  // 朝太阳方向偏移采样，得到云的明暗体积感
  vec2 sOff = normalize(uSunDir.xz + 1e-4) * 0.09;
  float n2 = skyFbm(uv + sOff);
  float lit = clamp((n - n2) * 4.0 + 0.6, 0.0, 1.0);
  // 厚处略暗（体积自遮挡），薄边透光
  float dens = smoothstep(1.0 - cover + 0.1, 1.0 - cover + 0.6, n);
  vec3 cc = mix(uCloudShadow, uCloudColor, lit * (1.0 - dens * 0.35) + 0.12);
  float sd = max(dot(d, uSunDir), 0.0);
  // 暖色银边 + 薄边透光（光遇的发光云边）
  cc += uSunColor * (pow(sd, 5.0) * 0.5 + pow(sd, 24.0) * 0.6) * (1.0 - c * 0.55);
  cc += uSunColor * 0.12 * (1.0 - dens) * lit;
  // 低空云染一点地平线暖色（空气透视）
  cc = mix(cc, uHorizon * 1.05, (1.0 - smoothstep(0.03, 0.3, d.y)) * 0.35);
  c *= smoothstep(0.02, 0.2, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y) * 0.5);
  return vec4(cc, c);
}

vec3 skyColor(vec3 d, float sunMul) {
  vec3 col = skyBase(d);
  col += skyRainbow(d) * (1.0 - smoothstep(0.6, 1.4, dot(col, vec3(0.333))));
  ${withClouds ? `vec4 cl = skyClouds(d); col = mix(col, cl.rgb, cl.a * 0.92);` : `vec4 cl = vec4(0.0);`}
  float sd = dot(d, uSunDir);
  col += uSunColor * smoothstep(0.99955, 0.99985, sd) * 18.0 * (1.0 - cl.a) * uSunDisk * sunMul;
  return col;
}
`;
}

export function createSkyDome() {
  const geo = new THREE.SphereGeometry(4200, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w * 0.99999; // 永远在最远处
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      ${skyGLSL(5, true)}
      void main() {
        vec3 d = normalize(vDir);
        vec3 sc = skyColor(d, 1.0);
        if (!(dot(sc, vec3(1.0)) < 1.0e4)) sc = vec3(0.0);
        gl_FragColor = vec4(clamp(sc, 0.0, 12.0), 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// 时段预设：同时驱动天空、海水果冻色、灯光与调色
export const PRESETS = {
  afternoon: {
    label: '午后 Chill',
    sunElev: 36, sunAzim: 205,
    zenith: '#1f74e6', horizon: '#9fdcf7', sun: '#fff1d6', sunIntensity: 3.2,
    cloud: '#ffffff', cloudShadow: '#9fb6d6', cloudCover: 0.52,
    deep: '#03688c', shallow: '#22e6d0', sss: '#6dffd2', foam: '#f4fffd',
    hemiSky: '#bfe3ff', hemiGround: '#3fb8b0', hemiIntensity: 0.55,
    envIntensity: 0.9, exposure: 0.92, lights: 0.0,
    grade: { lift: [0.0, 0.005, 0.02], gain: [1.03, 1.0, 0.97], sat: 1.16 },
  },
  golden: {
    label: '黄金时刻',
    sunElev: 11, sunAzim: 230,
    zenith: '#3f78c8', horizon: '#ffd2a1', sun: '#ffb56e', sunIntensity: 3.0,
    cloud: '#fff1de', cloudShadow: '#c697a4', cloudCover: 0.5,
    deep: '#085a86', shallow: '#26c4c6', sss: '#a8ffd0', foam: '#fff6ea',
    hemiSky: '#ffd9b5', hemiGround: '#2f8fa0', hemiIntensity: 0.5,
    envIntensity: 0.85, exposure: 0.95, lights: 0.35,
    grade: { lift: [0.015, 0.0, 0.03], gain: [1.05, 1.0, 0.95], sat: 1.1 },
  },
  dusk: {
    label: '粉紫黄昏',
    sunElev: 2.5, sunAzim: 245,
    zenith: '#3a3f8f', horizon: '#ff98b8', sun: '#ff8a5c', sunIntensity: 2.2,
    cloud: '#ffb8cf', cloudShadow: '#7a5aa0', cloudCover: 0.5,
    deep: '#1a3b78', shallow: '#3aa3c8', sss: '#ff9fd0', foam: '#ffe9f0',
    hemiSky: '#ffb2c4', hemiGround: '#3b4f9a', hemiIntensity: 0.6,
    envIntensity: 0.8, exposure: 1.0, lights: 1.0,
    grade: { lift: [0.03, 0.0, 0.05], gain: [1.03, 0.98, 1.0], sat: 1.12 },
  },
};

// v1.2 柔和场景（对标猛兽派对）：低饱和暖调天空（奶油地平线 → 雾蓝天顶）+ 柔和青蓝海 + 暖沙天光反弹；色值统一取自 style.js SOFT_ENV
PRESETS.dream = { label: '柔和午后', sunElev: 24, sunAzim: 205, ...SOFT_ENV };
// v1.0 兼容：party 预设 = 美术升级默认
PRESETS.party = PRESETS.dream;

export function sunDirFromAngles(elevDeg, azimDeg, out = new THREE.Vector3()) {
  const e = THREE.MathUtils.degToRad(elevDeg);
  const a = THREE.MathUtils.degToRad(azimDeg);
  return out.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
}

// —— 美术升级：便宜的 billboard 体积光束（光遇式"云隙光"）——
// 每条光束是一张沿太阳光方向拉长、绕光轴朝向相机的面片；加色、无深度写入、近处/贴水/正对光轴淡出。
// 全部计算在顶点/片元着色器内完成：CPU 每帧只更新 group 位置与时间。低画质整体隐藏。
export function createGodRays(count = 7) {
  const pos = [], corner = [], center = [], prm = [], idx = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    // 环绕船、偏向迎光侧与视野两侧分布；高度在头顶上方
    const a = (i / count) * Math.PI * 2 + rnd() * 0.6;
    const r = 20 + rnd() * 34;
    const c = [Math.cos(a) * r, 0, Math.sin(a) * r];   // 高度在着色器内按光轴算（下端没入海面）
    const w = 1.6 + rnd() * 3.2, len = 12 + rnd() * 10, sd = rnd() * 100;
    const base = i * 4;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(0, 0, 0); corner.push(cx, cy); center.push(...c); prm.push(w, len, sd);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 3));
  g.setAttribute('aPrm', new THREE.Float32BufferAttribute(prm, 3));
  g.setIndex(idx);
  const uniforms = {
    uSunDir: skyUniforms.uSunDir, uSunColor: skyUniforms.uSunColor,
    uTime: { value: 0 }, uStrength: { value: 0.2 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec3 aCenter; attribute vec3 aPrm;
      uniform vec3 uSunDir; uniform float uTime;
      varying vec2 vC; varying float vFade; varying float vSeed; varying float vY;
      void main() {
        // 光束轴：太阳方向向竖直方向收拢一些（云隙光的斜下光柱，低太阳角时也不会躺平）
        vec3 A = normalize(normalize(uSunDir) + vec3(0.0, 0.9, 0.0));
        vec3 c = (modelMatrix * vec4(aCenter, 1.0)).xyz;
        c.y = aPrm.y * A.y * 0.85;
        c.xz += vec2(sin(uTime * 0.05 + aPrm.z), cos(uTime * 0.04 + aPrm.z)) * 1.5;   // 缓慢漂移
        vec3 toC = cameraPosition - c;
        float dC = length(toC); toC /= dC;
        vec3 side = normalize(cross(A, toC) + 1e-4);
        vec3 p = c + side * aCorner.x * aPrm.x + A * aCorner.y * aPrm.y;
        vC = aCorner; vSeed = aPrm.z; vY = p.y;
        // 近处淡出（避免糊脸）、沿光轴正视时淡出（面片会退化成线）
        float axial = abs(dot(A, toC));
        vFade = smoothstep(6.0, 16.0, dC) * (1.0 - smoothstep(0.75, 0.97, axial));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunColor; uniform float uTime; uniform float uStrength;
      varying vec2 vC; varying float vFade; varying float vSeed; varying float vY;
      void main() {
        float across = 1.0 - vC.x * vC.x; across *= across;
        float along = smoothstep(-1.0, -0.35, vC.y) * (1.0 - smoothstep(0.55, 1.0, vC.y));
        float top = 0.55 + 0.45 * (vC.y * 0.5 + 0.5);
        float shimmer = 0.65 + 0.35 * sin(uTime * 0.35 + vSeed * 3.1) * sin(uTime * 0.21 + vSeed);
        float water = smoothstep(-0.2, 2.5, vY);
        float a = across * along * top * shimmer * vFade * water * uStrength;
        vec3 col = uSunColor * a;
        if (!(dot(col, vec3(1.0)) < 1.0e4)) col = vec3(0.0);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'godrays';
  return {
    mesh, uniforms,
    update(t, at) { uniforms.uTime.value = t; mesh.position.set(at.x, 0, at.z); },
  };
}
