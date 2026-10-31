import * as THREE from 'three';
import {isWalkable,type Layout,type GridPoint} from './layout.ts';
import {gridToWorld} from './estate-scene.ts';
import type {WorkshopState,WorkshopDraft,WorkshopPattern,WorkshopItem,WorkshopAsset} from './workshop.ts';
import {SHIELD_ANCHORS,type FoldingShieldState} from './tactical-shield.ts';
import type {GuardianKind} from './threat.ts';
export type WorkshopSceneState=Pick<WorkshopState,'equipment'|'placements'|'tacticalAnchor'>&{items:Pick<WorkshopItem,'id'|'recipe'|'assetId'|'assetVersion'|'destroyed'>[];assets:Pick<WorkshopAsset,'id'|'version'|'pattern'>[]};
type VisualItem={id:string;recipe:WorkshopItem['recipe'];pattern:WorkshopPattern;position?:GridPoint};
function clear(root:THREE.Object3D,detach=true){root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});if(detach)root.removeFromParent();root.clear();}
function solid(root:THREE.Object3D,g:THREE.BufferGeometry,color:string,x=0,y=0,z=0){const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.9}));m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;}
/** Crop vector triangles on the CPU, so motifs never leak outside their fabric/board. */
function patternGeometry(p:WorkshopPattern,w:number,h:number){
 const shape=new THREE.Shape();
 if(p.motif==='star'){for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.19:.43;const x=.5+Math.cos(a)*r,y=.5+Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();}
 else if(p.motif==='leaf'){shape.moveTo(.15,.12);shape.bezierCurveTo(.05,.8,.55,.98,.85,.85);shape.bezierCurveTo(.94,.45,.65,.08,.15,.12);}
 else {shape.moveTo(.16,.34);shape.lineTo(.16,.7);shape.quadraticCurveTo(.43,.87,.67,.69);shape.lineTo(.8,.72);shape.quadraticCurveTo(.99,.53,.8,.38);shape.lineTo(.67,.39);shape.lineTo(.65,.14);shape.lineTo(.55,.14);shape.lineTo(.55,.31);shape.lineTo(.3,.31);shape.lineTo(.3,.14);shape.lineTo(.2,.14);shape.closePath();}
 const source=new THREE.ShapeGeometry(shape),a=source.attributes.position,idx=source.index,vertices:number[]=[],rad=p.rotation*Math.PI/180;
 const transform=(i:number)=>{const x=(a.getX(i)-.5)*p.scale,y=(a.getY(i)-.5)*p.scale;return {x:((x*Math.cos(rad)-y*Math.sin(rad)+.5-p.crop.x)/p.crop.width-.5)*w,y:((x*Math.sin(rad)+y*Math.cos(rad)+.5-p.crop.y)/p.crop.height-.5)*h};};
 for(let i=0;i<(idx?.count??a.count);i+=3){let poly=[0,1,2].map(n=>transform(idx?idx.getX(i+n):i+n));for(const [axis,bound,sign] of [['x',-w/2,1],['x',w/2,-1],['y',-h/2,1],['y',h/2,-1]] as const){const result:typeof poly=[];for(let j=0;j<poly.length;j++){const u=poly[j],v=poly[(j+1)%poly.length],inside=(q:typeof u)=>sign*(q[axis]-bound)>=0;if(inside(u))result.push(u);if(inside(u)!==inside(v)){const t=(bound-u[axis])/(v[axis]-u[axis]);result.push({x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t});}}poly=result;}for(let j=1;j<poly.length-1;j++)for(const q of [poly[0],poly[j],poly[j+1]])vertices.push(q.x,q.y,.012);}
 source.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}
