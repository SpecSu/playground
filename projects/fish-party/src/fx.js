// 轻量粒子：水花飞沫 + 彩纸/彩带 + 派对泡泡。单个 InstancedMesh、对象池、零 GC
// 渲染回退：着色跟随 v0.9（toneMapped:true、v0.9 水花/彩纸配色）；保留 v1.0 新增的彩带/泡泡粒子与低画质减半
import * as THREE from 'three';
import { SOFT, SOFT_ACCENTS } from './style.js';

const MAX = 420;
export function createFX(scene, waterHeight) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: true });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.frustumCulled = false;
  mesh.count = MAX;
  scene.add(mesh);
  const P = [];
  for (let i = 0; i < MAX; i++) P.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), g: 9.8, drag: 0, kind: 0, ph: 0 });
  let head = 0, density = 1;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zero = new THREE.Matrix4().makeScale(0, 0, 0), col = new THREE.Color(), sv = new THREE.Vector3();
  for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, zero);
  function spawn() { const p = P[head]; const idx = head; head = (head + 1) % MAX; return [p, idx]; }

  // v0.9 配色
  // v1.2 柔和色板：水花奶白/淡青（不发荧光），彩纸取 SOFT 点缀色 + 奶油白
  const WATER = [new THREE.Color('#fbfaf6'), new THREE.Color('#dcefee'), new THREE.Color('#c3e2e2')];
  const CONF = [...SOFT_ACCENTS, SOFT.cream].map((c) => new THREE.Color(c));
  // 泡泡：近白的淡彩（跟随 v0.9 柔和色调）
  const BUBBLE = ['#f3f6f8', '#eef6f2', '#f4f1f8', '#fdf8ec'].map((c) => new THREE.Color(c));

  return {
    setQuality(q) { density = q === 'low' ? 0.5 : 1; },
    // 水花：at 世界位置，power 0~2
    splash(at, power = 1, n = 26) {
      n = Math.round(n * power * density);
      for (let i = 0; i < n; i++) {
        const [p, idx] = spawn();
        const a = Math.random() * Math.PI * 2, r = Math.random();
        p.kind = 0; p.life = p.max = 0.5 + Math.random() * 0.6;
        p.p.set(at.x + Math.cos(a) * r * 0.25 * power, at.y, at.z + Math.sin(a) * r * 0.25 * power);
        const up = (2.2 + Math.random() * 3.2) * Math.sqrt(power);
        const out = (0.6 + Math.random() * 1.8) * power;
        p.v.set(Math.cos(a) * out, up, Math.sin(a) * out);
        const sz = (0.03 + Math.random() * 0.055) * (0.7 + power * 0.4);
        p.s.set(sz, sz, sz); p.g = 9.8; p.drag = 0.6;
        col.copy(WATER[i % WATER.length]); mesh.setColorAt(idx, col);
      }
      mesh.instanceColor.needsUpdate = true;
    },
    // 彩纸：从 at 向上喷（彩纸片 70% + 长彩带 15% + 派对泡泡 15%）
    // r3：away = 角色正前方（镜头所在一侧）：朝镜头喷的彩纸翻到背后/两侧，并且寿命更短 —— 钓获卡展示时彩纸不再糊在脸上
    confetti(at, n = 90, away = null) {
      n = Math.round(n * density);
      for (let i = 0; i < n; i++) {
        const [p, idx] = spawn();
        let a = Math.random() * Math.PI * 2;
        if (away && Math.cos(a) * away.x + Math.sin(a) * away.z > -0.1) a += Math.PI;
        const roll = Math.random();
        p.ph = Math.random() * 6.28;
        p.p.copy(at);
        if (roll < 0.15) {
          // 泡泡：慢慢往上飘，轻微摇摆，末尾"啵"地放大消失
          p.kind = 2; p.life = p.max = 1.8 + Math.random() * 1.2;
          const sp = 0.6 + Math.random() * 1.0;
          p.v.set(Math.cos(a) * sp, 1.2 + Math.random() * 1.4, Math.sin(a) * sp);
          const sz = 0.045 + Math.random() * 0.05; p.s.set(sz, sz, sz);
          p.g = -0.35; p.drag = 1.4;
          col.copy(BUBBLE[i % BUBBLE.length]);
        } else {
          p.kind = 1; p.life = p.max = away ? 1.6 + Math.random() * 1.0 : 2.2 + Math.random() * 1.4;
          const sp = away ? 2.2 + Math.random() * 2.2 : 1.5 + Math.random() * 2.5;
          p.v.set(Math.cos(a) * sp, 3.5 + Math.random() * 3.5, Math.sin(a) * sp);
          if (roll < 0.3) p.s.set(0.11, 0.006, 0.022).multiplyScalar(0.9 + Math.random() * 0.5);   // 彩带
          else p.s.set(0.055, 0.008, 0.036).multiplyScalar(0.9 + Math.random() * 0.6);            // 彩纸片
          p.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          p.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
          p.g = 3.2; p.drag = 2.4;
          col.copy(CONF[i % CONF.length]);
        }
        mesh.setColorAt(idx, col);
      }
      mesh.instanceColor.needsUpdate = true;
    },
    // r2：收起残留彩纸（放生/下一轮蓄力时），0.4s 内缩小消失，不硬切
    calm(fade = 0.4) {
      for (const p of P) if ((p.kind === 1 || p.kind === 2) && p.life > fade) { p.life = p.max = fade; }
    },
    update(dt, t) {
      for (let i = 0; i < MAX; i++) {
        const p = P[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { mesh.setMatrixAt(i, zero); continue; }
        p.v.y -= p.g * dt;
        p.v.multiplyScalar(Math.exp(-p.drag * dt));
        p.p.addScaledVector(p.v, dt);
        const k = p.life / p.max;
        if (p.kind === 0) {
          const wy = waterHeight(p.p.x, p.p.z, t);
          if (p.p.y < wy && p.v.y < 0) { p.life = 0; mesh.setMatrixAt(i, zero); continue; }
          const s = p.s.x * (0.4 + 0.6 * Math.min(1, k * 2.5));
          q.identity(); m4.compose(p.p, q, sv.set(s, s * (1 + Math.min(Math.abs(p.v.y) * 0.15, 0.8)), s));
        } else if (p.kind === 2) {
          p.p.x += Math.sin(t * 2.6 + p.ph) * dt * 0.25;
          p.p.z += Math.cos(t * 2.1 + p.ph) * dt * 0.25;
          // 末尾 0.15 段：放大后消失（啵）
          const pop = k < 0.12 ? 1 + (0.12 - k) * 6 : Math.min(1, (1 - k) * 8);
          const wob = 1 + Math.sin(t * 9 + p.ph) * 0.06;
          const s = p.s.x * pop * (k < 0.04 ? k / 0.04 : 1);
          q.identity(); m4.compose(p.p, q, sv.set(s * wob, s / wob, s));
        } else {
          p.r.x += p.w.x * dt; p.r.y += p.w.y * dt; p.r.z += p.w.z * dt;
          p.p.x += Math.sin(t * 3 + i) * dt * 0.4;
          q.setFromEuler(p.r);
          const s = Math.min(1, k * 3);
          m4.compose(p.p, q, sv.set(p.s.x * s, p.s.y * s, p.s.z * s));
        }
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
