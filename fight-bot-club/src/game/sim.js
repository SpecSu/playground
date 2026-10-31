// 战斗模拟（与渲染解耦，可在 Node 中无头跑批校准节奏）
// 所有伤害都由双方属性 + 招式倍率 + 命中/格挡/闪避的实时结果决定，不预设胜负
import { clamp, angDiff, rr } from '../core/util.js';

export const RING = 9.4;          // 擂台内场半宽（围绳内）
export const G = 26;              // 重力
export const TUNE = { dmg: 1.15, scale: 10 }; // scale：血量与伤害同步放大的量级（不影响时长）   // 全局伤害系数（由无头跑批校准，使单局约 2 分钟） // v10.2：走位拉开后接触时间变少，伤害 +15% 让单局时长回到原水平
const ROLE_DMG = { gunner: 0.92, assassin: 1.04, tank: 0.98, brawler: 1.02 }; // 跑批校准的职业伤害系数
const ENERGY_PASSIVE = 2.4, ENERGY_DEAL = 0.075, ENERGY_TAKE = 0.06;

// 形态物理：体积 / 身高 / 臂展 / 重力系数（浮游类跳跃更飘，但有升限，不能无限飞）
export const FORM_SIM = {
  humanoid: { r: 1, h: 1, reach: 1, g: 1, ceil: 99 },
  dog: { r: 1.0, h: 0.75, reach: 1.1, g: 1.05, ceil: 99 },
  spider: { r: 1.2, h: 0.7, reach: 1.05, g: 1.1, ceil: 99 },
  hover: { r: 1.0, h: 0.85, reach: 1, g: 0.5, ceil: 4.2 },
  tank: { r: 1.25, h: 0.82, reach: 1.05, g: 1.25, ceil: 99 },
  wraith: { r: 0.95, h: 1.0, reach: 1.05, g: 0.6, ceil: 4.6 },
  manta: { r: 1.25, h: 0.75, reach: 1.05, g: 0.5, ceil: 4.4 },
  tiger: { r: 1.0, h: 0.9, reach: 1.15, g: 1.0, ceil: 99 },
  turtle: { r: 1.25, h: 0.72, reach: 1.0, g: 1.3, ceil: 99 },
  croc: { r: 1.1, h: 0.45, reach: 1.25, g: 1.15, ceil: 99 },
  trex: { r: 1.0, h: 1.05, reach: 1.15, g: 1.15, ceil: 99 },
  flamingo: { r: 0.9, h: 1.1, reach: 1.1, g: 0.8, ceil: 99 },
  frog: { r: 1.1, h: 0.62, reach: 1.05, g: 0.7, ceil: 99 },
  rabbit: { r: 0.95, h: 0.85, reach: 1.0, g: 0.72, ceil: 99 },
};
export const ROLE_AI = {
  tank: { pref: 2.7, react: 0.5, block: 0.6, dodge: 0.12, jump: 0.12, aggr: 0.62, circle: 0.55, turn: 4.2, poise: 0.55, think: 0.55 },
  assassin: { pref: 2.5, react: 0.2, block: 0.18, dodge: 0.62, jump: 0.38, aggr: 0.82, circle: 1.0, turn: 11, poise: 1.0, think: 0.28 },
  gunner: { pref: 8.5, react: 0.32, block: 0.25, dodge: 0.45, jump: 0.22, aggr: 0.55, circle: 0.8, turn: 7, poise: 0.85, think: 0.38 },
  brawler: { pref: 2.4, react: 0.38, block: 0.3, dodge: 0.22, jump: 0.32, aggr: 1.0, circle: 0.7, turn: 7.5, poise: 0.75, think: 0.4 },
};

// v10.2 走位风格（按体型）：近战按「贴脸爆发 → 脱离 → 拉开游走 → 冲刺压上」循环；远程保持距离绕圈 + 左右跳
// engage：贴身缠斗时长；brk：脱离后要拉开到的距离；prowl：游走时长；mode：游走方式；hop：游走时左右 / 后跳概率（每次决策）
// hopV / hopS：跳跃起跳竖直速度 / 水平速度；ground：不跳，用地面滑步；rush：冲刺速度倍率；leap：冲刺时飞扑概率；far：远程保持距离
export const STYLE = {
  // v10.2b 收紧：手机竖屏里两台要始终够大 → 脱离只拉开到 4.5~6.5m、游走很短就冲回，大部分时间仍是中近距离缠斗
  kite:   { engage: [2.4, 3.8], brk: [5.2, 6.8], prowl: [0.5, 1.0], mode: 'orbit', hop: 0.3, hopV: 8.5, hopS: 6.5, rush: 1.8, leap: 0.5, far: [5.5, 7.2], mirror: 0.3 },
  pounce: { engage: [3.2, 5.0], brk: [4.8, 6.2], prowl: [0.4, 0.8], mode: 'stalk', hop: 0.15, hopV: 9.5, hopS: 7, rush: 2.0, leap: 0.6, far: [5, 6.5], mirror: 0.4 },
  heavy:  { engage: [4.2, 6.2], brk: [4.2, 5.4], prowl: [0.4, 0.8], mode: 'press', hop: 0.25, ground: true, rush: 1.4, leap: 0.12, far: [5, 6], mirror: 0.25 },
  agile:  { engage: [2.6, 4.0], brk: [4.6, 6.0], prowl: [0.4, 0.9], mode: 'weave', hop: 0.28, hopV: 9, hopS: 6.5, rush: 1.8, leap: 0.4, far: [5.5, 7], mirror: 0.35 },
};
const FORM_STYLE = { manta: 'kite', hover: 'kite', wraith: 'kite', flamingo: 'kite', spider: 'kite', trex: 'pounce', tiger: 'pounce', croc: 'pounce', tank: 'heavy', turtle: 'heavy', dog: 'agile', humanoid: 'agile', rabbit: 'agile', frog: 'agile' };

// 招式表：t=时长，hit=判定时刻（归一化前，秒），m=伤害倍率
const BASIC = {
  jab: { t: 0.42, hit: 0.17, m: 0.8, kb: 1.6, stun: 0.2 },
  cross: { t: 0.5, hit: 0.21, m: 0.95, kb: 2.2, stun: 0.22 },
  heavy: { t: 0.74, hit: 0.35, m: 1.5, kb: 6.5, stun: 0.42, heavy: true },
  bash: { t: 0.62, hit: 0.26, m: 1.05, kb: 6, stun: 0.35, heavy: true },
};
const SHOOT = {
  gatling: { t: 0.95, shots: [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75], m: 0.27, speed: 46, kind: 'bullet', r: 0.25 },
  blaster: { t: 0.72, shots: [0.2, 0.46], m: 0.68, speed: 34, kind: 'plasma', r: 0.35 },
  cannon: { t: 1.0, shots: [0.42], m: 1.35, speed: 30, kind: 'shell', r: 0.4, splash: 2.2 },
};
export const SPECIAL_CD = { charge: 7, chainsaw: 9, flame: 9, cannon: 8, laser: 10, missile: 10, drill: 9, shock: 8, elec: 9, blink: 8, hook: 9, disc: 8, mortar: 9 };
const SPECIAL_RANGE = { charge: [3.2, 11], chainsaw: [0, 3.6], flame: [0, 6.2], cannon: [3.5, 17], laser: [2, 17], missile: [3, 19], drill: [0, 5.5], shock: [0, 4.6], elec: [0, 9.5], blink: [2.5, 12], hook: [3.5, 13], disc: [2.5, 14], mortar: [5, 19] };
const ULT_RANGE = { meteor: [0, 13], barrage: [3, 20], beam: [2, 18], frenzy: [0, 9], inferno: [0, 6], storm: [0, 20], blackhole: [0, 16], orbital: [0, 22], tornado: [0, 11], phantom: [0, 14], glacier: [2, 17] };

let PID = 0;

export class Fighter {
  constructor(design, side) {
    this.d = design; this.side = side; this.id = design.id;
    this.ai = ROLE_AI[design.role];
    this.st = design.stats;
    this.scale = design.scale || 1;
    const fs = this.fs = FORM_SIM[design.form] || FORM_SIM.humanoid;
    this.radius = 1.42 * this.scale * fs.r;
    this.height = 3.4 * this.scale * (design.look?.height || 1) * fs.h;
    this.reach = (2.1 + 1.25 * this.scale) * fs.reach;
    this.maxHp = this.st.hp * TUNE.scale; this.hp = this.maxHp; this.energy = 0;
    this.x = side ? 6 : -6; this.z = 0; this.y = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.kx = 0; this.kz = 0;
    this.yaw = side ? -Math.PI / 2 : Math.PI / 2; this.grounded = true;
    this.cd = { special: rr(2, 4), dodge: 0, jump: rr(1, 3), block: 0, think: 0, hop: rr(0.8, 2) }; this.tact = rr(2, 4);
    this.styleKey = FORM_STYLE[design.form] || 'agile'; this.sty = STYLE[this.styleKey];
    this.rh = { ph: 'prowl', until: rr(0.5, 1.1), dist: 0 }; // 开场先短暂对峙游走，再冲刺对撞
    this.farD = rr(...this.sty.far);
    this.act = null; this.stun = 0; this.combo = 0; this.comboT = 0;
    this.move = { mode: 'approach', dir: Math.random() < 0.5 ? 1 : -1, tx: 0, tz: 0, t: 0 };
    this.alive = true; this.react = null; this.dealt = 0; this.hitFlash = 0; this.lockYaw = null;
    this.localV = { f: 0, s: 0 }; this.lastAct = '';
    this.hitStreak = 0; this.frozen = true;
  }
  get busy() { return !!this.act && !this.act.cancelable; }
  dist(o) { return Math.hypot(o.x - this.x, o.z - this.z); }
  angleTo(o) { return Math.atan2(o.x - this.x, o.z - this.z); }
  facingErr(o) { return Math.abs(angDiff(this.yaw, this.angleTo(o))); }
}

export const ULT_FIRST = 12, ULT_EVERY = 16; // 投票大招：开打 12s 后第一次，之后每 16s 一次

