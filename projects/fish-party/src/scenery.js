// 场景点缀（v1.2 柔和版：自然沙色+灰绿植被小岛、雾粉火烈鸟/黄油黄鸭子/陶土甜甜圈泳圈、柔色热气球；色值取自 style.js SOFT）
// v1.0：糖果色小岛 + 棒棒糖树、彩色帆船、海鸥、糖果浮标、
// 海上漂浮的充气火烈鸟 / 小黄鸭 / 甜甜圈泳圈 / 沙滩球、远处热气球。
// 漂浮道具按船的本地方位摆放：避开右舷钓鱼视线扇区（+x），只放在左舷/船头船尾远处，不挡浮漂。
import * as THREE from 'three';
import { SOFT, SOFT_MAT } from './style.js';
import { waterHeight } from './waves.js';
import { mergeVertices } from '../vendor/addons/utils/BufferGeometryUtils.js';

function hash(n) { return (Math.sin(n) * 43758.5453) % 1; }
function noise3(x, y, z) {
  // 便宜的值噪声叠加（只在建模时用一次）
  return (Math.sin(x * 1.7 + Math.sin(z * 1.3)) + Math.sin(z * 2.1 + Math.sin(x * 0.7 + y)) + Math.sin((x + z) * 3.3 + y * 2.0) * 0.5) / 2.5;
}

function makeIsland(radius, height, seed) {
  let geo = new THREE.IcosahedronGeometry(1, 5);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  const col = [];
  const sand = new THREE.Color(SOFT.sand), grass = new THREE.Color(SOFT.sage), forest = new THREE.Color(SOFT.sageDeep), rock = new THREE.Color(SOFT.stone);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise3(x * 2 + seed, y * 2, z * 2 - seed) * 0.35 + noise3(x * 5 - seed, y * 5, z * 5) * 0.12;
    const r = 1 + n;
    x *= r; z *= r;
    y = y > 0 ? Math.pow(y, 1.35) * (1 + n * 1.3) : y * 0.2;
    p.setXYZ(i, x * radius, y * height, z * radius);
    const h = y;
    if (h < 0.05) c.copy(sand);
    else if (h < 0.35) c.copy(grass).lerp(forest, (h - 0.05) / 0.3);
    else c.copy(forest).lerp(rock, Math.min(1, (h - 0.35) / 0.5));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  return m;
}

function makeSailboat() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: SOFT.cream, roughness: 0.65 });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 6, 6, 16), white);
  hull.rotation.x = Math.PI / 2; hull.scale.set(1, 1, 0.5); g.add(hull);
  const sailM = new THREE.MeshStandardMaterial({ color: '#fbf6ee', roughness: 0.85, side: THREE.DoubleSide });
  const s1 = new THREE.Shape(); s1.moveTo(0, 0); s1.lineTo(0, 11); s1.lineTo(4.2, 0.6); s1.lineTo(0, 0);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(s1), sailM); sail.position.set(0, 1, -0.6); sail.rotation.y = Math.PI / 2 + 0.4; g.add(sail);
  const s2 = new THREE.Shape(); s2.moveTo(0, 0); s2.lineTo(0, 9); s2.lineTo(-3, 0.5); s2.lineTo(0, 0);
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(s2), new THREE.MeshStandardMaterial({ color: SOFT.blue, roughness: 0.85, side: THREE.DoubleSide })); jib.position.set(0, 1, -0.4); jib.rotation.y = Math.PI / 2 + 0.4; g.add(jib);
  return g;
}

function makeGull() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f7f3ec', roughness: 0.8 });
  const grey = new THREE.MeshStandardMaterial({ color: '#a69d94', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), white); body.rotation.x = Math.PI / 2; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), white); head.position.set(0, 0.04, 0.25); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 6), new THREE.MeshStandardMaterial({ color: SOFT.terra, roughness: 0.7 })); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.03, 0.34); g.add(beak);
  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.06, 0.03, 0.02); g.add(pivot);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.18), white); w.position.x = sx * 0.25; pivot.add(w);
    const tipPivot = new THREE.Group(); tipPivot.position.x = sx * 0.5; pivot.add(tipPivot);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.01, 0.13), grey); tip.position.x = sx * 0.18; tipPivot.add(tip);
    wings.push({ pivot, tipPivot, sx });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, wings, phase: Math.random() * 10 };
}