export class WorkshopScene{
 readonly root=new THREE.Group();private cape=new THREE.Group();private saved:WorkshopSceneState|undefined;private layout:Layout|undefined;private guardian:THREE.Object3D|undefined;private kind:GuardianKind|null=null;private draft:WorkshopDraft|null=null;private previewPosition:GridPoint|undefined;private key='';private shieldKey='';private shields=new THREE.Group();
 constructor(scene:THREE.Object3D){this.root.name='workshop-world';this.shields.name='workshop-shield';scene.add(this.root,this.shields);}
 sync(state:WorkshopSceneState|undefined,layout:Layout,guardian:THREE.Object3D,kind:GuardianKind|null){this.saved=state;this.layout=layout;this.guardian=guardian;this.kind=kind;this.render();}
 preview(draft:WorkshopDraft|null,position?:GridPoint){this.previewPosition=position?{...position}:undefined;this.draft=draft?structuredClone(draft):null;this.key='';this.render();}
 private render(){if(!this.layout||!this.guardian)return;const key=JSON.stringify([this.saved,this.draft,this.previewPosition,this.kind,this.layout.version]);if(key===this.key&&(!this.cape.children.length||this.cape.parent===this.guardian))return;this.key=key;clear(this.root,false);clear(this.cape);
 const state=this.saved;const items:VisualItem[]=[];for(const item of state?.items??[]){if(item.destroyed)continue;const asset=state!.assets.find(a=>a.id===item.assetId&&a.version===item.assetVersion);if(!asset)continue;if(item.recipe==='cape'&&state!.equipment.cape===item.id)items.push({...item,pattern:asset.pattern});else if((item.recipe==='banner'||item.recipe==='signpost')&&state!.placements[item.id])items.push({...item,pattern:asset.pattern,position:state!.placements[item.id]});}
 if(this.draft?.recipe==='cape'){for(let i=items.length-1;i>=0;i--)if(items[i].recipe==='cape')items.splice(i,1);items.push({id:'draft',...this.draft});}
 if(this.draft&&['banner','signpost'].includes(this.draft.recipe)&&this.previewPosition)items.push({id:'draft',...this.draft,position:this.previewPosition});
 for(const item of items){if(item.recipe==='cape'){if(!this.kind)continue;this.cape=this.make(item);this.cape.userData.guardianKind=this.kind;const fit={dog:[.78,.58,.26],cat:[.67,.48,.23],frog:[.56,.65,.29]}[this.kind];this.cape.position.set(0,fit[0],-fit[2]);this.cape.scale.set(fit[1],fit[1],1);this.cape.rotation.x=.17;this.guardian.add(this.cape);}else if(item.position&&isWalkable(this.layout,item.position)){const object=this.make(item),w=gridToWorld(item.position);object.position.set(w.x,0,w.z);this.root.add(object);}}
 }
 private make(item:VisualItem){const root=new THREE.Group();root.name=`workshop-${item.recipe}`;root.userData.itemId=item.id;const cape=item.recipe==='cape',w=cape?1: .85,h=cape?1.1:.6,y=cape?-.3:1.25;
 const outline=new THREE.Shape();outline.moveTo(-w*.32,h/2);outline.lineTo(w*.32,h/2);outline.lineTo(w/2,-h/2);outline.quadraticCurveTo(0,-h*.62,-w/2,-h/2);outline.closePath();solid(root,cape?new THREE.ShapeGeometry(outline):new THREE.PlaneGeometry(w,h),'#e8d7b3',0,y,0);if(!cape)solid(root,new THREE.CylinderGeometry(.035,.045,1.7,8),'#85654c',-.4,.85,0);
 const motif=solid(root,patternGeometry(item.pattern,w*(cape?.6:.88),h*.88),item.pattern.color,0,y,.015);motif.name='workshop-pattern';motif.userData.pattern=structuredClone(item.pattern);motif.userData.rotationDegrees=item.pattern.rotation;return root;}
 syncShield(shield:FoldingShieldState|undefined,layout:Layout,elapsed:number,selectedAnchor?:GridPoint){const key=JSON.stringify([shield,selectedAnchor,layout.version,Math.ceil((shield?.until??elapsed)-elapsed),shield?.until!==null&&shield?.until!==undefined&&elapsed>=shield.until]);if(key===this.shieldKey)return;this.shieldKey=key;for(const c of [...this.shields.children])clear(c);if(!shield&&!selectedAnchor)return;
 for(const anchor of SHIELD_ANCHORS){if(!isWalkable(layout,anchor))continue;const w=gridToWorld(anchor),mark=solid(this.shields,new THREE.RingGeometry(.32,.37,24),'#edbf69',w.x,.035,w.z);mark.rotation.x=-Math.PI/2;mark.name='shield-anchor';const selected=shield?.anchor??selectedAnchor;if(selected?.x===anchor.x&&selected.z===anchor.z){mark.scale.setScalar(1.3);mark.userData.selected=true;}}
 if(shield?.status==='active'&&isWalkable(layout,shield.anchor)&&(shield.until===null||elapsed<shield.until)){const w=gridToWorld(shield.anchor),barrier=solid(this.shields,new THREE.BoxGeometry(.94,.7,.16),'#7793a1',w.x,.35,w.z);barrier.name='shield-barrier';barrier.userData.until=shield.until;barrier.userData.remaining=Math.max(0,(shield.until??elapsed)-elapsed);const duration=solid(this.shields,new THREE.BoxGeometry(.9*Math.min(1,barrier.userData.remaining/6),.06,.04),'#e7cd83',w.x,.82,w.z);duration.name='shield-duration';}}
 dispose(){clear(this.root);clear(this.cape);clear(this.shields);}
}
