// 朋友钓鱼 Friends Fishing —— 主程序：渲染 / 场景 / 4 位钓手 / 输入 / 镜头 / 社交模拟 / 进度
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

import { waveState, waterHeight } from './waves.js';
import { createSkyDome, skyUniforms, PRESETS, sunDirFromAngles, createGodRays } from './sky.js';
import { createOcean } from './water.js';
import { createBoat, deckYAtZ, halfBeamAtZ, HULL } from './boat.js';
import { makeRod } from './characters.js';
import { stylizeObject, toonUniforms, setOutlineQuality } from './toon.js';
import { createFX } from './fx.js';
import { createScenery } from './scenery.js';
import { GradeShader } from './grade.js';
import { Character } from './rig.js';
import { Angler, PERFECT_CAST, BITE_WINDOW } from './angler.js';
import { SPECIES_BY_ID, RARITY, RARITY_ORDER, scoreOf, displayName, rollCatch, TRAITS, Fish, makeVariant, SPECIES, DECOS } from './fishes.js';
import { createMeta, ROOM, levelTitle, TANK_MAX } from './meta.js';
import { initAudio, toggleMute, setMuted, sfx } from './sfx.js';
import * as UI from './ui.js';
import { ic } from './icons.js';
import { createAquarium } from './aquarium.js';     // v1.0 水族箱（B）
import { createTankUI, tut } from './tank_ui.js';
const { $ } = UI;

const Q = new URLSearchParams(location.search);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const angDelta = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
waveState.scale = 0.5;

const meta = createMeta();
setMuted(!!meta.S.muted);

// ======================= 渲染器 =======================
const app = $('app');
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;   // 美术升级：由 PRESETS.dream 驱动
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 0.46, 0.05, 6000);

const QUALITY = {
  // 美术升级：godrays = billboard 体积光束；低档关闭体积光、阴影降到 512、关 Bloom（粒子减半）。描边已移除（outline 全关）
  low: { dpr: 1.0, samples: 0, shadow: 512, bloom: false, outline: false, godrays: false },
  medium: { dpr: 1.5, samples: 4, shadow: 1024, bloom: true, outline: false, godrays: true },
  high: { dpr: 2.0, samples: 4, shadow: 2048, bloom: true, outline: false, godrays: true },
};
// v1.3 perf：低端机（≤4 核 / ≤3GB）起步就用 medium（DPR≤1.5）；DPR 3 的手机同样 medium —— 渲染分辨率上限 = min(DPR, 档位 dpr)
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
let quality = Q.get('q') && QUALITY[Q.get('q')] ? Q.get('q') : (window.devicePixelRatio > 2.5 || LOW_END ? 'medium' : 'high');
let W = 1, H = 1;
let rt, composer, bloomPass, gradePass;
let builtKey = '';
const disposeLater = [];   // v1.3 perf：旧 composer 延后一帧再释放（新 pass 先拿到同源 program，避免重编译）
function buildComposer() {
  const r = app.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  const q = QUALITY[quality];
  const dpr = Q.has('dpr') ? +Q.get('dpr') : Math.min(window.devicePixelRatio, q.dpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  // v1.3 perf：尺寸变化（手机地址栏收起/旋转触发 resize）只 setSize，不再整套重建 composer + MSAA RT + Bloom mip 链
  const key = `${q.samples}|${q.bloom}|${dpr}`;
  if (composer && key === builtKey) {
    composer.setPixelRatio(dpr); composer.setSize(W, H);
    applyGrade(); setOutlineQuality(q.outline, W, H);
    return;
  }
  builtKey = key;
  if (composer) { const oc = composer; disposeLater.push(() => { oc.passes.forEach((p) => p.dispose?.()); oc.dispose(); }); }   // 以前只 dispose composer：Bloom 的 10 个 mip RT 每次重建都泄漏
  rt = new THREE.WebGLRenderTarget(W * dpr, H * dpr, { type: THREE.HalfFloatType, samples: q.samples });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.3, 0.75, 1.2);   // v1.2：更弱的柔光 Bloom，只留暖白高光
  bloomPass.enabled = q.bloom; composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  gradePass = new ShaderPass(GradeShader); composer.addPass(gradePass);
  applyGrade();
  setOutlineQuality(q.outline, W, H);
  try { fx.setQuality?.(quality); } catch (e) { /* fx 尚未创建 */ }
  try { godRays.mesh.visible = !!q.godrays; sun.shadow.autoUpdate = quality !== 'low'; sun.shadow.needsUpdate = true; if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.setScalar(q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; } } catch (e) { /* 尚未创建 */ }
}
let shadowTick = 0;
// v1.3 自适应：#app 在竖屏下铺满 100vw×100dvh；resize / orientationchange / visualViewport（地址栏收起·展开）
// 合并到下一帧，只有 #app 实际尺寸变化时才重建（避免地址栏滑动时每个事件都重建 composer）；不支持 dvh 的浏览器写 --vvh 兜底
const DVH_OK = !!(window.CSS && CSS.supports && CSS.supports('height', '100dvh'));
let fitRaf = 0;
function fitViewport() {
  fitRaf = 0;
  if (!DVH_OK) { const vh = Math.round(window.visualViewport?.height || window.innerHeight); document.documentElement.style.setProperty('--vvh', vh + 'px'); }
  const r = app.getBoundingClientRect();
  if (Math.round(r.width) === W && Math.round(r.height) === H) return;
  buildComposer();
  try { if (tankUI?.isOpen) aq.resize(W, H); } catch (e) { /* 水族箱尚未创建 */ }
}
const queueFit = () => { if (!fitRaf) fitRaf = requestAnimationFrame(fitViewport); };
addEventListener('resize', queueFit);
addEventListener('orientationchange', () => { queueFit(); setTimeout(queueFit, 350); setTimeout(queueFit, 900); });   // iOS 旋转后尺寸要晚一点才稳定
window.visualViewport?.addEventListener('resize', queueFit);
// （不支持 dvh 时首帧的 --vvh 由 index.html <head> 内联脚本写入）

// ======================= 天空 / 光照 =======================
const sky = createSkyDome(); scene.add(sky);
const sun = new THREE.DirectionalLight('#fff1d6', 3.2);
sun.castShadow = true; sun.shadow.mapSize.setScalar(QUALITY[quality].shadow);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 80 });
sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;   // PCFSoft：柔边；阴影冷色由 toon.js uShadowTint 染色
scene.add(sun, sun.target);
const godRays = createGodRays(7); scene.add(godRays.mesh);   // 美术升级：光遇式云隙光（低档隐藏）
godRays.mesh.visible = !!QUALITY[quality].godrays;
if (Q.has('gr')) godRays.uniforms.uStrength.value = +Q.get('gr');   // 调试：体积光强度
const hemi = new THREE.HemisphereLight('#e9ecef', '#e2d2bb', 0.78); scene.add(hemi);   // v1.2：中性天光 + 暖沙反弹（由 PRESETS.dream 覆盖）
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), sky.material));
const envSea = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: '#5c8fa0' }));
envSea.rotation.x = -Math.PI / 2; envSea.position.y = -2; envScene.add(envSea);
let envRT = null;
function rebuildEnv() { if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0.02, 0.1, 500); scene.environment = envRT.texture; }
scene.fog = new THREE.FogExp2('#f7eadb', 0.00042);

const ocean = createOcean(); scene.add(ocean.mesh);
const boat = createBoat(); scene.add(boat.group);
stylizeObject(boat.group, { rim: 0.6, spec: 0.3 });   // v1.2：柔和高光，去塑料镜面感
const B = boat.group;
const boatState = { yaw: 0, pitch: 0, roll: 0, heave: 0 };
{ const a = THREE.MathUtils.degToRad(PRESETS.afternoon.sunAzim); boatState.yaw = Math.atan2(-Math.cos(a), Math.sin(a)) + 0.42; }
const bowPad = B.children.find((o) => o.isGroup && o.children.length === 4 && Math.abs(o.position.z - 5.45) < 0.01);
if (bowPad) bowPad.children.slice(1, 4).forEach((p) => { p.position.z = -0.72; p.rotation.x = -0.35; });
const scenery = createScenery(scene);
scene.traverse((o) => { if (o.isMesh && o !== ocean.mesh && o !== sky && !B.getObjectById(o.id)) stylizeObject(o, { rim: 0.5 }); });
const fx = createFX(scene, waterHeight);

const P = PRESETS.dream;   // 美术升级：光遇 × 猛兽派对「晴暖午后」（与 afternoon 同方位角，构图不变）
const sunDir = V();
function applyPreset() {
  sunDirFromAngles(P.sunElev, P.sunAzim, sunDir);
  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uZenith.value.set(P.zenith); skyUniforms.uHorizon.value.set(P.horizon);
  if (P.mid) skyUniforms.uMid.value.set(P.mid); else skyUniforms.uMid.value.set(P.horizon).lerp(new THREE.Color(P.zenith), 0.45);
  skyUniforms.uSunColor.value.set(P.sun); skyUniforms.uCloudColor.value.set(P.cloud);
  skyUniforms.uCloudShadow.value.set(P.cloudShadow); skyUniforms.uCloudCover.value = P.cloudCover;
  const u = ocean.material.uniforms;
  u.uDeep.value.set(P.deep); u.uShallow.value.set(P.shallow); u.uSSS.value.set(P.sss); u.uFoam.value.set(P.foam);
  u.uSunStrength.value = P.sunIntensity;
  sun.color.set(P.sun); sun.intensity = P.sunIntensity;
  hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGround); hemi.intensity = P.hemiIntensity;
  scene.environmentIntensity = P.envIntensity;
  renderer.toneMappingExposure = P.exposure;
  scene.fog.color.set(P.horizon);
  if (P.fog) scene.fog.density = P.fog;
  if (P.waterFog) u.uFogDensity.value = P.waterFog;
  envSea.material.color.set(P.deep).lerp(new THREE.Color(P.horizon), 0.25);
  boat.setLights(P.lights);
}
function applyGrade() {
  if (!gradePass) return;
  const g = gradePass.uniforms;
  g.uLift.value.fromArray(P.grade.lift); g.uGain.value.fromArray(P.grade.gain);
  // 美术升级：暖白清爽 —— 轻暗角、柔对比、弱颗粒、几乎无色差；太阳大气辉光
  // v1.2 柔和：整体饱和度落在柔和区间（SOFT_ENV.grade.sat）+ 饱和度软膝 + 柔对比 + 暖奶油暗角
  g.uSat.value = P.grade.sat; g.uVignette.value = 0.16; g.uGrain.value = 0.01; g.uCA.value = 0.0004;
  g.uContrast.value = 0.07; g.uAspect.value = W / H;
}
buildComposer();
applyPreset(); rebuildEnv();

// 太阳在屏幕上的位置 → 调色里的大气辉光（太阳在身后时淡出；在屏幕外时从对应边缘渗入）
const _sunP = V(), _camF = V(), _hazeCol = new THREE.Color();
function updateSunHaze() {
  const g = gradePass.uniforms;
  camera.getWorldDirection(_camF);
  const facing = _camF.dot(sunDir);
  _sunP.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
  if (facing > 0.02) g.uSunUV.value.set(_sunP.x * 0.5 + 0.5, _sunP.y * 0.5 + 0.5);
  const k = THREE.MathUtils.smoothstep(facing, 0.0, 0.95) * 0.2;
  _hazeCol.set(P.sun);
  g.uSunHaze.value.set(_hazeCol.r * k, _hazeCol.g * k * 0.92, _hazeCol.b * k * 0.78);
}

// ======================= 4 位钓手 =======================
// 站位（船本地坐标）：玩家可走动；好友固定在各自的钓位
const SPOTS = {
  rummons: { x: -0.55, y: 0.5, z: HULL.zs - 0.6, ry: Math.PI },        // 船尾泳台
  gugu: { x: 1.72, z: -1.55, ry: Math.PI / 2 },                       // 右舷后甲板
  chennayu: { x: -1.72, z: -2.45, ry: -Math.PI / 2 },                 // 左舷后甲板
};
const anglers = []; let player = null;
const live = {};            // 好友本局实时积分
const playerState = { pos: V(0.35, 0, -3.0), facing: Math.PI / 2, speed: 0, walked: 0, idleT: 0 };
let frenzy = { on: false, t: 0, next: 70 };
let baitOn = false;
let newSpecies = 0;
const stylizeFish = (o) => stylizeObject(o, { rim: 1.0 });

const ctx = {
  scene, B,
  time: () => time,
  frenzy: () => frenzy.on,
  stylize: stylizeFish,
  emit: (a, type, data) => onEvent(a, type, data || {}),
  getLuck(a) {
    if (a.isPlayer) {
      const forced = Q.get('force');
      let usedBait = false;
      if (baitOn && meta.useBait()) { usedBait = true; baitOn = false; $('bait').classList.remove('on'); $('bait').querySelector('.tip').textContent = '幸运饵'; }
      const L = meta.castLuck({ bait: usedBait, perfectCast: a.perfectCast, tide: frenzy.on });
      let min = L.min;
      if (meta.S.catches === 0 && !min) min = 'uncommon';     // 新手第一条：保证好看
      a.usedBait = usedBait;
      // v1.0：这一杆钓到"别人放生/创作的鱼"时，物种对齐（搏鱼手感/稀有度一致），外观在 wrapOceanCatch 里换
      if (a._ocean) return { luck: L.luck, force: a._ocean.sp };
      // v1.1：20% 钓上来的是道具漂流物（第 1 杆 / 用了幸运饵 / 强制物种时不出；?item=<id> 或 G.dbg.item 强制）
      const itemForce = dbg.item || Q.get('item') || null;
      const itemP = dbg.itemP ?? (usedBait || dbg.force || forced || meta.S.catches < 1 ? 0 : meta.genes.ITEM_CATCH_P);
      return { luck: L.luck, forceMinRarity: min, featured: meta.featured.id, force: dbg.force || forced, allowOdd: meta.S.catches > 1, itemP, item: itemForce && meta.genes.ITEM_BY_ID[itemForce] ? itemForce : null, itemLuck: L.luck };
    }
    // r3：好友以前 luck≈0.3（玩家 0~0.15）→ 好友 SSR 率约 24%、玩家约 9~16%，落差大 → 好友略低于玩家，且全房间好友 SSR/UR 至少间隔 80s
    return { luck: 0.02 + a.skill * 0.06 + (frenzy.on ? 0.12 : 0), featured: meta.featured.id, maxRarity: time - friendSSR.last < 80 ? 'rare' : null };
  },
};

