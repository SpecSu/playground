// v10 新增招式特效：残影 / 钩锁 / 回旋飞刃 / 迫击预警 / 黑洞 / 轨道炮 / 龙卷 / 千影 / 冰封
// 依附在 VFX 上，复用其粒子 / 拖尾 / 闪电 / 冲击环 / 爆炸等基本单元；新增几何全部预建并池化。
import * as THREE from 'three';
import { RING } from '../game/sim.js';

const rnd = (a, b) => a + (b - a) * Math.random();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1), _side = new THREE.Vector3(), _A = new THREE.Vector3(), _P = new THREE.Vector3(), _e = new THREE.Euler();
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const lift = (c, k = 0.35) => [Math.min(1, c[0] * (1 - k) + k), Math.min(1, c[1] * (1 - k) + k), Math.min(1, c[2] * (1 - k) + k)];
const ICE = [0.62, 0.9, 1], ICE2 = [0.85, 0.97, 1];

// 菲涅尔发光（残影 / 视界 / 冲击球）
const FRES_VS = `varying vec3 vN; varying vec3 vV; void main(){ vec4 p = vec4(position,1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const FRES_FS = `uniform vec3 uC; uniform float uA; uniform float uP; uniform float uB; varying vec3 vN; varying vec3 vV;
  void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = uA * (uB + (1.0 - uB) * pow(f, uP));
  gl_FragColor = vec4(uC * (0.55 + 1.3 * f) * a, 1.0); }`;
const fresMat = (col, a = 1, p = 1.6, b = 0.18) => new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Color(...col) }, uA: { value: a }, uP: { value: p }, uB: { value: b } },
  vertexShader: FRES_VS, fragmentShader: FRES_FS, ...ADD, side: THREE.FrontSide,
});
// 旋涡条纹（吸积盘 / 龙卷 / 光柱）
const SWIRL_VS = `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const DISK_FS = `uniform float uT; uniform vec3 uC; uniform float uA; uniform float uR0; uniform float uR1; varying vec3 vP;
  void main(){ float r = length(vP.xy); float u = clamp((r - uR0) / (uR1 - uR0), 0.0, 1.0); float th = atan(vP.y, vP.x);
    float band = 0.55 + 0.45 * sin(th * 3.0 + log(r + 0.2) * 9.0 - uT * 7.0) * sin(th * 7.0 - uT * 11.0 + r * 3.0);
    float edge = smoothstep(0.0, 0.08, u) * pow(1.0 - u, 1.6);
    vec3 c = mix(vec3(1.0, 0.97, 0.9), uC, smoothstep(0.0, 0.55, u));
    gl_FragColor = vec4(c * band * edge * uA * 1.8, 1.0); }`;
const FUNNEL_FS = `uniform float uT; uniform vec3 uC; uniform float uA; uniform float uK; varying vec2 vUv;
  void main(){ float s = sin(vUv.x * 6.2832 * 4.0 + vUv.y * 9.0 * uK - uT * 13.0 * uK) * 0.5 + 0.5; float s2 = sin(vUv.x * 6.2832 * 9.0 - vUv.y * 5.0 + uT * 8.0) * 0.5 + 0.5;
    float a = pow(s, 3.0) * 0.8 + pow(s2, 6.0) * 0.5; float fade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    gl_FragColor = vec4(mix(uC, vec3(1.0), 0.25 + 0.4 * s2) * a * fade * uA, 1.0); }`;
const PILLAR_FS = `uniform float uT; uniform vec3 uC; uniform float uA; uniform float uCore; varying vec2 vUv; varying vec3 vP;
  void main(){ float n = 0.7 + 0.3 * sin(vUv.y * 90.0 - uT * 70.0 + vUv.x * 6.2832 * 3.0); float fl = 0.85 + 0.15 * sin(uT * 53.0);
    float bot = smoothstep(0.0, 0.02, vUv.y); vec3 c = mix(uC, vec3(1.0), uCore);
    gl_FragColor = vec4(c * n * fl * bot * uA * (uCore > 0.5 ? 2.4 : 1.3), 1.0); }`;
// 霜冻地面：径向冰裂纹 + 六角晶格 + 外缘冷光圈（加色）
const FROST_FS = `uniform float uT; uniform vec3 uC; uniform float uA; uniform float uR; varying vec2 vUv; varying vec3 vP;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){ vec2 p = vP.xz; float r = length(p); if (r > uR) discard; float u = r / max(uR, 0.001);
    float an = atan(p.y, p.x); float cr = pow(abs(sin(an * 9.0 + h(vec2(floor(r * 1.4), 1.0)) * 6.0)), 40.0) * (1.0 - u * 0.5);
    vec2 g = p * 1.6; vec2 q = vec2(g.x + g.y * 0.577, g.y * 1.155); vec2 f = fract(q) - 0.5; float hex = smoothstep(0.42, 0.5, max(abs(f.x), abs(f.y)));
    float edge = smoothstep(0.82, 0.97, u) * (1.0 - smoothstep(0.97, 1.0, u));
    float tw = step(0.985, h(floor(p * 7.0) + floor(uT * 6.0))) * 1.5;
    float v = 0.16 + cr * 0.9 + hex * 0.22 + edge * 1.6 + tw;
    gl_FragColor = vec4(mix(uC, vec3(1.0), 0.35 + edge * 0.5) * v * uA * (1.0 - u * 0.35), 1.0); }`;
// 寒光柱：上下渐隐 + 竖向流动冰晶条纹
const COLD_FS = `uniform float uT; uniform vec3 uC; uniform float uA; varying vec2 vUv;
  void main(){ float n = 0.55 + 0.45 * sin(vUv.x * 6.2832 * 5.0 + vUv.y * 9.0 - uT * 4.0); float s = pow(max(0.0, sin(vUv.y * 40.0 + uT * 12.0 + vUv.x * 30.0)), 12.0);
    float fade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
    gl_FragColor = vec4(mix(uC, vec3(1.0), 0.12 + s * 0.5) * (n * 0.6 + s) * fade * uA, 1.0); }`;
const swirlMat = (fs, uni) => new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color(1, 1, 1) }, uA: { value: 1 }, ...uni }, vertexShader: SWIRL_VS, fragmentShader: fs, ...ADD, side: THREE.DoubleSide });

