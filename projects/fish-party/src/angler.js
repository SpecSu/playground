// 统一钓手状态机：玩家与 3 位好友共用同一套逻辑（好友由 AI 输入驱动）
// idle → charge(蓄力) → cast → float(轻啄试探) → bite → hookset → fight(收线/张力/鱼发力/跃水) → land → hold(可走动炫耀) → release
import * as THREE from 'three';
import { waterHeight } from './waves.js';
import { makeBobber, makeLine } from './characters.js';
import { Fish, rollCatch, holdLength, SPECIES_BY_ID, RARITY, RARITY_ORDER } from './fishes.js';
import { halfBeamAtZ, HULL } from './boat.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const _a = V(), _b = V(), _c = V(), _q = new THREE.Quaternion();
const rand = (a, b) => a + Math.random() * (b - a);
export const PERFECT_CAST = [0.74, 0.9];
export const BITE_WINDOW = 1.35;
const FIGHT_GOAL = { common: 2.9, uncommon: 3.4, rare: 4.1, epic: 8.4, legendary: 10.4 };   // 实测总时长 ≈ 目标 + 1.2s（扬竿 0.22s + 跃水 1s）
export const SNAP_HOLD = 0.72;   // 张力顶满(>0.98)持续多久断线

// 船本地坐标里"朝外"的方向（站在哪边就朝哪边甩竿/放生）
export function outwardLocal(p, out = V()) {
  if (p.z < HULL.zs + 0.35) return out.set(Math.sin(p.x * 0.25) * 0.4, 0, -1).normalize();
  const sx = p.x >= 0 ? 1 : -1;
  return out.set(sx, 0, -0.32).normalize();
}

export class Angler {
  constructor(ctx, { id, name, color, char, isPlayer = false, skill = 0.8, spot = null, lines = [] }) {
    Object.assign(this, { ctx, id, name, color, char, isPlayer, skill, spot, lines });
    this.state = 'idle'; this.t = 0;
    this.bobber = makeBobber(); this.bobber.visible = false; ctx.scene.add(this.bobber);
    this.line = makeLine(); this.line.line.visible = false; ctx.scene.add(this.line.line);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: '#06324a', transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.renderOrder = 2; ctx.scene.add(this.shadow);
    this.reel = false;          // 输入：按住收线
    this.fish = null; this.v = null;
    this.from = V(); this.to = V(); this.hook = V(); this.anchor = V(); this.outW = V(); this.tipW = V();
    this.power = 0; this.perfectCast = false; this.perfect = false;
    this.tension = 0; this.dist = 0; this.startDist = 1; this.surge = 0; this.warnT = 0; this.surgeCd = 0; this.snapT = 0;
    this.jump = null; this.jumped = false; this.swimA = 0;
    this.nibbles = []; this.nibT = -1; this.biteAt = 0;
    this.aiT = rand(1, 5); this.aiReact = 0; this.holdT = 0; this.luck = null;
    this.walkDist = 0;
    this.status = '准备中';
  }
  get busy() { return this.state !== 'idle' && this.state !== 'hold'; }
  get holding() { return this.state === 'hold'; }
  get fishing() { return ['charge', 'cast', 'float', 'bite', 'hookset', 'fight', 'land', 'reelEmpty'].includes(this.state); }
  emit(type, data) { this.ctx.emit(this, type, data); }
  set(s) { this.state = s; this.t = 0; if (this.isPlayer) document.body.dataset.fish = s; }

  // 本地坐标 → 世界朝外方向（水平）
  computeOut() {
    const c = this.char.root;
    outwardLocal(c.position, _a);
    if (this.spot) _a.set(Math.sin(this.spot.ry), 0, Math.cos(this.spot.ry));
    this.ctx.B.getWorldQuaternion(_q);
    this.outW.copy(_a).applyQuaternion(_q); this.outW.y = 0; this.outW.normalize();
    return this.outW;
  }
  wantFacingLocal() { outwardLocal(this.char.root.position, _a); return Math.atan2(_a.x, _a.z); }

