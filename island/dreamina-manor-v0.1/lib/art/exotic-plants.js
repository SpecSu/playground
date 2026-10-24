import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {goldMaterial} from './plant-presentation.js';

/** Art-owned botanical sculptures. Y up; ground 0. These dimensions are FINAL
 * world dimensions, not an additional 1.5 multiplier. No inventory or game state. */
export const EXOTIC_PLANT_IDS=Object.freeze(['lithops','corkscrew-grass','mimosa','string-of-pearls','pitcher-plant','spiral-aloe','fantasy-chomper','travellers-palm','rafflesia','titan-arum']);
import {EXOTIC_PLANT_SIZES} from './exotic-plant-sizing.js';
export {EXOTIC_PLANT_SIZES} from './exotic-plant-sizing.js';
const TAU=Math.PI*2,clamp=v=>THREE.MathUtils.clamp(Number.isFinite(v)?v:0,0,1),smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const V=p=>new THREE.Vector3(...p);
const PALETTE={deep:'#365E49',stem:'#557B55',leaf:'#78A276',light:'#A5BB87',vein:'#BED09B',cream:'#E9D8AB'};

function bladeGeometry(length,width,rise=0,curl=0,{thickness=.012,ridge=.035,tipPower=.72}={}){
 const pos=[],idx=[],uN=16,vN=8,row=vN+1,plane=(uN+1)*row;
 for(let side=0;side<2;side++)for(let i=0;i<=uN;i++){
  const t=i/uN,w=width*Math.pow(Math.max(.001,Math.sin(Math.PI*t)),tipPower);
  for(let j=0;j<=vN;j++){const v=j/vN*2-1,skin=.002+thickness*(.12+.88*Math.sin(Math.PI*t)*Math.sqrt(Math.max(0,1-v*v)));pos.push(w*v,rise*t+curl*t*t+ridge*Math.sin(Math.PI*t)*(1-v*v)+(side?-.5:.5)*skin,length*t);}
 }
 for(let side=0;side<2;side++)for(let i=0;i<uN;i++)for(let j=0;j<vN;j++){
  const a=side*plane+i*row+j,b=a+1,c=a+row,d=c+1;
  if(side)idx.push(a,c,b,b,c,d);else idx.push(a,b,c,b,d,c);
 }
 const edge=[];for(let j=0;j<=vN;j++)edge.push(j);for(let i=1;i<=uN;i++)edge.push(i*row+vN);for(let j=vN-1;j>=0;j--)edge.push(uN*row+j);for(let i=uN-1;i>0;i--)edge.push(i*row);
 for(let i=0;i<edge.length;i++){const a=edge[i],b=edge[(i+1)%edge.length];idx.push(a,a+plane,b,b,a+plane,b+plane);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function tubeGeometry(points,radius=.012,steps=28,radial=7){const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(V)),steps,radius,radial,false),p=Array.from(g.attributes.position.array),uv=Array.from(g.attributes.uv.array),idx=Array.from(g.index.array),first=p.length/3,last=first+1;p.push(...points[0],...points.at(-1));uv.push(.5,.5,.5,.5);for(let i=0;i<radial;i++){idx.push(first,i+1,i);const a=steps*(radial+1)+i;idx.push(last,a,a+1);}g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.deleteAttribute('normal');g.setIndex(idx);g.computeVertexNormals();return g;}
