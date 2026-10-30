// 机甲零件库：躯干 7 / 驾驶舱 4 / 面部 6 / 肩甲 6 / 手臂 5 / 武器 7 / 特色武装 9 / 背包 7 / 腿 5 / 造型母题 8 / 尾巴
// 所有零件写入 PartSet（按骨骼 × 材质分组），之后合并为少量网格。坐标系：机甲面向 +Z，左侧 = +X
import { rbox, box, cyl, sph, tor, cone, plate, rod, taper, lathe } from './geo.js';

const PI = Math.PI;

// ———————————————————— 躯干 ————————————————————
export function buildTorso(c) {
  const { ps, d, r, look } = c; const { CW, CH, CD } = d;
  const t = look.torso;
  // 腰部（所有类型通用：分段腰椎 + 液压）
  const wl = d.WH;
  for (let i = 0; i < 3; i++) ps.add('waist', 'M', rbox(CW * (0.5 - i * 0.04), wl * 0.36, CD * 0.55, 0.04), [0, wl * (0.08 + i * 0.36), 0]);
  ps.add('waist', 'K', cyl(CW * 0.2, CW * 0.2, wl * 1.5, 10), [0, wl * 0.5, -CD * 0.05]);
  ps.add('waist', 'C', rod([CW * 0.22, 0, CD * 0.12], [CW * 0.25, wl, CD * 0.14], 0.035));
  ps.add('waist', 'C', rod([-CW * 0.22, 0, CD * 0.12], [-CW * 0.25, wl, CD * 0.14], 0.035));

  if (t === 0) { // 方正重甲
    ps.add('chest', 'P', rbox(CW, CH * 0.82, CD, 0.12), [0, CH * 0.5, 0]);
    ps.add('chest', 'S', plate([[-CW * 0.42, 0], [CW * 0.42, 0], [CW * 0.5, CH * 0.55], [-CW * 0.5, CH * 0.55]], 0.1, 0.03), [0, CH * 0.3, CD * 0.5 + 0.04], [-0.12, 0, 0]);
    ps.add('chest', 'M', rbox(CW * 0.7, CH * 0.14, CD * 0.9, 0.04), [0, CH * 0.06, 0]);
    for (let i = 0; i < 4; i++) ps.add('chest', 'K', box(0.04, CH * 0.28, CD * 0.5), [CW * 0.5 + 0.005, CH * 0.45, -CD * 0.2 + i * 0.001], [0, 0, 0], [1, 1, 1]);
    for (const sx of [1, -1]) { for (let i = 0; i < 4; i++) ps.add('chest', 'K', box(0.05, 0.035, CD * 0.5), [sx * (CW * 0.5 + 0.01), CH * 0.32 + i * 0.07, -CD * 0.05]); }
    ps.add('chest', 'A', rbox(CW * 0.22, CH * 0.09, 0.08, 0.02), [CW * 0.28, CH * 0.82, CD * 0.5 + 0.02]);
    ps.add('chest', 'A', rbox(CW * 0.22, CH * 0.09, 0.08, 0.02), [-CW * 0.28, CH * 0.82, CD * 0.5 + 0.02]);
  } else if (t === 1) { // V 型英雄胸
    ps.add('chest', 'P', taper(rbox(CW * 0.85, CH * 0.85, CD * 0.9, 0.1), 1.3, 1.05, 0.05, 0.62, 0.85), [0, CH * 0.5, 0]);
    for (const sx of [1, -1]) {
      ps.add('chest', 'S', plate([[0, 0], [CW * 0.5, 0.08], [CW * 0.56, CH * 0.38], [0.04, CH * 0.42]], 0.09, 0.03), [sx > 0 ? 0.03 : -0.03, CH * 0.45, CD * 0.46], [-0.18, sx > 0 ? 0.22 : PI - 0.22, sx > 0 ? 0 : PI], [1, 1, 1]);
    }
    ps.add('chest', 'M', cyl(CW * 0.13, CW * 0.13, 0.12, 20), [0, CH * 0.52, CD * 0.5 + 0.03], [PI / 2, 0, 0]);
    ps.add('chest', 'G', cyl(CW * 0.09, CW * 0.09, 0.14, 20), [0, CH * 0.52, CD * 0.5 + 0.05], [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) ps.add('chest', 'S', rbox(CW * (0.44 - i * 0.05), CH * 0.07, CD * 0.3, 0.025), [0, CH * (0.24 - i * 0.085), CD * 0.32]);
  } else if (t === 2) { // 修长楔形
    ps.add('chest', 'P', taper(rbox(CW * 0.72, CH * 0.75, CD * 0.7, 0.08), 1.25, 1.1, 0.12, 0.7, 0.8), [0, CH * 0.55, 0]);
    ps.add('chest', 'S', plate([[-CW * 0.3, 0], [CW * 0.3, 0], [CW * 0.12, CH * 0.5], [-CW * 0.12, CH * 0.5]], 0.07, 0.02), [0, CH * 0.24, CD * 0.42], [-0.25, 0, 0]);
    for (let i = 0; i < 5; i++) ps.add('chest', 'M', cyl(0.07, 0.07, 0.1, 10), [0, CH * (0.1 + i * 0.16), -CD * 0.4]);
    ps.add('chest', 'G', box(CW * 0.5, 0.025, 0.02), [0, CH * 0.62, CD * 0.43]);
    for (const sx of [1, -1]) ps.add('chest', 'A', plate([[0, 0], [0.35, 0.15], [0.05, 0.5]], 0.05, 0.015), [sx * CW * 0.36, CH * 0.62, -CD * 0.2], [0, sx > 0 ? -PI / 2 : PI / 2, 0]);
  } else if (t === 3) { // 圆蛋舱
    ps.add('chest', 'P', sph(1, 24, 16), [0, CH * 0.52, 0], [0, 0, 0], [CW * 0.56, CH * 0.5, CD * 0.58]);
    ps.add('chest', 'M', tor(1, 0.06, 6, 32), [0, CH * 0.52, 0], [PI / 2, 0, 0], [CW * 0.56, CD * 0.58, 1]);
    for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; ps.add('chest', 'G', cyl(0.05, 0.05, 0.05, 10), [Math.sin(a) * CW * 0.55, CH * 0.52, Math.cos(a) * CD * 0.57], [PI / 2, 0, -a]); }
    ps.add('chest', 'S', sph(1, 20, 10, 0, PI * 2, 0, PI * 0.35), [0, CH * 0.52, 0], [0, 0, 0], [CW * 0.58, CH * 0.52, CD * 0.6]);
    ps.add('chest', 'A', rbox(CW * 0.3, CH * 0.12, 0.1, 0.03), [0, CH * 0.28, CD * 0.52], [-0.4, 0, 0]);
  } else if (t === 4) { // 工业桶
    ps.add('chest', 'P', cyl(CW * 0.5, CW * 0.46, CH * 0.85, 18), [0, CH * 0.5, 0], [0, 0, 0], [1, 1, CD / CW]);
    for (let i = 0; i < 3; i++) ps.add('chest', 'M', tor(CW * 0.5, 0.045, 6, 24), [0, CH * (0.18 + i * 0.32), 0], [PI / 2, 0, 0], [1, CD / CW, 1]);
    ps.add('chest', 'S', rbox(CW * 0.5, CH * 0.4, 0.1, 0.03), [0, CH * 0.5, CD * 0.5], [-0.05, 0, 0]);
    for (let i = 0; i < 6; i++) ps.add('chest', 'K', box(CW * 0.4, 0.03, 0.02), [0, CH * (0.36 + i * 0.05), CD * 0.56]);
    for (const sx of [1, -1]) ps.add('chest', 'C', cyl(0.07, 0.09, CH * 0.5, 10), [sx * CW * 0.28, CH * 0.95, -CD * 0.36]);
  } else if (t === 5) { // 棱角隐身
    ps.add('chest', 'P', cyl(CW * 0.55, CW * 0.38, CH * 0.85, 6), [0, CH * 0.5, 0], [0, PI / 6, 0], [1, 1, CD / CW]);
    for (const sx of [1, -1]) {
      ps.add('chest', 'S', plate([[0, 0], [CW * 0.42, CH * 0.12], [CW * 0.3, CH * 0.55], [0, CH * 0.45]], 0.06, 0.01), [0, CH * 0.35, CD * 0.42], [-0.3, sx > 0 ? 0.35 : PI - 0.35, sx > 0 ? 0 : PI]);
      ps.add('chest', 'A', plate([[0, 0], [0.5, 0.1], [0.1, 0.35]], 0.04, 0.01), [sx * CW * 0.45, CH * 0.85, -CD * 0.1], [0.2, sx > 0 ? -PI / 2 + 0.3 : PI / 2 - 0.3, 0]);
    }
    ps.add('chest', 'G', box(0.03, CH * 0.35, 0.02), [0, CH * 0.45, CD * 0.5]);
  } else { // 6 猩猩大胸（前倾）
    ps.add('chest', 'P', taper(rbox(CW * 1.05, CH * 0.85, CD * 1.05, 0.16), 1.25, 1.2, 0.18, 0.7, 0.8), [0, CH * 0.5, 0.04]);
    ps.add('chest', 'S', rbox(CW * 0.9, CH * 0.3, CD * 0.4, 0.08), [0, CH * 0.62, CD * 0.42], [-0.25, 0, 0]);
    ps.add('chest', 'M', rbox(CW * 0.5, CH * 0.12, CD * 0.4, 0.04), [0, CH * 0.3, CD * 0.45]);
    for (let i = 0; i < 3; i++) ps.add('chest', 'K', box(CW * 0.42, 0.025, 0.02), [0, CH * (0.27 + i * 0.04), CD * 0.66]);
    ps.add('chest', 'A', rbox(CW * 1.1, CH * 0.08, CD * 0.6, 0.03), [0, CH * 0.92, -CD * 0.05]);
  }
  // 通用：腹甲桥接（保证胸腔与腰椎无缝衔接，弯腰/扭身时也不露缝）
  ps.add('chest', 'K', rbox(CW * 0.62, CH * 0.3, CD * 0.68, 0.05), [0, CH * 0.1, -CD * 0.02]);
  ps.add('chest', 'M', rbox(CW * 0.5, CH * 0.12, CD * 0.62, 0.04), [0, CH * 0.0, CD * 0.06]);
  // 通用：灯带（发光强度随 look.lights）
  if (r() < 0.7) for (const sx of [1, -1]) ps.add('chest', 'G', box(0.02, CH * 0.22, 0.02), [sx * CW * 0.32, CH * 0.5, CD * 0.5 + 0.06]);
  // 骨盆
  const pw = CW * 0.72;
  ps.add('pelvis', 'M', rbox(pw, 0.32, CD * 0.6, 0.06), [0, 0.02, 0]);
  ps.add('pelvis', 'P', plate([[-0.22, 0], [0.22, 0], [0.12, -0.38], [-0.12, -0.38]], 0.07, 0.02), [0, 0.12, CD * 0.32], [0.12, 0, 0]);
  const skirt = r.int(0, 2);
  for (const sx of [1, -1]) {
    if (skirt === 0) ps.add('pelvis', 'S', plate([[0, 0], [0.32, 0], [0.36, -0.44], [0.04, -0.4]], 0.06, 0.02), [sx * pw * 0.42, 0.14, 0.02], [0, sx > 0 ? -PI / 2 : PI / 2, sx * 0.18]);
    else if (skirt === 1) ps.add('pelvis', 'S', rbox(0.1, 0.4, CD * 0.55, 0.03), [sx * (pw * 0.5 + 0.06), -0.06, 0], [0, 0, sx * 0.15]);
    ps.add('pelvis', 'M', cyl(0.13, 0.13, 0.12, 12), [sx * d.hipX, -0.08, 0], [0, 0, PI / 2]);
  }
  ps.add('pelvis', 'P', rbox(pw * 0.7, 0.24, 0.12, 0.04), [0, 0.06, -CD * 0.32]);
}