function makeBuoy() {
  // v1.2：圆润的车削浮标（陶土 + 奶油两色），去掉硬边圆柱
  const g = new THREE.Group();
  const terra = new THREE.MeshStandardMaterial({ color: SOFT.terra, roughness: 0.62 });
  const cream = new THREE.MeshStandardMaterial({ color: SOFT.cream, roughness: 0.62 });
  const prof = (pts) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const base = new THREE.Mesh(prof([[0, -0.4], [0.72, -0.4], [0.88, -0.3], [0.92, -0.1], [0.86, 0.25], [0.7, 0.4], [0, 0.42]]), terra); g.add(base);
  const band = new THREE.Mesh(prof([[0, 0.36], [0.6, 0.36], [0.64, 0.45], [0.6, 0.8], [0.52, 0.86], [0, 0.86]]), cream); g.add(band);
  const cone = new THREE.Mesh(prof([[0, 0.8], [0.52, 0.8], [0.5, 0.95], [0.3, 1.55], [0.12, 1.85], [0, 1.9]]), terra); g.add(cone);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe6b8', emissiveIntensity: 1.5 })); lamp.position.y = 2.0; g.add(lamp);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, lamp };
}


// ---------- 派对道具 ----------
const PM = {};
function pmat(key, color, rough = 0.62) { return PM[key] || (PM[key] = new THREE.MeshStandardMaterial({ color, roughness: rough })); }
// v1.2：充气物统一柔亮 sheen 材质（哑光微绒，柔和高光）
function imat(key, color) {
  if (PM[key]) return PM[key];
  const m = new THREE.MeshPhysicalMaterial({ color, ...SOFT_MAT.inflat, sheenColor: new THREE.Color('#fff7ef') });
  m.userData.fuzz = 0.7;
  return (PM[key] = m);
}

function makeFlamingo() {
  const g = new THREE.Group();
  const pink = imat('rose', SOFT.roseLight), yel = pmat('butter', SOFT.butter), ink = pmat('ink', SOFT.ink, 0.6), white = pmat('white', SOFT.cream);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.36, 18, 40), pink); ring.rotation.x = Math.PI / 2; g.add(ring);
  const neckCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.15, 0.75), new THREE.Vector3(0, 0.9, 0.95), new THREE.Vector3(0, 1.55, 0.6), new THREE.Vector3(0, 1.85, 0.85)]);
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 24, 0.19, 12), pink); g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), pink); head.position.set(0, 1.92, 0.88); g.add(head);
  const beak = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 12), yel); beak.position.set(0, 1.82, 1.18); beak.rotation.x = 2.1; g.add(beak);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), ink); tip.position.set(0, 1.68, 1.3); tip.rotation.x = 2.1; g.add(tip);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), white); e.position.set(sx * 0.2, 2.0, 1.0); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 6), ink); p.position.set(sx * 0.235, 2.0, 1.06); g.add(p);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), pink); tail.scale.set(0.8, 0.7, 1.2); tail.position.set(0, 0.32, -0.9); tail.rotation.x = -0.6; g.add(tail);
  return g;
}

function makeDuck() {
  const g = new THREE.Group();
  const yel = imat('butterI', SOFT.butter), org = pmat('terra', SOFT.terra), ink = pmat('ink', SOFT.ink, 0.6), white = pmat('white', SOFT.cream);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.35, 18, 40), yel); ring.rotation.x = Math.PI / 2; g.add(ring);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 18), yel); head.position.set(0, 0.62, 0.78); g.add(head);
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), org); beak.scale.set(1.2, 0.45, 1); beak.position.set(0, 0.55, 1.18); g.add(beak);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), white); e.position.set(sx * 0.2, 0.78, 1.12); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), ink); p.position.set(sx * 0.22, 0.79, 1.2); g.add(p);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), yel); tail.scale.set(0.8, 0.75, 1.15); tail.position.set(0, 0.38, -0.88); tail.rotation.x = -0.7; g.add(tail);
  return g;
}

function makeDonut() {
  const g = new THREE.Group();
  const dough = imat('dough', SOFT.terraLight), icing = imat('icing', '#f1d2c8');   // 陶土面团 + 奶油粉糖霜
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.36, 18, 40), dough); ring.rotation.x = Math.PI / 2; g.add(ring);
  const top = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.33, 14, 40, Math.PI * 2), icing); top.rotation.x = Math.PI / 2; top.scale.set(1.04, 1.04, 0.8); top.position.y = 0.09; g.add(top);
  // 糖粒：InstancedMesh 一次绘制
  const sprG = new THREE.CapsuleGeometry(0.025, 0.09, 2, 4);
  const spr = new THREE.InstancedMesh(sprG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), 26);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const cols = [SOFT.butter, SOFT.mint, SOFT.blue, SOFT.cream, SOFT.lav];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7.1) * 0.2, r = 0.8 + Math.sin(i * 3.3) * 0.2;
    e.set(Math.PI / 2, 0, a * 3.0 + i); q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.cos(a) * r, 0.37, Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1));
    spr.setMatrixAt(i, m); spr.setColorAt(i, c.set(cols[i % cols.length]));
  }
  g.add(spr);
  return g;
}

