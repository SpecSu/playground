// v9 新机型扩展：蝠鲼 Manta / 猫虎 / 玄武龟 / 鳄鱼 / 霸王龙 / 火烈鸟 / 青蛙 / 兔子
// 复用：材质、驾驶舱（分身座位）、武器（远程肩炮 / 近战咬合锚点）、特技件、背包、全部招式与特效锚点
import * as THREE from 'three';
const _JV = new THREE.Vector3();
import { clamp, damp } from '../core/util.js';
import { MechView } from './mech.js';
import * as P from './parts.js';
import { rbox, box, cyl, sph, tor, cone, plate, rod, taper } from './geo.js';

const PI = Math.PI;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const BLz = (d, k) => d.BL * k;
function ik2(L1, L2, fwd, dy, ks) {
  const D = clamp(Math.hypot(fwd, dy), Math.abs(L1 - L2) + 0.03, L1 + L2 - 0.004);
  const psi = Math.atan2(fwd, -dy);
  const a = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const b = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  return [-(psi + ks * a), ks * (PI - b)];
}
const MELEE = new Set(['jab', 'cross', 'heavy', 'jumppunch', 'bash', 'sp_charge', 'ult_frenzy', 'sp_chainsaw', 'sp_drill', 'sp_blink', 'sp_hook', 'ult_phantom', 'ult_tornado']);
const SIDES = [[1, 'L'], [-1, 'R']];

// ———————————————— 通用整身兽形基类（动作 / 头部追踪 / 尾巴 / 武器 / 驾驶舱，子类只管造型与步态） ————————————————
class Beast extends MechView {
  prepare(d, pos) {
    const L = this.design.look; this.legs = []; this.tailNames = []; this.ears = [];
    this.shape(d, L.bulk, L.legLen, L);
    pos.pelvis = [0, d.H, 0]; pos.waist = [0, 0, 0]; pos.chest = [0, 0, 0];
    pos.cockpit = d.ck; pos.head = d.hd; pos.back = d.bk;
    pos.shL = [d.sh[0], d.sh[1], d.sh[2]]; pos.shR = [-d.sh[0], d.sh[1], d.sh[2]];
    pos.uaL = [0, 0, 0]; pos.uaR = [0, 0, 0]; pos.faL = [0, 0, 0]; pos.faR = [0, 0, 0]; pos.hdL = [0, -0.25, 0]; pos.hdR = [0, -0.25, 0];
  }
  buildParts(c) {
    const B = this.bones; B.faL.rotation.x = B.faR.rotation.x = -PI / 2; // 武器朝前
    this.body(c);
    const { ps, design } = c; const ranged = design.range === 'ranged';
    for (const [, s] of SIDES) { ps.add('sh' + s, 'M', cyl(0.24, 0.3, 0.2, 12), [0, -0.05, 0]); ps.add('sh' + s, 'K', rbox(0.34, 0.28, 0.5, 0.06), [0, 0.12, 0]); }
    const m = this.mouth || ['head', [0, -0.05, 1.0]];
    if (ranged) P.buildWeapons(c);
    else { this.melee(c); c.anchor('muzR', m[0], m[1]); c.anchor('muzL', m[0], m[1]); c.anchor('flame', m[0], m[1]); }
    c.anchor('beam', m[0], m[1]);
    P.buildSpecial(c); P.buildCockpit(c); P.buildBack(c);
  }
  // 近战武器外观：刃/爪 → 头侧刀刃；拳/锤 → 撞角；子类可覆盖
  melee(c) {
    const { ps, design } = c; const hb = this.hb || 0.6; const hz = this.hz || 0.5;
    if (['blade', 'claw'].includes(design.main)) {
      for (const [sx] of SIDES) {
        ps.add('head', 'C', plate([[0, 0], [0.9, 0.1], [1.05, 0.28], [0.1, 0.16]], 0.035, 0.01), [sx * hb * 0.52, -0.12, hz - 0.3], [0, -PI / 2, 0]);
        ps.add('head', 'G', box(0.02, 0.03, 0.8), [sx * (hb * 0.52 + 0.02), -0.02, hz + 0.1]);
      }
    } else if (design.main === 'hammer' || design.main === 'fist') ps.add('head', 'M', rbox(hb * 0.9, 0.36, 0.2, 0.06), [0, 0, hz + 0.3]);
  }
  get onStep() { return this.floating ? null : this._onStep; }
  set onStep(v) { this._onStep = v; }
  stride(d) { return (d.L1 + d.L2) * 0.7; }

  // —— 通用腿：四足 IK 腿（猫虎）
  ikLeg(c, i, hip, L1, L2, front, sx, W, ks = -1, claws = 0) {
    const { ps } = c;
    const a = c.bone('xA' + i, 'pelvis', hip), b = c.bone('xB' + i, a, [0, -L1, 0]);
    ps.add(a, 'M', cyl(W * 0.5, W * 0.5, W * 0.7, 12), [0, 0, 0], [0, 0, PI / 2]);
    ps.add(a, 'P', taper(rbox(W, L1, W * 1.2, 0.1), 0.72, 0.8, 0), [sx * 0.03, -L1 * 0.5, 0]);
    ps.add(a, 'S', rbox(W * 0.3, L1 * 0.55, W, 0.03), [sx * W * 0.55, -L1 * 0.42, 0]);
    ps.add(b, 'M', cyl(W * 0.36, W * 0.36, W * 0.62, 12), [0, 0, 0], [0, 0, PI / 2]);
    ps.add(b, 'S', taper(rbox(W * 0.72, L2, W * 0.78, 0.07), 0.85, 0.8, 0), [0, -L2 * 0.5, 0]);
    ps.add(b, 'C', rod([0, -0.1, -W * 0.4], [0, -L2 + 0.22, -W * 0.36], 0.035));
    ps.add(b, 'K', rbox(W * 0.95, 0.2, W * 1.25, 0.06), [0, -L2 - 0.02, W * 0.2]);
    for (let k = 0; k < claws; k++) ps.add(b, 'C', cone(0.045, 0.2, 5), [(k - (claws - 1) / 2) * W * 0.3, -L2 - 0.06, W * 0.85], [PI / 2 + 0.4, 0, 0]);
    this.legs.push({ a, b, hip: V3(...hip), g: (i === 0 || i === 3) ? 0 : 1, front, ks, L1, L2 });
  }
  // —— 通用腿：外八字爬行腿（龟 / 鳄）：大腿外展，小腿竖直
  sprawlLeg(c, i, hip, L1, L2, front, sx, W, splay) {
    const { ps } = c;
    const a = c.bone('xA' + i, 'pelvis', hip), b = c.bone('xB' + i, a, [0, -L1, 0]);
    ps.add(a, 'M', sph(W * 0.55, 12, 8), [0, 0, 0]);
    ps.add(a, 'P', taper(rbox(W, L1, W * 1.05, 0.12), 0.8, 0.85, 0), [0, -L1 * 0.5, 0]);
    ps.add(b, 'M', sph(W * 0.45, 12, 8), [0, 0, 0]);
    ps.add(b, 'S', cyl(W * 0.42, W * 0.5, L2, 10), [0, -L2 * 0.5, 0]);
    ps.add(b, 'K', rbox(W * 1.15, 0.16, W * 1.35, 0.05), [0, -L2 - 0.02, W * 0.18]);
    for (let k = 0; k < 3; k++) ps.add(b, 'C', cone(0.05, 0.18, 5), [(k - 1) * W * 0.36, -L2 - 0.04, W * 0.9], [PI / 2 + 0.3, 0, 0]);
    this.legs.push({ a, b, sx, g: (i === 0 || i === 3) ? 0 : 1, front, splay, L1, L2 });
  }
  // —— 尾巴：n 节，逐节收细
  tail(c, n, start, len, w0, h0, mats = ['P', 'M'], tip = 'G', parent = 'chest', solid = false, kEnd = 0.7) {
    const { ps } = c; let p = parent;
    for (let i = 0; i < n; i++) {
      const k = 1 - i / n * kEnd;
      const bn = c.bone('xt' + i, p, i === 0 ? start : [0, 0, -len]);
      if (solid) { const k2 = 1 - (i + 1) / n * kEnd; ps.add(bn, mats[i % mats.length], taper(rbox(w0 * k, len * 1.16, h0 * k, Math.min(0.05, w0 * k * 0.3)), k2 / k, k2 / k, 0), [0, 0, -len * 0.5], [-PI / 2, 0, 0]); }
      else ps.add(bn, mats[i % mats.length], taper(rbox(w0 * k, h0 * k, len * 1.08, 0.05), 0.85, 1, 0), [0, 0, -len * 0.5], [PI / 2, 0, 0]);
      if (i === n - 1 && tip) ps.add(bn, tip, cone(w0 * k * 0.45, len * 0.7, 6), [0, 0, -len * 1.2], [-PI / 2, 0, 0]);
      p = bn; this.tailNames.push(bn);
    }
  }

