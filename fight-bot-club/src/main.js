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
import { generateDesign, EXAMPLE_PROMPTS, ratings, ROLE_CN, FORM_LIST, ULT_NAMES } from './mech/design.js';
import { createView } from './mech/forms.js';
import { GLOBAL_TIME } from './render/materials.js';
import { Arena } from './world/arena.js';
import { VFX, hex3 } from './fx/vfx.js';
import { VFX2 } from './fx/vfx2.js';
import { AudioEngine } from './audio/audio.js';
import { Director } from './game/director.js';
import { AVATARS, avatarVisible, loadAvatar, makeRider, renderThumbs, riderHeadBox } from './avatar/avatars.js';
import { clamp } from './core/util.js';
// 阵营色（上场后全局统一：血槽 / 名牌 / 出场卡 / 投票圈 / 大招条幅 / WINNER）：左黄绿、右粉
const VOTE_DUR = 4, VOTE_COL = ['#DEFF72', '#F569A8'], VOTE_INK = ['#171719', '#171719'];

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
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.25, 0.96);
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
let vfx = null, vfx2 = null;

// ———————————————————— 状态 ————————————————————
const audio = new AudioEngine();
let arena, director;
// 分身头像：静态预烘焙 WebP（每张约 7KB，HTML 头部已 preload），无需等 GLB 加载与离屏渲染
let thumbs = Array.from({ length: 12 }, (_, i) => `/avatars/thumb/a${String(i + 1).padStart(2, '0')}.webp`);
const VISIBLE_AVAS = AVATARS.map((_, i) => i).filter(avatarVisible);
let myAva = Math.max(0, AVATARS.findIndex((a) => a.id === 'a08')); // v10.1：默认分身 a08，在创造页点「更换」再换
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
  { ava: 1, name: '牛来', prompt: '', role: '', form: '' }, // v10.2：开场共 5 台（2 台对战 + 3 台候擂）
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
  for (let i = 0; i < n; i++) { const d = generateDesign(randomPrompt(), owner, opts()); if (ok(d) && !score) return d; if (ok(d) && (!best || score(d) > score(best))) best = d; }
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
  vfx2 = new VFX2(vfx);
  director = new Director(camera, canvas);
  resize();
  app.insertAdjacentHTML('beforeend', '<div class="vignette"></div><div class="slowmo" id="slowmo"></div>');
  // 冷启动：4 台预设机器人 + 4 位模拟玩家
  // v10.2 开场 5 台（前 2 台对战、后 3 台候擂）：体型 5 选不重复、大招互不重复；
  // 第一轮对战两台大招固定「全弹发射」「万雷天罚」，体型随机；候擂 3 台大招从其余大招里随机且互不相同
  // 首轮看点约束：可以两近战 / 一远一近，不允许两远程 → 「万雷天罚」那台固定为近战体型 + 近战打法
  const KITE = new Set(['manta', 'flamingo', 'spider']);
  const meleeForms = FORM_LIST.filter((f) => !KITE.has(f));
  const anchor = meleeForms[Math.floor(Math.random() * meleeForms.length)];
  const forms = [anchor, ...[...FORM_LIST].filter((f) => f !== anchor).sort(() => Math.random() - 0.5)].slice(0, BOTS.length);
  [forms[0], forms[1]] = [forms[1], forms[0]]; // forms[1] = 近战锚点（万雷天罚），forms[0] 随机（全弹发射）
  const usedUlt = new Set(['barrage', 'storm']);
  const opener = BOTS.map((b, i) => {
    const want = i === 0 ? 'barrage' : i === 1 ? 'storm' : null;
    const d = pickDesign(b.name, () => ({ form: forms[i] }), (x) => (want ? x.ult === want && (i !== 1 || x.range === 'melee') : !usedUlt.has(x.ult)), null, 600);
    usedUlt.add(d.ult); return d;
  });
  BOTS.forEach((b, i) => queue.push(makeEntry(opener[i], b.ava, b.name)));
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
  if (TEST) window.__G = { G, roster, queue, director, renderer, scene, camera, audio, vfx, vfx2, renderThumbs, getThumbs: () => thumbs, makeRider, riderHeadBox, renderMechThumb, makeEntry, generateDesign, AS, startFight, renderQueue, introCard, finishVote, createView, THREE };
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
  if (vfx2) vfx2.reset();
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
  sim.setFighters(champF, challF); sim.enableVote();
  champF.frozen = challF.frozen = true;
  G.phase = 'intro'; G.t = 0; G.clock = MAX_TIME; G.koT = 0;
  // 擂主卫冕：镜头直接从胜者特写推到新挑战者特写，不回远景
  G.ann = { quick: !!(prevChamp && champ === prevChamp) };
  if (!G.ann.quick) director.setMode('intro');
  setupHud();
  renderQueue();
  arena.setScreen(champ.design.name, chall.design.name, VOTE_COL[0], VOTE_COL[1]); // 上场即锁定阵营色：左黄绿 / 右粉
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
  banner('WINNER', `${AVATARS[e.ava]?.name || e.owner} · ${e.design.name}${G.champStreak > 1 ? ` · ${G.champStreak} 连胜` : ''}`, 'win s' + wi, 3.2);
  audio.play('voWinner', { vol: 1, force: true, bus: 'master', vary: false }); audio.play('cheer1', { vol: 0.55, force: true });
  // v10.1：胜利不再弹「你的机器人赢了」——WINNER 大字 + 胜者特写已表达，提示条只会挡脸
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
const ULT_TEXT = ULT_NAMES;
let lastCin = -99;
function slot(f) { return G.F.indexOf(f); }
function onSimEvent(type, d) {
  const now = performance.now() / 1000;
  switch (type) {
    case 'swing': {
      if (d.type === 'frenzy' || d.type === 'blink' || d.type === 'phantom' || d.type === 'hook') { const v = views.get(d.f); if (v) vfx.slash(d.f, v.fxCol, d.type === 'frenzy' ? d.i >= 8 : d.type !== 'phantom' || d.i >= 9, d.i || 0); }
      const heavy = d.type === 'heavy' || d.type === 'leap' || d.type === 'hook' || d.type === 'blink' && !d.i || d.type === 'frenzy' && d.i >= 8 || d.type === 'phantom' && d.i >= 9;
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
        if (flameish || kind === 'beam' || (dmg < 700 && (kind === 'blackhole' || kind === 'orbital' || kind === 'tornado'))) {
          // 持续伤害合并显示，避免数字刷屏
          const k = 'dot' + slot(o); const A = (G[k] = G[k] || { sum: 0, t: 0 }); A.sum += dmg;
          const now = performance.now(); if (now - A.t > 380) { vfx.number(P, `${Math.round(A.sum)}`, A.sum > 600 ? 'big' : ''); A.sum = 0; A.t = now; }
        } else {
          // v10.1 连击：同一攻击者 0.9s 内连续命中累加，数字越打越大、越快弹出
          const cs = slot(f), C = (G.cb = G.cb || [{ n: 0, t: 0 }, { n: 0, t: 0 }])[cs], nowC = performance.now();
          C.n = nowC - C.t < 900 ? C.n + 1 : 1; C.t = nowC; if (!ult) comboHud(cs, C.n);
          vfx.number(P, `${Math.round(dmg)}`, crit ? 'crit' : big ? 'big' : '', ult ? 0 : C.n, slot(o));
        }
        // 音效
        if (kind === 'bullet') audio.play('hitFast', { vol: 0.35, cd: 0.07 });
        else if (kind === 'flame' || kind === 'inferno') audio.play('punch', { vol: 0.15, cd: 0.25 });
        else if (kind === 'elec' || kind === 'storm' || kind === 'arc') audio.play('elec', { vol: 0.5, cd: 0.2 });
        else if (kind === 'chainsaw' || kind === 'drill' || kind === 'saw') audio.play('hitFast', { vol: 0.4, cd: 0.1 });
        else if (heavy || ult) audio.pick(['hitH1', 'hitH2', 'hitH3'], { vol: 0.9, cd: 0.08 });
        else audio.pick(HIT_SFX[kind] || ['hitM1', 'hitM2', 'hitM3', 'hitM4'], { vol: 0.65, cd: 0.05 });
        if (f.d.main === 'blade' && ['jab', 'cross', 'heavy'].includes(kind)) audio.play('sword2', { vol: 0.35, cd: 0.1 });
        if (ult) { director.ultHit(heavy || dmg > 900); if (kind === 'frenzy' && heavy) vfx.ultBurst(P.x, P.y, P.z, views.get(f)?.fxCol || [1, 0.4, 0.6], 1.4); else if (kind === 'beam' && Math.random() < 0.5) vfx.ultBurst(P.x, P.y, P.z, views.get(f)?.fxCol || [0.6, 0.9, 1], 0.8); } else { director.shake(heavy ? 0.6 : kind === 'bullet' ? 0.07 : 0.2); if (['jab', 'cross', 'heavy', 'bash'].includes(kind)) { G.hitstop = Math.max(G.hitstop || 0, heavy ? 0.085 : 0.04); if (heavy) director.punch(0.14); } }
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
      else if (p.kind === 'disc') { vfx.muzzle(p, 1.2, col); audio.play('whooshH', { vol: 0.6, cd: 0.08 }); audio.play('sword1', { vol: 0.4, cd: 0.08, rate: 1.3 }); }
      else if (p.kind === 'mortar') { vfx.muzzle(p, 2, [1, 0.7, 0.4]); vfx.smk.emit({ x: p.x, y: p.y, z: p.z, vy: 2, life: 1.2, s0: 0.8, s1: 2.6, c: [0.3, 0.3, 0.32], a: 0.5, ground: false }); audio.play('cannon2', { vol: 0.6, cd: 0.1, rate: 1.2 }); director.shake(0.25); }
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
    // —— v10 新招式
    case 'blink': {
      const v = views.get(d.f); vfx2.blink(d.f, d.from, d.to, v, v ? v.fxCol : [0.8, 0.6, 1]);
      audio.play('whooshH', { vol: 0.8 }); audio.play('elec', { vol: 0.45, rate: 1.4 }); director.shake(0.35);
      break;
    }
    case 'hook': {
      const v = views.get(d.f), col = v ? v.fxCol : [1, 0.8, 0.5];
      if (d.phase === 'fire') { audio.play('cannon1', { vol: 0.45, rate: 1.5 }); audio.play('servo2', { vol: 0.5 }); }
      else if (d.phase === 'catch') { const o = d.o; vfx2.hookCatch(o.x, o.y + o.height * 0.55, o.z, col); audio.play('block2', { vol: 0.8 }); audio.play('hydr', { vol: 0.6, delay: 0.05 }); director.shake(0.45); vfx.number(new THREE.Vector3(o.x, o.y + o.height, o.z), '擒拿!', 'tag'); }
      else if (d.phase === 'miss') audio.play('whoosh2', { vol: 0.4 });
      break;
    }
    case 'discHit': { const v = views.get(d.p.owner); vfx2.discHit(d.x, d.y, d.z, v ? v.fxCol : [1, 0.6, 0.8]); audio.play(Math.random() < 0.5 ? 'sword1' : 'sword2', { vol: 0.7, cd: 0.05 }); break; }
    case 'mortarWarn': { vfx2.mortarWarn(d.x, d.z, d.life, views.get(d.f)?.fxCol); audio.play('elec', { vol: 0.2, cd: 0.1, rate: 1.6 }); break; }
    case 'blackhole': {
      const v = views.get(d.f), col = v ? v.fxCol : [0.7, 0.4, 1];
      vfx2.blackhole(d.phase, d.x, d.y, d.z, col);
      if (d.phase === 'open') { audio.play('sub', { vol: 0.9 }); audio.play('riser', { vol: 0.6 }); audio.play('morph', { vol: 0.6 }); director.shake(0.6); slow(0.45, 0.25); }
      else { audio.play('expXL', { vol: 1, force: true }); audio.play('thunder', { vol: 0.6, delay: 0.04 }); director.shake(1.3); addFlash(); slow(0.25, 0.4); }
      break;
    }
    case 'orbital': {
      const v = views.get(d.f), col = v ? v.fxCol : [1, 0.4, 0.3];
      vfx2.orbital(d.phase, d.x, d.z, col);
      if (d.phase === 'lock') { audio.play('riser', { vol: 0.7 }); audio.play('servo1', { vol: 0.5 }); ticker('⚠ 天基轨道炮已锁定目标！'); }
      else if (d.phase === 'fire') { audio.play('laser2', { vol: 1, rate: 0.55, force: true }); audio.play('expXL', { vol: 0.9, force: true }); audio.play('thunder', { vol: 0.7 }); audio.loop('orb', 'flame', 0.55); director.shake(1.4); addFlash(); slow(0.3, 0.35); }
      else { audio.stopLoop('orb'); audio.play('expL', { vol: 0.7 }); }
      break;
    }
    case 'tornado': {
      const i = slot(d.f), v = views.get(d.f), col = v ? v.fxCol : [0.7, 0.9, 1];
      vfx2.tornado(i, d.f, d.on, d.fin, col);
      if (d.on) { audio.play('rise', { vol: 0.7 }); audio.play('whooshH', { vol: 0.9 }); audio.loop('torn' + i, 'chainsaw', 0.35); director.shake(0.5); }
      else { audio.stopLoop('torn' + i); if (d.fin) { audio.play('expL', { vol: 0.95, force: true }); audio.play('debris1', { vol: 0.7, delay: 0.1 }); director.shake(1.2); addFlash(); } }
      break;
    }
    case 'phantom': {
      const v = views.get(d.f), col = v ? v.fxCol : [1, 0.5, 0.8];
      vfx2.phantom(d.phase, d, v, col);
      if (d.phase === 'start') { audio.play('morph', { vol: 0.7 }); audio.play('whooshH', { vol: 0.7 }); }
      else if (d.phase === 'pass') { audio.play(d.i % 2 ? 'sword1' : 'sword2', { vol: 0.75 }); audio.play('whoosh1', { vol: 0.5 }); director.shake(0.3); }
      else if (d.phase === 'gather') { audio.play('riser', { vol: 0.5 }); }
      else if (d.phase === 'final') { audio.play('cinhit', { vol: 1, force: true }); audio.play('expL', { vol: 0.8 }); director.shake(1.3); addFlash(); slow(0.22, 0.45); }
      break;
    }
    case 'glacier': {
      const v = views.get(d.f), col = v ? v.fxCol : [0.6, 0.9, 1];
      vfx2.glacier(d.phase, d, col);
      if (d.phase === 'charge') { audio.play('riser', { vol: 0.5 }); audio.play('steam', { vol: 0.5, rate: 0.7 }); }
      else if (d.phase === 'slam') { audio.play('boom', { vol: 0.9 }); audio.play('steam', { vol: 0.8 }); audio.play('expM', { vol: 0.5 }); director.shake(0.7); }
      else if (d.phase === 'spike') audio.play(Math.random() < 0.5 ? 'block1' : 'debris2', { vol: 0.35, cd: 0.09, rate: 1.5 });
      else if (d.phase === 'freeze') { audio.play('block2', { vol: 0.9, rate: 0.7 }); audio.play('steam', { vol: 0.8 }); director.shake(0.6); vfx.number(new THREE.Vector3(d.o.x, d.o.y + d.o.height, d.o.z), '冰封!', 'tag'); slow(0.4, 0.3); }
      else if (d.phase === 'shatter' && !d.miss) { audio.play('expXL', { vol: 0.9, force: true }); audio.play('debris1', { vol: 0.9, delay: 0.05 }); audio.play('techdeb', { vol: 0.6, delay: 0.2 }); director.shake(1.3); addFlash(); }
      break;
    }
    case 'ultVote': startVote(); break;
    case 'ult': {
      const v = views.get(d.f), e = G.E[slot(d.f)];
      ultCut(ULT_TEXT[d.ult] || d.f.d.moves?.ult || '大招', e, slot(d.f)); // 大招条幅底色始终跟随释放方阵营色
      director.setMode('ult', { f: d.f, v }, 2.8); director.shake(0.9); director.punch(0.3);
      slow(0.35, 0.5); addFlash();
      audio.play('braam', { vol: 0.85, force: true }); audio.play('cinhit', { vol: 0.8, force: true }); audio.play('voCombo', { vol: 0.5, delay: 0.1, bus: 'master' }); audio.duckMusic(0.5, 3.2);
      audio.setExcite(0.9);
      break;
    }
    case 'actEnd': if (d.type && (d.type === 'ult_blackhole' || d.type === 'ult_orbital' || d.type === 'ult_tornado')) { vfx2.stopFor(d.type, slot(d.f)); if (d.type === 'ult_orbital') audio.stopLoop('orb'); if (d.type === 'ult_tornado') audio.stopLoop('torn' + slot(d.f)); }
      if (d.type && d.type.startsWith('ult_')) { director.ultFinish(); addFlash(); audio.pick(['hitH1', 'hitH2', 'hitH3'], { vol: 1, force: true }); } break;
    case 'actCut': if (d.type === 'ult_blackhole' || d.type === 'ult_orbital' || d.type === 'ult_tornado') { vfx2.stopFor(d.type, slot(d.f)); if (d.type === 'ult_orbital') audio.stopLoop('orb'); if (d.type === 'ult_tornado') { audio.stopLoop('torn' + slot(d.f)); vfx2.tornado(slot(d.f), d.f, false, false); } } break;
    case 'ko': vfx2.stopAll(); audio.stopLoop('orb'); audio.stopLoop('torn0'); audio.stopLoop('torn1'); onKO(d.loser, d.winner); break;
  }
}

// ———————————————————— v10.1 观众投票大招：双方共用倒计时 → 子弹时间 4 秒投票 → 票多者放大招 ————————————————————
const AS = { on: false, t: 0, n: [0, 0], shown: [0, 0], crowd: [0, 0], rate: [0, 0], surge: [0, 0], side: -1, mine: 0, share: 0.5, done: false };
const vtEl = document.createElement('div'); vtEl.id = 'vote';
vtEl.innerHTML = `<div class="vt-glow"><i class="g0"></i><i class="g1"></i></div>
  <div class="vt-head"><div class="vt-title">VOTE NOW</div><div class="vt-sub"><i></i>谁来放大招<i></i></div>
  <div class="vt-clock"><b>5</b><i><s></s></i></div></div>
  <div class="vt-cards">${[0, 1].map((i) => `<div class="vt-card s${i}"><div class="vc-ava"><img alt=""></div><div class="vc-t"><div class="vc-pilot"><span></span><em>我</em></div><div class="vc-ult"></div></div></div>`).join('<div class="vt-vs">VS</div>')}</div>
  <div class="vt-arena">${[0, 1].map((i) => `<button class="vt-orb s${i}" data-s="${i}"><span class="vo-in"><b>TAP</b><em>0</em></span></button>`).join('')}</div>
  <div class="vt-tip">只能支持一边 · 狂点你支持的圈</div><div class="vt-result"></div>`;
app.appendChild(vtEl);
const VT = {
  clock: vtEl.querySelector('.vt-clock b'), bar: vtEl.querySelector('.vt-clock s'), tip: vtEl.querySelector('.vt-tip'), res: vtEl.querySelector('.vt-result'),
  orbs: [...vtEl.querySelectorAll('.vt-orb')], cards: [...vtEl.querySelectorAll('.vt-card')], arena: vtEl.querySelector('.vt-arena'),
  glow: [...vtEl.querySelectorAll('.vt-glow i')], gv: [0, 0],
};
// 结果公告直接挂在 #vote 根层：揭晓时标题 / 倒计时 / 选手卡退场，公告独占视觉中心
const hexA = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;
VT.orbs.forEach((o, i) => { o.style.setProperty('--vb', hexA(VOTE_COL[i], 0.9)); VT.glow[i].style.boxShadow = `inset 0 0 28px 6px ${hexA(VOTE_COL[i], 0.85)}, inset 0 0 120px 30px ${hexA(VOTE_COL[i], 0.32)}`; o.style.setProperty('--vc', VOTE_COL[i]); o.style.setProperty('--vi', VOTE_INK[i]); VT.cards[i].style.setProperty('--vc', VOTE_COL[i]); });
function fillVoteCards() {
  for (let i = 0; i < 2; i++) {
    const e = G.E[i], c = VT.cards[i]; if (!e) continue;
    c.querySelector('.vc-ava img').src = pilotThumb(e);
    c.querySelector('.vc-pilot span').textContent = pilotName(e);
    c.querySelector('.vc-pilot em').style.display = e.mine ? '' : 'none';
    c.querySelector('.vc-ult').textContent = `大招 · ${e.design.moves.ult}`;
  }
}
function startVote() {
  if (!G.sim || G.phase !== 'fight') { G.sim && G.sim.resolveVote(null); return; }
  Object.assign(AS, { on: true, t: 0, n: [0, 0], shown: [0, 0], crowd: [0, 0], side: -1, mine: 0, share: 0.5, done: false, win: null,
    rate: [14 + Math.random() * 20, 14 + Math.random() * 20], surge: [0, 0] });
  VT.gv = [0, 0]; VT.glow.forEach((g) => (g.style.opacity = 0));
  G.sim.paused = true; acc = 0;
  { const b = $('#banner'); if (b.classList.contains('show')) { b.classList.remove('show'); b.classList.add('hide'); bannerTimer = 0; } }
  document.body.classList.add('assisting');
  fillVoteCards();
  VT.orbs.forEach((o) => { o.classList.remove('pick', 'off', 'win', 'lose'); o.style.removeProperty('--d'); });
  VT.tip.textContent = '只能支持一边 · 狂点你支持的圈'; VT.res.textContent = ''; VT.res.className = 'vt-result';
  vtEl.className = 'on';
  layoutOrbs(0.5, true);
  director.setMode('fight');
  audio.play('riser', { vol: 0.7 }); audio.play('crowdCharge', { vol: 0.6 }); audio.play('braam', { vol: 0.6 }); audio.duckMusic(0.5, VOTE_DUR + 1);
  ticker('大招时刻！观众投票决定谁来放大招！');
}
// 两圈挤压：直径之和固定，按票数份额分配；圈心随分界点移动，彼此贴合
function layoutOrbs(share, snap) {
  const W = VT.arena.clientWidth || 380, H = VT.arena.clientHeight || 300;
  const total = Math.min(W * 1.02, H * 1.9), k = clamp(0.5 + (share - 0.5) * 1.6, 0.13, 0.87); // 份额差放大 1.6 倍，领先方挤压更明显
  const d0 = total * k, d1 = total - d0;
  VT.orbs[0].style.setProperty('--d', d0.toFixed(1) + 'px'); VT.orbs[1].style.setProperty('--d', d1.toFixed(1) + 'px');
  const x0 = (W - total) / 2; // 左圈左缘
  VT.orbs[0].style.setProperty('--x', (x0 + d0 / 2).toFixed(1) + 'px'); VT.orbs[1].style.setProperty('--x', (x0 + d0 + d1 / 2 - 4).toFixed(1) + 'px');
  VT.orbs[0].style.zIndex = d0 >= d1 ? 2 : 1; VT.orbs[1].style.zIndex = d1 > d0 ? 2 : 1;
  if (snap) VT.arena.classList.add('snap'); else VT.arena.classList.remove('snap');
}
function voteTap(i, ev) {
  if (!AS.on || AS.done) return;
  if (AS.side < 0) { AS.side = i; VT.orbs[i].classList.add('pick'); VT.orbs[1 - i].classList.add('off'); VT.tip.textContent = `你支持了 ${pilotName(G.E[i])} · 继续狂点！`; }
  if (i !== AS.side) { VT.orbs[i].classList.remove('deny'); void VT.orbs[i].offsetWidth; VT.orbs[i].classList.add('deny'); return; }
  AS.n[i] += 1; AS.mine++; AS.surge[i] = Math.min(1.5, AS.surge[i] + 0.18);
  AS.share = clamp(AS.share + (i ? -0.012 : 0.012), 0.05, 0.95); // 每次点击即时把己方往外顶一下
  const o = VT.orbs[i]; o.classList.remove('hit'); void o.offsetWidth; o.classList.add('hit');
  audio.tap(Math.min(1, AS.mine / 40));
  const r = app.getBoundingClientRect();
  // 白色波纹挂在投票圆内部（inset:0），圆心天然与投票圆重合，圆的位移 / 缩放过渡时也跟着走
  const ring = document.createElement('i'); ring.className = 'vt-ring'; o.appendChild(ring); setTimeout(() => ring.remove(), 520);
  const x = (ev ? ev.clientX - r.left : r.width * (i ? 0.75 : 0.25)), y = (ev ? ev.clientY - r.top : r.height * 0.62);
  const p = document.createElement('div'); p.className = 'vt-plus'; p.textContent = '+1'; p.style.cssText = `left:${x + (Math.random() - 0.5) * 24}px;top:${y - 10}px;--r:${((Math.random() - 0.5) * 16).toFixed(1)}deg`; app.appendChild(p); setTimeout(() => p.remove(), 650);
}
VT.orbs.forEach((o, i) => o.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); audio.unlock(); voteTap(i, ev); }));
function updateAssist(rdt) {
  if (!AS.on) return;
  AS.t += rdt;
  if (!AS.done) {
    // 模拟现场观众：各自基础热度 + 随机爆发 + 越到最后越疯狂；落后方偶尔反扑，保持拉锯
    const heat = 1 + AS.t * 0.5;
    for (let i = 0; i < 2; i++) {
      if (Math.random() < rdt * 0.9) AS.surge[i] = Math.min(1.5, AS.surge[i] + Math.random() * 0.9);
      AS.surge[i] = Math.max(0, AS.surge[i] - rdt * 0.8);
      const behind = AS.n[i] < AS.n[1 - i] * 0.8 ? 1.35 : 1;
      AS.crowd[i] += AS.rate[i] * heat * (1 + AS.surge[i]) * behind * rdt * (0.5 + Math.random());
      const c = Math.floor(AS.crowd[i]); if (c > 0) { AS.crowd[i] -= c; AS.n[i] += c; if (Math.random() < 0.35) { const o = VT.orbs[i]; o.classList.remove('ping'); void o.offsetWidth; o.classList.add('ping'); } }
      AS.shown[i] += (AS.n[i] - AS.shown[i]) * Math.min(1, rdt * 12);
      VT.orbs[i].querySelector('em').textContent = Math.round(AS.shown[i]);
    }
    const tgt = (AS.n[0] + 4) / (AS.n[0] + AS.n[1] + 8);
    AS.share += (tgt - AS.share) * Math.min(1, rdt * 6);
    layoutOrbs(AS.share);
    updateGlow(rdt);
    const left = Math.max(0, VOTE_DUR - AS.t);
    const sec = Math.ceil(left); if (VT.clock.textContent !== String(sec)) { VT.clock.textContent = sec; VT.clock.parentNode.classList.toggle('hot', sec <= 3); if (sec <= 3 && sec > 0) audio.play('block2', { vol: 0.45, rate: 1.6 }); }
    VT.bar.style.transform = `scaleX(${(left / VOTE_DUR).toFixed(3)})`;
    if (AS.t >= VOTE_DUR) finishVote();
  } else { updateGlow(rdt); if (AS.t >= AS.endT) endAssist(); }
  if (!G.sim || G.phase !== 'fight') endAssist(true);
}
// 边缘氛围光：颜色跟随优势方；票差越大越亮；持平无光；两色各自平滑淡入淡出（领先切换时交叉过渡，不突变）
function updateGlow(rdt) {
  const tot = AS.n[0] + AS.n[1], d = (AS.n[0] - AS.n[1]) / Math.max(12, tot);
  const lead = AS.done ? (AS.win === 0 ? 1 : -1) : Math.abs(d) < 0.04 ? 0 : d;
  for (let i = 0; i < 2; i++) {
    const tgt = clamp((i ? -lead : lead) * 3.2, 0, 1) * (lead ? 0.55 + 0.45 * Math.min(1, tot / 40) : 0);
    VT.gv[i] += (tgt - VT.gv[i]) * Math.min(1, rdt * 3.5);
    VT.glow[i].style.opacity = VT.gv[i].toFixed(3);
  }
}
function finishVote() {
  AS.done = true; AS.endT = AS.t + 0.9; // 结果公告只做「投票揭晓」0.9s 快闪；谁放什么大招交给随后的大招色带完整展示（1.6s），两者不再叠加
  if (AS.n[0] === AS.n[1]) AS.n[Math.random() < 0.5 ? 0 : 1]++;
  const w = AS.n[0] > AS.n[1] ? 0 : 1; AS.win = w;
  VT.orbs[w].classList.add('win'); VT.orbs[1 - w].classList.add('lose');
  // 揭晓：两圈保持投票结束瞬间的大小与位置，不再重新缩放
  VT.orbs.forEach((o, i) => (o.querySelector('em').textContent = AS.n[i]));
  VT.clock.textContent = '0';
  const e = G.E[w];
  VT.res.innerHTML = `<div class="vr-kicker">ULT GRANTED<i>获得大招</i></div>
    <div class="vr-plate"><div class="vr-ava"><img src="${pilotThumb(e)}" alt=""></div><div class="vr-t">
    <div class="vr-name">${pilotName(e)}${AS.side === w ? '<em>我支持的</em>' : ''}</div><div class="vr-ult">${e ? e.design.moves.ult : ''}</div></div></div>`;
  VT.res.style.setProperty('--vc', VOTE_COL[w]); VT.res.className = 'vt-result show s' + w;
  vtEl.className = 'on reveal'; // 标题 / 倒计时 / 选手卡 / 提示退场，给公告让位
  audio.play('cinhit', { vol: 0.8, force: true }); audio.play(AS.side < 0 || AS.side === w ? 'cheer1' : 'boo', { vol: 0.6 });
}
function endAssist(abort) {
  if (!AS.on) return; AS.on = false; document.body.classList.remove('assisting');
  vtEl.className = 'release'; setTimeout(() => { if (!AS.on) vtEl.className = ''; }, 260);
  if (!G.sim) return;
  G.sim.paused = false;
  if (abort || AS.win == null) { G.sim.resolveVote(null); return; }
  const f = G.F[AS.win], tot = AS.n[0] + AS.n[1], share = AS.n[AS.win] / Math.max(1, tot);
  const boost = 1 + Math.min(0.6, share * 0.6 + tot / 2000); // 得票越多 / 越碾压，大招越痛（最高 +60%）
  AS.boost = boost; G.sim.resolveVote(f, boost);
  ticker(`全场 ${tot} 票！${pilotName(G.E[AS.win])} 以 ${Math.round(share * 100)}% 拿下大招，威力 +${Math.round((boost - 1) * 100)}%！`);
}