// ———————————————————— 驾驶舱（分身座位） ————————————————————
export function buildCockpit(c) {
  const { ps, d, look, r } = c; const { CW, CD } = d;
  const k = look.cockpit; const sw = 0.95, sd = 0.9;
  // 座舱底座 + 座椅
  ps.add('cockpit', 'M', rbox(sw + 0.14, 0.16, sd + 0.1, 0.05), [0, 0.06, 0]);
  ps.add('cockpit', 'K', rbox(0.58, 0.1, 0.5, 0.04), [0, 0.18, -0.02]);
  ps.add('cockpit', 'K', rbox(0.6, 0.62, 0.12, 0.05), [0, 0.48, -0.3], [0.12, 0, 0]);
  ps.add('cockpit', 'A', rbox(0.66, 0.1, 0.14, 0.03), [0, 0.78, -0.34], [0.12, 0, 0]);
  // 操纵台 + 摇杆
  for (const sx of [1, -1]) {
    ps.add('cockpit', 'M', rbox(0.16, 0.22, 0.42, 0.04), [sx * 0.42, 0.28, 0.08]);
    ps.add('cockpit', 'C', cyl(0.02, 0.02, 0.2, 8), [sx * 0.42, 0.46, 0.16], [0.3, 0, 0]);
    ps.add('cockpit', 'G', sph(0.035, 8, 6), [sx * 0.42, 0.56, 0.19]);
  }
  ps.add('cockpit', 'G', box(0.42, 0.14, 0.02), [0, 0.42, 0.44], [-0.5, 0, 0]);
  ps.add('cockpit', 'M', rbox(0.6, 0.24, 0.16, 0.04), [0, 0.24, 0.42]);
  if (k === 0) { // 防滚架
    const H = 1.18;
    for (const sx of [1, -1]) {
      ps.add('cockpit', 'C', rod([sx * 0.52, 0.1, -0.42], [sx * 0.46, H, -0.3], 0.04));
      ps.add('cockpit', 'C', rod([sx * 0.52, 0.1, 0.42], [sx * 0.42, H * 0.82, 0.12], 0.035));
      ps.add('cockpit', 'C', rod([sx * 0.42, H * 0.82, 0.12], [sx * 0.46, H, -0.3], 0.035));
    }
    ps.add('cockpit', 'C', rod([0.46, H, -0.3], [-0.46, H, -0.3], 0.04));
    ps.add('cockpit', 'A', rbox(1.0, 0.06, 0.1, 0.02), [0, H + 0.03, -0.3]);
    ps.add('cockpit', 'G', box(0.6, 0.03, 0.03), [0, H + 0.07, -0.3]);
  } else if (k === 1) { // 玻璃泡罩
    ps.add('cockpit', 'W', sph(0.62, 24, 14, 0, PI * 2, 0, PI * 0.5), [0, 0.12, 0], [0, 0, 0], [0.92, 1.42, 0.9]);
    ps.add('cockpit', 'S', tor(0.6, 0.05, 6, 28), [0, 0.14, 0], [PI / 2, 0, 0], [0.93, 0.9, 1]);
    ps.add('cockpit', 'S', tor(0.6, 0.03, 6, 28, PI), [0, 0.14, -0.3], [0, 0, 0], [0.78, 1.18, 1]); // 横向加强筋放在头后，不挡脸
  } else if (k === 2) { // 敞篷 + 挡风
    for (const sx of [1, -1]) ps.add('cockpit', 'P', plate([[0, 0], [0.9, 0], [0.72, 0.42], [0.1, 0.5]], 0.06, 0.02), [sx * 0.55, 0.08, -0.45], [0, -PI / 2, 0]);
    ps.add('cockpit', 'W', rbox(0.9, 0.42, 0.03, 0.01), [0, 0.56, 0.47], [-0.45, 0, 0]);
    ps.add('cockpit', 'S', rbox(0.96, 0.05, 0.06, 0.02), [0, 0.76, 0.38], [-0.45, 0, 0]);
  } else { // 装甲舱盖（向后掀起）
    ps.add('cockpit', 'P', rbox(1.12, 0.32, 0.1, 0.04), [0, 0.22, 0.5]);
    for (const sx of [1, -1]) ps.add('cockpit', 'P', rbox(0.1, 0.42, 0.95, 0.04), [sx * 0.56, 0.24, 0]);
    ps.add('cockpit', 'S', taper(rbox(1.08, 0.08, 0.86, 0.04), 0.85, 1, 0, 1, 1), [0, 0.95, -0.66], [-1.15, 0, 0]);
    ps.add('cockpit', 'G', box(0.7, 0.03, 0.02), [0, 0.4, 0.56]);
  }
  c.anchor('seat', 'cockpit', [0, 0.22, -0.04]);
}

