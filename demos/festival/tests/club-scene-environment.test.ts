import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { makeClubEnvironment } from '../lib/club-scene-environment.ts';
import type { MusicSectionEnergy } from '../lib/music-catalog.ts';
import { LIGHT_MODES } from '../lib/room-types.ts';

function section(overrides: Partial<MusicSectionEnergy> = {}): MusicSectionEnergy {
  return { section: 'drop', sectionIndex: 2, sectionProgress: 0.3, bar: 9, energy: 0.8, beatPulse: 0.3, downbeat: 0.1, build: 0, drop: 0, kickOn: true, ...overrides };
}

function lightSnapshot(environment: ReturnType<typeof makeClubEnvironment>) {
  return environment.beams.filter((beam) => beam.visible).map((beam) => ({
    rotation: beam.rotation.toArray(), position: beam.position.toArray(), scale: beam.scale.toArray(),
    color: beam.material.color.toArray(), opacity: beam.material.opacity,
  }));
}

function floorWashes(environment: ReturnType<typeof makeClubEnvironment>) {
  const object = environment.scene.getObjectByName('floor-light-washes');
  assert.ok(object instanceof THREE.InstancedMesh, 'one instanced layer projects colored washes on the floor');
  return object as THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

test('minimal studio stage has a gradient, a readable grid and one central DJ booth', () => {
  const environment = makeClubEnvironment();
  assert.ok(environment.scene.background && 'isTexture' in environment.scene.background);
  assert.equal(environment.floor.name, 'isometric-grid-floor');
  assert.equal(environment.booth.name, 'central-dj-booth');
  assert.equal(environment.booth.position.x, 0);
  assert.equal(environment.booth.position.z, 0);
  assert.equal(environment.turntables.length, 2);
  assert.equal(environment.beams.length, 8, 'one bounded reusable fixture pool serves every mode');
  assert.equal(environment.beams.filter((beam) => beam.visible).length, 6);
  environment.scene.traverse((node) => { if ('isLight' in node) assert.equal(node.castShadow, false); });
  environment.dispose();
});

test('shared beat moves the decks and restrained beams, and reduced motion freezes them', () => {
  const environment = makeClubEnvironment();
  environment.update(2, 'neon', false, 0.8);
  const first = environment.turntables.map((deck) => deck.rotation.y);
  environment.update(2.5, 'neon', false, 0.8);
  assert.notDeepEqual(environment.turntables.map((deck) => deck.rotation.y), first);
  environment.update(3, 'ice', true, 0.8);
  const reduced = environment.beams.map((beam) => beam.rotation.z);
  environment.update(8, 'ice', true, 0.8);
  assert.deepEqual(environment.beams.map((beam) => beam.rotation.z), reduced);
  assert.ok(environment.beams.every((beam) => beam.material.opacity <= 0.2));
  environment.dispose();
});

test('all studio environment geometries, materials, textures and instance buffers are disposed once', () => {
  const environment = makeClubEnvironment();
  const resources = new Set<{ addEventListener(type: string, listener: () => void): void }>();
  for (const mode of LIGHT_MODES) {
    environment.update(0, mode, false);
    environment.scene.traverse((node) => {
      if ('geometry' in node) resources.add(node.geometry as never);
      if ('material' in node) {
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of list) {
          resources.add(material as never);
          if (material.map) resources.add(material.map);
        }
      }
      if ('isInstancedMesh' in node) resources.add(node as never);
    });
    resources.add(environment.scene.background as never);
  }
  let disposed = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { disposed += 1; });
  environment.dispose();
  environment.dispose();
  assert.equal(disposed, resources.size);
});

test('colored luminous beams taper without a full-screen white flash', () => {
  const environment = makeClubEnvironment();
  environment.update(0, 'sunset', true, 0.8);
  const material = environment.beams[0].material;
  assert.equal(material.blending, THREE.AdditiveBlending, 'colored light adds to the darker club instead of becoming a painted veil');
  const image = material.map!.image as { data: Uint8Array; width: number; height: number };
  const alpha = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3];
  assert.equal(alpha(8, image.height - 2), 0, 'the top of the light cone is narrow');
  assert.ok(alpha(8, 2) > 0, 'the bottom of the light cone spreads wider');
  environment.dispose();
});

