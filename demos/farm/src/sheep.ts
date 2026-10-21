import * as THREE from 'three';
import type {Animal,Action} from './model.ts';
export type SheepAction=Action|'eat'|'rest';
const sphere=new THREE.SphereGeometry(1,14,10);
function ball(parent:THREE.Object3D,color:string,x:number,y:number,z:number,sx:number,sy=sx,sz=sx){
 const mesh=new THREE.Mesh(sphere,new THREE.MeshStandardMaterial({color,roughness:.9}));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;parent.add(mesh);return mesh;
}
/** Articulated procedural sheep: head, ears and four leg pivots are independent. */
export function makeSheep(animal:Animal){
 const root=new THREE.Group(),body=new THREE.Group(),head=new THREE.Group();root.add(body);head.position.set(0,1.04,.6);body.add(head);
 const wool=ball(body,'#fff7e6',0,.87,0,.65,.53,.78);
 for(let i=0;i<18;i++){const a=i*2.39996,y=(i%3-1)*.19;ball(body,'#fff9ed',Math.cos(a)*.46,.9+y,Math.sin(a)*.61,.25);}
 ball(head,'#e6d4b7',0,0,.04,.3,.33,.36);ball(head,'#f0dfc3',0,-.12,.29,.24,.17,.2);
 const ears=[new THREE.Group(),new THREE.Group()];ears.forEach((ear,i)=>{ear.position.set(i===0?-.28:.28,.13,.02);head.add(ear);ball(ear,'#e8cdb4',i===0?-.14:.14,0,0,.23,.085,.12);ball(ear,'#e6b7ae',i===0?-.16:.16,.012,.015,.14,.06,.08);});
 for(const side of [-1,1]){ball(head,'#352e29',side*.185,.06,.295,.046,.063,.034);ball(head,'#ffffff',side*.195,.08,.319,.014);ball(head,'#e8ae9e',side*.21,-.075,.291,.065,.035,.018);}
 ball(head,'#6e5449',0,-.08,.474,.055,.038,.02);
 const legs=Array.from({length:4},(_,i)=>{const leg=new THREE.Group();leg.position.set(i%2?-.34:.34,.62,i<2?-.44:.4);body.add(leg);ball(leg,'#d9c8b0',0,-.19,0,.09,.24,.1);ball(leg,'#6d6354',0,-.4,.015,.115,.09,.13);return leg;});
 const bow=ball(body,animal.color,0,.83,.68,.25,.11,.1);ball(body,animal.color,-.18,.84,.7,.17,.14,.06);ball(body,animal.color,.18,.84,.7,.17,.14,.06);
 const tail=ball(body,'#fff9ed',0,1,-.76,.18,.2,.22);
 const grass=new THREE.Group();grass.name='feeding-grass';grass.position.set(0,-.2,.55);head.add(grass);for(let i=0;i<3;i++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(.035,.28,4),new THREE.MeshStandardMaterial({color:'#7ba057'}));leaf.position.x=(i-1)*.06;leaf.rotation.z=(i-1)*.4;grass.add(leaf);}grass.visible=false;
 const stars=new THREE.Group();stars.name='growth-stars';body.add(stars);
 for(let i=0;i<7;i++){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.075),new THREE.MeshStandardMaterial({color:'#ffe4a3',emissive:'#f2b757',emissiveIntensity:.5}));const a=i*2.4;m.position.set(Math.cos(a)*.58,1.12+(i%2)*.2,Math.sin(a)*.64);stars.add(m);}
 const halo=new THREE.Mesh(new THREE.RingGeometry(.75,.8,48),new THREE.MeshBasicMaterial({color:animal.color,transparent:true,opacity:.7,side:THREE.DoubleSide}));halo.rotation.x=-Math.PI/2;halo.position.y=.025;halo.userData.pickThrough=true;root.add(halo);
 return {root,update(a:Animal,t:number,action:SheepAction|undefined,weight:number,walking:number,micro:boolean,selected:boolean,reduced:boolean){
   const speed=reduced?0:t;const cycle=speed*Math.PI*4;const independent=a.personality==='independent';const shy=a.personality==='shy';const gain=weight*(shy?.34:1);
   body.position.y=action==='bounce'?Math.max(0,Math.sin(cycle))*.43*gain:action==='dance'?Math.max(0,Math.sin(cycle))*.12*gain:action==='rest'&&walking<.1?-.08*gain:0;
   body.rotation.z=(action==='dance'?Math.sin(cycle*(independent?.67:.5))*.18*gain:0);
   body.rotation.y=action==='dance'&&independent?Math.sin(cycle*.25)*.65*gain:0;
   head.rotation.x=action==='eat'?(.45+Math.sin(cycle)*.07)*weight:action==='love'?-.22*gain:Math.sin(speed*2)*.04;grass.visible=action==='eat'&&weight>.05;
   head.rotation.z=action==='love'?Math.sin(cycle*.25)*.22*gain:0;
   ears.forEach((ear,i)=>{ear.rotation.z=(i?1:-1)*(micro?Math.sin(t*16)*.18:Math.sin(speed*2.8+i)*.045);});
   legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(cycle+(i%2?Math.PI:0))*(walking*.36+(action==='dance'?.17*gain:0));});
   tail.rotation.x=Math.sin(speed*5)*.15;bow.scale.y=.11+(action==='love'?gain*.03:0);
   stars.visible=a.appearance==='starlit'||(a.growthEligible&&!a.growthChoiceMade);stars.scale.setScalar(a.appearance==='starlit'?1:1.18);stars.rotation.y=Math.sin(speed*.7)*.1;
   stars.children.forEach((m,i)=>{m.visible=a.appearance==='starlit'||i<2;(m as THREE.Mesh).scale.setScalar(.85+Math.sin(speed*3+i)*.15);});
   wool.material.color.set(a.appearance==='starlit'?'#fff1cc':'#fff7e6');halo.visible=selected;
 }};
}