// ———————————————————— 表现辅助 ————————————————————
// v10.1 连击计数：场边大号 N HITS，3 连起显示，停手 1s 淡出（左右各一方，不挡机甲）
const comboEls = [0, 1].map((i) => { const el = document.createElement('div'); el.className = 'combo c' + i; el.innerHTML = '<b></b><span>HITS</span>'; app.appendChild(el); return { el, b: el.querySelector('b'), t: 0 }; });
function comboHud(i, n) {
  const c = comboEls[i]; if (n < 3) return;
  c.b.textContent = n; c.el.style.setProperty('--k', Math.min(1, (n - 3) / 9).toFixed(2));
  c.el.classList.remove('pop'); void c.el.offsetWidth; c.el.classList.add('show', 'pop');
  clearTimeout(c.t); c.t = setTimeout(() => c.el.classList.remove('show'), 1100);
}
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
  const c = $('#introCard'); const col = VOTE_COL[i]; // 出场介绍卡跟随阵营色（= 血槽 / 名牌 / 投票圈）
  c.style.setProperty('--ic', col); c.className = i ? 'b' : 'a';
  const champTag = i === 0 ? (G.champStreak > 0 ? `擂主 · ${G.champStreak} 连胜` : '擂主') : '新挑战者';
  c.innerHTML = `<div class="ic-ava"><img src="${e.thumb || thumbs[e.ava] || ''}" alt=""></div><div class="ic-main"><div class="ic-top"><span class="ic-tag">${champTag}</span><span class="ic-owner"><small>创造者</small>${AVATARS[e.ava]?.name || e.owner}${e.mine ? '（我）' : ''}</span></div><div class="ic-name">${e.design.name}</div><div class="ic-role">${e.design.formCn || '人形'} · ${e.design.roleCn} · 大招「${e.design.moves.ult}」</div></div>`;
  void c.offsetWidth; c.classList.add('show'); $('#bottom').classList.add('intro');
  audio.play('baydoor', { vol: 0.55 }); audio.play('hydr', { vol: 0.5, delay: 0.15 }); audio.play('crowdCharge', { vol: 0.35, delay: 0.3 });
}
function hideIntroCard() { $('#introCard').classList.remove('show'); $('#bottom').classList.remove('intro'); }
function pilotName(e) { return e ? (AVATARS[e.ava]?.name || e.owner || '') : ''; }
function pilotThumb(e) { return e ? (thumbs[e.ava] || e.thumb || '') : ''; }
function ultCut(name, e, side = -1) {
  const u = $('#ultcut'); u.className = side >= 0 ? 'v' + side : ''; // 投票模式：条幅底色跟随获胜方的投票色（黄绿 / 粉）
  u.querySelector('.uc-name').textContent = name;
  u.querySelector('.uc-owner').innerHTML = e ? `<b>${pilotName(e)}${e.mine ? '（我）' : ''}</b> 的「${e.design.name}」` : '';
  u.querySelector('.uc-ava img').src = pilotThumb(e); u.style.setProperty('--uc', side >= 0 ? VOTE_COL[side] : e ? e.design.palette.emissive : '#fff');
  u.classList.remove('show'); void u.offsetWidth; u.classList.add('show');
  document.body.classList.add('ulting'); clearTimeout(ultCut.t); ultCut.t = setTimeout(() => document.body.classList.remove('ulting'), 1650);
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
// 场上名牌：跟随机甲头顶的轻量标签（只显示驾驶分身名字，半透明，不抢画面）
const ntags = [0, 1].map((i) => {
  const el = document.createElement('div'); el.className = 'ntag ' + (i ? 'b' : 'a');
  el.innerHTML = '<span class="nt-in"><b></b><em></em></span>';
  app.insertBefore(el, $('#hud'));
  return { el, b: el.querySelector('b'), em: el.querySelector('em'), x: -1, y: -1, on: false };
});
const _ntV = new THREE.Vector3();
function setupTags() {
  for (let i = 0; i < 2; i++) {
    const e = G.E[i], t = ntags[i]; if (!e) continue;
    t.b.textContent = pilotName(e); t.em.textContent = e.mine ? '我' : ''; t.em.style.display = e.mine ? '' : 'none';
    t.el.style.setProperty('--c', VOTE_COL[i]); t.x = -1; // 名牌阵营色 = 血槽色 = 投票圈色（左黄绿 / 右粉）
  }
}
function updateTags(rdt) {
  const W = app.clientWidth, H = app.clientHeight;
  const show = G.phase === 'fight' || G.phase === 'intro' && G.t > 1.2;
  const pos = [];
  for (let i = 0; i < 2; i++) {
    const t = ntags[i], f = G.F[i], v = G.V[i];
    let vis = show && f && f.alive && v && v.root.parent;
    let hot = false;
    if (vis && AS.on) vis = false; // 子弹时间里由助力面板的头像+名字说明对象，名牌让位
    if (vis) {
      const r = v.root.position; _ntV.set(r.x, Math.max(0, r.y) - 0.1, r.z).project(camera); // 脚下地面位置
      let x = (_ntV.x + 1) / 2 * W, y = (1 - _ntV.y) / 2 * H;
      if (_ntV.z > 1 || x < -20 || x > W + 20 || y < 100 || y > H + 60) vis = false; // 出画就隐藏
      else {
        x = clamp(x, 44, W - 44); y = Math.min(y, H - 150); // 脚部被底栏遮住时贴在底栏上沿，仍在机身下部，不挡脸
        if (t.x < 0) { t.x = x; t.y = y; } else { const k = Math.min(1, rdt * 16); t.x += (x - t.x) * k; t.y += (y - t.y) * k; }
        pos[i] = t;
      }
    }
    if (vis !== t.on) { t.on = vis; t.el.classList.toggle('on', vis); }
    t.el.classList.toggle('hot', hot);
  }
  // 两个名牌重叠时上下错开
  let oy = [0, 0];
  if (pos[0] && pos[1] && Math.abs(pos[0].x - pos[1].x) < 96 && Math.abs(pos[0].y - pos[1].y) < 24) { const dn = pos[0].y < pos[1].y ? 1 : 0; oy[dn] = 24 - Math.abs(pos[0].y - pos[1].y); }
  for (let i = 0; i < 2; i++) { const t = ntags[i]; if (t.on) t.el.style.transform = `translate3d(${t.x.toFixed(1)}px, ${(t.y + oy[i]).toFixed(1)}px, 0)`; }
}
function setupHud() {
  setupTags();
  for (let i = 0; i < 2; i++) {
    const e = G.E[i], h = hud[i];
    h.ava.src = e.thumb || thumbs[e.ava] || '';
    h.name.innerHTML = `<b>${AVATARS[e.ava]?.name || e.owner}</b><i>·</i>${e.design.name}`;
    h.sub.textContent = `大招 · ${e.design.moves.ult}`;
    h.lagV = 1; h.ava.parentElement.style.setProperty('--qc', VOTE_COL[i]);
  }
  $('#round').textContent = `ROUND ${G.round}`;
}
const UK = { el: $('#ultClock'), s: $('#ultClock s'), b: $('#ultClock b'), txt: '' };
function updateHud(dt) {
  for (let i = 0; i < 2; i++) {
    const f = G.F[i], h = hud[i]; if (!f) continue;
    const r = clamp(f.hp / f.maxHp, 0, 1);
    if (r !== h.last) { h.fill.style.transform = `scaleX(${r})`; h.fill.classList.toggle('low', r < 0.25); h.num.textContent = `${Math.ceil(Math.max(0, f.hp))}`; h.last = r; }
    if (h.lagV > r) { h.lagV = Math.max(r, h.lagV - dt * 0.35); h.lag.style.transform = `scaleX(${h.lagV})`; } else if (h.lagV < r) { h.lagV = r; h.lag.style.transform = `scaleX(${r})`; }
    const en = f.energy / 100; h.en.style.width = `${en * 100}%`; h.en.classList.toggle('full', en >= 1);
  }
  $('#timer').textContent = String(Math.max(0, Math.ceil(G.clock)));
  // 大招倒计时：双方共用，斜切条从满到空，最后 3 秒变热并闪烁
  if (G.sim && G.sim.voteMode) {
    const S = G.sim, live = G.phase === 'fight' || G.phase === 'intro';
    const L = S.voteOpen || AS.on ? 0 : S.ultClock;
    const busy = !AS.on && !S.voteOpen && G.F.some((f) => f && (f.forceUlt || f.act && f.act.type.startsWith('ult_')));
    const txt = AS.on || S.voteOpen ? 'VOTE' : busy ? 'ULT!' : String(Math.ceil(L));
    if (UK.txt !== txt) { UK.txt = txt; UK.b.textContent = txt; }
    const k = busy ? 0 : clamp(L / (S.ultPeriod || 1), 0, 1);
    UK.s.style.transform = `scaleX(${(1 - k).toFixed(3)})`;
    UK.el.classList.toggle('hot', !busy && L <= 3 || AS.on); UK.el.classList.toggle('show', live); UK.el.classList.toggle('yield', AS.on || S.voteOpen || busy); // 投票面板有自己的 4 秒倒计时：顶部条上收让位，结束后回落
  }
}
function swatch(p) { return [p.primary, p.secondary, p.accent, p.emissive].map((c) => `<i style="background:${c}"></i>`).join(''); }
function renderQueue() {
  const q = $('#queue'); q.innerHTML = '';
  queue.forEach((e, i) => {
    const d = document.createElement('div'); d.className = 'qi' + (e.mine ? ' mine' : '') + (i === 0 ? ' next' : '');
    d.style.setProperty('--qc', e.design.palette.emissive); d.style.animationDelay = `${i * 0.04}s`;
    d.innerHTML = `<div class="qimg"><img src="${e.thumb || thumbs[e.ava] || ''}" alt=""></div><div class="qn">${i === 0 ? '' : `<i>${i + 1}</i>`}${AVATARS[e.ava]?.name || e.owner}</div>`;
    q.appendChild(d);
  });
  $('#qCount').textContent = queue.length;
}
function renderRoster() {
  const list = $('#rosterList');
  const arr = [...roster].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  list.innerHTML = arr.map((e, i) => `<div class="rr${e.mine ? ' mine' : ''}"><div class="rk">${i + 1}</div><img class="mt" src="${e.thumb || thumbs[e.ava] || ''}" alt=""><div class="rm"><div class="rn">${AVATARS[e.ava]?.name || e.owner}${e.mine ? '<em class="me">我</em>' : ''}</div><div class="rs">${e.design.name} · ${e.design.formCn || ''}${e.design.roleCn} · 最高 ${e.best} 连胜</div></div><div class="rw">${e.wins}<small>${e.losses} 负</small></div></div>`).join('');
}
$('#btnRoster').onclick = () => { renderRoster(); $('#roster').classList.remove('hidden'); audio.play('servo1', { vol: 0.4 }); };
$('#btnSound').onclick = () => { audio.unlock(); audio.setMuted(!audio.muted); $('#btnSound').innerHTML = audio.muted ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'; $('#btnSound').classList.toggle('off', audio.muted); if (!audio.muted) audio.startMusic(); };
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { b.closest('.sheet').classList.add('hidden'); if (b.closest('#create')) closePreview(); }));

