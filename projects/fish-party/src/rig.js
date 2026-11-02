// 程序化骨骼动画：Tripo + Mixamo 绑定的角色（23 根骨骼、静止姿态为单位旋转、+Z 朝前、1.45m）没有自带动作，
// 这里用 FK（躯干/腿/头）+ 双骨 IK（手臂）实时合成全部动作：站立/走跑/甩竿/等待/扬竿/收线/搏鱼/抱鱼/欢呼/挥手/沮丧。
// 关键思路：手是"贴"在道具上的 —— 钓竿跟随右手，鱼的位置由双手实际到达点反推，保证任何体型的鱼都在手上。
import * as THREE from 'three';

const BONES = {
  hips: 'hips', spine: 'spine', spine1: 'mixamorigSpine1', chest: 'chest', neck: 'neck', head: 'head',
  shL: 'mixamorigLeftShoulder', uaL: 'upperArm_L', faL: 'forearm_L', hL: 'hand_L',
  shR: 'mixamorigRightShoulder', uaR: 'upperArm_R', faR: 'forearm_R', hR: 'hand_R',
  thL: 'thigh_L', snL: 'shin_L', ftL: 'foot_L', thR: 'thigh_R', snR: 'shin_R', ftR: 'foot_R',
};
const FK_KEYS = ['hips', 'spine', 'spine1', 'chest', 'neck', 'head', 'thL', 'snL', 'ftL', 'thR', 'snR', 'ftR', 'shL', 'shR'];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _a = V(), _b = V(), _c = V(), _d = V(), _p = V(), _x1 = V(), _y1 = V(), _z1 = V(), _x2 = V(), _y2 = V(), _z2 = V(), _s = V();
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const ease = (k) => k * k * (3 - 2 * k);
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);

function basisRot(r, rp, n, np, out) {
  _x1.copy(r).normalize(); _z1.copy(rp).addScaledVector(_x1, -rp.dot(_x1)).normalize(); _y1.crossVectors(_z1, _x1);
  _x2.copy(n).normalize(); _z2.copy(np).addScaledVector(_x2, -np.dot(_x2));
  if (_z2.lengthSq() < 1e-8) _z2.copy(_z1); _z2.normalize(); _y2.crossVectors(_z2, _x2);
  _m1.makeBasis(_x1, _y1, _z1); _m2.makeBasis(_x2, _y2, _z2);
  _m2.multiply(_m1.transpose());
  return out.setFromRotationMatrix(_m2);
}

export class Rig {
  constructor(model) {
    this.model = model;
    this.b = {};
    for (const k in BONES) {
      const o = model.getObjectByName(BONES[k]);
      if (!o) console.warn('bone missing', BONES[k]);
      this.b[k] = o;
    }
    this.cur = {}; for (const k of FK_KEYS) this.cur[k] = new THREE.Quaternion();
    this.hipsY0 = this.b.hips.position.y;
    this.restDir = {
      uaL: this.b.faL.position.clone(), faL: this.b.hL.position.clone(),
      uaR: this.b.faR.position.clone(), faR: this.b.hR.position.clone(),
    };
    // 模型空间下的关节静止位置（单位：模型米）
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const wp = (o) => o.getWorldPosition(V()).applyMatrix4(inv);
    this.restPos = { shL: wp(this.b.uaL), shR: wp(this.b.uaR), hips: wp(this.b.hips), head: wp(this.b.head), chest: wp(this.b.chest) };
    this.armLen = this.restDir.uaL.length() + this.restDir.faL.length();
    this.hipsOff = V();
  }

  // 应用 FK 目标（欧拉角，弧度），带平滑
  applyFK(P, k) {
    for (const key of FK_KEYS) {
      const e = P[key];
      if (e) _q.setFromEuler(_e.set(e[0], e[1], e[2], 'YXZ')); else _q.identity();
      this.cur[key].slerp(_q, k);
      this.b[key].quaternion.copy(this.cur[key]);
    }
    this.hipsOff.lerp(_a.set(0, P.hipsY || 0, P.hipsZ || 0), k);
    this.b.hips.position.set(this.b.hips.position.x, this.hipsY0 + this.hipsOff.y, this.hipsOff.z);
  }

