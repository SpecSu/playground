import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as stage from '../src/stage.js';
function project(frame, aspect, y, z=0) {
  const camera = new THREE.PerspectiveCamera(33,aspect,.05,80);
  camera.position.fromArray(frame.position); camera.lookAt(...frame.target); camera.updateMatrixWorld();
  return (1-new THREE.Vector3(0,y,z).project(camera).y)/2;
}
test('playing and paused enlarge performer approximately150% while leaving hit line clear', () => {
 const old={position:[0,1.75,8],target:[0,.42,0]};
 for(const aspect of [9/16,390/844,3/4])for(const mode of ['playing','paused']){
 const frame=stage.stageCameraFraming(mode,false,0);
 const ratio=(project(frame,aspect,0)-project(frame,aspect,1.9))/(project(old,aspect,0)-project(old,aspect,1.9));
 assert(ratio>1.43&&ratio<1.55,'apparent scale '+ratio);
 assert(project(frame,aspect,1.9)>.04);assert(project(frame,aspect,1.9)<.15);
 assert(project(frame,aspect,0)<.75);
 }
});
test('lobby and detail framing remain unchanged; paused ignores a stale close-up flag', () => {
  assert.equal(typeof stage.stageCameraFraming,'function');
  assert.deepEqual(stage.stageCameraFraming('lobby',false,.12),{position:[.12,1.9,7.6],target:[-.30,.25,0]});
  assert.deepEqual(stage.stageCameraFraming('lobby',true,.12),{position:[.07,1.75,3.2],target:[-.13,1.30,0]});
  assert.deepEqual(stage.stageCameraFraming('paused',true,.22),stage.stageCameraFraming('playing',false,.22));
});
test('reduced motion stays static150% and raised extremities retain a safety retreat',()=>{
 const base=stage.stageCameraFraming('playing',false,0);
 for(const t of [0,1,8,10,30,59])assert.deepEqual(stage.stagePerformanceFraming(t,120,1,true,2.7),base);
 const near=stage.stagePerformanceFraming(0,120,1);assert(near.position[2]<base.position[2]*.8);
 assert(stage.stagePerformanceFraming(0,120,1,false,2.5).position[2]>near.position[2]);
});
