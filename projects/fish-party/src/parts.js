// 派对基因 v1.0：代码生成的搞怪部件库（20 种 extras）+ 9 种特殊材质 shader + 描边 + 野生鱼派对基因
// - 部件：基于 ugc.findAnchors 的锚点 + 额外射线（鼻尖/肚皮/背脊/体表随机点），自动贴合 20 种体型
// - 几何/材质全部模块级共享（低面数），Fish.dispose 通过 userData.shared 跳过
// - 材质：注入到已风格化（toon）+ 花纹（ugc）的 MeshStandardMaterial 上，链式 onBeforeCompile；所有输出带 NaN/过曝安全钳
import * as THREE from 'three';
import { rng, findAnchors } from './ugc.js';

// ---------------- 部件 / 材质目录 ----------------
export const EXTRAS = {
  wings: { label: '翅膀', emoji: '🪽', slot: 'back' },
  flame: { label: '背火', emoji: '🔥', slot: 'back' },
  horn: { label: '独角', emoji: '🦄', slot: 'head' },
  catEars: { label: '猫耳', emoji: '🐱', slot: 'head' },
  whiskers: { label: '猫胡须', emoji: '〰️', slot: 'face' },
  propeller: { label: '螺旋桨帽', emoji: '🚁', slot: 'head' },
  gear: { label: '齿轮发条', emoji: '⚙️', slot: 'side' },
  crystalSpikes: { label: '水晶刺', emoji: '💎', slot: 'back' },
  jellyTentacles: { label: '果冻触须', emoji: '🪼', slot: 'belly' },
  legs: { label: '小短腿', emoji: '🦵', slot: 'belly' },
  lightbulb: { label: '深海灯笼', emoji: '💡', slot: 'head' },
  flowers: { label: '开花', emoji: '🌸', slot: 'skin' },
  candles: { label: '生日蜡烛', emoji: '🕯️', slot: 'back' },
  mustache: { label: '八字胡', emoji: '🥸', slot: 'face' },
  starTail: { label: '星星尾巴', emoji: '⭐', slot: 'tail' },
  bubbleHelmet: { label: '宇航头盔', emoji: '🧑‍🚀', slot: 'helmet' },
  extraEyes: { label: '多眼', emoji: '👀', slot: 'head2' },
  spots3d: { label: '立体波点', emoji: '🔴', slot: 'skin' },
  antlers: { label: '鹿角', emoji: '🦌', slot: 'head' },
  mohawk: { label: '朋克鸡冠', emoji: '🤘', slot: 'crest' },
};
export const EXTRA_IDS = Object.keys(EXTRAS);
export const MATS = {
  jelly: { label: '果冻', emoji: '🫧', k: 1 }, candy: { label: '糖果', emoji: '🍬', k: 2 }, chrome: { label: '机械铬', emoji: '🤖', k: 3 },
  plush: { label: '毛绒', emoji: '🧸', k: 4 }, crystal: { label: '水晶', emoji: '💎', k: 5 }, galaxy: { label: '星空', emoji: '🌌', k: 6 },
  gold: { label: '黄金', emoji: '🏆', k: 7 }, holo: { label: '镭射', emoji: '🌈', k: 8 }, lava: { label: '岩浆', emoji: '🌋', k: 9 },
};
export const MAT_IDS = Object.keys(MATS);
// 不适合的组合（物种本身就有腿/头太宽/没有正常的脸）
const NO_EXTRA = {
  legs: ['octopus', 'king-crab', 'snow-crab', 'lobster', 'squid', 'starfish', 'jellyfish', 'mantis-shrimp', 'sea-turtle', 'seahorse'],
  jellyTentacles: ['octopus', 'squid', 'king-crab', 'snow-crab', 'jellyfish', 'starfish', 'mantis-shrimp'],
  bubbleHelmet: ['hammerhead', 'manta-ray', 'king-crab', 'snow-crab', 'oarfish', 'starfish', 'jellyfish', 'flounder', 'whale-shark', 'narwhal', 'moray-eel'],
  whiskers: ['king-crab', 'snow-crab', 'starfish', 'jellyfish'], mustache: ['king-crab', 'snow-crab', 'manta-ray', 'starfish', 'jellyfish'],
  starTail: ['king-crab', 'snow-crab', 'octopus', 'starfish', 'jellyfish', 'seahorse'],
};
export const extraOk = (id, spId) => !!EXTRAS[id] && !(NO_EXTRA[id] || []).includes(spId);

export function defaultGx() { return { scale: 1, stretch: [1, 1, 1], eyes: 2, eyeK: 1, mat: null, glow: 0, palette: null, pattern: null, extras: [], parts: { tail: null, fins: null, head: null } }; }
export function normGx(gx) {
  const d = defaultGx(); if (!gx) return d;
  const o = { ...d, ...gx, parts: { ...d.parts, ...(gx.parts || {}) } };
  o.stretch = Array.isArray(gx.stretch) && gx.stretch.length === 3 ? gx.stretch.map((x) => THREE.MathUtils.clamp(+x || 1, 0.5, 2)) : [1, 1, 1];
  o.eyes = THREE.MathUtils.clamp(Math.round(+o.eyes || 2), 1, 5); o.eyeK = THREE.MathUtils.clamp(+o.eyeK || 1, 0.5, 2.2);
  o.glow = THREE.MathUtils.clamp(+o.glow || 0, 0, 1); o.scale = THREE.MathUtils.clamp(+o.scale || 1, 0.3, 3);
  o.extras = (gx.extras || []).filter((k) => EXTRAS[k]);
  if (o.mat && !MATS[o.mat]) o.mat = null;
  return o;
}

// ---------------- 野生鱼派对基因（§5） ----------------
const MAT_W = { jelly: 3, candy: 3, plush: 3, chrome: 2, crystal: 2, lava: 1.5, holo: 1, galaxy: 1, gold: 0.8 };
function pickW(r, obj) { let s = 0; for (const k in obj) s += obj[k]; let x = r() * s; for (const k in obj) { x -= obj[k]; if (x <= 0) return k; } return Object.keys(obj)[0]; }
export function wildGx(spId, r = Math.random) {
  const gx = defaultGx();
  gx.eyeK = +(1.2 + r() * 0.4).toFixed(2);
  const mode = r();
  const j = () => 0.94 + r() * 0.12;
  if (mode < 0.33) gx.stretch = [0.85 + r() * 0.1, 1.1 + r() * 0.15, 1.05 + r() * 0.15];        // 圆滚滚
  else if (mode < 0.6) gx.stretch = [1.1 + r() * 0.15, 0.85 + r() * 0.1, 0.9 + r() * 0.08];      // 细长条
  else gx.stretch = [j(), j(), j()];
  if (spId === 'oarfish') gx.stretch[0] = Math.min(gx.stretch[0], 1.0);
  gx.stretch = gx.stretch.map((x) => +x.toFixed(2));
  if (r() < 0.15) gx.mat = pickW(r, MAT_W);
  if (r() < 0.35) { const pool = EXTRA_IDS.filter((k) => extraOk(k, spId)); gx.extras = [pool[Math.floor(r() * pool.length) % pool.length]]; }
  if (r() < 0.06) gx.eyes = r() < 0.5 ? 1 : 3;
  return gx;
}

