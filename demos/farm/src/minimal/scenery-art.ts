import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {Tile,Point} from './model.ts';
export const CELL=2;
export const worldPoint=(p:Point)=>new THREE.Vector3((p.x-1.5)*CELL,.035,(p.z-1.5)*CELL);
export function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,color:string,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function orb(parent:THREE.Object3D,color:string,x:number,y:number,z:number,sx:number,sy=sx,sz=sx){const m=mesh(parent,new THREE.SphereGeometry(1,18,12),color,x,y,z);m.scale.set(sx,sy,sz);return m;}
export function block(parent:THREE.Object3D,color:string,x:number,y:number,z:number,w:number,h:number,d:number,r=.06){return mesh(parent,new RoundedBoxGeometry(w,h,d,2,r),color,x,y,z);}
const random=(x:number,z:number,n:number)=>{const v=Math.sin(x*71.57+z*19.21+n*13.43)*43758.545;return v-Math.floor(v);};
function leafTree(parent:THREE.Object3D,x:number,z:number,s=1){const g=new THREE.Group();parent.add(g);g.position.set(x,0,z);g.scale.setScalar(s);mesh(g,new THREE.CylinderGeometry(.085,.15,1.15,9),'#A37C55',0,.5,0);const branch=mesh(g,new THREE.CylinderGeometry(.035,.07,.55,7),'#A37C55',.16,.94,0);branch.rotation.z=-.7;orb(g,'#4F8153',0,1.35,0,.65,.66,.6);orb(g,'#6D9B5B',-.3,1.5,.08,.48,.5,.45);orb(g,'#89AC69',.2,1.72,.03,.42,.38,.4);orb(g,'#6D9B5B',.4,1.34,.08,.33,.4,.34);return g;}
function flower(parent:THREE.Object3D,x:number,z:number,color:string){const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);mesh(g,new THREE.CylinderGeometry(.009,.015,.18,4),'#6D9453',0,.09,0);for(let i=0;i<5;i++)orb(g,color,Math.cos(i*Math.PI*.4)*.041,.19,Math.sin(i*Math.PI*.4)*.041,.035,.014,.035);orb(g,'#F1BF55',0,.205,0,.025,.015,.025);}
function grass(parent:THREE.Object3D,x:number,z:number,shade:string){const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);for(let i=0;i<3;i++){const blade=mesh(g,new THREE.ConeGeometry(.022,.15+i*.025,3),shade,(i-1)*.035,.07,0);blade.rotation.z=(i-1)*.24;blade.castShadow=false;}}
/** Neighbor-aware centerlines use identical perpendicular crossings at every shared edge. */
export function creekPaths(tile:Tile,tiles:readonly Tile[]=[]):THREE.Vector2[][]{
 const neighbors=[[0,-1],[1,0],[0,1],[-1,0]].filter(([x,z])=>tiles.length?tiles.some(t=>t.x===tile.x+x&&t.z===tile.z+z&&t.terrain==='creek'):x===0);
 const center=new THREE.Vector2((random(tile.x,tile.z,40)-.5)*.32,(random(tile.x,tile.z,41)-.5)*.32);
 if(!neighbors.length)return [[center,new THREE.Vector2(center.x+.01,center.y+.01)]];
 const result=neighbors.map(([x,z])=>{const end=new THREE.Vector2(x*1.3,z*1.3),control=new THREE.Vector2(x*.7,z*.7);const points:THREE.Vector2[]=[];
  // A straight final segment guarantees the same channel width at both sides of a seam.
  const curve=new THREE.QuadraticBezierCurve(center,control,new THREE.Vector2(x*.75,z*.75));
  for(let i=0;i<=16;i++)points.push(curve.getPoint(i/16));points.push(end);return points;});
 // A two-cell-wide reach is one river, not a ladder of narrow channels around grass holes.
 for(const x of [-1,1])for(const z of [-1,1])if(tiles.some(t=>t.x===tile.x+x&&t.z===tile.z&&t.terrain==='creek')&&tiles.some(t=>t.x===tile.x&&t.z===tile.z+z&&t.terrain==='creek')&&tiles.some(t=>t.x===tile.x+x&&t.z===tile.z+z&&t.terrain==='creek')){
  for(const offset of [0,.22,.44,.66,.88,1.1])result.push([new THREE.Vector2(0,z*offset),new THREE.Vector2(x*1.3,z*offset)]);
 }
 return result;
}
export function creekDistance(x:number,z:number,paths:readonly THREE.Vector2[][]){let result=Infinity;for(const path of paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.y-a.y;const u=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.y)*dz)/(dx*dx+dz*dz),0,1);result=Math.min(result,Math.hypot(x-a.x-u*dx,z-a.y-u*dz));}return result;}
function role(m:THREE.Mesh,name:string){(m.material as THREE.Material).userData.environmentRole=name;return m;}
/** Clip triangles against a distance field, avoiding overlapping ribbons at bends/junctions. */
export function creekSurface(paths:readonly THREE.Vector2[][],radius:number,y:number){
 const vertices:number[]=[],steps=32;
 type Sample={x:number;z:number;d:number};
 const sample=(x:number,z:number):Sample=>({x,z,d:creekDistance(x,z,paths)-radius});
 const add=(triangle:Sample[])=>{const polygon:Sample[]=[];for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3];if(a.d<=0)polygon.push(a);if((a.d<0)!==(b.d<0)){const u=a.d/(a.d-b.d);polygon.push({x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,d:0});}}for(let i=1;i<polygon.length-1;i++)for(const v of [polygon[0],polygon[i+1],polygon[i]])vertices.push(v.x,y,v.z);};
 for(let iz=0;iz<steps;iz++)for(let ix=0;ix<steps;ix++){const x=-1+ix*2/steps,z=-1+iz*2/steps,h=2/steps,a=sample(x,z),b=sample(x+h,z),c=sample(x+h,z+h),d=sample(x,z+h);add([a,b,c]);add([a,c,d]);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}
