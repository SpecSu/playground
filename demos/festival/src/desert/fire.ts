import * as THREE from 'three';
import { seededRandom } from './visual-math.ts';

const vertexShader = `
varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader = `
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){
 vec2 p=vUv;float t=uTime*1.65+uSeed;
 float n=noise(vec2(p.x*4.8,p.y*7.5-t))*0.58+noise(vec2(p.x*10.0+uSeed,p.y*15.-t*1.4))*0.24;
 float sway=sin(p.y*6.-t*1.3+uSeed)*0.07*p.y;
 float width=(1.-p.y)*0.48+0.02;
 float edge=abs(p.x-0.5+sway)/width;
 float shape=1.-smoothstep(0.5,1.18,edge+(n-0.5)*0.9);
 shape*=smoothstep(0.,0.1,p.y)*(1.-smoothstep(0.50+n*0.42,1.0,p.y));
 float core=clamp((1.-p.y)*1.4-edge*0.55,0.,1.);
 vec3 color=mix(vec3(0.9,0.12,0.018),vec3(1.,0.40,0.045),core);
 color=mix(color,vec3(1.,0.83,0.42),pow(core,4.));
 gl_FragColor=vec4(color*1.40,shape*0.75*uIntensity);
}`;
/** Soft local firelight; one bounded draw with no texture or per-frame geometry. */
export function createDesertFirelight(radius:number,uniforms:{uTime:{value:number};uIntensity:{value:number}},strength=.36){
 const material=new THREE.ShaderMaterial({
  uniforms:{...uniforms,uGlowStrength:{value:strength}},vertexShader,
  fragmentShader:`uniform float uTime;uniform float uIntensity;uniform float uGlowStrength;varying vec2 vUv;
  void main(){float r=length(vUv-.5)*2.;if(r>=1.)discard;
   float falloff=exp(-r*r*4.2)*(1.-smoothstep(.45,1.,r));
   float flicker=.95+.05*sin(uTime*2.1);
   vec3 warm=mix(vec3(1.,.55,.18),vec3(.82,.18,.035),smoothstep(0.,.80,r));
   gl_FragColor=vec4(warm,falloff*uIntensity*uGlowStrength*flicker);}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
 });
 const glow=new THREE.Mesh(new THREE.CircleGeometry(radius,40),material);
 glow.name='festival-fire-ground-glow';glow.rotation.x=-Math.PI/2;glow.position.y=.045;glow.renderOrder=1;
 return glow;
}

export interface DesertFire {
 root: THREE.Group;
 update(timeSeconds:number,intensity:number):void;
 dispose():void;
}
/** A handful of crossed shader ribbons plus 44 shader-driven sparks, no per-frame allocation. */
export function createDesertFire(seed:number,height=7,width=4):DesertFire {
 const root=new THREE.Group();root.name='festival-fire';
 const uniforms={uTime:{value:0},uSeed:{value:seed*0.73},uIntensity:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 const groundGlow=createDesertFirelight(Math.max(3.6,width*1.15),uniforms);root.add(groundGlow);
 const geo=new THREE.PlaneGeometry(width,height,1,1);geo.translate(0,height/2,0);
 for(let i=0;i<3;i++){const mesh=new THREE.Mesh(geo,material);mesh.rotation.y=i*Math.PI/3;mesh.position.y=0.15;mesh.renderOrder=3;root.add(mesh);}
 const rng=seededRandom(seed+901), positions=new Float32Array(44*3), info=new Float32Array(44*3);
 for(let i=0;i<44;i++){positions.set([0,0,0],i*3);info.set([rng(),rng(),rng()],i*3);}
 const sparksGeo=new THREE.BufferGeometry();sparksGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));sparksGeo.setAttribute('aSeed',new THREE.BufferAttribute(info,3));
 const sparksMat=new THREE.ShaderMaterial({uniforms:{...uniforms,uHeight:{value:height},uWidth:{value:width}},vertexShader:`
 attribute vec3 aSeed;uniform float uTime;uniform float uHeight;uniform float uWidth;uniform float uIntensity;varying float vLife;
 void main(){float p=fract(aSeed.x+uTime*(0.11+aSeed.z*0.09));float a=aSeed.y*6.2831+p*1.4;
 vec3 pos=vec3(cos(a)*(0.22+p*0.5)*uWidth,p*uHeight*1.8,sin(a)*uWidth*0.3);
 vLife=(1.-p)*uIntensity;vec4 mv=modelViewMatrix*vec4(pos,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(6.,(1.6+aSeed.z*1.4)*95./max(1.,-mv.z));}`,
 fragmentShader:`varying float vLife;void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;gl_FragColor=vec4(1.,0.40,0.06,(1.-d*2.)*vLife);}`,
 transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
 const sparks=new THREE.Points(sparksGeo,sparksMat);sparks.frustumCulled=false;root.add(sparks);
 let disposed=false;
 return {root,update(time,intensity){uniforms.uTime.value=time;uniforms.uIntensity.value=intensity;root.visible=intensity>0.005;},dispose(){if(disposed)return;disposed=true;geo.dispose();material.dispose();groundGlow.geometry.dispose();groundGlow.material.dispose();sparksGeo.dispose();sparksMat.dispose();root.removeFromParent();}};
}
