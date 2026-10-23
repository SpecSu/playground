import * as THREE from 'three';

export type FarmSpecies='sheep'|'pig'|'cow'|'bunny';
export type FarmSex='male'|'female';
export type FarmAnimalPose={time:number;speed:number;distance:number;activity:string;carried?:boolean;hatch?:number;selected?:boolean};
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
function dispose(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
function material(color:string,roughness=.72){return new THREE.MeshStandardMaterial({color,roughness,metalness:0});}
function ellipsoid(parent:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy=sx,sz=sx,segments=18){const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,segments,12),mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function capsule(parent:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,radius:number,length:number){const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(radius,length,6,12),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function curveTube(parent:THREE.Object3D,mat:THREE.Material,points:THREE.Vector3[],radius:number){const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,radius,7,false),mat);mesh.castShadow=true;parent.add(mesh);return mesh;}
/** Toy-like anatomical groups. Locomotion never writes the root's world transform. */
export function createFarmAnimal(species:FarmSpecies,sex:FarmSex){
 const root=new THREE.Group();root.name=`farm-${species}`;
 const body=new THREE.Group(),head=new THREE.Group(),legs:THREE.Group[]=[],ears:THREE.Group[]=[],eyes:THREE.Mesh[]=[];root.add(body);body.add(head);
 const cream=material('#FFF4DD'),ivory=material('#F5EAD8'),dark=material('#493C35'),black=material('#27342C',.38),white=material('#FFFFFF',.28),pink=material('#ECA6A7'),blush=material('#E9A899');
 const main=species==='pig'?material('#F1B9AA'):species==='bunny'?material('#E6C9AA'):cream;
 const bodyY=species==='bunny'?.43:.48;
 const belly=ellipsoid(body,main,0,bodyY,-.06,species==='cow'?.36:.33,species==='bunny'?.34:.31,species==='bunny'?.32:.43);
 ellipsoid(body,ivory,0,bodyY-.06,.25,.23,.22,.2);
 head.position.set(0,species==='bunny'?.76:.7,species==='bunny'?.19:.33);
 ellipsoid(head,main,0,0,0,.29,.27,.275);
 const muzzleColor=species==='pig'?pink:species==='cow'?material('#E5BAAA'):ivory;
 ellipsoid(head,muzzleColor,0,-.11,.205,species==='pig'?.19:.205,species==='pig'?.125:.135,.115);
 const mouth=new THREE.Object3D();mouth.name='feeding-mouth';mouth.position.set(0,-.15,.33);head.add(mouth);
 for(const side of [-1,1]){
  const eye=ellipsoid(head,black,side*.135,.015,.241,.036,.046,.025);eyes.push(eye);
  ellipsoid(eye,white,-.2,.32,.76,.27,.24,.2,10);
  ellipsoid(head,blush,side*.22,-.085,.17,.053,.026,.023,12);
  if(species==='pig')ellipsoid(head,dark,side*.075,-.11,.307,.022,.03,.012,12);
  else if(species==='cow')ellipsoid(head,dark,side*.09,-.095,.308,.023,.017,.011,12);
 }
 if(species!=='pig'&&species!=='cow'){
  ellipsoid(head,pink,0,-.085,.315,.035,.025,.018,12);
  for(const side of [-1,1])curveTube(head,dark,[new THREE.Vector3(0,-.112,.313),new THREE.Vector3(side*.025,-.145,.314),new THREE.Vector3(side*.06,-.13,.3)],.006);
 }
 const legMat=species==='sheep'?material('#A78B72'):main;
 for(let i=0;i<4;i++){
  const leg=new THREE.Group();leg.position.set(i%2?.22:-.22,.3,i<2?-.3:.25);body.add(leg);legs.push(leg);
  capsule(leg,legMat,0,-.11,0,species==='bunny'?.085:.075,.1);
  ellipsoid(leg,species==='cow'?dark:ivory,0,-.22,.025,.095,.065,species==='bunny'?.15:.105);
 }
 for(const side of [-1,1]){
  const ear=new THREE.Group();ear.position.set(side*.225,.15,-.015);head.add(ear);ears.push(ear);
  if(species==='bunny'){
   ear.rotation.z=-side*.12;capsule(ear,main,0,.19,0,.086,.32);capsule(ear,pink,0,.2,.069,.043,.26);
  }else if(species==='pig'){
   ear.rotation.z=-side*.42;ellipsoid(ear,main,side*.035,.085,0,.115,.15,.052);ellipsoid(ear,pink,side*.035,.09,.045,.07,.1,.015);
  }else{
   ear.rotation.z=-side*.66;ellipsoid(ear,main,side*.04,.045,0,.135,.065,.055);ellipsoid(ear,pink,side*.04,.045,.042,.084,.037,.018);
  }
 }
 let tail:THREE.Object3D;
 if(species==='sheep'){
  const fleece=material('#FFFAEA');
  // Distinct clumps, not a single smooth body sphere. Distribution stays outside joints.
  for(let ring=0;ring<4;ring++)for(let j=0;j<8;j++){
   const theta=j*Math.PI/4+(ring%2)*.22,z=-.32+ring*.18;
   const r=.14+(Math.sin(ring*7+j*3)+1)*.014;
   ellipsoid(body,fleece,Math.cos(theta)*.285,.49+Math.sin(theta)*.25,z,r,r*.96,r*1.08,12);
  }
  for(let j=0;j<7;j++)ellipsoid(head,fleece,(j%3-1)*.11,.18+Math.floor(j/3)*.055,-.035+(j%2)*.09,.105,.1,.095,12);
  tail=ellipsoid(body,fleece,0,.5,-.51,.105,.12,.115,12);
 }else if(species==='cow'){
  const spot=material('#6A5044');
  for(const side of [-1,1]){
   const patch=ellipsoid(body,spot,side*.345,.51,-.17,.038,.14,.17,14);patch.rotation.z=side*.2;
   ellipsoid(body,spot,side*.24,.68,.14,.11,.035,.095,14);
   const horn=new THREE.Mesh(new THREE.ConeGeometry(.047,.18,12),ivory);horn.position.set(side*.17,.285,-.05);horn.rotation.z=-side*.25;head.add(horn);horn.castShadow=true;
  }
  ellipsoid(head,spot,-.1,.12,.18,.1,.09,.065,14);
  tail=new THREE.Group();tail.position.set(0,.55,-.45);body.add(tail);curveTube(tail,dark,[new THREE.Vector3(),new THREE.Vector3(.08,-.12,-.08),new THREE.Vector3(.04,-.29,-.12)],.024);ellipsoid(tail,dark,.04,-.31,-.12,.055,.075,.045,12);
 }else if(species==='pig'){
  const points=Array.from({length:28},(_,i)=>{const t=i/27*Math.PI*3.5;return new THREE.Vector3(Math.cos(t)*.065,.49+Math.sin(t)*.065,-.47-i/27*.13);});tail=curveTube(body,pink,points,.018);
 }else tail=ellipsoid(body,cream,0,.48,-.39,.13,.135,.13,14);
 // Small accessory distinguishes sex without turning it into a stat billboard.
 const ribbon=material(sex==='female'?'#D88D8F':'#82AF9C');
 const collar=new THREE.Mesh(new THREE.TorusGeometry(.235,.018,6,24),ribbon);collar.rotation.x=Math.PI/2;collar.position.set(0,.59,.24);body.add(collar);
 const tag=ellipsoid(body,ribbon,0,.49,.35,.045,.055,.02,12);tag.rotation.z=.16;
 if(sex==='female')for(const side of [-1,1]){const bow=ellipsoid(head,ribbon,side*.055,.245,.08,.064,.035,.025,12);bow.rotation.z=side*.45;}
 const halo=new THREE.Mesh(new THREE.RingGeometry(.45,.49,40),new THREE.MeshBasicMaterial({color:'#FFF1AB',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=.018;halo.visible=false;root.add(halo);
 const originalEarRot=ears.map(e=>e.rotation.z);const tailBase=tail.rotation.y;
 const height=species==='bunny'?1.36:species==='cow'?1.18:1.08;
 return {root,mouth,height,
  update(p:FarmAnimalPose){
   const walk=clamp(p.speed/.8),phase=p.distance/.62*Math.PI*2,t=p.time;
   const resting=p.activity==='rest'&&!p.carried,feeding=(p.activity==='drink'||p.activity==='graze'||p.activity==='eat')&&!p.carried;
   const reveal=p.hatch===undefined?1:clamp(p.hatch);
   let bounce=0,squash=1;
   if(reveal<1){bounce=Math.sin(clamp((reveal-.12)/.75)*Math.PI)*(1-reveal*.25)*1.05;squash=reveal<.15?.72+reveal/.15*.28:reveal>.78?1-Math.sin((reveal-.78)/.22*Math.PI)*.14:1;}
   body.position.y=(resting?-.13:0)+(p.carried?-.08:0)+bounce+(p.carried?Math.sin(t*2)*.015:Math.abs(Math.sin(phase))*walk*.035);
   body.scale.set(1+(1-squash)*.45,squash*(1+Math.sin(t*2.1)*.008),1+(1-squash)*.22);
   belly.scale.y=(species==='bunny'?.34:.31)*(1+Math.sin(t*2)*.014);
   head.rotation.x=feeding?.38+Math.sin(t*4)*.045:resting?.13:Math.sin(t*1.5)*.035;
   head.rotation.y=walk>.15?0:Math.sin(t*.8)*.055;
   head.position.y=(species==='bunny'?.76:.7)+(feeding?-.08:0);
   legs.forEach((leg,i)=>{leg.rotation.x=p.carried?(i<2?-.62:.62):resting?(i<2?-.85:.8):Math.sin(phase+(i===0||i===3?0:Math.PI))*.45*walk;leg.rotation.z=p.carried?(i%2?.14:-.14):0;});
   ears.forEach((ear,i)=>{ear.rotation.z=originalEarRot[i]+Math.sin(t*2.7+i)*.045+(species==='bunny'?Math.sin(phase+i)*walk*.055:0);});
   tail.rotation.y=tailBase+Math.sin(t*3)*.12;
   const blink=(t%4.3)>4.13?.14:1;eyes.forEach(eye=>eye.scale.y=.046*blink);
   halo.visible=!!p.selected&&!p.carried;
  },dispose:()=>dispose(root)};
}

/** A textured ceramic egg with separated shell halves, ready for deterministic reveal playback. */
export function createFarmEgg(tint='#F5DCA4'){
 const root=new THREE.Group(),shell=new THREE.Group(),top=new THREE.Group(),bottom=new THREE.Group(),sparkles=new THREE.Group();root.add(shell,sparkles);shell.add(top,bottom);
 const shellMat=material('#FFF5DC',.54),insideMat=material('#E9D5B4'),spotMat=material(tint,.67),gold=material('#E4B969',.38);
 const eggGeometry=new THREE.SphereGeometry(1,28,20);const pos=eggGeometry.attributes.position;
 for(let i=0;i<pos.count;i++){const y=pos.getY(i);const taper=1-.18*(y+1)/2;pos.setXYZ(i,pos.getX(i)*.34*taper,(y+1)*.43,pos.getZ(i)*.34*taper);}eggGeometry.computeVertexNormals();
 // Each hemisphere uses the same analytic shape so splitting creates a clear shell edge.
 const half=(upper:boolean)=>{const geo=new THREE.SphereGeometry(1,28,12,0,Math.PI*2,upper?0:Math.PI/2,Math.PI/2);const p=geo.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),taper=1-.18*(y+1)/2;p.setXYZ(i,p.getX(i)*.34*taper,(y+1)*.43,p.getZ(i)*.34*taper);}geo.computeVertexNormals();const m=new THREE.Mesh(geo,shellMat);m.castShadow=true;m.receiveShadow=true;return m;};
 top.add(half(true));bottom.add(half(false));eggGeometry.dispose();
 for(let i=0;i<9;i++){const angle=i*2.399,yy=.2+(i%3)*.2,rad=.3*(1-.18*yy/.86),s=.035+(i%2)*.014;const group=yy>.43?top:bottom;const dot=ellipsoid(group,spotMat,Math.cos(angle)*rad,yy,Math.sin(angle)*rad,s,s*1.3,.015,12);dot.lookAt(Math.cos(angle)*2,yy,Math.sin(angle)*2);}
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.306,.015,6,28),insideMat);rim.rotation.x=Math.PI/2;rim.position.y=.43;bottom.add(rim);rim.visible=false;
 const crack=new THREE.Group();shell.add(crack);const crackMat=material('#B49A76');
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,b=(i+.5)/12*Math.PI*2,c=(i+1)/12*Math.PI*2;curveTube(crack,crackMat,[new THREE.Vector3(Math.cos(a)*.309,.43,Math.sin(a)*.309),new THREE.Vector3(Math.cos(b)*.31,.43+(i%2?.055:-.055),Math.sin(b)*.31),new THREE.Vector3(Math.cos(c)*.309,.43,Math.sin(c)*.309)],.008);}crack.visible=false;
 const stars:THREE.Mesh[]=[];for(let i=0;i<9;i++){const star=new THREE.Mesh(new THREE.OctahedronGeometry(.045+(i%3)*.01),gold);sparkles.add(star);stars.push(star);}sparkles.visible=false;
 const nest=new THREE.Group();root.add(nest);for(let i=0;i<14;i++){const a=i/14*Math.PI*2;const straw=capsule(nest,material(i%2?'#CAB17C':'#DDC793'),Math.cos(a)*.28,.025,Math.sin(a)*.28,.018,.25);straw.rotation.set(Math.PI/2,a+.45,0);}nest.name='egg-nest';
 return {root,shell,
  update(progress:number,time:number,reveal?:number){
   const ready=progress>=1;const r=reveal===undefined?0:clamp(reveal);shell.rotation.z=(ready?Math.sin(time*7)*.065:Math.sin(time*1.8)*.015)*(1-r);shell.position.y=ready?Math.abs(Math.sin(time*3.5))*.018:0;
   crack.visible=ready&&r<.4;rim.visible=r>0;
   top.position.set(-ease(r)*.32,Math.sin(clamp(r*1.5)*Math.PI)*.42+ease(r)*.1,-ease(r)*.16);top.rotation.z=-ease(r)*.8;
   bottom.position.set(ease(r)*.22,0,ease(r)*.15);bottom.rotation.z=ease(r)*.38;
   shell.visible=r<.9;sparkles.visible=r>0&&r<1;
   stars.forEach((star,i)=>{const a=i/9*Math.PI*2,spread=.2+r*.9;star.position.set(Math.cos(a)*spread,.35+Math.sin(r*Math.PI)*.8+(i%3)*.08,Math.sin(a)*spread);star.rotation.set(time+i,time*.6,0);star.scale.setScalar(Math.max(.01,Math.sin(r*Math.PI)));});
   nest.visible=r<.98;
  },dispose:()=>dispose(root)};
}