// 搞怪显示名：「戴墨镜的螺旋桨河豚」「果冻·三眼小丑鱼」
const EXTRA_ADJ = {
  wings: ['长翅膀的', '会飞的', '天使'], flame: ['着火的', '燃烧吧', '火背'], horn: ['独角', '独角兽'], catEars: ['猫耳', '喵喵'], whiskers: ['有胡须的', '喵系'],
  propeller: ['螺旋桨', '会起飞的'], gear: ['发条', '机械'], crystalSpikes: ['水晶刺', '亮晶晶的'], jellyTentacles: ['水母系', '飘飘'], legs: ['长腿的', '会走路的', '飞毛腿'],
  lightbulb: ['提灯', '自带灯泡的'], flowers: ['开花的', '花花'], candles: ['过生日的', '蛋糕'], mustache: ['留胡子的', '绅士'], starTail: ['星星尾', '许愿'],
  bubbleHelmet: ['宇航员', '太空'], extraEyes: ['多眼', '眼睛很多的'], spots3d: ['波点', '起疙瘩的'], antlers: ['鹿角', '圣诞'], mohawk: ['朋克', '莫西干'],
};
const MAT_ADJ = { jelly: '果冻', candy: '糖果', chrome: '铁皮', plush: '毛绒', crystal: '水晶', galaxy: '星空', gold: '黄金', holo: '镭射', lava: '岩浆' };
const DECO_ADJ = { shades: '戴墨镜的', tophat: '戴礼帽的', crown: '戴皇冠的', party: '戴派对帽的', bow: '扎蝴蝶结的', flower: '别小花的', antenna: '顶小灯的', halo: '有光环的', scarf: '围围巾的', wreath: '戴花环的', backpack: '背书包的', sticker: '贴贴纸的', bubbles: '吐泡泡的' };
const FUN_ADJ = ['元气', '害羞的', '摇滚', '迷糊', '社恐', '睡不醒的', '超级', '想当网红的', '周末限定', '很能吃的', '酷酷的', '爱唱歌的', '暴躁', '温柔', '神秘', '嘴硬的', '戏精', '芝士', '冲浪', '蹦迪'];
const EYE_ADJ = { 1: '独眼', 3: '三眼', 4: '四眼', 5: '五眼' };
export function funnyName(spName, gx, decos = [], r = Math.random, mut = null) {
  const pk = (a) => a[Math.floor(r() * a.length) % a.length];
  const ex = (gx?.extras || []).filter((k) => EXTRA_ADJ[k]);
  const deco = (decos || []).find((d) => DECO_ADJ[d]);
  let core = '';
  if (ex.length) core = pk(EXTRA_ADJ[ex[ex.length - 1]]);
  const eye = EYE_ADJ[gx?.eyes] || '';
  let name = `${eye}${core}${spName}`;
  if (deco && name.length < 9) name = DECO_ADJ[deco] + name;
  if (gx?.mat) name = `${MAT_ADJ[gx.mat]}·${name}`;
  if (!ex.length && !gx?.mat && !deco && !eye) name = pk(FUN_ADJ) + name;
  if (mut && mut.includes('giant')) name = '巨型' + name;
  return name;
}

// ---------------- 共享几何 / 材质 ----------------
export const MAT_TIME = { value: 0 };
const GEO = {};
const shared = (o) => { o.userData.shared = true; return o; };
const geo = (k, f) => GEO[k] || (GEO[k] = shared(f()));
const MC = new Map();
// v3 柔和配色（猛兽派对）：所有部件颜色统一降饱和、略提亮，发光色同样处理 —— 不再荧光
const _mh = { h: 0, s: 0, l: 0 };
export function muteColor(c, k = 0.62) {
  const col = new THREE.Color(c); col.getHSL(_mh);
  col.setHSL(_mh.h, _mh.s * k, THREE.MathUtils.clamp(_mh.l * 0.92 + 0.06, 0, 0.92));
  return col;
}
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = MC.get(key);
  if (!m) {
    const oo = { ...o }; if (oo.emissive) oo.emissive = muteColor(oo.emissive, 0.55);
    if (oo.emissiveIntensity) oo.emissiveIntensity *= 0.7;
    m = shared(new THREE.MeshStandardMaterial({ color: muteColor(color), roughness: 0.5, metalness: 0, ...oo })); MC.set(key, m);
  }
  return m;
}
const emi = (c, k = 0.9) => mat(c, { emissive: c, emissiveIntensity: k, roughness: 0.4 });
const SPH = () => geo('sph', () => new THREE.SphereGeometry(1, 16, 12));
const SPH_LO = () => geo('sphLo', () => new THREE.SphereGeometry(1, 10, 8));
const HEMI = () => geo('hemi', () => new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2));
const CYL = () => geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 12));
const CONE = () => geo('cone', () => new THREE.ConeGeometry(1, 1, 12));
const DROP = () => geo('drop', () => { const pts = [[0, 0], [0.3, 0.06], [0.42, 0.22], [0.38, 0.45], [0.22, 0.72], [0.08, 0.92], [0, 1.05]].map(([x, y]) => new THREE.Vector2(x, y)); return new THREE.LatheGeometry(pts, 10); });