  // ======================= 输入（玩家 / AI 共用） =======================
  press() {
    this.pressing = true;
    switch (this.state) {
      case 'idle': this.set('charge'); this.power = 0; this.char.setMode('cast'); this.char.modeT = 0; this.emit('charge'); break;
      case 'float': this.set('reelEmpty'); this.from.copy(this.bobber.position); this.char.setMode('reel'); this.emit('early', { nibbled: this.nibT >= 0 || this.recentNibble > 0 }); break;
      case 'bite': this.hookset(); break;
      case 'fight': this.reel = true; break;
      case 'hold': if (this.t > 0.6) this.release(); break;
    }
  }
  releasePress() {
    this.pressing = false;
    if (this.state === 'charge') this.cast(this.power);
    this.reel = false;
  }

  cast(power) {
    this.power = power;
    this.perfectCast = power >= PERFECT_CAST[0] && power <= PERFECT_CAST[1];
    this.set('cast'); this.char.setMode('cast'); this.char.modeT = 0.3;
    this.emit('cast', { power, perfect: this.perfectCast });
  }

  hookset() {
    this.perfect = this.t < 0.42;
    this.luck = this.ctx.getLuck(this);
    this.v = rollCatch(this.luck);
    const f = this.fish = new Fish(this.v, this.ctx.stylize);
    f.root.visible = false; this.ctx.scene.add(f.root);
    const L = Math.min(this.v.cm / 100, 2.2); f.holdFit(Math.max(0.4, L)); // 跃水时的尺寸
    this.hook.copy(this.bobber.position);
    this.bobber.visible = false;
    this.char.root.getWorldPosition(_a);
    this.dist = Math.hypot(this.hook.x - _a.x, this.hook.z - _a.z) * (this.perfect ? 0.75 : 1);
    this.startDist = this.dist;
    this.pw = RARITY[f.sp.rarity].power * (this.v.traits.includes('giant') ? 1.12 : 1);
    // r2：小鱼搏鱼 1.7~2.5s 就结束、一次发力都没有（按住就赢）→ 第一次发力提前，每条鱼至少一次「松手」时刻
    // r3：修复——上一行注释把 snapT/slipping/jump/jumped 的重置也注释掉了（第 2 条鱼起不再跃水亮相、断线计时会继承上一条）
    this.tension = 0.35; this.surge = 0; this.warnT = 0; this.surgeCd = rand(0.7, 1.2);
    this.snapT = 0; this.slipping = false; this.jump = null; this.jumped = false;
    // r3：搏鱼时长按稀有度定目标（实测 r2 小鱼 1.7~9s、SSR 6~10s，忽长忽短且跟抛竿远近强相关）
    //   收线速度 = 剩余距离 / 剩余目标时间（按 ~60% 时间在收线估算），小/普通鱼约 3.5~6s，SSR/UR 约 8~13s；
    //   拖线（红区硬收）会把目标时间往后推 —— 晚松手的代价是"白收 + 更久 + 离断线更近"
    this.fightT = 0; this.fightGoal = (FIGHT_GOAL[f.sp.rarity] || 5) * rand(0.92, 1.1) * (this.v.traits.includes('giant') ? 1.12 : 1);
    this.swimA = 0; this.reel = false;
    this.set('hookset'); this.char.setMode('hookset');
    this.emit('hookset', { perfect: this.perfect, v: this.v });
  }

  release() {
    const f = this.fish; if (!f) return;
    this.set('release');
    this.ctx.scene.attach(f.root);
    this.char.held = null;
    this.from.copy(f.root.position);
    // 朝外抛回大海：目标在船舷外 1.5m
    const p = this.char.root.position;
    outwardLocal(p, _a);
    const hb = halfBeamAtZ(clamp(p.z, HULL.zs, HULL.zb));
    _b.set(p.x, 0, p.z);
    if (Math.abs(_a.z) > 0.9) _b.z = HULL.zs - 1.9; else _b.x = Math.sign(_a.x) * (hb + 1.7);
    this.ctx.B.localToWorld(_b);
    this.to.copy(_b); this.to.y = waterHeight(_b.x, _b.z, this.ctx.time());
    this.char.setMode('free');
    this.emit('release');
  }

