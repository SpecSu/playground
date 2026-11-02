// 水族箱 v3：动森博物馆式「大水族馆」——全屏水下空间 + 多主题（热带珊瑚礁 / 海带森林 / 深海遗迹 / 极地冰海 / 日落红树林 / 火山热泉）
// 环境（水体光学/焦散/光束/程序化布景/粒子）见 aqua_env.js；主题数据见 aqua_themes.js；本文件：灯光、鱼游动、卵（黄色呼吸光球）、演出、拾取、相机
// 对外：createAquarium({ renderer }) → { open(tank, W, H, { reset, theme }), setTheme, theme, close, sync, update, render, resize, pickAt, select, screenPos, playEggify, playHatch, playRelease, ... }
import * as THREE from 'three';
import { Fish, FISH_STYLE, SPECIES_BY_ID } from './fishes.js';
import { buildEnv, aqInject, W, floorAt, FLOOR_Y, glowTex } from './aqua_env.js';
import { themeOf, DEFAULT_THEME } from './aqua_themes.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOutBack = (k) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const angDelta = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------- 空间常量（米） ----------------
const FOV = 50, TANH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const CAM0 = V(0, 0.3, 8.8), LOOK0 = V(0, 0.05, 0);
const Z_NEAR = 1.5, Z_FAR = -5.2;           // 鱼群纵深范围
const SHOW = V(0, 0.5, 3.2);                 // 被选中的鱼游到这里（前景）
const EGG_C = V(0, 0.35, 2.4);               // 卵变/孵化演出中心
export const TANK = { w: 4, h: 5.5, d: Z_NEAR - Z_FAR };

// 鱼的显示长度：对数映射保持大小差；最小也看得清，最大不撑爆屏幕
export function tankLen(v) {
  const cm = Math.max(8, v.cm || 30);
  const t = clamp((Math.log(cm) - Math.log(10)) / (Math.log(700) - Math.log(10)), 0, 1);
  let L = 0.62 + t * 0.98;
  const gs = v.gx?.scale || 1; if (gs > 1.01) L *= Math.min(1.3, 0.9 + gs * 0.16);
  return Math.min(L, 1.85);
}

