// 胜者环绕镜头 + 用户拖动抖动测试：统计相机 yaw 帧间增量的符号翻转次数（抖动 = 来回反复）
// 用法：node tools/wincamtest.mjs [director.js 路径]
import * as THREE from 'three';
const path = process.argv[2] || '../src/game/director.js';
const { Director } = await import(path);
let now = 0; globalThis.performance = { now: () => now };
const H = {}; const dom = { addEventListener: (n, f) => (H[n] = f), setPointerCapture() {} };
const cam = new THREE.PerspectiveCamera(50, 0.5, 0.1, 500);
const d = new Director(cam, dom);
const f = { x: 0, y: 0, z: 0, yaw: 0.3 }; const v = { height: 4, anchorWorld: () => new THREE.Vector3(0, 3, 0) };
d.setMode('winner', { f, v });
const dt = 1 / 60; const yaws = [];
let px = 200;
for (let i = 0; i < 600; i++) {
  now += dt * 1000;
  if (i === 120) H.pointerdown({ pointerId: 1, clientX: px, clientY: 300 });
  if (i > 120 && i < 240) { px += 3; H.pointermove({ pointerId: 1, clientX: px, clientY: 300 }); }
  if (i === 240) H.pointerup({ pointerId: 1 });
  d.update(dt, dt, [{ f, v }]);
  yaws.push(Math.atan2(cam.position.x, cam.position.z));
}
const flips = (a, b) => { let n = 0, prev = 0; for (let i = a + 1; i < b; i++) { const dd = yaws[i] - yaws[i - 1]; if (Math.abs(dd) < 1e-5) continue; const s = Math.sign(dd); if (prev && s !== prev) n++; prev = s; } return n; };
let maxJump = 0; for (let i = 121; i < 600; i++) maxJump = Math.max(maxJump, Math.abs(yaws[i] - yaws[i - 1]));
console.log(JSON.stringify({ dragFlips: flips(121, 240), afterFlips: flips(241, 600), maxStep: +maxJump.toFixed(4), endYawDelta: +(yaws[599] - yaws[119]).toFixed(3) }));
