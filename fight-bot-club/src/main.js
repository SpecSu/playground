// 入口：渲染器 / 擂台 / 机甲 / 分身 / 特效 / 音频 / 导演 / 擂主赛制 / UGC 创造
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      bvec4 bad = bvec4(!(c.r==c.r)||abs(c.r)>6e4, !(c.g==c.g)||abs(c.g)>6e4, !(c.b==c.b)||abs(c.b)>6e4, !(c.a==c.a));
      if (any(bad)) c = vec4(0.0, 0.0, 0.0, 1.0);
      c.rgb = clamp(c.rgb, 0.0, 24.0); c.a = clamp(c.a, 0.0, 1.0);
      gl_FragColor = c; }`,
};
import { Sim, Fighter, RING } from './game/sim.js';
import { generateDesign, EXAMPLE_PROMPTS, ratings, ROLE_CN } from './mech/design.js';
import { createView } from './mech/forms.js';
import { GLOBAL_TIME } from './render/materials.js';
import { Arena } from './world/arena.js';
import { VFX, hex3 } from './fx/vfx.js';
import { AudioEngine } from './audio/audio.js';
import { Director } from './game/director.js';
import { AVATARS, avatarVisible, loadAvatar, makeRider, renderThumbs, riderHeadBox } from './avatar/avatars.js';
import { clamp } from './core/util.js';

const $ = (s) => document.querySelector(s);
const app = $('#app'), canvas = $('#scene');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const TEST = location.search.includes('test');

// ———————————————————— 画质档位 ————————————————————
const isMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
const Q = {
  dpr: Math.min(devicePixelRatio || 1, isMobile ? 1.6 : 2),
  shadow: isMobile ? 1024 : 2048,
  bloom: !location.search.includes('nobloom'),
  low: isMobile,
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.bloom, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Q.dpr);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 300);
camera.position.set(0, 8, 26);

let composer = null, bloom = null;
function setupPost() {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isMobile ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(SanitizeShader));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
if (Q.bloom) setupPost();

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 0.7 ? 52 : 44; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloom.resolution.set(w * 0.5, h * 0.5); }
  vfx && vfx.setSize(w, h, camera.fov);
}
let vfx = null;

// ———————————————————— 状态 ————————————————————
const audio = new AudioEngine();
let arena, director;
// 分身头像：静态预烘焙 WebP（每张约 7KB，HTML 头部已 preload），无需等 GLB 加载与离屏渲染
let thumbs = Array.from({ length: 12 }, (_, i) => `/avatars/thumb/a${String(i + 1).padStart(2, '0')}.webp`);
const VISIBLE_AVAS = AVATARS.map((_, i) => i).filter(avatarVisible);
let myAva = VISIBLE_AVAS[Math.floor(Math.random() * VISIBLE_AVAS.length)];
const roster = [];      // 所有参赛机器人
const queue = [];       // 待战队列（roster 引用）
const G = {
  phase: 'boot', t: 0, sim: null, F: [null, null], V: [null, null], E: [null, null], round: 0,
  timeScale: 1, slowT: 0, slowTo: 1, clock: 180, champStreak: 0, botT: 70,
};
const views = new Map(); // Fighter -> MechView
const projSeen = new Map();
const MAX_TIME = 99;

const BOTS = [
  { ava: 0, name: '奶蛙', prompt: '黄金重装坦克，巨型铁拳，能震地', role: 'tank', form: 'humanoid' },
  // { ava: 5, name: '外星猫', prompt: '霓虹赛博刺客猎犬，双刀，闪电般的速度', role: 'assassin', form: 'dog' }, // 外星猫暂时隐藏
  { ava: 3, name: '喵脆角', prompt: '霓虹赛博刺客猎犬，双刀，闪电般的速度', role: 'assassin', form: 'dog' },
  { ava: 7, name: '苏贝壳', prompt: '深海鲨鱼浮游炮台，蜂群导弹', role: 'gunner', form: 'hover' },
  { ava: 6, name: '刀盾狗', prompt: '废土拼装多足蜘蛛，电锯手臂，锈迹斑斑', role: 'brawler', form: 'spider' },
];

function makeEntry(design, ava, owner, mine = false) {
  const e = { id: design.id, design, ava, owner, mine, wins: 0, losses: 0, best: 0, created: performance.now(), thumb: null };
  roster.push(e); queueThumb(e); return e;
}
function designForRole(prompt, owner, role, form) {
  for (let i = 0; i < 40; i++) { const d = generateDesign(prompt, owner, form ? { form } : undefined); if (d.role === role) return d; }
  return generateDesign(prompt, owner, form ? { form } : undefined);
}

// 随机 prompt 生成若干候选，取满足条件且 score 最高者（用于开场对阵）
function pickDesign(owner, opts, ok, score, n = 120) {
  let best = null;
  for (let i = 0; i < n; i++) { const d = generateDesign(randomPrompt(), owner, opts()); if (ok(d) && (!best || score(d) > score(best))) best = d; }
  return best || generateDesign(randomPrompt(), owner, opts());
}

// ———— 机甲上半身头像（含驾驶舱与分身），离屏渲染一次并缓存 ————
const mthumb = { r: null, scene: null, cam: null, jobs: [], busy: false };
function queueThumb(e) { mthumb.jobs.push(e); pumpThumbs(); }
async function pumpThumbs() {
  if (mthumb.busy) return; mthumb.busy = true;
  try {
    while (mthumb.jobs.length) {
      const e = mthumb.jobs.shift();
      try { e.thumb = await renderMechThumb(e); refreshThumbs(); } catch (err) { console.warn('thumb', err); }
      await nextFrame();
    }
  } finally { mthumb.busy = false; }
}
// 头像：只突出坐在机甲里的分身本人。机甲本体不入镜（卡片底色 / 描边用机甲发光色承接），
// 两轮像素级自动取景：量出「颈部以上」的不透明像素框 → 统一缩放到头高占画面 52%、头心位于 (50%, 53%)，所有分身脸一样大
const FACE_FIX = { // z = 放大倍数（按头部含耳角饰的可见宽高统一到画面约 55%，四周留白）
  0: { z: 0.66, dy: 0.02 }, 1: { z: 0.95, dy: 0.04 }, 2: { z: 1.1, dy: 0.08 }, 3: { z: 0.9, dy: 0.02 }, 4: { z: 1.35, dy: 0.05 }, 5: { z: 1.25, dy: 0.0 },
  6: { z: 1.5, dy: -0.02, dx: 0.02 }, 7: { z: 1.25, dy: 0.04 }, 8: { z: 1.35, dy: 0.04 }, 9: { z: 1.35, dy: 0.04 }, 10: { z: 1.2, dy: 0.04 }, 11: { z: 0.95, dy: 0.04 },
};
async function renderMechThumb(e, size = 192) {
  if (!mthumb.scene) {
    mthumb.rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 }); mthumb.rt.texture.colorSpace = THREE.SRGBColorSpace;
    mthumb.cv = document.createElement('canvas'); mthumb.cv.width = mthumb.cv.height = size; mthumb.buf = new Uint8Array(size * size * 4);
    const sc = mthumb.scene = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2430, 1.4));
    const k = new THREE.DirectionalLight(0xffffff, 2.2); k.position.set(2, 4, 5); sc.add(k);
    const rim = new THREE.DirectionalLight(0x88bbff, 1.6); rim.position.set(-4, 3, -3); sc.add(rim);
    mthumb.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  }
  mthumb.scene.environment = scene.environment; mthumb.scene.environmentIntensity = 0.55;
  const v = createView(e.design);
  try { const rd = await makeRider(e.ava); v.setRider(rd); } catch (err) { /* 无分身也出图 */ }
  v.root.rotation.y = 0; mthumb.scene.add(v.root); v.root.updateMatrixWorld(true);
  for (const m of v.meshes) m.visible = false;
  const R = renderer, prevT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
  const cam = mthumb.cam, buf = mthumb.buf;
  const shoot = () => { R.setRenderTarget(mthumb.rt); R.setClearColor(0x000000, 0); R.clear(); R.render(mthumb.scene, cam); R.readRenderTargetPixels(mthumb.rt, 0, 0, size, size, buf); };
  const neck = new THREE.Vector3(), head = new THREE.Vector3();
  (v.rider?.B.neck || v.anchors.seat || v.root).getWorldPosition(neck); (v.rider?.B.head || v.anchors.seat || v.root).getWorldPosition(head);
  const sc = new THREE.Vector3(); (v.anchors.seat || v.root).getWorldScale(sc);
  const tgt = head.clone(); let H = 1.1 * (sc.x || 1);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.root.quaternion), side = new THREE.Vector3(1, 0, 0).applyQuaternion(v.root.quaternion);
  const dir = new THREE.Vector3(0.18, 0.16, 1).normalize();
  const place = () => {
    const dist = (H / 2) / Math.tan(THREE.MathUtils.degToRad(15));
    cam.position.copy(tgt).addScaledVector(fwd, dist * dir.z).addScaledVector(side, dist * dir.x); cam.position.y += dist * dir.y;
    cam.lookAt(tgt); cam.near = Math.max(0.01, dist * 0.3); cam.far = dist * 4; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  };
  if (v.rider) for (let it = 0; it < 3; it++) {
    place(); shoot();
    const ny = Math.round((neck.clone().project(cam).y * 0.5 + 0.5) * size); // 像素行（自下而上）
    let x0 = size, x1 = -1, y0 = size, y1 = -1;
    for (let y = Math.max(0, ny); y < size; y++) for (let x = 0; x < size; x++) if (buf[(y * size + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) break;
    const hw = (x1 - x0 + 1) / size, hh = (y1 - y0 + 1) / size;
    const cx = (x0 + x1) / 2 / size - 0.5, cy = (y0 + y1) / 2 / size - 0.53;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    tgt.addScaledVector(right, cx * H).addScaledVector(up, cy * H);
    H *= clamp(Math.max(hh, hw * 0.8) / 0.52, 0.25, 4);
  }
  // 逐分身精修（吉祥物类角色头身一体，颈骨不可靠）：z = 放大倍数，dy = 取景中心上下偏移（画面比例）
  const fx = FACE_FIX[e.ava];
  if (v.rider && fx) {
    place(); const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    H /= fx.z; tgt.addScaledVector(up, (fx.dy || 0) * H).addScaledVector(right, (fx.dx || 0) * H);
  }
  place(); shoot();
  R.setRenderTarget(prevT); R.setClearColor(prevC, prevA);
  const ctx = mthumb.cv.getContext('2d'); const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0); const url = mthumb.cv.toDataURL('image/png');
  mthumb.scene.remove(v.root); v.dispose();
  return url;
}
function refreshThumbs() {
  if (!$('#roster').classList.contains('hidden')) renderRoster();
  renderQueue();
  for (let i = 0; i < 2; i++) { const e = G.E && G.E[i]; if (e && e.thumb && hud[i]) hud[i].ava.src = e.thumb; }
}

// ———————————————————— 启动 ————————————————————
async function boot() {
  const tip = $('#loadTip');
  buildAvaGrid();
  resize(); addEventListener('resize', resize);
  tip.textContent = '正在搭建擂台…'; await nextFrame();
  arena = new Arena(scene, renderer, Q);
  vfx = new VFX(scene, camera, { low: Q.low });
  director = new Director(camera, canvas);
  resize();
  app.insertAdjacentHTML('beforeend', '<div class="vignette"></div><div class="slowmo" id="slowmo"></div>');
  // 冷启动：4 台预设机器人 + 4 位模拟玩家
  // 开场第一对：「全弹发射」导弹重机 vs「万雷天罚」轻巧多足蛛，体型反差拉满；外观依旧随机。其余全部保持原随机逻辑
  const opener = [
    pickDesign(BOTS[0].name, () => ({ form: Math.random() < 0.5 ? 'humanoid' : 'tank' }), (d) => d.ult === 'barrage', (d) => d.scale),
    pickDesign(BOTS[1].name, () => ({ form: 'spider' }), (d) => d.ult === 'storm', (d) => -d.scale),
  ];
  BOTS.forEach((b, i) => queue.push(makeEntry(opener[i] || designForRole(b.prompt, b.name, b.role, b.form), b.ava, b.name)));
  // 预编译 + 首帧
  tip.textContent = '正在生成机甲…'; await nextFrame();
  renderOnce();
  // 分身缩略图
  for (let i = 0; i < AVATARS.length; i++) loadAvatar(i).catch(() => {}); // 后台预取分身模型，开打时直接可用
  audio.init().catch((e) => console.warn('audio', e));
  tip.textContent = '准备就绪';
  setTimeout(enterArena, 250);
  // 先开打（开始页后面就能看到擂台）
  nextMatch();
  requestAnimationFrame(loop);
  if (TEST) window.__G = { G, roster, queue, director, renderer, scene, camera, audio, vfx, renderThumbs, getThumbs: () => thumbs, makeRider, riderHeadBox, renderMechThumb, makeEntry, generateDesign, AS };
}
function renderOnce() { if (composer) composer.render(); else renderer.render(scene, camera); }

function buildAvaGrid() {
  const g = $('#avaGrid'); g.innerHTML = '';
  AVATARS.forEach((a, i) => {
    if (!avatarVisible(i)) return; // 暂时隐藏的分身
    const d = document.createElement('div'); d.className = 'ava' + (i === myAva ? ' sel' : '') + (thumbs[i] ? '' : ' loading');
    d.innerHTML = `<div class="ai">${thumbs[i] ? `<img src="${thumbs[i]}" alt="">` : ''}</div><div class="an">${a.name}</div>`;
    d.onclick = () => { myAva = i; buildAvaGrid(); audio.unlock(); audio.play('servo1', { vol: 0.5 }); };
    g.appendChild(d);
  });
  $('#avaName').textContent = AVATARS[myAva].name;
  const pc = $('#pilotChip img'); if (pc) pc.src = thumbs[myAva];
}

// 首次进入直接观战；第一次点「创造机器人」才选分身
let pilotPicked = false;
function enterArena() {
  G.started = true;
  $('#start').classList.add('out'); setTimeout(() => $('#start').classList.add('hidden'), 500);
  $('#hud').classList.remove('hidden'); $('#bottom').classList.remove('hidden');
  $('#tapHint').classList.remove('hidden');
}
function openPilot() { buildAvaGrid(); $('#create').classList.add('hidden'); closePreview(); $('#pilot').classList.remove('hidden'); }
$('#btnPilot').onclick = () => {
  pilotPicked = true; audio.unlock(); audio.play('baydoor', { vol: 0.35 });
  $('#pilot').classList.add('hidden');
  toast(`分身「${AVATARS[myAva].name}」已就位`);
  if (pv.view) makeRider(myAva).then((r) => { if (pv.view) pv.view.setRider(r); }).catch(() => {});
  openCreate();
};
$('#pilotChip').onclick = () => { audio.play('servo1', { vol: 0.4 }); openPilot(); };
// 首次触摸解锁音频（移动端浏览器策略）
const unlockOnce = () => { audio.unlock(); if (G.started) audio.startMusic(); $('#tapHint').classList.add('hidden'); };
addEventListener('pointerdown', unlockOnce, { passive: true });

// ———————————————————— 赛制 ————————————————————
function disposeSlot(i) {
  const v = G.V[i]; if (!v) return;
  scene.remove(v.root); v.dispose(); G.V[i] = null;
}
async function attachRider(view, entry) {
  try { const r = await makeRider(entry.ava); if (view.root.parent) view.setRider(r); } catch (e) { console.warn('rider', e); }
}
function spawn(entry, side, x, z, drop = true) {
  const f = new Fighter(entry.design, side);
  f.x = x; f.z = z; f.yaw = Math.atan2(-x, -z);
  if (drop) { f.grounded = false; f.y = 15 + side * 2; f.vy = -4; }
  return f;
}
function nextMatch() {
  G.round++;
  const prevChamp = G.E[0] && G.phase !== 'boot' ? G.E[0] : null;
  let champ = prevChamp, champF = null;
  if (champ && G.champStreak >= 4) {
    toast(`🏆 ${champ.design.name} 四连胜卫冕，荣誉下场休息`);
    queue.push(champ); disposeSlot(0); champ = null; G.champStreak = 0;
  }
  const sim = new Sim(); G.sim = sim; projSeen.clear();
  sim.muzzle = (f, slot) => { const v = views.get(f); return v ? v.muzzleWorld(slot) : null; };
  sim.on(onSimEvent);
  views.clear();
  if (champ) {
    const old = G.F[0];
    champF = spawn(champ, 0, clamp(old.x, -6, 6), clamp(old.z, -6, 6), false);
    const v = G.V[0]; v.dead = false; v.cele = 0; views.set(champF, v);
  } else {
    champ = queue.shift(); disposeSlot(0);
    champF = spawn(champ, 0, -6, 0, true);
    const v = makeView(champ); G.V[0] = v; views.set(champF, v);
    G.champStreak = 0;
  }
  const chall = queue.shift();
  disposeSlot(1);
  const L = Math.hypot(champF.x, champF.z);
  const cx = L > 0.5 ? -champF.x / L * 6 : 6, cz = L > 0.5 ? -champF.z / L * 6 : 0;
  const challF = spawn(chall, 1, cx, cz, true);
  const v1 = makeView(chall); G.V[1] = v1; views.set(challF, v1);
  G.F = [champF, challF]; G.E = [champ, chall];
  sim.setFighters(champF, challF);
  champF.frozen = challF.frozen = true;
  G.phase = 'intro'; G.t = 0; G.clock = MAX_TIME; G.koT = 0;
  // 擂主卫冕：镜头直接从胜者特写推到新挑战者特写，不回远景
  G.ann = { quick: !!(prevChamp && champ === prevChamp) };
  if (!G.ann.quick) director.setMode('intro');
  setupHud();
  renderQueue();
  arena.setScreen(champ.design.name, chall.design.name, champ.design.palette.emissive, chall.design.palette.emissive);
  if (chall.mine) toast(`⚡ 你的机器人「${chall.design.name}」登场挑战！`);
}
function makeView(entry) {
  const v = createView(entry.design);
  v.fxCol = hex3(entry.design.palette.emissive);
  v.lastStep = 0;
  scene.add(v.root);
  v.root.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow !== false; });
  attachRider(v, entry);
  return v;
}

function startFight() {
  hideIntroCard();
  for (const v of G.V) if (v) v.cele = 0;
  G.phase = 'fight'; G.t = 0;
  for (const f of G.F) f.frozen = false;
  director.setMode('fight');
}
function judge() {
  const [a, b] = G.F; const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
  const loser = ra < rb ? a : b, winner = loser === a ? b : a;
  toast('⏱ 时间到！按剩余耐久判定');
  loser.hp = 0; G.sim.ko(loser, winner);
}
// 隐藏演示彩蛋：双击顶部头像，直接 KO 该侧机器人（走正常 KO → WINNER 流程，无任何 UI 提示）
function demoKO(i) {
  if (!G.sim || !G.F || G.phase !== 'fight') return;
  const loser = G.F[i], winner = G.F[1 - i];
  if (!loser || !winner || !loser.alive || !winner.alive) return;
  loser.hp = 0; G.sim.ko(loser, winner);
}
document.querySelectorAll('#hud .fc-frame').forEach((el, i) => {
  el.style.pointerEvents = 'auto';
  let last = 0;
  el.addEventListener('pointerdown', (ev) => { const now = performance.now(); if (now - last < 350) { demoKO(i); last = 0; } else last = now; ev.stopPropagation(); });
  el.addEventListener('dblclick', (ev) => { ev.preventDefault(); });
});
function onKO(loser, winner) {
  G.phase = 'ko'; G.t = 0;
  const li = G.F.indexOf(loser), wi = 1 - li;
  G.loserIdx = li;
  const lv = G.V[li], wv = G.V[wi];
  lv.dead = true;
  winner.frozen = true;
  slow(0.18, 1.6);
  director.setMode('ko', { f: loser, v: lv }); director.shake(1);
  banner('K.O.', '', 'ko', 1.8);
  audio.play('cinhit', { vol: 1, force: true, vary: false }); audio.play('voKO', { vol: 1.1, delay: 0.15, force: true, bus: 'master', vary: false });
  audio.duckMusic(0.35, 1.6); audio.setExcite(1);
  const we = G.E[wi], le = G.E[li];
  we.wins++; le.losses++;
  G.champStreak = wi === 0 ? G.champStreak + 1 : 1;
  we.best = Math.max(we.best, G.champStreak);
  addFlash();
  ticker(`${we.owner} 的「${we.design.name}」击败了「${le.design.name}」`);
}
function explodeLoser() {
  const li = G.loserIdx, v = G.V[li], f = G.F[li];
  const p = v.anchorWorld('core') || new THREE.Vector3(f.x, 2, f.z);
  vfx.explosion(p.x, p.y, p.z, 2.4); vfx.explosion(p.x + 0.8, p.y + 0.6, p.z - 0.5, 1.4);
  vfx.burst(p.x, p.y - 0.6, p.z, G.E[li].design.palette, 70, Math.max(0.8, f.scale));
  vfx.dust(f.x, f.z, 18, 2);
  audio.play('expXL', { vol: 1, force: true }); audio.play('debris1', { vol: 0.8, delay: 0.25, force: true }); audio.play('techdeb', { vol: 0.6, delay: 0.5 });
  director.shake(1.2); addFlash();
  if (v.rider) { /* 分身随残骸一起弹出（简单处理：隐藏） */ }
  scene.remove(v.root);
}
function celebrate() {
  const wi = 1 - G.loserIdx; const v = G.V[wi], f = G.F[wi], e = G.E[wi];
  G.phase = 'celebrate'; G.t = 0;
  v.cele = 1; f.act = { type: 'celebrate', t: 0, dur: 99, data: {}, fired: {} };
  director.setMode('winner', { f, v });
  banner('WINNER', `${AVATARS[e.ava]?.name || e.owner} · ${e.design.name}${G.champStreak > 1 ? ` · ${G.champStreak} 连胜` : ''}`, 'win', 3.2);
  audio.play('voWinner', { vol: 1, force: true, bus: 'master', vary: false }); audio.play('cheer1', { vol: 0.55, force: true });
  if (e.mine) toast('🎉 你的机器人赢了！');
}
function finishRound() {
  const li = G.loserIdx, wi = 1 - li;
  const loser = G.E[li];
  // 败者回到队尾（残骸已清理，下一轮重新组装）
  queue.push(loser);
  disposeSlot(li);
  // 擂主固定在 0 号位
  if (wi === 1) { G.V[0] = G.V[1]; G.V[1] = null; G.F[0] = G.F[1]; G.E[0] = G.E[1]; }
  G.V[0].cele = 0;
  nextMatch();
}

// ———————————————————— 模拟事件 → 表现 ————————————————————
const HIT_SFX = { jab: ['hitM1', 'hitM2'], cross: ['hitM2', 'hitM3'], heavy: ['hitH1', 'hitH2'], bash: ['hitH3', 'hitM4'] };
const ULT_TEXT = { meteor: '陨星重砸', barrage: '全弹发射', beam: '光子巨炮', frenzy: '狂暴连斩', inferno: '炼狱火旋', storm: '万雷天罚' };
let lastCin = -99;
function slot(f) { return G.F.indexOf(f); }
function onSimEvent(type, d) {
  const now = performance.now() / 1000;
  switch (type) {
    case 'swing': {
      if (d.type === 'frenzy') { const v = views.get(d.f); if (v) vfx.slash(d.f, v.fxCol, d.i >= 8, d.i); }
      const heavy = d.type === 'heavy' || d.type === 'leap' || d.type === 'frenzy' && d.i >= 8;
      const blade = d.f.d.main === 'blade' || d.f.d.main === 'claw';
      audio.play(heavy ? 'whooshH' : blade ? (Math.random() < 0.5 ? 'sword1' : 'sword2') : (Math.random() < 0.5 ? 'whoosh1' : 'whoosh2'), { vol: heavy ? 0.7 : 0.45, cd: 0.08 });
      if (heavy) audio.play('hydr', { vol: 0.35, cd: 0.3 });
      break;
    }
    case 'hit': {
      const { target: o, attacker: f, dmg, crit, blocked, heavy, kind, ult, pos } = d;
      const v = views.get(o); const av = views.get(f);
      if (v) v.onHit(heavy || ult, 1);
      const P = new THREE.Vector3(pos.x, pos.y, pos.z);
      const nx = (o.x - f.x), nz = (o.z - f.z), nl = Math.hypot(nx, nz) || 1;
      const flameish = kind === 'flame' || kind === 'inferno';
      if (blocked) {
        vfx.sparks(P.x, P.y, P.z, 10, { speed: 8, c: [0.6, 0.85, 1], flash: 1.2, nx: -nx / nl, nz: -nz / nl });
        audio.play(Math.random() < 0.5 ? 'block1' : 'block2', { vol: 0.6, cd: 0.06 });
        vfx.number(P, `${Math.round(dmg)}`, 'block');
      } else {
        if (!flameish) vfx.sparks(P.x, P.y, P.z, heavy ? 22 : (kind === 'bullet' ? 4 : 12), { speed: heavy ? 13 : 9, nx: nx / nl, nz: nz / nl, flash: heavy ? 2.6 : 1.4, c: kind === 'elec' || kind === 'storm' || kind === 'laser' || kind === 'beam' ? [0.6, 0.85, 1] : undefined });
        if (heavy) { vfx.ring(o.x, 0.05, o.z, 0.5, 3, 0.35, 0xffd0a0, 0.6); vfx.light(P.x, P.y, P.z, 18); }
        const big = dmg >= 1200 || (ult && dmg > 700);
        if (flameish || kind === 'beam') {
          // 持续伤害合并显示，避免数字刷屏
          const k = 'dot' + slot(o); const A = (G[k] = G[k] || { sum: 0, t: 0 }); A.sum += dmg;
          const now = performance.now(); if (now - A.t > 380) { vfx.number(P, `${Math.round(A.sum)}`, A.sum > 600 ? 'big' : ''); A.sum = 0; A.t = now; }
        } else vfx.number(P, `${Math.round(dmg)}`, crit ? 'crit' : big ? 'big' : '');
        // 音效
        if (kind === 'bullet') audio.play('hitFast', { vol: 0.35, cd: 0.07 });
        else if (kind === 'flame' || kind === 'inferno') audio.play('punch', { vol: 0.15, cd: 0.25 });
        else if (kind === 'elec' || kind === 'storm' || kind === 'arc') audio.play('elec', { vol: 0.5, cd: 0.2 });
        else if (kind === 'chainsaw' || kind === 'drill' || kind === 'saw') audio.play('hitFast', { vol: 0.4, cd: 0.1 });
        else if (heavy || ult) audio.pick(['hitH1', 'hitH2', 'hitH3'], { vol: 0.9, cd: 0.08 });
        else audio.pick(HIT_SFX[kind] || ['hitM1', 'hitM2', 'hitM3', 'hitM4'], { vol: 0.65, cd: 0.05 });
        if (f.d.main === 'blade' && ['jab', 'cross', 'heavy'].includes(kind)) audio.play('sword2', { vol: 0.35, cd: 0.1 });
        if (ult) { director.ultHit(heavy || dmg > 900); if (kind === 'frenzy' && heavy) vfx.ultBurst(P.x, P.y, P.z, views.get(f)?.fxCol || [1, 0.4, 0.6], 1.4); else if (kind === 'beam' && Math.random() < 0.5) vfx.ultBurst(P.x, P.y, P.z, views.get(f)?.fxCol || [0.6, 0.9, 1], 0.8); } else director.shake(heavy ? 0.55 : 0.12);
        // 慢动作：重击/暴击/大招重伤
        if ((heavy && (crit || dmg > 1100)) || (ult && dmg > 1300)) {
          if (now - lastCin > 5) { lastCin = now; slow(0.22, 0.45); audio.play('cinhit', { vol: 0.75 }); director.setMode('impact', { f: o, v }, 0.6); }
          else slow(0.4, 0.2);
        }
        if (crit) ticker(`暴击！「${f.d.name}」打出 ${Math.round(dmg)} 点伤害`);
      }
      break;
    }
    case 'miss': vfx.number(new THREE.Vector3(d.o.x, d.o.y + d.o.height * 0.8, d.o.z), 'MISS', 'tag'); audio.play('whoosh2', { vol: 0.4 }); break;
    case 'parry': { const o = d.f; vfx.number(new THREE.Vector3(o.x, o.y + o.height * 0.9, o.z), '格挡反击!', 'tag'); audio.play('block2', { vol: 0.8 }); break; }
    case 'interrupt': { const o = d.f; vfx.number(new THREE.Vector3(o.x, o.y + o.height, o.z), '打断!', 'tag'); break; }
    case 'dodge': audio.play('whoosh1', { vol: 0.4, cd: 0.2 }); audio.play('servo2', { vol: 0.3, cd: 0.3 }); vfx.dust(d.f.x, d.f.z, 5, 0.6); break;
    case 'jump': audio.play('hydr', { vol: 0.55, cd: 0.2 }); audio.play('steam', { vol: 0.35, cd: 0.3 }); vfx.dust(d.f.x, d.f.z, 8, 0.8); if (d.kind === 'meteor') audio.play('rise', { vol: 0.6 }); break;
    case 'land': {
      const v = views.get(d.f); if (v) v.onLand(d.heavy);
      vfx.dust(d.f.x, d.f.z, d.heavy ? 14 : 6, d.heavy ? 1.3 : 0.7);
      audio.play(d.heavy ? 'boom' : 'step2', { vol: d.heavy ? 0.6 : 0.5, cd: 0.1 });
      if (d.heavy) { director.shake(0.5); vfx.ring(d.f.x, 0.04, d.f.z, 0.5, 3.2, 0.4, 0xc8d0e0, 0.45); }
      break;
    }
    case 'rope': arena.hitRope(d.f.x, d.f.z, 1); audio.play('block1', { vol: 0.25, cd: 0.4, rate: 0.7 }); break;
    case 'proj': {
      const p = d.p, v = views.get(d.f);
      if (v) v.onShot(p.slot || 0);
      projSeen.set(p.id, p);
      const col = v ? v.fxCol : [1, 0.8, 0.4];
      if (p.kind === 'bullet') { vfx.muzzle(p, 0.7); audio.play(Math.random() < 0.5 ? 'mg' : 'smg', { vol: 0.32, cd: 0.11, dur: 0.35, fade: 0.1 }); }
      else if (p.kind === 'plasma') { vfx.muzzle(p, 1, col); audio.play(Math.random() < 0.5 ? 'laser1' : 'laser2', { vol: 0.42, cd: 0.08, dur: 0.6, fade: 0.2 }); }
      else if (p.kind === 'shell' || p.kind === 'bigshell') { vfx.muzzle(p, p.kind === 'bigshell' ? 2.4 : 1.6); vfx.smk.emit({ x: p.x, y: p.y, z: p.z, life: 1, s0: 0.6, s1: 2.2, c: [0.3, 0.3, 0.32], a: 0.5, ground: false }); audio.play(p.kind === 'bigshell' ? 'cannon2' : 'cannon1', { vol: 0.75, cd: 0.1 }); director.shake(0.2); }
      else if (p.kind === 'missile') { vfx.muzzle(p, 0.8); audio.play('rocket', { vol: 0.42, cd: 0.09, dur: 0.6, fade: 0.2 }); }
      break;
    }
    case 'fx': {
      const i = slot(d.f), v = views.get(d.f);
      if (d.kind === 'chargeStart') { audio.play('steam', { vol: 0.6 }); audio.play('hydr', { vol: 0.6 }); }
      else if (d.kind === 'sawOn' || d.kind === 'drillOn') { if (v) v.sawOn = true; vfx.saws[i] = { view: v }; audio.loop('saw' + i, d.kind === 'sawOn' ? 'chainsaw' : 'drill', 0.5); }
      else if (d.kind === 'sawOff') { if (v) v.sawOn = false; vfx.saws[i] = null; audio.stopLoop('saw' + i); }
      break;
    }
    case 'flame': { const i = slot(d.f); vfx.setFlame(i, d.on, d.big, views.get(d.f)); if (d.on) audio.loop('flame' + i, 'flame', d.big ? 0.7 : 0.5); else audio.stopLoop('flame' + i); break; }
    case 'beam': {
      const i = slot(d.f), v = views.get(d.f);
      vfx.setBeam(i, d.on, d.phase, d.big, v, v ? v.fxCol : undefined);
      if (d.on && d.phase === 'charge') audio.play('riser', { vol: 0.6 });
      if (d.on && d.phase === 'fire') { audio.play(d.big ? 'laser2' : 'laser1', { vol: 0.8, rate: d.big ? 0.7 : 0.9 }); audio.play('elec', { vol: 0.35 }); director.shake(0.3); }
      break;
    }
    case 'arc': {
      const v = views.get(d.f), ov = views.get(d.o); if (!v) break;
      const a = v.anchorWorld('coilL') || v.anchorWorld('core');
      const b = d.hit && ov ? ov.anchorWorld('core') : new THREE.Vector3(d.f.x + Math.sin(d.f.yaw) * 6, 0.2, d.f.z + Math.cos(d.f.yaw) * 6);
      vfx.arc(a, b, v.fxCol); const a2 = v.anchorWorld('coilR'); if (a2) vfx.arc(a2, b, [0.8, 0.9, 1]);
      audio.play('elec', { vol: 0.7, cd: 0.15 });
      break;
    }
    case 'stomp': {
      const big = d.big, s = big ? 2 : d.small ? 0.9 : 1.3;
      vfx.ring(d.x, 0.05, d.z, 0.6, d.r, big ? 0.7 : 0.45, big ? 0xffb070 : 0xd0d8ff, 0.9);
      vfx.dust(d.x, d.z, big ? 26 : 14, s);
      vfx.sparks(d.x, 0.3, d.z, big ? 30 : 12, { speed: 10 });
      audio.play(big ? 'expL' : 'boom', { vol: big ? 0.9 : 0.7 }); audio.play('debris2', { vol: 0.5, delay: 0.1 });
      director.shake(big ? 1.1 : 0.6);
      if (big) { addFlash(); vfx.explosion(d.x, 0.5, d.z, 1.5); vfx.meteorImpact(d.x, d.z, d.r, views.get(d.f)?.fxCol); audio.play('expXL', { vol: 0.8 }); audio.play('thunder', { vol: 0.5, delay: 0.05 }); }
      break;
    }
    case 'strike': if (d.phase === 'warn') { vfx.warn(d.x, d.z); audio.play('elec', { vol: 0.25, cd: 0.1 }); } else { vfx.bolt(d.x, d.z); audio.play('thunder', { vol: 0.8, cd: 0.12 }); director.shake(0.5); } break;
    case 'ult': {
      document.body.classList.add('assisting');
      const v = views.get(d.f), e = G.E[slot(d.f)];
      ultCut(ULT_TEXT[d.ult] || d.f.d.moves?.ult || '大招', `${d.f.d.name} · ${e ? e.owner : ''}`);
      startAssist(d.f, v);
      audio.play('braam', { vol: 0.85, force: true }); audio.play('voCombo', { vol: 0.5, delay: 0.1, bus: 'master' }); audio.duckMusic(0.5, 3.6);
      audio.setExcite(0.9);
      ticker(`「${d.f.d.name}」蓄力大招「${ULT_TEXT[d.ult]}」！全场狂点助力！`);
      break;
    }
    case 'actEnd': if (d.type && d.type.startsWith('ult_')) { director.ultFinish(); addFlash(); audio.pick(['hitH1', 'hitH2', 'hitH3'], { vol: 1, force: true }); } break;
    case 'ko': onKO(d.loser, d.winner); break;
  }
}

// ———————————————————— 观众助力大招（3 秒子弹时间） ————————————————————
const ASSIST_DUR = 3;
const AS = { on: false, t: 0, f: null, total: 0, mine: 0, shown: 0, crowd: 0, rate: 0 };
const asEl = document.createElement('div'); asEl.id = 'assist';
asEl.innerHTML = '<div class="as-tip">狂点助力 · 大招威力加成</div><div class="as-ring"><i></i><i></i><div class="as-core"><b>TAP!</b></div></div><div class="as-count"><span class="x">×</span><span class="n">0</span><span class="l">助力</span></div><div class="as-bar"><i></i></div><div class="as-mult">伤害 +0%</div><div class="as-time"></div>';
app.appendChild(asEl);
const asN = asEl.querySelector('.as-count .n'), asBar = asEl.querySelector('.as-bar i'), asMult = asEl.querySelector('.as-mult'), asRing = asEl.querySelector('.as-ring'), asTime = asEl.querySelector('.as-time');
function assistMult(total) { return 1 + Math.min(1.2, total / 480); } // 最高 +120%
function startAssist(f, v) {
  if (!G.sim) return;
  Object.assign(AS, { on: true, t: 0, f, total: 0, mine: 0, shown: 0, crowd: 0, rate: 18 + Math.random() * 22, burst: 0 });
  G.sim.paused = true; acc = 0;
  { const b = $('#banner'); if (b.classList.contains('show')) { b.classList.remove('show'); b.classList.add('hide'); bannerTimer = 0; } }
  director.setMode('assist', { f, v }, ASSIST_DUR + 0.1);
  asEl.className = 'on ' + (slot(f) ? 'b' : 'a'); asEl.style.setProperty('--c', f.d.palette?.emissive ? '#' + new THREE.Color(f.d.palette.emissive).getHexString() : '#ff3d8b');
  asN.textContent = '0'; asMult.textContent = '伤害 +0%'; asBar.style.width = '0%';
  audio.play('riser', { vol: 0.7 }); audio.play('crowdCharge', { vol: 0.6 });
}
function assistTap(x, y) {
  if (!AS.on) return;
  AS.mine++; AS.total += 1; AS.burst = Math.min(1, AS.burst + 0.25);
  audio.play(Math.random() < 0.5 ? 'hitFast' : 'block1', { vol: 0.22, rate: 1.3 + Math.min(0.6, AS.mine * 0.01), cd: 0.03 });
  const p = document.createElement('div'); p.className = 'as-pop'; p.textContent = '+1';
  p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.setProperty('--dx', ((Math.random() - 0.5) * 80) + 'px');
  app.appendChild(p); setTimeout(() => p.remove(), 700);
  asRing.classList.remove('hit'); void asRing.offsetWidth; asRing.classList.add('hit');
  if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
}
app.addEventListener('pointerdown', (ev) => { if (AS.on && !ev.target.closest('.sheet:not(.hidden), button')) { assistTap(ev.clientX - app.getBoundingClientRect().left, ev.clientY - app.getBoundingClientRect().top); ev.stopPropagation(); ev.preventDefault(); } }, true);
function updateAssist(rdt) {
  if (!AS.on) return;
  AS.t += rdt;
  // 模拟全场观众：越接近结束越疯狂；玩家狂点会带动全场
  const heat = 1 + AS.t * 0.9 + AS.burst * 1.5; AS.burst = Math.max(0, AS.burst - rdt * 1.2);
  AS.crowd += AS.rate * heat * rdt * (0.6 + Math.random() * 0.8);
  const total = Math.floor(AS.crowd) + AS.mine; AS.total = total;
  AS.shown += (total - AS.shown) * Math.min(1, rdt * 14);
  asN.textContent = Math.round(AS.shown);
  const m = assistMult(total); asMult.textContent = `伤害 +${Math.round((m - 1) * 100)}%`; asBar.style.width = Math.min(100, (m - 1) / 1.2 * 100) + '%';
  asTime.textContent = Math.max(0, ASSIST_DUR - AS.t).toFixed(1) + 's';
  if (AS.t >= ASSIST_DUR || !G.sim || G.phase !== 'fight') endAssist();
}
function endAssist() {
  if (!AS.on) return; AS.on = false; setTimeout(() => document.body.classList.remove('assisting'), 1200);
  const f = AS.f, m = assistMult(AS.total);
  if (f) f.ultBoost = m;
  asEl.className = 'release'; setTimeout(() => { if (!AS.on) asEl.className = ''; }, 900);
  if (G.sim) G.sim.paused = false;
  const v = views.get(f);
  director.setMode('ult', { f, v }, 2.8); director.shake(0.9); director.punch(0.3);
  slow(0.35, 0.5); addFlash();
  audio.play('cinhit', { vol: 0.9, force: true }); audio.play('crowdCharge', { vol: 0.5 });
  ticker(`全场 ${AS.total} 次助力！大招伤害 +${Math.round((m - 1) * 100)}%！`);
}

// ———————————————————— 表现辅助 ————————————————————
function slow(s, dur) { G.slowTo = Math.min(G.slowTo, s); G.slowT = Math.max(G.slowT, dur); audio.setSlow(s); $('#slowmo')?.classList.add('on'); }
function addFlash() { const d = document.createElement('div'); d.className = 'flashwhite'; app.appendChild(d); setTimeout(() => d.remove(), 450); }
let bannerTimer = 0;
function banner(main, sub = '', cls = '', dur = 1.4, html = false) {
  const b = $('#banner'); const m = b.querySelector('.b-main'); const s = b.querySelector('.b-sub');
  m.className = 'b-main ' + cls; if (html) m.innerHTML = main; else m.textContent = main; s.textContent = sub;
  b.classList.remove('show', 'hide'); void b.offsetWidth; b.classList.add('show');
  bannerTimer = dur;
}
function introCard(i, noCut) {
  const e = G.E[i], f = G.F[i], v = G.V[i]; if (!e || !v) return;
  if (!(noCut && director.mode === 'introCard' && director.focus?.f === f)) director.setMode('introCard', { f, v, side: i ? -1 : 1 }, 0, !noCut);
  const c = $('#introCard'); const col = e.design.palette.emissive;
  c.style.setProperty('--ic', col); c.className = i ? 'b' : 'a';
  const champTag = i === 0 ? (G.champStreak > 0 ? `擂主 · ${G.champStreak} 连胜` : '擂主') : (e.mine ? '你的挑战者' : '新挑战者');
  c.innerHTML = `<div class="ic-ava"><img src="${e.thumb || thumbs[e.ava] || ''}" alt=""></div><div class="ic-main"><div class="ic-top"><span class="ic-tag">${champTag}</span><span class="ic-owner"><small>创造者</small>${AVATARS[e.ava]?.name || e.owner}${e.mine ? '（你）' : ''}</span></div><div class="ic-name">${e.design.name}</div><div class="ic-role">${e.design.formCn || '人形'} · ${e.design.roleCn} · 大招「${e.design.moves.ult}」</div></div>`;
  void c.offsetWidth; c.classList.add('show'); $('#bottom').classList.add('yield');
  audio.play('baydoor', { vol: 0.55 }); audio.play('hydr', { vol: 0.5, delay: 0.15 }); audio.play('crowdCharge', { vol: 0.35, delay: 0.3 });
}
function hideIntroCard() { $('#introCard').classList.remove('show'); $('#bottom').classList.remove('yield'); }
function ultCut(name, owner) {
  const u = $('#ultcut'); u.querySelector('.uc-name').textContent = name; u.querySelector('.uc-owner').textContent = owner;
  u.classList.remove('show'); void u.offsetWidth; u.classList.add('show');
}
let toastT = 0;
function toast(s, dur = 2600) { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), dur); }
let tickT = 0;
function ticker(s) { const t = $('#ticker'); t.textContent = s; t.classList.add('show'); clearTimeout(tickT); tickT = setTimeout(() => t.classList.remove('show'), 2600); }

// ———————————————————— HUD ————————————————————
const hud = [0, 1].map((i) => {
  const r = $('#fc' + i);
  return { r, ava: r.querySelector('.fc-ava'), name: r.querySelector('.fc-name'), sub: r.querySelector('.fc-sub'), fill: r.querySelector('.hp-fill'), lag: r.querySelector('.hp-lag'), num: r.querySelector('.hp-num'), en: r.querySelector('.en-fill'), lagV: 1, last: -1 };
});
function setupHud() {
  for (let i = 0; i < 2; i++) {
    const e = G.E[i], h = hud[i];
    h.ava.src = e.thumb || thumbs[e.ava] || '';
    h.name.innerHTML = `<b>${AVATARS[e.ava]?.name || e.owner}</b><i>·</i>${e.design.name}`;
    h.sub.textContent = `${e.design.formCn || '人形'} · ${e.design.roleCn}${e.mine ? ' · 你' : ''}${i === 0 && G.champStreak > 0 ? ` · 擂主 ${G.champStreak} 连胜` : ''}`;
    h.lagV = 1; h.ava.parentElement.style.setProperty('--qc', e.design.palette.emissive);
  }
  $('#round').textContent = `ROUND ${G.round}`;
}
function updateHud(dt) {
  for (let i = 0; i < 2; i++) {
    const f = G.F[i], h = hud[i]; if (!f) continue;
    const r = clamp(f.hp / f.maxHp, 0, 1);
    if (r !== h.last) { h.fill.style.transform = `scaleX(${r})`; h.fill.classList.toggle('low', r < 0.25); h.num.textContent = `${Math.ceil(Math.max(0, f.hp))}`; h.last = r; }
    if (h.lagV > r) { h.lagV = Math.max(r, h.lagV - dt * 0.35); h.lag.style.transform = `scaleX(${h.lagV})`; } else if (h.lagV < r) { h.lagV = r; h.lag.style.transform = `scaleX(${r})`; }
    const en = f.energy / 100; h.en.style.width = `${en * 100}%`; h.en.classList.toggle('full', en >= 1);
  }
  $('#timer').textContent = String(Math.max(0, Math.ceil(G.clock)));
}
function swatch(p) { return [p.primary, p.secondary, p.accent, p.emissive].map((c) => `<i style="background:${c}"></i>`).join(''); }
function renderQueue() {
  const q = $('#queue'); q.innerHTML = '';
  queue.forEach((e, i) => {
    const d = document.createElement('div'); d.className = 'qi' + (e.mine ? ' mine' : '') + (i === 0 ? ' next' : '');
    d.style.setProperty('--qc', e.design.palette.emissive); d.style.animationDelay = `${i * 0.05}s`;
    d.innerHTML = `<div class="qimg"><img src="${e.thumb || thumbs[e.ava] || ''}" alt=""></div><div class="qno">${String(i + 1).padStart(2, '0')}</div><div class="qn">${AVATARS[e.ava]?.name || e.owner}</div>`;
    q.appendChild(d);
  });
  $('#qCount').textContent = `· ${queue.length} 台待战`;
}
function renderRoster() {
  const list = $('#rosterList');
  const arr = [...roster].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  list.innerHTML = arr.map((e, i) => `<div class="rr${e.mine ? ' mine' : ''}"><div class="rk">${i + 1}</div><img class="mt" src="${e.thumb || thumbs[e.ava] || ''}" alt=""><div class="rm"><div class="rn">${AVATARS[e.ava]?.name || e.owner}${e.mine ? '<em class="me">你</em>' : ''}</div><div class="rs">${e.design.name} · ${e.design.formCn || ''}${e.design.roleCn} · 最高 ${e.best} 连胜</div></div><div class="rw">${e.wins}<small>${e.losses} 负</small></div></div>`).join('');
}
$('#btnRoster').onclick = () => { renderRoster(); $('#roster').classList.remove('hidden'); audio.play('servo1', { vol: 0.4 }); };
$('#btnSound').onclick = () => { audio.unlock(); audio.setMuted(!audio.muted); $('#btnSound').innerHTML = audio.muted ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'; $('#btnSound').classList.toggle('off', audio.muted); if (!audio.muted) audio.startMusic(); };
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { b.closest('.sheet').classList.add('hidden'); if (b.closest('#create')) closePreview(); }));

// ———————————————————— UGC 创造 ————————————————————
const pv = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 1, 0.1, 100), view: null, design: null, rot: 0, on: false, genT: 0 };
{
  pv.scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x221a28, 0.8));
  const k = new THREE.DirectionalLight(0xffffff, 2.6); k.position.set(4, 8, 6); pv.scene.add(k);
  const r1 = new THREE.DirectionalLight(0xff3d7f, 1.6); r1.position.set(-6, 3, -5); pv.scene.add(r1);
  const r2 = new THREE.DirectionalLight(0x3dc8ff, 1.6); r2.position.set(6, 3, -5); pv.scene.add(r2);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.18, 48), new THREE.MeshStandardMaterial({ color: 0x141826, metalness: 0.7, roughness: 0.35 }));
  disc.position.y = -0.09; pv.scene.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.03, 6, 64), new THREE.MeshBasicMaterial({ color: 0x3dc8ff })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; pv.scene.add(ring); pv.ring = ring;
}
const RP = {
  a: ['霓虹', '黄金', '废土', '深海', '国潮', '暗黑', '冰霜', '熔岩', '糖果', '军绿', '赛博', '蒸汽朋克', '水墨', '电光', '毒液', '樱花', '星空', '铁锈'],
  b: ['鲨鱼', '赤龙', '螳螂', '犀牛', '猎豹', '蝎子', '猩猩', '雄鹰', '巨熊', '狐狸', '甲虫', '章鱼', '恐龙', '机械猫'],
  c: ['重装坦克', '刺客', '远程炮台', '莽夫斗士', '狙击手', '堡垒', '忍者', '拳击手'],
  d: ['双刀', '巨型铁拳', '电锯手臂', '加特林', '激光枪', '重锤', '螺旋钻头', '火焰喷射', '蜂群导弹', '利爪', '雷电', '臂炮'],
};
function randomPrompt() { const p = (a) => a[Math.floor(Math.random() * a.length)]; return `${p(RP.a)}${p(RP.b)}${p(RP.c)}，${p(RP.d)}`; }
function openCreate() {
  $('#create').classList.remove('hidden');
  pv.on = true;
}
function closePreview() { pv.on = false; }
$('#btnCreate').onclick = () => { audio.unlock(); audio.play('baydoor', { vol: 0.35 }); if (!pilotPicked) openPilot(); else openCreate(); };
$('#refFile').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const url = URL.createObjectURL(f); const img = $('#refImg'); img.src = url; img.classList.add('on'); $('#refNote').classList.remove('hidden');
};
$('#btnGen').onclick = () => generate();
$('#btnRand').onclick = () => { $('#prompt').value = randomPrompt(); generate(); };
$('#prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); generate(); } });
function generate() {
  let prompt = $('#prompt').value.trim();
  if (!prompt) { prompt = randomPrompt(); $('#prompt').value = prompt; }
  audio.unlock(); audio.play('morph', { vol: 0.5 }); audio.play('servo2', { vol: 0.4, delay: 0.3 });
  $('#previewBox').classList.add('show'); statsPending(); $('#genFx').classList.add('on'); $('#previewHint').classList.add('hidden');
  $('#btnJoin').disabled = true; $('#btnGen').disabled = true;
  if (pv.view) { pv.scene.remove(pv.view.root); pv.view.dispose(); pv.view = null; }
  setTimeout(async () => {
    const d = generateDesign(prompt, '我');
    const v = createView(d); v.fxCol = hex3(d.palette.emissive);
    pv.design = d; pv.view = v; pv.f = new Fighter(d, 0); pv.f.x = 0; pv.f.z = 0; pv.f.yaw = 0; pv.rot = -0.6; pv.genT = 0;
    v.cele = 0; pv.scene.add(v.root);
    makeRider(myAva).then((r) => { if (pv.view === v) v.setRider(r); }).catch(() => {});
    $('#genFx').classList.remove('on'); $('#btnJoin').disabled = false; $('#btnGen').disabled = false; $('#btnGen').innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4"/></svg><span>换一个</span>';
    showInfo(d);
    audio.play('hydr', { vol: 0.5 }); audio.play('steam', { vol: 0.4, delay: 0.1 });
  }, 700);
}
function statsPending() {
  const el = $('#piStats'); el.classList.add('pending');
  el.innerHTML = ['攻击', '防御', '耐久', '攻速', '移速'].map((n) => `<div class="st"><div class="st-h"><b>${n}</b><em>—</em></div><div class="sb"><i></i></div></div>`).join('');
}
function showInfo(d) {
  $('#piStats').classList.remove('pending');
  const el = $('#previewInfo'); el.classList.remove('hidden');
  el.querySelector('.pi-name').textContent = d.name; el.querySelector('.pi-role').textContent = (d.formCn || '人形') + ' · ' + d.roleCn + (d.range === 'ranged' ? ' · 远程' : ' · 近战');
  el.querySelector('.pi-sw').innerHTML = swatch(d.palette) + ``;
  const R = ratings(d.stats); const S = d.stats;
  const row = (k, n, v, r) => `<div class="st"><div class="st-h"><b>${n}</b><em>${v}</em></div><div class="sb"><i style="width:${r * 10}%"></i></div></div>`;
  $('#piStats').innerHTML = row('atk', '攻击', S.atk, R.atk) + row('def', '防御', S.def, R.def) + row('hp', '耐久', S.hp, R.hp) + row('aspd', '攻速', S.aspd.toFixed(2), R.aspd) + row('mspd', '移速', S.mspd.toFixed(1), R.mspd);
  el.querySelector('.pi-moves').innerHTML = `<span>普攻 · ${d.moves.basic}</span><span>技能 · ${d.moves.special}</span><span class="u">大招 · ${d.moves.ult}</span>`;
}
$('#btnJoin').onclick = () => {
  if (!pv.design) return;
  const e = makeEntry(pv.design, myAva, '我', true);
  // 玩家机器人插到队列中「其他玩家作品」之后、预设机器人之前 → 尽快登场
  let pos = 0; while (pos < queue.length && queue[pos].mine) pos++;
  queue.splice(pos, 0, e);
  renderQueue();
  $('#create').classList.add('hidden'); closePreview();
  if (pv.view) { pv.scene.remove(pv.view.root); pv.view.dispose(); pv.view = null; }
  pv.design = null; $('#previewBox').classList.remove('show'); $('#previewInfo').classList.add('hidden'); $('#previewHint').classList.remove('hidden'); $('#btnJoin').disabled = true; $('#btnGen').innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg><span>生成设计</span>';
  $('#prompt').value = '';
  toast(pos === 0 ? `「${e.design.name}」加入队列 · 下一场登场！` : `「${e.design.name}」加入队列 · 前面还有 ${pos} 台`);
  audio.play('baydoor', { vol: 0.5 }); audio.play('crowdCharge', { vol: 0.35, delay: 0.2 });
};
let pvR = null;
function ensurePreviewRenderer() {
  if (pvR) return pvR;
  const c = document.createElement('canvas'); c.id = 'pvCanvas';
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  $('#previewBox').prepend(c);
  pvR = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
  pvR.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  pvR.toneMapping = THREE.ACESFilmicToneMapping; pvR.toneMappingExposure = 1.1; pvR.outputColorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(pvR);
  import('three/examples/jsm/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => { pv.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pv.scene.environmentIntensity = 0.6; });
  return pvR;
}
function renderPreview(dt) {
  if (!pv.on || !pv.view) return;
  const R = ensurePreviewRenderer();
  const box = $('#previewBox'); const w = box.clientWidth, h = box.clientHeight; if (w < 10) return;
  const c = R.domElement; if (c.width !== Math.round(w * R.getPixelRatio()) || c.height !== Math.round(h * R.getPixelRatio())) R.setSize(w, h, false);
  pv.ring.material.color.setHSL((performance.now() / 4000) % 1, 0.8, 0.6);
  pv.rot += dt * 0.6; pv.genT += dt;
  const v = pv.view, f = pv.f; f.yaw = pv.rot;
  v.update(f, dt, null);
  const s = Math.min(1, pv.genT / 0.5); v.root.scale.setScalar(v.scale * (0.6 + 0.4 * (1 - (1 - s) ** 3)));
  const H = v.height;
  pv.cam.aspect = w / h; pv.cam.fov = 30; pv.cam.updateProjectionMatrix();
  const tanV = Math.tan(THREE.MathUtils.degToRad(15));
  const dist = Math.max((H * 0.62) / tanV, (H * 0.75) / (tanV * pv.cam.aspect));
  pv.cam.position.set(0, H * 0.62, dist); pv.cam.lookAt(0, H * 0.48, 0);
  R.render(pv.scene, pv.cam);
}

// ———————————————————— 主循环 ————————————————————
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0, lowFrames = 0;
const STEP = 1 / 60;
function loop(now) {
  requestAnimationFrame(loop);
  let rdt = Math.min(0.05, (now - last) / 1000); last = now;
  // 慢动作
  if (G.slowT > 0) { G.slowT -= rdt; G.timeScale += (G.slowTo - G.timeScale) * Math.min(1, rdt * 20); if (G.slowT <= 0) { G.slowTo = 1; audio.setSlow(1); $('#slowmo')?.classList.remove('on'); } }
  else G.timeScale += (1 - G.timeScale) * Math.min(1, rdt * 4);
  const dt = rdt * G.timeScale;
  GLOBAL_TIME.value += dt;
  G.t += rdt;
  if (bannerTimer > 0) { bannerTimer -= rdt; if (bannerTimer <= 0) { const b = $('#banner'); b.classList.remove('show'); b.classList.add('hide'); } }
  updateAssist(rdt);
  const fdt = AS.on ? 0 : dt;
  updateGame(fdt, rdt);
  for (const f of G.F) if (f && f.act && f.act.type === 'ult_meteor' && !f.grounded && fdt > 0) vfx.meteorTrail(f.x, f.y, f.z, views.get(f)?.fxCol);
  // 机甲姿态
  for (let i = 0; i < 2; i++) {
    const f = G.F[i], v = G.V[i]; if (!f || !v || !v.root.parent) continue;
    v.update(f, fdt, G.F[1 - i]);
    // 脚步
    if (f.grounded && f.alive && v.amp > 0.25) {
      const ph = Math.floor(v.phase / Math.PI);
      if (ph !== v.lastStep) { v.lastStep = ph; audio.pick(['step1', 'step2', 'step3'], { vol: 0.25 * Math.min(1.4, f.scale), cd: 0.12, rate: 1.1 - (f.scale - 1) * 0.5 }); if (f.scale > 1.05 || f.d.role === 'tank') vfx.dust(f.x, f.z, 2, 0.5); }
    }
  }
  // 激光长度
  for (let i = 0; i < 2; i++) {
    const B = vfx.beams[i], f = G.F[i], o = G.F[1 - i];
    if (B.on && f && o) { const d = f.dist(o); const err = f.facingErr(o); B.hitLen = err < 0.35 ? Math.min(22, d + 0.2) : 22; const a = B.view && B.view.anchorWorld('beam'); B.dy = a && err < 0.35 ? (a.y - (o.y + o.height * 0.5)) / Math.max(1, d) : 0.05; }
  }
  // 弹体命中/落地
  if (G.sim) {
    for (const [id, p] of projSeen) {
      if (!p.dead && G.sim.proj.includes(p)) continue;
      projSeen.delete(id);
      const y = Math.max(0.2, p.y);
      vfx.impact(p.kind, p.x, y, p.z, { col: views.get(p.owner)?.fxCol });
      if (p.kind === 'shell') audio.play('expM', { vol: 0.7, cd: 0.08 });
      else if (p.kind === 'bigshell') { audio.play('expL', { vol: 0.85 }); director.shake(0.6); }
      else if (p.kind === 'missile') audio.pick(['expS', 'expM2'], { vol: 0.45, cd: 0.07 });
      if (p.kind !== 'bullet' && p.kind !== 'plasma') vfx.dust(p.x, p.z, 4, 0.8);
    }
  }
  const excite = G.phase === 'fight' ? 0.35 + 0.65 * (1 - Math.min(G.F[0].hp / G.F[0].maxHp, G.F[1].hp / G.F[1].maxHp)) : G.phase === 'celebrate' || G.phase === 'ko' ? 1 : 0.3;
  arena.update(dt, GLOBAL_TIME.value, excite);
  vfx.update(AS.on ? dt * 0.05 : dt, GLOBAL_TIME.value, { sim: G.sim, views });
  director.update(dt, rdt, G.F.map((f, i) => (f && G.V[i] && G.V[i].root.parent ? { f, v: G.V[i] } : null)));
  if (bloom) bloom.strength = 0.5 + (G.timeScale < 0.6 ? 0.25 : 0);
  if (G.phase !== 'boot') updateHud(rdt);
  if (composer) composer.render(); else renderer.render(scene, camera);
  renderPreview(rdt);
  // 自适应分辨率
  fpsT += rdt; fpsN++;
  if (fpsT > 2) {
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (fps < 40 && ++lowFrames >= 2) {
      lowFrames = 0; const pr = renderer.getPixelRatio();
      if (pr > 1.0) { renderer.setPixelRatio(Math.max(1, pr - 0.25)); resize(); }
      else if (bloom && bloom.enabled) { bloom.enabled = false; }
    } else if (fps >= 40) lowFrames = 0;
  }
}

function updateGame(dt, rdt) {
  const sim = G.sim; if (!sim) return;
  // 固定步长推进模拟
  acc += dt; let n = 0;
  while (acc >= STEP && n < 6) { sim.step(STEP); acc -= STEP; n++; }
  if (n >= 6) acc = 0;
  switch (G.phase) {
    case 'intro': {
      const t = G.t, A = G.ann;
      // 0~1.0 全景 → 擂主特写+条幅 → 挑战者特写+条幅 → VS → READY → FIGHT
      const Q = A.quick; const T1 = 1.0, T2 = Q ? 0.9 : 3.6, T3 = Q ? 3.5 : 6.2, T4 = Q ? 5.2 : 7.9, T5 = Q ? 6.2 : 8.9;
      if (Q && !A.pre) { A.pre = 1; const f = G.F[1]; director.setMode('introCard', { f, v: G.V[1], side: -1 }, 0, false); }
      if (!Q && !A.c0 && t > T1) { A.c0 = 1; introCard(0); }
      if (!A.c1 && t > T2) { A.c1 = 1; introCard(1, Q); }
      if (!A.vs && t > T3) { A.vs = 1; hideIntroCard(); director.setMode('intro'); banner(`<div class="vsrow"><div class="vsn a">${G.E[0].design.name}</div><div class="vsx">VS</div><div class="vsn b">${G.E[1].design.name}</div></div>`, `${AVATARS[G.E[0].ava]?.name || G.E[0].owner} vs ${AVATARS[G.E[1].ava]?.name || G.E[1].owner}`, 'vs', 1.5, true); audio.play('voPrepare', { vol: 0.8, bus: 'master' }); audio.play('drum', { vol: 0.5 }); }
      if (!A.ready && t > T4) { A.ready = 1; banner('READY', '', '', 0.8); audio.play('voReady', { vol: 0.9, bus: 'master' }); }
      if (!A.fight && t > T5) { A.fight = 1; banner('FIGHT!', '', '', 0.9); audio.play('voFight', { vol: 1, bus: 'master', force: true }); audio.play('bell', { vol: 0.6 }); audio.play('crowdCharge', { vol: 0.4 }); startFight(); }
      break;
    }
    case 'fight': {
      G.clock -= dt;
      if (G.clock <= 0) judge();
      break;
    }
    case 'ko': {
      if (!G.ann.boom && G.t > 1.5) { G.ann.boom = 1; explodeLoser(); }
      if (G.t > 2.9) celebrate();
      break;
    }
    case 'celebrate': {
      if (G.t > 4.6) finishRound();
      break;
    }
  }
}

boot().catch((e) => { console.error(e); $('#loadTip').textContent = '加载失败：' + e.message; });
