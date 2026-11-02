// 海洋生物 v4 扩展包：新增 20 种程序化雕塑模型（与 marine.js 同一套 Sculpture / 截面样条 / 薄膜鳍体系）
// - 不改 marine.js 的任何既有 recipe；由 marine.js 调用 buildMarine2(helpers) 注册进 RECIPES
// - 体表花纹用「顶点色绘制」（paint）：虎鲸黑白斑、鲸鲨棋盘白点、海龟盾片、海鳝豹纹… 不额外增加 draw call
// - 坐标约定同 marine.js：鼻尖 +x、背 +y、体侧 ±z，雕塑最终归一化到 1.6 单位
import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const fract = (v) => v - Math.floor(v);
const hash = (i, j, k = 0) => fract(Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453);
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function vnoise(x, y, seed = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  const top = a + (b - a) * sx, bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}
// 细胞斑点：返回到最近斑点中心的归一化距离（<1 在斑内）
function cellSpot(u, v, cu, cv, r, seed = 0, jitter = 0.75) {
  const iu = Math.floor(u / cu), iv = Math.floor(v / cv);
  let best = 9;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const a = iu + di, b = iv + dj;
    const cx = (a + 0.5 + (hash(a, b, seed) - 0.5) * jitter) * cu, cy = (b + 0.5 + (hash(b, a, seed + 3) - 0.5) * jitter) * cv;
    const rr = r * (0.65 + 0.7 * hash(a, b, seed + 7));
    best = Math.min(best, Math.hypot((u - cx) / cu, (v - cy) / cv) / rr);
  }
  return best;
}
const C = (hex) => new THREE.Color(hex);