// ———————————————————— UGC 创造 ————————————————————
const pv = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 1, 0.1, 100), view: null, design: null, rot: 0, on: false, genT: 0 };
{
  // 预览光照对齐擂台实际灯光（所见即所得）：半球 + 暖白主光 + 玫红/黄绿轮廓 + 冷补光 + 舞台彩色顶灯轻染色
  pv.scene.add(new THREE.HemisphereLight(0x8fa6ff, 0x1a1020, 0.55));
  const k = new THREE.DirectionalLight(0xfff1e0, 2.3); k.position.set(6, 22, 9); pv.scene.add(k);
  const r1 = new THREE.DirectionalLight(0xf569a8, 0.9); r1.position.set(-14, 7, -10); pv.scene.add(r1);
  const r2 = new THREE.DirectionalLight(0xdeff72, 0.9); r2.position.set(14, 6, -8); pv.scene.add(r2);
  const fl = new THREE.DirectionalLight(0x9aa8ff, 0.5); fl.position.set(0, 5, 18); pv.scene.add(fl);
  [[0xf569a8, -1], [0xdeff72, 1], [0x7fe5cd, 0]].forEach(([c, kx]) => { const L = new THREE.DirectionalLight(c, 0.35); L.position.set(kx * 5, 14, -4); pv.scene.add(L); });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.18, 48), new THREE.MeshStandardMaterial({ color: 0x141826, metalness: 0.7, roughness: 0.35 }));
  disc.position.y = -0.09; pv.scene.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.03, 6, 64), new THREE.MeshBasicMaterial({ color: 0xdeff72, transparent: true, opacity: 0.45 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; pv.scene.add(ring); pv.ring = ring;
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
$('#btnCreate').onclick = () => { audio.unlock(); audio.play('baydoor', { vol: 0.35 }); openCreate(); }; // v10.1：不再首次弹选分身页，直接进创造页
$('#refFile').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const url = URL.createObjectURL(f); const img = $('#refImg'); img.src = url; img.classList.add('on'); $('#refNote').classList.remove('hidden');
};
$('#btnGen').onclick = () => generate();
// 🎲 随机：每次体型都和上一台不同（近 3 台尽量不重复）；手输 prompt 生成不受影响，仍按关键词匹配
const randHist = [];
$('#btnRand').onclick = () => {
  const recent = randHist.slice(-3); const last = randHist[randHist.length - 1] || (pv.design && pv.design.form);
  let pool = FORM_LIST.filter((f) => !recent.includes(f) && f !== last); if (!pool.length) pool = FORM_LIST.filter((f) => f !== last);
  const form = pool[Math.floor(Math.random() * pool.length)]; randHist.push(form);
  $('#prompt').value = randomPrompt(); generate({ form });
};
$('#prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); generate(); } });
function generate(gopt) {
  let prompt = $('#prompt').value.trim();
  if (!prompt) { prompt = randomPrompt(); $('#prompt').value = prompt; }
  audio.unlock(); audio.play('morph', { vol: 0.5 }); audio.play('servo2', { vol: 0.4, delay: 0.3 });
  $('#previewBox').classList.add('show'); statsPending(); $('#genFx').classList.add('on'); $('#previewHint').classList.add('hidden');
  $('#btnJoin').disabled = true; $('#btnGen').disabled = true;
  if (pv.view) { pv.scene.remove(pv.view.root); pv.view.dispose(); pv.view = null; }
  // 连点「随机 / 换一个」：只认最后一次点击，加新模型前先销毁当前模型，避免堆叠
  const tk = pv.tok = (pv.tok || 0) + 1;
  setTimeout(async () => {
    if (tk !== pv.tok) return;
    if (pv.view) { pv.scene.remove(pv.view.root); pv.view.dispose(); pv.view = null; }
    const d = generateDesign(prompt, '我', gopt && gopt.form ? { form: gopt.form } : undefined);
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
  pvR.toneMapping = THREE.ACESFilmicToneMapping; pvR.toneMappingExposure = 0.98; pvR.outputColorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(pvR);
  import('three/examples/jsm/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => { pv.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pv.scene.environmentIntensity = 0.55; });
  return pvR;
}
function renderPreview(dt) {
  if (!pv.on || !pv.view) return;
  const R = ensurePreviewRenderer();
  const box = $('#previewBox'); const w = box.clientWidth, h = box.clientHeight; if (w < 10) return;
  const c = R.domElement; if (c.width !== Math.round(w * R.getPixelRatio()) || c.height !== Math.round(h * R.getPixelRatio())) R.setSize(w, h, false);
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
  let dt = rdt * G.timeScale;
  if (G.hitstop > 0) { G.hitstop -= rdt; dt *= 0.06; } // v10.1 顿帧：近战命中瞬间短暂定格，打击更“实”
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
      if (p.kind === 'disc') { vfx2.discCatch(p.x, p.y, p.z, views.get(p.owner)?.fxCol || [1, 0.6, 0.8]); continue; }
      if (p.kind === 'mortar') { vfx2.mortarBoom(p.x, p.z, views.get(p.owner)?.fxCol); audio.play('expL', { vol: 0.75, cd: 0.06 }); director.shake(0.55); continue; }
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
  if (bloom) bloom.strength = 0.28 + (G.timeScale < 0.6 ? 0.14 : 0);
  if (G.phase !== 'boot') { updateHud(rdt); updateTags(rdt); }
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
