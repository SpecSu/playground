import * as THREE from 'three';
import type {Tile} from './model.ts';
import {creekPaths,creekDistance} from './scenery-art.ts';
import {smooth,createTerrainField,sampleGround} from './terrain-field.ts';
import {groundColor} from './terrain-ground.ts';
import {createPondWaterFootprint,samplePondWaterFootprint,waterEdgeConnection} from './pond-water-footprint.ts';
export {waterEdgeConnection} from './pond-water-footprint.ts';
const dirs=[[1,0],[-1,0],[0,1],[0,-1]] as const;
const shallow=new THREE.Color('#78B8B3'),deep=new THREE.Color('#4E9EA9'),sand=new THREE.Color('#CEC7A0');
export function createWaterField(tiles:readonly Tile[]){
 const footprint=createPondWaterFootprint(tiles),paths=new Map(tiles.filter(t=>t.terrain==='creek').map(t=>[`${t.x},${t.z}`,creekPaths(t,tiles,true)]));
 return {...footprint,paths,ground:createTerrainField(tiles)};
}
export type WaterField=ReturnType<typeof createWaterField>;
/** Cached field; tileHint permits comparing the exact same edge from both sides. */
export function sampleWater(field:WaterField,x:number,z:number,tileHint?:Tile){
 const t=tileHint??field.lookup.get(`${Math.round(x/2+1.5)},${Math.round(z/2+1.5)}`);
 if(!t||t.terrain!=='creek'&&t.terrain!=='pond')return {coverage:0,height:0,depth:0,distance:1,color:[sand.r,sand.g,sand.b]};
 const lx=x-(t.x-1.5)*2,lz=z-(t.z-1.5)*2;let distance=1,depth=0,height=.009;
 if(t.terrain==='creek'){const d=creekDistance(lx,lz,field.paths.get(`${t.x},${t.z}`)!);distance=d-.275;depth=Math.max(0,1-d/.275)*.65;height=d<.17?.011:.009;
  // Continuous shallow shoulder, not a second overlapping deep-water ribbon.
  height=.009+.002*smooth((.21-d)/.08);
 }else({distance,depth}=samplePondWaterFootprint(field,x,z,t));
 if(t.terrain==='creek')for(const [dx,dz]of dirs){const n=field.lookup.get(`${t.x+dx},${t.z+dz}`);if(!n||!waterEdgeConnection(t,n))continue;
  const inset=1-(dx?lx*dx:lz*dz),cross=Math.abs(dx?lz:lx),ease=smooth((.6-inset)/.6);if(!ease)continue;
  const mouthDistance=cross-.36;
  distance=distance*(1-ease)+mouthDistance*ease;depth=depth*(1-ease)+Math.max(0,1-cross/.36)*.5*ease;height=height*(1-ease)+.009*ease;
 }
 const ownership=.77+.23*sampleGround(field.ground,x,z).owned,coverage=distance<=0?1:0,c=shallow.clone().lerp(deep,depth).multiplyScalar(ownership);
 return {coverage,height,depth,distance,color:[c.r,c.g,c.b]};
}
/** Single clipped surface per layer: no overlapping water at T/L junctions. */
export function createTerrainWater(tile:Tile,field:WaterField){
 const root=new THREE.Group();if(tile.terrain!=='creek'&&tile.terrain!=='pond')return root;
 const cx=(tile.x-1.5)*2,cz=(tile.z-1.5)*2;
 // Shared grid vertices occur in many triangles and both layers; evaluate pure fields once per point.
 const samples=new Map<string,ReturnType<typeof sampleWater>>(),bankColors=new Map<string,number[]>();
 const waterAt=(x:number,z:number)=>{const key=`${x},${z}`;let value=samples.get(key);if(!value){value=sampleWater(field,cx+x,cz+z,tile);samples.set(key,value);}return value;};
 const layer=(bank:boolean)=>{
  const vertices:number[]=[],colors:number[]=[],steps=32;
  type P={x:number;z:number;d:number};const sample=(x:number,z:number):P=>({x,z,d:tile.terrain==='pond'&&bank?-1:waterAt(x,z).distance-(bank?.12:0)});
  const triangle=(points:P[])=>{const polygon:P[]=[];for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3];if(a.d<=0)polygon.push(a);if((a.d<0)!==(b.d<0)){const u=a.d/(a.d-b.d);polygon.push({x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,d:0});}}
   for(let i=1;i<polygon.length-1;i++)for(const p of [polygon[0],polygon[i+1],polygon[i]]){const s=waterAt(p.x,p.z);vertices.push(p.x,bank?.003:s.height,p.z);
    if(bank){const key=`${p.x},${p.z}`;let shade=bankColors.get(key);if(!shade){let blend=smooth(s.distance/(tile.terrain==='pond'?.08:.12));for(const [dx,dz]of dirs){const n=field.lookup.get(`${tile.x+dx},${tile.z+dz}`);if(!n||!waterEdgeConnection(tile,n))continue;const inset=1-(dx?p.x*dx:p.z*dz),cross=Math.abs(dx?p.z:p.x),ease=smooth((.2-inset)/.2);blend=blend*(1-ease)+smooth((cross-.36)/.12)*ease;}
     const grass=blend?groundColor(field.ground,cx+p.x,cz+p.z).rgb:[0,0,0],ownership=.77+.23*sampleGround(field.ground,cx+p.x,cz+p.z).owned;shade=[sand.r*ownership*(1-blend)+grass[0]*blend,sand.g*ownership*(1-blend)+grass[1]*blend,sand.b*ownership*(1-blend)+grass[2]*blend];bankColors.set(key,shade);}colors.push(...shade);
    }else colors.push(...s.color);}
  };
  for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){const x=-1+i/16,z=-1+j/16,a=sample(x,z),b=sample(x+1/16,z),c=sample(x+1/16,z+1/16),d=sample(x,z+1/16);triangle([a,b,c]);triangle([a,c,d]);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:bank?.9:.32,metalness:bank?0:.04});material.userData.environmentRole=bank?'bank':'water';const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;root.add(mesh);
 };
 layer(true);layer(false);return root;
}
/** Visual-only preview correction; bowl elevation and persistent/domain state are untouched. */
export function waterContactHeight(field:WaterField,x:number,z:number,fallback:number,source:'creek'|'pond'|'bowl'){
 if(source==='bowl')return fallback;const sample=sampleWater(field,x,z);return sample.coverage?sample.height:fallback;
}
