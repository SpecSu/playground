// 分身（驾驶员）：加载 12 个优化后的 GLB → 自动摆成「坐姿握杆」→ 挂到机甲驾驶舱座位
// 骨骼命名统一（hips/spine/chest/neck/head/upperArm_L/forearm_L/thigh_L/shin_L…），
// 姿势用「世界方向瞄准」求解，与各模型骨骼本地轴向无关。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { damp, clamp } from '../core/util.js';

export const AVATARS = [
  { id: 'a01', name: '奶蛙', color: '#9be36b' },
  { id: 'a02', name: '牛来', color: '#f2b45a' },
  { id: 'a03', name: '肥嘟嘟', color: '#ff9ec7' },
  { id: 'a04', name: '喵脆角', color: '#ffd166' },
  { id: 'a05', name: '香蕉猫', color: '#ffe14d' },
  { id: 'a06', name: '外星猫', color: '#7fe7ff' },
  { id: 'a07', name: '刀盾狗', color: '#c8a27a' },
  { id: 'a08', name: '苏贝壳', color: '#ffb3a7' },
  { id: 'a09', name: 'Jiaxin', color: '#b9a6ff' },
  { id: 'a10', name: 'LX', color: '#8fd3ff' },
  { id: 'a11', name: 'Rummons', color: '#ff8a65' },
  { id: 'a12', name: '吉吉', color: '#a5f3a1' },
];
// 暂时隐藏的分身（数据保留，序号不变；删掉对应 id 即可恢复显示）
export const HIDDEN_AVATARS = new Set([
  'a03', // 肥嘟嘟
  'a05', // 香蕉猫
  'a06', // 外星猫
]);
export const avatarVisible = (i) => !HIDDEN_AVATARS.has(AVATARS[i]?.id);

const BASE = (import.meta.env?.BASE_URL || './');
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();   // idx -> Promise<{scene, H}>

const SEAT_H = 1.08;       // 站立身高归一（机甲本地单位）
// 座舱可用空间（机甲驾驶舱本地单位）：臀部以上高、左右宽（含握杆的手）、前后深、靠背 z
const FIT = { h: 0.66, w: 0.9, d: 0.66, back: -0.25 };

// 蒙皮后的包围盒（抽样顶点，root 空间）
const _v = new THREE.Vector3();
function posedBox(root) {
  const box = new THREE.Box3(); root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.parent ? root.parent.matrixWorld : new THREE.Matrix4()).invert();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position; if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 1500));
    if (o.isSkinnedMesh) o.skeleton.update();
    for (let i = 0; i < pos.count; i += step) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, _v); else _v.fromBufferAttribute(pos, i);
      _v.applyMatrix4(o.matrixWorld).applyMatrix4(inv); box.expandByPoint(_v);
    }
  });
  return box;
}

export function loadAvatar(idx) {
  if (cache.has(idx)) return cache.get(idx);
  const p = new Promise((res, rej) => {
    loader.load(`${BASE}avatars/${AVATARS[idx].id}.glb`, (g) => {
      const sc = g.scene;
      sc.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false; o.castShadow = true; o.receiveShadow = false;
          const m = o.material; if (m) { m.roughness = Math.max(0.45, m.roughness ?? 0.6); m.metalness = Math.min(0.1, m.metalness ?? 0); m.envMapIntensity = 0.8; }
        }
      });
      const box = new THREE.Box3().setFromObject(sc);
      res({ scene: sc, H: box.max.y - box.min.y, minY: box.min.y });
    }, undefined, rej);
  });
  cache.set(idx, p);
  return p;
}
export function preloadAll() { return Promise.all(AVATARS.map((_, i) => loadAvatar(i).catch(() => null))); }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion();
// 旋转 bone 使「bone → child」在世界中指向 dir
function aim(bone, child, dir) {
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize();
  _q.setFromUnitVectors(cur, dir.clone().normalize());
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qw));
  bone.updateWorldMatrix(false, true);
}

