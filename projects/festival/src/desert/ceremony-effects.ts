import * as THREE from 'three';
import { festivalFireworkSchedule, type FestivalCeremonyState } from './ceremony.ts';
import { seededRandom } from './visual-math.ts';

const BURST_PARTICLES = 56;
const LAUNCH_PARTICLES = 8; // One fireball, six plume segments, one soft detonation glow.
const WELD_PARTICLES = 240;
const LAUNCH_SECONDS = 1.45;
const vertex = `
attribute vec4 aBurst;
attribute vec4 aMotion;
attribute vec4 aInfo;
attribute vec3 aColor;
uniform float uTime;
uniform float uIntensity;
uniform float uPixelRatio;
uniform float uMinimumSize;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vShape;
vec3 launchPosition(float t){
 float p=clamp(t/${LAUNCH_SECONDS},0.,1.);
 return vec3(aBurst.x+sin(p*3.14159)*1.3,2.+(aBurst.y-2.)*(p*(2.-p)),aBurst.z);
}
vec3 burstPosition(float t){
 float travel=1.-exp(-max(0.,t)*1.05);
 return aBurst.xyz+aMotion.xyz*travel-vec3(0.,max(0.,t)*max(0.,t)*.55,0.);
}
void main(){
 float age=uTime-aBurst.w;
 float sparkAge=age-${LAUNCH_SECONDS};
 float p=clamp(sparkAge/(aInfo.x-${LAUNCH_SECONDS}),0.,1.);
 vec3 head=aBurst.xyz,tail=head;
 float alpha=0.,width=1.;vShape=0.;vColor=aColor;vUv=uv;
 if(aInfo.y<.5){
  head=burstPosition(sparkAge);tail=burstPosition(max(0.,sparkAge-(.24+aInfo.w*.16)));
  alpha=smoothstep(0.,.13,sparkAge)*(1.-smoothstep(.42,1.,p));
  if(sparkAge<0.||p>=1.)alpha=0.;
  width=aMotion.w*(.92-p*.44);
 }else if(aInfo.y<1.5){
  head=launchPosition(age);tail=head;vShape=1.;width=2.1;
  alpha=smoothstep(0.,.12,age)*(1.-smoothstep(${LAUNCH_SECONDS}-.10,${LAUNCH_SECONDS}+.06,age));
  if(age<0.||age>${LAUNCH_SECONDS}+.08)alpha=0.;
  vColor=vec3(1.,.63,.22);
 }else if(aInfo.y<2.5){
  float t=age-aInfo.z*.065;
  head=launchPosition(t);tail=launchPosition(t-.12);
  width=(1.-aInfo.z*.09)*1.1;
  alpha=smoothstep(0.,.08,t)*(1.-smoothstep(${LAUNCH_SECONDS}-.10,${LAUNCH_SECONDS}+.09,age))*(1.-aInfo.z*.105);
  if(t<0.||age>${LAUNCH_SECONDS}+.10)alpha=0.;
  vColor=mix(vec3(1.,.2,.025),vec3(1.,.83,.36),1.-aInfo.z/7.);
 }else{
  vShape=2.;width=3.4+max(sparkAge,0.)*4.;
  alpha=smoothstep(0.,.10,sparkAge)*(1.-smoothstep(.12,.65,sparkAge))*.60;
  if(sparkAge<0.||sparkAge>.65)alpha=0.;
 }
 vec4 viewHead=modelViewMatrix*vec4(head,1.);
 vec4 viewTail=modelViewMatrix*vec4(tail,1.);
 vec4 mv=viewHead;
 if(vShape>.5){mv.xy+=position.xy*width;}
 else{
  vec2 delta=viewHead.xy-viewTail.xy;
  float distance=max(.0001,length(delta));vec2 direction=delta/distance;
  // Geometry ribbons have true world length; their length never collapses to a point in aerial view.
  float minimumLength=uMinimumSize*max(24.,-viewHead.z)/900.;
  viewTail.xy=viewHead.xy-direction*max(distance,minimumLength);
  mv=mix(viewTail,viewHead,uv.y);
  mv.xy+=vec2(-direction.y,direction.x)*position.x*width;
 }
 gl_Position=projectionMatrix*mv;
 vAlpha=alpha*uIntensity;
}`;
const fireworkFragment = `
uniform float uBrightness;
varying vec2 vUv;varying float vAlpha;varying vec3 vColor;varying float vShape;
void main(){
 if(vAlpha<.002)discard;
 float alpha=0.,core=0.;
 if(vShape>.5){
  float r=length(vUv-.5)*2.;if(r>1.)discard;
  core=1.-smoothstep(0.,.30,r);
  alpha=exp(-r*r*4.5)*(1.-smoothstep(.7,1.,r));
  if(vShape>1.5)core*=.5;
 }else{
  float edge=abs(vUv.x-.5)*2.;
  float tail=smoothstep(0.,.15,vUv.y);
  float tip=1.-smoothstep(.88,1.,vUv.y);
  core=(1.-smoothstep(.10,.34,edge))*smoothstep(.2,.85,vUv.y);
  alpha=(exp(-edge*edge*5.)*.70+core*.30)*tail*tip;
 }
 gl_FragColor=vec4(mix(vColor,vec3(1.,.95,.82),core*.28)*uBrightness*.58,alpha*vAlpha);
}`;
const fragment = `
varying float vAlpha;varying vec3 vColor;
void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.;if(r>1.||vAlpha<.002)discard;
 float glow=exp(-r*r*5.);float core=1.-smoothstep(0.,.28,r);
 gl_FragColor=vec4(vColor*(1.+core*.45),(glow*.7+core*.3)*vAlpha);}`;

