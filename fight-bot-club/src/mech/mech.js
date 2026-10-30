// 机甲视图：骨架 + 零件烘焙 + 程序化动画（步态与位移同步、出招姿态、受击、跳跃、倒地、庆祝）
import * as THREE from 'three';
import { mulberry32, clamp, damp } from '../core/util.js';
import { PartSet, bake } from './geo.js';
import { mechMaterial, PATTERNS, glowMaterial, GLOBAL_TIME } from '../render/materials.js';
import * as P from './parts.js';

export const FINISH = {
  gloss: { rough: 0.3, metal: 0.18 }, satin: { rough: 0.46, metal: 0.32 }, matte: { rough: 0.72, metal: 0.08 }, chrome: { rough: 0.28, metal: 0.88 },
};
const PAT_EMIS = new Set(['circuit', 'drip', 'cracks']);

export function makeMats(design, uni) {
  const pal = design.palette, L = design.look; const fin = FINISH[L.finish] || FINISH.satin;
  const pat = PATTERNS[L.pattern] || 0;
  const patCol = ['stripes', 'checker', 'hazard', 'chevron', 'trim', 'split', 'wave', 'cloud'].includes(L.pattern) ? pal.secondary : (L.pattern === 'carbon' ? '#050608' : (PAT_EMIS.has(L.pattern) ? new THREE.Color(pal.primary).multiplyScalar(0.5).getStyle() : pal.accent));
  const patScale = { stripes: 1, split: 1, checker: 1.1, camo: 0.9, digital: 0.9, circuit: 0.8, hex: 1.3, hazard: 0.9, dots: 1.2, carbon: 1, drip: 0.7, cracks: 0.9, wave: 1, cloud: 0.8, chevron: 1, trim: 1.3, patch: 1 }[L.pattern] || 1;
  const wear = L.worn;
  const mats = {
    P: mechMaterial({ color: pal.primary, rough: fin.rough, metal: L.pMetal ? 1 : fin.metal, pattern: pat, patCol, patEmis: PAT_EMIS.has(L.pattern) ? pal.emissive : '#000', patScale, patSeed: (L.patternSeed % 1000) / 37, wear, uni }),
    S: mechMaterial({ color: pal.secondary, rough: L.sMetal ? 0.22 : fin.rough + 0.05, metal: L.sMetal ? 1 : fin.metal, wear: wear * 0.7, uni, panelB: true }),
    A: mechMaterial({ color: pal.accent, rough: 0.34, metal: 0.4, wear: wear * 0.5, uni, normalScale: 0.4 }),
    M: mechMaterial({ color: pal.metal, rough: 0.42, metal: 0.85, wear: 0.3, uni, normalScale: 0.5, panelB: true }),
    K: mechMaterial({ color: '#16181d', rough: 0.68, metal: 0.25, wear: 0.1, uni, panel: false }),
    C: mechMaterial({ color: '#c9ced8', rough: 0.18, metal: 1.0, wear: 0.05, uni, panel: false }),
    G: glowMaterial(pal.emissive, 3.2 * L.lights),
    W: new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.emissive).lerp(new THREE.Color('#9fd8ff'), 0.6), transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false, envMapIntensity: 2, side: THREE.DoubleSide }),
  };
  return mats;
}

export const BONES = [
  ['pelvis', 'root'], ['waist', 'pelvis'], ['chest', 'waist'], ['cockpit', 'chest'], ['head', 'chest'], ['back', 'chest'],
  ['shL', 'chest'], ['shR', 'chest'], ['uaL', 'shL'], ['uaR', 'shR'], ['faL', 'uaL'], ['faR', 'uaR'], ['hdL', 'faL'], ['hdR', 'faR'],
  ['thL', 'pelvis'], ['thR', 'pelvis'], ['snL', 'thL'], ['snR', 'thR'], ['ftL', 'snL'], ['ftR', 'snR'], ['trL', 'pelvis'], ['trR', 'pelvis'],
];