test('soft beam fragments are clipped above the floor and use one transparent pass', () => {
  const environment = makeClubEnvironment();
  for (const beam of environment.beams) {
    assert.equal(beam.material.forceSinglePass, true);
    const plane = beam.material.clippingPlanes?.[0];
    assert.ok(plane, 'floor clipping is attached to each beam material');
    assert.equal(plane.normal.y, 1);
    assert.ok(plane.constant < 0);
    assert.ok(plane.normal.y * -1 + plane.constant < 0, 'below-floor fragments are clipped');
    assert.ok(plane.normal.y * 1 + plane.constant > 0, 'above-floor fragments stay visible');
  }
  environment.dispose();
});

test('beam geometry remains visible from every third-person orbit yaw in one mesh', () => {
  const environment = makeClubEnvironment();
  for (const beam of environment.beams) {
    const positions = beam.geometry.getAttribute('position');
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const projected = Array.from({ length: positions.count }, (_, i) => positions.getX(i) * Math.cos(angle) + positions.getZ(i) * Math.sin(angle));
      assert.ok(Math.max(...projected) - Math.min(...projected) >= 0.7, 'crossed surfaces never become wholly edge-on');
    }
    assert.ok(positions.count <= 12, 'each fixture remains tiny geometry rather than a volumetric effect');
    assert.equal(beam.children.length, 0, 'crossed faces do not add extra mesh draw calls');
    assert.equal(beam.material.forceSinglePass, true);
  }
  environment.dispose();
});

test('beams visibly sweep on multiple axes over a phrase, with coherent gradual color changes', () => {
  const environment = makeClubEnvironment();
  const samples = [0, 8, 16, 24, 32].map((beat) => {
    environment.update(beat, 'neon', false, 0.8, section());
    return lightSnapshot(environment);
  });
  for (let i = 0; i < samples[0].length; i += 1) {
    const tilt = samples.map((sample) => sample[i].rotation[2] as number);
    const pan = samples.map((sample) => sample[i].rotation[1] as number);
    assert.ok(Math.max(...tilt) - Math.min(...tilt) > 0.25, 'beam tilt travels far enough to read as a sweep');
    assert.ok(Math.max(...pan) - Math.min(...pan) > 0.18, 'beam pan is not fixed');
    assert.notDeepEqual(samples[0][i].color, samples[4][i].color, 'palette evolves slowly through the phrase');
  }
  environment.update(12, 'neon', false, 0.8, section());
  const before = lightSnapshot(environment);
  environment.update(12.03, 'neon', false, 0.8, section());
  const after = lightSnapshot(environment);
  for (let i = 0; i < before.length; i += 1) {
    assert.ok(Math.abs((before[i].rotation[2] as number) - (after[i].rotation[2] as number)) < 0.025);
    assert.ok(Math.abs(before[i].opacity - after[i].opacity) < 0.05, 'beat pulses are continuous, not abrupt on/off flashes');
    before[i].color.forEach((channel, j) => assert.ok(Math.abs(channel - after[i].color[j]) < 0.025));
  }
  environment.dispose();
});

test('musical sections create a build, a dark pre-drop breath and one stronger drop accent', () => {
  const environment = makeClubEnvironment();
  const meanOpacity = () => {
    const active = environment.beams.filter((beam) => beam.visible);
    return active.reduce((sum, beam) => sum + beam.material.opacity, 0) / active.length;
  };
  environment.update(30, 'neon', false, 0.8, section({ section: 'build', build: 0.2, sectionProgress: 0.2 }));
  const earlyBuild = meanOpacity();
  environment.update(30, 'neon', false, 0.8, section({ section: 'build', build: 0.85, sectionProgress: 0.85 }));
  const lateBuild = meanOpacity();
  assert.ok(lateBuild > earlyBuild * 1.1, 'the build intensifies');
  environment.update(31.5, 'neon', false, 0.8, section({ section: 'build', build: 0.97, sectionProgress: 0.97, kickOn: false }));
  const breath = meanOpacity();
  assert.ok(breath < lateBuild * 0.65, 'the pre-drop breath is visibly darker');
  environment.update(32, 'neon', false, 0.8, section({ drop: 1 }));
  const drop = meanOpacity();
  assert.ok(drop > lateBuild * 1.15, 'drop arrival adds a bounded accent');
  environment.update(32, 'neon', false, 0.8, section({ section: 'break', energy: 0.3 }));
  assert.ok(meanOpacity() < drop * 0.6, 'breaks leave visual breathing room');
  environment.dispose();
});