// ———————————————————— 面部传感器（驾驶舱下方、胸口上沿） ————————————————————
export function buildHead(c) {
  const { ps, d, look } = c; const { CW } = d;
  const k = look.head; const e = look.eyes;
  if (k === 0) {
    ps.add('head', 'K', rbox(CW * 0.62, 0.16, 0.12, 0.04), [0, 0, 0.02]);
    ps.add('head', 'G', box(CW * 0.5, 0.05, 0.04), [0, 0, 0.08]);
  } else if (k === 1) { // 单眼
    ps.add('head', 'S', rbox(0.5, 0.36, 0.3, 0.1), [0, 0, 0.08]);
    ps.add('head', 'K', cyl(0.13, 0.13, 0.08, 18), [0, 0, 0.24], [PI / 2, 0, 0]);
    ps.add('head', 'G', sph(0.09, 14, 10), [0, 0, 0.27]);
    for (const sx of [1, -1]) ps.add('head', 'A', plate([[0, 0], [0.24, 0.06], [0.04, 0.22]], 0.03, 0.01), [sx * 0.24, 0.05, 0.05], [0, sx > 0 ? -PI / 2 : PI / 2, 0]);
  } else if (k === 2) { // 双目 + 格栅
    ps.add('head', 'S', rbox(0.62, 0.34, 0.26, 0.08), [0, 0, 0.06]);
    for (const sx of [1, -1]) { ps.add('head', 'K', cyl(0.085, 0.085, 0.08, 16), [sx * 0.15, 0.04, 0.2], [PI / 2, 0, 0]); ps.add('head', 'G', cyl(0.06, 0.06, 0.09, 16), [sx * 0.15, 0.04, 0.21], [PI / 2, 0, 0]); }
    for (let i = 0; i < 4; i++) ps.add('head', 'K', box(0.28, 0.02, 0.02), [0, -0.08 - i * 0.035, 0.2]);
  } else if (k === 3) { // T 型目镜
    ps.add('head', 'P', rbox(0.56, 0.42, 0.34, 0.12), [0, 0, 0.1]);
    ps.add('head', 'G', box(0.42, 0.05, 0.03), [0, 0.06, 0.27]);
    ps.add('head', 'G', box(0.05, 0.16, 0.03), [0, -0.04, 0.27]);
    ps.add('head', 'A', plate([[-0.08, 0], [0.08, 0], [0, 0.3]], 0.03, 0.01), [0, 0.18, 0.22], [-0.3, 0, 0]);
  } else if (k === 4) { // 三目簇
    ps.add('head', 'K', rbox(0.5, 0.3, 0.24, 0.06), [0, 0, 0.06]);
    [[-0.13, 0.04, 0.06], [0.13, 0.04, 0.06], [0, -0.07, 0.045]].forEach(([x, y, rr]) => ps.add('head', 'G', cyl(rr, rr, 0.06, 12), [x, y, 0.2], [PI / 2, 0, 0]));
  } else { // 下颚格栅 + 眼缝
    ps.add('head', 'P', taper(rbox(0.64, 0.4, 0.3, 0.08), 1, 1, 0, 0.7, 0.9), [0, 0, 0.08]);
    ps.add('head', 'G', plate([[-0.24, 0], [0.24, 0], [0.18, -0.05], [-0.18, -0.05]], 0.02, 0.005), [0, 0.1, 0.24]);
    for (let i = 0; i < 5; i++) ps.add('head', 'C', box(0.03, 0.16, 0.03), [-0.12 + i * 0.06, -0.08, 0.23]);
  }
  if (e === 3) ps.add('head', 'G', box(CW * 0.7, 0.025, 0.02), [0, -0.22, 0.12]);
}

