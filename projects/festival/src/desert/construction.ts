import { FESTIVAL_CONSTRUCTION_SECONDS } from '../../lib/festival-timing.ts';
import * as THREE from 'three';
import { seededRandom, smoothstep } from './visual-math.ts';

/** Original modeling pieces stay individually animated inside material-batched draws. */
const declarations = `
attribute vec4 aBuildAnchor;
attribute vec4 aBuildAxis;
uniform float uConstructionSeconds;
uniform float uConstructionSettle;
float buildGrowth(){return smoothstep(0.,1.,clamp((uConstructionSeconds-aBuildAnchor.w)/aBuildAxis.w,0.,1.));}
`;
const growth = `
#include <begin_vertex>
float buildP = buildGrowth();
vec3 buildDelta = transformed - aBuildAnchor.xyz;
vec3 buildVertical = aBuildAxis.xyz * dot(buildDelta, aBuildAxis.xyz);
float buildWidth = smoothstep(0.,.18,buildP) * (.86 + .14 * buildP);
transformed = aBuildAnchor.xyz + (buildDelta-buildVertical)*buildWidth + buildVertical*buildP;
// Each piece finishes with a small downward settling motion, never a whole-model pop.
transformed -= aBuildAxis.xyz * sin(buildP*3.14159265) * (1.-buildP)*.14*uConstructionSettle;
`;
const normals = `
#include <beginnormal_vertex>
float normalP = buildGrowth();
vec3 normalVertical = aBuildAxis.xyz * dot(objectNormal,aBuildAxis.xyz);
float normalWidth = smoothstep(0.,.18,normalP) * (.86+.14*normalP);
objectNormal = normalize((objectNormal-normalVertical)/max(.001,normalWidth)+normalVertical/max(.001,normalP));
`;

export interface InstallationConstruction {
 seconds: {value:number};
 dust:THREE.Points;
 update(seconds:number,reducedMotion:boolean,active?:boolean):void;
 dispose():void;
}

export function createInstallationConstruction(root:THREE.Group,seed:number):InstallationConstruction {
 const seconds={value:FESTIVAL_CONSTRUCTION_SECONDS},settle={value:1};
 const hooked=new Set<THREE.Material>(),shadowMaterials:THREE.Material[]=[];
 const hook=(material:THREE.Material)=>{
  if(hooked.has(material))return;hooked.add(material);
  material.onBeforeCompile=shader=>{
   shader.uniforms.uConstructionSeconds=seconds;shader.uniforms.uConstructionSettle=settle;
   shader.vertexShader=declarations+shader.vertexShader.replace('#include <begin_vertex>',growth).replace('#include <beginnormal_vertex>',normals);
  };
  material.customProgramCacheKey=()=> 'installation-construction-v1';
  material.needsUpdate=true;
 };
 root.traverse(node=>{
  if(!(node instanceof THREE.Mesh))return;
  for(const material of Array.isArray(node.material)?node.material:[node.material])hook(material);
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  const distance=new THREE.MeshDistanceMaterial({side:THREE.DoubleSide});
  hook(depth);hook(distance);node.customDepthMaterial=depth;node.customDistanceMaterial=distance;
  shadowMaterials.push(depth,distance);
 });
 const random=seededRandom(seed+271),positions=new Float32Array(24*3),seeds=new Float32Array(24*3);
 for(let i=0;i<24;i++)seeds.set([random(),random(),random()],i*3);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,3));
 const radius=Number(root.userData.radius??4);
 const material=new THREE.ShaderMaterial({
  uniforms:{uConstructionSeconds:seconds,uRadius:{value:radius}},
  vertexShader:`attribute vec3 aSeed;uniform float uConstructionSeconds;uniform float uRadius;varying float vOpacity;
  void main(){float life=fract(aSeed.x+uConstructionSeconds*(.25+aSeed.y*.08));float angle=aSeed.z*6.283185;
  vec3 p=vec3(cos(angle)*uRadius*(.65+life*.4),.12+life*.85,sin(angle)*uRadius*(.65+life*.4));
  vOpacity=sin(life*3.14159)*.15*smoothstep(0.,1.,uConstructionSeconds)*(1.-smoothstep(${(FESTIVAL_CONSTRUCTION_SECONDS*.85).toFixed(6)},${FESTIVAL_CONSTRUCTION_SECONDS.toFixed(6)},uConstructionSeconds));
  vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;gl_PointSize=min(22.,(14.+aSeed.y*10.)*70./max(1.,-view.z));}`,
  fragmentShader:`varying float vOpacity;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(.71,.53,.36,(1.-smoothstep(.08,.5,r))*vOpacity);}`,
  transparent:true,depthWrite:false,toneMapped:false,
 });
 const dust=new THREE.Points(geometry,material);dust.name='construction-dust';dust.position.copy(root.position);dust.frustumCulled=false;dust.visible=false;
 let disposed=false;
 return {seconds,dust,update(age,reducedMotion,active=true){settle.value=reducedMotion?0:1;seconds.value=Math.max(0,Math.min(FESTIVAL_CONSTRUCTION_SECONDS,age));dust.visible=active&&!reducedMotion&&age>0&&age<FESTIVAL_CONSTRUCTION_SECONDS;},dispose(){if(disposed)return;disposed=true;for(const material of shadowMaterials)material.dispose();geometry.dispose();material.dispose();dust.removeFromParent();}};
}

/** CPU reference of the vertex shader for offline geometry previews and inspection. */
export function deformConstructionVertex(position:THREE.Vector3,anchor:THREE.Vector4,axis:THREE.Vector4,seconds:number,reducedMotion=false,target=new THREE.Vector3()):THREE.Vector3 {
 const progress=smoothstep(0,1,(seconds-anchor.w)/axis.w);
 const width=smoothstep(0,.18,progress)*(.86+.14*progress);
 const dx=position.x-anchor.x,dy=position.y-anchor.y,dz=position.z-anchor.z;
 const vertical=dx*axis.x+dy*axis.y+dz*axis.z;
 const settling=reducedMotion?0:Math.sin(progress*Math.PI)*(1-progress)*.14;
 return target.set(anchor.x+(dx-axis.x*vertical)*width+axis.x*(vertical*progress-settling),
  anchor.y+(dy-axis.y*vertical)*width+axis.y*(vertical*progress-settling),
  anchor.z+(dz-axis.z*vertical)*width+axis.z*(vertical*progress-settling));
}
