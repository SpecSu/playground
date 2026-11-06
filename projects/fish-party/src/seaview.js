// 海底剖面视角（Sea Cutaway）：抛竿后镜头拉远——画面上方一条是水面上的小船（主场景远景），下方是水族箱同款珊瑚礁剖面。
// 鱼钩 / 鱼饵在剖面里下沉；十几种「缩小版」的鱼分层游动、海底有螃蟹龙虾慢慢爬、偶尔一群银色小鱼游过；
// 几条好奇的鱼过来逗一下鱼饵又走了，最后那条（= 预抽的真实钓获）游过来咬钩；搏鱼时直接看见它被一点点拉近、拉上水面。
// 渲染：剖面场景画进离屏 RT（线性 HDR），再用一个全屏合成 pass 叠到主画面下半部（波浪水线 + 水线高光 + ACES/sRGB 输出）。
// 对外：createSeaView({ renderer }) → { begin, event, update, render, resize, prewarm, cancel, get on, get camK, get edge, frame }
import * as THREE from 'three';
import { Fish, FISH_STYLE, SPECIES, makeVariant } from './fishes.js';
import { buildEnv, W, aqMat, aqInject, FLOOR_Y, floorAt, AQ_Q } from './aqua_env.js';
import { themeOf } from './aqua_themes.js';
import { causFish, fishEnvTex } from './aquarium.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { anchorsPlus } from './parts.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, sstep = THREE.MathUtils.smoothstep;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const angTo = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

const THEME = 'reef';
const FOV = 50, TANH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const CAM = V(0, 1.55, 11.5), LOOK = V(0, 0.55, 0);   // 剖面机位：比水族箱略远、略高，看得到「水面 → 海底」整段水柱
// 物种分组：海底爬行 / 漂浮 / 其余游泳
const BOTTOM = new Set(['snow-crab', 'king-crab', 'lobster', 'starfish', 'flounder', 'mantis-shrimp', 'octopus']);
const DRIFT = new Set(['jellyfish', 'seahorse']);
const POOL_N = [11, 16, 20];        // 每档同屏鱼数（low / medium / high）
const SCHOOL_N = [26, 38, 52];     // 银色小鱼群条数

// 剖面里的显示体长（比水族箱更小、尺寸差压缩）：小丑鱼 ≈0.3 · 金枪鱼 ≈1 · 鲸鲨 ≈1.6（放到最远处）
function seaLen(v) { return clamp(0.3 * Math.pow(Math.max(6, v.cm || 30) / 12, 0.5), 0.2, 1.6); }