  stopFight(msg) {
    this.line.line.visible = false; this.bobber.visible = false; this.shadow.material.opacity = 0;
    if (this.fish) { this.fish.dispose(); this.fish = null; }
    this.char.rod?.setBend(0.1, null);
    this.reel = false;
  }

  // ======================= 每帧 =======================
  update(dt, t) {
    this.t += dt;
    const c = this.char, rod = c.rod;
    let bend = 0.1, bendTo = null;
    if (!this.isPlayer) this.ai(dt, t);
    if (this.recentNibble > 0) this.recentNibble -= dt;

    switch (this.state) {
      case 'idle': {
        c.setMode(['wave', 'clap', 'cheer', 'sad'].includes(c.mode) && c.modeT < (c.mode === 'sad' ? 1.6 : 2.2) ? c.mode : 'rod');
        this.status = this.isPlayer ? '' : '准备抛竿';
        break;
      }
      case 'charge': {
        // 蓄力：力度在 0~1 之间来回摆，松手时的力度决定抛多远，落在完美区 = 完美抛竿
        const ph = this.t * 1.15;
        this.power = 1 - Math.abs((ph % 2) - 1);
        c.mode = 'cast'; c.modeT = lerp(0.05, 0.36, Math.min(1, this.t * 3));
        break;
      }
      case 'cast': {
        const REL = 0.47;
        if (c.modeT >= REL && !this.bobber.visible) {
          this.bobber.visible = true; this.line.line.visible = true;
          rod.tip.getWorldPosition(this.from);
          this.computeOut();
          c.root.getWorldPosition(_a);
          const d = 6.5 + this.power * 9 + (this.perfectCast ? 1.5 : 0);
          const side = (Math.random() - 0.5) * 0.35;
          _b.copy(this.outW).applyAxisAngle(_c.set(0, 1, 0), side);
          this.to.copy(_a).addScaledVector(_b, d);
          this.flight = 0; this.flightDur = 0.75 + this.power * 0.45;
          this.emit('whoosh');
        }
        if (this.bobber.visible) {
          this.flight += dt / this.flightDur;
          const k = Math.min(this.flight, 1);
          this.bobber.position.lerpVectors(this.from, this.to, k);
          this.bobber.position.y = lerp(this.from.y, waterHeight(this.to.x, this.to.z, t), k) + Math.sin(k * Math.PI) * (2 + this.power * 1.6);
          if (k >= 1) {
            this.set('float'); c.setMode('wait');
            const fr = this.ctx.frenzy();
            this.biteAt = fr ? rand(1.4, 3.2) : rand(3.2, 7.5) * (this.perfectCast ? 0.8 : 1);
            const n = 1 + Math.floor(Math.random() * 3);
            this.nibbles = Array.from({ length: n }, (_, i) => this.biteAt * (0.3 + 0.6 * (i + Math.random() * 0.6) / n)).sort((a, b) => a - b);
            this.nibT = -1;
            this.emit('plop', { at: this.bobber.position });
          }
        }
        break;
      }
      case 'float': case 'bite': {
        const wy = waterHeight(this.bobber.position.x, this.bobber.position.z, t);
        let dip = 0;
        this.status = '等待咬钩…';
        if (this.state === 'float') {
          if (this.nibbles.length && this.t > this.nibbles[0]) { this.nibbles.shift(); this.nibT = 0; c.setMode('twitch'); this.recentNibble = 0.5; this.emit('nibble'); }
          if (this.nibT >= 0) {
            this.nibT += dt;
            const k = this.nibT / 0.35;
            dip = Math.sin(Math.min(k, 1) * Math.PI) * 0.07;
            bend = 0.12 + Math.sin(Math.min(k, 1) * Math.PI) * 0.25; bendTo = this.bobber.position;
            if (k >= 1) { this.nibT = -1; c.setMode('wait'); }
          }
          if (this.t > this.biteAt) { this.set('bite'); this.emit('bite', { at: this.bobber.position }); }
        } else {
          this.status = '咬钩了！';
          const k = Math.min(this.t / 0.15, 1);
          dip = 0.32 * k + Math.abs(Math.sin(t * 14)) * 0.08;
          bend = 0.55 + Math.abs(Math.sin(t * 9)) * 0.5; bendTo = this.bobber.position;
          if (c.mode !== 'twitch' || c.modeT > 0.25) { c.mode = 'twitch'; c.modeT = 0; }
          if (this.t > BITE_WINDOW) {
            this.set('float'); c.setMode('wait');
            this.biteAt = rand(3, 6); this.nibbles = [this.biteAt * 0.6];
            this.emit('missed');
          }
        }
        this.bobber.position.y = lerp(this.bobber.position.y, wy - dip, 0.35);
        this.bobber.rotation.z = Math.sin(t * 2.1 + this.id.length) * 0.15; this.bobber.rotation.x = Math.sin(t * 1.7) * 0.15;
        break;
      }
      case 'reelEmpty': {
        const k = Math.min(this.t / 0.6, 1);
        rod.tip.getWorldPosition(this.tipW);
        this.bobber.position.lerpVectors(this.from, this.tipW, k * k);
        if (k >= 1) { this.bobber.visible = false; this.line.line.visible = false; this.set('idle'); }
        break;
      }
      case 'hookset': {
        bend = 0.9; bendTo = this.hook;
        if (this.t > 0.22) { this.set('fight'); c.setMode('fight'); if (this.isPlayer && this.pressing) this.reel = true; this.emit('fight'); }
        break;
      }
      case 'fight': {
        this.status = '搏鱼中！';
        const r = this.fightUpdate(dt, t);
        if (r) break;
        bend = 0.35 + this.tension * 1.25 + (this.surge > 0 ? 0.25 : 0); bendTo = this.hook;
        break;
      }
      case 'land': {
        const f = this.fish;
        const k = Math.min(this.t / 0.8, 1);
        // 目标：双手中点（按世界坐标实时追踪），弧线顶点高于栏杆，鱼从栏杆上方飞进怀里
        _a.copy(c.handW.L).add(c.handW.R).multiplyScalar(0.5); _a.y += 0.15;
        const e = 1 - Math.pow(1 - k, 2);
        f.root.position.lerpVectors(this.from, _a, e);
        f.root.position.y += Math.sin(k * Math.PI) * 1.6;
        f.root.rotation.z = Math.sin(k * Math.PI * 2) * 0.6;
        f.update(dt, 'air');
        bend = 0.6 * (1 - k); bendTo = f.root.position;
        if (k >= 1) this.attachHold();
        break;
      }
      case 'hold': {
        const f = this.fish;
        this.holdT += dt;
        this.status = '钓到啦 🎉';
        f.update(dt, 'held');
        if (c.held) c.held.burst = f.burst;
        break;
      }
      case 'release': {
        const f = this.fish;
        const k = Math.min(this.t / 0.85, 1);
        f.root.position.lerpVectors(this.from, this.to, k);
        f.root.position.y = lerp(this.from.y, this.to.y, k) + Math.sin(k * Math.PI) * 1.4;
        f.root.rotation.z += dt * 6;
        f.update(dt, 'air');
        if (k >= 1) {
          this.emit('splashdown', { at: this.to.clone(), big: Math.min(1.6, 0.5 + f.span) });
          f.dispose(); this.fish = null; this.v = null;
          this.set('idle'); c.setMode('rod');
        }
        break;
      }
      case 'fail': {
        if (this.t > 1.6) this.set('idle');
        break;
      }
    }

    c.reelSpeed = this.state === 'fight' && this.reel ? 1 : 0;
    c.tension = this.tension;
    c.update(dt, t);
    if (rod && rod.group.visible) {
      rod.group.updateMatrixWorld(true);
      rod.setBend(bend, bendTo);
      rod.tip.getWorldPosition(this.tipW);
      if (this.line.line.visible) {
        const to = this.state === 'fight' || this.state === 'hookset' ? this.hook : this.bobber.position;
        this.line.set(this.tipW, to, this.state === 'fight' ? Math.max(0.02, 0.3 - this.tension * 0.3) : this.state === 'cast' ? 0.05 : 0.35);
      }
      if (this.state === 'fight' && this.reel) rod.crank.rotation.x -= dt * 22;
    } else if (this.line.line.visible && !this.fishing) this.line.line.visible = false;
  }