// 分身头部包围盒（世界坐标）：取颈部骨骼以上的蒙皮顶点，用于头像统一以「脸」为焦点取景
export function riderHeadBox(rider) {
  const B = rider.B; const model = rider.model; model.updateMatrixWorld(true);
  const ny = new THREE.Vector3(); (B.neck || B.head || model).getWorldPosition(ny);
  const box = new THREE.Box3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position; if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 3000));
    if (o.isSkinnedMesh) o.skeleton.update();
    for (let i = 0; i < pos.count; i += step) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, _v); else _v.fromBufferAttribute(pos, i);
      _v.applyMatrix4(o.matrixWorld); if (_v.y >= ny.y) box.expandByPoint(_v);
    }
  });
  return box.isEmpty() ? null : box;
}
export class Rider {
  constructor(src, idx) {
    this.idx = idx;
    this.root = new THREE.Group(); this.root.name = 'rider';
    const model = SkeletonUtils.clone(src.scene);
    this.model = model;
    this.root.add(model);
    const B = this.B = {};
    model.traverse((o) => { if (o.isBone) B[o.name] = o; });
    model.scale.setScalar(SEAT_H / src.H);
    model.updateMatrixWorld(true);
    // —— 坐姿（世界方向，模型面向 +Z）
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    aim(B.thigh_L, B.shin_L, V(0.12, -0.12, 1)); aim(B.thigh_R, B.shin_R, V(-0.12, -0.12, 1));
    aim(B.shin_L, B.foot_L, V(0.05, -1, 0.22)); aim(B.shin_R, B.foot_R, V(-0.05, -1, 0.22));
    aim(B.upperArm_L, B.forearm_L, V(0.45, -0.85, 0.25)); aim(B.upperArm_R, B.forearm_R, V(-0.45, -0.85, 0.25));
    aim(B.forearm_L, B.hand_L, V(0.15, -0.1, 1)); aim(B.forearm_R, B.hand_R, V(-0.15, -0.1, 1));
    model.updateMatrixWorld(true);
    // —— 用「蒙皮后」的真实坐姿包围盒做二次归一：圆滚滚的大头角色也要塞进 0.6 宽的座舱
    const bb = posedBox(model);
    const hp = new THREE.Vector3(); (B.hips || model).getWorldPosition(hp);
    const sz = bb.getSize(new THREE.Vector3());
    const k = Math.min(1, FIT.h / Math.max(1e-3, bb.max.y - hp.y), FIT.w / sz.x, FIT.d / sz.z);
    model.scale.multiplyScalar(k);
    // 臀部落座垫；身体后沿贴靠背（而不是臀部对齐）
    model.position.set(-hp.x * k, 0.05 - hp.y * k, FIT.back - bb.min.z * k);
    this.fit = { k, w: sz.x * k, h: (bb.max.y - hp.y) * k, d: sz.z * k };
    // 记录静止姿态，用于叠加动画
    this.rest = {};
    for (const n of ['spine', 'chest', 'neck', 'head', 'upperArm_L', 'upperArm_R', 'forearm_L', 'forearm_R', 'hips']) if (B[n]) this.rest[n] = B[n].quaternion.clone();
    this.t = Math.random() * 10; this.cheer = 0; this.slump = 0; this.lean = 0; this.look = 0; this.shake = 0;
  }
  // f: Fighter, mech: MechView
  update(dt, f, mech) {
    this.t += dt; const t = this.t, B = this.B, R = this.rest;
    const cheering = mech.cele > 0 && f.alive;
    this.cheer = damp(this.cheer, cheering ? 1 : 0, 6, dt);
    this.slump = damp(this.slump, f.alive ? 0 : 1, 3, dt);
    const fwd = f.localV ? clamp(f.localV.f / 6, -1, 1) : 0;
    this.lean = damp(this.lean, fwd * 0.25 + (f.act && f.act.type.startsWith('ult') ? 0.25 : 0), 5, dt);
    this.shake = damp(this.shake, 0, 8, dt);
    if (mech.recoil > 0.5) this.shake = Math.max(this.shake, mech.recoil * 0.4);
    const rot = (n, x, y, z) => { if (!B[n] || !R[n]) return; _q.setFromEuler(new THREE.Euler(x, y, z)); B[n].quaternion.copy(R[n]).multiply(_q); };
    const bob = Math.sin(t * 2.6) * 0.03;
    rot('spine', this.lean * 0.5 + this.slump * 0.5, 0, Math.sin(t * 17) * this.shake * 0.2);
    rot('chest', bob + this.lean * 0.4 - this.cheer * 0.2, Math.sin(t * 3) * 0.2 * this.cheer, 0);
    rot('head', -bob + this.slump * 0.6, Math.sin(t * 0.7) * 0.25 * (1 - this.cheer), this.cheer * Math.sin(t * 6) * 0.2);
    // 欢呼：双手举起挥舞（在静止姿态上叠加绕局部轴的大幅旋转，具体方向由试验确定）
    const c = this.cheer;
    if (c > 0.01) {
      const w = Math.sin(t * 9) * 0.35;
      rot('upperArm_L', 0, 0, (-2.0 + w) * c); rot('upperArm_R', 0, 0, (2.0 + w) * c);
      rot('forearm_L', 0, 0, -0.6 * c); rot('forearm_R', 0, 0, 0.6 * c);
    } else {
      const jig = Math.sin(t * 11) * 0.04 * (f.act ? 1 : 0.2);
      rot('upperArm_L', jig, 0, 0); rot('upperArm_R', -jig, 0, 0);
      rot('forearm_L', 0, 0, 0); rot('forearm_R', 0, 0, 0);
    }
  }
}

export async function makeRider(idx) {
  const src = await loadAvatar(idx);
  return new Rider(src, idx);
}

// 头像缩略图（离屏渲染一次，供选择器/血条使用）
export async function renderThumbs(renderer, size = 128) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 3); scene.add(dl);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const buf = new Uint8Array(size * size * 4);
  const out = [];
  const prevTarget = renderer.getRenderTarget(); const prevClear = renderer.getClearColor(new THREE.Color()); const prevAlpha = renderer.getClearAlpha();
  for (let i = 0; i < AVATARS.length; i++) {
    let src; try { src = await loadAvatar(i); } catch (e) { out.push(null); continue; }
    const m = SkeletonUtils.clone(src.scene); const s = 1 / src.H; m.scale.setScalar(s); m.position.y = -src.minY * s;
    m.rotation.y = -0.35; scene.add(m);
    cam.position.set(0, 0.78, 1.95); cam.lookAt(0, 0.72, 0);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    out.push(canvas.toDataURL('image/png'));
    scene.remove(m);
  }
  renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  return out;
}