async function loadCrew(progress) {
  const loader = new GLTFLoader();
  let done = 0;
  const gltfs = await Promise.all(ROOM.map((r) => loader.loadAsync(`assets/crew/${r.file}.glb`).then((g) => { done++; progress(0.15 + (done / ROOM.length) * 0.6, `正在接上 ${r.name}…`); return g; })));
  ROOM.forEach((r, i) => {
    const rod = makeRod(); stylizeObject(rod.group);
    const c = new Character(gltfs[i].scene, { name: r.name, color: r.color, rod });
    stylizeObject(c.root, { rim: 1.1 });
    c.setMode('free'); c.update(0.016, 0); c.update(0.2, 0.2);
    renderPortrait(r.id, c);
    B.add(c.root);
    let spot = null;
    if (r.you) {
      c.root.position.set(playerState.pos.x, deckYAtZ(playerState.pos.z), playerState.pos.z);
      c.root.rotation.y = playerState.facing;
    } else {
      spot = SPOTS[r.id];
      c.root.position.set(spot.x, spot.y ?? deckYAtZ(spot.z), spot.z);
      c.root.rotation.y = spot.ry;
      live[r.id] = 0;
    }
    const a = new Angler(ctx, { id: r.id, name: r.name, color: r.color, char: c, isPlayer: !!r.you, skill: r.skill || 0.8, spot, lines: r.lines || [] });
    a.ry = spot ? spot.ry : 0; a.reactT = 0;
    anglers.push(a);
    if (r.you) { player = a; wrapOceanCatch(a); } else UI.makeTag(a);
    c.setMode('rod');
  });
}

// 从 3D 角色渲染圆形头像（排行榜 / 好友条 / 通知里用）
// v0.6：按"脖子以上的蒙皮顶点"求包围盒，正交相机完整包住头部+头发，居中留边；统一柔和背景
const PR = 192;
const portraitRT = new THREE.WebGLRenderTarget(PR, PR, { samples: 4 });
portraitRT.texture.colorSpace = THREE.SRGBColorSpace;
const portraitBg = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 52, 6, 64, 64, 92);
  gr.addColorStop(0, '#fbfdff'); gr.addColorStop(0.55, '#e3f3f8'); gr.addColorStop(1, '#bfe2ee');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function framePortrait(c, pc, yaw = 0.32) {
  c.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  // 收集脖子以上的蒙皮顶点（含头发），投影到相机空间求精确取景框
  const neck = V(); c.rig.b.neck.getWorldPosition(neck);
  const head = V(); c.rig.b.head.getWorldPosition(head);
  const cut = neck.y + (head.y - neck.y) * 0.12;
  const pts = [], v = V();
  c.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const n = o.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 6000));
    for (let i = 0; i < n; i += step) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); if (v.y > cut) pts.push(v.clone()); }
  });
  if (pts.length < 20) return false;
  const ctr = V(); pts.forEach((p) => ctr.add(p)); ctr.divideScalar(pts.length);
  pc.position.set(ctr.x + Math.sin(yaw) * 3, ctr.y + 0.25, ctr.z + Math.cos(yaw) * 3); pc.lookAt(ctr.x, ctr.y, ctr.z); pc.updateMatrixWorld(true);
  const inv = pc.matrixWorldInverse; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) { v.copy(p).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - (y1 - y0) * 0.04, half = Math.max(x1 - x0, y1 - y0) / 2 * 1.3;   // 圆形裁切会吃掉四角：留 30% 边
  pc.left = cx - half; pc.right = cx + half; pc.top = cy + half; pc.bottom = cy - half; pc.near = 0.5; pc.far = 6;
  pc.updateProjectionMatrix();
  return true;
}
function renderPortrait(id, c) {
  try {
    const ps = new THREE.Scene();
    ps.background = portraitBg;
    ps.add(new THREE.HemisphereLight('#ffffff', '#9fc3d2', 2.0));
    const dl = new THREE.DirectionalLight('#fff4e0', 2.0); dl.position.set(1.2, 2, 3); ps.add(dl);
    const fill = new THREE.DirectionalLight('#dff4ff', 0.8); fill.position.set(-2, 0.5, 1.5); ps.add(fill);
    ps.environment = scene.environment;
    const rodVis = c.rod?.group.visible; if (c.rod) c.rod.group.visible = false;
    ps.add(c.root);
    c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0); c.root.updateMatrixWorld(true);
    const pc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 6);
    if (!framePortrait(c, pc)) { const hp = V(); c.rig.b.head.getWorldPosition(hp); pc.position.set(hp.x, hp.y, hp.z + 3); pc.lookAt(hp); pc.left = -0.4; pc.right = 0.4; pc.top = 0.4; pc.bottom = -0.4; pc.updateProjectionMatrix(); }
    const exp = renderer.toneMappingExposure; renderer.toneMappingExposure = 1;
    renderer.setRenderTarget(portraitRT);
    renderer.render(ps, pc);
    const buf = new Uint8Array(PR * PR * 4);
    renderer.readRenderTargetPixels(portraitRT, 0, 0, PR, PR, buf);
    renderer.setRenderTarget(null); renderer.toneMappingExposure = exp;
    const cv = document.createElement('canvas'); cv.width = cv.height = PR;
    const g = cv.getContext('2d'); const img = g.createImageData(PR, PR);
    for (let y = 0; y < PR; y++) img.data.set(buf.subarray((PR - 1 - y) * PR * 4, (PR - y) * PR * 4), y * PR * 4);
    g.putImageData(img, 0, 0);
    UI.avatars[id] = cv.toDataURL('image/jpeg', 0.9);
    ps.remove(c.root);
    if (c.rod) c.rod.group.visible = rodVis;
  } catch (e) { console.warn('portrait failed', e); renderer.setRenderTarget(null); }
}