test('active floor washes share one draw call and contain soft gobo detail without covering the grid', () => {
  const environment = makeClubEnvironment();
  const washes = floorWashes(environment);
  assert.equal(washes.count, 6);
  assert.equal(washes.material.depthWrite, false);
  assert.equal(washes.material.transparent, true);
  assert.equal(washes.material.blending, THREE.AdditiveBlending);
  assert.ok(washes.material.map, 'wash/gobo detail uses one shared texture');
  const image = washes.material.map.image as { data: Uint8Array; width: number; height: number };
  const alphas = Array.from(image.data).filter((_, index) => index % 4 === 3);
  assert.equal(Math.min(...alphas), 0, 'the pattern fades to transparent at its edges');
  assert.ok(Math.max(...alphas) > 100, 'pattern detail is visible inside the soft wash');
  environment.update(9, 'sunset', false, 0.8, section());
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  for (let i = 0; i < washes.count; i += 1) {
    washes.getMatrixAt(i, matrix);
    matrix.decompose(position, rotation, scale);
    assert.ok(position.y > 0 && position.y < 0.03, 'wash stays above the floor, below feet');
    assert.ok(Math.hypot(position.x, position.z) < 8, 'wash footprint stays inside the dance floor');
    assert.ok(scale.x > 1.5 && scale.x < 6);
    assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).y > 0.999, 'gobo is parallel to the floor');
    const color = new THREE.Color();
    washes.getColorAt(i, color);
    color.toArray().forEach((channel, j) => assert.ok(Math.abs(channel - environment.beams[i].material.color.toArray()[j]) < 1e-6, 'each landing wash matches its beam palette'));
  }
  assert.ok(washes.material.opacity > 0.1 && washes.material.opacity <= 0.65);
  environment.dispose();
});

test('reduced motion freezes beam, palette, gobo and brightness even when music sections change', () => {
  const environment = makeClubEnvironment();
  environment.update(2, 'ice', true, 0.2, section({ section: 'break' }));
  const washes = floorWashes(environment);
  const snapshot = lightSnapshot(environment);
  const transforms = Array.from(washes.instanceMatrix.array);
  const colors = Array.from(washes.instanceColor!.array);
  const opacity = washes.material.opacity;
  environment.update(97, 'ice', true, 1, section({ section: 'return', drop: 1 }));
  assert.deepEqual(lightSnapshot(environment), snapshot);
  assert.deepEqual(Array.from(washes.instanceMatrix.array), transforms);
  assert.deepEqual(Array.from(washes.instanceColor!.array), colors);
  assert.equal(washes.material.opacity, opacity);
  assert.ok(environment.beams.every((beam) => beam.material.opacity <= 0.15));
  environment.dispose();
});

test('lighting is shared-clock deterministic and bounds all intensities throughout a long set', () => {
  const direct = makeClubEnvironment();
  const stepped = makeClubEnvironment();
  for (let beat = 0; beat <= 1024; beat += 0.5) {
    stepped.update(beat, 'neon', false, 0.8, section());
    for (const beam of stepped.beams) {
      assert.ok(beam.material.opacity >= 0.04 && beam.material.opacity <= 0.68);
      assert.ok(beam.rotation.toArray().slice(0, 3).every((value) => Number.isFinite(value)));
    }
  }
  direct.update(1024, 'neon', false, 0.8, section());
  assert.deepEqual(lightSnapshot(direct), lightSnapshot(stepped), 'joining or muting cannot change shared choreography');
  assert.deepEqual(Array.from(floorWashes(direct).instanceMatrix.array), Array.from(floorWashes(stepped).instanceMatrix.array));
  direct.update(NaN, 'neon', false, NaN, section({ energy: NaN, build: NaN, drop: Infinity }));
  for (const beam of direct.beams) {
    assert.ok(Number.isFinite(beam.material.opacity));
    assert.ok(beam.rotation.toArray().slice(0, 3).every((value) => Number.isFinite(value)));
  }
  direct.dispose();
  stepped.dispose();
});

