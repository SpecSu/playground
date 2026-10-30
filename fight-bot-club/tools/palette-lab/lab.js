import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { generateDesign } from '../../src/mech/design.js';
import { createView } from '../../src/mech/forms.js';
import { Fighter } from '../../src/game/sim.js';
import { makePaletteV13 } from './rule_v13.js';
import { mulberry32 } from '../../src/core/util.js';
const QS = new URLSearchParams(location.search);
const SEED = +(QS.get('seed') || 2026);
const FORCE = QS.get('force') ? QS.get('force').split(',').map(Number) : null;

const W = 1600, H = 1110, CW = 400, CH = 370;
const canvas = document.getElementById('c');
const R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
R.setPixelRatio(1); R.setSize(W, H); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
R.setScissorTest(true);
const pm = new THREE.PMREMGenerator(R);
const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;

const FORMS = ['humanoid', 'tank', 'spider', 'humanoid', 'dog', 'hover', 'humanoid', 'wraith', 'spider', 'humanoid', 'tank', 'dog'];
const PROMPTS = ['重装突击', '履带重炮', '多足潜行刺客', '近战拳手', '机械猎犬', '浮游炮台', '狙击手', '幽灵刺客', '蜘蛛炮台', '武士双刀', '导弹战车', '高速猎犬'];
const labs = document.getElementById('labs');
const cells = [];
const hsl = (hex) => { const c = new THREE.Color(hex); const o = {}; c.getHSL(o); return o; };

for (let i = 0; i < 12; i++) {
  const rnd = mulberry32(SEED * 131 + i * 977);
  const d = generateDesign(PROMPTS[i] + ' #' + (SEED + i * 7919), 'lab', { form: FORMS[i] });
  const g = makePaletteV13(rnd, FORMS[i], null, FORCE ? FORCE[i] : null);
  d.palette = g.palette;
  Object.assign(d.look, { finish: g.finish, pMetal: g.pMetal, sMetal: g.sMetal, pattern: g.pattern, worn: g.worn });
  const sc = { cn: g.body, p: g.palette.primary, s: g.palette.secondary, m: g.palette.metal, a: g.palette.accent, e: g.palette.emissive, e2: g.palette.emissive2 !== g.palette.emissive ? g.palette.emissive2 : null };
  const scene = new THREE.Scene(); scene.background = new THREE.Color(i % 2 === Math.floor(i / 4) % 2 ? 0x1D1C20 : 0x201F24);
  scene.environment = env; scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xdfe4ef, 0x1a1a1e, 0.9));
  const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(4, 8, 6); scene.add(k);
  const r1 = new THREE.DirectionalLight(0xF569A8, 0.9); r1.position.set(-6, 3, -5); scene.add(r1);
  const r2 = new THREE.DirectionalLight(0xDEFF72, 0.9); r2.position.set(6, 3, -5); scene.add(r2);
  const v = createView(d); const f = new Fighter(d, 0); f.x = 0; f.z = 0; f.yaw = -0.55; v.cele = 0;
  scene.add(v.root);
  for (let t = 0; t < 40; t++) v.update(f, 1 / 60, null);
  v.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(v.root); const size = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(28, CW / CH, 0.05, 200);
  const hgt = Math.max(size.y, size.x * CH / CW * 1.05, size.z * 0.75);
  const dist = (hgt * 0.62) / Math.tan(THREE.MathUtils.degToRad(14));
  cam.position.set(ctr.x + dist * 0.28, ctr.y + dist * 0.2, ctr.z + dist); cam.lookAt(ctr.x, ctr.y - size.y * 0.02, ctr.z);
  cells.push({ scene, cam, v, f });
  const col = i % 4, row = Math.floor(i / 4);
  const el = document.createElement('div'); el.className = 'lab'; el.style.left = col * CW + 'px'; el.style.top = 80 + row * CH + 'px';
  el.innerHTML = `<div class="t">${sc.cn}<i>${d.formCn}</i></div><div class="n">${String(i + 1).padStart(2, '0')}</div>
    <div class="sw"><b style="background:${sc.p}"></b><b style="background:${sc.s}"></b><b style="background:${sc.m}"></b><b style="background:${sc.a}"></b>
    <b class="g" style="background:${sc.e}"></b>${sc.e2 ? `<b class="g" style="background:${sc.e2}"></b>` : ''}<span>主 / 副 / 金属 / 细节 · 发光</span></div>`;
  labs.appendChild(el);
}

function draw() {
  cells.forEach((c, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = col * CW, y = H - (row + 1) * CH;
    R.setViewport(x, y, CW, CH); R.setScissor(x, y, CW, CH);
    R.render(c.scene, c.cam);
  });
}
draw(); setTimeout(() => { draw(); window.__ready = true; }, 600);
