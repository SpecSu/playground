import test from 'node:test';import assert from 'node:assert/strict';
import {LUNAR_SHOWCASE_LAYOUT} from '../src/minimal/lunar-showcase-layout.ts';
import {LUNAR_SHOWCASE_CATALOG} from '../src/minimal/lunar-showcase-catalog.ts';
import {sampleFarm} from '../src/minimal/sample-farms.ts';import {isShopTile} from '../src/minimal/model.ts';
test('adult placement circles and player entry remain on dry owned land with fixed court-facing coordinates',()=>{
 const layout=LUNAR_SHOWCASE_LAYOUT,farm=sampleFarm('lunar',1),actors=LUNAR_SHOWCASE_CATALOG.map(a=>({id:a.id,p:layout.placements[a.id],r:a.profile.bodyRadius*(a.id==='kunkun-chicken'?2:a.id==='floral-vest-person'?3:1.2)+.06}));assert.equal(layout.courtScale,2);assert.deepEqual(layout.courtStand,{x:3,z:3.8});assert.equal(layout.courtHeading,Math.PI);assert.deepEqual(layout.placements['kunkun-chicken'],layout.courtStand);
 for(const a of actors){for(const tile of farm.state.tiles.filter(t=>!t.owned||isShopTile(t)||t.terrain==='pond'||t.terrain==='creek')){const x=(tile.x-1.5)*2,z=(tile.z-1.5)*2;assert.ok(Math.hypot(Math.max(Math.abs(a.p.x-x)-1,0),Math.max(Math.abs(a.p.z-z)-1,0))>a.r,a.id+' touches unavailable terrain');}assert.ok(Math.hypot(a.p.x+1,a.p.z-3)>a.r+.36,a.id+' overlaps player entry');for(const b of actors.filter(b=>b.id!==a.id))assert.ok(Math.hypot(a.p.x-b.p.x,a.p.z-b.p.z)>a.r+b.r,a.id+' overlaps '+b.id);}
 assert.ok(layout.bounds.min.x<=-4&&layout.bounds.max.x>=8&&layout.bounds.min.z<=-9.6&&layout.bounds.max.z>=8&&layout.bounds.max.y>=5.56);
});
