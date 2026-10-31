import * as THREE from 'three';
import {HunyuanEnvironmentScene,type HunyuanEnvironmentPlacement,type HunyuanEnvironmentOptions} from './hunyuan-environment-scene.ts';
import {worldPoint,terrainSurfaceHeight} from './scenery-art.ts';
import type {SampleFarm} from './sample-farms.ts';
import {LunarBasketballCourt} from './lunar-basketball-court.ts';
import {LUNAR_SHOWCASE_LAYOUT} from './lunar-showcase-layout.ts';
import {VisitorLandmarkScene,type VisitorLandmarkOptions} from './visitor-landmark-scene.ts';
import {visitorLandmarkBounds} from './visitor-landmark-catalog.ts';
/** Visit-only art. Ground appearance belongs to terrain-appearance, never this layer.
 * Tall props stay outside owned land; the only interior geometry is low path paint/planks. */
export class SampleScenery{
 readonly root=new THREE.Group();readonly landmarks:HunyuanEnvironmentPlacement[];readonly court:LunarBasketballCourt|undefined;readonly suppliedLandmark:VisitorLandmarkScene;readonly landmarkBounds:ReturnType<typeof visitorLandmarkBounds>;
 private environment:HunyuanEnvironmentScene;private disposed=false;
 constructor(parent:THREE.Object3D,farm:SampleFarm,options:HunyuanEnvironmentOptions&{landmark?:VisitorLandmarkOptions}={}){
  this.root.name='sample-visitor-scenery';this.root.userData.theme=farm.card.themeId;parent.add(this.root);
  const id=farm.card.target.sampleId,theme=farm.card.themeId;
  const material=(color:string)=>new THREE.MeshStandardMaterial({color,roughness:.94});
  const pathMaterial=material(theme==='glacier'?'#e7f2f1':theme==='desert'?'#e5ce9e':theme==='lunar'?'#bcb7cd':'#a58a62');
  const stone=new THREE.CylinderGeometry(.24,.27,.025,8),board=theme==='wetland'?new THREE.BoxGeometry(.65,.025,1):undefined,seatShape=new THREE.BoxGeometry(.8,.1,.28),leg=new THREE.BoxGeometry(.08,.28,.24),wood=material(theme==='lunar'?'#8d8c9a':'#a17c55');
  for(let i=0;i<farm.route.length;i++){
   const p=farm.route[i],world=worldPoint(p),tile=farm.state.tiles.find(t=>t.x===p.x&&t.z===p.z)!;
   if(theme==='wetland'&&i){const previous=worldPoint(farm.route[i-1]),distance=previous.distanceTo(world),mesh=new THREE.Mesh(board!,pathMaterial);mesh.name='sample-low-path';mesh.position.copy(previous).lerp(world,.5);mesh.position.y=.018;mesh.scale.z=distance;mesh.rotation.y=Math.atan2(world.x-previous.x,world.z-previous.z);mesh.receiveShadow=true;this.root.add(mesh);}
   else {const mesh=new THREE.Mesh(stone,pathMaterial);mesh.name='sample-low-path';mesh.position.copy(world);mesh.position.y=terrainSurfaceHeight(tile,0,0,farm.state.tiles)+.018;mesh.receiveShadow=true;this.root.add(mesh);}
  }
  for(const [x,z] of [[-1.2,2.2],[6.2,1.3]]){const p=worldPoint({x,z}),seat=new THREE.Mesh(seatShape,wood);seat.name='sample-perimeter-seat';seat.position.set(p.x,.28,p.z);seat.castShadow=true;this.root.add(seat);for(const dx of [-.3,.3]){const foot=new THREE.Mesh(leg,wood);foot.name='sample-perimeter-seat';foot.position.set(p.x+dx,.14,p.z);this.root.add(foot);}}
  const positions=[[-1.35,3.7],[-1.35,5.2],[6.05,4.4],[6.05,5.5]];
  this.landmarks=positions.map(([x,z],i)=>{const p=worldPoint({x,z});return {id:`sample:${id}:accent-${i}`,asset:theme==='wetland'?(i%2?'pine':'rounded-bush'):theme==='lunar'?'rounded-rock':i%2?'rounded-rock':theme==='glacier'?'glacier-outcrop':'desert-dunes',x:p.x,z:p.z,groundY:0,maxDimension:theme==='wetland'?(i%2?1.4:.75):theme==='lunar'?.75:i%2?.7:1.4,yaw:i*.8};});
  // Distinct authored silhouettes, still with no unregistered walkable obstacle.
  if(theme==='wetland'){
   const stems=new THREE.CylinderGeometry(.014,.018,.65,4),tips=new THREE.CapsuleGeometry(.035,.12,2,4),reed=material('#7a9563'),seed=material('#9a7850');
   for(const [x,z] of [[6.1,.4],[6.15,1],[6.3,2.5],[6.2,3.1],[-1.1,4.3],[-1.2,4.6]]){const p=worldPoint({x,z});for(const [shape,mat,y] of [[stems,reed,.325],[tips,seed,.67]] as const){const mesh=new THREE.Mesh(shape,mat);mesh.name='sample-perimeter-reed';mesh.position.set(p.x,y,p.z);this.root.add(mesh);}}
  }else if(theme==='glacier'){
   const ice=new THREE.ConeGeometry(.3,1.1,5),blue=material('#a4cedb');for(const [x,z,scale] of [[-1.25,.5,1],[-1.15,1.2,.6],[6.25,2.5,1.2],[6.2,3.1,.7]]){const p=worldPoint({x,z}),mesh=new THREE.Mesh(ice,blue);mesh.name='sample-perimeter-ice';mesh.scale.setScalar(scale);mesh.position.set(p.x,.55*scale,p.z);mesh.rotation.y=x;this.root.add(mesh);}
  }else if(theme==='desert'){
   const layers=new THREE.CylinderGeometry(.42,.6,.28,7),sand=material('#c79d67');for(const [x,z,scale] of [[-1.25,.7,1],[6.05,2.1,1.2],[6.1,3,.8]]){const p=worldPoint({x,z}),mesh=new THREE.Mesh(layers,sand);mesh.name='sample-perimeter-sandstone';mesh.scale.setScalar(scale);mesh.position.set(p.x,.14*scale,p.z);this.root.add(mesh);}
  }else{
   const rim=new THREE.TorusGeometry(.72,.12,5,24),basin=new THREE.CircleGeometry(.66,24),rimMaterial=material('#aaa8b6'),basinMaterial=material('#777683');
   for(const [x,z,scale] of [[-1.5,.6,1.25],[6.05,2.7,.8],[-2.5,3.75,.9]]){const p=worldPoint({x,z}),group=new THREE.Group();group.name='sample-lunar-crater';group.position.set(p.x,.06,p.z);group.scale.setScalar(scale);const edge=new THREE.Mesh(rim,rimMaterial);edge.rotation.x=-Math.PI/2;const bowl=new THREE.Mesh(basin,basinMaterial);bowl.rotation.x=-Math.PI/2;bowl.position.y=-.025;group.add(edge,bowl);this.root.add(group);}
   const marker=new THREE.RingGeometry(.32,.36,16),markerMaterial=material('#a9a1b7');for(const slot of farm.pendingDIY){const p=worldPoint(slot.position),mesh=new THREE.Mesh(marker,markerMaterial);mesh.name='sample-pending-diy-slot';mesh.userData.pendingDIY=true;mesh.rotation.x=-Math.PI/2;mesh.position.set(p.x,.012,p.z);this.root.add(mesh);}
  }
  // The supplied rocket occupies the old back-left crater site; that crater moves to unused outer-left ground.
  this.landmarkBounds=visitorLandmarkBounds(id);this.suppliedLandmark=new VisitorLandmarkScene(this.root,id,options.landmark);
  this.environment=new HunyuanEnvironmentScene(this.root,options);this.environment.update(this.landmarks);
  if(theme==='lunar')this.court=new LunarBasketballCourt(this.root,{scale:LUNAR_SHOWCASE_LAYOUT.courtScale,stand:LUNAR_SHOWCASE_LAYOUT.courtStand,groundHeight:(x,z)=>{const tile=farm.state.tiles.find(t=>t.x===Math.round(x/2+1.5)&&t.z===Math.round(z/2+1.5));if(!tile)return 0;const center=worldPoint(tile);return terrainSurfaceHeight(tile,x-center.x,z-center.z,farm.state.tiles);}});
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.court?.dispose();this.suppliedLandmark.dispose();this.environment.dispose();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();this.root.removeFromParent();this.root.clear();}
}