  fightUpdate(dt, t) {
    const c = this.char, f = this.fish, pw = this.pw;
    this.surgeCd -= dt;
    if (this.surge <= 0 && this.warnT <= 0 && this.surgeCd <= 0 && !this.jump) {
      this.warnT = 0.65; this.emit('warn');
    }
    if (this.warnT > 0) {
      this.warnT -= dt;
      if (this.warnT <= 0) { this.surge = rand(0.9, 0.9 + 0.9 * pw); this.surgeCd = rand(2.4, 4.6); this.emit('surge', { pw }); }
    }
    if (this.surge > 0) { this.surge -= dt; if (this.surge <= 0) this.emit('surgeEnd'); }
    const surging = this.surge > 0;
    // r1：旧参数下"死按不放"几乎不可能断线（常见鱼发力 0.9~1.5s 内张力只能顶到红区边缘、断线计时要 1s）
    // → 发力时硬收的拉力更大、上升更快、红区停留 0.5s 就断：真正需要"变红松手"
    const target = (this.reel ? 0.55 : 0.12) + (surging ? (this.reel ? 0.82 : 0.22) * pw : 0) + (this.warnT > 0 ? 0.06 : 0) + Math.sin(t * 7) * 0.03;
    const up = target > this.tension;
    this.tension += (target - this.tension) * (1 - Math.exp(-dt * (up ? (surging ? 2.6 : 2.4) : 4.5)));
    if (this.jump) this.tension *= 1 - dt * 2;
    // r2：以前"晚松手一点"毫无代价（发力时硬收仍在缓慢收线）→ 红区硬顶时鱼会把线拖走（出线），晚反应=白收、再晚=断线
    const slip = this.reel && this.tension > 0.9;
    if (slip && !this.slipping) this.emit('slip');
    this.slipping = slip;
    this.fightT += dt;
    if (slip) { this.dist += (0.5 + 0.7 * pw) * dt; this.fightGoal += dt; }
    else if (this.reel) this.dist -= (surging ? 0.35 : clamp((this.dist - 1) / (Math.max(1, this.fightGoal - this.fightT) * (pw >= 1.15 ? 0.55 : 0.6)), 1, 5.5)) * dt;
    else this.dist += (surging ? 1.7 * pw : 0.3) * dt;
    if (this.tension > 0.98) { this.snapT += dt; } else this.snapT = Math.max(0, this.snapT - dt * 2);
    if (this.snapT > SNAP_HOLD) { this.stopFight(); this.set('fail'); c.setMode('sad'); this.emit('snap'); return true; }
    if (this.dist > this.startDist + 8) { this.stopFight(); this.set('fail'); c.setMode('sad'); this.emit('escape'); return true; }

    // 鱼在水下蛇行；发力时横冲
    this.swimA += dt * (surging ? 2.2 : 0.9);
    const amp = surging ? 0.6 : 0.35;
    this.computeOut();
    c.root.getWorldPosition(this.anchor); this.anchor.addScaledVector(this.outW, 0.9);
    _b.copy(this.outW).applyAxisAngle(_c.set(0, 1, 0), Math.sin(this.swimA) * amp);
    this.hook.copy(this.anchor).addScaledVector(_b, Math.max(this.dist, 0.4));
    this.hook.y = waterHeight(this.hook.x, this.hook.z, t) - 0.05;
    // 鱼影
    const sh = this.shadow;
    sh.position.set(this.hook.x, this.hook.y + 0.02, this.hook.z);
    sh.material.opacity = this.jump ? 0 : 0.38;
    sh.scale.set(Math.max(0.5, f.span * 0.9), Math.max(0.35, f.span * 0.4), 1);
    sh.rotation.z = -Math.atan2(_b.z, _b.x);
    // 鱼的方向（角色模型空间）给 rig 用于竿梢指向
    _a.copy(this.hook).sub(this.tipW.lengthSq() ? this.tipW : this.anchor).normalize();
    c.root.getWorldQuaternion(_q); _q.invert();
    c.fishDir.copy(_a).applyQuaternion(_q);
    // 跃出水面：搏鱼中段一次，稀有以上必跳
    const prog = 1 - this.dist / this.startDist;
    if (!this.jumped && !this.jump && prog > 0.35 && (RARITY_ORDER.indexOf(f.sp.rarity) >= 2 || Math.random() < 0.35) && !surging) {
      this.jumped = true;
      this.jump = { t: 0, dur: 1.0, from: this.hook.clone(), h: 1.2 + pw * 0.8 };
      f.root.visible = true;
      this.emit('jump', { at: this.hook.clone() });
    } else if (!this.jumped && prog > 0.5) this.jumped = true;
    if (this.jump) {
      const j = this.jump; j.t += dt;
      const k = Math.min(j.t / j.dur, 1);
      f.root.position.copy(j.from).addScaledVector(_b, k * 1.2);
      f.root.position.y = j.from.y + Math.sin(k * Math.PI) * j.h;
      f.root.rotation.set(0, Math.atan2(-_b.z, _b.x), Math.cos(k * Math.PI) * 0.9);
      f.update(dt, 'air');
      if (k >= 1) { f.root.visible = false; this.jump = null; this.emit('reenter', { at: f.root.position.clone() }); }
    }
    if (this.dist <= 1.0 && !this.jump) {
      // 出水！
      this.set('land'); c.setMode('hookset'); c.modeT = 0.1;
      this.shadow.material.opacity = 0; this.line.line.visible = false;
      this.from.copy(this.hook);
      f.root.rotation.set(0, 0, 0);
      f.holdFit(holdLength(this.v));
      f.root.visible = true;
      this.emit('landing', { at: this.hook.clone(), v: this.v });
      return true;
    }
    return false;
  }