test('third-person collision includes only solid DJ booth body and top', () => {
  const environment = makeClubEnvironment();
  const obstacles: THREE.Object3D[] = [];
  environment.scene.traverse((node) => { if (node.userData.cameraObstacle) obstacles.push(node); });
  assert.equal(obstacles.length, 2);
  assert.ok(obstacles.every((object) => object.parent === environment.booth && object instanceof THREE.Mesh));
  assert.ok(obstacles.every((object) => !(object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>).material.transparent));
  environment.dispose();
});

test('nightclub backdrop, floor and fill lights are dark while the grid and character key stay readable', () => {
  const environment = makeClubEnvironment();
  environment.update(10, 'neon', false, 0.8, section());
  const texture = environment.scene.background as THREE.DataTexture;
  const pixels = texture.image.data as Uint8Array;
  for (let i = 0; i < pixels.length; i += 4) {
    assert.ok(Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) <= 60, 'a bright background must not flatten beam contrast');
  }
  const { colorFront, colorBack, gridColor } = environment.floor.material.uniforms;
  for (const uniform of [colorFront, colorBack]) {
    assert.ok(Math.max(...uniform.value.toArray()) < 0.055, 'floor is a dark stage rather than a pale ambient card');
  }
  assert.ok(Math.max(...gridColor.value.toArray()) > 0.1, 'grid lines remain distinct on the dark floor');
  assert.ok(environment.scene.environmentIntensity <= 0.2, 'studio reflection fill must not relight the entire club');
  const ambient: THREE.HemisphereLight[] = [];
  environment.scene.traverse((node) => { if (node instanceof THREE.HemisphereLight) ambient.push(node); });
  assert.equal(ambient.length, 1);
  assert.ok(ambient[0].intensity <= 0.32);
  const key = environment.scene.getObjectByName('studio-soft-key') as THREE.DirectionalLight;
  assert.ok(key.intensity >= 0.65 && key.intensity <= 1.4, 'characters retain shape without showroom brightness');
  environment.dispose();
});

test('beat lighting has obvious broad pulses with a visible low level and no high-frequency strobe', () => {
  const environment = makeClubEnvironment();
  const opacities: number[] = [];
  const hsl = { h: 0, s: 0, l: 0 };
  for (let tick = 0; tick <= 480; tick += 1) {
    environment.update(tick / 120, 'neon', false, 0.9, section());
    const active = environment.beams.filter((beam) => beam.visible);
    opacities.push(active.reduce((sum, beam) => sum + beam.material.opacity, 0) / active.length);
    for (const beam of environment.beams) {
      beam.material.color.getHSL(hsl);
      assert.ok(hsl.s > 0.75, 'the full phrase remains saturated, including palette crossfades');
    }
  }
  const low = Math.min(...opacities);
  const high = Math.max(...opacities);
  assert.ok(high - low >= 0.17, 'beat brightness modulation is clearly larger than the old 0.027 swell');
  assert.ok(low >= 0.16 && high <= 0.68, 'lights stay present between beats and never turn into an opaque flash');
  let peaks = 0;
  for (let i = 1; i < opacities.length - 1; i += 1) {
    assert.ok(Math.abs(opacities[i] - opacities[i - 1]) <= 0.022, 'pulse has a gradual attack and fall at normal frame rates');
    if (opacities[i] > opacities[i - 1] && opacities[i] > opacities[i + 1]) peaks += 1;
  }
  assert.ok(peaks >= 3 && peaks <= 4, 'one broad pulse per beat, without subdivisions or random flicker');
  environment.dispose();
});