  update(f, dt, o) {
    this.time += dt; const t = this.time; const d = this.d, B = this.bones;
    this.root.position.set(f.x, f.y, f.z); this.root.rotation.y = f.yaw;
    this.uni.uHit.value = Math.max(0, this.uni.uHit.value - dt * 6);
    this.recoil = damp(this.recoil, 0, 7, dt); this.recoilZ = damp(this.recoilZ, 0, 6, dt); this.squash = damp(this.squash, 0, 6, dt);
    this.shot[0] = damp(this.shot[0], 0, 14, dt); this.shot[1] = damp(this.shot[1], 0, 14, dt);
    const vf = f.localV.f, vs = f.localV.s; const spd = Math.hypot(vf, vs) || 0;
    const stride = this.stride(d) * this.scale;
    if ((f.grounded || this.floating) && !this.dead) this.phase += spd * dt / stride * PI;
    const amp = this.floating ? 0 : f.grounded ? clamp(spd / Math.max(2.5, f.st.mspd), 0, 1.25) : 0;
    this.amp = damp(this.amp || 0, amp, 10, dt); const A = this.amp;
    this.mv = damp(this.mv || 0, clamp(spd / Math.max(2.5, f.st.mspd), 0, 1.25), 6, dt);
    const sp = Math.floor(this.phase / PI);
    if (sp !== this.lastStep) { this.lastStep = sp; if (A > 0.25 && f.grounded && this._onStep && !this.floating) this._onStep(sp & 1, A); }
    // —— 动作 → 机身前冲 / 俯仰 / 下蹲 / 抬头 / 张嘴
    const a = f.act; const at = a ? a.t : 0; const ad = a ? a.dur : 1; const u = a ? clamp(at / ad, 0, 1) : 0;
    let lunge = 0, pitch = 0, crouch = 0, headP = 0, jaw = 0.05, roll = 0;
    if (a && f.alive) {
      const D = a.data || {}; const hitT = D.hit ? D.hit / ad : 0.4;
      const wind = clamp(u / hitT, 0, 1), rec = clamp((u - hitT) / (1 - hitT), 0, 1);
      if (MELEE.has(a.type)) {
        const ext = u < hitT ? -0.3 * wind : 1 - rec;
        lunge = Math.max(-0.25, ext) * (a.type === 'heavy' || a.type === 'jumppunch' ? 0.75 : 0.5); pitch = 0.18 * ext; headP = 0.35 * ext; jaw = u > hitT * 0.6 && rec < 0.6 ? 0.6 : 0.1; crouch = 0.15 * wind;
      } else if (a.type === 'block') { crouch = 0.35; headP = 0.4; pitch = 0.1; }
      else if (a.type === 'hitstun') { lunge = -0.25; pitch = -0.2; headP = -0.3; roll = this.recoilZ; }
      else if (a.type === 'dodge') { roll = -(D.side || 1) * 0.3; crouch = 0.2; }
      else if (a.type === 'leap' || a.type === 'ult_meteor') { crouch = D.phase ? (D.phase === 2 ? 0.4 : 0) : 0.45; pitch = f.vy > 0 ? -0.35 : 0.25; headP = -0.2; }
      else if (a.type === 'shoot' || a.type.startsWith('sp_') || a.type.startsWith('ult_')) { crouch = 0.2; headP = -0.1; jaw = ['sp_flame', 'sp_laser', 'ult_beam', 'ult_inferno', 'ult_blackhole', 'ult_orbital', 'ult_glacier'].includes(a.type) ? 0.7 : 0.15; pitch = -0.05 * (this.shot[0] + this.shot[1]); }
    }
    if (this.cele > 0 && f.alive) { headP = -0.5; jaw = 0.45 + Math.sin(t * 9) * 0.2; crouch = Math.max(0, Math.sin(t * 6)) * -0.12; }
    pitch += -this.recoil * 0.2; crouch += this.squash * 0.35;
    const k = 1 - Math.exp(-14 * dt);
    const S = this.st = this.st || { lunge: 0, pitch: 0, crouch: 0, headP: 0, jaw: 0, roll: 0, hy: 0 };
    S.lunge += (lunge - S.lunge) * k; S.pitch += (pitch - S.pitch) * k; S.crouch += (crouch - S.crouch) * k; S.headP += (headP - S.headP) * k; S.jaw += (jaw - S.jaw) * k; S.roll += (roll - S.roll) * k;
    let hy = 0;
    if (o && !this.dead) { const ang = Math.atan2(o.x - f.x, o.z - f.z); let df = ang - f.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); hy = clamp(df, -0.7, 0.7); }
    S.hy += (hy - S.hy) * k * 0.6;
    // —— 子类：机身高度 / 步态
    this.pose(f, dt, S, A, vf, vs, spd, t);
    B.chest.position.z = S.lunge * (this.lungeK ?? 1);
    B.head.rotation.set((S.headP + Math.sin(t * 1.7) * 0.03) * (this.headK ?? 1), S.hy * (this.headYK ?? 1), 0);
    if (B.xjaw) {
      let ja = S.jaw * (this.jawK ?? 1); B.xjaw.rotation.x = ja;
      // v10.1 张嘴防穿地：下颌尖低于地面就逐步收小开口角度（鳄鱼长吻贴地，最容易穿模）
      const tip = this.anchors.jawTip;
      // 先收嘴，嘴已合上仍低于地面（低头扑咬 / 格挡时长吻下压）再把头抬起
      if (tip && !this.dead) for (let it = 0; it < 10; it++) {
        tip.updateWorldMatrix(true, false); tip.getWorldPosition(_JV); if (_JV.y >= 0.08) break;
        if (ja > 0.03) { ja *= 0.6; B.xjaw.rotation.x = ja; } else B.head.rotation.x -= 0.07;
      }
    }
    for (const [, s] of SIDES) { B['fa' + s].rotation.x = -PI / 2 + (s === 'R' ? this.shot[0] : this.shot[1]) * 0.25 - S.pitch * 0.5; B['ua' + s].rotation.y = S.hy * 0.5; }
    // 尾巴相位按帧积分（频率随速度变化时不跳相位；旧写法 sin(t*频率) 在 t 很大时会疯狂抖动）
    const wagF = this.cele > 0 ? 8 : 2.2 + A * 3; this.wagA = damp(this.wagA ?? 0.2, (this.tailAmp ?? 0.2) * (this.cele > 0 ? 2 : 1), 4, dt); const wagA = this.wagA;
    this.wagPh = (this.wagPh || 0) + wagF * dt;
    for (let i = 0; i < this.tailNames.length; i++) {
      const tb = B[this.tailNames[i]];
      tb.rotation.set(this.dead ? 0.15 : (this.tailPitch ?? -0.1) + i * (this.tailCurl ?? 0.06), Math.sin(this.wagPh - i * 0.6) * wagA, 0);
    }
    for (const e of this.ears) { const eb = B[e.n]; eb.rotation.set((this.earBack || 0) + Math.sin(t * 2 + e.s) * 0.06, 0, e.s * (0.12 + Math.sin(t * 1.3 + e.s * 2) * 0.05)); }
    this.spin = damp(this.spin, a && (a.type === 'shoot' || a.type === 'ult_barrage') ? 40 : 0, 4, dt);
    for (const s of this.spinners) s.rotation.y += this.spin * dt;
    if (this.saw) this.saw.position.y = -0.05 + (this.sawOn ? Math.sin(t * 90) * 0.02 : 0);
    if (this.drill) this.drill.rotation.y += (this.sawOn ? 45 : 0) * dt;
    if (this.rider) this.rider.update(dt, f, this);
  }
  // 机身姿态
  body3(f, dt, S, py, vf, vs, extraPitch = 0, extraRoll = 0) {
    const B = this.bones;
    if (this.dead) py = this.deadY ?? 0.5;
    this.cy = damp(this.cy ?? py, py, this.dead ? 4 : 22, dt);
    B.pelvis.position.y = this.cy;
    B.pelvis.rotation.set(this.dead ? 0 : clamp(vf * 0.012, -0.08, 0.1) * (this.tiltK ?? 1) + S.pitch + extraPitch, 0,
      this.dead ? damp(B.pelvis.rotation.z, this.deadRoll ?? 1.2, 3, dt) : clamp(-vs * 0.015, -0.12, 0.12) + S.roll + extraRoll);
  }
  // 四足 IK 对角小跑
  trot(f, dt, S, A, vf, vs, spd, lift = 0.35, stepK = 0.3) {
    const B = this.bones; const mx = spd > 0.01 ? vs / spd : 0, mz = spd > 0.01 ? vf / spd : 1; const air = !f.grounded;
    for (const l of this.legs) {
      const A1 = B[l.a], B1 = B[l.b]; const p = this.phase + l.g * PI; const step = (l.L1 + l.L2) * stepK;
      let fz = l.hip.z + (l.front ? 0.06 : -0.04) - S.lunge * (l.front ? 0.2 : 0.6), fy = -this.cy + 0.2;
      if (this.dead) { A1.rotation.x = damp(A1.rotation.x, l.front ? -0.9 : 0.9, 3, dt); B1.rotation.x = damp(B1.rotation.x, 0.3, 3, dt); continue; }
      if (air) { fy = -(l.L1 + l.L2) * 0.62; fz = l.hip.z + (l.front ? 0.3 : -0.3); }
      else { const off = -Math.cos(p) * step * A; fz += mz * off; fy += Math.max(0, Math.sin(p)) * lift * A; A1.rotation.z = -mx * off * 0.25; }
      const [ta, tb] = ik2(l.L1, l.L2, fz - l.hip.z, fy - l.hip.y, l.ks);
      A1.rotation.x = ta; B1.rotation.x = tb;
    }
  }
  // 外八字爬行
  crawl(f, dt, A, vf, spd, swingK = 0.45, liftK = 0.45) {
    const B = this.bones; const mz = spd > 0.01 ? vf / spd : 1;
    for (const l of this.legs) {
      const A1 = B[l.a], B1 = B[l.b]; const p = this.phase + l.g * PI;
      if (this.dead) { A1.rotation.set(0, 0, damp(A1.rotation.z, l.sx * 1.4, 3, dt)); B1.rotation.z = damp(B1.rotation.z, -l.sx * 0.4, 3, dt); continue; }
      const off = -Math.cos(p) * swingK * A * mz; const lift = Math.max(0, Math.sin(p)) * liftK * A;
      A1.rotation.set(0, -l.sx * off, l.sx * (l.splay + lift)); B1.rotation.set(0, 0, -l.sx * (l.splay + lift * 0.4));
    }
  }
}

