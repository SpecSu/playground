import * as THREE from 'three';
import {createDockArt} from './dock.js';import {createAquariumArt} from './aquarium.js';
import {SHARED_CELL_SIZE as S,GROUND_TOP_Y as Y} from './physical-contract.js';
/** Temporary build presentation only; availability is determined by constructionView. */
export function createConstructionArt(build,tileTemplate){
 const root=new THREE.Group(),materials=[],owned=[];root.name='Construction-'+build.id;
 if(build.kind==='tank'){const tank=createAquariumArt({cells:build.cells});root.add(tank.root);owned.push(tank);}
 else for(const cell of build.cells){const part=build.kind==='dock'?createDockArt():{root:tileTemplate.clone(true)};part.root.position.set(cell.x*S,Y,cell.z*S);root.add(part.root);owned.push(part);}
 root.traverse(n=>{if(n.isMesh){n.castShadow=false;n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of Array.isArray(n.material)?n.material:[n.material]){m.transparent=true;m.depthWrite=false;m.userData.buildOpacity=m.opacity;materials.push(m);}}});
 const centre=build.cells.reduce((p,c)=>({x:p.x+c.x*S/build.cells.length,z:p.z+c.z*S/build.cells.length}),{x:0,z:0});
 return {root,centre,update(now){const p=THREE.MathUtils.clamp((now-build.startedAt)/(build.readyAt-build.startedAt),0,1);for(const m of materials)m.opacity=m.userData.buildOpacity*(.25+.65*p);if(build.kind==='tank'){root.scale.y=.12+.88*p;root.position.y=Y*(1-root.scale.y);}else root.position.y=-.65*(1-p);},dispose(){materials.forEach(m=>m.dispose());for(const p of owned)p.dispose?.();}};
}
