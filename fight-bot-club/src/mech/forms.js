// 多形态机甲：人形 / 机械犬 / 多足蛛 / 浮游炮 / 履带战车 / 能量灵体
// 复用人形的材质、驾驶舱、武器、背包与烘焙管线，只替换「底盘」与步态，保证分身驾驶舱、枪口、特效锚点接口一致
import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';
import { MechView } from './mech.js';
import * as P from './parts.js';
import { rbox, box, cyl, sph, tor, cone, plate, rod, taper } from './geo.js';

const PI = Math.PI;

// 两段式 IK（骨骼几何沿 -Y）：返回 [大腿 rot.x, 小腿 rot.x]；kneeSign=+1 膝盖朝前/朝外上方，-1 朝后
function ik(L1, L2, fwd, dy, kneeSign) {
  const D = clamp(Math.hypot(fwd, dy), Math.abs(L1 - L2) + 0.03, L1 + L2 - 0.004);
  const psi = Math.atan2(fwd, -dy);
  const a = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const b = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  return [-(psi + kneeSign * a), kneeSign * (PI - b)];
}
const MELEE_ACTS = new Set(['jab', 'cross', 'heavy', 'jumppunch', 'bash', 'sp_charge', 'ult_frenzy', 'sp_chainsaw', 'sp_drill']);

// ———————————————————— 上半身复用型（蛛 / 浮游 / 灵体 / 战车） ————————————————————
class UpperForm extends MechView {
  buildParts(ctx) {
    P.buildTorso(ctx); P.buildCockpit(ctx); P.buildHead(ctx); P.buildShoulders(ctx); P.buildArms(ctx);
    P.buildWeapons(ctx); P.buildSpecial(ctx); P.buildBack(ctx); P.buildMotif(ctx);
    this.buildChassis(ctx);
  }
  get onStep() { return this.floating ? null : this._onStep; }
  set onStep(v) { this._onStep = v; }
  update(f, dt, o) {
    super.update(f, dt, o);
    this.chassis(f, dt, o);
  }
}