function stream(parent:THREE.Object3D,tile:Tile,tiles:readonly Tile[]){const paths=creekPaths(tile,tiles);
 role(mesh(parent,creekSurface(paths,.43,.003),'#A5B985'),'bank');
 role(mesh(parent,creekSurface(paths,.34,.006),'#D0C6A0'),'bank');
 const water=role(mesh(parent,creekSurface(paths,.275,.009),'#78B8B3'),'water');water.castShadow=false;const material=water.material as THREE.MeshStandardMaterial;material.roughness=.32;material.metalness=.04;
 // A smaller translucent-looking color pool creates depth, not a road marking.
 const deep=role(mesh(parent,creekSurface(paths,.17,.011),'#68AAA9'),'water');deep.castShadow=false;
 for(let i=0;i<3;i++){const path=paths[i%paths.length],v=path[Math.min(path.length-1,3+i*4)];if(Math.abs(v.x)>.82||Math.abs(v.y)>.82)continue;
  const ripple=role(mesh(parent,new THREE.TorusGeometry(.065+i*.015,.004,3,15,Math.PI*1.25),'#B6DAD0',v.x,.017,v.y),'water');ripple.rotation.x=-Math.PI/2;ripple.rotation.z=i*1.7;ripple.scale.y=.55;ripple.castShadow=false;
 }
 for(let i=0;i<7;i++){const x=random(tile.x,tile.z,70+i*2)*1.8-.9,z=random(tile.x,tile.z,71+i*2)*1.8-.9,d=creekDistance(x,z,paths);if(d<.3||d>.52)continue;const stone=orb(parent,i%2?'#B9BBA2':'#D6CFB5',x,.028,z,.06,.035,.09);stone.rotation.y=i*.9;if(i%2)grass(parent,x+.07,z,'#6D9563');}
}
/** One continuous deep-water sheet. Shore appears only on the OUTER perimeter, never between pond cells. */
function pond(parent:THREE.Object3D,tile:Tile,tiles:readonly Tile[]){
 const joined=(dx:number,dz:number)=>tiles.some(t=>t.x===tile.x+dx&&t.z===tile.z+dz&&t.terrain==='pond');
 const geometry=new THREE.PlaneGeometry(2,2,32,32);geometry.rotateX(-Math.PI/2);
 const positions=geometry.getAttribute('position'),colors:number[]=[],deep=new THREE.Color('#4E9EA9'),shallow=new THREE.Color('#82BFB6'),sand=new THREE.Color('#CEC7A0');
 for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);let edge=2;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!joined(dx,dz))edge=Math.min(edge,dx?1-x*dx:1-z*dz);
  const worldX=tile.x*2+x,worldZ=tile.z*2+z,rim=.08+.025*Math.sin(worldX*5+worldZ*3);
  const c=edge<rim?sand:shallow.clone().lerp(deep,Math.min(1,(edge-rim)/.65));colors.push(c.r,c.g,c.b);
 }
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const surface=role(mesh(parent,geometry,'#FFFFFF',0,.009,0),'water');(surface.material as THREE.MeshStandardMaterial).vertexColors=true;(surface.material as THREE.MeshStandardMaterial).roughness=.28;surface.castShadow=false;
 for(let i=0;i<2;i++){const ripple=role(mesh(parent,new THREE.TorusGeometry(.18+i*.09,.004,3,24,Math.PI*1.3),'#A1D1CA',-.25+i*.5,.018,.16-i*.36),'water');ripple.rotation.x=-Math.PI/2;ripple.rotation.z=i*2+.5;ripple.scale.y=.48;ripple.castShadow=false;}
 return surface;
}
function pasture(parent:THREE.Object3D,tile:Tile){
 const geometry=new THREE.PlaneGeometry(2,2,8,8);geometry.rotateX(-Math.PI/2);const pos=geometry.getAttribute('position'),colors:number[]=[],base=new THREE.Color('#A9C784'),light=new THREE.Color('#B3CE8E');
 for(let i=0;i<pos.count;i++){const x=pos.getX(i)+tile.x*2,z=pos.getZ(i)+tile.z*2;const v=.5+.25*Math.sin(x*1.3+Math.sin(z*.7))+.25*Math.cos(z*1.8+x*.3);const c=base.clone().lerp(light,v);colors.push(c.r,c.g,c.b);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const ground=role(mesh(parent,geometry,'#FFFFFF'),'grass');(ground.material as THREE.MeshStandardMaterial).vertexColors=true;ground.castShadow=false;
 // Quiet corner ticks preserve buildable plots without carving a checkerboard trench.
 if(tile.owned)for(const x of [-1,1])for(const z of [-1,1]){const tick=mesh(parent,new THREE.PlaneGeometry(.11,.012),'#9DBA7A',x*.94,.001,z*.985);tick.rotation.x=-Math.PI/2;tick.castShadow=false;}
 return ground;
}
/** Visible terrain floor only; stones and plants are decoration, not walking platforms. */
export function terrainSurfaceHeight(tile:Tile,localX:number,localZ:number,tiles:readonly Tile[]=[]){
 if(tile.terrain==='pond')return .009;
 if(tile.terrain==='hill'){const q=((localX-.65)/.32)**2+((localZ+.69)/.28)**2;return q<1?Math.max(0,-.075+.15*Math.sqrt(1-q)):0;}
 if(tile.terrain==='creek'){const distance=creekDistance(localX,localZ,creekPaths(tile,tiles));return distance<.17?.011:distance<.275?.009:distance<.34?.006:distance<.43?.003:0;}
 return 0;
}
export function makeTerrain(tile:Tile,tiles:readonly Tile[]=[]){const root=new THREE.Group();root.position.copy(worldPoint(tile));root.position.y=0;root.userData.target={kind:'tile',x:tile.x,z:tile.z};
 const foundation=mesh(root,new THREE.BoxGeometry(2,.24,2),'#91AA70',0,-.122,0);foundation.castShadow=false;const top=tile.terrain==='pond'?pond(root,tile,tiles):pasture(root,tile);
 if(tile.terrain==='creek')stream(root,tile,tiles);
 else if(tile.terrain==='hill'){orb(root,'#A5BD80',.65,-.075,-.69,.32,.15,.28);orb(root,'#C6C8A9',.76,.045,-.74,.09,.075,.12);}
 else if(tile.terrain==='grove'){leafTree(root,-.66,-.68,.75);leafTree(root,.65,-.71,.56);orb(root,'#8AA967',.75,.1,.73,.17,.14,.18);}
 const paths=tile.terrain==='creek'?creekPaths(tile,tiles):null;
 const density=tile.terrain==='pond'?0:tile.owned?6:3;for(let i=0;i<density;i++){const x=random(tile.x,tile.z,i*2+4)*1.72-.86,z=random(tile.x,tile.z,i*2+5)*1.72-.86;if(paths&&creekDistance(x,z,paths)<.45||tile.terrain==='hill'&&x>.35&&z<-.35)continue;if(i===0&&tile.owned&&random(tile.x,tile.z,90)>.35)flower(root,x,z,'#F3E8C6');else grass(root,x,z,i%2?'#7EA267':'#91B372');}
 if(!tile.owned){root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){m.color.lerp(new THREE.Color('#75877C'),.2);m.color.multiplyScalar(.77);}});}
 return {root,hit:top};}