  // 双骨 IK：T、P 为世界坐标
  solveArm(side, T, P) {
    const ua = this.b['ua' + side], fa = this.b['fa' + side], hd = this.b['h' + side];
    ua.parent.updateWorldMatrix(true, false);
    ua.updateMatrixWorld(true);
    const A = ua.getWorldPosition(_a);
    ua.parent.matrixWorld.decompose(_d, _qp, _s);
    const sc = _s.x;
    const l1 = this.restDir['ua' + side].length() * sc, l2 = this.restDir['fa' + side].length() * sc;
    const dv = _b.copy(T).sub(A);
    const dist = clamp(dv.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999);
    dv.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pp = _p.copy(P).sub(A); pp.addScaledVector(dv, -pp.dot(dv));
    if (pp.lengthSq() < 1e-8) pp.set(0, -1, 0); pp.normalize();
    const E = _c.copy(A).addScaledVector(dv, a).addScaledVector(pp, h);
    const W = _d.copy(A).addScaledVector(dv, dist);
    // 静止方向（世界）：模型世界旋转 * 静止局部方向
    this.model.getWorldQuaternion(_q2);
    const rU = V().copy(this.restDir['ua' + side]).applyQuaternion(_q2);
    const rF = V().copy(this.restDir['fa' + side]).applyQuaternion(_q2);
    const rP = V(0, 0, -1).applyQuaternion(_q2);
    const qU = basisRot(rU, rP, V().subVectors(E, A), pp, new THREE.Quaternion());
    // 模型世界旋转 -> 父骨骼世界旋转
    const qParent = ua.parent.getWorldQuaternion(new THREE.Quaternion());
    // basisRot 给的是"从静止世界方向到新世界方向"的增量；骨骼世界旋转 = 增量 * 模型旋转
    const qUw = qU.multiply(_q2);
    ua.quaternion.copy(qParent.clone().invert().multiply(qUw));
    ua.updateMatrixWorld(true);
    const qF = basisRot(rF, rP, V().subVectors(W, E), pp, new THREE.Quaternion()).multiply(_q2);
    fa.quaternion.copy(qUw.clone().invert().multiply(qF));
    fa.updateMatrixWorld(true);
    hd.quaternion.identity();
    hd.updateMatrixWorld(true);
    return hd.getWorldPosition(V());
  }
}