// ———————————————— 猫科（v10.1 重做）：猎豹式修长比例——深胸细腰、高腿、小头、长尾 S 形上扬，步态轻盈 ————————————————
class TigerView extends Beast {
  shape(d, b, ll) {
    const k = b * 0.62 + 0.36; d.k = k;
    d.BL = 3.05 * k; d.BW = 0.86 * k; d.BH = 0.78 * k; d.L1 = 0.98 * ll; d.L2 = 0.96 * ll; d.H = (d.L1 + d.L2) * 0.84 + 0.3; d.LW = 0.3 * k;
    d.ck = [0, d.BH * 0.62, BLz(d, 0.02)]; d.hd = [0, d.BH * 0.36, d.BL * 0.5 + 0.12]; d.bk = [0, d.BH * 0.4, -d.BL * 0.34];
    d.sh = [d.BW * 0.5 + 0.1, d.BH * 0.28, d.BL * 0.26];
    this.hb = 0.52 * k + 0.08; this.hz = 0.6; this.mouth = ['head', [0, -0.1, 0.78]]; this.headK = 0.8; this.tiltK = 0.8; this.earBack = -0.1;
  }
  body(c) {
    const { ps, d } = c; const { BL, BW, BH } = d;
    // 深胸（前） → 细腰 → 收紧后胯：三段式，侧面看是明显的猫科腰线
    ps.add('chest', 'P', taper(rbox(BW, BH * 1.08, BL * 0.4, 0.2), 0.92, 1, 0, 0.9, 0.85), [0, -BH * 0.02, BL * 0.25]);
    ps.add('chest', 'S', rbox(BW * 0.64, BH * 0.56, BL * 0.34, 0.14), [0, BH * 0.14, -BL * 0.04]);
    ps.add('chest', 'P', taper(rbox(BW * 0.9, BH * 0.86, BL * 0.3, 0.18), 0.95, 1, 0, 0.82, 0.9), [0, BH * 0.06, -BL * 0.31]);
    ps.add('chest', 'K', rbox(BW * 0.5, 0.12, BL * 0.3, 0.04), [0, -BH * 0.5, BL * 0.24]);
    // 背脊：一条细长发光脊线 + 小节甲片
    for (let i = 0; i < 7; i++) ps.add('chest', i % 2 ? 'A' : 'M', rbox(BW * 0.26, 0.07, 0.24, 0.03), [0, BH * (0.46 + (i > 1 && i < 5 ? -0.12 : 0)), BL * 0.36 - i * BL * 0.12]);
    ps.add('chest', 'G', box(0.04, 0.03, BL * 0.7), [0, BH * 0.52, 0]);
    for (const [sx] of SIDES) {
      ps.add('chest', 'S', sph(1, 16, 12), [sx * BW * 0.36, BH * 0.08, BL * 0.3], [0, 0, 0], [BW * 0.2, BH * 0.44, BL * 0.15]);   // 前肩胛
      ps.add('chest', 'S', sph(1, 16, 12), [sx * BW * 0.34, BH * 0.1, -BL * 0.32], [0, 0, 0], [BW * 0.2, BH * 0.42, BL * 0.15]); // 后胯
      for (let i = 0; i < 5; i++) ps.add('chest', 'K', rbox(0.04, BH * (0.5 - Math.abs(i - 2) * 0.06), 0.07, 0.015), [sx * (BW * (i > 1 && i < 4 ? 0.34 : 0.48) + 0.02), BH * 0.1, BL * (0.2 - i * 0.12)], [0.5, 0, 0]); // 斑纹
      ps.add('chest', 'G', box(0.025, 0.035, BL * 0.34), [sx * (BW * 0.5 + 0.01), BH * 0.26, BL * 0.22]);
    }
    ps.add('chest', 'M', cyl(0.2, 0.26, 0.5, 12), [0, BH * 0.22, BL * 0.47], [1.1, 0, 0]); // 修长颈
    // 头：小而尖的楔形猫头 + 立耳 + 杏仁眼
    const hb = this.hb;
    ps.add('head', 'P', taper(rbox(hb, 0.42, 0.54, 0.16), 0.86, 0.9, 0), [0, 0.04, 0.12]);
    ps.add('head', 'S', taper(rbox(hb * 0.6, 0.24, 0.34, 0.09), 0.7, 0.8, 0), [0, -0.06, 0.48]);
    ps.add('head', 'K', rbox(hb * 0.24, 0.1, 0.08, 0.03), [0, 0.0, 0.66]);
    ps.add('head', 'A', taper(rbox(hb * 0.8, 0.07, 0.36, 0.03), 0.7, 1, 0), [0, 0.23, 0.14]);
    for (const [sx] of SIDES) {
      ps.add('head', 'G', plate([[0, 0], [0.2, 0.04], [0.17, 0.09], [0.02, 0.06]], 0.035, 0.008), [sx * hb * 0.14, 0.1, 0.39], [0, 0, sx > 0 ? -0.15 : PI + 0.15]);
      ps.add('head', 'S', sph(0.13, 10, 8), [sx * hb * 0.42, -0.06, 0.22], [0, 0, 0], [0.6, 0.9, 1]);
      const ear = c.bone('xear' + (sx > 0 ? 'L' : 'R'), 'head', [sx * hb * 0.32, 0.22, 0.0]);
      ps.add(ear, 'P', plate([[0, 0], [0.24, 0], [0.1, 0.36]], 0.05, 0.012), [-0.1, 0, 0.02], [-0.15, 0, 0]);
      ps.add(ear, 'G', plate([[0, 0], [0.12, 0], [0.05, 0.2]], 0.02, 0.004), [-0.05, 0.03, 0.05], [-0.15, 0, 0]);
      this.ears.push({ n: ear, s: sx });
    }
    const jaw = c.bone('xjaw', 'head', [0, -0.16, 0.22]);
    ps.add(jaw, 'M', taper(rbox(hb * 0.5, 0.1, 0.4, 0.04), 0.8, 1, 0), [0, -0.04, 0.18]);
    for (const [sx] of SIDES) ps.add('head', 'C', cone(0.03, 0.18, 6), [sx * hb * 0.16, -0.22, 0.56], [PI, 0, 0]);
    // 长尾：9 节，细长，S 形上扬
    this.tail(c, 10, [0, BH * 0.32, -BL * 0.46], 0.3, 0.17, 0.19, ['P', 'K'], 'G', 'chest', true, 0.55);
    this.tailPitch = 0.42; this.tailCurl = -0.11; this.tailAmp = 0.3;
    let i = 0;
    for (const [fz, front] of [[BL * 0.3, true], [-BL * 0.33, false]]) for (const [sx] of SIDES) this.ikLeg(c, i++, [sx * BW * 0.32, -0.1, fz], d.L1, d.L2, front, sx, d.LW, front ? -1 : 1, 3);
  }
  calcHeight(d) { return d.H + d.BH * 0.5 + 1.25; }
  stride(d) { return (d.L1 + d.L2) * 0.95; }
  cockpitScale() { return 1.36; } // v10.1：座舱世界尺度对齐其他体型
  pose(f, dt, S, A, vf, vs, spd, t) {
    const d = this.d; const py = d.H - S.crouch * 0.6 + Math.abs(Math.sin(this.phase)) * 0.09 * A + Math.sin(t * 1.6) * 0.012;
    // 奔跑时脊柱伸缩（前后身交替俯仰），待机时轻微压低前身——猫科的“潜伏”感
    const flex = Math.sin(this.phase * 2) * 0.05 * A - (1 - A) * 0.03;
    this.body3(f, dt, S, py, vf, vs, flex);
    this.trot(f, dt, S, A, vf, vs, spd, 0.42, 0.36);
  }
}