export class MechView {
  constructor(design) {
    this.design = design; const L = design.look;
    this.r = mulberry32(design.seed ^ 0x9e3779b9);
    this.root = new THREE.Group(); this.root.name = 'mech:' + design.name;
    this.inner = new THREE.Group(); this.root.add(this.inner);
    this.uni = { uHit: { value: 0 }, uHitCol: { value: new THREE.Color(1, 0.85, 0.7) }, uTime: GLOBAL_TIME };
    this.mats = makeMats(design, this.uni);

    // —— 尺寸
    const h = L.height, b = L.bulk; let ll = L.legLen; const al = L.armLen, sw = L.shoulderW;
    this.legType = L.legs; this.digi = L.legs === 1; this.treads = L.legs === 3;
    if (L.legs === 4) ll *= 0.72; if (this.digi) ll *= 1.05;
    const d = this.d = {
      TL: 0.74 * ll, SL: (this.digi ? 0.84 : 0.74) * ll, FH: 0.2,
      CW: 1.25 * b, CH: 0.95 * h * (L.torso === 6 ? 1.05 : 1), CD: 0.95 * b, WH: 0.3 * h,
      UL: 0.7 * al * (design.role === 'assassin' ? 1.08 : 1), FL: 0.68 * al, hipX: 0.36 * b,
    };
    this.base = this.digi ? { t: 0.5, s: -1.0 } : { t: -0.14, s: 0.28 };
    d.H = this.treads ? 1.1 : d.FH + 0.08 + d.TL * Math.cos(this.base.t) + d.SL * Math.cos(this.base.t + this.base.s);

    // —— 骨架
    const bones = this.bones = { root: this.inner };
    const pos = {
      pelvis: [0, d.H, 0], waist: [0, 0.2, 0], chest: [0, d.WH, L.torso === 6 ? 0.08 : 0], cockpit: [0, d.CH * (L.torso === 3 ? 0.9 : 0.96), -0.04], head: [0, d.CH * 0.66, d.CD * 0.5],
      back: [0, d.CH * 0.45, -d.CD * 0.5], shL: [d.CW / 2 + 0.1 * sw, d.CH * 0.78, 0], shR: [-(d.CW / 2 + 0.1 * sw), d.CH * 0.78, 0],
      uaL: [0.2 * sw, -0.02, 0], uaR: [-0.2 * sw, -0.02, 0], faL: [0, -d.UL, 0], faR: [0, -d.UL, 0], hdL: [0, -d.FL, 0], hdR: [0, -d.FL, 0],
      thL: [d.hipX, -0.08, 0], thR: [-d.hipX, -0.08, 0], snL: [0, -d.TL, 0], snR: [0, -d.TL, 0], ftL: [0, -d.SL, 0], ftR: [0, -d.SL, 0],
      trL: [d.hipX + 0.32, -d.H, 0], trR: [-d.hipX - 0.32, -d.H, 0],
    };
    if (L.torso === 3) { pos.head[2] = d.CD * 0.55; }
    if (this.prepare) this.prepare(d, pos); // 形态钩子：改尺寸 / 骨架初始位置
    for (const [n, p] of BONES) { const o = new THREE.Object3D(); o.name = n; o.position.set(...pos[n]); bones[p].add(o); bones[n] = o; }

    // —— 零件
    const ps = new PartSet(); this.anchors = {}; this.spinnerNames = [];
    const ctx = {
      ps, d, r: this.r, look: L, design, anchors: this.anchors, spinners: this.spinnerNames, tail: [],
      bone: (name, parent, p) => { const o = new THREE.Object3D(); o.name = name; o.position.set(...p); bones[parent].add(o); bones[name] = o; return name; },
      anchor: (name, parent, p) => { const o = new THREE.Object3D(); o.position.set(...p); bones[parent].add(o); this.anchors[name] = o; },
    };
    this.ctx = ctx;
    this.buildParts(ctx);
    this.tailBones = ctx.tail.map((n) => bones[n]);
    this.saw = ctx.saw ? bones[ctx.saw] : null; this.drill = ctx.drill ? bones[ctx.drill] : null;
    this.spinners = this.spinnerNames.map((n) => bones[n]);
    if (!this.anchors.beam) ctx.anchor('beam', 'chest', [0, d.CH * 0.45, d.CD * 0.5 + 0.2]);
    if (!this.anchors.flame) ctx.anchor('flame', 'hdL', [0, -0.5, 0.05]);
    if (!this.anchors.saw) ctx.anchor('saw', 'hdL', [0, -0.6, 0.1]);
    ctx.anchor('core', 'chest', [0, d.CH * 0.5, 0]);
    ctx.anchor('foot0', 'ftL', [0, -d.FH, 0.1]); ctx.anchor('foot1', 'ftR', [0, -d.FH, 0.1]);
    if (this.treads) { this.bones.thL.visible = this.bones.thR.visible = false; }

    // 静止姿态矩阵 → 烘焙
    this.inner.updateMatrixWorld(true);
    const invRoot = new THREE.Matrix4().copy(this.inner.matrixWorld).invert();
    for (const k in bones) bones[k].userData.rest = new THREE.Matrix4().multiplyMatrices(invRoot, bones[k].matrixWorld);
    this.meshes = bake(ps, bones, this.mats, 1);

    // 尺度
    this.scale = design.scale; this.root.scale.setScalar(this.scale);
    this.height = this.calcHeight(d) * this.scale;

    // 动画状态
    this.cur = {}; this.phase = 0; this.recoil = 0; this.recoilZ = 0; this.squash = 0; this.shot = [0, 0];
    this.dead = false; this.deadT = 0; this.cele = 0; this.spin = 0; this.sawOn = false; this.tailT = this.r() * 10;
    this.hitT = 0; this.bob = 0; this.exploded = false;
    for (const k in bones) if (k !== 'root') this.cur[k] = new THREE.Euler();
    this.pelvisY = d.H; this.time = 0;
  }