// ======================================================================
// 角色：模型 + Rig + 钓竿 + 动作状态
// ======================================================================
export class Character {
  constructor(model, { scale = 1.12, name = '', color = '#fff', rod = null } = {}) {
    this.name = name; this.color = color;
    this.root = new THREE.Group();
    this.model = model;
    model.scale.setScalar(scale);
    this.scale = scale;
    this.root.add(model);
    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        const m = o.material;
        if (m && m.isMeshStandardMaterial) { m.envMapIntensity = 0.6; m.roughness = Math.max(m.roughness, 0.6); }
      }
    });
    this.rig = new Rig(model);
    this.rod = rod;
    if (rod) { this.root.add(rod.group); }
    this.mode = 'free';     // 上半身模式：free/rod/cast/wait/hookset/reel/fight/hold/cheer/wave/sad
    this.modeT = 0;
    this.speed = 0;         // 移动速度 m/s
    this.gait = 0;
    this.tension = 0;       // 搏鱼张力 0~1
    this.reelSpeed = 0;
    this.fishDir = V(0, -0.3, 1);   // 模型空间：鱼的方向（搏鱼时竿梢指向）
    this.look = null;       // 世界坐标注视点
    this.held = null;       // 抱着的鱼 {obj, len, h, w}
    this.seed = Math.random() * 100;
    this.handT = { L: V(0.28, 0.42, 0.02), R: V(-0.28, 0.42, 0.02) };
    this.poleT = { L: V(0.6, 0.3, -0.5), R: V(-0.6, 0.3, -0.5) };
    this.rodDir = V(0, 0.7, 0.7).normalize();
    this.rodRoll = 0;
    this._tmpW = V(); this._tmpW2 = V();
    this.handW = { L: V(), R: V() };
    this.headW = V();
    this.reach = this.rig.armLen;
  }
  setMode(m) { if (this.mode !== m) { this.mode = m; this.modeT = 0; } }

  // 模型空间 -> 世界
  toWorld(v, out) { return out.copy(v).applyMatrix4(this.model.matrixWorld); }

  update(dt, t) {
    this.modeT += dt;
    const R = this.rig, rp = R.restPos, s = this.seed;
    const P = {};
    const k = 1 - Math.exp(-dt * 16);
    // ---------- 下半身：站立 / 走跑 ----------
    const w = clamp(this.speed / 2.4, 0, 1);
    this.gait += dt * (this.speed > 0.05 ? 3.2 + this.speed * 2.2 : 0);
    const g = this.gait * Math.PI * 2 / 2;
    const sw = Math.sin(g), cw = Math.cos(g);
    const amp = 0.75 * w;
    P.thL = [-sw * amp, 0, 0]; P.thR = [sw * amp, 0, 0];
    P.snL = [Math.max(0, -cw) * 1.1 * w + 0.02, 0, 0]; P.snR = [Math.max(0, cw) * 1.1 * w + 0.02, 0, 0];
    P.ftL = [-(P.thL[0] + P.snL[0]) * 0.8, 0, 0]; P.ftR = [-(P.thR[0] + P.snR[0]) * 0.8, 0, 0];
    const breath = Math.sin(t * 2.1 + s) * 0.006;
    P.hipsY = -Math.abs(Math.sin(g)) * 0.035 * w + breath + (w > 0 ? 0 : 0);
    P.hipsY += Math.abs(Math.sin(g)) * 0.0 + (w > 0.2 ? Math.abs(cw) * 0.03 * w : 0);
    P.hips = [0.12 * w, Math.sin(g) * 0.12 * w, 0];
    P.spine = [0.02 + 0.03 * w, -Math.sin(g) * 0.1 * w, 0];
    P.chest = [Math.sin(t * 2.1 + s) * 0.015, 0, 0];
    P.neck = [0, 0, 0]; P.head = [0, 0, Math.sin(t * 0.7 + s) * 0.04];

    // ---------- 上半身模式 ----------
    const hand = this.handT, pole = this.poleT;
    const shL = rp.shL, shR = rp.shR;
    let rodOn = !!this.rod, gripFollow = true;
    const rodD = this._rodD || (this._rodD = V()); rodD.set(0, 0.75, 0.66);
    let leftOnRod = 0.0; // 左手扶竿：0=自由 1=扶在竿上 2=摇轮
    const m = this.mode, u = this.modeT;
    const tH = this._tH || (this._tH = V()), tL = this._tL || (this._tL = V());

    const freeArms = (amt = 1) => {
      tL.set(0.29, 0.47 + Math.cos(g) * 0.01, -Math.sin(g) * 0.09 * w * amt + 0.03);
      tR.set(-0.29, 0.47 + Math.cos(g) * 0.01, Math.sin(g) * 0.09 * w * amt + 0.03);
    };
    const tR = tH;
    switch (m) {
      case 'free': default: {
        rodOn = false; freeArms();
        tL.y += breath; tR.y += breath;
        break;
      }
      case 'rod': { // 拿着竿走/站
        freeArms(0.6);
        tR.set(-0.19, 0.52 + Math.sin(g) * 0.01, 0.13);
        rodD.set(-0.1, 0.85, 0.5);
        break;
      }
      case 'cast': {
        // 0~0.38 举竿后摆蓄力；0.38~0.52 前甩出线；之后收势
        const a1 = ease(seg(u, 0, 0.38)), a2 = ease(seg(u, 0.38, 0.52)), a3 = ease(seg(u, 0.6, 1.0));
        tR.set(-0.14, lerp(0.58, 0.8, a1), lerp(0.14, 0.0, a1));
        rodD.set(-0.05, 0.75, lerp(0.62, -0.7, a1));
        tR.lerp(_b.set(-0.1, 0.62, 0.2), a2); rodD.lerp(_c.set(0, 0.3, 0.95), a2);
        tR.lerp(_b.set(-0.1, 0.57, 0.18), a3); rodD.lerp(_c.set(0, 0.45, 0.9), a3);
        P.spine = [lerp(-0.12, 0.2, a2) * (1 - a3) + 0.06 * a3, lerp(0.25, -0.15, a2) * (1 - a3), 0];
        P.hips[1] += lerp(0.2, -0.1, a2) * (1 - a3);
        leftOnRod = 1;
        break;
      }
      case 'wait': {
        tR.set(-0.1, 0.57 + Math.sin(t * 1.3 + s) * 0.008, 0.18);
        rodD.set(0, 0.45 + Math.sin(t * 0.9 + s) * 0.03, 0.9);
        leftOnRod = 1;
        P.spine[0] += 0.05;
        break;
      }
      case 'twitch': { // 轻啄：竿梢点头
        const k2 = Math.sin(clamp(u / 0.25, 0, 1) * Math.PI);
        tR.set(-0.1, 0.57 - k2 * 0.02, 0.18 + k2 * 0.02);
        rodD.set(0, 0.45 - k2 * 0.2, 0.9);
        leftOnRod = 1;
        break;
      }
      case 'hookset': {
        const a = ease(seg(u, 0, 0.16));
        tR.set(-0.12, lerp(0.57, 0.8, a), lerp(0.18, 0.04, a));
        rodD.set(0, lerp(0.45, 0.95, a), lerp(0.9, 0.2, a));
        P.spine = [lerp(0.05, -0.22, a), 0.1, 0];
        P.hipsZ = -0.03 * a;
        leftOnRod = 1;
        break;
      }
      case 'reel': case 'fight': {
        const te = this.tension;
        const shake = te > 0.65 ? (te - 0.65) * 0.05 : 0;
        const fd = _b.copy(this.fishDir); fd.y = Math.min(fd.y, 0); fd.normalize();
        rodD.copy(fd).multiplyScalar(0.55).add(_c.set(0, 0.85 + te * 0.25, 0)).normalize();
        tR.set(-0.1 + fd.x * 0.04, 0.6 + te * 0.06 + Math.sin(t * 40) * shake, 0.17 - te * 0.05);
        leftOnRod = 2;
        const lean = -0.06 - te * 0.26;
        P.spine = [lean + Math.sin(t * 33) * shake * 3, fd.x * 0.25, 0];
        P.chest[0] += lean * 0.4;
        P.hipsZ = -0.015 - te * 0.03;
        if (this.speed < 0.1) {
          P.thL = [0.15, 0, 0.2 + te * 0.1]; P.thR = [-0.1, 0, -0.2 - te * 0.1];
          P.snL = [0.3 + te * 0.2, 0, 0]; P.snR = [0.22 + te * 0.2, 0, 0];
          P.ftL = [-(P.thL[0] + P.snL[0]) * 0.9, 0, -P.thL[2]]; P.ftR = [-(P.thR[0] + P.snR[0]) * 0.9, 0, -P.thR[2]];
          P.hipsY -= 0.012 + te * 0.02;
        }
        break;
      }
      case 'hold': {
        rodOn = false;
        const bounce = this.speed > 0.1 ? 0 : Math.max(0, 1 - u / 3) * Math.abs(Math.sin(u * 7.5));
        P.hipsY += bounce * 0.04;
        P.spine[0] -= 0.06; P.head = [-0.16 + Math.sin(t * 2) * 0.04, Math.sin(t * 1.3) * 0.15, 0];
        break; // 手的目标由 held 决定（见下）
      }
      case 'cheer': {
        rodOn = false;
        const j = Math.abs(Math.sin(u * 6.5));
        tL.set(0.3, 0.86 + j * 0.03, 0.05); tR.set(-0.3, 0.86 + j * 0.03, 0.05);
        P.hipsY += j * 0.05; P.head = [-0.25, 0, Math.sin(u * 6.5) * 0.08]; P.spine[0] -= 0.1;
        break;
      }
      case 'clap': {
        rodOn = false;
        const c = Math.abs(Math.sin(u * 9));
        tL.set(0.03 + c * 0.07, 0.66, 0.2); tR.set(-0.03 - c * 0.07, 0.66, 0.2);
        P.head = [-0.12, 0, 0]; P.hipsY += Math.abs(Math.sin(u * 4.5)) * 0.02;
        break;
      }
      case 'wave': {
        freeArms(0.5);
        tR.set(-0.3, 0.88, 0.1 + Math.sin(u * 12) * 0.05);
        P.head = [-0.1, -0.2, 0.1];
        if (this.rod) { rodOn = true; gripFollow = false; }
        break;
      }
      case 'sad': {
        rodOn = !!this.rod;
        tR.set(-0.15, 0.48, 0.12); tL.set(0.27, 0.45, 0.03);
        rodD.set(0, 0.25, 0.95);
        P.head = [0.35, 0, 0]; P.spine[0] += 0.2; P.hipsY -= 0.015;
        break;
      }
    }

    // 注视
    if (this.look) {
      const lp = this.root.worldToLocal(this._tmpW.copy(this.look));
      const yaw = clamp(Math.atan2(lp.x, lp.z), -1.0, 1.0);
      const pitch = clamp(-Math.atan2(lp.y - 1.2, Math.hypot(lp.x, lp.z)), -0.4, 0.5);
      P.head = [P.head[0] * 0.4 + pitch * 0.7, P.head[1] * 0.3 + yaw * 0.8, P.head[2]];
      P.neck = [0, yaw * 0.2, 0];
    }

    R.applyFK(P, k);
    this.model.updateMatrixWorld(true);

    // ---------- 钓竿：跟随右手 ----------
    this.rodDir.lerp(rodD.normalize(), 1 - Math.exp(-dt * (m === 'cast' || m === 'hookset' ? 30 : 12))).normalize();
    if (leftOnRod === 1) tL.copy(tR).addScaledVector(this.rodDir, 0.09).add(_b.set(0.07, -0.02, 0.02));
    if (leftOnRod === 2) {
      const ph = t * (4 + this.reelSpeed * 14);
      tL.copy(tR).addScaledVector(this.rodDir, 0.06).add(_b.set(0.09 + Math.cos(ph) * 0.03, -0.02 + Math.sin(ph) * 0.03, 0.03));
    }

    // ---------- 抱鱼：先给双手目标，解完 IK 再按实际到达点摆鱼 ----------
    const H = this.held;
    if (m === 'hold' && H) {
      const sc = this.scale;
      const wob = Math.sin(t * 13) * 0.012 * (H.burst || 0);
      const lift = ease(clamp(u / 0.45, 0, 1));
      if (H.pose === 'yoke') {
        // D：举过头顶（奖杯式）—— 双手高举托住鱼腹，鱼整条在头顶上方：脸完全露出、鱼也完整可见，最有"炫耀"感
        const top = rp.head.y + 0.36;
        tL.set(0.2, lerp(0.56, top, lift) + wob, lerp(0.2, 0.06, lift)); tR.set(-0.2, lerp(0.56, top, lift) - wob, lerp(0.2, 0.06, lift));
        P.spine[0] += 0.04 * lift; P.chest[0] += 0.05 * lift; P.head = [-0.1 + Math.sin(t * 2) * 0.03, Math.sin(t * 1.1) * 0.1, 0];
      } else if (H.pose === 'cradle') {
        // D：横抱 —— 双手分开托住细长大鱼，放低到腰腹，鱼背不超过下巴
        const chin = rp.head.y - 0.02;
        const hy = clamp(chin - (H.h + 0.08) / sc, 0.24, 0.5);
        const hz = clamp(0.16 + (H.w * 0.5) / sc, 0.2, 0.36);
        tL.set(0.22, hy + wob, hz); tR.set(-0.22, hy - wob, hz);
        P.spine[0] -= 0.03;
      } else {
        const spread = Math.min(H.len * 0.2 / sc, 0.15);
        // 双手前伸到鱼腹正下方（厚鱼会被推离胸口，手要跟上，否则鱼像悬空）
        const hz = clamp(0.15 + (H.w * 0.5 + Math.max(0, H.h - 0.3) * 0.35) / sc, 0.2, 0.42);
        // E：中型鱼（0.8~1.4m）抱位按鱼高下移，鱼背不超过下巴，露出脸和领口
        const hy = 0.56 - clamp((H.h / sc - 0.12) * 0.5, 0, 0.09);   // Q 版头骨 restPos 偏高，直接按鱼高下移（≤0.09，手仍在腹前）
        tL.set(spread, hy + wob, hz); tR.set(-spread, hy - wob, hz);
      }
    }

    hand.L.lerp(tL, k); hand.R.lerp(tR, k);
    pole.L.set(0.5, 0.15, -0.35); pole.R.set(-0.5, 0.15, -0.35);
    if (m === 'cheer') { pole.L.set(0.6, 0.2, -0.3); pole.R.set(-0.6, 0.2, -0.3); }

    const TL = this.toWorld(hand.L, V()), TR = this.toWorld(hand.R, V());
    const PL = this.toWorld(pole.L, V()), PR = this.toWorld(pole.R, V());
    this.handW.R.copy(R.solveArm('R', TR, PR));
    this.handW.L.copy(R.solveArm('L', TL, PL));

    if (this.rod) {
      this.rod.group.visible = rodOn;
      if (rodOn) {
        // 竿的握把点 = 右手实际位置（从世界转回 root 空间），竿身方向 = rodDir（模型空间 -> root 空间方向相同，因 model 未旋转）
        const gp = this.root.worldToLocal(this._tmpW.copy(this.handW.R));
        const rg = this.rod.group;
        rg.position.copy(gp);
        _q.setFromUnitVectors(_b.set(0, 1, 0), this.rodDir);
        rg.quaternion.copy(_q);
        rg.position.addScaledVector(this.rodDir, -0.1);
        if (!gripFollow) { rg.position.set(-0.25 * this.scale, 0.42 * this.scale, 0.1); rg.quaternion.setFromUnitVectors(_b.set(0, 1, 0), _c.set(-0.1, 0.9, 0.3).normalize()); }
      }
    }

    // 鱼：贴在双手之间（通用规则：鱼腹压在两只手的实际位置上）
    if (m === 'hold' && H) {
      const mid = _c.copy(this.handW.L).add(this.handW.R).multiplyScalar(0.5);
      this.root.worldToLocal(mid);
      // 通用规则：鱼腹（鱼的最低点）压在两只手的实际位置上，鱼背离胸口至少留出半个鱼身厚度，避免穿进身体
      // 手臂较短（Q 版），鱼贴近胸口一点，保证双手托在鱼腹下方而不是鱼悬在手前
      const chestFront = 0.12 * this.scale;
      if (H.pose === 'yoke') {
        // 鱼腹压在头顶上方一点（Q 版大头顶 ≈ head + 0.42 模型米），水平居中，略靠前
        const sc = this.scale, k2 = ease(clamp(this.modeT / 0.45, 0, 1));
        const yY = (this.rig.restPos.head.y + 0.33) * sc + H.belly;
        H.obj.position.set(mid.x * 0.3, lerp(mid.y + H.belly, Math.max(yY, mid.y + H.belly), k2), lerp(Math.max(mid.z, chestFront + H.w * 0.5), 0.05 * sc, k2));
      } else if (H.pose === 'cradle') {
        H.obj.position.set(mid.x, mid.y + H.belly + 0.01, Math.max(mid.z + 0.03, chestFront + H.w * 0.5));
      } else
      H.obj.position.set(mid.x, mid.y + H.belly + 0.015 - Math.max(0, H.h - 0.42) * 1.3, Math.max(mid.z + 0.03, chestFront + H.w * 0.4 + Math.max(0, H.h - 0.3) * 0.35));   // 高背鳍的鱼再往前推，免得鳍挡脸
    }

    this.rig.b.head.getWorldPosition(this.headW);
  }
}