export class Sim {
  constructor() {
    this.f = []; this.proj = []; this.zones = []; this.listeners = []; this.time = 0;
    this.muzzle = null; // (fighter, slot) => {x,y,z}，由渲染层提供精确炮口位置
    this.paused = false;
    // v10.1 投票大招：双方共用一个大招倒计时，到点后由观众投票决定谁放（渲染层监听 ultVote → 调 resolveVote）
    this.voteMode = false; this.ultClock = 0; this.voteOpen = false;
  }
  enableVote(first = ULT_FIRST) { this.voteMode = true; this.ultClock = this.ultPeriod = first; this.voteOpen = false; for (const f of this.f) f.energy = 0; }
  resolveVote(f, boost = 1) {
    this.voteOpen = false; this.ultClock = this.ultPeriod = ULT_EVERY;
    if (f && f.alive) { f.forceUlt = boost; f.stun = 0; f.react = null; }
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const l of this.listeners) l(type, data); }
  setFighters(a, b) { this.f = [a, b]; this.proj.length = 0; this.zones.length = 0; }
  other(f) { return this.f[0] === f ? this.f[1] : this.f[0]; }

  startAct(f, type, dur, data = {}) {
    const prev = f.act; if (prev && prev.data && prev.data.lockOwn) f.lockYaw = null;
    if (prev && prev.type.startsWith('ult_') && prev.t < prev.dur) this.emit('actCut', { f, type: prev.type });
    f.act = { type, t: 0, dur, data, cancelable: !!data.cancelable, fired: {} };
    f.lastAct = type;
    this.emit('act', { f, type, data });
    const o = this.other(f);
    if (o && o.alive && data.threat) this.onThreat(o, f, type, data.threat);
  }

  onThreat(def, att, type, kind) {
    if (def.busy || def.stun > 0 || !def.grounded) return;
    const ai = def.ai; const lowHp = def.hp / def.maxHp < 0.35;
    let p = 0, mode = null;
    const d = def.dist(att);
    if (kind === 'melee' && d < att.reach + 2.5) {
      if (Math.random() < ai.block * (lowHp ? 1.25 : 1)) mode = 'block';
      else if (Math.random() < ai.dodge * 0.8) mode = 'dodge';
    } else if (kind === 'ranged' || kind === 'special') {
      if (Math.random() < ai.dodge) mode = Math.random() < ai.jump + 0.2 ? 'jumpdodge' : 'dodge';
      else if (Math.random() < ai.block * 0.8) mode = 'block';
    } else if (kind === 'ult') {
      if (Math.random() < ai.dodge * 0.9 + 0.1) mode = Math.random() < 0.5 ? 'jumpdodge' : 'dodge';
      else if (Math.random() < 0.5) mode = 'block';
    }
    if (mode) def.react = { mode, t: ai.react * rr(0.6, 1.25) * (kind === 'melee' ? 0.6 : 1), att };
  }

  step(dt) {
    if (this.paused) return;
    this.time += dt;
    if (this.voteMode && !this.voteOpen) {
      const [a, b] = this.f;
      const busy = this.f.some((f) => f.forceUlt || f.act && f.act.type.startsWith('ult_'));
      if (a && b && a.alive && b.alive && !a.frozen && !b.frozen && !busy) {
        this.ultClock -= dt;
        if (this.ultClock <= 0) { this.ultClock = 0; this.voteOpen = true; this.emit('ultVote', { a, b }); }
      }
    }
    for (const f of this.f) this.updateFighter(f, dt);
    this.separate();
    this.updateProjectiles(dt);
    this.updateZones(dt);
  }

  // ———————————————————— 单个机器人 ————————————————————
  updateFighter(f, dt) {
    const o = this.other(f);
    f.hitFlash = Math.max(0, f.hitFlash - dt * 4);
    for (const k in f.cd) f.cd[k] = Math.max(0, f.cd[k] - dt);
    f.comboT = Math.max(0, f.comboT - dt); if (f.comboT <= 0) f.combo = 0;

    // 物理：垂直
    if (!f.grounded) {
      const fs = f.fs || FORM_SIM.humanoid;
      f.vy -= G * fs.g * dt; f.y += f.vy * dt;
      if (f.y > fs.ceil && f.vy > 0) { f.y = fs.ceil; f.vy *= 0.2; } // 升限：低空浮游，不会飞出擂台
      if (f.y <= 0) { f.y = 0; const heavy = f.vy < -12; f.vy = 0; f.grounded = true; this.emit('land', { f, heavy }); this.onLand(f, o); }
    }
    if (!f.alive) { this.integrate(f, dt, 0, 0, 8); if (f.act) { f.act.t += dt; } return; }
    if (f.frozen) { this.integrate(f, dt, 0, 0, 10); this.faceTo(f, o, dt, 1); return; }

    if (f.alive && f.energy < 100 && !this.voteMode) f.energy = Math.min(100, f.energy + ENERGY_PASSIVE * dt);
    // 投票胜出 → 落地即放大招（打断当前动作）
    if (f.forceUlt) {
      f.stun = 0; if (f.act && f.act.type === 'hitstun') f.act = null;
      if (f.grounded) { const b = f.forceUlt; f.forceUlt = 0; this.startUlt(f, o); f.ultBoost = b; return; }
    }

    if (f.stun > 0) {
      f.stun -= dt;
      if (f.stun <= 0 && f.act && f.act.type === 'hitstun') f.act = null;
      this.integrate(f, dt, 0, 0, 6);
      return;
    }

    // 反应（格挡 / 闪避）
    if (f.react) {
      f.react.t -= dt;
      if (f.react.t <= 0) {
        const r = f.react; f.react = null;
        if (!f.busy && f.grounded) this.doReaction(f, o, r.mode);
      }
    }

    let wantVx = 0, wantVz = 0, accel = 10;
    if (f.act) {
      const a = f.act; a.t += dt;
      const res = this.runAct(f, o, a, dt);
      if (res) { wantVx = res.vx || 0; wantVz = res.vz || 0; accel = res.accel ?? 14; }
      if (a.t >= a.dur && f.act === a) { f.act = null; if (a.data && a.data.lockOwn) f.lockYaw = null; this.emit('actEnd', { f, type: a.type }); }
    }
    if (!f.act || f.act.cancelable) {
      // 决策
      f.cd.think -= 0; // 保持
      if (f.cd.think <= 0 && o.alive && !o.frozen) { this.think(f, o); f.cd.think = f.ai.think * rr(0.45, 1.0); } // v10.1：决策更密 → 出手 / 变向更频繁
      if (!f.act || f.act.cancelable) {
        const mv = this.locomotion(f, o, dt); wantVx = mv.vx; wantVz = mv.vz; accel = mv.accel;
      }
    }
    if (o.alive || f.act) this.faceTo(f, o, dt);
    this.integrate(f, dt, wantVx, wantVz, accel);
  }

  faceTo(f, o, dt, mul = 1) {
    let target = f.lockYaw != null ? f.lockYaw : f.angleTo(o);
    const turn = f.ai.turn * mul * (f.act && f.act.data.slowTurn ? 0.25 : 1);
    const d = angDiff(f.yaw, target);
    const maxStep = turn * dt;
    f.yaw += clamp(d, -maxStep, maxStep);
  }

  integrate(f, dt, wvx, wvz, accel) {
    const k = 1 - Math.exp(-accel * dt);
    if (f.grounded) { f.vx += (wvx - f.vx) * k; f.vz += (wvz - f.vz) * k; }
    else { f.vx += (wvx - f.vx) * k * 0.15; f.vz += (wvz - f.vz) * k * 0.15; }
    // 击退
    const kd = Math.exp(-5.5 * dt);
    f.kx *= kd; f.kz *= kd;
    f.x += (f.vx + f.kx) * dt; f.z += (f.vz + f.kz) * dt;
    const lim = RING - f.radius;
    // 撞绳回弹
    if (f.x > lim) { f.x = lim; if (f.kx > 3) this.emit('rope', { f }); f.kx = -Math.abs(f.kx) * 0.5; f.vx = Math.min(f.vx, 0); }
    if (f.x < -lim) { f.x = -lim; if (f.kx < -3) this.emit('rope', { f }); f.kx = Math.abs(f.kx) * 0.5; f.vx = Math.max(f.vx, 0); }
    if (f.z > lim) { f.z = lim; if (f.kz > 3) this.emit('rope', { f }); f.kz = -Math.abs(f.kz) * 0.5; f.vz = Math.min(f.vz, 0); }
    if (f.z < -lim) { f.z = -lim; if (f.kz < -3) this.emit('rope', { f }); f.kz = Math.abs(f.kz) * 0.5; f.vz = Math.max(f.vz, 0); }
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    const vx = f.vx + f.kx, vz = f.vz + f.kz;
    f.localV.f = vx * s + vz * c; f.localV.s = vx * c - vz * s;
  }

  separate() {
    const [a, b] = this.f; if (!a || !b) return;
    const dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz) || 0.001;
    const min = a.radius + b.radius;
    if ((a.act && a.act.data && a.act.data.ghost) || (b.act && b.act.data && b.act.data.ghost)) return;
    if (d < min && Math.abs(a.y - b.y) < 2.5) {
      const push = (min - d) / 2; const nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    }
  }

  // ———————————————————— 决策 ————————————————————
  think(f, o) {
    const ai = f.ai, d = f.dist(o);
    const myHp = f.hp / f.maxHp, opHp = o.hp / o.maxHp;
    const melee = f.d.range === 'melee';
    let aggr = ai.aggr * (f.d.role === 'brawler' && myHp < 0.35 ? 1.35 : 1) * (myHp < 0.3 && f.d.role !== 'brawler' ? 0.75 : 1) * (opHp < 0.25 ? 1.2 : 1);
    const R = Math.random;

    // 大招
    if (!this.voteMode && f.energy >= 100 && f.grounded && this.time >= (this.nextUlt || 0)) {
      const [a0, b0] = ULT_RANGE[f.d.ult];
      f.ultWait = (f.ultWait || 0) + f.ai.think;
      if ((d >= a0 && d <= b0 && R() < 0.7) || f.ultWait > 2.5) { f.ultWait = 0; return this.startUlt(f, o); }
    }
    // 特色小招
    if (f.cd.special <= 0 && f.grounded) {
      const [a0, b0] = SPECIAL_RANGE[f.d.special];
      if (d >= a0 && d <= b0 && R() < 0.5 * aggr + 0.15) return this.startSpecial(f, o);
    }
    // 战术层：劣势 / 远程 / 打完一套 → 拉开、横移游走、佯攻，制造拉锯
    const behind = myHp < 0.42 || myHp < opHp - 0.18;
    const oThreat = o.act && !o.act.type.startsWith('block') || o.energy >= 100 || this.voteMode && this.ultClock < 2;
    if (f.tact > 0) f.tact -= ai.think;
    if (f.tact <= 0 && !(melee && f.rh.ph !== 'engage')) { // 近战节奏层在拉开/游走/冲刺阶段时，不叠加旧战术层
      let p = 0;
      if (behind) p += melee ? 0.28 : 0.4;
      if (oThreat && d < 5) p += 0.18;
      if (melee && f.cd.special > 1.5 && d < 3.5) p += 0.12;
      if (melee && f.d.role === 'assassin') p += 0.12;
      if (melee) p += 0.08; // v10.1：近战也更常做假动作 / 绕身
      if (melee && f.d.role === 'tank') p *= 0.5;
      if (opHp < 0.2 && !behind) p *= 0.3; // 对手残血 → 压上收割
      if (R() < p) {
        f.tact = rr(1.6, 3.0);
        const pick = R();
        if (pick < 0.4) { f.move.mode = 'retreat'; f.move.t = rr(0.5, 0.9); }
        else if (pick < 0.8) { f.move.mode = 'juke'; f.move.t = rr(1.4, 2.4); f.move.jt = 0; }
        else { f.move.mode = 'feint'; f.move.t = rr(1.0, 1.5); f.move.ft = 0; }
        f.cd.think = 0; return;
      }
    }
    if (melee && this.rhythm(f, o, d, opHp)) return;
    if (melee) {
      if (d <= f.reach + 0.25) {
        // v10.1：连段打完立刻侧闪 / 后撤换位，再压上（打—闪—打 的节奏）
        if (f.combo >= 2 && this.time > (f.burstT || 0) && R() < 0.42) { if (f.cd.dodge <= 0 && R() < 0.45) return this.doReaction(f, o, 'dodge'); f.move.mode = R() < 0.45 ? 'retreat' : 'juke'; f.move.t = rr(0.45, 0.8); f.move.jt = 0; return; }
        if (R() < Math.min(1, aggr * 1.05)) return this.startBasic(f, o);
        if (f.d.role === 'assassin' && R() < 0.5) { f.move.mode = 'retreat'; f.move.t = rr(0.5, 1.0); return; }
        f.move.mode = 'circle'; f.move.t = rr(0.6, 1.4); if (R() < 0.4) f.move.dir *= -1; return;
      }
      if (d > 4.5 && d < 9.5 && f.cd.jump <= 0 && R() < ai.jump) return this.startLeap(f, o);
      if (d > 3.2 && d < 5.5 && f.cd.jump <= 0 && R() < ai.jump * 0.6) return this.startJumpPunch(f, o);
      // 走位选择
      const roll = R();
      if (roll < 0.12 && d > 6) { f.move.mode = 'wander'; this.pickWander(f, o); f.move.t = rr(0.8, 1.6); }
      else if (roll < 0.12 + 0.3 * ai.circle && d < 7) { f.move.mode = 'flank'; f.move.t = rr(0.8, 1.6); if (R() < 0.5) f.move.dir *= -1; }
      else { f.move.mode = (o.move.mode === 'retreat' || d > 7) ? 'chase' : 'approach'; f.move.t = rr(0.6, 1.4); }
    } else {
      if (d < 3.4) {
        if (R() < 0.45) return this.startBash(f, o);
        if (R() < 0.6 && this.hop(f, o, R() < 0.6 ? 'back' : 'backside', 1.0)) return; // 被贴脸 → 大跳拉开
        if (f.cd.dodge <= 0 && R() < 0.5) return this.doReaction(f, o, R() < 0.4 ? 'jumpback' : 'dodge');
        f.move.mode = 'retreat'; f.move.t = rr(0.6, 1.2); return;
      }
      // v10.2 远程：保持风格距离绕大圈，射击间隙左右跳 / 后跳；偶尔换一个远距离保持值，制造推拉
      if (R() < 0.12) f.farD = rr(...f.sty.far);
      if (d < f.farD - 3 && R() < 0.45 && this.hop(f, o, R() < 0.5 ? 'back' : 'backside')) return;
      if (d > f.farD + 2) { f.move.mode = 'chase'; f.move.t = rr(0.5, 0.9); return; } // 超出保持距离：先压回来再打，不在远处站桩输出
      if (R() < Math.min(1, aggr * 1.15) && f.facingErr(o) < 0.6) return this.startShoot(f, o);
      if (R() < f.sty.hop && this.hop(f, o, 'side')) return;
      f.move.mode = 'orbit'; f.move.r = f.farD; f.move.t = rr(0.8, 1.6); if (R() < 0.3) f.move.dir *= -1;
    }
  }

  // v10.2 近战节奏状态机：engage（贴身缠斗）→ break（跳 / 滑步脱离）→ prowl（按体型游走）→ rush（冲刺 / 飞扑压上）→ engage
  // 返回 true 表示本次决策已由节奏层接管
  rhythm(f, o, d, opHp) {
    const S = f.sty, rh = f.rh, now = this.time, R = Math.random, m = f.move;
    if (this.voteOpen || o.frozen) { rh.ph = 'engage'; rh.until = now + 1; return false; }
    switch (rh.ph) {
      case 'engage': {
        if (now < rh.until || d > 5.5) return false;
        if (opHp < 0.18 && R() < 0.75) { rh.until = now + 1.5; return false; } // 对手残血：多半不撤，压上收割
        // 脱离：起跳后撤 / 斜后跳 / 重甲滑步
        rh.ph = 'break'; rh.dist = rr(...S.brk); rh.until = now + 1.1;
        this.hop(f, o, R() < 0.6 ? 'back' : 'backside', 1.0, true);
        m.mode = 'breakaway'; m.r = rh.dist; m.t = 2; if (R() < 0.5) m.dir *= -1;
        // 对手有概率也拉开进入对峙（而不是立刻追上去），形成「分开—对峙—对撞」的大节奏
        if (o.alive && o.d.range === 'melee' && o.rh && o.rh.ph === 'engage' && R() < S.mirror) { o.rh.ph = 'prowl'; o.rh.until = now + rr(0.8, 1.5); o.rh.dist = rh.dist; }
        this.emit('tactic', { f, kind: 'break' });
        return true;
      }
      case 'break': {
        if (d >= rh.dist - 0.6 || now > rh.until) { rh.ph = 'prowl'; rh.until = now + rr(...S.prowl); }
        else { m.mode = 'breakaway'; m.r = rh.dist; m.t = 1; return true; }
      } // fallthrough
      case 'prowl': {
        if (now > rh.until || d > S.brk[1] + 1.5) { rh.ph = 'rush'; rh.until = now + 2.2; this.emit('tactic', { f, kind: 'rush' }); }
        else {
          if (d < 3) { rh.ph = 'engage'; rh.until = now + rr(...S.engage); f.burstT = now + 1.2; return false; } // 被对手贴上来了 → 直接开打
          if (R() < S.hop) { if (this.hop(f, o, S.mode === 'orbit' && R() < 0.35 ? 'backside' : 'side')) return true; }
          m.mode = S.mode; m.r = Math.min(rh.dist || S.brk[0], S.mode === 'press' ? 4 : S.mode === 'weave' ? 4.8 : S.brk[0]); m.t = 1.2;
          if (S.mode !== 'weave' && R() < 0.25) m.dir *= -1;
          return true;
        }
      } // fallthrough
      case 'rush': {
        if (d <= f.reach + 0.4 || now > rh.until) { rh.ph = 'engage'; rh.until = now + rr(...S.engage); f.burstT = now + 1.8; if (d <= f.reach + 0.4) { this.startBasic(f, o); return true; } return false; }
        if (d > 4.2 && d < 9 && f.cd.jump <= 0 && R() < S.leap) { rh.ph = 'engage'; f.burstT = now + 2.4; rh.until = now + rr(...S.engage) + 1.2; return this.startLeap(f, o), true; }
        if (d > 3.2 && d < 5.8 && f.cd.jump <= 0 && R() < S.leap * 0.7) { rh.ph = 'engage'; f.burstT = now + 2.2; rh.until = now + rr(...S.engage) + 0.8; return this.startJumpPunch(f, o), true; }
        m.mode = 'rush'; m.t = 1; return true;
      }
    }
    return false;
  }

  // 走位跳：back 后跳 / side 侧跳 / backside 斜后跳；重甲用地面滑步。贴近围绳时方向自动往场内偏
  hop(f, o, kind, power = 1, force = false) {
    if (!f.grounded || (!force && f.cd.hop > 0) || (f.act && !f.act.cancelable)) return false;
    const S = f.sty, d = f.dist(o) || 1, nx = (o.x - f.x) / d, nz = (o.z - f.z) / d;
    let side = Math.random() < 0.5 ? 1 : -1;
    const toC = Math.hypot(f.x, f.z) || 1, cx = -f.x / toC, cz = -f.z / toC;
    if ((-nz * side) * cx + (nx * side) * cz < 0 && toC > RING * 0.45) side = -side; // 侧跳优先往场内
    const lx = -nz * side, lz = nx * side;
    const [wl, wb] = kind === 'back' ? [0.2, 1] : kind === 'side' ? [1, 0.2] : [0.75, 0.75];
    let dx = lx * wl - nx * wb, dz = lz * wl - nz * wb;
    const edgeK = clamp((toC - (RING - 4)) / 3, 0, 1); dx += cx * edgeK * 1.4; dz += cz * edgeK * 1.4; // 靠绳：往场内拐
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    f.cd.hop = rr(1.1, 2.0) * (S.ground ? 1.3 : 1);
    if (S.ground) {
      f.kx = dx * 14 * power; f.kz = dz * 14 * power;
      this.startAct(f, 'dodge', 0.42, { side, cancelable: false });
      this.emit('dodge', { f, side });
    } else {
      const g = G * (f.fs?.g || 1), vy = S.hopV * (kind === 'side' ? 0.85 : 1) * Math.min(1.15, power);
      const air = Math.min(1.5, 2 * vy / g);
      f.grounded = false; f.vy = vy; f.y = 0.01;
      f.vx = dx * S.hopS * power; f.vz = dz * S.hopS * power; f.kx = dx * 3; f.kz = dz * 3;
      this.startAct(f, 'jumpdodge', air + 0.05, {});
      this.emit('jump', { f, kind: 'dodge' });
    }
    return true;
  }

  pickWander(f, o) {
    const a = Math.random() * Math.PI * 2, r = rr(2, RING - 2.5);
    f.move.tx = Math.cos(a) * r; f.move.tz = Math.sin(a) * r;
  }

  locomotion(f, o, dt) {
    const m = f.move; m.t -= dt;
    const sp = f.st.mspd; const d = f.dist(o) || 0.001;
    const nx = (o.x - f.x) / d, nz = (o.z - f.z) / d; // 指向对手
    const tx = -nz * m.dir, tz = nx * m.dir;          // 切向（横移）
    let vx = 0, vz = 0, accel = 9;
    const pref = f.ai.pref;
    // 靠近围绳时回中
    const edge = Math.max(Math.abs(f.x), Math.abs(f.z)) > RING - 2.2;
    switch (m.mode) {
      case 'approach': { const s = d > pref ? sp : 0; vx = nx * s + tx * sp * 0.25; vz = nz * s + tz * sp * 0.25; break; }
      case 'chase': { const s = d > pref * 0.9 ? sp * 1.45 : sp * 0.3; vx = nx * s; vz = nz * s; accel = 7; break; }
      case 'retreat': { vx = -nx * sp * 0.7 + tx * sp * 0.3; vz = -nz * sp * 0.7 + tz * sp * 0.3; if (edge) { m.mode = 'juke'; m.jt = 0; } break; }
      case 'circle': { const rad = (d - pref) * 0.6; vx = tx * sp * 0.8 + nx * rad; vz = tz * sp * 0.8 + nz * rad; break; }
      case 'flank': { vx = tx * sp * 0.95 + nx * sp * 0.35; vz = tz * sp * 0.95 + nz * sp * 0.35; break; }
      case 'wander': { const wx = m.tx - f.x, wz = m.tz - f.z; const wd = Math.hypot(wx, wz); if (wd < 0.8) m.t = 0; else { vx = wx / wd * sp * 0.7; vz = wz / wd * sp * 0.7; } break; }
      case 'juke': { // 左右横移游走，保持中距离，节奏性换向
        m.jt = (m.jt || 0) - dt; if (m.jt <= 0) { m.dir *= -1; m.jt = rr(0.35, 0.8); }
        const want = Math.max(pref, 4.5); const rad = (d - want) * 0.8;
        vx = tx * sp * 1.05 + nx * rad; vz = tz * sp * 1.05 + nz * rad; break; }
      case 'feint': { // 佯攻：先冲半步，再迅速撤开
        m.ft = (m.ft || 0) + dt; const k = m.ft < 0.45 ? 1.2 : -0.9;
        vx = nx * sp * k + tx * sp * 0.4; vz = nz * sp * k + tz * sp * 0.4; break; }
      // v10.2 节奏走位
      case 'breakaway': { // 脱离：全力后撤到目标距离（贴近围绳时改沿切向滑开）
        const k = d < (m.r || 7) ? 1 : 0; vx = (-nx * sp * 1.3 + tx * sp * 0.45) * k; vz = (-nz * sp * 1.3 + tz * sp * 0.45) * k;
        if (edge) { vx = tx * sp * 1.2; vz = tz * sp * 1.2; } accel = 10; break; }
      case 'orbit': { // 绕大圈：快速切向 + 强半径修正
        const rad = clamp((d - (m.r || 9)) * 1.1, -sp, sp); vx = tx * sp * 1.0 + nx * rad; vz = tz * sp * 1.0 + nz * rad; break; }
      case 'stalk': { // 猛兽踱步：慢速侧移、压低重心，保持距离伺机扑
        const rad = clamp((d - (m.r || 8)) * 0.9, -sp, sp); vx = tx * sp * 0.55 + nx * rad; vz = tz * sp * 0.55 + nz * rad; break; }
      case 'press': { // 重甲压进：缓慢前推 + 左右挪步
        const sw = Math.sin(this.time * 2.2 + f.side * 2) * 0.5; const s = d > f.reach ? sp * 0.6 : 0;
        vx = nx * s + tx * sp * sw; vz = nz * s + tz * sp * sw; break; }
      case 'weave': { // 灵巧穿插：快速左右换向，半径小幅进退
        m.jt = (m.jt || 0) - dt; if (m.jt <= 0) { m.dir *= -1; m.jt = rr(0.28, 0.6); }
        const rad = clamp((d - (m.r || 6)) * 1.0 + Math.sin(this.time * 3.1) * 1.2, -sp, sp);
        vx = tx * sp * 1.15 + nx * rad; vz = tz * sp * 1.15 + nz * rad; break; }
      case 'rush': { // 冲刺压上（灵巧型带 Z 字摆动）
        const zz = f.styleKey === 'agile' ? Math.sin(this.time * 7) * 0.55 : 0; const s = sp * (f.sty.rush || 1.6);
        vx = nx * s + tx * s * zz; vz = nz * s + tz * s * zz; accel = 12; break; }
      case 'hold': default: break;
    }
    if (edge) { const cx = -f.x, cz = -f.z, cl = Math.hypot(cx, cz) || 1; vx += cx / cl * sp * 0.5; vz += cz / cl * sp * 0.5; }
    if (m.t <= 0 && m.mode !== 'approach' && !(f.rh && f.rh.ph !== 'engage' && f.d.range === 'melee')) { m.mode = f.d.range === 'melee' ? 'approach' : 'circle'; m.t = rr(0.5, 1); }
    // 机甲重量感：加速度按定位
    accel = (f.d.role === 'tank' ? 5 : f.d.role === 'assassin' ? 12 : 8) * (m.mode === 'rush' || m.mode === 'breakaway' ? 1.4 : 1);
    return { vx, vz, accel };
  }

  doReaction(f, o, mode) {
    if (mode === 'block') { this.startAct(f, 'block', rr(0.55, 1.0), { cancelable: false }); f.cd.block = 1; return; }
    if (f.cd.dodge > 0 && mode !== 'block') { if (Math.random() < 0.5) this.startAct(f, 'block', rr(0.5, 0.8)); return; }
    const d = f.dist(o) || 1; const nx = (o.x - f.x) / d, nz = (o.z - f.z) / d;
    const side = Math.random() < 0.5 ? 1 : -1;
    const lx = -nz * side, lz = nx * side;
    f.cd.dodge = f.d.role === 'assassin' ? 1.6 : 2.6;
    if (mode === 'jumpdodge' || mode === 'jumpback') {
      const back = mode === 'jumpback' ? 1 : 0.35;
      f.grounded = false; f.vy = 10.5; f.y = 0.01;
      f.kx = (lx * (1 - back) - nx * back) * 9; f.kz = (lz * (1 - back) - nz * back) * 9;
      this.startAct(f, 'jumpdodge', 0.85, {});
      this.emit('jump', { f, kind: 'dodge' });
    } else {
      f.kx = lx * 13 - nx * 2; f.kz = lz * 13 - nz * 2;
      this.startAct(f, 'dodge', 0.38, { side });
      this.emit('dodge', { f, side });
    }
  }

  // ———————————————————— 出招 ————————————————————
  startBasic(f, o) {
    const seq = f.d.role === 'tank' ? ['jab', 'heavy'] : ['jab', 'cross', 'heavy'];
    const name = seq[f.combo % seq.length];
    const b = BASIC[name]; const sp = 0.8 / f.st.aspd * (this.time < (f.burstT || 0) ? 0.72 : 1); // v10.1：普攻提速 20%；v10.2 冲刺对撞后的贴脸爆发窗口再快 28%
    f.combo++; f.comboT = 1.1 * sp + 0.35;
    this.startAct(f, name, b.t * sp, { hit: b.hit * sp, b, threat: 'melee', combo: f.combo, weapon: f.d.main });
  }
  startBash(f, o) { const b = BASIC.bash; this.startAct(f, 'bash', b.t, { hit: b.hit, b, threat: 'melee' }); }
  startShoot(f, o) {
    const s = SHOOT[f.d.main] || SHOOT.blaster; const sp = 0.85 / f.st.aspd;
    this.startAct(f, 'shoot', s.t * sp, { s, sp, threat: 'ranged', weapon: f.d.main });
  }
  startLeap(f, o) {
    f.cd.jump = rr(4, 7);
    this.startAct(f, 'leap', 2.2, { phase: 0, threat: 'melee', slowTurn: false });
  }
  startJumpPunch(f, o) {
    f.cd.jump = rr(3, 5);
    this.startAct(f, 'jumppunch', 1.4, { phase: 0, threat: 'melee' });
  }
  startSpecial(f, o) {
    const sp = f.d.special; f.cd.special = SPECIAL_CD[sp] * rr(0.85, 1.15);
    const dur = { charge: 1.35, chainsaw: 1.9, flame: 2.0, cannon: 1.3, laser: 1.8, missile: 1.3, drill: 1.7, shock: 1.15, elec: 1.25, blink: 1.25, hook: 1.75, disc: 1.5, mortar: 1.5 }[sp];
    const data = { threat: 'special', kind: sp, ticks: 0 };
    if (sp === 'charge') { data.dir = f.angleTo(o); }
    this.startAct(f, 'sp_' + sp, dur, data);
  }
  startUlt(f, o) {
    f.energy = 0; f.ultBoost = 1; this.nextUlt = this.time + rr(8, 11);
    if (o.energy > 70) o.energy = 70; // 避免双方大招扎堆
    const u = f.d.ult;
    const dur = { meteor: 2.6, barrage: 2.8, beam: 3.0, frenzy: 3.0, inferno: 3.2, storm: 3.0, blackhole: 3.4, orbital: 3.1, tornado: 3.2, phantom: 3.0, glacier: 3.3 }[u];
    this.emit('ult', { f, o, ult: u });
    this.startAct(f, 'ult_' + u, dur, { threat: 'ult', kind: u, ticks: 0 });
  }

  runAct(f, o, a, dt) {
    const t = a.t, D = a.data;
    const ang = f.angleTo(o), fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    const once = (key, cond) => { if (cond && !a.fired[key]) { a.fired[key] = true; return true; } return false; };
    const tick = (interval, start = 0, end = 1e9) => {
      if (t < start || t > end) return false;
      const n = Math.floor((t - start) / interval);
      if (n >= (a.ticks || 0)) { a.ticks = n + 1; return true; } return false;
    };
    switch (a.type) {
      case 'jab': case 'cross': case 'heavy': case 'bash': {
        const b = D.b;
        if (once('hit', t >= D.hit)) {
          this.emit('swing', { f, type: a.type });
          this.meleeHit(f, o, b.m, { kb: b.kb, stun: b.stun, heavy: b.heavy, reach: f.reach + 0.35, arc: 1.1, kind: a.type });
        }
        if (t > D.hit + 0.08 && f.combo > 0) a.cancelable = t > a.dur * 0.8;
        const lunge = t < D.hit ? (a.type === 'heavy' ? 6.2 : 4.2) : 0; // v10.1：出拳带明显前冲
        return { vx: fx * lunge, vz: fz * lunge, accel: 12 };
      }
      case 'shoot': {
        const s = D.s;
        s.shots.forEach((st, i) => {
          if (once('s' + i, t >= st * D.sp)) {
            this.spawnProj(f, o, { kind: s.kind, m: s.m, speed: s.speed, r: s.r, splash: s.splash, slot: i % 2, spread: s.kind === 'bullet' ? 0.05 : 0.02 });
          }
        });
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'block': return { vx: 0, vz: 0, accel: 12 };
      case 'dodge': case 'jumpdodge': case 'hitstun': return { vx: 0, vz: 0, accel: 4 };
      case 'leap': {
        if (D.phase === 0 && t > 0.28) {
          D.phase = 1; const d = f.dist(o); f.grounded = false; f.y = 0.01; f.vy = 12.5;
          const air = 2 * f.vy / G; const sp = Math.min(14, Math.max(0, d - f.reach * 0.7) / air);
          f.kx = Math.sin(ang) * sp; f.kz = Math.cos(ang) * sp; D.k = [f.kx, f.kz];
          this.emit('jump', { f, kind: 'leap' });
        }
        if (D.phase === 1 && D.k) { f.kx = D.k[0]; f.kz = D.k[1]; }
        if (D.phase === 2 && t > D.landT + 0.45) a.dur = t;
        return { vx: 0, vz: 0, accel: 3 };
      }
      case 'jumppunch': {
        if (D.phase === 0 && t > 0.18) {
          D.phase = 1; const d = f.dist(o); f.grounded = false; f.y = 0.01; f.vy = 9;
          const air = 2 * f.vy / G; const sp = Math.min(12, Math.max(0, d - f.reach * 0.6) / air);
          D.k = [Math.sin(ang) * sp, Math.cos(ang) * sp]; this.emit('jump', { f, kind: 'hop' });
        }
        if (D.phase === 1 && D.k) { f.kx = D.k[0]; f.kz = D.k[1]; if (once('hit', f.vy < 1.5)) { this.emit('swing', { f, type: 'jumppunch' }); this.meleeHit(f, o, 1.3, { kb: 5, stun: 0.35, heavy: true, reach: f.reach + 0.8, arc: 1.2, kind: 'jumppunch', air: true }); } }
        if (D.phase === 2 && t > D.landT + 0.3) a.dur = t;
        return { vx: 0, vz: 0, accel: 3 };
      }
      // —— 特色小招
      case 'sp_charge': {
        if (t < 0.35) { f.lockYaw = null; D.dir = ang; return { vx: 0, vz: 0 }; }
        f.lockYaw = D.dir;
        if (once('go', true)) this.emit('fx', { f, kind: 'chargeStart' });
        if (t < 1.05) {
          const sx = Math.sin(D.dir) * 17, sz = Math.cos(D.dir) * 17;
          if (!a.fired.hit && f.dist(o) < f.radius + o.radius + 0.6) { a.fired.hit = true; this.meleeHit(f, o, 2.3, { kb: 15, stun: 0.7, heavy: true, reach: 99, arc: 3, kind: 'charge', noBlockFull: true }); }
          return { vx: sx, vz: sz, accel: 16 };
        }
        f.lockYaw = null; return { vx: 0, vz: 0, accel: 5 };
      }
      case 'sp_chainsaw': case 'sp_drill': {
        const isDrill = a.type === 'sp_drill';
        const start = isDrill ? 0.45 : 0.3;
        if (isDrill && t < start) return { vx: fx * 10, vz: fz * 10, accel: 14 };
        if (once('on', t >= start)) this.emit('fx', { f, kind: isDrill ? 'drillOn' : 'sawOn' });
        if (tick(0.12, start, a.dur - 0.25) && f.dist(o) < f.reach + 0.7 && f.facingErr(o) < 0.9) {
          this.meleeHit(f, o, isDrill ? 0.34 : 0.3, { kb: 0.6, stun: 0.16, reach: f.reach + 0.7, arc: 1.2, kind: isDrill ? 'drill' : 'saw', multi: true });
        }
        if (once('off', t >= a.dur - 0.25)) this.emit('fx', { f, kind: 'sawOff' });
        const close = f.dist(o) > f.reach * 0.8 ? 3.2 : 0;
        return { vx: Math.sin(ang) * close, vz: Math.cos(ang) * close, accel: 8 };
      }
      case 'sp_flame': {
        if (once('on', t >= 0.3)) this.emit('flame', { f, on: true, big: false });
        if (tick(0.1, 0.3, 1.8)) this.coneHit(f, o, 6.4, 0.55, 0.24, 'flame');
        if (once('off', t >= 1.8)) this.emit('flame', { f, on: false });
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'sp_cannon': {
        if (once('shot', t >= 0.6)) { this.spawnProj(f, o, { kind: 'bigshell', m: 3.0, speed: 32, r: 0.6, splash: 2.8, slot: 2 }); f.kx -= fx * 5; f.kz -= fz * 5; }
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'sp_laser': {
        if (once('charge', true)) this.emit('beam', { f, on: true, phase: 'charge', big: false });
        if (once('fire', t >= 0.55)) this.emit('beam', { f, on: true, phase: 'fire', big: false });
        if (tick(0.1, 0.55, 1.55)) this.rayHit(f, o, 18, 0.9, 0.36, 'laser');
        if (once('off', t >= 1.55)) this.emit('beam', { f, on: false });
        D.slowTurn = t > 0.55;
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'sp_missile': {
        for (let i = 0; i < 6; i++) if (once('m' + i, t >= 0.25 + i * 0.11)) this.spawnProj(f, o, { kind: 'missile', m: 0.62, speed: 15, r: 0.5, splash: 1.6, slot: 3 + (i % 2), homing: 2.6 });
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'sp_shock': {
        if (once('stomp', t >= 0.5)) { this.emit('stomp', { f, x: f.x, z: f.z, r: 5 }); this.aoeHit(f, o, f.x, f.z, 5, 2.4, { kb: 8, stun: 0.5, kind: 'shock', ground: true }); }
        return { vx: 0, vz: 0, accel: 12 };
      }
      case 'sp_elec': {
        [0.35, 0.6, 0.85].forEach((tt, i) => { if (once('e' + i, t >= tt)) { const d = f.dist(o); this.emit('arc', { f, o, hit: d < 9.5 }); if (d < 9.5) this.directHit(f, o, 1.0, { kb: 2, stun: 0.3, kind: 'elec' }); } });
        return { vx: 0, vz: 0, accel: 10 };
      }
      // —— 大招
      case 'ult_meteor': {
        if (D.phase == null) D.phase = 0;
        if (D.phase === 0 && t > 0.55) {
          D.phase = 1; f.grounded = false; f.y = 0.01; f.vy = 15.5;
          const air = 2 * f.vy / G; const d = f.dist(o); const sp = Math.min(16, Math.max(0, d - 1.5) / air);
          D.k = [Math.sin(ang) * sp, Math.cos(ang) * sp]; this.emit('jump', { f, kind: 'meteor' });
        }
        if (D.phase === 1 && D.k) { f.kx = D.k[0]; f.kz = D.k[1]; if (f.vy < 0) f.vy -= G * dt * 1.2; }
        if (D.phase === 2 && t > D.landT + 0.7) a.dur = t;
        return { vx: 0, vz: 0, accel: 3 };
      }
      case 'ult_barrage': {
        for (let i = 0; i < 22; i++) if (once('m' + i, t >= 0.5 + i * 0.09)) this.spawnProj(f, o, { kind: 'missile', m: 0.4, speed: 14 + Math.random() * 4, r: 0.5, splash: 1.8, slot: 3 + (i % 2), homing: 2.2, ult: true });
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'ult_beam': {
        if (once('charge', true)) this.emit('beam', { f, on: true, phase: 'charge', big: true });
        if (once('fire', t >= 1.0)) this.emit('beam', { f, on: true, phase: 'fire', big: true });
        if (tick(0.1, 1.0, 2.5)) this.rayHit(f, o, 22, 1.6, 0.5, 'beam', true);
        if (once('off', t >= 2.5)) this.emit('beam', { f, on: false });
        D.slowTurn = t > 1.0;
        if (t > 1.0) { f.kx -= fx * 2 * dt; f.kz -= fz * 2 * dt; }
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'ult_frenzy': {
        const d = f.dist(o);
        if (t < 0.4) return { vx: 0, vz: 0 };
        if (tick(0.24, 0.5, 2.5)) {
          this.emit('swing', { f, type: 'frenzy', i: a.ticks });
          if (d < f.reach + 1.0) this.meleeHit(f, o, 0.9, { kb: a.ticks >= 8 ? 12 : 1.2, stun: 0.3, heavy: a.ticks >= 8, reach: f.reach + 1.0, arc: 2, kind: 'frenzy', ult: true });
        }
        const s = d > f.reach * 0.85 ? 18 : 0;
        return { vx: Math.sin(ang) * s, vz: Math.cos(ang) * s, accel: 18 };
      }
      case 'ult_inferno': {
        if (once('on', t >= 0.5)) this.emit('flame', { f, on: true, big: true });
        if (tick(0.12, 0.5, 2.9)) this.aoeHit(f, o, f.x, f.z, 5.8, 0.3, { kb: 0.8, stun: 0.12, kind: 'flame', ult: true, multi: true });
        if (once('off', t >= 2.9)) this.emit('flame', { f, on: false });
        const s = f.dist(o) > 3 ? f.st.mspd * 0.6 : 0;
        return { vx: Math.sin(ang) * s, vz: Math.cos(ang) * s, accel: 6 };
      }
      case 'ult_storm': {
        for (let i = 0; i < 7; i++) {
          const tt = 0.6 + i * 0.3;
          if (once('w' + i, t >= tt)) { const p = { x: o.x + o.vx * 0.3 + rr(-0.8, 0.8), z: o.z + o.vz * 0.3 + rr(-0.8, 0.8) }; D['p' + i] = p; this.emit('strike', { f, x: p.x, z: p.z, phase: 'warn' }); }
          if (once('s' + i, t >= tt + 0.28)) { const p = D['p' + i]; this.emit('strike', { f, x: p.x, z: p.z, phase: 'hit' }); this.aoeHit(f, o, p.x, p.z, 2.3, 1.05, { kb: 3, stun: 0.3, kind: 'elec', ult: true }); }
        }
        return { vx: 0, vz: 0, accel: 10 };
      }
      // —— v10 新增小招
      case 'sp_blink': { // 瞬影突袭：原地消散 → 闪到对手身后 → 回身斩 + 补刀
        if (t < 0.3) { D.slowTurn = false; return { vx: 0, vz: 0, accel: 12 }; }
        if (once('tp', true)) {
          const from = { x: f.x, y: f.y, z: f.z }; const d = f.dist(o) || 1;
          const ux = (o.x - f.x) / d, uz = (o.z - f.z) / d, back = o.radius + f.radius * 0.6 + 0.4;
          const lim = RING - f.radius; f.x = clamp(o.x + ux * back, -lim, lim); f.z = clamp(o.z + uz * back, -lim, lim);
          f.vx = f.vz = f.kx = f.kz = 0; f.yaw = f.angleTo(o); f.lockYaw = null;
          this.emit('blink', { f, from, to: { x: f.x, y: f.y, z: f.z } });
        }
        if (once('h1', t >= 0.42)) { this.emit('swing', { f, type: 'blink', i: 0 }); this.meleeHit(f, o, 1.85, { kb: 7, stun: 0.5, heavy: true, reach: f.reach + 1.2, arc: 2.2, kind: 'blink' }); }
        if (once('h2', t >= 0.7)) { this.emit('swing', { f, type: 'blink', i: 1 }); this.meleeHit(f, o, 0.95, { kb: 3, stun: 0.3, reach: f.reach + 1.4, arc: 2.2, kind: 'blink' }); }
        return { vx: 0, vz: 0, accel: 12 };
      }
      case 'sp_hook': { // 钩锁擒拿：射出钩爪 → 命中后把对手拽到面前 → 上勾重击
        if (t < 0.3) return { vx: 0, vz: 0, accel: 12 };
        const mz = this.muzzle ? this.muzzle(f, 0) : null;
        const ox = mz ? mz.x : f.x + fx * 1.2, oy = mz ? mz.y : f.y + f.height * 0.6, oz = mz ? mz.z : f.z + fz * 1.2;
        if (once('fire', true)) { D.hook = { x: ox, y: oy, z: oz, st: 'out', dir: f.yaw, len: 0 }; this.emit('hook', { f, o, phase: 'fire' }); D.slowTurn = true; }
        const H = D.hook;
        if (H.st === 'out') {
          H.len += 34 * dt;
          const tx = o.x, ty = o.y + o.height * 0.55, tz = o.z;
          const dx = tx - ox, dy = ty - oy, dz = tz - oz, dl = Math.hypot(dx, dy, dz) || 1;
          const aim = f.facingErr(o) < 0.6; // 偏差太大就直线飞出去落空
          const ux = aim ? dx / dl : Math.sin(H.dir), uy = aim ? dy / dl : 0, uz = aim ? dz / dl : Math.cos(H.dir);
          H.x = ox + ux * H.len; H.y = oy + uy * H.len; H.z = oz + uz * H.len;
          if (aim && H.len >= dl - o.radius * 0.6) {
            if (o.act && o.act.type === 'dodge' && o.act.t < 0.3) { H.st = 'back'; this.emit('miss', { f, o }); this.emit('hook', { f, o, phase: 'miss' }); }
            else { H.st = 'pull'; H.pt = t; this.emit('hook', { f, o, phase: 'catch' }); this.directHit(f, o, 0.55, { kb: 0.1, stun: 0.9, kind: 'hook' }); }
          } else if (H.len > 15) { H.st = 'back'; this.emit('hook', { f, o, phase: 'miss' }); }
        } else if (H.st === 'pull') {
          const want = f.radius + o.radius + 0.5, d = f.dist(o);
          if (d > want && o.alive) { const ux = (f.x - o.x) / d, uz = (f.z - o.z) / d, sp = Math.min(26, (d - want) / dt * 0.5); o.kx = ux * sp; o.kz = uz * sp; o.vx *= 0.5; o.vz *= 0.5; }
          H.x = o.x; H.y = o.y + o.height * 0.55; H.z = o.z;
          if (t - H.pt > 0.42 || d <= want + 0.05) { H.st = 'smash'; o.kx *= 0.1; o.kz *= 0.1; }
        } else if (H.st === 'smash') {
          H.x = o.x; H.y = o.y + o.height * 0.55; H.z = o.z;
          if (once('smash', true)) { this.emit('swing', { f, type: 'hook' }); this.meleeHit(f, o, 1.95, { kb: 11, stun: 0.6, heavy: true, reach: f.reach + 1.5, arc: 2.5, kind: 'hook' }); this.emit('hook', { f, o, phase: 'off' }); H.st = 'done'; a.dur = Math.min(a.dur, t + 0.45); }
        } else if (H.st === 'back') {
          H.len = Math.max(0, H.len - 40 * dt);
          const ux = Math.sin(H.dir), uz = Math.cos(H.dir); H.x = ox + ux * H.len; H.y = oy; H.z = oz + uz * H.len;
          if (H.len <= 0) { H.st = 'done'; this.emit('hook', { f, o, phase: 'off' }); a.dur = Math.min(a.dur, t + 0.2); }
        }
        if (once('end', t >= a.dur - 0.02) && H.st !== 'done') this.emit('hook', { f, o, phase: 'off' });
        return { vx: 0, vz: 0, accel: 12 };
      }
      case 'sp_disc': { // 回旋飞刃：左右两枚光刃弧线飞出、穿透、再飞回手中（来回两段伤害）
        [0.38, 0.52].forEach((tt, i) => { if (once('d' + i, t >= tt)) this.spawnProj(f, o, { kind: 'disc', m: 0.9, speed: 21, r: 0.75, slot: i, curve: i ? -1 : 1 }); });
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'sp_mortar': { // 曲射迫击：三发高抛炮弹，地面红圈预警，落点追着对手走位
        [0.35, 0.58, 0.81].forEach((tt, i) => {
          if (once('m' + i, t >= tt)) {
            const lead = 0.9 + i * 0.15;
            const tx = clamp(o.x + o.vx * lead + rr(-1.3, 1.3), -RING + 0.6, RING - 0.6), tz = clamp(o.z + o.vz * lead + rr(-1.3, 1.3), -RING + 0.6, RING - 0.6);
            this.spawnProj(f, o, { kind: 'mortar', m: 1.6, speed: 0, r: 0.45, splash: 2.7, slot: 2, tx, tz, flight: 1.05 });
            this.emit('mortarWarn', { f, x: tx, z: tz, life: 1.05 });
            f.kx -= fx * 1.5; f.kz -= fz * 1.5;
          }
        });
        return { vx: 0, vz: 0, accel: 10 };
      }
      // —— v10 新增大招
      case 'ult_blackhole': { // 奇点黑洞：在对手身边撕开引力奇点 → 吸扯 + 持续绞杀 → 坍缩爆炸
        if (once('open', t >= 0.5)) {
          const d = f.dist(o) || 1; const ux = (o.x - f.x) / d, uz = (o.z - f.z) / d;
          const lim = RING - 1.5; D.bh = { x: clamp(o.x + ux * 0.8, -lim, lim), y: 2.3, z: clamp(o.z + uz * 0.8, -lim, lim), st: 'open', t0: t };
          this.emit('blackhole', { f, phase: 'open', ...D.bh });
        }
        if (D.bh && D.bh.st === 'open') {
          const B = D.bh, dx = B.x - o.x, dz = B.z - o.z, d = Math.hypot(dx, dz) || 1;
          if (o.alive && d > 0.4) { const pull = Math.min(14, 30 / (d + 0.6)); o.kx += (dx / d * pull - o.kx) * Math.min(1, dt * 5); o.kz += (dz / d * pull - o.kz) * Math.min(1, dt * 5); }
          if (tick(0.16, 0.7, 2.6) && d < 5.5) { this.aoeHit(f, o, B.x, B.z, 5.5, 0.3, { kb: 0.1, stun: 0.25, kind: 'blackhole', ult: true, multi: true }); }
          if (t >= 2.75) {
            B.st = 'collapse'; this.emit('blackhole', { f, phase: 'collapse', ...B });
            this.aoeHit(f, o, B.x, B.z, 4.4, 3.5, { kb: 14, stun: 0.9, heavy: true, kind: 'blackhole', ult: true });
          }
        }
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'ult_orbital': { // 天基轨道炮：卫星锁定准星追踪 → 天降巨型光柱持续灼烧
        if (once('lock', t >= 0.35)) { D.orb = { tx: o.x, tz: o.z, st: 'lock', t0: t }; this.emit('orbital', { f, phase: 'lock', x: o.x, z: o.z }); }
        const O = D.orb;
        if (O) {
          if (O.st === 'lock') {
            const k = Math.min(1, dt * (t < 1.4 ? 5 : 2.2)); O.tx += (o.x - O.tx) * k; O.tz += (o.z - O.tz) * k;
            if (t >= 1.75) { O.st = 'fire'; O.ft = t; this.emit('orbital', { f, phase: 'fire', x: O.tx, z: O.tz }); this.aoeHit(f, o, O.tx, O.tz, 3.3, 2.3, { kb: 9, stun: 0.6, heavy: true, kind: 'orbital', ult: true }); }
          } else if (O.st === 'fire') {
            const k = Math.min(1, dt * 1.2); O.tx += (o.x - O.tx) * k; O.tz += (o.z - O.tz) * k; // 光柱缓慢追人
            if (tick(0.1, 1.85, 2.75)) this.aoeHit(f, o, O.tx, O.tz, 2.8, 0.5, { kb: 0.4, stun: 0.2, kind: 'orbital', ult: true, multi: true });
            if (t >= 2.8) { O.st = 'off'; this.emit('orbital', { f, phase: 'off', x: O.tx, z: O.tz }); }
          }
        }
        return { vx: 0, vz: 0, accel: 10 };
      }
      case 'ult_tornado': { // 钢铁旋风：原地高速自旋卷起龙卷，追着对手把人卷上半空绞打，最后甩飞
        if (t < 0.4) return { vx: 0, vz: 0, accel: 10 };
        if (once('on', true)) { this.emit('tornado', { f, on: true }); D.spin = f.yaw; D.lockOwn = true; }
        if (t < 2.75) {
          D.spin += dt * (10 + Math.min(14, (t - 0.4) * 16)); f.lockYaw = D.spin; f.yaw = D.spin;
          const d = f.dist(o);
          if (tick(0.14, 0.55, 2.7) && d < 3.6 && o.alive) {
            this.directHit(f, o, 0.33, { kb: 0.2, stun: 0.3, kind: 'tornado', ult: true, multi: true });
            const ux = (o.x - f.x) / (d || 1), uz = (o.z - f.z) / (d || 1);
            o.kx = -uz * 7 - ux * 2.5; o.kz = ux * 7 - uz * 2.5; // 绕着旋风转
            if (o.y < 2.6) { o.grounded = false; o.y = Math.max(o.y, 0.02); o.vy = Math.max(o.vy, 5.2); }
          }
          const s = d > 1.8 ? 7.5 : 1;
          return { vx: Math.sin(ang) * s, vz: Math.cos(ang) * s, accel: 6 };
        }
        if (once('fin', true)) {
          f.lockYaw = null; this.emit('tornado', { f, on: false, fin: true });
          this.aoeHit(f, o, f.x, f.z, 4.2, 2.3, { kb: 15, stun: 0.8, heavy: true, kind: 'tornado', ult: true });
        }
        return { vx: 0, vz: 0, accel: 8 };
      }
      case 'ult_phantom': { // 千影杀阵：残影六向穿刺 → 回到正面一记十字终结斩
        if (t < 0.4) return { vx: 0, vz: 0, accel: 10 };
        if (once('start', true)) { D.base = Math.atan2(f.x - o.x, f.z - o.z); D.cx = o.x; D.cz = o.z; D.lockOwn = true; this.emit('phantom', { f, o, phase: 'start', x: o.x, z: o.z }); }
        const N = 6, P0 = 0.5, GAP = 0.26, PASS = 0.13, R = 4.6, lim = RING - f.radius;
        D.ghost = t < P0 + N * GAP;
        const i = Math.floor((t - P0) / GAP);
        if (i >= 0 && i < N) {
          const u = (t - P0 - i * GAP) / PASS;
          const th = D.base + i * (Math.PI * 2 / N) * 2.5 + (i % 2 ? Math.PI * 0.5 : 0);
          if (o.alive) { D.cx += (o.x - D.cx) * 0.5; D.cz += (o.z - D.cz) * 0.5; }
          const ax = D.cx + Math.sin(th) * R, az = D.cz + Math.cos(th) * R, bx = D.cx - Math.sin(th) * R, bz = D.cz - Math.cos(th) * R;
          const uu = clamp(u, 0, 1), e = uu * uu * (3 - 2 * uu);
          f.x = clamp(ax + (bx - ax) * e, -lim, lim); f.z = clamp(az + (bz - az) * e, -lim, lim); f.vx = f.vz = f.kx = f.kz = 0;
          f.lockYaw = Math.atan2(bx - ax, bz - az); f.yaw = f.lockYaw;
          if (once('p' + i, u >= 0)) this.emit('phantom', { f, phase: 'pass', i, ax, az, bx, bz });
          if (once('h' + i, u >= 0.5)) { this.emit('swing', { f, type: 'phantom', i }); this.directHit(f, o, 0.68, { kb: 0.6, stun: 0.32, kind: 'phantom', ult: true, multi: true }); }
          return { vx: 0, vz: 0, accel: 30 };
        }
        if (t >= P0 + N * GAP) {
          if (once('front', true)) {
            const d = f.dist(o) || 1, ux = (f.x - o.x) / d, uz = (f.z - o.z) / d, want = f.radius + o.radius + 0.6;
            f.x = clamp(o.x + ux * want, -lim, lim); f.z = clamp(o.z + uz * want, -lim, lim); f.lockYaw = null; f.yaw = f.angleTo(o);
            this.emit('phantom', { f, phase: 'gather' });
          }
          if (once('fin', t >= P0 + N * GAP + 0.3)) { this.emit('swing', { f, type: 'phantom', i: 9 }); this.emit('phantom', { f, phase: 'final' }); this.directHit(f, o, 2.6, { kb: 13, stun: 0.9, heavy: true, kind: 'phantom', ult: true }); }
        }
        return { vx: 0, vz: 0, accel: 12 };
      }
      case 'ult_glacier': { // 极寒冰封：双拳砸地 → 冰刺浪潮一路冲向对手 → 冰封定身 → 粉碎
        if (once('chg', true)) this.emit('glacier', { f, phase: 'charge', x: f.x, z: f.z });
        if (once('slam', t >= 0.5)) { const d = f.dist(o) || 1; D.ice = { x0: f.x, z0: f.z, ux: (o.x - f.x) / d, uz: (o.z - f.z) / d, s: 1.4, n: 0, st: 'wave' }; this.emit('glacier', { f, phase: 'slam', x: f.x, z: f.z }); this.emit('stomp', { f, x: f.x, z: f.z, r: 3.2, small: true }); }
        const I = D.ice;
        if (I && I.st === 'wave') {
          // 浪头缓慢转向对手当前位置（可被横移躲开一部分，但很难）
          const hx = I.x0 + I.ux * I.s, hz = I.z0 + I.uz * I.s;
          const tx = o.x - hx, tz = o.z - hz, tl = Math.hypot(tx, tz) || 1;
          const k = Math.min(1, dt * 1.6); I.ux += (tx / tl - I.ux) * k; I.uz += (tz / tl - I.uz) * k; const ul = Math.hypot(I.ux, I.uz) || 1; I.ux /= ul; I.uz /= ul;
          I.x0 = hx - I.ux * I.s; I.z0 = hz - I.uz * I.s;
          I.s += dt * 15;
          const nx = I.x0 + I.ux * I.s, nz = I.z0 + I.uz * I.s;
          while (I.n * 0.75 < I.s - 1.4) { I.n++; const ss = 1.4 + I.n * 0.75; this.emit('glacier', { f, phase: 'spike', x: I.x0 + I.ux * ss + rr(-0.35, 0.35), z: I.z0 + I.uz * ss + rr(-0.35, 0.35), k: Math.min(1.5, 0.7 + I.n * 0.05) }); }
          if (o.alive && Math.hypot(o.x - nx, o.z - nz) < o.radius + 0.9 && o.y < 2.5) {
            I.st = 'frozen'; I.ft = t;
            this.directHit(f, o, 2.0, { kb: 0, stun: 1.6, kind: 'glacier', ult: true });
            if (o.act && o.act.type === 'hitstun') { o.act.dur = Math.max(o.act.dur, 1.25); o.stun = Math.max(o.stun, 1.25); }
            o.kx = o.kz = o.vx = o.vz = 0;
            this.emit('glacier', { f, o, phase: 'freeze', x: o.x, z: o.z });
          } else if (I.s > 22 || Math.abs(nx) > RING || Math.abs(nz) > RING) { I.st = 'miss'; I.ft = t; }
        } else if (I && I.st === 'frozen') {
          o.kx = o.kz = o.vx = o.vz = 0;
          if (t - I.ft > 1.05) { I.st = 'done'; this.emit('glacier', { f, o, phase: 'shatter', x: o.x, z: o.z }); this.directHit(f, o, 4.4, { kb: 11, stun: 0.7, heavy: true, kind: 'glacier', ult: true }); a.dur = Math.min(a.dur, t + 0.5); }
        } else if (I && I.st === 'miss') {
          if (t - I.ft > 0.5) { I.st = 'done'; this.emit('glacier', { f, phase: 'shatter', miss: true }); }
        }
        return { vx: 0, vz: 0, accel: 12 };
      }
      case 'celebrate': case 'dead': case 'intro': return { vx: 0, vz: 0, accel: 8 };
    }
    return null;
  }

  onLand(f, o) {
    const a = f.act; if (!a) return;
    if (a.type === 'leap' && a.data.phase === 1) {
      a.data.phase = 2; a.data.landT = a.t; f.kx = f.kz = 0;
      this.emit('stomp', { f, x: f.x, z: f.z, r: 3.4, small: true });
      this.emit('swing', { f, type: 'leap' });
      this.aoeHit(f, o, f.x + Math.sin(f.yaw) * 1.2, f.z + Math.cos(f.yaw) * 1.2, 3.4, 1.85, { kb: 7, stun: 0.45, heavy: true, kind: 'leap' });
    } else if (a.type === 'jumppunch' && a.data.phase === 1) { a.data.phase = 2; a.data.landT = a.t; f.kx = f.kz = 0; }
    else if (a.type === 'ult_meteor' && a.data.phase === 1) {
      a.data.phase = 2; a.data.landT = a.t; f.kx = f.kz = 0;
      this.emit('stomp', { f, x: f.x, z: f.z, r: 6.5, big: true });
      this.aoeHit(f, o, f.x, f.z, 5.2, 6.2, { kb: 14, stun: 0.9, heavy: true, kind: 'meteor', ult: true });
    } else if (a.type === 'jumpdodge') { a.dur = Math.min(a.dur, a.t + 0.2); f.kx *= 0.3; f.kz *= 0.3; }
  }

  // ———————————————————— 判定 ————————————————————
  meleeHit(f, o, m, opt) {
    if (!o.alive) return false;
    const d = f.dist(o);
    if (d > opt.reach + o.radius * 0.4) return false;
    if (f.facingErr(o) > (opt.arc || 1)) return false;
    if (!opt.air && Math.abs(o.y - f.y) > 2.2) return false;
    if (o.act && o.act.type === 'dodge' && o.act.t < 0.3) { this.emit('miss', { f, o }); return false; }
    this.applyDamage(f, o, m, opt, { x: (f.x + o.x) / 2 + (o.x - f.x) / d * 0.3, y: o.y + o.height * rr(0.45, 0.7), z: (f.z + o.z) / 2 + (o.z - f.z) / d * 0.3 });
    return true;
  }
  directHit(f, o, m, opt) { if (!o.alive) return; this.applyDamage(f, o, m, opt, { x: o.x, y: o.y + o.height * 0.55, z: o.z }); }
  coneHit(f, o, range, halfAng, m, kind) {
    const d = f.dist(o); if (d > range + o.radius) return;
    if (f.facingErr(o) > halfAng + 0.15) return; if (o.y > 2.5) return;
    this.applyDamage(f, o, m, { kb: 0.6, stun: 0.1, kind, multi: true }, { x: o.x - Math.sin(f.yaw) * o.radius * 0.7, y: o.y + o.height * rr(0.3, 0.7), z: o.z - Math.cos(f.yaw) * o.radius * 0.7 });
  }
  rayHit(f, o, range, width, m, kind, ult) {
    const d = f.dist(o); if (d > range) return;
    // 射线与目标圆柱的横向距离
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    const rx = o.x - f.x, rz = o.z - f.z; const along = rx * fx + rz * fz; if (along < 0) return;
    const lat = Math.abs(rx * fz - rz * fx);
    if (lat > o.radius + width * 0.5) return; if (o.y > 3) return;
    this.applyDamage(f, o, m, { kb: ult ? 1.5 : 0.8, stun: 0.12, kind, multi: true, ult }, { x: f.x + fx * (along - o.radius * 0.8), y: f.y + f.height * 0.62, z: f.z + fz * (along - o.radius * 0.8) });
  }
  aoeHit(f, o, x, z, r, m, opt) {
    if (!o.alive) return;
    const d = Math.hypot(o.x - x, o.z - z); if (d > r + o.radius * 0.5) return;
    if (opt.ground && o.y > 0.8) { this.emit('miss', { f, o }); return; }
    if (o.y > 3.5) return;
    const fall = 1 - 0.35 * clamp(d / r, 0, 1);
    this.applyDamage(f, o, m * fall, { ...opt, from: { x, z } }, { x: o.x, y: o.y + o.height * 0.4, z: o.z });
  }

  applyDamage(f, o, m, opt, pos) {
    if (!o.alive) return;
    const blocking = o.act && o.act.type === 'block' && o.facingErr(f) < 1.3;
    let dmg = f.st.atk * m * TUNE.dmg * (ROLE_DMG[f.d.role] || 1) * TUNE.scale * rr(0.88, 1.12) * (100 / (100 + o.st.def * 1.6));
    const crit = !opt.multi && Math.random() < 0.09;
    if (crit) dmg *= 1.6;
    if (opt.ult) dmg *= f.ultBoost || 1;
    if (blocking) dmg *= opt.ult ? 0.55 : opt.noBlockFull ? 0.5 : 0.25;
    dmg = Math.max(1, Math.round(dmg));
    o.hp = Math.max(0, o.hp - dmg); f.dealt += dmg; o.hitFlash = 1;
    if (!this.voteMode) {
      f.energy = Math.min(100, f.energy + dmg / TUNE.scale * ENERGY_DEAL * (opt.ult ? 0.3 : 1));
      o.energy = Math.min(100, o.energy + dmg / TUNE.scale * ENERGY_TAKE);
    }
    // 击退
    const from = opt.from || f; const dx = o.x - from.x, dz = o.z - from.z; const dl = Math.hypot(dx, dz) || 1;
    const kb = (opt.kb || 1) * (blocking ? 0.35 : 1) * (o.d.role === 'tank' ? 0.6 : 1);
    o.kx += dx / dl * kb; o.kz += dz / dl * kb;
    if (opt.heavy && !blocking && o.grounded && kb > 6) { o.vy = 4; o.grounded = false; o.y = 0.01; }
    // 硬直（格挡成功 → 反击机会）
    if (!blocking) {
      const stun = (opt.stun || 0.15) * o.ai.poise;
      const interruptible = !o.act || !o.act.type.startsWith('ult_') || opt.ult;
      if (interruptible && (opt.heavy || !o.act || ['jab', 'cross', 'shoot', 'block', 'hitstun', 'dodge'].includes(o.act?.type) || stun > 0.3)) {
        if (o.act && o.act.type.startsWith('sp_')) this.emit('interrupt', { f: o });
        if (o.act && (o.act.type === 'sp_flame' || o.act.type === 'ult_inferno')) this.emit('flame', { f: o, on: false });
        if (o.act && (o.act.type === 'sp_laser' || o.act.type === 'ult_beam')) this.emit('beam', { f: o, on: false });
        if (o.act && (o.act.type === 'sp_chainsaw' || o.act.type === 'sp_drill')) this.emit('fx', { f: o, kind: 'sawOff' });
        o.lockYaw = null;
        if (o.grounded || !o.act || o.act.type !== 'leap') { o.act = { type: 'hitstun', t: 0, dur: stun, data: { heavy: !!opt.heavy }, fired: {} }; o.stun = stun; }
      }
    } else if (Math.random() < 0.55 && !opt.multi) {
      // 格挡反击
      o.act = null; o.combo = 2; o.cd.think = 0.05; o.counter = true;
      this.emit('parry', { f: o });
    }
    this.emit('hit', { attacker: f, target: o, dmg, crit, blocked: blocking, heavy: !!opt.heavy, kind: opt.kind, ult: !!opt.ult, pos });
    if (o.hp <= 0) this.ko(o, f);
  }

  ko(loser, winner) {
    if (!loser.alive) return;
    loser.alive = false; loser.act = { type: 'dead', t: 0, dur: 99, data: {}, fired: {} }; loser.stun = 0;
    const dx = loser.x - winner.x, dz = loser.z - winner.z, dl = Math.hypot(dx, dz) || 1;
    loser.kx = dx / dl * 7; loser.kz = dz / dl * 7;
    if (winner.act && winner.act.type !== 'ult_beam') { /* 让收招自然完成 */ }
    this.proj.length = 0; this.zones.length = 0;
    this.emit('flame', { f: winner, on: false }); this.emit('beam', { f: winner, on: false }); this.emit('flame', { f: loser, on: false }); this.emit('beam', { f: loser, on: false });
    this.emit('ko', { loser, winner });
  }

  // ———————————————————— 弹道 ————————————————————
  spawnProj(f, o, p) {
    const mz = this.muzzle ? this.muzzle(f, p.slot) : null;
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    const side = (p.slot % 2 ? -1 : 1) * 0.9 * f.scale;
    const x = mz ? mz.x : f.x + fx * 1.2 + fz * side, z = mz ? mz.z : f.z + fz * 1.2 - fx * side;
    const y = mz ? mz.y : f.y + f.height * (p.kind === 'missile' ? 0.85 : 0.6);
    // 预判
    const tx = o.x + o.vx * 0.25, tz = o.z + o.vz * 0.25, ty = o.y + o.height * 0.5;
    let dx = tx - x, dy = ty - y, dz = tz - z; const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const sp = p.spread || 0; dx += rr(-sp, sp); dy += rr(-sp, sp) * 0.5; dz += rr(-sp, sp);
    let vx = dx * p.speed, vy = dy * p.speed, vz = dz * p.speed;
    if (p.kind === 'missile') { vy = p.speed * rr(0.7, 1.0); vx = (fx * 0.3 + rr(-0.6, 0.6)) * p.speed * 0.6; vz = (fz * 0.3 + rr(-0.6, 0.6)) * p.speed * 0.6; }
    if (p.kind === 'mortar') { const T = p.flight || 1, g = 22; vx = (p.tx - x) / T; vz = (p.tz - z) / T; vy = (0.05 - y + 0.5 * g * T * T) / T; }
    if (p.kind === 'disc') { const a0 = Math.atan2(dx, dz) + (p.curve || 1) * 0.55; vx = Math.sin(a0) * p.speed; vz = Math.cos(a0) * p.speed; vy = dy * p.speed * 0.6; }
    const pr = { id: ++PID, owner: f, target: o, kind: p.kind, slot: p.slot || 0, x, y, z, vx, vy, vz, m: p.m, r: p.r, splash: p.splash || 0, homing: p.homing || 0, life: p.kind === 'disc' ? 2.6 : 3.5, age: 0, ult: !!p.ult, dead: false, speed: p.speed, curve: p.curve || 0, tx: p.tx, tz: p.tz };
    this.proj.push(pr);
    this.emit('proj', { p: pr, f });
  }

  updateProjectiles(dt) {
    for (const p of this.proj) {
      if (p.dead) continue;
      p.age += dt; p.life -= dt;
      const o = p.target;
      if (p.kind === 'disc') { // 回旋飞刃：外弧飞出 → 折返回到主人手中；来回各可命中一次（穿透）
        const f = p.owner;
        if (p.age < 0.55) { const w = -p.curve * 2.0 * dt, c = Math.cos(w), sn = Math.sin(w); const nvx = p.vx * c - p.vz * sn, nvz = p.vx * sn + p.vz * c; p.vx = nvx; p.vz = nvz; p.vy *= Math.exp(-dt * 3); }
        else { const tx = f.x - p.x, ty = f.y + f.height * 0.6 - p.y, tz = f.z - p.z, tl = Math.hypot(tx, ty, tz) || 1; const sp = Math.min(30, 16 + (p.age - 0.55) * 30), k = Math.min(1, dt * 7); p.vx += (tx / tl * sp - p.vx) * k; p.vy += (ty / tl * sp - p.vy) * k; p.vz += (tz / tl * sp - p.vz) * k; if (tl < 1.3) { p.dead = true; this.emit('projHit', { p, direct: false, caught: true, x: p.x, y: p.y, z: p.z }); continue; } }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const key = p.age < 0.55 ? 'h0' : 'h1';
        if (o.alive && !p[key]) { const cy = clamp(p.y, o.y + 0.4, o.y + o.height * 0.9); if (Math.hypot(p.x - o.x, p.y - cy, p.z - o.z) < o.radius * 0.9 + p.r) { p[key] = true; if (!(o.act && o.act.type === 'dodge' && o.act.t < 0.3)) { this.emit('discHit', { p, x: p.x, y: p.y, z: p.z }); this.applyDamage(p.owner, o, p.m, { kb: 2.2, stun: 0.3, kind: 'disc', multi: true, from: { x: p.x - p.vx, z: p.z - p.vz } }, { x: p.x, y: p.y, z: p.z }); } } }
        p.x = clamp(p.x, -RING - 3, RING + 3); p.z = clamp(p.z, -RING - 3, RING + 3); p.y = Math.max(0.4, p.y);
        if (p.life <= 0) { p.dead = true; this.emit('projHit', { p, direct: false, caught: true, x: p.x, y: p.y, z: p.z }); }
        continue;
      }
      if (p.kind === 'mortar') { p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y <= 0.05 && p.vy < 0) this.projImpact(p, false); continue; }
      if (p.homing && o.alive) {
        const tx = o.x - p.x, ty = o.y + o.height * 0.5 - p.y, tz = o.z - p.z; const tl = Math.hypot(tx, ty, tz) || 1;
        const sp = Math.hypot(p.vx, p.vy, p.vz); const k = Math.min(1, p.homing * dt * (p.age > 0.25 ? 1.6 : 0.4));
        const ns = Math.min(p.speed * 2.2, sp + 18 * dt);
        p.vx += (tx / tl * ns - p.vx) * k; p.vy += (ty / tl * ns - p.vy) * k; p.vz += (tz / tl * ns - p.vz) * k;
      } else if (p.kind === 'shell' || p.kind === 'bigshell') p.vy -= 3 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      // 命中目标（胶囊）
      if (o.alive) {
        const cy = clamp(p.y, o.y + 0.4, o.y + o.height * 0.9);
        const d = Math.hypot(p.x - o.x, p.y - cy, p.z - o.z);
        if (d < o.radius * 0.85 + p.r) {
          if (o.act && o.act.type === 'dodge' && o.act.t < 0.3) { /* 闪过 */ }
          else { this.projImpact(p, true); continue; }
        }
      }
      if (p.y <= 0.05 || p.life <= 0 || Math.abs(p.x) > RING + 6 || Math.abs(p.z) > RING + 6) this.projImpact(p, false);
    }
    if (this.proj.length > 60 || this.proj.some((p) => p.dead)) this.proj = this.proj.filter((p) => !p.dead);
  }

  projImpact(p, direct) {
    p.dead = true;
    const o = p.target, f = p.owner;
    this.emit('projHit', { p, direct, x: p.x, y: Math.max(0.1, p.y), z: p.z });
    if (!f || !o.alive) return;
    if (direct) {
      this.applyDamage(f, o, p.m, { kb: p.kind === 'bigshell' ? 9 : p.kind === 'mortar' ? 5 : p.kind === 'shell' ? 4 : p.kind === 'missile' ? 2.5 : 0.7, stun: p.kind === 'bullet' ? 0.08 : 0.25, heavy: p.kind === 'bigshell', kind: p.kind, multi: p.kind === 'bullet' || p.kind === 'missile', ult: p.ult, from: { x: p.x - p.vx, z: p.z - p.vz } }, { x: p.x, y: p.y, z: p.z });
    } else if (p.splash > 0) {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < p.splash + o.radius && o.y < 2.5) this.applyDamage(f, o, p.m * (p.kind === 'mortar' ? 1 - 0.4 * clamp(d / p.splash, 0, 1) : 0.5), { kb: 3, stun: 0.15, kind: p.kind, multi: true, ult: p.ult, from: { x: p.x, z: p.z } }, { x: o.x, y: o.y + 1, z: o.z });
    }
  }

  updateZones() { }
}
