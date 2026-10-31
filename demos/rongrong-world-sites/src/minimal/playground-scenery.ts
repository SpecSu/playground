import * as THREE from 'three';
import type {SchoolRect} from './playground-navigation.ts';
import {SCHOOL_PLAYGROUND_LAYOUT as L,capsulePoint} from './playground-layout.ts';
/** Original procedural campus art. No textures, model service or formal assets. */
export class PlaygroundScenery{
 readonly root=new THREE.Group();private disposed=false;
 constructor(parent:THREE.Object3D){
  this.root.name='school-playground';parent.add(this.root);
  const colors={grass:'#86ae82',field:'#6e9e78',track:'#bd7864',cream:'#eee5cf',brick:'#d0a583',roof:'#647e83',white:'#f5edda',glass:'#7aa2a8',dark:'#657b6c',wood:'#b58e65'};
  const mats=Object.fromEntries(Object.entries(colors).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,roughness:.96})])) as Record<keyof typeof colors,THREE.MeshStandardMaterial>;
  const box=(to:THREE.Object3D,name:string,w:number,h:number,d:number,x:number,y:number,z:number,color:keyof typeof colors)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mats[color]);m.name=name;m.position.set(x,y,z);m.receiveShadow=true;m.castShadow=h>.1;to.add(m);return m;};
  const prop=(name:string)=>{const g=new THREE.Group();g.name=name;g.userData.playgroundProp=true;this.root.add(g);return g;};
  const band=(name:string,inner:number,outer:number,y:number,color:keyof typeof colors)=>{const positions:number[]=[],index:number[]=[],n=192;for(let i=0;i<=n;i++)for(const offset of [inner,outer]){const p=capsulePoint(i/n*L.path.length,offset);positions.push(p.x,y,p.z);}for(let i=0;i<n;i++){const a=i*2;index.push(a,a+2,a+1,a+1,a+2,a+3);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(index);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,mats[color]);mesh.name=name;mesh.receiveShadow=true;this.root.add(mesh);return mesh;};
  box(this.root,'school-ground',32,.18,24,0,-.09,0,'grass');
  band('school-track',L.track.innerRadius-L.path.radius,L.track.outerRadius-L.path.radius,L.track.surfaceY,'track');
  for(const [i,offset]of [-1.4,0,1.4].entries())band(`school-lane-line-${i}`,offset-.025,offset+.025,.019,'white');
  // The wider unmarked shoulders leave generous skin margin beside both running lanes.
  box(this.root,'school-inner-field',17.4,.018,6.3,0,.009,0,'field');
  for(const x of [-8.6,8.6])box(this.root,'field-end-line',.035,.012,6,x,.024,0,'white');
  for(const z of [-3,3])box(this.root,'field-side-line',17.2,.012,.035,0,.024,z,'white');
  box(this.root,'field-mid-line',.035,.012,6,0,.024,0,'white');
  const circle=new THREE.Mesh(new THREE.RingGeometry(1.45,1.48,40),mats.white);circle.rotation.x=-Math.PI/2;circle.position.y=.031;circle.name='field-center-circle';this.root.add(circle);
  const school=prop('school-building');box(school,'school-main',10,2.8,2.2,0,1.4,-10.5,'cream');box(school,'school-base',10.2,.28,2.4,0,.14,-10.5,'brick');box(school,'school-roof',10.6,.25,2.6,0,2.925,-10.5,'roof');
  box(school,'school-door',1.15,1.65,.05,0,.825,-9.375,'roof');for(const x of [-3.8,-2.15,2.15,3.8])box(school,'school-window',1.05,.85,.05,x,1.65,-9.375,'glass');
  const clock=new THREE.Mesh(new THREE.CircleGeometry(.35,20),mats.white);clock.position.set(0,2.35,-9.36);school.add(clock);box(school,'clock-hand',.035,.22,.025,0,2.41,-9.335,'roof');box(school,'clock-hand',.17,.035,.025,.065,2.35,-9.335,'roof');
  const stands=prop('school-bleachers');for(let i=0;i<3;i++)box(stands,'bleacher-step',6,.22+i*.18,.5,-6,.11+i*.09,9.3+i*.55,'wood');
  for(const side of [-1,1]){const goal=prop(`field-goal-${side}`),x=side*9;for(const z of [-1.1,1.1])box(goal,'goal-post',.07,1.25,.07,x,.625,z,'white');box(goal,'goal-crossbar',.07,.07,2.27,x,1.25,0,'white');}
  const shade=prop('school-rest-shade');for(const x of [8.8,11.6])for(const z of [9.2,11.1])box(shade,'shade-post',.1,2,.1,x,1,z,'wood');box(shade,'shade-roof',3.3,.18,2.4,10.2,2.05,10.15,'roof');box(shade,'rest-bench',2.4,.5,.45,10.2,.25,10.15,'wood');
  const board=prop('school-scoreboard');for(const x of [-11.8,-10.2])box(board,'board-post',.1,1.8,.1,x,.9,10.2,'wood');box(board,'board-face',2.2,.9,.12,-11,1.65,10.2,'roof');
  const fence=prop('school-perimeter-fence');for(const side of [-1,1]){for(let i=0;i<9;i++)box(fence,'fence-post',.07,.55,.07,-14+i*3.5,.275,side*11.75,'dark');box(fence,'fence-rail',28,.06,.06,0,.4,side*11.75,'wood');for(let i=0;i<7;i++)box(fence,'fence-post',.07,.55,.07,side*15.5,.275,-10.5+i*3.5,'dark');box(fence,'fence-rail',.06,.06,21,side*15.5,.4,0,'wood');}
 }
 obstacles():SchoolRect[]{this.root.updateMatrixWorld(true);const result:SchoolRect[]=[];this.root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;let parent=o.parent,solid=false;while(parent&&parent!==this.root){if(parent.userData.playgroundProp)solid=true;parent=parent.parent;}if(!solid)return;const b=new THREE.Box3().setFromObject(o);if(b.max.y<=.07||b.min.y>=1.7)return;result.push({minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z});});return result;}
 dispose(){if(this.disposed)return;this.disposed=true;const resources=new Set<THREE.BufferGeometry|THREE.Material>();this.root.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])resources.add(m);}});for(const r of resources)r.dispose();this.root.clear();this.root.removeFromParent();}
}
