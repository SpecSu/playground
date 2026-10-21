import { FESTIVAL_CONSTRUCTION_SECONDS } from '../../lib/festival-timing.ts';
import * as THREE from 'three';
import { INSTALLATION_FOOTPRINT_RADII, INSTALLATION_HEIGHTS } from './art-dimensions.ts';

/** The index is part of the room protocol: append designs, never reorder them. */
export const INSTALLATION_DESIGNS = [
  { id: 'the-pilgrim', name: '托日旅人', englishName: 'THE PILGRIM', subtitle: 'A body built to hold the sun', color: '#EBA85F', icon: '☀️' },
  { id: 'mirror-saint', name: '镜面圣像', englishName: 'MIRROR SAINT', subtitle: 'A thousand pieces of someone', color: '#A9E3DF', icon: '🪞' },
  { id: 'last-leviathan', name: '沙海巨兽', englishName: 'LAST LEVIATHAN', subtitle: 'The desert remembers the sea', color: '#CA7955', icon: '🦴' },
  { id: 'beautiful-collapse', name: '失衡之塔', englishName: 'BEAUTIFUL COLLAPSE', subtitle: 'Nothing belongs. Everything balances.', color: '#EBAAB0', icon: '🧱' },
  { id: 'orbit-engine', name: '轨道引擎', englishName: 'ORBIT ENGINE', subtitle: 'An instrument for impossible worlds', color: '#E3B557', icon: '🪐' },
  { id: 'wind-cathedral', name: '风之教堂', englishName: 'WIND CATHEDRAL', subtitle: 'Architecture made of almost nothing', color: '#DDBCB0', icon: '⛵' },
  { id: 'glass-bloom', name: '玻璃之花', englishName: 'GLASS BLOOM', subtitle: 'Something fragile survived', color: '#8DCBD1', icon: '🌺' },
  { id: 'radio-ghost', name: '电台幽灵', englishName: 'RADIO GHOST', subtitle: 'Broadcasting to nobody. Still listening.', color: '#ABC66B', icon: '📡' },
  { id: 'sun-gate', name: '落日之门', englishName: 'SUN GATE', subtitle: 'Walk through your own shadow', color: '#DE7950', icon: '🌗' },
  { id: 'nowhere-stairs', name: '无尽阶梯', englishName: 'NOWHERE STAIRS', subtitle: 'A way up. A way back. No destination.', color: '#D7D1BF', icon: '🪜' },
  { id: 'land-jellyfish', name: '陆地水母', englishName: 'LAND JELLYFISH', subtitle: 'The ocean arrived without water', color: '#D396BC', icon: '🪼' },
  { id: 'memory-helix', name: '记忆双螺旋', englishName: 'MEMORY HELIX', subtitle: 'Two stories, never quite touching', color: '#729BCC', icon: '🧬' },
] as const;

export type InstallationDesign = typeof INSTALLATION_DESIGNS[number];
type Point = readonly [number, number, number];
type Material = THREE.MeshStandardMaterial;
type GeometryRecord = { geometry: THREE.BufferGeometry; users: number };
type Resources = { pooled: Set<string>; owned: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> };