test('beam sweeps and saturated palette changes are apparent within four beats', () => {
  const environment = makeClubEnvironment();
  environment.update(0, 'neon', false, 0.9, section());
  const start = lightSnapshot(environment);
  environment.update(4, 'neon', false, 0.9, section());
  const next = lightSnapshot(environment);
  const changedChannels = start.map((beam, i) => Math.max(...beam.color.map((value, j) => Math.abs(value - next[i].color[j]))));
  assert.ok(changedChannels.every((distance) => distance > 0.25), 'color changes are visible during a short visit');
  assert.ok(next.some((beam, i) => Math.abs((beam.rotation[2] as number) - (start[i].rotation[2] as number)) > 0.3), 'beam sweeps cross the floor at a readable pace');
  environment.dispose();
});

test('wide sweeps keep every beam reaching its matching floor wash throughout every mode', () => {
  const environment = makeClubEnvironment();
  const foot = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const washes = floorWashes(environment);
  for (const mode of LIGHT_MODES) {
    for (let beat = 0; beat <= 160; beat += 0.25) {
      environment.update(beat, mode, false, 1, section({ section: 'build', build: 0.9 }));
      environment.beams.filter((beam) => beam.visible).forEach((beam, i) => {
        beam.updateMatrixWorld(true);
        foot.set(0, -1, 0).applyMatrix4(beam.matrixWorld);
        assert.ok(foot.y < -0.2, 'beam reaches through the clipping plane rather than ending in mid-air');
        washes.getMatrixAt(i, matrix);
        assert.ok(Math.hypot(matrix.elements[12], matrix.elements[14]) < 8, 'the larger sweep remains on the dance floor');
      });
    }
  }
  environment.dispose();
});

test('mode switches immediately select six laser rays, two broad warm cones or eight icy columns', () => {
  const environment = makeClubEnvironment();
  const modes = ['neon', 'sunset', 'ice'] as const;
  const counts = [6, 2, 8];
  const snapshots = modes.map((mode, i) => {
    environment.update(7.25, mode, false, 0.8, section());
    const active = environment.beams.filter((beam) => beam.visible);
    assert.equal(active.length, counts[i], `${mode} has an unmistakably different fixture count`);
    assert.equal(floorWashes(environment).count, counts[i], 'unused wash instances are not drawn');
    return {
      width: active[0].scale.x, background: environment.scene.background,
      floor: environment.floor.material.uniforms.colorFront.value.toArray(),
      beamMap: active[0].material.map, washMap: floorWashes(environment).material.map,
      rotations: active.map((beam) => beam.rotation.toArray()),
    };
  });
  assert.ok(snapshots[0].width < 1, 'neon consists of narrow rays');
  assert.ok(snapshots[1].width > 3.5, 'sunset consists of broad cones');
  assert.ok(snapshots[2].width > 1 && snapshots[2].width < 1.8, 'ice consists of medium-width columns');
  assert.equal(new Set(snapshots.map((item) => item.background)).size, 3);
  assert.equal(new Set(snapshots.map((item) => item.beamMap)).size, 3);
  assert.equal(new Set(snapshots.map((item) => item.washMap)).size, 3);
  for (const key of ['beamMap', 'washMap'] as const) {
    const maps = snapshots.map((item) => (item[key]!.image as { data: Uint8Array }).data);
    assert.notDeepEqual(maps[0], maps[1], 'the mode changes actual alpha silhouettes, not just texture identities');
    assert.notDeepEqual(maps[1], maps[2]);
  }
  assert.notDeepEqual(snapshots[0].floor, snapshots[1].floor);
  assert.notDeepEqual(snapshots[1].floor, snapshots[2].floor);
  environment.dispose();
});