  buildParts(ctx) {
    P.buildTorso(ctx); P.buildCockpit(ctx); P.buildHead(ctx); P.buildShoulders(ctx); P.buildArms(ctx);
    P.buildWeapons(ctx); P.buildSpecial(ctx); P.buildBack(ctx); P.buildLegs(ctx); P.buildMotif(ctx); P.buildTail(ctx);
  }
  calcHeight(d) { return d.H + d.WH + 0.2 + d.CH + 0.9; }

  setRider(av) {
    if (this.rider) this.anchors.seat.remove(this.rider.root);
    this.rider = av; if (av) { this.anchors.seat.add(av.root); av.root.position.set(0, 0, 0); av.root.rotation.set(0, 0, 0); }
  }

  anchorWorld(name, out = new THREE.Vector3()) { const a = this.anchors[name]; if (!a) return null; a.updateWorldMatrix(true, false); return out.setFromMatrixPosition(a.matrixWorld); }
  muzzleWorld(slot) {
    const names = [['muzR', 'hdR'], ['muzL', 'hdL'], ['muzS', 'muzR'], ['podL', 'thrL', 'shL'], ['podR', 'thrR', 'shR']][slot] || ['muzR'];
    for (const n of names) { if (this.anchors[n]) return this.anchorWorld(n); if (this.bones[n]) { this.bones[n].updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(this.bones[n].matrixWorld); } }
    return null;
  }
  boneWorld(n, out = new THREE.Vector3()) { const b = this.bones[n]; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }

  onShot(slot) { if (slot < 2) this.shot[slot] = 1; else this.recoil = Math.max(this.recoil, 0.35); }
  onHit(heavy, dirSign = 1) { this.recoil = Math.min(1.4, this.recoil + (heavy ? 1.0 : 0.45)); this.recoilZ = (Math.random() - 0.5) * (heavy ? 0.6 : 0.3); this.uni.uHit.value = Math.max(this.uni.uHit.value, heavy ? 0.75 : 0.35); }
  onLand(heavy) { this.squash = heavy ? 1 : 0.5; }

