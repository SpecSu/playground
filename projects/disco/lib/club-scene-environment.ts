import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDisposalScope, stagePosition } from './club-scene-math.ts';
import type { MusicSectionEnergy } from './music-catalog.ts';
import { LIGHT_MODES, type LightMode } from './room-types.ts';

const FLOOR_VISIBLE_EXTENT = 8.7;

interface LightingProfile {
  count: number;
  palette: [number, number, number];
  backdrop: [number, number, number];
  floor: [number, number, number];
  fill: number;
  reflection: number;
  pulseBeats: number;
  paletteBeats: number;
  width: number;
  washSize: number;
}

const LIGHTING_PROFILES: Record<LightMode, LightingProfile> = {
  neon: {
    count: 6, palette: [0x16dbff, 0xff168f, 0x8432ff],
    backdrop: [0x101025, 0x29102f, 0x090a18], floor: [0x211330, 0x111322, 0x8954b0],
    fill: 0xcbd2ef, reflection: 0.16, pulseBeats: 1, paletteBeats: 4, width: 0.68, washSize: 1.8,
  },
  sunset: {
    count: 2, palette: [0xffa62b, 0xff6840, 0xffcc69],
    backdrop: [0x1b100b, 0x30180c, 0x100c0b], floor: [0x2c1b16, 0x1d1416, 0x986d45],
    fill: 0xffe6b4, reflection: 0.19, pulseBeats: 4, paletteBeats: 16, width: 3.8, washSize: 4.2,
  },
  ice: {
    count: 8, palette: [0x31e7ff, 0x3977ff, 0x70baff],
    backdrop: [0x081b2d, 0x0e2434, 0x050c18], floor: [0x102635, 0x10182c, 0x4b83a9],
    fill: 0xcadfff, reflection: 0.12, pulseBeats: 2, paletteBeats: 8, width: 1.15, washSize: 2.2,
  },
  ember: {
    count: 4, palette: [0xff242a, 0xff501c, 0xff1260],
    backdrop: [0x220809, 0x310c14, 0x120708], floor: [0x301115, 0x210c0e, 0xb14750],
    fill: 0xffc9b8, reflection: 0.12, pulseBeats: 2, paletteBeats: 8, width: 1.65, washSize: 2.6,
  },
  acid: {
    count: 5, palette: [0x92ff16, 0xd4ff25, 0x24ed59],
    backdrop: [0x101e05, 0x1f2708, 0x070f09], floor: [0x172911, 0x102016, 0x71a342],
    fill: 0xe0fcb8, reflection: 0.14, pulseBeats: 3, paletteBeats: 12, width: 0.88, washSize: 2.1,
  },
  moon: {
    count: 3, palette: [0xb5a2ff, 0xe3daff, 0x9786ef],
    backdrop: [0x1d1a2e, 0x242039, 0x0c0d1c], floor: [0x222038, 0x15182c, 0x8e86b7],
    fill: 0xe4dfff, reflection: 0.17, pulseBeats: 8, paletteBeats: 24, width: 2.7, washSize: 3.7,
  },
};

