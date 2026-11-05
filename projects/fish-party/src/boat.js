// 程序化派对游艇（v1.2 柔和版：奶油白船体 + 柔木甲板 + 圆润倒角 + 柔和 PBR，色值全部取自 style.js SOFT）
// v1.0：放样船体 + 蜂蜜色甲板 + 船舱/硬顶 + 栏杆 + 糖果软垫
// + 派对装饰：彩旗串、气球束（摆动）、彩色跑马灯泡串、DJ 台/音箱（随拍子跳）、迪斯科球（旋转 + 程序化反射光斑）
// 碰撞/尺寸契约不变：HULL / deckYAtZ / halfBeamAtZ / AFT_RAIL / 栏杆高度
import * as THREE from 'three';
import { toonUniforms } from './toon.js';
import { SOFT, SOFT_ACCENTS, SOFT_MAT, DISCO } from './style.js';
import { RoundedBoxGeometry } from '../vendor/addons/geometries/RoundedBoxGeometry.js';

export const HULL = { zs: -7.0, zb: 7.4, B: 2.35 };
export const AFT_RAIL = 0.13;   // 尾部站人区栏杆高出舷缘的高度（v0.5 为 0.42）

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const uOf = (z) => (z - HULL.zs) / (HULL.zb - HULL.zs);
export function halfBeam(u) {
  const bow = Math.pow(THREE.MathUtils.clamp((1 - u) / 0.56, 0, 1), 0.62);
  const stern = 0.9 + 0.1 * smooth(0, 0.3, u);
  return HULL.B * Math.min(bow, stern);
}
export function gunwaleY(u) { return 1.05 + 0.55 * Math.pow(u, 2.2); }
function keelY(u) { return -0.55 - 0.2 * smooth(0, 0.4, u) + 1.25 * Math.pow(smooth(0.55, 1.0, u), 1.6); }
function bulwarkH(u) { return 0.55 - 0.43 * smooth(0.35, 0.6, u); }
export function deckY(u) { return gunwaleY(u) - bulwarkH(u); }
export function deckYAtZ(z) { return deckY(uOf(z)); }
export function halfBeamAtZ(z) { return halfBeam(uOf(z)); }

// ---------- 程序化纹理 ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function teakTextures() {
  // 木板沿 v 方向；每块板 0.12m；纹理覆盖 2m x 2m
  const draw = (g, w, h, bump) => {
    const planks = 16;
    const pw = w / planks;
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < planks; i++) {
      let y0 = 0;
      while (y0 < h) {
        const len = h * (0.35 + r() * 0.5);
        const base = bump ? 200 : 0;
        if (bump) g.fillStyle = `rgb(${base},${base},${base})`;
        else {
          const l = 0.92 + r() * 0.14;
          g.fillStyle = `rgb(${Math.floor(226 * l)},${Math.floor(194 * l)},${Math.floor(158 * l)})`;   // v1.2 柔木色（灰暖）
        }
        g.fillRect(i * pw, y0, pw, len);
        // 木纹
        for (let k = 0; k < 14; k++) {
          const x = i * pw + r() * pw;
          g.strokeStyle = bump ? `rgba(120,120,120,${0.12 + r() * 0.15})` : `rgba(${170 + r() * 25},${132 + r() * 18},${104},${0.07 + r() * 0.08})`;
          g.lineWidth = 0.6 + r() * 1.4;
          g.beginPath();
          g.moveTo(x, y0);
          g.bezierCurveTo(x + (r() - 0.5) * 6, y0 + len * 0.33, x + (r() - 0.5) * 6, y0 + len * 0.66, x + (r() - 0.5) * 4, y0 + len);
          g.stroke();
        }
        // 板端接缝
        g.fillStyle = bump ? '#404040' : '#c9a283';
        g.fillRect(i * pw, y0 + len - 2, pw, 2);
        y0 += len;
      }
      // 黑色填缝
      g.fillStyle = bump ? '#303030' : SOFT.woodDeep;
      g.fillRect(i * pw, 0, Math.max(2, pw * 0.07), h);
    }
  };
  const map = canvasTex(512, 1024, (g, w, h) => draw(g, w, h, false));
  const bump = canvasTex(512, 1024, (g, w, h) => draw(g, w, h, true), false);
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return { map, bump };
}

function hullTexture() {
  // u: 绝对高度 y∈[-1,2] → 水线色带；v: 距舷缘的距离 → 舷缘深色带
  return canvasTex(1024, 256, (g, w, h) => {
    const yToX = (y) => ((y + 1) / 3) * w;
    // v1.2：大面积奶油白；水线以下雾蓝、燕麦腰线、舷缘一条雾粉宽带 + 奶油细线（整船 3 色）
    g.fillStyle = SOFT.cream;
    g.fillRect(0, 0, w, h);
    g.fillStyle = SOFT.blueDeep;                     // 水线以下：雾蓝
    g.fillRect(0, 0, yToX(0.08), h);
    g.fillStyle = SOFT.oat;                          // 燕麦腰线
    g.fillRect(yToX(0.08), 0, yToX(0.16) - yToX(0.08), h);
    const band = 0.2 * h;
    g.fillStyle = SOFT.roseDeep;                     // 舷缘雾粉宽带
    g.fillRect(yToX(0.16), 0, w, band);
    g.fillStyle = '#fbf6ee';
    g.fillRect(yToX(0.16), band, w, 0.03 * h);
    g.fillStyle = SOFT.oat;
    g.fillRect(yToX(0.16), band + 0.05 * h, w, 0.02 * h);
  });
}