// 描边：背面外扩（view 空间，近处有世界上限，远处按屏幕比例）
export const OUTLINE_COLOR = '#2b1d4e';
const OUTLINE_MAT = shared(new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }));
OUTLINE_MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uOW = OUTLINE_W;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uOW;')
    .replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
      vec3 onv = normalMatrix * normal; float onl = length(onv); onv = onl > 1e-5 ? onv / onl : vec3(0.0);
      mvPosition.xyz += onv * min(uOW.x * max(-mvPosition.z, 0.0), uOW.y);
      gl_Position = projectionMatrix * mvPosition;`);
};
OUTLINE_MAT.customProgramCacheKey = () => 'gx-outline1';
export const OUTLINE_W = { value: new THREE.Vector2(0.0042, 0.02) };   // x: 屏幕比例  y: 世界上限（米）
export function addOutline(mesh, k = 1) {
  if (!mesh.isMesh || mesh.userData.outline || mesh.material?.transparent) return null;
  const o = new THREE.Mesh(mesh.geometry, OUTLINE_MAT);
  o.userData.outline = true; o.userData.sharedGeo = true; o.name = 'outline'; o.castShadow = false; o.raycast = () => {};
  if (k !== 1) o.scale.setScalar(k);
  mesh.add(o); return o;
}

// ---------------- 锚点（ugc.findAnchors + 额外射线） ----------------
const CORE = /body|mantle|head|carapace|shell|face|segment|cephalofoil/;
const rc = new THREE.Raycaster();
const _o = new THREE.Vector3(), _dv = new THREE.Vector3();
export function anchorsPlus(fish) {
  const A = findAnchors(fish);
  const b = fish.b0, core = [], all = [];
  fish.model.traverse((o) => { if (o.isMesh && !o.userData.outline && o.visible) { all.push(o); if (CORE.test(o.name) && !/fin|eye|stripe/.test(o.name)) core.push(o); } });
  const T = core.length ? core : all;
  const ray = (o, d, list = T) => { rc.set(_o.copy(o), _dv.copy(d).normalize()); rc.far = 20; const h = rc.intersectObjects(list, false); return h.length ? h[0] : null; };
  const nrm = (h) => h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
  A.ray = ray; A.nrm = nrm;
  const cb = new THREE.Box3(); T.forEach((o) => cb.expandByObject(o)); A.cb = cb;
  // 头部中心 / 底部
  const hb = ray(new THREE.Vector3(A.headTop.x, b.min.y - 2, 0), new THREE.Vector3(0, 1, 0));
  A.headBot = hb ? hb.point.clone() : new THREE.Vector3(A.headTop.x, b.min.y, 0);
  A.headC = A.headTop.clone().lerp(A.headBot, 0.5);
  const hs = ray(new THREE.Vector3(A.headTop.x, A.headC.y, b.max.z + 2), new THREE.Vector3(0, 0, -1));
  A.headW = hs ? Math.abs(hs.point.z) : A.th * 0.4;
  // 鼻尖（嘴部高度略低于头中心）
  const ny = THREE.MathUtils.lerp(A.headC.y, A.headBot.y, 0.25);
  const nh = ray(new THREE.Vector3(b.max.x + 2, ny, 0), new THREE.Vector3(-1, 0, 0));
  A.nose = nh ? nh.point.clone() : new THREE.Vector3(cb.max.x, ny, 0);
  // 肚皮
  const bx = THREE.MathUtils.lerp(cb.min.x, cb.max.x, 0.5);
  const bh = ray(new THREE.Vector3(bx, b.min.y - 2, 0), new THREE.Vector3(0, 1, 0));
  A.belly = bh ? bh.point.clone() : new THREE.Vector3(bx, cb.min.y, 0);
  // 背脊点（沿 x 取 u∈[0,1]）
  A.backAt = (u) => { const x = THREE.MathUtils.lerp(cb.min.x, cb.max.x, u); const h = ray(new THREE.Vector3(x, b.max.y + 2, 0), new THREE.Vector3(0, -1, 0)); return h ? { p: h.point.clone(), n: nrm(h) } : { p: new THREE.Vector3(x, cb.max.y, 0), n: new THREE.Vector3(0, 1, 0) }; };
  A.bellyAt = (u, z = 0) => { const x = THREE.MathUtils.lerp(cb.min.x, cb.max.x, u); const h = ray(new THREE.Vector3(x, b.min.y - 2, z), new THREE.Vector3(0, 1, 0)); return h ? h.point.clone() : new THREE.Vector3(x, cb.min.y, z); };
  // 体表随机点（从侧上方射向身体轴）
  A.surf = (r, upOnly = true) => {
    for (let i = 0; i < 6; i++) {
      const u = 0.15 + r() * 0.7, x = THREE.MathUtils.lerp(cb.min.x, cb.max.x, u);
      const a = (upOnly ? 0.15 + r() * 0.75 : r() * 2) * Math.PI * (r() < 0.5 ? 1 : -1) * (upOnly ? 0.5 : 1);
      const d = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
      const c = new THREE.Vector3(x, (cb.min.y + cb.max.y) / 2, 0);
      const h = ray(c.clone().addScaledVector(d, 3), d.clone().negate());
      if (h) return { p: h.point.clone(), n: nrm(h) };
    }
    return null;
  };
  // 尾巴末端：有尾巴部件就用它的包围盒最左
  const tailNode = fish.model.userData.parts?.tail;
  if (tailNode && tailNode.visible) { const tb = new THREE.Box3().setFromObject(tailNode); A.tailTip = new THREE.Vector3(tb.min.x, (tb.min.y + tb.max.y) / 2, 0); A.tailH = tb.max.y - tb.min.y; }
  else { A.tailTip = new THREE.Vector3(b.min.x, (cb.min.y + cb.max.y) / 2, 0); A.tailH = A.th * 0.6; }
  if (fish.model.userData.graftTail) { const tb = new THREE.Box3().setFromObject(fish.model.userData.graftTail); A.tailTip.set(tb.min.x, (tb.min.y + tb.max.y) / 2, 0); A.tailH = tb.max.y - tb.min.y; }
  return A;
}

// 让 group 的 +Y 朝向法线 n
const _up = new THREE.Vector3(0, 1, 0);
function alignUp(g, n) { g.quaternion.setFromUnitVectors(_up, n.clone().normalize()); }
function tube(pts, r, m, seg = 14, rad = 6) { return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad), m); }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
function mesh(g, m, parent, pos, scl, rot) { const o = new THREE.Mesh(g, m); if (pos) o.position.set(...pos); if (scl) (typeof scl === 'number' ? o.scale.setScalar(scl) : o.scale.set(...scl)); if (rot) o.rotation.set(...rot); parent.add(o); return o; }

// 卡通眼（多眼 / 独眼共用）：白 + 黑瞳 + 高光
export function cartoonEye(R, pupilC = '#1d1530') {
  const g = new THREE.Group();
  mesh(SPH(), mat('#ffffff', { roughness: 0.3 }), g, null, R);
  const pu = new THREE.Group(); g.add(pu);
  mesh(SPH(), mat(pupilC, { roughness: 0.25 }), pu, [0, 0, R * 0.62], [R * 0.58, R * 0.62, R * 0.45]);
  mesh(SPH_LO(), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.4 }), pu, [R * 0.2, R * 0.25, R * 0.98], [R * 0.2, R * 0.2, R * 0.1]);
  g.userData.pupil = pu;
  return g;
}

// ---------------- 部件建模 ----------------
const WING = (bat) => geo(bat ? 'batwing' : 'wing', () => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  if (!bat) {
    s.quadraticCurveTo(0.25, 0.55, -0.05, 1.0); s.quadraticCurveTo(-0.35, 1.12, -0.62, 0.95);
    s.quadraticCurveTo(-0.62, 0.78, -0.5, 0.72); s.quadraticCurveTo(-0.85, 0.7, -0.82, 0.5);
    s.quadraticCurveTo(-0.78, 0.4, -0.66, 0.38); s.quadraticCurveTo(-0.98, 0.3, -0.9, 0.13);
    s.quadraticCurveTo(-0.7, 0.0, -0.45, 0.05); s.quadraticCurveTo(-0.2, -0.05, 0, 0);
  } else {
    s.quadraticCurveTo(0.2, 0.5, 0.05, 1.0); s.lineTo(-0.3, 0.82); s.lineTo(-0.45, 0.98); s.quadraticCurveTo(-0.52, 0.62, -0.75, 0.6);
    s.lineTo(-0.8, 0.72); s.quadraticCurveTo(-0.85, 0.38, -1.05, 0.3); s.lineTo(-1.0, 0.42); s.quadraticCurveTo(-0.8, 0.0, -0.35, 0.04); s.quadraticCurveTo(-0.15, -0.02, 0, 0);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -0.025); return g;
});
const EAR = () => geo('ear', () => {
  const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.quadraticCurveTo(-0.45, 0.6, -0.08, 1.0); s.quadraticCurveTo(0, 1.06, 0.08, 1.0); s.quadraticCurveTo(0.45, 0.6, 0.5, 0); s.quadraticCurveTo(0, -0.12, -0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 6 }); g.translate(0, 0, -0.09); return g;
});
const GEAR = () => geo('gear', () => {
  const s = new THREE.Shape(), n = 9;
  for (let i = 0; i < n * 4; i++) { const a = (i / (n * 4)) * Math.PI * 2, rr = (i % 4 < 2) ? 1 : 0.76; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const h = new THREE.Path(); h.absarc(0, 0, 0.3, 0, Math.PI * 2, true); s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 8 }); g.translate(0, 0, -0.11); return g;
});
const STAR = () => geo('star', () => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.45 : 1; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 }); g.translate(0, 0, -0.11); return g;
});
const HORN = () => geo('horn', () => new THREE.ConeGeometry(0.2, 1, 14, 1));
const HORN_SPIRAL = () => geo('hornSp', () => {
  const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 2 * 3.2, r = 0.2 * (1 - t) + 0.012; pts.push(V(Math.cos(a) * r, t * 0.98 - 0.5, Math.sin(a) * r)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.035, 5);
});
const MUSTACHE = () => geo('mustache', () => {
  const half = (s) => [V(0, 0, 0), V(0.02, -0.08, s * 0.25), V(0.0, -0.02, s * 0.5), V(-0.02, 0.12, s * 0.58), V(0, 0.16, s * 0.46), V(0.01, 0.08, s * 0.42)];
  const g1 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(half(1)), 20, 0.06, 7), g2 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(half(-1)), 20, 0.06, 7);
  return mergeGeo([g1, g2]);
});
const ANTLER = () => geo('antler', () => {
  const main = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.05, 0.4, 0), V(-0.1, 0.8, 0), V(-0.05, 1.05, 0)]), 14, 0.09, 6);
  const b1 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.04, 0.38, 0), V(0.3, 0.55, 0), V(0.38, 0.75, 0)]), 8, 0.075, 6);
  const b2 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.08, 0.72, 0), V(-0.35, 0.85, 0), V(-0.45, 0.98, 0)]), 8, 0.07, 6);
  return mergeGeo([main, b1, b2]);
});
function mergeGeo(list) {
  // 简易合并（同属性的非索引化几何）
  const parts = list.map((g) => g.index ? g.toNonIndexed() : g);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const arrs = parts.map((g) => g.attributes[k].array); const n = arrs.reduce((s, a) => s + a.length, 0);
    const a = new Float32Array(n); let o = 0; for (const x of arrs) { a.set(x, o); o += x.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, k === 'uv' ? 2 : 3));
  }
  list.forEach((g) => g.dispose());
  return out;
}

const PASTEL = ['#ff8fc4', '#7fe3ff', '#ffe066', '#b69cff', '#7dffb2', '#ffa36b'];
// kind → { group, anim(t) }；A = anchorsPlus(fish)；ctx: { pal:[c1,c2,c3] }
export function buildExtra(kind, A, seed, ctx = {}) {
  const g = new THREE.Group(); g.name = 'gx-' + kind;
  const r = rng((seed ^ (kind.length * 2654435761)) >>> 0);
  const S = A.S, len = A.len;
  const pal = ctx.pal || ['#ffffff', '#ff7fb0', '#ffd23f'];
  let anim = null;
  const zW = Math.max(A.headW * 0.85, S * 0.18);
  switch (kind) {
    case 'wings': {
      const bat = r() < 0.3;
      const m = bat ? mat(pick(r, ['#6b4bc4', '#3d2f6b', '#c0396b'])) : mat(pick(r, ['#ffffff', '#fff3fb', '#eaf7ff']), { roughness: 0.6 });
      const tip = bat ? null : mat(pick(r, ['#ffb3d9', '#9fe6ff', '#ffe08a']), { roughness: 0.6 });
      const P = A.backAt(0.55).p; const K = THREE.MathUtils.clamp(S * 1.35, 0.22, 0.55);
      const ws = [];
      for (const s of [1, -1]) {
        const piv = new THREE.Group(); piv.position.set(P.x + S * 0.1, P.y - S * 0.06, s * Math.max(A.neck.rz * 0.35, 0.02)); g.add(piv);
        const w = mesh(WING(bat), m, piv, null, K);
        if (tip) mesh(WING(false), tip, w, [-0.08, 0.02, s * 0.03], 0.6);
        ws.push([piv, s]);
      }
      anim = (t) => { for (const [p, s] of ws) { p.rotation.x = s * (0.55 + Math.sin(t * 7) * 0.38); p.rotation.y = s * -0.15; } };
      break;
    }
    case 'flame': {
      const L = [emi('#ff4a1c', 0.85), emi('#ff9a1f', 0.9), emi('#ffe45c', 1.0)];
      const fl = [];
      [[0.62, 1], [0.45, 0.8], [0.3, 0.62]].forEach(([u, k], i) => {
        const B = A.backAt(u); const f = new THREE.Group(); f.position.copy(B.p).addScaledVector(B.n, -S * 0.03); g.add(f);
        const H = THREE.MathUtils.clamp(S * 1.3, 0.2, 0.5) * k;
        mesh(DROP(), L[0], f, null, [H * 0.62, H, H * 0.62]);
        mesh(DROP(), L[1], f, [0, H * 0.04, H * 0.06], [H * 0.42, H * 0.7, H * 0.42]);
        mesh(DROP(), L[2], f, [0, H * 0.06, H * 0.12], [H * 0.22, H * 0.4, H * 0.22]);
        f.rotation.z = 0.45; fl.push([f, i]);
      });
      anim = (t) => { for (const [f, i] of fl) { const k = 1 + Math.sin(t * 13 + i * 2.1) * 0.1 + Math.sin(t * 7.3 + i) * 0.06; f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k)); f.rotation.z = 0.45 + Math.sin(t * 5 + i) * 0.1; } };
      break;
    }
    case 'horn': {
      const H = THREE.MathUtils.clamp(S * 1.15, 0.18, 0.46);
      const hg = new THREE.Group(); g.add(hg);
      mesh(HORN(), mat(pick(r, ['#fff6fb', '#fffbe8', '#f2ecff']), { roughness: 0.35 }), hg, [0, 0.5, 0]);
      mesh(HORN_SPIRAL(), mat(pick(r, ['#ffc94d', '#ff8fc4', '#9fdcff', '#c59bff']), { roughness: 0.3, metalness: 0.3 }), hg, [0, 0.5, 0]);
      mesh(geo('hornRing', () => new THREE.TorusGeometry(0.2, 0.05, 6, 16)), mat('#ffc94d', { metalness: 0.5, roughness: 0.3 }), hg, [0, 0.03, 0], null, [Math.PI / 2, 0, 0]);
      hg.scale.setScalar(H); g.position.copy(A.headTop).add(V(S * 0.12, -S * 0.08, 0)); g.rotation.z = -0.55;
      anim = (t) => { hg.rotation.y = t * 0.6; };
      break;
    }
    case 'catEars': {
      const outer = mat(pick(r, [pal[1], '#ff9ec7', '#5a4a6e', '#ffb34d', '#f4f4f4'])), inner = mat('#ff9ec7', { roughness: 0.7 });
      const K = THREE.MathUtils.clamp(S * 0.62, 0.09, 0.26);
      const es = [];
      for (const s of [1, -1]) {
        const e = new THREE.Group(); e.position.copy(A.headTop).add(V(-S * 0.12, -K * 0.25, s * Math.min(zW * 0.75, S * 0.5))); g.add(e);
        const o = mesh(EAR(), outer, e, null, K); o.rotation.y = s * 0.55;
        const i2 = mesh(EAR(), inner, o, [0, 0.12, 0.1], [0.6, 0.62, 0.5]);
        e.rotation.x = s * 0.32; es.push([e, s]);
      }
      anim = (t) => { const tw = Math.max(0, Math.sin(t * 1.7)) ** 12; for (const [e, s] of es) { e.rotation.z = -tw * 0.35 * (s > 0 ? 1 : 0.6); } };
      break;
    }
    case 'whiskers': {
      const m = mat('#2b1d4e', { roughness: 0.5 });
      const P = A.nose; const R = Math.max(0.008, S * 0.032);
      const ws = [];
      for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
        const w = new THREE.Group(); w.position.set(P.x - S * 0.12, P.y + S * 0.08, s * Math.max(A.headW * 0.55, S * 0.12)); g.add(w);
        const dy = (i - 1) * S * 0.18;
        w.add(tube([V(0, 0, 0), V(S * 0.05, dy * 0.5, s * S * 0.5), V(S * 0.02, dy * 1.3, s * S * 1.05)], R, m, 10, 4));
        ws.push([w, i, s]);
      }
      anim = (t) => { for (const [w, i, s] of ws) w.rotation.x = s * Math.sin(t * 4 + i) * 0.12; };
      break;
    }
    case 'propeller': {
      const H = THREE.MathUtils.clamp(S * 0.95, 0.14, 0.4);
      const cols = [pick(r, ['#ff5fa2', '#ff4a4a']), pick(r, ['#ffd23f', '#ffe066']), pick(r, ['#2fe0c5', '#3fa9ff']), pick(r, ['#7b5cff', '#7dffb2'])];
      const hat = new THREE.Group(); g.add(hat);
      for (let i = 0; i < 4; i++) { const q = mesh(geo('quarter' + i, () => new THREE.SphereGeometry(1, 8, 7, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2)), mat(cols[i]), hat, null, [0.5, 0.42, 0.5]); }
      mesh(CYL(), mat('#ffffff'), hat, [0, -0.01, 0], [0.52, 0.04, 0.52]);
      mesh(CYL(), mat('#2b1d4e'), hat, [0, 0.52, 0], [0.04, 0.2, 0.04]);
      const rot = new THREE.Group(); rot.position.y = 0.62; hat.add(rot);
      for (const s of [1, -1]) mesh(SPH(), mat(cols[(s + 1) / 2 | 0 ? 0 : 2]), rot, [s * 0.34, 0, 0], [0.34, 0.03, 0.1], [s * 0.25, 0, 0]);
      mesh(SPH(), mat('#ffd23f'), rot, null, 0.07);
      hat.scale.setScalar(H); g.position.copy(A.headTop).add(V(0, -H * 0.12, 0)); g.rotation.z = -0.12;
      anim = (t) => { rot.rotation.y = t * 16; };
      break;
    }
    case 'gear': {
      const brass = mat(pick(r, ['#c9a14a', '#b8bcc8', '#d97a3a']), { metalness: 0.65, roughness: 0.32 });
      const gs = [];
      const K = THREE.MathUtils.clamp(S * 0.42, 0.06, 0.2);
      for (const sd of A.side) {
        const gg = new THREE.Group(); gg.position.copy(sd.p).addScaledVector(sd.n, K * 0.12); gg.lookAt(gg.position.clone().add(sd.n)); g.add(gg);
        const a = mesh(GEAR(), brass, gg, null, K);
        const b2 = mesh(GEAR(), mat('#8a8f9e', { metalness: 0.6, roughness: 0.35 }), gg, [K * 1.25, K * 0.75, K * 0.02], K * 0.55);
        mesh(SPH_LO(), mat('#ff5fa2'), a, null, [0.22, 0.22, 0.2]);
        gs.push([a, b2]);
      }
      // 发条钥匙（背上）
      const B = A.backAt(0.42); const key = new THREE.Group(); key.position.copy(B.p); alignUp(key, B.n); g.add(key);
      const kc = new THREE.Group(); key.add(kc);
      mesh(CYL(), brass, kc, [0, K * 0.6, 0], [K * 0.12, K * 1.2, K * 0.12]);
      for (const s of [1, -1]) mesh(geo('keyLoop', () => new THREE.TorusGeometry(1, 0.28, 6, 14)), brass, kc, [s * K * 0.55, K * 1.3, 0], [K * 0.5, K * 0.5, K * 0.5]);
      anim = (t) => { for (const [a, b2] of gs) { a.rotation.z = t * 1.6; b2.rotation.z = -t * 2.9 + 0.3; } kc.rotation.y = t * 2.2; };
      break;
    }
    case 'crystalSpikes': {
      const cols = [pick(r, ['#7fe3ff', '#b69cff', '#ff8fc4']), pick(r, ['#c8f6ff', '#e3d6ff', '#ffd6ec'])];
      const ms = cols.map((c) => mat(c, { emissive: c, emissiveIntensity: 0.35, roughness: 0.3, flatShading: true }));
      const cr = [];
      [0.22, 0.36, 0.5, 0.64, 0.76].forEach((u, i) => {
        const B = A.backAt(u); const c = new THREE.Group(); c.position.copy(B.p).addScaledVector(B.n, -S * 0.02); alignUp(c, B.n); g.add(c);
        const H = THREE.MathUtils.clamp(S * (0.55 + 0.35 * Math.sin((i / 4) * Math.PI)), 0.08, 0.32);
        mesh(geo('oct', () => new THREE.OctahedronGeometry(1, 0)), ms[i % 2], c, [0, H * 0.5, 0], [H * 0.24, H * 0.7, H * 0.24], [0, i * 0.7, -0.25]);
        if (i % 2 === 0) mesh(geo('oct', () => new THREE.OctahedronGeometry(1, 0)), ms[1], c, [H * 0.15, H * 0.25, H * 0.12], [H * 0.12, H * 0.35, H * 0.12], [0.4, 0, 0.5]);
        cr.push(c);
      });
      anim = (t) => { cr.forEach((c, i) => { const k = 1 + Math.sin(t * 3 + i) * 0.04; c.scale.setScalar(k); }); };
      break;
    }
    case 'jellyTentacles': {
      const col = pick(r, ['#ff8fc4', '#b69cff', '#7fe3ff', '#ffb38a']);
      const m = mat(col, { transparent: true, opacity: 0.78, emissive: col, emissiveIntensity: 0.35, roughness: 0.25 });
      const tip = mat('#ffffff', { emissive: col, emissiveIntensity: 0.6 });
      const ten = [];
      const n = 5, segL = THREE.MathUtils.clamp(S * 0.38, 0.05, 0.15), R = segL * 0.36;
      for (let i = 0; i < n; i++) {
        const u = 0.3 + (i / (n - 1)) * 0.45, z = ((i % 2) * 2 - 1) * A.neck.rz * 0.35 * (i === 2 ? 0 : 1);
        const P = A.bellyAt(u, z);
        let par = new THREE.Group(); par.position.copy(P).add(V(0, segL * 0.3, 0)); g.add(par);
        const joints = [];
        for (let k = 0; k < 4; k++) {
          const j = new THREE.Group(); if (k) j.position.y = -segL; par.add(j);
          mesh(SPH(), m, j, [0, -segL * 0.5, 0], [R * (1 - k * 0.15), segL * 0.62, R * (1 - k * 0.15)]);
          joints.push(j); par = j;
        }
        mesh(SPH_LO(), tip, par, [0, -segL * 1.05, 0], R * 0.55);
        ten.push([joints, i]);
      }
      anim = (t) => { for (const [js, i] of ten) js.forEach((j, k) => { j.rotation.z = Math.sin(t * 2.6 - k * 0.9 + i * 1.3) * (0.18 + k * 0.08); j.rotation.x = Math.cos(t * 2.1 - k * 0.7 + i) * 0.12; }); };
      break;
    }
    case 'legs': {
      const skin = mat(pick(r, ['#ffd2b0', '#ffe0c8', pal[0]]), { roughness: 0.6 });
      const shoe = mat(pick(r, ['#ff4a5a', '#3fa9ff', '#ffd23f', '#7b5cff'])), sole = mat('#ffffff');
      const H = THREE.MathUtils.clamp(len * 0.22, 0.12, 0.3), R = H * 0.12;
      const P = A.belly;
      const ls = [];
      for (const s of [1, -1]) {
        const hip = new THREE.Group(); hip.position.set(P.x, P.y + R, s * Math.max(A.neck.rz * 0.4, R * 1.4)); g.add(hip);
        mesh(CYL(), skin, hip, [0, -H * 0.5, 0], [R, H, R]);
        mesh(SPH(), skin, hip, [0, 0, 0], R * 1.05);
        const f = new THREE.Group(); f.position.y = -H; hip.add(f);
        mesh(SPH(), shoe, f, [R * 0.9, 0, 0], [R * 2.1, R * 1.25, R * 1.45]);
        mesh(CYL(), sole, f, [R * 0.9, -R * 0.95, 0], [R * 1.9, R * 0.35, R * 1.3]);
        mesh(SPH_LO(), sole, f, [R * 2.4, R * 0.05, 0], R * 0.5);
        ls.push([hip, s]);
      }
      anim = (t) => { for (const [h, s] of ls) h.rotation.z = Math.sin(t * 7 + (s > 0 ? 0 : Math.PI)) * 0.55; };
      break;
    }
    case 'lightbulb': {
      const col = pick(r, ['#fff27a', '#7dfcff', '#ff9ef0', '#9dff8a']);
      const top = A.headTop.clone();
      const K = THREE.MathUtils.clamp(S * 1.0, 0.15, 0.42);
      const tip = V(K * 0.95, K * 0.85, 0);
      const stalk = new THREE.Group(); stalk.position.copy(top).add(V(0, -S * 0.04, 0)); g.add(stalk);
      stalk.add(tube([V(0, 0, 0), V(-K * 0.05, K * 0.6, 0), V(K * 0.4, K * 1.05, 0), tip], Math.max(0.006, K * 0.035), mat('#3a2f5a'), 16, 5));
      const bulb = mesh(SPH(), emi(col, 1.2), stalk, [tip.x + K * 0.04, tip.y - K * 0.12, 0], K * 0.15);
      const glow = mesh(SPH_LO(), shared(new THREE.MeshBasicMaterial({ color: muteColor(col), transparent: true, opacity: 0.22, depthWrite: false })), stalk, bulb.position.toArray(), K * 0.3);
      glow.userData.noOutline = true;
      anim = (t) => { stalk.rotation.z = Math.sin(t * 2.2) * 0.1; const k = 0.5 + 0.5 * Math.sin(t * 3.4); glow.scale.setScalar(K * (0.26 + k * 0.1)); bulb.scale.setScalar(K * (0.14 + k * 0.02)); };
      break;
    }
    case 'flowers': {
      const fl = [];
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const sp = A.surf(r); if (!sp) continue;
        const f = new THREE.Group(); f.position.copy(sp.p); alignUp(f, sp.n); g.add(f);
        const pc = mat(pick(r, ['#ffb3d1', '#ffffff', '#ffd84a', '#b9a8ff', '#ff8a7a', '#8fe8ff']));
        const K = THREE.MathUtils.clamp(S * (0.22 + r() * 0.12), 0.035, 0.11);
        const fg = new THREE.Group(); fg.scale.setScalar(K); f.add(fg);
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; mesh(SPH(), pc, fg, [Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55], [0.48, 0.16, 0.34], [0, -a, 0]); }
        mesh(SPH(), mat('#ffcf3a'), fg, [0, 0.2, 0], [0.32, 0.22, 0.32]);
        fl.push([fg, i]);
      }
      anim = (t) => { for (const [f, i] of fl) f.rotation.y = Math.sin(t * 1.5 + i) * 0.3; };
      break;
    }
    case 'candles': {
      const fr = mat('#fff8f0', { roughness: 0.6 });
      const cs = [];
      const cols = ['#ff7fb0', '#7fe3ff', '#ffe066', '#b69cff'];
      [0.35, 0.5, 0.65].forEach((u, i) => {
        const B = A.backAt(u); const c = new THREE.Group(); c.position.copy(B.p).addScaledVector(B.n, -S * 0.02); g.add(c);
        const H = THREE.MathUtils.clamp(S * 0.75, 0.1, 0.28), R = H * 0.13;
        mesh(geo('frost', () => new THREE.TorusGeometry(1, 0.45, 6, 14)), fr, c, [0, R * 0.3, 0], [R * 1.4, R * 1.4, R * 1.4], [Math.PI / 2, 0, 0]);
        const body = mesh(CYL(), mat(cols[(i + Math.floor(r() * 4)) % 4]), c, [0, H * 0.5, 0], [R, H, R]);
        mesh(geo('candleStripe', () => new THREE.TorusGeometry(1, 0.12, 4, 12)), mat('#ffffff'), c, [0, H * 0.35, 0], [R * 1.02, R * 1.02, R * 1.6], [Math.PI / 2, 0, 0.4]);
        mesh(geo('candleStripe', () => new THREE.TorusGeometry(1, 0.12, 4, 12)), mat('#ffffff'), c, [0, H * 0.7, 0], [R * 1.02, R * 1.02, R * 1.6], [Math.PI / 2, 0, 0.4]);
        mesh(CYL(), mat('#2b1d4e'), c, [0, H + R * 0.3, 0], [R * 0.12, R * 0.6, R * 0.12]);
        const f = new THREE.Group(); f.position.y = H + R * 0.5; c.add(f);
        mesh(DROP(), emi('#ff9a1f', 0.9), f, null, [R * 0.9, R * 2.2, R * 0.9]);
        mesh(DROP(), emi('#fff07a', 1.0), f, [0, R * 0.1, 0], [R * 0.45, R * 1.3, R * 0.45]);
        cs.push([f, i]);
      });
      anim = (t) => { for (const [f, i] of cs) { const k = 1 + Math.sin(t * 15 + i * 2) * 0.12; f.scale.set(1 / k, k, 1 / k); f.rotation.z = Math.sin(t * 6 + i) * 0.12; } };
      break;
    }
    case 'mustache': {
      const m = mat(pick(r, ['#3a2418', '#2b1d4e', '#f4f4f4', '#c06c2b']), { roughness: 0.7 });
      const K = THREE.MathUtils.clamp(S * 1.05, 0.1, 0.36);
      const mg = mesh(MUSTACHE(), m, g, null, K);
      g.position.copy(A.nose).add(V(-K * 0.04, K * 0.12, 0));
      anim = (t) => { mg.rotation.x = Math.sin(t * 3) * 0.06; mg.scale.set(K, K * (1 + Math.sin(t * 6) * 0.04), K); };
      break;
    }
    case 'starTail': {
      const col = pick(r, ['#ffd23f', '#ff8fc4', '#7fe3ff']);
      const K = THREE.MathUtils.clamp(Math.max(A.tailH * 0.6, S * 0.6), 0.1, 0.32);
      const st = new THREE.Group(); st.position.copy(A.tailTip).add(V(-K * 0.6, 0, 0)); g.add(st);
      const star = mesh(STAR(), mat(col, { emissive: col, emissiveIntensity: 0.45, roughness: 0.35 }), st, null, K);
      const sp = [];
      for (let i = 0; i < 3; i++) { const s = mesh(STAR(), emi('#fff6c0', 0.9), st, null, K * 0.22); sp.push(s); }
      anim = (t) => { star.rotation.z = t * 1.4; const p = 1 + Math.sin(t * 4) * 0.06; star.scale.setScalar(K * p); sp.forEach((s, i) => { const a = t * 1.8 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * K * 1.5 - K * 0.3, Math.sin(a) * K * 1.3, Math.sin(a * 2) * K * 0.3); s.rotation.z = -t * 3; }); };
      break;
    }
    case 'bubbleHelmet': {
      const R = THREE.MathUtils.clamp(Math.max(A.th * 0.62, A.headW * 1.1, S * 0.55), 0.1, 0.45);
      const C = A.headC.clone().add(V(-R * 0.05, A.th * 0.05, 0));
      g.position.copy(C);
      const glass = mesh(SPH(), shared(new THREE.MeshStandardMaterial({ color: '#d6f3ff', transparent: true, opacity: 0.3, emissive: '#9fdcff', emissiveIntensity: 0.15, roughness: 0.3, metalness: 0.1, depthWrite: false })), g, null, R);
      mesh(SPH_LO(), shared(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false })), g, [R * 0.35, R * 0.55, R * 0.45], [R * 0.16, R * 0.09, R * 0.05], [0, -0.7, 0.5]);
      mesh(geo('collar', () => new THREE.TorusGeometry(1, 0.13, 8, 24)), mat(pick(r, ['#ffffff', '#ffd23f', '#ff5fa2'])), g, [-R * 0.62, 0, 0], [R * 0.8, R * 0.8, R * 0.8], [0, Math.PI / 2, 0]);
      const ant = new THREE.Group(); ant.position.set(-R * 0.1, R * 0.98, 0); g.add(ant);
      mesh(CYL(), mat('#8a8f9e', { metalness: 0.5 }), ant, [0, R * 0.15, 0], [R * 0.025, R * 0.3, R * 0.025]);
      const ball = mesh(SPH(), emi('#ff4a5a', 0.9), ant, [0, R * 0.32, 0], R * 0.07);
      anim = (t) => { ball.material = Math.sin(t * 4) > 0 ? emi('#ff4a5a', 0.9) : mat('#a8243a'); ant.rotation.z = Math.sin(t * 3) * 0.15; };
      break;
    }
    case 'extraEyes': {
      const n = ctx.extraEyeN || 2;
      const es = [];
      const R = THREE.MathUtils.clamp(S * 0.27, 0.045, 0.11);
      for (let i = 0; i < n; i++) {
        const z = n === 1 ? 0 : THREE.MathUtils.lerp(-1, 1, i / (n - 1)) * Math.min(zW * 0.9, S * 0.55);
        const st = new THREE.Group(); st.position.copy(A.headTop).add(V(-S * 0.08 - Math.abs(z) * 0.2, -R * 0.4, z)); g.add(st);
        const H = R * (2.2 + (i % 2) * 0.8);
        st.add(tube([V(0, 0, 0), V(R * 0.3, H * 0.55, z * 0.15), V(R * 0.5, H, z * 0.3)], R * 0.22, mat(pal[1] || '#ff7fb0'), 8, 5));
        const e = cartoonEye(R); e.position.set(R * 0.5, H + R * 0.6, z * 0.3); e.rotation.y = Math.PI / 2 - z * 1.2; st.add(e);
        es.push([st, e, i]);
      }
      anim = (t) => { for (const [st, e, i] of es) { st.rotation.z = Math.sin(t * 2.5 + i * 1.7) * 0.15; st.rotation.x = Math.sin(t * 1.9 + i) * 0.12; e.userData.pupil.rotation.y = Math.sin(t * 1.3 + i * 2) * 0.35; } };
      break;
    }
    case 'spots3d': {
      const cols = [pal[1], pal[2], pick(r, PASTEL)];
      const n = 7 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const sp = A.surf(r, false); if (!sp) continue;
        const d = new THREE.Group(); d.position.copy(sp.p).addScaledVector(sp.n, -0.003); alignUp(d, sp.n); g.add(d);
        const K = THREE.MathUtils.clamp(S * (0.1 + r() * 0.1), 0.018, 0.07);
        mesh(HEMI(), mat(cols[i % 3], { roughness: 0.35 }), d, null, [K, K * 0.7, K]);
      }
      break;
    }
    case 'antlers': {
      const m = mat(pick(r, ['#b07a48', '#8a5a34', '#ffe9c2']), { roughness: 0.7 });
      const K = THREE.MathUtils.clamp(S * 1.1, 0.15, 0.42);
      const as = [];
      for (const s of [1, -1]) {
        const a = new THREE.Group(); a.position.copy(A.headTop).add(V(-S * 0.1, -S * 0.06, s * Math.min(zW * 0.6, S * 0.4))); g.add(a);
        const am = mesh(ANTLER(), m, a, null, K); am.rotation.y = Math.PI / 2; a.rotation.x = s * 0.45;
        mesh(SPH_LO(), mat('#ff5a6e', { emissive: '#ff5a6e', emissiveIntensity: 0.3 }), a, [0, K * 1.05, s * K * 0.0], K * 0.08).visible = r() < 0.5;
        as.push([a, s]);
      }
      anim = (t) => { for (const [a, s] of as) a.rotation.z = Math.sin(t * 2 + s) * 0.05; };
      break;
    }
    case 'mohawk': {
      const c1 = pick(r, ['#ff5fa2', '#7b5cff', '#2fe0c5', '#ffd23f']), c2 = pick(r, ['#ffd23f', '#ff5fa2', '#7fe3ff']);
      const ms = [mat(c1, { roughness: 0.45 }), mat(c2, { roughness: 0.45 })];
      const sp = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const u = THREE.MathUtils.lerp(0.82, 0.42, i / (n - 1));
        const B = A.backAt(u); const c = new THREE.Group(); c.position.copy(B.p).addScaledVector(B.n, -S * 0.03); g.add(c);
        const H = THREE.MathUtils.clamp(S * (1.0 - i * 0.09), 0.08, 0.36);
        mesh(CONE(), ms[i % 2], c, [0, H * 0.45, 0], [H * 0.3, H, H * 0.17]);
        c.rotation.z = 0.35 + i * 0.05; sp.push([c, i]);
      }
      anim = (t) => { for (const [c, i] of sp) c.rotation.z = 0.35 + i * 0.05 + Math.sin(t * 5 - i * 0.6) * 0.07; };
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; } });
  return { group: g, anim };
}

// 给部件加描边（跳过透明 / 极小物）
export function outlineGroup(g) { const list = []; g.traverse((o) => { if (o.isMesh && !o.userData.isOutline && !o.userData.outline && !o.userData.noOutline && !o.material.transparent) list.push(o); }); list.forEach((o) => addOutline(o)); }

// ---------------- 9 种特殊材质（注入到 toon + ugc 花纹之后） ----------------
const MAT_GLSL = /* glsl */`
uniform float uGxTime, uGlow;
varying vec3 vGP;
float gxH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gxN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gxH(i), gxH(i + vec3(1,0,0)), f.x), mix(gxH(i + vec3(0,1,0)), gxH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gxH(i + vec3(0,0,1)), gxH(i + vec3(1,0,1)), f.x), mix(gxH(i + vec3(0,1,1)), gxH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float gxF(vec3 p){ return gxN(p) * 0.55 + gxN(p * 2.1 + 3.1) * 0.3 + gxN(p * 4.3 + 7.7) * 0.15; }
vec3 gxHue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
vec3 gxEnv(vec3 R){   // v3：柔和自然的工作室反射（暖白天光 → 浅灰蓝 → 暖灰地面），对比降低、不再粉紫
  float y = R.y + 0.06 * sin(R.x * 4.0 + R.z * 3.0);
  vec3 sky = mix(vec3(0.86, 0.82, 0.76), vec3(0.42, 0.52, 0.64), smoothstep(0.05, 0.6, y));
  vec3 gnd = mix(vec3(0.3, 0.27, 0.25), vec3(0.08, 0.07, 0.07), smoothstep(-0.02, -0.4, y));
  vec3 c = mix(gnd, sky, smoothstep(-0.04, 0.04, y));
  c += vec3(1.0, 0.97, 0.9) * smoothstep(0.05, 0.0, abs(y - 0.02)) * 0.55;
  c += vec3(1.0) * smoothstep(0.03, 0.0, abs(y - 0.42)) * 0.35;
  return c;
}
vec3 gxSat(vec3 c, float k){ float l = dot(c, vec3(0.299, 0.587, 0.114)); return clamp(mix(vec3(l), c, k), 0.0, 1.0); }
void gxApply(inout vec4 dc, inout vec3 em, vec3 n, vec3 vv){
  vec3 V = normalize(vv);
  float nv = clamp(abs(dot(n, V)), 0.0, 1.0);
  float fres = pow(1.0 - nv, 2.0);
  vec3 p = vGP;
  vec3 R = reflect(-V, n);
  float lum = dot(dc.rgb, vec3(0.299, 0.587, 0.114));
#if GX_KIND == 1   // 果冻：高饱和半透 + 边缘实 + 内发光 + 硬高光
  vec3 jc = dc.rgb / max(max(dc.r, max(dc.g, dc.b)), 0.05);
  jc = gxSat(jc, 1.15);
  dc.rgb = jc * 0.6;
  dc.a *= mix(0.7, 0.96, fres);
  em += jc * (0.12 + 0.14 * (1.0 - fres)) + vec3(1.0) * pow(fres, 3.0) * 0.12;   // v3：去荧光，内发光弱、靠清漆高光出"果冻感"
#elif GX_KIND == 2 // 糖果：高饱和 + 硬高光 + 糖粒闪
  dc.rgb = clamp(mix(vec3(lum), dc.rgb, 1.15) * 1.03, 0.0, 1.0);
  em += dc.rgb * pow(fres, 2.0) * 0.18;
  em += vec3(1.0) * step(0.988, gxH(floor(p * 90.0))) * 0.22;   // 糖粒细闪
#elif GX_KIND == 3 // 机械铬：高对比卡通反射带 + 铆钉
  vec3 env = gxEnv(R);
  dc.rgb = vec3(0.05);
  em += env * mix(vec3(0.75), vec3(0.88, 0.9, 0.95), fres) * 0.85;   // 拉丝感：沿身体方向的细纹
  em *= 0.93 + 0.07 * gxN(vec3(p.x * 4.0, p.y * 160.0, p.z * 160.0));
  vec2 rv = fract(vec2(p.x * 9.0, p.y * 9.0)) - 0.5; float rivet = step(length(rv), 0.08) * step(0.7, gxH(floor(vec3(p.x * 9.0, p.y * 9.0, 1.0))));
  em += vec3(0.9) * rivet * 0.5;
#elif GX_KIND == 4 // 毛绒：暖色 + 绒毛噪声 + 天鹅绒边缘光
  float fz = gxN(p * 170.0) * 0.55 + gxN(p * 55.0) * 0.45;
  vec3 pc = gxSat(dc.rgb, 0.85) * vec3(1.05, 0.99, 0.93);
  dc.rgb = clamp(pc * (0.8 + 0.3 * fz), 0.0, 1.0);
  em += pc * pow(fres, 1.4) * 0.35 * (0.6 + 0.6 * fz);   // 物理 sheen 负责绒面掠射光
#elif GX_KIND == 5 // 水晶：彩色冰糖半透 + 虹彩边 + 刻面闪光
  vec3 cc = gxSat(dc.rgb / max(max(dc.r, max(dc.g, dc.b)), 0.05), 0.9);
  if (dot(cc, vec3(0.333)) > 0.85) cc = vec3(0.72, 0.8, 0.9);
  dc.rgb = mix(cc, vec3(0.82, 0.84, 0.9), 0.35) * (0.5 + 0.3 * gxH(floor(n * 6.0 + 0.5)));
  dc.a *= mix(0.78, 0.97, fres);
  em += mix(vec3(0.9), gxHue(fres * 1.3 + p.y * 1.5 + p.x * 0.7 + uGxTime * 0.08), 0.35) * (0.05 + fres * 0.3) + dc.rgb * 0.1;
  em += vec3(1.0) * smoothstep(0.86, 0.96, max(dot(R, normalize(vec3(-0.3, 0.8, 0.5))), 0.0)) * 0.45;
#elif GX_KIND == 6 // 星空：深蓝紫星云 + 流动星点
  vec3 q = p * 3.0 + vec3(uGxTime * 0.06, 0.0, uGxTime * 0.03);
  float neb = gxF(q);
  vec3 base = mix(vec3(0.05, 0.06, 0.12), vec3(0.18, 0.15, 0.26), smoothstep(0.35, 0.75, neb));
  base = mix(base, vec3(0.12, 0.2, 0.3), smoothstep(0.6, 0.9, gxF(q * 1.7 + 5.0)) * 0.6);
  dc.rgb = base;
  vec3 sp = p * 34.0 + vec3(uGxTime * 0.4, 0.0, 0.0);
  vec3 cell = floor(sp); float h = gxH(cell);
  float d = length(fract(sp) - 0.5);
  float star = step(0.9, h) * smoothstep(0.32, 0.0, d) * (0.6 + 0.4 * sin(uGxTime * 3.0 + h * 50.0));
  em += base * 0.6 + vec3(1.0, 0.95, 0.85) * star * 1.1 + vec3(0.55, 0.6, 0.75) * fres * 0.22;
#elif GX_KIND == 7 // 黄金：金色卡通反射带 + 闪点
  vec3 env = gxEnv(R);
  float el = dot(env, vec3(0.333));
  dc.rgb = vec3(0.1, 0.05, 0.0);
  dc.rgb = vec3(0.3, 0.17, 0.02);
  em += mix(vec3(0.5, 0.33, 0.12), vec3(0.95, 0.84, 0.56), smoothstep(0.2, 0.85, el)) * (0.55 + 0.45 * el);   // 古董金：暖而不橙
  em += vec3(1.0, 0.95, 0.8) * step(0.995, gxH(floor(p * 70.0) + floor(uGxTime * 2.0))) * 0.6;
#elif GX_KIND == 8 // 镭射：随视角与位置变色
  float hu = fres * 1.6 + dot(p, vec3(1.3, 0.9, 0.5)) + uGxTime * 0.12 + V.x * 0.6;
  vec3 hc = gxHue(hu);
  hc = mix(vec3(0.85), hc, 0.45);
  dc.rgb = mix(dc.rgb, vec3(0.85), 0.5) * mix(vec3(1.0), hc, 0.35);
  em += hc * (0.06 + 0.22 * fres);   // 珠光镭射：只在掠射角泛彩
#elif GX_KIND == 9 // 岩浆：焦黑外壳 + 发光裂纹
  float nn = gxF(p * 5.0 + vec3(0.0, uGxTime * 0.05, 0.0));
  float crack = smoothstep(0.075, 0.0, abs(nn - 0.5));
  float pulse = 0.8 + 0.25 * sin(uGxTime * 2.2 + p.x * 9.0);
  dc.rgb = mix(vec3(0.13, 0.07, 0.08), dc.rgb * 0.3, 0.3);
  em += mix(vec3(0.85, 0.28, 0.08), vec3(1.0, 0.7, 0.35), crack * crack) * crack * pulse * 1.05 + vec3(0.8, 0.35, 0.15) * fres * 0.12;
#endif
  em += dc.rgb * uGlow * 0.6;
  if (!(dot(em, vec3(1.0)) < 1.0e4)) em = vec3(0.0);   // NaN/Inf 安全钳
  em = clamp(em, 0.0, 2.2);
  dc.rgb = clamp(dc.rgb, 0.0, 1.0);
  dc.a = clamp(dc.a, 0.0, 1.0);
}
`;
const MAT_SKIP = /eye|pupil|glint/;
export function applyMat(model, kind, glow = 0) {
  const K = kind ? MATS[kind]?.k || 0 : 0;
  if (!K && !(glow > 0)) return;
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const glowU = { value: glow };
  model.traverse((o) => {
    if (!o.isMesh || o.userData.outline || o.userData.isOutline || MAT_SKIP.test(o.name)) return;
    const m = o.material; if (!m || m.userData.gxMat || !m.isMeshStandardMaterial) return;
    m.userData.gxMat = kind || 'glow';
    // v3：物理层同步升级（清漆/绒面 sheen/虹彩），不靠自发光撑质感
    const P = m.isMeshPhysicalMaterial;
    const set = (o) => { if (P) Object.assign(m, o); };
    if (P) { m.iridescence = 0; m.clearcoat = 0; m.sheen = 0; }
    if (K === 1) { m.transparent = true; m.roughness = 0.3; m.metalness = 0; set({ clearcoat: 1, clearcoatRoughness: 0.25 }); }
    else if (K === 2) { m.roughness = 0.42; m.metalness = 0; set({ clearcoat: 1, clearcoatRoughness: 0.25 }); }
    else if (K === 3) { m.roughness = 0.5; m.metalness = 0; set({ clearcoat: 0.6, clearcoatRoughness: 0.3 }); }
    else if (K === 4) { m.roughness = 1; m.metalness = 0; set({ sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#f3e6da') }); }
    else if (K === 5) { m.transparent = true; m.flatShading = true; m.roughness = 0.3; m.metalness = 0; set({ clearcoat: 1, clearcoatRoughness: 0.25, iridescence: 0.5, iridescenceIOR: 1.4 }); }
    else if (K === 6) { m.roughness = 0.5; m.metalness = 0; set({ clearcoat: 0.8, clearcoatRoughness: 0.28 }); }
    else if (K === 7) { m.roughness = 0.45; m.metalness = 0; set({ clearcoat: 0.5, clearcoatRoughness: 0.3 }); }
    else if (K === 8) { m.roughness = 0.35; m.metalness = 0.15; set({ clearcoat: 1, clearcoatRoughness: 0.25, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 800] }); }
    else if (K === 9) { m.roughness = 0.85; m.metalness = 0; }
    const m2f = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.() || '';
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.uGxTime = MAT_TIME; sh.uniforms.uGlow = glowU; sh.uniforms.uGxM2F = { value: m2f };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uGxM2F;\nvarying vec3 vGP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = (uGxM2F * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n#define GX_KIND ${K}\n` + MAT_GLSL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ngxApply(diffuseColor, totalEmissiveRadiance, normal, vViewPosition);');
    };
    m.customProgramCacheKey = () => prevKey + '-gx' + K;
    m.needsUpdate = true;
  });
}