/** Two bounded GPU-driven draws: world-space fireball/ribbon fireworks and monument sparks. */
export function createFestivalCeremonyEffects(pixelRatio = 1) {
 const root = new THREE.Group(); root.name = 'festival-burn-ceremony'; root.visible = false;
 const count = 20 * (BURST_PARTICLES + LAUNCH_PARTICLES);
 const geometry = new THREE.InstancedBufferGeometry();geometry.instanceCount=count;
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
 geometry.setIndex([0,1,2,0,2,3]);
 const bursts = new Float32Array(count * 4), motion = new Float32Array(count * 4), info = new Float32Array(count * 4), colors = new Float32Array(count * 3);
 geometry.setAttribute('aBurst', new THREE.InstancedBufferAttribute(bursts, 4));
 geometry.setAttribute('aMotion', new THREE.InstancedBufferAttribute(motion, 4));
 geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
 geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
 const material = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uPixelRatio: { value: pixelRatio }, uMinimumSize: { value: 4.5 }, uBrightness: { value: 2.3 } },
  vertexShader: vertex, fragmentShader: fireworkFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending, toneMapped: false,
 });
 const fireworks = new THREE.Mesh(geometry, material); fireworks.name = 'festival-aerial-fireworks'; fireworks.frustumCulled = false; fireworks.renderOrder = 4; root.add(fireworks);
 const weldingGeometry = new THREE.BufferGeometry();
 const seeds = new Float32Array(WELD_PARTICLES * 4), random = seededRandom(621137);
 for (let i = 0; i < WELD_PARTICLES; i++) seeds.set([random(), random(), random(), random()], i * 4);
 weldingGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WELD_PARTICLES * 3), 3));
 weldingGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
 const weldingMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uPixelRatio: { value: pixelRatio } },
  vertexShader: `attribute vec4 aSeed;uniform float uTime;uniform float uIntensity;uniform float uPixelRatio;varying float vAlpha;varying vec3 vColor;
  void main(){float p=fract(aSeed.x+uTime*(.48+aSeed.w*.28));float angle=aSeed.y*6.283185+uTime*.48;
  float radius=11.5+p*(4.+aSeed.z*8.);vec3 pos=vec3(cos(angle)*radius,11.6+p*(2.+aSeed.w*4.)-p*p*8.,sin(angle)*radius);
  vec4 mv=modelViewMatrix*vec4(pos,1.);gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((1.9+aSeed.z*1.4)*140./max(22.,-mv.z),1.4,6.)*uPixelRatio;
  vAlpha=smoothstep(0.,.035,p)*(1.-smoothstep(.25,1.,p))*uIntensity;
  vColor=mix(vec3(1.,.38,.075),vec3(1.,.91,.70),pow(1.-p,3.));}`,
  fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
 });
 const sparks = new THREE.Points(weldingGeometry, weldingMaterial); sparks.name = 'dreamina-welding-sparks'; sparks.frustumCulled = false; sparks.renderOrder = 4; root.add(sparks);
 let activeRound: number | null = null, disposed = false;
 const tint = new THREE.Color();
 const prepare = (roundIndex: number) => {
  const rng = seededRandom(roundIndex * 331 + 93001);
  festivalFireworkSchedule(roundIndex).forEach((burst, index) => {
   tint.setHex(burst.color);
   for (let particle = 0; particle < BURST_PARTICLES + LAUNCH_PARTICLES; particle++) {
    const offset = index * (BURST_PARTICLES + LAUNCH_PARTICLES) + particle;
    const stage = particle < BURST_PARTICLES ? 0 : particle === BURST_PARTICLES ? 1 : particle === BURST_PARTICLES + LAUNCH_PARTICLES - 1 ? 3 : 2;
    const phi = particle * 2.399963, y = 1 - 2 * (particle + .5) / BURST_PARTICLES;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const speed = burst.radius * (.90 + rng() * .18);
    bursts.set([burst.x, burst.y, burst.z, burst.startsAt], offset * 4);
    motion.set([Math.cos(phi) * radial * speed, y * speed, Math.sin(phi) * radial * speed, .66 + rng() * .34], offset * 4);
    info.set([burst.duration, stage, Math.max(0, particle - BURST_PARTICLES), rng()], offset * 4);
    colors.set([tint.r, tint.g, tint.b], offset * 3);
   }
  });
  for (const name of ['aBurst', 'aMotion', 'aInfo', 'aColor']) geometry.getAttribute(name).needsUpdate = true;
  activeRound = roundIndex;
 };
 return {
  root,
  update(state: FestivalCeremonyState, roundIndex: number, reducedMotion = false) {
   if (disposed) return;
   if (activeRound !== roundIndex) prepare(roundIndex);
   root.visible = state.burning && state.intensity > .001;
   // Reduced motion keeps the color and ritual while removing all travelling particles.
   material.uniforms.uTime.value = reducedMotion ? 22 : state.elapsed;
   material.uniforms.uIntensity.value = state.intensity * (reducedMotion ? .5 : .95);
   weldingMaterial.uniforms.uTime.value = reducedMotion ? 11 : state.elapsed;
   weldingMaterial.uniforms.uIntensity.value = state.intensity * (reducedMotion ? .3 : .9);
  },
  dispose() {
   if (disposed) return; disposed = true;
   geometry.dispose(); material.dispose(); weldingGeometry.dispose(); weldingMaterial.dispose(); root.removeFromParent();
  },
 };
}