function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const dotTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const bubbleTex = canvasTex(64, 64, (g) => {
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(23, 22, 5, 0, 7); g.fill();
});
const rayTex = canvasTex(64, 512, (g, w, h) => {
  for (let x = 0; x < w; x++) {
    const k = Math.exp(-Math.pow((x - w / 2) / (w * 0.22), 2));
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `rgba(255,255,255,${0.95 * k})`); gr.addColorStop(0.35, `rgba(255,255,255,${0.5 * k})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, 0, 1, h);
  }
});

// 给鱼材质追加：焦散 + 鱼专用照明（key/rim）+ 弱化水体雾 + 饱和度分级 + 环境反射（保留其原有 onBeforeCompile：花纹/基因材质）
// 透明鳍膜也注入（不加焦散），否则鳍会被场景雾吃成灰色
function causFish(root, k = 0.55, envTex = null, envK = 0.9) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.isMeshStandardMaterial || m.userData.shared) continue;
      if (envTex && !m.envMap) { m.envMap = envTex; m.envMapIntensity = envK; m.userData.aqEnv = true; m.needsUpdate = true; }
      if (m.userData.caus) continue;
      m.userData.caus = true;
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey(), ck = m.transparent ? 0 : k;
      m.onBeforeCompile = function (sh, r) { prev && prev.call(this, sh, r); aqInject(sh, { caus: ck, fish: true }); };
      m.customProgramCacheKey = () => prevKey + '|aq4fish' + (ck ? 'c' : '');
      m.needsUpdate = true;
    }
  });
}
// 鱼专用环境贴图：顶部暖白柔光箱 + 青色水平带 + 深色下方 → 鱼身清漆/湿润高光、轮廓立体（布景不使用）
function fishEnvTex(renderer) {
  const es = new THREE.Scene();
  const g = new THREE.SphereGeometry(10, 48, 24); const P = g.attributes.position, cols = new Float32Array(P.count * 3), c = new THREE.Color();
  const top = new THREE.Color(1.3, 1.25, 1.15), hor = new THREE.Color(0.1, 0.3, 0.4), bot = new THREE.Color(0.02, 0.04, 0.06);
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i) / 10;
    if (y > 0) c.copy(hor).lerp(top, Math.pow(THREE.MathUtils.smoothstep(y, 0.05, 0.95), 1.4)); else c.copy(hor).lerp(bot, THREE.MathUtils.smoothstep(-y, 0.0, 0.6));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const box = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.7), side: THREE.DoubleSide }));
  box.position.set(-2, 7, 4); box.lookAt(0, 0, 0); es.add(box);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.6, 2.0), side: THREE.DoubleSide }));
  side.position.set(7, 2, -4); side.lookAt(0, 0, 0); es.add(side);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(es, 0.02);
  pm.dispose(); es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt.texture;
}

// ---------------- 卵：完美球体 · 暖黄半透明 · 内部辉光 + 鱼影若隐若现 · 呼吸光 ----------------
const EGG_R = 0.36;
const EGG_TINT = { prompt: ['#ffcf48', '#e8962a'], items: ['#ffcf48', '#e8962a'], fuse: ['#ffc840', '#e08a26'] };
function eggShellMat(kind) {
  const [c0, c1] = EGG_TINT[kind] || EGG_TINT.prompt;
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(c0) }, uDeep: { value: new THREE.Color(c1) }, uB: { value: 0.5 }, uCrack: { value: 0 }, uOp: { value: 1 }, uT: W.uT, uSeed: { value: Math.random() * 10 } },
    vertexShader: `varying vec3 vN, vV, vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol, uDeep; uniform float uB, uCrack, uOp, uT, uSeed; varying vec3 vN, vV, vP;
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 N = normalize(vN); bool bk = !gl_FrontFacing; if (bk) N = -N; vec3 Vv = normalize(vV);
        float nv = clamp(dot(N, Vv), 0.0, 1.0), fr = pow(1.0 - nv, 3.0), fr2 = pow(1.0 - nv, 1.4);
        vec3 p = vP / ${EGG_R.toFixed(3)};
        // 薄膜微起伏（极淡，只扰动高光，不再整体磨砂）
        float mem = n3(p * 9.0 + uSeed + uT * 0.05) * 0.6 + n3(p * 22.0) * 0.4;
        vec3 Nm = normalize(N + (vec3(n3(p * 7.0 + 3.0), n3(p * 7.0 + 9.0), n3(p * 7.0 + 15.0)) - 0.5) * 0.06);
        // 体积内辉：正对视线处更厚 → 中心琥珀暖核，向边缘过渡到明亮金黄；下部略深（重力沉淀感）
        float thick = nv;
        vec3 core = mix(uDeep, vec3(1.0, 0.52, 0.1), 0.5) * (0.65 + 0.55 * uB);
        vec3 body = mix(uCol * vec3(1.0, 0.86, 0.5) * (0.78 + 0.3 * uB), core, pow(thick, 1.4) * 0.8);
        body *= 0.9 + 0.18 * smoothstep(-1.0, 1.0, p.y);
        body += vec3(1.0, 0.7, 0.25) * pow(thick, 5.0) * (0.3 + 0.6 * uB);              // 中心内核辉光
        // 内部悬浮微粒（视差：背面采样另一层）
        float sp = smoothstep(0.78, 0.84, n3(p * 11.0 + vec3(0.0, uT * 0.08, 0.0) + (bk ? 7.0 : 0.0)));
        body += vec3(1.0, 0.93, 0.7) * sp * 0.25 * (0.6 + 0.4 * uB);
        // 菲涅尔边缘：透亮的暖白光圈（湿润薄膜的边缘反射）
        vec3 rimC = vec3(1.0, 0.82, 0.46) * (0.85 + 0.4 * uB);
        vec3 col = body * (1.0 - fr * 0.55) + rimC * (fr * 1.4 + fr2 * 0.25);
        // 湿润高光：主灯锐利小高光 + 宽柔光斑 + 窗形环境反射条 + 底部反弹光
        vec3 L = normalize(vec3(-0.45, 0.75, 0.55)); vec3 H = normalize(L + Vv);
        float spec = pow(max(dot(Nm, H), 0.0), 260.0) * 2.2 + pow(max(dot(Nm, H), 0.0), 40.0) * 0.12;
        vec3 R = reflect(-Vv, Nm);
        float win = smoothstep(0.62, 0.66, R.y) * smoothstep(0.86, 0.8, R.y) * smoothstep(0.3, 0.12, abs(R.x + 0.25));
        float bounce = pow(max(dot(N, normalize(vec3(0.3, -0.8, 0.4))), 0.0), 3.0) * 0.18;
        // 手绘感湿润高光：左上锐利椭圆主高光 + 右下小次高光（视空间法线定位，任何角度都可读）
        vec2 hq = (N.xy - vec2(-0.34, 0.44)) * vec2(1.0, 1.5);
        float hs = smoothstep(0.12, 0.07, length(hq)) + smoothstep(0.035, 0.015, length(N.xy - vec2(-0.12, 0.6))) * 0.8;
        float hs2 = smoothstep(0.07, 0.03, length((N.xy - vec2(0.42, -0.38)) * vec2(1.0, 1.6))) * 0.45;
        spec = (spec + win * 0.3 * (0.6 + 0.4 * mem) + hs * 1.1 + hs2) * (bk ? 0.0 : 1.0);
        // 裂纹光：噪声等值线，按 uCrack 逐步蔓延
        float cl = 1.0 - smoothstep(0.0, 0.035, abs(n3(p * 3.2 + 1.7) - 0.5));
        float reach = smoothstep(uCrack * 1.25 - 0.25, uCrack * 1.25, 1.0 - n3(p * 1.3 + 5.0));
        float crack = cl * reach * step(0.001, uCrack);
        col += vec3(1.0, 0.92, 0.66) * crack * 2.6 + vec3(1.0, 0.85, 0.55) * bounce;
        // 透明度：中心通透（看得到鱼影）、边缘实；背面更淡
        float a = clamp((0.4 + 0.14 * uB - 0.1 * pow(thick, 3.0)) * (bk ? 0.55 : 1.0) + fr2 * 0.3 + fr * 0.35 + spec + crack, 0.0, 1.0) * uOp;
        gl_FragColor = vec4(col + spec * vec3(1.0, 0.97, 0.9), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

export function createAquarium({ renderer }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color('#0d5677'), 0.012);   // 兜底：未注入水体 shader 的材质（很弱，只防止穿帮）
  const camera = new THREE.PerspectiveCamera(FOV, 0.46, 0.1, 140);
  const world = new THREE.Group(); scene.add(world);
  const uPx = { value: 400 };

  // ---------------- 灯光：水面方向主光 + 环境 + 背光 + 2 盏点光（热泉等主题用）----------------
  const hemi = new THREE.HemisphereLight('#9fd8ea', '#163848', 0.78); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff0d6', 2.3); key.position.set(2.5, 10, 3); scene.add(key);
  const fill = new THREE.DirectionalLight('#8fd0e0', 0.55); fill.position.set(-1, 2, 10); scene.add(fill);
  const rim = new THREE.DirectionalLight('#7fd0f0', 0.6); rim.position.set(-3, 4, -8); scene.add(rim);
  let fishEnv = null;
  const spot = new THREE.PointLight('#fff1dc', 0, 5, 1.6); scene.add(spot);
  const pls = [0, 1].map(() => { const l = new THREE.PointLight('#e08a50', 0, 5, 1.8); scene.add(l); return l; });
  let keyI = 2.3;

  // 展示鱼背后的柔雾幕（博物馆展柜聚光感）
  const veilTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,.8)'); gr.addColorStop(0.8, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: veilTex, color: '#2a7a96', transparent: true, opacity: 0, depthWrite: false, fog: false }));
  veil.renderOrder = -1;   // 必须先于卵（卵不写深度，否则雾幕会盖在卵上把它洗白） veil.visible = false; scene.add(veil);

  // ---------------- 主题环境 ----------------
  let env = null, themeId = null, th = themeOf(DEFAULT_THEME);
  const hwAt0 = (z) => Math.max(0.6, (CAM0.z - z) * TANH * Math.max(0.42, camera.aspect));
  // 环境缓存（LRU 3）：切回最近用过的主题不再重建几何 / 重编译（好友互访来回切换很常见）
  const envCache = new Map();
  function setTheme(id) {
    id = themeOf(id).id;
    if (id === themeId && env) return;
    if (!fishEnv) fishEnv = fishEnvTex(renderer);
    if (env) world.remove(env.group);
    themeId = id; th = themeOf(id);
    env = envCache.get(id);
    if (env) { envCache.delete(id); env.activate(); }
    else env = buildEnv(id, { hwAt: hwAt0, uPx });
    envCache.set(id, env);
    while (envCache.size > 3) { const [k0, e0] = envCache.entries().next().value; envCache.delete(k0); e0.dispose(); }
    world.add(env.group);
    const fk = th.fish?.env ?? 0.9;
    for (const e of ents.values()) if (e.kind === 'fish') e.f.root.traverse((o) => { if (o.isMesh && o.material?.userData?.aqEnv) o.material.envMapIntensity = fk; });
    const L = th.light;
    hemi.color.set(L.sky); hemi.groundColor.set(L.gnd); hemi.intensity = L.hemi;
    key.color.set(L.key); keyI = L.keyI; fill.color.set(L.fill); fill.intensity = L.fillI; rim.color.set(L.rim); rim.intensity = L.rimI;
    scene.fog.color.set(th.water.hor); scene.fog.density = th.water.den * 0.3;
    veil.material.color.set(th.water.hor).lerp(new THREE.Color(th.water.top), 0.45);
    pls.forEach((l, i) => { const s = env.lights[i]; if (s) { l.position.copy(s.pos); l.color.set(s.col); l.intensity = s.I; l.distance = s.dist; } else l.intensity = 0; });
  }
// ---------------- 鱼 / 卵 ----------------
  const ents = new Map();        // uid → entry
  const anims = [];              // 演出 tween
  let laneN = 0;
  let selected = null, active = false, pan = 0, panV = 0, focusK = 0, t = 0;
  const camLook = LOOK0.clone();
  const hwAt = (z) => Math.max(0.6, (CAM0.z - z) * TANH * camera.aspect);
  const hhAt = (z) => (CAM0.z - z) * TANH;
  const ycAt = (z) => CAM0.y + (LOOK0.y - CAM0.y) / (CAM0.z - LOOK0.z) * (CAM0.z - z);

  function laneZ(uid, L) {
    const k = ((hash(uid) % 1000) / 1000 + laneN++ * 0.618) % 1;
    const z1 = Z_NEAR - Math.max(0, L - 1.4) * 1.5;
    return lerp(Z_FAR, z1, Math.pow(k, 0.85));
  }
  function boundsAt(e, z) {
    const hl = e.L * 0.5, hh = Math.max(0.15, e.H * 0.5);
    const hw = Math.max(hl + 0.1, hwAt(z) * 0.86 - hl), yc = ycAt(z), hH = hhAt(z);
    // v4 构图：鱼群主活动区在屏幕中部偏上（底部 ~140px 会被个人信息卡覆盖；顶部只剩角落按钮）
    const y0 = Math.max(floorAt(0, z) + 0.7 + hh, yc - hH * 0.4 + hh * 0.5), y1 = Math.max(y0 + 0.3, Math.min(3.3, yc + hH * 0.68) - hh);
    return { x0: -hw, x1: hw, y0, y1 };
  }
  function newTarget(e, side) {
    e.side = side ?? -(e.side || (Math.random() < 0.5 ? 1 : -1));
    const z = clamp(e.lane + rand(-0.9, 0.9), Z_FAR, Z_NEAR - Math.max(0, e.L - 1.4) * 1.5);
    const b = boundsAt(e, z);
    const x = e.side > 0 ? rand(lerp(b.x0, b.x1, 0.65), b.x1) : rand(b.x0, lerp(b.x0, b.x1, 0.35));
    e.target.set(x, rand(b.y0, b.y1), z);
    e.retarget = rand(7, 12);
  }
  function makeFish(v) {
    const prev = FISH_STYLE.outline; FISH_STYLE.outline = false;
    let f;
    try { f = new Fish(v, null); } finally { FISH_STYLE.outline = prev; }
    const rm = []; f.root.traverse((o) => { if (o.userData.isOutline || o.userData.outline) rm.push(o); }); rm.forEach((o) => o.parent?.remove(o));
    return f;
  }
  function fitFish(f, L) {
    if (typeof f.fitTank === 'function') { f.fitTank(L); } else f.setScale(L);
    if (f.h > 1.15) f.setScale(f.dispLen * 1.15 / f.h);
    return { L: f.len || L, H: f.h || L * 0.4 };
  }
  function addFish(v, at = null) {
    const uid = v.uid || v.id;
    const f = makeFish(v);
    if (!fishEnv) fishEnv = fishEnvTex(renderer);
    causFish(f.root, 0.65, fishEnv, th.fish?.env ?? 0.9);
    const { L, H } = fitFish(f, Math.min(3.0, tankLen(v) * 2.1));
    f.root.userData.uid = uid; world.add(f.root);
    const e = { kind: 'fish', uid, v, f, L, H, pos: V(), vel: V(rand(-0.3, 0.3), 0, 0), target: V(), lane: 0, speed: lerp(0.5, 0.26, clamp((L - 1.0) / 2.0, 0, 1)), idle: 0, yaw: 0, mode: 'swim', scale: 1, retarget: 0, side: 0 };
    e.lane = laneZ(uid, L);
    const b = boundsAt(e, e.lane);
    if (at) e.pos.copy(at); else e.pos.set(rand(b.x0, b.x1), rand(b.y0, b.y1), e.lane);
    newTarget(e);
    e.yaw = e.target.x > e.pos.x ? 0 : Math.PI;
    e.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#cdf3ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    world.add(e.halo);
    ents.set(uid, e); placeFish(e, 0);
    return e;
  }
  // 卵：完美球体（上下两半共用一个呼吸光 shader，便于孵化时裂开）+ 内核辉光 + 鱼影 + 外圈柔光 + 倒计时环
  function addEgg(egg, at = null) {
    const uid = egg.uid;
    const g = new THREE.Group(); g.userData.uid = uid; world.add(g);
    const shellM = eggShellMat(egg.kind);
    const top = new THREE.Mesh(new THREE.SphereGeometry(EGG_R, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), shellM);
    const bot = new THREE.Mesh(new THREE.SphereGeometry(EGG_R, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellM);
    top.renderOrder = bot.renderOrder = 3;
    const shell = new THREE.Group(); shell.add(top, bot); g.add(shell);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#f2a640', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    core.scale.setScalar(EGG_R * 1.9); core.renderOrder = 1; g.add(core);
    const silMat = new THREE.MeshBasicMaterial({ color: '#7a4d18', transparent: true, opacity: 0.4, depthWrite: false, fog: false });
    let inner = null;
    try {
      inner = makeFish(egg.result);
      inner.setScale(EGG_R * 1.25);
      inner.root.traverse((o) => { if (o.isMesh) { o.material = silMat; o.renderOrder = 2; } });
      g.add(inner.root);
    } catch (err) { inner = null; }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#f0b45a', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(EGG_R * 5); halo.renderOrder = 0; g.add(halo);
    const ringBg = new THREE.Mesh(new THREE.RingGeometry(0.548, 0.572, 64, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.545, 0.575, 64, 1, Math.PI / 2, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#f2d9a6', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    ring.scale.x = -1;
    const ringG = new THREE.Group(); ringG.add(ringBg, ring); g.add(ringG);
    const h = hash(uid);
    const sz = lerp(-1.6, 1.0, ((h >> 20) % 100) / 100);
    const slot = V(((h % 1000) / 1000 - 0.5) * 2 * hwAt(sz) * 0.62, lerp(-0.9, 1.5, ((h >> 10) % 1000) / 1000), sz);
    const e = { kind: 'egg', uid, egg, g, shell, top, bot, inner, silMat, halo, core, ring, ringG, shellM, pos: (at || slot).clone(), slot, mode: 'float', scale: 1, ph: Math.random() * 6, prog: 0, breath: 0.5 };
    ents.set(uid, e); placeEgg(e, 0);
    return e;
  }
  function removeEnt(uid) {
    const e = ents.get(uid); if (!e) return;
    if (e.kind === 'fish') { e.f.dispose(); world.remove(e.halo); e.halo.material.dispose(); }
    else { if (e.inner) { e.inner.root.parent?.remove(e.inner.root); } world.remove(e.g); e.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); e.shellM.dispose(); e.silMat.dispose(); e.core.material.dispose(); e.halo.material.dispose(); }
    ents.delete(uid); if (selected === uid) selected = null;
  }

  function placeFish(e, dt) {
    const f = e.f;
    f.root.position.copy(e.pos);
    f.root.rotation.set(0, e.yaw, clamp(e.vel.y / Math.max(0.1, e.speed), -1, 1) * 0.28);
    if (typeof f.animate === 'function') f.animate(dt, { swimSpeed: e.vel.length() / Math.max(0.1, e.speed), mode: e.mode }); else f.update(dt, 'swim');
    const sel = selected === e.uid;
    e.halo.position.copy(e.pos).add(V(0, 0, -0.3));
    e.halo.material.opacity += ((sel ? 0.32 : 0) - e.halo.material.opacity) * Math.min(1, dt * 5);
    e.halo.scale.setScalar(e.L * 2.2 * e.scale);
  }
  function placeEgg(e, dt) {
    e.g.position.copy(e.pos);
    e.g.scale.setScalar(e.scale);
    const b = e.breath;
    e.shellM.uniforms.uB.value = b;
    if (e.inner) { e.inner.update(dt * 0.6, 'swim'); e.inner.root.position.set(Math.sin(t * 0.5 + e.ph) * 0.03, Math.sin(t * 0.8 + e.ph) * 0.02, 0); e.inner.root.rotation.y = Math.sin(t * 0.45 + e.ph) * 0.9; e.silMat.opacity = 0.4 + 0.3 * b; }
    e.ringG.quaternion.copy(camera.quaternion);
    const n = Math.round(clamp(e.prog, 0, 1) * 64) * 6; e.ring.geometry.setDrawRange(0, n);
    e.ring.material.color.set(e.prog >= 1 ? '#cfe8c4' : '#f2d9a6');
  }

  // 选中：鱼游到前景
  function select(uid) {
    if (selected && ents.get(selected)?.kind === 'fish' && ents.get(selected).mode === 'show') { const p = ents.get(selected); p.mode = 'swim'; newTarget(p); }
    selected = uid || null;
    const e = uid ? ents.get(uid) : null;
    if (e && e.kind === 'fish' && e.mode === 'swim') e.mode = 'show';
  }

  // ---------------- 更新 ----------------
  const tmp = V(), tmp2 = V(), tmp3 = V();
  function updateFish(e, dt) {
    if (e.mode === 'script') { placeFish(e, dt); return; }
    let want;
    if (e.mode === 'show') {
      want = tmp.copy(SHOW).sub(e.pos);
      const d = want.length();
      // 指数逼近（远处的鱼也能很快游到前景），速度用于朝向
      const kk = 1 - Math.exp(-dt * 3.2);
      tmp2.copy(e.pos); e.pos.lerp(SHOW, kk);
      if (dt > 0) e.vel.lerp(tmp2.subVectors(e.pos, tmp2).divideScalar(dt), 0.5);
      const near = d < 0.35;
      let wantYaw = -0.45 + Math.sin(t * 0.8) * 0.12;
      if (!near) { const wy = Math.atan2(-e.vel.z, e.vel.x), sd = Math.cos(wy) >= 0 ? 0 : Math.PI; wantYaw = sd + clamp(angDelta(wy, sd), -0.7, 0.7); }
      e.yaw += angDelta(wantYaw, e.yaw) * Math.min(1, dt * (near ? 2 : 4));
      if (near) e.pos.y += Math.sin(t * 1.6) * 0.002;
      placeFish(e, dt); return;
    }
    e.retarget -= dt;
    // 生活感：到点后有时停下来悬停一会儿（轻轻摆鳍、慢慢漂），再换方向
    if (e.idle > 0) e.idle -= dt;
    else if (e.pos.distanceTo(e.target) < 0.4 || e.retarget <= 0) { if (Math.random() < 0.35) e.idle = rand(1.5, 3.5); newTarget(e); }
    want = tmp.copy(e.target).sub(e.pos).setLength(e.idle > 0 ? e.speed * 0.12 : e.speed);
    for (const o of ents.values()) {
      if (o === e || o.kind !== 'fish') continue;
      tmp2.copy(e.pos).sub(o.pos); const d = tmp2.length(), r = (e.L + o.L) * 0.5;
      if (d < r && d > 1e-3) want.addScaledVector(tmp2.normalize(), (1 - d / r) * e.speed * 1.4);
      // 画面重叠：投影上靠太近（xy 近、z 不同）也轻推开，避免一团
      const dz = Math.abs(tmp2.z), dxy = Math.hypot(tmp2.x, tmp2.y), r2 = (e.L + o.L) * 0.42;
      if (dz < 3 && dxy < r2 && dxy > 1e-3) { want.x += (tmp2.x / dxy) * (1 - dxy / r2) * e.speed * 0.8; want.y += (tmp2.y / dxy) * (1 - dxy / r2) * e.speed * 0.5; }
    }
    // 有鱼被展示时，其它鱼礼让出前景（离开展示位附近与镜头之间的区域）
    const sh = selected && selected !== e.uid ? ents.get(selected) : null;
    if (sh) {
      tmp2.copy(e.pos).sub(sh.pos); const dxy = Math.hypot(tmp2.x, tmp2.y);
      const R = 2.0 + Math.max(0, -tmp2.z) * 0.32;          // 越靠后，投影上越容易与展示鱼重叠 → 礼让半径越大
      if (dxy < R) {
        const k = (1 - dxy / R) * e.speed * 2.6;
        if (dxy > 1e-3) { want.x += (tmp2.x / dxy) * k; want.y += (tmp2.y / dxy) * k * 0.6; } else want.x += k;
        want.z -= k * 0.8;
      }
    }
    e.vel.lerp(want, Math.min(1, dt * (sh ? 1.6 : 0.8)));
    e.vel.y *= 0.96;
    e.pos.addScaledVector(e.vel, dt);
    e.pos.z = clamp(e.pos.z, Z_FAR - 0.5, Z_NEAR + 0.2);
    const b = boundsAt(e, e.pos.z);
    e.pos.x = clamp(e.pos.x, b.x0, b.x1); e.pos.y = clamp(e.pos.y, b.y0, b.y1);
    if (Math.hypot(e.vel.x, e.vel.z) > 0.04) {
      // 偏侧身游：限制正对/背对镜头的角度，鱼尽量展示侧面
      let wy = Math.atan2(-e.vel.z, e.vel.x);
      const side = Math.cos(wy) >= 0 ? 0 : Math.PI; const dv = angDelta(wy, side);
      wy = side + clamp(dv, -0.75, 0.75);
      e.yaw += angDelta(wy, e.yaw) * Math.min(1, dt * 2.2);
    }
    placeFish(e, dt);
  }
  // 呼吸光：~2.6s 周期（孵好后 ~1.6s、更亮），内核/外晕/壳色同步明暗
  function updateEgg(e, dt) {
    if (e.mode !== 'script') {
      const home = selected === e.uid ? SHOW : e.slot;
      e.pos.lerp(tmp.copy(home).add(V(Math.sin(t * 0.4 + e.ph) * 0.08, Math.sin(t * 0.9 + e.ph) * 0.12, 0)), Math.min(1, dt * 1.4));
      const ready = e.prog >= 1;
      const w = (Math.PI * 2) / (ready ? 1.6 : 2.6);
      const b = 0.5 + 0.5 * Math.sin(t * w + e.ph); e.breath = b;
      e.halo.material.opacity = ready ? 0.26 + b * 0.2 : 0.12 + b * 0.16;
      e.halo.scale.setScalar(EGG_R * (4.4 + b * 1.0));
      e.core.material.opacity = ready ? 0.65 + b * 0.3 : 0.42 + b * 0.4;
      e.scale = 1 + b * (ready ? 0.035 : 0.018);
      e.shell.rotation.set(0, t * 0.25, Math.sin(t * 0.8 + e.ph) * 0.05);
      if (ready && Math.sin(t * 1.3) > 0.7) e.shell.rotation.z += Math.sin(t * 22) * 0.04;
    }
    placeEgg(e, dt);
  }

  const camTarget = V(), lookTarget = V();
  function updateCamera(dt, snap = false) {
    pan += panV * dt; panV *= Math.exp(-dt * 4);
    if (!drag) pan += (0 - pan) * Math.min(1, dt * 0.3);
    pan = clamp(pan, -1, 1);
    const sel = selected ? ents.get(selected) : null;
    focusK += ((sel ? 1 : 0) - focusK) * Math.min(1, dt * 2.2);
    // 基础机位：漂浮感（轻微呼吸）+ 左右视差
    lookTarget.set(LOOK0.x + pan * 0.55, LOOK0.y, LOOK0.z);
    camTarget.set(CAM0.x + pan * 1.5 + Math.sin(t * 0.23) * 0.08, CAM0.y + Math.sin(t * 0.31) * 0.06, CAM0.z);
    if (sel) {
      const d = sel.kind === 'fish' ? clamp(1.5 + sel.L * 3.0, 2.9, 9) : 3.6;
      tmp.set(sel.pos.x * 0.75 + pan * 0.3, sel.pos.y - 0.155 * d, sel.pos.z);          // 卡片在下方：鱼落在画面上 1/3
      tmp3.set(tmp.x + pan * 0.6, tmp.y + 0.3, Math.min(CAM0.z, tmp.z + d));
      lookTarget.lerp(tmp, focusK); camTarget.lerp(tmp3, focusK);
    }
    spot.intensity += ((sel ? 9 : 0) - spot.intensity) * Math.min(1, dt * 3);
    if (sel) spot.position.set(sel.pos.x + 0.6, sel.pos.y + 1.0, sel.pos.z + 1.4);
    veil.material.opacity = 0.42 * focusK; veil.visible = focusK > 0.01;
    if (sel) { veil.position.set(sel.pos.x, sel.pos.y, sel.pos.z - Math.max(0.9, (sel.L || 1) * 0.7)); veil.scale.setScalar(9); }
    veil.quaternion.copy(camera.quaternion);
    const k = snap ? 1 : Math.min(1, dt * 3);
    camLook.lerp(lookTarget, k); camera.position.lerp(camTarget, k);
    camera.lookAt(camLook);
    env?.update(t, camera);
  }

  function update(dt) {
    if (!active) return;
    t += dt; W.uT.value = t;
    for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k, dt); if (k >= 1) { anims.splice(i, 1); a.done?.(); } }
    for (const e of ents.values()) e.kind === 'fish' ? updateFish(e, dt) : updateEgg(e, dt);
    key.intensity = keyI * (1 + Math.sin(t * 1.7) * 0.05 + Math.sin(t * 2.9) * 0.035);
    updateCamera(dt);
  }

  // ---------------- 演出 ----------------
  const tween = (dur, fn) => new Promise((res) => anims.push({ t: 0, dur, fn, done: res }));
  function burst(at, color = '#ffffff', n = 50, power = 1.8, size = 0.14, grav = 0.3) {
    const geo = new THREE.BufferGeometry(); const p = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { p.set([at.x, at.y, at.z], i * 3); vel.push(V(rand(-1, 1), rand(-0.6, 1.1), rand(-0.5, 0.9)).normalize().multiplyScalar(rand(0.4, 1) * power)); }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ map: dotTex, color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const pts = new THREE.Points(geo, mat); world.add(pts);
    tween(1.4, (k, dt) => {
      for (let i = 0; i < n; i++) { p[i * 3] += vel[i].x * dt; p[i * 3 + 1] += vel[i].y * dt; p[i * 3 + 2] += vel[i].z * dt; vel[i].multiplyScalar(0.93); vel[i].y += dt * grav; }
      geo.attributes.position.needsUpdate = true; mat.opacity = 1 - k * k;
    }).then(() => { world.remove(pts); geo.dispose(); mat.dispose(); });
  }
  function bubbleBurst(at, n = 24, spread = 0.4) {
    const geo = new THREE.BufferGeometry(); const p = new Float32Array(n * 3), sp = [];
    for (let i = 0; i < n; i++) { p.set([at.x + rand(-spread, spread), at.y + rand(-spread, spread) * 0.5, at.z + rand(-spread, spread) * 0.6], i * 3); sp.push(rand(0.8, 2.0)); }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ map: bubbleTex, color: '#eafcff', size: 0.11, transparent: true, depthWrite: false, fog: false });
    const pts = new THREE.Points(geo, mat); world.add(pts);
    tween(1.8, (k, dt) => { for (let i = 0; i < n; i++) { p[i * 3 + 1] += sp[i] * dt; p[i * 3] += Math.sin(t * 4 + i) * 0.004; } geo.attributes.position.needsUpdate = true; mat.opacity = 1 - k; })
      .then(() => { world.remove(pts); geo.dispose(); mat.dispose(); });
  }
  function flash(at, color, s0, s1, dur, peak = 1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.position.copy(at); world.add(sp);
    return tween(dur, (k) => { sp.scale.setScalar(lerp(s0, s1, ease(k))); sp.material.opacity = peak * (k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7); }).then(() => { world.remove(sp); sp.material.dispose(); });
  }

  // 突变专属：从水面直射下来的光柱（两层加色锥 + 旋转光环 + 金色微粒），~2.6s
  function pillar(at, color) {
    const g = new THREE.Group(); g.position.copy(at); world.add(g);
    const mk = (r, op) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.6, r, 10, 24, 1, true), new THREE.MeshBasicMaterial({ map: rayTex, color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false })); m.position.y = 4.8; m.userData.op = op; g.add(m); return m; };
    const a = mk(0.6, 0.55), b = mk(0.26, 0.9);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 8, 64), new THREE.MeshBasicMaterial({ color: '#fff7e0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    burst(at, '#ffe7a8', 60, 2.6, 0.18); burst(at, color, 40, 2.0, 0.15);
    flash(at, color, 1, 6, 1.4, 0.8);
    tween(2.6, (k) => {
      const f = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      for (const m of [a, b]) { m.material.opacity = m.userData.op * f; }
      g.rotation.y += 0.03;
      ring.material.opacity = f * 0.8; ring.position.y = (k * 3) % 1.5; ring.scale.setScalar(1 + k * 0.8);
    }).then(() => { world.remove(g); g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); });
  }
  // 改造开始：鱼游到中央 → 光包裹 → 变卵
  async function playEggify(uids, egg) {
    selected = null;
    const es = uids.map((u) => ents.get(u)).filter(Boolean);
    const from = es.map((e) => e.pos.clone());
    es.forEach((e) => { e.mode = 'script'; });
    const glow = '#ffcf6a';
    await tween(1.1, (k) => es.forEach((e, i) => {
      const off = es.length > 1 ? (i ? 0.5 : -0.5) * (1 - k) : 0;
      e.pos.lerpVectors(from[i], tmp.copy(EGG_C).add(V(off, 0, 0)), ease(k));
      e.yaw += angDelta(-0.4 + i * 0.8, e.yaw) * 0.1;
    }));
    const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), new THREE.MeshBasicMaterial({ color: '#fff3d2', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    wrap.position.copy(EGG_C); world.add(wrap);
    flash(EGG_C, glow, 0.5, 3.0, 1.0, 0.8);
    const k0 = es.map((e) => e.f.root.scale.x);
    await tween(0.8, (k) => {
      wrap.material.opacity = ease(k) * 0.6; wrap.scale.setScalar(lerp(0.4, 0.95, ease(k)));
      es.forEach((e, i) => { e.f.root.scale.setScalar(k0[i] * (1 - ease(k) * 0.9)); e.yaw += 0.2; });
    });
    uids.forEach(removeEnt);
    const ee = addEgg(egg, EGG_C); ee.mode = 'script'; ee.scale = 0.01;
    burst(EGG_C, glow, 36, 1.4, 0.13); bubbleBurst(EGG_C, 16, 0.3);
    await tween(0.6, (k) => { ee.scale = easeOutBack(k); wrap.material.opacity = 0.7 * (1 - k); });
    world.remove(wrap); wrap.geometry.dispose(); wrap.material.dispose();
    ee.mode = 'float';
    return ee;
  }

  // 孵化：抖动 → 裂开 → 光爆 → 新鱼亮相（亮相后停在前景，等揭晓卡关闭）
  async function playHatch(uid, v) {
    const e = ents.get(uid); if (!e) { addFish(v); return; }
    selected = null; e.mode = 'script';
    const from = e.pos.clone();
    const glow = '#ffcf6a';
    // 球体抖动（越来越剧烈）→ 裂纹光蔓延 → 光爆
    await tween(1.3, (k) => {
      e.pos.lerpVectors(from, EGG_C, ease(Math.min(1, k * 1.6)));
      const a = 0.02 + k * k * 0.2;
      e.shell.rotation.z = Math.sin(t * 38) * a; e.shell.rotation.x = Math.cos(t * 31) * a * 0.6;
      e.g.position.x += Math.sin(t * 45) * 0.012 * k;
      e.breath = 0.5 + 0.5 * k; e.shellM.uniforms.uB.value = e.breath;
      e.halo.material.opacity = 0.3 + k * 0.4; e.halo.scale.setScalar(EGG_R * (5 + k * 3)); e.core.material.opacity = 0.6 + k * 0.4;
      e.shellM.uniforms.uCrack.value = k > 0.35 ? (k - 0.35) / 0.65 : 0;
      e.scale = 1 + Math.sin(t * 20) * 0.025 * k + k * 0.05;
    });
    flash(EGG_C, '#fff4dc', 0.6, 4.2, 0.9, 0.75);
    burst(EGG_C, '#fff1c8', 60, 2.2, 0.16); burst(EGG_C, glow, 36, 1.6, 0.13); bubbleBurst(EGG_C, 26, 0.45);
    if (v.mut) pillar(EGG_C, String(v.mut).includes('rare') ? '#ffd88a' : '#f0b89a');
    const ne = addFish(v, EGG_C); ne.mode = 'script'; const k1 = ne.f.root.scale.x; ne.f.root.scale.setScalar(0.001); ne.yaw = -0.45;
    selected = ne.uid;
    await tween(0.9, (k) => {
      e.top.position.y = ease(k) * 0.9; e.top.rotation.z = k * 1.2; e.top.position.x = -k * 0.4;
      e.bot.position.y = -ease(k) * 0.6; e.bot.rotation.z = -k * 0.8; e.bot.position.x = k * 0.3;
      e.shellM.uniforms.uOp.value = 1 - k; e.halo.material.opacity = 0.7 * (1 - k); e.core.material.opacity = 1 - k; e.ringG.visible = false;
      if (e.inner) e.inner.root.visible = false;
      ne.f.root.scale.setScalar(k1 * Math.max(0.001, easeOutBack(k)));
      ne.pos.copy(EGG_C).lerp(SHOW, ease(k));
    });
    removeEnt(uid);
    ne.mode = 'show'; selected = ne.uid;
    return ne;
  }

  // 放生：鱼转身向上，游向水面的光里，越游越远、渐隐
  async function playRelease(uid) {
    const e = ents.get(uid); if (!e) return;
    selected = null; e.mode = 'script';
    const from = e.pos.clone(), k0 = e.f.root.scale.x;
    const dir = from.x >= 0 ? 1 : -1;
    const mid = V(from.x * 0.6 + dir * 0.3, from.y + 0.9, from.z - 0.6);
    const out = V(dir * 2.2, 7.2, Math.min(from.z, 0) - 7);
    bubbleBurst(from, 18, 0.25);
    await tween(0.7, (k) => {
      e.pos.lerpVectors(from, mid, ease(k));
      e.yaw += angDelta(dir > 0 ? 0.25 : Math.PI - 0.25, e.yaw) * 0.12;
      e.f.root.rotation.z = (dir > 0 ? 1 : -1) * 0.55 * ease(k);
    });
    flash(V(out.x * 0.5, 5.5, out.z * 0.5), '#eafff6', 2, 6, 1.4, 0.35);
    let last = 0;
    await tween(1.4, (k) => {
      const kk = ease(k);
      e.pos.lerpVectors(mid, out, kk);
      e.f.root.rotation.z = (dir > 0 ? 1 : -1) * 0.7;
      e.f.root.scale.setScalar(k0 * (1 - k * 0.55));
      if (k - last > 0.18) { last = k; bubbleBurst(e.pos, 5, 0.12); }
    });
    removeEnt(uid);
  }

  // ---------------- 同步 / 拾取 ----------------
  function sync(tank) {
    const keep = new Set();
    for (const x of tank) {
      if (!x || (!x.egg && (!SPECIES_BY_ID[x.sp] || SPECIES_BY_ID[x.sp].odd || x.item))) continue;   // v4 最后防线：宝箱/漂流物/道具不渲染进水族箱
      const uid = x.uid || x.id; keep.add(uid);
      const e = ents.get(uid);
      if (!e) x.egg ? addEgg(x) : addFish(x);
      else if (e.kind === 'egg') e.egg = x;
    }
    for (const [uid, e] of [...ents]) if (!keep.has(uid) && e.mode !== 'script') removeEnt(uid);
  }
  function clear() { for (const uid of [...ents.keys()]) removeEnt(uid); anims.length = 0; }
  function setEggProgress(uid, prog) { const e = ents.get(uid); if (e && e.kind === 'egg') e.prog = prog; }

  const _p = V();
  function screenPos(uid, W, H, out = {}) {
    const e = ents.get(uid); if (!e) { out.vis = false; return out; }
    _p.copy(e.pos); if (e.kind === 'egg') _p.y += 0.85 * e.scale;
    world.localToWorld(_p); _p.project(camera);
    out.vis = _p.z < 1; out.x = (_p.x * 0.5 + 0.5) * W; out.y = (-_p.y * 0.5 + 0.5) * H;
    return out;
  }
  // 屏幕空间就近拾取（小鱼/远鱼也好点）：半径 = max(44px, 投影半长)；近处优先
  function pickAt(x, y, W, H) {
    let best = null, bd = 1e9;
    for (const e of ents.values()) {
      if (e.mode === 'script') continue;
      _p.copy(e.pos); world.localToWorld(_p); const d0 = _p.distanceTo(camera.position); _p.project(camera);
      if (_p.z > 1) continue;
      const sx = (_p.x * 0.5 + 0.5) * W, sy = (-_p.y * 0.5 + 0.5) * H;
      const pxPerM = H / (2 * TANH * d0);
      const r = Math.max(44, (e.kind === 'fish' ? e.L * 0.55 : 0.6) * pxPerM);
      const d = Math.hypot(sx - x, sy - y);
      const score = d / r + d0 * 0.01;
      if (d < r && score < bd) { bd = score; best = e.uid; }
    }
    return best;
  }

  // ---------------- 输入：左右拖动 = 视差平移；轻点 = 拾取 ----------------
  let drag = null;
  const canvas = renderer.domElement;
  let onTap = null;
  canvas.addEventListener('pointerdown', (e) => { if (!active) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: 0 }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!active || !drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    if (drag.moved > 8) { pan = clamp(pan - dx * 0.0042, -1, 1); panV = -dx * 0.12; }
  });
  const up = (e) => {
    if (!active || !drag || drag.id !== e.pointerId) { drag = null; return; }
    const tap = drag.moved <= 8; drag = null;
    if (tap && onTap) { const r = canvas.getBoundingClientRect(); onTap(pickAt(e.clientX - r.left, e.clientY - r.top, r.width, r.height)); }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { drag = null; });

  function render() {
    // 防闪白安全钳：曝光限定在 [0.85, 1.12]（主题微调），ACES；只有发光体（卵/光束/冷光）用加色
    const exp = renderer.toneMappingExposure, sh = renderer.shadowMap.enabled;
    renderer.toneMappingExposure = clamp(th.light.exp || 1, 0.85, 1.12); renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    renderer.toneMappingExposure = exp; renderer.shadowMap.enabled = sh;
  }
  function resize(Wd, Hd) { camera.aspect = Wd / Math.max(1, Hd); camera.updateProjectionMatrix(); uPx.value = Hd * renderer.getPixelRatio() / (2 * TANH); }

  return {
    scene, camera, ents,
    get active() { return active; },
    get selected() { return selected; },
    set onTap(fn) { onTap = fn; },
    get theme() { return themeId; },
    setTheme,
    open(tank, Wd, Hd, opts = {}) {
      setTheme(opts.theme || themeId || DEFAULT_THEME);
      active = true; resize(Wd, Hd);
      if (opts.reset) clear();
      sync(tank); pan = 0; panV = 0; focusK = 0; selected = null;
      camera.position.copy(CAM0).add(V(0, 0.4, 1.2)); camLook.copy(LOOK0); update(0.016);
    },
    close() { active = false; selected = null; drag = null; },
    clear, sync, update, render, resize, select, screenPos, pickAt, setEggProgress, playEggify, playHatch, playRelease,
    busy: () => anims.length > 0,
  };
}
