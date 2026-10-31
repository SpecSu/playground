import {TERRAIN_APPEARANCE_COLORS,tileAppearance} from './terrain-appearance.ts';
import * as THREE from 'three';
import {resolveTerrainMode} from './terrain-renderer-lifecycle.ts';
import type {Tile,Terrain} from './model.ts';
import {createTerrainField,sampleGround,TERRAIN_TYPES,type TerrainField} from './terrain-field.ts';
const palette:Record<Terrain,THREE.Color>={meadow:new THREE.Color('#98B470'),grove:new THREE.Color('#7E8F5C'),hill:new THREE.Color('#ADA777'),creek:new THREE.Color('#91A878'),pond:new THREE.Color('#A9AA80'),desert:new THREE.Color('#D6B77C'),glacier:new THREE.Color('#BED9DE')};
const appearancePalette=Object.fromEntries(Object.entries(TERRAIN_APPEARANCE_COLORS).map(([key,color])=>[key,new THREE.Color(color)])) as Record<keyof typeof TERRAIN_APPEARANCE_COLORS,THREE.Color>;
const soil=new THREE.Color('#95805C');
/** Continuous multi-scale procedural detail; shading only, never a contact height. */
function noise(x:number,z:number){
 const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
 const hash=(a:number,b:number)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295*2-1;};
 const a=hash(ix,iz)*(1-sx)+hash(ix+1,iz)*sx,b=hash(ix,iz+1)*(1-sx)+hash(ix+1,iz+1)*sx;return a*(1-sz)+b*sz;
}
function detail(x:number,z:number){return .48*noise(x*.7,z*.7)+.30*noise(x*2.8+31,z*2.8-17)+.16*noise(x*11.3-41,z*11.3+23);}
function microHeight(x:number,z:number){return .0023*noise(x*7.3,z*7.3)+.0008*noise(x*19.1+13,z*19.1-21);}
/** Surface-only crater lighting: does not alter geometry, contact height or normals. */
function lunarDetail(x:number,z:number){
 const gx=Math.floor(x/2.6),gz=Math.floor(z/2.6);let shade=0;
 for(let i=gx-1;i<=gx+1;i++)for(let j=gz-1;j<=gz+1;j++){
  const seed=(Math.sin(i*127.1+j*311.7)*43758.5453)%1,offset=Math.abs(seed),cx=(i+.2+offset*.6)*2.6,cz=(j+.3+Math.abs(Math.sin(i*19+j*71))*.4)*2.6,radius=.36+offset*.45,dx=x-cx,dz=z-cz,r=Math.hypot(dx,dz)/radius;
  shade+=Math.exp(-(((r-1)/.13)**2))*(.10+.05*(dx-dz)/radius)-.08*Math.exp(-((r/.72)**4));
 }
 return shade;
}
export function groundColor(field:TerrainField,x:number,z:number){
 const {weights,appearances,owned}=sampleGround(field,x,z),d=detail(x,z);const rgb=[0,0,0];
 const litter=Math.max(0,d-.08)*(.23+weights.grove*.5+weights.hill*.3)*(1-weights.glacier),shade=(.96+d*.12)*(.77+.23*owned);
 for(const type of TERRAIN_TYPES){const c=palette[type],w=weights[type];rgb[0]+=c.r*w;rgb[1]+=c.g*w;rgb[2]+=c.b*w;}
 const ripple=1+weights.desert*.035*Math.sin(x*9+Math.sin(z*1.7)*2),ice=1+weights.glacier*.025*Math.cos(x*5-z*4);for(let i=0;i<3;i++)rgb[i]*=ripple*ice;
 const s=[soil.r,soil.g,soil.b];for(let i=0;i<3;i++)rgb[i]=(rgb[i]*(1-litter)+s[i]*litter)*shade;
 let roughness=Math.max(.4,Math.min(.98,.87+d*.09+weights.grove*.03-weights.glacier*.28+weights.desert*.03));
 if(appearances.natural<1){
  for(let i=0;i<3;i++)rgb[i]*=appearances.natural;roughness*=appearances.natural;
  for(const style of ['lunar','slate','rose'] as const){const w=appearances[style];if(!w)continue;const c=appearancePalette[style],variation=style==='lunar'?lunarDetail(x,z):style==='slate'?.025*Math.sin(x*7+z*4):.02*Math.sin(x*9+Math.sin(z*2));const lighting=(.96+d*.10+variation)*(.77+.23*owned);rgb[0]+=c.r*w*lighting;rgb[1]+=c.g*w*lighting;rgb[2]+=c.b*w*lighting;roughness+=w*(style==='slate'?.88:.95);}
 }
 return {rgb,roughness};
}
export function groundAppearance(field:TerrainField,x:number,z:number){
 const appearance=groundColor(field,x,z);
 const e=.006,dx=(microHeight(x+e,z)-microHeight(x-e,z))/(2*e),dz=(microHeight(x,z+e)-microHeight(x,z-e))/(2*e),length=Math.hypot(dx,dz,1);
 return {rgb:appearance.rgb,roughness:appearance.roughness,normal:[-dx/length,-dz/length,1/length]};
}
export function createTerrainGround(tiles:readonly Tile[]){
 let field=createTerrainField(tiles);const minX=(field.minX-1.5)*2-1,minZ=(field.minZ-1.5)*2-1,width=(field.maxX-field.minX+1)*2,depth=(field.maxZ-field.minZ+1)*2;
 const positions:number[]=[],normals:number[]=[],uv:number[]=[],indices:number[]=[],vertices=new Map<string,number>();
 // Deduplicate edge/corner vertices. Missing cells do not acquire ground geometry.
 for(const tile of field.tiles){const baseX=tile.x*16,baseZ=tile.z*16;for(let j=0;j<16;j++)for(let i=0;i<16;i++){
  const ids=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([a,b])=>{const gx=baseX+a,gz=baseZ+b,key=`${gx},${gz}`;let id=vertices.get(key);if(id===undefined){id=positions.length/3;vertices.set(key,id);const x=gx/8-4,z=gz/8-4;positions.push(x,0,z);normals.push(0,1,0);uv.push((x-minX)/width,(z-minZ)/depth);}return id;});indices.push(ids[0],ids[2],ids[1],ids[0],ids[3],ids[2]);
 }}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
 const size=512,albedo=new Uint8Array(size*size*4),roughness=new Uint8Array(albedo.length),normal=new Uint8Array(albedo.length),color=new THREE.Color();
 const paint=(x0:number,z0:number,x1:number,z1:number,withNormal:boolean)=>{
  for(let j=z0;j<z1;j++)for(let i=x0;i<x1;i++){
   const x=minX+(i+.5)/size*width,z=minZ+(j+.5)/size*depth,v=withNormal?groundAppearance(field,x,z):groundColor(field,x,z),k=(j*size+i)*4;color.setRGB(v.rgb[0],v.rgb[1],v.rgb[2]).convertLinearToSRGB();
   albedo.set([Math.round(color.r*255),Math.round(color.g*255),Math.round(color.b*255),255],k);roughness.set([255,Math.round(v.roughness*255),255,255],k);
   if('normal' in v)normal.set([...(v.normal as number[]).map(n=>Math.round((n*.5+.5)*255)),255],k);
  }
 };
 paint(0,0,size,size,true);
 const texture=(data:Uint8Array,colorSpace:THREE.ColorSpace=THREE.NoColorSpace)=>{const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);t.colorSpace=colorSpace;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;};
 const map=texture(albedo,THREE.SRGBColorSpace),roughnessMap=texture(roughness),normalMap=texture(normal),material=new THREE.MeshStandardMaterial({map,roughnessMap,normalMap,roughness:1,metalness:0});material.userData.environmentRole='grass';
 const mesh=new THREE.Mesh(geometry,material);mesh.name='continuous-ground-preview';mesh.receiveShadow=true;const root=new THREE.Group();root.name='terrain-ground-preview';root.add(mesh);let disposed=false;
 // Three uploads a full image initially. Dirty ranges are safe only after that first upload.
 const uploaded=new Set<THREE.Texture>();for(const t of [map,roughnessMap])t.onUpdate=()=>{uploaded.add(t);};
 const dirtyUpload=(t:THREE.DataTexture,x0:number,z0:number,x1:number,z1:number)=>{
  if(uploaded.has(t)){
   const rows=new Map<number,{start:number;end:number}>();for(const r of t.updateRanges){const row=Math.floor(r.start/(size*4));rows.set(row,{start:r.start,end:r.start+r.count});}
   for(let j=z0;j<z1;j++){const start=(j*size+x0)*4,end=(j*size+x1)*4,old=rows.get(j);rows.set(j,{start:Math.min(start,old?.start??start),end:Math.max(end,old?.end??end)});}
   t.clearUpdateRanges();for(const r of rows.values())t.addUpdateRange(r.start,r.end-r.start);
  }
  t.needsUpdate=true;
 };
 return {root,get field(){return field;},resetUploads(){
  if(disposed)return;uploaded.clear();for(const t of [map,roughnessMap,normalMap]){t.clearUpdateRanges();t.needsUpdate=true;}
 },update(nextTiles:readonly Tile[]):number|null{
  if(disposed)return null;const next=createTerrainField(nextTiles);
  if(next.tiles.length!==field.tiles.length||next.tiles.some((t,i)=>t.x!==field.tiles[i].x||t.z!==field.tiles[i].z))return null;
  const dense=next.lookup.size===(next.maxX-next.minX+1)*(next.maxZ-next.minZ+1);
  const changed=next.tiles.filter((t,i)=>t.terrain!==field.tiles[i].terrain||t.owned!==field.tiles[i].owned||tileAppearance(t)!==tileAppearance(field.tiles[i]));field=next;if(!changed.length)return 0;
  // Dense-grid support is .30 plus .06 warp; .40 includes rounding margin.
  // Sparse nearest-tile hole extension is nonlocal: repaint all color/data bytes there.
  const x0=dense?Math.max(0,Math.floor((Math.min(...changed.map(t=>(t.x-1.5)*2))-1.4-minX)/width*size)):0,x1=dense?Math.min(size,Math.ceil((Math.max(...changed.map(t=>(t.x-1.5)*2))+1.4-minX)/width*size)):size;
  const z0=dense?Math.max(0,Math.floor((Math.min(...changed.map(t=>(t.z-1.5)*2))-1.4-minZ)/depth*size)):0,z1=dense?Math.min(size,Math.ceil((Math.max(...changed.map(t=>(t.z-1.5)*2))+1.4-minZ)/depth*size)):size;
  paint(x0,z0,x1,z1,false);dirtyUpload(map,x0,z0,x1,z1);dirtyUpload(roughnessMap,x0,z0,x1,z1);return (x1-x0)*(z1-z0);
 },dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.clear();geometry.dispose();material.dispose();map.dispose();roughnessMap.dispose();normalMap.dispose();}};
}
export function terrainPreviewEnabled(search:string){return resolveTerrainMode(search)==='continuous';}