test('repeated mode changes reuse a fixed fixture and texture pool without adding lights or obstacles', () => {
  const environment = makeClubEnvironment();
  const ids = environment.scene.children.map((object) => object.uuid);
  const beams = environment.beams.map((beam) => beam.uuid);
  const textures = new Set<THREE.Texture>();
  const modes = LIGHT_MODES;
  for (let i = 0; i < 60; i += 1) {
    environment.update(i * 2.75, modes[i % modes.length], false, 0.8, section());
    assert.deepEqual(environment.scene.children.map((object) => object.uuid), ids);
    assert.deepEqual(environment.beams.map((beam) => beam.uuid), beams);
    textures.add(environment.scene.background as THREE.Texture);
    textures.add(environment.beams[0].material.map!);
    textures.add(floorWashes(environment).material.map!);
  }
  assert.equal(textures.size, 18, 'six backgrounds, six beam silhouettes and six gobo patterns');
  const lights: THREE.Light[] = [];
  environment.scene.traverse((object) => { if (object instanceof THREE.Light) lights.push(object); });
  assert.equal(lights.length, 3, 'profiles do not introduce any dynamic light or shadow pass');
  environment.dispose();
});

test('neon, sunset and ice have one-beat, four-beat and two-beat smooth pulse cadences', () => {
  const environment = makeClubEnvironment();
  const modes = ['neon', 'sunset', 'ice'] as const;
  const peaks = modes.map((mode) => {
    const values: number[] = [];
    for (let tick = 0; tick <= 1024; tick += 1) {
      environment.update(tick / 128, mode, false, 0.9, section());
      values.push(environment.beams[0].material.opacity);
    }
    let count = 0;
    for (let i = 1; i < values.length - 1; i += 1) {
      if (values[i] > values[i - 1] && values[i] > values[i + 1]) count += 1;
      assert.ok(Math.abs(values[i] - values[i - 1]) < 0.025, 'no mode introduces abrupt flicker');
    }
    assert.ok(Math.max(...values) - Math.min(...values) > 0.12, 'each mode has a legible brightness cycle');
    return count;
  });
  assert.ok(peaks[0] >= 7 && peaks[0] <= 8);
  assert.ok(peaks[1] >= 1 && peaks[1] <= 2);
  assert.ok(peaks[2] >= 3 && peaks[2] <= 4);
  environment.update(0, 'ice', false, 0.9, section());
  assert.ok(Math.abs(environment.beams[0].material.opacity - environment.beams[4].material.opacity) > 0.12, 'ice pairs alternate rather than all flashing together');
  environment.dispose();
});

test('warm and icy modes keep their own hue families throughout their changing phrases', () => {
  const environment = makeClubEnvironment();
  for (let beat = 0; beat < 96; beat += 0.75) {
    environment.update(beat, 'sunset', false, 0.8, section());
    for (const beam of environment.beams.filter((beam) => beam.visible)) {
      assert.ok(beam.material.color.r > beam.material.color.g && beam.material.color.g > beam.material.color.b, 'sunset stays amber and coral instead of cycling into cold hues');
    }
    environment.update(beat, 'ice', false, 0.8, section());
    for (const beam of environment.beams.filter((beam) => beam.visible)) {
      assert.ok(beam.material.color.b > beam.material.color.r + 0.25, 'ice stays unmistakably blue and cyan');
    }
  }
  environment.dispose();
});

test('reduced-motion modes retain distinct static counts and shapes without restarting animation', () => {
  const environment = makeClubEnvironment();
  const counts: number[] = [];
  const widths: number[] = [];
  for (const mode of ['neon', 'sunset', 'ice'] as const) {
    environment.update(4, mode, true, 0.1, section({ section: 'break' }));
    const snapshot = lightSnapshot(environment);
    const wash = Array.from(floorWashes(environment).instanceMatrix.array);
    counts.push(snapshot.length);
    widths.push(snapshot[0].scale[0]);
    environment.update(224, mode, true, 1, section({ drop: 1 }));
    assert.deepEqual(lightSnapshot(environment), snapshot);
    assert.deepEqual(Array.from(floorWashes(environment).instanceMatrix.array), wash);
  }
  assert.deepEqual(counts, [6, 2, 8]);
  assert.ok(widths[1] > widths[0] * 3 && widths[2] > widths[0]);
  environment.dispose();
});

