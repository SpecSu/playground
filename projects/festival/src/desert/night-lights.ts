import * as THREE from 'three';

/** Two shared draws per light family; no per-lamp dynamic light or shadow map. */
export function createFestivalNightLights(name: string, positions: readonly {x:number;y:number;z:number}[], radius: number) {
 const root = new THREE.Group(); root.name = name; root.visible = false;
 const coreMaterial = new THREE.MeshBasicMaterial({color:0xffbe75,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
 const cores = new THREE.InstancedMesh(new THREE.SphereGeometry(radius,6,4),coreMaterial,positions.length); cores.name=`${name}-cores`;
 const haloMaterial = new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uIntensity:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'uniform float uIntensity;varying vec2 vUv;void main(){float glow=pow(max(0.,1.-length(vUv-.5)*2.),2.);gl_FragColor=vec4(1.,.55,.24,glow*uIntensity*.32);}'});
 const halos = new THREE.InstancedMesh(new THREE.CircleGeometry(radius*8,16),haloMaterial,positions.length);halos.name=`${name}-halos`;halos.renderOrder=3;
 const dummy=new THREE.Object3D();
 positions.forEach((point,index)=>{dummy.position.set(point.x,point.y,point.z);dummy.rotation.set(0,0,0);dummy.updateMatrix();cores.setMatrixAt(index,dummy.matrix);dummy.position.y=.085;dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();halos.setMatrixAt(index,dummy.matrix);});
 cores.instanceMatrix.needsUpdate=true;halos.instanceMatrix.needsUpdate=true;root.add(cores,halos);
 return {root,update(intensity:number){root.visible=intensity>.001;coreMaterial.opacity=intensity*.86;haloMaterial.uniforms.uIntensity.value=intensity;}};
}
