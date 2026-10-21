import * as THREE from 'three';
import { clamp01, seededRandom } from './visual-math.ts';

const vertexShader = `
attribute vec4 aSeed;
uniform float uTime;
uniform float uHeight;
uniform float uRadius;
uniform float uCollapse;
varying vec2 vUv;
varying float vLife;
varying float vSeed;
void main() {
 vUv = uv; vSeed = aSeed.w;
 // Each puff rises, widens and drifts downwind; its wrap is fully transparent.
 float life = fract(aSeed.x + uTime * (0.10 + aSeed.z * 0.035));
 float angle = aSeed.y * 6.283185;
 float spread = uRadius * (0.14 + life * 0.19);
 vec3 center = vec3(cos(angle) * spread + life * life * uRadius * 0.55,
   0.4 + (1.0 - uCollapse) * uHeight * 0.22 + life * uHeight,
   sin(angle) * spread + life * life * uRadius * 0.18);
 center.x += sin(life * 5.0 + aSeed.w * 6.0) * uRadius * 0.055 * life;
 vec4 view = modelViewMatrix * vec4(center, 1.0);
 float size = uRadius * (0.35 + life * 0.48) * (0.8 + aSeed.z * 0.4);
 // Camera-facing quads stay legible in vista, follow and aerial views.
 view.xy += position.xy * size;
 gl_Position = projectionMatrix * view;
 vLife = smoothstep(0.0, 0.13, life) * (1.0 - smoothstep(0.58, 1.0, life));
}`;
const fragmentShader = `
uniform float uIntensity;
varying vec2 vUv;
varying float vLife;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
 vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
 vec2 p = vUv * 2.0 - 1.0;
 float n = noise(vUv * 4.5 + vSeed * 17.0);
 float edge = 1.0 - smoothstep(0.30, 1.0, length(p) + (n - 0.5) * 0.24);
 float alpha = edge * (0.72 + n * 0.28) * vLife * uIntensity * 0.29;
 gl_FragColor = vec4(mix(vec3(0.065, 0.060, 0.055), vec3(0.15, 0.14, 0.13), n), alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export interface DesertSmoke {
 root: THREE.Group;
 update(timeSeconds: number, intensity: number, reducedMotion: boolean, collapse: number): void;
 dispose(): void;
}

/** 12 soft puffs in one instanced draw per artwork: at most 360 quads for 30 artworks.
 * No texture, lights, shadows, CPU particles or per-frame allocations. Never ambient haze. */
export function createDesertSmoke(seed: number, height = 9, radius = 4): DesertSmoke {
 const root = new THREE.Group(); root.name = 'artwork-burn-smoke'; root.visible = false;
 const geometry = new THREE.InstancedBufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0], 3));
 geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 1,1, 0,1], 2));
 geometry.setIndex([0,1,2, 0,2,3]); geometry.instanceCount = 12;
 const random = seededRandom(seed + 3109), seeds = new Float32Array(12 * 4);
 for (let i = 0; i < 12; i++) seeds.set([(i + random() * .35) / 12, random(), random(), random()], i * 4);
 geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
 const uniforms = {
  uTime: {value: 0}, uIntensity: {value: 0}, uCollapse: {value: 0},
  uHeight: {value: Math.min(26, Math.max(5, height * 1.15))},
  uRadius: {value: Math.min(8, Math.max(2, radius))},
 };
 const material = new THREE.ShaderMaterial({uniforms, vertexShader, fragmentShader,
  transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending});
 const mesh = new THREE.Mesh(geometry, material);
 // Vertex-driven bounds are deliberately local but exceed the base quad bounds.
 mesh.frustumCulled = false; root.add(mesh);
 let disposed = false;
 return {root, update(time, intensity, reducedMotion, collapse) {
  if (disposed) return;
  uniforms.uTime.value = reducedMotion || !Number.isFinite(time) ? 0 : Math.max(0, time);
  uniforms.uIntensity.value = Number.isFinite(intensity) ? clamp01(intensity) : 0;
  uniforms.uCollapse.value = Number.isFinite(collapse) ? clamp01(collapse) : 0;
  root.visible = uniforms.uIntensity.value > 0;
 }, dispose() {
  if (disposed) return;
  disposed = true; geometry.dispose(); material.dispose(); root.removeFromParent();
 }};
}