const geometryPool = new Map<string, GeometryRecord>();
const installationResources = new WeakMap<THREE.Group, Resources>();
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function randomGenerator(seed: number) {
  let value = (Number.isFinite(seed) ? seed : 0) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = Math.imul(value ^ value >>> 15, value | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

function createKit(root: THREE.Group, seed: number) {
  const resources: Resources = { pooled: new Set(), owned: new Set(), materials: new Set() };
  installationResources.set(root, resources);
  const rng = randomGenerator(seed);
  const palette = new Map<string, Material>();
  const material = (name: string, color: THREE.ColorRepresentation, metalness = 0.5, roughness = 0.65, opacity = 1, emissive = 0) => {
    const existing = palette.get(name);
    if (existing) return existing;
    const result = new THREE.MeshStandardMaterial({
      color, metalness, roughness, side: THREE.DoubleSide,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
      emissive: color, emissiveIntensity: emissive,
    });
    result.name = name;
    palette.set(name, result);
    resources.materials.add(result);
    return result;
  };
  const physical = (name: string, properties: THREE.MeshPhysicalMaterialParameters) => {
    const result = new THREE.MeshPhysicalMaterial({ ...properties, name, side: THREE.DoubleSide });
    palette.set(name, result); resources.materials.add(result); return result;
  };
  const geometry = (key: string, factory: () => THREE.BufferGeometry) => {
    let record = geometryPool.get(key);
    if (!record) { record = { geometry: factory(), users: 0 }; geometryPool.set(key, record); }
    if (!resources.pooled.has(key)) { record.users++; resources.pooled.add(key); }
    return record.geometry;
  };
  const own = (shape: THREE.BufferGeometry) => { resources.owned.add(shape); return shape; };
  const add = (shape: THREE.BufferGeometry, surface: Material, position: Point, scale: Point = [1, 1, 1], rotation: Point = [0, 0, 0], parent: THREE.Group = root) => {
    const mesh = new THREE.Mesh(shape, surface);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (surface: Material, position: Point, scale: Point, rotation: Point = [0, 0, 0], parent: THREE.Group = root) =>
    add(geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), surface, position, scale, rotation, parent);
  const sphere = (surface: Material, position: Point, scale: Point, parent: THREE.Group = root) =>
    add(geometry('icosahedron1', () => new THREE.IcosahedronGeometry(1, 1)), surface, position, scale, [0, 0, 0], parent);
  const cylinder = (surface: Material, position: Point, radius: number, height: number, topRatio = 1, parent: THREE.Group = root) =>
    add(geometry(`cylinder:${topRatio}`, () => new THREE.CylinderGeometry(topRatio, 1, 1, 10, 1)), surface, position, [radius, height, radius], [0, 0, 0], parent);
  const beam = (surface: Material, start: Point, end: Point, radius = 0.07, parent: THREE.Group = root) => {
    const a = new THREE.Vector3(...start); const b = new THREE.Vector3(...end);
    const direction = b.sub(a);
    const mesh = cylinder(surface, [a.x + direction.x / 2, a.y + direction.y / 2, a.z + direction.z / 2], radius, direction.length(), 1, parent);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    return mesh;
  };
  const ring = (surface: Material, position: Point, radius: number, tube: number, rotation: Point = [0, 0, 0], parent: THREE.Group = root) =>
    add(geometry(`torus:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 5, 40)), surface, position, [1, 1, 1], rotation, parent);
  const panel = (surface: Material, points: readonly Point[], parent: THREE.Group = root) => {
    const vertices: number[] = [];
    // Project along the polygon's dominant normal before ear-clipping. A fan
    // would incorrectly fill the negative space of the concave Sun Gate.
    const normal = new THREE.Vector3();
    for (let i = 0; i < points.length; i++) {
      const a = points[i]; const b = points[(i + 1) % points.length];
      normal.x += (a[1] - b[1]) * (a[2] + b[2]);
      normal.y += (a[2] - b[2]) * (a[0] + b[0]);
      normal.z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const axis = Math.abs(normal.x) > Math.abs(normal.y)
      ? (Math.abs(normal.x) > Math.abs(normal.z) ? 0 : 2)
      : (Math.abs(normal.y) > Math.abs(normal.z) ? 1 : 2);
    const contour = points.map((point) => new THREE.Vector2(point[(axis + 1) % 3], point[(axis + 2) % 3]));
    for (const face of THREE.ShapeUtils.triangulateShape(contour, [])) {
      for (const index of face) vertices.push(...points[index]);
    }
    const shape = own(new THREE.BufferGeometry());
    shape.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    shape.computeVertexNormals();
    return add(shape, surface, [0, 0, 0], [1, 1, 1], [0, 0, 0], parent);
  };
  const curve = (surface: Material, points: readonly Point[], radius = 0.065, parent: THREE.Group = root) => {
    const path = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return add(own(new THREE.TubeGeometry(path, Math.max(10, points.length * 4), radius, 5, false)), surface, [0, 0, 0], [1, 1, 1], [0, 0, 0], parent);
  };
  const group = (name: string, position: Point = [0, 0, 0]) => {
    const child = new THREE.Group(); child.name = name; child.position.set(...position); root.add(child); return child;
  };
  // Preserve locally articulated pieces through the static geometry baker.
  // Model callbacks use their original coordinates; the pivot is converted once.
  let mechanismIndex = 0;
  const motion = (name: string, pivot: Point, build: () => void, phase = 0) => {
    const existing = new Set(root.children);
    build();
    const parts = root.children.filter(child => !existing.has(child));
    const mechanism = root.children.find(child => child instanceof THREE.Group && child.userData.livingMotion === name && child.userData.motionPhase === phase && child.position.x === pivot[0] && child.position.y === pivot[1] && child.position.z === pivot[2]) as THREE.Group | undefined
      ?? group(`living:${name}:${mechanismIndex++}`, pivot);
    mechanism.userData.livingMotion = name;
    mechanism.userData.motionPhase = phase;
    for (const part of parts) { part.position.sub(mechanism.position); mechanism.add(part); }
    return mechanism;
  };
  const iron = material('forged iron', '#302F2C', 0.83, 0.8);
  const rust = material('oxidized steel', '#915035', 0.69, 0.88);
  const dark = material('carbon black', '#1F2525', 0.25, 0.94);
  const brass = material('weathered brass', '#CBA252', 0.82, 0.43);
  const silver = material('brushed aluminum', '#CBD5D0', 0.91, 0.26);
  const rope = material('dusty guy wire', '#978673', 0.32, 0.94);
  const base = (radius = 2, height = 0.18) => {
    cylinder(iron, [0, height / 2, 0], radius, height);
    ring(rust, [0, height + 0.02, 0], radius * 0.91, 0.055, [Math.PI / 2, 0, 0]);
  };
  return { root, rng, material, physical, geometry, own, add, box, sphere, cylinder, beam, ring, panel, curve, group, motion, iron, rust, dark, brass, silver, rope, base };
}

type Kit = ReturnType<typeof createKit>;

function pilgrim(k: Kit) {
  const { box, beam, ring, sphere, panel, brass, iron, rust, dark } = k;
  k.base(1.95);
  const ceramic = k.material('dust white ceramic', '#DFD3B9', 0.15, 0.89);
  const gold = k.material('sunlight enamel', '#F2AE43', 0.42, 0.49, 1, 0.11);
  box(iron, [-0.73, 0.33, 0.27], [0.78, 0.38, 1.24]);
  box(iron, [0.8, 0.33, -0.09], [0.78, 0.38, 1.18]);
  beam(rust, [-0.73, 0.5, 0.1], [-0.93, 2.5, 0.12], 0.32);
  beam(rust, [-0.93, 2.5, 0.12], [-0.62, 4.35, 0], 0.38);
  beam(iron, [0.8, 0.5, -0.15], [1.08, 2.4, -0.12], 0.3);
  beam(rust, [1.08, 2.4, -0.12], [0.57, 4.35, 0], 0.38);
  sphere(brass, [-0.93, 2.5, 0.13], [0.41, 0.4, 0.38]);
  sphere(brass, [1.08, 2.4, -0.12], [0.39, 0.4, 0.37]);
  box(iron, [0, 4.25, 0], [1.8, 0.64, 0.9], [0, 0, -0.06]);
  beam(iron, [0, 4.5, 0], [0, 6.7, 0], 0.23);
  for (let i = 0; i < 5; i++) {
    const y = 4.9 + i * 0.36; const width = 0.66 + i * 0.105;
    panel(i % 2 ? ceramic : rust, [[-width, y + 0.3, 0.36], [-0.12, y + 0.22, 0.7], [-0.12, y - 0.03, 0.67], [-width + 0.05, y, 0.31]]);
    panel(i % 2 ? rust : ceramic, [[width, y + 0.3, 0.36], [0.12, y + 0.22, 0.7], [0.12, y - 0.03, 0.67], [width - 0.05, y, 0.31]]);
  }
  beam(brass, [-1.12, 6.55, 0], [1.12, 6.55, 0], 0.16);
  k.motion('pilgrim-arms', [0, 6.55, 0], () => {
  beam(rust, [-1.13, 6.5, 0], [-1.94, 7.62, 0], 0.23);
  beam(iron, [-1.94, 7.62, 0], [-1.55, 8.8, 0.17], 0.17);
  beam(rust, [1.13, 6.5, 0], [2.04, 7.62, 0], 0.23);
  beam(iron, [2.04, 7.62, 0], [1.64, 8.88, 0.1], 0.17);
  sphere(brass, [-1.94, 7.62, 0], [0.27, 0.27, 0.27]);
  sphere(brass, [2.04, 7.62, 0], [0.27, 0.27, 0.27]);
  box(ceramic, [-1.56, 8.95, 0.14], [0.39, 0.62, 0.24], [0, 0, -0.18]);
  box(ceramic, [1.65, 9.0, 0.1], [0.39, 0.62, 0.24], [0, 0, 0.16]);
  }, 0);
  beam(iron, [0, 6.6, 0], [0, 7.24, 0], 0.18);
  sphere(ceramic, [0, 7.55, 0], [0.52, 0.71, 0.5]);
  box(dark, [0, 7.64, 0.46], [0.64, 0.12, 0.13]);
  k.motion('pilgrim-sun', [0, 8.28, -0.25], () => {
  ring(gold, [0, 8.28, -0.25], 1.57, 0.13);
  ring(brass, [0, 8.28, -0.25], 1.77, 0.055);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * TAU + 0.06 * k.rng();
    beam(gold, [Math.cos(angle) * 1.78, 8.28 + Math.sin(angle) * 1.78, -0.25], [Math.cos(angle) * 2.01, 8.28 + Math.sin(angle) * 2.01, -0.25], 0.045);
  }  }, 0);

}

function mirrorSaint(k: Kit) {
  k.base(2.25, 0.25);
  const mirror = k.material('bright mirror fragments', '#C7E5E1', 0.96, 0.11);
  const smoke = k.material('smoked mirror fragments', '#718B8D', 0.95, 0.2);
  const mint = k.material('sea glass seams', '#74CBC4', 0.5, 0.2, 0.7, 0.12);
  k.box(k.iron, [0, 0.7, 0], [2.24, 0.9, 1.6]);
  k.box(k.rust, [0, 1.63, 0], [1.65, 0.92, 1.24], [0, 0.18, 0]);
  k.beam(k.silver, [0, 1.9, 0], [0, 4.2, 0], 0.37);
  k.panel(smoke, [[-2.2, 2.45, 0.3], [-1.5, 3.56, 0], [-0.4, 3.4, 0.6], [-0.3, 2.6, 0.9]]);
  k.panel(mirror, [[2.2, 2.45, 0.3], [1.5, 3.56, 0], [0.4, 3.4, 0.6], [0.3, 2.6, 0.9]]);
  k.motion('mirror-mask', [0, 5.72, 0], () => {
  const rows = [[3.55, 0.71, 0.68], [4.2, 1.4, 0.94], [5.5, 1.72, 1.17], [6.85, 1.47, 1.02], [7.5, 0.72, 0.55]];
  for (let row = 0; row < rows.length - 1; row++) {
    for (let side = 0; side < 8; side++) {
      const a = side / 8 * TAU; const b = (side + 1) / 8 * TAU;
      const low = rows[row]; const high = rows[row + 1];
      const points: Point[] = [[Math.sin(a) * low[1], low[0], Math.cos(a) * low[2]], [Math.sin(b) * low[1], low[0], Math.cos(b) * low[2]], [Math.sin(b) * high[1], high[0], Math.cos(b) * high[2]], [Math.sin(a) * high[1], high[0], Math.cos(a) * high[2]]];
      const piece = k.panel((row + side) % 5 === 0 ? smoke : (row + side) % 7 === 0 ? mint : mirror, points);
      const gap = 0.045 + k.rng() * 0.09;
      piece.position.set(Math.sin((a + b) / 2) * gap, (k.rng() - 0.5) * 0.06, Math.cos((a + b) / 2) * gap);
      piece.rotation.z = (k.rng() - 0.5) * 0.025;
    }
  }
  k.box(k.dark, [-0.66, 5.72, 1.04], [0.75, 0.14, 0.12], [0, -0.13, -0.07]);
  k.box(k.dark, [0.66, 5.72, 1.04], [0.75, 0.14, 0.12], [0, 0.13, 0.07]);
  k.panel(mirror, [[-0.22, 5.95, 1.14], [0.23, 5.95, 1.14], [0.32, 4.99, 1.36], [0, 5.03, 1.73], [-0.28, 5.01, 1.36]]);
  k.box(k.dark, [0, 4.68, 1.05], [0.9, 0.1, 0.15]);
  k.panel(mirror, [[-0.55, 4.58, 1.11], [0.55, 4.58, 1.11], [0.4, 4.4, 1.13], [-0.3, 4.4, 1.13]]);
  k.ring(k.brass, [0, 5.72, -0.57], 2.27, 0.06, [0.02, -0.15, 0]);
  }, 0);
  for (let i = 0; i < 4; i++) k.beam(k.rope, [i % 2 ? 1.35 : -1.35, 3.55, i < 2 ? 0.65 : -0.65], [i % 2 ? 1.85 : -1.85, 0.26, i < 2 ? 0.9 : -0.9], 0.022);
}

function leviathan(k: Kit) {
  // A wide suspended whale skeleton: ivory ribs, a split jaw and a forked tail.
  const bone = k.material('porcelain whale bone', '#F1DFC0', 0.025, 0.88);
  const copper = k.material('excavated copper spine', '#518D82', 0.62, 0.73);
  const shadow = k.material('bone cavity', '#66594E', 0.05, 0.97);
  k.motion('whale-body', [0, 4.1, 0], () => {
  const spine: Point[] = [[-4.8, 4.2, 0], [-3.2, 3.82, 0], [-1.2, 4.05, 0], [1.4, 4.43, 0], [3.15, 4.12, 0]];
  k.curve(copper, spine, 0.17);
  for (let i = 0; i < 10; i++) {
    const x = -3.3 + i * 0.61; const y = 3.9 + Math.sin(i / 9 * Math.PI) * 0.42;
    const girth = 0.78 + Math.sin((i + 1) / 12 * Math.PI) * 1.22;
    for (const side of [-1, 1]) {
      k.motion('whale-ribs', [0, 4.1, 0], () => {
      k.curve(bone, [[x, y, 0], [x - 0.07, y - 0.12, side * girth * 0.72], [x - 0.05, y - 1.22, side * girth], [x + 0.16, y - 2.16, side * girth * 0.45]], 0.085 + (i % 3) * 0.012);
      });
    }
    k.sphere(bone, [x, y + 0.04, 0], [0.19, 0.25, 0.3]);
    k.beam(bone, [x, y, 0], [x - 0.2, y + 0.58 + k.rng() * 0.12, 0], 0.065);
  }
  // The skull is hollow, so distant viewers can read the gaping long jaw.
  for (const side of [-1, 1]) {
    k.motion('whale-head', [2.05, 4.4, 0], () => {
    k.curve(bone, [[2.05, 4.4, side * 0.68], [3.4, 4.64, side * 1.07], [4.95, 3.98, side * 0.88], [5.58, 3.14, side * 0.28]], 0.18);
    k.curve(bone, [[2.16, 3.26, side * 0.86], [3.43, 2.26, side * 1.12], [4.91, 2.37, side * 0.69], [5.58, 3.14, side * 0.28]], 0.16);
    k.ring(shadow, [3.05, 4.12, side * 1.0], 0.31, 0.1, [0.14, 0, -0.3]);
    for (let i = 0; i < 6; i++) k.beam(bone, [3.15 + i * 0.31, 2.45 + i * 0.045, side * (1.02 - i * 0.052)], [3.24 + i * 0.3, 2.95 + i * 0.033, side * (1.01 - i * 0.05)], 0.035);
    });
    k.curve(bone, [[-0.25, 3.22, side * 1.65], [0.5, 2.98, side * 2.52], [1.74, 2.49, side * 3.38]], 0.105);
    k.curve(copper, [[0.12, 2.89, side * 1.59], [1.04, 2.43, side * 2.54], [1.74, 2.49, side * 3.38]], 0.075);
  k.motion('whale-tail', [-4.62, 4.12, 0], () => {
    k.panel(copper, [[-4.62, 4.12, 0], [-5.33, 5.5, side * 1.18], [-5.1, 6.25, side * 2.23], [-4.31, 4.59, side * 1.41]]);
    k.curve(bone, [[-4.72, 4.13, 0], [-5.3, 5.45, side * 1.2], [-5.1, 6.25, side * 2.23]], 0.095);  }, side);

  }
  k.panel(bone, [[-0.8, 4.27, 0], [-1.82, 6.26, 0.05], [0.41, 4.44, 0]]);
  }, 0);
  for (const x of [-2.85, 1.45]) {
    k.box(k.rust, [x, 0.18, 0], [1.9, 0.36, 2.0], [0, 0.12, 0]);
    for (const side of [-1, 1]) k.beam(k.iron, [x, 0.3, side * 0.74], [x, 3.3, side * 0.32], 0.065);
    k.beam(k.rope, [x, 3.8, 0], [x + 0.7, 0.36, 1.0], 0.02);
  }
}

function beautifulCollapse(k: Kit) {
  // Memphis-pop collage: a striped plinth, precarious slabs, an empty hoop,
  // a polished sphere and a mismatched cone. No shared rusty-tower language.
  const pink = k.material('hot coral powdercoat', '#F17789', 0.12, 0.4);
  const blue = k.material('electric ultramarine', '#426BDD', 0.24, 0.34);
  const cream = k.material('cream cast terrazzo', '#F3E9CF', 0.015, 0.9);
  const yellow = k.material('sunflower enamel', '#F5CC46', 0.18, 0.33);
  const teal = k.material('pool turquoise enamel', '#50C9BE', 0.2, 0.36);
  k.box(cream, [0, 0.22, 0], [3.9, 0.44, 2.6]);
  for (let i = 0; i < 8; i++) k.box(i % 2 ? blue : pink, [-1.72 + i * 0.49, 0.26, 1.33], [0.25, 0.38, 0.055]);
  k.box(blue, [-0.62, 1.1, 0], [1.3, 1.36, 1.8], [0, -0.2, -0.15]);
  k.sphere(pink, [0.93, 1.1, -0.12], [0.88, 0.74, 0.88]);
  k.box(yellow, [0.12, 2.03, 0], [4.45, 0.42, 1.55], [0.03, -0.35, 0.16]);
  k.cylinder(teal, [-0.51, 3.07, -0.09], 0.86, 1.8);
  k.motion('collapse-hoop', [0.05, 4.12, 0.12], () => {
  k.box(pink, [0.23, 4.12, 0.15], [3.8, 0.47, 1.4], [0.14, 0.34, -0.16]);
  k.ring(blue, [0.05, 5.46, 0.12], 1.13, 0.28, [0.04, -0.12, -0.18]);
  }, 0);
  k.motion('collapse-crown', [0.46, 6.77, -0.12], () => {
  k.box(cream, [0.46, 6.77, -0.12], [3.73, 0.31, 1.64], [0, -0.3, 0.2]);
  k.sphere(k.silver, [-0.75, 7.6, 0.05], [0.71, 0.71, 0.71]);
  k.cylinder(yellow, [0.88, 7.93, -0.08], 0.88, 2.13, 0.035);
  k.box(teal, [0.19, 9.12, -0.01], [2.81, 0.18, 1.15], [0.12, 0.48, -0.13]);
  }, 0);
  for (let i = 0; i < 5; i++) k.box(blue, [-1.25 + i * 0.54, 2.2 + i * 0.025, 0.69], [0.12 + k.rng() * 0.05, 0.2, 0.02], [0, 0, 0.16]);
}

function orbitEngine(k: Kit) {
  k.base(2.52);
  const enamel = k.material('dark petrol enamel', '#3A646C', 0.77, 0.41);
  const sun = k.material('amber heart', '#EEBB54', 0.47, 0.35, 1, 0.28);
  for (const side of [-1, 1]) {
    k.beam(k.rust, [side * 1.72, 0.24, 0], [side * 1.54, 3.52, 0], 0.2);
    k.beam(k.iron, [side * 1.54, 3.52, 0], [side * 2.44, 5.6, 0], 0.16);
    k.beam(k.iron, [side * 1.75, 0.24, -0.87], [side * 1.5, 3.65, 0], 0.07);
    k.beam(k.iron, [side * 1.75, 0.24, 0.87], [side * 1.5, 3.65, 0], 0.07);
    k.sphere(k.brass, [side * 2.44, 5.6, 0], [0.24, 0.24, 0.24]);
  }
  const orbit = k.group('kinetic-orbits', [0, 5.65, 0]);
  orbit.userData.livingMotion = 'orbit-gimbals';
  k.ring(k.brass, [0, 0, 0], 2.39, 0.11, [0.18, 0, 0], orbit);
  k.ring(enamel, [0, 0, 0], 2.03, 0.16, [0.9, 0.75, 0.4], orbit);
  k.ring(k.silver, [0, 0, 0], 1.66, 0.07, [-0.47, 1.18, 0], orbit);
  k.sphere(sun, [0, 0, 0], [0.62, 0.62, 0.62], orbit);
  k.beam(k.iron, [0, -2.42, 0], [0, 2.42, 0], 0.045, orbit);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.02 * k.rng();
    const plate = k.box(i % 3 ? k.brass : enamel, [Math.cos(a) * 2.39, Math.sin(a) * 2.39, 0], [0.12, 0.4, 0.28], [0, 0, a - Math.PI / 2], orbit);
    plate.rotation.y = 0.25;
  }
  k.ring(k.brass, [0, 1.2, 0], 0.84, 0.09, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU;
    k.beam(k.rust, [Math.cos(a) * 0.84, 0.19, Math.sin(a) * 0.84], [Math.cos(a) * 0.84, 1.22, Math.sin(a) * 0.84], 0.1);
  }
  k.cylinder(k.dark, [0, 0.9, 0], 0.5, 1.25);
}

function windCathedral(k: Kit) {
  const chalk = k.material('ivory sailcloth', '#F0E9D6', 0.0, 0.98);
  const rose = k.material('vermilion sailcloth', '#D95548', 0.04, 0.92);
  const indigo = k.material('ink blue patched sail', '#304F70', 0.07, 0.93);
  const sails: { foot: Point; top: Point; tip: Point; material: Material }[] = [
    { foot: [-1.65, 0.13, -0.9], top: [-0.92, 9.2, -0.55], tip: [2.52, 2.3, -0.35], material: chalk },
    { foot: [1.43, 0.13, 0.8], top: [1.12, 7.72, 0.48], tip: [-2.43, 3.01, 0.7], material: rose },
    { foot: [0.42, 0.13, -1.55], top: [0.3, 8.4, -1.24], tip: [2.31, 3.69, -0.74], material: indigo },
    { foot: [-1.15, 0.13, 1.23], top: [-1.5, 6.58, 1.0], tip: [1.72, 1.0, 1.13], material: chalk },
  ];
  for (const { foot, top, tip, material } of sails) {
    k.cylinder(k.rust, [foot[0], 0.12, foot[2]], 0.38, 0.24);
    k.beam(k.iron, foot, top, 0.055);
  k.motion('cathedral-sail', foot, () => {
    const belly: Point = [(foot[0] + top[0] + tip[0]) / 3, (foot[1] + top[1] + tip[1]) / 3, (foot[2] + top[2] + tip[2]) / 3 + 0.38 + k.rng() * 0.12];
    k.panel(material, [foot, top, belly]);
    k.panel(material, [top, tip, belly]);
    k.panel(material, [tip, foot, belly]);
    k.beam(k.rope, foot, top, 0.014);
    k.beam(k.rope, top, tip, 0.018);
    k.beam(k.rope, tip, foot, 0.018);
    k.beam(k.rope, top, [tip[0] * 0.86, 0.14, tip[2] + 0.22], 0.016);
    k.beam(k.rope, belly, [top[0] * 0.6 + tip[0] * 0.4, top[1] * 0.6 + tip[1] * 0.4, top[2] * 0.6 + tip[2] * 0.4], 0.012);  }, foot[0]);

  }
  k.beam(k.rust, [-2.45, 0.12, 0], [2.4, 0.12, 0], 0.08);
  k.beam(k.rust, [0, 0.12, -2.25], [0, 0.12, 2.25], 0.08);
  for (let i = 0; i < 5; i++) {
    const y = 8.2 + i * 0.23;
    k.panel(i % 2 ? rose : chalk, [[-0.88, y, -0.54], [-0.86, y + 0.2, -0.54], [-0.4 + k.rng() * 0.2, y + 0.06, -0.55]]);
  }
}

function glassBloom(k: Kit) {
  const stem = k.material('emerald glazed bronze', '#367F72', 0.62, 0.3);
  const glass = k.physical('seafoam opal glass petals', {color: '#BAF0E5', metalness: 0.03, roughness: 0.26, transmission: 0.58, thickness: 0.34, ior: 1.44, clearcoat: 0.46, iridescence: 0.25, envMapIntensity: 1.25});
  const roseGlass = k.physical('blush opal glass petals', {color: '#F1B1C7', metalness: 0.02, roughness: 0.3, transmission: 0.46, thickness: 0.3, ior: 1.43, clearcoat: 0.42, iridescence: 0.15});
  const amber = k.material('luminous amber seed', '#F9C868', 0.34, 0.31, 1, 0.2);
  k.curve(stem, [[0, 0, 0], [-0.43, 1.4, 0.07], [0.31, 3.06, 0], [0, 4.62, 0]], 0.2);
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * TAU + 0.12; const reach = 1 + k.rng() * 0.09;
    const positions: number[] = []; const indices: number[] = []; const rows = 16, columns = 8;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows; const radius = (0.18 + 2.9 * Math.sin(t * Math.PI / 2)) * reach;
      const width = Math.pow(Math.sin(Math.PI * t), 0.76) * 0.83;
      for (let column = 0; column <= columns; column++) {
        const u = column / columns * 2 - 1;
        const y = 4.48 + 3.4 * t - Math.sin(Math.PI * t) * 0.55 + u * u * Math.sin(Math.PI * t) * 0.4;
        positions.push(Math.cos(angle) * radius - Math.sin(angle) * u * width, y, Math.sin(angle) * radius + Math.cos(angle) * u * width);
        if (row < rows && column < columns) { const a = row * (columns + 1) + column, b = a + columns + 1; indices.push(a, b, a + 1, b, b + 1, a + 1); }
      }
    }
    const petal = k.own(new THREE.BufferGeometry());petal.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));petal.setIndex(indices);petal.computeVertexNormals();
    k.motion('bloom-petal', [0, 4.48, 0], () => { k.add(petal, i % 3 ? glass : roseGlass, [0, 0, 0]); }, angle);
  }
  k.motion('bloom-heart', [0, 5.17, 0], () => {
  k.sphere(amber, [0, 5.17, 0], [0.74, 1.04, 0.74]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU; const tip: Point = [Math.cos(a) * 0.64, 6.21 + (i % 2) * 0.31, Math.sin(a) * 0.64];
    k.curve(k.brass, [[0, 4.8, 0], [Math.cos(a) * 0.44, 5.43, Math.sin(a) * 0.44], tip], 0.038);
    k.sphere(amber, tip, [0.15, 0.24, 0.15]);
  }
  }, 0);
  for (const side of [-1, 1]) {
    k.panel(stem, [[side * 0.1, 1.95, 0], [side * 2.26, 3.82, 0.12], [side * 1.61, 2.0, 0.65], [side * 0.22, 1.72, 0.19]]);
    k.curve(k.brass, [[0, 0.09, 0], [side * 1.31, 0.02, 0.73], [side * 2.48, 0.04, 1.35]], 0.12);
    k.curve(stem, [[0, 0.11, 0], [side * 0.98, 0.04, -0.71], [side * 1.79, 0.04, -1.54]], 0.17);
  }
}

function radioGhost(k: Kit) {
  k.base(2.1);
  const olive = k.material('surplus olive enamel', '#7A8760', 0.42, 0.9);
  const red = k.material('warning orange', '#D17B41', 0.36, 0.73);
  k.box(k.rust, [0, 0.65, 0], [2.35, 0.9, 1.7]);
  for (let i = 0; i < 4; i++) {
    const y = 1.5 + i * 1.23; const x = (i % 2 ? 0.17 : -0.14);
    k.box(i % 2 ? olive : k.iron, [x, y, 0], [1.8 - i * 0.09, 1.12, 1.04], [0, (i % 2 ? 0.05 : -0.05), 0]);
    k.motion('radio-speaker', [0, 0, .61], () => {
    const cone = k.add(k.geometry('speaker-cone', () => new THREE.ConeGeometry(0.43, 0.17, 16, 1, true)), k.dark, [x, y, 0.61]);
    cone.rotation.x = -Math.PI / 2;
    }, 0);
    k.ring(k.silver, [x, y, 0.59], 0.44, 0.037);
    k.sphere(k.dark, [x, y, 0.6], [0.16, 0.16, 0.08]);
    k.box(red, [x + 0.63, y + 0.31, 0.56], [0.1, 0.1, 0.04]);
  }
  k.beam(k.iron, [0, 5.6, 0], [0, 9.28, 0], 0.085);
  k.beam(k.rust, [-0.9, 0.3, -0.7], [-0.68, 7.0, -0.49], 0.06);
  k.beam(k.rust, [0.9, 0.3, -0.7], [0.68, 7.0, -0.49], 0.06);
  k.motion('radio-aerial', [0, 7.23, 0.1], () => {
  k.ring(k.silver, [0, 7.23, 0.2], 1.26, 0.075, [0.3, -0.15, 0]);
  const bowl = k.add(k.geometry('radio-dish', () => new THREE.SphereGeometry(1, 16, 6, 0, TAU, 0, Math.PI * 0.44)), olive, [0, 7.23, 0.1], [1.26, 0.45, 1.26], [Math.PI / 2 + 0.3, -0.15, 0]);
  bowl.material = olive;
  k.beam(k.iron, [0, 7.2, 0.1], [0, 7.4, 1.31], 0.04);
  k.sphere(red, [0, 7.4, 1.31], [0.15, 0.15, 0.15]);
  for (let i = 0; i < 6; i++) {
    const y = 7.95 + i * 0.23; const width = 1.43 - i * 0.18;
    k.beam(k.silver, [-width, y, 0], [width, y, 0], 0.028);
  }
  }, 0);
  k.curve(k.dark, [[-0.76, 6.2, -0.5], [-1.54, 4.93, 0.03], [-1.28, 2.79, 0.24], [-1.61, 1.33, 0.49], [-0.9, 0.2, 0.73]], 0.045);
  k.curve(k.dark, [[0.79, 4.3, 0], [1.33, 3.01, 0.37], [1.12, 1.4, 0.4], [1.55, 0.2, 0.64]], 0.04);
  for (let i = 0; i < 3; i++) k.box(red, [1.0, 0.43 + i * 0.27, 0.88], [0.12, 0.16 + k.rng() * 0.05, 0.07]);
  const fadedPink = k.material('discarded pink television', '#BF777B', 0.18, 0.92);
  for (const [x, y, width] of [[-2.05, 1.1, 1.7], [1.92, 2.05, 1.56], [-1.83, 3.2, 1.34]]) {
    k.box(fadedPink, [x, y, 0.13], [width, 1.27, 1.2], [0, x * 0.035, x * 0.025]);
    k.box(k.dark, [x, y + 0.05, 0.77], [width * 0.76, 0.83, 0.06]);
    for (let scan = 0; scan < 4; scan++) k.box(olive, [x, y - 0.2 + scan * 0.17, 0.812], [width * 0.69, 0.027, 0.014]);
    k.sphere(red, [x + width * 0.38, y - 0.45, 0.8], [0.075, 0.075, 0.04]);
    k.beam(k.rust, [x, 0.2, -0.32], [x, y, -0.32], 0.1);
  }
  const megaphone = k.cylinder(k.rust, [-2.15, 5.61, 0], 1.06, 1.55, 0.26);
  megaphone.rotation.x = -Math.PI / 2; megaphone.rotation.z = 0.18;
  k.ring(k.silver, [-2.15, 5.61, 0.78], 1.05, 0.07);
  k.sphere(k.dark, [-2.15, 5.61, 0.85], [0.73, 0.73, 0.035]);
  k.beam(k.iron, [-2.15, 3.1, -0.25], [-2.15, 5.61, -0.25], 0.08);
  k.panel(red, [[1.3, 4.73, -0.07], [3.05, 5.11, -0.07], [2.77, 4.5, -0.06], [1.34, 4.34, -0.06]]);
  k.curve(k.dark, [[-2.05, 3.18, -0.3], [-3.1, 2.4, 0.08], [-2.73, 0.48, 0.37], [1.95, 0.19, 0.7]], 0.06);
}

function sunGate(k: Kit) {
  const clay = k.material('red oxide monolith', '#C6744F', 0.25, 0.92);
  const black = k.material('black volcanic plate', '#393636', 0.42, 0.91);
  const gold = k.material('polished solar edge', '#DFB16A', 0.83, 0.38);
  k.box(k.iron, [0, 0.14, 0], [5.05, 0.28, 1.5]);
  for (const side of [-1, 1]) {
    const p = (x: number, y: number, z: number): Point => [x * side, y, z];
    const outline = [[0.91, 0.25], [2.48, 0.25], [2.57, 3.1], [2.17, 5.65], [1.37, 7.42], [0.45, 8.6], [0.83, 6.63], [1.24, 4.74], [1.24, 2.28]];
    k.panel(clay, outline.map(([x, y]) => p(x, y, 0.39)));
    k.panel(black, [...outline].reverse().map(([x, y]) => p(x, y, -0.39)));
    for (let i = 0; i < outline.length; i++) {
      const next = outline[(i + 1) % outline.length]; const current = outline[i];
      k.panel(i > 4 ? gold : clay, [p(current[0], current[1], -0.39), p(next[0], next[1], -0.39), p(next[0], next[1], 0.39), p(current[0], current[1], 0.39)]);
    }
    for (let i = 0; i < 4; i++) k.box(black, p(1.62 + i * 0.035, 1.35 + i * 0.7, 0.43), [0.42 + k.rng() * 0.2, 0.035, 0.04], [0, 0, side * -0.12]);
    k.beam(k.rope, p(2.13, 4.9, -0.12), p(2.21, 0.24, -1.37), 0.023);
  }
  k.motion('gate-sun', [0, 6.19, 0], () => {
  k.ring(gold, [0, 6.19, 0], 1.08, 0.14);
  k.ring(black, [0, 6.19, -0.11], 0.81, 0.1);
  k.beam(k.iron, [-1.06, 6.19, 0], [1.06, 6.19, 0], 0.025);
  k.beam(k.iron, [0, 5.11, 0], [0, 7.27, 0], 0.025);  }, 0);

}

function nowhereStairs(k: Kit) {
  // An impossible switchback in open air, with a single door at the summit.
  // The clear zig-zag silhouette is deliberately unlike the Memory Helix.
  const concrete = k.material('chalk white brutalist concrete', '#EEE9DA', 0.015, 0.96);
  const blue = k.material('cobalt stair undersides', '#536BCA', 0.18, 0.62);
  const coral = k.material('vermilion destination door', '#EF684F', 0.14, 0.48);
  k.box(concrete, [-1.7, 0.19, 0], [4.7, 0.38, 2.4]);
  for (let i = 0; i < 9; i++) {
    const x = -3.45 + i * 0.62; const y = 0.55 + i * 0.45;
    k.box(concrete, [x, y, 0.12], [0.81, 0.24, 1.78]);
    k.box(blue, [x, y - 0.17, 0.12], [0.78, 0.12, 1.8]);
    if (i % 2 === 0) k.beam(k.iron, [x, y + 0.1, -0.72], [x, y + 1.1, -0.72], 0.022);
  }
  k.beam(concrete, [-3.65, 0.39, 0.12], [1.72, 4.36, 0.12], 0.18);
  k.box(concrete, [1.87, 4.43, -0.6], [1.68, 0.3, 3.08]);
  k.beam(concrete, [0.8, 0.12, -1.32], [2.0, 4.36, -1.32], 0.25);
  k.motion('stairs-flight', [1.87, 4.43, -.6], () => {
  for (let i = 0; i < 9; i++) {
    const x = 1.98 - i * 0.52; const y = 4.74 + i * 0.43;
    k.box(i % 4 === 2 ? coral : concrete, [x, y, -1.5], [0.74, 0.22, 1.47]);
    k.box(blue, [x, y - 0.17, -1.5], [0.74, 0.12, 1.49]);
  }
  k.beam(concrete, [2.13, 4.56, -1.5], [-2.35, 8.14, -1.5], 0.16);
  k.box(concrete, [-2.32, 8.46, -1.5], [2.06, 0.24, 2.08]);
  for (const side of [-1, 1]) k.box(coral, [-2.32 + side * 0.68, 9.5, -1.6], [0.2, 2.08, 0.22]);
  k.box(coral, [-2.32, 10.5, -1.6], [1.56, 0.2, 0.22]);
  k.motion('stairs-door', [-3.0, 9.5, -1.6], () => {
  k.box(blue, [-3.14, 9.38, -1.83], [0.19, 1.81, 0.75], [0, -0.65 - k.rng() * 0.12, 0]);
  }, 0);
  });
  k.beam(k.iron, [-3.45, 1.65, -0.72], [1.58, 5.23, -0.72], 0.025);
  for (const z of [-2.25, -0.77]) k.beam(k.rope, [-2.38, 8.3, z], [-2.84, 0.38, z], 0.018);
}

function landJellyfish(k: Kit) {
  const pearl = k.material('pearlescent canopy', '#DBBFD8', 0.39, 0.49, 0.95);
  const blue = k.material('smoky violet silk', '#A3A4D9', 0.07, 0.85, 0.87);
  const peach = k.material('blush silk', '#EB9BB8', 0.04, 0.9, 0.9);
  const ribs = k.material('pearl ribs', '#E0D5BF', 0.7, 0.43);
  k.ring(k.iron, [0, 0.08, 0], 1.9, 0.08, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU; const b = (i + 1) / 8 * TAU;
    const crown: Point = [0, 8.21, 0];
    const left: Point = [Math.cos(a) * 1.68, 7.76, Math.sin(a) * 1.68];
    const right: Point = [Math.cos(b) * 1.68, 7.76, Math.sin(b) * 1.68];
    const leftLow: Point = [Math.cos(a) * 2.42, 6.68, Math.sin(a) * 2.42];
    const rightLow: Point = [Math.cos(b) * 2.42, 6.68, Math.sin(b) * 2.42];
  k.motion('jelly-bell', [0, 6.68, 0], () => {
    k.panel(i % 2 ? pearl : blue, [crown, left, right]);
    k.panel(i % 2 ? pearl : blue, [left, leftLow, rightLow, right]);
    k.curve(ribs, [crown, left, leftLow], 0.046);
  }, 0);
    const reach = 0.98 + k.rng() * 0.7;
    const lowY = 0.58 + k.rng() * 1.32;
    const middle: Point = [Math.cos(a + 0.36) * 1.67, 4.7, Math.sin(a + 0.36) * 1.67];
    const bottom: Point = [Math.cos(a - 0.22) * reach, lowY, Math.sin(a - 0.22) * reach];
  k.motion('jelly-ribbon', [0, 6.68, 0], () => {
    k.curve(i % 2 ? blue : peach, [leftLow, middle, [Math.cos(a - 0.12) * 1.16, 2.84, Math.sin(a - 0.12) * 1.16], bottom], 0.075 + (i % 3) * 0.025);
    k.panel(i % 2 ? blue : peach, [leftLow, [leftLow[0] + 0.2, leftLow[1], leftLow[2]], [middle[0] + 0.26, middle[1], middle[2]], bottom, middle]);
  }, (i % 4) / 8 * TAU);

  }
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU;
    k.curve(k.iron, [[Math.cos(a) * 1.85, 0.16, Math.sin(a) * 1.85], [Math.cos(a) * 0.54, 3.54, Math.sin(a) * 0.54], [Math.cos(a) * 0.92, 6.88, Math.sin(a) * 0.92]], 0.04);
  }
  k.sphere(k.brass, [0, 6.62, 0], [0.55, 0.35, 0.55]);
  k.ring(ribs, [0, 6.68, 0], 2.42, 0.067, [Math.PI / 2, 0, 0]);
}

function memoryHelix(k: Kit) {
  k.base(2.2);
  const blue = k.material('cobalt folded sheet', '#497CC5', 0.61, 0.53);
  const orange = k.material('copper folded sheet', '#D58450', 0.73, 0.63);
  const paper = k.material('sun worn parchment', '#DED4B6', 0.08, 0.94);
  for (const side of [-1, 1]) k.beam(k.iron, [side * 0.45, 0.2, 0], [side * 0.45, 9.83, 0], 0.09);
  const twist = k.rng() * 0.16;
  for (let i = 0; i < 13; i++) {
    const y = 0.56 + i * 0.7; const a = i * 0.56 + twist;
    for (let side = 0; side < 2; side++) {
      const angle = a + side * Math.PI; const next = angle + 0.5;
      const lo: Point = [Math.cos(angle) * 1.64, y, Math.sin(angle) * 1.64];
      const hi: Point = [Math.cos(next) * 1.64, y + 0.72, Math.sin(next) * 1.64];
      k.motion('helix-sheet', [0, 0, 0], () => { k.panel(side ? orange : blue, [lo, [Math.cos(angle) * 1.08, y - 0.08, Math.sin(angle) * 1.08], [Math.cos(next) * 1.08, y + 0.64, Math.sin(next) * 1.08], hi]); }, side * Math.PI);
    }
    if (i % 2 === 0) {
      k.beam(k.brass, [Math.cos(a) * 1.65, y + 0.07, Math.sin(a) * 1.65], [-Math.cos(a) * 1.65, y + 0.07, -Math.sin(a) * 1.65], 0.043);
      k.box(paper, [0, y + 0.14, 0], [0.38, 0.36, 0.38], [0.3, a, 0.2]);
    }
  }
  k.ring(k.brass, [0, 9.88, 0], 0.78, 0.07, [Math.PI / 2, 0, 0]);
  k.sphere(k.brass, [0, 10.21, 0], [0.22, 0.32, 0.22]);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + Math.PI / 4;
    k.beam(k.rope, [Math.cos(a) * 1.93, 0.2, Math.sin(a) * 1.93], [Math.cos(a) * 0.43, 8.51, Math.sin(a) * 0.43], 0.018);
  }
}

const BUILDERS = [pilgrim, mirrorSaint, leviathan, beautifulCollapse, orbitEngine, windCathedral, glassBloom, radioGhost, sunGate, nowhereStairs, landJellyfish, memoryHelix] as const;

/** Bake static pieces per material; keep kinetic groups as separate transforms. */
function mergeStaticGeometry(root: THREE.Group, index: number, seed: number): void {
  const resources = installationResources.get(root)!;
  const sourceKeys = [...resources.pooled];
  const parents: THREE.Group[] = [];
  root.traverse((object) => { if (object instanceof THREE.Group) parents.push(object); });
  for (const parent of parents) {
    const buckets = new Map<Material, THREE.Mesh<THREE.BufferGeometry, Material>[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      const material = child.material as Material;
      const bucket = buckets.get(material) ?? [];
      bucket.push(child as THREE.Mesh<THREE.BufferGeometry, Material>);
      buckets.set(material, bucket);
    }
    for (const [material, pieces] of buckets) {
      const key = `baked:${index}:${seed}:${parent.name}:${material.name}`;
      let record = geometryPool.get(key);
      if (!record) {
        let vertexCount = 0; let indexCount = 0;
        for (const piece of pieces) {
          const positions = piece.geometry.getAttribute('position');
          vertexCount += positions.count;
          indexCount += piece.geometry.index?.count ?? positions.count;
        }
        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const buildAnchors = new Float32Array(vertexCount * 4), buildAxes = new Float32Array(vertexCount * 4);
        const inverseParent = parent.matrixWorld.clone().invert();
        const buildUp = new THREE.Vector3(0, 1, 0).transformDirection(inverseParent);
        const indices = vertexCount <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
        const vertex = new THREE.Vector3(); const normal = new THREE.Vector3();
        const normalMatrix = new THREE.Matrix3();
        let vertexOffset = 0; let indexOffset = 0;
        for (const piece of pieces) {
          piece.updateMatrix(); normalMatrix.getNormalMatrix(piece.matrix);
          const sourcePositions = piece.geometry.getAttribute('position');
          const sourceNormals = piece.geometry.getAttribute('normal');
          const bounds = new THREE.Box3().setFromObject(piece, true);
          const height = Number(root.userData.height), low = Math.max(0, bounds.min.y / height);
          const mid = (bounds.min.y + bounds.max.y) / (2 * height);
          const isBase = bounds.max.y / height < .09;
          const isSupport = /iron|wire|steel|rib|frame|black/.test(material.name) || (bounds.max.y - bounds.min.y) / height > .32;
          const stagger = (vertexOffset % 17) / 17 * .0325;
          const start = (isBase ? low * .4 : isSupport ? .1 + low * .45 + stagger : .35 + mid * .45 + stagger) * FESTIVAL_CONSTRUCTION_SECONDS;
          const duration = (isBase ? .15 : isSupport ? .25 : .175) * FESTIVAL_CONSTRUCTION_SECONDS;
          const begin = Math.min(FESTIVAL_CONSTRUCTION_SECONDS - duration, start);
          const anchor = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2).applyMatrix4(inverseParent);
          for (let i = 0; i < sourcePositions.count; i++) {
            vertex.fromBufferAttribute(sourcePositions, i).applyMatrix4(piece.matrix);
            normal.fromBufferAttribute(sourceNormals, i).applyNormalMatrix(normalMatrix);
            vertex.toArray(positions, (vertexOffset + i) * 3);
            normal.toArray(normals, (vertexOffset + i) * 3);
            buildAnchors.set([anchor.x, anchor.y, anchor.z, begin], (vertexOffset + i) * 4);
            buildAxes.set([buildUp.x, buildUp.y, buildUp.z, duration], (vertexOffset + i) * 4);
          }
          const sourceIndices = piece.geometry.index;
          const count = sourceIndices?.count ?? sourcePositions.count;
          for (let i = 0; i < count; i++) indices[indexOffset + i] = vertexOffset + (sourceIndices ? sourceIndices.getX(i) : i);
          vertexOffset += sourcePositions.count; indexOffset += count;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('aBuildAnchor', new THREE.BufferAttribute(buildAnchors, 4));
        geometry.setAttribute('aBuildAxis', new THREE.BufferAttribute(buildAxes, 4));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        record = { geometry, users: 0 }; geometryPool.set(key, record);
      }
      record.users++; resources.pooled.add(key);
      for (const piece of pieces) parent.remove(piece);
      const merged = new THREE.Mesh(record.geometry, material);
      merged.name = `${parent.name}:${material.name}`;
      merged.castShadow = true; merged.receiveShadow = true;
      parent.add(merged);
    }
  }
  // Only baked geometry remains in the scene. Release temporary modeling pieces.
  for (const key of sourceKeys) {
    const record = geometryPool.get(key);
    if (record && --record.users === 0) { record.geometry.dispose(); geometryPool.delete(key); }
    resources.pooled.delete(key);
  }
  for (const geometry of resources.owned) geometry.dispose();
  resources.owned.clear();
}

/**
 * Builds a deterministic, monumental installation with a shared safe footprint. Materials belong to this instance
 * so a burn animation can change them freely. Geometry is reference-counted.
 * Authored local mechanisms are advanced by updateInstallationAnimation().
 */
export function createInstallation(kind: number, seed: number): THREE.Group {
  const index = Number.isFinite(kind) ? ((Math.trunc(kind) % BUILDERS.length) + BUILDERS.length) % BUILDERS.length : 0;
  const root = new THREE.Group();
  root.name = `installation:${INSTALLATION_DESIGNS[index].id}`;
  root.userData.kind = index;
  root.userData.seed = Number.isFinite(seed) ? seed : 0;
  root.userData.design = INSTALLATION_DESIGNS[index];
  const kit = createKit(root, seed);
  BUILDERS[index](kit);

  // Each artist has a distinct monumental height and a shared server footprint.
  // Geometry positions are inspected once at creation, never during animation.
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  let radius = 0;
  const vertex = new THREE.Vector3();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      radius = Math.max(radius, Math.hypot(vertex.x, vertex.z));
    }
  });
  const horizontalScale = (INSTALLATION_FOOTPRINT_RADII[index] - 0.35) / radius;
  const verticalScale = INSTALLATION_HEIGHTS[index] / (bounds.max.y - bounds.min.y);
  // Scale above each artist's rotations, never in their local rotated axes.
  // The extra transform also keeps ground alignment independent of scene placement.
  const sculpture = new THREE.Group(); sculpture.name = 'sculpture';
  for (const child of [...root.children]) sculpture.add(child);
  sculpture.scale.set(horizontalScale, verticalScale, horizontalScale);
  sculpture.position.y = -bounds.min.y * verticalScale;
  root.add(sculpture);
  root.updateMatrixWorld(true);
  root.userData.height = INSTALLATION_HEIGHTS[index];
  root.userData.footprintRadius = INSTALLATION_FOOTPRINT_RADII[index];
  root.userData.radius = radius * horizontalScale;
  mergeStaticGeometry(root, index, root.userData.seed as number);
  root.updateMatrixWorld(true);
  return root;
}

/** Removes the group and releases its resources. Safe to call more than once. */
export function disposeInstallation(group: THREE.Group): void {
  const resources = installationResources.get(group);
  if (!resources) return;
  installationResources.delete(group);
  livingStates.delete(group);
  for (const key of resources.pooled) {
    const record = geometryPool.get(key);
    if (record && --record.users === 0) { record.geometry.dispose(); geometryPool.delete(key); }
  }
  for (const geometry of resources.owned) geometry.dispose();
  // Include replacement materials installed by a scene's burn effect as well.
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.materials.add(material);
    }
  });
  for (const material of resources.materials) material.dispose();
  group.removeFromParent();
  group.clear();
}

export type InstallationAnimationOptions = {
  /** false freezes the work in its exact construction pose. */
  active?: boolean;
  reducedMotion?: boolean;
};
type Mechanism = { node: THREE.Object3D; name: string; phase: number; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 };
type LivingState = { mechanisms: Mechanism[]; lastSeconds: number | null; phase: number; strength: number };
const livingStates = new WeakMap<THREE.Group, LivingState>();

/**
 * Animate only authored local mechanisms. The root's placement, build growth,
 * burn tilt and shrink remain owned by the scene. No geometry/material is made
 * or traversed after the first call. Materials and the original burn palette
 * are deliberately untouched; this is an animation-only extension.
 */
export function updateInstallationAnimation(root: THREE.Group, elapsedSeconds: number, options: InstallationAnimationOptions = {}): void {
  let state = livingStates.get(root);
  if (!state) {
    const mechanisms: Mechanism[] = [];
    root.updateWorldMatrix(true, true);
    root.traverse(node => {
      if (typeof node.userData.livingMotion !== 'string') return;
      mechanisms.push({ node, name: node.userData.livingMotion, phase: Number(node.userData.motionPhase ?? 0), position: node.position.clone(), rotation: node.rotation.clone(), scale: node.scale.clone() });
    });
    state = { mechanisms, lastSeconds: null, phase: 0, strength: 0 };
    livingStates.set(root, state);
  }
  const now = Number.isFinite(elapsedSeconds) ? elapsedSeconds : (state.lastSeconds ?? 0);
  const dt = state.lastSeconds === null ? 0 : Math.max(0, Math.min(.1, now - state.lastSeconds));
  state.lastSeconds = now;
  const active = options.active !== false && !options.reducedMotion;
  // Ease the completed work into its large gesture, without a construction pop.
  state.strength = active ? Math.min(1, state.strength + dt * .65) : 0;
  if (active) state.phase += dt * .48;
  else state.phase = 0;
  const t = state.phase, amplitude = state.strength;
  for (const mechanism of state.mechanisms) {
    const { node, position, rotation, scale, phase, name } = mechanism;
    node.position.copy(position); node.rotation.copy(rotation); node.scale.copy(scale);
    if (!active) continue;
    const wave = Math.sin(t + phase), secondary = Math.sin(t * 1.37 + phase);
    switch (name) {
      case 'pilgrim-arms':
        node.scale.y *= 1 + (Math.sin(t) + 1) * .22 * amplitude;
        node.rotation.x += Math.sin(t) * .08 * amplitude;
        break;
      case 'pilgrim-sun': {
        node.position.y += (Math.sin(t) + 1) * .53 * amplitude;
        const pulse = 1 + Math.sin(t * 1.7) * .1 * amplitude;
        node.scale.multiplyScalar(pulse);
        node.rotation.z += Math.sin(t * .6) * .3 * amplitude;
        break;
      }
      case 'mirror-mask':
        node.rotation.y += Math.sin(t * .65) * .38 * amplitude;
        node.scale.x *= 1 + Math.sin(t) * .018 * amplitude;
        node.scale.z *= 1 + Math.sin(t + .5) * .025 * amplitude;
        break;
      case 'whale-body':
        node.position.y += Math.sin(t) * .85 * amplitude;
        node.position.z += Math.sin(t * .5) * .18 * amplitude;
        node.rotation.z += Math.sin(t + .7) * .11 * amplitude;
        node.rotation.x += Math.sin(t * .7) * .1 * amplitude;
        node.scale.x *= 1 - .13 * amplitude;
        node.scale.z *= 1 - .12 * amplitude;
        break;
      case 'whale-ribs':
        node.scale.z *= 1 + Math.sin(t + .6) * .14 * amplitude;
        node.scale.y *= 1 + Math.sin(t + .6) * .09 * amplitude;
        break;
      case 'whale-head':
        node.rotation.z += Math.sin(t + 1.1) * .16 * amplitude;
        break;
      case 'whale-tail':
        node.rotation.z += Math.sin(t + 1.3) * .24 * amplitude;
        node.rotation.x += Math.sin(t + 1.8) * .2 * phase * amplitude;
        break;
      case 'collapse-hoop':
        node.rotation.z += Math.sin(t) * .17 * amplitude;
        node.rotation.y += Math.sin(t * .65) * .2 * amplitude;
        break;
      case 'collapse-crown':
        node.rotation.z -= Math.sin(t + .7) * .16 * amplitude;
        node.position.y += Math.sin(t * 1.2) * .35 * amplitude;
        break;
      case 'orbit-gimbals':
        node.rotation.y += t * .45 * amplitude;
        node.rotation.x += Math.sin(t + .5) * .22 * amplitude;
        node.rotation.z += Math.sin(t * .6) * .18 * amplitude;
        break;
      case 'cathedral-sail':
        node.position.y += .09 * amplitude;
        node.rotation.y += wave * .22 * amplitude;
        node.rotation.z += secondary * .065 * amplitude;
        node.scale.x *= 1 - .2 * amplitude;
        node.scale.z *= 1 - .2 * amplitude;
        break;
      case 'bloom-petal': {
        const opening = (1 - Math.cos(t)) * .2 * amplitude;
        node.rotation.z += Math.cos(phase) * opening;
        node.rotation.x -= Math.sin(phase) * opening;
        break;
      }
      case 'bloom-heart':
        node.scale.y *= 1 + Math.sin(t + .4) * .2 * amplitude;
        node.scale.x *= 1 + Math.sin(t + .4) * .12 * amplitude;
        node.scale.z *= 1 + Math.sin(t + .4) * .12 * amplitude;
        break;
      case 'radio-aerial':
        node.rotation.y += Math.sin(t * .65) * .65 * amplitude;
        node.rotation.x += Math.sin(t * .85) * .15 * amplitude;
        break;
      case 'radio-speaker':
        node.position.z += Math.sin(t * 2 + phase) * .17 * amplitude;
        break;
      case 'gate-sun':
        node.rotation.y += t * .55 * amplitude;
        node.scale.multiplyScalar(1 + Math.sin(t * 1.1) * .14 * amplitude);
        break;
      case 'stairs-door':
        node.rotation.y += (.5 + Math.sin(t * .65) * .5) * 1.3 * amplitude;
        break;
      case 'stairs-flight':
        node.rotation.z -= (1 - Math.cos(t * .8)) * .065 * amplitude;
        break;
      case 'jelly-bell':
        node.scale.x *= 1 + (Math.sin(t) - 1) * .12 * amplitude;
        node.scale.z *= 1 + (Math.sin(t) - 1) * .12 * amplitude;
        node.scale.y *= 1 - Math.sin(t) * .2 * amplitude;
        break;
      case 'jelly-ribbon':
        node.rotation.z += Math.cos(phase) * Math.sin(t + phase * .2) * .18 * amplitude;
        node.rotation.x += Math.sin(phase) * Math.sin(t + phase * .2) * .18 * amplitude;
        node.scale.y *= 1 - (.12 + Math.sin(t + .8) * .08) * amplitude;
        break;
      case 'helix-sheet':
        node.rotation.y += Math.sin(t + phase) * .45 * amplitude;
        node.scale.x *= 1 + Math.sin(t + phase) * .07 * amplitude;
        node.scale.z *= 1 + Math.sin(t + phase) * .07 * amplitude;
        break;
    }
  }
  root.updateWorldMatrix(true, true);
}
