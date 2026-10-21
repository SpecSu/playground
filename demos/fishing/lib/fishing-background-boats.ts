import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type BoatKind = 'sailboat' | 'fishingboat' | 'speedboat' | 'smalltrawler';
type Color = 'white' | 'navy' | 'wood' | 'canvas';
type Point = [number, number, number];

const noRaycast = () => {};

/** Lightweight, unoccupied scenery. Local y=0 is the waterline; +z is the bow. */
export function createFishingBackgroundBoats() {
  const root = new THREE.Group();
  root.name = 'Background boats';
  root.raycast = noRaycast;
  const materials: Record<Color, THREE.MeshStandardMaterial> = {
    white: new THREE.MeshStandardMaterial({ color: '#f5f3e9', roughness: .48, metalness: .05 }),
    navy: new THREE.MeshStandardMaterial({ color: '#23465a', roughness: .48, metalness: .08 }),
    wood: new THREE.MeshStandardMaterial({ color: '#b99363', roughness: .8, metalness: 0 }),
    canvas: new THREE.MeshStandardMaterial({ color: '#fffdf1', roughness: .9, metalness: 0, side: THREE.DoubleSide }),
  };
  for (const [color, material] of Object.entries(materials)) material.name = `Background boat ${color}`;
  const ownedGeometry = new Set<THREE.BufferGeometry>();

  function makeBoat(kind: BoatKind, length: number, width: number, x: number, z: number, heading: number) {
    const boatRoot = new THREE.Group();
    boatRoot.name = `Background ${kind}`;
    boatRoot.userData.kind = kind;
    boatRoot.raycast = noRaycast;
    boatRoot.position.set(x, 0, z);
    boatRoot.rotation.y = heading;
    root.add(boatRoot);
    const pieces: Record<Color, THREE.BufferGeometry[]> = { white: [], navy: [], wood: [], canvas: [] };
    const add = (geometry: THREE.BufferGeometry, color: Color) => {
      // Keep all merge inputs compatible without retaining unused UV buffers.
      const part = geometry.index ? geometry.toNonIndexed() : geometry;
      if (part !== geometry) geometry.dispose();
      part.deleteAttribute('uv');
      if (!part.attributes.normal) part.computeVertexNormals();
      pieces[color].push(part);
    };
    const box = (color: Color, w: number, h: number, d: number, px: number, py: number, pz: number, tilt = 0) => {
      const geometry = new THREE.BoxGeometry(w, h, d);
      geometry.rotateX(tilt); geometry.translate(px, py, pz); add(geometry, color);
    };
    const spar = (color: Color, from: Point, to: Point, radius = .025) => {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
      const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 6, 1);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
      geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      add(geometry, color);
    };
    const triangles = (vertices: number[], color: Color) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals(); add(geometry, color);
    };
    // Three cross-section rings produce a tapered chine and a true pointed bow,
    // with a broad transom rather than an ellipsoid pretending to be a hull.
    const w = width / 2, l = length;
    const outline = [[-.74 * w, -.5 * l], [.74 * w, -.5 * l], [w, -.26 * l],
      [w, .08 * l], [.65 * w, .34 * l], [0, .5 * l], [-.65 * w, .34 * l], [-w, .08 * l], [-w, -.26 * l]];
    const ring = (scaleX: number, scaleZ: number, y: number): Point[] => outline.map(([px, pz]) =>
      [px * scaleX, y + Math.max(0, pz / (l * .5)) * .07, pz * scaleZ]);
    const band = (low: Point[], high: Point[], color: Color) => {
      const vertices: number[] = [];
      for (let i = 0; i < low.length; i++) {
        const next = (i + 1) % low.length;
        vertices.push(...low[i], ...high[i], ...high[next], ...low[i], ...high[next], ...low[next]);
      }
      triangles(vertices, color);
    };
    const hullColor = kind === 'smalltrawler' ? 'navy' : 'white';
    band(ring(.45, .91, -.32), ring(.78, .98, -.08), hullColor);
    band(ring(.78, .98, -.08), ring(1, 1, .43), hullColor);
    band(ring(.863, .989, .10), ring(.898, .992, .18), kind === 'smalltrawler' ? 'white' : 'navy');
    const deck = ring(.92, .97, .438), deckVertices: number[] = [];
    for (let i = 0; i < deck.length; i++) deckVertices.push(0, .438, 0, ...deck[(i + 1) % deck.length], ...deck[i]);
    triangles(deckVertices, 'wood');
    // Slim gunwales define the open deck at distant mobile-camera scales.
    const rim = ring(1, 1, .46);
    for (let i = 0; i < rim.length; i++) spar('white', rim[i], rim[(i + 1) % rim.length], .025);

    if (kind === 'sailboat') {
      box('white', .72, .26, 1.05, 0, .59, .2);
      box('navy', .74, .1, .56, 0, .68, .12);
      box('canvas', .64, .08, .95, 0, .76, .2);
      box('navy', .66, .025, .67, 0, .46, -1.03);
      spar('wood', [0, .6, .32], [0, 3.8, .32], .033);
      spar('wood', [0, .98, .32], [.1, 1.02, -1.28], .026);
      // The slight billow is visible from both sides without a cloth simulation.
      const sail = (a: Point, b: Point, c: Point, belly: Point) => triangles([
        ...a, ...b, ...belly, ...b, ...c, ...belly, ...c, ...a, ...belly,
      ], 'canvas');
      sail([.02, 3.64, .3], [.02, 1.05, .3], [.12, 1.05, -1.26], [.22, 1.8, -.3]);
      sail([.01, 3.1, .38], [.01, 1.02, 1.6], [.01, 1.02, .44], [-.16, 1.65, .8]);
    } else if (kind === 'fishingboat') {
      box('wood', 1.03, .12, .25, 0, .67, -.85);
      box('canvas', .97, .08, .25, 0, .77, -.85);
      box('white', .44, .48, .36, 0, .71, .34);
      box('navy', .47, .25, .045, 0, 1.04, .54, -.16);
      for (const px of [-.55, .55]) for (const pz of [-.72, .58]) spar('white', [px, .48, pz], [px, 1.66, pz], .021);
      box('navy', 1.25, .09, 1.64, 0, 1.71, -.05);
      box('wood', .42, .3, .4, -.32, .6, -1.18);
      box('navy', .28, .52, .3, 0, .35, -1.83);
    } else if (kind === 'speedboat') {
      box('navy', 1.02, .035, 1.65, 0, .48, -.42);
      box('canvas', .94, .16, .45, 0, .65, -.98);
      box('canvas', .94, .3, .12, 0, .81, -1.15);
      for (const px of [-.28, .28]) {
        box('canvas', .4, .15, .42, px, .66, -.22);
        box('canvas', .4, .28, .1, px, .8, -.38);
      }
      box('white', 1.05, .24, .4, 0, .6, .52);
      box('navy', 1.04, .33, .055, 0, .86, .62, -.35);
      spar('white', [-.54, 1.01, .56], [.54, 1.01, .56], .025);
      box('white', .58, .11, .54, 0, .58, 1.07);
    } else {
      box('white', 1.12, 1.0, 1.15, 0, 1.02, .63);
      box('navy', 1.14, .32, .72, 0, 1.31, .69);
      box('white', .08, .45, .75, 0, 1.29, .7);
      box('white', 1.23, .13, 1.3, 0, 1.59, .62);
      box('canvas', 1.16, .04, 1.21, 0, 1.68, .62);
      spar('wood', [0, 1.66, .67], [0, 2.52, .67], .033);
      spar('white', [-.57, .5, -.87], [-.57, 2.06, -.87]);
      spar('white', [.57, .5, -.87], [.57, 2.06, -.87]);
      spar('white', [-.57, 2.06, -.87], [.57, 2.06, -.87]);
      spar('wood', [0, 2.05, -.87], [0, 2.3, -1.62]);
      box('wood', .43, .35, .49, -.35, .64, -1.48);
      box('wood', .43, .35, .49, .24, .64, -1.48);
      for (const px of [-.7, .7]) spar('white', [px, .58, -.98], [px, .79, -1.81], .022);
    }

    for (const color of Object.keys(pieces) as Color[]) {
      if (!pieces[color].length) continue;
      const geometry = mergeGeometries(pieces[color]);
      for (const piece of pieces[color]) piece.dispose();
      if (!geometry) throw new Error(`Could not merge background ${kind} ${color} geometry`);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      ownedGeometry.add(geometry);
      const mesh = new THREE.Mesh(geometry, materials[color]);
      mesh.name = `${kind} ${color}`;
      mesh.raycast = noRaycast;
      mesh.castShadow = false; mesh.receiveShadow = false;
      boatRoot.add(mesh);
    }
    return { root: boatRoot, x, z, heading };
  }

  const boats = [
    makeBoat('sailboat', 3.8, 1.25, -17, -11, .55),
    makeBoat('fishingboat', 3.6, 1.45, 20, -10, -1.05),
    makeBoat('speedboat', 4.3, 1.4, -5, -22, 2.25),
    makeBoat('smalltrawler', 4.7, 1.7, -14, 21, -.65),
  ];
  let disposed = false;
  return { root, boats, dispose() {
    if (disposed) return;
    disposed = true;
    for (const geometry of ownedGeometry) geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
  } };
}
