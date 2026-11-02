var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import * as THREE from "three";
import { buildMarine2 } from "./marine2.js";
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
class Sculpture {
  constructor() {
    __publicField(this, "root", new THREE.Group());
    __publicField(this, "motions", []);
    __publicField(this, "parts", {});
    __publicField(this, "materials", /* @__PURE__ */ new Map());
    __publicField(this, "sphere", new THREE.SphereGeometry(1, 36, 24));
  }
  material(color, metallic = 0, roughness = 0.38) {
    const key = `${color}/${metallic}/${roughness}`;
    let result = this.materials.get(key);
    if (!result) {
      // v3：物理材质（湿润清漆层；鳞片/虹彩/透光由 fishmat.js 按部位注入）
      result = new THREE.MeshPhysicalMaterial({ color, metalness: metallic, roughness: Math.max(roughness, 0.36), clearcoat: 0.6, clearcoatRoughness: 0.28 });
      this.materials.set(key, result);
    }
    return result;
  }
  mesh(name, geometry, color, parent = this.root, metal = 0) {
    const node = new THREE.Mesh(geometry, this.material(color, metal));
    node.name = name;
    node.castShadow = true;
    node.receiveShadow = true;
    parent.add(node);
    this.parts[name] = node;
    return node;
  }
  blob(name, position, scale, color, parent = this.root, metal = 0) {
    const mesh = this.mesh(name, this.sphere, color, parent, metal);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    return mesh;
  }
  group(name, position, parent = this.root) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(...position);
    parent.add(group);
    this.parts[name] = group;
    return group;
  }
  wiggle(node, axis, amplitude, speed, phase = 0) {
    this.motions.push({ node, axis, rest: node.rotation[axis], amplitude, speed, phase });
  }
  fin(name, points, color, position = [0, 0, 0], rotation = [0, 0, 0], parent = this.root, thickness = 0.013) {
    // v3：轮廓样条平滑（不再是折线多边形）+ 更薄 + 鳍条坐标（aFin）供 shader 画放射鳍条/分节/透光
    const shape = new THREE.Shape(smoothOutline(points).map(([x, y]) => new THREE.Vector2(x, y)));
    // r4：真鳍压成薄膜（≈0.4 倍旧厚度，最薄 3.5mm/1.6m 体长）；翼/皮质厚鳍（≥0.04）保持
    const membrane = thickness < 0.04;
    if (membrane) thickness = Math.max(3e-3, thickness * 0.3);
    const bev = membrane ? Math.min(thickness * 0.4, 1.6e-3) : Math.min(thickness * 0.45, 6e-3);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: bev,
      bevelSize: bev,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 4
    });
    geometry.translate(0, 0, -thickness * 0.5);
    finRays(geometry, points, membrane);
    const mesh = this.mesh(name, geometry, color, parent);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    return mesh;
  }
  tube(name, points, radius, color, parent = this.root, radial = 7, segments = 18) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const geometry = new THREE.TubeGeometry(curve, Math.round(segments * 1.6), radius, Math.max(radial, 12), false);
    closeTubeEnds(geometry);
    return this.mesh(name, geometry, color, parent);
  }
  spike(name, base, end, radius, color, parent = this.root) {
    const start = new THREE.Vector3(...base);
    const target = new THREE.Vector3(...end);
    const delta = target.clone().sub(start);
    const mesh = this.mesh(name, new THREE.ConeGeometry(radius, delta.length(), 8), color, parent);
    mesh.position.copy(start).add(target).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
    return mesh;
  }
  body(name, profile, back, belly, metal = 0.08, parent = this.root) {
    const geometry = bodyGeometry(profile, back, belly);
    const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: metal, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.27 });
    const body = new THREE.Mesh(geometry, material);
    body.name = name;
    body.castShadow = true;
    body.receiveShadow = true;
    parent.add(body);
    this.parts[name] = body;
    return body;
  }
  eye(name, position, radius, side, parent = this.root, iris = "#fff6da") {
    // v3：虹膜带一点金/银色（不再是纯奶白卡通眼白）、瞳孔做成隆起的湿润角膜穹顶、两颗高光点
    // r4：眼眶（略深一圈的皮肤过渡）+ 金属感虹膜细环 + 大瞳孔 + 透明角膜穹顶（真实高光来自角膜，不再靠贴片白点）
    const [x, y, z] = position;
    radius *= 0.9;
    const ic = new THREE.Color(iris).lerp(new THREE.Color("#b89c5e"), 0.55);
    const oc = ic.clone().multiplyScalar(0.62);
    this.blob(`${name}-orbit`, [x - radius * 0.03, y + radius * 0.02, z - side * radius * 0.05], [radius * 1.13, radius * 1.12, radius * 0.4], "#" + oc.getHexString(), parent);
    this.blob(`${name}-rim`, [x, y, z], [radius, radius * 1.04, radius * 0.42], "#" + ic.getHexString(), parent);
    this.blob(`${name}-pupil`, [x + radius * 0.06, y - radius * 0.02, z + side * radius * 0.3], [radius * 0.8, radius * 0.82, radius * 0.3], "#0a0f14", parent);
    this.blob(`${name}-glint`, [x + radius * 0.3, y + radius * 0.32, z + side * radius * 0.58], [radius * 0.11, radius * 0.11, radius * 0.04], "#ffffff", parent);
    this.blob(`${name}-glint2`, [x - radius * 0.24, y - radius * 0.3, z + side * radius * 0.55], [radius * 0.05, radius * 0.05, radius * 0.02], "#ffffff", parent);
    const cm = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, transparent: true, opacity: 0.14, depthWrite: false });
    const cornea = new THREE.Mesh(this.sphere, cm);
    cornea.name = `${name}-cornea`;
    cornea.position.set(x + radius * 0.02, y, z + side * radius * 0.1);
    cornea.scale.set(radius * 1.03, radius * 1.07, radius * 0.56);
    parent.add(cornea);
    this.parts[cornea.name] = cornea;
  }
  eyes(x, y, z, radius, iris = "#fff6da") {
    this.eye("eye-left", [x, y, z], radius, 1, this.root, iris);
    this.eye("eye-right", [x, y, -z], radius, -1, this.root, iris);
  }
  gills(x, y, z, size, color) {
    for (const side of [-1, 1]) {
      this.tube(`gill-${side}`, [[x + size * 0.18, y + size, side * z], [x - size * 0.18, y, side * (z + 0.012)], [x + size * 0.15, y - size * 0.75, side * z]], 9e-3, color, this.root, 5, 10);
    }
  }
  mouth(x, y, halfWidth, color = "#504850") {
    this.tube("mouth", [[x - 0.018, y + 0.016, -halfWidth], [x + 9e-3, y - 0.012, 0], [x - 0.018, y + 0.016, halfWidth]], 0.012, color, this.root, 6, 12);
  }
}
function closeTubeEnds(geometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const positions = Array.from(position.array);
  const normals = Array.from(normal.array);
  const uvs = Array.from(uv.array);
  const indices = Array.from(geometry.getIndex().array);
  const { radialSegments, tubularSegments, path } = geometry.parameters;
  for (let end = 0; end < 2; end++) {
    const ring = end * tubularSegments * (radialSegments + 1);
    const center = path.getPointAt(end);
    const capNormal = path.getTangentAt(end).multiplyScalar(end === 0 ? -1 : 1);
    const offset = positions.length / 3;
    for (let j = 0; j <= radialSegments; j++) {
      positions.push(position.getX(ring + j), position.getY(ring + j), position.getZ(ring + j));
      normals.push(capNormal.x, capNormal.y, capNormal.z);
      uvs.push(0.5 + Math.cos(j / radialSegments * TAU) * 0.5, 0.5 + Math.sin(j / radialSegments * TAU) * 0.5);
    }
    const centerIndex = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    normals.push(capNormal.x, capNormal.y, capNormal.z);
    uvs.push(0.5, 0.5);
    const a = new THREE.Vector3().fromBufferAttribute(position, ring).sub(center);
    const b = new THREE.Vector3().fromBufferAttribute(position, ring + 1).sub(center);
    const outward = a.cross(b).dot(capNormal) > 0;
    for (let j = 0; j < radialSegments; j++) {
      if (outward) indices.push(centerIndex, offset + j, offset + j + 1);
      else indices.push(centerIndex, offset + j + 1, offset + j);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
}
let STREAM = 0;
let STREAM_ID = "";
// 巡游型（金枪鱼/旗鱼/剑鱼/鲯鳅/鲭）尾柄更细
const PED_SP = { tuna: 0.46, swordfish: 0.42, sailfish: 0.42, "mahi-mahi": 0.4, mackerel: 0.4, salmon: 0.36, sardine: 0.36 };
const STREAM_SP = { clownfish: 1, "blue-tang": 1, sardine: 1, mackerel: 1, salmon: 1, "mahi-mahi": 1, tuna: 1, swordfish: 1, sailfish: 1, hammerhead: 2 };
// v3：截面样条重采样（流线型渐变，不再是 8 段折线环）
function profileSamples(profile) {
  if (profile._s) return profile._s;
  const curve = new THREE.CatmullRomCurve3(profile.map(([x, h, w]) => new THREE.Vector3(x, h, w)), false, "centripetal");
  const n = Math.max(48, profile.length * 7);
  const pts = curve.getPoints(n).map((p) => [p.x, Math.max(p.y, 2e-3), Math.max(p.z, 2e-3)]);
  for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[i - 1][0]) pts[i][0] = pts[i - 1][0] + 1e-5;
  // r4 流线型：尾柄收细（硬骨鱼/鲨）、吻部收尖（硬骨鱼）—— 身体与花纹条带共用同一采样，保持贴合
  if (STREAM) {
    const x0 = pts[0][0], x1 = pts[pts.length - 1][0], L = Math.max(x1 - x0, 1e-3);
    for (const q of pts) {
      const u = (q[0] - x0) / L;
      const k = THREE.MathUtils.smoothstep(u, 0.02, 0.1) * (1 - THREE.MathUtils.smoothstep(u, 0.14, 0.34));
      const pk = PED_SP[STREAM_ID] ?? 0.3;
      q[1] *= 1 - pk * k; q[2] *= 1 - pk * 0.8 * k;
      if (STREAM === 1) { const t = THREE.MathUtils.smoothstep(u, 0.88, 1.0); q[1] *= 1 - 0.2 * t * t; q[2] *= 1 - 0.3 * t * t; }
    }
  }
  Object.defineProperty(profile, "_s", { value: pts, enumerable: false });
  return pts;
}
function sampleProfile(profile, x) {
  const S = profileSamples(profile);
  if (x <= S[0][0]) return [S[0][1], S[0][2]];
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], b = S[i + 1];
    if (x >= a[0] && x <= b[0]) { const t = (x - a[0]) / Math.max(b[0] - a[0], 1e-6); return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)]; }
  }
  const l = S[S.length - 1]; return [l[1], l[2]];
}
// 鳍轮廓：张力较低的 Catmull-Rom，圆润但保留鳍尖
function smoothOutline(points) {
  if (points.length < 3) return points;
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, "catmullrom", 0.32);
  return curve.getPoints(points.length * 5).slice(0, -1).map((p) => [p.x, p.y]);
}
// 鳍条坐标：以"鳍根前方"为放射中心（根点沿质心反方向外推），旋转到质心方向为 +x
function finRays(geometry, points, taper = false) {
  const c = points.reduce((a, p) => [a[0] + p[0] / points.length, a[1] + p[1] / points.length], [0, 0]);
  const p0 = points[0];
  let dx = c[0] - p0[0], dy = c[1] - p0[1];
  const dl = Math.hypot(dx, dy) || 1;
  if (Math.hypot(dx, dy) < 1e-4) { dx = -1; dy = 0; }
  const b = [p0[0] - dx * 0.8, p0[1] - dy * 0.8];
  const th = Math.atan2(dy, dx), cs = Math.cos(-th), sn = Math.sin(-th);
  const pos = geometry.getAttribute("position"), n = pos.count, arr = new Float32Array(n * 3);
  let amin = 9, amax = -9, dmin = 9, dmax = 0;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i) - b[0], y = pos.getY(i) - b[1];
    const qx = x * cs - y * sn, qy = x * sn + y * cs;
    arr[i * 3] = qx; arr[i * 3 + 1] = qy; arr[i * 3 + 2] = 1;
    const a = Math.atan2(qy, qx), d = Math.hypot(qx, qy);
    amin = Math.min(amin, a); amax = Math.max(amax, a); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
  }
  geometry.setAttribute("aFin", new THREE.Float32BufferAttribute(arr, 3));
  // r4：鳍膜边缘渐薄 —— 越往鳍缘（离放射中心越远）z 厚度越小，鳍尖≈根部 25%
  if (taper) {
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(arr[i * 3], arr[i * 3 + 1]);
      const r = THREE.MathUtils.clamp((d - dmin) / Math.max(dmax - dmin, 1e-4), 0, 1);
      pos.setZ(i, pos.getZ(i) * (1 - 0.75 * THREE.MathUtils.smoothstep(r, 0.15, 1)));
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  const span = (amax - amin) * dmax;
  geometry.userData.fin = { amin, amax, dmin, dmax, n: THREE.MathUtils.clamp(Math.round(span / 0.032), 5, 26) + 0.5 };
  void dl;
}
function bodyGeometry(profile0, back, belly) {
  const radial = 40;
  const profile = profileSamples(profile0);
  const vertices = [];
  const colors = [];
  const indices = [];
  const top = new THREE.Color(back);
  const bottom = new THREE.Color(belly);
  const shade = new THREE.Color();
  for (let i = 0; i < profile.length; i++) {
    const [x, height, width] = profile[i];
    for (let j = 0; j <= radial; j++) {
      const angle = j / radial * TAU;
      const y = Math.cos(angle);
      // 截面：侧面略饱满（超椭圆）、背脊略收窄成脊线
      const sy = Math.sign(y) * Math.pow(Math.abs(y), 0.94), szr = Math.sin(angle);
      const sz = Math.sign(szr) * Math.pow(Math.abs(szr), 0.86) * (1 - 0.14 * Math.pow(Math.max(y, 0), 3));
      vertices.push(x, sy * height, sz * width);
      const mix = THREE.MathUtils.smoothstep(y, -0.58, 0.64);
      shade.copy(bottom).lerp(top, mix);
      colors.push(shade.r, shade.g, shade.b);
      if (i < profile.length - 1 && j < radial) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // 缝合背脊接缝处的法线（j=0 与 j=radial 重合）
  const nr = geometry.getAttribute("normal");
  for (let i = 0; i < profile.length; i++) {
    const a = i * (radial + 1), b = a + radial;
    const nx = nr.getX(a) + nr.getX(b), ny = nr.getY(a) + nr.getY(b), nz = nr.getZ(a) + nr.getZ(b), l = Math.hypot(nx, ny, nz) || 1;
    nr.setXYZ(a, nx / l, ny / l, nz / l); nr.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return geometry;
}
function ringBand(s, profile, x0, x1, color, name, expand = 1.015) {
  const sample = (x) => { const [h, w] = sampleProfile(profile, x); return [x, h * expand, w * expand]; };
  const p = [];
  for (let i = 0; i <= 6; i++) p.push(sample(THREE.MathUtils.lerp(x0, x1, i / 6)));
  s.body(name, p, color, color);
}
function fishTail(s, x, color, shape = "fork", height = 0.33, length = 0.36) {
  const pivot = s.group("tail", [x, 0, 0]);
  const points = shape === "fan" ? [[0.04, 0], [-length * 0.82, height], [-length, height * 0.78], [-length * 1.02, 0], [-length, -height * 0.78], [-length * 0.82, -height]] : shape === "crescent" ? [[0.04, 0], [-length * 0.86, height], [-length * 1.05, height * 1.04], [-length * 0.68, height * 0.48], [-length * 0.43, 0], [-length * 0.68, -height * 0.48], [-length * 1.05, -height * 1.04], [-length * 0.86, -height]] : [[0.05, 0], [-length, height], [-length * 0.87, height * 0.33], [-length * 0.46, 0], [-length * 0.87, -height * 0.33], [-length, -height]];
  s.fin("tail-fluke", points, color, [0, 0, 0], [0, 0, 0], pivot);
  s.wiggle(pivot, "y", 0.06, 3.8);   // v3：主摆动交给脊柱行波，这里只留一点尾鳍"甩梢"
  return pivot;
}
function pairedFins(s, x, y, z, color, length = 0.3, height = 0.16) {
  for (const side of [-1, 1]) {
    const fin = s.fin(`pectoral-${side}`, [[0.06, 0], [-length, -height], [-length * 0.68, height * 0.17], [0.01, height * 0.28]], color, [x, y, side * z], [side * 0.6, side * -0.32, 0]);
    s.wiggle(fin, "x", 0.17, 3.2, side * 0.65);
  }
}
function dorsal(s, color, x = 0, y = 0.23, tall = 0.3, length = 0.65) {
  const fin = s.fin("dorsal-fin", [[length * 0.45, 0], [length * 0.25, tall], [length * 0.03, tall * 0.84], [-length * 0.55, 0.015]], color, [x, y, 0]);
  s.wiggle(fin, "x", 0.06, 2.7, 1.3);
}
function basicFish(s, colors, profile, eye, eyeSize = 0.067, tailShape = "fork", withPectoral = true) {
  s.body("body", profile, colors.back, colors.belly, 0.2);
  fishTail(s, profile[1][0] - 5e-3, colors.fin, tailShape);
  s.eyes(...eye, eyeSize);
  if (withPectoral) pairedFins(s, 0.28, -0.055, profile[Math.floor(profile.length * 0.6)][2] * 0.88, colors.fin);
  s.gills(0.35, 5e-3, eye[2] * 1.12, 0.12, colors.fin);
  s.mouth(profile[profile.length - 1][0] + 5e-3, -0.03, 0.045);
}
function clownfish(s) {
  const p = [[-0.66, 0.018, 0.014], [-0.59, 0.09, 0.06], [-0.39, 0.23, 0.145], [-0.14, 0.31, 0.188], [0.14, 0.33, 0.19], [0.4, 0.28, 0.155], [0.59, 0.18, 0.1], [0.66, 0.05, 0.035], [0.675, 0.01, 0.01]];
  s.body("orange-body", p, "#f9952d", "#ffca79");
  for (const [i, x, width] of [[0, -0.46, 0.11], [1, -0.02, 0.13], [2, 0.4, 0.11]]) {
    ringBand(s, p, x - width * 0.65, x + width * 0.65, "#3d3539", `stripe-${i}-outline`, 1.016);
    ringBand(s, p, x - width * 0.5, x + width * 0.5, "#fff6e5", `stripe-${i}`, 1.025);
  }
  const tail = fishTail(s, -0.57, "#343139", "fan", 0.24, 0.26);
  s.fin("orange-tail-center", [[-0.025, 0], [-0.2, 0.18], [-0.245, 0.12], [-0.245, -0.12], [-0.2, -0.18]], "#ff9d3e", [0, 0, 0.024], [0, 0, 0], tail, 0.022);
  const points = [[0.45, 0.15], [0.35, 0.37], [0.13, 0.42], [-0.14, 0.42], [-0.34, 0.33], [-0.48, 0.18]];
  s.fin("dorsal-dark-edge", points, "#41383b");
  s.fin("dorsal-orange", points.map(([x, y]) => [x * 0.95, y * 0.86]), "#ed7f23", [0, 0.012, 0.02]);
  pairedFins(s, 0.25, -0.04, 0.18, "#fdae48", 0.25, 0.18);
  s.fin("ventral-fin", [[0.13, -0.27], [-0.24, -0.39], [-0.38, -0.24]], "#f99b39");
  s.eyes(0.5, 0.105, 0.133, 0.078);
  s.mouth(0.671, -0.025, 0.035);
}
function blueTang(s) {
  const p = [[-0.6, 0.015, 0.012], [-0.49, 0.13, 0.055], [-0.31, 0.32, 0.103], [0, 0.41, 0.13], [0.27, 0.36, 0.124], [0.49, 0.25, 0.085], [0.62, 0.1, 0.05], [0.65, 0.018, 0.015]];
  s.body("cobalt-body", p, "#285beb", "#65a6ff");
  fishTail(s, -0.48, "#ffd644", "fan", 0.29, 0.29);
  for (const side of [-1, 1]) {
    s.fin(`palette-${side}`, [[-0.44, 0.02], [-0.3, 0.24], [-0.07, 0.3], [0.26, 0.24], [0.43, 0.15], [0.3, 0.04], [0.02, 0.075], [-0.16, -0.07], [-0.32, -0.21]], "#173274", [0, 0, side * 0.132], [0, 0, 0], s.root, 0.012);
    s.blob(`palette-window-${side}`, [-0.015, 0.16, side * 0.143], [0.16, 0.085, 0.022], "#467cff");
  }
  s.fin("dorsal-cobalt", [[0.4, 0.28], [0.23, 0.48], [-0.04, 0.51], [-0.28, 0.4], [-0.43, 0.18]], "#254fba");
  s.fin("anal-cobalt", [[0.29, -0.3], [0.08, -0.45], [-0.28, -0.35], [-0.43, -0.12]], "#285bc9");
  pairedFins(s, 0.32, -0.06, 0.12, "#ffe06b", 0.22, 0.12);
  s.eyes(0.48, 0.1, 0.087, 0.062);
  s.mouth(0.65, -0.025, 0.033);
  s.gills(0.31, 5e-3, 0.116, 0.09, "#173878");
}
function pufferfish(s) {
  const p = [[-0.55, 0.01, 0.01], [-0.46, 0.26, 0.23], [-0.26, 0.44, 0.38], [0, 0.49, 0.435], [0.25, 0.43, 0.39], [0.45, 0.29, 0.255], [0.57, 0.11, 0.12], [0.59, 0.04, 0.04]];
  s.body("inflated-body", p, "#c7954c", "#fff2bc");
  fishTail(s, -0.49, "#daac66", "fan", 0.18, 0.23);
  pairedFins(s, 0.22, -0.09, 0.39, "#f4d28b", 0.2, 0.12);
  s.eyes(0.4, 0.19, 0.275, 0.11);
  s.blob("beak-top", [0.58, 0.01, 0], [0.069, 0.045, 0.087], "#fff6d1");
  s.blob("beak-bottom", [0.58, -0.065, 0], [0.065, 0.037, 0.072], "#f6d998");
  s.mouth(0.628, -0.033, 0.057, "#8b603a");
  for (let i = 0; i < 16; i++) {
    const azimuth = i * 2.39996323;
    const y = 1 - (i + 0.5) / 16 * 2;
    const r = Math.sqrt(1 - y * y);
    const direction = new THREE.Vector3(Math.cos(azimuth) * r, y, Math.sin(azimuth) * r);
    if (direction.x > 0.7) direction.x *= -1;
    const base = [direction.x * 0.49, direction.y * 0.465, direction.z * 0.41];
    const tip = [direction.x * 0.585, direction.y * 0.56, direction.z * 0.5];
    s.spike(`spine-${i}`, base, tip, 0.037, "#f9e1a2");
  }
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? -1 : 1;
    s.blob(`spot-${i}`, [-0.22 + Math.floor(i / 2) * 0.15, 0.24 + Math.sin(i) * 0.04, side * 0.35], [0.051, 0.043, 0.024], "#936d39");
  }
}
const SLENDER = [[-0.79, 0.012, 9e-3], [-0.62, 0.066, 0.043], [-0.4, 0.13, 0.089], [-0.05, 0.16, 0.107], [0.3, 0.148, 0.097], [0.53, 0.106, 0.066], [0.69, 0.045, 0.03], [0.73, 0.012, 8e-3]];
function sardine(s) {
  basicFish(s, { back: "#4b91b0", belly: "#e9f6f6", fin: "#9abcc5" }, SLENDER, [0.55, 0.046, 0.06], 0.058);
  dorsal(s, "#92b9c7", -0.07, 0.14, 0.19, 0.36);
  s.fin("anal-fin", [[-0.32, -0.105], [-0.43, -0.2], [-0.63, -0.07]], "#c8dddd");
  for (const side of [-1, 1]) {
    s.tube(`silver-stripe-${side}`, [[-0.6, 0.025, side * 0.047], [-0.3, 0.026, side * 0.101], [0.09, 0.027, side * 0.109], [0.36, 0.027, side * 0.089]], 0.019, "#a8ecf1", s.root, 5, 16);
    for (let i = 0; i < 4; i++) s.blob(`flank-dot-${side}-${i}`, [0.25 - i * 0.15, 0.055, side * (0.096 - i * 6e-3)], [0.018, 0.018, 9e-3], "#397493");
  }
}
function mackerel(s) {
  const p = [[-0.77, 0.014, 0.012], [-0.65, 0.066, 0.047], [-0.42, 0.16, 0.105], [-0.11, 0.215, 0.142], [0.22, 0.205, 0.133], [0.47, 0.14, 0.094], [0.66, 0.064, 0.045], [0.74, 0.017, 0.014]];
  basicFish(s, { back: "#3ba7a3", belly: "#e6f1e6", fin: "#619a9c" }, p, [0.56, 0.051, 0.073], 0.064);
  dorsal(s, "#659d9c", 0.11, 0.19, 0.25, 0.35);
  s.fin("rear-dorsal", [[-0.35, 0.16], [-0.49, 0.27], [-0.62, 0.07]], "#658f98");
  s.fin("anal-fin", [[-0.31, -0.13], [-0.46, -0.23], [-0.59, -0.09]], "#92b4b1");
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const x = -0.44 + i * 0.135;
    const h = 0.16 + Math.sin((i + 0.5) / 6 * Math.PI) * 0.045;
    const z = (0.104 + Math.sin((i + 0.5) / 6 * Math.PI) * 0.035) * side;
    s.tube(`tiger-bar-${side}-${i}`, [[x, h * 0.8, z * 0.57], [x + 0.03, h * 0.55, z * 0.86], [x - 0.02, h * 0.22, z]], 0.015, "#24545e", s.root, 5, 10);
  }
}
function salmon(s) {
  const p = [[-0.86, 0.012, 0.011], [-0.69, 0.083, 0.054], [-0.44, 0.2, 0.127], [-0.1, 0.27, 0.17], [0.23, 0.26, 0.163], [0.5, 0.185, 0.122], [0.68, 0.085, 0.074], [0.78, 0.032, 0.03]];
  basicFish(s, { back: "#547f87", belly: "#f1e3d8", fin: "#5c7d88" }, p, [0.57, 0.07, 0.103], 0.062);
  dorsal(s, "#607c87", 0.06, 0.25, 0.25, 0.43);
  s.fin("adipose-fin", [[-0.52, 0.14], [-0.54, 0.24], [-0.65, 0.1]], "#91a4a1");
  s.fin("anal-fin", [[-0.3, -0.2], [-0.43, -0.32], [-0.59, -0.13]], "#a4a8a6");
  for (const side of [-1, 1]) {
    s.tube(`rose-lateral-line-${side}`, [[-0.61, -0.01, side * 0.076], [-0.31, -5e-3, side * 0.156], [0.07, 5e-3, side * 0.174], [0.43, 0, side * 0.145]], 0.025, "#dcaea6", s.root, 6, 18);
    for (let i = 0; i < 7; i++) {
      const x = -0.49 + i * 0.122;
      const y = 0.09 + i % 2 * 0.038;
      const width = 0.12 + Math.sin((i + 1) / 8 * Math.PI) * 0.045;
      s.blob(`freckle-${side}-${i}`, [x, y, side * width * 0.84], [0.017, 0.021, 0.01], "#3c555d");
    }
  }
}
function mahiMahi(s) {
  const p = [[-0.86, 0.013, 0.012], [-0.71, 0.065, 0.045], [-0.47, 0.155, 0.082], [-0.12, 0.26, 0.13], [0.25, 0.34, 0.17], [0.51, 0.36, 0.177], [0.64, 0.29, 0.139], [0.69, 0.13, 0.08], [0.72, 0.07, 0.044]];
  basicFish(s, { back: "#23b2a0", belly: "#ffe77e", fin: "#50b78d" }, p, [0.55, 0.035, 0.151], 0.064, "crescent");
  const ridge = [[0.63, 0.28], [0.51, 0.55], [0.26, 0.55], [0.03, 0.5], [-0.22, 0.43], [-0.49, 0.3], [-0.73, 0.1], [-0.47, 0.14], [-0.1, 0.255], [0.25, 0.33]];
  s.fin("continuous-dorsal", ridge, "#1d729a");
  s.fin("gold-anal-fin", [[0.24, -0.3], [-0.11, -0.38], [-0.55, -0.14]], "#cfbd56");
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const x = -0.42 + i * 0.145;
    const y = i % 2 === 0 ? 0.04 : 0.15;
    const z = 0.085 + (x + 0.42) * 0.09;
    s.blob(`electric-spot-${side}-${i}`, [x, y, side * z], [0.025, 0.021, 9e-3], "#248bbe");
  }
}
function tuna(s) {
  const p = [[-0.9, 0.012, 9e-3], [-0.76, 0.07, 0.06], [-0.54, 0.185, 0.136], [-0.24, 0.31, 0.224], [0.13, 0.35, 0.256], [0.43, 0.29, 0.21], [0.65, 0.18, 0.132], [0.78, 0.06, 0.055], [0.8, 0.022, 0.021]];
  basicFish(s, { back: "#264e83", belly: "#cbd9e0", fin: "#426682" }, p, [0.6, 0.06, 0.152], 0.066, "crescent", false);
  dorsal(s, "#344f78", 0.24, 0.31, 0.33, 0.38);
  s.fin("second-dorsal", [[-0.2, 0.3], [-0.31, 0.55], [-0.49, 0.18]], "#e0bf62");
  s.fin("anal-sickle", [[-0.2, -0.28], [-0.37, -0.53], [-0.5, -0.16]], "#dcbf70");
  for (const side of [-1, 1]) {
    const fin = s.fin(`long-pectoral-${side}`, [[0.02, 0], [-0.57, -0.16], [-0.26, 0.07]], "#35566f", [0.35, -0.06, side * 0.215], [side * 0.35, side * 0.14, 0]);
    s.wiggle(fin, "x", 0.1, 2.4, side);
  }
  for (let i = 0; i < 5; i++) for (const vertical of [-1, 1]) {
    const x = -0.39 - i * 0.075;
    const y = (0.215 - i * 0.032) * vertical;
    s.fin(`yellow-finlet-${vertical}-${i}`, [[0.02, 0], [-0.03, vertical * 0.075], [-0.08, 0]], "#efd16a", [x, y, 0], [0, 0, 0], s.root, 0.013);
  }
}
function billfish(s, sail) {
  const p = [[-0.92, 0.012, 0.01], [-0.74, 0.055, 0.041], [-0.5, 0.135, 0.092], [-0.15, 0.21, 0.135], [0.2, 0.23, 0.143], [0.47, 0.155, 0.099], [0.68, 0.072, 0.05], [0.77, 0.027, 0.023]];
  basicFish(s, { back: sail ? "#24679b" : "#446082", belly: "#cbdde4", fin: "#345678" }, p, [0.58, 0.056, 0.075], 0.056, "crescent");
  s.spike("long-bill", [0.67, 0.025, 0], [1.37, 0.072, 0], sail ? 0.041 : 0.055, sail ? "#568dae" : "#748ba0");
  s.spike("lower-jaw", [0.68, -0.05, 0], [0.9, -0.02, 0], 0.025, "#c4d6dd");
  if (sail) {
    const sailRig = s.group("sail-rig", [0, 0, 0]);
    s.fin("grand-sail", [[0.47, 0.15], [0.43, 0.72], [0.27, 1.02], [0.05, 1.08], [-0.21, 0.92], [-0.46, 0.77], [-0.68, 0.38], [-0.73, 0.055]], "#3268ad", [0, 0, 0], [0, 0, 0], sailRig, 0.018);
    s.wiggle(sailRig, "x", 0.05, 2.2, 0.3);
    for (let i = 0; i < 5; i++) {
      const x = 0.35 - i * 0.18;
      s.tube(`sail-ray-${i}`, [[x + 0.08, 0.18, 0.019], [x + 0.025, 0.44, 0.019], [x, 0.91 - Math.max(0, i - 1) * 0.12, 0.019]], 8e-3, "#62a5cf", sailRig, 5, 8);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) s.blob(`sail-spot-${side}-${i}`, [0.28 - i * 0.17, 0.54 + Math.sin(i) * 0.15, side * 0.026], [0.043, 0.032, 8e-3], "#79b5dc", sailRig);
    for (const side of [-1, 1]) {
      const fin = s.fin(`ribbon-pelvic-${side}`, [[0.04, 0], [-0.65, -0.37], [-0.17, -0.05]], "#597a99", [0.27, -0.2, side * 0.06], [0, side * 0.25, 0], s.root, 0.014);
      s.wiggle(fin, "y", 0.1, 2.9, side);
    }
  } else {
    dorsal(s, "#426887", 0.2, 0.21, 0.55, 0.55);
    s.fin("rear-dorsal", [[-0.53, 0.11], [-0.57, 0.25], [-0.72, 0.05]], "#526f87");
    s.fin("ventral-keel", [[0.04, -0.21], [-0.12, -0.47], [-0.38, -0.15]], "#7293a5");
    for (const side of [-1, 1]) s.tube(`lateral-line-${side}`, [[-0.55, 0.025, side * 0.08], [-0.15, 0.025, side * 0.137], [0.23, 0.03, side * 0.143]], 8e-3, "#6d98b1", s.root, 5, 16);
  }
}
function squid(s) {
  const p = [[-0.94, 9e-3, 9e-3], [-0.78, 0.15, 0.15], [-0.51, 0.245, 0.23], [-0.18, 0.245, 0.23], [0.15, 0.165, 0.165], [0.24, 0.12, 0.13]];
  s.body("tapered-mantle", p, "#e79583", "#ffd1b6");
  s.blob("head", [0.3, -0.018, 0], [0.22, 0.155, 0.2], "#eeb49a");
  for (const side of [-1, 1]) {
    const fin = s.fin(`mantle-fin-${side}`, [[0.1, 0], [-0.37, 0.43], [-0.71, 0.025], [-0.45, -0.02]], "#c87975", [-0.19, 0.015, side * 0.11], [side * Math.PI / 2, 0, 0], s.root, 0.025);
    s.wiggle(fin, "x", 0.15, 3.1, side);
  }
  s.eyes(0.31, 0.035, 0.177, 0.105, "#e8cf99");
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    const pivot = s.group(`arm-${i}`, [0.37, Math.cos(a) * 0.077 - 0.03, Math.sin(a) * 0.115]);
    const reach = i === 2 || i === 6 ? 0.9 : 0.53;
    s.tube(`arm-skin-${i}`, [[0, 0, 0], [reach * 0.4, Math.cos(a) * 0.09, Math.sin(a) * 0.08], [reach * 0.8, Math.cos(a) * 0.12 - 0.04, Math.sin(a) * 0.12], [reach, Math.cos(a) * 0.16 + 0.01, Math.sin(a) * 0.17]], i === 2 || i === 6 ? 0.025 : 0.034, "#eaa38c", pivot, 7, 15);
    if (i === 2 || i === 6) s.blob(`tentacle-club-${i}`, [reach - 0.05, Math.cos(a) * 0.16, Math.sin(a) * 0.165], [0.105, 0.038, 0.042], "#f0bca2", pivot);
    s.wiggle(pivot, "y", 0.085, 3.1, i * 0.75);
    s.wiggle(pivot, "z", 0.055, 2.7, i * 1.3);
  }
  for (let i = 0; i < 5; i++) s.blob(`mantle-dot-${i}`, [-0.5 + i * 0.13, 0.193, 0.13], [0.025, 0.011, 0.029], "#bd7773");
}
function cuttlefish(s) {
  const p = [[-0.8, 0.01, 0.01], [-0.62, 0.12, 0.23], [-0.37, 0.18, 0.315], [-0.04, 0.185, 0.33], [0.2, 0.14, 0.26], [0.35, 0.1, 0.18]];
  s.body("oval-mantle", p, "#bba591", "#eee0c6");
  s.blob("head", [0.4, -0.025, 0], [0.19, 0.14, 0.225], "#d3bba0");
  for (const side of [-1, 1]) {
    const points = [];
    for (let i = 0; i <= 14; i++) {
      const x = -0.72 + i / 14 * 1.03;
      const width = 0.13 + Math.sin(i / 14 * Math.PI) * 0.22;
      points.push([x, Math.sin(i * 1.5) * 0.027, side * width]);
    }
    const frill = s.tube(`ruffled-fin-${side}`, points, 0.047, "#e1c9ac", s.root, 7, 36);
    s.wiggle(frill, "x", 0.07, 3.4, side);
    s.eye(`eye-${side}`, [0.42, 0.018, side * 0.207], 0.091, side, s.root, "#efe2bf");
    for (let i = 0; i < 5; i++) s.tube(`zebra-${side}-${i}`, [[-0.49 + i * 0.135, 0.172, side * 0.04], [-0.46 + i * 0.135, 0.151, side * 0.14], [-0.49 + i * 0.135, 0.101, side * 0.255]], 0.02, "#8e8076", s.root, 6, 10);
  }
  for (let i = 0; i < 8; i++) {
    const z = (i - 3.5) * 0.046;
    const arm = s.group(`arm-${i}`, [0.49, -0.04, z]);
    s.tube(`arm-skin-${i}`, [[0, 0, 0], [0.15, -0.025, z * 0.2], [0.28, -0.025, z * 0.38], [0.31, 0.045, z * 0.55]], 0.026, "#d0b093", arm, 7, 13);
    s.wiggle(arm, "z", 0.09, 3.1, i * 0.72);
  }
  s.blob("siphon", [0.34, -0.13, 0.16], [0.08, 0.043, 0.06], "#aa8d77");
}
function octopus(s) {
  s.blob("mantle", [-0.22, 0.18, 0], [0.42, 0.43, 0.35], "#c5828a");
  s.blob("soft-face", [0.08, -0.01, 0], [0.29, 0.23, 0.29], "#d99999");
  s.eyes(0.12, 0.085, 0.263, 0.097, "#f7ddbd");
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * TAU;
    const forward = Math.cos(angle);
    const sideways = Math.sin(angle);
    const pivot = s.group(`arm-${i}`, [0.02 + forward * 0.16, -0.16, sideways * 0.18]);
    const reach = 0.51 + i % 3 * 0.055;
    const points = [[0, 0, 0], [forward * reach * 0.48, -0.13, sideways * reach * 0.52], [forward * reach, -0.18, sideways * reach], [forward * (reach + 0.08) - sideways * 0.075, -0.11, sideways * (reach + 0.08) + forward * 0.075], [forward * (reach - 0.015) - sideways * 0.11, -0.05, sideways * (reach - 0.015) + forward * 0.11]];
    s.tube(`curled-arm-${i}`, points, 0.065 - i % 2 * 6e-3, "#d79b9c", pivot, 8, 20);
    for (let j = 0; j < 2; j++) {
      const t = 0.45 + j * 0.25;
      s.blob(`sucker-${i}-${j}`, [forward * reach * t, -0.09 - t * 0.07, sideways * reach * t], [0.038, 0.014, 0.038], "#ffe0c8", pivot);
    }
    s.wiggle(pivot, "y", 0.12, 2.45, i * 0.69);
    s.wiggle(pivot, "z", 0.055, 2.8, i * 0.96);
  }
  s.blob("siphon", [0.29, -0.065, 0.1], [0.095, 0.042, 0.06], "#b97882");
  s.blob("mantle-highlight", [-0.24, 0.49, 0.15], [0.13, 0.032, 0.095], "#dca2a5");
}
function pincer(s, name, position, side, size, color, parent = s.root) {
  const pivot = s.group(name, position, parent);
  pivot.rotation.y = side * -0.2;
  s.blob(`${name}-palm`, [0.1 * size, 0, 0], [0.17 * size, 0.095 * size, 0.12 * size], color, pivot);
  s.tube(`${name}-fixed-finger`, [[0.17 * size, 0, -0.055 * size], [0.31 * size, 0.015 * size, -0.085 * size], [0.38 * size, 8e-3 * size, -0.018 * size]], 0.037 * size, color, pivot, 7, 10);
  const finger = s.group(`${name}-moving-finger`, [0.16 * size, 0, 0.063 * size], pivot);
  s.tube(`${name}-thumb`, [[0, 0, 0], [0.11 * size, 8e-3 * size, 0.037 * size], [0.2 * size, 8e-3 * size, -0.035 * size]], 0.033 * size, color, finger, 7, 10);
  s.wiggle(finger, "y", 0.13, 2.4, side * 1.2);
  s.wiggle(pivot, "y", 0.09, 2.7, side);
}
function crustaceanEyes(s, x, y, z, color) {
  for (const side of [-1, 1]) {
    s.tube(`eyestalk-${side}`, [[x, y, side * z], [x + 0.035, y + 0.1, side * (z + 0.02)]], 0.025, color, s.root, 6, 3);
    s.blob(`eye-${side}`, [x + 0.04, y + 0.102, side * (z + 0.02)], [0.043, 0.045, 0.043], "#24323a");
    s.blob(`eye-glint-${side}`, [x + 0.06, y + 0.118, side * (z + 0.038)], [0.014, 0.013, 0.012], "#fff5e3");
  }
}
function lobster(s) {
  s.blob("carapace", [0.04, 0.05, 0], [0.38, 0.18, 0.235], "#d37859");
  s.blob("head-shell", [0.31, 0.07, 0], [0.18, 0.14, 0.18], "#dc8a64");
  for (let i = 0; i < 5; i++) s.blob(`tail-segment-${i}`, [-0.27 - i * 0.12, 0.015 - i * 0.015, 0], [0.112, 0.142 - i * 0.015, 0.195 - i * 0.021], i % 2 ? "#d08462" : "#dc936e");
  const tail = s.group("tail-fan", [-0.81, -0.05, 0]);
  for (let i = -1; i <= 1; i++) s.fin(`tail-lobe-${i}`, [[0.055, 0], [-0.18, 0.1], [-0.25, 0.055], [-0.25, -0.055], [-0.18, -0.1]], "#d88b69", [0, 0, i * 0.082], [Math.PI / 2, i * -0.44, 0], tail);
  s.wiggle(tail, "z", 0.1, 2.8);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const leg = s.group(`walking-leg-${side}-${i}`, [0.17 - i * 0.12, -0.035, side * 0.17]);
      s.tube(`leg-shell-${side}-${i}`, [[0, 0, 0], [0.015 - i * 0.055, -0.075, side * 0.22], [-0.08 - i * 0.055, -0.21, side * 0.32]], 0.021, "#ce835f", leg, 6, 6);
      s.wiggle(leg, "y", 0.1, 3.2, i + side);
    }
    s.tube(`claw-arm-${side}`, [[0.21, 0.015, side * 0.17], [0.47, 0, side * 0.35], [0.62, 0.05, side * 0.32]], 0.047, "#bf6b50", s.root, 7, 7);
    pincer(s, `claw-${side}`, [0.6, 0.04, side * 0.32], side, side === 1 ? 1.1 : 0.85, "#d67f5b");
    const antenna = s.tube(`long-antenna-${side}`, [[0.4, 0.13, side * 0.075], [0.67, 0.25, side * 0.21], [0.94, 0.31, side * 0.34], [1.15, 0.39, side * 0.4]], 0.012, "#955a49", s.root, 5, 18);
    s.wiggle(antenna, "y", 0.04, 2.2, side);
  }
  crustaceanEyes(s, 0.4, 0.12, 0.13, "#b96d51");
  s.spike("rostrum", [0.43, 0.09, 0], [0.57, 0.13, 0], 0.058, "#d68b65");
}
function crab(s, king) {
  const color = king ? "#cc7d58" : "#e3a57c";
  s.blob("carapace", [-0.05, 0.02, 0], [king ? 0.37 : 0.3, king ? 0.175 : 0.125, king ? 0.37 : 0.28], color);
  s.blob("under-shell", [-0.015, -0.07, 0], [0.29, 0.08, king ? 0.305 : 0.25], "#f1c8a3");
  s.blob("face", [0.27, -5e-3, 0], [0.09, 0.095, 0.15], "#d4946e");
  const count = king ? 3 : 4;
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      const x = 0.13 - i * 0.145;
      const reach = king ? 0.72 + (i === 1 ? 0.15 : 0) : 0.94 + (i < 2 ? 0.07 : -0.02);
      const endX = x + (1.15 - i * 0.85) * (king ? 0.27 : 0.38);
      const pivot = s.group(`leg-${side}-${i}`, [x, -0.025, side * (king ? 0.29 : 0.22)]);
      s.tube(`leg-shell-${side}-${i}`, [[0, 0, 0], [(endX - x) * 0.48, 0.085, side * reach * 0.58], [endX - x, -0.13, side * reach], [endX - x - 0.045, -0.32, side * reach * 0.98]], king ? 0.041 : 0.024, color, pivot, 7, 8);
      s.blob(`leg-joint-${side}-${i}`, [(endX - x) * 0.48, 0.085, side * reach * 0.58], [king ? 0.06 : 0.037, king ? 0.057 : 0.034, king ? 0.061 : 0.037], king ? "#b96c51" : "#f0c5a4", pivot);
      s.wiggle(pivot, "x", 0.065, 2.7, i * 0.9 + side);
    }
    s.tube(`claw-arm-${side}`, [[0.19, -0.02, side * 0.2], [0.42, -0.03, side * 0.37], [0.52, 0.02, side * 0.29]], king ? 0.05 : 0.035, color, s.root, 7, 7);
    pincer(s, `claw-${side}`, [0.51, 0.02, side * 0.3], side, king ? 0.82 : 0.67, color);
  }
  crustaceanEyes(s, 0.285, 0.04, 0.105, color);
  if (king) {
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU;
      const x = -0.04 + Math.cos(angle) * 0.225;
      const z = Math.sin(angle) * 0.24;
      s.spike(`shell-spine-${i}`, [x, 0.135, z], [x + Math.cos(angle) * 0.036, 0.23, z + Math.sin(angle) * 0.03], 0.033, "#e4a272");
    }
  } else {
    s.blob("shell-marking", [-0.07, 0.137, 0], [0.12, 0.013, 0.105], "#c58f70");
    s.blob("shell-highlight", [0.04, 0.141, 0.1], [0.06, 8e-3, 0.042], "#efc7a4");
  }
}
function mantaRay(s) {
  const p = [[-0.78, 0.01, 0.03], [-0.48, 0.09, 0.25], [-0.1, 0.16, 0.4], [0.36, 0.17, 0.4], [0.66, 0.1, 0.28], [0.75, 0.055, 0.2]];
  s.body("central-body", p, "#415361", "#f0e4d3");
  for (const side of [-1, 1]) {
    const wing = s.group(`wing-${side}`, [0.07, 0, side * 0.22]);
    const outline = [[0.47, 0], [0.3, 0.46], [-0.13, 1.27], [-0.3, 1.48], [-0.36, 1.31], [-0.33, 0.95], [-0.65, 0.3], [-0.61, 0]];
    s.fin(`wing-top-${side}`, outline, "#405360", [0, 0.012, 0], [side * Math.PI / 2, 0, 0], wing, 0.055);
    s.fin(`wing-belly-${side}`, outline.map(([x, y]) => [x * 0.97, y * 0.97]), "#e9e0d3", [0, -0.036, 0], [side * Math.PI / 2, 0, 0], wing, 0.015);
    s.tube(`wing-leading-ridge-${side}`, [[0.43, 0.04, 0], [0.28, 0.022, side * 0.46], [-0.11, 0.016, side * 1.23]], 0.028, "#5e7079", wing, 6, 17);
    s.wiggle(wing, "x", 0.19, 1.8, side * Math.PI * 0.5);
    s.eye(`eye-${side}`, [0.52, 0.085, side * 0.3], 0.065, side, s.root, "#b8c7c5");
    s.tube(`cephalic-horn-${side}`, [[0.65, 0.01, side * 0.23], [0.86, -0.03, side * 0.23], [0.98, -0.055, side * 0.3], [1.01, -0.035, side * 0.37]], 0.05, "#657681", s.root, 8, 17);
    for (let i = 0; i < 3; i++) s.tube(`belly-gill-${side}-${i}`, [[0.29 - i * 0.115, -0.15, side * 0.09], [0.24 - i * 0.115, -0.155, side * 0.2], [0.19 - i * 0.115, -0.12, side * 0.28]], 0.012, "#7f8b8d", s.root, 5, 9);
  }
  const tail = s.group("whip-tail", [-0.59, 0, 0]);
  s.tube("whip-tail-skin", [[0, 0, 0], [-0.48, -0.035, 0], [-0.86, -0.015, 0.02], [-1.21, 0.035, 0.09]], 0.021, "#405360", tail, 6, 23);
  s.wiggle(tail, "y", 0.14, 2.3);
  s.fin("tiny-dorsal", [[-0.15, 0.1], [-0.27, 0.3], [-0.41, 0.08]], "#415764");
  s.mouth(0.771, -0.028, 0.135, "#253c47");
}
function hammerhead(s) {
  const p = [[-0.94, 0.012, 0.01], [-0.75, 0.07, 0.055], [-0.48, 0.15, 0.111], [-0.16, 0.215, 0.17], [0.19, 0.23, 0.193], [0.48, 0.18, 0.172], [0.7, 0.11, 0.13], [0.81, 0.061, 0.08]];
  s.body("shark-body", p, "#73999e", "#e3e7d9");
  s.blob("hammer-cephalofoil", [0.78, 0.02, 0], [0.17, 0.095, 0.51], "#90afb0");
  s.blob("hammer-belly", [0.79, -0.039, 0], [0.163, 0.056, 0.495], "#d6e1d7");
  for (const side of [-1, 1]) {
    s.eye(`eye-${side}`, [0.81, 0.032, side * 0.492], 0.05, side, s.root, "#c8dcce");
    s.blob(`nostril-${side}`, [0.922, 0.012, side * 0.32], [0.011, 0.014, 0.025], "#537276");
    const fin = s.fin(`pectoral-${side}`, [[0.03, 0], [-0.51, 0.43], [-0.35, 0.035]], "#72969b", [0.14, -0.11, side * 0.145], [side * Math.PI / 2 - side * 0.14, 0, 0]);
    s.wiggle(fin, "x", 0.05, 2.2, side);
    for (let i = 0; i < 4; i++) s.tube(`gill-${side}-${i}`, [[0.42 - i * 0.063, 0.085, side * 0.166], [0.4 - i * 0.063, 0.015, side * 0.19], [0.42 - i * 0.063, -0.054, side * 0.178]], 8e-3, "#536f76", s.root, 5, 7);
  }
  dorsal(s, "#6b9098", 0.08, 0.21, 0.46, 0.49);
  s.fin("second-dorsal", [[-0.42, 0.15], [-0.53, 0.3], [-0.65, 0.09]], "#7f9fa3");
  s.fin("pelvic-fins", [[-0.29, -0.18], [-0.49, -0.29], [-0.55, -0.12]], "#acc2bb");
  const tail = s.group("tail", [-0.77, 0, 0]);
  s.fin("heterocercal-tail", [[0.06, 0], [-0.31, 0.52], [-0.43, 0.58], [-0.36, 0.29], [-0.19, 0.035], [-0.4, -0.2], [-0.39, -0.27], [-0.18, -0.16]], "#7b9b9e", [0, 0, 0], [0, 0, 0], tail);
  s.wiggle(tail, "y", 0.06, 2.8);
  s.tube("smile", [[0.84, -0.083, -0.11], [0.795, -0.101, 0], [0.84, -0.083, 0.11]], 0.011, "#738c8d", s.root, 6, 12);
}
function oarfish(s) {
  const count = 36;
  const profile = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const h = 0.012 + Math.sin(Math.min(t * 1.22, 1) * Math.PI * 0.85) * 0.13;
    profile.push([-1.65 + t * 3, h, 0.018 + Math.sin(t * Math.PI) * 0.026]);
  }
  s.body("silver-ribbon-body", profile, "#b9ccdf", "#f0e6e4", 0.42);
  const ridge = [];
  for (let i = 0; i < count; i++) ridge.push([profile[i][0], profile[i][1] + 0.048 + Math.sin(i * 1.9) * 0.014]);
  for (let i = count - 1; i >= 0; i--) ridge.push([profile[i][0], profile[i][1] - 2e-3]);
  const dorsalFin = s.fin("crimson-dorsal-ribbon", ridge, "#e98c85", [0, 0, 0], [0, 0, 0], s.root, 0.014);
  s.wiggle(dorsalFin, "x", 0.07, 2.8);
  s.blob("head", [1.36, -0.014, 0], [0.19, 0.156, 0.084], "#cdd8e4");
  s.eyes(1.4, 0.032, 0.077, 0.056, "#ffe3cf");
  s.mouth(1.54, -0.05, 0.035, "#a2797f");
  for (let i = 0; i < 4; i++) {
    const crest = s.tube(`crown-ray-${i}`, [[1.3 - i * 0.054, 0.11, 0], [1.24 - i * 0.09, 0.43 + i * 0.035, 0.02], [1.08 - i * 0.085, 0.64 - i * 0.045, 0.035]], 0.014 + (3 - i) * 2e-3, "#dd776f", s.root, 6, 15);
    s.wiggle(crest, "x", 0.075, 2.1, i * 0.55);
  }
  for (const side of [-1, 1]) {
    const oar = s.tube(`pelvic-oar-${side}`, [[1.25, -0.1, side * 0.055], [0.99, -0.35, side * 0.08], [0.76, -0.5, side * 0.1], [0.56, -0.52, side * 0.13]], 0.012, "#d58382", s.root, 6, 19);
    s.wiggle(oar, "z", 0.04, 2.4, side);
    for (let i = 0; i < 9; i++) {
      const x = -1.3 + i * 0.265;
      const h = 0.06 + Math.sin((i + 1) / 10 * Math.PI) * 0.063;
      s.tube(`ribbon-bar-${side}-${i}`, [[x, h * 0.65, side * 0.036], [x - 0.026, 0, side * 0.046], [x + 0.012, -h * 0.65, side * 0.036]], 0.01, "#97afc9", s.root, 5, 8);
    }
  }
  s.gills(1.2, -0.02, 0.065, 0.073, "#9aabc0");
}
function sunfish(s) {
  const p = [[-0.61, 0.35, 0.09], [-0.52, 0.49, 0.142], [-0.27, 0.57, 0.202], [0.02, 0.58, 0.24], [0.31, 0.47, 0.208], [0.51, 0.32, 0.153], [0.65, 0.16, 0.085], [0.69, 0.05, 0.035]];
  s.body("moon-body", p, "#a0b1bc", "#d1d3c9", 0.12);
  const top = s.fin("tower-dorsal", [[-0.35, 0.47], [-0.27, 1.04], [-0.11, 1.18], [0.03, 1.17], [0.13, 0.54]], "#93a6b2", [0, 0, 0], [0, 0, 0], s.root, 0.055);
  const bottom = s.fin("tower-anal", [[-0.34, -0.47], [-0.28, -1.02], [-0.11, -1.12], [0.02, -1.1], [0.16, -0.52]], "#a7b5bd", [0, 0, 0], [0, 0, 0], s.root, 0.055);
  s.wiggle(top, "x", 0.11, 2.5);
  s.wiggle(bottom, "x", 0.13, 2.5, Math.PI);
  const clavus = s.group("clavus", [-0.54, 0, 0]);
  s.fin("scalloped-clavus", [[0.03, 0.41], [-0.13, 0.39], [-0.19, 0.29], [-0.18, 0.16], [-0.22, 0.04], [-0.2, -0.1], [-0.22, -0.22], [-0.16, -0.35], [-0.08, -0.43], [0.03, -0.39]], "#7e95a5", [0, 0, 0], [0, 0, 0], clavus, 0.05);
  s.wiggle(clavus, "y", 0.08, 2.5);
  pairedFins(s, 0.25, 0.025, 0.228, "#8b9eac", 0.23, 0.085);
  s.eyes(0.46, 0.12, 0.153, 0.069, "#ddd9bc");
  s.blob("pursed-lips", [0.684, -0.042, 0], [0.055, 0.069, 0.063], "#b7bbad");
  s.mouth(0.737, -0.044, 0.025, "#657a87");
  s.gills(0.17, 0.025, 0.238, 0.16, "#7e94a3");
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const angle = i / 6 * TAU;
    s.blob(`skin-speckle-${side}-${i}`, [-0.13 + Math.cos(angle) * 0.26, Math.sin(angle) * 0.3, side * (0.214 - Math.abs(Math.sin(angle)) * 0.03)], [0.042, 0.033, 0.014], "#becad0");
  }
}
const RECIPES = {
  clownfish,
  "blue-tang": blueTang,
  pufferfish,
  sardine,
  mackerel,
  squid,
  cuttlefish,
  octopus,
  lobster,
  "king-crab": (s) => crab(s, true),
  "snow-crab": (s) => crab(s, false),
  salmon,
  "mahi-mahi": mahiMahi,
  tuna,
  swordfish: (s) => billfish(s, false),
  sailfish: (s) => billfish(s, true),
  "manta-ray": mantaRay,
  hammerhead,
  oarfish,
  sunfish
};
// v4：20 种新增物种（marine2.js）注册进同一张配方表
const M2 = buildMarine2({ ringBand, fishTail, pairedFins, basicFish, sampleProfile });
Object.assign(RECIPES, M2.recipes);
Object.assign(STREAM_SP, M2.stream);
Object.assign(PED_SP, M2.ped);
function createMarineModel(speciesId, lengthCm) {
  const recipe = RECIPES[speciesId] ?? RECIPES.sardine;
  const sculpture = new Sculpture();
  STREAM = STREAM_SP[speciesId] || 0; STREAM_ID = speciesId;
  try { recipe(sculpture); } finally { STREAM = 0; }
  const model = new THREE.Group();
  model.name = `marine-${speciesId}`;
  const bounds = new THREE.Box3().setFromObject(sculpture.root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const normalization = 1.6 / Math.max(size.x, size.z, M2.normY[speciesId] ? size.y : 0, 0.01);
  sculpture.root.scale.setScalar(normalization);
  sculpture.root.position.copy(center).multiplyScalar(-normalization);
  sculpture.root.name = "normalized-sculpture";
  model.add(sculpture.root);
  const rig = { motions: sculpture.motions, parts: sculpture.parts, speciesId };
  model.userData.marineRig = rig;
  model.userData.parts = sculpture.parts;
  model.userData.speciesId = speciesId;
  model.userData.standardLength = 1.6;
  model.userData.lengthCm = Number.isFinite(lengthCm) ? lengthCm : void 0;
  model.userData.normalizedDimensions = { x: size.x * normalization, y: size.y * normalization, z: size.z * normalization };
  return model;
}
function animateMarineModel(model, elapsedSeconds, supportProgress = 0) {
  const rig = model.userData.marineRig;
  if (!rig || !Number.isFinite(elapsedSeconds)) return;
  const motions = rig.motions;
  for (let i = 0; i < motions.length; i++) {
    const motion = motions[i];
    motion.node.rotation[motion.axis] = motion.rest + Math.sin(elapsedSeconds * motion.speed + motion.phase) * motion.amplitude * (1 - THREE.MathUtils.clamp(supportProgress, 0, 1));
  }
}
export {
  animateMarineModel,
  createMarineModel
};
