import * as THREE from 'three';
function material(color:string){return new THREE.MeshStandardMaterial({color,roughness:.88});}
export function mesh(parent:THREE.Object3D,g:THREE.BufferGeometry,color:string,x:number,y:number,z:number){const m=new THREE.Mesh(g,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent:THREE.Object3D,color:string,x:number,y:number,z:number,w:number,h:number,d:number){return mesh(parent,new THREE.BoxGeometry(w,h,d),color,x,y,z);}
function orb(parent:THREE.Object3D,color:string,x:number,y:number,z:number,r:number){return mesh(parent,new THREE.IcosahedronGeometry(r,2),color,x,y,z);}
function tree(parent:THREE.Object3D,x:number,z:number,size=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(size);parent.add(g);mesh(g,new THREE.CylinderGeometry(.13,.2,1.8,7),'#b49368',0,.9,0);orb(g,'#8aaf75',0,2.1,0,.85);orb(g,'#9dbd7c',-.45,1.8,.2,.62);orb(g,'#b3c88b',.42,2.25,.1,.6);}
export function makeEnvironment(scene:THREE.Scene){
 const root=new THREE.Group();scene.add(root);
 mesh(root,new THREE.CylinderGeometry(8.8,8.5,.55,72),'#bdbe85',0,-.32,0).scale.z=.83;
 mesh(root,new THREE.CylinderGeometry(8.85,8.85,.13,72),'#b7cc91',0,-.02,0).scale.z=.83;
 const meadow=mesh(root,new THREE.CircleGeometry(8.7,72),'#c2d59b',0,.05,0);meadow.rotation.x=-Math.PI/2;meadow.scale.y=.83;
 const dirt=mesh(root,new THREE.CircleGeometry(2.8,48),'#d9d4a5',0,.062,1.2);dirt.rotation.x=-Math.PI/2;dirt.scale.y=.75;
 // Rounded stepping stones lead from the gate into the shared play space.
 for(let i=0;i<5;i++) {const m=mesh(root,new THREE.CylinderGeometry(.35,.4,.07,12),'#e8dfb9',-.6+Math.sin(i)*.25,.09,5.2-i*.63);m.scale.z=.68;}
 for(const z of [-5.35,5.7])for(let x=-6.8;x<=6.8;x+=1.35){if(z>0&&Math.abs(x)<1.8)continue;box(root,'#f2e9ce',x,.55,z,.16,1.1,.16);for(const y of [.4,.85])box(root,'#efe4c7',x+.6,y,z,1.24,.11,.12);}
 for(const x of [-6.8,6.8])for(let z=-4.8;z<=5.4;z+=1.35){box(root,'#f2e9ce',x,.55,z,.16,1.1,.16);for(const y of [.4,.85])box(root,'#efe4c7',x,y,z+.6,.12,.11,1.24);}
 // Small barn, a turning windmill and a shaded water trough are landmarks.
 box(root,'#e9bd96',-4.7,.9,-3.8,2.4,1.7,1.9);box(root,'#f4e5c6',-4.7,.9,-2.83,.72,1.3,.05);box(root,'#a7baa2',-4.7,1.1,-2.79,.44,.7,.035);
 const roof=mesh(root,new THREE.ConeGeometry(1.85,1.1,4),'#b97565',-4.7,2.3,-3.8);roof.rotation.y=Math.PI/4;roof.scale.z=.9;
 for(const dx of [-.78,.78])box(root,'#fff1d3',-4.7+dx,1.1,-2.81,.42,.48,.07);
 mesh(root,new THREE.CylinderGeometry(.45,.65,2.4,8),'#f3e8cb',5.1,1.2,-4.1);
 const fan=new THREE.Group();fan.position.set(5.1,2.45,-3.55);root.add(fan);
 for(let i=0;i<4;i++){const blade=new THREE.Group();blade.rotation.z=i*Math.PI/2;fan.add(blade);box(blade,'#d5aa7d',0,.65,0,.2,1.3,.12);box(blade,'#f2debd',.18,.85,.03,.4,.7,.08);}orb(fan,'#a88361',0,0,.12,.16);
 tree(root,-6,-2.4,.95);tree(root,6,2.7,.92);tree(root,-5.6,3.5,.65);
 const trough=box(root,'#a2afab',-4.9,.28,1.7,1.3,.5,.65);box(root,'#a5cdd1',-4.9,.55,1.7,1.1,.03,.48);trough.rotation.y=.18;
 for(let i=0;i<90;i++){const x=Math.sin(i*46.9)*7.2,z=Math.cos(i*27.3)*5.9;if(Math.abs(x)<4&&Math.abs(z)<3.7)continue;const color=['#eee5ac','#e6b6a0','#f8f2d5','#bcb2cd'][i%4];mesh(root,new THREE.ConeGeometry(.07,.28,4),'#829f64',x,.16,z);orb(root,color,x,.32,z,.095);}
 const stage=new THREE.Group();stage.position.set(3.6,0,3.25);root.add(stage);
 mesh(stage,new THREE.CylinderGeometry(1.5,1.6,.22,40),'#bd987c',0,.16,0);
 const cushion=mesh(stage,new THREE.CylinderGeometry(1.43,1.43,.16,40),'#deb6a0',0,.33,0);cushion.scale.z=.9;
 for(let i=0;i<8;i++){const a=i*Math.PI/4;orb(stage,'#fff0c1',Math.cos(a)*1.44,.42,Math.sin(a)*1.3,.07);}
 stage.visible=false;
 const butterflies=new THREE.Group();root.add(butterflies);
 for(let i=0;i<5;i++){const b=new THREE.Group();b.position.set(Math.sin(i)*5,1.5,Math.cos(i)*3);butterflies.add(b);for(const side of [-1,1]){const w=mesh(b,new THREE.SphereGeometry(.09,6,5),i%2?'#edbc82':'#e8dab8',side*.09,0,0);w.scale.set(1,.3,1.5);}}
 return {stage,update(t:number,reduced:boolean){fan.rotation.z=reduced?0:t*.2;butterflies.children.forEach((b,i)=>{if(reduced)return;b.position.set(Math.sin(t*.18+i*3)*5,1.7+Math.sin(t+i)*.3,Math.cos(t*.17+i)*3.8);b.children.forEach((w,j)=>w.rotation.z=Math.sin(t*15)*.6*(j?1:-1));});}};
}