// —— 多足蛛：上半身架在六足底盘前端（攻壳风格）
class SpiderView extends UpperForm {
  prepare(d) {
    const L = this.design.look; const ll = L.legLen;
    d.L1 = 1.15 * ll; d.L2 = 1.5 * ll; d.H = 1.3 * ll + 0.15; d.SB = L.bulk;
  }
  buildChassis(c) {
    const { ps, d } = c; const b = d.SB; this.legs = [];
    // 头胸甲 + 腹部装甲
    ps.add('pelvis', 'M', rbox(d.CW * 0.95, 0.55, d.CD * 1.1, 0.12), [0, 0.05, 0.05]);
    ps.add('pelvis', 'P', rbox(d.CW * 1.05, 0.22, d.CD * 0.9, 0.08), [0, 0.32, 0.0]);
    ps.add('pelvis', 'P', sph(1, 22, 14), [0, 0.22, -1.25 * b], [0.12, 0, 0], [0.95 * b, 0.62, 1.25 * b]);
    ps.add('pelvis', 'S', sph(1, 20, 10, 0, PI * 2, 0, PI * 0.42), [0, 0.3, -1.25 * b], [0.12, 0, 0], [0.98 * b, 0.64, 1.28 * b]);
    ps.add('pelvis', 'K', rbox(0.9 * b, 0.4, 1.6 * b, 0.12), [0, -0.12, -1.1 * b]);
    for (let i = 0; i < 4; i++) ps.add('pelvis', 'G', box(0.5 * b - i * 0.08, 0.03, 0.05), [0, 0.86 - i * 0.02, -0.75 * b - i * 0.32], [0.12, 0, 0]);
    ps.add('pelvis', 'A', rbox(0.18, 0.12, 1.9 * b, 0.04), [0, 0.86, -1.25 * b], [0.12, 0, 0]);
    for (const sx of [1, -1]) {
      ps.add('pelvis', 'G', cyl(0.07, 0.07, 0.04, 10), [sx * 0.42 * b, 0.6, -2.15 * b], [PI / 2 - 0.3, 0, 0]);
      ps.add('pelvis', 'C', rod([sx * 0.3, 0.1, 0.4], [sx * 0.55 * b, 0.1, -0.6 * b], 0.05));
    }
    // 六足
    const L1 = d.L1, L2 = d.L2;
    const defs = [[0.55, 0.55, 0.62], [0.62, -0.25, 1.45], [0.55, -1.0, 2.3]];
    let i = 0;
    for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {
      const [hx, hz, ang] = defs[k];
      const hip = [sx * hx * b, 0.0, hz * b];
      const y = c.bone('lgY' + i, 'pelvis', hip), a = c.bone('lgA' + i, y, [0, 0, 0]), bb = c.bone('lgB' + i, a, [0, -L1, 0]);
      ps.add(y, 'M', sph(0.24, 14, 10), [0, 0, 0]);
      ps.add(a, 'P', taper(rbox(0.3, L1, 0.36, 0.08), 0.8, 0.8, 0), [0, -L1 / 2, 0]);
      ps.add(a, 'S', rbox(0.34, L1 * 0.55, 0.12, 0.04), [0, -L1 * 0.45, 0.16]);
      ps.add(a, 'C', rod([0, -0.1, -0.2], [0, -L1 + 0.15, -0.16], 0.04));
      ps.add(bb, 'M', cyl(0.17, 0.17, 0.36, 12), [0, 0, 0], [0, 0, PI / 2]);
      ps.add(bb, 'S', taper(rbox(0.24, L2 * 0.8, 0.28, 0.06), 0.45, 0.6, 0), [0, -L2 * 0.4, 0]);
      ps.add(bb, 'G', box(0.04, L2 * 0.5, 0.04), [0, -L2 * 0.38, 0.15]);
      ps.add(bb, 'C', cone(0.09, L2 * 0.25, 8), [0, -L2 * 0.88, 0], [PI, 0, 0]);
      this.legs.push({ y, a, b: bb, hip: new THREE.Vector3(...hip), ang: sx * ang, g: (k + (sx > 0 ? 0 : 1)) % 2, R: (1.55 + (k === 1 ? 0.25 : 0)) * b });
      i++;
    }
  }
  calcHeight(d) { return d.H + d.WH + 0.2 + d.CH + 0.9; }
  chassis(f, dt) {
    const d = this.d, t = this.time, A = this.amp || 0, B = this.bones;
    const L = this.legs;
    if (!this.legObjs) this.legObjs = L.map((l) => ({ y: B[l.y], a: B[l.a], b: B[l.b] }));
    const spd = Math.hypot(f.localV.f, f.localV.s) || 1;
    const mx = f.localV.s / spd, mz = f.localV.f / spd;
    const step = (d.L1 + d.L2) * 0.32;
    let py = d.H + Math.sin(t * 2.1) * 0.03 - this.squash * 0.25 + Math.abs(Math.sin(this.phase)) * 0.05 * A;
    if (this.dead) py = 0.35;
    this.cy = damp(this.cy ?? py, py, 16, dt);
    B.pelvis.position.y = this.cy;
    B.pelvis.rotation.set(this.dead ? 0.15 : clamp(f.localV.f * 0.012, -0.1, 0.1) - this.recoil * 0.08, 0, this.dead ? 0.12 : clamp(-f.localV.s * 0.012, -0.1, 0.1));
    const air = !f.grounded;
    for (let i = 0; i < L.length; i++) {
      const l = L[i], o = this.legObjs[i];
      const p = this.phase + l.g * PI;
      let fx = l.hip.x + Math.sin(l.ang) * l.R, fz = l.hip.z + Math.cos(l.ang) * l.R, fy = -this.cy;
      if (this.dead) { fx = l.hip.x + Math.sin(l.ang) * l.R * 1.25; fz = l.hip.z + Math.cos(l.ang) * l.R * 1.25; }
      else if (air) { fx = l.hip.x + Math.sin(l.ang) * l.R * 0.75; fz = l.hip.z + Math.cos(l.ang) * l.R * 0.75; fy = -d.L2 * 0.9; }
      else {
        const off = -Math.cos(p) * step * A; fx += mx * off; fz += mz * off;
        fy += Math.max(0, Math.sin(p)) * 0.45 * A + (this.cele > 0 ? Math.max(0, Math.sin(t * 8 + i)) * 0.3 : 0);
      }
      const rx = fx - l.hip.x, rz = fz - l.hip.z;
      o.y.rotation.y = Math.atan2(rx, rz);
      const [ta, tb] = ik(d.L1, d.L2, Math.hypot(rx, rz), fy - l.hip.y, 1);
      o.a.rotation.x = ta; o.b.rotation.x = tb;
    }
  }
}

