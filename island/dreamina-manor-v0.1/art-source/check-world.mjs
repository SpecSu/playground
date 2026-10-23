import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAquariumArt,aquariumOutline} from '../lib/art/aquarium.js';
import {createDockArt,createRodStationArt} from '../lib/art/dock.js';
for(const cells of [[{x:0,z:0},{x:1,z:0}],[{x:0,z:0},{x:1,z:0},{x:0,z:1}]]){
 const tank=createAquariumArt({cells});
 const base=new THREE.Box3().setFromObject(tank.root.getObjectByName('ThinAboveGroundPlinth'));
 assert.ok(base.min.y>=.45-1e-6);assert.ok(base.max.y<tank.floorY);assert.equal(tank.root.userData.landCutout,false);assert.equal(tank.root.userData.sharedGlassCount,0);
 assert.equal(tank.waterHeight,2.1);assert.equal(tank.floorY,.59);assert.equal(tank.outline.length,1);
 assert.equal(tank.edges.length,cells.length===2?4:6); // no interior divider
 tank.dispose();
}
assert.throws(()=>createAquariumArt({cells:[{x:0,z:0},{x:1,z:1}]}),/connected/);
const dock=createDockArt(),rod=createRodStationArt();assert.equal(dock.root.userData.topLocalY,0);
rod.pose({state:'ready',time:0,reducedMotion:true});const staticTip=rod.rodTipLocal();rod.pose({state:'ready',time:100,reducedMotion:true});assert.ok(staticTip.equals(rod.rodTipLocal()));
rod.pose({state:'ready',time:0});const before=rod.rodTipLocal();rod.pose({state:'ready',time:100.6});assert.ok(before.distanceTo(rod.rodTipLocal())>.01,'mature rod still responds after 100s');
assert.ok(rod.floatLocal().z>2.4,'float outside dock on water');dock.dispose();rod.dispose();
console.log('PASS above-ground single tank / external glass only / L shape / disconnected rejection / fixed dock / reduced motion / persistent mature pose');