export function makeShop(){const root=new THREE.Group();root.position.copy(worldPoint({x:.5,z:0}));root.position.y=0;root.userData.target={kind:'shop'};
 block(root,'#B39B71',0,.04,0,3.82,.12,1.88,.07);for(let i=0;i<11;i++)block(root,i%2?'#D9BE88':'#E2CD9D',-1.65+i*.33,.117,.05,.315,.06,1.62,.015);
 block(root,'#C49C68',0,.78,-.57,3.35,1.35,.15,.025);for(let i=0;i<10;i++)block(root,'#D5B47A',-1.48+i*.33,.79,-.46,.27,1.2,.04,.008);
 for(const x of [-1.64,1.64]){block(root,'#967449',x,1.08,.55,.12,2.15,.13,.02);block(root,'#B6915B',x,1.04,-.64,.12,2.08,.13,.02);}
 block(root,'#B28A55',0,.57,.68,3.48,.83,.55,.04);block(root,'#E4C891',0,1.02,.67,3.65,.12,.69,.035);
 for(let i=0;i<8;i++){const cloth=block(root,i%2?'#F8EBD0':'#86A780',-1.67+i*.475,2.02,.2,.48,.08,1.9,.02);cloth.rotation.x=-.18;const trim=block(root,i%2?'#F8EBD0':'#86A780',-1.67+i*.475,1.8,1.13,.48,.26,.07,.07);trim.castShadow=true;}
 const roof=block(root,'#C7AA75',0,2.18,-.67,3.9,.12,.26,.03);roof.rotation.x=.15;
 // A real painted shop sign, not a screen-space placeholder.
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='#F3E4BF';ctx.fillRect(0,0,768,192);ctx.strokeStyle='#AA8752';ctx.lineWidth=8;ctx.strokeRect(9,9,750,174);ctx.fillStyle='#496443';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 75px "PingFang SC","Noto Sans CJK SC",sans-serif';ctx.fillText('蛋蛋小铺',384,94);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.15,.54),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(0,1.48,-.365);root.add(sign);}
 for(let i=0;i<5;i++){const nest=new THREE.Group();nest.position.set(-1.25+i*.61,1.1,.7);root.add(nest);mesh(nest,new THREE.TorusGeometry(.17,.035,6,16),'#B78D56',0,0,0).rotation.x=Math.PI/2;orb(nest,i%2?'#F9E8C8':'#EFE6D4',0,.16,0,.11,.16,.11);}
 block(root,'#B28855',1.35,.3,-.08,.45,.47,.55,.025);for(let i=0;i<3;i++)orb(root,'#D5A66A',1.3+(i%2)*.12,.57,-.1+(i-1)*.13,.09,.1,.08);
 for(const side of [-1,1]){mesh(root,new THREE.CylinderGeometry(.24,.17,.34,12),'#BA805B',side*1.93,.18,.58);orb(root,'#7F9C59',side*1.93,.53,.58,.27,.29,.26);flower(root,side*1.93,.58,'#F4D27D');}
 return root;}
