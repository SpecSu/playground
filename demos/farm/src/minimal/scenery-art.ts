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
function stream(parent:THREE.Object3D,tile:Tile){const s=new THREE.Shape(),width=.34;const center=(z:number)=>.48+Math.sin((tile.z*2+z)*1.55)*.12;for(let i=0;i<=16;i++){const z=-1+i/8,x=center(z)-width;if(i)s.lineTo(x,z);else s.moveTo(x,z);}for(let i=16;i>=0;i--){const z=-1+i/8;s.lineTo(center(z)+width,z);}s.closePath();const water=mesh(parent,new THREE.ShapeGeometry(s,24),'#86C0BF',0,.026,0);water.rotation.x=Math.PI/2;(water.material as THREE.MeshStandardMaterial).side=THREE.DoubleSide;(water.material as THREE.MeshStandardMaterial).roughness=.2;water.castShadow=false;
 for(let i=0;i<4;i++){const z=-.8+i*.49,x=center(z);const line=mesh(parent,new THREE.CapsuleGeometry(.009,.16,2,5),'#D2E8D4',x,.041,z);line.rotation.z=Math.PI/2;line.castShadow=false;}
 for(let i=0;i<4;i++){const z=-.8+i*.52,x=center(z)-(i%2?.43:-.43);orb(parent,i%2?'#C2C5A7':'#D3D0B7',x,.06,z,.08,.055,.13);if(i%2)grass(parent,x-.1,z,'#71976D');}
}
export function makeTerrain(tile:Tile){const root=new THREE.Group();root.position.copy(worldPoint(tile));root.position.y=0;root.userData.target={kind:'tile',x:tile.x,z:tile.z};const tone=tile.owned?(random(tile.x,tile.z,1)>.5?'#B5CA82':'#BCCC8A'):'#A2AD89';const top=block(root,tone,0,-.15,0,1.995,.3,1.995,.055);top.castShadow=false;
 if(tile.terrain==='creek')stream(root,tile);
 else if(tile.terrain==='hill'){orb(root,'#ACBD78',.42,-.05,-.46,.6,.4,.53);orb(root,'#B8C68B',.64,.02,-.63,.25,.24,.28);orb(root,'#D5CEAB',.73,.08,-.69,.13,.19,.13);}
 else if(tile.terrain==='grove'){leafTree(root,-.63,-.64,.75);leafTree(root,.62,-.7,.56);orb(root,'#8AA967',.7,.12,.67,.25,.2,.25);}
 const density=tile.owned?7:2;for(let i=0;i<density;i++){const x=random(tile.x,tile.z,i*2+4)*1.65-.82,z=random(tile.x,tile.z,i*2+5)*1.65-.82;if(tile.terrain==='creek'&&x>.02||tile.terrain==='hill'&&x>0&&z<0)continue;if(i<2&&tile.owned)flower(root,x,z,i%2?'#F3E8C6':'#E8BE9B');else grass(root,x,z,i%2?'#8FAB61':'#A1BB6E');}
 if(!tile.owned){root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){m.color.lerp(new THREE.Color('#75877C'),.29);m.color.multiplyScalar(.78);}});}
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
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||Array.isArray(o.material))return;const m=o.material as THREE.MeshStandardMaterial;const key=[m.type,m.color?.getHex(),m.roughness,m.metalness,m.side,m.transparent,m.opacity,m.map?.uuid??'',m.vertexColors].join('|');let group=groups.get(key);if(!group){group={material:m.clone(),geometries:[],shadow:false};groups.set(key,group);}const geometry=o.geometry.clone();geometry.applyMatrix4(inverse.clone().multiply(o.matrixWorld));group.geometries.push(geometry.index?geometry.toNonIndexed():geometry);if(geometry.index)geometry.dispose();group.shadow ||= o.castShadow;originals.push(o);});
 root.clear();for(const group of groups.values()){const geometry=mergeGeometries(group.geometries,false);for(const g of group.geometries)g.dispose();if(!geometry){group.material.dispose();continue;}const m=new THREE.Mesh(geometry,group.material);m.castShadow=group.shadow;m.receiveShadow=true;root.add(m);}
 const disposed=new Set<THREE.Material>();for(const o of originals){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(!disposed.has(m)){m.dispose();disposed.add(m);}}
 return root;
}