test('six light modes have distinct counts, dark floor tints and linked low-intensity floor patterns', () => {
  assert.deepEqual(LIGHT_MODES, ['neon', 'sunset', 'ice', 'ember', 'acid', 'moon']);
  const environment = makeClubEnvironment();
  const counts = [6, 2, 8, 4, 5, 3];
  const patterns = new Set<number>();
  const floors = new Set<string>();
  const textures = new Set<THREE.Texture>();
  LIGHT_MODES.forEach((mode, index) => {
    environment.update(7.25, mode, false, 0.8, section());
    assert.equal(environment.beams.filter((beam) => beam.visible).length, counts[index]);
    const uniforms = environment.floor.material.uniforms;
    assert.ok(uniforms.glowColor && uniforms.glowStrength && uniforms.glowPattern && uniforms.glowPhase, 'floor has a lightweight mode-linked glow');
    assert.ok(uniforms.glowStrength.value > 0.005 && uniforms.glowStrength.value <= 0.045, 'floor emission stays below character lighting');
    patterns.add(uniforms.glowPattern.value);
    floors.add(uniforms.colorFront.value.getHexString());
    textures.add(environment.beams[0].material.map!);
    textures.add(floorWashes(environment).material.map!);
    const glow = uniforms.glowColor.value as THREE.Color;
    assert.ok(glow.equals(environment.beams[0].material.color), 'floor glow follows the active lighting hue');
  });
  assert.equal(patterns.size, 6);
  assert.equal(floors.size, 6);
  assert.equal(textures.size, 12, 'each mode has a distinct beam silhouette and floor gobo');
  environment.dispose();
});

test('mode-linked floor glow follows the shared beat and is static in reduced motion', () => {
  const environment = makeClubEnvironment();
  const uniforms = environment.floor.material.uniforms;
  assert.ok(uniforms.glowStrength && uniforms.glowPhase, 'a shared-time floor glow is present');
  for (const mode of LIGHT_MODES) {
    environment.update(0, mode, false, 0.9, section());
    const bright = uniforms.glowStrength.value;
    environment.update(0.5, mode, false, 0.9, section());
    assert.notEqual(uniforms.glowPhase.value, 0);
    if (mode === 'neon') assert.ok(bright > uniforms.glowStrength.value, 'floor gently responds with its beam pulse');
    environment.update(3, mode, true, 0.2, section({ section: 'break' }));
    const staticFloor = [uniforms.glowPhase.value, uniforms.glowStrength.value, ...uniforms.glowColor.value.toArray()];
    environment.update(104, mode, true, 1, section({ drop: 1 }));
    assert.deepEqual([uniforms.glowPhase.value, uniforms.glowStrength.value, ...uniforms.glowColor.value.toArray()], staticFloor);
  }
  environment.dispose();
});

test('moon floor falloff does not pass negative values into GLSL pow', () => {
  const environment = makeClubEnvironment();
  assert.doesNotMatch(environment.floor.material.fragmentShader, /pow\(\(radius\s*-/, 'GLSL pow is undefined for a negative base, including a squared radius difference');
  environment.dispose();
});

test('red, acid and moon keep clearly separate color identities through all palette fades', () => {
  const environment = makeClubEnvironment();
  for (let beat = 0; beat <= 96; beat += 0.5) {
    environment.update(beat, 'ember', false, 0.8, section());
    for (const beam of environment.beams.filter((beam) => beam.visible)) {
      const color = beam.material.color;
      assert.ok(color.r > color.g + 0.3 && color.r > color.b + 0.2, 'red mode must not cross through green when hue wraps at zero');
    }
    environment.update(beat, 'acid', false, 0.8, section());
    for (const beam of environment.beams.filter((beam) => beam.visible)) assert.ok(beam.material.color.g > beam.material.color.b + 0.4);
    environment.update(beat, 'moon', false, 0.8, section());
    for (const beam of environment.beams.filter((beam) => beam.visible)) assert.ok(beam.material.color.b > 0.65 && beam.material.color.r > 0.25);
  }
  environment.dispose();
});
