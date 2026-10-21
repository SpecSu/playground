import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDesertFire, createDesertFirelight, type DesertFire } from './fire.ts';
import { seededRandom } from './visual-math.ts';
import { createDreaminaMonument } from './monument.ts';
import { CAMPFIRE_POSITIONS } from './art-dimensions.ts';
import type { FestivalCeremonyState } from './ceremony.ts';
import { createFestivalNightLights } from './night-lights.ts';

export interface DesertEnvironment {
 root:THREE.Group; ground:THREE.Mesh; monument:THREE.Group;
 update(time:number,ceremony?:FestivalCeremonyState,reducedMotion?:boolean):void; dispose():void;
}
const TAU=Math.PI*2;
function cylinder(r1:number,r2:number,h:number,mat:THREE.Material,x=0,y=h/2,z=0,segments=24){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
function stone(color:number){return new THREE.MeshStandardMaterial({color,roughness:0.96,metalness:0.03,flatShading:true});}
function mergeStatic(root:THREE.Group){
 root.updateMatrixWorld(true);
 const buckets=new Map<THREE.Material,{geometry:THREE.BufferGeometry;source:THREE.Mesh}[]>();
 root.traverse(node=>{if(node instanceof THREE.Mesh&&!Array.isArray(node.material)){
  const clone=node.geometry.clone().applyMatrix4(node.matrixWorld);
  const g=clone.index?clone.toNonIndexed():clone;if(g!==clone)clone.dispose();
  if(!g.getAttribute('normal'))g.computeVertexNormals();
  for(const name of Object.keys(g.attributes))if(name!=='position'&&name!=='normal')g.deleteAttribute(name);
  const list=buckets.get(node.material)??[];list.push({geometry:g,source:node});buckets.set(node.material,list);
 }});
 for(const [mat,list]of buckets){
  const g=mergeGeometries(list.map(item=>item.geometry),false);
  list.forEach(item=>item.geometry.dispose());
  // Never discard visible originals when an optimizer rejects a future geometry.
  if(!g)continue;
  for(const {source}of list){source.removeFromParent();source.geometry.dispose();}
  const m=new THREE.Mesh(g,mat);m.castShadow=mat.name!=='desert-path';m.receiveShadow=true;root.add(m);
 }
}
export function createDesertEnvironment():DesertEnvironment {
 const root=new THREE.Group();root.name='desert-world';
 const rng=seededRandom(72519), sand=new THREE.MeshStandardMaterial({color:0xc69a69,roughness:1,vertexColors:true});
 const daySand=sand.color.clone(),nightSand=new THREE.Color(0x344b64);
 const terrain=new THREE.PlaneGeometry(1700,1700,140,140);terrain.rotateX(-Math.PI/2);
 const pos=terrain.getAttribute('position'), colors=new Float32Array(pos.count*3);const shade=new THREE.Color();
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),d=Math.hypot(x,z);const mask=THREE.MathUtils.smoothstep(d,95,210);const ridge=Math.pow((Math.sin(x*0.018+Math.sin(z*0.015)*2)+1)*0.5,2)*9+Math.sin(z*0.035+x*0.007)*2.6;pos.setY(i,mask*ridge-0.06);shade.setRGB(1-(Math.sin(x*.036+z*.016)+1)*.035,0.90-(Math.sin(x*.036+z*.016)+1)*.035,.77);colors.set([shade.r,shade.g,shade.b],i*3);}
 terrain.setAttribute('color',new THREE.BufferAttribute(colors,3));terrain.computeVertexNormals();
 const ground=new THREE.Mesh(terrain,sand);ground.name='walkable-desert';ground.receiveShadow=true;root.add(ground);
 const skyGeo=new THREE.SphereGeometry(820,40,24);
 const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,toneMapped:false,uniforms:{uNight:{value:0}},vertexShader:'varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform float uNight;varying vec3 vWorld;void main(){vec3 d=normalize(vWorld);float h=max(0.,d.y);vec3 c=mix(vec3(.85,.49,.29),vec3(.22,.24,.34),smoothstep(0.,.70,h));c=mix(c,vec3(.98,.72,.43),exp(-h*13.)*.5);float sun=max(0.,dot(d,normalize(vec3(-.6,.19,-.75))));c+=vec3(.85,.38,.12)*pow(sun,48.)*.38;vec3 night=mix(vec3(.045,.085,.15),vec3(.008,.017,.045),smoothstep(0.,.7,h));night+=vec3(.015,.025,.04)*exp(-h*8.);c=mix(c,night,uNight);gl_FragColor=vec4(c,1.);}`});
 const sky=new THREE.Mesh(skyGeo,skyMat);sky.name='dusk-sky';sky.renderOrder=-10;root.add(sky);
 const sun=new THREE.Mesh(new THREE.CircleGeometry(13,48),new THREE.MeshBasicMaterial({color:0xffd29a,fog:false,toneMapped:false,transparent:true}));sun.position.set(-195,61,-244);sun.lookAt(0,0,0);root.add(sun);
 const staticWorld=new THREE.Group();staticWorld.name='desert-static';root.add(staticWorld);
 const pathMat=new THREE.MeshStandardMaterial({color:0xd7ac78,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 pathMat.name='desert-path';
 const dayPath=pathMat.color.clone(),nightPath=new THREE.Color(0x665c4c);
 // Radial streets and concentric dusty rings: the playa city seen from above.
 for(const r of [17,31.5,49,68,83,98,113]){const road=new THREE.Mesh(new THREE.RingGeometry(r-0.85,r+0.85,160,1,0,TAU*.87),pathMat);road.rotation.x=-Math.PI/2;road.rotation.z=-Math.PI*.37;road.position.y=.018;staticWorld.add(road);}
 for(let i=0;i<14;i++){const a=(-.81+i/13*1.62)*Math.PI,dist=112;const road=new THREE.Mesh(new THREE.PlaneGeometry(1.75,dist),pathMat);road.rotation.x=-Math.PI/2;road.rotation.z=-a;road.position.set(Math.sin(a)*(dist/2+8),.027,Math.cos(a)*(dist/2+8));staticWorld.add(road);}
 // Two long invitation avenues recede toward the camera.
 for(const x of [-8,8]){const p=new THREE.Mesh(new THREE.PlaneGeometry(2,84),pathMat);p.rotation.x=-Math.PI/2;p.position.set(x,.02,66);staticWorld.add(p);}
 const darkStone=stone(0x66503f),lightStone=stone(0xb39979);
 const monument=createDreaminaMonument();root.add(monument);
 const spinningTop=monument.getObjectByName('dreamina-weathered-stone') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
 spinningTop.material.emissive.setHex(0xff8c30);spinningTop.material.emissiveIntensity=0;
 // A restrained additive edge wraps the original stone rather than replacing it.
 const radianceMat=new THREE.ShaderMaterial({
  uniforms:{uIntensity:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`varying float vRim;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vec3 n=normalize(mat3(modelViewMatrix)*normal);vRim=pow(1.-abs(dot(n,normalize(-mv.xyz))),2.);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform float uIntensity;varying float vRim;void main(){gl_FragColor=vec4(1.,.45,.10,(.08+vRim*.65)*uIntensity);}`,
 });
 const radiance=new THREE.Mesh(spinningTop.geometry,radianceMat);radiance.name='festival-monument-radiance';radiance.scale.setScalar(1.003);radiance.visible=false;spinningTop.add(radiance);
 const monumentGlowUniforms={uTime:{value:0},uIntensity:{value:0}};
 const monumentGlow=createDesertFirelight(38,monumentGlowUniforms,.32);monumentGlow.name='festival-monument-ground-glow';monumentGlow.visible=false;root.add(monumentGlow);
 const campMats=[stone(0xc88357),stone(0xcfb594),stone(0x80765a),stone(0xac745b),stone(0xc6a06b)];
 const tentMats=campMats.map(material=>{const copy=material.clone();copy.name='festival-warm-tent';copy.emissive.setHex(0xff9a48);copy.emissiveIntensity=0;return copy;});
 const tentLampPositions:{x:number;y:number;z:number}[]=[];
 const wood=stone(0x4b3528),canvasMat=new THREE.MeshStandardMaterial({color:0xddc6a1,roughness:1,side:THREE.DoubleSide});
 for(let i=0;i<96;i++){
  const ring=80+Math.floor(i/32)*15,angle=(i%32)/31*Math.PI*1.66+Math.PI*.17;
  const x=Math.sin(angle)*ring,z=Math.cos(angle)*ring;const tent=new THREE.Mesh(new THREE.ConeGeometry(2.3+rng()*1.6,2.3+rng()*2.1,4),tentMats[i%5]);tent.position.set(x,tent.geometry.parameters.height/2,z);tent.rotation.y=angle+.5;staticWorld.add(tent);
  tentLampPositions.push({x:x-Math.sin(angle)*1.6,y:1.05,z:z-Math.cos(angle)*1.6});
  if(i%4===0){const pole=cylinder(.045,.045,4.2,wood,x+3.4,2.1,z,5);staticWorld.add(pole);const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.45,.62),canvasMat);flag.position.set(x+4.08,3.7,z);flag.rotation.y=angle;staticWorld.add(flag);}
 }
 // Low dunes around the camp perimeter preserve the broad, uninterrupted horizon.
 for(let i=0;i<38;i++){const a=rng()*TAU,r=170+rng()*170;const dune=new THREE.Mesh(new THREE.SphereGeometry(1,16,8),campMats[1]);dune.scale.set(18+rng()*40,2+rng()*7,10+rng()*25);dune.position.set(Math.sin(a)*r,-1.4,Math.cos(a)*r);dune.rotation.y=rng()*TAU;staticWorld.add(dune);}
 const fires:DesertFire[]=[];const firePositions=CAMPFIRE_POSITIONS;
 firePositions.forEach(([x,z],i)=>{
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.15,.18,5,15),darkStone);ring.rotation.x=Math.PI/2;ring.position.set(x,.16,z);staticWorld.add(ring);
  for(let j=0;j<5;j++){const log=new THREE.Mesh(new THREE.CylinderGeometry(.14,.2,1.65,5),wood);log.rotation.z=Math.PI/2;log.rotation.y=j*Math.PI/5;log.position.set(x,.27+j*.035,z);staticWorld.add(log);}
  const fire=createDesertFire(i+120,2.5,1.6);fire.root.position.set(x,0,z);root.add(fire.root);fires.push(fire);
 });
 // Tiny grounded stones catch the raking light; the central clear playa stays walkable.
 for(let i=0;i<140;i++){const a=rng()*TAU,r=65+rng()*90;const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.12+rng()*.48,0),i%3?lightStone:darkStone);rock.position.set(Math.sin(a)*r,.06,Math.cos(a)*r);rock.scale.y=.45;staticWorld.add(rock);}
 const tentLights=createFestivalNightLights('festival-tent-lights',tentLampPositions,.28);root.add(tentLights.root);
 const roadLampPositions:{x:number;y:number;z:number}[]=[];
 for(const r of [17,31.5,49,68,83,98,113]){
  const count=Math.ceil(TAU*.87*r/9);
  for(let i=0;i<=count;i++){const angle=i/count*TAU*.87-Math.PI*.37;roadLampPositions.push({x:Math.cos(angle)*r,y:.19,z:-Math.sin(angle)*r});}
 }
 for(let i=0;i<14;i++){const angle=(-.81+i/13*1.62)*Math.PI;for(let d=8;d<=120;d+=9)roadLampPositions.push({x:Math.sin(angle)*d,y:.19,z:Math.cos(angle)*d});}
 for(const x of [-8,8])for(let z=24;z<=108;z+=9)roadLampPositions.push({x,y:.19,z});
 const roadLights=createFestivalNightLights('festival-road-light-beads',roadLampPositions,.18);root.add(roadLights.root);
 mergeStatic(staticWorld);
 // Reuse the merged road mesh verbatim: every luminous line is an actual street.
 const road=staticWorld.children.find(node=>node instanceof THREE.Mesh&&node.material===pathMat) as THREE.Mesh;
 const pathGlowMat=new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uIntensity:{value:0},uIgnition:{value:0},uGlowStrength:{value:.30}},
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`varying vec2 vGround;void main(){vGround=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float uTime;uniform float uIntensity;uniform float uIgnition;uniform float uGlowStrength;varying vec2 vGround;
  void main(){float radius=length(vGround);float lit=1.-smoothstep(uIgnition-10.,uIgnition+8.,radius);
   float warmth=.5+.5*sin(radius*.72-uTime*1.25+sin(vGround.x*.16+vGround.y*.12));
   vec3 amber=mix(vec3(1.,.28,.055),vec3(1.,.55,.16),warmth);
   gl_FragColor=vec4(amber,lit*uIntensity*uGlowStrength*(.72+warmth*.28));}`,
 });
 const pathGlow=new THREE.Mesh(road.geometry,pathGlowMat);pathGlow.name='festival-ignited-paths';pathGlow.position.y=.045;pathGlow.visible=false;pathGlow.renderOrder=2;root.add(pathGlow);
 let disposed=false;
 return {root,ground,monument,update(time,ceremony,reducedMotion=false){fires.forEach((fire,i)=>fire.update(time+i*.4,.70+Math.sin(time*2+i)*.1));skyMat.uniforms.uNight.value=ceremony?.night??0;sand.color.copy(daySand).lerp(nightSand,ceremony?.night??0);pathMat.color.copy(dayPath).lerp(nightPath,ceremony?.night??0);sun.material.opacity=1-(ceremony?.night??0);spinningTop.rotation.y=reducedMotion?0:ceremony?.turnRadians??0;
 const intensity=ceremony?.intensity??0;spinningTop.material.emissiveIntensity=intensity*.82;
 tentMats.forEach(material=>{material.emissiveIntensity=intensity*.30;});tentLights.update(intensity);roadLights.update(intensity);
 monumentGlow.visible=intensity>.001;monumentGlowUniforms.uIntensity.value=intensity;monumentGlowUniforms.uTime.value=reducedMotion?22:time;
 radiance.visible=intensity>.001;radianceMat.uniforms.uIntensity.value=intensity;
 pathGlow.visible=intensity>.001;pathGlowMat.uniforms.uIntensity.value=intensity;
 pathGlowMat.uniforms.uTime.value=reducedMotion?22:ceremony?.elapsed??0;
 pathGlowMat.uniforms.uIgnition.value=reducedMotion?145:Math.max(0,(ceremony?.elapsed??0)*22);
 },dispose(){if(disposed)return;disposed=true;fires.forEach(fire=>fire.dispose());const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(node=>{if(node instanceof THREE.Mesh){geos.add(node.geometry);(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>{mats.add(m);for(const v of Object.values(m)){if(v instanceof THREE.Texture)textures.add(v);}});}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();}};
}