// ———————————————— 玄武龟：大圆顶龟甲（六角甲片）+ 外八字粗腿 + 蛇形尾 ————————————————
class TurtleView extends Beast {
  cockpitScale() { return 1.0; } // v10.1：龟整体放大 1.32，座舱不跟着放大，与其他体型对齐
  shape(d, b, ll) {
    const k = b * 1.0 + 0.2; d.k = k;
    d.L1 = 0.5 * ll; d.L2 = 0.62 * ll; d.SP = 0.95; d.H = d.L1 * Math.cos(d.SP) + d.L2 + 0.32; d.LW = 0.46 * k;
    d.ck = [0, 0.66 * k, -0.08]; d.hd = [0, 0.02, 1.5 * k + 0.12]; d.bk = [0, 0.55 * k, -0.9 * k];
    d.sh = [1.05 * k, 0.42 * k, 0.45 * k];
    this.hb = 0.62; this.hz = 0.5; this.mouth = ['head', [0, -0.08, 0.85]]; this.deadRoll = 0.45; this.deadY = 0.45; this.tiltK = 0.4; this.lungeK = 0.5;
  }
  body(c) {
    const { ps, d } = c; const k = d.k; const RX = 1.28 * k, RY = 0.82 * k, RZ = 1.5 * k;
    ps.add('chest', 'P', sph(1, 28, 14, 0, PI * 2, 0, PI * 0.5), [0, 0, 0], [0, 0, 0], [RX, RY, RZ]);
    ps.add('chest', 'K', cyl(1, 1, 0.22, 28), [0, -0.06, 0], [0, 0, 0], [RX * 1.04, 1, RZ * 1.04]);
    ps.add('chest', 'A', tor(1, 0.035, 6, 40), [0, 0.06, 0], [PI / 2, 0, 0], [RX * 1.05, RZ * 1.05, 1]);
    ps.add('chest', 'S', rbox(RX * 1.5, 0.22, RZ * 1.6, 0.08), [0, -0.24, 0]);
    // 六角甲片：沿椭球面摆放
    const plates = [[0, 0], [0.55, 0], [0.55, PI / 3], [0.55, 2 * PI / 3], [0.55, PI], [0.55, 4 * PI / 3], [0.55, 5 * PI / 3]];
    plates.forEach(([r, ang], i) => {
      const x = Math.sin(ang) * r, z = Math.cos(ang) * r, y = Math.sqrt(Math.max(0.02, 1 - x * x - z * z));
      const n = V3(x / RX, y / RY, z / RZ).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), n); const e = new THREE.Euler().setFromQuaternion(q);
      ps.add('chest', i === 0 ? 'M' : (i % 2 ? 'S' : 'M'), cyl(0.36 * k, 0.4 * k, 0.1, 6), [x * RX, y * RY + 0.01, z * RZ], [e.x, e.y, e.z]);
      if (i === 0) ps.add('chest', 'G', cyl(0.12, 0.12, 0.13, 6), [0, RY + 0.03, 0]);
    });
    for (let i = 0; i < 10; i++) { const ang = i / 10 * PI * 2; ps.add('chest', i % 2 ? 'M' : 'K', rbox(0.22, 0.1, 0.16, 0.03), [Math.sin(ang) * RX * 1.02, 0.08, Math.cos(ang) * RZ * 1.02], [0, ang, 0]); }
    // 头 + 颈
    ps.add('chest', 'M', cyl(0.24, 0.3, 0.6, 12), [0, 0.0, RZ * 0.96], [PI / 2 - 0.15, 0, 0]);
    ps.add('head', 'P', rbox(0.6, 0.44, 0.72, 0.18), [0, 0.04, 0.26]);
    ps.add('head', 'S', taper(rbox(0.46, 0.26, 0.34, 0.1), 0.8, 0.7, 0), [0, -0.04, 0.68]);
    ps.add('head', 'A', rbox(0.66, 0.1, 0.3, 0.04), [0, 0.26, 0.2]);
    for (const [sx] of SIDES) ps.add('head', 'G', sph(0.07, 10, 8), [sx * 0.25, 0.1, 0.5]);
    const jaw = c.bone('xjaw', 'head', [0, -0.16, 0.2]); ps.add(jaw, 'M', rbox(0.46, 0.12, 0.55, 0.05), [0, -0.04, 0.26]);
    // 蛇尾（玄武）
    this.tail(c, 6, [0, -0.05, -RZ * 0.95], 0.3, 0.22, 0.2, ['A', 'M'], null);
    const tb = this.tailNames[this.tailNames.length - 1];
    ps.add(tb, 'P', rbox(0.2, 0.14, 0.28, 0.06), [0, 0, -0.44]); ps.add(tb, 'G', box(0.16, 0.03, 0.04), [0, 0.06, -0.52]);
    this.tailPitch = -0.08; this.tailCurl = 0.04; this.tailAmp = 0.35;
    let i = 0;
    for (const [fz, front] of [[RZ * 0.55, true], [-RZ * 0.55, false]]) for (const [sx] of SIDES) this.sprawlLeg(c, i++, [sx * RX * 0.78, -0.18, fz], d.L1, d.L2, front, sx, d.LW, d.SP);
  }
  calcHeight(d) { return d.H + 0.82 * d.k + 1.25; }
  stride(d) { return 1.0; }
  pose(f, dt, S, A, vf, vs, spd, t) {
    const d = this.d; const py = d.H - S.crouch * 0.4 + Math.abs(Math.sin(this.phase)) * 0.04 * A;
    this.body3(f, dt, S, py, vf, vs, 0, Math.sin(this.phase) * 0.03 * A); this.crawl(f, dt, A, vf, spd, 0.4, 0.35);
  }
}

// ———————————————— 鳄鱼（v10.1 重做）：扁平低趴的长条身——窄而薄的背甲带两排骨板、超长扁吻、粗长侧扁尾、外八字短腿 ————————————————
class CrocView extends Beast {
  cockpitScale() { return 1.25; }
  shape(d, b, ll) {
    const k = b * 0.6 + 0.4; d.k = k;
    d.BL = 3.5 * k; d.BW = 1.08 * k; d.BH = 0.5 * k; d.L1 = 0.42 * ll; d.L2 = 0.34 * ll; d.SP = 1.2; d.H = d.L1 * Math.cos(d.SP) + d.L2 + 0.22; d.LW = 0.3 * k;
    d.ck = [0, d.BH * 0.5 + 0.02, -0.05]; d.hd = [0, 0.0, d.BL * 0.5 + 0.02]; d.bk = [0, d.BH * 0.45, -d.BL * 0.36];
    d.sh = [d.BW * 0.5 + 0.1, d.BH * 0.3, d.BL * 0.26];
    this.hb = 0.62 * k; this.hz = 1.0; this.mouth = ['head', [0, -0.06, 1.9]]; this.tiltK = 0.4; this.deadRoll = 1.4; this.deadY = 0.3;
    this.headK = 0.45; this.jawK = 0.9; // v10.1：长吻开口幅度收小
  }
  body(c) {
    const { ps, d } = c; const { BL, BW, BH, k } = d;
    // 扁平纺锤形躯干：中段最宽，两头收窄（俯视是鳄鱼的“梭形”）
    ps.add('chest', 'P', taper(rbox(BW, BH, BL * 0.56, 0.16), 1, 1, 0, 1, 1), [0, 0, 0]);
    ps.add('chest', 'P', taper(rbox(BW, BH * 0.9, BL * 0.26, 0.14), 1, 1, 0), [0, -BH * 0.02, BL * 0.36]);
    ps.add('chest', 'S', taper(rbox(BW * 0.92, BH * 0.86, BL * 0.26, 0.14), 1, 1, 0), [0, -BH * 0.02, -BL * 0.36]);
    ps.add('chest', 'K', rbox(BW * 0.84, 0.1, BL * 0.92, 0.04), [0, -BH * 0.5, 0]);
    // 侧腹护板（低而长的一条）
    for (const [sx] of SIDES) { ps.add('chest', 'A', rbox(0.06, BH * 0.36, BL * 0.7, 0.02), [sx * BW * 0.52, -BH * 0.08, 0]); ps.add('chest', 'G', box(0.025, 0.03, BL * 0.62), [sx * (BW * 0.52 + 0.03), BH * 0.08, 0]); }
    // 背甲：横向甲板条 + 两排纵向骨棱（鳄鱼最标志的“骨板背”）
    for (let i = 0; i < 9; i++) {
      const z = BL * 0.42 - i * BL * 0.105;
      ps.add('chest', i % 2 ? 'S' : 'M', rbox(BW * 0.78, 0.06, BL * 0.085, 0.02), [0, BH * 0.52, z]);
      for (const [sx] of SIDES) ps.add('chest', i % 3 === 1 ? 'A' : 'K', taper(rbox(0.1, 0.16, 0.2, 0.02), 0.2, 0.6, 0), [sx * BW * 0.2, BH * 0.6, z]);
    }
    // 长扁吻：头部前段又长又窄又薄，侧面看是一根“铲子”
    ps.add('head', 'P', taper(rbox(0.9 * k, 0.4, 0.6, 0.12), 0.85, 1, 0), [0, 0.04, 0.2]);
    ps.add('head', 'S', taper(rbox(0.58 * k, 0.2, 1.5, 0.06), 1, 1, 0, 1, 1), [0, -0.04, 1.18], [0, 0, 0], [1, 1, 1]);
    ps.add('head', 'A', rbox(0.66 * k, 0.08, 0.22, 0.03), [0, 0.06, 1.86]); // 吻端鼻垫
    ps.add('head', 'K', rbox(0.56 * k, 0.05, 1.4, 0.02), [0, -0.15, 1.16]);
    for (const [sx] of SIDES) {
      ps.add('head', 'M', sph(0.13, 10, 8), [sx * 0.28 * k, 0.28, 0.24]); ps.add('head', 'G', sph(0.07, 8, 6), [sx * 0.28 * k, 0.32, 0.32]); // 凸起眼包
      for (let i = 0; i < 7; i++) ps.add('head', 'C', cone(0.03, 0.12, 4), [sx * 0.27 * k, -0.18, 0.55 + i * 0.19], [PI, 0, 0]);
    }
    const jaw = c.bone('xjaw', 'head', [0, -0.14, 0.18]);
    ps.add(jaw, 'M', taper(rbox(0.56 * k, 0.12, 1.75, 0.04), 1, 1, 0), [0, -0.04, 0.9]);
    c.anchor('jawTip', jaw, [0, -0.12, 1.78]);
    for (const [sx] of SIDES) for (let i = 0; i < 7; i++) ps.add(jaw, 'C', cone(0.028, 0.11, 4), [sx * 0.25 * k, 0.05, 0.45 + i * 0.2]);
    // 粗长侧扁尾：8 节，根部与躯干同宽、竖向扁平，顶上两排骨棱汇成一排
    this.tail(c, 8, [0, 0.02, -BL * 0.48], 0.44, 0.62 * k, 0.5 * k, ['P', 'S'], 'M', 'chest', true, 0.8);
    this.tailNames.forEach((tn, i) => { const h = 0.48 * k * (1 - i / 8 * 0.7); ps.add(tn, i % 2 ? 'A' : 'K', taper(rbox(0.06, 0.18, 0.24, 0.02), 0.2, 0.6, 0), [0, h * 0.5 + 0.06, -0.2]); });
    this.tailPitch = 0.02; this.tailCurl = 0.005; this.tailAmp = 0.28;
    let i = 0;
    for (const [fz, front] of [[BL * 0.3, true], [-BL * 0.28, false]]) for (const [sx] of SIDES) this.sprawlLeg(c, i++, [sx * BW * 0.48, -0.1, fz], d.L1, d.L2, front, sx, d.LW, d.SP);
  }
  calcHeight(d) { return d.H + d.BH * 0.5 + 1.25; }
  stride(d) { return 1.0; }
  pose(f, dt, S, A, vf, vs, spd, t) {
    const d = this.d; const py = d.H - S.crouch * 0.18 + Math.abs(Math.sin(this.phase)) * 0.02 * A;
    this.body3(f, dt, S, py, vf, vs); this.crawl(f, dt, A, vf, spd, 0.55, 0.32);
    // 身体左右扭动（爬行蛇形），尾巴随之反向摆
    this.bones.chest.rotation.y = Math.sin(this.phase) * 0.14 * A;
  }
}