// ———————————————————— 肩甲 ————————————————————
export function buildShoulders(c) {
  const { ps, d, look, design } = c; const s = look.shoulder; const k = 0.95 * look.shoulderW * (design.role === 'tank' ? 1.2 : design.role === 'assassin' ? 0.85 : 1);
  for (const [bn, sx] of [['shL', 1], ['shR', -1]]) {
    ps.add(bn, 'M', sph(0.24 * k, 14, 10), [sx * 0.1, 0, 0]);
    if (s === 0) { ps.add(bn, 'P', sph(0.46 * k, 18, 12, 0, PI * 2, 0, PI * 0.55), [sx * 0.18, 0.04, 0], [0, 0, -sx * 0.25], [1, 0.9, 1.05]); ps.add(bn, 'A', tor(0.42 * k, 0.04, 6, 20), [sx * 0.2, -0.04, 0], [PI / 2, 0, -sx * 0.25]); }
    else if (s === 1) for (let i = 0; i < 3; i++) ps.add(bn, i === 1 ? 'S' : 'P', rbox(0.6 * k, 0.1, 0.62 * k, 0.04), [sx * (0.2 + i * 0.03), 0.22 - i * 0.14, 0], [0, 0, -sx * (0.35 + i * 0.12)]);
    else if (s === 2) ps.add(bn, 'P', rbox(0.34 * k, 0.3 * k, 0.4 * k, 0.08), [sx * 0.16, 0.06, 0]);
    else if (s === 3) { ps.add(bn, 'P', rbox(0.5 * k, 0.34 * k, 0.56 * k, 0.1), [sx * 0.2, 0.08, 0]); for (let i = 0; i < 3; i++) ps.add(bn, 'C', cone(0.07 * k, 0.32 * k, 8), [sx * 0.24, 0.3 * k, -0.15 * k + i * 0.15 * k], [0, 0, -sx * 0.4]); }
    else if (s === 4) { ps.add(bn, 'P', rbox(0.56 * k, 0.4 * k, 0.6 * k, 0.06), [sx * 0.22, 0.06, 0], [0, 0, -sx * 0.12]); ps.add(bn, 'G', box(0.02, 0.05, 0.4 * k), [sx * (0.22 + 0.28 * k), 0.06, 0]); ps.add(bn, 'S', rbox(0.4 * k, 0.1, 0.62 * k, 0.03), [sx * 0.22, 0.28 * k, 0], [0, 0, -sx * 0.12]); }
    else { ps.add(bn, 'P', plate([[0, 0], [0.7, 0], [0.62, 0.8], [0.08, 0.86]].map(([x, y]) => [x * k - 0.35 * k, -y * k + 0.3 * k]), 0.1, 0.03), [sx * 0.36 * k, -0.05, 0], [0, sx > 0 ? PI / 2 : -PI / 2, 0]); ps.add(bn, 'A', rbox(0.12, 0.7 * k, 0.12, 0.03), [sx * 0.43 * k, -0.1, 0.32 * k]); }
  }
}

// ———————————————————— 手臂 ————————————————————
export function buildArms(c) {
  const { ps, d, look, design } = c; const { UL, FL } = d; const a = look.arms;
  const k = look.bulk * (design.role === 'brawler' ? 1.12 : 1);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const ua = 'ua' + s, fa = 'fa' + s;
    ps.add(fa, 'M', cyl(0.14 * k, 0.14 * k, 0.26 * k, 14), [0, 0, 0], [0, 0, PI / 2]);
    if (a === 0) {
      ps.add(ua, 'M', cyl(0.1 * k, 0.1 * k, UL, 10), [0, -UL / 2, 0]);
      ps.add(ua, 'P', rbox(0.34 * k, UL * 0.7, 0.36 * k, 0.07), [0, -UL * 0.45, 0]);
      ps.add(fa, 'P', taper(rbox(0.38 * k, FL * 0.85, 0.42 * k, 0.08), 1, 1, 0, 1.25, 1.2), [0, -FL * 0.48, 0.02]);
      ps.add(fa, 'S', rbox(0.06, FL * 0.5, 0.3 * k, 0.02), [sx * 0.22 * k, -FL * 0.45, 0]);
    } else if (a === 1) {
      ps.add(ua, 'P', taper(cyl(0.15 * k, 0.12 * k, UL * 0.9, 12), 1, 1, 0), [0, -UL * 0.48, 0]);
      ps.add(ua, 'S', plate([[0, 0], [0.22, 0], [0.18, -UL * 0.6], [0.02, -UL * 0.5]], 0.04, 0.01), [sx * 0.12, -UL * 0.08, -0.05], [0, sx > 0 ? -PI / 2 : PI / 2, 0]);
      ps.add(fa, 'P', taper(cyl(0.13 * k, 0.17 * k, FL * 0.9, 12), 1, 1, 0), [0, -FL * 0.5, 0]);
      ps.add(fa, 'A', tor(0.16 * k, 0.025, 6, 16), [0, -FL * 0.78, 0], [PI / 2, 0, 0]);
    } else if (a === 2) {
      ps.add(ua, 'M', cyl(0.07 * k, 0.07 * k, UL, 8), [0, -UL / 2, 0]);
      ps.add(ua, 'C', rod([0.09 * k, -0.08, 0.06], [0.09 * k, -UL + 0.1, 0.06], 0.03));
      ps.add(ua, 'P', rbox(0.22 * k, UL * 0.4, 0.24 * k, 0.05), [0, -UL * 0.3, 0]);
      ps.add(fa, 'M', cyl(0.07 * k, 0.07 * k, FL, 8), [0, -FL / 2, 0]);
      ps.add(fa, 'C', rod([-0.08 * k, -0.06, -0.06], [-0.08 * k, -FL + 0.12, -0.06], 0.028));
      ps.add(fa, 'P', rbox(0.24 * k, FL * 0.45, 0.28 * k, 0.05), [0, -FL * 0.6, 0.02]);
    } else if (a === 3) {
      for (let i = 0; i < 4; i++) ps.add(ua, i % 2 ? 'M' : 'P', cyl(0.15 * k, 0.15 * k, UL * 0.2, 12), [0, -UL * (0.14 + i * 0.22), 0]);
      for (let i = 0; i < 4; i++) ps.add(fa, i % 2 ? 'M' : 'P', cyl(0.16 * k + i * 0.012, 0.16 * k + i * 0.012, FL * 0.2, 12), [0, -FL * (0.16 + i * 0.22), 0]);
    } else { // 巨型臂铠
      ps.add(ua, 'M', cyl(0.11 * k, 0.11 * k, UL, 10), [0, -UL / 2, 0]);
      ps.add(ua, 'P', rbox(0.3 * k, UL * 0.6, 0.32 * k, 0.07), [0, -UL * 0.4, 0]);
      ps.add(fa, 'P', taper(rbox(0.5 * k, FL * 0.9, 0.56 * k, 0.12), 1, 1, 0.04, 1.35, 1.3), [0, -FL * 0.5, 0.03]);
      ps.add(fa, 'S', rbox(0.62 * k, 0.12, 0.6 * k, 0.04), [0, -FL * 0.88, 0.03]);
      ps.add(fa, 'K', box(0.3 * k, 0.04, 0.04), [0, -FL * 0.6, 0.31 * k]);
    }
  }
}