// v2.1：船名 = 海蓝粗圆体「Fish Party」（离线字体 assets/fonts/Fredoka-Party.woff2，加载完成后重绘贴图）
function drawName(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 132px "FP Round", ui-rounded, "Arial Rounded MT Bold", sans-serif`;   // v2.1：品牌粗圆体 · 海蓝
  // 暖白描边托底，在白色船尾上也能读出来；主体海蓝渐变
  g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = 'rgba(255,252,246,.96)'; g.strokeText('Fish Party', w / 2, h * 0.47);
  const gr = g.createLinearGradient(0, h * 0.2, 0, h * 0.8); gr.addColorStop(0, '#5cc4e8'); gr.addColorStop(0.55, '#2b97d4'); gr.addColorStop(1, '#1f78b8');
  g.fillStyle = gr; g.fillText('Fish Party', w / 2, h * 0.47);
}
function nameTexture() {
  const t = canvasTex(1024, 256, drawName);
  if (document.fonts?.load) document.fonts.load('600 132px "FP Round"').then(() => { const c = t.image; drawName(c.getContext('2d'), c.width, c.height); t.needsUpdate = true; }).catch(() => {});
  return t;
}

function flagTexture() {
  return canvasTex(256, 160, (g, w, h) => {
    const st = [SOFT.rose, SOFT.butter, SOFT.mint, SOFT.blue];
    for (let i = 0; i < 4; i++) { g.fillStyle = st[i]; g.fillRect(0, (h / 4) * i, w, h / 4 + 1); }
    g.fillStyle = SOFT.cream; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, 50, 34, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = SOFT.terra;
    g.beginPath(); g.ellipse(w * 0.5, h * 0.5, 34, 18, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(w * 0.5 + 28, h * 0.5); g.lineTo(w * 0.5 + 54, h * 0.5 - 18); g.lineTo(w * 0.5 + 54, h * 0.5 + 18); g.fill();
    g.fillStyle = SOFT.ink; g.beginPath(); g.arc(w * 0.5 - 18, h * 0.5 - 4, 4, 0, Math.PI * 2); g.fill();
  });
}

// ---------- 材质 ----------
export function makeMaterials() {
  const teak = teakTextures();
  // v1.2 统一柔和 PBR：粗糙度 0.6–0.86、无强清漆、缎面金属；布料/充气物带 sheen 微绒；userData.fuzz → toon 绒边加强
  const fabric = (color) => { const m = new THREE.MeshPhysicalMaterial({ color, ...SOFT_MAT.fabric, sheenColor: new THREE.Color('#fff6ec') }); m.userData.fuzz = 0.7; return m; };
  const paint = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, ...SOFT_MAT.paint, ...extra });
  return {
    hull: new THREE.MeshPhysicalMaterial({ map: hullTexture(), roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.55, envMapIntensity: 0.8 }),
    white: paint(SOFT.cream),
    offwhite: paint(SOFT.creamDeep, { roughness: 0.7 }),
    navy: paint(SOFT.taupe),
    teak: new THREE.MeshStandardMaterial({ map: teak.map, bumpMap: teak.bump, bumpScale: 0.6, ...SOFT_MAT.wood, color: '#ffffff' }),
    teakTex: teak,
    chrome: new THREE.MeshStandardMaterial({ color: SOFT.metal, ...SOFT_MAT.metal }),
    glass: new THREE.MeshPhysicalMaterial({ color: SOFT.glass, metalness: 0.1, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 0.75 }),
    cushion: fabric(SOFT.cream),
    coral: fabric(SOFT.rose),
    teal: fabric(SOFT.mint),
    mustard: fabric(SOFT.butter),
    oatF: fabric(SOFT.oat),
    grape: paint(SOFT.taupe, { roughness: 0.7 }),
    mintP: paint(SOFT.mint, { roughness: 0.66 }),
    roseP: paint(SOFT.rose, { roughness: 0.66 }),
    butterP: paint(SOFT.butter, { roughness: 0.66 }),
    black: paint(SOFT.ink, { roughness: 0.6 }),
    bulb: new THREE.MeshBasicMaterial({ color: '#ffffff' }),   // 灯串：instanceColor 驱动（暖白为主）
    wire: new THREE.LineBasicMaterial({ color: SOFT.inkSoft }),
    name: new THREE.MeshStandardMaterial({ map: nameTexture(), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    flag: (() => { const m = new THREE.MeshPhysicalMaterial({ map: flagTexture(), side: THREE.DoubleSide, ...SOFT_MAT.fabric, sheenColor: new THREE.Color('#fff6ec') }); m.userData.fuzz = 0.6; return m; })(),
  };
}

// ---------- 船体放样 ----------
function buildHullExterior() {
  const NU = 72, NV = 22;
  const pos = [], uv = [], idx = [];
  const sec = (u, side) => {
    const hb = halfBeam(u), g = gunwaleY(u), k = keelY(u);
    const pts = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      let sx, sy;
      if (v < 0.32) { const t = v / 0.32; sx = 0.74 * t; sy = 0.24 * t; }
      else { const t = (v - 0.32) / 0.68; sx = 0.74 + 0.26 * Math.sin(t * Math.PI / 2); sy = 0.24 + 0.76 * t; }
      // 上部轻微外飘
      sx += 0.03 * Math.sin(v * Math.PI) * (v > 0.5 ? 1 : 0);
      pts.push([side * hb * sx, k + (g - k) * sy, g]);
    }
    return pts;
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      const u = Math.pow(i / NU, 1.0);
      const z = HULL.zs + u * (HULL.zb - HULL.zs);
      const pts = sec(u, side);
      for (const [x, y, g] of pts) {
        pos.push(x, y, z);
        uv.push((y + 1) / 3, 1 - (g - y));
      }
    }
    const row = NV + 1;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = base + i * row + j, b = a + 1, c = a + row, d = c + 1;
        if (side > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }
  // 尾封板
  const tBase = pos.length / 3;
  const right = sec(0, 1), left = sec(0, -1);
  const ring = [...right, ...left.slice().reverse()];
  const cy = (gunwaleY(0) + keelY(0)) * 0.5;
  pos.push(0, cy, HULL.zs); uv.push((cy + 1) / 3, 0.0);
  for (const [x, y, g] of ring) { pos.push(x, y, HULL.zs); uv.push((y + 1) / 3, 1 - (g - y)); }
  for (let i = 0; i < ring.length - 1; i++) idx.push(tBase, tBase + 2 + i, tBase + 1 + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildDeckAndBulwark() {
  const NU = 72;
  const capW = 0.13;
  const deck = { pos: [], uv: [], idx: [] };
  const cap = { pos: [], idx: [] };
  const inner = { pos: [], idx: [] };
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const z = HULL.zs + u * (HULL.zb - HULL.zs);
    const hb = halfBeam(u) * 1.0 + 0.004;
    const g = gunwaleY(u), d = deckY(u);
    const ih = Math.max(hb - capW, 0);
    // 甲板（左右两点）
    deck.pos.push(-ih, d, z, ih, d, z);
    deck.uv.push(-ih / 2, z / 2, ih / 2, z / 2);
    // 舷缘盖板（左右各两点）
    cap.pos.push(-hb, g, z, -ih, g, z, ih, g, z, hb, g, z);
    // 内舷墙
    inner.pos.push(-ih, g, z, -ih, d, z, ih, g, z, ih, d, z);
  }
  for (let i = 0; i < NU; i++) {
    const a = i * 2;
    deck.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    const c = i * 4, n = c + 4;
    cap.idx.push(c, n, c + 1, c + 1, n, n + 1);
    cap.idx.push(c + 2, n + 2, c + 3, c + 3, n + 2, n + 3);
    inner.idx.push(c, n, c + 1, n, n + 1, c + 1);
    inner.idx.push(c + 2, c + 3, n + 2, n + 2, c + 3, n + 3);
  }
  const mk = (o, withUV) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    if (withUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
    g.setIndex(o.idx);
    g.computeVertexNormals();
    return g;
  };
  return { deck: mk(deck, true), cap: mk(cap), inner: mk(inner) };
}

function tube(points, radius, mat, closed = false, seg = 64) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 10, closed), mat);
  m.castShadow = true;
  return m;
}

function rbox(w, h, d, r, mat, seg = 4) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, r), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function createBoat() {
  const M = makeMaterials();
  const boat = new THREE.Group();
  boat.name = 'yacht';
  const add = (m, parent = boat) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  add(new THREE.Mesh(buildHullExterior(), M.hull));
  const dk = buildDeckAndBulwark();
  M.teak.map.repeat.set(1, 1);
  add(new THREE.Mesh(dk.deck, M.teak));
  add(new THREE.Mesh(dk.cap, M.teak));
  add(new THREE.Mesh(dk.inner, M.offwhite));
  // v1.2 圆润化：船舷一圈厚实的圆形护舷条（猛兽派对式"软边"轮廓），左舷尾 → 船头 → 右舷尾 一笔连成
  {
    const woodP = new THREE.MeshStandardMaterial({ color: SOFT.wood, roughness: 0.74 });
    const pts = [];
    const zs = [];
    for (let z = HULL.zs + 0.12; z < HULL.zb - 0.5; z += 0.35) zs.push(z);
    for (const z of zs) pts.push(new THREE.Vector3(-(halfBeamAtZ(z) + 0.035), gunwaleY(uOf(z)) - 0.11, z));
    pts.push(new THREE.Vector3(0, gunwaleY(1) - 0.1, HULL.zb + 0.02));
    for (const z of zs.slice().reverse()) pts.push(new THREE.Vector3(halfBeamAtZ(z) + 0.035, gunwaleY(uOf(z)) - 0.11, z));
    const strake = tube(pts, 0.065, woodP, false, 160);
    strake.receiveShadow = true;
    boat.add(strake);
  }

  // 尾部低矮舷墙 + 通往泳台的门洞
  const sY = deckY(0), sG = gunwaleY(0), sHB = halfBeam(0);
  const wallH = (sG - sY) * 0.82;
  for (const sx of [-1, 1]) {
    const w = sHB - 0.55;
    const wall = rbox(w, wallH, 0.14, 0.068, M.white, 5);
    wall.position.set(sx * (0.55 + w / 2 - 0.13), sY + wallH / 2, HULL.zs + 0.07);
    add(wall);
    const capb = rbox(w, 0.06, 0.22, 0.03, M.teak, 3);
    capb.position.set(wall.position.x, sY + wallH + 0.02, HULL.zs + 0.07);
    add(capb);
  }
  // 泳台
  const plat = rbox(sHB * 1.86, 0.12, 1.1, 0.06, M.teak, 4);
  plat.position.set(0, 0.44, HULL.zs - 0.5);
  add(plat);
  const platBase = rbox(sHB * 1.8, 0.36, 1.0, 0.14, M.white, 5);
  platBase.position.set(0, 0.22, HULL.zs - 0.47);
  add(platBase);
  // 泳梯
  for (const sx of [-0.25, 0.25]) add(tube([new THREE.Vector3(sx + 0.9, 0.46, HULL.zs - 0.95), new THREE.Vector3(sx + 0.9, 0.1, HULL.zs - 1.12), new THREE.Vector3(sx + 0.9, -0.6, HULL.zs - 1.12)], 0.018, M.chrome));
  // 船名
  const name = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), M.name);
  name.position.set(0, 0.62, HULL.zs - 0.008);
  name.rotation.y = Math.PI;
  boat.add(name);

  // ---------- 主舱 ----------
  const cabZ0 = -0.6, cabZ1 = 4.3;
  const cabLen = cabZ1 - cabZ0, cabMid = (cabZ0 + cabZ1) / 2;
  const cabW = 3.55;
  const cabin = rbox(cabW, 1.75, cabLen, 0.32, M.white, 6);
  cabin.position.set(0, 1.55, cabMid);
  add(cabin);
  // 斜切前挡风（倾斜的白色楔块 + 玻璃）
  const nose = rbox(cabW - 0.25, 0.9, 1.6, 0.3, M.white, 6);
  nose.position.set(0, 2.2, cabZ1 - 0.55);
  nose.rotation.x = -0.55;
  add(nose);
  // 环绕的深色玻璃窗带
  const win = rbox(cabW + 0.04, 0.62, cabLen - 0.9, 0.28, M.glass, 6);
  win.position.set(0, 1.95, cabMid - 0.25);
  add(win);
  const wind = rbox(cabW - 0.4, 0.06, 1.25, 0.03, M.glass, 2);
  wind.position.set(0, 2.42, cabZ1 - 0.62);
  wind.rotation.x = -0.55;
  add(wind);
  // 舱门（后舱壁玻璃滑门）
  const door = rbox(1.5, 1.35, 0.06, 0.04, M.glass, 2);
  door.position.set(0.55, 1.42, cabZ0 - 0.005);
  add(door);
  // 门框与中梃
  for (const [w, h, x, y] of [[1.58, 0.05, 0.55, 2.1], [1.58, 0.05, 0.55, 0.76], [0.05, 1.4, -0.22, 1.42], [0.05, 1.4, 1.32, 1.42], [0.04, 1.35, 0.55, 1.42]]) {
    const f = rbox(w, h, 0.08, 0.015, M.chrome, 2); f.position.set(x, y, cabZ0 - 0.02); add(f);
  }
  const handle = rbox(0.03, 0.3, 0.05, 0.012, M.chrome, 2); handle.position.set(0.48, 1.4, cabZ0 - 0.07); add(handle);
  // 船体舷窗（长条深色）
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z = 1.0 + k * 1.15;
      const hb = halfBeamAtZ(z);
      const pw = rbox(0.04, 0.16, 0.85, 0.06, M.glass, 3);
      pw.position.set(sx * (hb + 0.02), gunwaleY(uOf(z)) - 0.42, z);
      add(pw);
    }
  }

  // ---------- 硬顶 ----------
  const htZ0 = -1.75, htZ1 = 2.6;
  const ht = rbox(cabW + 0.5, 0.16, htZ1 - htZ0, 0.08, M.white, 5);
  ht.position.set(0, 2.62, (htZ0 + htZ1) / 2);
  add(ht);
  const htUnder = new THREE.Mesh(new THREE.PlaneGeometry(cabW + 0.3, htZ1 - htZ0 - 0.2), M.teak);
  htUnder.rotation.x = Math.PI / 2;
  htUnder.position.set(0, 2.545, (htZ0 + htZ1) / 2);
  add(htUnder);
  for (const sx of [-1, 1]) {
    add(tube([new THREE.Vector3(sx * 1.85, 2.56, htZ0 + 0.25), new THREE.Vector3(sx * 1.9, 1.6, htZ0 + 0.35), new THREE.Vector3(sx * (halfBeamAtZ(htZ0) - 0.2), deckYAtZ(htZ0) + 0.02, htZ0 + 0.45)], 0.045, M.white, false, 24));
  }
  // 雷达 / 天线 / 喇叭
  const radar = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.06, 6, 32), M.white); radar.scale.y = 0.55;
  radar.position.set(0, 2.82, 0.6); add(radar);
  const radarTop = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.white);
  radarTop.scale.y = 0.35; radarTop.position.set(0, 2.92, 0.6); add(radarTop);
  for (const sx of [-0.9, 0.9]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 1.6, 8), M.white);
    ant.position.set(sx, 3.45, -0.6); ant.rotation.z = sx * -0.08; add(ant);
  }
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6 }));
  navL.position.set(0, 2.78, -1.8); boat.add(navL);

  // ---------- 栏杆 ----------
  // v0.6：降到 Q 版角色腰部以下（舷墙 0.55 + 栏杆 ≈ 0.68m，角色胯部 ≈ 0.45–0.6m），不再遮挡上半身
  // 立柱更短更密、扶手稍粗，保持"游艇不锈钢护栏"的比例感
  const railH = 0.3;
  for (const sx of [-1, 1]) {
    const top = [];
    for (let z = -0.4; z <= HULL.zb - 0.35; z += 0.25) {
      const u = uOf(z);
      const hb = halfBeam(u) - 0.07;
      top.push(new THREE.Vector3(sx * hb, gunwaleY(u) + railH, z));
    }
    top.push(new THREE.Vector3(0, gunwaleY(uOf(HULL.zb - 0.15)) + railH, HULL.zb - 0.12));
    add(tube(top, 0.028, M.chrome, false, 96));
    for (let z = -0.3; z <= HULL.zb - 0.8; z += 0.8) {
      const u = uOf(z);
      const hb = halfBeam(u) - 0.07;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, railH, 12), M.chrome);
      p.position.set(sx * hb, gunwaleY(u) + railH / 2, z);
      add(p);
    }
    // 尾部栏杆：矮扶手（站人区，最贴近镜头）
    const ar = [];
    for (let z = HULL.zs + 0.3; z <= -1.6; z += 0.3) {
      const hb = halfBeamAtZ(z) - 0.07;
      ar.push(new THREE.Vector3(sx * hb, gunwaleY(uOf(z)) + AFT_RAIL, z));
    }
    add(tube(ar, 0.026, M.chrome, false, 48));
    for (let z = HULL.zs + 0.3; z <= -1.6; z += 0.9) {
      const hb = halfBeamAtZ(z) - 0.07;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, AFT_RAIL, 12), M.chrome);
      p.position.set(sx * hb, gunwaleY(uOf(z)) + AFT_RAIL / 2, z); add(p);
    }
  }
  // 系缆桩
  for (const [x, z] of [[1.95, -6.2], [-1.95, -6.2], [1.6, 5.2], [-1.6, 5.2]]) {
    const cl = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), M.chrome);
    cl.rotation.x = Math.PI / 2;
    cl.position.set(x, gunwaleY(uOf(z)) + 0.04, z); add(cl);
  }

  // ---------- 前甲板日光垫 ----------
  const bowZ = 5.45, bowU = uOf(bowZ);
  const slope = Math.atan2(deckY(uOf(bowZ + 0.5)) - deckY(uOf(bowZ - 0.5)), 1.0);
  const pad = new THREE.Group();
  pad.position.set(0, deckY(bowU) + 0.12, bowZ);
  pad.rotation.x = -slope;
  boat.add(pad);
  const padBase = rbox(2.5, 0.16, 1.9, 0.08, M.cushion, 5);
  pad.add(padBase);
  for (const [x, m] of [[-0.75, M.coral], [0, M.oatF], [0.75, M.teal]]) {
    const pil = rbox(0.6, 0.2, 0.36, 0.1, m, 5);
    pil.position.set(x, 0.16, 0.78); pil.rotation.x = 0.35; pad.add(pil);
  }

  // ---------- 尾舱沙发 + 茶几 ----------
  const cockpitY = deckY(0.05);
  const sofa = new THREE.Group();
  sofa.position.set(0, deckYAtZ(-6.0), -6.0);
  boat.add(sofa);
  const sofaBase = rbox(3.0, 0.38, 0.62, 0.12, M.white, 5); sofaBase.position.set(0, 0.19, -0.35); sofa.add(sofaBase);
  const seat = rbox(2.95, 0.16, 0.6, 0.08, M.cushion, 5); seat.position.set(0, 0.45, -0.32); sofa.add(seat);
  for (const x of [-1.0, 0, 1.0]) {
    const back = rbox(0.95, 0.42, 0.18, 0.09, M.cushion, 5);
    back.position.set(x, 0.72, -0.62); back.rotation.x = -0.18; sofa.add(back);
  }
  for (const [x, m] of [[-1.15, M.coral], [1.1, M.teal]]) {
    const thr = rbox(0.38, 0.32, 0.14, 0.07, m, 5);
    thr.position.set(x, 0.66, -0.47); thr.rotation.set(-0.25, 0.2 * Math.sign(x), 0.1); sofa.add(thr);
  }
  // v0.8：左舷侧边长椅下线（占了左舷钓位）—— 保留 Group 但不挂到船上
  const side = new THREE.Group();
  side.position.set(-1.62, deckYAtZ(-4.4), -4.4);
  const sb = rbox(0.55, 0.38, 2.2, 0.12, M.white, 5); sb.position.y = 0.19; side.add(sb);
  const ss = rbox(0.55, 0.16, 2.15, 0.08, M.cushion, 5); ss.position.y = 0.45; side.add(ss);
  // 茶几 —— v0.8：挪到尾沙发正前方的中轴线上，缩小一圈，两舷都空出来钓鱼
  const table = new THREE.Group();
  table.position.set(0, deckYAtZ(-5.15), -5.15);
  table.scale.setScalar(0.82);
  boat.add(table);
  const tTop = rbox(1.1, 0.1, 1.4, 0.05, M.teak, 5); tTop.position.y = 0.69; table.add(tTop);
  const tLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.68, 20), M.white); tLeg.position.y = 0.34; table.add(tLeg); tLeg.castShadow = true;
  // 桌上的饮料与果盘
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#fffaf2', roughness: 0.3, transmission: 0.0, transparent: true, opacity: 0.35 });
  const drinkCols = [SOFT.terra, SOFT.mint, SOFT.butter];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group();
    g.position.set(-0.3 + k * 0.28, 0.73, -0.35 + (k % 2) * 0.2);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.14, 16), glassMat); cup.position.y = 0.07; g.add(cup);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.1, 16), new THREE.MeshStandardMaterial({ color: drinkCols[k], roughness: 0.45, emissive: drinkCols[k], emissiveIntensity: 0.03 })); liq.position.y = 0.055; g.add(liq);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 6), M.coral); straw.position.set(0.015, 0.14, 0); straw.rotation.z = 0.25; g.add(straw);
    const lemon = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 16), M.mustard); lemon.position.set(0.04, 0.13, 0); lemon.rotation.z = 1.2; g.add(lemon);
    table.add(g);
  }
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.white);
  bowl.position.set(0.25, 0.86, 0.3); table.add(bowl);
  for (let k = 0; k < 6; k++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), [M.coral, M.mustard, M.teal][k % 3]);
    f.position.set(0.25 + Math.cos(k) * 0.07, 0.78, 0.3 + Math.sin(k) * 0.07); f.castShadow = true; table.add(f);
  }

  // 冷藏箱 + 蓝牙音箱
  // v0.8：绿色冷藏箱下线（挡右舷走道）—— 不挂到船上
  const cooler = new THREE.Group();
  cooler.position.set(1.55, deckYAtZ(-3.2), -3.2);
  const cBody = rbox(0.62, 0.4, 0.42, 0.15, M.mintP, 6); cBody.position.y = 0.2; cooler.add(cBody);
  const cLid = rbox(0.66, 0.1, 0.46, 0.05, M.white, 5); cLid.position.y = 0.44; cooler.add(cLid);
  const speaker = rbox(0.28, 0.14, 0.12, 0.055, M.grape, 4); speaker.position.set(0.05, 0.55, 0); cooler.add(speaker);

  // 竿架上的备用钓竿 —— v0.8 下线：船尾两角的黑色细杆容易被误认成玩家鱼竿
  if (false) for (const sx of [-1, 1]) {
    const z = -6.4;
    const base = new THREE.Vector3(sx * (halfBeamAtZ(z) - 0.12), gunwaleY(0.04), z);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.016, 2.4, 6), M.black);
    rod.position.copy(base).add(new THREE.Vector3(sx * 0.25, 1.0, -0.35));
    rod.rotation.set(-0.3, 0, -sx * 0.25);
    add(rod);
  }

  // ---------- 灯串（黄昏时点亮） ----------
  const bulbGeo = new THREE.SphereGeometry(0.042, 10, 8);
  const strands = [];
  const bulbPos = [];
  const hw = (cabW + 0.5) / 2 - 0.05, yT = 2.54;
  const sternRail = (sx) => [new THREE.Vector3(sx * (halfBeamAtZ(-1.7) - 0.07), gunwaleY(uOf(-1.7)) + AFT_RAIL, -1.7), new THREE.Vector3(sx * (halfBeamAtZ(HULL.zs + 0.3) - 0.07), gunwaleY(0.02) + AFT_RAIL, HULL.zs + 0.3)];
  const anchors = [
    [new THREE.Vector3(hw, yT, htZ0 + 0.05), new THREE.Vector3(-hw, yT, htZ0 + 0.05), 0.08],
    [new THREE.Vector3(hw, yT, htZ0 + 0.05), new THREE.Vector3(hw, yT, htZ1 - 0.6), 0.05],
    [new THREE.Vector3(-hw, yT, htZ0 + 0.05), new THREE.Vector3(-hw, yT, htZ1 - 0.6), 0.05],
    [...sternRail(1), 0.03],
    [...sternRail(-1), 0.03],
  ];
  for (const [a, b, sagK] of anchors) {
    const pts = [];
    const n = 36;
    const L = a.distanceTo(b);
    const scallops = Math.max(2, Math.round(L / 1.1));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.abs(Math.sin(t * Math.PI * scallops)) * L * sagK / scallops * 1.5 + 0.02;
      pts.push(p);
      if (i % 3 === 1) bulbPos.push(p.clone().add(new THREE.Vector3(0, -0.035, 0)));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), M.wire);
    boat.add(line);
    strands.push(line);
  }
  // 彩色跑马灯：糖果色循环，每帧做"追逐"亮暗（instanceColor，toneMapped 允许 >1 进 Bloom）
  const bulbs = new THREE.InstancedMesh(bulbGeo, M.bulb, bulbPos.length);
  const mtx = new THREE.Matrix4();
  // v1.2：暖白灯泡为主，每 4 颗点缀 1 颗柔色（与白混合，不刺眼）
  const bulbBase = bulbPos.map((p, i) => { mtx.makeTranslation(p.x, p.y, p.z); bulbs.setMatrixAt(i, mtx); return i % 4 === 2 ? new THREE.Color(SOFT_ACCENTS[(i >> 2) % SOFT_ACCENTS.length]).lerp(new THREE.Color(SOFT.bulb), 0.35) : new THREE.Color(SOFT.bulb); });
  bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bulbPos.length * 3), 3);
  bulbs.castShadow = false;
  boat.add(bulbs);
  const warm = new THREE.PointLight('#ffd9b0', 0, 9, 1.6);
  warm.position.set(0, 2.3, -3.6);
  boat.add(warm);

  const party = buildParty(boat, M, { cabW, cabZ0, htZ0, htZ1 });

  // ---------- 旗杆 + 飘扬的旗子 ----------
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, 1.4, 10), M.chrome);
  pole.position.set(0, gunwaleY(0) + 0.5, HULL.zs + 0.12); pole.rotation.x = -0.35; add(pole);
  const flagGeo = new THREE.PlaneGeometry(0.62, 0.4, 16, 6);
  flagGeo.translate(0.31, 0, 0);
  const flag = new THREE.Mesh(flagGeo, M.flag);
  flag.position.set(0, gunwaleY(0) + 1.02, HULL.zs - 0.08);
  flag.rotation.set(-0.35, Math.PI / 2, 0);
  flag.castShadow = true;
  boat.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();

  boat.traverse((o) => { if (o.isMesh && o !== flag) { o.castShadow = o.castShadow ?? true; } });

  let lightK = 0.45;
  const bc = new THREE.Color();
  return {
    group: boat,
    materials: M,
    party,
    setLights(v) {
      lightK = v;
      warm.intensity = v * 5.0;
    },
    update(t, wind = 1) {
      const p = flagGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = flagBase[i * 3], y = flagBase[i * 3 + 1];
        const k = x / 0.62;
        p.array[i * 3 + 2] = Math.sin(x * 9 - t * 7 * wind + y * 2) * 0.06 * k + Math.sin(x * 17 - t * 11) * 0.015 * k;
        p.array[i * 3 + 1] = y + Math.sin(x * 6 - t * 5) * 0.02 * k;
      }
      p.needsUpdate = true;
      flagGeo.computeVertexNormals();
      // 跑马灯：每 3 颗一组轮流亮（白天也看得出是彩灯，黄昏更亮）
      const base = 0.82 + lightK * 0.5, hi = 1.0 + lightK * 0.8;   // v1.2：柔和呼吸，不进强 Bloom
      const step = Math.floor(t * 4);
      for (let i = 0; i < bulbBase.length; i++) {
        const on = (i + step) % 3 === 0;
        bc.copy(bulbBase[i]).multiplyScalar(on ? hi : base);
        bulbs.setColorAt(i, bc);
      }
      bulbs.instanceColor.needsUpdate = true;
      party.update(t, wind);
    },
  };
}

// ======================= 派对装饰 =======================
function canvasTexP(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// 下垂曲线（彩旗/绳子）：a → b，中段下垂 sag 米
function sagCurve(a, b, sag, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  return pts;
}

function buildParty(boat, M, { cabW, cabZ0, htZ0, htZ1 }) {
  const party = new THREE.Group();
  party.name = 'party';
  boat.add(party);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const updaters = [];
  // v1.2：气球/装饰 = 柔和点缀色 + 充气物柔亮 sheen（哑光微绒，不是塑料镜面）
  const candyMats = SOFT_ACCENTS.map((c) => { const m = new THREE.MeshPhysicalMaterial({ color: c, ...SOFT_MAT.inflat, sheenColor: new THREE.Color('#fff7ef') }); m.userData.fuzz = 0.6; return m; });
  const creamInflat = new THREE.MeshPhysicalMaterial({ color: SOFT.cream, ...SOFT_MAT.inflat, sheenColor: new THREE.Color('#ffffff') }); creamInflat.userData.fuzz = 0.6;
  const balloonMats = [candyMats[0], creamInflat, candyMats[1], candyMats[2], creamInflat, candyMats[3]];   // 雾粉/奶油/黄油/薄荷/奶油/雾蓝
  const inkLine = new THREE.LineBasicMaterial({ color: SOFT.inkSoft });
  const htTop = 2.69, htUnder = 2.545, hw = (cabW + 0.5) / 2 - 0.03;

  // ---------- 派对桅杆（硬顶上）+ 星星 ----------
  const mastZ = -0.15, mastTop = 3.72;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, mastTop - htTop, 12), M.white);
  mast.position.set(0, (mastTop + htTop) / 2, mastZ); party.add(mast);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.085 : 0.16, a = (i / 10) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? starShape.lineTo(x, y) : starShape.moveTo(x, y); }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 4 }), candyMats[1]);
  star.geometry.center(); star.position.set(0, mastTop + 0.15, mastZ); party.add(star);
  updaters.push((t) => { star.rotation.y = t * 1.2; });

  // ---------- 彩旗串（InstancedMesh：一次 draw call，按段飘动）----------
  const flagG = new THREE.BufferGeometry();
  flagG.setAttribute('position', new THREE.Float32BufferAttribute([-0.085, 0, 0, 0.085, 0, 0, 0, -0.17, 0], 3));
  flagG.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  flagG.setIndex([0, 2, 1]);
  const flagM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', ...SOFT_MAT.fabric, sheenColor: new THREE.Color('#fff6ec'), side: THREE.DoubleSide }); flagM.userData.fuzz = 0.5;
  const runs = [
    [V3(0, mastTop, mastZ), V3(0, gunwaleY(uOf(HULL.zb - 0.2)) + 0.32, HULL.zb - 0.2), 0.45],            // 桅杆 → 船头
    [V3(0, mastTop, mastZ), V3(hw, htTop, htZ0 + 0.05), 0.12],                                          // 桅杆 → 硬顶后角
    [V3(0, mastTop, mastZ), V3(-hw, htTop, htZ0 + 0.05), 0.12],
    [V3(0, mastTop, mastZ), V3(hw, htTop, htZ1 - 0.05), 0.12],                                          // 桅杆 → 硬顶前角
    [V3(0, mastTop, mastZ), V3(-hw, htTop, htZ1 - 0.05), 0.12],
    [V3(hw, htUnder, htZ0 - 0.02), V3(-hw, htUnder, htZ0 - 0.02), 0.16],                                // 硬顶后沿
  ];
  const flags = [];
  for (const [a, b, sag] of runs) {
    const L = a.distanceTo(b);
    const pts = sagCurve(a, b, sag, 40);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), inkLine);
    party.add(line);
    const curve = new THREE.CatmullRomCurve3(pts);
    const n = Math.max(3, Math.floor(L / 0.26));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      const x = tg.clone().normalize();
      const zf = new THREE.Vector3(0, 1, 0).cross(x).normalize();
      if (zf.lengthSq() < 1e-4) zf.set(0, 0, 1);
      const y = zf.clone().cross(x).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, zf));
      flags.push({ p, q, axis: x, ph: Math.random() * 6.28 });
    }
  }
  const flagMesh = new THREE.InstancedMesh(flagG, flagM, flags.length);
  flagMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const fc = new THREE.Color();
  const flagCols = [SOFT.rose, SOFT.cream, SOFT.butter, SOFT.mint, SOFT.cream, SOFT.blue];   // 柔色与奶油白交替：彩而不闹
  flags.forEach((f, i) => { flagMesh.setColorAt(i, fc.set(flagCols[i % flagCols.length])); });
  flagMesh.frustumCulled = false;
  party.add(flagMesh);
  const fq = new THREE.Quaternion(), fq2 = new THREE.Quaternion(), fm = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  updaters.push((t, wind) => {
    for (let i = 0; i < flags.length; i++) {
      const f = flags[i];
      fq2.setFromAxisAngle(f.axis, Math.sin(t * 3.2 * wind + f.ph) * 0.35 + 0.15);
      fq.multiplyQuaternions(fq2, f.q);
      fm.compose(f.p, fq, one);
      flagMesh.setMatrixAt(i, fm);
    }
    flagMesh.instanceMatrix.needsUpdate = true;
  });

  // ---------- 气球束（共享 6 种糖果材质，整束轻轻摆动）----------
  const balloonG = new THREE.SphereGeometry(1, 24, 18);
  { const p = balloonG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = y < 0 ? 1 - Math.pow(-y, 2) * 0.28 : 1; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y * 1.16); } balloonG.computeVertexNormals(); }
  const knotG = new THREE.ConeGeometry(0.16, 0.22, 12); knotG.translate(0, -1.22, 0);
  const bunch = (pos, n, r, h, seed) => {
    const g = new THREE.Group(); g.position.copy(pos); party.add(g);
    let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const tips = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6, sp = 0.12 + rnd() * 0.16;
      const tip = V3(Math.cos(a) * sp, h * (0.75 + rnd() * 0.35), Math.sin(a) * sp);
      const rr = r * (0.85 + rnd() * 0.3);
      const m = balloonMats[(i + seed) % balloonMats.length];
      const b = new THREE.Mesh(balloonG, m); b.scale.setScalar(rr); b.position.copy(tip).add(V3(0, rr * 1.2, 0));
      b.rotation.z = (tip.x) * 0.8; b.rotation.x = -(tip.z) * 0.8;
      const k = new THREE.Mesh(knotG, m); b.add(k);
      g.add(b);
      tips.push(V3(0, 0, 0), tip);
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tips), inkLine));
    const ph = seed * 1.7;
    updaters.push((t, wind) => { g.rotation.z = Math.sin(t * 1.3 * wind + ph) * 0.09; g.rotation.x = Math.sin(t * 1.05 * wind + ph * 1.3) * 0.07; });
    return g;
  };
  // 硬顶前角（船舱上方，作为远处背景，不挡钓鱼视线）
  bunch(V3(hw - 0.08, htTop, htZ1 - 0.12), 5, 0.2, 0.75, 3);
  bunch(V3(-hw + 0.08, htTop, htZ1 - 0.12), 4, 0.2, 0.7, 11);
  // 船头栏杆
  for (const sx of [-1, 1]) { const z = HULL.zb - 1.0; bunch(V3(sx * (halfBeamAtZ(z) - 0.1), gunwaleY(uOf(z)) + 0.3, z), 4, 0.19, 0.85, sx > 0 ? 5 : 8); }
  // DJ 台旁的小气球（硬顶下方，矮）
  bunch(V3(-1.5, deckYAtZ(-0.85) + 0.96, -0.85), 3, 0.15, 0.55, 17);

  // ---------- DJ 台 + 音箱（贴着船舱后壁左侧）----------
  const djZ = cabZ0 - 0.2, djX = -0.88, dy = deckYAtZ(djZ);
  const dj = new THREE.Group(); dj.position.set(djX, dy, djZ); party.add(dj);
  const faceTex = canvasTexP(256, 160, (g, w, h) => {
    // v1.2：暖灰褐面板 + 柔色圆角 EQ 条（不再是深紫底 + 霓虹条）
    g.fillStyle = SOFT.taupe; g.fillRect(0, 0, w, h);
    const cols = [SOFT.rose, SOFT.butter, SOFT.mint, SOFT.blue, SOFT.cream];
    for (let i = 0; i < 12; i++) { const bh = 20 + ((i * 37) % 70); g.fillStyle = cols[i % 5]; const x = 14 + i * 19, y = h - 14 - bh; g.beginPath(); g.roundRect ? g.roundRect(x, y, 13, bh, 6) : g.rect(x, y, 13, bh); g.fill(); }
    /* v0.8：去掉面板上的「DJ」字样 */
    g.fillStyle = SOFT.rose; g.beginPath(); g.arc(w - 36, 34, 16, 0, Math.PI * 2); g.fill();
  });
  const faceM = new THREE.MeshStandardMaterial({ map: faceTex, emissiveMap: faceTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.18, roughness: 0.7 });
  const desk = rbox(1.0, 0.8, 0.34, 0.15, M.white, 6); desk.position.set(0, 0.4, 0); dj.add(desk);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.55), faceM); face.position.set(0, 0.42, -0.172); face.rotation.y = Math.PI; dj.add(face);
  const top = rbox(1.06, 0.07, 0.42, 0.035, M.teak, 4); top.position.set(0, 0.82, 0); dj.add(top);
  const recM = new THREE.MeshStandardMaterial({ color: SOFT.ink, roughness: 0.6 });
  const decks = [];
  for (const x of [-0.27, 0.27]) {
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.025, 28), recM); plat.position.set(x, 0.86, 0); dj.add(plat);
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), x < 0 ? candyMats[1] : candyMats[2]); lab.position.set(0.05, 0, 0); plat.add(lab);
    decks.push(plat);
  }
  const mixer = rbox(0.16, 0.05, 0.22, 0.015, M.white, 2); mixer.position.set(0, 0.86, 0); dj.add(mixer);
  // 音箱塔（左） + 台上小音箱（右）
  const spkM = M.grape;
  const woofM = new THREE.MeshStandardMaterial({ color: SOFT.ink, roughness: 0.7 });
  const woofers = [];
  const speaker = (x, z, w, h, d, cones) => {
    const g = new THREE.Group(); g.position.set(x, dy, z); party.add(g);
    const body = rbox(w, h, d, Math.min(w, d) * 0.28, spkM, 5); body.position.y = h / 2; g.add(body);
    for (const [cy, cr] of cones) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(cr, cr * 0.2, 10, 28), M.white); ring.position.set(0, cy, -d / 2 - 0.005); g.add(ring);
      const cone = new THREE.Mesh(new THREE.SphereGeometry(cr * 0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), woofM); cone.rotation.x = -Math.PI / 2; cone.scale.set(1, 0.35, 1); cone.position.set(0, cy, -d / 2); g.add(cone);
      woofers.push(cone);
    }
    return g;
  };
  speaker(-1.6, djZ, 0.36, 0.98, 0.34, [[0.3, 0.12], [0.72, 0.08]]);
  const smallSpk = speaker(djX + 0.62, djZ, 0.22, 0.3, 0.2, [[0.15, 0.065]]); smallSpk.position.y = dy + 0.845; smallSpk.rotation.y = -0.25;
  updaters.push((t) => {
    const beat = t * 2.0, pulse = Math.exp(-(beat - Math.floor(beat)) * 7);
    for (const w of woofers) w.scale.y = 0.35 + pulse * 0.35;
    decks[0].rotation.y = t * 3.5; decks[1].rotation.y = -t * 3.0;
    faceM.emissiveIntensity = 0.14 + pulse * 0.16;
  });

  // ---------- 迪斯科球（硬顶下方旋转；光斑由 toon.js 在所有风格化材质上程序化叠加）----------
  const discoG = new THREE.IcosahedronGeometry(0.17, 2);   // 非索引几何：每个三角形一个小镜片
  { const n = discoG.attributes.position.count; const col = new Float32Array(n * 3); for (let f = 0; f < n / 3; f++) { const k = 0.7 + ((Math.sin(f * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.3; const tint = f % 7 === 0 ? [1.0, 0.86, 0.84] : f % 11 === 0 ? [0.86, 0.95, 0.92] : [1, 0.98, 0.95]; for (let v = 0; v < 3; v++) { col.set([k * tint[0], k * tint[1], k * tint[2]], (f * 3 + v) * 3); } } discoG.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  // v1.2：缎面银、低金属度、高粗糙度 → 柔和的碎光而不是刺眼镜面闪点；暖灰自发光代替紫色
  const discoM = new THREE.MeshStandardMaterial({ color: '#efe9e0', vertexColors: true, metalness: 0.5, roughness: 0.48, flatShading: true, emissive: new THREE.Color('#6a5e56'), emissiveIntensity: 0.25, envMapIntensity: 0.7 });
  const disco = new THREE.Mesh(discoG, discoM);
  const discoX = 0.1, discoZ = htZ0 + 0.55, discoY = htUnder - 0.36;
  disco.position.set(discoX, discoY, discoZ);
  disco.renderOrder = -5;        // 先于甲板绘制 → 本帧光斑 uniform 已更新
  disco.castShadow = false;
  party.add(disco);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, htUnder - discoY - 0.17, 4), M.chrome);
  chain.position.set(discoX, (htUnder + discoY + 0.17) / 2, discoZ); party.add(chain);
  const _m4 = new THREE.Matrix4();
  disco.onBeforeRender = (r, sc, cam) => {
    toonUniforms.uDiscoPos.value.setFromMatrixPosition(disco.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
    _m4.multiplyMatrices(cam.matrixWorldInverse, disco.matrixWorld);
    toonUniforms.uDiscoRot.value.setFromMatrix4(_m4).transpose();
  };
  let hooked = false;
  updaters.push((t) => {
    disco.rotation.y = t * 0.9;
    toonUniforms.uDisco.value.x = DISCO.strength;
    // 只在主场景渲染期间有效：渲染完成后关掉，避免缩略图/头像等离屏渲染沾上光斑
    if (!hooked) {
      let root = boat; while (root.parent) root = root.parent;
      if (root.isScene) {
        hooked = true;
        const prev = root.onAfterRender;
        root.onAfterRender = function (...args) { toonUniforms.uDisco.value.x = 0; if (prev) prev.apply(this, args); };
      }
    }
  });

  party.traverse((o) => { if (o.isMesh && o !== desk) { o.castShadow = false; o.receiveShadow = true; } });
  desk.castShadow = true;
  return {
    group: party,
    update(t, wind = 1) { for (const u of updaters) u(t, wind); },
  };
}