// ———————————————— 双足兽形：霸王龙 / 火烈鸟共用（左右交替 IK + 落脚） ————————————————
class Biped extends Beast {
  bipedLeg(c, i, hip, L1, L2, sx, W, ks, style) {
    const { ps } = c;
    const a = c.bone('xA' + i, 'pelvis', hip), b = c.bone('xB' + i, a, [0, -L1, 0]), ft = c.bone('xF' + i, b, [0, -L2, 0]);
    if (style === 'rex') {
      ps.add(a, 'M', sph(W * 0.62, 14, 10), [0, 0, 0]);
      ps.add(a, 'P', taper(rbox(W * 1.1, L1 * 1.05, W * 1.4, 0.16), 0.7, 0.75, 0), [0, -L1 * 0.48, 0]);
      ps.add(a, 'S', rbox(W * 0.25, L1 * 0.6, W * 1.1, 0.03), [sx * W * 0.58, -L1 * 0.42, 0]);
      ps.add(b, 'M', cyl(W * 0.36, W * 0.36, W * 0.7, 12), [0, 0, 0], [0, 0, PI / 2]);
      ps.add(b, 'S', taper(rbox(W * 0.66, L2, W * 0.75, 0.08), 0.8, 0.8, 0), [0, -L2 * 0.5, 0]);
      ps.add(b, 'C', rod([0, -0.12, -W * 0.45], [0, -L2 + 0.2, -W * 0.4], 0.045));
      ps.add(ft, 'K', rbox(W * 1.0, 0.18, W * 1.7, 0.06), [0, -0.1, W * 0.45]);
      for (let k = 0; k < 3; k++) ps.add(ft, 'C', cone(0.06, 0.24, 5), [(k - 1) * W * 0.36, -0.12, W * 1.35], [PI / 2 + 0.2, (k - 1) * 0.3, 0]);
    } else { // 火烈鸟：细长腿 + 反关节膝球 + 蹼足
      ps.add(a, 'M', sph(W * 1.2, 12, 8), [0, 0, 0]);
      ps.add(a, 'S', cyl(W * 0.65, W * 0.5, L1, 10), [0, -L1 * 0.5, 0]);
      ps.add(b, 'K', sph(W * 0.95, 12, 8), [0, 0, 0]);
      ps.add(b, 'P', cyl(W * 0.5, W * 0.42, L2, 10), [0, -L2 * 0.5, 0]);
      ps.add(b, 'A', cyl(W * 0.62, W * 0.62, 0.1, 10), [0, -L2 * 0.35, 0]);
      ps.add(ft, 'K', sph(W * 0.7, 10, 8), [0, 0, 0]);
      ps.add(ft, 'M', plate([[0, 0], [-0.22, 0.42], [0, 0.5], [0.22, 0.42]], 0.04, 0.01), [0, -0.06, 0.02], [PI / 2, 0, 0]);
    }
    this.legs.push({ a, b, ft, hip: V3(...hip), g: i % 2, ks, L1, L2, i });
  }
  walk2(f, dt, S, A, vf, vs, spd, stepK, lift, oneLeg = false) {
    const B = this.bones; const mz = spd > 0.01 ? vf / spd : 1, mx = spd > 0.01 ? vs / spd : 0; const air = !f.grounded;
    for (const l of this.legs) {
      const A1 = B[l.a], B1 = B[l.b], F1 = B[l.ft]; const p = this.phase + l.g * PI; const step = (l.L1 + l.L2) * stepK;
      if (this.dead) { A1.rotation.x = damp(A1.rotation.x, -0.6 - l.g * 0.6, 3, dt); B1.rotation.x = damp(B1.rotation.x, l.ks * 0.9, 3, dt); continue; }
      let fz = l.hip.z + 0.08 - S.lunge * 0.4, fy = -this.cy + this.footH;
      if (air) { fy = -(l.L1 + l.L2) * 0.7; fz = l.hip.z + (l.g ? -0.2 : 0.3); }
      else {
        const off = -Math.cos(p) * step * A; fz += mz * off; fy += Math.max(0, Math.sin(p)) * lift * A; A1.rotation.z = -mx * off * 0.2;
        if (oneLeg && l.g === 0) { const w = this.oneLeg || 0; fy += w * (l.L1 + l.L2) * 0.45; fz += w * 0.15; }
      }
      const [ta, tb] = ik2(l.L1, l.L2, fz - l.hip.z, fy - l.hip.y, l.ks);
      A1.rotation.x = ta; B1.rotation.x = tb; F1.rotation.x = -(ta + tb) - B.pelvis.rotation.x;
    }
  }
}

class RexView extends Biped {
  cockpitScale() { return 1.06; } // v10.1：整体缩到 1.25 倍后补偿，座舱世界尺度与其他体型一致（≈1.4）
  shape(d, b, ll) {
    const k = b * 0.95 + 0.14; d.k = k;
    d.L1 = 1.0 * ll; d.L2 = 1.05 * ll; d.LW = 0.5 * k; this.footH = 0.2; d.H = (d.L1 + d.L2) * 0.88 + 0.12 + 0.25;
    d.ck = [0, 0.84 * k, -0.5 * k]; d.hd = [0, 0.86 * k, 1.75 * k]; d.bk = [0, 0.55 * k, -1.05 * k]; // v10.1：座舱抬高、头部略压低前伸，正面机位分身不被恐龙头挡住
    d.sh = [0.66 * k, 0.15 * k, 0.55 * k];
    this.hb = 0.85; this.hz = 0.7; this.mouth = ['head', [0, -0.25, 1.2]]; this.deadY = 0.7; this.headK = 0.7;
  }
  body(c) {
    const { ps, d } = c; const k = d.k;
    ps.add('chest', 'P', sph(1, 20, 14), [0, 0.05, 0.1 * k], [-0.18, 0, 0], [0.78 * k, 0.72 * k, 1.4 * k]);
    ps.add('chest', 'S', rbox(1.2 * k, 0.5 * k, 1.5 * k, 0.16), [0, 0.32 * k, -0.05], [-0.1, 0, 0]);
    ps.add('chest', 'K', rbox(0.95 * k, 0.24, 1.6 * k, 0.08), [0, -0.5 * k, 0.1]);
    for (let i = 0; i < 5; i++) ps.add('chest', i % 2 ? 'A' : 'M', plate([[0, 0], [0.32, 0], [0.16, 0.3]], 0.06, 0.015), [0, 0.62 * k + (i < 2 ? 0 : -0.04 * i), 0.5 * k - i * 0.42 * k], [0, PI / 2, 0]);
    for (const [sx] of SIDES) ps.add('chest', 'G', box(0.03, 0.05, 1.2 * k), [sx * (0.75 * k + 0.02), 0.1, 0.05]);
    // 颈
    ps.add('chest', 'M', cyl(0.34 * k, 0.5 * k, 1.0 * k, 12), [0, 0.6 * k, 1.2 * k], [0.7, 0, 0]);
    ps.add('chest', 'S', rbox(0.5 * k, 0.16, 0.9 * k, 0.05), [0, 0.92 * k, 1.12 * k], [-0.7, 0, 0]);
    // 小短手（萌点）
    for (const [sx] of SIDES) {
      const ar = c.bone('xarm' + (sx > 0 ? 'L' : 'R'), 'chest', [sx * 0.5 * k, -0.1 * k, 1.2 * k]);
      ps.add(ar, 'M', sph(0.12, 10, 8), [0, 0, 0]); ps.add(ar, 'S', rbox(0.14, 0.36, 0.16, 0.05), [0, -0.16, 0.06], [0.5, 0, 0]);
      ps.add(ar, 'K', rbox(0.12, 0.26, 0.12, 0.04), [0, -0.3, 0.24], [-0.6, 0, 0]);
      for (let j = 0; j < 2; j++) ps.add(ar, 'C', cone(0.03, 0.1, 4), [(j - 0.5) * 0.06, -0.38, 0.36], [PI / 2 + 0.6, 0, 0]);
    }
    // 巨头
    ps.add('head', 'P', rbox(0.88, 0.72, 1.1, 0.22), [0, 0.06, 0.38]);
    ps.add('head', 'S', taper(rbox(0.72, 0.42, 0.6, 0.12), 0.85, 0.8, 0), [0, -0.04, 1.0]);
    ps.add('head', 'A', rbox(0.94, 0.1, 0.5, 0.04), [0, 0.38, 0.45]);
    for (const [sx] of SIDES) {
      ps.add('head', 'K', plate([[0, 0], [0.34, 0.04], [0.3, 0.14], [0, 0.1]], 0.05, 0.01), [sx * 0.42, 0.2, 0.62], [0, 0, sx > 0 ? -0.15 : PI + 0.15]);
      ps.add('head', 'G', box(0.04, 0.06, 0.16), [sx * 0.45, 0.2, 0.7]);
      for (let i = 0; i < 5; i++) ps.add('head', 'C', cone(0.04, 0.16, 4), [sx * 0.3, -0.24, 0.6 + i * 0.13], [PI, 0, 0]);
    }
    const jaw = c.bone('xjaw', 'head', [0, -0.26, 0.05]);
    ps.add(jaw, 'M', taper(rbox(0.74, 0.22, 1.08, 0.06), 0.85, 0.9, 0), [0, -0.08, 0.52]);
    for (const [sx] of SIDES) for (let i = 0; i < 4; i++) ps.add(jaw, 'C', cone(0.035, 0.13, 4), [sx * 0.28, 0.06, 0.55 + i * 0.14]);
    this.tail(c, 6, [0, 0.18 * k, -1.2 * k], 0.62 * k, 0.95 * k, 0.85 * k, ['P', 'S'], 'A');
    this.tailNames.forEach((tn, i) => { if (i < 4) ps.add(tn, i % 2 ? 'M' : 'A', plate([[0, 0], [0.26, 0], [0.13, 0.24]], 0.05, 0.012), [0, 0.42 * k * (1 - i * 0.15), -0.3 * k], [0, PI / 2, 0]); });
    this.tailPitch = -0.02; this.tailCurl = -0.02; this.tailAmp = 0.16;
    let i = 0; for (const [sx] of SIDES) this.bipedLeg(c, i++, [sx * 0.62 * k, -0.25 * k, -0.15 * k], d.L1, d.L2, sx, d.LW, 1, 'rex');
  }
  calcHeight(d) { return d.H + 0.62 * d.k + 1.3; }
  stride(d) { return (d.L1 + d.L2) * 0.9; }
  pose(f, dt, S, A, vf, vs, spd, t) {
    const d = this.d; const py = d.H - S.crouch * 0.6 - Math.abs(Math.cos(this.phase)) * 0.08 * A + 0.06 * A + Math.sin(t * 1.6) * 0.02;
    this.body3(f, dt, S, py, vf, vs, -0.06, Math.sin(this.phase) * 0.06 * A);
    this.walk2(f, dt, S, A, vf, vs, spd, 0.32, 0.4);
    const B = this.bones; for (const s of ['L', 'R']) if (B['xarm' + s]) B['xarm' + s].rotation.x = Math.sin(t * 3 + (s === 'L' ? 0 : 1.5)) * 0.15 + (this.cele > 0 ? Math.sin(t * 10) * 0.5 : 0);
  }
}

