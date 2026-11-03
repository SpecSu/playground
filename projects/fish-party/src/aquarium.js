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
const Z_NEAR = 1.5, Z_FAR = -8.0;           // 鱼群纵深范围（v5：加深，大鱼放到后面——那里画面更宽）
// v5 可视区（归一化屏幕坐标，±1 = 画面边缘）：顶部留给角落按钮，底部留给主人卡；左右留一点边
const SCR = { top: 0.8, bot: -0.6, side: 0.94 };
const SHOW = V(0, 0.5, 3.2);                 // 被选中的鱼游到这里（前景）
const EGG_C = V(0, 0.35, 2.4);               // 卵变/孵化演出中心
export const TANK = { w: 4, h: 5.5, d: Z_NEAR - Z_FAR };

// v0.9 C 鱼的显示体长（世界单位，= 含部件的最长水平跨度）：按 cm 的 0.65 次幂映射，尺寸差明显拉开
//   12cm 小丑鱼 ≈0.45 · 30cm ≈0.8 · 1m ≈1.75 · 3m ≈3.6 · 6.5m 虎鲸/鲸鲨 ≈6.0（后景也会撑出画面）
//   旧版是 log 映射 + fitTank 的 sqrt 二次压缩 → 小丑鱼和鲸鲨在屏幕上只差 ~2 倍
export const TANK_L = { k: 0.45, ref: 12, p: 0.65, min: 0.38, max: 7.2 };
export function tankLen(v) {
  const cm = Math.max(6, v.cm || 30);
  let L = TANK_L.k * Math.pow(cm / TANK_L.ref, TANK_L.p);
  const gs = v.gx?.scale || 1; if (gs > 1.01) L *= Math.min(1.3, 0.9 + gs * 0.16);
  return clamp(L, TANK_L.min, TANK_L.max);
}
const SHOW_L = 2.3;   // 被选中 / 孵化亮相时的最大显示体长（巨型鱼游到前景时临时缩小，避免糊满屏、穿近裁剪面）

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

  // ---------------- v5 空间分布：按视锥算可视体积 · best-candidate 分散目标 · 屏幕空间分离 · 避障 ----------------
  const uOf = (x, z) => x / hwAt(z);                       // 归一化屏幕坐标（基础机位）
  const vOf = (y, z) => (y - ycAt(z)) / hhAt(z);
  const ceilY = () => (th.ice ? 5.6 : 7.5);
  // 每条鱼的纵深范围：大鱼只在靠后处（半长 ≤ ~0.48 画面半宽），小鱼偏前（太远会小得看不清）
  function zRange(e) {
    // v0.9 C：不再要求整条鱼塞进画面 —— 小鱼可以游到前景，大鱼按体长退到后景（大鱼 ~1m 起逐步后退，6m 级只在最深处慢游）
    //   近端 z1 还要保证体长 ≤ ~1.1 个画面宽（巨型鱼最多出屏一截，不会糊满屏 / 靠近镜头）
    const zFit = CAM0.z - (e.L * 0.45) / (TANH * Math.max(0.3, camera.aspect));
    const s = clamp((e.L - 0.9) / 4.6, 0, 1);
    //   小鱼也不再贴到镜头前（z ≤ 0.2）：纵深压缩后透视不会把「近处小鱼」放大到和「远处大鱼」一样大
    const z1 = clamp(Math.min(lerp(0.2, Z_FAR + 2.6, Math.pow(s, 0.6)), zFit), Z_FAR + 1.0, Z_NEAR);
    const z0 = lerp(-3.8, Z_FAR, clamp((e.L - 0.5) / 1.6, 0, 1));   // 小鱼别太靠后（远了小得看不清）
    return [Math.min(z0, z1 - 1.2), z1];
  }
  function boundsAt(e, z, x = 0) {
    // v0.9 C：边界按鱼的「中心」算 —— 只留出一小截体长（≤0.2 画面半宽），大鱼游到边上会明显出屏，小鱼基本整条可见
    const hl = e.L * 0.5, hh = Math.max(0.12, e.H * 0.5);
    const hw = hwAt(z), yc = ycAt(z), hH = hhAt(z);
    const xm = Math.max(0.05, hw * SCR.side - Math.min(hl, hw * 0.2));
    const fy = Math.max(floorAt(x, z), floorAt(x - hl * 0.7, z), floorAt(x + hl * 0.7, z));
    const hs = Math.min(hh, hH * 0.22);   // 屏幕上下边：同样按中心 + 一小截
    const y0 = Math.max(fy + 0.75 + hh, yc + hH * SCR.bot + hs);
    const y1 = Math.max(y0 + 0.2, Math.min(yc + hH * SCR.top, ceilY()) - hs);
    return { x0: -xm, x1: xm, y0, y1 };
  }
  // 避障：与布景（岩石 / 柱子 / 树根 / 冰柱）的竖直圆柱求穿透；返回 { c, d, dx, dz, R, up, down, side } 或 null
  const colHit = {};
  function hitCollider(e, x, y, z, pad = 0) {
    const cs = env?.colliders; if (!cs) return null;
    const hh = e.H * 0.5 + 0.1 + pad, rr = e.L * 0.38 + pad;
    for (const c of cs) {
      if (c.z < Z_FAR - 3 || c.z > Z_NEAR + 2) continue;
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), R = c.r + rr;
      if (d >= R || y < c.y0 - hh || y > c.y1 + hh) continue;
      colHit.c = c; colHit.d = d; colHit.dx = dx; colHit.dz = dz; colHit.R = R;
      colHit.up = c.y1 < 50 ? c.y1 + hh - y : 1e9; colHit.down = c.y0 > -50 ? y - (c.y0 - hh) : 1e9; colHit.side = R - d;
      return colHit;
    }
    return null;
  }
  function sampleIn(e) {
    const [z0, z1] = zRange(e);
    // 横向用反正弦分布采样（两端更密）：鱼在两个目标点之间往返时，时间平均会天然偏向中间，这里把端点往两侧推来抵消
    const z = rand(z0, z1), xr = boundsAt(e, z).x1;
    let x = xr * Math.sin((Math.random() - 0.5) * Math.PI);
    if (e.opp) x = -Math.sign(e.pos.x || 1) * xr * rand(0.45, 1);   // v0.9.1 大鱼：目标放到对侧远端 → 长距离穿越整屏
    const b = boundsAt(e, z, x);
    return V(x, rand(b.y0, b.y1), z);
  }
  // 评分：屏幕上离其它鱼（当前位置 + 目标）/ 卵越远越好（按体型归一化）；偏好横向长距离巡游、坡度平缓、不进石头
  function scoreAt(e, p, cur) {
    const u = uOf(p.x, p.z), v = vOf(p.y, p.z), ru = (e.L * 0.5) / hwAt(p.z), rv = (e.H * 0.5) / hhAt(p.z);
    let best = 3;
    for (const o of ents.values()) {
      if (o === e || (o.kind !== 'fish' && o.kind !== 'egg') || o.out > 0) continue;
      const oL = o.kind === 'fish' ? o.L : 0.9, oH = o.kind === 'fish' ? o.H : 0.9;
      for (let k = 0; k < (o.kind === 'fish' ? 2 : 1); k++) {
        const q = k ? o.target : o.pos; if (!q) continue;
        const ou = uOf(q.x, q.z), ov = vOf(q.y, q.z), su = ru + (oL * 0.5) / hwAt(q.z), sv = rv + (oH * 0.5) / hhAt(q.z) + 0.04;
        const d = Math.hypot((u - ou) / su, (v - ov) / sv) + Math.min(1, Math.abs(p.z - q.z) / 3) * 0.35;
        if (d < best) best = d;
      }
    }
    let s = best;
    if (cur) {
      const du = Math.abs(u - uOf(cur.x, cur.z));
      if (du < 0.35) s -= 0.6 * (1 - du / 0.35);
      if (Math.abs(p.z - cur.z) > 2.6) s -= 0.35;
      if (Math.abs(p.y - cur.y) > (Math.abs(p.x - cur.x) + 0.4) * 0.8) s -= 0.3;
    }
    if (hitCollider(e, p.x, p.y, p.z, 0.15)) s -= 5;
    return s;
  }
  function pickSpot(e, cur, n = 12) {
    let bp = null, bs = -1e9;
    for (let i = 0; i < n; i++) { const p = sampleIn(e), s = scoreAt(e, p, cur); if (s > bs) { bs = s; bp = p; } }
    return bp;
  }
  // v0.9.1 游出屏幕：边界一律按 1× 全景的「缸世界宽度」hwAt(z)（与相机缩放/平移无关）
  const bigK = (e) => clamp((e.L - 0.9) / 2, 0, 1);
  const offX = (e, z) => hwAt(z) + e.L * 0.6;                        // 中心超过它 = 整条出屏
  function canExit(e) {
    if (e.mode !== 'swim' || selected === e.uid) return false;
    let n = 0, out = 0;
    for (const o of ents.values()) if (o.kind === 'fish') { n++; if (o.exit || o.out > 0) out++; }
    return out + 1 <= Math.floor(n * 0.3) && n - out - 1 >= 3;
  }
  function newTarget(e) {
    if (e.exit || e.out > 0) return;                                   // 出屏途中不改主意
    const big = bigK(e), hd = Math.abs(e.vel.x) > 0.03 ? Math.sign(e.vel.x) : Math.sign(e.pos.x || 1);
    if (canExit(e) && Math.random() < lerp(0.18, 0.6, big)) {          // 顺着当前朝向游出屏（大鱼更常见）
      e.exit = hd; e.enter = 0;
      e.target.set(hd * (offX(e, e.pos.z) + 0.6), e.pos.y + rand(-0.3, 0.3), e.pos.z);
      e.side = hd; e.retarget = 60; e.crowd = 0; return;
    }
    e.opp = big > 0.15 && Math.random() < 0.5 + 0.45 * big;
    e.target.copy(pickSpot(e, e.pos, 16)); e.opp = false;
    // v0.9.1：大鱼尽量顺着当前朝向继续游（目标在身后 → 镜像到前方），减少原地掉头；前方空间不够就干脆出屏
    if (big > 0.3 && Math.sign(e.target.x - e.pos.x) !== hd && Math.random() < 0.85) {
      const bx = boundsAt(e, e.target.z, 0).x1, nx = e.pos.x + hd * Math.max(1.2, Math.abs(e.target.x - e.pos.x));
      if (Math.abs(nx) <= bx) e.target.x = nx;
      else if (canExit(e)) { e.exit = hd; e.enter = 0; e.target.set(hd * (offX(e, e.pos.z) + 0.6), e.pos.y + rand(-0.3, 0.3), e.pos.z); e.side = hd; e.retarget = 60; e.crowd = 0; return; }
    }
    e.side = e.target.x >= e.pos.x ? 1 : -1;
    e.retarget = clamp(e.pos.distanceTo(e.target) / Math.max(0.1, e.speed) * 1.4, 6, lerp(18, 40, big)) + rand(0, 2);
    e.crowd = 0;
  }
  // 重新铺开（重进水族箱时不重建鱼，只把位置打散到整个可视体积）
  function scatter() {
    const fish = [...ents.values()].filter((e) => e.kind === 'fish' && e.mode === 'swim');
    for (const e of fish) { e.exit = e.enter = e.out = 0; e.pos.set(0, -50, -50); e.target.copy(e.pos); }        // 先移开，避免互相参照旧位置
    for (const e of fish) { e.pos.copy(pickSpot(e, null, 16)); e.target.copy(e.pos); newTarget(e); e.vel.set(e.side * e.speed * 0.6, 0, 0); e.yaw = e.side > 0 ? 0 : Math.PI; placeFish(e, 0); }
  }
  function makeFish(v) {
    const prev = FISH_STYLE.outline; FISH_STYLE.outline = false;
    let f;
    try { f = new Fish(v, null); } finally { FISH_STYLE.outline = prev; }
    const rm = []; f.root.traverse((o) => { if (o.userData.isOutline || o.userData.outline) rm.push(o); }); rm.forEach((o) => o.parent?.remove(o));
    return f;
  }
  // v0.9 C：先用 Fish.fitTank 算包围盒，再整体缩放到「最长跨度 = L」（绕开 fitTank 内部的 sqrt 压缩）；体高 ≤ 0.8L 且 ≤ max(1.15, 0.55L)
  function fitFish(f, L) {
    if (typeof f.fitTank !== 'function') { f.setScale(L); return { L: f.len || L, H: f.h || L * 0.4 }; }
    f.fitTank(L);
    const span = Math.max(f.len || 0, f.w || 0, 1e-3), h = Math.max(f.h || 0, 1e-3);
    const vert = h > span * 1.25;                       // 海马 / 水母：按身高算体长
    let r = (vert ? L / h : L / span);
    r = Math.min(r, (L * 0.8) / h, Math.max(1.15, L * 0.55) / h);
    f.root.scale.multiplyScalar(r);
    f.len *= r; f.h *= r; f.w *= r; f.belly *= r; f.dispLen *= r; if (f.tankK) f.tankK *= r;
    return { L: Math.max(f.len, vert ? f.h * 0.6 : 0), H: f.h };
  }
  function addFish(v, at = null) {
    const uid = v.uid || v.id;
    const f = makeFish(v);
    if (!fishEnv) fishEnv = fishEnvTex(renderer);
    causFish(f.root, 0.65, fishEnv, th.fish?.env ?? 0.9);
    const { L, H } = fitFish(f, tankLen(v));
    f.root.userData.uid = uid; world.add(f.root);
    // v0.9 C：大鱼游得更慢（后景缓慢巡游，不长时间挡屏）；k0 = 正常缩放，sk = 展示时的临时缩放系数
    const e = { kind: 'fish', uid, v, f, L, H, k0: f.root.scale.x, sk: 1, pos: V(), vel: V(rand(-0.3, 0.3), 0, 0), target: V(), speed: lerp(0.55, 0.26, clamp((L - 0.6) / 4.0, 0, 1)) + Math.max(0, L - 2.5) * 0.09,   /* v0.9.1：巨型鱼绝对速度随体长补偿（7m 鲸鲨 ≈0.66m/s ≈ 每秒 0.1 个身长），慢而从容地穿越整屏，不再像定住 */ idle: 0, yaw: 0, mode: 'swim', scale: 1, retarget: 0, side: 0, crowd: 0 };
    if (at) e.pos.copy(at); else e.pos.copy(pickSpot(e, null, 16));
    newTarget(e);
    e.vel.set(e.side * e.speed * 0.5, 0, 0);
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
    // v0.9.1：卵里不再放「最终那条鱼」的剪影（会剧透孵化结果）。基因卵里只有一团看不清的胚胎光核；
    // 旧 kind 卵（prompt/items/fuse 改造的是已知的鱼）保留原剪影。
    let inner = null;
    if (egg.kind !== 'synth') try {
      inner = makeFish(egg.result);
      inner.setScale(EGG_R * 1.25);
      inner.root.traverse((o) => { if (o.isMesh) { o.material = silMat; o.renderOrder = 2; } });
      g.add(inner.root);
    } catch (err) { inner = null; }
    // 基因卵：一团缓慢旋转、随进度长大的模糊胚胎（看不出任何形态）
    let embryo = null;
    if (!inner) {
      embryo = new THREE.Mesh(new THREE.IcosahedronGeometry(EGG_R * 0.32, 2), silMat);
      embryo.renderOrder = 2; g.add(embryo);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#f0b45a', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(EGG_R * 5); halo.renderOrder = 0; g.add(halo);
    const ringBg = new THREE.Mesh(new THREE.RingGeometry(0.548, 0.572, 64, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.545, 0.575, 64, 1, Math.PI / 2, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#f2d9a6', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    ring.scale.x = -1;
    const ringG = new THREE.Group(); ringG.add(ringBg, ring); g.add(ringG);
    const h = hash(uid);
    const sz = lerp(-1.6, 1.0, ((h >> 20) % 100) / 100);
    const slot = V(((h % 1000) / 1000 - 0.5) * 2 * hwAt(sz) * 0.62, lerp(-0.9, 1.5, ((h >> 10) % 1000) / 1000), sz);
    const e = { kind: 'egg', uid, egg, g, shell, top, bot, inner, embryo, silMat, halo, core, ring, ringG, shellM, pos: (at || slot).clone(), slot, mode: 'float', scale: 1, ph: Math.random() * 6, prog: 0, breath: 0.5 };
    ents.set(uid, e); placeEgg(e, 0);
    return e;
  }
  function removeEnt(uid) {
    const e = ents.get(uid); if (!e) return;
    if (e.kind === 'fish') { e.f.dispose(); world.remove(e.halo); e.halo.material.dispose(); }
    else { if (e.inner) { e.inner.root.parent?.remove(e.inner.root); } world.remove(e.g); e.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); e.shellM.dispose(); e.silMat.dispose(); e.core.material.dispose(); e.halo.material.dispose(); }
    ents.delete(uid); if (selected === uid) selected = null;
  }

  const showK = (e) => Math.min(1, SHOW_L / Math.max(0.1, e.L));
  const effL = (e) => e.L * (e.sk ?? 1);
  function placeFish(e, dt) {
    const f = e.f;
    if (e.mode !== 'script' && e.k0) {   // 巨型鱼被选中 → 游到前景的同时平滑缩小；回到鱼群时恢复
      const want = e.mode === 'show' ? showK(e) : 1;
      e.sk += (want - e.sk) * Math.min(1, dt * 3);
      f.root.scale.setScalar(e.k0 * e.sk);
    }
    f.root.position.copy(e.pos);
    f.root.rotation.set(0, e.yaw, clamp(e.vel.y / Math.max(0.1, e.speed), -1, 1) * 0.28);
    if (typeof f.animate === 'function') f.animate(dt, { swimSpeed: e.vel.length() / Math.max(0.1, e.speed), mode: e.mode }); else f.update(dt, 'swim');
    const sel = selected === e.uid;
    e.halo.position.copy(e.pos).add(V(0, 0, -0.3));
    e.halo.material.opacity += ((sel ? 0.32 : 0) - e.halo.material.opacity) * Math.min(1, dt * 5);
    e.halo.scale.setScalar(effL(e) * 2.2 * e.scale);
  }
  function placeEgg(e, dt) {
    e.g.position.copy(e.pos);
    e.g.scale.setScalar(e.scale);
    const b = e.breath;
    e.shellM.uniforms.uB.value = b;
    if (e.inner) { e.inner.update(dt * 0.6, 'swim'); e.inner.root.position.set(Math.sin(t * 0.5 + e.ph) * 0.03, Math.sin(t * 0.8 + e.ph) * 0.02, 0); e.inner.root.rotation.y = Math.sin(t * 0.45 + e.ph) * 0.9; e.silMat.opacity = 0.4 + 0.3 * b; }
    if (e.embryo) {
      const k = 0.7 + 0.6 * clamp(e.prog, 0, 1), w = 1 + 0.06 * Math.sin(t * 2.1 + e.ph);
      e.embryo.scale.set(k * w * 1.15, k / w * 0.9, k * w);
      e.embryo.rotation.set(Math.sin(t * 0.4 + e.ph) * 0.6, t * 0.35, Math.cos(t * 0.3) * 0.4);
      e.silMat.opacity = 0.22 + 0.22 * b;
    }
    e.ringG.quaternion.copy(camera.quaternion);
    const n = Math.round(clamp(e.prog, 0, 1) * 64) * 6; e.ring.geometry.setDrawRange(0, n);
    e.ring.material.color.set(e.prog >= 1 ? '#cfe8c4' : '#f2d9a6');
  }

  // 选中：鱼游到前景
  function select(uid) {
    if (selected && ents.get(selected)?.kind === 'fish' && ents.get(selected).mode === 'show') { const p = ents.get(selected); p.mode = 'swim'; newTarget(p); }
    selected = uid || null;
    orb.yaw = orb.pitch = orb.vy = orb.vp = 0; orb.dist = 1;
    const e = uid ? ents.get(uid) : null;
    if (e && e.kind === 'fish' && e.mode === 'swim') { e.mode = 'show'; e.exit = e.enter = e.out = 0; }
  }

  // ---------------- 更新 ----------------
  const tmp = V(), tmp2 = V(), tmp3 = V(), sep = V();
  function reenter(e) {   // 屏外等够了 → 从另一侧屏外（可换深度/高度）朝屏内游回
    const sd = -(e.exit || 1), [z0, z1] = zRange(e), z = rand(z0, z1), b = boundsAt(e, z);
    e.pos.set(sd * (offX(e, z) + 0.15), rand(b.y0, b.y1), z);
    e.vel.set(-sd * e.speed * 0.8, 0, 0); e.yaw = sd > 0 ? Math.PI : 0;
    e.exit = 0; e.enter = 1; e.idle = 0; e.out = 0;
    const bt = boundsAt(e, z, 0); e.target.set(-sd * bt.x1 * rand(0.2, 0.9), rand(bt.y0, bt.y1), z);
    e.side = -sd; e.retarget = 25; e.crowd = 0;
  }
  function updateFish(e, dt) {
    if (e.mode === 'script') { placeFish(e, dt); return; }
    if (e.mode === 'show') { e.exit = 0; e.enter = 0; e.out = 0; }
    if (e.out > 0) { e.out -= dt; if (e.out <= 0) reenter(e); else { placeFish(e, dt); return; } }
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
    // v0.9.1 防卡死：想游却几乎不动超过 2.5s → 换目标（大鱼直接顺势出屏）
    if (e.idle <= 0 && e.pos.distanceTo(e.target) > 0.8 && e.vel.length() < e.speed * 0.15) { e.stuck = (e.stuck || 0) + dt; if (e.stuck > 2.5) { e.stuck = 0; e.retarget = 0; } } else e.stuck = 0;
    // 生活感：到点后有时停下来悬停一会儿（轻轻摆鳍、慢慢漂），再换方向
    if (e.idle > 0) e.idle -= dt;
    else if (e.pos.distanceTo(e.target) < 0.4 || e.retarget <= 0) { if (Math.random() < lerp(0.45, 0.1, bigK(e))) e.idle = rand(1.2, 3.2); newTarget(e); }
    // 远处的鱼在画面上显得慢 → 按距离略微提速（视觉速度更一致）
    const spd = e.speed * clamp(Math.sqrt((CAM0.z - e.pos.z) / 9.5), 0.85, 1.3);
    want = tmp.copy(e.target).sub(e.pos);
    const dT = want.length(); want.setLength((e.idle > 0 ? 0.12 : 1) * spd * clamp(dT / 0.8, 0.35, 1));
    // 分离（boids separation）：① 3D 近距离 ② 屏幕空间重叠（不同深度也会在画面上叠成一坨）—— 按体型归一化，小鱼让大鱼
    const ue = uOf(e.pos.x, e.pos.z), ve = vOf(e.pos.y, e.pos.z), rue = (e.L * 0.5) / hwAt(e.pos.z), rve = (e.H * 0.5) / hhAt(e.pos.z);
    let crowded = false; sep.set(0, 0, 0);
    for (const o of ents.values()) {
      if (o === e || (o.kind !== 'fish' && o.kind !== 'egg') || o.out > 0) continue;
      const oL = o.kind === 'fish' ? o.L : 0.9, oH = o.kind === 'fish' ? o.H : 0.9;
      tmp2.copy(e.pos).sub(o.pos); const d = tmp2.length(), r = (e.L + oL) * 0.32 + 0.15;
      // v0.9.1：3D 分离主要在 y/z 上错开（x 只留 30%）→ 两条大鱼相向时会上下/前后错身而过，而不是在 x 上互相顶死
      if (d < r && d > 1e-3) { tmp2.multiplyScalar(1 / d); tmp2.x *= 0.3; sep.addScaledVector(tmp2, (1 - d / r) * spd * 1.5); }
      const su = rue + (oL * 0.5) / hwAt(o.pos.z) + 0.02, sv = (rve + (oH * 0.5) / hhAt(o.pos.z)) * 1.1 + 0.05;   // 留一点间隙，别贴着叠
      const du = (ue - uOf(o.pos.x, o.pos.z)) / su, dv = (ve - vOf(o.pos.y, o.pos.z)) / sv, dd = Math.hypot(du, dv);
      if (dd < 1) {
        const k = (1 - dd * dd) * spd * (e.L <= oL ? 1.6 * (1 - 0.8 * bigK(e)) : 0.7 * (1 - 0.85 * bigK(e)));   // v0.9.1：巨型鱼在画面上必然盖住别的鱼 → 屏幕空间避让几乎全让小鱼来做，大鱼保持航线不被推得来回掉头
        const nx = dd > 1e-3 ? du / dd : (e.uid < o.uid ? 1 : -1), ny = dd > 1e-3 ? dv / dd : 0;
        sep.x += nx * k; sep.y += ny * k * 0.85;
        sep.z += (e.pos.z <= o.pos.z ? -1 : 1) * k * 0.3;       // 深度上也错开一点
        if (dd < 0.7 && e.L <= oL) crowded = true;
      } else if (o.kind === 'fish' && dd < 4) {
        // 预判避让（unaligned collision avoidance）：按屏幕相对速度求最近接近点，~2.5s 内会叠上 → 提前上下错开
        const ru = (e.vel.x / hwAt(e.pos.z) - o.vel.x / hwAt(o.pos.z)) / su, rv = (e.vel.y / hhAt(e.pos.z) - o.vel.y / hhAt(o.pos.z)) / sv;
        const vv = ru * ru + rv * rv;
        if (vv > 1e-4) {
          const tc = -(du * ru + dv * rv) / vv;
          if (tc > 0 && tc < 2.5) {
            const cu = du + ru * tc, cv = dv + rv * tc, cd = Math.hypot(cu, cv);
            if (cd < 1) {
              const k = (1 - cd) * (1 - tc / 2.5) * spd * (e.L <= oL ? 1.1 : 0.4);
              sep.y += (Math.abs(cv) > 0.05 ? Math.sign(cv) : e.uid < o.uid ? 1 : -1) * k;
              sep.z += (e.pos.z <= o.pos.z ? -1 : 1) * k * 0.25;
            }
          }
        }
      }
    }
    // 分离优先：正在避让时减弱「奔向目标」的力，避免目标在另一条鱼身后时硬穿过去
    const sm = sep.length(); want.multiplyScalar(1 - Math.min(0.75, sm / Math.max(0.05, spd))).add(sep);
    // 一直挤在一起 → 小的那条换个去处
    e.crowd = crowded ? (e.crowd || 0) + dt : Math.max(0, (e.crowd || 0) - dt);
    if (e.crowd > lerp(1.4, 4, bigK(e)) && e.idle <= 0) newTarget(e);
    // 每 ~1.2s 复查一次目标点：别的鱼已经占了那里（屏幕上会叠）→ 提前换个空处
    e.chk = (e.chk ?? Math.random()) - dt;
    if (e.chk <= 0) { e.chk = rand(1.0, 1.5); if (e.idle <= 0 && scoreAt(e, e.target, null) < lerp(0.9, 0.3, bigK(e))) newTarget(e); }
    // 软边界：靠近可视体积边缘时往里收（不再硬贴边滑行）
    const bb = boundsAt(e, e.pos.z, e.pos.x), [zz0, zz1] = zRange(e);
    const soft = (v, lo, hi, m) => (v < lo + m ? (lo + m - v) / m : v > hi - m ? -(v - hi + m) / m : 0);
    const freeX = e.exit || e.enter;
    if (e.enter && Math.abs(e.pos.x) < bb.x1 - 0.2) e.enter = 0;
    if (!freeX) want.x += soft(e.pos.x, bb.x0, bb.x1, Math.min(0.3, (bb.x1 - bb.x0) * 0.15)) * spd * 1.2;
    if (e.exit) want.x += e.exit * spd * 0.5;   // 出屏时保持方向，别被避让推回
    want.y += soft(e.pos.y, bb.y0, bb.y1, Math.min(0.4, (bb.y1 - bb.y0) * 0.3)) * spd * 1.2;
    want.z += soft(e.pos.z, zz0, zz1, 0.5) * spd;
    // 避障：岩石 / 柱子等 → 沿最短出路（向上 / 向下 / 侧向）离开
    const hc = hitCollider(e, e.pos.x, e.pos.y, e.pos.z, 0.05);
    if (hc) {
      const m = Math.min(hc.up, hc.down, hc.side), k = spd * 2.2;
      if (m === hc.up) want.y += k; else if (m === hc.down) want.y -= k;
      else if (hc.d > 1e-3) { want.x += (hc.dx / hc.d) * k; want.z += (hc.dz / hc.d) * k; } else want.x += k;
      if (hitCollider(e, e.target.x, e.target.y, e.target.z, 0.1)) newTarget(e);
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
    e.vel.lerp(want, Math.min(1, dt * (sh ? 1.6 : 0.9)));
    e.vel.y *= Math.pow(0.985, dt * 60);           // 竖直阻尼（保持横向巡游感，但不至于让上下避让失效）
    e.pos.addScaledVector(e.vel, dt);
    // 兜底：越界时平滑拉回（从展示位游回来时不会瞬移）
    const pull = Math.min(1, dt * 4);
    e.pos.z += (clamp(e.pos.z, Z_FAR - 0.4, zz1 + 0.3) - e.pos.z) * pull;
    const b = boundsAt(e, e.pos.z, e.pos.x);
    if (!freeX) e.pos.x += (clamp(e.pos.x, b.x0 - 0.12, b.x1 + 0.12) - e.pos.x) * pull;
    if (e.exit && Math.abs(e.pos.x) > offX(e, e.pos.z)) e.out = rand(0.5, 2) + bigK(e) * rand(1, 2.5); e.pos.y += (clamp(e.pos.y, b.y0 - 0.1, b.y1 + 0.12) - e.pos.y) * pull;
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
  const view = { z: 1, zT: 1, px: 0, py: 0, vx: 0, vy: 0 }, orb = { yaw: 0, pitch: 0, dist: 1, vy: 0, vp: 0 };
  function clampView() {   // 放大后的可视窗口不能超出 1× 全景（缸外）
    const bx = Math.max(0, (CAM0.z - LOOK0.z) * TANH * camera.aspect * (1 - 1 / view.z)) + 0.25 * Math.max(0, view.z - 1);
    const by = Math.max(0, (CAM0.z - LOOK0.z) * TANH * (1 - 1 / view.z));
    view.px = clamp(view.px, -bx, bx); view.py = clamp(view.py, -by, by);
  }
  function resetView() { view.zT = 1; view.vx = view.vy = 0; }
  function updateCamera(dt, snap = false) {
    pan += panV * dt; panV *= Math.exp(-dt * 4);
    const sel = selected ? ents.get(selected) : null;
    // v0.9.1 缩放/平移/环绕惯性
    if (!drag && !pinchSt) {
      if (sel) { orb.yaw += orb.vy * dt; orb.pitch = clamp(orb.pitch + orb.vp * dt, -1.05, 1.05); orb.vy *= Math.exp(-dt * 3.5); orb.vp *= Math.exp(-dt * 3.5); }
      else { view.px += view.vx * dt; view.py += view.vy * dt; view.vx *= Math.exp(-dt * 5); view.vy *= Math.exp(-dt * 5); }
    }
    view.z += (view.zT - view.z) * Math.min(1, dt * 10);
    clampView();
    if (!drag && view.zT <= 1.02) { pan += (0 - pan) * Math.min(1, dt * 0.3); view.px *= 1 - Math.min(1, dt * 2); view.py *= 1 - Math.min(1, dt * 2); }
    pan = clamp(pan, -1, 1);
    focusK += ((sel ? 1 : 0) - focusK) * Math.min(1, dt * 2.2);
    // 基础机位：漂浮感（轻微呼吸）+ 左右视差
    lookTarget.set(LOOK0.x + pan * 0.55, LOOK0.y, LOOK0.z);
    camTarget.set(CAM0.x + pan * 1.5 + Math.sin(t * 0.23) * 0.08, CAM0.y + Math.sin(t * 0.31) * 0.06, CAM0.z);
    // 缩放 = 沿视线推近/拉远；平移 = 相机与注视点同步平移
    tmp2.subVectors(camTarget, lookTarget).multiplyScalar(1 / view.z); camTarget.copy(lookTarget).add(tmp2);
    camTarget.x += view.px; camTarget.y += view.py; lookTarget.x += view.px; lookTarget.y += view.py;
    if (sel) {
      const d = sel.kind === 'fish' ? clamp(1.5 + effL(sel) * 3.0, 2.9, 9) : 3.6;
      tmp.set(sel.pos.x * 0.75 + pan * 0.3, sel.pos.y - 0.155 * d, sel.pos.z);          // 卡片在下方：鱼落在画面上 1/3
      tmp3.set(tmp.x + pan * 0.6, tmp.y + 0.3, Math.min(CAM0.z, tmp.z + d));
      if (orb.yaw || orb.pitch || orb.dist !== 1) {   // 环绕：绕鱼本体旋转，注视点保持“鱼在上 1/3”的偏移
        const r = tmp3.distanceTo(tmp) * orb.dist, p0 = Math.asin(clamp((tmp3.y - tmp.y) / Math.max(1e-3, tmp3.distanceTo(tmp)), -1, 1));
        const pp = clamp(p0 + orb.pitch, -1.1, 1.1), cp = Math.cos(pp);
        tmp.y = sel.pos.y - 0.155 * d * orb.dist;
        tmp3.set(sel.pos.x + Math.sin(orb.yaw) * cp * r, tmp.y + Math.sin(pp) * r, sel.pos.z + Math.cos(orb.yaw) * cp * r);
        tmp.x = sel.pos.x; tmp.z = sel.pos.z;
      }
      lookTarget.lerp(tmp, focusK); camTarget.lerp(tmp3, focusK);
    }
    spot.intensity += ((sel ? 9 : 0) - spot.intensity) * Math.min(1, dt * 3);
    if (sel) spot.position.set(sel.pos.x + 0.6, sel.pos.y + 1.0, sel.pos.z + 1.4);
    veil.material.opacity = 0.42 * focusK; veil.visible = focusK > 0.01;
    if (sel) { veil.position.set(sel.pos.x, sel.pos.y, sel.pos.z - Math.max(0.9, (sel.kind === 'fish' ? effL(sel) : 1) * 0.7)); veil.scale.setScalar(9); }
    veil.quaternion.copy(camera.quaternion);
    const k = snap ? 1 : Math.min(1, dt * (sel && (drag || pinchSt || Math.abs(orb.vy) > 0.05) && focusK > 0.9 ? 9 : 3));
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
    const ne = addFish(v, EGG_C); ne.mode = 'script'; ne.sk = showK(ne); const k1 = ne.k0 * ne.sk; ne.f.root.scale.setScalar(0.001); ne.yaw = -0.45;
    selected = ne.uid;
    await tween(0.9, (k) => {
      e.top.position.y = ease(k) * 0.9; e.top.rotation.z = k * 1.2; e.top.position.x = -k * 0.4;
      e.bot.position.y = -ease(k) * 0.6; e.bot.rotation.z = -k * 0.8; e.bot.position.x = k * 0.3;
      e.shellM.uniforms.uOp.value = 1 - k; e.halo.material.opacity = 0.7 * (1 - k); e.core.material.opacity = 1 - k; e.ringG.visible = false;
      if (e.inner) e.inner.root.visible = false; if (e.embryo) e.embryo.visible = false;
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
    const list = tankList(tank), keep = new Set(list.map((x) => x.uid || x.id));
    for (const x of list) {
      const e = ents.get(x.uid || x.id);
      if (!e) x.egg ? addEgg(x) : addFish(x);
      else if (e.kind === 'egg') e.egg = x;
    }
    for (const [uid, e] of [...ents]) if (!keep.has(uid) && e.mode !== 'script') removeEnt(uid);
  }
  function tankList(tank) {
    return (tank || []).filter((x) => x && (x.egg || (SPECIES_BY_ID[x.sp] && !SPECIES_BY_ID[x.sp].odd && !x.item)));   // v4 最后防线：宝箱/漂流物/道具不渲染进水族箱
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
      const r = Math.max(44, (e.kind === 'fish' ? effL(e) * 0.5 : 0.6) * pxPerM);
      const d = Math.hypot(sx - x, sy - y);
      const score = d / r + d0 * 0.01;
      if (d < r && score < bd) { bd = score; best = e.uid; }
    }
    return best;
  }

  // ---------------- 输入（v0.9.1）----------------
  // 单指：1× 时左右视差；放大后 x/y 平移；选中鱼时绕鱼环绕。双指：pinch 缩放（选中时调环绕距离）+ 双指平移。轻点 = 拾取；双击空白 = 复位
  let drag = null, pinchSt = null, lastTap = null;
  const pts = new Map();
  const canvas = renderer.domElement;
  let onTap = null;
  const twoPts = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
  const panScale = () => 2 * (CAM0.z - LOOK0.z) * TANH / Math.max(1, canvas.clientHeight) / view.z;   // 像素 → 世界（焦平面）
  canvas.addEventListener('pointerdown', (e) => {
    if (!active) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { drag = null; const q = twoPts(); pinchSt = { ...q, z: view.zT, od: orb.dist }; }
    else if (pts.size === 1) { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: 0, t: performance.now() }; orb.vy = orb.vp = view.vx = view.vy = 0; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!active || !p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pinchSt && pts.size >= 2) {
      const q = twoPts(), r = q.d / pinchSt.d;
      if (selected) orb.dist = clamp(pinchSt.od / r, 0.45, 2.2);
      else { view.zT = clamp(pinchSt.z * r, 0.6, 2.5); if (view.zT > 1.02) { const s = panScale(); view.px -= (q.cx - pinchSt.cx) * s; view.py += (q.cy - pinchSt.cy) * s; } }
      pinchSt.cx = q.cx; pinchSt.cy = q.cy; return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    if (drag.moved <= 8) return;
    if (selected && ents.get(selected)?.kind === 'fish') {
      orb.yaw -= dx * 0.0105; orb.pitch = clamp(orb.pitch + dy * 0.008, -1.05, 1.05);
      orb.vy = orb.vy * 0.5 + (-dx * 0.0105 * 60) * 0.5; orb.vp = orb.vp * 0.5 + (dy * 0.008 * 60) * 0.5;
    } else if (view.zT > 1.02) {
      const s = panScale(); view.px -= dx * s; view.py += dy * s; view.vx = view.vx * 0.5 - dx * s * 30; view.vy = view.vy * 0.5 + dy * s * 30;
    } else { pan = clamp(pan - dx * 0.0042, -1, 1); panV = -dx * 0.12; }
  });
  const up = (e) => {
    const had = pts.delete(e.pointerId);
    if (pts.size < 2) pinchSt = null;
    if (!active || !had || !drag || drag.id !== e.pointerId) { if (e.type !== 'pointerup' || pts.size === 0) drag = null; return; }
    const tap = drag.moved <= 8 && e.type === 'pointerup'; drag = null;
    if (!tap) return;
    const r = canvas.getBoundingClientRect(), hit = pickAt(e.clientX - r.left, e.clientY - r.top, r.width, r.height), now = performance.now();
    if (!hit && !selected && lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { resetView(); lastTap = null; }
    else lastTap = hit ? null : { t: now, x: e.clientX, y: e.clientY };
    if (onTap) onTap(hit);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  function render() {
    if (!ready) return;          // 准备中（过场遮住）：不渲染半成品场景
    drawFrame();
  }
  function drawFrame() {
    // 防闪白安全钳：曝光限定在 [0.85, 1.12]（主题微调），ACES；只有发光体（卵/光束/冷光）用加色
    const exp = renderer.toneMappingExposure, sh = renderer.shadowMap.enabled;
    renderer.toneMappingExposure = clamp(th.light.exp || 1, 0.85, 1.12); renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    renderer.toneMappingExposure = exp; renderer.shadowMap.enabled = sh;
  }
  function resize(Wd, Hd) { camera.aspect = Wd / Math.max(1, Hd); camera.updateProjectionMatrix(); uPx.value = Hd * renderer.getPixelRatio() / (2 * TANH); }

  // ---------------- v5 异步准备（配合 tank_ui 过场）：拆帧建场景 / 鱼 → compileAsync 预编译 → 渲染首帧 ----------------
  let ready = true, prepTok = 0;
  const warmed = new Set();          // 已热身绘制过的「材质 × 顶点布局」，再次进场只补新出现的
  const nextFrame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  // 预编译场景里所有材质（含不可见的光晕/雾幕），并先渲染一帧（贴图上传 / PMREM），避免进场后首帧卡几秒
  async function warm(alive = () => true, onK = null) {
    const sh = renderer.shadowMap.enabled; let p = null;
    // 拆帧预编译：布景各部件 / 每条鱼单独 compile（灯光取自 scene，程序参数与正式渲染一致），每 ~40ms 让出一帧
    const parts = [...(env ? env.group.children : []), ...world.children.filter((o) => o !== env?.group), ...scene.children.filter((o) => o !== world)];
    renderer.setRenderTarget(null);
    let slice = performance.now(); const W0 = performance.now(), WT = (warm.T = { n: parts.length });
    for (const o of parts) {
      if (performance.now() - slice > 40) { await nextFrame(); if (!alive()) return; slice = performance.now(); }
      renderer.shadowMap.enabled = false;
      try { renderer.compile(o, camera, scene); } catch (err) { /* 兜底在下面整体 compileAsync */ } finally { renderer.shadowMap.enabled = sh; }
    }
    renderer.shadowMap.enabled = false; renderer.setRenderTarget(null);     // 与 render() 一致的程序参数，避免编译后又重编
    try { p = renderer.compileAsync ? renderer.compileAsync(scene, camera) : null; } catch (err) { console.warn('aq compile', err); } finally { renderer.shadowMap.enabled = sh; }
    if (p) { try { await p; } catch (err) { console.warn('aq compile', err); } }
    WT.compile = Math.round(performance.now() - W0);
    if (!alive()) return;
    // 拆帧「热身绘制」：驱动真正的管线生成 / 贴图上传发生在首次 draw（不在 link 时），一次画全场会卡成一大帧。
    // 这里按「材质 × 顶点布局」去重，每次只让一个网格可见、裁剪到 2×2 像素画一遍（几乎无填充开销），分摊到多帧；灯光不动，程序参数不变。
    const rend = [], seen = new Set();
    (function walk(o) {
      if (!o.visible) return;
      if (o.isMesh || o.isSprite || o.isPoints || o.isLine) rend.push(o);
      for (const c of o.children) walk(c);
    })(scene);
    const objs = rend.filter((o) => {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const k = ms.map((m) => m?.uuid).join(',') + '|' + Object.keys(o.geometry?.attributes || {}).join(',') + (o.geometry?.index ? 'i' : '') + (o.isInstancedMesh ? 'I' : '') + (o.isSkinnedMesh ? 'S' : '') + (o.morphTargetInfluences ? 'M' : '');
      if (seen.has(k) || warmed.has(k)) return false; seen.add(k); return true;
    });
    WT.uniq = objs.length; WT.all = rend.length;
    const sc = renderer.getScissorTest(), sv = renderer.getScissor(new THREE.Vector4());
    const show = (one) => {
      for (const o of rend) o.visible = one === undefined;
      for (let p = one; p; p = p.parent) p.visible = true;         // 父级若也是网格须保持可见，否则子网格画不出来
    };
    const d0 = performance.now(); slice = d0;
    try {
      renderer.setScissorTest(true); renderer.setScissor(0, 0, 2, 2);
      for (let i = 0; i < objs.length; i++) {
        if (performance.now() - slice > 40) {
          show();                                                   // 让出期间恢复可见，避免外部读到半成品状态
          renderer.setScissorTest(sc); await nextFrame(); if (!alive()) return;
          renderer.setScissorTest(true); renderer.setScissor(0, 0, 2, 2); slice = performance.now();
        }
        show(objs[i]);
        drawFrame();
        if ((i & 7) === 7) onK?.((i + 1) / objs.length);
      }
    } finally {
      show();
      renderer.setScissor(sv); renderer.setScissorTest(sc);
    }
    for (const k of seen) warmed.add(k);
    if (warmed.size > 6000) warmed.clear();
    WT.pre = Math.round(performance.now() - d0);
    if (!alive()) return;
    await nextFrame(); if (!alive()) return;
    const f0 = performance.now(); drawFrame(); WT.draw = Math.round(performance.now() - f0);
  }
  // 返回 Promise<{ ok, ms, cold }>；onProg(k 0..1, info) 报告进度；被新的 prepare 打断时 ok=false
  async function prepare(tank, Wd, Hd, opts = {}, onProg = null) {
    const tok = ++prepTok, alive = () => tok === prepTok, t0 = performance.now();
    const prog = (k, info) => { try { onProg?.(k, info); } catch (err) { /* */ } };
    ready = false; active = false; selected = null;
    resize(Wd, Hd);
    const tid = themeOf(opts.theme || themeId || DEFAULT_THEME).id;
    const coldEnv = !(tid === themeId && env) && !envCache.has(tid);
    const list = tankList(tank), keep = new Set(list.map((x) => x.uid || x.id));
    if (opts.reset) clear(); else for (const [uid, e] of [...ents]) if (!keep.has(uid)) removeEnt(uid);
    const todo = list.filter((x) => !ents.has(x.uid || x.id));
    const cold = coldEnv || todo.length > 0 || !fishEnv;
    prog(0.04, { cold, n: todo.length });
    if (coldEnv || !fishEnv) { await nextFrame(); if (!alive()) return { ok: false }; }
    const T = {}; let tm = performance.now();
    setTheme(tid);                                   // 首次：建布景（同步重活，之后有缓存）
    T.env = Math.round(performance.now() - tm); tm = performance.now();
    prog(0.32, { cold });
    let slice = performance.now();
    for (let i = 0; i < todo.length; i++) {
      if (performance.now() - slice > 12) { await nextFrame(); if (!alive()) return { ok: false }; slice = performance.now(); }
      const x = todo[i];
      if (!ents.has(x.uid || x.id)) x.egg ? addEgg(x) : addFish(x);
      prog(0.32 + 0.43 * (i + 1) / todo.length, { cold, i: i + 1, n: todo.length });
    }
    T.fish = Math.round(performance.now() - tm);
    for (const x of list) { const e = ents.get(x.uid || x.id); if (e?.kind === 'egg') e.egg = x; }
    for (const e of ents.values()) if (e.kind === 'fish' && e.mode === 'show') e.mode = 'swim';
    if (!opts.reset) scatter();
    pan = 0; panV = 0; focusK = 0; selected = null; view.z = view.zT = 1; view.px = view.py = view.vx = view.vy = 0;
    camera.position.copy(CAM0).add(V(0, 0.4, 1.2)); camLook.copy(LOOK0);
    active = true; update(0.016);
    prog(0.8, { cold });
    await nextFrame(); if (!alive()) return { ok: false };
    tm = performance.now();
    await warm(alive, (k) => prog(0.8 + 0.18 * k, { cold })); if (!alive()) return { ok: false };
    T.warm = Math.round(performance.now() - tm); T.w = warm.T;
    ready = true;
    prog(1, { cold });
    return { ok: true, ms: performance.now() - t0, cold, T };
  }

  return {
    scene, camera, ents,
    get active() { return active; },
    get selected() { return selected; },
    get view() { return view; }, get orb() { return orb; },
    set onTap(fn) { onTap = fn; },
    get theme() { return themeId; },
    setTheme,
    open(tank, Wd, Hd, opts = {}) {
      prepTok++; ready = true;
      setTheme(opts.theme || themeId || DEFAULT_THEME);
      active = true; resize(Wd, Hd);
      if (opts.reset) clear();
      sync(tank); pan = 0; panV = 0; focusK = 0; selected = null;
      camera.position.copy(CAM0).add(V(0, 0.4, 1.2)); camLook.copy(LOOK0); update(0.016);
    },
    prepare,
    // 是否「热」：主题布景已缓存、鱼都已建好 → 进场几乎不耗时（过场只需轻微淡入淡出）
    isWarm(tank, theme) {
      const tid = themeOf(theme || themeId || DEFAULT_THEME).id;
      return !!fishEnv && (tid === themeId ? !!env : envCache.has(tid)) && tankList(tank).every((x) => ents.has(x.uid || x.id));
    },
    get ready() { return ready; },
    close() { prepTok++; ready = true; active = false; selected = null; drag = null; },
    clear, sync, update, render, resize, select, screenPos, pickAt, setEggProgress, playEggify, playHatch, playRelease,
    busy: () => anims.length > 0,
  };
}