function makeBeachBall() {
  const geo = new THREE.SphereGeometry(0.42, 24, 16);
  const p = geo.attributes.position, col = [], c = new THREE.Color();
  const cols = [SOFT.rose, SOFT.cream, SOFT.butter, SOFT.cream, SOFT.blue, SOFT.cream];
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)); const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 6) % 6;
    c.set(Math.abs(p.getY(i)) > 0.38 ? SOFT.cream : cols[k]); col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const bm = new THREE.MeshPhysicalMaterial({ vertexColors: true, ...SOFT_MAT.inflat, sheenColor: new THREE.Color('#fff7ef') }); bm.userData.fuzz = 0.6;
  return new THREE.Mesh(geo, bm);
}

function makeHotAirBalloon(colors) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 24, 18);
  const p = geo.attributes.position, col = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = y < 0 ? 1 - Math.pow(-y, 1.6) * 0.62 : 1;   // 下窄上圆
    p.setXYZ(i, x * k, y * 1.15, z * k);
    const a = Math.atan2(z, x); const s = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % colors.length;
    c.set(colors[s]); col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const env = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }));
  env.scale.setScalar(9); g.add(env);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.1, 1.6, 16), pmat('basket', SOFT.wood, 0.85)); basket.position.y = -14.5; g.add(basket);
  return g;
}

function makeLollipopTree(h, color) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, h, 10), pmat('stick', SOFT.woodDeep, 0.85)); stick.position.y = h / 2; g.add(stick);
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.36, 3), pmat('tree' + color, color, 0.85));   // v1.2：圆润蓬松树冠 top.position.y = h + h * 0.2; g.add(top);
  return g;
}