export function makeEssentials(){const root=new THREE.Group();const p=worldPoint({x:0,z:1});const bowl=new THREE.Group();bowl.position.set(p.x-.5,0,p.z-.45);root.add(bowl);mesh(bowl,new THREE.CylinderGeometry(.26,.19,.16,20),'#D7AF77',0,.09,0);mesh(bowl,new THREE.CylinderGeometry(.225,.225,.012,20),'#8EC3C8',0,.177,0);const q=worldPoint({x:0,z:2});block(root,'#D9BF80',q.x-.45,.04,q.z-.35,.76,.07,.58,.15);return root;}
export function makeBeyond(){const root=new THREE.Group();block(root,'#8B9F77',0,-.4,0,100,.4,100,.2);for(let i=0;i<20;i++){const a=i/20*Math.PI*2,r=15+(i%3);leafTree(root,Math.sin(a)*r,Math.cos(a)*r,1.2+(i%4)*.18);}return root;}

/** Batch immutable scenery by visible material, preserving the parent transform and pick metadata. */
export function batchScenery(root:THREE.Group){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();
 const groups=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];shadow:boolean}>();
 const originals:THREE.Mesh[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||Array.isArray(o.material))return;const m=o.material as THREE.MeshStandardMaterial;const key=[m.type,m.color?.getHex(),m.roughness,m.metalness,m.side,m.transparent,m.opacity,m.map?.uuid??'',m.vertexColors,m.userData.environmentRole??''].join('|');let group=groups.get(key);if(!group){group={material:m.clone(),geometries:[],shadow:false};groups.set(key,group);}const geometry=o.geometry.clone();geometry.applyMatrix4(inverse.clone().multiply(o.matrixWorld));group.geometries.push(geometry.index?geometry.toNonIndexed():geometry);if(geometry.index)geometry.dispose();group.shadow ||= o.castShadow;originals.push(o);});
 root.clear();for(const group of groups.values()){const geometry=mergeGeometries(group.geometries,false);for(const g of group.geometries)g.dispose();if(!geometry){group.material.dispose();continue;}const m=new THREE.Mesh(geometry,group.material);m.castShadow=group.shadow;m.receiveShadow=true;root.add(m);}
 const disposed=new Set<THREE.Material>();for(const o of originals){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(!disposed.has(m)){m.dispose();disposed.add(m);}}
 return root;
}
