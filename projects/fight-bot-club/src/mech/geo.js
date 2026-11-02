// 几何体工具：圆角盒 / 锥化 / 倒角装甲板 / 管路，以及按骨骼 × 材质合并（大幅减少 draw call）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

export function rbox(w, h, d, r = 0.06, seg = 2) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(0.002, r));
}
export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function cyl(rt, rb, h, seg = 16, open = false) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); }
export function sph(r, ws = 16, hs = 12, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) { return new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl); }
export function tor(r, t, rs = 8, ts = 24, arc = Math.PI * 2) { return new THREE.TorusGeometry(r, t, rs, ts, arc); }
export function cone(r, h, seg = 12) { return new THREE.ConeGeometry(r, h, seg); }
export function lathe(pts, seg = 16) { return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg); }

// 锥化：按 y 归一化插值缩放 x/z，并可沿 z 偏移（做出斜面、楔形）
export function taper(g, topX = 1, topZ = 1, shiftZ = 0, botX = 1, botZ = 1) {
  g.computeBoundingBox(); const bb = g.boundingBox; const h = bb.max.y - bb.min.y || 1;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - bb.min.y) / h;
    p.setX(i, p.getX(i) * THREE.MathUtils.lerp(botX, topX, t));
    p.setZ(i, p.getZ(i) * THREE.MathUtils.lerp(botZ, topZ, t) + shiftZ * t);
  }
  g.computeVertexNormals(); return g;
}

// 倒角装甲板：2D 轮廓 → 挤出，带一圈倒角（读起来像真正“设计过”的装甲）
export function plate(pts, depth = 0.08, bevel = 0.025) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -depth / 2); g.computeVertexNormals();
  return g;
}

// 两点之间的圆柱（液压杆 / 管线）
export function rod(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B); const g = cyl(r, r, len, seg);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

export function xform(g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e);
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
  g.applyMatrix4(_m);
  return g;
}

// —— 部件收集器：parts[boneName][matKey] = [geometry...]
export class PartSet {
  constructor() { this.parts = new Map(); this.solo = []; }
  add(bone, key, g, pos, rot, scl) {
    xform(g, pos, rot, scl);
    let b = this.parts.get(bone); if (!b) { b = new Map(); this.parts.set(bone, b); }
    let arr = b.get(key); if (!arr) { arr = []; b.set(key, arr); }
    arr.push(g); return g;
  }
  // 左右镜像（x 取反，需翻转面朝向）
  addMirror(boneL, boneR, key, gFactory, pos, rot = [0, 0, 0], scl = [1, 1, 1]) {
    this.add(boneL, key, gFactory(), pos, rot, scl);
    this.add(boneR, key, gFactory(), [-pos[0], pos[1], pos[2]], [rot[0], -rot[1], -rot[2]], scl);
  }
}

function prepare(g) {
  let ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}

// 烘焙：合并同骨骼同材质几何体；生成 盒投影 UV（统一贴图密度）+ aRest（静止姿态机甲空间坐标，用于全身连贯涂装图案）
export function bake(partSet, bones, mats, restScale = 1, uvDensity = 0.85) {
  const meshes = [];
  const inv = new THREE.Matrix4();
  for (const [boneName, byMat] of partSet.parts) {
    const bone = bones[boneName]; if (!bone) { console.warn('no bone', boneName); continue; }
    const restM = bone.userData.rest; // 骨骼静止姿态相对机甲根节点矩阵
    const nM = new THREE.Matrix3().getNormalMatrix(restM);
    for (const [key, arr] of byMat) {
      const mat = mats[key]; if (!mat) { console.warn('no mat', key); continue; }
      const geo = mergeGeometries(arr.map(prepare), false);
      if (!geo) continue;
      const p = geo.attributes.position, n = geo.attributes.normal;
      const rest = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
      const v = new THREE.Vector3(), nn = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(restM);
        nn.fromBufferAttribute(n, i).applyMatrix3(nM).normalize();
        rest[i * 3] = v.x / restScale; rest[i * 3 + 1] = v.y / restScale; rest[i * 3 + 2] = v.z / restScale;
        const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
        let u, w;
        if (ax >= ay && ax >= az) { u = v.z; w = v.y; } else if (ay >= az) { u = v.x; w = v.z; } else { u = v.x; w = v.y; }
        uv[i * 2] = u * uvDensity; uv[i * 2 + 1] = w * uvDensity;
      }
      geo.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !mat.transparent && !mat.userData.glow; mesh.receiveShadow = false;
      mesh.userData.bone = boneName; mesh.userData.mat = key;
      bone.add(mesh); meshes.push(mesh);
    }
  }
  for (const b of partSet.parts.values()) for (const arr of b.values()) for (const g of arr) g.dispose();
  return meshes;
}