class FlamingoView extends Biped {
  shape(d, b, ll) {
    const k = b * 0.82 + 0.12; d.k = k;
    d.L1 = 1.15 * ll; d.L2 = 1.3 * ll; d.LW = 0.12; this.footH = 0.08; d.H = (d.L1 + d.L2) * 0.9 + 0.1;
    d.ck = [0, 0.56 * k, -0.2 * k]; d.hd = [0, 1.55 * k, 1.05 * k]; d.bk = [0, 0.5 * k, -0.8 * k];
    d.sh = [0.82 * k, -0.05, 0.1];
    this.hb = 0.36; this.hz = 0.3; this.mouth = ['head', [0, -0.1, 0.55]]; this.deadY = 0.6; this.headK = 0.6; this.headYK = 0.6; this.oneLeg = 0;
  }
  body(c) {
    const { ps, d } = c; const k = d.k;
    ps.add('chest', 'P', sph(1, 22, 14), [0, 0, 0], [-0.08, 0, 0], [0.8 * k, 0.66 * k, 1.12 * k]);
    ps.add('chest', 'K', rbox(0.9 * k, 0.16, 1.1 * k, 0.06), [0, -0.52 * k, 0]);
    // 翅：分层羽片
    for (const [sx] of SIDES) for (let j = 0; j < 3; j++) {
      ps.add('chest', j === 2 ? 'A' : (j ? 'S' : 'M'), plate([[0, 0], [1.25 - j * 0.2, -0.1], [1.15 - j * 0.2, 0.22], [0, 0.42]], 0.05, 0.015),
        [sx * (0.66 * k + j * 0.03), 0.22 * k - j * 0.1, 0.45 * k - j * 0.06], [0.15, sx > 0 ? -PI / 2 - 0.08 : PI / 2 + 0.08, 0], [k, k, k]);
    }
    for (let j = 0; j < 4; j++) ps.add('chest', j % 2 ? 'A' : 'S', plate([[0, 0], [0.16, 0], [0.08, 0.7]], 0.04, 0.01), [(j - 1.5) * 0.14 * k, 0.12 * k, -1.0 * k], [-PI / 2 + 0.5, 0, (j - 1.5) * 0.2]);
    for (const [sx] of SIDES) ps.add('chest', 'G', box(0.03, 0.04, 0.9 * k), [sx * (0.8 * k + 0.02), 0, 0]);
    // S 形长颈（静态管段）+ 颈环
    const pts = [[0, 0.3, 0.85], [0, 0.85, 1.1], [0, 1.2, 0.85], [0, 1.45, 1.0]].map((p) => p.map((v) => v * k));
    for (let i = 0; i < pts.length - 1; i++) ps.add('chest', i % 2 ? 'P' : 'S', rod(pts[i], pts[i + 1], 0.13 * k, 10));
    for (let i = 1; i < pts.length - 1; i++) { ps.add('chest', 'M', sph(0.16 * k, 10, 8), pts[i]); ps.add('chest', 'A', tor(0.15 * k, 0.03, 6, 16), pts[i], [PI / 2, 0, 0]); }
    // 头 + 弯喙
    ps.add('head', 'P', sph(1, 14, 10), [0, 0, 0.05], [0, 0, 0], [0.22, 0.24, 0.3]);
    ps.add('head', 'S', taper(rbox(0.18, 0.16, 0.34, 0.05), 0.7, 0.8, 0), [0, -0.02, 0.36], [0.25, 0, 0]);
    ps.add('head', 'K', taper(rbox(0.12, 0.2, 0.12, 0.04), 0.6, 0.6, 0), [0, -0.16, 0.5], [0.5, 0, 0]);
    for (const [sx] of SIDES) ps.add('head', 'G', sph(0.05, 8, 6), [sx * 0.17, 0.06, 0.12]);
    ps.add('head', 'A', plate([[0, 0], [0.1, 0.25], [-0.02, 0.32]], 0.04, 0.01), [0, 0.18, -0.08], [0, PI / 2, -0.4]);
    const jaw = c.bone('xjaw', 'head', [0, -0.1, 0.25]); ps.add(jaw, 'M', taper(rbox(0.12, 0.06, 0.26, 0.02), 0.7, 0.7, 0), [0, -0.02, 0.12], [0.3, 0, 0]);
    let i = 0; for (const [sx] of SIDES) this.bipedLeg(c, i++, [sx * 0.3 * k, -0.45 * k, 0.0], d.L1, d.L2, sx, d.LW, -1, 'bird');
  }
  // 远程武器挂在翅下；近战 = 喙刺
  melee(c) {
    const { ps, design } = c;
    if (['blade', 'claw'].includes(design.main)) ps.add('head', 'C', cone(0.05, 0.5, 6), [0, -0.08, 0.68], [PI / 2, 0, 0]);
    else ps.add('head', 'M', sph(0.12, 10, 8), [0, -0.08, 0.55]);
  }
  calcHeight(d) { return d.H + 1.7 * d.k + 0.3; }
  stride(d) { return (d.L1 + d.L2) * 0.85; }
  pose(f, dt, S, A, vf, vs, spd, t) {
    const d = this.d;
    const idle = !f.act && A < 0.08 && f.grounded && !this.dead && !(this.cele > 0);
    this.oneLeg = damp(this.oneLeg, idle ? 1 : 0, 3, dt);
    const py = d.H - S.crouch * 0.7 - Math.abs(Math.cos(this.phase)) * 0.05 * A + Math.sin(t * 1.4) * 0.025;
    this.body3(f, dt, S, py, vf, vs, 0, Math.sin(this.phase) * 0.05 * A + this.oneLeg * -0.03);
    this.walk2(f, dt, S, A, vf, vs, spd, 0.3, 0.5, true);
    this.bones.head.position.y = d.hd[1] + Math.sin(this.phase * 2) * 0.04 * A;
  }
}

// ———————————————— 跳跃兽形：青蛙 / 兔子共用（一跳 = 一个相位周期，落地触发脚步） ————————————————
class Hopper extends Beast {
  hopY(A) { const p = (this.phase / PI) % 1; return { p, y: Math.sin(p * PI) * this.hopH * A }; }
  hopLegs(dt, A, p, fold) {
    const B = this.bones;
    for (const l of this.legs) {
      const A1 = B[l.a], B1 = B[l.b], F1 = l.ft ? B[l.ft] : null;
      if (this.dead) { A1.rotation.x = damp(A1.rotation.x, 0.8, 3, dt); B1.rotation.x = damp(B1.rotation.x, 0.2, 3, dt); continue; }
      if (l.rear) {
        const ext = A > 0.05 ? Math.sin(p * PI) * A : 0; const f2 = fold * (1 - ext);
        const ta = -l.fold0 * f2 + 0.7 * ext, tb = l.fold1 * f2 + 0.2 * ext;
        A1.rotation.set(ta, 0, l.sx * l.splay); B1.rotation.x = tb; if (F1) F1.rotation.x = -(ta + tb) + 0.5 * ext;
      } else {
        const sw = A > 0.05 ? Math.sin(p * PI) * A : 0;
        A1.rotation.set(-0.15 - sw * 0.7, 0, l.sx * l.splay); B1.rotation.x = 0.2 + sw * 0.5;
      }
    }
  }
}