// ———————————————————— 主武器（手部） ————————————————————
function fist(c, bn, sx, k) {
  const { ps } = c;
  ps.add(bn, 'M', rbox(0.34 * k, 0.32 * k, 0.32 * k, 0.07), [0, -0.12 * k, 0.02]);
  for (let i = 0; i < 4; i++) ps.add(bn, 'S', rbox(0.075 * k, 0.12 * k, 0.1 * k, 0.025), [(-0.12 + i * 0.08) * k, -0.28 * k, 0.12 * k]);
  ps.add(bn, 'S', rbox(0.08 * k, 0.16 * k, 0.1 * k, 0.025), [sx * 0.18 * k, -0.14 * k, 0.12 * k], [0, 0, sx * 0.4]);
  ps.add(bn, 'A', rbox(0.36 * k, 0.07 * k, 0.12 * k, 0.02), [0, -0.21 * k, 0.15 * k]);
}
export function buildWeapons(c) {
  const { ps, d, design, r } = c; const m = design.main; const sp = design.special;
  const k = c.look.bulk * (design.role === 'brawler' ? 1.25 : design.role === 'tank' ? 1.15 : 1);
  const L = d.FL;
  const leftBusy = ['chainsaw', 'drill', 'flame'].includes(sp);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const bn = 'hd' + s, fa = 'fa' + s;
    const isLeft = s === 'L';
    if (isLeft && leftBusy) continue;
    const dual = !isLeft || ['fist', 'blade', 'claw', 'gatling', 'blaster'].includes(m);
    const w = dual ? m : (design.range === 'ranged' ? 'fist' : m === 'hammer' ? 'shield' : 'fist');
    if (w === 'fist') fist(c, bn, sx, k * 1.1);
    else if (w === 'blade') {
      fist(c, bn, sx, k * 0.85);
      ps.add(fa, 'C', plate([[-0.06, 0], [0.06, 0], [0.04, -1.5], [0, -1.75], [-0.05, -1.45]], 0.035, 0.012), [sx * 0.2 * k, -L * 0.3, 0.12], [0, 0, 0]);
      ps.add(fa, 'G', box(0.012, 1.2, 0.05), [sx * 0.2 * k, -L * 0.3 - 0.8, 0.16]);
      ps.add(fa, 'M', rbox(0.12, 0.32, 0.2, 0.03), [sx * 0.2 * k, -L * 0.3, 0.06]);
    } else if (w === 'hammer') {
      fist(c, bn, sx, k * 0.9);
      ps.add(bn, 'K', cyl(0.055, 0.055, 1.3, 8), [0, -0.75, 0.04]);
      ps.add(bn, 'P', rbox(0.46 * k, 0.5 * k, 0.8 * k, 0.07), [0, -1.45, 0.04]);
      ps.add(bn, 'S', rbox(0.5 * k, 0.14 * k, 0.84 * k, 0.03), [0, -1.45, 0.04]);
      ps.add(bn, 'M', cyl(0.2 * k, 0.24 * k, 0.12, 8), [0, -1.45, 0.48 * k], [PI / 2, 0, 0]);
      ps.add(bn, 'G', box(0.48 * k, 0.03, 0.03), [0, -1.24, 0.04]);
      c.anchor('hammerHead', bn, [0, -1.45, 0.04]);
    } else if (w === 'claw') {
      ps.add(bn, 'M', rbox(0.3 * k, 0.24 * k, 0.3 * k, 0.06), [0, -0.1 * k, 0]);
      for (const cz of [1, -1]) ps.add(bn, cz > 0 ? 'P' : 'S', plate([[0, 0], [0.12, 0], [0.16, -0.5], [0.02, -0.66], [0.06, -0.35]].map(([x, y]) => [x * k * cz, y * k]), 0.12 * k, 0.02), [0, -0.18 * k, 0], [0, PI / 2, 0]);
      ps.add(bn, 'C', cone(0.05 * k, 0.2 * k, 6), [0, -0.78 * k, 0.1 * k], [PI, 0, 0]);
    } else if (w === 'shield') {
      ps.add(fa, 'P', plate([[-0.45, 0.4], [0.45, 0.4], [0.5, -0.6], [0, -0.9], [-0.5, -0.6]].map(([x, y]) => [x * k, y * k]), 0.1, 0.03), [sx * 0.08, -L * 0.5, 0.32 * k], [0, 0, 0]);
      ps.add(fa, 'A', plate([[-0.3, 0.25], [0.3, 0.25], [0, -0.55]].map(([x, y]) => [x * k, y * k]), 0.04, 0.01), [sx * 0.08, -L * 0.5, 0.4 * k]);
      fist(c, bn, sx, k * 0.9);
    } else if (w === 'gatling') {
      ps.add(fa, 'P', rbox(0.42 * k, 0.55 * k, 0.46 * k, 0.06), [0, -L * 0.82, 0.04]);
      ps.add(fa, 'K', rbox(0.2, 0.4, 0.3, 0.03), [sx * 0.27 * k, -L * 0.75, -0.04]);
      ps.add(fa, 'A', box(0.44 * k, 0.05, 0.48 * k), [0, -L * 0.62, 0.04]);
      const sb = c.bone('spin' + s, bn, [0, -0.05, 0.04]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; ps.add(sb, 'C', cyl(0.042 * k, 0.042 * k, 1.05 * k, 8), [Math.cos(a) * 0.11 * k, -0.6 * k, Math.sin(a) * 0.11 * k]); }
      ps.add(sb, 'M', cyl(0.17 * k, 0.17 * k, 0.1, 14), [0, -0.18 * k, 0]);
      ps.add(sb, 'M', cyl(0.17 * k, 0.17 * k, 0.07, 14), [0, -0.98 * k, 0]);
      ps.add(sb, 'K', cyl(0.07 * k, 0.07 * k, 1.0 * k, 10), [0, -0.6 * k, 0]);
      c.anchor('muz' + s, bn, [0, -1.18 * k, 0.04]); c.spinners.push(sb);
    } else if (w === 'blaster') {
      ps.add(bn, 'P', rbox(0.3 * k, 0.85 * k, 0.34 * k, 0.06), [0, -0.38 * k, 0.04]);
      ps.add(bn, 'S', rbox(0.34 * k, 0.3 * k, 0.12, 0.03), [0, -0.3 * k, 0.24 * k]);
      ps.add(bn, 'K', cyl(0.075 * k, 0.075 * k, 0.5 * k, 12), [0, -0.98 * k, 0.04]);
      for (let i = 0; i < 3; i++) ps.add(bn, 'G', tor(0.11 * k, 0.026 * k, 6, 14), [0, -0.8 * k - i * 0.13 * k, 0.04], [PI / 2, 0, 0]);
      ps.add(bn, 'M', rbox(0.1, 0.4 * k, 0.12, 0.02), [sx * 0.18 * k, -0.3 * k, 0.04]);
      c.anchor('muz' + s, bn, [0, -1.26 * k, 0.04]);
    } else if (w === 'cannon') {
      ps.add(fa, 'P', rbox(0.48 * k, L * 0.7, 0.52 * k, 0.08), [0, -L * 0.6, 0.04]);
      ps.add(bn, 'M', cyl(0.26 * k, 0.24 * k, 0.4 * k, 16), [0, -0.2 * k, 0.04]);
      ps.add(bn, 'S', cyl(0.18 * k, 0.18 * k, 1.1 * k, 16), [0, -0.9 * k, 0.04]);
      ps.add(bn, 'K', cyl(0.22 * k, 0.22 * k, 0.18 * k, 16), [0, -1.48 * k, 0.04]);
      ps.add(bn, 'A', tor(0.19 * k, 0.035, 6, 16), [0, -0.62 * k, 0.04], [PI / 2, 0, 0]);
      ps.add(bn, 'G', tor(0.12 * k, 0.02, 6, 16), [0, -1.58 * k, 0.04], [PI / 2, 0, 0]);
      c.anchor('muz' + s, bn, [0, -1.62 * k, 0.04]);
    }
    if (!c.anchors['muz' + s]) c.anchor('muz' + s, bn, [0, -0.3 * k, 0.3]);
  }
}

