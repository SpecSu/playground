import * as THREE from 'three';
import { seededRandom } from './visual-math.ts';

export interface DesertSandHaze {
 root: THREE.Group;
 update(time: number, reducedMotion?: boolean): void;
 dispose(): void;
}

/** Local, depth-tested atmosphere: 46 billboards, one draw, no textures or timers. */
export function createDesertSandHaze(): DesertSandHaze {
 const root = new THREE.Group();
 root.name = 'ambient-desert-sand';
 const geometry = new THREE.InstancedBufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5,-.5,0, .5,-.5,0, .5,.5,0, -.5,.5,0], 3));
 geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 1,1, 0,1], 2));
 geometry.setIndex([0,1,2,0,2,3]);
 const count = 46, rng = seededRandom(83472);
 const seeds = new Float32Array(count * 4), shapes = new Float32Array(count * 3);
 for (let i = 0; i < count; i++) {
  const streak = i >= 28, x = (rng() - .5) * 300, z = (rng() - .5) * 300;
  const distant = Math.hypot(x, z) > 100;
  seeds.set([x, streak ? .35 + rng() * 1.8 : distant ? 2 + rng() * 5 : .8 + rng() * 1.1, z, rng() * Math.PI * 2], i * 4);
  shapes.set(streak ? [5 + rng() * 9, .06 + rng() * .12, 1] : [30 + rng() * 32, distant ? 7 + rng() * 5 : 2.4 + rng() * 2, 0], i * 3);
 }
 geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
 geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(shapes, 3));
 geometry.instanceCount = count;
 const material = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: true,
  uniforms: { time: { value: 0 }, maxOpacity: { value: .065 }, sandColor: { value: new THREE.Color(0xd9b58b) } },
  vertexShader: `
   attribute vec4 aSeed;
   attribute vec3 aShape;
   uniform float time;
   varying vec2 vUv;
   varying float vPhase;
   varying float vKind;
   varying float vVisibility;
   void main() {
    vUv = uv; vPhase = aSeed.w; vKind = aShape.z;
    vec3 center = aSeed.xyz;
    center.x = mod(center.x + 150. + time * mix(1.35, 4.2, aShape.z), 300.) - 150.;
    center.z += sin(time * .07 + aSeed.w) * 3.;
    vec4 viewCenter = modelViewMatrix * vec4(center, 1.);
    // Clear space around a following camera; faded world edges hide wraparound.
    float cameraFade = smoothstep(12., 32., length(viewCenter.xyz));
    float edgeFade = 1. - smoothstep(120., 150., abs(center.x));
    vVisibility = cameraFade * edgeFade;
    viewCenter.xy += position.xy * aShape.xy;
    gl_Position = projectionMatrix * viewCenter;
   }`,
  fragmentShader: `
   uniform float time;
   uniform float maxOpacity;
   uniform vec3 sandColor;
   varying vec2 vUv;
   varying float vPhase;
   varying float vKind;
   varying float vVisibility;
   void main() {
    vec2 p = vUv * 2. - 1.;
    // Smooth elliptical edges, with slow bands rather than expensive noise textures.
    float envelope = pow(max(0., 1. - dot(p, p)), 2.);
    float billow = .58 + .20 * sin(p.x * 6. + p.y * 3. + vPhase + time * .18)
                         + .12 * sin(p.x * 12. - p.y * 5. - time * .11);
    float gust = smoothstep(.50, .95, sin(time * .32 + vPhase));
    float density = mix(billow, gust, vKind);
    float alpha = min(maxOpacity, envelope * density * maxOpacity * vVisibility);
    gl_FragColor = vec4(sandColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const mesh = new THREE.Mesh(geometry, material);
 mesh.name = 'sand-haze-and-wind-wisps';
 // Instances move in the shader, so a CPU bounding box of the base quad is wrong.
 mesh.frustumCulled = false;
 mesh.raycast = () => {};
 root.add(mesh);
 let disposed = false;
 return {
  root,
  update(time, reducedMotion = false) {
   if (disposed) return;
   material.uniforms.time.value = reducedMotion || !Number.isFinite(time) ? 0 : Math.max(0, time);
  },
  dispose() {
   if (disposed) return;
   disposed = true;
   root.removeFromParent(); geometry.dispose(); material.dispose();
  },
 };
}