export class VFX2 {
  constructor(vfx) {
    this.v = vfx; const scene = (this.scene = vfx.scene); this.low = vfx.low; vfx.ext = this;
    // —— 残影：每台机甲懒加载 8 个克隆，复用时只拷贝骨骼姿态
    this.ghostPools = new Map(); this.ghosts = [];
    // —— 钩锁：链节实例 + 爪头
    const lg = new THREE.TorusGeometry(0.13, 0.04, 6, 10); lg.scale(1, 1.55, 1);
    this.links = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.95, roughness: 0.28, emissive: 0x222630 }), 130);
    this.links.frustumCulled = false; this.links.count = 0; scene.add(this.links);
    this.hookHeads = [0, 1].map(() => {
      const g = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 1, roughness: 0.22 });
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), steel); core.scale.set(1, 1, 1.4); g.add(core);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 5), steel); const a = k * Math.PI * 2 / 3;
        c.position.set(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.32); c.rotation.set(Math.PI / 2 - Math.sin(a) * 0.5, 0, 0); c.rotation.y = Math.cos(a) * 0.5; g.add(c);
      }
      g.visible = false; scene.add(g); return g;
    });
    // —— 回旋飞刃
    const star = new THREE.Shape(); const N = 6;
    for (let i = 0; i <= N * 2; i++) { const a = i / (N * 2) * Math.PI * 2, r = i % 2 ? 0.34 : 0.78; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? star.lineTo(x, y) : star.moveTo(x, y); }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.16, 0, Math.PI * 2, true); star.holes.push(hole);
    const sg = new THREE.ShapeGeometry(star); sg.rotateX(-Math.PI / 2);
    const rg = new THREE.TorusGeometry(0.62, 0.05, 6, 40); rg.rotateX(Math.PI / 2);
    this.discs = [0, 1, 2, 3].map(() => {
      const g = new THREE.Group();
      const blade = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.18, side: THREE.DoubleSide, emissive: 0x111111 }));
      const glow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff, ...ADD, opacity: 0.55, side: THREE.DoubleSide })); glow.scale.setScalar(1.18);
      const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, ...ADD, opacity: 0.9 }));
      g.add(blade, glow, ring); g.visible = false; scene.add(g); return { g, blade, glow, ring, p: null, spin: 0 };
    });
    // —— 迫击预警圈：外环 + 收缩内环 + 十字
    const ring1 = new THREE.RingGeometry(0.9, 1, 48); ring1.rotateX(-Math.PI / 2);
    const bar = new THREE.PlaneGeometry(0.06, 0.55); bar.rotateX(-Math.PI / 2);
    this.marks = []; for (let i = 0; i < 8; i++) {
      const g = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color: 0xff4040, ...ADD, opacity: 0.9, side: THREE.DoubleSide });
      const o1 = new THREE.Mesh(ring1, mat), o2 = new THREE.Mesh(ring1, mat); g.add(o1, o2);
      for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(bar, mat); const a = k * Math.PI / 2; b.position.set(Math.sin(a) * 0.75, 0, Math.cos(a) * 0.75); b.rotation.y = a; g.add(b); }
      g.visible = false; g.renderOrder = 3; scene.add(g); this.marks.push({ g, o1, o2, mat, t: 0, life: 1, r: 2.7 });
    }
    // —— 黑洞
    this.bh = (() => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), new THREE.MeshBasicMaterial({ color: 0x010102 }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), fresMat([0.8, 0.5, 1], 1, 2.4, 0.0)); halo.scale.setScalar(1.35);
      const lens = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.16, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, ...ADD, side: THREE.DoubleSide }));
      const dg = new THREE.RingGeometry(1.25, 4.6, 96, 3);
      const disk = new THREE.Mesh(dg, swirlMat(DISK_FS, { uR0: { value: 1.25 }, uR1: { value: 4.6 } })); disk.rotation.x = -Math.PI / 2 + 0.38;
      const disk2 = new THREE.Mesh(dg, swirlMat(DISK_FS, { uR0: { value: 1.25 }, uR1: { value: 4.6 } })); disk2.rotation.set(-Math.PI / 2 - 0.9, 0.5, 0); disk2.scale.setScalar(0.72);
      const wave = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), fresMat([1, 1, 1], 1, 1.4, 0.05));
      g.add(core, halo, lens, disk, disk2); g.visible = false; scene.add(g); wave.visible = false; scene.add(wave);
      core.renderOrder = 5; lens.renderOrder = 6;
      return { g, core, halo, lens, disk, disk2, wave, on: false, k: 0, t: 0, col: [0.7, 0.4, 1], parts: [], waveT: -1, x: 0, z: 0 };
    })();
    // —— 轨道炮：地面准星 + 天空瞄准线 + 光柱
    this.orb = (() => {
      const g = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color: 0xff4a3a, ...ADD, side: THREE.DoubleSide });
      const outer = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), mat); outer.rotation.x = -Math.PI / 2;
      const arcs = new THREE.Group(); for (let k = 0; k < 4; k++) { const a = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 16, 1, k * Math.PI / 2 + 0.2, Math.PI / 2 - 0.4), mat); a.rotation.x = -Math.PI / 2; arcs.add(a); }
      const cross = new THREE.Group(); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.5), mat); b.rotation.x = -Math.PI / 2; const a = k * Math.PI / 2; b.position.set(Math.sin(a) * 1.18, 0, Math.cos(a) * 1.18); b.rotation.z = a; cross.add(b); }
      g.add(outer, arcs, cross); g.visible = false; g.renderOrder = 3; scene.add(g);
      const cg = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); cg.translate(0, 0.5, 0);
      const aim = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xff6a50, ...ADD, opacity: 0.8 })); aim.visible = false; scene.add(aim);
      const outerB = new THREE.Mesh(cg, swirlMat(PILLAR_FS, { uCore: { value: 0 } })), innerB = new THREE.Mesh(cg, swirlMat(PILLAR_FS, { uCore: { value: 1 } }));
      const pillar = new THREE.Group(); pillar.add(outerB, innerB); pillar.visible = false; pillar.renderOrder = 4; scene.add(pillar);
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffb070, ...ADD, opacity: 0.6 })); scorch.rotation.x = -Math.PI / 2; scorch.visible = false; scene.add(scorch);
      return { g, mat, outer, arcs, cross, aim, pillar, outerB, innerB, scorch, st: 'off', t: 0, w: 0, x: 0, z: 0, col: [1, 0.4, 0.3] };
    })();
    // —— 龙卷（每台机甲一个）
    this.torn = [0, 1].map(() => {
      const g = new THREE.Group(); const layers = [];
      [[3.6, 0.9, 7.5, 1, 0.75], [2.6, 0.6, 6.2, 1.5, 0.9], [4.4, 1.4, 5.0, 0.7, 0.45]].forEach(([rt, rb, h, k, a]) => {
        const cg = new THREE.CylinderGeometry(rt, rb, h, 40, 6, true); cg.translate(0, h / 2, 0);
        const m = new THREE.Mesh(cg, swirlMat(FUNNEL_FS, { uK: { value: k } })); m.userData.a = a; layers.push(m); g.add(m);
      });
      g.visible = false; g.renderOrder = 4; scene.add(g); return { g, layers, on: false, w: 0, t: 0, f: null, parts: [] };
    });
    // —— 冰刺（实例化晶体）
    const ig = new THREE.ConeGeometry(0.42, 2.0, 5, 1); ig.translate(0, 1.0, 0);
    this.iceMat = new THREE.MeshStandardMaterial({ color: 0xcfeeff, emissive: 0x3a8cff, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.9 });
    this.ice = new THREE.InstancedMesh(ig, this.iceMat, 260); this.ice.frustumCulled = false; this.ice.count = 0; scene.add(this.ice);
    this.iceGlow = new THREE.InstancedMesh(ig, new THREE.MeshBasicMaterial({ color: 0x66b8ff, ...ADD, opacity: 0.45 }), 260); this.iceGlow.frustumCulled = false; this.iceGlow.count = 0; scene.add(this.iceGlow);
    this.spikes = []; this.encase = null;
    // —— 极寒冰封 v10.1：霜冻地面（施法者 / 目标各一）+ 寒光柱 + 冷色点光 + 大冰川
    this.frosts = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(9, 72).rotateX(-Math.PI / 2), swirlMat(FROST_FS, { uR: { value: 1 } })); m.position.y = 0.04; m.renderOrder = 1; m.visible = false; m.frustumCulled = false; scene.add(m); return { m, on: false, t: 0, r: 0, R: 6, a: 0, x: 0, z: 0 }; });
    { const cg = new THREE.CylinderGeometry(1.6, 2.4, 16, 32, 8, true); cg.translate(0, 8, 0); this.coldPillar = new THREE.Mesh(cg, swirlMat(COLD_FS, {})); this.coldPillar.visible = false; this.coldPillar.frustumCulled = false; this.coldPillar.renderOrder = 3; scene.add(this.coldPillar); this.cpT = -1; }
    this.coldLight = new THREE.PointLight(0x8fd0ff, 0, 22, 1.5); this.coldLight.position.set(0, 3, 0); scene.add(this.coldLight); this.coldI = 0;
    this.glc = { on: false, t: 0, f: null, col: ICE };
    // —— 千影法阵
    this.sigil = (() => {
      const g = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, ...ADD, side: THREE.DoubleSide, opacity: 0.9 });
      const r1 = new THREE.Mesh(new THREE.RingGeometry(4.5, 4.7, 96), mat), r2 = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.38, 96), mat);
      const hex = new THREE.Group();
      for (let k = 0; k < 6; k++) { const a0 = k * Math.PI / 3, a1 = a0 + Math.PI * 2 / 3; const x0 = Math.cos(a0) * 4.5, y0 = Math.sin(a0) * 4.5, x1 = Math.cos(a1) * 4.5, y1 = Math.sin(a1) * 4.5; const L = Math.hypot(x1 - x0, y1 - y0); const b = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.07), mat); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); b.rotation.z = Math.atan2(y1 - y0, x1 - x0); hex.add(b); }
      g.add(r1, r2, hex); g.rotation.x = -Math.PI / 2; const root = new THREE.Group(); root.add(g); root.visible = false; root.renderOrder = 3; scene.add(root);
      return { root, g, hex, mat, t: 0, life: 0 };
    })();
    this.trails = []; // 每台机甲的千影位移拖尾采样
  }

  // ———————————————————— 残影 ————————————————————
  ghost(view, col, life = 0.45, a0 = 0.9) {
    if (!view || !view.root) return;
    let pool = this.ghostPools.get(view);
    if (!pool) { pool = { list: [] }; this.ghostPools.set(view, pool); }
    let G = pool.list.find((q) => !q.root.visible);
    if (!G) {
      if (pool.list.length < 8) {
        const mat = fresMat(lift(col, 0.2), 1, 1.5, 0.12); const src = []; view.root.traverse((o) => src.push(o)); const root = view.root.clone(true); const nodes = [];
        root.traverse((o) => { nodes.push(o); if (o.isSkinnedMesh || o.isPoints || o.isSprite || o.isLine) o.visible = false; else if (o.isMesh) { o.material = mat; o.castShadow = o.receiveShadow = false; o.renderOrder = 2; } });
        G = { root, nodes, src, mat, t: 0, life }; pool.list.push(G); this.scene.add(root);
      } else G = pool.list.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    }
    const n = Math.min(G.nodes.length, G.src.length);
    for (let i = 0; i < n; i++) { const s = G.src[i], d = G.nodes[i]; d.position.copy(s.position); d.quaternion.copy(s.quaternion); d.scale.copy(s.scale); if (!(d.isSkinnedMesh || d.isPoints || d.isSprite || d.isLine)) d.visible = s.visible; }
    G.root.visible = true; G.t = 0; G.life = life; G.a0 = a0; G.mat.uniforms.uC.value.setRGB(...lift(col, 0.2)); G.mat.uniforms.uA.value = a0;
    if (!this.ghosts.includes(G)) this.ghosts.push(G);
  }
  dropView(view) { const pool = this.ghostPools.get(view); if (!pool) return; for (const G of pool.list) { this.scene.remove(G.root); G.mat.dispose(); const i = this.ghosts.indexOf(G); if (i >= 0) this.ghosts.splice(i, 1); } this.ghostPools.delete(view); }

  // ———————————————————— 事件入口 ————————————————————
  blink(f, from, to, view, col) {
    const V = this.v, c = lift(col, 0.3);
    this.ghost(view, col, 0.6, 1);
    // 出发点：向上消散的光尘
    for (let i = 0; i < (this.low ? 18 : 34); i++) V.add.emit({ x: from.x + rnd(-0.7, 0.7), y: from.y + rnd(0.2, 3.2), z: from.z + rnd(-0.7, 0.7), vx: rnd(-1, 1), vy: rnd(2, 6), vz: rnd(-1, 1), life: rnd(0.4, 0.8), s0: rnd(0.3, 0.7), s1: 0.05, c, ground: false, drag: 2 });
    V.ring(from.x, 0.05, from.z, 0.3, 3.2, 0.35, new THREE.Color(...c).getHex(), 0.8);
    // 位移光痕
    const a = _v.set(from.x, from.y + 1.6, from.z), b = _v2.set(to.x, to.y + 1.6, to.z);
    V.zap.spawn(a.clone(), b.clone(), c, { w: 0.5, depth: 1, branch: 0.1, rough: 0.05, levels: 4, life: 0.28, flick: 0.05 });
    V.zap.spawn(a.clone(), b.clone(), [1, 1, 1], { w: 0.18, depth: 0, branch: 0, rough: 0.03, levels: 3, life: 0.22, flick: 0.05 });
    // 抵达点：向内收束 → 爆开
    for (let i = 0; i < (this.low ? 14 : 26); i++) { const an = Math.random() * 6.283, r = rnd(2, 3.4); V.add.emit({ x: to.x + Math.cos(an) * r, y: to.y + rnd(0.4, 3), z: to.z + Math.sin(an) * r, vx: -Math.cos(an) * r * 6, vy: 0, vz: -Math.sin(an) * r * 6, life: 0.16, s0: 0.5, s1: 0.1, c, ground: false }); }
    V.add.emit({ x: to.x, y: to.y + 1.6, z: to.z, life: 0.22, s0: 5, s1: 1, c: [1, 1, 1] });
    V.ring(to.x, 0.05, to.z, 0.3, 4, 0.4, 0xffffff, 0.9);
    V.light(to.x, to.y + 2, to.z, 36, new THREE.Color(...c).getHex());
  }
  hookCatch(x, y, z, col) { const V = this.v; V.sparks(x, y, z, 24, { speed: 11, flash: 2.4 }); V.ring(x, 0.05, z, 0.3, 3, 0.35, 0xffe0b0, 0.8); V.add.emit({ x, y, z, life: 0.18, s0: 3.2, s1: 1, c: lift(col, 0.4) }); V.light(x, y, z, 24, 0xffd090); }
  discHit(x, y, z, col) { const V = this.v, c = lift(col, 0.3); V.sparks(x, y, z, 18, { speed: 12, c, flash: 1.8 }); for (let k = 0; k < 8; k++) V.str.emit(x, y, z, rnd(-12, 12), rnd(-2, 6), rnd(-12, 12), rnd(0.15, 0.3), [1, 1, 1], 0.05); V.light(x, y, z, 14, 0xffffff); }
  discCatch(x, y, z, col) { this.v.add.emit({ x, y, z, life: 0.15, s0: 1.8, s1: 0.4, c: lift(col, 0.5) }); }
  mortarWarn(x, z, life, col) { const M = this.marks.find((q) => !q.g.visible) || this.marks[0]; M.g.visible = true; M.g.position.set(x, 0.07, z); M.t = 0; M.life = life; M.r = 2.7; M.mat.color.setRGB(1, 0.28, 0.22); }
  mortarBoom(x, z, col) {
    const V = this.v; V.explosion(x, 0.6, z, 1.35); V.ring(x, 0.05, z, 0.5, 4.2, 0.45, 0xffb070, 0.9); V.dust(x, z, 12, 1.2);
    for (let i = 0; i < 10; i++) V.add.emit({ x, y: 0.3, z, vx: rnd(-2, 2), vy: rnd(8, 15), vz: rnd(-2, 2), life: rnd(0.4, 0.7), s0: 1.2, s1: 0.2, c: [1, 0.7, 0.3], c1: [0.6, 0.15, 0.05], grav: 18, ground: false });
  }
  blackhole(phase, x, y, z, col) {
    const B = this.bh, V = this.v;
    if (phase === 'open') {
      B.on = true; B.k = 0; B.t = 0; B.x = x; B.z = z; B.col = lift(col, 0.15); B.g.position.set(x, y, z); B.g.visible = true;
      B.halo.material.uniforms.uC.value.setRGB(...B.col); B.disk.material.uniforms.uC.value.setRGB(...B.col); B.disk2.material.uniforms.uC.value.setRGB(...lift(col, 0.45));
      V.add.emit({ x, y, z, life: 0.3, s0: 8, s1: 0.5, c: [1, 1, 1] }); V.light(x, y, z, 50, 0xd0b0ff);
      B.parts.length = 0; for (let i = 0; i < (this.low ? 70 : 140); i++) B.parts.push(this.bhPart());
    } else if (phase === 'collapse') {
      B.on = false; B.collapseT = 0;
      V.explosion(x, y, z, 2.3, { c: [1, 1, 1], c1: B.col, ring: 0xffffff }); V.explosion(x, 0.5, z, 1.6, { c: lift(B.col, 0.5), c1: B.col });
      V.ring(x, 0.05, z, 0.5, 11, 0.8, 0xffffff, 0.95); V.ring(x, 0.05, z, 0.3, 7, 0.6, new THREE.Color(...B.col).getHex(), 0.9);
      for (let i = 0; i < 6; i++) { const an = i / 6 * 6.283; V.zap.spawn(new THREE.Vector3(x, y, z), new THREE.Vector3(x + Math.cos(an) * 6, 0.2, z + Math.sin(an) * 6), lift(B.col, 0.4), { w: 0.4, depth: 2, branch: 0.3, rough: 0.2, levels: 5, life: 0.4, flick: 0.04 }); }
      for (let k = 0; k < 40; k++) V.str.emit(x, y, z, rnd(-22, 22), rnd(-6, 16), rnd(-22, 22), rnd(0.3, 0.7), lift(B.col, 0.4), 0.05);
      V.light(x, y, z, 90, 0xffffff); B.wave.visible = true; B.wave.position.set(x, y, z); B.waveT = 0; B.wave.material.uniforms.uC.value.setRGB(...lift(B.col, 0.5));
    }
  }
  bhPart() { return { r: rnd(2.2, 7.5), a: Math.random() * 6.283, h: rnd(-1.2, 1.8), w: rnd(0.8, 1.6), px: 0, py: 0, pz: 0, has: false }; }
  orbital(phase, x, z, col) {
    const O = this.orb, V = this.v;
    if (phase === 'lock') { O.st = 'lock'; O.t = 0; O.x = x; O.z = z; O.col = lift(col, 0.2); O.g.visible = true; O.aim.visible = true; }
    else if (phase === 'fire') {
      O.st = 'fire'; O.t = 0; O.w = 0; O.x = x; O.z = z; O.pillar.visible = true; O.scorch.visible = true; O.aim.visible = false;
      O.outerB.material.uniforms.uC.value.setRGB(...O.col); O.innerB.material.uniforms.uC.value.setRGB(...lift(O.col, 0.5));
      V.explosion(x, 0.6, z, 2.4, { c: [1, 1, 1], c1: O.col, ring: 0xffffff }); V.ring(x, 0.05, z, 0.5, 12, 0.9, 0xffffff, 0.95); V.ring(x, 0.05, z, 0.5, 7, 0.6, new THREE.Color(...O.col).getHex(), 0.9);
      V.dust(x, z, 30, 2.2); V.light(x, 6, z, 110, 0xffffff);
    } else if (phase === 'off') { O.st = 'fade'; O.t = 0; V.explosion(O.x, 0.8, O.z, 1.6, { c: [1, 1, 1], c1: O.col }); }
  }
  tornado(i, f, on, fin, col) {
    const T = this.torn[i]; if (!T) return;
    if (on) { T.on = true; T.t = 0; T.f = f; T.col = lift(col, 0.15); T.g.visible = true; T.layers.forEach((m, k) => m.material.uniforms.uC.value.setRGB(...(k === 2 ? [0.72, 0.74, 0.8] : T.col))); T.parts.length = 0; for (let n = 0; n < (this.low ? 60 : 120); n++) T.parts.push({ a: Math.random() * 6.283, h: Math.random() * 7, s: rnd(0.6, 1.4), px: 0, py: 0, pz: 0, has: false }); }
    else {
      T.on = false;
      if (fin && f) { const V = this.v; V.explosion(f.x, 1.5, f.z, 1.9, { c: [1, 1, 1], c1: T.col || col }); V.ring(f.x, 0.05, f.z, 0.5, 9, 0.7, 0xffffff, 0.9); V.dust(f.x, f.z, 30, 2); for (let k = 0; k < 36; k++) { const an = Math.random() * 6.283; V.str.emit(f.x, rnd(0.5, 5), f.z, Math.cos(an) * rnd(14, 24), rnd(0, 6), Math.sin(an) * rnd(14, 24), rnd(0.3, 0.6), lift(T.col || col, 0.4), 0.05); } V.light(f.x, 3, f.z, 60, 0xffffff); }
    }
  }
  phantom(phase, d, view, col) {
    const V = this.v, c = lift(col, 0.3), S = this.sigil;
    if (phase === 'start') {
      S.root.visible = true; S.root.position.set(d.x, 0.08, d.z); S.t = 0; S.life = 2.6; S.mat.color.setRGB(...c);
      V.ring(d.x, 0.05, d.z, 0.5, 5, 0.5, new THREE.Color(...c).getHex(), 0.9); V.light(d.x, 2, d.z, 40, new THREE.Color(...c).getHex());
      this.ghost(view, col, 0.8, 1);
    } else if (phase === 'pass') {
      const y = 1.9; const a = new THREE.Vector3(d.ax, y, d.az), b = new THREE.Vector3(d.bx, y, d.bz);
      V.zap.spawn(a, b, c, { w: 0.7, depth: 1, branch: 0.12, rough: 0.04, levels: 4, life: 0.32, flick: 0.06 });
      V.zap.spawn(a.clone(), b.clone(), [1, 1, 1], { w: 0.22, depth: 0, branch: 0, rough: 0.02, levels: 3, life: 0.26, flick: 0.05 });
      for (let k = 0; k < 14; k++) { const u = Math.random(); V.str.emit(d.ax + (d.bx - d.ax) * u, y + rnd(-0.6, 0.6), d.az + (d.bz - d.az) * u, rnd(-5, 5), rnd(-1, 5), rnd(-5, 5), rnd(0.2, 0.4), c, 0.04); }
      V.light((d.ax + d.bx) / 2, 2, (d.az + d.bz) / 2, 30, new THREE.Color(...c).getHex());
    } else if (phase === 'gather') {
      V.add.emit({ x: d.f.x, y: 1.8, z: d.f.z, life: 0.25, s0: 6, s1: 1, c: [1, 1, 1] });
    } else if (phase === 'final') {
      const f = d.f, o = d.o || f; const yaw = f.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const cx = f.x + fx * 2.4, cz = f.z + fz * 2.4, h = 2.2; const L = 6.5;
      for (const s of [1, -1]) {
        const a = new THREE.Vector3(cx - rx * L, h + s * L * 0.75, cz - rz * L), b = new THREE.Vector3(cx + rx * L, h - s * L * 0.75, cz + rz * L);
        V.zap.spawn(a, b, c, { w: 1.5, depth: 1, branch: 0.25, rough: 0.04, levels: 4, life: 0.55, flick: 0.07 });
        V.zap.spawn(a.clone(), b.clone(), [1, 1, 1], { w: 0.5, depth: 0, branch: 0, rough: 0.02, levels: 3, life: 0.45, flick: 0.06 });
      }
      V.ultBurst(cx, h, cz, c, 1.8); V.ring(cx, 0.05, cz, 0.5, 10, 0.7, 0xffffff, 0.95); V.light(cx, h, cz, 90, 0xffffff);
      S.life = Math.min(S.life, S.t + 0.5);
    }
  }
  glacier(phase, d, col) {
    const V = this.v;
    if (phase === 'charge') { const G = this.glc; G.on = true; G.t = 0; G.f = d.f; G.col = ICE; this.coldI = 8; return; }
    if (phase === 'slam') { this.frostOn(0, d.x, d.z, 7.5); this.glc.on = true; this.glc.f = d.f || this.glc.f; this.coldI = 30;
      for (let k = 0; k < 10; k++) { const an = k / 10 * 6.283 + rnd(-0.2, 0.2), r = rnd(1.2, 2.2); this.addSpike(d.x + Math.cos(an) * r, d.z + Math.sin(an) * r, rnd(1.2, 1.9), rnd(2.2, 2.8)); }
      for (let k = 0; k < 14; k++) { const an = Math.random() * 6.283; V.smk.emit({ x: d.x + Math.cos(an) * 1.2, y: 0.2, z: d.z + Math.sin(an) * 1.2, vx: Math.cos(an) * rnd(3, 7), vy: rnd(0, 0.3), vz: Math.sin(an) * rnd(3, 7), life: rnd(1.4, 2.2), s0: 1.0, s1: 3.0, c: [0.5, 0.75, 1], a: 0.24, drag: 1.6, ground: false, fadeIn: 0.05 }); }
      V.ring(d.x, 0.05, d.z, 0.4, 9, 0.8, 0xdff4ff, 0.9); for (let i = 0; i < 24; i++) { const an = Math.random() * 6.283; V.add.emit({ x: d.x, y: 0.4, z: d.z, vx: Math.cos(an) * rnd(4, 10), vy: rnd(1, 5), vz: Math.sin(an) * rnd(4, 10), life: rnd(0.4, 0.8), s0: 0.6, s1: 0.1, c: ICE2, c1: ICE, drag: 2 }); } V.light(d.x, 1.5, d.z, 40, 0x9fd8ff); }
    else if (phase === 'spike') {
      const n = this.low ? 3 : 5; for (let k = 0; k < n; k++) this.addSpike(d.x + rnd(-0.9, 0.9), d.z + rnd(-0.9, 0.9), d.k * rnd(1.0, 1.9), rnd(1.8, 2.4));
      for (const sd of [1, -1]) if (Math.random() < 0.8) this.addSpike(d.x + rnd(-1, 1) * 1.6 * sd, d.z + rnd(-1, 1) * 1.6 * sd, d.k * rnd(0.5, 0.9), rnd(1.5, 2));
      for (let k = 0; k < 2; k++) V.smk.emit({ x: d.x + rnd(-1, 1), y: rnd(0.1, 0.5), z: d.z + rnd(-1, 1), vx: rnd(-2.5, 2.5), vy: rnd(0, 0.4), vz: rnd(-2.5, 2.5), life: rnd(1.2, 2), s0: 0.9, s1: 2.6, c: [0.5, 0.75, 1], a: 0.22, drag: 1.2, ground: false, fadeIn: 0.08 });
      for (let k = 0; k < 6; k++) V.add.emit({ x: d.x + rnd(-1.2, 1.2), y: rnd(0.3, 3), z: d.z + rnd(-1.2, 1.2), vx: rnd(-0.6, 0.6), vy: rnd(0.4, 1.6), vz: rnd(-0.6, 0.6), life: rnd(0.8, 1.6), s0: 0.22, s1: 0.04, c: [1, 1, 1], c1: ICE, ground: false });
      for (let k = 0; k < 4; k++) V.add.emit({ x: d.x, y: rnd(0.2, 1.5), z: d.z, vx: rnd(-3, 3), vy: rnd(2, 6), vz: rnd(-3, 3), life: rnd(0.3, 0.6), s0: 0.45, s1: 0.05, c: ICE2, ground: false });
      if (Math.random() < 0.5) V.smk.emit({ x: d.x, y: 0.3, z: d.z, vx: rnd(-1, 1), vy: rnd(0.2, 1), vz: rnd(-1, 1), life: rnd(0.9, 1.4), s0: 0.8, s1: 2.4, c: [0.75, 0.88, 0.95], a: 0.35, ground: false, fadeIn: 0.1 });
      V.light(d.x, 1.5, d.z, 22, 0x9fd8ff);
    } else if (phase === 'freeze') {
      const o = d.o; const R = o.radius * 0.8, H = o.height;
      this.encase = { o, list: [] };
      for (let k = 0; k < 14; k++) { const an = k / 14 * 6.283 + rnd(-0.15, 0.15); const tilt = rnd(0.2, 0.55); this.encase.list.push({ dx: Math.cos(an) * R, dz: Math.sin(an) * R, an, tilt, s: rnd(1.4, 2.2) * (H / 3), t: -k * 0.012 }); }
      for (let k = 0; k < 6; k++) { const an = Math.random() * 6.283; this.encase.list.push({ dx: Math.cos(an) * R * 0.3, dz: Math.sin(an) * R * 0.3, an, tilt: rnd(0, 0.2), s: rnd(2.0, 2.8) * (H / 3), t: 0 }); }
      for (let k = 0; k < 16; k++) { const an = k / 16 * 6.283 + rnd(-0.2, 0.2), rr = R * rnd(1.8, 3.2); this.encase.list.push({ dx: Math.cos(an) * rr, dz: Math.sin(an) * rr, an, tilt: rnd(0.35, 0.8), s: rnd(0.9, 1.6) * (H / 3), t: -0.05 - Math.random() * 0.15 }); } // 外圈冰川
      this.frostOn(1, o.x, o.z, 6); this.cpT = 0; this.coldPillar.position.set(o.x, 0, o.z); this.coldI = 40;
      V.ring(o.x, 0.05, o.z, 0.5, 5, 0.6, 0xbfe8ff, 0.95); V.add.emit({ x: o.x, y: H * 0.5, z: o.z, life: 0.25, s0: 4.5, s1: 1.5, c: ICE }); V.light(o.x, H * 0.6, o.z, 45, 0x7fc4ff);
      for (let k = 0; k < 16; k++) { const an = Math.random() * 6.283; V.smk.emit({ x: o.x + Math.cos(an) * rnd(1, 2.4), y: rnd(0.15, H * 0.35), z: o.z + Math.sin(an) * rnd(1, 2.4), vx: Math.cos(an) * rnd(1.5, 4), vy: rnd(-0.1, 0.3), vz: Math.sin(an) * rnd(1.5, 4), life: rnd(1.4, 2.4), s0: 1.0, s1: 3.2, c: [0.5, 0.75, 1], a: 0.24, drag: 1.2, ground: false, fadeIn: 0.08 }); }
      for (let k = 0; k < 30; k++) V.str.emit(o.x, H * 0.5, o.z, rnd(-10, 10), rnd(-2, 10), rnd(-10, 10), rnd(0.3, 0.6), ICE2, 0.04);
    } else if (phase === 'shatter') {
      if (d.miss) { this.spikes.forEach((s) => (s.life = Math.min(s.life, s.t + 0.25))); return; }
      const o = d.o; const x = d.x, z = d.z, y = o ? o.height * 0.5 : 1.5;
      this.encase = null; this.spikes.forEach((s) => (s.life = Math.min(s.life, s.t + 0.2)));
      this.iceBurst(x, y, z, this.low ? 40 : 80); this.cpT = Math.max(this.cpT, 0.0001); this.cpFade = true; this.coldI = 50; this.frosts.forEach((F) => (F.t = Math.max(F.t, F.life - 0.9)));
      for (let k = 0; k < 16; k++) { const an = Math.random() * 6.283; V.smk.emit({ x, y: rnd(0.2, 1.2), z, vx: Math.cos(an) * rnd(4, 11), vy: rnd(0, 0.8), vz: Math.sin(an) * rnd(4, 11), life: rnd(1, 1.8), s0: 1.0, s1: 3.4, c: [0.55, 0.78, 1], a: 0.26, drag: 2, ground: false }); }
      for (let k = 0; k < 60; k++) V.add.emit({ x: x + rnd(-1, 1), y: y + rnd(-1, 1), z: z + rnd(-1, 1), vx: rnd(-9, 9), vy: rnd(0, 10), vz: rnd(-9, 9), life: rnd(0.8, 1.8), s0: 0.3, s1: 0.04, c: [1, 1, 1], c1: ICE, drag: 1.5, grav: 4, ground: false });
      V.explosion(x, y, z, 1.5, { c: ICE2, c1: ICE, ring: 0x8fd0ff }); V.ring(x, 0.05, z, 0.5, 9, 0.7, 0xffffff, 0.95); V.ring(x, 0.05, z, 0.3, 6, 0.5, 0x8fd0ff, 0.9);
      for (let k = 0; k < 40; k++) V.str.emit(x, y, z, rnd(-18, 18), rnd(-2, 14), rnd(-18, 18), rnd(0.3, 0.6), ICE2, 0.05);
      V.light(x, y, z, 55, 0x8fd0ff);
    }
  }
  frostOn(i, x, z, R) { const F = this.frosts[i]; F.on = true; F.t = 0; F.life = 4.2; F.R = R; F.x = x; F.z = z; F.m.position.set(x, 0.04 + i * 0.01, z); F.m.visible = true; }
  addSpike(x, z, k, life) {
    if (Math.abs(x) > RING + 0.5 || Math.abs(z) > RING + 0.5) return;
    if (this.spikes.length > 200) this.spikes.shift();
    this.spikes.push({ x, z, k, t: 0, life, rx: rnd(-0.38, 0.38), rz: rnd(-0.38, 0.38), ry: Math.random() * 6 });
  }
  iceBurst(x, y, z, n) {
    const V = this.v; const cols = ['#E4F6FF', '#AEE0FF', '#7CC4FF', '#FFFFFF', '#5E9FE0'].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      const d = V.debris.length < 90 ? {} : V.debris.shift(); const a = Math.random() * Math.PI * 2, s = rnd(5, 15);
      Object.assign(d, { x: x + rnd(-0.6, 0.6), y: y + rnd(-0.5, 1.5), z: z + rnd(-0.6, 0.6), vx: Math.cos(a) * s, vy: rnd(4, 14), vz: Math.sin(a) * s, rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), wx: rnd(-14, 14), wy: rnd(-14, 14), wz: rnd(-14, 14), sx: rnd(0.12, 0.45), sy: rnd(0.25, 0.7), sz: rnd(0.12, 0.4), life: rnd(1.6, 2.6), col: cols[Math.floor(Math.random() * cols.length)], fire: false });
      V.debris.push(d);
    }
  }

  // ———————————————————— 每帧 ————————————————————
  update(dt, t, ctx) {
    const V = this.v, sim = ctx.sim, views = ctx.views;
    // 残影淡出
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const G = this.ghosts[i]; G.t += dt; const u = G.t / G.life;
      if (u >= 1) { G.root.visible = false; this.ghosts.splice(i, 1); continue; }
      G.mat.uniforms.uA.value = G.a0 * (1 - u) * (1 - u);
    }
    // 钩锁
    let ln = 0;
    for (let s = 0; s < 2; s++) {
      const head = this.hookHeads[s]; head.visible = false;
      const f = sim && sim.f[s]; if (!f || !f.act || f.act.type !== 'sp_hook') continue;
      const H = f.act.data.hook; if (!H || H.st === 'done') continue;
      const v = views.get(f); const A = _A.copy((v && v.muzzleWorld(0)) || _P.set(f.x, f.y + f.height * 0.6, f.z));
      const B = _v2.set(H.x, H.y, H.z); const dir = _v.copy(B).sub(A); const L = dir.length(); if (L < 0.05) continue; dir.divideScalar(L);
      const n = Math.min(60, Math.floor(L / 0.27));
      const wav = H.st === 'out' ? 0.25 : 0.05; _side.set(dir.z, 0, -dir.x); if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0); _side.normalize();
      _q.setFromUnitVectors(UP, dir);
      for (let k = 0; k < n && ln < 130; k++) {
        const u = (k + 0.5) / n; const w = Math.sin(u * Math.PI) * Math.sin(u * 14 - t * 30) * wav;
        _P.copy(A).addScaledVector(dir, L * u).addScaledVector(_side, w);
        _q2.setFromAxisAngle(dir, k % 2 ? Math.PI / 2 : 0).multiply(_q);
        _m.compose(_P, _q2, ONE);
        this.links.setMatrixAt(ln++, _m);
      }
      head.visible = true; head.position.copy(B); head.lookAt(_P.copy(B).add(dir)); head.rotation.z += t * (H.st === 'out' ? 20 : 0);
      V.add.dot(B.x, B.y, B.z, 1.2, ...lift(v ? v.fxCol : [1, 0.8, 0.5], 0.4));
      if (H.st === 'pull' && Math.random() < 0.6) V.str.emit(B.x, B.y, B.z, rnd(-6, 6), rnd(0, 6), rnd(-6, 6), 0.3, [1, 0.8, 0.45], 0.03);
    }
    this.links.count = ln; if (ln) this.links.instanceMatrix.needsUpdate = true;
    // 回旋飞刃
    for (const D of this.discs) D.used = false;
    if (sim) for (const p of sim.proj) {
      if (p.kind !== 'disc' || p.dead) continue;
      let D = this.discs.find((q) => q.p === p); if (!D) { D = this.discs.find((q) => !q.p || q.p.dead || !sim.proj.includes(q.p)); if (!D) continue; D.p = p; }
      D.used = true; const col = lift(views.get(p.owner)?.fxCol || [1, 0.6, 0.8], 0.3);
      D.g.visible = true; D.g.position.set(p.x, p.y, p.z); D.spin += dt * 34; D.g.rotation.set(0.25 * Math.sin(p.age * 6), D.spin, 0.35 * (p.curve || 1));
      D.glow.material.color.setRGB(...col); D.ring.material.color.setRGB(...col);
      V.add.dot(p.x, p.y, p.z, 2.2, ...col, 0.8); V.add.dot(p.x, p.y, p.z, 0.8, 1, 1, 1);
      for (let k = 0; k < 2; k++) { const an = D.spin + k * Math.PI; V.str.line(p.x + Math.cos(an) * 0.75, p.y, p.z + Math.sin(an) * 0.75, p.x + Math.cos(an - 0.9) * 0.75 - p.vx * 0.03, p.y - p.vy * 0.03, p.z + Math.sin(an - 0.9) * 0.75 - p.vz * 0.03, ...col); }
      if (Math.random() < 0.7) V.add.emit({ x: p.x, y: p.y, z: p.z, life: 0.25, s0: 0.9, s1: 0.1, c: col, ground: false });
    }
    for (const D of this.discs) if (!D.used) { D.g.visible = false; D.p = null; }
    // 迫击预警
    for (const M of this.marks) {
      if (!M.g.visible) continue; M.t += dt; const u = M.t / M.life;
      if (u >= 1) { M.g.visible = false; continue; }
      M.o1.scale.setScalar(M.r); M.o2.scale.setScalar(Math.max(0.1, M.r * (1 - u))); M.g.rotation.y += dt * 3;
      M.mat.opacity = 0.55 + 0.45 * Math.sin(t * (14 + u * 30));
    }
    if (sim) for (const p of sim.proj) if (p.kind === 'mortar' && !p.dead) { V.add.dot(p.x, p.y, p.z, 1.3, 1, 0.55, 0.25); if (Math.random() < 0.8) V.add.emit({ x: p.x, y: p.y, z: p.z, life: 0.35, s0: 0.8, s1: 0.1, c: [1, 0.6, 0.25], c1: [0.5, 0.1, 0.02], ground: false }); }
    // 黑洞
    const B = this.bh;
    if (B.g.visible) {
      B.t += dt;
      if (B.on) B.k = Math.min(1, B.k + dt * 2.2); else { B.collapseT = (B.collapseT || 0) + dt; B.k = Math.max(0, 1 - B.collapseT / 0.14); }
      if (B.k <= 0 && !B.on) B.g.visible = false;
      const k = B.k * (1 + 0.04 * Math.sin(t * 23)); const x = B.x, y = B.g.position.y, z = B.z;
      B.core.scale.setScalar(1.05 * k); B.halo.scale.setScalar(1.45 * k); B.lens.scale.setScalar(1.08 * k); B.lens.lookAt(V.camera.position);
      B.disk.scale.setScalar(k); B.disk2.scale.setScalar(0.72 * k); B.disk.rotation.z += dt * 2.2; B.disk2.rotation.z -= dt * 3.1;
      for (const m of [B.disk, B.disk2]) { m.material.uniforms.uT.value = t; m.material.uniforms.uA.value = B.k; }
      B.halo.material.uniforms.uA.value = B.k * (0.9 + 0.2 * Math.sin(t * 17));
      if (B.on) {
        for (const P of B.parts) {
          P.a += dt * P.w * (2.4 / Math.max(0.5, P.r)) * 3; P.r -= dt * (1.2 + 4.5 / Math.max(0.6, P.r)); P.h *= Math.exp(-dt * 1.8);
          if (P.r < 1.15) { Object.assign(P, this.bhPart()); P.has = false; continue; }
          const px = x + Math.cos(P.a) * P.r, py = y + P.h + Math.sin(P.a) * P.r * 0.38, pz = z + Math.sin(P.a) * P.r;
          const c = P.r < 2.2 ? [1, 0.95, 0.9] : B.col;
          if (P.has) V.str.line(P.px, P.py, P.pz, px, py, pz, c[0], c[1], c[2]); V.add.dot(px, py, pz, 0.3 + 0.25 / P.r, c[0], c[1], c[2], 0.9);
          P.px = px; P.py = py; P.pz = pz; P.has = true;
        }
        if (Math.random() < dt * 9) { const an = Math.random() * 6.283, r = rnd(3.5, 6); V.zap.spawn(new THREE.Vector3(x + Math.cos(an) * r, y + rnd(-1.5, 1.5), z + Math.sin(an) * r), new THREE.Vector3(x, y, z), lift(B.col, 0.4), { w: 0.25, depth: 1, branch: 0.25, rough: 0.22, levels: 4, life: 0.18, flick: 0.04 }); }
        if (Math.random() < dt * 14) V.dust(x + rnd(-3, 3), z + rnd(-3, 3), 1, 0.8);
        V.light(x, y, z, 16 + 6 * Math.sin(t * 20), new THREE.Color(...B.col).getHex());
      }
    }
    if (B.waveT >= 0) { B.waveT += dt; const u = B.waveT / 0.55; if (u >= 1) { B.wave.visible = false; B.waveT = -1; } else { B.wave.scale.setScalar(0.5 + 9 * (1 - (1 - u) ** 3)); B.wave.material.uniforms.uA.value = (1 - u) * 1.1; } }
    // 轨道炮
    const O = this.orb;
    if (O.st !== 'off') {
      O.t += dt;
      const f = sim && sim.f.find((q) => q.act && q.act.type === 'ult_orbital'); const st = f && f.act.data.orb;
      if (st) { O.x = st.tx; O.z = st.tz; }
      if (O.st === 'lock') {
        const u = Math.min(1, O.t / 1.4); const s = 4.6 - 1.8 * u; O.g.position.set(O.x, 0.08, O.z); O.g.scale.setScalar(s);
        O.arcs.rotation.y += dt * (2 + u * 8); O.cross.rotation.y -= dt * 1.5; O.mat.opacity = 0.6 + 0.4 * Math.sin(t * (10 + u * 40)); O.mat.color.setRGB(...lift(O.col, 0.1));
        O.aim.position.set(O.x, 0, O.z); O.aim.scale.set(0.05 + 0.04 * Math.sin(t * 60), 40, 0.05 + 0.04 * Math.sin(t * 60)); O.aim.material.color.setRGB(...O.col);
        if (Math.random() < 0.5) V.add.emit({ x: O.x + rnd(-s, s) * 0.5, y: 0.2, z: O.z + rnd(-s, s) * 0.5, vy: rnd(1, 3), life: 0.4, s0: 0.3, s1: 0.05, c: O.col, ground: false });
      } else if (O.st === 'fire' || O.st === 'fade') {
        O.w += ((O.st === 'fire' ? 1 : 0) - O.w) * Math.min(1, dt * (O.st === 'fire' ? 18 : 7));
        if (O.st === 'fade' && O.w < 0.02) { O.st = 'off'; O.pillar.visible = O.scorch.visible = O.g.visible = false; }
        const w = O.w * (2.6 + 0.25 * Math.sin(t * 47));
        O.pillar.position.set(O.x, 0, O.z); O.outerB.scale.set(w, 46, w); O.innerB.scale.set(w * 0.42, 46, w * 0.42);
        for (const m of [O.outerB, O.innerB]) { m.material.uniforms.uT.value = t; m.material.uniforms.uA.value = Math.min(1, O.w); }
        O.g.position.set(O.x, 0.08, O.z); O.g.scale.setScalar(2.8 + Math.sin(t * 30) * 0.2); O.mat.opacity = 0.8 * O.w; O.arcs.rotation.y += dt * 12;
        O.scorch.position.set(O.x, 0.06, O.z); O.scorch.scale.setScalar(3.4 * O.w + 0.6 * Math.sin(t * 25)); O.scorch.material.opacity = 0.55 * O.w; O.scorch.material.color.setRGB(...lift(O.col, 0.5));
        if (O.st === 'fire') {
          for (let k = 0; k < 3; k++) { const an = Math.random() * 6.283; V.str.emit(O.x + Math.cos(an) * 1.5, 0.3, O.z + Math.sin(an) * 1.5, Math.cos(an) * rnd(6, 16), rnd(4, 14), Math.sin(an) * rnd(6, 16), rnd(0.3, 0.6), lift(O.col, 0.4), 0.05); }
          if (Math.random() < dt * 10) V.explosion(O.x + rnd(-1.5, 1.5), 0.5, O.z + rnd(-1.5, 1.5), 0.7, { c: [1, 1, 1], c1: O.col });
          if (Math.random() < dt * 12) V.smk.emit({ x: O.x + rnd(-2, 2), y: 0.4, z: O.z + rnd(-2, 2), vx: rnd(-3, 3), vy: rnd(1, 3), vz: rnd(-3, 3), life: rnd(1, 1.6), s0: 1.2, s1: 3.5, c: [0.2, 0.19, 0.2], a: 0.45, ground: false, fadeIn: 0.1 });
          V.add.dot(O.x, 1, O.z, 6 + Math.sin(t * 40), ...lift(O.col, 0.5)); V.light(O.x, 2.5, O.z, 55 + 10 * Math.sin(t * 33), 0xffffff);
        }
      }
    }
    // 龙卷
    for (let s = 0; s < 2; s++) {
      const T = this.torn[s]; if (!T.g.visible) continue; T.t += dt;
      T.w += ((T.on ? 1 : 0) - T.w) * Math.min(1, dt * (T.on ? 6 : 9)); if (!T.on && T.w < 0.02) { T.g.visible = false; continue; }
      const f = T.f; if (!f) continue; T.g.position.set(f.x, f.y * 0.3, f.z);
      T.layers.forEach((m, k) => { m.rotation.y += dt * (k === 1 ? 9 : k === 2 ? -4 : 6); m.material.uniforms.uT.value = t; m.material.uniforms.uA.value = T.w * m.userData.a; m.scale.set(0.6 + 0.4 * T.w, 0.3 + 0.7 * T.w, 0.6 + 0.4 * T.w); });
      if (T.on) {
        for (const P of T.parts) {
          P.a += dt * (7 - P.h * 0.4) * P.s; P.h += dt * 3.2 * P.s; if (P.h > 7.4) { P.h = 0; P.has = false; }
          const r = (0.9 + P.h * 0.4) * (0.85 + 0.15 * Math.sin(P.a * 3)); const px = f.x + Math.cos(P.a) * r, py = P.h, pz = f.z + Math.sin(P.a) * r;
          const c = P.s > 1.1 ? T.col : [0.78, 0.8, 0.86];
          if (P.has) V.str.line(P.px, P.py, P.pz, px, py, pz, c[0], c[1], c[2]); V.add.dot(px, py, pz, 0.28, c[0], c[1], c[2], 0.85);
          P.px = px; P.py = py; P.pz = pz; P.has = true;
        }
        if (Math.random() < dt * 20) V.dust(f.x + rnd(-1.5, 1.5), f.z + rnd(-1.5, 1.5), 1, 1.1);
        if (Math.random() < dt * 4) { const h0 = rnd(1, 5); V.zap.spawn(new THREE.Vector3(f.x + rnd(-1, 1), h0, f.z + rnd(-1, 1)), new THREE.Vector3(f.x + rnd(-3, 3), h0 + rnd(-1, 2), f.z + rnd(-3, 3)), lift(T.col, 0.4), { w: 0.22, depth: 1, branch: 0.2, rough: 0.25, levels: 4, life: 0.16, flick: 0.04 }); }
        V.light(f.x, 2.5, f.z, 14, new THREE.Color(...T.col).getHex());
      }
    }
    // 千影：位移中高频留残影
    if (sim) for (let s = 0; s < 2; s++) {
      const f = sim.f[s]; const tr = (this.trails[s] = this.trails[s] || { t: 0, x: 0, z: 0 });
      if (!f || !f.act || f.act.type !== 'ult_phantom' || !f.act.data.ghost) { tr.t = 0; continue; }
      tr.t -= dt; const mv = Math.hypot(f.x - tr.x, f.z - tr.z);
      if (tr.t <= 0 && mv > 0.6) { tr.t = 0.04; tr.x = f.x; tr.z = f.z; const v = views.get(f); if (v) this.ghost(v, v.fxCol, 0.42, 0.85); }
    }
    const S = this.sigil;
    if (S.root.visible) { S.t += dt; const u = S.t / S.life; if (u >= 1) S.root.visible = false; else { S.g.rotation.z += dt * 1.2; S.hex.rotation.z -= dt * 2.4; const fi = Math.min(1, S.t / 0.25) * Math.min(1, (S.life - S.t) / 0.4); S.mat.opacity = 0.85 * fi * (0.8 + 0.2 * Math.sin(t * 20)); S.root.scale.setScalar(0.6 + 0.4 * Math.min(1, S.t / 0.3)); } }
    // 冰刺 / 冰封
    let ni = 0;
    for (let i = this.spikes.length - 1; i >= 0; i--) { const S2 = this.spikes[i]; S2.t += dt; if (S2.t >= S2.life + 0.25) this.spikes.splice(i, 1); }
    const putIce = (x, y, z, rx, ry, rz, sc) => { if (ni >= 260) return; _q.setFromEuler(_e.set(rx, ry, rz)); _m.compose(_v.set(x, y, z), _q, _s.set(sc * 0.8, sc, sc * 0.8)); this.ice.setMatrixAt(ni, _m); _m.compose(_v, _q, _s.multiplyScalar(1.12)); this.iceGlow.setMatrixAt(ni, _m); ni++; };
    for (const S2 of this.spikes) {
      const up = S2.t < 0.12 ? (S2.t / 0.12) * 1.15 : S2.t < 0.2 ? 1.15 - (S2.t - 0.12) / 0.08 * 0.15 : 1; const down = S2.t > S2.life ? 1 - (S2.t - S2.life) / 0.25 : 1;
      const sc = S2.k * up * Math.max(0, down); if (sc > 0.01) putIce(S2.x, -0.15, S2.z, S2.rx, S2.ry, S2.rz, sc);
    }
    if (this.encase) {
      const E = this.encase, o = E.o;
      for (const c of E.list) { c.t += dt; const g = Math.min(1, c.t / 0.14) * (c.t < 0.14 ? 1.1 : 1); putIce(o.x + c.dx, o.y - 0.2, o.z + c.dz, Math.sin(c.an) * c.tilt, c.an, -Math.cos(c.an) * c.tilt, c.s * g); }
      if (Math.random() < dt * 8) V.add.emit({ x: o.x + rnd(-1, 1), y: o.y + rnd(0.3, o.height), z: o.z + rnd(-1, 1), vy: rnd(0.2, 1), life: 0.6, s0: 0.35, s1: 0.05, c: ICE2, ground: false });
      if (!o.alive && E.list[0].t > 1.5) this.encase = null;
    }
    // 霜冻地面 / 寒光柱 / 冷光 / 施法者寒气
    for (const F of this.frosts) {
      if (!F.on) continue; F.t += dt; const u = F.t / F.life;
      if (u >= 1) { F.on = false; F.m.visible = false; continue; }
      const r = F.R * (1 - Math.exp(-F.t * 3.2)); const U = F.m.material.uniforms; U.uR.value = Math.max(0.05, r); U.uT.value = t; U.uC.value.setRGB(...ICE);
      U.uA.value = Math.min(1, F.t / 0.15) * (u > 0.75 ? (1 - u) / 0.25 : 1) * 0.85;
      if (!this.low && Math.random() < dt * 30) { const an = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r; V.smk.emit({ x: F.x + Math.cos(an) * rr, y: 0.15, z: F.z + Math.sin(an) * rr, vx: rnd(-0.6, 0.6), vy: rnd(0.05, 0.3), vz: rnd(-0.6, 0.6), life: rnd(1.4, 2.4), s0: 1.2, s1: 3.2, c: [0.82, 0.93, 1], a: 0.3, ground: false, fadeIn: 0.25 }); }
      if (Math.random() < dt * 22) { const an = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r; V.add.emit({ x: F.x + Math.cos(an) * rr, y: rnd(0.2, 2.5), z: F.z + Math.sin(an) * rr, vy: rnd(0.2, 0.9), life: rnd(0.6, 1.2), s0: 0.2, s1: 0.03, c: [1, 1, 1], c1: ICE, ground: false }); }
    }
    if (this.cpT >= 0) {
      this.cpT += dt; const P = this.coldPillar; const life = this.cpFade ? 0.9 : 2.4; const u = this.cpT / life;
      if (u >= 1 && this.cpFade) { this.cpT = -1; this.cpFade = false; P.visible = false; }
      else { P.visible = true; const U = P.material.uniforms; U.uT.value = t; U.uC.value.setRGB(...ICE); U.uA.value = Math.min(1, this.cpT / 0.12) * (this.cpFade ? Math.max(0, 1 - u) : 1) * 0.5; P.scale.set(1 + Math.sin(t * 9) * 0.04, Math.min(1, this.cpT / 0.2), 1 + Math.sin(t * 9) * 0.04); }
    }
    { const G = this.glc; const f = G.f;
      if (G.on && f) {
        G.t += dt; if (!f.act || f.act.type !== 'ult_glacier' || !f.alive) G.on = false;
        else {
          // 施法蓄力：寒气螺旋向双拳汇聚 + 脚下霜环
          if (G.t < 0.55) { for (let k = 0; k < 3; k++) { const an = Math.random() * 6.283, rr = rnd(1.8, 3.2); V.add.emit({ x: f.x + Math.cos(an) * rr, y: rnd(0.3, f.height), z: f.z + Math.sin(an) * rr, vx: -Math.cos(an) * rr * 2.6, vy: rnd(0.5, 2), vz: -Math.sin(an) * rr * 2.6, life: 0.38, s0: 0.35, s1: 0.08, c: ICE, c1: [1, 1, 1], ground: false }); } this.coldI = Math.max(this.coldI, 10 + G.t * 40); }
          if (Math.random() < dt * 14) V.smk.emit({ x: f.x + rnd(-1, 1), y: rnd(0.3, f.height * 0.8), z: f.z + rnd(-1, 1), vx: rnd(-0.8, 0.8), vy: rnd(-0.3, 0.3), vz: rnd(-0.8, 0.8), life: rnd(1, 1.8), s0: 0.8, s1: 2.6, c: [0.82, 0.93, 1], a: 0.35, ground: false, fadeIn: 0.15 });
          this.coldLight.position.set(f.x, 2.5, f.z);
          const I = f.act.data.ice; if (I && I.st === 'wave') { const hx = I.x0 + I.ux * I.s, hz = I.z0 + I.uz * I.s; this.coldLight.position.set(hx, 2, hz); this.coldI = Math.max(this.coldI, 26); }
        }
      }
      if (this.encase && this.encase.o) this.coldLight.position.set(this.encase.o.x, 3, this.encase.o.z);
      this.coldI *= Math.exp(-dt * (G.on || this.encase ? 1.2 : 4)); if (G.on || this.encase) this.coldI = Math.max(this.coldI, 14);
      this.coldLight.intensity = this.coldI;
    }
    this.ice.count = ni; this.iceGlow.count = ni; if (ni) { this.ice.instanceMatrix.needsUpdate = true; this.iceGlow.instanceMatrix.needsUpdate = true; }
  }

  // 施法者被 KO / 动作被强制结束：持续型特效收尾（不再残留）
  stopAll() {
    const B = this.bh; if (B.on) { B.on = false; B.collapseT = 0; }
    const O = this.orb; if (O.st === 'lock') { O.st = 'off'; O.g.visible = O.aim.visible = false; } else if (O.st === 'fire') { O.st = 'fade'; O.t = 0; }
    this.torn.forEach((T) => (T.on = false));
    this.marks.forEach((M) => (M.g.visible = false));
  }
  stopFor(type, i) {
    if (type === 'ult_blackhole' && this.bh.on) { this.bh.on = false; this.bh.collapseT = 0; }
    else if (type === 'ult_orbital') { const O = this.orb; if (O.st === 'lock') { O.st = 'off'; O.g.visible = O.aim.visible = false; } else if (O.st === 'fire') { O.st = 'fade'; O.t = 0; } }
    else if (type === 'ult_tornado' && this.torn[i]) this.torn[i].on = false;
  }
  // 新一局：清空所有持续特效
  reset() {
    this.ghosts.forEach((G) => (G.root.visible = false)); this.ghosts.length = 0;
    for (const v of [...this.ghostPools.keys()]) this.dropView(v);
    this.bh.g.visible = false; this.bh.on = false; this.bh.wave.visible = false; this.bh.waveT = -1;
    const O = this.orb; O.st = 'off'; O.g.visible = O.pillar.visible = O.scorch.visible = O.aim.visible = false;
    this.torn.forEach((T) => { T.on = false; T.w = 0; T.g.visible = false; });
    this.marks.forEach((M) => (M.g.visible = false)); this.spikes.length = 0; this.encase = null; this.sigil.root.visible = false;
    this.frosts.forEach((F) => { F.on = false; F.m.visible = false; }); this.cpT = -1; this.cpFade = false; this.coldPillar.visible = false; this.glc.on = false; this.coldI = 0; this.coldLight.intensity = 0;
  }
}