export function createScenery(scene) {
  const islands = [
    [-900, -1300, 420, 120, 1.3],
    [-1450, -400, 260, 75, 4.1],
    [1100, -1500, 520, 160, 7.7],
    [1700, 300, 300, 60, 2.2],
    [-300, 1800, 600, 140, 5.5],
  ];
  for (const [x, z, r, h, s] of islands) {
    const m = makeIsland(r, h, s);
    m.position.set(x, -4, z);
    m.rotation.y = s;
    scene.add(m);
  }
  // 近一点的糖果小岛 + 棒棒糖树（低面数，远景点缀）
  const treeCols = [SOFT.sage, SOFT.sageDeep, SOFT.mint, '#c9cf9e', SOFT.sage];   // 灰绿植被为主，一棵淡黄绿
  for (const [x, z, r, h, s, nt] of [[-260, -420, 70, 22, 9.1, 5], [380, -300, 55, 16, 3.3, 4], [-420, 260, 60, 18, 6.6, 4]]) {
    const m = makeIsland(r, h, s); m.position.set(x, -1.5, z); m.rotation.y = s; scene.add(m);
    for (let k = 0; k < nt; k++) {
      const a = k * 2.4 + s, rr = r * (0.15 + 0.35 * ((k * 0.37) % 1));
      const t = makeLollipopTree(9 + (k % 3) * 3, treeCols[(k + Math.round(s)) % treeCols.length]);
      t.position.set(x + Math.cos(a) * rr, h * 0.55 - 1.5, z + Math.sin(a) * rr); scene.add(t);
    }
  }
  // 远处热气球
  const balloons = [];
  for (const [x, y, z, cols, sc] of [[-320, 75, -520, [SOFT.rose, SOFT.cream, SOFT.butter], 1.1], [460, 95, -380, [SOFT.mint, SOFT.cream, SOFT.blue], 1.0], [180, 60, 520, [SOFT.terra, SOFT.cream, SOFT.butter], 0.9]]) {
    const b = makeHotAirBalloon(cols); b.position.set(x, y, z); b.scale.setScalar(sc); scene.add(b); balloons.push({ g: b, y, ph: x * 0.01 });
  }
  // 漂浮充气道具：按船的本地坐标（+x = 右舷钓鱼方向）摆放，避开右舷扇区
  const floats = [
    { g: makeFlamingo(), lx: -11, lz: 6.5, s: 1.25, ry: 0.6 },     // 左舷前方
    { g: makeDuck(), lx: -8.5, lz: -9.5, s: 1.15, ry: 2.2 },      // 左舷后方
    { g: makeDonut(), lx: -3.5, lz: -17, s: 1.2, ry: 0 },         // 船尾远处
    { g: makeBeachBall(), lx: -6.2, lz: -12.5, s: 1.0, ry: 0 },   // 鸭子旁边
    { g: makeFlamingo(), lx: 26, lz: 30, s: 1.4, ry: -2.2 },      // 右舷远方背景（远小，不挡浮漂）
    { g: makeDuck(), lx: 4, lz: 22, s: 1.2, ry: 3.6 },           // 船头前方
  ];
  for (const f of floats) { f.g.scale.setScalar(f.s); f.ph = f.lx * 0.37 + f.lz * 0.11; f.g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); scene.add(f.g); }
  let yacht = null;
  const fv = new THREE.Vector3();
  const sail = makeSailboat();
  sail.position.set(-260, 0, -330);
  scene.add(sail);
  const sail2 = makeSailboat();
  sail2.position.set(420, 0, -620); sail2.scale.setScalar(0.9); sail2.rotation.y = 2.4;
  scene.add(sail2);

  const gulls = [];
  for (let i = 0; i < 6; i++) { const gl = makeGull(); gl.r = 14 + i * 4.5; gl.h = 9 + (i % 3) * 4; gl.speed = 0.12 + (i % 2) * 0.05; gl.dir = i % 2 ? 1 : -1; scene.add(gl.g); gulls.push(gl); }

  const buoy = makeBuoy();
  buoy.g.position.set(34, 0, -26);
  scene.add(buoy.g);

  return {
    buoy,
    floats,
    update(t, center) {
      // 漂浮道具：跟着船走（船基本不动），在本地位置附近慢慢打转 + 随浪起伏
      if (!yacht) { let r = scene; yacht = r.getObjectByName('yacht'); }
      const yaw = yacht ? yacht.rotation.y : 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
      for (const f of floats) {
        const lx = f.lx + Math.sin(t * 0.07 + f.ph) * 1.2, lz = f.lz + Math.cos(t * 0.05 + f.ph) * 1.2;
        fv.set(center.x + lx * cy + lz * sy, 0, center.z - lx * sy + lz * cy);
        const wy = waterHeight(fv.x, fv.z, t);
        f.g.position.set(fv.x, THREE.MathUtils.lerp(f.g.position.y || wy, wy - 0.12 * f.s, 0.15), fv.z);
        const dx = waterHeight(fv.x + 0.8, fv.z, t) - waterHeight(fv.x - 0.8, fv.z, t), dz = waterHeight(fv.x, fv.z + 0.8, t) - waterHeight(fv.x, fv.z - 0.8, t);
        f.g.rotation.set(dz * 0.5, yaw + f.ry + Math.sin(t * 0.2 + f.ph) * 0.4, -dx * 0.5, 'YXZ');
      }
      for (const b of balloons) b.g.position.y = b.y + Math.sin(t * 0.15 + b.ph) * 4;
      sail.position.x = -260 + t * 0.6;
      sail.position.y = waterHeight(sail.position.x, sail.position.z, t) - 0.2;
      sail.rotation.z = Math.sin(t * 0.6) * 0.05;
      sail2.position.y = waterHeight(sail2.position.x, sail2.position.z, t) - 0.2;
      sail2.rotation.z = Math.sin(t * 0.5 + 1) * 0.05;
      const by = waterHeight(buoy.g.position.x, buoy.g.position.z, t);
      buoy.g.position.y = THREE.MathUtils.lerp(buoy.g.position.y, by - 0.35, 0.1);
      buoy.g.rotation.z = Math.sin(t * 0.9) * 0.08; buoy.g.rotation.x = Math.sin(t * 0.7 + 1) * 0.07;
      buoy.lamp.material.emissiveIntensity = (Math.sin(t * 2.0) > 0.85 ? 2.2 : 0.4);
      for (const gl of gulls) {
        const a = t * gl.speed * gl.dir + gl.phase;
        const x = center.x + Math.cos(a) * gl.r, z = center.z + Math.sin(a) * gl.r;
        const y = gl.h + Math.sin(t * 0.5 + gl.phase) * 1.2;
        gl.g.position.set(x, y, z);
        gl.g.rotation.set(0, -a * 1 - (gl.dir > 0 ? 0 : Math.PI), gl.dir * 0.35);
        const flap = Math.sin(t * 5 + gl.phase);
        const glide = (Math.sin(t * 0.7 + gl.phase) > 0.2) ? 0.15 : 1;
        for (const w of gl.wings) { w.pivot.rotation.z = w.sx * flap * 0.55 * glide + w.sx * 0.08; w.tipPivot.rotation.z = w.sx * flap * 0.35 * glide; }
      }
    },
  };
}