// ———————————————————— 特色武装 ————————————————————
export function buildSpecial(c) {
  const { ps, d, design } = c; const sp = design.special; const L = d.FL; const k = c.look.bulk;
  if (sp === 'chainsaw') {
    ps.add('faL', 'M', rbox(0.36 * k, L * 0.5, 0.4 * k, 0.06), [0, -L * 0.7, 0]);
    ps.add('faL', 'A', cyl(0.12, 0.12, 0.3, 10), [0.2 * k, -L * 0.6, -0.05], [0, 0, PI / 2]);
    ps.add('hdL', 'C', plate([[-0.12, 0], [0.12, 0], [0.1, -1.55], [0, -1.65], [-0.1, -1.55]], 0.05, 0.01), [0, -0.05, 0.1]);
    const sb = c.bone('sawL', 'hdL', [0, -0.05, 0.1]);
    for (let i = 0; i < 18; i++) { const y = -0.05 - i * 0.088; for (const sx of [1, -1]) ps.add(sb, 'K', box(0.04, 0.06, 0.07), [sx * 0.135, y, 0]); }
    c.anchor('saw', 'hdL', [0, -0.9, 0.15]); c.saw = sb;
  } else if (sp === 'drill') {
    ps.add('faL', 'P', rbox(0.4 * k, L * 0.55, 0.42 * k, 0.07), [0, -L * 0.7, 0]);
    const sb = c.bone('drillL', 'hdL', [0, -0.05, 0]);
    ps.add(sb, 'C', cone(0.3 * k, 1.3 * k, 14), [0, -0.7 * k, 0], [PI, 0, 0]);
    for (let i = 0; i < 5; i++) ps.add(sb, 'M', tor((0.26 - i * 0.05) * k, 0.03, 4, 14), [0, (-0.2 - i * 0.22) * k, 0], [PI / 2 + 0.25, 0, 0]);
    ps.add(sb, 'A', cyl(0.32 * k, 0.32 * k, 0.12, 14), [0, -0.02, 0]);
    c.anchor('saw', 'hdL', [0, -1.0 * k, 0]); c.drill = sb;
  } else if (sp === 'flame') {
    ps.add('faL', 'P', rbox(0.36 * k, L * 0.6, 0.4 * k, 0.06), [0, -L * 0.6, 0]);
    ps.add('hdL', 'M', cyl(0.12, 0.16, 0.5, 12), [0, -0.25, 0.05]);
    ps.add('hdL', 'K', cyl(0.18, 0.12, 0.18, 12), [0, -0.55, 0.05]);
    ps.add('hdL', 'G', tor(0.15, 0.03, 6, 14), [0, -0.62, 0.05], [PI / 2, 0, 0]);
    ps.add('faL', 'C', rod([0.15, -0.1, -0.2], [0.12, -L, -0.1], 0.035));
    c.anchor('flame', 'hdL', [0, -0.68, 0.05]);
  } else if (sp === 'cannon') {
    const bn = 'back';
    ps.add(bn, 'M', rbox(0.5, 0.4, 0.5, 0.06), [-d.CW * 0.32, 0.55, 0.05]);
    ps.add(bn, 'P', rbox(0.5, 0.44, 1.0, 0.08), [-d.CW * 0.32, 0.9, 0.2]);
    ps.add(bn, 'S', cyl(0.18, 0.2, 1.7, 16), [-d.CW * 0.32, 0.9, 1.1], [PI / 2, 0, 0]);
    ps.add(bn, 'K', cyl(0.24, 0.24, 0.2, 16), [-d.CW * 0.32, 0.9, 1.95], [PI / 2, 0, 0]);
    ps.add(bn, 'A', tor(0.21, 0.035, 6, 16), [-d.CW * 0.32, 0.9, 1.3]);
    c.anchor('muzS', bn, [-d.CW * 0.32, 0.9, 2.1]);
  } else if (sp === 'laser') {
    ps.add('chest', 'K', cyl(0.28, 0.32, 0.16, 20), [0, d.CH * 0.42, d.CD * 0.5 + 0.08], [PI / 2, 0, 0]);
    ps.add('chest', 'G', cyl(0.2, 0.2, 0.18, 20), [0, d.CH * 0.42, d.CD * 0.5 + 0.1], [PI / 2, 0, 0]);
    ps.add('chest', 'A', tor(0.31, 0.04, 6, 22), [0, d.CH * 0.42, d.CD * 0.5 + 0.14]);
    c.anchor('beam', 'chest', [0, d.CH * 0.42, d.CD * 0.5 + 0.22]);
  } else if (sp === 'missile') {
    c.wantPods = true;
  } else if (sp === 'elec') {
    for (const sx of [1, -1]) {
      for (let i = 0; i < 4; i++) ps.add('back', 'C', tor(0.13 - i * 0.015, 0.035, 6, 14), [sx * d.CW * 0.3, 0.5 + i * 0.16, -0.1], [PI / 2, 0, 0]);
      ps.add('back', 'M', cyl(0.05, 0.05, 0.8, 8), [sx * d.CW * 0.3, 0.75, -0.1]);
      ps.add('back', 'G', sph(0.11, 12, 8), [sx * d.CW * 0.3, 1.22, -0.1]);
      c.anchor('coil' + (sx > 0 ? 'L' : 'R'), 'back', [sx * d.CW * 0.3, 1.22, -0.1]);
    }
  } else if (sp === 'charge') {
    ps.add('chest', 'S', plate([[-0.6, 0], [0.6, 0], [0.4, 0.5], [-0.4, 0.5]].map(([x, y]) => [x * d.CW, y]), 0.14, 0.04), [0, d.CH * 0.15, d.CD * 0.56], [-0.2, 0, 0]);
    for (const sx of [1, -1]) ps.add('chest', 'C', cone(0.1, 0.55, 8), [sx * d.CW * 0.3, d.CH * 0.4, d.CD * 0.6 + 0.2], [PI / 2, 0, 0]);
  } else if (sp === 'shock') {
    for (const s of ['L', 'R']) { ps.add('sn' + s, 'C', rod([0.15, -0.1, 0.18], [0.15, -d.SL * 0.8, 0.22], 0.05)); ps.add('sn' + s, 'C', rod([-0.15, -0.1, 0.18], [-0.15, -d.SL * 0.8, 0.22], 0.05)); }
  }
}

