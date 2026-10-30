// 程序化贴图：面板缝 / 铆钉 / 散热格栅 → 法线 + 粗糙度（512，移动端友好，全局共享）
import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

function heightToNormal(h, W, strength) {
  const out = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const l = h[y * W + ((x - 1 + W) % W)], r = h[y * W + ((x + 1) % W)];
    const u = h[((y - 1 + W) % W) * W + x], d = h[((y + 1) % W) * W + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    out[i * 4] = (nx * 0.5 + 0.5) * 255; out[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; out[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; out[i * 4 + 3] = 255;
  }
  return out;
}

export function makePanelMaps(seed = 7, W = 512) {
  const r = mulberry32(seed);
  const h = new Float32Array(W * W).fill(0.5);
  const rough = new Float32Array(W * W).fill(0.5);
  // 递归分割面板
  const rects = [];
  const split = (x, y, w, hh, depth) => {
    if (depth > 4 || (w < 70 && hh < 70) || (depth > 1 && r() < 0.18)) { rects.push([x, y, w, hh]); return; }
    if (w > hh ? r() < 0.8 : r() < 0.2) { const c = Math.floor(w * r.range(0.3, 0.7)); split(x, y, c, hh, depth + 1); split(x + c, y, w - c, hh, depth + 1); }
    else { const c = Math.floor(hh * r.range(0.3, 0.7)); split(x, y, w, c, depth + 1); split(x, y + c, w, hh - c, depth + 1); }
  };
  split(0, 0, W, W, 0);
  const set = (x, y, v, rv) => { x = ((x % W) + W) % W; y = ((y % W) + W) % W; h[y * W + x] = v; if (rv !== undefined) rough[y * W + x] = rv; };
  for (const [x, y, w, hh] of rects) {
    const lift = r.range(-0.06, 0.06); const rv = r.range(0.35, 0.65);
    for (let j = 2; j < hh - 1; j++) for (let i = 2; i < w - 1; i++) { const k = (y + j) * W + (x + i); h[k] = 0.55 + lift; rough[k] = rv; }
    // 面板缝
    for (let i = 0; i < w; i++) { set(x + i, y, 0.15, 0.8); set(x + i, y + 1, 0.3); }
    for (let j = 0; j < hh; j++) { set(x, y + j, 0.15, 0.8); set(x + 1, y + j, 0.3); }
    // 铆钉
    if (w > 40 && hh > 40 && r() < 0.55) {
      const step = r.pick([12, 16, 20]);
      for (let i = 8; i < w - 6; i += step) for (const yy of [6, hh - 6]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) set(x + i + a, y + yy + b, 0.85 - (Math.abs(a) + Math.abs(b)) * 0.12, 0.3);
    }
    // 散热格栅
    if (w > 60 && hh > 40 && r() < 0.25) {
      const gx = x + 10, gy = y + 10, gw = Math.min(w - 20, 80), gh = Math.min(hh - 20, 50);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const s = (j % 6) < 3 ? 0.25 : 0.62; set(gx + i, gy + j, s, 0.7); }
    }
  }
  // 细噪声 → 粗糙度变化
  for (let k = 0; k < W * W; k++) rough[k] = Math.min(1, Math.max(0, rough[k] + (r() - 0.5) * 0.12));
  const nData = heightToNormal(h, W, 3.2);
  const normal = new THREE.DataTexture(nData, W, W, THREE.RGBAFormat);
  const rData = new Uint8Array(W * W * 4);
  for (let k = 0; k < W * W; k++) { const v = rough[k] * 255; rData[k * 4] = v; rData[k * 4 + 1] = v; rData[k * 4 + 2] = v; rData[k * 4 + 3] = 255; }
  const roughTex = new THREE.DataTexture(rData, W, W, THREE.RGBAFormat);
  for (const t of [normal, roughTex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true; }
  return { normal, rough: roughTex };
}

// 擂台台面（帆布）贴图：中心徽标 + 边框文字 + 污渍
export function makeCanvasFloor(W = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d');
  const grd = g.createRadialGradient(W / 2, W / 2, W * 0.1, W / 2, W / 2, W * 0.72);
  grd.addColorStop(0, '#2a3346'); grd.addColorStop(1, '#141a26');
  g.fillStyle = grd; g.fillRect(0, 0, W, W);
  // 帆布纹理
  const r = mulberry32(3);
  for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.035})`; g.fillRect(r() * W, r() * W, 1 + r() * 2, 1); }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.beginPath(); g.arc(r() * W, r() * W, 10 + r() * 60, 0, 7); g.fill(); }
  // 边框
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 8; g.strokeRect(40, 40, W - 80, W - 80);
  g.strokeStyle = 'rgba(255,60,90,0.5)'; g.lineWidth = 3; g.strokeRect(58, 58, W - 116, W - 116);
  // 中心徽标
  g.save(); g.translate(W / 2, W / 2);
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, W * 0.2, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,64,96,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, W * 0.215, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.2)'; g.font = `900 ${W * 0.09}px Arial Black, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('UGC', 0, -W * 0.045); g.font = `800 ${W * 0.045}px Arial, sans-serif`; g.fillStyle = 'rgba(255,90,120,0.35)'; g.fillText('ROBOT ARENA', 0, W * 0.05);
  g.restore();
  // 角落标记
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.font = `700 ${W * 0.026}px Arial, sans-serif`; g.textAlign = 'center';
  for (let k = 0; k < 4; k++) { g.save(); g.translate(W / 2, W / 2); g.rotate(k * Math.PI / 2); g.fillText('JIMENG · FIGHT NIGHT', 0, W * 0.44); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// 文字贴图（围裙广告板 / 大屏）
export function makeTextTexture(lines, { w = 1024, h = 128, bg = '#0b0f18', fg = '#ffffff', accent = '#ff3d6e', font = 'Arial Black, Arial' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, accent); grd.addColorStop(1, '#6a5cff');
  g.fillStyle = grd; g.fillRect(0, h - 6, w, 6); g.fillRect(0, 0, w, 3);
  g.fillStyle = fg; g.font = `900 ${h * 0.5}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const seg = w / lines.length;
  lines.forEach((s, i) => { g.fillStyle = i % 2 ? accent : fg; g.fillText(s, seg * (i + 0.5), h * 0.5); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// 径向光斑（灯头 / 光晕 / 火花）
export function makeGlowTexture(size = 128, hard = 0.0) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15 + hard * 0.4, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); return t;
}

// 烟雾 / 火球 软噪声团
export function makeSmokeTexture(size = 128, seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const r = mulberry32(seed);
  for (let i = 0; i < 26; i++) {
    const x = size / 2 + (r() - 0.5) * size * 0.4, y = size / 2 + (r() - 0.5) * size * 0.4, rad = size * (0.12 + r() * 0.22);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(255,255,255,${0.25 + r() * 0.2})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c); return t;
}
