/** Art-owned quiet graphic sea and a contact wash around actual exposed grid edges. */
import * as THREE from 'three';
import {aquariumOutline} from './aquarium.js';
import {SHARED_CELL_SIZE,SEA_SURFACE_Y} from './physical-contract.js';
const vertex=`varying vec2 vWorld;varying vec2 vUv;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xz;vUv=uv;gl_Position=projectionMatrix*viewMatrix*w;}`;
export function createOceanArt({cells=[],cellSize=SHARED_CELL_SIZE}={}){
 const root=new THREE.Group();root.name='Art_QuietSea';
 const material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uBase:{value:new THREE.Color('#72A8AA')},uLight:{value:new THREE.Color('#9ABEB8')}},vertexShader:vertex,fragmentShader:`
 varying vec2 vWorld;varying vec2 vUv;uniform float uTime;uniform vec3 uBase;uniform vec3 uLight;
 void main(){
 float phase=vWorld.x*1.1+vWorld.y*.74+sin(vWorld.y*.43)*.46-uTime*.11;
 float crest=pow(.5+.5*sin(phase),18.);
 float fade=.42+.58*(.5+.5*sin(vWorld.y*.47-vWorld.x*.22+1.8));
 vec3 color=mix(uBase,uLight,crest*fade*.24 + (.5+.5*sin(vWorld.x*.19-vWorld.y*.24+1.4))*.035);
 gl_FragColor=vec4(color,1.);
 #include <colorspace_fragment>
 }`,toneMapped:false});
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(400,400),material);sea.rotation.x=-Math.PI/2;sea.position.y=SEA_SURFACE_Y;sea.name='LowFrequencySea';root.add(sea);
 const shoreMaterial=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uLight:{value:new THREE.Color('#BED8C8')},uContact:{value:new THREE.Color('#4F8586')}},vertexShader:vertex,fragmentShader:`
 varying vec2 vWorld;varying vec2 vUv;uniform float uTime;uniform vec3 uLight;uniform vec3 uContact;
 void main(){
 float outward=vUv.y;float contact=1.-smoothstep(0.,.13,outward);
 float breath=.96+.04*sin(uTime*.7+vWorld.x*.35+vWorld.y*.28);
 float alpha=(.29+.07*contact)*pow(1.-outward,1.7)*breath;
 vec3 color=mix(uLight,uContact,contact*.75);
 gl_FragColor=vec4(color,alpha);
 #include <colorspace_fragment>
 }`,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 let shore=null,signature='';
 function setLand(next){
  const sig=JSON.stringify(next.map(c=>[c.x,c.z]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]));if(sig===signature)return;signature=sig;
  if(shore){root.remove(shore);shore.geometry.dispose();shore=null;}if(!next.length)return;
  const inner=aquariumOutline(next,cellSize,0),outer=aquariumOutline(next,cellSize,-.46),positions=[],uv=[],indices=[];
  for(let k=0;k<inner.length;k++){
   const a=inner[k].points,b=outer[k].points;
   for(let i=0;i<a.length;i++){const j=(i+1)%a.length,n=positions.length/3;
    for(const p of[a[i],a[j],b[j],b[i]])positions.push(p[0],SEA_SURFACE_Y+.004,p[1]);
    uv.push(0,0,1,0,1,1,0,1);indices.push(n,n+1,n+2,n,n+2,n+3);
   }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  shore=new THREE.Mesh(g,shoreMaterial);shore.name='ExposedEdgesOnlyContactWash';shore.renderOrder=1;root.add(shore);
 }
 setLand(cells);
 return {root,surfaceY:SEA_SURFACE_Y,setLand,update(seconds,reducedMotion=false){material.uniforms.uTime.value=reducedMotion?0:seconds;shoreMaterial.uniforms.uTime.value=reducedMotion?0:seconds;},dispose(){sea.geometry.dispose();shore?.geometry.dispose();material.dispose();shoreMaterial.dispose();}};
}