// ---- UGC 鱼缩略图：按种子即时重建这条鱼（花纹+装饰），离屏渲染成透明 PNG，内存缓存 ----
// 图鉴 / 钓获记录 / 卡片都用它，保证"看到的就是你钓到的那一条"
const TW = 240, TH = 168;
const thumbRT = new THREE.WebGLRenderTarget(TW, TH, { samples: 4 });
thumbRT.texture.colorSpace = THREE.SRGBColorSpace;
let thumbScene = null; const thumbCache = new Map(); const thumbQ = [];
function fishThumb(v) {
  const key = v.id || `${v.sp}-${v.seed}-${v.cm}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  let url = null;
  try {
    if (!thumbScene) {
      thumbScene = new THREE.Scene();
      thumbScene.add(new THREE.HemisphereLight('#ffffff', '#a9c9d6', 1.5));
      const dl = new THREE.DirectionalLight('#fff4e0', 2.2); dl.position.set(1, 3, 2.5); thumbScene.add(dl);
      const fl = new THREE.DirectionalLight('#dff4ff', 0.9); fl.position.set(-2, 0.4, 1.2); thumbScene.add(fl);
      thumbScene.environment = scene.environment;
    }
    const f = new Fish(v, stylizeFish);
    f.update(0.016, 'swim'); f.body.rotation.set(0, 0, 0);
    f.root.rotation.set(0, 0, 0); f.root.updateMatrixWorld(true);
    thumbScene.add(f.root);
    const box = new THREE.Box3().setFromObject(f.root), c = box.getCenter(V()), sz = box.getSize(V());
    const cam = new THREE.PerspectiveCamera(24, TW / TH, 0.05, 50);
    const dir = V(0.18, 0.42, 1).normalize();
    const fitH = Math.max(sz.y + sz.z * 0.35, (sz.x + sz.z * 0.2) / (TW / TH)) * 1.18;
    const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(12));
    cam.position.copy(c).addScaledVector(dir, dist); cam.lookAt(c);
    const exp = renderer.toneMappingExposure, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0); renderer.toneMappingExposure = 1;
    renderer.setRenderTarget(thumbRT); renderer.clear(); renderer.render(thumbScene, cam);
    const buf = new Uint8Array(TW * TH * 4);
    renderer.readRenderTargetPixels(thumbRT, 0, 0, TW, TH, buf);
    renderer.setRenderTarget(null); renderer.setClearColor(cc, ca); renderer.toneMappingExposure = exp;
    thumbScene.remove(f.root); f.dispose();
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    const g = cv.getContext('2d'); const img = g.createImageData(TW, TH);
    for (let y = 0; y < TH; y++) img.data.set(buf.subarray((TH - 1 - y) * TW * 4, (TH - y) * TW * 4), y * TW * 4);
    g.putImageData(img, 0, 0);
    url = cv.toDataURL('image/png');
  } catch (e) { console.warn('fish thumb failed', e); renderer.setRenderTarget(null); }
  thumbCache.set(key, url);
  return url;
}
// 异步队列：图鉴里一次只渲 2 张，避免打开时卡一帧
UI.setThumbMaker((v, el) => {
  const key = v.id || `${v.sp}-${v.seed}-${v.cm}`;
  if (thumbCache.has(key)) { el.src = thumbCache.get(key) || ''; el.classList.add('ok'); return; }
  thumbQ.push({ v, el });
});
function pumpThumbs() { for (let i = 0; i < 2 && thumbQ.length; i++) { const { v, el } = thumbQ.shift(); if (!el.isConnected) continue; const u = fishThumb(v); if (u) { el.src = u; el.classList.add('ok'); } } }

// ======================= v1.0 水族箱 / 养成循环（B · DESIGN §2） =======================
// 钓到 → 「收进水族箱」（光点飞向左下角入口）/ 满了 → 腾位置面板；入口打开独立 3D 水族箱（钓鱼场景暂停）
const aq = createAquarium({ renderer, stylize: stylizeFish });
const tankUI = createTankUI({ meta, aq, genes: meta.genes, app, size: () => ({ W, H }), onExit: () => exitTank(), onChanged: () => refreshTankBtn() });
const tankBtn = $('tankBtn'), keepBtn = $('cKeep');
const TANK_LOCK = new Set(['charge', 'bite', 'hookset', 'fight', 'land', 'hold', 'release']);
function refreshTankBtn(bump = false) {
  const n = meta.tankCount(), full = meta.tankFull(), ready = meta.readyEggs().length > 0;
  const t = `${n}/${TANK_MAX}`; if ($('tankN').textContent !== t) $('tankN').textContent = t;
  tankBtn.classList.toggle('full', full);
  // 红点：卵孵好了 / 有未读动态（静态）；气泡：卵「刚」孵好时弹一次（~3s 收起）> 新手引导"去看看你的水族箱！"（只一次）
  // v1.3：旧版只要有孵好的卵，气泡就一直上下飘（每秒 refresh 都保持显示）→ 改为按卵 uid 去重、只提示一次（刷新页面也不重复）
  const unread = tankUI.unread() > 0, tutB = tankTut.pending && !ready;
  $('tankDot').classList.toggle('hidden', !ready && !unread);
  const now = performance.now();
  if (ready) {
    const fresh = meta.readyEggs().filter((x) => !eggPop.seen.has(x.uid));
    if (fresh.length) { for (const x of fresh) eggPop.seen.add(x.uid); eggPopSave(); if (!tankUI.isOpen) eggPop.pending = true; }
  }
  const canPop = started && !tankUI.isOpen && !TANK_LOCK.has(player?.state) && !photo && !catchCard.shown && !UI.sheetOpen();
  if (eggPop.pending && canPop) {
    eggPop.pending = false; eggPop.until = now + 3200; bump = true;
    clearTimeout(eggPop.tm); eggPop.tm = setTimeout(() => refreshTankBtn(), 3300);
  }
  const popOn = now < eggPop.until && canPop;
  const bub = $('tankBub'), bt = popOn ? '孵好了！' : tutB ? '去看看你的水族箱！👀' : '';
  if (bub.textContent !== bt && bt) bub.textContent = bt;
  bub.classList.toggle('tut', tutB && !popOn); bub.classList.toggle('hidden', !bt || TANK_LOCK.has(player?.state));
  if (bump) { tankBtn.classList.remove('bump'); void tankBtn.offsetWidth; tankBtn.classList.add('bump'); }
  const isItem = !!player?.v?.item;   // v1.1：钓到道具 → 「收进背包」（不进水族箱、不占容量）
  const oddId = !isItem && SPECIES_BY_ID[player?.v?.sp]?.odd ? player.v.sp : null;   // v4：宝箱 / 漂流瓶 / 小黄鸭 → 「收下」（不进水族箱）
  const key = isItem ? 'item' : oddId ? 'odd-' + oddId : full ? 'full' : 'n' + n;
  if (keepBtn.dataset.k !== key && oddId) {
    keepBtn.dataset.k = key; keepBtn.classList.remove('full');
    keepBtn.innerHTML = oddId === 'chest' ? `${ic('bag')}收下宝箱奖励！<span class="tc">不占水族箱</span>` : `${ic('bag')}收下${SPECIES_BY_ID[oddId].name}！<span class="tc">不占水族箱</span>`;
  } else if (keepBtn.dataset.k !== key && isItem) {
    keepBtn.dataset.k = key; keepBtn.classList.remove('full');
    keepBtn.innerHTML = `${ic('bag')}收进背包！<span class="tc">道具 ${meta.bagTotal()}</span>`;
  } else if (keepBtn.dataset.k !== key) {
    keepBtn.dataset.k = key; keepBtn.classList.toggle('full', full);
    keepBtn.innerHTML = full ? `${ic('fish')}水族箱满了！选一条腾位置` : `${ic('fish')}收进水族箱！<span class="tc">${n}/${TANK_MAX}</span>`;
  }
}
// 新手引导：首次钓到鱼收进水族箱后，入口出现一次"去看看你的水族箱！"气泡（进过水族箱即永久消失）
const tankTut = { pending: false };
// v1.3「孵好了」一次性提示：已提示过的卵 uid 记在本地（只保留仍在箱里的），刷新页面不会再弹
const EGG_POP_KEY = 'ff-egg-pop-v1';
const eggPop = { seen: new Set((() => { try { return JSON.parse(localStorage.getItem(EGG_POP_KEY) || '[]'); } catch { return []; } })()), pending: false, until: 0, tm: 0 };
function eggPopSave() {
  const alive = new Set(meta.S.tank.filter((x) => x.egg).map((x) => x.uid));
  for (const u of eggPop.seen) if (!alive.has(u)) eggPop.seen.delete(u);
  try { localStorage.setItem(EGG_POP_KEY, JSON.stringify([...eggPop.seen])); } catch { /* */ }
}
// 在水族箱里亲眼看到卵孵好（卵上方标签变「孵好了！」）→ 记为已提示，回到钓鱼不再弹
function eggPopSeenInTank() {
  const fresh = meta.readyEggs().filter((x) => !eggPop.seen.has(x.uid));
  if (fresh.length) { for (const x of fresh) eggPop.seen.add(x.uid); eggPopSave(); }
}
function openTank() {
  if (!started || !player || tankUI.isOpen || TANK_LOCK.has(player.state) || photo || UI.modalOpen()) return;
  if (!tut.get('tankBub')) tut.set('tankBub');
  tankTut.pending = false; eggPop.pending = false; eggPop.until = 0;
  initAudio(); sfx.open(); sfx.reel(false);
  joyReset(); drag = null;
  document.body.classList.add('intank');
  tankUI.open();
}
function exitTank() { document.body.classList.remove('intank'); clock.getDelta(); refreshTankBtn(); refreshHUD(); rewardT = Math.max(rewardT, 1.0); }   // v1.1：回到钓鱼后先缓 1s 再放排队的奖励提示
tankBtn.addEventListener('click', openTank);
keepBtn.addEventListener('click', (e) => { e.stopPropagation(); keepCatch(); });

function keepCatch() {
  if (!player || player.state !== 'hold' || photo || tankUI.roomOpen() || player.t < 0.4) return;
  initAudio();
  const v = player.v; if (!v) return;
  if (v.item) { meta.addItem(v.item.id, v.item.n || 1); const it = meta.genes.ITEM_BY_ID[v.item.id]; stowCatch(); UI.toast(`${it.emoji} ${it.name} 收进背包啦<small>去水族箱 · 基因改造里用它装扮鱼</small>`, true, 2400); return; }
  // v4：odd（宝箱 / 漂流瓶 / 小黄鸭）不是鱼 → 不进水族箱；宝箱奖励已在钓上来时当场发放
  const osp = SPECIES_BY_ID[v.sp];
  if (!osp || osp.odd) {
    stowCatch(false);
    UI.toast(v.sp === 'chest' ? `🎁 宝箱奖励已收下<small>${v.chestText || '幸运饵已到账'}</small>` : v.sp === 'bottle' ? '🍾 纸条收进图鉴啦<small>漂流瓶不占水族箱位置</small>' : `${UI.ODD_EMOJI[v.sp] || '✨'} 收下了${osp?.name || '礼物'}<small>它不是鱼，不会进水族箱</small>`, true, 2400);
    refreshTankBtn(); return;
  }
  if (!meta.tankFull()) { meta.addToTank(v); stowCatch(); return; }
  tankUI.openRoom(v, (r) => {
    if (r.type === 'releaseNew') {   // 新鱼被放生：沿用"抛回大海"演出
      player.release(); sfx.coin();
      UI.toast(`它游向了大海，也许会被别人钓到～<small>放生 +${r.pts} 分</small>`, true, 2600);
    } else {
      stowCatch();
      UI.toast(r.type === 'fusedNew' ? '融合成了一颗卵<small>去水族箱看它孵化</small>' : `腾好位置啦，新鱼已收进水族箱${r.pts ? `<small>放生 +${r.pts} 分</small>` : ''}`, true, 2600);
    }
    refreshHUD(); refreshTankBtn();
  });
}
// 抱着的鱼 → 缩小消失 + 光点飞向左下角入口（按钮弹跳 +1）→ 回到钓鱼
const stowing = [];
function stowCatch(fly = true) {
  const a = player, f = a.fish, v = a.v;
  let sx = W * 0.5, sy = H * 0.5;
  if (f) {
    const s = screenOf(f.root.getWorldPosition(V()), {}); if (s.vis) { sx = s.x; sy = s.y; }
    scene.attach(f.root); stowing.push({ f, t: 0, s0: f.root.scale.clone() });
  }
  a.char.held = null; a.fish = null; a.v = null; a.set('idle'); a.char.setMode('rod');
  UI.hideCatch(); catchCard.shown = false; $('polaroid').classList.remove('show');
  UI.attnQuiet(1.6); rewardT = Math.max(rewardT, 1.0);
  sfx.stow(); fx.calm(0.4);
  if (!fly) return;   // v4：odd 不飞向水族箱入口
  if (!tut.get('tankBub')) tankTut.pending = true;
  flyToTank(sx, sy, v);
}
function flyToTank(x0, y0, v) {
  const d = document.createElement('div'); d.className = 'tkfly'; d.innerHTML = '<img data-ugc="0" alt="">' + ['#ff97a3', '#ffd45c', '#4fd6c0', '#9b8cff', '#fff', '#6cc4ff'].map((c, i) => `<i style="background:${c};--dx:${Math.cos(i * 1.05) * 60}px;--dy:${Math.sin(i * 1.05) * 60}px;animation-delay:${i * 0.03}s"></i>`).join('');
  UI.fillThumbs(d, [v]); app.appendChild(d);
  const t0 = performance.now(), T = 700;
  const step = (now) => {
    const r = tankBtn.getBoundingClientRect(), ar = app.getBoundingClientRect();
    const x1 = r.left - ar.left + 26, y1 = r.top - ar.top + 26;   // v1.3：入口在顶栏 → 飞向图标中心
    const k = Math.min(1, (now - t0) / T), e = k * k * (3 - 2 * k);
    const x = x0 + (x1 - x0) * e - Math.sin(k * Math.PI) * 50, y = y0 + (y1 - y0) * e - Math.sin(k * Math.PI) * 40;
    d.style.transform = `translate(${x}px,${y}px) scale(${1 - 0.5 * k})`;
    if (k < 1) requestAnimationFrame(step); else { d.remove(); sfx.pop(); vibrate(30); refreshTankBtn(true); }
  };
  requestAnimationFrame(step);
}
// 玩家 18% 钓到"别人放生/创作的鱼"（不改 angler.js：包一层 hookset，物种经 getLuck 对齐后换外观）
function wrapOceanCatch(a) {
  const hs = a.hookset.bind(a);
  a.hookset = () => {
    const can = !baitOn && !dbg.force && !Q.get('force') && !dbg.item && !Q.get('item') && meta.S.catches >= 1;   // v1.1：强制道具（调试）时不走别人放生的鱼
    a._ocean = can ? meta.rollOceanCatch(dbg.ocean ?? (Q.has('ocean') ? 1 : 0.18)) : null;
    hs();
    const ov = a._ocean; a._ocean = null;
    if (!ov || !a.fish || a.v?.item) return;
    const vis = a.fish.root.visible; a.fish.dispose();
    a.v = ov; const f = a.fish = new Fish(ov, stylizeFish); f.root.visible = vis; scene.add(f.root);
    f.holdFit(Math.max(0.4, Math.min(ov.cm / 100, 2.2)));
  };
}
// 每帧：收鱼缩小动画 + 大海模拟（放生的鱼被别人钓到 → 通知）+ 入口红点
let tankSlowT = 0;
function updateTankFlow(dt) {
  for (let i = stowing.length - 1; i >= 0; i--) {
    const s = stowing[i]; s.t += dt; const k = Math.min(1, s.t / 0.35);
    s.f.root.scale.copy(s.s0).multiplyScalar(Math.max(0.001, 1 - k * k)); s.f.root.position.y += dt * 1.2;
    if (k >= 1) { s.f.dispose(); stowing.splice(i, 1); }
  }
  tankSlowT -= dt; if (tankSlowT > 0) return; tankSlowT = 1;
  const ev = meta.oceanTick(Date.now(), !!dbg.oceanNow); dbg.oceanNow = false;
  if (ev) {
    if (tankUI.isOpen) tankUI.notify(ev.text, ev.mine, 4200);
    else UI.feedPush({ html: ev.text, icon: 'wave', mine: true, cls: 'ocean' + (ev.mine ? ' gold' : ''), v: ev.v, ttl: 4200, sticky: true });
    sfx.oceanBell(ev.mine); if (ev.mine) sfx.sparkle();
  }
  if (!tankUI.isOpen) refreshTankBtn(); else eggPopSeenInTank();
}

// ======================= 输入 =======================
const keys = {};
const joy = { on: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); actDown(); }
  if (e.code === 'KeyM') toggleSound();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space') actUp(); });

const actEl = $('act');
let actHeld = false;
function actDown() {
  if (!started || !player || tankUI.isOpen || tankUI.roomOpen()) return;
  initAudio();
  actHeld = true; actEl.classList.add('down');
  if (player.state === 'hold') { keepCatch(); return; }   // v1.0：抱鱼时主操作 = 收进水族箱（原"放生"）
  player.press();
}
function actUp() {
  actHeld = false; actEl.classList.remove('down');
  if (!player) return;
  player.releasePress();
}
actEl.addEventListener('pointerdown', (e) => { e.preventDefault(); actEl.setPointerCapture(e.pointerId); actDown(); });
actEl.addEventListener('pointerup', actUp);
actEl.addEventListener('pointercancel', actUp);

// v1.3 常驻摇杆：左下固定底盘（idle / 抱鱼时一直显示），在底盘（含一圈容差热区）内按下 → 触点跟手、拖动走路；
// 摇杆以外的屏幕区域由 canvas 处理 = 转视角。两者各自按 pointerId 捕获，可一指走一指转（多点触控）
const joyEl = $('joy'), joyBase = $('joyBase'), joyKnob = $('joyKnob'), joyHint = $('joyHint');
const JOY_KEY = 'ff-joy-hint-v1';
const JOY_R = 46;   // 触点最大行程（px）
const joyTip = { done: (() => { try { return !!localStorage.getItem(JOY_KEY); } catch { return false; } })(), t: 0 };
function joyTipDone() { if (joyTip.done) return; joyTip.done = true; joyHint.classList.remove('show'); try { localStorage.setItem(JOY_KEY, '1'); } catch { /* */ } }
function joyMove(e) {
  const r = joyBase.getBoundingClientRect();   // 底盘中心固定：触点相对底盘中心
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const l = Math.hypot(dx, dy);
  if (l > JOY_R) { dx *= JOY_R / l; dy *= JOY_R / l; }
  joy.x = dx / JOY_R; joy.y = -dy / JOY_R;
  joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
}
function joyReset() { joy.on = false; joy.id = null; joy.x = joy.y = 0; joyEl.classList.remove('on'); joyKnob.style.transform = ''; }
joyEl.addEventListener('pointerdown', (e) => {
  if (joy.on && joy.id !== e.pointerId) return;   // 已有一指在摇杆上：其余手指不抢
  e.preventDefault(); initAudio();
  joy.on = true; joy.id = e.pointerId;
  joyEl.classList.add('on'); try { joyEl.setPointerCapture(e.pointerId); } catch { /* */ }
  joyMove(e);
  joyTipDone();
});
joyEl.addEventListener('pointermove', (e) => { if (joy.on && e.pointerId === joy.id) joyMove(e); });
const joyEnd = (e) => { if (e.pointerId === joy.id) joyReset(); };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd); joyEl.addEventListener('lostpointercapture', joyEnd);

// 镜头拖拽（画面空白处）
const cam = { yaw: 0, pitch: 0.3, dist: 5.4, userT: 0 };
let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (tankUI.isOpen) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); initAudio(); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  cam.yaw -= dx * 0.008; cam.pitch = clamp(cam.pitch + dy * 0.005, 0.05, 1.0); cam.userT = 2.5;
});
const dragEnd = () => { drag = null; };
canvas.addEventListener('pointerup', dragEnd); canvas.addEventListener('pointercancel', dragEnd);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + e.deltaY * 0.004, 3, 9); }, { passive: true });

// 按钮：菜单（v1.3：先到 2×2 大卡首页，卡片上带红点/摘要，再进子页；子页统一「‹ 返回」）
let lastTab = 'home';
$('menuBtn').addEventListener('click', () => { initAudio(); UI.openSheet('home', sheetCtx); });
// v1.3 左上「今日积分」胶囊 → 直接打开排行，自动滚到「我」并高亮
$('me').addEventListener('click', () => {
  if (!started || tankUI.isOpen || photo || UI.modalOpen()) return;
  initAudio(); UI.openSheet('rank', sheetCtx, { focusMe: true });
});
$('shX').onclick = () => { lastTab = UI.sheetOpen() || lastTab; UI.closeSheet(); };
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) { lastTab = UI.sheetOpen() || lastTab; UI.closeSheet(); } });
function toggleSound() { const m = toggleMute(); meta.S.muted = m; meta.save(); UI.renderSheet(sheetCtx); if (!UI.sheetOpen()) UI.toast(m ? '已静音' : '声音已开启'); }
$('sndBtn').onclick = () => { initAudio(); toggleSound(); };
const fmtReward = (r) => [r.bait ? `幸运饵 ×${r.bait}` : '', r.pts ? `+${r.pts} 分` : '', r.itemGot ? meta.genes.itemLabel(r.itemGot) : ''].filter(Boolean).join(' · ');
$('bait').onclick = () => {
  initAudio();
  if (meta.S.bait <= 0 && !baitOn) { UI.toast('幸运饵用完啦<small>完成任务 / 升级可获得</small>'); sfx.slip(); return; }
  baitOn = !baitOn; $('bait').classList.toggle('on', baitOn); sfx.tap();
  $('bait').querySelector('.tip').textContent = baitOn ? '已挂上 · 必出特别以上' : '幸运饵';
  if (!baitOn) UI.toast('已取下幸运饵');
};
$('photoBtn').onclick = () => takePhoto();
// 点过的按钮立刻失焦：避免之后按空格（主操作）误触发它
document.addEventListener('click', (e) => { const b = e.target.closest?.('button'); if (b) setTimeout(() => b.blur(), 0); }, true);
$('cMore').onclick = () => { $('catch').classList.toggle('open'); sfx.tap(); };
$('polaroid').onclick = () => { $('polaroid').classList.remove('show'); sfx.close(); };

const sheetCtx = {
  meta, live, anglers,
  onSeenCodex() { if (newSpecies) { newSpecies = 0; refreshHUD(); } },
  onWatch: (a) => onWatch(a),
  onOpenTank: () => setTimeout(openTank, 260),
  onClaimStreak() { const g = meta.claimStreak(); if (g) { sfx.coin(); UI.toast(`出海奖励 ${fmtReward(g.reward)}`, true); refreshHUD(); } },
  onClaimTask(id) { const r = meta.claimTask(id); if (r) { sfx.coin(); UI.toast(`领取成功 ${fmtReward(r)}`, true); refreshHUD(); } },
};

function doRelease() {
  if (!player || player.state !== 'hold') return;
  player.release();
}

// ======================= 拍照 =======================
let photo = null;
function takePhoto() {
  if (!player || player.state !== 'hold' || photo) return;
  initAudio();
  photo = { t: 0, shot: false };
  document.body.classList.add('photo');
  UI.hideCatch();
}
function finishPhoto(dataURL) {
  $('flash').classList.remove('go'); void $('flash').offsetWidth; $('flash').classList.add('go');
  sfx.shutter();
  const v = player.v;
  $('polImg').src = dataURL;
  $('polCap').innerHTML = `${UI.fmtLenTxt(v.cm)} 的 ${displayName(v)}<small>${ROOM[0].name} @ 果冻湾 · ${new Date().toLocaleDateString()} · 朋友钓鱼</small>`;
  setTimeout(() => { $('polaroid').classList.add('show'); document.body.classList.remove('photo'); catchCard.walkHide = 0.01; }, 350);
  meta.S.photos++; taskDone(meta.bumpTask('photo1'));
}

// ======================= 事件 → 反馈 =======================
const tmp = V(), tmp2 = V();
function screenOf(p, out = { x: 0, y: 0, vis: false }) {
  tmp.copy(p).project(camera);
  out.vis = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
  out.x = (tmp.x * 0.5 + 0.5) * W; out.y = (-tmp.y * 0.5 + 0.5) * H;
  return out;
}
const camShake = { amp: 0 };
function shake(a) { camShake.amp = Math.min(0.5, Math.max(camShake.amp, a)); }
const slow = { scale: 1, target: 1, hold: 0 };
function slowmo(scale, hold) { slow.scale = scale; slow.target = 1; slow.hold = hold; }
function vibrate(ms) { try { navigator.vibrate?.(ms); } catch { /* */ } }
// 奖励队列：放生后（回到 idle）依次以居中轻提示出现；升级 / 签到才用弹窗
const rewardQ = []; let rewardT = 0;
UI.setAttnBlocker(() => rewardQ.length > 0 && player?.state === 'idle' && !UI.sheetOpen());
// r1：放生后奖励最多排 5 条（任务/图鉴/排名×2/升级），要 5~7 秒才放完，升级弹窗常在玩家已经去点菜单时才弹出、挡住操作
// → 升级弹窗插队到最前（最重要的时刻）；同类排名提示只保留最新一条；单条提示更短
// r3：kind 去重 —— 上一轮没放完的"升到 Lv.3"不会排在"升到 Lv.4"弹窗后面出现
function reward(item) {
  if (item.kind) for (let i = rewardQ.length - 1; i >= 0; i--) if (rewardQ[i].kind === item.kind) rewardQ.splice(i, 1);
  if (item.modal) { const i = rewardQ.findIndex((r) => !r.modal); i < 0 ? rewardQ.push(item) : rewardQ.splice(i, 0, item); } else rewardQ.push(item);
}
function pumpRewards(dt) {
  rewardT -= dt;
  if (rewardT > 0 || !rewardQ.length || !player || player.state !== 'idle' || UI.modalOpen() || UI.sheetOpen() || photo || UI.attnQuietLeft() > 0) return;
  const r = rewardQ.shift();
  if (r.modal) { UI.modal(r.modal); r.sfx?.(); rewardT = 0.6; return; }
  UI.toast(r.html, !!r.accent, r.ms || 1300); r.sfx?.(); rewardT = (r.ms || 1300) / 1000 + 0.2;
}
function taskDone(list) {
  for (const d of list || []) reward({ html: `任务完成<small>${d.text} · 去菜单领取</small>`, accent: true, sfx: () => sfx.task() });
  refreshHUD();
}
const fightUI = { revealed: false };
const weakCast = { n: 0 }, slipTip = { n: 0 };

// 新手提示：仅前 2 次抛竿流程出现（一行，贴在主按钮上方）
const TUT_N = 2;
const tutOn = (st) => (st === 'idle' || st === 'charge' ? meta.S.tutorial < TUT_N : meta.S.tutorial <= TUT_N && meta.S.tutorial > 0);
function hint(text) { if (!tutOn(player.state)) return; hint.txt = text; hint.t = 2.4; }
hint.t = 0; hint.txt = '';

const evLog = [];
const friendSSR = { last: -40 };   // 开局 40s 后好友才可能出 SSR
const dbg = { force: null };   // 测试用：G.dbg.force = 'sunfish' 指定下一条鱼
function onEvent(a, type, d) {
  const me = a.isPlayer;
  evLog.push(`${time.toFixed(1)} ${a.id} ${type}`); if (evLog.length > 200) evLog.shift();
  const near = me || (a.char.root.getWorldPosition(tmp2).distanceTo(camera.position) < 14);
  switch (type) {
    case 'charge': if (me) { UI.clearToast(); hint.t = 0; fx.calm(); } break;
    case 'cast':
      if (me) {
        sfx.cast();
        if (meta.S.tutorial <= TUT_N) { meta.S.tutorial++; meta.save(); }
        if (d.perfect) { sfx.perfectCast(); const s = screenOf(a.char.headW); UI.floatText('完美抛竿', s.x, s.y - 40, '#ffb21a'); taskDone(meta.bumpTask('pcast3')); }
        else if (d.power < 0.4) {
          // r1：弱抛竿以前毫无反馈（浮漂落在脚边，像 bug）→ 头顶飘字 + 前 3 次给一句怎么改
          const s = screenOf(a.char.headW); UI.floatText('抛近了', s.x, s.y - 40, '#9fe3ff');
          if ((weakCast.n = (weakCast.n || 0) + 1) <= 3) { UI.toast('抛得有点近<small>多蓄一会儿，在黄色区松手抛得更远</small>', false, 2200); weakCast.live = true; }
        }
      } else if (near) sfx.whoosh();
      break;
    case 'whoosh': if (me) sfx.whoosh(); break;
    case 'plop':
      fx.splash(d.at, 0.35, 10);
      // r2：弱抛竿提示不再拖进等待阶段（等待时注意力应在浮漂上）→ 落水后 0.5s 收起
      if (me) { sfx.plop(); if (weakCast.live) { weakCast.live = false; setTimeout(() => { if (player.state === 'float' || player.state === 'cast') UI.clearToast(); }, 500); } }
      break;
    case 'nibble': if (me) { sfx.nibble(); shake(0.03); hint('有动静…别急，等浮漂猛沉'); } break;
    case 'bite':
      fx.splash(d.at, 0.8, 22);
      if (me) { sfx.bite(); shake(0.16); vibrate(80); document.body.classList.add('bite'); hint.t = 0; }
      break;
    case 'missed': if (me) { document.body.classList.remove('bite'); sfx.slip(); UI.toast('慢了一拍<small>鱼还在附近，再等等</small>'); } break;
    case 'early':
      if (me) { sfx.slip(); UI.toast(d.nibbled ? '太早啦<small>轻轻一动是试探，等浮漂猛沉、出现「!」</small>' : '收回来了<small>等浮漂猛沉、出现「!」再扬竿</small>'); }
      break;
    case 'hookset':
      fx.splash(a.hook, 1.1);
      if (me) {
        document.body.classList.remove('bite'); UI.clearToast();
        sfx.hookset(d.perfect); shake(d.perfect ? 0.35 : 0.22); vibrate(d.perfect ? 120 : 60);
        if (d.perfect) { slowmo(0.35, 0.25); const s = screenOf(a.char.headW); UI.floatText('完美扬竿', s.x, s.y - 40, '#ff6b57'); }
        const R = RARITY[SPECIES_BY_ID[d.v.sp].rarity];
        fightUI.revealed = false;
        if (R.power >= 1.15 && !d.perfect) { const s = screenOf(a.char.headW); UI.floatText('大家伙！', s.x, s.y - 40, '#ff9d2e'); }
      } else {
        if (near) sfx.splash(0.4);
        if (RARITY[SPECIES_BY_ID[d.v.sp].rarity].power >= 1.15 && Math.random() < 0.7) friendFeed(a, { html: `<b>${a.name}</b> 正在和大家伙搏斗！`, icon: 'reel' }, 1);
      }
      break;
    case 'fight': break;
    case 'warn': if (me) { sfx.warn(); document.body.classList.add('surge'); vibrate(40); } break;
    case 'surge':
      fx.splash(a.hook, 0.7 * d.pw, 16);
      if (me) { sfx.splash(0.6); shake(0.12 * d.pw); }
      break;
    case 'surgeEnd': if (me) document.body.classList.remove('surge'); break;
    case 'slip': if (me) { sfx.slip(); vibrate(25); const s = screenOf(a.hook); if (s.vis && (slipTip.n = (slipTip.n || 0) + 1) <= 4) UI.floatText('线被拖走了！', s.x, s.y - 30, '#ff5a4a'); } break;
    case 'jump':
      fx.splash(d.at, 1.4, 34);
      if (me || near) sfx.jump();
      if (me) {
        slowmo(0.3, 0.45); shake(0.15);
        const sp = SPECIES_BY_ID[a.v.sp];
        fightUI.revealed = true; const s = screenOf(a.hook); UI.floatText(`是${sp.name}！`, s.x, s.y - 60, RARITY[sp.rarity].color);
      }
      break;
    case 'reenter': fx.splash(d.at, 1.0, 26); if (me) sfx.splash(1); break;
    case 'snap': case 'escape':
      if (me) {
        sfx.reel(false); document.body.classList.remove('surge', 'bite');
        if (type === 'snap') { sfx.snap(); shake(0.3); UI.toast('线断了<small>按钮变红 = 鱼在发力，先松手，等它没劲再收</small>', false, 2600); } else { sfx.slip(); UI.toast('鱼跑掉了<small>按住收线，别让它游太远</small>'); }
        sfx.sad();
        meta.breakCombo(); refreshHUD();
        setTimeout(() => friendsReact('fail'), 1200);
      } else { if (near) sfx.slip(); a.combo = 0; if (Math.random() < 0.35) friendFeed(a, { html: `<b>${a.name}</b> 跑了一条，${pick(['好气哦', '下次一定', '鱼：拜拜'])}` }, 1); }
      break;
    case 'landing':
      fx.splash(d.at, 1.6, 40);
      if (me) { sfx.splash(1.4); sfx.reel(false); sfx.landing(); slowmo(0.3, 0.55); shake(0.25); document.body.classList.remove('surge'); }
      else if (near) sfx.splash(0.8);
      break;
    case 'caught': onCaught(a, d); break;
    case 'flop': if (me) { sfx.flop(); shake(0.04); } break;
    case 'release':
      // r3：放生 → 抛回大海（0.85s）→ 落水后再留 ~1s 安静期，之后奖励提示 / 好友动态 / 气泡按优先级一个一个来
      if (me) { sfx.release(); fx.calm(0.6); UI.hideCatch(); catchCard.shown = false; $('polaroid').classList.remove('show'); UI.attnQuiet(1.9); rewardT = Math.max(rewardT, 0.9); }
      break;
    case 'splashdown':
      fx.splash(d.at, d.big, 26); if (me || near) sfx.splash(me ? 1 : 0.5);
      if (me) { const s = screenOf(d.at); if (s.vis) UI.floatText('拜拜～回家啦', s.x, s.y - 30, '#22c38e'); UI.attnQuiet(1.0); }
      break;
  }
}

// v1.1 钓到道具漂流物：钓获卡显示「获得道具：xx ×1」+ 稀有度 + 一句描述，主按钮「收进背包」
function onItemCaught(a, d, v) {
  const G = meta.genes, it = G.ITEM_BY_ID[v.item.id], R = G.ITEM_RARITY[it.rarity], cat = G.ITEM_CATS[it.cat];
  const ri = G.ITEM_RARITY_ORDER.indexOf(it.rarity);
  UI.showCatch(v, { isNew: false, n: 1, score: 0, bonus: [], chips: [], combo: 0, spGot: 0, prevBest: 0, prevSame: null, featured: false }, 0);
  if (v.sp === 'pod_chest') openLid(a);   // v4.1：装扮小宝箱同样掀盖
  const rb = $('cRar'); rb.textContent = R.short; rb.style.background = R.color;
  $('cName').textContent = `获得道具：${it.name} ×${v.item.n || 1}`; $('cName').className = 'l';
  $('cNew').classList.add('hidden');
  $('cMeta').textContent = `${SPECIES_BY_ID[v.sp].name} · ${cat.emoji}${cat.label} · ${R.label}`;
  { const p = $('cPts'); cancelAnimationFrame(p._raf); p.textContent = it.emoji; }   // 停掉 showCatch 的分数滚动，否则会被覆盖成 "+0"
  $('cCombo').textContent = '';
  $('cBy').textContent = '不占水族箱位置';
  $('cChips').innerHTML = `<span class="hi"><em>${it.desc}</em></span>`;
  $('cDetail').innerHTML = `<b>${it.emoji} ${it.name}</b> · ${cat.label} · ${R.label}<br>效果：${it.pv}<br>${cat.hint}<br>在水族箱点一条鱼 →「基因改造」，最多同时用 3 个道具`;
  $('catch').classList.remove('open'); $('catch').classList.add('item');
  $('catch').style.setProperty('--ic', it.color + '66'); $('catch').style.setProperty('--rc', R.color);
  catchCard.shown = true; catchCard.walkHide = 0;
  refreshTankBtn();
  sfx.catch(ri >= 2 ? 'epic' : ri >= 1 ? 'rare' : 'uncommon'); if (ri >= 2) setTimeout(() => sfx.sparkle(), 400);
  vibrate(ri >= 2 ? [60, 40, 120] : 50);
  onEvent(a, 'itemCaught', { id: it.id });
  setTimeout(() => friendsReact('small'), 500);
}
// v4：3D 箱盖掀开（迷你宝箱 / 装扮小宝箱共用）
function openLid(a) {
  const lid = a.fish?.model?.userData?.chestLid, t0 = performance.now();
  if (!lid) return;
  // v4.1 QA：抱在胸前时箱盖后缘贴着角色 → 掀开后竖起的箱盖正好挡脸；改为「掀开 → 弹飞缩小消失」，最终露出满箱金币
  const y0 = lid.position.y;
  const step = (now) => {
    const k = THREE.MathUtils.clamp((now - t0 - 300) / 520, 0, 1), e = 1 - Math.pow(1 - k, 3);
    const k2 = THREE.MathUtils.clamp((now - t0 - 820) / 420, 0, 1), e2 = k2 * k2;
    lid.rotation.x = -1.95 * e + Math.sin(k * Math.PI) * 0.12 - 1.2 * e2;
    lid.position.y = y0 + 0.9 * Math.sin(k2 * Math.PI * 0.5);
    lid.scale.setScalar(Math.max(0.001, 1 - e2));
    if (k2 >= 1) lid.visible = false;
    if (k2 < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// v4：迷你宝箱当场开箱 —— 幸运饵 ×2 + 一件稀有以上装扮道具 + 金币积分；3D 箱盖掀开 + 金色彩带
function openChestNow(a, v) {
  const G = meta.genes, bait = 2, pts = 50 + 10 * Math.floor(Math.random() * 6);
  const item = G.rollItemDrop(Math.random, { minRarity: 'rare' }), it = G.ITEM_BY_ID[item];
  meta.addItem(item, 1);
  meta.S.bait += bait; meta.S.total += pts; meta.S.today.score += pts; meta.save();
  v.chestText = `幸运饵 +${bait} · ${it.emoji}${it.name} · +${pts} 分`;
  openLid(a);
  setTimeout(() => {
    const at = a.fish ? a.fish.root.getWorldPosition(V()) : a.char.headW.clone();
    fx.confetti(at.clone().add(V(0, 0.25, 0)), 70, null); sfx.coin(); sfx.sparkle(); vibrate([30, 30, 60]);
    const s = screenOf(at, {}); if (s.vis) UI.floatText(`🎁 幸运饵+${bait} ${it.emoji}${it.name}`, s.x, s.y - 40, '#ffb21e');
    refreshHUD();
  }, 650);
  return { bait, pts, item };
}
function onCaught(a, d) {
  const v = d.v, sp = SPECIES_BY_ID[v.sp], ri = RARITY_ORDER.indexOf(sp.rarity);
  const at = a.char.headW.clone();
  let away = null;
  if (a.isPlayer) { away = a.char.root.getWorldDirection(V()); away.y = 0; away.normalize(); }
  fx.confetti(at.clone().add(V(0, 0.3, 0)), 40 + ri * 30, away);
  if (a.isPlayer && v.item) { onItemCaught(a, d, v); return; }
  if (a.isPlayer) {
    const isNew = !meta.S.codex[v.sp];
    const featured = v.sp === meta.featured.id;
    const prevBest = meta.S.codex[v.sp]?.best || 0, prevSame = meta.S.log.find((L) => L.v.sp === v.sp)?.v || null;   // r3：钓获卡"这条哪里不一样"
    let score = scoreOf(v, { frenzy: frenzy.on, combo: meta.S.combo, first: isNew });
    if (featured) score = Math.round(score * 1.3);
    if (d.perfect) score += 20;
    const rec = meta.recordCatch(v, { perfect: d.perfect, perfectCast: d.perfectCast, tide: frenzy.on, score });
    if (sp.id === 'chest') v.chestGot = openChestNow(a, v);   // v4：宝箱当场开箱发奖（不进水族箱）
    if (rec.isNew) newSpecies++;
    // 全部加成进详情；卡片上只露最重要的 2 个
    const mult = v.traits.reduce((m, t) => m * TRAITS[t].mult, 1);
    const bonus = [], chips = [];
    if (v.chestGot) chips.push(`幸运饵 +${v.chestGot.bait}`);
    if (rec.isNew) bonus.push('新物种 +100');
    if (rec.isBest) chips.push('个人最大');
    if (v.traits.length) { bonus.push(`特质 ×${mult}`); chips.push(`${TRAITS[v.traits[0]].label} ×${mult}`); }
    if (featured) { bonus.push('今日精选 ×1.3'); chips.push('今日精选 ×1.3'); }
    if (frenzy.on) { bonus.push('鱼潮 ×1.5'); chips.push('鱼潮 ×1.5'); }
    if (d.perfect) { bonus.push('完美扬竿 +20'); chips.push('完美扬竿 +20'); }
    if (a.usedBait) { bonus.push('幸运饵'); chips.push('幸运饵'); }
    if (meta.S.combo >= 2) bonus.push(`连击 ×${meta.S.combo}`);
    if (d.perfectCast) { bonus.push('完美抛竿'); chips.push('完美抛竿'); }
    const n = 100 + Math.floor(Math.random() * 9000);
    const spGot = Object.keys(meta.S.codex).filter((id) => SPECIES_BY_ID[id] && !SPECIES_BY_ID[id].odd).length;
    UI.showCatch(v, { ...rec, score, bonus, chips, combo: meta.S.combo, spGot, n: meta.S.codex[v.sp]?.n || 1, prevBest, prevSame, featured }, n);
    catchCard.shown = true; catchCard.walkHide = 0;
    if (sp.odd) {   // v4：odd 卡片注明不占水族箱；宝箱列出当场开出的奖励
      $('cBy').textContent = v.chestGot ? '奖励已到账 · 不占水族箱' : '不是鱼 · 不占水族箱位置';
      const cg = v.chestGot;
      const cit = cg && meta.genes.ITEM_BY_ID[cg.item];
      if (cg) $('cChips').innerHTML = `<span class="hi" style="--rc:#ffc94d"><em>🎁 当场开箱：幸运饵 ×${cg.bait}${cit ? ` · ${cit.emoji}${cit.name}` : ''} · +${cg.pts} 分</em></span>`;
      refreshTankBtn();
    }
    // v1.1：12% 鱼嘴里叼着一个道具（直接进背包，卡片一行小字）
    const mouthP = dbg.mouthP ?? (sp.odd ? 0 : meta.genes.ITEM_MOUTH_P);
    if (Math.random() < mouthP) {
      const mid = meta.genes.rollItemDrop(Math.random, {}); const it = meta.genes.ITEM_BY_ID[mid];
      meta.addItem(mid, 1); v.mouthItem = mid;
      const ml = document.createElement('div'); ml.className = 'cMouth'; ml.id = 'cMouth';
      ml.style.setProperty('--rc', meta.genes.ITEM_RARITY[it.rarity].color);
      ml.innerHTML = `<i style="background:${it.color}66">${it.emoji}</i>鱼嘴里叼着：${it.name} ×1 <small>已放进背包</small>`;
      $('cChips').appendChild(ml);
    }
    sfx.catch(sp.rarity); if (ri >= 3) setTimeout(() => sfx.sparkle(), 400);
    vibrate(ri >= 3 ? [60, 40, 120] : 60);
    // 奖励排队：放生后依次出现（升级弹窗放最后）
    if (rec.isNew) reward({ html: `图鉴解锁新物种<small>${sp.name}${sp.odd ? '' : ` · 已集 ${spGot}/${SPECIES.length} 种`}</small>`, accent: true, sfx: () => sfx.coin() });
    taskDone(rec.done);
    refreshHUD(); checkRank();
    if (rec.lvUp) {
      // r2：回流玩家前几把几乎每条鱼都升级 → 每轮一个弹窗打断节奏；只有称号变化才弹窗，其余是一条轻提示
      const lv = meta.S.level, newTitle = levelTitle(lv) !== levelTitle(lv - rec.lvUp);
      // v1.1：称号升级也改为不打断的庆祝轻提示（不再弹窗挡住「收进水族箱 / 水族箱入口 / 装扮间」操作）
      if (newTitle) reward({ kind: 'lv', html: `升到 Lv.${lv} · 新称号「${levelTitle(lv)}」<small>幸运饵 +${rec.lvUp}</small>`, accent: true, ms: 2600, sfx: () => sfx.levelUp() });
      else reward({ kind: 'lv', html: `升到 Lv.${lv}<small>幸运饵 +${rec.lvUp}</small>`, accent: true, sfx: () => sfx.levelUp() });
    }
    a.usedBait = false;
    setTimeout(() => friendsReact(ri >= 2 ? 'big' : 'small'), 500);
    // 好友点赞：合并成一条动态
    const fans = anglers.filter((x) => !x.isPlayer && Math.random() < (ri >= 2 ? 0.9 : 0.45));
    if (fans.length) setTimeout(() => {
      meta.S.today.score += 5 * fans.length; meta.S.total += 5 * fans.length; meta.save(); refreshHUD();
      const who = fans.length > 1 ? `<b>${fans.length} 位好友</b>` : `<b>${fans[0].name}</b>`;
      UI.feedPush({ whos: fans, html: `${who} 赞了你的${displayName(v)} <em>+${5 * fans.length}</em>`, key: 'likes', mine: true });
      sfx.like();
    }, 2400 + Math.random() * 900);
  } else {
    const score = scoreOf(v, { frenzy: frenzy.on, combo: 0, first: false });
    live[a.id] = (live[a.id] || 0) + score;
    a.lastCatch = { v, score, t: time };
    a.combo = (a.combo || 0) + 1;
    if (ri >= 3) friendSSR.last = time;
    const likeFn = (el) => {
      meta.S.reactionsGiven++; taskDone(meta.bumpTask('cheer3'));
      // r3：好友出 SSR/UR 时，点赞 = 沾喜气（好运值 +1，离保底更近）—— 把"别人又出货了"的压迫感变成"我也沾光"
      if (ri >= 3) { meta.S.pity = Math.min(9, (meta.S.pity || 0) + 1); meta.save(); const tx = el?.querySelector('.tx'); if (tx) tx.innerHTML = `沾到 <b>${a.name}</b> 的喜气 · 好运 +1`; }
      setTimeout(() => { UI.say(a, pick(['谢谢~', '嘿嘿 运气好', '你也加油！', '下次带你！'])); if (a.state === 'hold' || a.state === 'idle') a.char.setMode(a.state === 'hold' ? 'hold' : 'wave'); }, 400);
    };
    const name = `<b>${a.name}</b>`;
    if (ri >= 2) {   // 重要：好友钓到稀有及以上（带这条鱼的独特缩略图 + 点赞）
      const cele = ri >= 3;
      const html = cele ? `${name} 钓到 ${UI.rarBadge(sp)} ${sp.name}！<small class="ttl">点赞沾喜气 · 好运 +1</small>` : `${name} 钓到 ${UI.rarBadge(sp)} ${sp.name}${v.ugc ? `<small class="ttl">《${v.ugc.title}》</small>` : ''}`;
      if (friendFeed(a, { v, html, like: likeFn, cls: cele ? 'cele' : '', ttl: cele ? 4200 : 3000 }, 2)) sfx.notify();
    } else {         // 普通渔获：随机挑一种更有生活感的说法，严格频控
      const opts = [];
      if (sp.id === 'bottle') opts.push(`${name} 捡到漂流瓶：${(v.note || '').split('——')[0].slice(0, 14)}…`);
      if (sp.id === 'duck') opts.push(`${name} 捞起一只小黄鸭 嘎`);
      if (v.ugc) opts.push(`${name} 钓到 ${v.creator} 投放的《${v.ugc.title}》`);
      if (v.ugc?.decos.length) opts.push(`${name} 的鱼戴着${v.ugc.decos.map((k) => DECOS[k]?.label).join('和')}`);
      if (v.cm >= 100) opts.push(`${name} 钓到一条 ${UI.fmtLenTxt(v.cm)} 的${sp.name}`);
      if (a.combo >= 3) opts.push(`${name} ${a.combo} 连钓！手感火热`);
      if (!meta.S.codex[sp.id] && !sp.odd) opts.push(`${name} 钓到了你还没有的${sp.name}`);
      if (opts.length && Math.random() < 0.6) friendFeed(a, { v, html: pick(opts), like: Math.random() < 0.5 ? likeFn : null }, 1);
    }
    UI.say(a, ri >= 2 ? pick(['耶！！！', '快看快看！', '大的大的！', '今天手气爆了']) : pick(['开张啦', '嘿嘿', '+1', '小小的也可爱']));
    checkRank();
    // 其他好友围观
    for (const f of anglers) if (f !== a && !f.isPlayer && f.state === 'idle' && Math.random() < 0.5) { f.char.setMode('clap'); f.reactT = 2; f.lookAt = a; }
  }
}

// 好友动态频控：全局同时只推 1 条；重要事件间隔 ≥6s，普通事件间隔 ≥14s 且同一好友 ≥30s
const feedGate = { last: -99, per: {} };
function friendFeed(a, item, prio = 1) {
  const gap = prio >= 2 ? 6 : 14;
  if (time - feedGate.last < gap) return false;
  if (prio < 2 && time - (feedGate.per[a.id] ?? -99) < 30) return false;
  feedGate.last = time; feedGate.per[a.id] = time;
  UI.feedPush({ whos: [a], ...item });
  return true;
}

// 好友对玩家的反应：动作为主；只有跑鱼时由 1 位好友喊一句
function friendsReact(kind) {
  const fs = anglers.filter((f) => !f.isPlayer);
  const talker = pick(fs);
  for (const f of fs) {
    if (Math.random() > (kind === 'big' ? 0.95 : kind === 'small' ? 0.4 : 0.5) && f !== talker) continue;
    setTimeout(() => {
      if (kind === 'fail' && f === talker) UI.say(f, pick(['下次一定', '稳住稳住', '没事 再来', '鱼：拜拜了您嘞']));
      if (f.state === 'idle') { f.char.setMode(kind === 'fail' ? 'wave' : kind === 'big' ? 'cheer' : 'clap'); f.reactT = 2.2; }
      f.lookAt = player;
    }, Math.random() * 900);
  }
}

let lastRank = null, bestRank = null;
function checkRank() {
  const rows = meta.board(live);
  const me = rows.find((r) => r.you);
  // r2：好友分数实时在涨，被反超后再超回来会反复提示"升到第 5"→ 只在刷新今日最好名次时提示，并告诉还差多少
  if (lastRank !== null && me.rank < lastRank && me.rank < (bestRank ?? 99)) {
    const passed = rows[me.rank], above = rows[me.rank - 2];
    const tail = above ? `距第 ${above.rank} 名 ${above.score - me.score} 分` : '今日第一！';
    reward({ kind: 'rank', html: `排名升到第 ${me.rank}<small>超过 ${passed?.name || '好友'} · ${tail}</small>`, accent: true, sfx: () => sfx.coin() });
  }
  lastRank = me.rank; bestRank = Math.min(bestRank ?? 99, me.rank);
  if (UI.sheetOpen() === 'rank') UI.renderSheet(sheetCtx);
}

function refreshHUD() { UI.updateTop(meta); UI.updateBadges(meta, newSpecies); }

// ======================= 世界事件：鱼潮 / 好友动作 =======================
function updateWorldEvents(dt) {
  if (!started) return;
  frenzy.t += dt;
  const calm = player.state === 'idle' || player.state === 'float';
  if (!frenzy.on && frenzy.t > frenzy.next && calm && UI.attnQuietLeft() <= 0 && !rewardQ.length && rewardT <= 0 && !$('toast').classList.contains('show') && !UI.modalOpen() && !UI.sheetOpen()) {   // r3：不和放生后的奖励提示抢同一时刻；菜单开着时不开鱼潮（玩家看不到）
    frenzy.on = true; frenzy.t = 0; frenzy.dur = 28;
    document.body.classList.add('frenzy-on'); sfx.frenzy();
    UI.toast('鱼潮来了<small>28 秒内咬钩更快 · 积分 ×1.5</small>', true, 1800);
  } else if (frenzy.on && frenzy.t > frenzy.dur) {
    frenzy.on = false; frenzy.t = 0; frenzy.next = rand(110, 170);
    document.body.classList.remove('frenzy-on');
  }
  for (const a of anglers) {
    if (a.isPlayer) continue;
    if (a.reactT > 0) { a.reactT -= dt; if (a.reactT <= 0) a.lookAt = null; }
  }
}

// ======================= 玩家移动 =======================
function updatePlayerMove(dt) {
  const c = player.char;
  let ix = joy.x, iz = joy.y;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  const mag = Math.min(1, Math.hypot(ix, iz));
  const canMove = (player.state === 'idle' || player.state === 'hold') && !photo;
  const moving = mag > 0.12 && canMove;
  const holding = player.state === 'hold';
  const maxSpeed = holding ? 2.3 : 2.9;
  const target = moving ? maxSpeed * mag : 0;
  playerState.speed += (target - playerState.speed) * (1 - Math.exp(-dt * 9));
  if (moving) {
    const yawLocal = cam.yaw - B.rotation.y;
    const ang = Math.atan2(-ix, iz) + yawLocal;
    playerState.facing += angDelta(ang, playerState.facing) * (1 - Math.exp(-dt * 12));
    playerState.idleT = 0;
  } else {
    playerState.idleT += dt;
    // 抛竿时自动转向船外
    if (player.state === 'charge' || player.state === 'cast') {
      playerState.facing += angDelta(player.wantFacingLocal(), playerState.facing) * (1 - Math.exp(-dt * 10));
    }
  }
  const p = playerState.pos;
  const ox = p.x, oz = p.z;
  if (playerState.speed > 0.01) {
    p.x += Math.sin(playerState.facing) * playerState.speed * dt;
    p.z += Math.cos(playerState.facing) * playerState.speed * dt;
  }
  {
    // 甲板边界（v0.6 栏杆降低后，按"鱼在甲板平面上的实际投影"求边界）：
    // 鱼横在胸前 —— 沿朝向的厚度 + 垂直朝向的跨度，分别投影到船宽(x) / 船长(z) 方向
    const F = playerState.facing, sF = Math.abs(Math.sin(F)), cF = Math.abs(Math.cos(F));
    let ex = 0.33, ez = 0.3;
    if (holding && player.fish) {
      const f = player.fish, fwd = 0.13 + f.depth * 0.9, half = f.span / 2;
      ex = Math.max(ex, sF * fwd + cF * half + 0.06);
      ez = Math.max(ez, cF * fwd + sF * half + 0.06);
    }
    const mx = p.x, mz = p.z;
    p.z = clamp(p.z, Math.max(-5.4, -6.0 + ez), Math.min(-0.9, -0.62 - ez));
    const hb = Math.max(0.2, halfBeamAtZ(p.z) - 0.13 - ex);
    p.x = clamp(p.x, -hb, hb);
    // 站着不动时（例如刚在栏杆边钓上一条大鱼）平滑挪进来，而不是瞬移
    if (playerState.speed <= 0.01) { const k = 1 - Math.exp(-dt * 5); p.x = mx + (p.x - mx) * k; p.z = mz + (p.z - mz) * k; }
    const push = (cx, cz, r) => { const dx = p.x - cx, dz = p.z - cz, l = Math.hypot(dx, dz); if (l < r && l > 1e-4) { p.x = cx + (dx / l) * r; p.z = cz + (dz / l) * r; } };
    push(-0.5, -4.7, 0.9); push(1.55, -3.2, 0.55);
    push(SPOTS.gugu.x, SPOTS.gugu.z, 0.62); push(SPOTS.chennayu.x, SPOTS.chennayu.z, 0.62);
    if (p.x < -1.12 && p.z < -3.2 && p.z > -5.6) p.x = -1.12;
    const step = Math.hypot(p.x - ox, p.z - oz);
    if (holding && playerState.speed > 0.01) {
      playerState.walked += step;
      if (playerState.walked >= 1) { const n = Math.floor(playerState.walked); playerState.walked -= n; taskDone(meta.bumpTask('walk1', n)); }
    }
  }
  c.root.position.set(p.x, deckYAtZ(p.z), p.z);
  c.root.rotation.y = playerState.facing;
  c.speed = playerState.speed;
  if (player.state === 'idle' && c.mode === 'free') c.setMode('rod');
}

// 好友的朝向：抱鱼时转身面向船内炫耀（也避免鱼穿出栏杆）
function updateFriends(dt) {
  for (const a of anglers) {
    if (a.isPlayer) continue;
    const c = a.char;
    let want = a.ry;
    if (a.state === 'hold') want = a.ry + Math.PI;
    else if (a.state === 'idle' && a.lookAt && a.reactT > 0) {
      a.lookAt.char.root.getWorldPosition(tmp); c.root.parent.worldToLocal(tmp);
      want = Math.atan2(tmp.x - c.root.position.x, tmp.z - c.root.position.z);
    }
    c.root.rotation.y += angDelta(want, c.root.rotation.y) * (1 - Math.exp(-dt * 4));
    c.speed = 0;
    if (a.lookAt && a.reactT > 0) c.look = a.lookAt.char.headW; else if (a.state === 'float' || a.state === 'bite') c.look = a.bobber.position; else c.look = null;
  }
  const pc = player.char;
  pc.look = (player.state === 'float' || player.state === 'bite') ? player.bobber.position : player.state === 'fight' ? player.hook : null;
}

// ======================= 游艇 / 镜头 =======================
const boatInv = new THREE.Matrix4();
function updateBoat(dt) {
  const g = B, L = 11, Wd = 3.6;
  const c = Math.cos(boatState.yaw), s = Math.sin(boatState.yaw);
  const pt = (lx, lz) => [g.position.x + lx * c + lz * s, g.position.z - lx * s + lz * c];
  const [bx, bz] = pt(0, L / 2), [sx, sz] = pt(0, -L / 2), [px, pz] = pt(-Wd / 2, 0), [rx, rz] = pt(Wd / 2, 0);
  const hb = waterHeight(bx, bz, time), hs = waterHeight(sx, sz, time), hp = waterHeight(px, pz, time), hr = waterHeight(rx, rz, time);
  const k = 1 - Math.exp(-dt * 1.6);
  boatState.heave += ((hb + hs + hp + hr) / 4 - boatState.heave) * k;
  boatState.pitch += (-Math.atan2(hb - hs, L) * 0.85 - boatState.pitch) * k;
  boatState.roll += (Math.atan2(hr - hp, Wd) * 0.8 - boatState.roll) * k;
  g.position.y = boatState.heave - 0.06;
  g.rotation.set(boatState.pitch, boatState.yaw + Math.sin(time * 0.05) * 0.04, boatState.roll, 'YXZ');
  g.updateMatrixWorld(true);
  boatInv.copy(g.matrixWorld).invert();
  ocean.material.uniforms.uBoatInv.value.copy(boatInv);
}

let watch = null;   // { a, t }
const camTarget = V(), camPos = V(), camLook = V(), desired = V(), tv = V(), tv2 = V();
let firstCam = true, camDrop = 0;
function updateCamera(dt) {
  const focus = watch ? watch.a : player;
  const c = focus.char;
  c.root.getWorldPosition(camTarget); camTarget.y += 1.15;
  let wantDist = 5.4, wantPitch = null, wantYaw = null, lookMix = 0, lookAt = null, lookDrop = 0;
  const st = focus.state;
  const showcase = focus.state === 'hold' && (focus !== player || (playerState.speed < 0.15 && (focus.holdT < 3.5 || playerState.idleT > 2.5)));
  if (photo) { wantDist = 2.9; }
  if (['charge', 'cast', 'float', 'bite', 'hookset', 'fight', 'reelEmpty'].includes(st)) {
    focus.computeOut();
    // r1：镜头总是偏向"船尾一侧"的斜后方（船头方向有船舱+硬顶）。
    // 旧版固定 -0.32 偏移：一侧舷时会甩向船头 → 隔着硬顶/雷达看，搏鱼全程只看到一片白。
    // 搏鱼时沿"人→鱼"连线看过去（人在下方、鱼/水花在上方），只做小角度偏移避免人挡住鱼线
    const oL = tv.copy(focus.outW).transformDirection(boatInv);
    const sideSign = Math.abs(oL.x) > 0.2 ? Math.sign(oL.x) : 0;
    let base = Math.atan2(focus.outW.x, focus.outW.z);
    if (st === 'fight' || st === 'hookset') { c.root.getWorldPosition(tv2); base += clamp(angDelta(Math.atan2(focus.hook.x - tv2.x, focus.hook.z - tv2.z), base) * 0.6, -0.3, 0.3); }
    wantYaw = base - sideSign * (st === 'fight' || st === 'hookset' ? 0.3 : 0.36);
    wantDist = 6.0;
    wantPitch = st === 'fight' ? 0.34 : 0.32;
    lookAt = st === 'fight' || st === 'hookset' ? focus.hook : focus.bobber.visible ? focus.bobber.position : null;
    lookMix = st === 'fight' ? 0.34 : 0.3;
  } else if (st === 'land') {
    // r1：出水镜头固定在船尾一侧斜后方（不再沿用搏鱼末段随鱼乱摆的角度），看得到鱼从水里飞进怀里
    focus.computeOut();
    const oL = tv.copy(focus.outW).transformDirection(boatInv);
    const sideSign = Math.abs(oL.x) > 0.2 ? Math.sign(oL.x) : 0;
    wantYaw = Math.atan2(focus.outW.x, focus.outW.z) - sideSign * 0.55; wantPitch = 0.26;
    wantDist = 5.0; lookAt = focus.fish?.root.position; lookMix = 0.3;
  } else if (showcase || photo) {
    c.root.getWorldDirection(tv);
    wantYaw = Math.atan2(-tv.x, -tv.z) + (photo ? 0.28 : 0.42);
    wantPitch = photo ? 0.12 : 0.16; wantDist = photo ? 2.7 : 3.4; camTarget.y -= 0.3;
    // 紧凑钓获卡只占屏幕底部 ~20%：视线轻微下压，让角色和鱼完整位于卡片上方
    if (!photo && focus === player && $('catch').classList.contains('show')) {
      // 详情展开时卡片更高：再压低视线 + 拉远一点，人和鱼完整留在卡片上方
      if ($('catch').classList.contains('open')) { lookDrop = 0.95; wantDist = 4.7; } else { lookDrop = 0.42; wantDist = 3.8; }
    }
    // r1：小鱼（鱿鱼/小丑鱼）抱在怀里几乎看不见 → 按鱼的跨度推近/拉远展示镜头
    if (!photo && focus.fish) wantDist *= 0.82 + 0.18 * clamp(focus.fish.span, 0.3, 1.6);
    // D：抱鱼放大到 0.75~2.8m 后，竖屏横向视野很窄 → 按水平 FOV 保证整条鱼（+两侧留白）进画面；扛肩时视线略抬
    if (focus.fish) {
      const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
      const need = (focus.fish.span * ({ yoke: 1.25, cradle: 1.2 }[c.held?.pose] || 0.95) + 0.5) / (2 * Math.tan(hf / 2));
      wantDist = Math.max(wantDist, Math.min(need, photo ? 7.5 : 8.5));
      if (c.held?.pose === 'yoke') {
        // 举过头顶：竖向也要装下 人 + 头顶的鱼（卡片占底部 ~30%，可用约 62%）
        const vf = THREE.MathUtils.degToRad(camera.fov);
        const needV = (1.75 + (c.held.h || 0.5)) / (2 * Math.tan(vf / 2) * 0.56);
        wantDist = Math.max(wantDist, Math.min(needV, 8.5));
        camTarget.y += 0.12 + (c.held.h || 0.5) * 0.3;
      }
    }
  }
  if (watch) { watch.t -= dt; if (watch.t <= 0) watch = null; else if (wantYaw === null) { c.root.getWorldDirection(tv); wantYaw = Math.atan2(-tv.x, -tv.z) + 0.6; wantPitch = 0.22; wantDist = 4.2; } }
  cam.userT -= dt;
  const auto = cam.userT <= 0;
  const kk = 1 - Math.exp(-dt * 2.4);
  if (wantYaw !== null && auto) cam.yaw += angDelta(wantYaw, cam.yaw) * kk;
  if (wantPitch !== null && auto) cam.pitch += (wantPitch - cam.pitch) * kk;
  else if (auto && wantPitch === null) cam.pitch += (0.3 - cam.pitch) * kk * 0.5;
  cam.dist += (wantDist - cam.dist) * (1 - Math.exp(-dt * 3));
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const back = tv.set(-Math.sin(cam.yaw) * cp, sp, -Math.cos(cam.yaw) * cp);
  desired.copy(camTarget).addScaledVector(back, cam.dist);
  // 镜头避让：不进船舱/硬顶，不进水
  tv2.copy(desired).applyMatrix4(boatInv);
  if (Math.abs(tv2.x) < 1.95 && tv2.z > -0.85 && tv2.y < 3.2) { tv2.z = Math.min(tv2.z, -0.85); desired.copy(tv2).applyMatrix4(B.matrixWorld); }
  // r1：硬顶（z -1.75~2.6, y≈2.62, 雷达/天线更高）上方/后方也不许停：镜头退到硬顶后沿之后
  else if (Math.abs(tv2.x) < 2.6 && tv2.z > -2.1 && tv2.y < 4.6) { tv2.z = -2.1; desired.copy(tv2).applyMatrix4(B.matrixWorld); }
  const wy = waterHeight(desired.x, desired.z, time) + 0.5;
  if (desired.y < wy) desired.y = wy;
  const lt = tv2.copy(camTarget);
  if (lookAt) lt.lerp(lookAt, lookMix);
  camDrop += (lookDrop - camDrop) * (1 - Math.exp(-dt * 3)); lt.y -= camDrop;
  if (firstCam) { camPos.copy(desired); camLook.copy(lt); firstCam = false; }
  camPos.lerp(desired, 1 - Math.exp(-dt * 7));
  camLook.lerp(lt, 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (camShake.amp > 0.001) {
    const a = camShake.amp;
    camera.rotation.x += (Math.random() - 0.5) * a * 0.06;
    camera.rotation.y += (Math.random() - 0.5) * a * 0.06;
    camShake.amp *= Math.exp(-dt * 7);
  }
}

// 离镜头太近的其他角色临时隐藏（避免挡住画面）
// r1：关键阶段（等浮漂/咬钩/搏鱼/出水/抱鱼展示/合影）里，挡在"镜头→主角/鱼/浮漂"视线上的好友也隐藏
const OCC_STATES = new Set(['cast', 'float', 'bite', 'hookset', 'fight', 'land', 'hold', 'reelEmpty']);
const _occF = V(), _occP = V();
// 角色在屏幕上的包围框（px）：脚底 → 头顶，宽 ≈ 高 × 0.34
function charRect(ch, out) {
  ch.root.getWorldPosition(_occP); _occP.project(camera);
  if (_occP.z > 1) return null;
  const fx = (_occP.x * 0.5 + 0.5) * W, fy = (-_occP.y * 0.5 + 0.5) * H;
  _occP.copy(ch.headW); _occP.y += 0.32; _occP.project(camera);
  const tx = (_occP.x * 0.5 + 0.5) * W, ty = (-_occP.y * 0.5 + 0.5) * H;
  const h = Math.max(8, fy - ty), cx = (fx + tx) / 2, hw = h * 0.34;
  out.x0 = cx - hw; out.x1 = cx + hw; out.y0 = ty; out.y1 = fy; out.h = h;
  return out;
}
const _rF = {}, _rA = {};
function overlapRatio(a, b, y1 = b.y1) {   // a 覆盖 b（只算 b 的 [y0, y1] 段）的面积占比
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? (w * h) / ((b.x1 - b.x0) * (y1 - b.y0)) : 0;
}
function hideNearCamera(dt = 0.016) {
  const focus = watch ? watch.a : player;
  const st = focus.state, occ = OCC_STATES.has(st) || !!photo;
  const pts = [];
  let fr = null, dF = 0;
  if (occ) {
    fr = charRect(focus.char, _rF);
    focus.char.root.getWorldPosition(tmp); dF = tmp.distanceTo(camera.position);
    let pt = null;
    if (focus.fish && (st === 'land' || st === 'hold')) pt = focus.fish.root.getWorldPosition(_occF);
    else if (st === 'fight' || st === 'hookset') pt = focus.hook;
    else if ((st === 'float' || st === 'bite') && focus.bobber.visible) pt = focus.bobber.position;
    if (pt) { const s = screenOf(pt, {}); if (s.vis) pts.push({ x: s.x, y: s.y, d: pt.distanceTo(camera.position) }); }
  }
  for (const a of anglers) {
    if (a === focus) { if (a.fade !== undefined && a.fade < 1) { a.fade = 1; setCharFade(a, 1); } a.char.root.visible = true; continue; }
    a.char.root.getWorldPosition(tmp); tmp.y += 0.9;
    const dc = tmp.distanceTo(camera.position);
    let near = dc < 1.5;
    if (!near && occ) {
      if (dc < 2.4 && !photo) near = true;
      const r = charRect(a.char, _rA);
      if (!near && r) {
        // 挡住主角（合影只看脸 —— 并排站是合影的一部分）
        if (fr && dc < dF - 0.2) near = photo ? overlapRatio(r, fr, fr.y0 + fr.h * 0.45) > 0.1 : overlapRatio(r, fr) > 0.18;   // r3：合影里好友半个身子叠在主角背后像"连体人" → 0.3 → 0.1
        // r3：合影时站在主角身后、轮廓和主角叠在一起（从肩后探出半个身子）也隐藏；并排站（叠得少）保留
        if (!near && photo && fr && dc >= dF - 0.2 && dc < dF + 4) near = overlapRatio(r, fr) > 0.15;
        // r2：近处好友大块压在画面角落/边缘（屏幕占比 >7% 且被裁切）也算遮挡
        if (!near && !photo && dc < 9) { const area = Math.max(0, Math.min(r.x1, W) - Math.max(r.x0, 0)) * Math.max(0, Math.min(r.y1, H) - Math.max(r.y0, 0)); if (area > W * H * 0.05 && (r.x0 < 0 || r.x1 > W || r.y1 > H)) near = true; }
        // 挡住浮漂 / 鱼线落点 / 出水的鱼
        if (!near) for (const q of pts) if (dc < q.d && q.x > r.x0 - 14 && q.x < r.x1 + 14 && q.y > r.y0 - 14 && q.y < r.y1 + 8) { near = true; break; }
      }
    }
    // r2：硬切 → 淡出/淡入 + 迟滞（离开遮挡区 0.4s 后才回来，边界不闪）；鱼线跟着角色一起淡
    a.nearHidden = near;
    a.hideHold = near ? 0.4 : Math.max(0, (a.hideHold || 0) - dt);
    const tgt = near || a.hideHold > 0 ? 0 : 1;
    if (a.fade === undefined) a.fade = 1;
    a.fade = photo ? tgt : tgt < a.fade ? Math.max(tgt, a.fade - dt / 0.18) : Math.min(tgt, a.fade + dt / 0.3);
    setCharFade(a, a.fade);
  }
}
function setCharFade(a, f) {
  const ch = a.char;
  if (!a._fadeMats) {
    a._fadeMats = [];
    ch.root.traverse((o) => { if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!a._fadeMats.some((x) => x.m === m)) a._fadeMats.push({ m, op: m.opacity, tr: m.transparent }); });
    a._lineOp = a.line.line.material.opacity;
  }
  ch.root.visible = f > 0.02;
  a.line.line.material.opacity = a._lineOp * f;
  const on = f < 0.999;
  if (on !== !!a._fadeOn) {
    a._fadeOn = on;
    for (const x of a._fadeMats) { x.m.transparent = on || x.tr; x.m.needsUpdate = true; if (!on) x.m.opacity = x.op; }
  }
  if (on) for (const x of a._fadeMats) x.m.opacity = x.op * f;
}

// ======================= 每帧 UI（分阶段聚焦） =======================
const catchCard = { shown: false, walkHide: 0 };
let uiSlowT = 0;
const sOut = { x: 0, y: 0, vis: false };
const feedEl = $('feed');
const uiRoot = $('ui'), topEl = $('top'), baitEl = $('bait'), hintEl = $('hint'), distBox = $('dist'), tipEl = $('distTip'), distEl = $('distN');
const ACT = {
  idle: ['cast', 'hook', '抛竿'], charge: ['cast charging', 'hook', '松手'], cast: ['wait', 'bobber', '…'], reelEmpty: ['wait', 'reel', '收线'],
  float: ['wait', 'bobber', '等待中'], bite: ['bite timed', 'bang', '扬竿'], hookset: ['reel', 'reel', '收线'], fight: ['reel', 'reel', '收线'],
  land: ['wait', 'star', '出水'], hold: ['hold', 'wave', '收进'], release: ['wait', 'wave', '拜拜'], fail: ['wait', 'sad', '再来'],
};
const TUT_TEXT = { idle: '按住按钮蓄力，松手抛竿', charge: '在黄色区松手 = 完美抛竿', float: '浮漂猛沉、出现「!」再点扬竿', bite: '就是现在！扬竿', hookset: '按住收线，变红就松手', fight: '按住收线，变红就松手' };
// 等待浮漂（cast/float/reelEmpty）时顶栏保留：可以随时打开菜单看图鉴/排行
const FOCUS_HIDE_TOP = new Set(['charge', 'bite', 'hookset', 'fight', 'land', 'hold']);
const FEED_PAUSE = new Set(['charge', 'bite', 'hookset', 'fight', 'land']);
const TALK_MUTE = new Set(['bite', 'hookset', 'fight', 'land', 'hold']);
$('actZone').setAttribute('pathLength', 100);
$('actZone').setAttribute('stroke-dasharray', `${(PERFECT_CAST[1] - PERFECT_CAST[0]) * 100} 100`);
$('actZone').setAttribute('stroke-dashoffset', -PERFECT_CAST[0] * 100);
const actTag = $('actTag'), actTagT = $('actTagT'), fightSt = (s) => s === 'fight' || s === 'hookset';
{ const z = actTag.querySelector('.m s'); z.style.left = PERFECT_CAST[0] * 100 + '%'; z.style.width = (PERFECT_CAST[1] - PERFECT_CAST[0]) * 100 + '%'; }
const joyUI = { lift: 0 };
function updateUI(dt) {
  const st = player.state;
  // ---- 主按钮（上下文驱动）+ 外圈环形进度 ----
  let [cls, ic, lb] = ACT[st] || ACT.idle;
  let ring = 0;
  const tp = clamp(player.tension, 0, 1);
  const surge = document.body.classList.contains('surge');
  if (st === 'charge') {
    ring = player.power;
    const inz = player.power >= PERFECT_CAST[0] && player.power <= PERFECT_CAST[1];
    if (inz) { cls += ' inzone'; if (!chargeTick.inz) vibrate(12); }
    chargeTick.inz = inz;
  }
  else if (st === 'bite') ring = 1 - player.t / BITE_WINDOW;
  else if (st === 'fight' || st === 'hookset') {
    ring = tp;   // 外圈 = 张力环
    cls += tp > 0.82 ? ' tr' : tp > 0.62 ? ' ty' : '';
    if (tp > 0.86 || surge) { cls += ' danger'; lb = '松手'; } else if (actHeld) lb = '收线中';
  }
  if ((st === 'idle' || st === 'charge') && baitOn) { cls += ' lucky'; if (st === 'idle') ic = 'spark'; }
  const full = cls + (actHeld ? ' down' : '');
  if (actEl.className !== full) actEl.className = full;
  if (actEl.dataset.ic !== ic) { actEl.dataset.ic = ic; $('actIc').innerHTML = UI.svg(ic); }
  if ($('actLb').textContent !== lb) $('actLb').textContent = lb;
  $('actRing').style.strokeDashoffset = 100 * (1 - clamp(ring, 0, 1));
  if (st === 'charge' && (!chargeTick.t || time - chargeTick.t > 0.07)) { chargeTick.t = time; sfx.tick(player.power); }
  // v1.3 按钮正上方状态条 #actTag：拇指压住按钮时外环会被挡，这里用文字+进度再报一次（蓄力% / 完美区 / 咬钩倒计时 / 张力）
  let tagT = '', tagP = clamp(ring, 0, 1);
  if (st === 'charge') tagT = cls.includes('inzone') ? '完美！松手' : `蓄力 ${Math.round(player.power * 100)}%`;
  else if (st === 'bite') tagT = '快扬竿！';
  else if (fightSt(st)) tagT = cls.includes('danger') ? '太紧了 松手！' : tp > 0.62 ? '张力偏高' : actHeld ? '收线中 · 稳' : '按住收线';
  if (tagT && actTagT.textContent !== tagT) actTagT.textContent = tagT;
  const tagPs = tagP.toFixed(3); if (actTag.style.getPropertyValue('--p') !== tagPs) actTag.style.setProperty('--p', tagPs);

  // ---- 阶段可见性：顶栏 / 幸运饵 / 搏鱼胶囊 / 动态推送 ----
  const topOn = !FOCUS_HIDE_TOP.has(st) && !photo;
  topEl.classList.toggle('off', !topOn);
  uiRoot.classList.toggle('notop', !topOn);
  baitEl.classList.toggle('off', st !== 'idle' || !!photo || !!catchCard.shown);
  baitEl.classList.toggle('empty', meta.S.bait <= 0 && !baitOn);
  tankBtn.classList.toggle('off', TANK_LOCK.has(st) || !!photo || !!catchCard.shown);   // v1.0：钓鱼/抱鱼时让位
  const fighting = st === 'fight' || st === 'hookset';
  document.body.classList.toggle('strain', fighting && tp > 0.86);
  UI.setFeedPaused(FEED_PAUSE.has(st) || !!photo || UI.modalOpen() || !!UI.sheetOpen() ? true : st === 'hold' ? 'soft' : false);

  // ---- 搏鱼：主按钮外圈张力环（绿黄红）+ 按钮上方距离胶囊 + 必要时一行短提示 ----
  if (fighting) {
    const dm = Math.max(0, player.dist);
    const dt2 = `${dm.toFixed(dm < 10 ? 1 : 0)}m`;
    if (distEl.textContent !== dt2) distEl.textContent = dt2;
    distBox.classList.toggle('far', player.dist > player.startDist + 4);
    const tip = surge ? '它在发力！' : tp > 0.86 ? '松一松' : player.dist > player.startDist + 5 ? '要跑了！' : '';
    if (tip && tipEl.textContent !== tip) tipEl.textContent = tip;
    tipEl.classList.toggle('show', !!tip);
    sfx.reel(player.reel, tp);
    if (tp > 0.86 && Math.random() < dt * 6) sfx.strain(tp);
  } else if (st !== 'land') sfx.reel(false);

  // ---- 咬钩：浮漂上方大 "!" ----
  const bang = $('bang');
  if (st === 'bite') {
    screenOf(player.bobber.position, sOut);
    bang.style.setProperty('--x', `${sOut.x - 12}px`); bang.style.setProperty('--y', `${sOut.y - 90}px`);
    bang.style.transform = `translate(${sOut.x - 12}px,${sOut.y - 90}px)`;
    bang.style.setProperty('--k', 1 - player.t / BITE_WINDOW);
    if (!bang.classList.contains('show')) bang.classList.add('show');
  } else if (bang.classList.contains('show')) { bang.classList.remove('show'); document.body.classList.remove('bite'); }

  // ---- 新手提示：只在前 2 次抛竿流程出现 ----
  hint.t -= dt;
  let tx = hint.t > 0 ? hint.txt : tutOn(st) ? (TUT_TEXT[st] || '') : '';
  if (UI.sheetOpen() || UI.modalOpen()) tx = '';
  if (tx && hintEl.textContent !== tx) hintEl.textContent = tx;
  hintEl.classList.toggle('off', !tx);

  // ---- 浮动摇杆提示：首次（第一条鱼之后的 idle）显示一次 ----
  if (!joyTip.done) {
    const can = st === 'idle' && meta.S.catches >= 1 && !tx && !UI.modalOpen() && !UI.sheetOpen();
    joyHint.classList.toggle('show', can);
    if (can && (joyTip.t += dt) > 5) joyTipDone();
  }

  // ---- 钓获卡：走动时收起为迷你条，停下再展开 ----
  const card = $('catch');
  if (st === 'hold' && catchCard.shown && !photo) {
    if (playerState.speed > 0.4) { catchCard.walkHide = 0.8; UI.catchMini(true); card.classList.add('show'); }
    else if (catchCard.walkHide > 0) { catchCard.walkHide -= dt; if (catchCard.walkHide <= 0) { UI.catchMini(false); card.classList.add('show'); } }
  } else if (st !== 'hold' && catchCard.shown) { catchCard.shown = false; UI.hideCatch(); }
  // 抱鱼展示时：点赞等动态胶囊贴在钓获卡上沿，不再压在角色头顶
  const atCard = st === 'hold' && catchCard.shown && !photo && card.classList.contains('show');
  feedEl.classList.toggle('atcard', atCard);
  if (atCard) { const ct = `${Math.round(card.getBoundingClientRect().top - 42)}px`; if (feedEl.style.getPropertyValue('--ct') !== ct) feedEl.style.setProperty('--ct', ct); }

  // ---- v1.3 常驻摇杆：能走路的阶段（idle / 抱鱼）常显；抛竿·搏鱼·弹窗时淡出并松开；
  // 抱鱼时钓获卡占底部 → 摇杆整体上移到卡片上沿（拖动中冻结位置，避免卡片收起/展开时摇杆在手指下跳走）
  const joyOn = (st === 'idle' || st === 'hold') && !photo && !UI.modalOpen() && !UI.sheetOpen();
  if (joyEl.classList.contains('off') === joyOn) joyEl.classList.toggle('off', !joyOn);
  const joyHold = st === 'hold';
  if (joyEl.classList.contains('hold') !== joyHold) joyEl.classList.toggle('hold', joyHold);
  if (!joyOn && joy.on) joyReset();
  if (!joy.on) {
    let lift = 0;
    if (st === 'hold' && catchCard.shown && card.classList.contains('show')) {
      const pr = joyEl.offsetParent.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const baseBottom = pr.top + joyEl.offsetTop + joyEl.offsetHeight;   // 不含 transform 的原始位置（避免过渡动画中反馈抖动）
      lift = Math.max(0, Math.round(baseBottom - 22 - cr.top + 6 + (feedEl.childElementCount ? 46 : 0)));   // 22 = 热区比底盘多出的一圈；有点赞胶囊时再让出一行
    }
    if (Math.abs(lift - joyUI.lift) > 1) { joyUI.lift = lift; joyEl.style.setProperty('--joyLift', lift + 'px'); }
  }

  // ---- 好友头顶：名字+气泡（同时最多 1 个；玩家搏鱼/抱鱼时不显示） ----
  UI.tickTalk(dt, TALK_MUTE.has(st) || !!photo || UI.modalOpen() || !!UI.sheetOpen(), (a, tag) => {
    tmp2.copy(a.char.headW); tmp2.y += 0.38;
    screenOf(tmp2, sOut);
    if (!sOut.vis || a.nearHidden) { tag.style.visibility = 'hidden'; return; }
    const s = clamp(5.5 / camera.position.distanceTo(tmp2), 0.75, 1);
    tag.style.visibility = '';
    tag.style.transform = `translate(${sOut.x}px,${sOut.y}px) translate(-50%,-100%) scale(${s})`;
  });

  pumpRewards(dt);
  UI.tickAttn(dt);
  uiSlowT -= dt;
  if (uiSlowT <= 0) { uiSlowT = 0.5; UI.refreshMates(anglers); }
}
const chargeTick = { t: 0 };

function onWatch(a) {
  if (!a) return;
  watch = { a, t: 4.5 }; cam.userT = 0;
  UI.say(a, a.lastCatch && time - a.lastCatch.t < 60 ? `刚钓到 ${displayName(a.lastCatch.v)}！` : pick(a.lines));
}

// ======================= v1.3 perf：着色器 / 纹理 / 几何预热 =======================
// 根因：旧预热 renderer.compile(scene, camera) 时当前渲染目标是"屏幕"→ 编出 ACES + sRGB 输出的变体；
// 实际画面由 RenderPass 画进 HalfFloat RT（线性输出、不做 tone mapping），program key 不同 → 等于没预热。
// 首帧只给视锥内物体建 program；转视角第一次看到岛屿/帆船/热气球/好友淡出时才同步编译 → 偶发卡顿。
const _turnF = V(), _turnPrev = V(); let turnQuietT = 0;
const _warmCam = new THREE.PerspectiveCamera(100, 1.6, 0.05, 6000);
const WARM_LAYER = 7;
const warmQ = [], WARM_OK = new Set(['idle']);   // 只在空闲站立时做；float 阶段随时可能咬钩，不在那时占主线程
let warmNextT = 0;
const warmStats = { bootMs: 0, bootProgs: 0, fishMs: 0, fishBlockMs: 0, fishProgs: 0, fishN: 0 };   // fishMs=含异步等待的墙钟，fishBlockMs=实际占用主线程
function warmCompile(objs, sceneForLights = scene, target = composer.readBuffer, cam = camera) {
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try { renderer.compile(objs, cam, sceneForLights); } finally { renderer.setRenderTarget(prev); }
}
function warmBoot() {
  const t0 = performance.now(), p0 = renderer.info.programs.length;
  // 1) 纹理预上传（画布贴图/派对装饰贴图首次被看到时才 texImage2D + mipmap）
  const texs = new Set();
  const addTex = (v) => { if (v && v.isTexture && !v.isRenderTargetTexture) texs.add(v); };
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) { for (const k in m) addTex(m[k]); if (m.uniforms) for (const k in m.uniforms) addTex(m.uniforms[k]?.value); }
  });
  texs.forEach((t) => { try { renderer.initTexture(t); } catch (e) { /* 不支持的纹理类型跳过 */ } });
  // 2) 主场景：按实际渲染目标编译
  warmCompile(scene);
  // 3) 好友遮挡淡出会把角色材质切 transparent（opaque 宏变化 → 新 program）：两种变体都编好
  const fm = new Set();
  for (const a of anglers) a.char.root.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if (!m.transparent) fm.add(m); });
  fm.forEach((m) => { m.transparent = true; m.needsUpdate = true; });
  warmCompile(scene);
  // 4) 不剔除地真实绘制（第 1 次带角色淡出透明变体，后 2 次正反两个朝向的不透明变体；含平时隐藏的浮漂/鱼线/道具）：
  //    很多移动 GPU 驱动（以及 ANGLE/Vulkan）在"第一次以某渲染状态 draw"时才真正生成管线 / 上传顶点缓冲 / 编阴影深度变体，只 compile 不够
  const prev = renderer.getRenderTarget();
  const hidden = [], culled = [];
  // three r17x 把 link 状态查询（getProgramParameter，会同步等驱动编完）推迟到 program 第一次被 draw；
  // 只 compile 不 draw 的变体（比如背后好友的淡出透明变体）会在第一次转过去时阻塞 → 关掉视锥剔除，让每个网格在每种变体下都真画一次
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
  scene.traverse((o) => { if (o.isLight) o.layers.enable(WARM_LAYER); });
  renderer.setRenderTarget(composer.readBuffer);
  _warmCam.position.copy(camera.position);
  try {
    for (let i = 0; i < 3; i++) {
      if (i === 1) fm.forEach((m) => { m.transparent = false; m.needsUpdate = true; });
      _warmCam.rotation.set(-0.12, i * Math.PI, 0, 'YXZ'); _warmCam.updateMatrixWorld(); renderer.render(scene, _warmCam);
    }
  } finally {
    fm.forEach((m) => { if (m.transparent) { m.transparent = false; m.needsUpdate = true; } });
    renderer.setRenderTarget(prev);
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
  }
  sun.shadow.needsUpdate = true;
  warmStats.bootMs = Math.round(performance.now() - t0); warmStats.bootProgs = renderer.info.programs.length - p0; warmStats.parCompile = PAR_COMPILE;
  // 5) 鱼：每个物种 1 条（marine 模型 × toon × ugc × fishmat 组合），排进后台队列：镜头静止时每次 1 条
  for (const sp of SPECIES) warmQ.push(() => warmFish(makeVariant(sp)));
}
let warmBusy = false;
const PAR_COMPILE = renderer.extensions.has('KHR_parallel_shader_compile');
// 有 KHR_parallel_shader_compile（多数 Android Chrome / 新 Safari）：compileAsync 让驱动后台编译/链接，JS 每 10ms 轮询 COMPLETION_STATUS，不阻塞；
// 没有该扩展时 compileAsync 的 isReady() 会在 setTimeout 里同步等链接（可能正好落在拖动中）→ 退回"镜头静止时在 rAF 内同步做"
function warmFish(v) {
  const t0 = performance.now(), p0 = renderer.info.programs.length;
  const f = new Fish(v, stylizeFish);
  f.update(0.016, 'swim');
  // 只绘制这条鱼：鱼 + 所有灯光放到 WARM_LAYER，预热相机只看该层 → 灯光/雾/环境/阴影与主场景完全一致，但只画一条鱼
  f.root.traverse((o) => o.layers.set(WARM_LAYER));
  _warmCam.position.copy(camera.position); _warmCam.rotation.set(0, 0, 0); _warmCam.updateMatrixWorld();
  f.root.position.copy(camera.position); f.root.position.z -= 3;
  f.root.updateMatrixWorld(true);
  const prev = renderer.getRenderTarget();
  const draw = () => {   // 真实画一帧：阴影深度变体 + 驱动首次 draw 管线
    const tb = performance.now();
    try {
      scene.add(f.root);
      _warmCam.layers.set(WARM_LAYER); renderer.setRenderTarget(composer.readBuffer);
      renderer.render(scene, _warmCam);
    } finally { renderer.setRenderTarget(prev); _warmCam.layers.set(0); scene.remove(f.root); sun.shadow.needsUpdate = true; }
    warmStats.fishBlockMs += performance.now() - tb;
  };
  const done = () => {
    f.dispose();   // fishes.js v1.3：dispose 只释放几何体，材质不 dispose → program 常驻，下次同物种出水不再编译
    warmStats.fishMs += performance.now() - t0; warmStats.fishProgs += renderer.info.programs.length - p0; warmStats.fishN++;
  };
  if (!PAR_COMPILE) { try { draw(); } finally { done(); } return null; }
  let p; const tb = performance.now();
  _warmCam.layers.set(WARM_LAYER); renderer.setRenderTarget(composer.readBuffer);
  try { p = renderer.compileAsync(f.root, _warmCam, scene); } finally { renderer.setRenderTarget(prev); _warmCam.layers.set(0); }
  warmStats.fishBlockMs += performance.now() - tb;
  return p.then(async () => {
    while (started && turnQuietT < 0.25) await new Promise((r) => setTimeout(r, 100));   // 编完后等镜头静止再画（开局前 splash 遮挡，直接画）
    draw();
  }).finally(done);
}
// 镜头静止 ≥0.25s 时调用：splash 期间每帧 1 条，开局后每 0.3s 1 条，搏鱼/咬钩阶段暂停；上一条异步编译完成前不启动下一条
function pumpWarm() {
  if (!warmQ.length || warmBusy || time < warmNextT) return;
  if (player && started && !WARM_OK.has(player.state)) return;
  warmNextT = time + (started ? 0.3 : 0);
  let r = null;
  try { r = warmQ.shift()(); } catch (e) { console.warn('warm failed', e); }
  if (r) { warmBusy = true; r.catch((e) => console.warn('warm failed', e)).finally(() => { warmBusy = false; }); }
}

// ======================= 主循环 =======================
const clock = new THREE.Clock();
const DT_MAX = +(Q.get('dtmax') || 0.05);
let time = 0, started = false;
const photoHid = [];
const fpsEl = $('fps'); let fpsAcc = 0, fpsN = 0, fpsT = 0, autoChecked = false;
function frame() {
  const rawDt = Math.min(clock.getDelta(), 0.1);
  // v1.0：水族箱打开时钓鱼场景整体暂停（不 update、不渲染），只跑水族箱场景
  if (tankUI.isOpen) { aq.update(Math.min(rawDt, 0.05)); tankUI.tick(rawDt); aq.render(); pumpThumbs(); updateTankFlow(rawDt); requestAnimationFrame(frame); return; }
  if (slow.hold > 0) slow.hold -= rawDt; else slow.scale += (slow.target - slow.scale) * (1 - Math.exp(-rawDt * 5));
  const dt = Math.min(rawDt, DT_MAX) * slow.scale;
  time += dt;
  waveState.time = time;
  skyUniforms.uSkyTime.value = time;
  toonUniforms.uSunLum.value = Math.max(0.3, sun.intensity * (0.2126 * sun.color.r + 0.7152 * sun.color.g + 0.0722 * sun.color.b));
  updateBoat(dt);
  if (player) {
    updatePlayerMove(dt);
    updateFriends(dt);
    B.updateMatrixWorld(true);
    for (const a of anglers) a.update(dt, time);
    updateWorldEvents(dt);
    updateCamera(dt);
    hideNearCamera(dt);
    updateUI(rawDt);
    updateTankFlow(dt);
    if (photo) { photo.t += rawDt; }
  } else {
    // 加载中：绕船慢转
    const a = time * 0.15; camera.position.set(Math.sin(a) * 14, 4.5, Math.cos(a) * 14); camera.lookAt(0, 1, 0);
  }
  fx.update(dt, time);
  boat.update(time);
  scenery.update(time, B.position);
  ocean.update(time, camera);
  sky.position.copy(camera.position);
  sun.target.position.copy(B.position);
  sun.position.copy(B.position).addScaledVector(sunDir, 40);
  gradePass.uniforms.uTime.value = time;
  godRays.update(time, camera.position);   // 光束环绕镜头分布：任何机位都能看到远处光柱
  updateSunHaze();
  // r1：合影时好友的鱼竿/鱼线会斜穿主角的脸 → 只在合影渲染期间临时藏起来
  if (photo) for (const a of anglers) if (!a.isPlayer) for (const o of [a.char.rod?.group, a.line.line, a.bobber]) if (o && o.visible) { o.visible = false; photoHid.push(o); }
  if (sun.shadow.autoUpdate === false) { shadowTick = (shadowTick + 1) % 2; sun.shadow.needsUpdate = shadowTick === 0; }   // v1.3 perf：仅 low 档隔帧更新阴影
  composer.render();
  if (disposeLater.length) { for (const f of disposeLater) f(); disposeLater.length = 0; }
  // v1.3 perf：镜头角速度（与输入实现无关：直接比较相邻帧镜头朝向）→ 转视角时不做离屏缩略图 / 后台预热
  camera.getWorldDirection(_turnF); const turning = _turnF.dot(_turnPrev) < 0.99995; _turnPrev.copy(_turnF);
  turnQuietT = turning ? 0 : turnQuietT + rawDt;
  if (turnQuietT > 0.25) pumpThumbs();   // 缩略图 readPixels + toDataURL 会同步占用主线程
  if (turnQuietT > 0.25 || !started) pumpWarm();   // 鱼着色器预热：开局前（splash 遮挡、加载镜头在绕船转）每帧 1 条，开局后只在镜头静止时做
  if (photo && !photo.shot && photo.t > 0.75) { photo.shot = true; const url = canvas.toDataURL('image/jpeg', 0.86); finishPhoto(url); setTimeout(() => { photo = null; }, 400); }
  for (const o of photoHid) o.visible = true; photoHid.length = 0;

  fpsAcc += rawDt; fpsN++; fpsT += rawDt;
  if (fpsAcc > 0.5) {
    const f = fpsN / fpsAcc;
    if (Q.has('fps')) fpsEl.textContent = `${Math.round(f)} FPS · ${quality}`;
    fpsAcc = 0; fpsN = 0;
  }
  if (started && !Q.has('q')) adaptQuality(rawDt);
  requestAnimationFrame(frame);
}

// ---- v1.3 perf：自适应画质（带迟滞，不来回抖）----
// 每 2s 一个窗口取平均帧时间；连续 2 个窗口 < 40fps → 降一档（high→medium→low，冷却 8s）；
// 连续 12 个窗口（24s）> 57fps 且未"降了又升又降" → 回升一档；升档后若再次降档，本局锁定不再升。
// 窗口内若有 >150ms 的单帧（切后台 / 编译）只计入 0.1s，避免一次 hitch 把画质打下去。
const AQ = { acc: 0, n: 0, bad: 0, good: 0, cool: 6, ups: 0, lock: false, top: quality, log: [] };
const TIERS = ['low', 'medium', 'high'];
function setQuality(q, why) {
  if (q === quality) return;
  AQ.log.push(`${time.toFixed(1)} ${quality}->${q} ${why}`);
  quality = q; buildComposer(); AQ.cool = 8; AQ.bad = AQ.good = 0;
}
function adaptQuality(rawDt) {
  if (AQ.cool > 0) { AQ.cool -= rawDt; return; }
  AQ.acc += Math.min(rawDt, 0.1); AQ.n++;
  if (AQ.acc < 2) return;
  const fps = AQ.n / AQ.acc; AQ.acc = 0; AQ.n = 0;
  const i = TIERS.indexOf(quality);
  if (fps < 40) { AQ.good = 0; if (++AQ.bad >= 2 && i > 0) { if (AQ.ups > 0) AQ.lock = true; setQuality(TIERS[i - 1], `fps ${fps.toFixed(0)}`); } }
  else if (fps > 57) { AQ.bad = 0; if (++AQ.good >= 12 && !AQ.lock && i < TIERS.indexOf(AQ.top)) { AQ.ups++; setQuality(TIERS[i + 1], `fps ${fps.toFixed(0)}`); } }
  else { AQ.bad = 0; AQ.good = 0; }
}

// ======================= 启动 =======================
async function boot() {
  UI.splashProgress(0.08, '正在连接房间…');
  requestAnimationFrame(frame);
  await loadCrew((k, t) => UI.splashProgress(k, t));
  UI.splashProgress(0.85, '正在预热海水与鱼群…');
  // v1.3 perf：预热（纹理上传 + 按实际 RT 编译 + 角色淡出变体 + 四方向首绘；鱼物种排后台队列）
  try { warmBoot(); } catch (e) { console.warn(e); }
  $('meAv').setAttribute('style', UI.avStyle('me', ROOM[0].color));
  refreshHUD(); refreshTankBtn();
  lastRank = meta.board(live).find((r) => r.you).rank;
  cam.yaw = playerState.facing + B.rotation.y - Math.PI * 0.3;   // 从船尾斜后方看，避免左舷好友挡镜头
  UI.splashProgress(1, '大家都到齐啦');
  $('start').classList.add('ready');
  const go = () => {
    if (started) return;
    started = true; initAudio();
    $('splash').classList.add('out'); sfx.open();
    setTimeout(() => $('splash').remove(), 600);
    setTimeout(() => {
      const mates = anglers.filter((a) => !a.isPlayer);
      UI.feedPush({ whos: mates, html: `<b>${mates.map((a) => a.name).join('、')}</b> 都在船上`, icon: 'wave' });
      if (meta.streakGift) {
        const g = meta.streakGift;
        UI.modal({ icon: 'gift', title: `连续出海第 ${g.day} 天`, reward: fmtReward(g.reward), cta: '领取', onCta: () => sheetCtx.onClaimStreak() });
      }
    }, 600);
    setTimeout(() => { const a = anglers.find((x) => x.id === 'gugu'); UI.say(a, '你来啦！一起钓！'); a.char.setMode('wave'); a.reactT = 2; a.lookAt = player; }, 1500);
  };
  $('start').onclick = go;
  if (Q.has('autostart')) go();
}

window.G = { dbg, get player() { return player; }, warmStats, AQ, get warmLeft() { return warmQ.length; }, quality: () => quality, anglers, meta, live, camera, cam, get time() { return time; }, onEvent, evLog, renderer, scene, get composer() { return composer; }, playerState, frenzy, UI, catchCard, fishThumb, makeVariant, SPECIES, aq, tankUI, openTank, keepCatch, refreshTankBtn };
boot().catch((e) => { console.error(e); UI.splashProgress(1, '加载失败：' + e.message); });
