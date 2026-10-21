import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('festival keeps the restored interaction surface free of riding commands and visual attachments',()=>{
 for(const path of ['components/DesertScene.tsx','components/DesertFeed.tsx','hooks/useFestivalRoom.ts','lib/festival-types.ts','lib/festival-server.ts','lib/festival-http.ts']){
  assert.doesNotMatch(read(path),/rideTask|rideExit|onEnter|attachRide|deformInstallationRidePose|festival-own-art-marker|type\s*:\s*['"]enter['"]/i,path);
 }
 for(const path of ['lib/festival-ride.ts','src/desert/ride-routes.ts'])assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
 const scene=read('components/DesertScene.tsx');
 assert.match(scene,/if\(picked\)\{focusArtwork\(picked\);/);
 assert.doesNotMatch(scene,/onSelectArtwork|lightingPreview/);
 assert.match(scene,/createDesertFire\(seed,height\*\.95,radius\*1\.8\)/);
 assert.match(scene,/position\.set\(motion\.x,0,motion\.z\)/);
 assert.match(scene,/active:construction\.progress>=1,reducedMotion:reduced/);
 assert.doesNotMatch(scene,/occupied|livingGlow|ride-banner/);
});