export function buildMarine2(H) {
  const { ringBand, fishTail, pairedFins, basicFish, sampleProfile } = H;
  void ringBand;

  // ---------- 通用工具 ----------
  // 体表 z（与 bodyGeometry 截面同公式：侧面超椭圆 + 背脊收窄）
  const surfZ = (p, x, y, k = 1.0) => {
    const [h, w] = sampleProfile(p, x);
    const t = Math.min(Math.abs(y) / Math.max(h, 1e-4), 0.999), c = Math.pow(t, 1 / 0.94), sn = Math.sqrt(1 - c * c);
    return Math.pow(sn, 0.86) * w * (1 - (y > 0 ? 0.14 * c * c * c : 0)) * k;
  };
  const topY = (p, x) => sampleProfile(p, x)[0];
  // 顶点色绘制：fn(x, y, z, rel=y/h, side=|z|/w, ang, cur) → THREE.Color | null
  function paint(mesh, p, fn) {
    const g = mesh.geometry, P = g.getAttribute('position'), CA = g.getAttribute('color');
    const cur = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const [h, w] = p ? sampleProfile(p, x) : [1, 1];
      cur.setRGB(CA.getX(i), CA.getY(i), CA.getZ(i));
      const r = fn(x, y, z, y / Math.max(h, 1e-4), Math.abs(z) / Math.max(w, 1e-4), Math.atan2(z, y), cur);
      if (r) CA.setXYZ(i, r.r, r.g, r.b);
    }
    CA.needsUpdate = true;
  }
  // 鳍片顶点色：给单色薄膜鳍加条纹/渐变（材质克隆 + vertexColors）
  function paintFin(mesh, fn) {
    const g = mesh.geometry, P = g.getAttribute('position'), n = P.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = fn(P.getX(i), P.getY(i)); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    mesh.material = mesh.material.clone(); mesh.material.vertexColors = true; mesh.material.color.set('#ffffff');
  }
  const mix = (a, b, t) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));
  // 压扁腹面（海龟/比目鱼：背拱腹平）
  function squashBelly(mesh, k) {
    const P = mesh.geometry.getAttribute('position');
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < 0) P.setY(i, y * k); }
    P.needsUpdate = true; mesh.geometry.computeVertexNormals();
  }
  // 沿背脊的鳍：上缘 = 背线 + hFn(t)，下缘埋进身体
  function ridgeFin(s, p, name, x0, x1, hFn, color, { bottom = false, n = 14, thick = 0.013, parent } = {}) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, top = topY(p, x); pts.push([x, (bottom ? -1 : 1) * (top + hFn(t))]); }
    for (let i = n; i >= 0; i--) { const x = x0 + (x1 - x0) * (i / n), top = topY(p, x); pts.push([x, (bottom ? -1 : 1) * (top - 0.035)]); }
    return s.fin(name, pts, color, [0, 0, 0], [0, 0, 0], parent || s.root, thick);
  }
  // 硬棘背鳍：棘尖与鳍膜缺口交替
  function spinyFin(s, p, name, x0, x1, n, tall, color, fall = 0.45) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t; pts.push([x, topY(p, x) + tall * (1 - fall * t) * (i % 2 ? 0.66 : 1) * (i === 0 ? 0.5 : 1)]); }
    for (let i = n; i >= 0; i--) { const x = x0 + (x1 - x0) * (i / n); pts.push([x, topY(p, x) - 0.035]); }
    const f = s.fin(name, pts, color);
    s.wiggle(f, 'x', 0.05, 2.4, 1.1);
    return f;
  }
  // 水平鳍（尾叶/胸鳍平铺）：轮廓 (x, y) → 模型 (x, 0, y)
  const hfin = (s, name, pts, color, pos, parent, thick = 0.045) => s.fin(name, pts, color, pos, [Math.PI / 2, 0, 0], parent || s.root, thick);
  // 体侧斑点（半埋在体表）
  function flankSpot(s, p, name, x, y, side, r, color, flat = 0.35, parent) {
    s.blob(name, [x, y, side * surfZ(p, x, y, 0.985)], [r, r * 0.92, r * flat], color, parent || s.root);
  }
  function gillSlits(s, x0, n, step, y, h, zf, color) {
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
      const x = x0 - i * step, z = zf(x);
      s.tube(`gill-${side}-${i}`, [[x + 0.006, y + h * 0.5, side * z * 0.97], [x - 0.008, y, side * z], [x + 0.004, y - h * 0.5, side * z * 0.97]], 0.0075, color, s.root, 5, 7);
    }
  }
  // 鲸类水平尾叶
  function flukes(s, x, color, span = 0.28, len = 0.2, belly = null) {
    const pivot = s.group('tail', [x, 0, 0]);
    const pts = [[0.05, 0], [-len * 0.35, span * 0.42], [-len * 0.8, span * 0.95], [-len, span], [-len * 0.86, span * 0.45], [-len * 0.66, 0.03], [-len * 0.72, 0], [-len * 0.66, -0.03], [-len * 0.86, -span * 0.45], [-len, -span], [-len * 0.8, -span * 0.95], [-len * 0.35, -span * 0.42]];
    hfin(s, 'tail-fluke', pts, color, [0, 0.004, 0], pivot, 0.05);
    if (belly) hfin(s, 'tail-fluke-belly', pts.map(([a, b]) => [a * 0.96, b * 0.96]), belly, [0, -0.012, 0], pivot, 0.04);
    s.wiggle(pivot, 'z', 0.08, 2.2);
    return pivot;
  }
  function tailFin(s, x, pts, color, thick = 0.013, amp = 0.06) {
    const pivot = s.group('tail', [x, 0, 0]);
    s.fin('tail-fluke', pts, color, [0, 0, 0], [0, 0, 0], pivot, thick);
    s.wiggle(pivot, 'y', amp, 3.2);
    return pivot;
  }
  function eyesOn(s, p, x, y, r, iris, k = 1.0) { s.eyes(x, y, surfZ(p, x, y, k), r, iris); }

  // ================= 常见 =================
  // 蝴蝶鱼：高盘形柠檬黄身体 + 过眼黑带 + 背鳍后部假眼斑 + 尖吻
  function butterflyfish(s) {
    const p = [[-0.5, 0.02, 0.012], [-0.45, 0.15, 0.035], [-0.32, 0.35, 0.07], [-0.08, 0.44, 0.088], [0.16, 0.4, 0.086], [0.34, 0.27, 0.068], [0.46, 0.14, 0.046], [0.53, 0.065, 0.03], [0.56, 0.032, 0.016]];
    const b = s.body('yellow-body', p, '#ffc928', '#fff1a8', 0.05);
    const black = C('#26222b'), white = C('#fffaf0'), amber = C('#f0a21c');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      const xb = x - y * 0.22;
      if (Math.abs(xb - 0.36) < 0.042 && rel > -0.8) return black;              // 过眼黑带
      if (Math.abs(xb - 0.27) < 0.034) return white;                             // 白色鳃后带
      if (xb < 0.2 && xb > -0.42 && side > 0.25) { const l = fract((x * 0.7 + y) * 9); if (l < 0.22) return mix(cur, amber, 0.55); }   // 斜细纹
      if (x < -0.36 && rel > -0.5) return mix(cur, black, sstep(-0.36, -0.46, x) * 0.85);   // 尾柄黑缘
      return null;
    });
    tailFin(s, -0.47, [[0.04, 0], [-0.13, 0.16], [-0.17, 0.13], [-0.18, 0], [-0.17, -0.13], [-0.13, -0.16]], '#fff0b0');
    const dors = [[0.3, 0.24], [0.2, 0.42], [0.02, 0.53], [-0.2, 0.55], [-0.38, 0.47], [-0.5, 0.3], [-0.5, 0.16], [-0.3, 0.26], [0, 0.36], [0.2, 0.26]];
    s.fin('dorsal-edge', dors, '#2b2a30');
    for (const side of [-1, 1]) s.fin(`dorsal-fin-${side}`, dors.map(([x, y]) => [x * 0.96, y * 0.95 + 0.01]), '#ffc21a', [0, 0, side * 0.004]);
    for (const side of [-1, 1]) {
      s.blob(`ocellus-ring-${side}`, [-0.33, 0.42, side * 0.009], [0.06, 0.06, 0.005], '#fffaf0');
      s.blob(`ocellus-spot-${side}`, [-0.33, 0.42, side * 0.012], [0.045, 0.045, 0.005], '#1d1a22');
    }
    const anal = [[0.12, -0.24], [-0.06, -0.42], [-0.28, -0.46], [-0.45, -0.32], [-0.49, -0.16], [-0.3, -0.2], [0, -0.3]];
    s.fin('anal-edge', anal, '#2b2a30');
    for (const side of [-1, 1]) s.fin(`anal-fin-${side}`, anal.map(([x, y]) => [x * 0.96, y * 0.95 - 0.01]), '#ffc21a', [0, 0, side * 0.004]);
    pairedFins(s, 0.22, -0.07, surfZ(p, 0.22, -0.07) * 0.95, '#fff3b8', 0.16, 0.1);
    s.fin('ventral-fin', [[0.2, -0.3], [0.06, -0.45], [0.0, -0.36]], '#fff0a0');
    s.tube('snout', [[0.5, -0.005, 0], [0.58, -0.012, 0], [0.65, -0.02, 0]], 0.022, '#fff3b6', s.root, 8, 8);
    eyesOn(s, p, 0.37, 0.11, 0.05, '#4a3b30');
    s.mouth(0.665, -0.025, 0.016, '#6b5034');
  }

  // 真鲷：粉红体色 + 宝蓝色亮点 + 硬棘背鳍 + 陡额头
  function seaBream(s) {
    const p = [[-0.78, 0.014, 0.012], [-0.64, 0.075, 0.038], [-0.42, 0.2, 0.085], [-0.12, 0.3, 0.115], [0.18, 0.325, 0.12], [0.42, 0.26, 0.1], [0.57, 0.16, 0.074], [0.67, 0.065, 0.036], [0.7, 0.026, 0.016]];
    basicFish(s, { back: '#e2425a', belly: '#ffe0d8', fin: '#f07a8c' }, p, [0.52, 0.07, surfZ(p, 0.52, 0.07)], 0.06, 'fork');
    const b = s.parts.body, blue = C('#4cc4f2'), rose = C('#ff9aa8');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      if (rel > -0.1 && rel < 0.85 && side > 0.3 && x < 0.42 && x > -0.6 && cellSpot(x, ang * 0.25, 0.055, 0.045, 0.24, 11) < 1) return blue;
      if (rel < -0.2) return mix(cur, rose, 0.25);
      return null;
    });
    spinyFin(s, p, 'spiny-dorsal', 0.36, -0.08, 12, 0.17, '#ee5f78');
    ridgeFin(s, p, 'soft-dorsal', -0.08, -0.5, (t) => 0.1 * Math.sin(Math.PI * (0.15 + t * 0.85)), '#ef7086');
    s.fin('anal-fin', [[-0.2, -0.2], [-0.32, -0.33], [-0.5, -0.2], [-0.56, -0.08]], '#f48b9a');
    s.fin('ventral-fin', [[0.28, -0.26], [0.12, -0.42], [0.06, -0.3]], '#f7a1ad');
  }

  // 牙鲆（比目鱼）：贴底的扁卵形 + 双眼长在同一面 + 一圈波浪缘鳍
  function flounder(s) {
    const p = [[-0.6, 0.008, 0.03], [-0.5, 0.03, 0.13], [-0.3, 0.06, 0.3], [0, 0.075, 0.36], [0.28, 0.07, 0.32], [0.46, 0.056, 0.22], [0.58, 0.036, 0.11], [0.63, 0.015, 0.03]];
    const b = s.body('flat-body', p, '#8a7352', '#f4efe4', 0.02);
    squashBelly(b, 0.7);
    const dark = C('#4e3e28'), light = C('#c9b48a'), ring = C('#2f2518');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      if (y <= 0) return null;
      const n = vnoise(x * 9, z * 9, 3);
      const o = cellSpot(x, z, 0.16, 0.16, 0.28, 5);
      if (o < 1 && o > 0.62) return ring;                     // 眼状环纹
      if (n > 0.66) return mix(cur, dark, 0.7);
      if (n < 0.28) return mix(cur, light, 0.6);
      return null;
    });
    for (const side of [-1, 1]) {
      const outer = [], inner = [];
      for (let i = 0; i <= 12; i++) {
        const x = 0.48 - i * 0.085, w = sampleProfile(p, x)[1];
        outer.push([x, side * (w + 0.03 + 0.07 * Math.sin((i / 12) * Math.PI))]);
        inner.push([x, side * w * 0.82]);
      }
      const fringe = hfin(s, `fringe-fin-${side}`, outer.concat(inner.reverse()), '#7a6446', [0, 0.01, 0], s.root, 0.012);
      paintFin(fringe, (x, y) => mix(C('#6d583c'), C('#a48d66'), 0.5 + 0.5 * Math.sin(x * 60)));
    }
    const tail = s.group('tail', [-0.58, 0, 0]);
    hfin(s, 'tail-fluke', [[0.05, 0], [-0.14, 0.12], [-0.2, 0.09], [-0.22, 0], [-0.2, -0.09], [-0.14, -0.12]], '#7a6446', [0, 0, 0], tail, 0.012);
    s.wiggle(tail, 'z', 0.12, 2.1);
    const topEye = (nm, x, z, r) => {
      const y = topY(p, x) * 0.9;
      s.blob(`${nm}-rim`, [x, y + r * 0.35, z], [r, r * 0.78, r], '#cdbb8a');
      s.blob(`${nm}-pupil`, [x + r * 0.12, y + r * 0.86, z], [r * 0.62, r * 0.32, r * 0.62], '#0a0f14');
      s.blob(`${nm}-glint`, [x + r * 0.3, y + r * 1.05, z + r * 0.12], [r * 0.15, r * 0.06, r * 0.15], '#ffffff');
    };
    topEye('eye-left', 0.43, -0.065, 0.04);
    topEye('eye-right', 0.37, 0.05, 0.04);
    s.tube('mouth', [[0.585, 0.004, -0.075], [0.63, -0.004, -0.02], [0.61, 0.002, 0.04]], 0.011, '#5a4630', s.root, 6, 10);
    s.tube('lateral-line', [[-0.5, 0.032, 0], [-0.1, 0.074, 0], [0.18, 0.08, 0.02], [0.26, 0.08, 0.08], [0.32, 0.07, 0.03]], 0.006, '#5e4b32', s.root, 5, 18);
    const pec = s.fin('pectoral-top', [[0.04, 0], [-0.12, 0.06], [-0.16, 0.0], [-0.1, -0.05]], '#8c7550', [0.27, 0.075, -0.12], [Math.PI / 2 - 0.2, 0, 0.1], s.root, 0.012);
    s.wiggle(pec, 'x', 0.1, 2.5);
  }

  // 海星：五条腕 + 中央盘 + 腕背瘤突
  function starfish(s) {
    const back = '#ef5f34', belly = '#ffc79a';
    const disc = s.blob('mantle', [0, 0.03, 0], [0.22, 0.085, 0.22], '#e7552e');
    void disc;
    s.blob('madreporite', [-0.06, 0.112, 0.05], [0.032, 0.008, 0.032], '#ffd23f');
    const cream = C('#ffe2bf'), deep = C('#c63b1f');
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      const g = s.group(`arm-${i}`, [0, 0, 0]);
      g.rotation.y = a;
      const ap = [[0.0, 0.08, 0.125], [0.18, 0.074, 0.11], [0.4, 0.056, 0.078], [0.58, 0.036, 0.047], [0.7, 0.019, 0.024], [0.745, 0.006, 0.008]];
      const arm = s.body(`arm-skin-${i}`, ap, back, belly, 0.02, g);
      squashBelly(arm, 0.45);
      paint(arm, ap, (x, y, z, rel, side, ang, cur) => {
        if (y <= 0) return null;
        if (Math.abs(z) < 0.022 && fract(x * 13) < 0.42 && x > 0.05) return cream;
        if (side > 0.55 && fract(x * 17 + 0.5) < 0.32) return mix(cur, cream, 0.55);
        if (Math.abs(z) < 0.05) return mix(cur, deep, 0.25);
        return null;
      });
      for (let k = 0; k < 4; k++) { const x = 0.16 + k * 0.13, hh = ap.reduce((m, q) => (q[0] <= x ? q : m))[1]; s.blob(`tubercle-${i}-${k}`, [x, hh * 0.92, 0], [0.022 - k * 0.003, 0.016, 0.022 - k * 0.003], '#ffd9b0', g); }
      s.wiggle(g, 'z', 0.07, 1.1, i * 1.3);
    }
  }

  // ================= 特别 =================
  // 海马：竖直身体 + 环节骨板 + 卷尾 + 管状吻 + 头冠
  function seahorse(s) {
    const body = '#f5a524', ringC = '#e08410', bellyC = '#ffd27a';
    s.blob('head', [0.07, 0.56, 0], [0.12, 0.095, 0.08], body).rotation.z = -0.35;
    s.tube('snout', [[0.14, 0.53, 0], [0.24, 0.505, 0], [0.33, 0.495, 0]], 0.03, body, s.root, 8, 8);
    s.blob('snout-tip', [0.335, 0.495, 0], [0.025, 0.034, 0.03], ringC);
    for (let i = 0; i < 4; i++) s.spike(`coronet-${i}`, [0.02 - i * 0.03, 0.62 - i * 0.01, 0], [0.0 - i * 0.035, 0.71 - i * 0.012, (i % 2 ? 1 : -1) * 0.012], 0.018, ringC);
    eyesOn(s, [[0, 0.1, 0.08], [0.2, 0.1, 0.08]], 0.1, 0.0, 0.032, '#ffdd88');
    for (const nm of ['eye-left', 'eye-right']) for (const suf of ['-orbit', '-rim', '-pupil', '-glint', '-glint2', '-cornea']) { const m = s.parts[nm + suf]; if (m) m.position.y += 0.575; }
    const spine = new THREE.CatmullRomCurve3([[0.0, 0.47], [-0.05, 0.38], [-0.04, 0.27], [0.0, 0.15], [0.02, 0.04], [0.0, -0.06], [-0.04, -0.15]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const rad = (t) => 0.06 + 0.06 * Math.sin(Math.min(1, t * 1.25) * Math.PI) ;
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const t = i / N, c = spine.getPointAt(t), tg = spine.getTangentAt(t), r = rad(t);
      const fwd = Math.sin(t * Math.PI) * 0.035;
      s.blob(`trunk-core-${i}`, [c.x + fwd, c.y, 0], [r * 0.98, r * 0.8, r * 0.8], i % 2 ? body : bellyC).quaternion.setFromUnitVectors(UP, tg);
      if (i % 2 === 0) s.blob(`trunk-ring-${i}`, [c.x + fwd * 0.9, c.y, 0], [r * 1.06, 0.022, r * 0.86], ringC).quaternion.setFromUnitVectors(UP, tg);
    }
    s.blob('belly-pouch', [0.06, 0.13, 0], [0.085, 0.15, 0.075], bellyC);
    const tail = s.group('tail', [-0.04, -0.15, 0]);
    const tc = new THREE.CatmullRomCurve3([[0, 0], [-0.03, -0.1], [-0.02, -0.2], [0.03, -0.28], [0.1, -0.3], [0.14, -0.25], [0.12, -0.19], [0.08, -0.18], [0.07, -0.22]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, c = tc.getPointAt(t), r = 0.058 * (1 - t) + 0.014;
      s.blob(`tail-seg-${i}`, [c.x, c.y, 0], [r, r * 0.95, r * 0.82], i % 2 ? ringC : body, tail);
    }
    s.wiggle(tail, 'z', 0.1, 1.2);
    const df = s.group('dorsal-pivot', [-0.07, 0.14, 0]);
    const fin = s.fin('dorsal-fin', [[0.02, 0.07], [-0.08, 0.1], [-0.12, 0.03], [-0.11, -0.06], [0.02, -0.06]], '#ffd890', [0, 0, 0], [0, 0, 0], df, 0.012);
    s.wiggle(df, 'y', 0.35, 9.0);
    void fin;
    for (const side of [-1, 1]) {
      const pf = s.fin(`pectoral-${side}`, [[0.02, 0], [-0.06, 0.04], [-0.07, -0.02]], '#ffd890', [0.0, 0.48, side * 0.065], [0, side * 0.6, 0], s.root, 0.012);
      s.wiggle(pf, 'y', 0.35, 8.0, side);
    }
    for (let i = 0; i < 6; i++) s.blob(`speck-${i}`, [0.07 - (i % 3) * 0.03, 0.32 - i * 0.07, (i % 2 ? 1 : -1) * 0.085], [0.012, 0.012, 0.006], '#fff4d6');
  }

  // 海月水母：半透明伞盖 + 四叶马蹄形生殖腺 + 口腕 + 细长触手
  function jellyfish(s) {
    const prof = [[0.0, 0.34], [0.12, 0.33], [0.24, 0.285], [0.33, 0.21], [0.4, 0.115], [0.44, 0.03], [0.452, -0.02], [0.435, -0.04], [0.37, -0.005], [0.25, 0.06], [0.1, 0.095], [0.0, 0.1]];
    const bell = s.mesh('mantle', new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48), '#bfd6f0');
    const bm = bell.material.clone(); bm.transparent = true; bm.opacity = 0.74; bm.side = THREE.DoubleSide; bm.emissive = C('#9cc8ff'); bm.emissiveIntensity = 0.26;   // v4.1：浅色背景下几乎隐身 → 提高不透明度 bm.roughness = 0.12; bell.material = bm;
    const rim = s.mesh('bell-rim', new THREE.TorusGeometry(0.445, 0.012, 8, 64), '#f2f8ff');
    rim.rotation.x = Math.PI / 2; rim.position.y = -0.025;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + Math.PI / 4;
      const g = s.mesh(`gonad-${i}`, new THREE.TorusGeometry(0.068, 0.02, 8, 20, Math.PI * 1.55), '#ff8cc0');
      g.position.set(Math.cos(a) * 0.14, 0.13, Math.sin(a) * 0.14);
      g.rotation.set(Math.PI / 2, 0, -a + Math.PI * 0.27);
      const gm = g.material.clone(); gm.emissive = C('#ff6fae'); gm.emissiveIntensity = 0.25; g.material = gm;
    }
    const tm = (m, o) => { const c = m.material.clone(); c.transparent = true; c.opacity = o; c.depthWrite = false; m.material = c; return m; };
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU;
      const arm = s.group(`oral-arm-${i}`, [0, 0.02, 0]);
      const ca = Math.cos(a), sa = Math.sin(a);
      tm(s.tube(`oral-arm-skin-${i}`, [[0, 0, 0], [ca * 0.05, -0.14, sa * 0.05], [ca * 0.02, -0.28, sa * 0.02], [ca * 0.07, -0.42, sa * 0.07], [ca * 0.04, -0.5, sa * 0.04]], 0.03, '#ffd4ea', arm, 8, 18), 0.78);
      tm(s.tube(`oral-frill-${i}`, [[ca * 0.02, -0.04, sa * 0.02], [ca * 0.08 - sa * 0.03, -0.18, sa * 0.08 + ca * 0.03], [ca * 0.05 + sa * 0.03, -0.32, sa * 0.05 - ca * 0.03], [ca * 0.09, -0.46, sa * 0.09]], 0.018, '#ffb8da', arm, 6, 16), 0.7);
      s.wiggle(arm, 'x', 0.08, 1.3, i * 1.6);
      s.wiggle(arm, 'z', 0.06, 1.1, i * 0.9);
    }
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * TAU, ca = Math.cos(a), sa = Math.sin(a), r = 0.43;
      const len = 0.42 + hash(i, 3) * 0.2;
      const t = tm(s.tube(`tentacle-${i}`, [[ca * r, -0.03, sa * r], [ca * (r - 0.03), -0.03 - len * 0.35, sa * (r - 0.03)], [ca * (r - 0.01) + sa * 0.03, -0.03 - len * 0.7, sa * (r - 0.01) - ca * 0.03], [ca * (r - 0.05), -0.03 - len, sa * (r - 0.05)]], 0.005, '#dde9f7', s.root, 5, 14), 0.8);
      void t;
    }
  }

  // 鹦嘴鱼：青绿体色 + 粉橙面纹 + 喙状齿板 + 新月尾
  function parrotfish(s) {
    const p = [[-0.74, 0.014, 0.012], [-0.62, 0.08, 0.045], [-0.4, 0.22, 0.11], [-0.08, 0.3, 0.15], [0.2, 0.31, 0.152], [0.42, 0.25, 0.13], [0.56, 0.17, 0.095], [0.63, 0.09, 0.055], [0.66, 0.045, 0.03]];
    basicFish(s, { back: '#16a596', belly: '#86e3cf', fin: '#e46aa8' }, p, [0.48, 0.085, surfZ(p, 0.48, 0.085)], 0.056, 'crescent');
    const b = s.parts.body, orange = C('#ff9455'), pink = C('#ff7fb6'), teal = C('#0d7f7a');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      if (x > 0.42 && fract((x * 0.9 - y * 0.9) * 13) < 0.38 && side > 0.25) return orange;   // 面部斜纹
      if (x < 0.42 && x > -0.6 && side > 0.35) { const sc = fract(x * 18 + Math.floor(y * 18) * 0.5); if (sc < 0.18) return mix(cur, pink, 0.55); }   // 鳞缘粉边
      if (rel > 0.75) return mix(cur, teal, 0.5);
      return null;
    });
    const dors = (t) => 0.11 * Math.sin(Math.PI * (0.1 + t * 0.9)) + 0.02;
    ridgeFin(s, p, 'dorsal-edge', 0.4, -0.5, (t) => dors(t) + 0.018, '#2b7fd0');
    ridgeFin(s, p, 'dorsal-fin', 0.39, -0.49, dors, '#ee6aa9', { thick: 0.016 });
    s.fin('anal-fin', [[-0.08, -0.26], [-0.2, -0.38], [-0.5, -0.22], [-0.55, -0.1]], '#ef72ad');
    s.blob('beak-top', [0.655, 0.005, 0], [0.05, 0.03, 0.044], '#e6fff5');
    s.blob('beak-bottom', [0.648, -0.044, 0], [0.044, 0.025, 0.04], '#c9f5e6');
    s.tube('beak-seam', [[0.64, -0.02, -0.04], [0.7, -0.02, 0], [0.64, -0.02, 0.04]], 0.006, '#7ab8a4', s.root, 5, 10);
  }

  // 狮子鱼：红白斑马纹 + 一排长毒棘 + 巨大扇形胸鳍
  function lionfish(s) {
    const p = [[-0.62, 0.014, 0.012], [-0.5, 0.08, 0.045], [-0.3, 0.2, 0.1], [0, 0.27, 0.13], [0.25, 0.27, 0.13], [0.45, 0.2, 0.1], [0.58, 0.11, 0.062], [0.62, 0.05, 0.03]];
    const b = s.body('striped-body', p, '#c8432f', '#ffe3d2', 0.04);
    const maroon = C('#7a1d18'), cream = C('#fff1e6');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      const f = fract((x + y * 0.28) * 10);
      if (rel < -0.55) return mix(cream, cur, 0.3);
      return f < 0.42 ? mix(cur, maroon, 0.75) : f < 0.52 ? cur : mix(cur, cream, 0.8);
    });
    fishTail(s, -0.5, '#f1d2c6', 'fan', 0.2, 0.22);
    for (let i = 0; i < 12; i++) {
      const x = 0.36 - i * 0.065, top = topY(p, x), L = 0.42 - i * 0.018;
      const tip = [x - 0.12 - i * 0.004, top + L, 0];
      s.tube(`venom-spine-${i}`, [[x, top - 0.02, 0], [x - 0.04, top + L * 0.5, 0], tip], 0.007, '#fbe9df', s.root, 5, 8);
      for (let k = 0; k < 2; k++) s.blob(`spine-band-${i}-${k}`, [x - 0.025 - k * 0.04, top + L * (0.3 + k * 0.32), 0], [0.012, 0.022, 0.012], '#b8352a');
    }
    ridgeFin(s, p, 'dorsal-membrane', 0.38, -0.44, (t) => 0.07 + 0.03 * Math.sin(t * 20), '#e7a99a');
    for (const side of [-1, 1]) {
      const pv = s.group(`pectoral-fan-${side}`, [0.3, -0.05, side * 0.12]);
      pv.rotation.set(side * 0.95, side * -0.45, 0);
      const outline = [[0.03, 0], [-0.1, 0.3], [-0.32, 0.42], [-0.56, 0.34], [-0.66, 0.06], [-0.6, -0.22], [-0.42, -0.36], [-0.16, -0.3]];
      const fan = s.fin(`pectoral-fin-${side}`, outline, '#f6c9b8', [0, 0, 0], [0, 0, 0], pv, 0.012);
      paintFin(fan, (x, y) => { const r = Math.hypot(x, y); return fract(r * 9) < 0.5 ? C('#c84a3a') : C('#fbe4d8'); });
      for (let k = 0; k < 7; k++) {
        const a = Math.PI * (0.62 + k * 0.105), L = 0.62 + (k % 2) * 0.06;
        s.tube(`pec-ray-${side}-${k}`, [[0, 0, 0.006], [Math.cos(a) * L * 0.5, Math.sin(a) * L * 0.5, 0.006], [Math.cos(a) * L, Math.sin(a) * L, 0.006]], 0.005, '#fff3ea', pv, 4, 6);
      }
      s.wiggle(pv, 'x', 0.09, 1.3, side);
      s.tube(`brow-tentacle-${side}`, [[0.5, 0.12, side * 0.05], [0.53, 0.2, side * 0.07], [0.5, 0.26, side * 0.06]], 0.008, '#f3d4c4', s.root, 5, 8);
    }
    s.fin('anal-fin', [[-0.18, -0.2], [-0.3, -0.34], [-0.46, -0.16]], '#f2c3b5');
    s.fin('ventral-fin', [[0.2, -0.22], [0.0, -0.42], [-0.04, -0.3]], '#e9a594');
    eyesOn(s, p, 0.47, 0.07, 0.05, '#ff9a6a');
    s.mouth(0.62, -0.025, 0.03, '#7a2a24');
  }

  // ================= 稀有 =================
  // 巨型海鳝：粗长身体 + 豹纹斑点 + 张开的獠牙大嘴 + 连续皮质鳍
  function morayEel(s) {
    const count = 30, p = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const h = 0.014 + 0.104 * Math.pow(Math.min(t / 0.42, 1), 0.75) * (1 - 0.12 * sstep(0.9, 1, t));
      p.push([-1.5 + t * 2.72, h, h * 0.72]);
    }
    const b = s.body('eel-body', p, '#86733a', '#c2ad66', 0.05);
    const blk = C('#2a2214');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      const d = cellSpot(x, ang * 0.09, 0.07, 0.045, 0.36, 17);
      if (d < 1) return mix(cur, blk, 0.9);
      if (rel < -0.6) return null;
      return mix(cur, C('#9c8642'), vnoise(x * 8, ang * 2, 2) * 0.5);
    });
    const hd = s.group('head', [0, 0, 0]);
    s.blob('head-top', [1.3, 0.025, 0], [0.2, 0.105, 0.082], '#8a7640', hd);
    s.blob('lower-jaw', [1.28, -0.07, 0], [0.18, 0.045, 0.068], '#b49c58', hd).rotation.z = -0.14;
    s.blob('mouth-cavity', [1.33, -0.03, 0], [0.13, 0.035, 0.058], '#3d1c18', hd);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = 1.42 - i * 0.05, z = side * (0.03 + i * 0.008);
      s.spike(`tooth-up-${side}-${i}`, [x, -0.008, z], [x + 0.008, -0.04, z], 0.008, '#fbf7ec', hd);
      s.spike(`tooth-low-${side}-${i}`, [x - 0.02, -0.058, z], [x - 0.012, -0.03, z], 0.007, '#fbf7ec', hd);
    }
    for (let i = 0; i < 6; i++) s.blob(`head-spot-${i}`, [1.18 + (i % 3) * 0.07, 0.06 + (i % 2) * 0.02, (i < 3 ? 1 : -1) * 0.07], [0.016, 0.014, 0.008], '#2a2214', hd);
    s.eyes(1.38, 0.06, 0.056, 0.026, '#f0d878');
    for (const side of [-1, 1]) {
      s.tube(`nostril-${side}`, [[1.47, 0.02, side * 0.02], [1.5, 0.045, side * 0.024]], 0.007, '#8a7640', s.root, 5, 3);
      s.blob(`gill-pore-${side}`, [1.08, 0.0, side * 0.078], [0.022, 0.016, 0.008], '#2b2316');
    }
    ridgeFin(s, p, 'dorsal-skin-fin', 1.05, -1.5, (t) => 0.045 + 0.01 * Math.sin(t * 3), '#6c5b2a', { n: 26, thick: 0.02 });
    ridgeFin(s, p, 'anal-skin-fin', -0.15, -1.5, () => 0.04, '#7a6830', { n: 16, bottom: true, thick: 0.02 });
    s.wiggle(hd, 'z', 0.035, 1.6);
  }

  // 鮟鱇：圆胖暗色身体 + 獠牙巨口 + 发光诱饵
  function anglerfish(s) {
    const p = [[-0.46, 0.02, 0.02], [-0.4, 0.12, 0.09], [-0.25, 0.27, 0.21], [-0.02, 0.34, 0.27], [0.2, 0.33, 0.27], [0.36, 0.26, 0.23], [0.44, 0.16, 0.18], [0.47, 0.07, 0.1]];
    const b = s.body('round-body', p, '#3d3448', '#5e5064', 0.04);
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      const n = vnoise(x * 10, ang * 3, 9);
      if (cellSpot(x, ang * 0.2, 0.06, 0.06, 0.18, 4) < 1) return mix(cur, C('#8d7f96'), 0.6);
      return mix(cur, C('#2a2232'), n * 0.6);
    });
    s.blob('lower-jaw', [0.42, -0.14, 0], [0.17, 0.085, 0.235], '#4a3f53').rotation.z = 0.28;
    s.blob('mouth-cavity', [0.47, -0.05, 0], [0.09, 0.075, 0.2], '#120a16');
    s.blob('upper-lip', [0.46, 0.05, 0], [0.085, 0.045, 0.21], '#463b4f');
    for (let i = 0; i < 9; i++) {
      const z = -0.17 + i * 0.0425, x = 0.55 - z * z * 1.6;
      s.spike(`fang-low-${i}`, [x - 0.01, -0.09, z], [x + 0.01, 0.03 + (i % 2) * 0.03, z * 0.9], 0.012, '#eaf3f6');
      if (i % 2 === 0) s.spike(`fang-up-${i}`, [x - 0.03, 0.05, z], [x - 0.01, -0.04, z * 0.92], 0.011, '#eaf3f6');
    }
    const lure = s.group('lure', [0.24, 0.31, 0]);
    s.tube('illicium', [[0, 0, 0], [0.12, 0.22, 0], [0.3, 0.3, 0], [0.42, 0.21, 0]], 0.011, '#4a4055', lure, 6, 18);
    const esca = s.blob('esca-light', [0.44, 0.18, 0], [0.045, 0.05, 0.045], '#d9fff9', lure);
    const em = esca.material.clone(); em.emissive = C('#7ff7ff'); em.emissiveIntensity = 2.2; em.roughness = 0.2; esca.material = em;
    const halo = s.blob('esca-halo', [0.44, 0.18, 0], [0.09, 0.09, 0.09], '#9ffcff', lure);
    const hm = halo.material.clone(); hm.transparent = true; hm.opacity = 0.22; hm.emissive = C('#7ff7ff'); hm.emissiveIntensity = 1.5; hm.depthWrite = false; halo.material = hm;
    s.wiggle(lure, 'z', 0.1, 1.5);
    s.wiggle(lure, 'y', 0.06, 1.1, 0.7);
    eyesOn(s, p, 0.3, 0.17, 0.034, '#c8d8e6', 0.98);
    tailFin(s, -0.42, [[0.04, 0], [-0.12, 0.13], [-0.18, 0.1], [-0.2, 0], [-0.18, -0.1], [-0.12, -0.13]], '#2f2838', 0.015, 0.1);
    pairedFins(s, 0.12, -0.12, surfZ(p, 0.12, -0.12) * 0.95, '#3b3245', 0.16, 0.12);
    s.fin('dorsal-fin', [[-0.12, 0.3], [-0.2, 0.42], [-0.34, 0.24]], '#342c3e');
    for (let i = 0; i < 7; i++) { const x = -0.2 + (i % 4) * 0.13, y = (i < 4 ? 0.12 : -0.08); flankSpot(s, p, `wart-${i}`, x, y, i % 2 ? 1 : -1, 0.02, '#6a5c72', 0.6); }
  }

  // 雀尾螳螂虾：荧光绿分节身体 + 红色锤状捕肢 + 柄眼 + 孔雀色尾扇
  function mantisShrimp(s) {
    s.blob('carapace', [0.22, 0.03, 0], [0.17, 0.08, 0.11], '#2fae63');
    s.blob('head-plate', [0.38, 0.03, 0], [0.075, 0.055, 0.075], '#3fbf72');
    for (let i = 0; i < 6; i++) {
      const x = 0.03 - i * 0.092;
      s.blob(`abdomen-${i}`, [x, 0.02 - i * 0.004, 0], [0.062, 0.085 - i * 0.004, 0.118 - i * 0.006], i % 2 ? '#2e9e5a' : '#3cc271');
      s.blob(`abdomen-stripe-${i}`, [x - 0.04, 0.03 - i * 0.004, 0], [0.012, 0.083 - i * 0.004, 0.115 - i * 0.006], '#e9f56a');
    }
    s.blob('telson', [-0.56, 0.005, 0], [0.07, 0.03, 0.07], '#3a8f6a');
    const tail = s.group('tail-fan', [-0.56, 0, 0]);
    for (const side of [-1, 1]) {
      const pts = [[0.04, 0], [-0.12, 0.04], [-0.2, 0.11], [-0.14, 0.17], [0.0, 0.1]].map(([x, y]) => [x, side * y]);
      const u = hfin(s, `uropod-${side}`, pts, '#2f7fd8', [0, 0, side * 0.02], tail, 0.02);
      paintFin(u, (x, y) => { const r = Math.hypot(x + 0.02, y); return r > 0.16 ? C('#ff4a4a') : r > 0.12 ? C('#ffb03a') : C('#2f6fd8'); });
      s.blob(`uropod-eye-${side}`, [-0.1, 0.012, side * 0.11], [0.022, 0.006, 0.022], '#1b2a6a', tail);
    }
    s.wiggle(tail, 'z', 0.08, 2.4);
    for (const side of [-1, 1]) {
      const claw = s.group(`claw-${side}`, [0.38, -0.05, side * 0.055]);
      s.tube(`raptorial-arm-${side}`, [[0, 0, 0], [0.08, -0.05, side * 0.03], [0.03, -0.11, side * 0.05]], 0.024, '#ff5d73', claw, 7, 8);
      s.blob(`dactyl-club-${side}`, [0.065, -0.115, side * 0.055], [0.042, 0.03, 0.03], '#ff8a5c', claw);
      s.blob(`club-spot-${side}`, [0.09, -0.11, side * 0.07], [0.01, 0.01, 0.006], '#fff7e0', claw);
      s.wiggle(claw, 'z', 0.15, 2.2, side);
      const stalk = s.group(`eyestalk-${side}`, [0.43, 0.06, side * 0.03]);
      s.tube(`eyestalk-skin-${side}`, [[0, 0, 0], [0.04, 0.08, side * 0.02]], 0.013, '#5ec98f', stalk, 6, 3);
      s.blob(`eye-${side}`, [0.045, 0.1, side * 0.025], [0.032, 0.024, 0.028], '#6fa79a', stalk);
      s.blob(`eye-band-${side}`, [0.045, 0.1, side * 0.025], [0.034, 0.006, 0.03], '#23423b', stalk);
      s.wiggle(stalk, 'x', 0.14, 1.8, side * 2);
      const sc = hfin(s, `antennal-scale-${side}`, [[0.02, 0], [0.12, side * 0.03], [0.14, side * 0.07], [0.06, side * 0.06]], '#ff9b4a', [0.42, 0.0, side * 0.04], s.root, 0.012);
      s.wiggle(sc, 'x', 0.08, 2.6, side);
      s.tube(`antenna-${side}`, [[0.45, 0.04, side * 0.02], [0.6, 0.1, side * 0.05], [0.72, 0.12, side * 0.08]], 0.0055, '#ff8a6a', s.root, 4, 10);
      for (let i = 0; i < 3; i++) s.tube(`leg-shell-${side}-${i}`, [[0.2 - i * 0.06, -0.06, side * 0.06], [0.19 - i * 0.06, -0.12, side * 0.1], [0.17 - i * 0.06, -0.16, side * 0.11]], 0.009, '#ff8b3d', s.root, 5, 5);
      for (let i = 0; i < 5; i++) s.blob(`swimmeret-${side}-${i}`, [0.0 - i * 0.09, -0.07, side * 0.05], [0.025, 0.012, 0.018], '#ff9e5a');
    }
  }

  // 大魣（梭子鱼）：细长银身 + 深色斜斑 + 地包天獠牙下颌 + 两枚分离背鳍
  function barracuda(s) {
    const p = [[-0.95, 0.012, 0.01], [-0.8, 0.05, 0.035], [-0.55, 0.1, 0.07], [-0.2, 0.122, 0.085], [0.2, 0.12, 0.084], [0.5, 0.095, 0.07], [0.72, 0.056, 0.043], [0.85, 0.022, 0.018]];
    basicFish(s, { back: '#536b79', belly: '#eef3f3', fin: '#5c6f7a' }, p, [0.6, 0.032, surfZ(p, 0.6, 0.032)], 0.048, 'fork');
    const b = s.parts.body, bar = C('#2f3d48'), blk = C('#14191d');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      if (rel > -0.05 && x < 0.38 && x > -0.72 && fract(x * 9.5 - rel * 0.35) < 0.34) return mix(cur, bar, 0.75);
      if (rel < -0.1 && rel > -0.7 && x < -0.1 && x > -0.75 && cellSpot(x, ang * 0.08, 0.07, 0.04, 0.2, 21) < 1) return blk;
      return null;
    });
    s.fin('dorsal-fin', [[0.12, 0.1], [0.04, 0.24], [-0.06, 0.22], [-0.12, 0.1]], '#4c5f6b');
    s.fin('rear-dorsal', [[-0.4, 0.08], [-0.46, 0.2], [-0.56, 0.06]], '#4c5f6b');
    s.fin('anal-fin', [[-0.42, -0.07], [-0.48, -0.18], [-0.58, -0.05]], '#8fa1aa');
    s.spike('lower-jaw', [0.76, -0.03, 0], [0.97, -0.012, 0], 0.03, '#d4dde0');
    for (let i = 0; i < 4; i++) {
      const x = 0.8 + i * 0.035;
      for (const side of [-1, 1]) s.spike(`fang-${side}-${i}`, [x, -0.01, side * 0.016], [x + 0.005, i % 2 ? -0.035 : -0.045, side * 0.016], 0.006, '#fbfbf5');
    }
  }

  // ================= 史诗 =================
  // 绿海龟：盾片拱形背甲（顶点色 Voronoi 盾纹）+ 平腹甲 + 桨状前肢 + 鹰喙
  function seaTurtle(s) {
    const p = [[-0.48, 0.012, 0.05], [-0.4, 0.08, 0.22], [-0.2, 0.15, 0.345], [0.05, 0.17, 0.38], [0.28, 0.14, 0.33], [0.42, 0.08, 0.22], [0.48, 0.02, 0.08]];
    const shell = s.body('carapace', p, '#6e5a32', '#ecdcaa', 0.03);
    squashBelly(shell, 0.42);
    const seeds = [];
    for (let i = 0; i < 5; i++) seeds.push([0.3 - i * 0.15, 0]);
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) seeds.push([0.22 - i * 0.15, sd * 0.2]);
    const seam = C('#3a2c15'), lite = C('#a58b4a'), darkS = C('#5d4a26'), olive = C('#7a6a35');
    paint(shell, p, (x, y, z, rel, side, ang, cur) => {
      if (y < 0) { const sx = fract(x * 6.5); return sx < 0.06 || Math.abs(z) < 0.008 ? C('#c9b680') : null; }
      if (side > 0.86) { const m = fract((x + 0.5) * 9); return mix(mix(darkS, olive, 0.55), seam, 0.6 * sstep(0.14, 0.0, m)); }   // 缘盾
      let d1 = 9, d2 = 9, bi = 0;
      for (let i = 0; i < seeds.length; i++) { const d = Math.hypot(x - seeds[i][0], z - seeds[i][1]); if (d < d1) { d2 = d1; d1 = d; bi = i; } else if (d < d2) d2 = d; }
      // v4.1 QA：盾片缝改软边、放射纹减弱（原先高对比像粗糙石头）
      const sd = seeds[bi], a = Math.atan2(z - sd[1], x - sd[0]);
      const ray = 0.5 + 0.5 * Math.sin(a * 5 + bi);
      const base = mix(mix(darkS, lite, 0.35 + ray * 0.35), olive, sstep(0.0, 0.12, d1) * 0.35);
      return mix(seam, base, 0.35 + 0.65 * sstep(0.008, 0.03, d2 - d1));
    });
    const skin = '#7c8a56';
    // v4.1 QA：头部放大 ~1.2×（原先头太小、颈部突兀）
    s.blob('neck', [0.47, 0.012, 0], [0.13, 0.078, 0.09], skin);
    s.blob('head', [0.63, 0.04, 0], [0.155, 0.1, 0.104], skin);
    s.blob('beak', [0.765, 0.004, 0], [0.058, 0.05, 0.054], '#5c5636');
    for (let i = 0; i < 5; i++) s.blob(`head-scale-${i}`, [0.59 + (i % 3) * 0.052, 0.128, (i - 2) * 0.034], [0.03, 0.011, 0.025], '#5b4a2a');
    s.eyes(0.685, 0.07, 0.083, 0.033, '#3a2b1a');
    s.mouth(0.785, -0.026, 0.035, '#3d3a24');
    const flip = (x, y, z) => C('#6e7b49').lerp(C('#a8b07a'), 0.1 + 0.6 * sstep(0.5, 0.75, vnoise(x * 14, y * 14, 6)));
    for (const side of [-1, 1]) {
      const fp = s.group(`flipper-front-${side}`, [0.26, -0.01, side * 0.3]);
      const pts = [[0.06, 0], [0.04, 0.1], [-0.06, 0.3], [-0.2, 0.5], [-0.3, 0.56], [-0.27, 0.44], [-0.15, 0.2], [-0.06, 0.02]].map(([x, y]) => [x, side * y]);
      const f = hfin(s, `flipper-skin-front-${side}`, pts, '#7c8a56', [0, 0, 0], fp, 0.045);
      paintFin(f, flip);
      s.wiggle(fp, 'x', side * 0.32, 1.3);
      s.wiggle(fp, 'y', 0.12, 1.3, 1.2);
      const rp = s.group(`flipper-rear-${side}`, [-0.36, -0.02, side * 0.2]);
      const rpts = [[0.04, 0], [-0.04, 0.1], [-0.14, 0.16], [-0.18, 0.1], [-0.08, 0.0]].map(([x, y]) => [x, side * y]);
      paintFin(hfin(s, `flipper-skin-rear-${side}`, rpts, '#7c8a56', [0, 0, 0], rp, 0.04), flip);
      s.wiggle(rp, 'y', 0.15, 1.3, side);
    }
    s.spike('tail', [-0.44, -0.01, 0], [-0.56, -0.02, 0], 0.03, skin);
  }

  // 宽吻海豚：反荫蔽灰色 + 瓜状额隆 + 短喙 + 镰刀背鳍 + 水平尾叶（上下摆动）
  function dolphin(s) {
    const p = [[-0.92, 0.018, 0.016], [-0.8, 0.05, 0.04], [-0.6, 0.12, 0.1], [-0.3, 0.2, 0.17], [0.05, 0.23, 0.2], [0.35, 0.2, 0.18], [0.52, 0.15, 0.13], [0.6, 0.11, 0.1], [0.64, 0.07, 0.065]];
    const b = s.body('dolphin-body', p, '#7f93a5', '#eef2f3', 0.02);
    const cape = C('#56687a'), flank = C('#8b9dae'), belly = C('#f0f3f4');
    paint(b, p, (x, y, z, rel) => {
      const edge = -0.2 + 0.18 * Math.sin((x + 0.3) * 4.2);
      const t = sstep(edge - 0.08, edge + 0.08, rel);
      let c = mix(belly, flank, t);
      c = mix(c, cape, sstep(0.45, 0.75, rel) * (x < 0.5 ? 1 : 0.6));
      return c;
    });
    s.blob('melon', [0.56, 0.035, 0], [0.13, 0.12, 0.115], '#7f93a5');
    s.blob('rostrum', [0.72, -0.035, 0], [0.13, 0.04, 0.046], '#8b9dae');
    s.blob('lower-jaw', [0.71, -0.06, 0], [0.13, 0.03, 0.044], '#e8eef0');
    s.tube('smile', [[0.6, -0.05, -0.07], [0.7, -0.052, -0.04], [0.84, -0.045, 0], [0.7, -0.052, 0.04], [0.6, -0.05, 0.07]], 0.006, '#4a5866', s.root, 5, 16);
    eyesOn(s, p, 0.53, 0.0, 0.026, '#3a2a20', 1.0);
    s.blob('blowhole', [0.4, topY(p, 0.4) * 0.99, 0], [0.018, 0.006, 0.03], '#2b3540');
    s.fin('dorsal-fin', [[0.12, 0], [0.02, 0.16], [-0.1, 0.3], [-0.17, 0.31], [-0.14, 0.2], [-0.16, 0.0]], '#5a6c7e', [-0.05, 0.19, 0], [0, 0, 0], s.root, 0.045);
    for (const side of [-1, 1]) {
      const pv = s.group(`pectoral-${side}`, [0.3, -0.11, side * 0.15]);
      pv.rotation.set(side * 0.75, 0, -0.3);
      s.fin(`pectoral-flipper-${side}`, [[0.04, 0], [-0.04, -0.07], [-0.18, -0.17], [-0.23, -0.16], [-0.12, -0.03]], '#6d8092', [0, 0, 0], [0, 0, 0], pv, 0.042);
      s.wiggle(pv, 'x', side * 0.08, 1.4);
    }
    flukes(s, -0.9, '#5d6f81', 0.28, 0.2);
  }

  // 龙趸（巨石斑）：敦实粗壮 + 斑驳迷彩 + 厚唇大嘴 + 黄斑圆尾
  function giantGrouper(s) {
    const p = [[-0.74, 0.02, 0.02], [-0.62, 0.1, 0.07], [-0.4, 0.26, 0.18], [-0.08, 0.34, 0.24], [0.24, 0.34, 0.24], [0.46, 0.27, 0.21], [0.6, 0.18, 0.15], [0.68, 0.1, 0.09], [0.71, 0.05, 0.05]];
    basicFish(s, { back: '#5a5440', belly: '#d8cba0', fin: '#c8ad6a' }, p, [0.54, 0.1, surfZ(p, 0.54, 0.1)], 0.045, 'fan');
    const b = s.parts.body, dark = C('#2c291f'), pale = C('#b0a378'), gold = C('#cdb36e');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      const n = vnoise(x * 6.5, ang * 1.6 + 3, 12);
      if (rel < -0.5) return null;
      if (n > 0.64) return mix(cur, dark, 0.8);
      if (n < 0.3) return mix(cur, pale, 0.6);
      if (cellSpot(x, ang * 0.2, 0.06, 0.05, 0.16, 8) < 1) return mix(cur, gold, 0.5);
      return null;
    });
    spinyFin(s, p, 'spiny-dorsal', 0.4, -0.05, 10, 0.12, '#4b4532', 0.3);
    ridgeFin(s, p, 'soft-dorsal', -0.05, -0.56, (t) => 0.13 * Math.sin(Math.PI * (0.2 + t * 0.8)), '#c6a964');
    s.fin('anal-fin', [[-0.25, -0.26], [-0.36, -0.42], [-0.52, -0.36], [-0.56, -0.2]], '#c8aa66');
    s.fin('ventral-fin', [[0.3, -0.3], [0.14, -0.46], [0.08, -0.34]], '#c2a462');
    s.blob('lower-lip', [0.7, -0.075, 0], [0.085, 0.05, 0.12], '#cbbd90');
    s.blob('upper-lip', [0.71, -0.01, 0], [0.07, 0.035, 0.11], '#6b634a');
    // v4.1 QA：鳍斑原先用固定 y（0.4 / -0.33）→ 悬浮在背鳍外 / 臀鳍外；改为贴在鳍膜内（两面各一颗）
    const dH = (t) => 0.13 * Math.sin(Math.PI * (0.2 + t * 0.8));
    for (let i = 0; i < 4; i++) {
      const t = 0.18 + i * 0.2, x = -0.05 + (-0.56 + 0.05) * t, y = topY(p, x) + dH(t) * 0.5;
      for (const sd of [-1, 1]) s.blob(`fin-spot-d${i}-${sd}`, [x, y, sd * 0.009], [0.016, 0.016, 0.005], '#3a3526');
    }
    for (const [i, x, y] of [[0, -0.33, -0.31], [1, -0.43, -0.33], [2, -0.5, -0.27]]) for (const sd of [-1, 1]) s.blob(`fin-spot-a${i}-${sd}`, [x, y, sd * 0.009], [0.016, 0.016, 0.005], '#3a3526');
  }

  // 腔棘鱼：深钢蓝 + 白色斑块 + 肉质叶状鳍（像四条小腿）+ 三叶尾
  function coelacanth(s) {
    const p = [[-0.82, 0.02, 0.02], [-0.7, 0.1, 0.07], [-0.45, 0.24, 0.15], [-0.1, 0.3, 0.19], [0.25, 0.285, 0.18], [0.5, 0.2, 0.14], [0.66, 0.11, 0.08], [0.72, 0.05, 0.04]];
    const b = s.body('armored-body', p, '#24476b', '#3d6488', 0.08);
    const white = C('#d9e8f2');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      // v4.1 QA：去掉高频噪声裁切（顶点分辨率下呈方块），斑块改软边
      const d = cellSpot(x, ang * 0.15, 0.19, 0.13, 0.3, 31);
      const k = sstep(1.1, 0.65, d);
      return k > 0.01 ? mix(cur, white, 0.62 * k) : null;
    });
    const tail = s.group('tail', [-0.8, 0, 0]);
    s.fin('tail-fluke', [[0.05, 0], [-0.08, 0.24], [-0.18, 0.3], [-0.23, 0.16], [-0.32, 0.045], [-0.42, 0.05], [-0.45, 0], [-0.42, -0.05], [-0.32, -0.045], [-0.23, -0.16], [-0.18, -0.3], [-0.08, -0.24]], '#2a4f75', [0, 0, 0], [0, 0, 0], tail, 0.016);
    s.wiggle(tail, 'y', 0.06, 2.4);
    s.fin('first-dorsal', [[0.12, 0.26], [0.06, 0.52], [-0.04, 0.5], [-0.1, 0.27]], '#2b5078');
    const lobe = (nm, pos, rot, L, phase) => {
      const pv = s.group(nm, pos);
      pv.rotation.set(...rot);
      s.blob(`${nm}-stalk`, [-L * 0.38, 0, 0], [L * 0.45, 0.042, 0.032], '#2a4c70', pv);
      s.fin(`${nm}-fin`, [[0.02, 0], [-L * 0.32, 0.08], [-L * 0.5, 0.06], [-L * 0.55, 0], [-L * 0.5, -0.06], [-L * 0.32, -0.08]], '#355d86', [-L * 0.62, 0, 0], [0, 0, 0], pv, 0.014);
      s.wiggle(pv, 'y', 0.22, 1.5, phase);
      return pv;
    };
    lobe('second-dorsal', [-0.3, 0.24, 0], [0, 0, -0.35], 0.3, 0.4);
    lobe('anal-lobe', [-0.3, -0.24, 0], [0, 0, 0.35], 0.3, 2.0);
    for (const side of [-1, 1]) {
      lobe(`pectoral-lobe-${side}`, [0.3, -0.1, side * 0.15], [side * 0.6, side * -0.35, 0.2], 0.32, side > 0 ? 0 : Math.PI);
      lobe(`pelvic-lobe-${side}`, [-0.05, -0.25, side * 0.08], [side * 0.9, side * -0.3, 0.3], 0.26, side > 0 ? Math.PI : 0);
    }
    eyesOn(s, p, 0.55, 0.06, 0.05, '#a8e6a0');
    s.mouth(0.725, -0.03, 0.04, '#1a3048');
    s.gills(0.42, 0.0, surfZ(p, 0.42, 0), 0.13, '#1c3a58');
  }

  // ================= 传说 =================
  // 大白鲨：利落的反荫蔽分界 + 巨型三角背鳍 + 新月尾 + 五道鳃裂 + 一排白牙
  function greatWhite(s) {
    const p = [[-0.95, 0.015, 0.012], [-0.8, 0.06, 0.05], [-0.55, 0.15, 0.13], [-0.22, 0.24, 0.21], [0.12, 0.27, 0.235], [0.42, 0.22, 0.19], [0.62, 0.14, 0.12], [0.76, 0.07, 0.06], [0.82, 0.03, 0.025]];
    const b = s.body('shark-body', p, '#66717b', '#f4f4f0', 0.04);
    const top = C('#545f69'), gray = C('#6e7983'), white = C('#f3f3ee');
    paint(b, p, (x, y, z, rel) => {
      const edge = -0.08 + 0.1 * Math.sin(x * 9) + 0.05 * Math.sin(x * 23);
      return mix(white, mix(gray, top, sstep(0.3, 0.9, rel)), sstep(edge - 0.035, edge + 0.035, rel));
    });
    gillSlits(s, 0.5, 5, 0.04, -0.01, 0.13, (x) => surfZ(p, x, -0.01), '#3c454d');
    s.fin('dorsal-fin', [[0.14, 0], [0.02, 0.2], [-0.08, 0.36], [-0.15, 0.37], [-0.14, 0.2], [-0.24, 0.0]], '#5a6570', [0.08, 0.22, 0], [0, 0, 0], s.root, 0.04);
    s.fin('second-dorsal', [[-0.56, 0.1], [-0.6, 0.17], [-0.66, 0.08]], '#5a6570');
    s.fin('anal-fin', [[-0.58, -0.08], [-0.62, -0.15], [-0.68, -0.06]], '#7d8790');
    s.fin('pelvic-fins', [[-0.32, -0.16], [-0.44, -0.26], [-0.48, -0.12]], '#c9cdcf');
    for (const side of [-1, 1]) {
      const fin = s.fin(`pectoral-${side}`, [[0.05, 0], [-0.1, 0.18], [-0.36, 0.42], [-0.43, 0.42], [-0.3, 0.05]], '#5d6873', [0.3, -0.14, side * 0.17], [side * (Math.PI / 2 + 0.42), 0, 0], s.root, 0.04);
      s.wiggle(fin, 'x', 0.05, 1.8, side);
      s.blob(`caudal-keel-${side}`, [-0.82, 0, side * 0.035], [0.08, 0.02, 0.02], '#5a6570');
    }
    tailFin(s, -0.92, [[0.06, 0], [-0.14, 0.25], [-0.32, 0.5], [-0.38, 0.52], [-0.3, 0.25], [-0.2, 0.04], [-0.28, -0.2], [-0.33, -0.4], [-0.27, -0.39], [-0.12, -0.18]], '#5a6570', 0.04, 0.07);
    s.eyes(0.62, 0.05, surfZ(p, 0.62, 0.05), 0.03, '#101418');
    s.tube('smile', [[0.6, -0.11, -0.1], [0.68, -0.115, -0.06], [0.74, -0.105, 0], [0.68, -0.115, 0.06], [0.6, -0.11, 0.1]], 0.012, '#30383f', s.root, 6, 16);
    for (let i = 0; i < 9; i++) {
      const t = (i - 4) / 4, x = 0.735 - t * t * 0.12, z = t * 0.085;
      s.spike(`tooth-${i}`, [x, -0.098, z], [x + 0.004, -0.125, z * 1.02], 0.008, '#ffffff');
    }
    for (const side of [-1, 1]) s.blob(`nostril-${side}`, [0.76, -0.04, side * 0.04], [0.012, 0.006, 0.012], '#3c454d');
  }

  // 虎鲸：黑白分明（眼斑 / 白腹 / 侧白斑 / 灰色鞍斑）+ 高耸背鳍 + 桨状胸鳍
  function orca(s) {
    const p = [[-0.92, 0.02, 0.018], [-0.8, 0.06, 0.05], [-0.58, 0.17, 0.14], [-0.25, 0.27, 0.23], [0.1, 0.29, 0.25], [0.4, 0.25, 0.22], [0.58, 0.17, 0.16], [0.68, 0.1, 0.1], [0.72, 0.045, 0.045]];
    const b = s.body('orca-body', p, '#121418', '#1a1d22', 0.02);
    const black = C('#1d2126'), white = C('#f1f1ea'), gray = C('#8e949b');
    // v4.1 QA：硬阈值在 40 段截面上出现锯齿方块 → 全部改为 smoothstep 软边遮罩（边宽 ≈ 1~2 个顶点）
    paint(b, p, (x, y, z, rel, side) => {
      const e = (cx, cy, rx, ry) => Math.sqrt(((x - cx) / rx) ** 2 + ((rel - cy) / ry) ** 2);
      const eye = sstep(1.18, 0.82, e(0.42, 0.34, 0.11, 0.17)) * sstep(0.3, 0.5, side);              // 眼斑
      const belly = sstep(-0.3, -0.46, rel) * sstep(-0.4, -0.26, x) * sstep(0.7, 0.6, x);              // 白腹 + 下巴
      const flank = sstep(1.15, 0.85, e(-0.42, -0.25, 0.2, 0.42)) * sstep(0.22, 0.42, side);           // 侧后白斑
      const saddle = sstep(0.68, 0.86, rel) * sstep(-0.48, -0.36, x) * sstep(0.04, -0.06, x);         // 灰色鞍斑
      const base = mix(black, gray, saddle * 0.85);
      return mix(base, white, Math.max(eye, belly, flank));
    });
    s.fin('dorsal-fin', [[0.1, 0], [0.02, 0.3], [-0.03, 0.55], [-0.07, 0.57], [-0.1, 0.3], [-0.2, 0.0]], '#141619', [-0.05, 0.27, 0], [0, 0, 0], s.root, 0.045);
    for (const side of [-1, 1]) {
      const pv = s.group(`pectoral-${side}`, [0.36, -0.17, side * 0.18]);
      pv.rotation.set(side * 0.65, 0, -0.25);
      s.fin(`pectoral-paddle-${side}`, [[0.04, 0], [-0.02, -0.12], [-0.12, -0.24], [-0.22, -0.26], [-0.24, -0.18], [-0.14, -0.04]], '#141619', [0, 0, 0], [0, 0, 0], pv, 0.045);
      s.wiggle(pv, 'x', side * 0.07, 1.1);
    }
    flukes(s, -0.9, '#141619', 0.3, 0.22, '#e9ebe6');
    eyesOn(s, p, 0.52, 0.02, 0.022, '#2a2a2a', 1.0);
  }

  // 独角鲸：灰白斑驳 + 螺旋长牙 + 无背鳍（背脊线）+ 扇形尾叶
  function narwhal(s) {
    const p = [[-0.9, 0.02, 0.018], [-0.76, 0.065, 0.055], [-0.5, 0.17, 0.15], [-0.1, 0.22, 0.2], [0.25, 0.21, 0.19], [0.48, 0.16, 0.15], [0.6, 0.1, 0.1], [0.65, 0.04, 0.04]];
    const b = s.body('narwhal-body', p, '#8c969c', '#eef1f1', 0.02);
    const dark = C('#3b4349');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      const dens = sstep(-0.5, 0.6, rel);
      const d = cellSpot(x, ang * 0.12, 0.05, 0.035, 0.33 * dens + 0.05, 41);
      if (d < 1) return mix(cur, dark, 0.85);
      if (rel > 0.5) return mix(cur, dark, 0.35);
      return null;
    });
    s.blob('melon', [0.56, 0.025, 0], [0.11, 0.1, 0.1], '#8f999f');
    s.tube('dorsal-ridge', [[-0.55, topY(p, -0.55) * 0.98, 0], [-0.3, topY(p, -0.3) * 1.0, 0], [-0.1, topY(p, -0.1) * 0.99, 0]], 0.012, '#6f797f', s.root, 5, 14);
    const tusk = s.spike('tusk', [0.62, -0.005, 0.03], [1.62, 0.06, 0.07], 0.036, '#efe6cf');
    void tusk;
    const helix = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * TAU * 7, r = 0.034 * (1 - t) + 0.003;
      helix.push([0.62 + t * 1.0, -0.005 + t * 0.065 + Math.cos(a) * r, 0.03 + t * 0.04 + Math.sin(a) * r]);
    }
    s.tube('tusk-spiral', helix, 0.0045, '#cbbf9f', s.root, 4, 60);
    for (const side of [-1, 1]) {
      const pv = s.group(`pectoral-${side}`, [0.36, -0.12, side * 0.14]);
      pv.rotation.set(side * 0.7, 0, -0.1);
      s.fin(`pectoral-flipper-${side}`, [[0.04, 0], [-0.02, -0.07], [-0.12, -0.13], [-0.16, -0.08], [-0.1, -0.02]], '#7c868c', [0, 0, 0], [0, 0, 0], pv, 0.042);
      s.wiggle(pv, 'x', side * 0.08, 1.2);
    }
    const tail = s.group('tail', [-0.88, 0, 0]);
    hfin(s, 'tail-fluke', [[0.05, 0], [-0.08, 0.14], [-0.18, 0.27], [-0.24, 0.26], [-0.25, 0.12], [-0.2, 0.02], [-0.2, -0.02], [-0.25, -0.12], [-0.24, -0.26], [-0.18, -0.27], [-0.08, -0.14]], '#6b757b', [0, 0, 0], tail, 0.05);
    s.wiggle(tail, 'z', 0.08, 2.0);
    eyesOn(s, p, 0.5, 0.0, 0.022, '#2a2a2a', 1.0);
  }

  // 鲸鲨：宽扁大头 + 端位横口 + 棋盘白点与竖纹 + 体侧纵脊 + 高耸尾鳍
  function whaleShark(s) {
    const p = [[-0.95, 0.015, 0.012], [-0.8, 0.06, 0.05], [-0.55, 0.15, 0.14], [-0.2, 0.22, 0.22], [0.2, 0.22, 0.25], [0.5, 0.17, 0.25], [0.7, 0.11, 0.22], [0.79, 0.065, 0.17], [0.82, 0.03, 0.1]];
    const b = s.body('whale-shark-body', p, '#3d5465', '#e9eef0', 0.03);
    const spot = C('#e7eef2'), stripe = C('#a9bac4'), belly = C('#eef2f3'), top = C('#344a5a');
    paint(b, p, (x, y, z, rel, side, ang, cur) => {
      if (rel < -0.35) return belly;
      const base = mix(top, C('#4a6273'), sstep(0.6, -0.2, rel));
      // v4.1 QA：竖纹 / 白点改软边（硬阈值在顶点分辨率下呈方块），白点放大一档以跨越 ≥2 个顶点
      const fx = fract(x / 0.13), sw = sstep(0.0, 0.05, fx) * sstep(0.16, 0.1, fx) * sstep(-0.34, -0.24, rel) * sstep(0.58, 0.5, x);
      const u = x / 0.11, v = ang * 0.17 / 0.07;
      const fu = fract(u) - 0.5, fv = fract(v + Math.floor(u) * 0.5) - 0.5;
      const r2 = 0.07 * (x > 0.5 ? 0.6 : 1), dd = fu * fu + fv * fv;
      const sp = sstep(r2 * 1.35, r2 * 0.65, dd);
      return mix(mix(base, stripe, 0.45 * sw), spot, 0.72 * sp * sstep(-0.42, -0.3, rel));
    });
    s.tube('mouth', [[0.77, -0.035, -0.15], [0.81, -0.03, -0.08], [0.825, -0.028, 0], [0.81, -0.03, 0.08], [0.77, -0.035, 0.15]], 0.017, '#1b2228', s.root, 6, 18);
    s.tube('upper-lip', [[0.775, -0.012, -0.15], [0.818, -0.008, -0.08], [0.832, -0.006, 0], [0.818, -0.008, 0.08], [0.775, -0.012, 0.15]], 0.01, '#4a6273', s.root, 6, 18);
    for (const side of [-1, 1]) {
      s.eye(`eye-${side}`, [0.7, 0.03, side * surfZ(p, 0.7, 0.03)], 0.022, side, s.root, '#3a3a2a');
      for (let r = 0; r < 3; r++) {
        const yy = [0.55, 0.3, 0.05][r];
        const pts = []; for (let i = 0; i <= 6; i++) { const x = 0.45 - i * 0.17; const [h] = sampleProfile(p, x); pts.push([x, h * yy, side * surfZ(p, x, h * yy, 1.0)]); }
        s.tube(`ridge-${side}-${r}`, pts, 0.011, '#5d7586', s.root, 5, 24);
      }
    }
    gillSlits(s, 0.52, 5, 0.04, -0.02, 0.13, (x) => surfZ(p, x, -0.02), '#26333d');
    s.fin('dorsal-fin', [[0.14, 0], [0.0, 0.2], [-0.12, 0.3], [-0.18, 0.28], [-0.16, 0.1], [-0.22, 0]], '#3a5061', [-0.18, 0.2, 0], [0, 0, 0], s.root, 0.04);
    s.fin('second-dorsal', [[-0.6, 0.1], [-0.65, 0.18], [-0.71, 0.08]], '#3a5061');
    for (const side of [-1, 1]) {
      const fin = s.fin(`pectoral-${side}`, [[0.05, 0], [-0.08, 0.2], [-0.32, 0.46], [-0.4, 0.45], [-0.3, 0.05]], '#3d5465', [0.3, -0.13, side * 0.2], [side * (Math.PI / 2 + 0.38), 0, 0], s.root, 0.04);
      s.wiggle(fin, 'x', 0.05, 1.2, side);
    }
    tailFin(s, -0.92, [[0.06, 0], [-0.16, 0.3], [-0.36, 0.6], [-0.42, 0.6], [-0.32, 0.28], [-0.2, 0.02], [-0.28, -0.18], [-0.32, -0.32], [-0.26, -0.3], [-0.1, -0.12]], '#3a5061', 0.04, 0.06);
  }

  const recipes = {
    butterflyfish, 'sea-bream': seaBream, flounder, starfish,
    seahorse, jellyfish, parrotfish, lionfish,
    'moray-eel': morayEel, anglerfish, 'mantis-shrimp': mantisShrimp, barracuda,
    'sea-turtle': seaTurtle, dolphin, 'giant-grouper': giantGrouper, coelacanth,
    'great-white': greatWhite, orca, narwhal, 'whale-shark': whaleShark,
  };
  // v4.1 柔和配色（对齐猛兽派对 / 原 20 种）：建模完成后统一压缩高饱和色（材质色 + 顶点色），色相与明度不变
  // —— 保留物种识别特征（虎鲸黑白 / 鲸鲨白点本来就是低饱和，不受影响）；k 越小越灰
  const SOFT_K = { butterflyfish: 0.86, 'sea-bream': 0.84, starfish: 0.84, seahorse: 0.86, parrotfish: 0.82, lionfish: 0.88, 'mantis-shrimp': 0.8, jellyfish: 0.9, anglerfish: 0.9 };
  const _hsl = {}, _c = new THREE.Color();
  const softCol = (col, k) => {
    col.getHSL(_hsl, THREE.SRGBColorSpace);
    if (_hsl.s < 0.04) return;
    let sat = _hsl.s > 0.45 ? 0.45 + (_hsl.s - 0.45) * 0.5 : _hsl.s;
    col.setHSL(_hsl.h, sat * k, _hsl.l, THREE.SRGBColorSpace);
  };
  function soften(root, k) {
    const seenM = new Set(), seenG = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || seenM.has(m)) continue; seenM.add(m);
        if (m.color) softCol(m.color, k);
        if (m.emissive) softCol(m.emissive, k);
      }
      const g = o.geometry, ca = g && g.getAttribute && g.getAttribute('color');
      if (ca && !seenG.has(g)) {
        seenG.add(g);
        for (let i = 0; i < ca.count; i++) { _c.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i)); softCol(_c, k); ca.setXYZ(i, _c.r, _c.g, _c.b); }
        ca.needsUpdate = true;
      }
    });
  }
  for (const id of Object.keys(recipes)) { const fn = recipes[id], k = SOFT_K[id] ?? 0.92; recipes[id] = (s) => { fn(s); soften(s.root, k); }; }
  // 截面流线（marine.js STREAM_SP / PED_SP 语义）：1 = 尾柄收细 + 吻部收尖；2 = 只收尾柄
  const stream = { butterflyfish: 1, 'sea-bream': 1, parrotfish: 1, lionfish: 1, barracuda: 1, 'giant-grouper': 1, coelacanth: 1, 'great-white': 2, 'whale-shark': 2, dolphin: 2, orca: 2, narwhal: 2 };
  const ped = { barracuda: 0.38, 'great-white': 0.45, 'whale-shark': 0.42, dolphin: 0.45, orca: 0.4, narwhal: 0.42, butterflyfish: 0.25, lionfish: 0.25 };
  // 竖直体型：归一化时把高度也算进最长维度（否则海马 / 水母会被放得过大）
  const normY = { seahorse: 1, jellyfish: 1 };
  return { recipes, stream, ped, normY };
}