// ---------------- 眼睛：放大 / 独眼 / 多眼 ----------------
// marine.js 的眼睛 = <name>-rim / -pupil / -glint 三件（螃蟹类：eye-±1 + eye-glint-±1）
export function tuneEyes(model, eyeK = 1) {
  const parts = model.userData.parts || {};
  const groups = {};
  for (const [k, o] of Object.entries(parts)) {
    if (!o.isMesh) continue;
    let m = k.match(/^(eye-(?:left|right|-?1))-(rim|pupil|glint2?|orbit|cornea)$/);
    if (m) { (groups[m[1]] ||= { c: null, list: [] }).list.push(o); if (m[2] === 'rim') groups[m[1]].c = o.position.clone(); continue; }
    m = k.match(/^eye-(-?1)$/) || k.match(/^eye-glint-(-?1)$/);
    if (m) { const key = 'c' + m[1]; (groups[key] ||= { c: null, list: [] }).list.push(o); if (/^eye-(-?1)$/.test(k)) groups[key].c = o.position.clone(); }
  }
  const out = [];
  for (const gk in groups) {
    const G = groups[gk]; if (!G.c) continue;
    for (const o of G.list) { o.position.sub(G.c).multiplyScalar(eyeK).add(G.c); o.scale.multiplyScalar(eyeK); }
    out.push(G);
  }
  return out;
}