// ———————————————————— 背包 ————————————————————
export function buildBack(c) {
  const { ps, d, look, r } = c; let b = look.back; const { CW } = d;
  if (c.wantPods) b = 2;
  if (c.design.special === 'cannon' && b === 2) b = 1;
  if (c.design.special === 'elec') b = r.pick([0, 6, 3]);
  ps.add('back', 'M', rbox(CW * 0.7, 0.7, 0.3, 0.06), [0, 0.4, -0.08]);
  if (b === 0) { // 跳跃推进器
    for (const sx of [1, -1]) {
      ps.add('back', 'P', rbox(0.36, 0.8, 0.4, 0.08), [sx * CW * 0.24, 0.45, -0.32]);
      ps.add('back', 'K', cyl(0.14, 0.2, 0.26, 14), [sx * CW * 0.24, -0.02, -0.34]);
      ps.add('back', 'G', cyl(0.12, 0.12, 0.04, 14), [sx * CW * 0.24, -0.15, -0.34]);
      c.anchor('thr' + (sx > 0 ? 'L' : 'R'), 'back', [sx * CW * 0.24, -0.2, -0.34]);
    }
  } else if (b === 1) { // 动力核心
    ps.add('back', 'P', rbox(CW * 0.55, 0.9, 0.36, 0.1), [0, 0.5, -0.3]);
    ps.add('back', 'K', cyl(0.22, 0.22, 0.6, 16), [0, 0.5, -0.52]);
    for (let i = 0; i < 3; i++) ps.add('back', 'G', tor(0.23, 0.025, 6, 18), [0, 0.32 + i * 0.18, -0.52], [PI / 2, 0, 0]);
  } else if (b === 2) { // 导弹巢
    for (const sx of [1, -1]) {
      ps.add('back', 'P', rbox(0.6, 0.6, 0.55, 0.06), [sx * CW * 0.38, 1.0, -0.2], [0.35, 0, 0]);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ps.add('back', 'K', cyl(0.06, 0.06, 0.05, 8), [sx * CW * 0.38 - 0.18 + i * 0.18, 1.12 - j * 0.17 + 0.12, 0.1 - j * 0.06], [PI / 2 - 0.35, 0, 0]);
      ps.add('back', 'A', rbox(0.62, 0.08, 0.57, 0.02), [sx * CW * 0.38, 1.3, -0.1], [0.35, 0, 0]);
      c.anchor(sx > 0 ? 'podL' : 'podR', 'back', [sx * CW * 0.38, 1.25, 0.05]);
    }
  } else if (b === 3) { // 散热鳍片
    for (let i = 0; i < 5; i++) ps.add('back', i % 2 ? 'S' : 'P', plate([[0, 0], [0.5, 0], [0.3, 0.7], [0, 0.6]], 0.04, 0.01), [-0.32 + i * 0.16, 0.5, -0.25], [0, -PI / 2, 0]);
    ps.add('back', 'G', box(CW * 0.5, 0.03, 0.03), [0, 0.48, -0.4]);
  } else if (b === 4) { // 燃料罐
    for (const sx of [1, -1]) { ps.add('back', 'S', cyl(0.18, 0.18, 0.9, 14), [sx * 0.22, 0.5, -0.36]); ps.add('back', 'A', sph(0.18, 12, 8, 0, PI * 2, 0, PI / 2), [sx * 0.22, 0.95, -0.36]); ps.add('back', 'C', tor(0.19, 0.025, 6, 14), [sx * 0.22, 0.3, -0.36], [PI / 2, 0, 0]); }
  } else if (b === 5) { // 排气烟囱
    for (const sx of [1, -1]) { ps.add('back', 'C', cyl(0.1, 0.12, 1.1, 12), [sx * 0.3, 0.9, -0.3], [-0.15, 0, sx * 0.1]); ps.add('back', 'K', cyl(0.13, 0.13, 0.08, 12), [sx * 0.36, 1.45, -0.38], [-0.15, 0, sx * 0.1]); c.anchor(sx > 0 ? 'stackL' : 'stackR', 'back', [sx * 0.37, 1.5, -0.39]); }
    ps.add('back', 'P', rbox(CW * 0.5, 0.6, 0.3, 0.06), [0, 0.4, -0.3]);
  } else {
    ps.add('back', 'P', rbox(CW * 0.5, 0.5, 0.2, 0.06), [0, 0.45, -0.25]);
  }
}