class FrogView extends Hopper {
  shape(d, b, ll) {
    const k = b * 1.0 + 0.12; d.k = k; this.hopH = 0.9;
    d.H = 0.95 * ll + 0.1; d.ck = [0, 0.62 * k, -0.2 * k]; d.hd = [0, 0.1 * k, 0.95 * k]; d.bk = [0, 0.5 * k, -0.85 * k];
    d.sh = [0.85 * k, 0.15 * k, 0.4 * k];
    this.hb = 1.1 * k; this.hz = 0.3; this.mouth = ['head', [0, -0.15, 0.55]]; this.deadY = 0.45; this.deadRoll = 2.6; this.headK = 0.4; this.headYK = 0.3; this.jawK = 1.0;
  }
  body(c) {
    const { ps, d } = c; const k = d.k;
    ps.add('chest', 'P', sph(1, 24, 16), [0, 0, 0], [-0.22, 0, 0], [1.08 * k, 0.68 * k, 1.12 * k]);
    ps.add('chest', 'S', sph(1, 20, 10, 0, PI * 2, PI * 0.55, PI * 0.45), [0, 0.02, 0.05], [-0.22, 0, 0], [1.02 * k, 0.66 * k, 1.08 * k]);
    for (const [x, z, r] of [[0.45, -0.35, 0.16], [-0.5, -0.1, 0.12], [0.2, -0.75, 0.11], [-0.25, -0.6, 0.15]]) ps.add('chest', 'A', cyl(r * k, r * k, 0.05, 12), [x * k, 0.56 * k - z * 0.12, z * k], [-0.25, 0, 0]);
    for (const [sx] of SIDES) ps.add('chest', 'G', box(0.03, 0.04, 1.0 * k), [sx * (1.0 * k), 0.02, -0.05]);
    // 头（与身体一体）：大眼 + 宽嘴
    for (const [sx] of SIDES) {
      ps.add('head', 'M', sph(0.32 * k, 14, 10), [sx * 0.45 * k, 0.48 * k, 0.05]);
      ps.add('head', 'K', cyl(0.2 * k, 0.2 * k, 0.06, 16), [sx * 0.45 * k, 0.52 * k, 0.3 * k], [PI / 2 - 0.2, 0, 0]);
      ps.add('head', 'G', cyl(0.13 * k, 0.13 * k, 0.07, 16), [sx * 0.45 * k, 0.53 * k, 0.32 * k], [PI / 2 - 0.2, 0, 0]);
      ps.add('head', 'A', sph(0.2 * k, 10, 8), [sx * 0.7 * k, -0.05, 0.1], [0, 0, 0], [0.7, 0.8, 1]);
    }
    ps.add('head', 'P', taper(rbox(1.3 * k, 0.32, 0.5, 0.14), 0.9, 0.8, 0), [0, 0.05, 0.12]);
    ps.add('head', 'K', tor(0.58 * k, 0.03, 6, 24, PI), [0, -0.04, 0.12], [PI / 2, 0, 0]);
    const jaw = c.bone('xjaw', 'head', [0, -0.12, -0.05]); ps.add(jaw, 'S', taper(rbox(1.2 * k, 0.14, 0.55, 0.06), 0.85, 0.8, 0), [0, -0.05, 0.25]);
    ps.add(jaw, 'A', rbox(0.3, 0.05, 0.4, 0.02), [0, 0.03, 0.25]); // 舌
    // 腿：前腿短支柱，后腿粗壮折叠
    let i = 0;
    for (const [sx] of SIDES) {
      const a = c.bone('xA' + i, 'pelvis', [sx * 0.62 * k, -0.25 * k, 0.6 * k]), bb = c.bone('xB' + i, a, [0, -0.42, 0]);
      ps.add(a, 'M', sph(0.16, 10, 8), [0, 0, 0]); ps.add(a, 'S', rbox(0.2, 0.42, 0.22, 0.06), [0, -0.21, 0]);
      ps.add(bb, 'P', rbox(0.17, 0.42, 0.18, 0.05), [0, -0.21, 0]);
      ps.add(bb, 'K', plate([[0, 0], [-0.24, 0.32], [0, 0.26], [0.24, 0.32]], 0.04, 0.01), [0, -0.44, 0.02], [PI / 2, 0, 0]);
      this.legs.push({ a, b: bb, sx, splay: 0.35, rear: false }); i++;
    }
    for (const [sx] of SIDES) {
      const a = c.bone('xA' + i, 'pelvis', [sx * 0.72 * k, -0.2 * k, -0.45 * k]), bb = c.bone('xB' + i, a, [0, -0.72, 0]), ft = c.bone('xF' + i, bb, [0, -0.78, 0]);
      ps.add(a, 'M', sph(0.24, 12, 8), [0, 0, 0]); ps.add(a, 'P', taper(rbox(0.42, 0.78, 0.5, 0.14), 0.75, 0.8, 0), [0, -0.36, 0]);
      ps.add(a, 'A', rbox(0.06, 0.4, 0.3, 0.02), [sx * 0.22, -0.36, 0]);
      ps.add(bb, 'M', sph(0.16, 10, 8), [0, 0, 0]); ps.add(bb, 'S', taper(rbox(0.26, 0.8, 0.28, 0.07), 0.8, 0.8, 0), [0, -0.4, 0]);
      ps.add(ft, 'K', plate([[0, 0], [-0.34, 0.6], [-0.1, 0.5], [0, 0.66], [0.1, 0.5], [0.34, 0.6]], 0.04, 0.01), [0, -0.04, -0.05], [PI / 2, 0, 0]);
      this.legs.push({ a, b: bb, ft, sx, splay: 0.55, rear: true, fold0: 1.25, fold1: 2.35 }); i++;
    }
  }
  calcHeight(d) { return d.H + 0.7 * d.k + 1.25; }
  stride(d) { return 1.6; }
  pose(f, dt, S, A, vf, vs, spd, t) {
    const d = this.d; const { p, y } = this.hopY(A);
    const breath = Math.sin(t * 3) * 0.02;
    const py = d.H - S.crouch * 0.4 + y + breath;
    this.body3(f, dt, S, py, vf, vs, A > 0.05 ? -0.25 * Math.cos(p * PI) * A : 0, 0);
    this.hopLegs(dt, A, p, 1);
    this.bones.chest.scale.set(1 + breath, 1 - breath, 1);
  }
}

