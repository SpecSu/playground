// 特效：火花（拖尾线段 + 光点）、火球 / 烟尘、冲击波环、弹道（曳光 / 等离子 / 炮弹 / 导弹）、
// 激光束、喷火、电弧、雷击、KO 碎片、伤害数字（DOM）。全部对象池化，单帧零分配。
import * as THREE from 'three';
import { makeGlowTexture, makeSmokeTexture } from '../render/textures.js';
import { RING } from '../game/sim.js';

const rnd = (a, b) => a + (b - a) * Math.random();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color();

// ———————————————————— 点粒子系统 ————————————————————
class PointSystem {
  constructor(scene, cap, tex, additive) {
    this.cap = cap; this.n = 0; this.imm = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    this.P = []; // 活跃粒子
    this.free = [];
    for (let i = 0; i < cap; i++) this.free.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, r: 1, g: 1, b: 1, r1: 1, g1: 1, b1: 1, a: 1, drag: 0, grav: 0, ground: true, fadeIn: 0 });
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.uScale = { value: 600 };
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uScale: this.uScale },
      vertexShader: `attribute vec4 aCol; attribute float aSize; varying vec4 vCol; uniform float uScale;
        void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 512.0); }`,
      fragmentShader: additive
        ? `uniform sampler2D uTex; varying vec4 vCol; void main(){ float a = texture2D(uTex, gl_PointCoord).a * vCol.a; gl_FragColor = vec4(vCol.rgb * a, 1.0); }`
        : `uniform sampler2D uTex; varying vec4 vCol; void main(){ float a = texture2D(uTex, gl_PointCoord).a * vCol.a; if (a < 0.01) discard; gl_FragColor = vec4(vCol.rgb, a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Points(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 3 : 2;
    scene.add(this.mesh);
  }
  emit(o) {
    const p = this.free.pop(); if (!p) return null;
    p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.max = p.life = o.life || 0.5; p.s0 = o.s0 ?? o.s ?? 0.3; p.s1 = o.s1 ?? p.s0;
    const c0 = o.c || [1, 1, 1], c1 = o.c1 || c0; p.r = c0[0]; p.g = c0[1]; p.b = c0[2]; p.r1 = c1[0]; p.g1 = c1[1]; p.b1 = c1[2];
    p.a = o.a ?? 1; p.drag = o.drag || 0; p.grav = o.grav || 0; p.ground = o.ground !== false; p.fadeIn = o.fadeIn || 0;
    this.P.push(p); return p;
  }
  // 仅本帧绘制的光点（弹头 / 枪口焰 / 光束端点）
  dot(x, y, z, s, r, g, b, a = 1) {
    const i = this.n + this.imm; if (i >= this.cap) return;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a; this.size[i] = s;
    this.imm++;
  }
  update(dt) {
    const P = this.P; let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); this.free.push(p); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.ground && p.y < 0.02 && Math.abs(p.x) < RING + 1 && Math.abs(p.z) < RING + 1) { p.y = 0.02; p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
    for (let i = 0; i < P.length && n < this.cap; i++) {
      const p = P[i]; const u = 1 - p.life / p.max;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      const fade = (1 - u) * (p.fadeIn ? Math.min(1, u / p.fadeIn) : 1);
      this.col[n * 4] = p.r + (p.r1 - p.r) * u; this.col[n * 4 + 1] = p.g + (p.g1 - p.g) * u; this.col[n * 4 + 2] = p.b + (p.b1 - p.b) * u; this.col[n * 4 + 3] = p.a * fade;
      this.size[n] = p.s0 + (p.s1 - p.s0) * u; n++;
    }
    this.n = n;
  }
  flush() {
    const total = Math.min(this.cap, this.n + this.imm);
    this.geo.setDrawRange(0, total);
    for (const k of ['position', 'aCol', 'aSize']) { const a = this.geo.attributes[k]; a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, total * a.itemSize); }
    this.imm = 0;
  }
}

// ———————————————————— 火花拖尾（线段） ————————————————————
class StreakSystem {
  constructor(scene, cap) {
    this.cap = cap; this.P = []; this.free = [];
    for (let i = 0; i < cap; i++) this.free.push({});
    this.pos = new Float32Array(cap * 6); this.col = new Float32Array(cap * 6);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; scene.add(this.mesh);
    this.imm = 0; this.n = 0;
  }
  emit(x, y, z, vx, vy, vz, life, c, len = 0.04, grav = 22) {
    const p = this.free.pop(); if (!p) return;
    Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, c, len, grav }); this.P.push(p);
  }
  line(x0, y0, z0, x1, y1, z1, r, g, b) {
    const i = this.n + this.imm; if (i >= this.cap) return;
    this.pos.set([x0, y0, z0, x1, y1, z1], i * 6); this.col.set([r, g, b, r * 0.3, g * 0.3, b * 0.3], i * 6); this.imm++;
  }
  update(dt) {
    const P = this.P; let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); this.free.push(p); continue; }
      p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && Math.abs(p.x) < RING + 1 && Math.abs(p.z) < RING + 1) { p.y = 0.02; p.vy = Math.abs(p.vy) * 0.35; p.vx *= 0.7; p.vz *= 0.7; }
    }
    for (let i = 0; i < P.length && n < this.cap; i++) {
      const p = P[i]; const f = p.life / p.max; const L = p.len;
      this.pos[n * 6] = p.x; this.pos[n * 6 + 1] = p.y; this.pos[n * 6 + 2] = p.z;
      this.pos[n * 6 + 3] = p.x - p.vx * L; this.pos[n * 6 + 4] = p.y - p.vy * L; this.pos[n * 6 + 5] = p.z - p.vz * L;
      const c = p.c; const k = f * 1.4;
      this.col[n * 6] = c[0] * k; this.col[n * 6 + 1] = c[1] * k; this.col[n * 6 + 2] = c[2] * k;
      this.col[n * 6 + 3] = c[0] * k * 0.2; this.col[n * 6 + 4] = c[1] * k * 0.1; this.col[n * 6 + 5] = c[2] * k * 0.05;
      n++;
    }
    this.n = n;
  }
  flush() {
    const total = Math.min(this.cap, this.n + this.imm);
    this.geo.setDrawRange(0, total * 2);
    for (const k of ['position', 'color']) { const a = this.geo.attributes[k]; a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, total * 6); }
    this.imm = 0;
  }
}

const hex3 = (h) => { _c.set(h); return [_c.r, _c.g, _c.b]; };
const FIRE = [1, 0.62, 0.22], FIRE1 = [0.7, 0.12, 0.03], SPARK = [1, 0.75, 0.35];

// ———— 闪电：分形折线 + 多级分叉 + 面向镜头的发光丝带（单次 draw call） ————
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _cam = new THREE.Vector3();
function perp(dir) { _p.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); _p.addScaledVector(dir, -_p.dot(dir)); return _p.lengthSq() < 1e-6 ? _p.set(1, 0, 0) : _p.normalize(); }
// 中点位移生成锯齿主干
function jagLine(a, b, rough, levels) {
  let pts = [a.clone(), b.clone()];
  let disp = a.distanceTo(b) * rough;
  for (let l = 0; l < levels; l++) {
    const np = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i]; _d.subVectors(p1, p0); const len = _d.length(); _d.divideScalar(len || 1);
      const m = new THREE.Vector3().lerpVectors(p0, p1, 0.5 + rnd(-0.12, 0.12)).addScaledVector(perp(_d), rnd(-disp, disp));
      np.push(m, p1);
    }
    pts = np; disp *= 0.52;
  }
  return pts;
}
class Lightning {
  constructor(scene, cap = 9000) {
    this.cap = cap; this.B = [];
    const g = this.g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.v = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('vv', new THREE.BufferAttribute(this.v, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array(cap / 2 * 6); for (let i = 0, k = 0; i < cap / 2 - 1; i++) { const o = i * 2; idx[k++] = o; idx[k++] = o + 1; idx[k++] = o + 2; idx[k++] = o + 1; idx[k++] = o + 3; idx[k++] = o + 2; }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute vec4 col; attribute float vv; varying vec4 vC; varying float vV; void main(){ vC=col; vV=vv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec4 vC; varying float vV; void main(){ float f=1.0-abs(vV); float core=smoothstep(0.72,0.97,f); float glow=pow(f,2.2); vec3 c=vC.rgb*glow*1.4+vec3(1.0)*core*1.6; gl_FragColor=vec4(c*vC.a,1.0); }',
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh);
  }
  // opt: w 宽度, depth 分叉层级, branch 分叉概率, rough 粗糙度, life, flick 重劈频率, strands 并行股数
  spawn(a, b, col, opt = {}) {
    const o = Object.assign({ w: 0.3, depth: 1, branch: 0.25, rough: 0.2, levels: 5, life: 0.25, flick: 0.06, strands: 1 }, opt);
    const B = { a: a.clone(), b: b.clone(), col, o, t: 0, re: 0, lines: null }; this.build(B); this.B.push(B);
    if (this.B.length > 24) this.B.shift();
    return B;
  }
  build(B) {
    const o = B.o; const lines = [];
    const grow = (a, b, w, depth, rough) => {
      const pts = jagLine(a, b, rough, o.levels - (o.depth - depth)); lines.push({ pts, w });
      if (depth <= 0) return;
      const L = a.distanceTo(b);
      for (let i = 2; i < pts.length - 2; i++) {
        if (Math.random() > o.branch) continue;
        _d.subVectors(pts[i + 1], pts[i]).normalize();
        const bl = L * rnd(0.18, 0.45) * (1 - i / pts.length * 0.5);
        _q.copy(_d).addScaledVector(perp(_d), rnd(0.5, 1.2)).normalize();
        const end = pts[i].clone().addScaledVector(_q, bl); if (end.y < 0.05) end.y = 0.05 + Math.random() * 0.3;
        grow(pts[i], end, w * 0.55, depth - 1, rough * 1.1);
      }
    };
    for (let s = 0; s < o.strands; s++) {
      const b = s === 0 ? B.b : B.b.clone().add(_q.set(rnd(-1, 1), 0, rnd(-1, 1)).multiplyScalar(o.spread || 0.6));
      grow(B.a, b, s === 0 ? o.w : o.w * 0.6, o.depth, o.rough);
    }
    B.lines = lines;
  }
  update(dt, camera) {
    let n = 0; const cap = this.cap - 4; camera.getWorldPosition(_cam);
    for (let k = this.B.length - 1; k >= 0; k--) {
      const B = this.B[k]; B.t += dt; if (B.t >= B.o.life) { this.B.splice(k, 1); continue; }
      B.re += dt; if (B.re >= B.o.flick) { B.re = 0; this.build(B); }
      const u = B.t / B.o.life; const a = (1 - u * u) * (0.65 + 0.35 * Math.random()) * (B.o.alpha || 1);
      for (const ln of B.lines) {
        const P = ln.pts; if (n + P.length * 2 + 2 >= cap) break;
        // 起止各一条退化顶点，断开相邻丝带
        for (let i = 0; i < P.length; i++) {
          const p = P[i]; const pn = P[Math.min(P.length - 1, i + 1)], pp = P[Math.max(0, i - 1)];
          _d.subVectors(pn, pp).normalize(); _q.subVectors(_cam, p).normalize(); _q.crossVectors(_d, _q).normalize();
          const taper = 1 - (i / (P.length - 1)) * 0.55; const w = ln.w * taper * (0.8 + Math.random() * 0.4);
          const aa = (i === 0 || i === P.length - 1) ? 0 : a;
          for (let sd = -1; sd <= 1; sd += 2) {
            this.pos[n * 3] = p.x + _q.x * w * sd; this.pos[n * 3 + 1] = p.y + _q.y * w * sd; this.pos[n * 3 + 2] = p.z + _q.z * w * sd;
            this.col[n * 4] = B.col[0]; this.col[n * 4 + 1] = B.col[1]; this.col[n * 4 + 2] = B.col[2]; this.col[n * 4 + 3] = aa;
            this.v[n] = sd; n++;
          }
        }
        // 断开：插入两个零 alpha 顶点
        for (let z = 0; z < 2; z++) { this.pos.copyWithin(n * 3, (n - 2) * 3, (n - 1) * 3); this.col[n * 4 + 3] = 0; this.v[n] = 0; n++; }
        if (n % 2) { this.pos.copyWithin(n * 3, (n - 1) * 3, n * 3); this.col[n * 4 + 3] = 0; n++; }
      }
    }
    this.g.setDrawRange(0, Math.max(0, (n / 2 - 1)) * 6);
    for (const k of ['position', 'col', 'vv']) this.g.attributes[k].needsUpdate = true;
    this.mesh.visible = n > 0;
  }
}

export class VFX {
  constructor(scene, camera, opts = {}) {
    this.scene = scene; this.camera = camera; this.low = !!opts.low;
    const glow = makeGlowTexture(64, 0.15), smoke = makeSmokeTexture(64, 5);
    this.add = new PointSystem(scene, this.low ? 1100 : 1800, glow, true);
    this.smk = new PointSystem(scene, this.low ? 360 : 600, smoke, false);
    this.str = new StreakSystem(scene, this.low ? 500 : 900);
    // 闪光灯（常驻，强度 0 → 灯光数量恒定）
    this.flash = new THREE.PointLight(0xffa860, 0, 26, 1.6); this.flash.position.set(0, 3, 0); scene.add(this.flash);
    this.flashI = 0;
    // 冲击波环
    this.rings = [];
    const rg = new THREE.RingGeometry(0.82, 1, 48); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 3; scene.add(m); this.rings.push({ m, t: 0, life: 1, r0: 1, r1: 5, a: 1 });
    }
    // 弹体（炮弹 / 导弹）
    this.bodies = [];
    const mg = new THREE.CylinderGeometry(0.08, 0.1, 0.62, 8); mg.rotateX(Math.PI / 2);
    const sg = new THREE.SphereGeometry(0.2, 10, 8);
    const bm = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.8, roughness: 0.35 });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(i < 18 ? mg : sg, bm); m.visible = false; scene.add(m);
      this.bodies.push({ m, kind: i < 18 ? 'missile' : 'shell', p: null });
    }
    // 激光束（每台机甲一条）
    this.beams = [0, 1].map(() => this.makeBeam());
    // 闪电
    this.zap = new Lightning(scene, this.low ? 9000 : 16000);
    // 雷击预警圈
    this.warns = [];
    const wg = new THREE.RingGeometry(0.85, 1, 40); wg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m); this.warns.push({ m, t: 0, life: 0 });
    }
    // KO 碎片（实例化）
    const dg = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.4 }), 90);
    this.debrisMesh.count = 0; this.debrisMesh.castShadow = true; this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(90 * 3), 3);
    scene.add(this.debrisMesh); this.debris = [];
    this.flames = [null, null];     // 喷火状态（按机甲槽位）
    this.saws = [null, null];
    this.thrust = [0, 0];
    // 伤害数字
    this.layer = document.getElementById('fx-layer');
    this.nums = [];
    for (let i = 0; i < 40; i++) { const el = document.createElement('div'); el.className = 'dmg'; el.style.display = 'none'; this.layer.appendChild(el); this.nums.push({ el, life: 0 }); }
    this.size = { w: innerWidth, h: innerHeight };
    this.shake = 0;
  }

  makeBeam() {
    const g = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true); g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2);
    const mk = (core) => new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uCol: { value: new THREE.Color(1, 0.3, 0.5) }, uA: { value: 1 }, uCore: { value: core } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform float uT; uniform vec3 uCol; uniform float uA; uniform float uCore; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float f = abs(dot(vN,vV)); float n = 0.65 + 0.35*sin(vUv.y*60.0 - uT*50.0 + vUv.x*6.28*2.0);
          vec3 c = mix(uCol, vec3(1.0), uCore*0.8) * pow(f, uCore > 0.5 ? 0.6 : 2.0) * n * uA * (uCore > 0.5 ? 2.2 : 1.4);
          gl_FragColor = vec4(c, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const outer = new THREE.Mesh(g, mk(0)), inner = new THREE.Mesh(g, mk(1));
    const grp = new THREE.Group(); grp.add(outer, inner); grp.visible = false; grp.renderOrder = 4; this.scene.add(grp);
    return { grp, outer, inner, on: false, phase: 'off', big: false, t: 0, w: 0, f: null, view: null, col: [1, 0.3, 0.5] };
  }

  setSize(w, h, fov) {
    this.size.w = w; this.size.h = h;
    const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) * Math.min(2, devicePixelRatio || 1) * (this.prScale || 1);
    this.add.uScale.value = s; this.smk.uScale.value = s;
  }

  // ———————————— 基本单元 ————————————
  sparks(x, y, z, n, opt = {}) {
    const sp = opt.speed || 9, c = opt.c || SPARK, nx = opt.nx || 0, nz = opt.nz || 0;
    if (this.low) n = Math.ceil(n * 0.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = sp * rnd(0.35, 1);
      const r = Math.sqrt(1 - u * u);
      this.str.emit(x, y, z, Math.cos(a) * r * s + nx * sp * 0.6, Math.abs(u) * s * 0.8 + sp * 0.25, Math.sin(a) * r * s + nz * sp * 0.6, rnd(0.25, 0.6), c, 0.035);
    }
    this.add.emit({ x, y, z, life: 0.12, s0: (opt.flash || 1.6), s1: (opt.flash || 1.6) * 1.6, c: [1, 0.85, 0.6], a: 1 });
  }
  dust(x, z, n = 8, size = 1, col = [0.42, 0.4, 0.42]) {
    if (this.low) n = Math.ceil(n * 0.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(1.5, 4.5) * size;
      this.smk.emit({ x: x + Math.cos(a) * 0.3, y: 0.15, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: rnd(0.3, 1.4), vz: Math.sin(a) * s, life: rnd(0.7, 1.4), s0: 0.6 * size, s1: 2.4 * size, c: col, a: 0.4, drag: 2.8, ground: false });
    }
  }
  ring(x, y, z, r0, r1, life, col = 0xffffff, a = 0.9) {
    const R = this.rings.find((q) => !q.m.visible) || this.rings[0];
    R.m.visible = true; R.m.position.set(x, y + 0.05, z); R.t = 0; R.life = life; R.r0 = r0; R.r1 = r1; R.a = a; R.m.material.color.set(col);
  }
  light(x, y, z, I, col = 0xffa860) {
    if (I < this.flashI * 0.6) return;
    this.flash.position.set(x, y, z); this.flash.color.set(col); this.flashI = Math.max(this.flashI, I);
  }
  explosion(x, y, z, size = 1, opt = {}) {
    const n = Math.round((this.low ? 10 : 16) * size);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random(), s = rnd(1.5, 6) * size;
      this.add.emit({ x: x + rnd(-0.3, 0.3) * size, y: y + rnd(-0.2, 0.3) * size, z: z + rnd(-0.3, 0.3) * size, vx: Math.cos(a) * s * (1 - u * 0.5), vy: rnd(0.5, 5) * size, vz: Math.sin(a) * s * (1 - u * 0.5), life: rnd(0.35, 0.8), s0: rnd(0.8, 1.6) * size, s1: rnd(2.2, 3.6) * size, c: opt.c || [1, 0.8, 0.45], c1: opt.c1 || FIRE1, drag: 3.5, grav: -2, ground: false });
    }
    for (let i = 0; i < Math.round(n * 0.6); i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(0.5, 3) * size;
      this.smk.emit({ x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: rnd(1, 3.5) * size, vz: Math.sin(a) * s, life: rnd(1.2, 2.4), s0: 1.2 * size, s1: 4.2 * size, c: [0.16, 0.15, 0.16], a: 0.55, drag: 1.6, grav: -0.6, ground: false, fadeIn: 0.15 });
    }
    this.add.emit({ x, y, z, life: 0.16, s0: 4 * size, s1: 7 * size, c: [1, 0.95, 0.8] });
    this.sparks(x, y, z, Math.round(18 * size), { speed: 12 * Math.sqrt(size) });
    this.ring(x, Math.max(0, y - 0.6 * size), z, 0.4, 4.5 * size, 0.5, opt.ring || 0xffb070, 0.8);
    this.light(x, y + 0.5, z, 30 * size);
  }
  muzzle(p, size = 1, col = [1, 0.8, 0.4]) {
    this.add.emit({ x: p.x, y: p.y, z: p.z, life: 0.07, s0: 0.9 * size, s1: 1.3 * size, c: col });
    this.add.emit({ x: p.x, y: p.y, z: p.z, life: 0.12, s0: 0.4 * size, s1: 1.8 * size, c: [col[0] * 0.6, col[1] * 0.5, col[2] * 0.4], a: 0.6 });
    this.light(p.x, p.y, p.z, 6 * size, 0xffc080);
  }
  impact(kind, x, y, z, opt = {}) {
    switch (kind) {
      case 'bullet': this.sparks(x, y, z, 4, { speed: 7, flash: 0.7 }); break;
      case 'plasma': this.sparks(x, y, z, 8, { speed: 8, c: opt.col || [0.5, 0.9, 1], flash: 1.4 }); this.add.emit({ x, y, z, life: 0.25, s0: 1.4, s1: 2.6, c: opt.col || [0.5, 0.9, 1] }); break;
      case 'shell': this.explosion(x, y, z, 1.0); break;
      case 'bigshell': this.explosion(x, y, z, 1.7); break;
      case 'missile': this.explosion(x, y, z, 0.75); break;
      default: this.sparks(x, y, z, 10);
    }
  }
  thrustBurst(p, dirx, dirz, col) {
    for (let i = 0; i < 2; i++) this.add.emit({ x: p.x, y: p.y, z: p.z, vx: -dirx * 8 + rnd(-1, 1), vy: rnd(-1, 1), vz: -dirz * 8 + rnd(-1, 1), life: 0.25, s0: 0.5, s1: 0.1, c: col || [0.5, 0.8, 1], drag: 4, ground: false });
  }
  // 小招电弧：粗主干 + 1~2 级分叉
  arc(a, b, col = [0.7, 0.85, 1], life = 0.26) {
    const c = [Math.min(1, col[0] * 0.6 + 0.35), Math.min(1, col[1] * 0.6 + 0.4), Math.min(1, col[2] * 0.6 + 0.5)];
    this.zap.spawn(a, b, c, { w: 0.4, depth: 2, branch: 0.2, rough: 0.2, levels: 5, life, flick: 0.045 });
    this.sparks(b.x, b.y, b.z, 12, { speed: 9, c, flash: 2 });
    this.add.emit({ x: b.x, y: b.y, z: b.z, life: 0.18, s0: 2.2, s1: 3.4, c });
    this.light(b.x, b.y, b.z, 10, 0xa8c8ff);
  }
  // 大招天雷：巨粗多股、多级疯狂分叉、高频重劈
  bolt(x, z) {
    const top = new THREE.Vector3(x + rnd(-3, 3), 26, z + rnd(-3, 3)), bot = new THREE.Vector3(x, 0.1, z);
    const c = [0.62, 0.74, 1];
    this.zap.spawn(top, bot, c, { w: 0.85, depth: 3, branch: 0.32, rough: 0.16, levels: 6, life: 0.42, flick: 0.035, strands: 2, spread: 1.4 });
    this.zap.spawn(top.clone().add(new THREE.Vector3(rnd(-4, 4), 0, rnd(-4, 4))), bot, [0.8, 0.6, 1], { w: 0.5, depth: 2, branch: 0.25, rough: 0.2, levels: 6, life: 0.3, flick: 0.04 });
    // 落地后地面横向放电
    for (let i = 0; i < 4; i++) { const ang = Math.random() * 6.283, r = rnd(2, 4.5); this.zap.spawn(new THREE.Vector3(x, 0.3, z), new THREE.Vector3(x + Math.cos(ang) * r, 0.1, z + Math.sin(ang) * r), c, { w: 0.22, depth: 1, branch: 0.3, rough: 0.28, levels: 4, life: 0.3, flick: 0.04 }); }
    this.explosion(x, 0.4, z, 1.1, { c: [0.85, 0.92, 1], c1: [0.25, 0.35, 1], ring: 0x88aaff });
    this.add.emit({ x, y: 1.2, z, life: 0.22, s0: 7, s1: 10, c: [0.7, 0.8, 1] });
    this.light(x, 4, z, 70, 0xaec4ff);
  }
  // —— 大招强化 ——
  ultBurst(x, y, z, col, k = 1) {
    this.explosion(x, y, z, 0.9 * k, { c: [1, 0.95, 0.85], c1: col, ring: new THREE.Color(col[0], col[1], col[2]).getHex() });
    this.sparks(x, y, z, Math.round(18 * k), { speed: 12, c: col, flash: 2 });
    this.add.emit({ x, y, z, life: 0.2, s0: 3 * k, s1: 5 * k, c: col });
  }
  meteorTrail(x, y, z, col = [1, 0.5, 0.2]) {
    this.add.emit({ x, y: y + 1.6, z, life: 0.12, s0: 5, s1: 4, c: [1, 0.7, 0.35] }); this.light(x, y + 1.5, z, 18, 0xff9040);
    for (let i = 0; i < 9; i++) this.add.emit({ x: x + rnd(-1, 1), y: y + rnd(0, 2.6), z: z + rnd(-1, 1), vx: rnd(-1.5, 1.5), vy: rnd(2, 5), vz: rnd(-1.5, 1.5), life: rnd(0.35, 0.6), s0: 2, s1: 0.4, c: [1, 0.8, 0.4], c1: [0.9, 0.2, 0.05], drag: 2, ground: false });
    if (Math.random() < 0.5) this.add.emit({ x, y: y + 0.5, z, life: 0.25, s0: 2.6, s1: 1.2, c: col });
    if (Math.random() < 0.4) this.smk.emit({ x, y: y + 0.5, z, vy: 1, life: 0.9, s0: 1, s1: 2.6, c: [0.2, 0.17, 0.15], a: 0.4, ground: false });
  }
  meteorImpact(x, z, r = 6.5, col = [1, 0.5, 0.2]) {
    const c = [Math.min(1, col[0] * 0.5 + 0.55), Math.min(1, col[1] * 0.5 + 0.35), Math.min(1, col[2] * 0.4 + 0.15)];
    // 三重冲击波
    this.ring(x, 0.06, z, 0.5, r * 1.15, 0.55, 0xffd27a, 1);
    setTimeout(() => this.ring(x, 0.06, z, 0.5, r * 0.85, 0.5, 0xff7a3a, 0.9), 90);
    setTimeout(() => this.ring(x, 0.5, z, 0.3, r * 0.6, 0.45, 0xffffff, 0.8), 180);
    // 火柱 + 熔岩飞溅
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, sp = rnd(4, 14); this.add.emit({ x, y: 0.4, z, vx: Math.cos(a) * sp * 0.5, vy: rnd(6, 18), vz: Math.sin(a) * sp * 0.5, life: rnd(0.5, 0.9), s0: rnd(1, 2.2), s1: 0.3, c: [1, 0.85, 0.45], c1: [0.85, 0.18, 0.03], drag: 1.2, grav: 14, ground: true }); }
    for (let i = 0; i < 36; i++) { const a = Math.random() * 6.283, sp = rnd(10, 22); this.str.emit(x, 0.3, z, Math.cos(a) * sp, rnd(3, 12), Math.sin(a) * sp, rnd(0.4, 0.8), [1, 0.7, 0.3], 0.05); }
    // 地裂放电：橙色裂纹向四周劈开
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + rnd(-0.3, 0.3), rr = r * rnd(0.6, 1); this.zap.spawn(new THREE.Vector3(x, 0.15, z), new THREE.Vector3(x + Math.cos(a) * rr, 0.08, z + Math.sin(a) * rr), c, { w: 0.32, depth: 2, branch: 0.25, rough: 0.18, levels: 5, life: 0.5, flick: 0.06 }); }
    this.dust(x, z, 30, 2.4);
    this.add.emit({ x, y: 1.5, z, life: 0.25, s0: 9, s1: 14, c: [1, 0.75, 0.4] });
    this.light(x, 3, z, 80, 0xffa050);
  }
  // 狂暴连斩：每刀一道能量斩痕，终结刀巨型十字斩
  slash(f, col, big, i = 0) {
    const yaw = f.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cx = f.x + fx * 2.2, cz = f.z + fz * 2.2, h = 2.2 + (f.y || 0);
    const c = [Math.min(1, col[0] * 0.5 + 0.55), Math.min(1, col[1] * 0.35 + 0.3), Math.min(1, col[2] * 0.35 + 0.35)];
    const L = big ? 5 : 3.2, tilt = (i % 2 ? 1 : -1) * (big ? 1.4 : 1.0);
    const mk = (tl) => this.zap.spawn(new THREE.Vector3(cx - rx * L, h + tl, cz - rz * L), new THREE.Vector3(cx + rx * L, h - tl, cz + rz * L), c, { w: big ? 1.0 : 0.55, depth: 1, branch: big ? 0.3 : 0.12, rough: 0.06, levels: 4, life: big ? 0.4 : 0.24, flick: 0.07 });
    mk(tilt); if (big) { mk(-tilt); mk(0); this.ring(cx, h, cz, 0.5, 5, 0.35, 0xffffff, 0.9); this.explosion(cx, h, cz, 1.2, { c: [1, 1, 1], c1: c }); }
    this.light(cx, h, cz, big ? 40 : 14, 0xffd0e0);
    for (let k = 0; k < (big ? 30 : 10); k++) { const u = rnd(-1, 1); this.str.emit(cx + rx * L * u, h - tilt * u, cz + rz * L * u, fx * rnd(4, 10) + rnd(-3, 3), rnd(-2, 4), fz * rnd(4, 10) + rnd(-3, 3), rnd(0.2, 0.4), c, 0.04); }
    this.add.emit({ x: cx, y: h, z: cz, life: 0.15, s0: big ? 4 : 2, s1: big ? 6 : 3, c });
  }
  warn(x, z, life = 0.32) {
    const W = this.warns.find((q) => !q.m.visible) || this.warns[0];
    W.m.visible = true; W.m.position.set(x, 0.04, z); W.t = 0; W.life = life;
  }
  // KO 碎片
  burst(x, y, z, palette, n = 60, scale = 1) {
    const cols = [palette.primary, palette.secondary, palette.accent, palette.metal, '#3A3941'].map((h) => new THREE.Color(h));
    if (this.low) n = Math.ceil(n * 0.6);
    for (let i = 0; i < n; i++) {
      const d = this.debris.length < 90 ? {} : this.debris.shift();
      const a = Math.random() * Math.PI * 2, s = rnd(4, 13) * scale;
      Object.assign(d, { x: x + rnd(-0.6, 0.6), y: y + rnd(0, 2) * scale, z: z + rnd(-0.6, 0.6), vx: Math.cos(a) * s, vy: rnd(5, 15), vz: Math.sin(a) * s, rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), wx: rnd(-12, 12), wy: rnd(-12, 12), wz: rnd(-12, 12), sx: rnd(0.12, 0.55) * scale, sy: rnd(0.08, 0.35) * scale, sz: rnd(0.12, 0.5) * scale, life: rnd(2.6, 3.6), col: cols[Math.floor(Math.random() * cols.length)], fire: Math.random() < 0.35 });
      this.debris.push(d);
    }
  }
  // 伤害数字
  number(pos, text, cls = '', combo = 0, key = -1) {
    // v10.2 密度控制：同一目标同时最多 3 个数字（超出复用该目标最旧的那个）；全场活跃越多，寿命越短
    const live = this.nums.filter((q) => q.life > 0), mine = key >= 0 ? live.filter((q) => q.key === key) : [];
    const N = mine.length >= 3 ? mine.reduce((a, b) => (a.life < b.life ? a : b)) : (this.nums.find((q) => q.life <= 0) || this.nums.reduce((a, b) => (a.life < b.life ? a : b)));
    N.key = key; const crowd = live.length > 5 ? 0.7 : 1;
    // v10.1：连击时数字左右交错、弹得更快更高，寿命更短 → 节奏感
    const ck = Math.min(1, Math.max(0, combo - 1) / 7);
    N.life = N.max = (cls.includes('big') ? 1.3 : 0.95 - ck * 0.2) * crowd; N.p = pos.clone(); N.p.x += combo > 1 ? (combo % 2 ? 1 : -1) * rnd(0.35, 1.0) : rnd(-0.9, 0.9); N.p.y += rnd(-0.3, 0.5) + ck * 0.4; N.vy = rnd(2.4, 3.6) * (1 + ck * 0.6); N.pop = 1 + ck * 0.5; N.el.textContent = text;
    N.el.className = 'dmg ' + cls; N.el.style.display = 'block';
    const v = parseFloat(text);
    if (!isNaN(v) && !/block|heal|tag/.test(cls)) {
      // 黄(小) → 橙红(中) → 紫(大/暴击)，数值越大越亮越大
      const t = Math.min(1, Math.max(0, (v - 150) / 1350)) * 0.85 + (cls.includes('crit') ? 0.15 : 0) + (cls.includes('big') ? 0.1 : 0);
      const tt = Math.min(1, t);
      const stops = [[255, 230, 70], [255, 150, 40], [255, 70, 50], [200, 60, 255]];
      const f = tt * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), u = f - i;
      const c = stops[i].map((x, k) => Math.round(x + (stops[i + 1][k] - x) * u));
      N.el.style.color = `rgb(${c})`;
      N.el.style.textShadow = `0 0 ${6 + tt * 10}px rgba(${c},.75), 0 2px 0 #000, 0 0 3px #000`;
      N.el.style.fontSize = `${30 + tt * 26 + ck * 14}px`;
    } else { N.el.style.color = ''; N.el.style.textShadow = ''; N.el.style.fontSize = ''; }
  }

  // ———————————— 持续效果 ————————————
  setFlame(slot, on, big, view) { this.flames[slot] = on ? { view, big, t: 0 } : null; }
  setBeam(slot, on, phase, big, view, col) {
    const B = this.beams[slot];
    if (!on) { B.on = false; return; }
    B.on = true; B.phase = phase; B.big = big; B.view = view; B.col = col || B.col; B.t = phase === 'fire' ? 0 : B.t;
    B.outer.material.uniforms.uCol.value.setRGB(...B.col); B.inner.material.uniforms.uCol.value.setRGB(...B.col);
  }

  update(dt, t, ctx) {
    // ctx: { fighters, views, sim }
    this.add.update(dt); this.smk.update(dt); this.str.update(dt);
    this.flashI *= Math.exp(-dt * 9); this.flash.intensity = this.flashI;
    for (const R of this.rings) {
      if (!R.m.visible) continue; R.t += dt; const u = R.t / R.life;
      if (u >= 1) { R.m.visible = false; continue; }
      const e = 1 - (1 - u) ** 3; const s = R.r0 + (R.r1 - R.r0) * e; R.m.scale.set(s, 1, s); R.m.material.opacity = R.a * (1 - u);
    }
    for (const W of this.warns) {
      if (!W.m.visible) continue; W.t += dt; const u = W.t / W.life;
      if (u >= 1) { W.m.visible = false; continue; }
      const s = 2.3 * (1.3 - u * 0.3); W.m.scale.set(s, 1, s); W.m.material.opacity = 0.5 + 0.5 * Math.sin(t * 40);
    }
    this.zap.update(dt, this.camera);
    // 弹道
    const sim = ctx.sim, views = ctx.views;
    for (const b of this.bodies) b.used = false;
    if (sim) for (const p of sim.proj) {
      if (p.dead) continue;
      const col = p.owner && views.get(p.owner) ? views.get(p.owner).fxCol : [1, 0.8, 0.4];
      if (p.kind === 'bullet') {
        this.str.line(p.x, p.y, p.z, p.x - p.vx * 0.045, p.y - p.vy * 0.045, p.z - p.vz * 0.045, 1, 0.85, 0.5);
        this.add.dot(p.x, p.y, p.z, 0.35, 1, 0.8, 0.5);
      } else if (p.kind === 'plasma') {
        this.add.dot(p.x, p.y, p.z, 1.3, col[0], col[1], col[2]); this.add.dot(p.x, p.y, p.z, 0.5, 1, 1, 1);
        if (Math.random() < 0.6) this.add.emit({ x: p.x, y: p.y, z: p.z, life: 0.2, s0: 0.6, s1: 0.1, c: col, ground: false });
      } else {
        const kind = p.kind === 'missile' ? 'missile' : 'shell';
        let b = p._body && p._body.p === p ? p._body : null;
        if (!b) { b = this.bodies.find((q) => q.kind === kind && !q.m.visible && !q.used); if (b) { b.p = p; p._body = b; b.m.scale.setScalar(p.kind === 'bigshell' ? 1.8 : 1); } }
        if (b) {
          b.used = true; b.m.visible = true; b.m.position.set(p.x, p.y, p.z);
          _v.set(p.x + p.vx, p.y + p.vy, p.z + p.vz); b.m.lookAt(_v);
        }
        if (kind === 'missile') {
          this.add.dot(p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.z - p.vz * 0.03, 0.9, 1, 0.7, 0.35);
          if (Math.random() < 0.8) this.smk.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-0.3, 0.3), vy: rnd(0, 0.5), vz: rnd(-0.3, 0.3), life: rnd(0.6, 1.0), s0: 0.35, s1: 1.3, c: [0.55, 0.55, 0.58], a: 0.35, ground: false });
        } else {
          this.add.dot(p.x, p.y, p.z, 0.9, 1, 0.6, 0.3, 0.8);
          if (Math.random() < 0.5) this.smk.emit({ x: p.x, y: p.y, z: p.z, life: 0.5, s0: 0.3, s1: 0.9, c: [0.4, 0.4, 0.42], a: 0.3, ground: false });
        }
      }
    }
    for (const b of this.bodies) if (!b.used && b.m.visible) { b.m.visible = false; b.p = null; }
    // 激光
    for (let i = 0; i < 2; i++) {
      const B = this.beams[i];
      B.w += ((B.on ? (B.phase === 'fire' ? (B.big ? 1.6 : 1) : 0.12) : 0) - B.w) * Math.min(1, dt * (B.on ? 14 : 10));
      if (B.w < 0.02 || !B.view) { B.grp.visible = false; continue; }
      B.grp.visible = true; B.t += dt;
      const V = B.view; const a = V.anchorWorld('beam') || V.boneWorld('chest');
      const fwd = _v2.set(Math.sin(V.root.rotation.y), 0, Math.cos(V.root.rotation.y));
      const len = B.phase === 'fire' ? (B.hitLen || 20) : 1.2;
      B.grp.position.copy(a); _v.copy(a).addScaledVector(fwd, 10); _v.y = a.y - (B.dy || 0) * 10; B.grp.lookAt(_v);
      const w = B.w * (B.big ? 0.62 : 0.26) * (1 + Math.sin(t * (B.big ? 80 : 60)) * (B.big ? 0.14 : 0.08));
      B.outer.scale.set(w * 2.1, w * 2.1, len); B.inner.scale.set(w * 0.7, w * 0.7, len);
      B.outer.material.uniforms.uT.value = t; B.inner.material.uniforms.uT.value = t;
      B.outer.material.uniforms.uA.value = Math.min(1, B.w); B.inner.material.uniforms.uA.value = Math.min(1, B.w);
      this.add.dot(a.x, a.y, a.z, 2.2 * B.w + 0.6, B.col[0], B.col[1], B.col[2]);
      if (B.phase === 'fire' && B.on) {
        _v.copy(a).addScaledVector(fwd, len); _v.y -= (B.dy || 0) * len;
        this.add.dot(_v.x, _v.y, _v.z, 2.6 * B.w, B.col[0], B.col[1], B.col[2]);
        if (Math.random() < 0.6) this.sparks(_v.x, _v.y, _v.z, 2, { speed: 7, c: B.col, flash: 0.1 });
        this.light(_v.x, _v.y + 0.5, _v.z, B.big ? 22 : 10, 0xffffff);
        if (B.big) {
          // 光柱缠绕电弧 + 命中点持续爆裂
          if (Math.random() < 0.35) { const u0 = rnd(0.05, 0.6), u1 = u0 + rnd(0.15, 0.35); const p0 = a.clone().addScaledVector(fwd, len * u0), p1 = a.clone().addScaledVector(fwd, len * Math.min(1, u1)); p0.y -= (B.dy || 0) * len * u0; p1.y -= (B.dy || 0) * len * Math.min(1, u1); this.zap.spawn(p0, p1, B.col, { w: 0.18, depth: 1, branch: 0.3, rough: 0.35, levels: 4, life: 0.12, flick: 0.04 }); }
          if (Math.random() < 0.3) this.explosion(_v.x + rnd(-0.5, 0.5), _v.y, _v.z + rnd(-0.5, 0.5), 0.55, { c: [1, 1, 1], c1: B.col });
          for (let k = 0; k < 3; k++) this.str.emit(_v.x, _v.y, _v.z, rnd(-9, 9), rnd(2, 10), rnd(-9, 9), rnd(0.25, 0.5), B.col, 0.04);
        }
      } else if (B.big && B.on && B.phase === 'charge') {
        // 蓄能：粒子向炮口汇聚 + 炮口电弧
        for (let k = 0; k < 4; k++) { const d = _v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(2.5, 4)); this.add.emit({ x: a.x + d.x, y: a.y + d.y, z: a.z + d.z, vx: -d.x * 4, vy: -d.y * 4, vz: -d.z * 4, life: 0.25, s0: 0.3, s1: 0.9, c: B.col, ground: false }); }
        if (Math.random() < 0.3) { const e = a.clone().add(_v.set(rnd(-1.6, 1.6), rnd(-1.2, 1.6), rnd(-1.6, 1.6))); this.zap.spawn(a, e, B.col, { w: 0.12, depth: 1, branch: 0.3, rough: 0.3, levels: 4, life: 0.1, flick: 0.05 }); }
      }
    }
    // 喷火
    for (let i = 0; i < 2; i++) {
      const F = this.flames[i]; if (!F) continue;
      F.t += dt; const V = F.view; const a = V.anchorWorld('flame'); if (!a) continue;
      const yaw = V.root.rotation.y; const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const n = (this.low ? 3 : 5) * (F.big ? 2 : 1);
      for (let k = 0; k < n; k++) {
        const sp = rnd(11, 16) * (F.big ? 1.15 : 1), spr = F.big ? 0.32 : 0.16;
        const dx = fx + rnd(-spr, spr), dz = fz + rnd(-spr, spr), dy = rnd(-0.12, 0.08);
        this.add.emit({ x: a.x, y: a.y, z: a.z, vx: dx * sp, vy: dy * sp, vz: dz * sp, life: rnd(0.35, 0.55) * (F.big ? 1.25 : 1), s0: 0.25, s1: F.big ? 3.4 : 1.8, c: [1, 0.85, 0.45], c1: [0.8, 0.15, 0.02], drag: 2.2, grav: -3, ground: false });
      }
      if (Math.random() < 0.4) this.smk.emit({ x: a.x + fx * 4, y: a.y + 0.5, z: a.z + fz * 4, vx: fx * 3, vy: 2, vz: fz * 3, life: 1.2, s0: 1, s1: 3, c: [0.15, 0.13, 0.12], a: 0.35, ground: false, fadeIn: 0.3 });
      this.light(a.x + fx * 2, a.y, a.z + fz * 2, F.big ? 26 : 14, 0xff7a30);
      if (F.big) {
        // 炼狱火旋：脚下火环旋转扩张 + 火柱喷发
        const ox = V.root.position.x, oz = V.root.position.z;
        for (let k = 0; k < (this.low ? 8 : 14); k++) { const ang = F.t * 5 + k / 14 * 6.283 + rnd(-0.2, 0.2), r = rnd(2, 5.6); this.add.emit({ x: ox + Math.cos(ang) * r, y: 0.2, z: oz + Math.sin(ang) * r, vx: -Math.sin(ang) * 6, vy: rnd(3, 8), vz: Math.cos(ang) * 6, life: rnd(0.35, 0.6), s0: rnd(0.8, 1.6), s1: 0.3, c: [1, 0.8, 0.35], c1: [0.85, 0.12, 0.02], drag: 1.5, grav: -2, ground: false }); }
        F.pil = (F.pil || 0) - dt;
        if (F.pil <= 0) { F.pil = 0.15; const ang = Math.random() * 6.283, r = rnd(2.5, 5.2), px = ox + Math.cos(ang) * r, pz = oz + Math.sin(ang) * r; for (let k = 0; k < 14; k++) this.add.emit({ x: px + rnd(-0.4, 0.4), y: 0.2, z: pz + rnd(-0.4, 0.4), vx: rnd(-1, 1), vy: rnd(10, 18), vz: rnd(-1, 1), life: rnd(0.35, 0.6), s0: rnd(1.2, 2.2), s1: 0.4, c: [1, 0.9, 0.5], c1: [0.9, 0.2, 0.03], drag: 1, grav: 6, ground: false }); this.ring(px, 0.05, pz, 0.3, 2, 0.35, 0xff8a3a, 0.8); }
        if (Math.random() < 0.25) this.ring(ox, 0.05, oz, 1, 5.8, 0.5, 0xff5a20, 0.5);
      }
    }
    // 电锯 / 钻头火花
    for (let i = 0; i < 2; i++) {
      const S = this.saws[i]; if (!S) continue; const a = S.view.anchorWorld('saw'); if (!a) continue;
      if (Math.random() < 0.7) this.str.emit(a.x, a.y, a.z, rnd(-4, 4), rnd(1, 6), rnd(-4, 4), 0.3, SPARK, 0.03);
    }
    // 碎片
    const D = this.debrisMesh; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pp = new THREE.Vector3();
    let n = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.life -= dt;
      if (d.life <= 0) { this.debris.splice(i, 1); continue; }
      d.vy -= 24 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
      const inRing = Math.abs(d.x) < RING + 0.9 && Math.abs(d.z) < RING + 0.9; const fl = inRing ? 0.05 : -1.25;
      if (d.y < fl + d.sy * 0.5) { d.y = fl + d.sy * 0.5; d.vy = Math.abs(d.vy) * 0.3; d.vx *= 0.6; d.vz *= 0.6; d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5; }
      if (d.fire && Math.random() < 0.3 && d.life > 1) this.smk.emit({ x: d.x, y: d.y, z: d.z, life: 0.8, s0: 0.2, s1: 0.8, c: [0.2, 0.2, 0.2], a: 0.4, ground: false });
      if (d.fire && d.life > 1.4) this.add.dot(d.x, d.y, d.z, 0.5, 1, 0.5, 0.15, 0.8);
    }
    for (const d of this.debris) {
      const k = Math.min(1, d.life / 0.6);
      e.set(d.rx, d.ry, d.rz); q.setFromEuler(e); s.set(d.sx * k, d.sy * k, d.sz * k); pp.set(d.x, d.y, d.z);
      m4.compose(pp, q, s); D.setMatrixAt(n, m4); D.setColorAt(n, d.col); n++;
    }
    D.count = n; if (n) { D.instanceMatrix.needsUpdate = true; D.instanceColor.needsUpdate = true; }
    // 伤害数字
    const cam = this.camera; const W = this.size.w, H = this.size.h;
    for (const N of this.nums) {
      if (N.life <= 0) continue; N.life -= dt;
      if (N.life <= 0) { N.el.style.display = 'none'; continue; }
      N.p.y += N.vy * dt; N.vy *= Math.exp(-dt * 2.5);
      _v.copy(N.p).project(cam);
      if (_v.z > 1) { N.el.style.display = 'none'; continue; }
      N.el.style.display = 'block';
      const u = 1 - N.life / N.max; const pk = 0.4 * (N.pop || 1);
      // 透视缩放：数字是屏幕像素尺寸，镜头拉远时会相对机甲变得巨大 → 按相机距离缩小（近景 1，远景最小 0.5）
      const ds = Math.min(1, Math.max(0.5, 14 / Math.max(1, cam.position.distanceTo(N.p))));
      const sc = (u < 0.1 ? 0.5 + u / 0.1 * (0.5 + pk) : 1 + pk - Math.min(pk, (u - 0.1) * 2.4)) * ds;
      N.el.style.transform = `translate3d(${((_v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - _v.y) / 2 * H).toFixed(1)}px, 0) translate(-50%, -50%) scale(${sc.toFixed(2)})`;
      N.el.style.opacity = Math.min(1, N.life / 0.3).toFixed(2);
    }
    if (this.ext) this.ext.update(dt, t, ctx); // v10 扩展特效（需在粒子 update 之后、flush 之前写入即时光点）
    this.add.flush(); this.smk.flush(); this.str.flush();
  }
}
export { hex3 };
