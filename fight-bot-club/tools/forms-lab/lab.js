import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { generateDesign, FORM_LIST } from '../../src/mech/design.js';
import { createView } from '../../src/mech/forms.js';
import { Fighter } from '../../src/game/sim.js';
const QS = new URLSearchParams(location.search);
const SEED = +(QS.get('seed') || 9);
const YAW = +(QS.get('yaw') || -0.6);
const ONLY = QS.get('forms') ? QS.get('forms').split(',') : FORM_LIST;
const ACT = QS.get('act'); const EL = +(QS.get('el') || 0.22);

const W = 1600, H = 1110, CW = 400, CH = 370;
const canvas = document.getElementById('c');
const R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
R.setPixelRatio(1); R.setSize(W, H); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 0.98;
R.setScissorTest(true);
const pm = new THREE.PMREMGenerator(R);
const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
const PROMPTS = ['重装突击 铁拳', '机械猎犬 双刀', '多足潜行 电锯', '履带重炮 加特林', '远程炮台 导弹', '莽夫斗士 利爪', '堡垒 臂炮', '刺客 螺旋钻头', '莽夫 重锤', '狙击手 激光枪', '拳击手 火焰喷射', '忍者 双刀'];
const labs = document.getElementById('labs');
const cells = [];
ONLY.forEach((form, i) => {
  const d = generateDesign(PROMPTS[i % 12] + ' #' + (SEED * 7919 + i * 131), 'lab', { form });
  const scene = new THREE.Scene(); scene.background = new THREE.Color((i + Math.floor(i / 4)) % 2 ? 0x1D1C20 : 0x201F24);
  scene.environment = env; scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0x8fa6ff, 0x1a1020, 0.7));
  const k = new THREE.DirectionalLight(0xfff1e0, 2.4); k.position.set(4, 8, 6); scene.add(k);
  const r1 = new THREE.DirectionalLight(0xF569A8, 0.9); r1.position.set(-6, 3, -5); scene.add(r1);
  const r2 = new THREE.DirectionalLight(0xDEFF72, 0.9); r2.position.set(6, 3, -5); scene.add(r2);
  const fl = new THREE.DirectionalLight(0x9aa8ff, 0.5); fl.position.set(0, 3, 10); scene.add(fl);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x2a292e, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const v = createView(d); const f = new Fighter(d, 0); f.x = 0; f.z = 0; f.yaw = YAW; f.grounded = true;
  scene.add(v.root);
  for (let t = 0; t < 50; t++) {
    if (ACT) f.act = { type: ACT, t: t / 50 * 0.6, dur: 0.9, data: { hit: 0.4, phase: 1 }, fired: {} };
    v.update(f, 1 / 60, null);
  }
  v.root.updateMatrixWorld(true);
  const box = new THREE.Box3(); v.root.traverse((o) => { if (o.isMesh && o.visible) box.expandByObject(o); });
  const size = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(28, CW / CH, 0.05, 200);
  const hgt = Math.max(size.y, Math.hypot(size.x, size.z) * CH / CW * 0.95);
  const dist = (hgt * 0.6) / Math.tan(THREE.MathUtils.degToRad(14));
  cam.position.set(ctr.x + dist * 0.12, ctr.y + dist * EL, ctr.z + dist); cam.lookAt(ctr.x, ctr.y - size.y * 0.06, ctr.z);
  cells.push({ scene, cam });
  const col = i % 4, row = Math.floor(i / 4);
  const el = document.createElement('div'); el.className = 'lab'; el.style.left = col * CW + 'px'; el.style.top = 80 + row * CH + 'px';
  el.innerHTML = `<div class="t">${d.formCn}<i>${form.toUpperCase()}</i>${['manta', 'tiger', 'turtle', 'croc', 'trex', 'flamingo'].includes(form) ? '<em>NEW</em>' : ''}</div><div class="n">${String(i + 1).padStart(2, '0')}</div>
    <div class="s">${d.name} · ${d.roleCn} · ${d.range === 'ranged' ? '远程' : '近战'} · 大招「${d.moves.ult}」</div>`;
  labs.appendChild(el);
});
function draw() {
  cells.forEach((c, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = col * CW, y = H - (row + 1) * CH;
    R.setViewport(x, y, CW, CH); R.setScissor(x, y, CW, CH);
    R.render(c.scene, c.cam);
  });
}
draw(); setTimeout(() => { draw(); window.__ready = true; }, 600);