function gradientTexture(colors: [number, number, number]) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const topLeft = new THREE.Color(colors[0]).convertLinearToSRGB();
  const topRight = new THREE.Color(colors[1]).convertLinearToSRGB();
  const bottom = new THREE.Color(colors[2]).convertLinearToSRGB();
  const pixel = new THREE.Color();
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    pixel.copy(topLeft).lerp(topRight, x / (size - 1)).lerp(bottom, 1 - y / (size - 1));
    const index = (y * size + x) * 4;
    data[index] = Math.round(pixel.r * 255);
    data[index + 1] = Math.round(pixel.g * 255);
    data[index + 2] = Math.round(pixel.b * 255);
    data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function radialTexture() {
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const distance = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const alpha = Math.pow(Math.max(0, 1 - distance), 2.3);
    const index = (y * size + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = 255;
    data[index + 3] = Math.round(alpha * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Spoked laser targets, diffuse warm pools, or icy concentric rings; no projection pass. */
function goboTexture(mode: LightMode) {
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const u = (x + 0.5) / size * 2 - 1;
    const v = (y + 0.5) / size * 2 - 1;
    const radius = Math.hypot(u, v);
    const edge = Math.pow(Math.max(0, 1 - radius), 1.4);
    const petals = Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(v, u) * 6), 3);
    const ring = Math.exp(-Math.pow((radius - 0.56) * 13, 2));
    const innerRing = Math.exp(-Math.pow((radius - 0.28) * 19, 2));
    const chevron = Math.pow(0.5 + 0.5 * Math.cos((Math.abs(u) + v) * 18), 7);
    const dots = Math.pow(Math.max(0, Math.cos(u * 14) * Math.cos(v * 14)), 5);
    const crescent = Math.exp(-Math.pow((Math.hypot(u + 0.16, v) - 0.47) * 15, 2)) * (0.65 + u * 0.3);
    const alpha = mode === 'sunset' ? Math.pow(Math.max(0, 1 - radius), 1.7)
      : mode === 'ice' ? edge * 0.13 + (ring * 0.88 + innerRing * 0.62) * Math.max(0, 1 - radius)
        : mode === 'ember' ? edge * (0.12 + chevron * 0.9)
          : mode === 'acid' ? edge * (0.1 + dots * 1.05)
            : mode === 'moon' ? edge * 0.15 + crescent * Math.max(0, 1 - radius)
        : edge * (0.25 + petals * 0.62) + ring * edge * 0.2;
    const index = (y * size + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = 255;
    data[index + 3] = Math.round(Math.min(1, alpha) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Three silhouettes use the same crossed-plane geometry and only switch their small alpha map. */
function beamTexture(mode: LightMode) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const u = x / (size - 1);
    const v = y / (size - 1);
    const halfWidth = mode === 'sunset' ? 0.06 + (1 - v) * 0.44 : mode === 'ice' ? 0.32
      : mode === 'ember' ? 0.19 : mode === 'acid' ? 0.09 + (1 - v) * 0.36 : mode === 'moon' ? 0.35 + (1 - v) * 0.14 : 0.43;
    const center = mode === 'ember' ? 0.5 + (v - 0.5) * 0.4 : 0.5;
    const edge = Math.pow(Math.max(0, 1 - Math.abs(u - center) / halfWidth), mode === 'sunset' || mode === 'moon' ? 1.2 : 0.65);
    const longitudinal = Math.sin(v * Math.PI) * 0.65 + 0.35;
    const index = (y * size + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = 255;
    data[index + 3] = Math.round(edge * longitudinal * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Studio-inspired game environment: no shadow maps, full-screen effects or extra render passes per frame. */
export function makeClubEnvironment() {
  const scope = createDisposalScope();
  const scene = new THREE.Scene();
  scene.name = 'midnight-isometric-dance-club';
  const backgrounds = Object.fromEntries(LIGHT_MODES.map((mode) => [mode, scope.track(gradientTexture(LIGHTING_PROFILES[mode].backdrop))])) as Record<LightMode, THREE.DataTexture>;
  scene.background = backgrounds.neon;
  scene.environmentIntensity = 0.16;
  const standardMaterials = new Map<number, THREE.MeshStandardMaterial>();
  const emissiveMaterials = new Map<number, THREE.MeshBasicMaterial>();
  const standard = (color: number, roughness = 0.32) => {
    let material = standardMaterials.get(color);
    if (!material) {
      material = scope.track(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.025 }));
      standardMaterials.set(color, material);
    }
    return material;
  };
  const glow = (color: number) => {
    let material = emissiveMaterials.get(color);
    if (!material) {
      material = scope.track(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      emissiveMaterials.set(color, material);
    }
    return material;
  };
  const cube = scope.track(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = scope.track(new THREE.CylinderGeometry(1, 1, 1, 40));
  const plane = scope.track(new THREE.PlaneGeometry(1, 1));
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale: [number, number, number]) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.scale.set(...scale);
    parent.add(object);
    return object;
  };
  const block = (parent: THREE.Object3D, color: number, position: [number, number, number], scale: [number, number, number], lit = false) => mesh(parent, cube, lit ? glow(color) : standard(color), position, scale);

  const ambient = new THREE.HemisphereLight(0x979dd9, 0x28173e, 0.24);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xbacfff, 1.1);
  key.name = 'studio-soft-key';
  key.position.set(5, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe044ff, 1.1);
  rim.name = 'studio-cool-rim';
  rim.position.set(-5, 4, -6);
  scene.add(rim);

  // Derivative-antialiased lines stay clear at an oblique angle without 100s of tile meshes.
  const floorMaterial = scope.track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      colorFront: { value: new THREE.Color(0x211b38) },
      colorBack: { value: new THREE.Color(0x101b2c) },
      gridColor: { value: new THREE.Color(0x7663a4) },
      glowColor: { value: new THREE.Color(LIGHTING_PROFILES.neon.palette[0]) },
      glowStrength: { value: 0.014 },
      glowPattern: { value: 0 },
      glowPhase: { value: 0 },
    },
    vertexShader: `varying vec3 worldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `varying vec3 worldPosition;
      uniform vec3 colorFront; uniform vec3 colorBack; uniform vec3 gridColor;
      uniform vec3 glowColor; uniform float glowStrength; uniform float glowPhase; uniform int glowPattern;
      void main() {
        vec2 grid = worldPosition.xz / 0.9;
        vec2 width = max(fwidth(grid), vec2(0.0001));
        vec2 distanceToLine = abs(fract(grid - 0.5) - 0.5) / width;
        float line = 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
        float depth = clamp((worldPosition.x + worldPosition.z + 8.0) / 16.0, 0.0, 1.0);
        vec3 color = mix(colorBack, colorFront, depth);
        color = mix(color, gridColor, line * 0.62);
        vec2 p = worldPosition.xz;
        float radius = length(p);
        float pattern;
        if (glowPattern == 0) pattern = pow(0.5 + 0.5 * sin((p.x + p.y) * 2.5 + glowPhase * 0.12), 6.0);
        else if (glowPattern == 1) pattern = exp(-dot(p, p) * 0.07);
        else if (glowPattern == 2) pattern = pow(0.5 + 0.5 * cos(radius * 3.2 - glowPhase * 0.12), 6.0);
        else if (glowPattern == 3) pattern = pow(0.5 + 0.5 * cos((abs(p.x) + p.y) * 2.8 - glowPhase * 0.09), 8.0);
        else if (glowPattern == 4) {
          vec2 cell = fract(p * 0.6) - 0.5;
          pattern = (1.0 - smoothstep(0.08, 0.2, length(cell))) * (0.7 + 0.3 * sin(radius - glowPhase * 0.08));
        } else {
          float moonDistance = (radius - 3.4) * 1.3;
          pattern = exp(-moonDistance * moonDistance) * (0.65 + 0.35 * sin(p.x * 0.7 + glowPhase * 0.025));
        }
        color += glowColor * glowStrength * pattern;
        float edge = max(abs(worldPosition.x), abs(worldPosition.z));
        float fade = 1.0 - smoothstep(5.8, ${FLOOR_VISIBLE_EXTENT.toFixed(1)}, edge);
        gl_FragColor = vec4(color, fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const floor = new THREE.Mesh(scope.track(new THREE.PlaneGeometry(18, 18)), floorMaterial);
  floor.name = 'isometric-grid-floor';
  floor.userData.floorPickExtent = FLOOR_VISIBLE_EXTENT;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  floor.renderOrder = -3;
  scene.add(floor);

  const radial = scope.track(radialTexture());
  const shadowMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0x4b357a, map: radial, transparent: true, opacity: 0.52, depthWrite: false, toneMapped: false }));
  const haloMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0xfaf8ff, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const haloGeometry = scope.track(new THREE.RingGeometry(0.66, 0.692, 48));

  function createShadow(radius: number) {
    const shadow = new THREE.Mesh(plane, shadowMaterial);
    shadow.name = 'soft-contact-shadow';
    shadow.userData.floorPickThrough = true;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.07, 0.007, 0.11);
    shadow.scale.set(radius * 2.85, radius * 2.15, 1);
    shadow.renderOrder = -1;
    return shadow;
  }
  function createHalo(radius: number) {
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.name = 'your-avatar-ring';
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.015;
    halo.scale.setScalar(Math.max(0.65, radius) / 0.66);
    halo.visible = false;
    halo.renderOrder = 0;
    return halo;
  }

  // Compact center attraction. Front-facing local +Z points toward the isometric camera.
  const booth = new THREE.Group();
  booth.name = 'central-dj-booth';
  booth.rotation.y = Math.PI / 4;
  scene.add(booth);
  // A continuous solid cabinet and countertop. The larger DJ stands behind it.
  const roundedBody = scope.track(new RoundedBoxGeometry(2.7, 0.59, 1.12, 3, 0.11));
  const body = mesh(booth, roundedBody, standard(0x282740), [0, 0.715, 0], [1, 1, 1]);
  body.name = 'dj-cabinet'; body.userData.cameraObstacle = true;
  const roundedTop = scope.track(new RoundedBoxGeometry(2.88, 0.12, 1.3, 3, 0.055));
  const top = mesh(booth, roundedTop, standard(0x3c3955, 0.24), [0, 1.02, 0], [1, 1, 1]);
  top.name = 'dj-countertop'; top.userData.cameraObstacle = true;
  for (const x of [-1.08, 1.08]) for (const z of [-0.38, 0.38]) mesh(booth, cylinder, standard(0x746887), [x, 0.25, z], [0.095, 0.48, 0.095]);
  block(booth, 0xabc7f7, [0, 0.995, 0.625], [2.59, 0.018, 0.015], true);
  block(booth, 0xa58cd3, [0, 0.47, 0.557], [2.35, 0.018, 0.016], true);
  const boothShadow = createShadow(1.35);
  boothShadow.scale.set(3.5, 1.85, 1);
  booth.add(boothShadow);

  const turntables: THREE.Group[] = [];
  // Two larger decks flank a compact central mixer on the uninterrupted top.
  for (const x of [-0.82, 0.82]) {
    const turntable = new THREE.Group();
    turntable.position.set(x, 1.10, -0.04);
    booth.add(turntable);
    turntables.push(turntable);
    mesh(turntable, cylinder, standard(0x121423, 0.22), [0, 0, 0], [0.54, 0.028, 0.54]).name = `dj-platter-${x < 0 ? 'left' : 'right'}`;
    mesh(turntable, cylinder, standard(0x626176, 0.23), [0, 0.018, 0], [0.425, 0.011, 0.425]);
    mesh(turntable, cylinder, glow(x < 0 ? 0xaeddf1 : 0xeabbe5), [0, 0.027, 0], [0.15, 0.009, 0.15]);
    block(turntable, 0xece8ef, [0.36, 0.029, 0], [0.14, 0.01, 0.015], true);
    block(booth, 0xb1c5d9, [x + Math.sign(x) * 0.45, 1.14, 0.24], [0.022, 0.025, 0.27]).name = `dj-tonearm-${Math.sign(x)}`;
    block(booth, 0x1b1b30, [x, 1.095, 0.555], [0.52, 0.018, 0.09]);
    for (let pad = 0; pad < 4; pad += 1) block(booth, pad % 2 ? 0xd9bedb : 0xaecbdc, [x + (pad - 1.5) * 0.105, 1.112, 0.555], [0.075, 0.013, 0.048], true);
  }
  block(booth, 0x191a2c, [0, 1.09, 0], [0.49, 0.035, 1.02]).name = 'dj-center-mixer';
  for (let i = 0; i < 3; i += 1) for (let row = 0; row < 3; row += 1) {
    mesh(booth, cylinder, standard(row % 2 ? 0xceafcf : 0xa9cbdc), [(i - 1) * 0.145, 1.132, -0.37 + row * 0.13], [0.034, 0.052, 0.034]);
  }
  for (const x of [-0.145, 0, 0.145]) {
    block(booth, 0x5f5b77, [x, 1.114, 0.12], [0.018, 0.008, 0.22]);
    block(booth, 0xb8b6d0, [x, 1.135, 0.10 + x * 0.3], [0.075, 0.037, 0.04]);
  }
  block(booth, 0x5f5b77, [0, 1.114, 0.32], [0.36, 0.008, 0.018]);
  block(booth, 0xd8d3e5, [0.035, 1.135, 0.32], [0.04, 0.037, 0.075]).name = 'dj-crossfader';
  for (let col = 0; col < 3; col += 1) for (let row = 0; row < 2; row += 1) {
    block(booth, row ? 0xd6b3cb : 0xa1c5d8, [(col - 1) * 0.14, 1.118, 0.415 + row * 0.065], [0.085, 0.018, 0.045], true).name = `dj-pad-${col}-${row}`;
  }
  const meterMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0xd1caeb, toneMapped: false }));
  const meters = scope.track(new THREE.InstancedMesh(cube, meterMaterial, 16));
  meters.name = 'beat-meter';
  booth.add(meters);
  const matrix = new THREE.Matrix4();
  const meterTransform = new THREE.Object3D();

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#eae4f5';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '700 39px Arial, sans-serif';
      context.fillText('AFTERHOURS', 256, 46);
      const texture = scope.track(new THREE.CanvasTexture(canvas));
      texture.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(plane, scope.track(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })));
      sign.position.set(0, 0.8, 0.563);
      sign.scale.set(1.35, 0.253, 1);
      booth.add(sign);
    }
  }

  // One bounded pool of eight top-pivoted fixtures; modes draw only their active subset.
  const ribbon = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const crossing = ribbon.clone().rotateY(Math.PI / 2);
  // Crossed faces in one geometry remain visible when the third-person camera orbits.
  const beamGeometry = scope.track(mergeGeometries([ribbon, crossing]));
  ribbon.dispose();
  crossing.dispose();
  const beamMaps = Object.fromEntries(LIGHT_MODES.map((mode) => [mode, scope.track(beamTexture(mode))])) as Record<LightMode, THREE.DataTexture>;
  const goboMaps = Object.fromEntries(LIGHT_MODES.map((mode) => [mode, scope.track(goboTexture(mode))])) as Record<LightMode, THREE.DataTexture>;
  const beams: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let i = 0; i < 8; i += 1) {
    const material = scope.track(new THREE.MeshBasicMaterial({ color: LIGHTING_PROFILES.neon.palette[i % 3], map: beamMaps.neon, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    // Keep the negative half-space under the floor out of these translucent beams.
    // A flat ribbon needs one DoubleSide pass, not Three's two-pass transparent volume handling.
    material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.012)];
    material.forceSinglePass = true;
    const beam = new THREE.Mesh(beamGeometry, material);
    beam.name = 'soft-light-beam';
    beam.position.set(0, 5.6, 0);
    beam.rotation.set(-0.2, Math.PI / 4, i % 2 ? -0.29 : 0.29);
    beam.scale.set(1.45, 7.2, 1);
    beam.renderOrder = 2;
    scene.add(beam);
    beams.push(beam);
  }

  const washMaterial = scope.track(new THREE.MeshBasicMaterial({
    color: 0xffffff, map: goboMaps.neon, transparent: true, opacity: 0.24,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  const washes = scope.track(new THREE.InstancedMesh(plane, washMaterial, beams.length));
  washes.name = 'floor-light-washes';
  washes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  washes.renderOrder = -2;
  // Eight small moving instances are cheaper than recomputing an instanced bound each frame.
  washes.frustumCulled = false;
  scene.add(washes);
  const washTransform = new THREE.Object3D();
  const beamDirection = new THREE.Vector3();
  const beamColor = new THREE.Color();
  const nextColor = new THREE.Color();
  const hueFrom = { h: 0, s: 0, l: 0 };
  const hueTo = { h: 0, s: 0, l: 0 };
  const characterFill = new THREE.Color(0xcbd2ef);
  const bounded = (value: number, fallback = 0) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
  let activeMode: LightMode | null = null;

  function update(beat: number, mode: LightMode, reducedMotion: boolean, energy = 0.65, sectionEnergy?: MusicSectionEnergy) {
    const profile = LIGHTING_PROFILES[mode];
    const palette = profile.palette;
    if (activeMode !== mode) {
      scene.background = backgrounds[mode];
      scene.environmentIntensity = profile.reflection;
      floorMaterial.uniforms.colorFront.value.set(profile.floor[0]);
      floorMaterial.uniforms.colorBack.value.set(profile.floor[1]);
      floorMaterial.uniforms.gridColor.value.set(profile.floor[2]);
      floorMaterial.uniforms.glowPattern.value = LIGHT_MODES.indexOf(mode);
      ambient.color.set(profile.fill);
      ambient.groundColor.set(profile.backdrop[1]);
      characterFill.set(profile.fill);
      washMaterial.map = goboMaps[mode];
      washes.count = profile.count;
      for (const beam of beams) beam.material.map = beamMaps[mode];
      activeMode = mode;
    }
    // All phases are absolute shared musical time. No local frame accumulation or audio state.
    const sharedBeat = Number.isFinite(beat) ? Math.max(0, beat) : 0;
    const motionBeat = reducedMotion ? 0 : sharedBeat;
    const boundedEnergy = reducedMotion ? 0.45 : bounded(energy, 0.65);
    const build = reducedMotion ? 0 : bounded(sectionEnergy?.build ?? 0);
    const drop = reducedMotion ? 0 : bounded(sectionEnergy?.drop ?? 0);
    const isBreak = !reducedMotion && sectionEnergy?.section === 'break';
    const preDropBreath = !reducedMotion && sectionEnergy?.section === 'build' && !sectionEnergy.kickOn && build > 0.85;
    const sectionLevel = isBreak ? 0.35 : preDropBreath ? 0.22 : 0.82 + build * 0.34 + drop * 0.65;
    // Broad musical pulses only: neon each beat, warm house each bar, ice alternating two-beat pairs.
    const pulsePhase = motionBeat * Math.PI * 2 / profile.pulseBeats;
    const pulse = reducedMotion || sectionEnergy?.kickOn === false ? 0 : 0.5 + 0.5 * Math.cos(pulsePhase);
    const intensity = (0.18 + boundedEnergy * 0.13 + pulse * (0.18 + boundedEnergy * 0.08)) * sectionLevel;
    const palettePhase = motionBeat / profile.paletteBeats;
    const paletteIndex = Math.floor(palettePhase) % palette.length;
    const paletteFraction = palettePhase - Math.floor(palettePhase);
    const paletteBlend = paletteFraction * paletteFraction * (3 - 2 * paletteFraction);
    // Keep modeling light on characters, but stop the studio fill from washing out the nightclub.
    key.intensity = reducedMotion ? 1.05 : 0.78 + sectionLevel * 0.23 + pulse * 0.06;
    ambient.intensity = reducedMotion ? 0.24 : 0.17 + sectionLevel * 0.07;
    rim.intensity = reducedMotion ? 1.05 : 0.65 + sectionLevel * 0.38;
    turntables.forEach((deck, i) => {
      deck.rotation.y = reducedMotion ? 0 : sharedBeat * (i ? -0.42 : 0.48) + Math.sin(sharedBeat * Math.PI / 4) * (i ? 0.16 : 0.3);
    });
    beams.forEach((beam, i) => {
      beam.visible = i < profile.count;
      if (!beam.visible) return;
      const phase = motionBeat * Math.PI / (mode === 'sunset' ? 32 : mode === 'moon' ? 48 : mode === 'ice' ? 7 : mode === 'ember' ? 12 : mode === 'acid' ? 18 : 10);
      const side = i % 2 ? -1 : 1;
      if (mode === 'sunset') {
        const source = stagePosition(side * -3.6, -1.5);
        beam.position.set(source.x, 5.8, source.z);
        beam.rotation.set(-0.08, Math.PI / 4, side * (0.18 + (reducedMotion ? 0 : Math.sin(phase) * 0.16)));
      } else if (mode === 'ice') {
        const angle = i * Math.PI / 4 + Math.PI / 8;
        const source = stagePosition(Math.cos(angle) * 4.3, Math.sin(angle) * 4.3);
        beam.position.set(source.x, 5.5, source.z);
        beam.rotation.set(
          reducedMotion ? 0 : Math.sin(phase + Math.floor(i / 2) * Math.PI / 2) * 0.15,
          Math.PI / 4 + (reducedMotion ? 0 : Math.sin(phase * 0.6) * 0.45),
          reducedMotion ? side * 0.08 : Math.cos(phase * 0.8 + Math.floor(i / 2) * Math.PI / 2) * 0.22,
        );
      } else if (mode === 'ember') {
        const source = stagePosition(side * -3.8, i < 2 ? -2.4 : 2.4);
        beam.position.set(source.x, 5.5, source.z);
        beam.rotation.set((i < 2 ? -1 : 1) * 0.15, Math.PI / 4 + side * 0.2,
          side * (0.34 + (reducedMotion ? 0 : Math.sin(phase + Math.floor(i / 2) * Math.PI) * 0.22)));
      } else if (mode === 'acid' || mode === 'moon') {
        const angle = i * Math.PI * 2 / profile.count + (mode === 'acid' ? phase * 0.22 : Math.PI / 6);
        const source = stagePosition(Math.cos(angle) * 3.9, Math.sin(angle) * 3.9);
        beam.position.set(source.x, mode === 'moon' ? 6 : 5.3, source.z);
        beam.rotation.set(
          reducedMotion ? 0.06 : Math.sin(phase + i) * (mode === 'moon' ? 0.1 : 0.2),
          Math.PI / 4 + angle * 0.25,
          reducedMotion ? side * 0.14 : Math.cos(phase * 0.6 + i) * (mode === 'moon' ? 0.18 : 0.32),
        );
      } else {
        const row = Math.floor(i / 2);
        const source = stagePosition(side * -4.1, -2.4 + row * 2.1);
        beam.position.set(source.x, 5.6, source.z);
        const offset = row * 0.95 + (i % 2) * 0.7;
        beam.rotation.set(
          (row - 1) * 0.08 + (reducedMotion ? 0 : Math.sin(phase * 0.71 + offset) * 0.15),
          Math.PI / 4 + (reducedMotion ? 0 : Math.sin(phase * 0.55 + i * 0.8) * 0.36),
          side * 0.26 + (reducedMotion ? 0 : Math.sin(phase + offset) * (0.38 + build * 0.08)),
        );
      }
      const fixturePulse = reducedMotion || sectionEnergy?.kickOn === false ? 0
        : 0.5 + 0.5 * Math.cos(pulsePhase + (mode === 'ice' ? Math.floor(i / 2) * Math.PI / 2 : 0));
      const widthVariation = mode === 'sunset' ? 0.35 : 0.12;
      beam.scale.set(profile.width + (reducedMotion ? 0 : boundedEnergy * widthVariation + drop * 0.1 + fixturePulse * 0.06), 9.4, 1);
      beamColor.set(palette[(i + paletteIndex) % palette.length]);
      nextColor.set(palette[(i + paletteIndex + 1) % palette.length]);
      // Use the shortest hue arc: scarlet-to-orange must not travel through green and blue.
      beamColor.getHSL(hueFrom);
      nextColor.getHSL(hueTo);
      const hueDistance = ((hueTo.h - hueFrom.h + 1.5) % 1) - 0.5;
      beam.material.color.setHSL(
        hueFrom.h + hueDistance * paletteBlend,
        hueFrom.s + (hueTo.s - hueFrom.s) * paletteBlend,
        hueFrom.l + (hueTo.l - hueFrom.l) * paletteBlend,
      );
      // Alternating fixture groups add a slow phrase-scale fan beneath the common beat pulse.
      const fixtureIntensity = (0.18 + boundedEnergy * 0.13 + fixturePulse * (0.18 + boundedEnergy * 0.08)) * sectionLevel;
      const fixtureLevel = mode === 'ice' ? 0.94 : 0.94 + Math.sin(phase * 0.8 + i * Math.PI) * 0.06;
      beam.material.opacity = reducedMotion ? 0.14 : Math.min(0.68, Math.max(0.04, fixtureIntensity * fixtureLevel));
      beamDirection.set(0, -1, 0).applyQuaternion(beam.quaternion);
      const distanceToFloor = (beam.position.y - 0.019) / -beamDirection.y;
      // Wide sweeps need more length than upright fixtures; keep the entire soft foot below the clip.
      beam.scale.y = Math.max(9.4, distanceToFloor + 2);
      washTransform.position.copy(beam.position).addScaledVector(beamDirection, distanceToFloor);
      washTransform.rotation.set(-Math.PI / 2, 0, reducedMotion || mode === 'sunset' ? i * 0.65 : motionBeat * (mode === 'ice' ? 0.12 : 0.075) * side + i * 0.65);
      const radius = profile.washSize + (reducedMotion ? 0 : boundedEnergy * 0.4 + build * 0.2 + drop * 0.2);
      washTransform.scale.set(radius, radius * (0.82 + Math.abs(beam.rotation.z) * 0.3), 1);
      washTransform.updateMatrix();
      washes.setMatrixAt(i, washTransform.matrix);
      washes.setColorAt(i, beam.material.color);
    });
    key.color.copy(beams[0].material.color).lerp(characterFill, 0.68);
    rim.color.copy(beams[1].material.color);
    floorMaterial.uniforms.glowColor.value.copy(beams[0].material.color);
    floorMaterial.uniforms.glowStrength.value = reducedMotion ? 0.014 : Math.min(0.04, 0.008 + intensity * 0.045);
    floorMaterial.uniforms.glowPhase.value = motionBeat;
    washMaterial.opacity = reducedMotion ? 0.18 : Math.min(0.65, 0.09 + intensity * 0.85);
    washes.instanceMatrix.needsUpdate = true;
    if (washes.instanceColor) washes.instanceColor.needsUpdate = true;
    for (let i = 0; i < 16; i += 1) {
      const height = reducedMotion ? 0.07 : 0.035 + (0.5 + 0.5 * Math.sin(sharedBeat * Math.PI * 0.5 + i * 0.73)) * (0.065 + boundedEnergy * 0.045);
      meterTransform.position.set((i - 7.5) * 0.096, 0.565 + height / 2, 0.565);
      meterTransform.scale.set(0.038, height, 0.015);
      meterTransform.updateMatrix();
      matrix.copy(meterTransform.matrix);
      meters.setMatrixAt(i, matrix);
    }
    meters.instanceMatrix.needsUpdate = true;
  }
  update(0, 'neon', true);

  return {
    scene,
    floor,
    booth,
    turntables,
    beams,
    createShadow,
    createHalo,
    update,
    installStudioEnvironment(renderer: THREE.WebGLRenderer) {
      const room = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(renderer);
      try {
        const target = scope.track(pmrem.fromScene(room, 0.02, 0.1, 100, { size: 128 }));
        scene.environment = target.texture;
      } finally {
        pmrem.dispose();
        room.dispose();
      }
    },
    dispose() {
      scope.dispose();
      scene.environment = null;
      scene.background = null;
      scene.clear();
    },
  };
}