class RabbitView extends Hopper {
  shape(d, b, ll) {
    const k = b * 0.9 + 0.1; d.k = k; this.hopH = 1.15;
    d.H = 1.05 * ll + 0.12; d.ck = [0, 0.68 * k, -0.35 * k]; d.hd = [0, 0.62 * k, 1.05 * k]; d.bk = [0, 0.55 * k, -0.95 * k];
    d.sh = [0.72 * k, 0.15 * k, 0.45 * k];
    this.hb = 0.62; this.hz = 0.35; this.mouth = ['head', [0, -0.1, 0.6]]; this.deadY = 0.5; this.headK = 0.6;
  }
  body(c) {
    const { ps, d } = c; const k = d.k;
    ps.add('chest', 'P', sph(1, 22, 14), [0, 0, 0], [-0.3, 0, 0], [0.82 * k, 0.78 * k, 1.12 * k]);
    ps.add('chest', 'S', sph(1, 16, 10), [0, -0.05, 0.62 * k], [0, 0, 0], [0.6 * k, 0.62 * k, 0.45 * k]);
    for (const [sx] of SIDES) { ps.add('chest', 'S', sph(1, 16, 12), [sx * 0.52 * k, -0.15 * k, -0.4 * k], [0, 0, 0], [0.4 * k, 0.55 * k, 0.6 * k]); ps.add('chest', 'G', box(0.03, 0.04, 0.8 * k), [sx * 0.82 * k, 0.05, 0]); }
    ps.add('chest', 'A', sph(0.3 * k, 12, 10), [0, 0.15 * k, -1.08 * k]); // 绒球尾
    ps.add('chest', 'G', sph(0.12 * k, 10, 8), [0, 0.2 * k, -1.3 * k]);
    // 头 + 长耳
    ps.add('head', 'P', sph(1, 16, 12), [0, 0.05, 0.15], [0, 0, 0], [0.42, 0.4, 0.48]);
    ps.add('head', 'S', sph(1, 12, 10), [0, -0.08, 0.48], [0, 0, 0], [0.26, 0.2, 0.2]);
    ps.add('head', 'A', sph(0.06, 8, 6), [0, -0.02, 0.66]);
    ps.add('head', 'K', box(0.12, 0.1, 0.03), [0, -0.24, 0.6]);
    for (const [sx] of SIDES) ps.add('head', 'G', plate([[0, 0], [0.12, 0.02], [0.1, 0.08], [0, 0.07]], 0.04, 0.01), [sx * 0.2, 0.12, 0.44], [0, 0, sx > 0 ? 0.1 : PI - 0.1]);
    for (const [sx, s] of SIDES) {
      const e = c.bone('xear' + s, 'head', [sx * 0.16, 0.36, -0.02]);
      ps.add(e, 'P', taper(rbox(0.24, 1.0 * k, 0.1, 0.05), 0.6, 0.8, 0), [0, 0.5 * k, 0]);
      ps.add(e, 'A', taper(rbox(0.14, 0.75 * k, 0.04, 0.02), 0.5, 0.8, 0), [0, 0.5 * k, 0.05]);
      ps.add(e, 'G', box(0.04, 0.3, 0.03), [0, 0.95 * k, 0.04]);
      this.ears.push({ n: e, s: sx });
    }
    const jaw = c.bone('xjaw', 'head', [0, -0.18, 0.4]); ps.add(jaw, 'M', rbox(0.2, 0.06, 0.16, 0.02), [0, -0.02, 0.06]);
    // 腿：前腿细直，后腿长脚掌
    let i = 0;
    for (const [sx] of SIDES) {
      const a = c.bone('xA' + i, 'pelvis', [sx * 0.32 * k, -0.4 * k, 0.65 * k]), bb = c.bone('xB' + i, a, [0, -0.45, 0]);
      ps.add(a, 'S', rbox(0.18, 0.46, 0.2, 0.06), [0, -0.22, 0]); ps.add(bb, 'M', rbox(0.14, 0.42, 0.16, 0.05), [0, -0.2, 0]);
      ps.add(bb, 'K', rbox(0.2, 0.1, 0.3, 0.04), [0, -0.42, 0.06]);
      this.legs.push({ a, b: bb, sx, splay: 0.08, rear: false }); i++;
    }
    for (const [sx] of SIDES) {
      const a = c.bone('xA' + i, 'pelvis', [sx * 0.55 * k, -0.25 * k, -0.45 * k]), bb = c.bone('xB' + i, a, [0, -0.62, 0]), ft = c.bone('xF' + i, bb, [0, -0.6, 0]);
      ps.add(a, 'P', taper(rbox(0.36, 0.66, 0.46, 0.14), 0.8, 0.8, 0), [0, -0.3, 0]);
      ps.add(bb, 'M', sph(0.13, 10, 8), [0, 0, 0]); ps.add(bb, 'S', rbox(0.2, 0.62, 0.22, 0.06), [0, -0.3, 0]);
      ps.add(ft, 'K', rbox(0.26, 0.14, 0.9, 0.05), [0, -0.04, 0.3]); ps.add(ft, 'A', rbox(0.22, 0.04, 0.3, 0.02), [0, 0.04, 0.55]);
      this.legs.push({ a, b: bb, ft, sx, splay: 0.12, rear: true, fold0: 1.0, fold1: 2.0 }); i++;
    }
  }
  calcHeight(d) { return d.H + 0.8 * d.k + 1.3; }
  stride(d) { return 1.9; }
  pose(f, dt, S, A, vf, vs, spd, t) {
    const d = this.d; const { p, y } = this.hopY(A);
    const py = d.H - S.crouch * 0.45 + y + Math.sin(t * 2.4) * 0.015;
    this.body3(f, dt, S, py, vf, vs, A > 0.05 ? -0.3 * Math.cos(p * PI) * A : 0, 0);
    this.hopLegs(dt, A, p, 1);
    this.earBack = A > 0.05 ? -0.9 * Math.sin(p * PI) * A : (this.cele > 0 ? Math.sin(t * 8) * 0.3 : 0);
  }
}

// ———————————————— 蝠鲼 Manta：扁平双翼悬浮，翼尖波浪拍动 + 长鞭尾（合并替代浮游炮 / 能量灵体） ————————————————
class MantaView extends Beast {
  shape(d, b) {
    const k = b * 0.95 + 0.15; d.k = k; this.floating = true;
    d.H = 1.75; d.ck = [0, 0.2, -0.1]; d.hd = [0, 0.0, 1.15 * k]; d.bk = [0, 0.22, -0.8 * k];
    d.sh = [0.95 * k, -0.25, 0.25];
    this.hb = 0.8 * k; this.hz = 0.2; this.mouth = ['head', [0, -0.05, 0.5]]; this.deadY = 0.35; this.deadRoll = 0.35; this.headK = 0.3; this.headYK = 0.4; this.lungeK = 0.6;
  }
  body(c) {
    const { ps, d } = c; const k = d.k;
    ps.add('chest', 'P', taper(rbox(1.4 * k, 0.55, 2.2 * k, 0.22), 0.8, 0.9, 0), [0, 0, 0]);
    ps.add('chest', 'K', rbox(1.15 * k, 0.14, 1.9 * k, 0.06), [0, -0.3, 0]);
    ps.add('chest', 'M', rbox(0.55 * k, 0.12, 1.6 * k, 0.05), [0, 0.3, -0.2]);
    for (let i = 0; i < 4; i++) for (const [sx] of SIDES) ps.add('chest', 'G', box(0.03, 0.03, 0.18), [sx * 0.22 * k, -0.22, 0.4 - i * 0.28]); // 腹部鳃灯
    for (const [sx, s] of SIDES) {
      const w = c.bone('xwing' + s, 'chest', [sx * 0.6 * k, 0, 0]);
      const P2 = (pts) => pts.map(([x, z]) => [sx * x * k, -z * k]);
      // 宽弦菱形翼：前缘外扫到尖、后缘内凹收回尾根
      ps.add(w, 'P', plate(P2([[0, 1.05], [0.6, 0.85], [1.4, 0.35], [2.3, -0.35], [2.05, -0.55], [1.2, -0.6], [0.5, -0.95], [0, -1.0]]), 0.14, 0.05), [0, 0, 0], [-PI / 2, 0, 0]);
      ps.add(w, 'P', taper(rbox(0.9 * k, 0.32, 1.6 * k, 0.12), 0.7, 0.85, 0), [sx * 0.35 * k, 0.04, 0.02]); // 厚翼根
      ps.add(w, 'S', plate(P2([[0.15, 0.8], [0.7, 0.6], [1.5, 0.15], [2.0, -0.3], [1.85, -0.45], [1.1, -0.45], [0.45, -0.75], [0.15, -0.75]]), 0.05, 0.02), [0, 0.1, 0], [-PI / 2, 0, 0]);
      ps.add(w, 'A', plate(P2([[1.65, -0.05], [2.25, -0.36], [2.02, -0.52], [1.55, -0.38]]), 0.06, 0.015), [0, 0.13, 0], [-PI / 2, 0, 0]);
      ps.add(w, 'G', rod([0.1 * sx * k, 0.1, 1.0 * k], [2.25 * sx * k, 0.06, -0.3 * k], 0.035));
      for (let i = 0; i < 3; i++) ps.add(w, 'K', box(0.05, 0.05, 0.9 * k), [sx * (0.9 + i * 0.35) * k, 0.12, (-0.05 - i * 0.12) * k], [0, sx * 0.45, 0]); // 翼面肋
      // 头鳍
      // 头鳍：一对向前卷曲的大鳍
      ps.add('head', 'M', plate([[0, 0], [0.16, 0.7], [0.04, 0.82], [-0.12, 0.12]], 0.09, 0.02), [sx * 0.5 * k, -0.08, 0.05], [-PI / 2 + 0.25, 0, sx * 0.25]);
      ps.add('head', 'A', box(0.04, 0.04, 0.55), [sx * 0.55 * k, 0.0, 0.35], [0.25, sx * 0.25, 0]);
      ps.add('head', 'G', sph(0.08, 10, 8), [sx * 0.36 * k, 0.08, 0.1]);
    }
    ps.add('head', 'S', taper(rbox(1.05 * k, 0.36, 0.45, 0.12), 0.9, 0.7, 0), [0, 0, 0.05]);
    const jaw = c.bone('xjaw', 'head', [0, -0.12, 0.05]); ps.add(jaw, 'K', rbox(0.7 * k, 0.06, 0.25, 0.02), [0, 0, 0.1]);
    this.tail(c, 5, [0, 0, -1.05 * k], 0.42, 0.18, 0.12, ['K', 'M'], 'G');
    this.tailPitch = 0.02; this.tailCurl = 0.02; this.tailAmp = 0.3;
  }
  calcHeight(d) { return d.H + 0.3 + 1.25; }
  stride() { return 3; }
  pose(f, dt, S, A, vf, vs, spd, t) {
    const d = this.d, B = this.bones; const mv = this.mv || 0;
    const py = d.H + Math.sin(t * 1.8 + this.tailT) * 0.14 - this.squash * 0.3 - this.recoil * 0.1 - S.crouch * 0.4;
    this.body3(f, dt, S, py, vf, vs, -clamp(vf * 0.02, -0.15, 0.2), clamp(-vs * 0.03, -0.3, 0.3));
    this.flapPh = (this.flapPh || 0) + (2.2 + mv * 2.5) * dt; this.celeK = damp(this.celeK || 0, this.cele > 0 ? 1 : 0, 4, dt);
    const fl = this.dead ? -0.25 : Math.sin(this.flapPh) * (0.1 + mv * 0.18) + Math.sin(t * 7) * 0.25 * this.celeK;
    const dh = 0.06; // 上反角：翼面朝镜头翘起，平视也能看出翼型
    B.xwingL.rotation.set(0, 0, this.dead ? damp(B.xwingL.rotation.z, -0.3, 3, dt) : fl + dh);
    B.xwingR.rotation.set(0, 0, this.dead ? damp(B.xwingR.rotation.z, 0.3, 3, dt) : -fl - dh);
  }
}

export const EXT_FORMS = { manta: MantaView, tiger: TigerView, turtle: TurtleView, croc: CrocView, trex: RexView, flamingo: FlamingoView, frog: FrogView, rabbit: RabbitView };
