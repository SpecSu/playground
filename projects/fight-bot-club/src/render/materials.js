// 机甲材质：MeshStandardMaterial + 物体空间程序化涂装（17 种图案）+ 面板法线 + 受击闪白
// 图案类型是 uniform 而非 define → 所有机甲共享同一套着色器程序，切换配色零编译开销
import * as THREE from 'three';
import { makePanelMaps } from './textures.js';

let SHARED = null;
export function shared() {
  if (!SHARED) SHARED = { panel: makePanelMaps(11, 512), panel2: makePanelMaps(29, 512) };
  return SHARED;
}

export const PATTERNS = { none: 0, stripes: 1, split: 2, checker: 3, camo: 4, digital: 5, circuit: 6, hex: 7, hazard: 8, dots: 9, carbon: 10, drip: 11, cracks: 12, wave: 13, cloud: 14, chevron: 15, trim: 16, patch: 17 };

const PAT_GLSL = /* glsl */`
uniform int uPat; uniform vec3 uPatCol; uniform vec3 uPatEmis; uniform float uPatScale; uniform float uPatSeed; uniform float uWear;
uniform float uHit; uniform vec3 uHitCol; uniform float uTime;
varying vec3 vRest;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); float a=h21(i), b=h21(i+vec2(1,0)), c=h21(i+vec2(0,1)), d=h21(i+vec2(1,1)); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ return vnoise(p)*0.6 + vnoise(p*2.1+7.3)*0.3 + vnoise(p*4.3+1.7)*0.1; }
vec2 vor(vec2 p){ vec2 i=floor(p), f=fract(p); float d1=8., d2=8.; for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 o=vec2(h21(i+g), h21(i+g+17.1)); float d=length(g+o-f); if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d; } return vec2(d1,d2); }
// 返回 x=图案遮罩（0 主色 / 1 图案色），y=发光强度
vec2 pattern(vec3 p){
  p.x = abs(p.x); // 左右镜像对称，避免阴阳配色
  float s = uPatScale; vec2 xz = p.xz, xy = p.xy, zy = p.zy;
  vec2 q = vec2(p.x + p.z*0.55, p.y) * s + uPatSeed;
  if (uPat==1) { float a=abs(p.x); return vec2(step(a,0.16*s*0.9)*step(0.05,a) , 0.); }
  if (uPat==2) { return vec2(step(0.0, p.x + sin(p.y*2.0+uPatSeed)*0.08), 0.); }
  if (uPat==3) { vec3 c=floor(p*s*2.2); return vec2(mod(c.x+c.y+c.z,2.), 0.); }
  if (uPat==4) { float n=fbm(q*1.1); return vec2(smoothstep(0.5,0.53,n) + smoothstep(0.66,0.69,n)*0.5, 0.); }
  if (uPat==5) { vec2 g=floor(q*5.)/5.; float n=fbm(g*1.3); return vec2(step(0.52,n) + step(0.68,n)*0.5, 0.); }
  if (uPat==6) { vec2 g=fract(q*3.); float l=min(min(g.x,1.-g.x),min(g.y,1.-g.y)); float node=step(0.75, h21(floor(q*3.))); float line=(1.-smoothstep(0.02,0.05,l))*node; return vec2(line, line*1.6); }
  if (uPat==7) { vec2 r=vec2(1.,1.732); vec2 h=r*.5; vec2 a=mod(q*3.,r)-h, b=mod(q*3.-h,r)-h; vec2 g=dot(a,a)<dot(b,b)?a:b; float e=0.5-max(abs(g.x)*0.866+abs(g.y)*0.5, abs(g.y)); return vec2(1.-smoothstep(0.03,0.07,e), 0.); }
  if (uPat==8) { return vec2(step(0.5, fract((p.x+p.y+p.z)*s*1.6)), 0.); }
  if (uPat==9) { vec2 g=fract(q*2.6)-0.5; return vec2(1.-smoothstep(0.18,0.22,length(g)), 0.); }
  if (uPat==10) { vec2 g=floor(q*28.); float w=mod(g.x+floor(g.y*0.5),2.); return vec2(w*0.35, 0.); }
  if (uPat==11) { float n=vnoise(vec2(p.x*s*6.+p.z*3., uPatSeed)); float dr=smoothstep(0.55,0.75,n)*smoothstep(-0.2,0.6, p.y*0.4 + n - 0.2); return vec2(dr, dr*0.9); }
  if (uPat==12) { vec2 v=vor(q*2.2); float e=1.-smoothstep(0.02,0.07,v.y-v.x); return vec2(e, e*(1.6+0.5*sin(uTime*3.+v.x*9.))); }
  if (uPat==13) { return vec2(step(0.5, fract(p.y*s*1.4 + sin(p.x*3.+p.z*2.)*0.18)), 0.); }
  if (uPat==14) { float n=fbm(q*0.9+vec2(sin(q.y*2.),cos(q.x*2.))*0.4); return vec2(smoothstep(0.55,0.6,n)*(1.-smoothstep(0.66,0.7,n)) , 0.); }
  if (uPat==15) { return vec2(step(0.5, fract(p.y*s*1.2 + abs(p.x)*1.2)), 0.); }
  if (uPat==16) { float b=fract(p.y*s*0.9); return vec2(step(0.86,b), 0.); }
  if (uPat==17) { vec2 g=floor(q*1.4); float n=h21(g); return vec2(step(0.62,n)*0.7, 0.); }
  return vec2(0.);
}
`;

