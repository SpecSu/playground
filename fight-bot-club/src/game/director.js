// 导演相机：自动机位（竖屏优化：沿两机连线斜向取景，减少横向占用）+ 大招特写 + KO 慢镜 + 胜者环绕
// 触屏：单指旋转、双指缩放；停止操作 5 秒后平滑回到导演机位
import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/util.js';

const _t = new THREE.Vector3();

export class Director {
  constructor(camera, dom) {
    this.cam = camera; this.dom = dom;
    this.yaw = 0.6; this.pitch = 0.32; this.dist = 26; this.target = new THREE.Vector3(0, 1.8, 0);
    this.want = { yaw: 0.6, pitch: 0.32, dist: 26, target: new THREE.Vector3(0, 1.8, 0) };
    this.mode = 'intro'; this.focus = null; this.focusT = 0;
    this.shotT = 0; this.shotPhi = 0.62; this.shotPitch = 0.3; this.shotSide = 1;
    this.user = { active: false, last: -1e9, yaw: 0, pitch: 0, dist: 0 };
    this.shakeA = 0; this.time = 0;
    this.bindTouch();
  }
  bindTouch() {
    const el = this.dom; const pts = new Map(); let pinch0 = 0, dist0 = 0;
    const begin = () => {
      if (!this.user.active) { this.user.yaw = this.yaw; this.user.pitch = this.pitch; this.user.dist = this.dist; }
      this.user.active = true; this.user.last = performance.now();
    };
    el.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture?.(e.pointerId); begin(); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = this.user.dist; } });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      this.user.last = performance.now();
      if (pts.size === 1) { this.user.yaw -= dx * 0.008; this.user.pitch = clamp(this.user.pitch + dy * 0.005, 0.04, 1.2); }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) this.user.dist = clamp(dist0 * pinch0 / d, 6, 40); }
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; this.user.last = performance.now(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { begin(); this.user.dist = clamp(this.user.dist * (1 + e.deltaY * 0.001), 6, 40); e.preventDefault(); }, { passive: false });
  }
  shake(a) { this.shakeA = Math.min(1.2, this.shakeA + a); }
  // 镜头推拉：正值推进，弹簧回弹
  punch(a) { this.punchA = Math.max(this.punchA || 0, a); this.punchV = 0; }
  // 大招每次命中：推拉 + 震动，随连击累积增强
  ultHit(big) {
    const now = this.time; if (now - (this.ultLast || -9) > 1.2) this.ultN = 0;
    this.ultLast = now; this.ultN = (this.ultN || 0) + 1;
    const k = Math.min(1, this.ultN / 12);
    this.shakeA = Math.min(1.6, this.shakeA + 0.16 + 0.22 * k + (big ? 0.3 : 0));
    this.punch(0.08 + 0.12 * k + (big ? 0.08 : 0));
  }
  ultFinish() { this.shakeA = 2.2; this.punch(0.4); this.ultN = 0; if (this.focus) { this.mode = 'ult'; this.focusT = 0.7; } }
  setMode(m, focus = null, dur = 0, cut = true) { if (m !== this.mode || focus !== this.focus) { this.focusAge = 0; if (m === 'introCard' && cut) this.cut = true; if (m === 'winner') { this.cut = true; this.winYaw = (focus?.f.yaw || 0) + 0.6; } } this.mode = m; this.focus = focus; this.focusT = dur; }

  // fs: [{f, v}] 场上机甲
  update(dt, rdt, fs) {
    this.time += rdt;
    const W = this.want; const aspect = this.cam.aspect;
    const vf = THREE.MathUtils.degToRad(this.cam.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const alive = fs.filter((s) => s && s.f);
    if (this.focusT > 0) { this.focusT -= rdt; if (this.focusT <= 0 && (this.mode === 'ult' || this.mode === 'impact' || this.mode === 'assist')) this.mode = 'fight'; }

    if (this.mode === 'intro' || (alive.length < 2 && !(this.focus && ['winner', 'ko', 'introCard', 'assist', 'ult'].includes(this.mode)))) {
      // 开场：大全景缓慢环绕
      W.yaw = this.time * 0.12 + 0.4; W.pitch = 0.36; W.dist = 25; W.target.set(0, 2.2, 0);
      if (alive.length === 1) { const f = alive[0].f; W.target.set(f.x * 0.5, 2.4, f.z * 0.5); W.dist = 17; W.pitch = 0.28; }
    } else if (this.mode === 'introCard' && this.focus) {
      // 登场特写：低机位仰拍，从脚部缓慢上摇到驾驶舱，轻微环绕
      const f = this.focus.f, h = this.focus.v.height; const k = Math.min(1, this.focusAge = (this.focusAge || 0) + rdt * 0.45);
      W.target.set(f.x, h * (0.48 + 0.34 * k), f.z);
      W.yaw = f.yaw + 0.55 * this.focus.side + k * 0.35 * this.focus.side; W.pitch = 0.04 + 0.1 * k; W.dist = 5.5 + h * (1.75 - 0.35 * k);
    } else if (this.mode === 'ult' && this.focus) {
      // 大招：过肩斜侧取景，同时框住出招方与受击方，近景临场感
      const f = this.focus.f, h = this.focus.v.height;
      const os = alive.find((q) => q.f !== f);
      if (!os) { W.target.set(f.x, f.y + h * 0.62, f.z); W.yaw = f.yaw + 0.75 * this.shotSide; W.pitch = 0.14; W.dist = 5.2 + h * 0.9; }
      else {
        const o = os.f, ax = o.x - f.x, az = o.z - f.z, sep = Math.hypot(ax, az);
        const age = (this.focusAge = (this.focusAge || 0) + rdt);
        const yy = Math.atan2(-ax, -az) + (0.62 + age * 0.08) * this.shotSide;
        const hm = Math.max(h, os.v.height);
        const air = Math.max(f.y, o.y);
        W.target.set(f.x * 0.42 + o.x * 0.58, 0.9 + hm * 0.42 + air * 0.55, f.z * 0.42 + o.z * 0.58);
        W.yaw = this.unwrapNear(yy, W.yaw); W.pitch = 0.2 - Math.min(0.12, air * 0.015); W.dist = clamp(sep * 0.8 + 5.2 + hm * 0.55 + air * 0.75, 7.5, 18);
      }
    } else if (this.mode === 'assist' && this.focus) {
      // 子弹时间：特写出招方，环绕旋转
      const f = this.focus.f, h = this.focus.v.height;
      const first = !this.focusAge; this.focusAge = (this.focusAge || 0) + rdt; const k = Math.min(1, this.focusAge / 3);
      if (first) { this.asYaw = f.yaw + 0.9; this.cut = true; }
      W.target.set(f.x, f.y + h * 0.6, f.z);
      W.yaw = this.asYaw + k * 2.4 + k * k * 0.8; W.pitch = 0.08 + 0.12 * Math.sin(k * Math.PI); W.dist = 4.2 + h * (1.05 - 0.3 * k);
      if (!first) { this.yaw = W.yaw; this.pitch = W.pitch; }
    } else if (this.mode === 'ko' && this.focus) {
      const f = this.focus.f, h = this.focus.v.height;
      W.target.set(f.x, f.y + h * 0.4, f.z);
      W.yaw += rdt * 0.35; W.pitch = 0.1; W.dist = 6.5 + h;
    } else if (this.mode === 'winner' && this.focus) {
      // 胜者：近距离特写环绕旋转
      const f = this.focus.f, h = this.focus.v.height;
      const first = !this.focusAge; this.focusAge = (this.focusAge || 0) + rdt; const a = this.focusAge;
      // 锁定胜者正前方 ±30° 缓慢摇摆，略俯视对准驾驶舱座位；构图：驾驶员脸在画面上 1/3，WINNER 字在下 1/3
      const s = this.focus.v.anchorWorld && this.focus.v.anchorWorld('seat');
      W.yaw = f.yaw + 0.5 * Math.cos(a * 0.4); W.pitch = 0.2 + 0.04 * Math.sin(a * 0.7); W.dist = 3 + h * (0.6 - 0.08 * Math.min(1, a / 2));
      W.target.set(s ? s.x : f.x, (s ? s.y + 0.45 : f.y + h * 0.75) - 0.5 * Math.tan(0.384) * W.dist, s ? s.z : f.z);
      if (!first) { this.yaw = W.yaw; this.pitch = W.pitch; }
    } else {
      // 战斗：取两机中点，沿连线斜向取景
      const a = alive[0].f, b = alive[1].f;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; const dx = b.x - a.x, dz = b.z - a.z;
      const s = Math.hypot(dx, dz); const axis = Math.atan2(dx, dz);
      this.shotT -= rdt;
      if (this.shotT <= 0) {
        // 景别轮换：中景为主，穿插远景 / 低角度仰拍 / 侧面 / 单机近景跟拍
        const r = Math.random(); const prev = this.shot;
        this.shot = r < 0.34 ? 'mid' : r < 0.52 ? 'wide' : r < 0.7 ? 'low' : r < 0.84 ? 'side' : 'close';
        if (this.shot === prev && this.shot !== 'mid') this.shot = 'mid';
        this.shotT = { mid: 5 + Math.random() * 4, wide: 3.5 + Math.random() * 2, low: 3 + Math.random() * 2, side: 3.5 + Math.random() * 2, close: 2.2 + Math.random() * 1.5 }[this.shot];
        this.closeIdx = Math.random() < 0.5 ? 0 : 1;
        this.shotPhi = this.shot === 'side' ? 1.45 : 0.5 + Math.random() * 0.35; this.shotSide = Math.random() < 0.5 ? 1 : -1;
        this.shotPitch = this.shot === 'wide' ? 0.5 + Math.random() * 0.15 : this.shot === 'low' ? 0.03 : 0.18 + Math.random() * 0.18;
        if (this.shot !== 'mid' && Math.random() < 0.6) this.cut = true;
      }
      const yaw = axis + Math.PI / 2 * this.shotSide - (Math.PI / 2 - this.shotPhi) * this.shotSide + Math.sin(this.time * 0.13) * 0.12;
      const hmax = Math.max(alive[0].v.height, alive[1].v.height);
      const halfW = (s * Math.sin(this.shotPhi)) / 2 + 2.4 + hmax * 0.15;
      const needH = (hmax + 1.2) / 2 / Math.tan(vf / 2);
      const need = Math.max(halfW / Math.tan(hf / 2), needH);
      W.target.set(mx, 1.2 + hmax * 0.35 + Math.max(a.y, b.y) * 0.4, mz);
      W.yaw = this.unwrapNear(yaw, W.yaw); W.pitch = this.shotPitch; W.dist = clamp(need, 9, 26);
      if (this.shot === 'wide') W.dist = clamp(need * 1.35, 14, 30);
      else if (this.shot === 'low') { W.dist = clamp(need * 0.78, 7, 20); W.target.y *= 1.25; }
      else if (this.shot === 'close') {
        // 近景：越过一台机甲肩头看另一台（过肩镜头）
        const me = alive[this.closeIdx] || alive[0], op = alive[1 - this.closeIdx] || alive[1];
        const ax = op.f.x - me.f.x, az = op.f.z - me.f.z; const yy = Math.atan2(-ax, -az);
        W.yaw = this.unwrapNear(yy + 0.42 * this.shotSide, W.yaw); W.pitch = 0.16;
        W.target.set(me.f.x * 0.35 + op.f.x * 0.65, op.v.height * 0.6, me.f.z * 0.35 + op.f.z * 0.65);
        W.dist = clamp(s * 0.65 + 4.5 + me.v.height * 0.4, 6, 14);
      }
      if (this.mode === 'impact' && this.focus) { W.dist *= 0.72; W.pitch *= 0.7; }
    }
    // 用户接管
    const idle = (performance.now() - this.user.last) / 1000;
    const useUser = this.user.active && idle < 5;
    if (this.user.active && idle >= 5) this.user.active = false;
    const ty = useUser ? this.user.yaw : W.yaw, tp = useUser ? this.user.pitch : W.pitch, td = useUser ? this.user.dist : W.dist;
    if (this.cut && !useUser) { this.cut = false; this.yaw = ty; this.pitch = tp; this.dist = td; this.target.copy(W.target); }
    const k = useUser ? 14 : (this.mode === 'ult' ? 5 : this.mode === 'ko' ? 3 : 2.2);
    this.yaw = dampAngle(this.yaw, ty, k, rdt); this.pitch = damp(this.pitch, tp, k, rdt); this.dist = damp(this.dist, td, useUser ? 14 : 2.4, rdt);
    this.target.x = damp(this.target.x, W.target.x, 4, rdt); this.target.y = damp(this.target.y, W.target.y, 4, rdt); this.target.z = damp(this.target.z, W.target.z, 4, rdt);
    // 位置（限制在场馆内、不低于台面）
    const cp = Math.cos(this.pitch);
    _t.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    _t.y = Math.max(0.6, _t.y);
    // 推拉弹簧
    if (this.punchA) { this.punchV = (this.punchV || 0) + (-this.punchA * 260 - this.punchV * 22) * rdt; this.punchA += this.punchV * rdt; if (Math.abs(this.punchA) < 0.002 && Math.abs(this.punchV) < 0.02) this.punchA = 0; }
    if (this.punchA) { const pk = clamp(this.punchA, -0.4, 0.5); _t.x = this.target.x + (_t.x - this.target.x) * (1 - pk); _t.y = this.target.y + (_t.y - this.target.y) * (1 - pk); _t.z = this.target.z + (_t.z - this.target.z) * (1 - pk); _t.y = Math.max(0.6, _t.y); }
    this.shakeA *= Math.exp(-rdt * 6);
    const sh = this.shakeA * 0.25;
    this.cam.position.set(_t.x + (Math.random() - 0.5) * sh, _t.y + (Math.random() - 0.5) * sh, _t.z + (Math.random() - 0.5) * sh);
    this.cam.lookAt(this.target);
  }
  unwrapNear(a, ref) { while (a - ref > Math.PI) a -= Math.PI * 2; while (a - ref < -Math.PI) a += Math.PI * 2; return a; }
}