  // ———————————————————— 每帧姿态 ————————————————————
  update(f, dt, o) {
    this.time += dt; const t = this.time;
    this.root.position.set(f.x, f.y, f.z); this.root.rotation.y = f.yaw;
    this.uni.uHit.value = Math.max(0, this.uni.uHit.value - dt * 6);
    this.recoil = damp(this.recoil, 0, 7, dt); this.recoilZ = damp(this.recoilZ, 0, 6, dt); this.squash = damp(this.squash, 0, 6, dt);
    this.shot[0] = damp(this.shot[0], 0, 14, dt); this.shot[1] = damp(this.shot[1], 0, 14, dt);
    const d = this.d, role = this.design.role, dig = this.digi ? -1 : 1;
    const T = {};
    const set = (k, x = 0, y = 0, z = 0) => { T[k] = [x, y, z]; };
    const add = (k, x = 0, y = 0, z = 0) => { const v = T[k] || (T[k] = [0, 0, 0]); v[0] += x; v[1] += y; v[2] += z; };

    // —— 基础站姿（定位决定架势）
    const gp = { tank: [-0.2, -1.0, 0.12], assassin: [-0.45, -1.5, 0.2], gunner: [-0.15, -1.5, 0.1], brawler: [-0.5, -1.75, 0.22] }[role];
    const ranged = this.design.range === 'ranged';
    set('uaL', gp[0], 0, gp[2]); set('uaR', gp[0], 0, -gp[2]);
    set('faL', gp[1]); set('faR', gp[1]);
    if (ranged) { set('uaR', -0.08, 0, -0.08); set('faR', -1.5); if (['gatling', 'blaster'].includes(this.design.main)) { set('uaL', -0.08, 0, 0.08); set('faL', -1.5); } }
    set('hdL'); set('hdR'); set('shL'); set('shR');
    set('waist'); set('chest', role === 'brawler' ? 0.12 : role === 'assassin' ? 0.08 : 0.03); set('head'); set('cockpit'); set('back');
    let crouch = role === 'assassin' ? 0.12 : role === 'brawler' ? 0.08 : 0.03;
    // 呼吸 / 怠速
    const idle = Math.sin(t * 2.2 + this.tailT) * 0.03;
    add('chest', idle * 0.5); add('uaL', idle); add('uaR', -idle);

    // —— 步态：相位推进与实际位移速度绑定（落脚与位移一致）
    const vf = f.localV.f, vs = f.localV.s; const spd = Math.hypot(vf, vs);
    const stride = (d.TL + d.SL) * 0.95 * this.scale;
    const grounded = f.grounded;
    if (grounded && !this.dead) this.phase += spd * dt / stride * Math.PI;
    const amp = grounded ? clamp(spd / Math.max(2.5, f.st.mspd), 0, 1.25) : 0;
    this.amp = damp(this.amp || 0, amp, 10, dt);
    const A = this.amp; const dir = Math.atan2(vs, vf);
    const swing = Math.sin(this.phase) * (this.digi ? 0.5 : 0.55) * A;
    const liftL = Math.max(0, Math.cos(this.phase)) * 0.85 * A, liftR = Math.max(0, -Math.cos(this.phase)) * 0.85 * A;
    const cf = Math.cos(dir), cs = Math.sin(dir);
    // 机身随运动倾斜、手臂随步伐摆动
    add('chest', clamp(vf * 0.022, -0.12, 0.15), 0, clamp(-vs * 0.02, -0.12, 0.12));
    add('waist', 0, swing * 0.18 * cf, 0);
    if (!ranged) { add('uaL', swing * 0.25 * cf); add('uaR', -swing * 0.25 * cf); }
    this.stepSnd = this.stepSnd || 0;
    const stepPhase = Math.floor(this.phase / Math.PI);
    if (stepPhase !== this.lastStep) { this.lastStep = stepPhase; if (A > 0.25 && grounded) this.onStep && this.onStep(stepPhase & 1, A); }

    // —— 动作层
    const a = f.act; const at = a ? a.t : 0; const ad = a ? a.dur : 1; const u = a ? clamp(at / ad, 0, 1) : 0;
    let k = 12; // 姿态跟随速度
    const side = (a && a.data && a.data.combo ? a.data.combo : 1) % 2 ? 'R' : 'L';
    const os = side === 'R' ? 'L' : 'R'; const sgn = side === 'R' ? -1 : 1;
    const w = this.design.main;
    if (a && f.alive) {
      const D = a.data || {};
      const hitT = D.hit ? D.hit / ad : 0.4;
      const wind = clamp(u / hitT, 0, 1), rec = clamp((u - hitT) / (1 - hitT), 0, 1);
      switch (a.type) {
        case 'jab': case 'cross': {
          k = 26;
          if (w === 'blade' || w === 'claw') { // 横斩
            const sw = u < hitT ? -1.0 * wind : -1.0 + 2.2 * clamp((u - hitT * 0.8) / 0.25, 0, 1);
            set('ua' + side, -1.25, 0, sgn * (0.9 + sw * 0.9)); set('fa' + side, -0.5); add('chest', 0.08, sgn * -sw * 0.45, 0); add('waist', 0, sgn * -sw * 0.25, 0);
          } else if (w === 'hammer') {
            set('uaR', u < hitT ? -0.6 - 1.8 * wind : -2.4 + 1.5 * clamp((u - hitT) / 0.2, 0, 1), 0, -0.1); set('faR', -0.3);
          } else { // 直拳
            const ext = u < hitT ? -0.2 * wind : 1 - rec * 0.85;
            set('ua' + side, -0.25 - 1.3 * Math.max(0, ext), 0, sgn * 0.08); set('fa' + side, -1.6 + 1.5 * Math.max(0, ext));
            add('chest', 0.1 * Math.max(0, ext), sgn * (-0.35 * Math.max(0, ext) + 0.2 * wind * (1 - Math.max(0, ext))), 0);
            add('waist', 0, sgn * -0.2 * Math.max(0, ext), 0);
          }
          crouch += 0.05;
          break;
        }
        case 'heavy': case 'jumppunch': {
          k = 22;
          if (w === 'hammer' || role === 'tank') { // 双手过顶重砸
            const up = u < hitT ? wind : 1 - clamp((u - hitT) / 0.12, 0, 1);
            set('uaL', -0.6 - 2.3 * up, 0, 0.25); set('uaR', -0.6 - 2.3 * up, 0, -0.25); set('faL', -0.4 - 0.6 * up); set('faR', -0.4 - 0.6 * up);
            add('chest', -0.25 * up + 0.35 * (1 - up) * (u > hitT ? 1 : 0)); crouch += u > hitT ? 0.2 * (1 - rec) : 0;
          } else if (w === 'blade' || w === 'claw') { // 双刃交叉斩
            const s2 = u < hitT ? wind : 1;
            set('uaL', -2.2 + 1.2 * (u > hitT ? 1 : 0), 0, 0.9 - 1.4 * s2 * (u > hitT ? 1 : 0)); set('uaR', -2.2 + 1.2 * (u > hitT ? 1 : 0), 0, -0.9 + 1.4 * s2 * (u > hitT ? 1 : 0)); set('faL', -0.4); set('faR', -0.4);
            add('chest', u > hitT ? 0.25 : -0.15);
          } else { // 上勾拳
            const up = u < hitT ? wind : 1 - rec;
            set('ua' + side, u < hitT ? 0.35 * wind : -2.1 * up, 0, sgn * 0.15); set('fa' + side, u < hitT ? -1.9 : -1.2 + 0.4 * up);
            add('chest', u < hitT ? 0.2 * wind : -0.25 * up, sgn * (u < hitT ? 0.4 * wind : -0.3 * up)); crouch += u < hitT ? 0.25 * wind : 0;
          }
          break;
        }
        case 'bash': { k = 22; const up = u < hitT ? wind : 1 - rec; add('chest', 0.3 * (u > hitT ? up : -0.3 * wind), sgn * 0.5 * up); set('uaR', -0.2 - 0.8 * up, 0, -0.5); crouch += 0.15; break; }
        case 'shoot': {
          k = 20; set('uaR', -0.08 - this.shot[0] * 0.1, 0, -0.08); set('faR', -1.5 + this.shot[0] * 0.35);
          if (['gatling', 'blaster'].includes(w)) { set('uaL', -0.08 - this.shot[1] * 0.1, 0, 0.08); set('faL', -1.5 + this.shot[1] * 0.35); }
          crouch += 0.08; add('chest', -0.04 * (this.shot[0] + this.shot[1]));
          break;
        }
        case 'block': { k = 28; set('uaL', -1.2, 0, -0.35); set('uaR', -1.2, 0, 0.35); set('faL', -1.5); set('faR', -1.5); set('hdL', 0, 0, 0); crouch += 0.28; add('chest', 0.18); break; }
        case 'dodge': { k = 24; const s2 = D.side || 1; add('chest', 0.1, 0, -s2 * 0.35); add('waist', 0, 0, -s2 * 0.15); crouch += 0.25; break; }
        case 'jumpdodge': { k = 18; add('chest', -0.15); break; }
        case 'hitstun': { k = 30; add('chest', D.heavy ? -0.45 : -0.2, 0, this.recoilZ); set('uaL', 0.3, 0, 0.6); set('uaR', 0.3, 0, -0.6); set('faL', -0.6); set('faR', -0.6); crouch += 0.15; break; }
        case 'leap': {
          k = 18;
          if (D.phase === 0) { crouch += 0.45 * clamp(at / 0.28, 0, 1); set('uaL', 0.5, 0, 0.3); set('uaR', 0.5, 0, -0.3); }
          else if (D.phase === 1) { const up = f.vy > 0 ? 1 : 0; set('uaL', -2.8 + (1 - up) * 0.4, 0, 0.3); set('uaR', -2.8 + (1 - up) * 0.4, 0, -0.3); set('faL', -0.5); set('faR', -0.5); add('chest', up ? -0.3 : 0.35); }
          else { set('uaL', -0.9, 0, 0.35); set('uaR', -0.9, 0, -0.35); set('faL', -0.2); set('faR', -0.2); add('chest', 0.5); crouch += 0.45; }
          break;
        }
        // —— 特色小招
        case 'sp_charge': { k = 16; const run = at > 0.35 && at < 1.05; add('chest', run ? 0.55 : 0.2); set('uaL', -0.5, 0, 0.6); set('uaR', -0.5, 0, -0.6); set('faL', -1.2); set('faR', -1.2); crouch += run ? 0.25 : 0.35; break; }
        case 'sp_chainsaw': case 'sp_drill': { k = 20; const j = Math.sin(t * 40) * 0.03; set('uaL', -1.35 + j, 0, -0.05); set('faL', -0.2 + j); add('chest', 0.15, 0.3, 0); crouch += 0.15; set('uaR', -0.6, 0, -0.3); set('faR', -1.5); break; }
        case 'sp_flame': { k = 18; set('uaL', -0.25, 0, 0.0); set('faL', -1.45 + Math.sin(t * 9) * 0.04); add('chest', 0.06, 0.22, 0); crouch += 0.15; break; }
        case 'sp_cannon': case 'sp_missile': { k = 16; crouch += 0.3; add('chest', a.type === 'sp_missile' ? -0.2 : 0.1); set('uaL', -0.3, 0, 0.5); set('uaR', -0.3, 0, -0.5); set('faL', -1.2); set('faR', -1.2); break; }
        case 'sp_laser': { k = 16; const ch = at < 0.55; add('chest', ch ? -0.2 : 0.05); set('uaL', 0.2, 0, 0.8); set('uaR', 0.2, 0, -0.8); set('faL', -1.0); set('faR', -1.0); crouch += 0.25; break; }
        case 'sp_shock': { k = 22; const up = at < 0.5; set('uaL', up ? -2.9 : -0.6, 0, 0.3); set('uaR', up ? -2.9 : -0.6, 0, -0.3); set('faL', up ? -0.6 : -0.1); set('faR', up ? -0.6 : -0.1); add('chest', up ? -0.3 : 0.5); crouch += up ? 0.1 : 0.55; break; }
        case 'sp_elec': { k = 18; set('uaL', -1.3, 0, 1.0); set('uaR', -1.3, 0, -1.0); set('faL', -0.3); set('faR', -0.3); add('chest', -0.15); crouch += 0.1; break; }
        // —— 大招
        case 'ult_meteor': {
          k = 16;
          if (!D.phase) { crouch += 0.55 * clamp(at / 0.55, 0, 1); set('uaL', 0.4, 0, 0.6); set('uaR', 0.4, 0, -0.6); add('chest', 0.3); }
          else if (D.phase === 1) { set('uaL', -3.0, 0, 0.2); set('uaR', -3.0, 0, -0.2); set('faL', -0.8); set('faR', -0.8); add('chest', f.vy > 0 ? -0.35 : 0.5); }
          else { set('uaL', -0.7, 0, 0.2); set('uaR', -0.7, 0, -0.2); add('chest', 0.6); crouch += 0.6 * (1 - clamp((at - (D.landT || 0)) / 0.7, 0, 1)) + 0.1; }
          break;
        }
        case 'ult_barrage': { k = 16; crouch += 0.35; add('chest', -0.25); set('uaL', 0.1, 0, 0.9); set('uaR', 0.1, 0, -0.9); set('faL', -1.3); set('faR', -1.3); break; }
        case 'ult_beam': { k = 14; const ch = at < 1.0; add('chest', ch ? -0.25 : 0.12); set('uaL', ch ? 0.4 : -1.1, 0, ch ? 0.9 : 0.25); set('uaR', ch ? 0.4 : -1.1, 0, ch ? -0.9 : -0.25); set('faL', ch ? -1.4 : -0.6); set('faR', ch ? -1.4 : -0.6); crouch += 0.3; break; }
        case 'ult_frenzy': {
          k = 30; const i = a.ticks || 0; const s2 = i % 2 ? 1 : -1; const ph = ((at - 0.5) % 0.24) / 0.24;
          set('ua' + (s2 > 0 ? 'L' : 'R'), -1.4, 0, s2 * (1 - ph * 2)); set('fa' + (s2 > 0 ? 'L' : 'R'), -0.4);
          set('ua' + (s2 > 0 ? 'R' : 'L'), -0.4, 0, -s2 * 0.4); add('chest', 0.2, s2 * (0.5 - ph), 0); crouch += 0.2; break;
        }
        case 'ult_inferno': { k = 14; set('uaL', -1.4, 0, 1.3); set('uaR', -1.4, 0, -1.3); set('faL', -0.2); set('faR', -0.2); add('waist', 0, Math.sin(at * 9) * 0.6, 0); crouch += 0.15; break; }
        case 'ult_storm': { k = 14; set('uaR', -3.0, 0, -0.15); set('faR', -0.1); set('uaL', -0.4, 0, 0.6); add('chest', -0.25); crouch += 0.1; break; }
      }
    }
    // 腾空：收腿
    let tuck = 0;
    if (!grounded && f.alive) tuck = f.vy > 0 ? 0.55 : 0.35;
    // 受击 / 落地弹性
    add('chest', -this.recoil * 0.4, 0, this.recoilZ * this.recoil); add('waist', -this.recoil * 0.12);
    crouch += this.squash * 0.35;

    // 庆祝
    if (this.cele > 0 && f.alive) {
      k = 10; const c = t * 5;
      set('uaL', -2.9 + Math.sin(c) * 0.25, 0, 0.4); set('uaR', -2.9 - Math.sin(c) * 0.25, 0, -0.4); set('faL', -0.4 - Math.max(0, Math.sin(c)) * 0.8); set('faR', -0.4 - Math.max(0, -Math.sin(c)) * 0.8);
      add('chest', -0.2, Math.sin(t * 2) * 0.3, 0); crouch = 0.05 + Math.max(0, Math.sin(c * 2)) * 0.12;
    }

    // —— 腿部
    let th = this.base.t, sn = this.base.s;
    const legs = {};
    for (const [s2, sw2, lift] of [['L', swing, liftL], ['R', -swing, liftR]]) {
      let tx = th - sw2 * cf * dig, tz = sw2 * cs * 0.55 * (s2 === 'L' ? 1 : 1);
      let sx = sn + (lift * dig);
      tx -= crouch * 1.0 * dig; sx += crouch * 2.0 * dig;
      tx -= tuck * dig; sx += tuck * 1.6 * dig;
      legs[s2] = [tx, sx, tz];
    }
    if (this.dead) { legs.L = [1.25, 0.2, 0.15]; legs.R = [1.0, 0.5, -0.1]; }
    for (const s2 of ['L', 'R']) {
      const [tx, sx, tz] = legs[s2];
      set('th' + s2, tx, 0, tz + (s2 === 'L' ? 0.04 : -0.04)); set('sn' + s2, sx); set('ft' + s2, -(tx + sx) * (grounded ? 1 : 0.5), 0, -tz);
    }
    // 骨盆高度：支撑腿完全落地（脚底贴地）
    const ext = (tx, sx, tz) => d.TL * Math.cos(tx) * Math.cos(tz) + d.SL * Math.cos(tx + sx) * Math.cos(tz);
    let py = this.treads ? d.H - crouch * 0.25 + Math.sin(t * 18) * 0.008 * A : d.FH + 0.08 + Math.max(ext(...legs.L), ext(...legs.R));
    if (this.dead) py = damp(this.pelvisY, d.CD * 0.55, 5, dt);
    this.pelvisY = damp(this.pelvisY, py, 30, dt);
    this.bones.pelvis.position.y = this.pelvisY;

    // 死亡姿态
    if (this.dead) {
      k = 5; this.deadT += dt;
      set('pelvis', -1.4, 0, 0.12); set('chest', -0.2, 0.3, 0.1);
      set('uaL', -0.2, 0, 1.3); set('uaR', -2.0, 0, -0.8); set('faL', -0.4); set('faR', -0.2);
      set('waist', 0, 0, 0);
    } else set('pelvis', 0, 0, 0);
    // 尾巴
    for (let i = 0; i < this.tailBones.length; i++) set('tail' + i, 0.12 + Math.sin(t * 2.4 - i * 0.7) * 0.05, Math.sin(t * 1.7 - i * 0.6) * 0.25, 0);

    // —— 应用（带阻尼）
    const kk = 1 - Math.exp(-k * dt);
    for (const name in T) {
      const e = this.cur[name]; if (!e) continue; const v = T[name];
      e.x += (v[0] - e.x) * kk; e.y += (v[1] - e.y) * kk; e.z += (v[2] - e.z) * kk;
      this.bones[name].rotation.copy(e);
    }
    // 旋转部件
    const spinning = a && (a.type === 'shoot' || a.type === 'ult_barrage');
    this.spin = damp(this.spin, spinning ? 40 : 0, 4, dt);
    for (const s of this.spinners) s.rotation.y += this.spin * dt;
    if (this.saw) this.saw.position.y = -0.05 + (this.sawOn ? Math.sin(t * 90) * 0.02 : 0);
    if (this.drill) this.drill.rotation.y += (this.sawOn ? 45 : 0) * dt;
    if (this.rider) this.rider.update(dt, f, this);
  }

  dispose() {
    for (const m of this.meshes) { m.geometry.dispose(); }
    for (const k in this.mats) this.mats[k].dispose();
  }
}