function canvasTex(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function createSeaView({ renderer }) {
  const scene = new THREE.Scene();
  const th = themeOf(THEME);
  scene.fog = new THREE.FogExp2(new THREE.Color(th.water.hor), th.water.den * 0.3);
  const camera = new THREE.PerspectiveCamera(FOV, 0.46, 0.1, 140);
  camera.position.copy(CAM); camera.lookAt(LOOK);
  const uPx = { value: 400 };
  const hwAt = (z) => Math.max(0.6, (CAM.z - z) * TANH * Math.max(0.42, camera.aspect));

  // ---------------- 灯光（同水族箱 · 热带珊瑚礁主题） ----------------
  const L = th.light;
  const hemi = new THREE.HemisphereLight(L.sky, L.gnd, L.hemi); scene.add(hemi);
  const key = new THREE.DirectionalLight(L.key, L.keyI); key.position.set(2.5, 10, 3); scene.add(key);
  const fill = new THREE.DirectionalLight(L.fill, L.fillI); fill.position.set(-1, 2, 10); scene.add(fill);
  const rim = new THREE.DirectionalLight(L.rim, L.rimI); rim.position.set(-3, 4, -8); scene.add(rim);

  let env = null, fishEnv = null, built = false, warmP = null;
  const world = new THREE.Group(); scene.add(world);

  // ---------------- 水面（从水下仰视）：亮青色波纹天花板，远处融进水色 ----------------
  const surfU = { uT: W.uT, uTop: W.uWTop, uHor: W.uWHor, uSun: W.uSun, uHull: { value: new THREE.Vector3(0, 0, 0) } };
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(90, 60, 1, 1).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: surfU, fog: false, depthWrite: false, transparent: true,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uT; uniform vec3 uTop, uHor, uSun, uHull; varying vec3 vW;
      float rp(vec2 p){ return sin(p.x * 2.1 + uT * 0.9 + sin(p.y * 1.7 + uT * 0.6) * 1.6) * sin(p.y * 2.6 - uT * 0.7 + sin(p.x * 1.3) * 1.2); }
      void main(){
        vec3 toC = cameraPosition - vW; float d = length(toC);
        vec2 p = vW.xz;
        float r1 = rp(p * 1.1), r2 = rp(p * 2.3 + 7.0);
        float lines = pow(1.0 - abs(r1 * 0.6 + r2 * 0.4), 9.0);
        vec3 base = mix(uTop * 1.18, vec3(0.86, 0.98, 1.0), 0.18);
        vec3 col = base + vec3(0.9, 1.0, 1.0) * lines * 0.55 + uSun * 0.12;
        // 船底在水面投下的影子（仰视时船的轮廓）
        float hs = smoothstep(uHull.y + 0.5, uHull.y - 0.2, abs(vW.x - uHull.x)) * smoothstep(3.5, 0.8, abs(vW.z)) * uHull.z;
        col *= 1.0 - hs * 0.35;
        float fade = exp(-max(d - 5.0, 0.0) * 0.11);
        gl_FragColor = vec4(col, fade * 0.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  surf.renderOrder = -5; surf.frustumCulled = false; scene.add(surf);
  let S = 4.3;   // 水面高度（每帧由合成水线位置反算）

  // ---------------- 船底剖面：水线以下的船体（与上方远景里的船左右对齐） ----------------
  const hullShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0.05); s.lineTo(0.5, 0.05); s.lineTo(0.5, -0.12);
    s.bezierCurveTo(0.48, -0.62, 0.22, -0.98, 0, -1.0); s.bezierCurveTo(-0.22, -0.98, -0.48, -0.62, -0.5, -0.12); s.closePath();
    return s;
  })();
  const hullG = new THREE.ExtrudeGeometry(hullShape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 3, curveSegments: 16 }); hullG.translate(0, 0, -0.25);
  { const P = hullG.attributes.position, cols = new Float32Array(P.count * 3), cw = new THREE.Color('#e9e6e0'), cr = new THREE.Color('#e88a8e'), cs = new THREE.Color('#7fc6d6');
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); const c = y > -0.16 ? cw : y > -0.22 ? cs : cr; cols.set([c.r, c.g, c.b], i * 3); }
    hullG.setAttribute('color', new THREE.BufferAttribute(cols, 3)); }
  const hullM = aqMat({ vertexColors: true, roughness: 0.6 }, { caus: 0.6 });
  const hull = new THREE.Mesh(hullG, hullM); hull.visible = false; world.add(hull);
  const keel = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.56), aqMat({ color: '#ef8c96', roughness: 0.6 }, {})); keel.visible = false; world.add(keel);

  // ---------------- 钓组：鱼线 + 铅坠 + 鱼钩 + 鱼饵 ----------------
  const lineM = new THREE.MeshBasicMaterial({ color: '#f6fcff', transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const line = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0), lineM); line.frustumCulled = false; line.visible = false; world.add(line);
  // v2.3 等待时的鱼线：松弛下垂的曲线（每帧改顶点，不重建几何）；搏鱼时切回绷直的 line
  const SLN = 28, SLR = 5;
  const slackG = new THREE.TubeGeometry(new THREE.LineCurve3(V(0, 0, 0), V(0, 1, 0)), SLN, 0.0065, SLR, false);
  const slack = new THREE.Mesh(slackG, lineM); slack.frustumCulled = false; slack.visible = false; world.add(slack);
  const _qb = new THREE.QuadraticBezierCurve3(V(), V(), V()), _sp = V(), _st = V(), _sn = V(), _sb = V(), _sv = V();
  function setSlack(p0, p1, sag, sway) {
    _qb.v0.copy(p1); _qb.v2.copy(p0);                       // 从水面入水点 → 鱼饵
    _qb.v1.lerpVectors(p0, p1, 0.5); _qb.v1.y -= sag; _qb.v1.x += sway;
    const P = slackG.attributes.position;
    for (let i = 0; i <= SLN; i++) {
      const u = i / SLN;
      _qb.getPoint(u, _sp); _qb.getTangent(u, _st);
      _sn.set(-_st.y, _st.x, 0).normalize(); _sb.crossVectors(_st, _sn).normalize();
      for (let j = 0; j <= SLR; j++) {
        const a = (j / SLR) * Math.PI * 2, c = Math.cos(a) * 0.0065, s = Math.sin(a) * 0.0065;
        _sv.copy(_sp).addScaledVector(_sn, c).addScaledVector(_sb, s);
        P.setXYZ(i * (SLR + 1) + j, _sv.x, _sv.y, _sv.z);
      }
    }
    P.needsUpdate = true;
  }
  const rig = new THREE.Group(); rig.visible = false; world.add(rig);
  const metal = new THREE.MeshStandardMaterial({ color: '#dfe7ee', metalness: 1, roughness: 0.28 });
  // v2.6 鱼钩重新建模：钩眼（系线圈）→ 钩柄 → 弯钩 → 钩尖 + 倒刺。rig 原点 = 钩眼（鱼线系在这里），HOOK_BITE = 弯钩内侧（挂在鱼嘴上的那一点）
  const HOOK_BITE = V(-0.04, -0.192, 0);
  {
    class HookArc extends THREE.Curve { getPoint(u, out = V()) { const a = -Math.PI * u; return out.set(-0.042 + 0.042 * Math.cos(a), -0.165 + 0.042 * Math.sin(a), 0); } }
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(V(0, -0.015, 0), V(0, -0.165, 0)));
    path.add(new HookArc());
    path.add(new THREE.LineCurve3(V(-0.084, -0.165, 0), V(-0.079, -0.116, 0)));
    const body = new THREE.Mesh(new THREE.TubeGeometry(path, 56, 0.0062, 8, false), metal); rig.add(body);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0046, 8, 22), metal); eye.position.set(0, -0.0015, 0); rig.add(eye);
    const tipDir = V(0.005, 0.049, 0).normalize();
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0064, 0.03, 10), metal);
    tip.quaternion.setFromUnitVectors(V(0, 1, 0), tipDir); tip.position.set(-0.079, -0.116, 0).addScaledVector(tipDir, 0.015); rig.add(tip);
    const barbDir = V(0.55, -1, 0).normalize();   // 倒刺：钩尖内侧斜向下
    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.022, 8), metal);
    barb.quaternion.setFromUnitVectors(V(0, 1, 0), barbDir); barb.position.set(-0.0745, -0.103, 0).addScaledVector(barbDir, 0.009); rig.add(barb);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), new THREE.MeshStandardMaterial({ color: '#ff7a6b', roughness: 0.35, emissive: '#ff5a4a', emissiveIntensity: 0.25 }));
    bead.position.set(0, 0.03, 0); rig.add(bead);   // 钩眼上方一颗小红珠（子线结）
  }
  const leader = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5, 1, true).translate(0, 0.5, 0), lineM);   // 铅坠 → 鱼钩的子线
  leader.position.set(0, 0.012, 0); leader.scale.set(1, 0.27, 1); rig.add(leader);
  const sinker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), aqMat({ color: '#7f8b96', roughness: 0.4, metalness: 0.6 }, { fish: true })); sinker.position.y = 0.32; rig.add(sinker);
  const wormCurve = new THREE.CatmullRomCurve3([V(0.03, -0.035, 0.012), V(0.012, -0.085, 0), V(0.016, -0.14, 0.01), V(-0.02, -0.2, 0), V(-0.066, -0.196, 0.01), V(-0.092, -0.15, 0), V(-0.118, -0.19, 0.015), V(-0.105, -0.235, 0.02)]);   // v2.6：穿在新鱼钩上（钩尖露一点）
  const worm = new THREE.Mesh(new THREE.TubeGeometry(wormCurve, 24, 0.028, 7, false), aqMat({ color: '#ff8f86', roughness: 0.45, emissive: '#ff6a5c', emissiveIntensity: 0.25 }, { fish: true }));
  rig.add(worm);
  const baitGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,220,.9)'); gr.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  baitGlow.scale.setScalar(0.55); baitGlow.position.y = -0.14; rig.add(baitGlow);
  const rigP = V(), entry = V(), mouth = V(), baitP = V(), hookW = V(), mouthW = V(), _hk = V();
  let rigS = 1, rigRot = 0;   // v2.6：鱼钩缩放 / 转角（每帧先算好，鱼按它对齐嘴，最后统一摆放）
  const _a = V(), _b = V(), _q = new THREE.Quaternion(), _up = V(0, 1, 0);
  function segment(m, p0, p1, r) {
    _a.subVectors(p1, p0); const len = _a.length();
    if (len < 1e-4) { m.visible = false; return; }
    m.position.copy(p0); m.quaternion.setFromUnitVectors(_up, _a.multiplyScalar(1 / len)); m.scale.set(r, len, r);
  }

  // ---------------- 银色小鱼群（InstancedMesh · 金属鳞光 · 顶点甩尾） ----------------
  const schoolN = SCHOOL_N[AQ_Q] || 38;
  const sGeo = (() => {
    const body = new THREE.SphereGeometry(0.5, 12, 8); body.scale(1, 0.26, 0.13);
    const tail = new THREE.BufferGeometry();
    tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.42, 0, 0, -0.68, 0.17, 0, -0.68, -0.17, 0, -0.42, 0, 0, -0.68, -0.17, 0, -0.68, 0.17, 0], 3));
    tail.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    tail.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2));
    const b = body.toNonIndexed(); b.deleteAttribute('uv'); b.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(b.attributes.position.count * 2), 2));
    const g = mergeGeometries([b, tail]); g.computeBoundingSphere(); return g;
  })();
  const sMat = new THREE.MeshStandardMaterial({ color: '#d9e6ee', metalness: 0.82, roughness: 0.26, envMapIntensity: 1.25 });
  sMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n');
    aqInject(sh, { fish: true });
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `{ float ph = float(gl_InstanceID) * 1.731; float k = clamp(0.5 - position.x, 0.0, 1.2);
      transformed.z += sin(uT * 13.0 + ph - position.x * 7.0) * 0.07 * k; }
      #include <project_vertex>`);
  };
  sMat.customProgramCacheKey = () => 'seaSchool1';
  const school = new THREE.InstancedMesh(sGeo, sMat, schoolN); school.frustumCulled = false; school.visible = false; world.add(school);
  const sOff = Array.from({ length: schoolN }, () => ({ o: V(rand(-1, 1) * 1.3, rand(-1, 1) * 0.45, rand(-1, 1) * 0.6), ph: rand(0, 6.28), s: rand(0.15, 0.22), yj: rand(-0.12, 0.12) }));
  const sc = { on: false, x: 0, y: 0, z: 0, dir: 1, sp: 1.6, t: 0, next: 1.4 };
  const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _s = V();
  function spawnSchool() {
    sc.on = true; sc.dir = Math.random() < 0.5 ? 1 : -1; sc.z = rand(-4.5, 0.4); sc.y = rand(-1.2, S - 1.4); sc.t = 0;
    sc.x = -sc.dir * (hwAt(sc.z) + 2.2); sc.sp = rand(1.4, 2.0); school.visible = true;
  }
  function updateSchool(dt, t) {
    sc.next -= dt;
    if (!sc.on) { if (sc.next <= 0) spawnSchool(); else return; }
    sc.t += dt; sc.x += sc.dir * sc.sp * dt;
    const yy = sc.y + Math.sin(sc.t * 0.7) * 0.35;
    for (let i = 0; i < schoolN; i++) {
      const m = sOff[i];
      const w = Math.sin(t * 1.3 + m.ph);
      _s.set(sc.x + m.o.x + Math.sin(t * 0.9 + m.ph * 2) * 0.12, yy + m.o.y + w * 0.08 + Math.sin(sc.x * 0.8 + m.ph) * 0.18, sc.z + m.o.z);
      _e.set(0, (sc.dir > 0 ? 0 : Math.PI) + m.yj + w * 0.08, Math.cos(t * 1.3 + m.ph) * 0.08);
      _q.setFromEuler(_e); _m.compose(_s, _q, V(m.s, m.s, m.s)); school.setMatrixAt(i, _m);
    }
    school.instanceMatrix.needsUpdate = true;
    if (Math.abs(sc.x) > hwAt(sc.z) + 2.6 && sc.t > 1) { sc.on = false; school.visible = false; sc.next = rand(8, 15); }
  }

  // ---------------- 鱼 ----------------
  const ents = [];          // { f, v, L, H, k0, pos, dir, yaw, speed, lane, z, mode, t, kind, ph }
  let target = null;        // 预抽的真实钓获（会来咬钩的那条）
  function makeFish(v) {
    const prev = FISH_STYLE.outline; FISH_STYLE.outline = false;
    let f; try { f = new Fish(v, null); } finally { FISH_STYLE.outline = prev; }
    const rm = []; f.root.traverse((o) => { if (o.userData.isOutline || o.userData.outline) rm.push(o); }); rm.forEach((o) => o.parent?.remove(o));
    if (!fishEnv) fishEnv = fishEnvTex(renderer);
    causFish(f.root, 0.65, fishEnv, th.fish?.env ?? 0.9);
    return f;
  }
  function fitFish(f, Lw) {
    if (typeof f.fitTank !== 'function') { f.setScale(Lw); return { L: f.len || Lw, H: f.h || Lw * 0.4 }; }
    f.fitTank(Lw);
    const span = Math.max(f.len || 0, f.w || 0, 1e-3), h = Math.max(f.h || 0, 1e-3);
    const vert = h > span * 1.25;
    let r = vert ? Lw / h : Lw / span;
    r = Math.min(r, (Lw * 0.8) / h, Math.max(0.9, Lw * 0.55) / h);
    f.root.scale.multiplyScalar(r);
    f.len *= r; f.h *= r; f.w *= r;
    return { L: Math.max(f.len, vert ? f.h * 0.6 : 0), H: f.h };
  }
  const zRange = (Lw, kind) => kind === 'bottom' ? [-2.4, 1.6] : Lw > 1.1 ? [-11, -5.5] : Lw > 0.65 ? [-6.5, -1.2] : [-3.6, 1.6];
  function yRange(e) { const lo = (e.kind === 'bottom' ? floorAt(e.pos.x, e.z) : FLOOR_Y + 0.75) + e.H * 0.5, hi = S - 0.7 - e.H * 0.5 - (e.L > 0.9 ? 0.4 : 0); return [lo, Math.max(lo + 0.2, hi)]; }
  function laneFor(e) { const [lo, hi] = yRange(e); return e.kind === 'bottom' ? lo : lerp(lo, hi, Math.pow(Math.random(), 0.62)); }   // 偏上：水柱上半段也有鱼
  function addEnt(v, opts = {}) {
    const f = makeFish(v);
    const Lw = opts.L || seaLen(v);
    const { L: Ls, H } = fitFish(f, Lw);
    const kind = BOTTOM.has(v.sp) ? 'bottom' : DRIFT.has(v.sp) ? 'drift' : 'swim';
    const [z0, z1] = zRange(Ls, kind);
    const e = { f, v, L: Ls, H, k0: f.root.scale.x, pos: V(), dir: Math.random() < 0.5 ? 1 : -1, yaw: 0, pitch: 0, kind, ph: rand(0, 6.28), t: 0, mode: 'swim', z: rand(z0, z1), cool: rand(2, 6) };
    e.speed = kind === 'bottom' ? rand(0.07, 0.16) : kind === 'drift' ? rand(0.08, 0.16) : lerp(0.6, 0.3, clamp((Ls - 0.3) / 1.2, 0, 1)) * rand(0.8, 1.2);
    e.pos.z = e.z;
    if (opts.offscreen) e.pos.x = -e.dir * (hwAt(e.z) + Ls + 0.5); else e.pos.x = rand(-1, 1) * hwAt(e.z) * 0.95;
    e.lane = laneFor(e); e.pos.y = e.lane;
    e.yaw = e.dir > 0 ? 0 : Math.PI;
    world.add(f.root); place(e, 0);
    return e;
  }
  // v2.6 鱼嘴锚点（鱼的本地坐标，未缩放）：临时把鱼摆回原点，用部件射线找鼻尖（嘴部高度），往里收一点 = 嘴角
  function mouthLocal(e) {
    if (e.mouthL) return e.mouthL;
    const f = e.f, r = f.root, bd = f.body;
    const P = r.position.clone(), Q = r.quaternion.clone(), Sc = r.scale.clone(), BP = bd.position.clone(), BQ = bd.quaternion.clone();
    r.position.set(0, 0, 0); r.quaternion.identity(); r.scale.set(1, 1, 1); bd.position.set(0, 0, 0); bd.quaternion.identity();
    const par = r.parent; if (par) par.remove(r);
    r.updateMatrixWorld(true);
    let m = null;
    try { const A = f.anchors?.nose ? f.anchors : anchorsPlus(f); if (A?.nose) { m = A.nose.clone(); m.x -= (f.len0 || 1) * 0.025; m.z = 0; } } catch (err) { m = null; }
    if (!m) { const b = f.b0 || new THREE.Box3().setFromObject(f.model); m = V(b.max.x - (b.max.x - b.min.x) * 0.03, (b.min.y + b.max.y) * 0.45, 0); }
    if (par) par.add(r);
    r.position.copy(P); r.quaternion.copy(Q); r.scale.copy(Sc); bd.position.copy(BP); bd.quaternion.copy(BQ);
    r.updateMatrixWorld(true);
    return (e.mouthL = m);
  }
  function mouthWorld(e, out) { e.f.root.updateMatrixWorld(true); return out.copy(mouthLocal(e)).applyMatrix4(e.f.root.matrixWorld); }
  // 鱼钩「挂嘴点」的世界坐标（由钩眼位置 rigP + 当前转角 / 缩放推出）
  function hookBiteW(out) { return out.copy(HOOK_BITE).multiplyScalar(rigS).applyAxisAngle(_zAx, rigRot).add(rigP); }
  const _zAx = V(0, 0, 1);
  function place(e, dt) {
    const f = e.f;
    f.root.position.copy(e.pos);
    f.root.rotation.set(0, e.yaw + (e.mode === 'hooked' || e.mode === 'bite' ? 0 : Math.sin(e.t * 0.6 + e.ph) * 0.12), e.pitch);
    if (e.mode === 'hooked' || e.mode === 'bite') {
      f.update(dt, 'fight');
      // v2.6：挣扎时身体的甩动以「嘴」为支点（鱼头被鱼钩拽住，甩的是身子和尾巴）→ 嘴和鱼钩不再有相对运动
      const m = mouthLocal(e);
      f.body.position.copy(m).sub(_hk.copy(m).applyQuaternion(f.body.quaternion));
      e.pinned = true;
    } else {
      if (e.pinned) { f.body.position.set(0, 0, 0); e.pinned = false; }
      if (typeof f.animate === 'function') f.animate(dt, { mode: 'swim' }); else f.update(dt, 'swim');
    }
  }
  function removeEnt(e) { const i = ents.indexOf(e); if (i >= 0) ents.splice(i, 1); e.f.dispose(); if (target === e) target = null; }

  // 每次抛竿换一批：保留 ~1/3 老面孔，其余从 40 种里重新抽（尽量不重复物种）
  const queue = [];
  function repopulate() {
    const n = POOL_N[AQ_Q] || 13;
    const keep = ents.filter((e) => e !== target).sort(() => Math.random() - 0.5).slice(0, Math.round(n * 0.35));
    for (const e of [...ents]) if (e !== target && !keep.includes(e)) removeEnt(e);
    const have = new Set(ents.map((e) => e.v.sp));
    const pool = SPECIES.filter((s) => !s.odd && !have.has(s.id)).sort(() => Math.random() - 0.5);
    queue.length = 0;
    let bottoms = ents.filter((e) => e.kind === 'bottom').length;
    for (const sp of pool) {
      if (ents.length + queue.length >= n) break;
      if (BOTTOM.has(sp.id) && bottoms >= 2) continue;
      if (BOTTOM.has(sp.id)) bottoms++;
      queue.push({ v: makeVariant(sp, 0) });
    }
  }
  // 建鱼拆帧：每帧最多 ~6ms；新鱼先放在画面里（幕布升起前就位），之后补位的从屏幕外游进来
  function pumpQueue(offscreen) {
    const t0 = performance.now();
    // 分散预加载，帧耗时阈值调低，防止丢帧卡顿
    while (queue.length && performance.now() - t0 < 4.5) {
      const q = queue.shift();
      try { const e = addEnt(q.v, { offscreen }); ents.push(e); compileObj(e.f.root); } catch (err) { console.warn('sea fish', err); }
    }
  }
  function compileObj(o) {
    const prev = renderer.getRenderTarget(), sh = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false; renderer.setRenderTarget(rt);
    try { renderer.compileAsync ? renderer.compileAsync(o, camera, scene).catch(() => {}) : renderer.compile(o, camera, scene); } catch (e) { /* 首次绘制时再编 */ }
    finally { renderer.setRenderTarget(prev); renderer.shadowMap.enabled = sh; }
  }

  // ---------------- 离屏 RT + 合成 ----------------
  let rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: AQ_Q >= 1 ? 4 : 0 });
  const compU = { tSea: { value: rt.texture }, uEdge: { value: -0.1 }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uBright: { value: 0 } };
  const comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: compU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tSea; uniform float uEdge, uT, uBright; uniform vec2 uRes; varying vec2 vUv;
      void main(){
        float x = vUv.x * uRes.x / 390.0;
        float wv = (sin(x * 14.0 + uT * 1.7) * 2.6 + sin(x * 33.0 - uT * 2.4) * 1.1 + sin(x * 6.0 - uT * 0.9) * 1.6) / uRes.y;
        float px = (uEdge + wv - vUv.y) * uRes.y;          // 水线以下的像素数（>0 = 水下）
        if (px < -1.0) discard;
        vec3 c = texture2D(tSea, vUv).rgb;
        c += vec3(0.82, 0.97, 1.0) * (smoothstep(4.5, 0.5, px) * 1.1 + exp(-max(px, 0.0) / 26.0) * 0.16);   // 水线高光 + 水面下的一层亮
        c = mix(c, c * 1.3 + vec3(0.035, 0.08, 0.1), uBright);   // v2.2：鱼被拉近水面 → 水体越来越亮、越来越通透
        c *= 1.0 - 0.18 * smoothstep(0.35, 1.0, abs(vUv.x - 0.5) * 2.0);                                    // 两侧轻暗角
        gl_FragColor = vec4(c, clamp(px + 1.0, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  comp.frustumCulled = false;
  const compScene = new THREE.Scene(); compScene.add(comp);
  const compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let Wpx = 1, Hpx = 1;
  function resize(Wd, Hd) {
    Wpx = Wd; Hpx = Hd;
    camera.aspect = Wd / Math.max(1, Hd); camera.updateProjectionMatrix();
    const dpr = renderer.getPixelRatio();
    rt.setSize(Math.max(1, Math.round(Wd * dpr)), Math.max(1, Math.round(Hd * dpr)));
    compU.uRes.value.set(Wd, Hd);
    uPx.value = Hd * dpr / (2 * TANH);
  }

  // ---------------- 状态 ----------------
  let on = false, phase = 'off', t = 0, camK = 0, curtain = 0, edge = 0.27, exitT = 0;
  let sinkT = 0, depth0 = 2, hookDepth = 2, entryX = 0, hullX = [0, 0], lastNib = -1, curiousT = 0, jumpHide = false, hookedY0 = 0, fleeT = 0;
  const frame = { edgeFy: 0.27, entryNdcX: 0, hullNdc: null };
  const camS = V(CAM.x, CAM.y, CAM.z);   // 平滑后的剖面机位
  let camF = FOV, camLY = LOOK.y;        // 平滑后的 FOV / 视线高度
  let Slock = null;                      // v2.2 搏鱼时锁定水面高度 → 镜头上浮才是真的「靠近水面 / 船」，海底真的越离越远
  let bright = 0;                        // v2.2 越接近水面水体越亮（0~1）
  let baitGone = false;                  // v2.2 鱼饵被叼走
  const drift = V(), driftV = V();       // v2.3 摇杆漂鱼饵：相对落点的偏移（米）+ 速度（带惯性）
  let slackK = 0;                        // 0 = 绷直，1 = 松弛
  let reelOut = null;                    // v2.4 空钩收线：{ t, from } —— 鱼钩快速收回水面的过渡动画（之前是直接消失）
  const probeQ = [];                     // v2.2 待建模的试探大鱼
  let fresh = false;                     // 鱼群已在空闲时换好一批（下次抛竿不用再现场建）   // main.js 每帧写入（主镜头投影结果）

  function ensureBuilt() {
    if (built) return;
    built = true;
    fishEnv = fishEnv || fishEnvTex(renderer);
    env = buildEnv(THEME, { hwAt, uPx });
    env.group.traverse((o) => { if (o.renderOrder === 20) o.visible = false; });   // 水族箱的前景剪影卡片（贴镜头的模糊海草）在剖面里会显成脏暗条
    world.add(env.group);
    sMat.envMap = fishEnv; metal.envMap = fishEnv; metal.envMapIntensity = 1.2; metal.needsUpdate = true;
  }
  // 开局后空闲时预建 + 预编译（避免第一次抛竿卡顿）；之后切换主题回来时 activate 恢复 uniforms
  function prewarm() {
    if (warmP) return warmP;
    ensureBuilt();
    if (!ents.length && !queue.length) { repopulate(); fresh = true; }   // 首批鱼由 idle() 在开屏 / 甲板上空闲时建好
    const prev = renderer.getRenderTarget(), sh = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false; renderer.setRenderTarget(rt);
    hull.visible = keel.visible = rig.visible = line.visible = school.visible = true;
    try { warmP = renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : Promise.resolve(renderer.compile(scene, camera)); }
    catch (e) { warmP = Promise.resolve(); }
    finally { renderer.setRenderTarget(prev); renderer.shadowMap.enabled = sh; hull.visible = keel.visible = rig.visible = line.visible = school.visible = false; }
    return warmP;
  }

  // 不在剖面时（甲板上走动 / 抱鱼炫耀）后台慢慢建下一批鱼：每帧 ≤3ms，避免抛竿 / 入水那一刻卡顿
  function idle() {
    if (on || !built || !queue.length) return;
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 3) {
      const q = queue.shift();
      try { const e = addEnt(q.v, {}); ents.push(e); compileObj(e.f.root); } catch (err) { console.warn('sea fish', err); }
    }
  }
  function begin() {
    ensureBuilt();
    env.activate();   // 水族箱可能换过主题 → 恢复珊瑚礁水体参数
    on = true; phase = 'cast'; exitT = 0; t = 0; curtain = 0; sinkT = 0; lastNib = -1; curiousT = rand(1.5, 3); jumpHide = false;
    if (target) { removeEnt(target); target = null; }
    for (const e of ents) { e.mode = 'swim'; e.pitch = 0; e.lane = laneFor(e); }
    if (!fresh) repopulate(); fresh = false;
    drift.set(0, 0, 0); driftV.set(0, 0, 0); slackK = 0; reelOut = null;
    camS.copy(CAM); camF = FOV; camLY = LOOK.y; Slock = null; bright = 0; baitGone = false; probeQ.length = 0;
    camera.fov = FOV; camera.updateProjectionMatrix();
    for (const e of [...ents]) if (e.probe) removeEnt(e);
    sc.on = false; school.visible = false; sc.next = rand(1.2, 3.5);
  }
  function exit(delay = 0) { if (!on || phase === 'exit') return; phase = 'exit'; exitT = -delay; }
  function cancel() { if (!on) return; on = false; phase = 'off'; camK = 0; curtain = 0; rig.visible = line.visible = slack.visible = false; if (target) { removeEnt(target); target = null; } }

  function spawnTarget(pre) {
    if (target) { target.mode = 'leave'; target.isTarget = false; target.temp = true; target = null; }
    if (!pre?.show) return;
    try {
      const e = addEnt(pre.show, { offscreen: true });
      e.isTarget = true; e.mode = 'lurk'; e.speed = Math.max(e.speed, 0.55);
      if (pre.show.item || e.f.sp?.odd) {   // 钓到的是海底的「东西」：就躺在鱼钩正下方的沙地上，鱼钩一路沉到它那儿
        e.mode = 'item'; e.pos.set(entryX + 0.15, floorAt(entryX, 0) + e.H * 0.5 + 0.05, 0); e.z = 0; e.yaw = 0;
      }
      ents.push(e); target = e; compileObj(e.f.root);
    } catch (err) { console.warn('sea target', err); }
  }

  // ---------------- v2.2 试探大鱼：抛竿时排队建模（飞行 / 下沉期间分帧建好），到点从画面外游过来碰一下鱼饵就走 ----------------
  function pumpProbes() {
    const t0 = performance.now();
    while (probeQ.length && performance.now() - t0 < 5) {
      const pr = probeQ.shift();
      try {
        const e = addEnt(pr.v, { offscreen: true, L: clamp(seaLen(pr.v) * 1.3, 0.95, 1.75) });
        e.probe = pr; e.mode = 'pwait'; e.temp = true; e.f.root.visible = false; e.speed = Math.max(e.speed, 0.45);
        ents.push(e); compileObj(e.f.root);
      } catch (err) { console.warn('sea probe', err); }
    }
  }
  function launchProbe(e, a) {
    const side = Math.random() < 0.5 ? -1 : 1;
    e.z = rand(-0.5, 0.25); e.pos.z = e.z; e.side = side;
    e.pos.set(rigP.x + side * (hwAt(e.z) + e.L * 0.7), clamp(rigP.y + rand(-0.5, 0.4), FLOOR_Y + 1, S - 0.6), e.z);
    e.lane = e.pos.y; e.dir = -side; e.yaw = e.dir > 0 ? 0 : Math.PI;
    const dist = Math.abs(e.pos.x - rigP.x) - e.L * 0.5;
    e.pspd = clamp(dist / Math.max(0.9, (e.probe.t || 0) - (a.t || 0) - 0.35), 0.8, 3.2);
    e.mode = 'probe'; e.t = 0; e.pecked = false; e.f.root.visible = true;
  }
  function probesAway(remove) {
    for (const e of [...ents]) {
      if (!e.probe) continue;
      if (e.mode === 'pwait' || remove) removeEnt(e);
      else if (e.mode === 'probe' || e.mode === 'ptease') { e.mode = 'leave'; e.dir = e.side || 1; }
    }
    probeQ.length = 0;
  }

  // 主程序转发的玩家事件
  function event(type, d, a) {
    if (!on && type !== 'cast') return;
    switch (type) {
      case 'cast': begin(); spawnTarget(a.pre); probeQ.push(...(a.probes || [])); break;
      case 'plop':
        phase = 'float'; sinkT = 0;
        depth0 = S - 0.15;
        hookDepth = clamp(S - 1.5 - (a.power || 0.5) * 2.2, FLOOR_Y + 1.2, S - 1.2);
        if (target && target.mode === 'item') hookDepth = target.pos.y + 0.12;
        break;
      case 'nibble':
        if (d && d.probe >= 0) {   // 大鱼试探：只有那条大鱼去顶一下鱼饵
          const pr = a.probes?.[d.probe], e = ents.find((x) => x.probe === pr);
          if (e) { if (e.mode === 'pwait') launchProbe(e, a); e.peck = 0.5; e.pecked = true; e.pt = 0; }
        } else for (const e of ents) if (e.mode === 'tease') e.peck = 0.28;
        break;
      case 'bite':
        if (target && target.mode !== 'item') { target.mode = 'bite'; target.t = 0; }
        for (const e of ents) if (e.mode === 'tease' || e.mode === 'curious') { e.mode = 'leave'; e.dir = Math.sign(e.pos.x - rigP.x) || 1; }
        probesAway(false);
        break;
      case 'missed':
        // v2.2：鱼把饵叼走了 —— 不会再有下一条鱼来（README 已知回归 #2）
        if (target && target.mode !== 'item') { target.mode = 'leave'; target.dir = Math.sign(target.pos.x - rigP.x) || 1; target.isTarget = false; target.temp = true; target = null; }
        baitGone = true; probesAway(false);
        for (const e of ents) if (e.mode === 'tease' || e.mode === 'curious') { e.mode = 'leave'; e.dir = Math.sign(e.pos.x - rigP.x) || 1; }
        break;
      case 'hookset':
        phase = 'fight'; hookedY0 = rigP.y; Slock = S; probesAway(false);
        if (!target) spawnTarget({ show: a.v });
        if (target) { target.mode = 'hooked'; target.t = 0; }
        fleeT = 2.5;
        break;
      case 'surge': fleeT = Math.max(fleeT, 1.5); break;
      case 'jump': jumpHide = true; break;
      case 'reenter': jumpHide = false; break;
      case 'landing': if (target) target.f.root.visible = false; rig.visible = line.visible = slack.visible = false; exit(0); break;
      case 'snap': case 'escape':
        if (target) { target.mode = 'flee'; target.dir = Math.sign(target.pos.x - hullC()) || 1; target.isTarget = false; target.temp = true; target = null; }
        phase = 'lost'; exit(1.3); break;
      case 'early': reelOut = { t: 0, from: rigP.clone() }; probesAway(false); exit(0.8); break;   // 先看着鱼钩被快速收回水面，再落幕
    }
  }
  const hullC = () => (hullX[0] + hullX[1]) / 2;

  // 主镜头的 NDC → 剖面里水面上的 x（同一行像素的视线都在 z=0 平面与水面相交）
  const _r = V();
  function surfX(ndcX) {
    _r.set(ndcX, 1 - 2 * edge, 0.5).unproject(camera).sub(camera.position);
    const k = (0 - camera.position.z) / _r.z;
    return camera.position.x + _r.x * k;
  }
  function edgeSurfaceY() {
    _r.set(0, 1 - 2 * edge, 0.5).unproject(camera).sub(camera.position);
    const k = (0 - camera.position.z) / _r.z;
    return camera.position.y + _r.y * k;
  }

  function steer(e, tx, ty, sp, dt, face = true) {
    const dx = tx - e.pos.x, dy = ty - e.pos.y, d = Math.hypot(dx, dy);
    const step = Math.min(d, sp * dt);
    if (d > 1e-4) { e.pos.x += dx / d * step; e.pos.y += dy / d * step; }
    if (face && Math.abs(dx) > 0.02) e.dir = Math.sign(dx);
    return d;
  }

  function updateFish(e, dt, a) {
    if (e.mode === 'pwait') { e.f.root.visible = false; return; }
    e.t += dt;
    const hw = hwAt(e.z);
    const bait = baitP.set(rigP.x, rigP.y - 0.08 * rigS, rigP.z);   // v2.6：鱼饵中心在钩眼下方
    const flee = fleeT > 0 && target && e !== target && Math.hypot(e.pos.x - target.pos.x, e.pos.y - target.pos.y) < 2.4 && Math.abs(e.z) < 3;
    switch (e.mode) {
      case 'swim': case 'leave': case 'flee': {
        const fast = e.mode === 'leave' ? 2.3 : e.mode === 'flee' ? 3.2 : flee ? 2.6 : 1;
        if (flee && e.mode === 'swim') e.dir = Math.sign(e.pos.x - target.pos.x) || e.dir;
        e.pos.x += e.dir * e.speed * fast * dt;
        if (e.kind === 'bottom') e.pos.y = floorAt(e.pos.x, e.z) + e.H * 0.5 + 0.02;
        else e.pos.y += (e.lane + Math.sin(e.t * (e.kind === 'drift' ? 0.5 : 0.8) + e.ph) * (e.kind === 'drift' ? 0.3 : 0.14) - e.pos.y) * Math.min(1, dt * 0.9);
        if (Math.abs(e.pos.x) > hw + e.L + 0.6) {
          if (e.temp || e.mode === 'flee') { removeEnt(e); return; }   // 溜走 / 挣脱的那条：游出画面就消失
          // 从另一侧重新游进来（换一条泳道 / 纵深），像一条连续的鱼流
          e.mode = 'swim'; const [z0, z1] = zRange(e.L, e.kind); e.z = rand(z0, z1); e.pos.z = e.z;
          e.pos.x = -e.dir * (hwAt(e.z) + e.L + 0.4); e.lane = laneFor(e); e.pos.y = e.kind === 'bottom' ? e.lane : e.lane;
        }
        e.pitch += ((e.kind === 'bottom' ? 0 : Math.cos(e.t * 0.8 + e.ph) * 0.08) - e.pitch) * Math.min(1, dt * 3);
        break;
      }
      case 'curious': {   // 发现鱼饵：游过来（嘴对着饵），停在跟前
        const side = Math.sign(e.pos.x - bait.x) || 1;
        const tx = bait.x + side * (e.L * 0.5 + 0.28) , ty = bait.y - 0.08;
        e.pos.z += (0 - e.pos.z) * Math.min(1, dt * 1.2);
        const d = steer(e, tx, ty, Math.max(0.6, e.speed * 1.6), dt, false);
        e.dir = -side;
        if (d < 0.08) { e.mode = 'tease'; e.t = 0; e.teaseT = rand(1.4, 2.8); }
        if (e.t > 6) { e.mode = 'leave'; e.dir = side; }
        break;
      }
      case 'tease': {   // 逗鱼饵：凑近 → 后退 → 啄一下（配合浮漂轻点）
        const side = -e.dir;
        e.peck = Math.max(0, (e.peck || 0) - dt);
        const pk = e.peck > 0 ? Math.sin((0.28 - e.peck) / 0.28 * Math.PI) : 0;
        const gap = e.L * 0.5 + 0.22 + Math.sin(e.t * 2.4 + e.ph) * 0.07 - pk * 0.2;
        steer(e, bait.x + side * gap, bait.y - 0.08 + Math.sin(e.t * 1.7) * 0.05, 1.2, dt, false);
        e.pos.z += (0 - e.pos.z) * Math.min(1, dt * 2);
        if (e.t > e.teaseT) { e.mode = 'leave'; e.dir = side; e.t = 0; }
        break;
      }
      case 'lurk': {   // 真正的那条：先在远处徘徊，快到咬钩时游过来、绕着鱼饵看
        const left = (a.biteAt || 0) - (a.t || 0);
        if (a.state === 'float' && left < 3.2) {
          const side = Math.sign(e.pos.x - bait.x) || 1;
          e.pos.z += (0 - e.pos.z) * Math.min(1, dt * 1.0);
          const d = steer(e, bait.x + side * (e.L * 0.5 + 0.45), bait.y - 0.05 + Math.sin(e.t * 1.3) * 0.08, Math.max(0.8, e.speed * 2.2), dt, false);
          e.dir = -side;
          if (d < 0.6 && left < 1.2) steer(e, bait.x + side * (e.L * 0.5 + 0.12), bait.y - 0.05, 0.5, dt, false);
        } else {
          e.pos.x += e.dir * e.speed * 0.6 * dt; e.pos.y += (e.lane - e.pos.y) * Math.min(1, dt);
          if (Math.abs(e.pos.x) > hw * 0.9 && Math.sign(e.pos.x) === e.dir) e.dir = -e.dir;
        }
        break;
      }
      case 'bite': {   // 咬住：嘴贴着鱼钩，甩头
        const side = -e.dir || 1;
        e.pos.x += (bait.x + side * e.L * 0.47 - e.pos.x) * Math.min(1, dt * 14);
        e.pos.y += (bait.y - 0.09 - e.pos.y) * Math.min(1, dt * 14);
        e.pos.z += (0 - e.pos.z) * Math.min(1, dt * 6);
        e.pitch = Math.sin(e.t * 22) * 0.18;
        e.biteGlue = true;   // 摆放后再把嘴精确贴到鱼钩上（见 updateFish 末尾）
        break;
      }
      case 'item': break;
      case 'hooked': break;   // 由 updateFight 控制
      case 'probe': {   // 大鱼从画面外直奔鱼饵（嘴对着饵）
        const side = e.side || 1;
        const d = steer(e, bait.x + side * (e.L * 0.5 + 0.22), bait.y - 0.06, e.pspd, dt, false);
        e.dir = -side; e.pos.z += (0 - e.pos.z) * Math.min(1, dt * 1.5);
        if (d < 0.1) { e.mode = 'ptease'; e.t = 0; }
        break;
      }
      case 'ptease': {   // 停在饵前打量 → 顶一下（浮漂猛点）→ 掉头就走（不吃饵）
        const side = e.side || 1;
        e.peck = Math.max(0, (e.peck || 0) - dt);
        const pk = e.peck > 0 ? Math.sin((0.5 - e.peck) / 0.5 * Math.PI) : 0;
        const gap = e.L * 0.5 + 0.2 + Math.sin(e.t * 2.0 + e.ph) * 0.06 - pk * 0.24;
        steer(e, bait.x + side * gap, bait.y - 0.06 + Math.sin(e.t * 1.6) * 0.05, 1.4, dt, false);
        e.dir = -side; e.pitch = pk * 0.12;
        if (e.pecked) { e.pt = (e.pt || 0) + dt; if (e.pt > 0.75) { e.mode = 'leave'; e.dir = side; e.t = 0; } }
        else if (e.t > 4) { e.mode = 'leave'; e.dir = side; }
        break;
      }
    }
    if (e.mode !== 'hooked') e.yaw = angTo(e.yaw, e.dir > 0 ? 0 : Math.PI, Math.min(1, dt * (e.mode === 'tease' || e.mode === 'bite' ? 8 : 3.5)));
    e.f.root.visible = !(e === target && jumpHide);
    place(e, dt);
    if (e.biteGlue) {   // v2.6：咬饵 → 嘴贴住鱼钩（0.15s 内吸附过去，之后完全跟随）
      e.biteGlue = false;
      hookBiteW(hookW); mouthWorld(e, mouthW);
      const k = Math.min(1, e.t / 0.15);
      e.pos.x += (hookW.x - mouthW.x) * k; e.pos.y += (hookW.y - mouthW.y) * k; e.pos.z += (hookW.z - mouthW.z) * k;
      e.f.root.position.copy(e.pos);
    }
  }

  // 搏鱼：鱼钩挂在鱼嘴里；距离越近 → 越往上、越靠近船；鱼发力时横冲 / 下潜
  function updateFight(e, dt, a) {
    const prog = clamp(1 - (a.dist || 0) / Math.max(0.5, a.startDist || 1), 0, 1);
    const surging = a.surge > 0;
    const away = Math.sign(entryX - hullC()) || 1;
    e.t += dt;
    const sw = Math.sin(a.swimA || 0) * (0.5 - prog * 0.25);
    const ty = lerp(hookedY0, S - 0.5 - e.H * 0.3, Math.pow(prog, 0.85)) - (surging ? 0.45 + Math.sin(e.t * 3) * 0.15 : 0) + Math.sin(e.t * 2.3) * 0.08;
    const lim = hwAt(0) * 0.8;
    const tx = clamp(entryX + sw + (surging ? away * 0.55 : 0), -lim, lim);
    // 朝向：平时被拖着「头朝鱼线」往上走；发力时掉头往外冲
    const faceDir = surging ? away : (Math.sign(entryX - tx) || -away);
    const ang = surging ? -0.35 : clamp(Math.atan2(S - ty, Math.abs(entryX - tx) + 0.6) * 0.8, -0.2, 0.75);
    const intense = surging ? 25 : 15;
    e.yaw = angTo(e.yaw, faceDir > 0 ? 0 : Math.PI, Math.min(1, dt * 8));
    const facing = Math.cos(e.yaw) >= 0 ? 1 : -1;
    e.pitch += (ang + Math.sin(e.t * intense) * (surging ? 0.25 : 0.12) - e.pitch) * Math.min(1, dt * 12);
    mouth.set(tx, ty, 0);
    const k = Math.min(1, dt * 16); // 贴得更紧
    e.pos.x += (mouth.x - facing * Math.cos(e.pitch) * e.L * 0.47 - e.pos.x) * k;
    e.pos.y += (mouth.y - Math.sin(e.pitch) * e.L * 0.47 - e.pos.y) * k;
    e.pos.z += (0 - e.pos.z) * Math.min(1, dt * 5);
    e.f.root.visible = !jumpHide;
    place(e, dt);
    // v2.6 鱼嘴实际位置 → 鱼钩：转角对准鱼线，弯钩内侧正好挂在嘴上，钩眼（rigP）由此反推
    mouthWorld(e, mouthW);
    rigS += (clamp(0.5 + e.L * 0.4, 0.62, 1) - rigS) * Math.min(1, dt * 6);
    rigRot = Math.atan2(mouthW.x - entryX, S - mouthW.y);
    rigP.copy(mouthW).sub(_hk.copy(HOOK_BITE).multiplyScalar(rigS).applyAxisAngle(_zAx, rigRot));
  }

  function update(dt, a) {
    if (!on) return;
    t += dt; env.activate(); W.uT.value += dt; compU.uT.value = t;   // activate：水族箱可能在钓鱼途中切过主题（共享水体 uniforms）
    // 镜头 / 幕布：cast 拉远镜头 → 入水后水下剖面从底部升起；退出时先落幕再推回船上
    if (phase === 'exit') {
      exitT += dt;
      if (exitT > 0) { curtain = Math.max(0, curtain - dt / 0.45); if (curtain <= 0) camK = Math.max(0, camK - dt / 0.9); }
      if (camK <= 0 && curtain <= 0) { on = false; phase = 'off'; reelOut = null; Slock = null; bright = 0; camera.fov = FOV; camera.updateProjectionMatrix(); probesAway(true); repopulate(); fresh = true; rig.visible = line.visible = slack.visible = false; school.visible = false; if (target) { removeEnt(target); target = null; } for (const e of [...ents]) if (e.mode === 'leave' && !e.isTarget) e.mode = 'swim'; return; }
    } else {
      camK = Math.min(1, camK + dt / 1.5);
      if (phase !== 'cast' || camK > 0.55) curtain = Math.min(1, curtain + dt / 0.8);   // 鱼饵还在空中时海底就升起来 → 入水那一刻直接看见鱼钩往下沉
    }
    if (Slock == null) { edge += (clamp(frame.edgeFy, 0.12, 0.45) - edge) * Math.min(1, dt * 5); S = edgeSurfaceY(); }
    else {   // 搏鱼：水面固定，水线落在屏幕哪一行由剖面镜头决定（镜头越靠近水面，水线越往下、上方的船越大），主镜头反过来对齐它
      S = Slock; _r.set(camera.position.x, S, 0).project(camera);
      edge += (clamp((1 - _r.y) / 2, 0.12, 0.56) - edge) * Math.min(1, dt * 8);
    }
    compU.uEdge.value = lerp(-0.08, 1 - edge, ease(curtain));
    surf.position.set(0, S, -20);
    entryX = surfX(frame.entryNdcX);
    if (frame.hullNdc) { hullX[0] = surfX(frame.hullNdc[0]); hullX[1] = surfX(frame.hullNdc[1]); }
    // 船底
    const hw = Math.max(0.2, hullX[1] - hullX[0]);
    hull.visible = keel.visible = !!frame.hullNdc;
    hull.position.set(hullC(), S + 0.02, 0.4); hull.scale.set(hw, Math.min(0.42, hw * 0.13 + 0.08), 1);
    keel.position.set(hullC(), S - hull.scale.y * 0.42, 0.4); keel.scale.set(hw * 0.92, 1, 1); keel.visible = false;
    surfU.uHull.value.set(hullC(), hw * 0.5, hull.visible ? 1 : 0);
    if (!queue.length && ents.length < 3 && phase === 'cast') repopulate();
    pumpQueue(curtain > 0.3);
    if (probeQ.length) pumpProbes();
    if (phase === 'float' && a.state === 'float' && !a.baitGone) for (const e of ents) if (e.mode === 'pwait' && e.probe?.t > 0 && e.probe.t - a.t < 2.6) launchProbe(e, a);

    // 钓组
    if (!reelOut && (phase === 'float' || phase === 'reel' || (phase === 'exit' && !target && a.state !== 'fight'))) {   // 空钩收线动画期间由 reelOut 接管鱼钩位置
      sinkT += dt;
      const k = ease(Math.min(1, sinkT / 2.8));
      let yy = lerp(depth0, hookDepth, k);
      if (phase === 'reel' || a.state === 'reelEmpty') yy = Math.min(S + 0.3, rigP.y + dt * 6);
      const nib = a.nibT >= 0 ? Math.sin(Math.min(1, a.nibT / 0.35) * Math.PI) * 0.06 : 0;
      const bite = a.state === 'bite' ? 0.12 + Math.abs(Math.sin(t * 14)) * 0.05 : 0;
      // v2.3：等待时摇杆控制鱼饵慢慢漂（左右 ±1.6m · 上下在海底和水面之间），松手后惯性滑一下停住；只改位置，不影响哪条鱼咬钩
      const jx = a.state === 'float' && !baitGone && phase === 'float' ? (frame.joyX || 0) : 0, jy = a.state === 'float' && !baitGone && phase === 'float' ? (frame.joyY || 0) : 0;
      driftV.x += (jx * 1.25 - driftV.x) * Math.min(1, dt * 4.5);   // v2.4：更跟手
      driftV.y += (jy * 1.05 - driftV.y) * Math.min(1, dt * 4.5);
      drift.x = clamp(drift.x + driftV.x * dt, -1.6, 1.6);
      const baseY = yy - nib - bite;
      drift.y = clamp(drift.y + driftV.y * dt, (FLOOR_Y + 0.55) - baseY, (S - 0.55) - baseY);
      if (phase === 'reel' || a.state === 'reelEmpty') { drift.multiplyScalar(1 - Math.min(1, dt * 3)); }
      rigP.set(entryX + drift.x + Math.sin(t * 0.9) * 0.05 * k, baseY + drift.y, 0);
    }
    if (reelOut) {   // 空钩收线：0.6s 内沿缓出曲线拉回入水点（鱼钩轻甩），线随之变短
      reelOut.t += dt;
      const k = ease(Math.min(1, reelOut.t / 0.6));
      _a.set(entryX, S + 0.12, 0);
      rigP.lerpVectors(reelOut.from, _a, k); rigP.x += Math.sin(k * Math.PI) * 0.12;
    }
    const reeling = !!reelOut && reelOut.t < 0.64;
    const showRig = on && (phase === 'float' || phase === 'fight' || phase === 'reel' || reeling) && !(phase === 'fight' && jumpHide);
    rig.visible = line.visible = showRig; if (!showRig) slack.visible = false;
    if (phase !== 'fight' && !(phase === 'exit' && target && target.mode === 'hooked')) {   // 非搏鱼：鱼钩轻摆，缩放回 1（搏鱼时由 updateFight 对准鱼线）
      rigRot = reeling ? Math.atan2(rigP.x - entryX, S - rigP.y) * 0.6 : Math.sin(t * 1.1) * 0.12;
      rigS += (1 - rigS) * Math.min(1, dt * 6);
    }

    // 好奇的鱼：每次轻点（nibble）前 ~1.3s 安排一条附近的鱼过来；等待期间也会有鱼路过看一眼
    if (phase === 'float' && a.state === 'float' && !baitGone) {
      const nx = a.nibbles && a.nibbles.length ? a.nibbles[0] : null;
      const isProbe = nx != null && a.probes?.some((p) => Math.abs(p.t - nx) < 1e-6);
      if (nx != null && nx !== lastNib && nx - a.t < 1.4) { lastNib = nx; if (!isProbe) sendCurious(); }
      curiousT -= dt;
      if (curiousT <= 0 && sinkT > 1.5) { curiousT = rand(2.5, 4.5); sendCurious(); }
    }
    fleeT = Math.max(0, fleeT - dt);
    for (const e of [...ents]) { if (e === target && e.mode === 'hooked') continue; updateFish(e, dt, a); }
    separateAll(dt);   // v2.3：鱼之间按躯干胶囊体做碰撞分离（鳍 / 腿不算）
    if (target && target.mode === 'hooked') updateFight(target, dt, a);
    // v2.6：鱼都摆好之后再画鱼钩 / 鱼线（搏鱼时 rigP 刚由鱼嘴反推出来，同一帧对齐，不再滞后一帧）
    if (showRig) {
      rig.position.copy(rigP); rig.rotation.z = rigRot; rig.scale.setScalar(rigS);
      worm.rotation.y = Math.sin(t * 2.2) * 0.12; worm.rotation.x = Math.sin(t * 1.7) * 0.08;
      sinker.visible = leader.visible = phase !== 'fight'; worm.visible = phase !== 'fight' && !baitGone;   // 鱼饵被叼走 → 只剩空钩
      baitGlow.visible = phase === 'float' && !baitGone;
      entry.set(entryX, S + 0.05, 0);
      _b.copy(rigP); if (phase !== 'fight') _b.y += 0.32 * rigS;
      // v2.3：等待时鱼线松弛（下垂 + 随水流轻摆，跟着鱼饵漂移的方向拖一点）；咬钩 / 搏鱼 / 收线时绷直
      const wantSlack = phase === 'float' && (a.state === 'float') ? 1 : 0;
      slackK += (wantSlack - slackK) * Math.min(1, dt * (wantSlack ? 2.5 : 9));
      if (slackK > 0.04) {
        const len = _b.distanceTo(entry);
        setSlack(_b, entry, len * 0.16 * slackK, (Math.sin(t * 0.7) * 0.12 - driftV.x * 0.5) * slackK);
        slack.visible = true; line.visible = false;
      } else { slack.visible = false; segment(line, _b, entry, 0.0065); }
    }

    updateSchool(dt, t);
    env.update(t, camera);
    key.intensity = L.keyI * (1 + Math.sin(t * 1.7) * 0.05 + Math.sin(t * 2.9) * 0.035);
    // 镜头（v2.2）：等待时全景；咬钩后跟着鱼往上走 —— 镜头上浮贴近水面 + 收窄 FOV 推近：
    //   船（水线上方）越来越大、海底越离越远沉出画面、水体越来越亮；收线进度 prog 驱动，全程平滑
    let tx = 0, ty = CAM.y, tz = CAM.z, tf = FOV, tly = LOOK.y, tb = 0;
    if ((phase === 'fight' || (phase === 'exit' && target && target.mode === 'hooked')) && target) {
      const prog = clamp(1 - (a.dist || 0) / Math.max(0.5, a.startDist || 1), 0, 1), pe = ease(prog);
      tz = CAM.z * lerp(0.92, 0.8, pe);
      tx = clamp(rigP.x, -3, 3) * lerp(0.55, 0.9, pe);
      ty = lerp(CAM.y, S - 0.45, pe);
      tf = lerp(46, 27, Math.pow(prog, 0.8));
      tly = lerp(rigP.y, S, 0.2 + 0.45 * pe);
      tb = pe;
    } else if (phase === 'float' && sinkT > 0.3) {
      tx = clamp(rigP.x, -2.5, 2.5) * 0.35;   // 等待：轻轻偏向鱼饵
    }
    const kc = 1 - Math.exp(-dt * (phase === 'fight' ? 2.4 : 1.4));
    camS.x += (tx - camS.x) * kc; camS.y += (ty - camS.y) * kc; camS.z += (tz - camS.z) * kc;
    camF += (tf - camF) * kc; camLY += (tly - camLY) * kc; bright += (tb - bright) * kc;
    if (Math.abs(camera.fov - camF) > 0.01) { camera.fov = camF; camera.updateProjectionMatrix(); }
    camera.position.set(camS.x + Math.sin(t * 0.13) * 0.1, camS.y + Math.sin(t * 0.21) * 0.05, camS.z);
    camera.lookAt(camS.x + Math.sin(t * 0.11) * 0.06, camLY, LOOK.z);
    compU.uBright.value = bright;
    if (bright > 0.001) { W.uWDen.value *= 1 - 0.45 * bright; W.uDD.value = lerp(W.uDD.value, 1, 0.6 * bright); }   // 水更清、深处不再压暗（每帧 activate 会重置回主题值）
  }
  // ---------------- v2.3 鱼群防穿模：每条鱼的躯干 = 沿身体轴的 3 个圆（头 / 中 / 尾，半径 ≈ 体高的一半），
  //   两两推开（只在同一纵深层 |Δz| < 0.9 时；更远的前后错开本来就不穿）；被钩住 / 咬饵 / 试探中的鱼「钉住」，只推别人。
  //   推开量 = 重叠量 × 0.5（每帧），所以挤在一起会自然滑开、不会弹飞，也不会留出大空隙
  const PIN = new Set(['hooked', 'bite', 'ptease', 'tease', 'item', 'pwait']);
  const _cap = [];
  function capsOf(e, out) {
    const hl = e.L * 0.36, r = Math.max(0.05, Math.min(e.H * 0.45, e.L * 0.22));
    const cx = Math.cos(e.yaw) * Math.cos(e.pitch), cy = Math.sin(e.pitch);
    out.length = 0;
    for (const k of [-1, 0, 1]) out.push(e.pos.x + cx * hl * k, e.pos.y + cy * hl * k, k === 0 ? r : r * 0.82);
    return out;
  }
  function separate(dt) {
    const live = ents.filter((e) => e.f.root.visible && e.mode !== 'pwait');
    if (live.length < 2) return;
    const caps = live.map((e) => capsOf(e, []));
    const kk = 0.6;   // 每次迭代推开 60% 重叠；下面跑 3 轮 → 定向游动（游向鱼饵 / 离开）的鱼也压不进去
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const A = live[i], B = live[j];
      if (Math.abs(A.pos.z - B.pos.z) > 0.9) continue;
      if ((A.L + B.L) * 0.6 < Math.hypot(A.pos.x - B.pos.x, A.pos.y - B.pos.y) - 0.3) continue;   // 粗筛
      const ca = caps[i], cb = caps[j];
      let bx = 0, by = 0, best = 0;
      for (let u = 0; u < 9; u += 3) for (let v = 0; v < 9; v += 3) {
        const dx = cb[v] - ca[u], dy = cb[v + 1] - ca[u + 1], d = Math.hypot(dx, dy), ov = ca[u + 2] + cb[v + 2] - d;
        if (ov > best) { best = ov; const n = d > 1e-4 ? 1 / d : 0; bx = d > 1e-4 ? dx * n : (Math.random() - 0.5); by = d > 1e-4 ? dy * n : 1; }
      }
      if (best <= 0) continue;
      const pa = PIN.has(A.mode), pb = PIN.has(B.mode);   // 目标鱼在 lurk 时照常参与推挤，被钩住后（hooked）才钉住
      if (pa && pb) continue;
      const wa = pa ? 0 : pb ? 1 : B.L / (A.L + B.L), wb = pb ? 0 : pa ? 1 : A.L / (A.L + B.L);   // 小鱼让大鱼
      const push = best * kk;
      A.pos.x -= bx * push * wa; A.pos.y -= by * push * wa;
      B.pos.x += bx * push * wb; B.pos.y += by * push * wb;
      if (!pa && A.mode === 'swim' && A.kind !== 'bottom') A.lane += (A.pos.y - A.lane) * 0.25;   // 被挤开后换到新泳道，不会马上又挤回来
      if (!pb && B.mode === 'swim' && B.kind !== 'bottom') B.lane += (B.pos.y - B.lane) * 0.25;
    }
    for (const e of live) if (e.kind === 'bottom' && e.mode === 'swim') e.pos.y = Math.max(e.pos.y, floorAt(e.pos.x, e.z) + e.H * 0.5 + 0.02);
    for (const e of live) e.f.root.position.copy(e.pos);
  }
  function separateAll(dt) { for (let it = 0; it < 3; it++) separate(dt); }
  function sendCurious() {
    const cands = ents.filter((e) => e.mode === 'swim' && e !== target && e.kind !== 'bottom' && e.L < 1.2 && Math.abs(e.pos.x) < hwAt(e.z) * 1.1 && Math.abs(e.pos.y - rigP.y) < 2.5);
    if (!cands.length) return;
    cands.sort((p, q) => (Math.hypot(p.pos.x - rigP.x, p.pos.y - rigP.y) + Math.abs(p.z) * 0.5) - (Math.hypot(q.pos.x - rigP.x, q.pos.y - rigP.y) + Math.abs(q.z) * 0.5));
    const e = cands[Math.random() < 0.7 ? 0 : Math.min(cands.length - 1, 1)];
    e.mode = 'curious'; e.t = 0;
  }

  function render() {
    if (!on || curtain <= 0.001) return;
    const exp = renderer.toneMappingExposure, sh = renderer.shadowMap.enabled, ac = renderer.autoClear;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(rt); renderer.toneMappingExposure = 1; renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.toneMappingExposure = clamp(th.light.exp || 1, 0.85, 1.12) * (1 + 0.18 * bright);
    renderer.autoClear = false; renderer.render(compScene, compCam);
    renderer.autoClear = ac; renderer.toneMappingExposure = exp; renderer.shadowMap.enabled = sh;
  }

  return {
    scene, camera, frame, ents,
    get on() { return on; }, get camK() { return ease(camK); }, get curtain() { return curtain; }, get edge() { return edge; }, get phase() { return phase; },
    get target() { return target; },
    get waterFy() { return Slock != null && on ? edge : null; },   // 搏鱼时水线所在的屏幕行（主镜头对齐它）
    dbg: () => ({ S: +S.toFixed(2), entryX: +entryX.toFixed(2), rig: rigP.toArray().map((x) => +x.toFixed(2)), rigVis: rig.visible, hw0: +hwAt(0).toFixed(2), tgt: target ? { m: target.mode, p: target.pos.toArray().map((x) => +x.toFixed(2)), vis: target.f.root.visible, sp: target.v.sp } : null, modes: ents.map((e) => e.mode.slice(0, 2)).join(' ') }),
    hookGap: () => (target && (target.mode === 'hooked' || target.mode === 'bite') ? +hookBiteW(V()).distanceTo(mouthWorld(target, V())).toFixed(4) : null),   // v2.6 自测：鱼钩挂嘴点 ↔ 鱼嘴的距离
    begin, event, update, render, resize, prewarm, cancel, exit, idle,
  };
}