function profileGeometry(profile,segments=32){return new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),segments);}
function shellGeometry({height=.55,radius=.3,flare=.7,opening=TAU,lobes=0}={}){
 const p=[],idx=[],n=40,m=16;
 for(let j=0;j<=m;j++){const t=j/m;for(let i=0;i<=n;i++){
  const a=(i/n-.5)*opening,r=radius*(.14+.86*Math.pow(Math.sin(t*Math.PI/2),flare))*(1+.045*Math.cos(lobes*a));
  p.push(r*Math.sin(a),height*t+Math.pow(t,4)*height*.12*Math.cos(a),r*Math.cos(a));
 }}
 for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c=a+n+1;idx.push(a,b,c,b,c+1,c);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

class Botanical {
 constructor(id){this.root=new THREE.Group();this.root.name=`Exotic_${id}`;this.root.userData.speciesId=id;this.materials=new Map();this.organs=[];this.motions=[];this.geometry=new Set();this.progress=1;}
 mat(name,color,roughness=.62){const key=`${name}:${color}`;if(!this.materials.has(key)){const m=new THREE.MeshStandardMaterial({color,roughness,metalness:.015,side:THREE.DoubleSide});m.name=name;this.materials.set(key,m);}return this.materials.get(key);}
 mesh(name,g,color,parent=this.root,materialName=name){this.geometry.add(g);const m=new THREE.Mesh(g,this.mat(materialName,color));m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 organ(name,position=[0,0,0],start=.02,end=.85,parent=this.root,{minimum=.025,attach=false}={}){const n=new THREE.Group();n.name=name;n.position.set(...position);parent.add(n);this.organs.push({node:n,position:V(position),scale:n.scale.clone(),start,end,minimum,attach});return n;}
 leaf(name,parent,{length=.4,width=.1,rise=.15,curl=-.08,color=PALETTE.leaf,angle=0,vein=true,thickness=.012,tipPower=.72}={}){const group=new THREE.Group();group.name=name;group.rotation.y=angle;parent.add(group);const ridge=Math.min(.035,length*.065,width*.30);this.mesh(`${name}_blade`,bladeGeometry(length,width,rise,curl,{thickness,ridge,tipPower}),color,group,'foliage mid');if(vein)this.tube(`${name}_vein`,[[0,.007,0],[0,rise*.5+curl*.25+ridge+.006,length*.5],[0,rise+curl+.008,length]],.004,PALETTE.vein,group,14,5,'leaf vein');return group;}
 tube(name,points,radius,color,parent=this.root,steps=28,radial=7,materialName=name){return this.mesh(name,tubeGeometry(points,radius,steps,radial),color,parent,materialName);}
 blob(name,position,scale,color,parent=this.root,segments=20,rings=12,materialName=name){const m=this.mesh(name,new THREE.SphereGeometry(1,segments,rings),color,parent,materialName);m.position.set(...position);m.scale.set(...scale);return m;}
 balls(name,items,color,parent=this.root){const geometries=items.map(({p,s})=>{const g=new THREE.SphereGeometry(1,10,7);g.scale(...(Array.isArray(s)?s:[s,s,s]));g.translate(...p);return g;});const combined=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());return this.mesh(name,combined,color,parent,name);}
 sway(node,axis,amplitude,speed,phase=0){this.motions.push({node,axis,rest:node.rotation[axis],amplitude,speed,phase});}
 growth(value){this.progress=clamp(value);for(const o of this.organs){const q=smooth((this.progress-o.start)/(o.end-o.start)),s=o.minimum+(1-o.minimum)*q;o.node.scale.copy(o.scale).multiplyScalar(s);o.node.position.copy(o.position);if(o.attach)o.node.position.y*=.12+.88*smooth(this.progress/.8);}this.root.updateMatrixWorld(true);}
 animate(time){const k=smooth((this.progress-.68)/.32);for(const m of this.motions)m.node.rotation[m.axis]=m.rest+Math.sin(time*m.speed+m.phase)*m.amplitude*k;this.root.updateMatrixWorld(true);}
 bakeScale(scale){for(const g of this.geometry)g.scale(scale,scale,scale);this.root.traverse(n=>{if(n!==this.root)n.position.multiplyScalar(scale);});for(const o of this.organs)o.position.multiplyScalar(scale);this.root.updateMatrixWorld(true);}
 dispose(){for(const g of this.geometry)g.dispose();for(const m of this.materials.values())m.dispose();}
}

function lithops(b){
 const body=b.organ('Lithops_split_body',[0,.018,0],.05,.94,b.root,{minimum:.13});
 for(const sign of [-1,1]){
  const g=profileGeometry([[0,0],[.10,.012],[.17,.045],[.205,.12],[.205,.26],[.18,.36],[.14,.395],[.08,.417],[0,.426]],36);g.scale(1,1,1.30);const l=b.mesh(`Lithops_lobe_${sign}`,g,sign<0?'#94A899':'#A7B3A1',body,'stone foliage light');l.position.x=sign*.218;
  const spots=[];for(let i=0;i<19;i++){const a=i*2.399,r=.105*Math.sqrt((i+1)/19);spots.push({p:[sign*.218+r*Math.cos(a),.430-.03*Math.pow(r/.18,1.5),r*Math.sin(a)*1.30],s:[.010,.0025,.013]});}
  b.balls(`Lithops_window_marbling_${sign}`,spots,'#6C8B7F',body);
 }
 b.sway(body,'z',.005,.7);
}
function corkscrew(b){
 for(let i=0;i<5;i++){
  const a=i*2.4,stem=b.organ(`Spring_leaf_${i}`,[Math.cos(a)*.07,.015,Math.sin(a)*.07],i*.045,.75+i*.045,b.root,{minimum:i<2?.16:.025});
  const pts=[];const h=[.93,.78,1.02,.67,.84][i];for(let j=0;j<=44;j++){const t=j/44,coil=Math.max(0,(t-.42)/.58),r=.052+.027*coil;pts.push([Math.cos(a)*.10*t+r*Math.sin(coil*TAU*1.9),h*t,Math.sin(a)*.10*t+r*(Math.cos(coil*TAU*1.9)-1)]);}
  b.tube(`Spring_flat_coil_${i}`,pts,.021,i%2?'#A5B76A':'#7D9F60',stem,66,8,'foliage mid');b.blob(`Spring_cream_tip_${i}`,pts.at(-1),[.024,.029,.024],'#D1D29A',stem,12,8,'leaf tip');b.sway(stem,'z',.035,.9,i*1.4);
 }
 for(let i=0;i<3;i++){const leaf=b.organ(`Spring_base_leaf_${i}`,[0,.012,0],.01,.35);b.leaf('Spring_base',leaf,{length:.21,width:.035,rise:.06,angle:i*2.1,vein:false});}
}
function mimosa(b){
 const trunk=b.organ('Mimosa_stem',[0,0,0],.01,.7,b.root,{minimum:.13});b.tube('Mimosa_taper_stem',[[0,0,0],[.02,.34,0],[-.035,.72,.01],[0,.93,0]],.015,PALETTE.stem,trunk,26,8,'stem');
 for(let level=0;level<3;level++)for(const side of [-1,1]){
  const h=.30+level*.22,branch=b.organ(`Mimosa_pinna_${level}_${side}`,[0,h,0],.08+level*.08,.68+level*.09,trunk);branch.rotation.y=side<0?Math.PI/2:-Math.PI/2;branch.rotation.x=-.18;
  const len=.39-level*.055;b.tube('Mimosa_rachis',[[0,0,0],[0,.025,len]],.006,PALETTE.stem,branch,12,5,'stem');
  for(let j=0;j<5;j++)for(const sign of [-1,1]){const leaf=new THREE.Group();leaf.position.set(0,.015,.055+j*len*.16);leaf.rotation.y=sign*1.15;branch.add(leaf);b.leaf('Mimosa_leaflet',leaf,{length:.12-j*.008,width:.025,rise:.013,curl:.006,color:level%2?'#8AAF83':'#6C9D77',vein:false,thickness:.008});}
  b.sway(branch,'z',.065,.45,level+side);
 }
 const bud=b.organ('Mimosa_pink_bloom',[0,.92,0],.60,.98,trunk);const florets=[];for(let i=0;i<36;i++){const a=i*2.4,y=1-2*(i+.5)/36,r=Math.sqrt(1-y*y);florets.push({p:[r*Math.cos(a)*.065,y*.065,r*Math.sin(a)*.065],s:.016});}b.balls('Mimosa_florets',florets,'#C995A8',bud);b.sway(bud,'z',.02,.7);
}
function pearls(b){
 const base=b.organ('Pearls_central_rosette',[0,.015,0],.02,.60,b.root,{minimum:.15});for(let i=0;i<5;i++)b.leaf('Pearls_crown_leaf',base,{length:.22,width:.06,rise:.13,curl:-.12,angle:i*TAU/5,color:'#79A68B',vein:false});
 for(let i=0;i<3;i++){
  const a=i*TAU/3+.2,g=b.organ(`Pearls_arch_${i}`,[0,.025,0],.06+i*.04,.76+i*.04);g.rotation.y=a;
  const length=.53+(i%2)*.10,pts=[];for(let j=0;j<=22;j++){const t=j/22;pts.push([.04*Math.sin(t*Math.PI),.04+Math.sin(t*Math.PI)*.40,length*t]);}
  b.tube('Pearls_fine_stem',pts,.009,'#527F65',g,32,6,'stem');const pearls=[];for(let j=1;j<14;j++){const t=j/14;pearls.push({p:[.04*Math.sin(t*Math.PI),.04+Math.sin(t*Math.PI)*.40,length*t],s:[.047,.047,.040]});}b.balls('Pearls_jade_beads',pearls,i%2?'#93B59E':'#709F88',g);b.sway(g,'z',.023,.68,i*1.2);
 }
}
function pitcher(b){
 const stem=b.organ('Pitcher_climbing_stem',[0,0,0],.02,.68,b.root,{minimum:.12});b.tube('Pitcher_curved_vine',[[0,0,0],[-.09,.35,0],[.03,.65,0],[-.10,1.03,.04]],.020,PALETTE.stem,stem,30,8,'stem');
 for(let i=0;i<4;i++){const leaf=b.organ(`Pitcher_leaf_${i}`,[0,.21+i*.17,0],.07+i*.06,.63+i*.075,stem);b.leaf('Pitcher_lance_leaf',leaf,{length:.28,width:.070,rise:.08,curl:-.10,angle:i*2.7,color:i%2?'#93AB79':'#71916A'});}
 for(const [i,x,y,z,s] of [[0,-.18,.32,.10,.94],[1,.18,.48,-.02,.78]]){
  const hanger=b.organ(`Pitcher_pendant_${i}`,[-.06,.93,0],.31+i*.10,.91+i*.07,stem);hanger.scale.setScalar(s);b.organs.at(-1).scale.copy(hanger.scale);const jar=new THREE.Group();jar.name='Pitcher_attached_urn';jar.position.set((x+.06)/s,(y-.93)/s,z/s);hanger.add(jar);
  b.tube('Pitcher_tendril',[[0,.58,0],[-x*.25,.70,-.02],[(-.06-x)/s,(.93-y)/s,-z/s]],.009,PALETTE.stem,jar,20,6,'stem');
  const g=profileGeometry([[.025,0],[.075,.035],[.115,.13],[.12,.25],[.085,.41],[.10,.49],[.125,.51],[.124,.53],[.103,.53],[.085,.49],[.065,.40],[.09,.24],[.085,.13],[.035,.08]],32);b.mesh('Pitcher_rounded_urn',g,i?'#BD8580':'#AF7275',jar,'pitcher petal');
  const ring=new THREE.TorusGeometry(.113,.016,8,40);ring.rotateX(Math.PI/2);const rim=b.mesh('Pitcher_wine_lip',ring,'#804657',jar,'petal rim');rim.position.y=.525;
  const lid=new THREE.Group();lid.position.set(0,.56,-.075);lid.rotation.x=-.24;jar.add(lid);b.leaf('Pitcher_hood',lid,{length:.19,width:.105,rise:.08,curl:-.015,color:'#8BA06F',vein:true});b.sway(lid,'x',.04,.8,i);b.sway(hanger,'z',.022,.55,i*2);
  b.tube('Pitcher_front_seam',[[-.025,.10,.093],[-.025,.28,.116],[-.017,.46,.09]],.005,'#CE9D8D',jar,18,5,'petal seam');
 }
 const tip=b.organ('Pitcher_terminal_leaf',[-.10,1.03,.04],.30,.90,stem);b.leaf('Pitcher_curling_tip',tip,{length:.24,width:.055,rise:.06,curl:-.10,angle:-1.2,color:'#94AF79'});
}
function aloe(b){
 for(let ring=0;ring<3;ring++){const count=9-ring*2;for(let i=0;i<count;i++){
  const a=i*TAU/count+ring*.45,leaf=b.organ(`Aloe_spiral_${ring}_${i}`,[0,.025+ring*.065,0],.02+ring*.09,.72+ring*.11,b.root,{minimum:.08});
  b.leaf('Aloe_fleshy_blade',leaf,{length:.48-ring*.13,width:.103-ring*.018,rise:.18+ring*.10,curl:.09,angle:a,color:['#7BA59C','#8AB3A4','#A0BFA9'][ring],thickness:.042,vein:false});
  b.sway(leaf,'z',.009,.56,i*.6+ring);
 }}
}
function chomper(b){
 const stem=b.organ('Chomper_curved_stem',[0,0,0],.02,.72,b.root,{minimum:.10});b.tube('Chomper_s_stem',[[0,0,0],[-.09,.38,0],[.04,.85,-.015],[.04,1.20,.03]],.033,'#4E7553',stem,32,10,'stem');
 for(let i=0;i<3;i++){const leaf=b.organ(`Chomper_leaf_${i}`,[0,.13+i*.22,0],.04+i*.05,.53+i*.09,stem);b.leaf('Chomper_curled_leaf',leaf,{length:.34,width:.105,rise:.07,curl:-.07,angle:1+i*2.4,color:i%2?'#86A16D':'#638959'});}
 const head=b.organ('Chomper_head',[.04,1.17,.03],.36,.98,stem);head.rotation.y=-.18;
 b.blob('Chomper_green_calyx',[0,0,-.06],[.21,.20,.15],'#4E7654',head,24,14,'foliage deep');
 for(const sign of [-1,1]){
  const jaw=new THREE.Group();jaw.name=sign>0?'Chomper_upper_jaw':'Chomper_lower_jaw';jaw.position.z=.015;jaw.rotation.x=-sign*.22;head.add(jaw);
  const geo=new THREE.SphereGeometry(1,32,16,0,TAU,sign>0?0:Math.PI/2,Math.PI/2);geo.scale(.29,.21,.27);geo.translate(0,sign*.028,.14);b.mesh('Chomper_coral_shell',geo,sign>0?'#C96965':'#B8585A',jaw,'coral petals');
  const mouth=new THREE.CircleGeometry(1,40);mouth.rotateX(Math.PI/2);mouth.scale(.275,1,.25);mouth.translate(0,sign*.026,.14);b.mesh('Chomper_dark_mouth',mouth,'#643D4B',jaw,'mouth interior');
  const lip=[];for(let j=0;j<=48;j++){const a=j/48*TAU;lip.push([Math.cos(a)*.28,sign*.03,.14+Math.sin(a)*.255]);}b.tube('Chomper_cream_rim',lip,.012,'#E3C8A0',jaw,48,7,'cream lip');
  const nubs=[];for(let j=0;j<9;j++){const a=.15+j/8*(Math.PI-.3);nubs.push({p:[Math.cos(a)*.27,sign*-.003,.14+Math.sin(a)*.24],s:[.018,.026,.014]});}b.balls('Chomper_blunt_petaltips',nubs,'#E6D4AE',jaw);b.sway(jaw,'x',-sign*.065,.52,0);
 }
 const spots=[];for(let i=0;i<13;i++){const a=i*2.4;spots.push({p:[.19*Math.cos(a),.13+.04*Math.sin(i),.15+.17*Math.sin(a)],s:[.014,.008,.014]});}b.balls('Chomper_shell_speckles',spots,'#E4B29B',head);b.sway(head,'z',.022,.43);
}
function palm(b){
 const base=b.organ('Palm_sheathed_trunk',[0,0,0],.01,.65,b.root,{minimum:.13});b.mesh('Palm_trunk',profileGeometry([[0,0],[.04,0],[.067,.05],[.052,.28],[.028,.48],[0,.48]],20),'#8D9A6B',base,'stem');
 for(let i=0;i<7;i++){
  const angle=(i-3)*.10,leaf=b.organ(`Palm_fan_leaf_${i}`,[0,.22,0],.03+i*.035,.68+i*.04,base);leaf.rotation.z=angle;leaf.rotation.y=(i%2?1:-1)*.06;
  const len=.65-Math.abs(i-3)*.06;b.tube('Palm_petiole',[[0,0,0],[0,.25,0],[0,.38,.025]],.012,'#74936A',leaf,16,6,'petiole');
  const blade=new THREE.Group();blade.position.y=.33;blade.rotation.x=-Math.PI/2+.08;leaf.add(blade);b.leaf('Palm_paddle',blade,{length:len,width:.10,rise:.012,curl:.04,color:i%2?'#83AA83':'#659475',thickness:.014});
  b.sway(leaf,'z',.012,.6,i*.5);
 }
}
function rafflesia(b){
 const heart=b.organ('Rafflesia_heart',[0,.025,0],.20,.91,b.root,{minimum:.10});
 const cup=profileGeometry([[.12,0],[.21,.035],[.24,.14],[.22,.24],[.18,.285],[.145,.29],[.13,.25],[.13,.17],[.075,.10]],40);b.mesh('Rafflesia_thick_cup',cup,'#AD6056',heart,'petal cup');
 b.blob('Rafflesia_shadow_throat',[0,.113,0],[.12,.018,.12],'#573F3C',heart,24,10,'mouth throat');
 const coreDots=[];for(let i=0;i<18;i++){const a=i*2.4,r=.09*Math.sqrt((i+1)/18);coreDots.push({p:[r*Math.cos(a),.13,r*Math.sin(a)],s:[.011,.025,.011]});}b.balls('Rafflesia_central_columns',coreDots,'#CF9E77',heart);
 for(let i=0;i<5;i++){
  const petal=b.organ(`Rafflesia_lobe_${i}`,[0,.07,0],.05+i*.025,.91+i*.015,b.root,{minimum:.06});petal.rotation.y=i*TAU/5+.18;
  b.leaf('Rafflesia_round_petal',petal,{length:.64,width:.27,rise:.07,curl:.01,color:i%2?'#B96D60':'#C07A68',vein:false,thickness:.07,tipPower:.42});
  const spots=[];for(let j=0;j<14;j++){const t=.24+.7*((j*7)%14)/14,v=Math.sin(j*4.1)*.72,w=.25*Math.pow(Math.sin(Math.PI*t),.72);spots.push({p:[w*v,.07*t+.01*t*t+.035*Math.sin(Math.PI*t)*(1-v*v)+.037,.64*t],s:[.016+(j%3)*.003,.005,.013]});}b.balls('Rafflesia_cream_islands',spots,'#E1C697',petal);b.sway(petal,'x',.008,.43,i*.7);
 }
}
function titan(b){
 const base=b.organ('Titan_peduncle',[0,0,0],.02,.64,b.root,{minimum:.14});b.mesh('Titan_pale_stalk',profileGeometry([[.035,0],[.065,.06],[.045,.34],[.035,.43]],24),'#8D9D6D',base,'stem');
 const bloom=b.organ('Titan_inflorescence',[0,.29,0],.28,.96,base);
 const outer=b.mesh('Titan_ruffled_spathe',shellGeometry({height:.40,radius:.26,flare:.60,opening:TAU*.87,lobes:9}),'#8DA488',bloom,'foliage mid');outer.rotation.y=Math.PI;
 const inner=b.mesh('Titan_plum_inner',shellGeometry({height:.40,radius:.251,flare:.60,opening:TAU*.865,lobes:9}),'#936077',bloom,'petal throat');inner.rotation.y=Math.PI;inner.position.y=.006;
 b.mesh('Titan_ivory_spadix',profileGeometry([[.032,.08],[.056,.17],[.060,.42],[.047,.60],[.025,.73],[.008,.77],[0,.78]],28),'#DBCDA1',bloom,'cream flower column');
 const rim=[];for(let i=0;i<=40;i++){const a=(i/40-.5)*TAU*.87,r=.26*(1+.045*Math.cos(9*a));rim.push([-r*Math.sin(a),.40+.048*Math.cos(a),-r*Math.cos(a)]);}b.tube('Titan_pale_ruffle',rim,.009,'#C9BE9F',bloom,48,6,'petal edge');b.sway(outer,'z',.008,.55);b.sway(inner,'z',.008,.55);
 for(let i=0;i<3;i++){const leaf=b.organ(`Titan_base_leaf_${i}`,[0,.02,0],.02,.46);b.leaf('Titan_sheath_leaf',leaf,{length:.19,width:.07,rise:.07,curl:-.025,angle:i*2.1,vein:false,color:'#7E9E76'});}
}
const BUILDERS={lithops,'corkscrew-grass':corkscrew,mimosa,'string-of-pearls':pearls,'pitcher-plant':pitcher,'spiral-aloe':aloe,'fantasy-chomper':chomper,'travellers-palm':palm,rafflesia,'titan-arum':titan};
const envelopes=new Map();
function sculpt(speciesId){const make=BUILDERS[speciesId];if(!make)throw new Error(`Unknown exotic plant: ${speciesId}`);const b=new Botanical(speciesId);make(b);b.growth(1);const box=new THREE.Box3().setFromObject(b.root),size=box.getSize(new THREE.Vector3()),r=EXOTIC_PLANT_SIZES[speciesId],scale=r.metres/(r.axis==='width'?Math.max(size.x,size.z):size.y);b.bakeScale(scale);b.growth(1);
 // Authoring offset keeps the complete rounded leaves/bulbs above their ground
 // pivot. It is baked into attachment positions, never a second root scale.
 const minY=new THREE.Box3().setFromObject(b.root).min.y,lift=-minY+.009;
 for(const n of b.root.children)n.position.y+=lift;
 for(const o of b.organs)if(o.node.parent===b.root)o.position.y+=lift;
 b.growth(1);return b;}
function envelopeFor(id,b){if(envelopes.has(id))return envelopes.get(id);const a=[];for(let i=0;i<=20;i++){b.growth(i/20);const h=new THREE.Box3().setFromObject(b.root).max.y;a.push(Math.max(h,i?a[i-1]:0)+.000001);}envelopes.set(id,a);b.growth(1);return a;}
export function createExoticPlant(speciesId,{instanceScale=1,variant='normal'}={}){
 if(!Number.isFinite(instanceScale)||instanceScale<=0)throw new Error('Invalid exotic plant scale');
 const b=sculpt(speciesId);envelopeFor(speciesId,b);if(variant==='gold')for(const m of b.materials.values())goldMaterial(m,m.name);
 b.root.scale.setScalar(instanceScale);b.root.userData.artPhysicalScale=instanceScale;b.root.userData.artScaleIncludesCharacterMultiplier=true;b.growth(0);
 return {root:b.root,setGrowth:value=>b.growth(value),update:time=>b.animate(Number.isFinite(time)?time:0),duration:4,dispose:()=>b.dispose()};
}
export function exoticPlantMarkerHeight(speciesId,progress,ratio=1){if(!envelopes.has(speciesId)){const b=sculpt(speciesId);envelopeFor(speciesId,b);b.dispose();}const a=envelopes.get(speciesId),p=clamp(progress)*20,i=Math.min(19,Math.floor(p));return (a[i]+(a[i+1]-a[i])*(p-i)+.025)*ratio;}