const VERT_DECL = 'attribute vec3 aRest;\nvarying vec3 vRest;\n';

export function mechMaterial(opts) {
  const {
    color = '#888', rough = 0.45, metal = 0.2, pattern = 0, patCol = '#000', patEmis = '#000', patScale = 1, patSeed = 0, wear = 0.2,
    normalScale = 0.7, panel = true, uni, emissive = null, emissiveIntensity = 1, envI = 1, panelB = false, flatShading = false,
  } = opts;
  const S = shared();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: envI, flatShading });
  if (panel) { const P = panelB ? S.panel2 : S.panel; mat.normalMap = P.normal; mat.normalScale = new THREE.Vector2(normalScale, normalScale); mat.roughnessMap = P.rough; }
  if (emissive) { mat.emissive = new THREE.Color(emissive); mat.emissiveIntensity = emissiveIntensity; }
  const U = {
    uPat: { value: pattern }, uPatCol: { value: new THREE.Color(patCol) }, uPatEmis: { value: new THREE.Color(patEmis) },
    uPatScale: { value: patScale }, uPatSeed: { value: patSeed }, uWear: { value: wear },
    uHit: uni?.uHit || { value: 0 }, uHitCol: uni?.uHitCol || { value: new THREE.Color(1, 0.9, 0.8) }, uTime: uni?.uTime || GLOBAL_TIME,
  };
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
    sh.fragmentShader = PAT_GLSL + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 patv = pattern(vRest);
        diffuseColor.rgb = mix(diffuseColor.rgb, uPatCol, clamp(patv.x,0.,1.));
        float grime = fbm(vRest.xy*3.1 + vRest.z*1.7);
        diffuseColor.rgb *= 1.0 - uWear*0.35*smoothstep(0.45,0.85,grime) * (1.0 - smoothstep(0.0, 1.2, vRest.y)*0.5);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uPatEmis * patv.y;
        totalEmissiveRadiance += uHitCol * uHit * 0.9;`);
  };
  mat.customProgramCacheKey = () => 'mechpat';
  return mat;
}
export const GLOBAL_TIME = { value: 0 };

// 不带图案的简单材质（关节 / 液压杆 / 橡胶 / 玻璃 / 发光）同样需要 aRest 兼容 → 用普通材质即可（不读该属性）
export function plainMaterial(opts) {
  const m = new THREE.MeshStandardMaterial(opts);
  return m;
}
export function glowMaterial(color, intensity = 2.5) {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4, metalness: 0 });
  m.userData.glow = true;
  return m;
}
