// 共享的 Gerstner 波参数 —— GPU（海面着色器）与 CPU（船体/浮漂浮力）使用同一套数据，保证物体严丝合缝地"坐"在水面上
import * as THREE from 'three';

// [方向角(度), 陡度, 波长(m)]  —— chill 的海：长涌浪 + 细碎小波
const RAW = [
  [  18, 0.15, 42.0],
  [ -24, 0.13, 27.0],
  [  64, 0.11, 16.0],
  [ -71, 0.09,  9.5],
  [  33, 0.08,  5.6],
  [ -48, 0.06,  3.4],
];

export const WAVE_COUNT = RAW.length;
export const G = 9.8;

export const waveState = {
  scale: 0.62,     // 整体浪高倍率（越小越 chill）
  time: 0,
};

// 打包为 shader uniform: vec4(dirX, dirZ, steepness, wavelength)
export const waveUniformArray = RAW.map(([deg, st, wl]) => {
  const a = THREE.MathUtils.degToRad(deg);
  return new THREE.Vector4(Math.cos(a), Math.sin(a), st, wl);
});

const tmp = { x: 0, y: 0, z: 0 };

function displacement(px, pz, t, out) {
  let dx = 0, dy = 0, dz = 0;
  const s = waveState.scale;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const w = waveUniformArray[i];
    const k = (Math.PI * 2) / w.w;
    const c = Math.sqrt(G / k);
    const st = w.z * s;
    const a = st / k;
    const f = k * (w.x * px + w.y * pz - c * t);
    const cf = Math.cos(f), sf = Math.sin(f);
    dx += w.x * a * cf;
    dy += a * sf;
    dz += w.y * a * cf;
  }
  out.x = dx; out.y = dy; out.z = dz;
  return out;
}

// 给定世界坐标 (x,z)，求该处水面高度（反解 Gerstner 水平位移，3 次迭代足够）
export function waterHeight(x, z, t = waveState.time) {
  let px = x, pz = z;
  for (let i = 0; i < 3; i++) {
    displacement(px, pz, t, tmp);
    px = x - tmp.x;
    pz = z - tmp.z;
  }
  displacement(px, pz, t, tmp);
  return tmp.y;
}

// GLSL 版本（与上面完全一致，额外做了远处小波淡出以避免走样）
export const GERSTNER_GLSL = /* glsl */`
uniform vec4 uWaves[${WAVE_COUNT}];
uniform float uWaveScale;
uniform float uTime;

vec3 gerstner(vec2 p, float dist, out vec3 N) {
  vec3 disp = vec3(0.0);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 w = uWaves[i];
    float k = 6.2831853 / w.w;
    float c = sqrt(9.8 / k);
    vec2 d = w.xy;
    float fade = 1.0 - smoothstep(w.w * 9.0, w.w * 34.0, dist);
    float st = w.z * uWaveScale * fade;
    float a = st / k;
    float f = k * (dot(d, p) - c * uTime);
    float cf = cos(f);
    float sf = sin(f);
    disp += vec3(d.x * a * cf, a * sf, d.y * a * cf);
    tangent += vec3(-d.x * d.x * st * sf, d.x * st * cf, -d.x * d.y * st * sf);
    binormal += vec3(-d.x * d.y * st * sf, d.y * st * cf, -d.y * d.y * st * sf);
  }
  N = normalize(cross(binormal, tangent));
  return disp;
}
`;