// —— 浮游炮：无腿，反应堆裙甲 + 光环，低空悬浮
class HoverView extends UpperForm {
  prepare(d) { d.H = 1.25; this.floating = true; }
  buildChassis(c) {
    const { ps, d } = c; const W = d.CW;
    ps.add('pelvis', 'M', rbox(W * 0.85, 0.42, d.CD * 0.8, 0.12), [0, 0.06, 0]);
    ps.add('pelvis', 'P', cyl(W * 0.62, W * 0.3, 0.75, 8), [0, -0.3, 0]);
    ps.add('pelvis', 'K', cyl(W * 0.3, W * 0.22, 0.25, 12), [0, -0.78, 0]);
    ps.add('pelvis', 'G', cyl(W * 0.2, W * 0.2, 0.04, 16), [0, -0.92, 0]);
    ps.add('pelvis', 'G', tor(W * 0.5, 0.035, 6, 28), [0, -0.5, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 6;
      ps.add('pelvis', i % 2 ? 'S' : 'A', plate([[0, 0], [0.5, 0], [0.42, 0.62], [0.08, 0.62]], 0.05, 0.015), [Math.sin(a) * W * 0.6, -0.05, Math.cos(a) * W * 0.6], [0.35, a, 0]);
    }
    const halo = c.bone('halo', 'pelvis', [0, -0.1, 0]);
    ps.add(halo, 'A', tor(W * 0.95, 0.06, 6, 40), [0, 0, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2; ps.add(halo, 'G', sph(0.09, 10, 8), [Math.sin(a) * W * 0.95, 0, Math.cos(a) * W * 0.95]); ps.add(halo, 'M', rbox(0.22, 0.14, 0.3, 0.04), [Math.sin(a) * W * 0.95, 0, Math.cos(a) * W * 0.95], [0, a, 0]); }
    for (const sx of [1, -1]) {
      const e = c.bone(sx > 0 ? 'engL' : 'engR', 'pelvis', [sx * (W * 0.72 + 0.3), -0.1, -0.1]);
      ps.add(e, 'P', rbox(0.42, 0.42, 0.95, 0.12), [0, 0, 0]);
      ps.add(e, 'K', cyl(0.18, 0.24, 0.3, 12), [0, -0.3, -0.05]);
      ps.add(e, 'G', cyl(0.16, 0.16, 0.03, 12), [0, -0.46, -0.05]);
      ps.add(e, 'S', rbox(0.46, 0.1, 0.7, 0.03), [0, 0.24, 0.05]);
      ps.add(e, 'C', rod([-sx * 0.15, 0.05, 0], [-sx * 0.42, 0.12, 0], 0.05));
    }
  }
  calcHeight(d) { return d.H + d.WH + 0.2 + d.CH + 0.9; }
  chassis(f, dt) {
    const d = this.d, t = this.time, B = this.bones;
    let py = d.H + Math.sin(t * 2.3 + this.tailT) * 0.12 - this.squash * 0.3 - this.recoil * 0.12;
    if (this.dead) py = 0.75;
    this.cy = damp(this.cy ?? py, py, this.dead ? 3 : 10, dt);
    B.pelvis.position.y = this.cy;
    const tx = this.dead ? 0.35 : clamp(f.localV.f * 0.035, -0.25, 0.25) - this.recoil * 0.15, tz = this.dead ? 0.3 : clamp(-f.localV.s * 0.035, -0.25, 0.25);
    this.tl = this.tl || [0, 0]; this.tl[0] = damp(this.tl[0], tx, 6, dt); this.tl[1] = damp(this.tl[1], tz, 6, dt);
    B.pelvis.rotation.set(this.tl[0], 0, this.tl[1]);
    B.halo.rotation.y += dt * (this.dead ? 0.2 : 1.6 + (this.amp || 0) * 2);
    B.halo.rotation.x = Math.sin(t * 1.3) * 0.12;
    B.engL.rotation.x = B.engR.rotation.x = -this.tl[0] * 1.6;
  }
}

// —— 能量灵体：腰部以下是发光能量脊椎 + 环绕碎晶
class WraithView extends UpperForm {
  prepare(d) { d.H = 1.8; this.floating = true; }
  buildChassis(c) {
    const { ps, d } = c; const W = d.CW;
    ps.add('pelvis', 'M', rbox(W * 0.7, 0.36, d.CD * 0.65, 0.1), [0, 0.08, 0]);
    ps.add('pelvis', 'G', sph(0.3, 16, 12), [0, -0.12, 0]);
    ps.add('pelvis', 'W', sph(0.46, 18, 12), [0, -0.12, 0]);
    ps.add('pelvis', 'S', tor(0.42, 0.05, 6, 24), [0, -0.05, 0], [PI / 2, 0, 0]);
    let parent = 'pelvis'; this.spine = [];
    for (let i = 0; i < 4; i++) {
      const bn = c.bone('wr' + i, parent, i === 0 ? [0, -0.32, 0] : [0, -0.28, 0]);
      const s = 1 - i * 0.2;
      ps.add(bn, 'W', taper(rbox(0.42 * s, 0.3, 0.42 * s, 0.1), 0.7, 0.7, 0), [0, -0.14, 0]);
      ps.add(bn, 'G', cyl(0.08 * s, 0.06 * s, 0.27, 8), [0, -0.14, 0]);
      ps.add(bn, i % 2 ? 'A' : 'S', tor(0.26 * s + 0.05, 0.025, 5, 18), [0, -0.05, 0], [PI / 2, 0, 0]);
      parent = bn; this.spine.push(bn);
    }
    ps.add(parent, 'G', cone(0.07, 0.28, 8), [0, -0.38, 0], [PI, 0, 0]);
    const orb = c.bone('orbit', 'pelvis', [0, -0.3, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2; const r = W * 0.85;
      ps.add(orb, i % 2 ? 'A' : 'P', plate([[0, 0], [0.18, 0.3], [0, 0.75], [-0.18, 0.3]], 0.05, 0.01), [Math.sin(a) * r, (i % 2) * 0.25 - 0.3, Math.cos(a) * r], [0, a + PI / 2, 0.2]);
      ps.add(orb, 'G', box(0.04, 0.4, 0.04), [Math.sin(a) * (r + 0.04), (i % 2) * 0.25 + 0.07, Math.cos(a) * (r + 0.04)], [0, a, 0.2]);
    }
    const halo = c.bone('halo', 'back', [0, d.CH * 0.75, -0.55]);
    ps.add(halo, 'G', tor(0.85, 0.03, 6, 40), [0, 0, 0]);
    ps.add(halo, 'A', tor(0.98, 0.05, 6, 40, PI * 1.2), [0, 0, 0], [0, 0, -PI * 0.1]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; ps.add(halo, 'S', cone(0.06, 0.32, 5), [Math.cos(a) * 1.08, Math.sin(a) * 1.08, 0], [0, 0, a - PI / 2]); }
  }
  calcHeight(d) { return d.H + d.WH + 0.2 + d.CH + 1.1; }
  chassis(f, dt) {
    const d = this.d, t = this.time, B = this.bones;
    let py = d.H + Math.sin(t * 1.8 + this.tailT) * 0.16 - this.squash * 0.3;
    if (this.dead) py = 0.6;
    this.cy = damp(this.cy ?? py, py, this.dead ? 2.5 : 8, dt);
    B.pelvis.position.y = this.cy;
    const lean = this.dead ? 0.5 : clamp(f.localV.f * 0.03, -0.2, 0.25) - this.recoil * 0.15;
    this.ln = damp(this.ln || 0, lean, 6, dt);
    B.pelvis.rotation.set(this.ln, 0, clamp(-f.localV.s * 0.03, -0.2, 0.2));
    for (let i = 0; i < this.spine.length; i++) {
      const b = B[this.spine[i]];
      b.rotation.x = -this.ln * 0.9 + Math.sin(t * 2.6 - i * 0.8) * 0.12;
      b.rotation.z = Math.sin(t * 2.0 - i * 0.9) * 0.14;
    }
    B.orbit.rotation.y += dt * (this.dead ? 0.1 : 1.2 + (this.amp || 0) * 1.5);
    B.halo.rotation.z += dt * 0.6;
  }
}

// —— 履带战车：重型履带底盘 + 人形炮塔上身
class TankView extends UpperForm {
  prepare(d) { d.H = 1.35; d.TW = d.CW * 0.95 + 0.42; }
  buildChassis(c) {
    const { ps, d } = c; const W = d.CW, H = d.H, TW = d.TW, TL = 3.3;
    ps.add('pelvis', 'M', cyl(W * 0.55, W * 0.62, 0.3, 16), [0, 0.02, 0]);
    ps.add('pelvis', 'P', rbox(W * 1.55, 0.62, TL * 0.86, 0.1), [0, -H + 0.95, -0.1]);
    ps.add('pelvis', 'S', taper(rbox(W * 1.5, 0.55, 0.9, 0.08), 1, 0.4, 0), [0, -H + 0.86, TL * 0.47], [0.5, 0, 0]);
    ps.add('pelvis', 'K', rbox(W * 1.4, 0.18, TL * 0.8, 0.05), [0, -H + 0.62, -0.1]);
    ps.add('pelvis', 'A', rbox(W * 1.2, 0.06, 0.2, 0.02), [0, -H + 1.28, TL * 0.3]);
    for (const sx of [1, -1]) {
      ps.add('pelvis', 'G', rbox(0.22, 0.08, 0.04, 0.02), [sx * W * 0.55, -H + 1.0, TL * 0.47 + 0.05]);
      ps.add('pelvis', 'C', cyl(0.1, 0.12, 0.5, 10), [sx * W * 0.5, -H + 1.4, -TL * 0.42], [-0.3, 0, 0]);
      ps.add('pelvis', 'K', rbox(0.56, 0.95, TL, 0.2), [sx * TW, -H + 0.47, -0.1]);
      ps.add('pelvis', 'S', rbox(0.62, 0.46, TL * 0.92, 0.06), [sx * (TW + 0.04), -H + 0.82, -0.1]);
      ps.add('pelvis', 'A', rbox(0.64, 0.06, TL * 0.92, 0.02), [sx * (TW + 0.04), -H + 1.06, -0.1]);
      ps.add('pelvis', 'G', box(0.03, 0.04, TL * 0.6), [sx * (TW + 0.36), -H + 0.82, -0.1]);
      for (let i = 0; i < 4; i++) {
        const wb = c.bone((sx > 0 ? 'whL' : 'whR') + i, 'pelvis', [sx * (TW + 0.3), -H + 0.36, -0.1 - TL * 0.36 + i * TL * 0.24]);
        ps.add(wb, 'M', cyl(0.3, 0.3, 0.08, 12), [0, 0, 0], [0, 0, PI / 2]);
        ps.add(wb, 'C', box(0.1, 0.42, 0.08), [0, 0, 0]);
        ps.add(wb, 'C', box(0.1, 0.08, 0.42), [0, 0, 0]);
        this.wheels = this.wheels || []; this.wheels.push(wb);
      }
    }
  }
  calcHeight(d) { return d.H + d.WH + 0.2 + d.CH + 0.9; }
  chassis(f, dt) {
    const d = this.d, t = this.time, B = this.bones;
    const A = this.amp || 0;
    B.pelvis.position.y = d.H - this.squash * 0.12 + Math.sin(t * 22) * 0.012 * A;
    B.pelvis.rotation.set(this.dead ? 0.06 : clamp(-f.localV.f * 0.006, -0.04, 0.04) - this.recoil * 0.04, 0, this.dead ? 0.05 : 0);
    if (this.dead) { B.waist.rotation.x = 0.55; B.chest.rotation.y = 0.3; }
    const w = (f.localV.f / (0.3 * this.scale)) * dt; const tw = (f.localV.s / (0.3 * this.scale)) * dt * 0.4;
    for (const n of this.wheels) { const b = B[n]; b.rotation.x += n.startsWith('whL') ? w + tw : w - tw; }
  }
}

// ———————————————————— 机械犬（完整四足，武器架在肩部炮座 / 头部） ————————————————————
class DogView extends MechView {
  prepare(d, pos) {
    const L = this.design.look; const b = L.bulk, ll = L.legLen;
    d.BL = 2.5 * b; d.BW = 1.08 * b; d.BH = 0.82; d.L1 = 0.9 * ll; d.L2 = 0.95 * ll; d.H = 1.55 * ll + 0.25;
    pos.pelvis = [0, d.H, 0]; pos.waist = [0, 0, 0]; pos.chest = [0, 0, 0];
    pos.cockpit = [0, d.BH * 0.5 + 0.02, -0.1]; pos.head = [0, 0.38, d.BL * 0.5 + 0.08]; pos.back = [0, d.BH * 0.42, -d.BL * 0.36];
    pos.shL = [d.BW * 0.5 + 0.12, d.BH * 0.32, d.BL * 0.2]; pos.shR = [-(d.BW * 0.5 + 0.12), d.BH * 0.32, d.BL * 0.2];
    pos.uaL = [0, 0, 0]; pos.uaR = [0, 0, 0]; pos.faL = [0, 0, 0]; pos.faR = [0, 0, 0]; pos.hdL = [0, -0.25, 0]; pos.hdR = [0, -0.25, 0];
  }
  buildParts(c) {
    const { ps, d, design } = c; const B = this.bones; const BL = d.BL, BW = d.BW, BH = d.BH;
    B.faL.rotation.x = B.faR.rotation.x = -PI / 2; // 武器朝前
    // 机身
    ps.add('chest', 'P', rbox(BW, BH, BL * 0.6, 0.16), [0, 0, 0.12]);
    ps.add('chest', 'S', taper(rbox(BW * 0.94, BH * 0.92, BL * 0.42, 0.14), 0.9, 1, 0), [0, -0.02, -BL * 0.3]);
    ps.add('chest', 'S', taper(rbox(BW * 0.9, BH * 0.85, 0.6, 0.1), 0.75, 1, 0), [0, -0.05, BL * 0.42], [0.25, 0, 0]);
    ps.add('chest', 'K', rbox(BW * 0.7, 0.2, BL * 0.8, 0.06), [0, -BH * 0.5, 0]);
    ps.add('chest', 'M', rbox(BW * 0.5, 0.12, BL * 0.7, 0.04), [0, BH * 0.52, -0.1]);
    for (let i = 0; i < 4; i++) ps.add('chest', i % 2 ? 'A' : 'M', rbox(BW * 0.3, 0.1, 0.18, 0.03), [0, BH * 0.58, -BL * 0.12 - i * 0.24]);
    for (const sx of [1, -1]) {
      ps.add('chest', 'G', box(0.03, 0.05, BL * 0.55), [sx * (BW * 0.5 + 0.01), 0.06, 0]);
      ps.add('chest', 'A', rbox(0.06, BH * 0.6, BL * 0.25, 0.02), [sx * (BW * 0.5 + 0.02), -0.05, BL * 0.25]);
      ps.add('chest', 'C', rod([sx * BW * 0.4, -0.2, BL * 0.3], [sx * BW * 0.4, -0.2, -BL * 0.3], 0.04));
    }
    ps.add('chest', 'M', cyl(0.28, 0.34, 0.6, 12), [0, 0.22, BL * 0.45], [0.9, 0, 0]);
    // 头部
    const hb = BW * 0.62;
    ps.add('head', 'P', rbox(hb, 0.5, 0.75, 0.14), [0, 0.02, 0.15]);
    ps.add('head', 'S', taper(rbox(hb * 0.8, 0.34, 0.6, 0.1), 0.7, 0.85, 0), [0, -0.06, 0.62]);
    ps.add('head', 'K', rbox(hb * 0.7, 0.14, 0.62, 0.05), [0, -0.27, 0.5]);
    ps.add('head', 'G', box(hb * 0.92, 0.07, 0.05), [0, 0.1, 0.5]);
    ps.add('head', 'G', box(0.1, 0.06, 0.04), [0, -0.02, 0.93]);
    for (const sx of [1, -1]) ps.add('head', 'A', plate([[0, 0], [0.3, 0], [0.08, 0.45]], 0.05, 0.01), [sx * hb * 0.32, 0.25, -0.1], [-0.3, -PI / 2, sx * 0.25]);
    const jaw = c.bone('jaw', 'head', [0, -0.2, 0.2]);
    ps.add(jaw, 'M', rbox(hb * 0.62, 0.12, 0.6, 0.04), [0, -0.06, 0.3]);
    for (let i = 0; i < 4; i++) ps.add(jaw, 'C', cone(0.035, 0.1, 5), [-hb * 0.22 + i * hb * 0.15, 0.03, 0.55]);
    // 武器：远程=肩炮；近战=颚刃 / 撞角
    const ranged = design.range === 'ranged';
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      ps.add('sh' + s, 'M', cyl(0.24, 0.3, 0.2, 12), [0, -0.05, 0]);
      ps.add('sh' + s, 'K', rbox(0.34, 0.28, 0.5, 0.06), [0, 0.12, 0]);
    }
    if (ranged) P.buildWeapons(c);
    else {
      const blade = ['blade', 'claw'].includes(design.main);
      for (const sx of [1, -1]) {
        if (blade) {
          ps.add('head', 'C', plate([[0, 0], [1.0, 0.12], [1.15, 0.3], [0.1, 0.18]], 0.035, 0.01), [sx * hb * 0.48, -0.18, 0.2], [0, -PI / 2, 0]);
          ps.add('head', 'G', box(0.02, 0.03, 0.9), [sx * (hb * 0.48 + 0.02), -0.06, 0.75]);
        } else {
          ps.add('head', 'A', taper(rbox(0.22, 0.28, 0.5, 0.06), 0.5, 0.6, 0), [sx * hb * 0.42, 0.05, 0.75]);
        }
        ps.add('sh' + (sx > 0 ? 'L' : 'R'), 'C', cone(0.1, 0.5, 6), [0, 0.3, -0.05], [-0.4, 0, 0]);
      }
      if (design.main === 'hammer' || design.main === 'fist') ps.add('head', 'M', rbox(hb * 0.9, 0.42, 0.22, 0.06), [0, 0.0, 0.98]);
      c.anchor('muzR', 'head', [0, -0.05, 1.0]); c.anchor('muzL', 'head', [0, -0.05, 1.0]);
    }
    P.buildSpecial(c); P.buildCockpit(c); P.buildBack(c);
    c.anchor('beam', 'head', [0, -0.1, 1.05]);
    if (!ranged) c.anchor('flame', 'jaw', [0, 0, 0.7]);
    // 尾巴
    this.tailNames = [];
    let parent = 'chest';
    for (let i = 0; i < 4; i++) {
      const bn = c.bone('dtail' + i, parent, i === 0 ? [0, BH * 0.25, -BL * 0.5] : [0, 0, -0.34]);
      ps.add(bn, i % 2 ? 'M' : 'P', taper(rbox(0.2 - i * 0.03, 0.18 - i * 0.025, 0.38, 0.05), 1, 1, 0), [0, 0, -0.18]);
      if (i === 3) ps.add(bn, 'G', cone(0.08, 0.3, 6), [0, 0, -0.45], [-PI / 2, 0, 0]);
      parent = bn; this.tailNames.push(bn);
    }
    // 四足
    this.legs = [];
    let i = 0;
    for (const [fz, front] of [[BL * 0.33, true], [-BL * 0.34, false]]) for (const sx of [1, -1]) {
      const hip = [sx * BW * 0.42, -0.12, fz];
      const a = c.bone('dlA' + i, 'pelvis', hip), bb = c.bone('dlB' + i, a, [0, -d.L1, 0]);
      ps.add(a, 'M', cyl(0.24, 0.24, 0.34, 12), [0, 0, 0], [0, 0, PI / 2]);
      ps.add(a, 'P', taper(rbox(0.34, d.L1, 0.44, 0.1), 0.75, 0.8, 0), [sx * 0.04, -d.L1 * 0.5, 0]);
      ps.add(a, 'S', rbox(0.1, d.L1 * 0.6, 0.36, 0.03), [sx * 0.2, -d.L1 * 0.4, 0]);
      ps.add(bb, 'M', cyl(0.16, 0.16, 0.3, 12), [0, 0, 0], [0, 0, PI / 2]);
      ps.add(bb, 'S', taper(rbox(0.22, d.L2, 0.26, 0.06), 0.8, 0.7, 0), [0, -d.L2 * 0.5, 0]);
      ps.add(bb, 'C', rod([0, -0.1, -0.15], [0, -d.L2 + 0.25, -0.12], 0.035));
      ps.add(bb, 'K', rbox(0.3, 0.16, 0.44, 0.05), [0, -d.L2 - 0.02, 0.08]);
      ps.add(bb, 'G', box(0.2, 0.03, 0.03), [0, -d.L2 + 0.04, 0.31]);
      this.legs.push({ a, b: bb, hip: new THREE.Vector3(...hip), g: (i === 0 || i === 3) ? 0 : 1, front });
      i++;
    }
    this.tailBones = [];
  }
  calcHeight(d) { return d.H + d.BH * 0.5 + 1.25; }
  get onStep() { return this._onStep; }
  set onStep(v) { this._onStep = v; }

  update(f, dt, o) {
    this.time += dt; const t = this.time; const d = this.d, B = this.bones;
    this.root.position.set(f.x, f.y, f.z); this.root.rotation.y = f.yaw;
    this.uni.uHit.value = Math.max(0, this.uni.uHit.value - dt * 6);
    this.recoil = damp(this.recoil, 0, 7, dt); this.recoilZ = damp(this.recoilZ, 0, 6, dt); this.squash = damp(this.squash, 0, 6, dt);
    this.shot[0] = damp(this.shot[0], 0, 14, dt); this.shot[1] = damp(this.shot[1], 0, 14, dt);
    // 步态
    const vf = f.localV.f, vs = f.localV.s; const spd = Math.hypot(vf, vs) || 0;
    const stride = (d.L1 + d.L2) * 0.7 * this.scale;
    if (f.grounded && !this.dead) this.phase += spd * dt / stride * PI;
    const amp = f.grounded ? clamp(spd / Math.max(2.5, f.st.mspd), 0, 1.25) : 0;
    this.amp = damp(this.amp || 0, amp, 10, dt); const A = this.amp;
    const sp = Math.floor(this.phase / PI);
    if (sp !== this.lastStep) { this.lastStep = sp; if (A > 0.25 && f.grounded && this._onStep) this._onStep(sp & 1, A); }
    // 动作
    const a = f.act; const at = a ? a.t : 0; const ad = a ? a.dur : 1; const u = a ? clamp(at / ad, 0, 1) : 0;
    let lunge = 0, pitch = 0, crouch = 0, headP = 0, jaw = 0.05, roll = 0;
    if (a && f.alive) {
      const D = a.data || {}; const hitT = D.hit ? D.hit / ad : 0.4;
      const wind = clamp(u / hitT, 0, 1), rec = clamp((u - hitT) / (1 - hitT), 0, 1);
      if (MELEE_ACTS.has(a.type)) {
        const ext = u < hitT ? -0.3 * wind : 1 - rec;
        lunge = Math.max(-0.25, ext) * (a.type === 'heavy' || a.type === 'jumppunch' ? 0.75 : 0.5); pitch = 0.18 * ext; headP = 0.35 * ext; jaw = u > hitT * 0.6 && rec < 0.6 ? 0.6 : 0.1; crouch = 0.15 * wind;
      } else if (a.type === 'block') { crouch = 0.35; headP = 0.4; pitch = 0.1; }
      else if (a.type === 'hitstun') { lunge = -0.25; pitch = -0.2; headP = -0.3; roll = this.recoilZ; }
      else if (a.type === 'dodge') { roll = -(D.side || 1) * 0.3; crouch = 0.2; }
      else if (a.type === 'leap' || a.type === 'ult_meteor') { crouch = D.phase ? (D.phase === 2 ? 0.4 : 0) : 0.45; pitch = f.vy > 0 ? -0.35 : 0.25; headP = -0.2; }
      else if (a.type === 'shoot' || a.type.startsWith('sp_') || a.type.startsWith('ult_')) { crouch = 0.2; headP = -0.1; jaw = ['sp_flame', 'sp_laser', 'ult_beam', 'ult_inferno'].includes(a.type) ? 0.7 : 0.15; pitch = -0.05 * (this.shot[0] + this.shot[1]); }
    }
    if (this.cele > 0 && f.alive) { headP = -0.7; jaw = 0.5 + Math.sin(t * 9) * 0.2; crouch = Math.max(0, Math.sin(t * 6)) * -0.15; }
    pitch += -this.recoil * 0.2; crouch += this.squash * 0.35;
    const k = 1 - Math.exp(-14 * dt);
    this.st = this.st || { lunge: 0, pitch: 0, crouch: 0, headP: 0, jaw: 0, roll: 0, hy: 0 };
    const S = this.st;
    S.lunge += (lunge - S.lunge) * k; S.pitch += (pitch - S.pitch) * k; S.crouch += (crouch - S.crouch) * k; S.headP += (headP - S.headP) * k; S.jaw += (jaw - S.jaw) * k; S.roll += (roll - S.roll) * k;
    // 头部追踪对手
    let hy = 0;
    if (o && !this.dead) { const ang = Math.atan2(o.x - f.x, o.z - f.z); let df = ang - f.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); hy = clamp(df, -0.7, 0.7); }
    S.hy += (hy - S.hy) * k * 0.6;
    // 机身
    let py = d.H - S.crouch * 0.55 + Math.abs(Math.sin(this.phase)) * 0.06 * A + Math.sin(t * 2.2) * 0.015;
    if (this.dead) py = 0.5;
    this.cy = damp(this.cy ?? py, py, this.dead ? 4 : 22, dt);
    B.pelvis.position.y = this.cy;
    B.pelvis.rotation.set(this.dead ? 0 : clamp(vf * 0.012, -0.08, 0.1) + S.pitch, 0, this.dead ? damp(B.pelvis.rotation.z, 1.25, 3, dt) : clamp(-vs * 0.015, -0.12, 0.12) + S.roll);
    B.chest.position.z = S.lunge;
    B.head.rotation.set(S.headP + Math.sin(t * 1.7) * 0.03, S.hy, 0);
    B.jaw.rotation.x = S.jaw;
    for (const s of ['L', 'R']) { B['fa' + s].rotation.x = -PI / 2 + (s === 'R' ? this.shot[0] : this.shot[1]) * 0.25 - S.pitch * 0.5; B['ua' + s].rotation.y = S.hy * 0.5; }
    for (let i = 0; i < this.tailNames.length; i++) {
      const tb = B[this.tailNames[i]]; const wag = this.cele > 0 ? 8 : 2.5 + A * 3;
      tb.rotation.set(this.dead ? 0.3 : -0.35 + i * 0.1, Math.sin(t * wag - i * 0.6) * (this.cele > 0 ? 0.5 : 0.22), 0);
    }
    // 四足 IK（对角小跑）
    const mx = spd > 0.01 ? vs / spd : 0, mz = spd > 0.01 ? vf / spd : 1;
    const step = (d.L1 + d.L2) * 0.3;
    const air = !f.grounded;
    for (const l of this.legs) {
      const A1 = B[l.a], B1 = B[l.b];
      const p = this.phase + l.g * PI;
      let fz = l.hip.z + (l.front ? 0.06 : -0.04) - S.lunge * (l.front ? 0.2 : 0.6), fy = -this.cy + 0.18;
      if (this.dead) { A1.rotation.x = damp(A1.rotation.x, l.front ? -0.9 : 0.9, 3, dt); B1.rotation.x = damp(B1.rotation.x, 0.3, 3, dt); continue; }
      if (air) { fy = -(d.L1 + d.L2) * 0.62; fz = l.hip.z + (l.front ? 0.3 : -0.3); }
      else { const off = -Math.cos(p) * step * A; fz += mz * off; fy += Math.max(0, Math.sin(p)) * 0.35 * A; A1.rotation.z = -mx * off * 0.25; }
      const [ta, tb] = ik(d.L1, d.L2, fz - l.hip.z, fy - l.hip.y, -1);
      A1.rotation.x = ta; B1.rotation.x = tb;
    }
    this.spin = damp(this.spin, a && (a.type === 'shoot' || a.type === 'ult_barrage') ? 40 : 0, 4, dt);
    for (const s of this.spinners) s.rotation.y += this.spin * dt;
    if (this.saw) this.saw.position.y = -0.05 + (this.sawOn ? Math.sin(t * 90) * 0.02 : 0);
    if (this.drill) this.drill.rotation.y += (this.sawOn ? 45 : 0) * dt;
    if (this.rider) this.rider.update(dt, f, this);
  }
}

export const FORMS = { humanoid: MechView, dog: DogView, spider: SpiderView, hover: HoverView, tank: TankView, wraith: WraithView };
export function createView(design) {
  const C = FORMS[design.form] || MechView;
  return new C(design);
}