  attachHold() {
    const c = this.char, f = this.fish;
    c.root.attach(f.root);
    f.root.rotation.set(0, f.wide ? -Math.PI / 2 : 0, 0);
    f.root.scale.setScalar(f.root.scale.x);
    c.held = { obj: f.root, len: f.span, h: f.h, w: f.depth, belly: f.belly, burst: 0, pose: f.pose || 'hug' };
    c.setMode('hold');
    this.set('hold'); this.holdT = 0;
    f.burstCd = 0.6;
    f.onFlop = () => this.emit('flop');
    this.emit('caught', { v: this.v, perfect: this.perfect, perfectCast: this.perfectCast, luck: this.luck });
  }

  // ======================= 好友 AI =======================
  ai(dt, t) {
    switch (this.state) {
      case 'idle': {
        this.aiT -= dt;
        if (this.aiT <= 0) {
          this.press();
          this.aiCharge = rand(0.35, 0.95);
        }
        break;
      }
      case 'charge': if (this.t >= this.aiCharge) { const p = clamp(rand(0.45, 1.0) * (0.85 + this.skill * 0.15), 0, 1); this.cast(p); } break;
      case 'bite': {
        if (!this.aiReact) this.aiReact = rand(0.18, 0.5) + (1 - this.skill) * rand(0.2, 1.4);
        if (this.t >= this.aiReact) { this.aiReact = 0; this.hookset(); }
        break;
      }
      case 'float': this.aiReact = 0; break;
      case 'fight': {
        const danger = this.warnT > 0 || this.surge > 0;
        if (danger) {
          if (!this.aiReact) this.aiReact = rand(0.08, 0.3) + (1 - this.skill) * rand(0, 1.1);
          this.aiReact -= dt;
          if (this.aiReact <= 0) this.reel = false;
        } else {
          this.aiReact = 0;
          this.reel = this.tension < 0.8 + this.skill * 0.1;
        }
        break;
      }
      case 'hold': if (this.t > rand(4.5, 4.6) + this.skill * 1.5) { this.release(); } break;
      case 'fail': this.aiT = rand(2, 4); break;
      case 'release': this.aiT = rand(2.5, 6); break;
    }
  }
}