// ---------------- 融合：嫁接另一物种的尾巴 ----------------
import { createMarineModel as _cmm } from './marine.js';
export function graftTail(model, donorSp) {
  try {
    const donor = _cmm(donorSp, 100); const dt = donor.userData.parts?.tail;
    if (!dt) return null;
    const root = model.getObjectByName('normalized-sculpture'), droot = donor.getObjectByName('normalized-sculpture');
    if (!root || !droot) return null;
    model.updateMatrixWorld(true); donor.updateMatrixWorld(true);
    const own = model.userData.parts?.tail;
    const db = new THREE.Box3().setFromObject(dt), dh = Math.max(db.max.y - db.min.y, 0.01);
    let anchor, oh;
    if (own) { const ob = new THREE.Box3().setFromObject(own); oh = ob.max.y - ob.min.y; anchor = own.getWorldPosition(new THREE.Vector3()); own.visible = false; }
    else { const mb = new THREE.Box3().setFromObject(root); oh = (mb.max.y - mb.min.y) * 0.6; anchor = new THREE.Vector3(mb.min.x + (mb.max.x - mb.min.x) * 0.04, (mb.min.y + mb.max.y) / 2, 0); }
    const f = THREE.MathUtils.clamp(oh / dh, 0.55, 1.7) * 1.08;
    const clone = dt.clone(true); clone.name = 'graft-tail';
    clone.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    clone.position.copy(root.worldToLocal(anchor.clone()));
    clone.scale.setScalar((droot.scale.x / root.scale.x) * f);
    root.add(clone);
    model.userData.marineRig?.motions.push({ node: clone, axis: 'y', rest: 0, amplitude: 0.26, speed: 3.8, phase: 0.5 });
    model.userData.graftTail = clone;
    donor.traverse((o) => { if (o.isMesh && !clone.getObjectById(o.id)) { /* 共享几何仍被 clone 使用，不释放 */ } });
    return clone;
  } catch (e) { console.warn('[gx] graftTail', e); return null; }
}

// 透明网格不能带描边壳（背面外扩壳会透过半透明表面显示成一团暗色）
export function stripHullOnTransparent(root) {
  const rm = [];
  root.traverse((o) => { if ((o.userData.isOutline || o.userData.outline) && o.parent?.isMesh && o.parent.material?.transparent) rm.push(o); });
  rm.forEach((o) => o.parent.remove(o));
}
export function hasHull(root) { let f = false; root.traverse((o) => { if (o.userData.isOutline) f = true; }); return f; }
