import './room-loader.mjs';import test from 'node:test';import assert from 'node:assert/strict';
const {createYachtWorld,FISHING_SEATS,catchDisplayScale}=await import('../lib/fishing-world.ts');
test('yacht factory contains ten unique safe fishing berths and finite exportable geometry',()=>{const w=createYachtWorld();assert.equal(FISHING_SEATS.length,10);assert.equal(new Set(FISHING_SEATS.map(s=>`${s.x},${s.z}`)).size,10);let meshes=0;w.scene.traverse(o=>{if(o.isMesh){meshes++;const a=o.geometry.attributes.position;for(let i=0;i<a.array.length;i++)assert.ok(Number.isFinite(a.array[i]));}});assert.ok(meshes>50);w.animate(120,false);assert.ok(Number.isFinite(w.yacht.rotation.z));w.dispose();});
test('catch scale retains dramatic size difference without making huge fish invisible',()=>{assert.ok(catchDisplayScale(900)>catchDisplayScale(10)*7);assert.ok(catchDisplayScale(10)>=0.2);assert.ok(catchDisplayScale(900)<=4);});
test('teak deck sits visibly above the white hull and beneath avatars',()=>{const w=createYachtWorld();const hull=w.scene.getObjectByName('Sculpted ivory hull');hull.geometry.computeBoundingBox();w.deck.geometry.computeBoundingBox();assert.ok(w.deck.geometry.boundingBox.max.y+w.deck.position.y>hull.geometry.boundingBox.max.y+hull.position.y+.03);assert.ok(w.deck.geometry.boundingBox.max.y+w.deck.position.y<1.54);w.dispose();});
test('closeup camera fits all largest species at the actual mobile aspect',async()=>{const {fitFishingCloseup}=await import('../lib/fishing-camera.ts');const {createMarineModel}=await import('../components/fishing/MarineModels.ts');const {MARINE_SPECIES}=await import('../lib/fishing-catalog.ts');const THREE=await import('three');for(const species of MARINE_SPECIES){const model=createMarineModel(species.id,species.maxCm);const scale=catchDisplayScale(species.maxCm);const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).multiplyScalar(scale);const width=Math.max(1.4,size.x),height=Math.max(2.3,size.y+.5),depth=Math.max(1,size.z+1);const d=fitFishingCloseup({width,height,depth},35,390/758);const visibleWidth=2*(d-depth*.5)*Math.tan(35*Math.PI/360)*(390/758);assert.ok(visibleWidth>width*1.1,species.id+' fits horizontal with margin');assert.ok(Number.isFinite(d)&&d>0);}});

test('narrow yacht preserves its length and full-size guest transforms', async()=>{
 const THREE=await import('three');const w=createYachtWorld();const hull=w.scene.getObjectByName('Sculpted ivory hull');
 const bounds=new THREE.Box3().setFromObject(hull);const size=bounds.getSize(new THREE.Vector3());
 assert.ok(size.x>6.5&&size.x<7,'hull is 27% narrower than the original 9.3-unit beam');
 assert.ok(size.z>17&&size.z<18,'hull length is preserved');
 assert.deepEqual(w.yacht.scale.toArray(),[1,1,1]);
 for(const seat of FISHING_SEATS){assert.ok(Math.abs(seat.x)>2.1&&Math.abs(seat.x)<2.4);assert.ok(Math.abs(seat.x)+.65<3.1);}
 const guest=new THREE.Object3D();w.yacht.add(guest);w.yacht.updateMatrixWorld(true);assert.ok(guest.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))<1e-8);
 w.dispose();
});

test('two ambient berths have a supported upper deck without using human slots',async()=>{
 const mod=await import('../lib/fishing-world.ts');const THREE=await import('three');
 assert.equal(mod.FISHING_AMBIENT_SEATS?.length,2);
 assert.equal(mod.FISHING_RENDER_SEATS?.length,12);assert.equal(mod.FISHING_SEATS.length,10);
 const w=mod.createYachtWorld();assert.ok(w.yacht.getObjectByName('Upper-deck safety rail'));
 for(const seat of mod.FISHING_AMBIENT_SEATS){
  assert.ok(seat.y>3.56&&seat.y<3.62);assert.ok(seat.z>-3.3);assert.ok(Math.abs(seat.x)>1.3&&Math.abs(seat.x)<1.7);
  const ray=new THREE.Raycaster(new THREE.Vector3(seat.x,seat.y+.1,seat.z),new THREE.Vector3(0,-1,0));
  w.yacht.updateMatrixWorld(true);const top=ray.intersectObjects(w.yacht.children,true).find(hit=>{for(let object=hit.object;object;object=object.parent)if(!object.visible)return false;return true;});
  assert.ok(top&&top.point.y>3.5&&top.point.y<seat.y,'roof supports the new fishing spot');
 }
 w.dispose();
});

 test('all twelve fishing positions have optional white selectors hidden before joining',async()=>{
 const {FISHING_RENDER_SEATS}=await import('../lib/fishing-world.ts');
 const w=createYachtWorld();
 try {
  assert.equal(FISHING_RENDER_SEATS.length,12);
  assert.equal(new Set(FISHING_RENDER_SEATS.map(s=>`${s.x},${s.y},${s.z}`)).size,12);
  const stationRings=[];const lifeRings=[];
  w.yacht.traverse(o=>{
   if(o.isMesh&&o.geometry.type==='TorusGeometry'){
    if(o.geometry.parameters.tube<.02)stationRings.push(o);
    else lifeRings.push(o);
   }
  });
  assert.equal(stationRings.length,0,'no permanent torus rings are painted onto the deck');
  assert.equal(w.seatMarkers.length,12);assert.ok(w.seatMarkers.every(marker=>!marker.root.visible&&marker.ring.material.color.getHexString()==='ffffff'));
  assert.equal(lifeRings.length,1,'the existing safety life ring is preserved');
 }finally{w.dispose();}
});