// ———————————————————— 腿 ————————————————————
export function buildLegs(c) {
  const { ps, d, look } = c; const { TL, SL } = d; const l = look.legs; const k = look.bulk * (l === 4 ? 1.25 : 1);
  if (l === 3) { // 履带
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      const bn = 'tr' + s; const len = 2.1, hh = 0.75;
      ps.add(bn, 'K', rbox(0.46, hh, len, 0.3, 3), [0, hh / 2, 0]);
      ps.add(bn, 'P', rbox(0.5, 0.3, len * 0.85, 0.06), [sx * 0.03, hh * 0.85, 0]);
      for (let i = 0; i < 4; i++) ps.add(bn, 'M', cyl(0.24, 0.24, 0.5, 14), [sx * 0.01, 0.32, -0.72 + i * 0.48], [0, 0, PI / 2]);
      for (let i = 0; i < 4; i++) ps.add(bn, 'C', cyl(0.1, 0.1, 0.52, 10), [sx * 0.01, 0.32, -0.72 + i * 0.48], [0, 0, PI / 2]);
      ps.add(bn, 'A', box(0.52, 0.06, len * 0.6), [sx * 0.03, hh + 0.02, 0]);
      ps.add('pelvis', 'M', rbox(0.3, 0.3, 0.5, 0.05), [sx * (d.hipX + 0.05), -0.25, 0]);
    }
    return;
  }
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const th = 'th' + s, sn = 'sn' + s, ft = 'ft' + s;
    ps.add(sn, 'M', sph(0.17 * k, 12, 10), [0, 0, 0]);
    ps.add(ft, 'M', sph(0.13 * k, 10, 8), [0, 0, 0]);
    if (l === 0 || l === 4) {
      ps.add(th, 'M', cyl(0.13 * k, 0.11 * k, TL, 10), [0, -TL / 2, 0]);
      ps.add(th, 'P', taper(rbox(0.42 * k, TL * 0.75, 0.46 * k, 0.08), 1.1, 1.1, 0, 0.85, 0.9), [0, -TL * 0.45, 0.02]);
      ps.add(sn, 'S', rbox(0.3 * k, 0.32 * k, 0.24 * k, 0.06), [0, 0.02, 0.18 * k], [-0.2, 0, 0]);
      ps.add(sn, 'P', taper(rbox(0.44 * k, SL * 0.8, 0.5 * k, 0.1), 1, 1, 0, 1.25, 1.2), [0, -SL * 0.5, 0.02]);
      ps.add(sn, 'C', rod([0, -0.1, -0.24 * k], [0, -SL * 0.85, -0.2 * k], 0.04));
      ps.add(ft, 'P', taper(rbox(0.5 * k, 0.24, 0.85 * k, 0.07), 0.85, 0.8, 0.06), [0, -FHf(d) + 0.12, 0.14 * k]);
      ps.add(ft, 'K', rbox(0.54 * k, 0.07, 0.95 * k, 0.03), [0, -FHf(d) + 0.035, 0.16 * k]);
      ps.add(ft, 'S', rbox(0.3 * k, 0.12, 0.2 * k, 0.03), [0, -FHf(d) + 0.12, -0.28 * k]);
    } else if (l === 1) { // 反关节
      ps.add(th, 'P', taper(rbox(0.36 * k, TL * 0.85, 0.42 * k, 0.08), 1.1, 1.1, 0, 0.8, 0.8), [0, -TL * 0.48, 0]);
      ps.add(sn, 'M', cyl(0.09 * k, 0.09 * k, SL, 10), [0, -SL / 2, 0]);
      ps.add(sn, 'S', plate([[-0.12, 0], [0.12, 0], [0.08, -SL * 0.9], [-0.08, -SL * 0.9]].map(([x, y]) => [x * k, y]), 0.2 * k, 0.03), [0, -0.05, -0.08], [0, PI / 2, 0]);
      ps.add(sn, 'C', rod([0, -0.1, 0.16], [0, -SL * 0.8, 0.12], 0.035));
      for (const a of [-0.45, 0, 0.45]) ps.add(ft, 'P', taper(rbox(0.12 * k, 0.12, 0.62 * k, 0.04), 0.6, 0.6, 0.0), [Math.sin(a) * 0.12, -FHf(d) + 0.07, 0.24 * k], [0, a, 0]);
      ps.add(ft, 'K', cone(0.06, 0.18, 6), [0, -FHf(d) + 0.07, -0.22 * k], [-PI / 2, 0, 0]);
    } else { // 修长
      ps.add(th, 'P', taper(cyl(0.18 * k, 0.12 * k, TL * 0.9, 12), 1, 1, 0.04), [0, -TL * 0.48, 0]);
      ps.add(th, 'A', plate([[0, 0], [0.16, -0.05], [0.12, -TL * 0.6], [0, -TL * 0.55]], 0.03, 0.01), [sx * 0.15 * k, -0.1, 0.04], [0, sx > 0 ? -PI / 2 : PI / 2, 0]);
      ps.add(sn, 'S', cone(0.12 * k, 0.4, 8), [0, 0.1, 0.12 * k], [-0.4, 0, 0]);
      ps.add(sn, 'P', taper(cyl(0.12 * k, 0.17 * k, SL * 0.9, 12), 1, 1, 0.06), [0, -SL * 0.5, 0]);
      ps.add(ft, 'P', taper(rbox(0.26 * k, 0.16, 0.66 * k, 0.05), 0.7, 0.7, 0.05), [0, -FHf(d) + 0.08, 0.15 * k]);
      ps.add(ft, 'K', rbox(0.28 * k, 0.05, 0.7 * k, 0.02), [0, -FHf(d) + 0.025, 0.15 * k]);
    }
  }
}
const FHf = (d) => d.FH;

// ———————————————————— 造型母题 / 尾巴 ————————————————————
export function buildMotif(c) {
  const { ps, d, look, r } = c; const m = look.motif; const { CW, CH, CD } = d;
  const top = 'cockpit';
  if (m === 'horns') for (const sx of [1, -1]) { ps.add(top, 'C', cone(0.12, 0.7, 8), [sx * 0.62, 0.55, 0.22], [0.5, 0, -sx * 0.9]); ps.add(top, 'A', cone(0.08, 0.35, 8), [sx * 0.88, 0.8, 0.36], [0.9, 0, -sx * 0.35]); }
  else if (m === 'ears') for (const sx of [1, -1]) ps.add(top, 'P', plate([[-0.22, 0], [0.22, 0], [0.05, 0.55]], 0.08, 0.02), [sx * 0.55, 0.42, -0.1], [0, 0, -sx * 0.35]);
  else if (m === 'fin') ps.add('back', 'S', plate([[0, 0], [0.9, 0], [0.2, 1.1]], 0.06, 0.02), [0, 0.9, -0.15], [0, PI / 2, 0]);
  else if (m === 'crown') for (let i = 0; i < 5; i++) ps.add('head', 'A', cone(0.06, 0.26, 6), [-0.24 + i * 0.12, 0.28 + (i === 2 ? 0.06 : 0), 0.12]);
  else if (m === 'spikes') { for (let i = 0; i < 4; i++) ps.add('back', 'C', cone(0.1, 0.45 - i * 0.05, 6), [0, 1.0 - i * 0.25, -0.35], [-1.1, 0, 0]); for (const s of ['shL', 'shR']) ps.add(s, 'C', cone(0.08, 0.4, 6), [s === 'shL' ? 0.3 : -0.3, 0.38, 0]); }
  else if (m === 'antenna') for (const sx of [1, -1]) { ps.add(top, 'C', cyl(0.015, 0.02, 1.1, 6), [sx * 0.5, 0.8, -0.38], [0, 0, -sx * 0.15]); ps.add(top, 'G', sph(0.05, 8, 6), [sx * 0.58, 1.35, -0.38]); }
  else if (m === 'crest') ps.add('head', 'A', plate([[0, 0], [0.55, 0.5], [0.45, 0.58], [0, 0.15], [-0.45, 0.58], [-0.55, 0.5]], 0.04, 0.01), [0, 0.12, 0.2], [-0.3, 0, 0]);
}

export function buildTail(c) {
  const { ps } = c;
  if (!c.look.tail || c.look.legs === 3) return;
  let parent = 'pelvis';
  for (let i = 0; i < 4; i++) {
    const bn = c.bone('tail' + i, parent, i === 0 ? [0, 0.0, -c.d.CD * 0.35] : [0, 0, -0.42]);
    ps.add(bn, i % 2 ? 'M' : 'P', taper(rbox(0.26 - i * 0.04, 0.22 - i * 0.03, 0.46, 0.05), 1, 1, 0), [0, 0, -0.22]);
    if (i === 3) ps.add(bn, 'C', cone(0.12, 0.45, 6), [0, 0, -0.62], [-PI / 2, 0, 0]);
    parent = bn; c.tail.push(bn);
  }
}
