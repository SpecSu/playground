import test from 'node:test';
import assert from 'node:assert/strict';
import {OrthographicCamera,Plane,Ray,Vector3} from 'three';

const bounds={minX:-5.5,maxX:5.5,minZ:-5.5,maxZ:5.5};
const base={dt:1/60,aspect:390/844,mode:'third-person' as const,position:{x:0,z:0},bounds};
const close=(actual:number,expected:number,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} should be ${expected}`);
async function api(){
 return import('../src/v5/isometric-camera.ts').catch(error=>assert.fail(`Farm isometric camera is not implemented: ${error.message}`));
}
function focus(camera:OrthographicCamera){
 return new Ray(camera.position,camera.getWorldDirection(new Vector3())).intersectPlane(new Plane(new Vector3(0,1,0),-.6),new Vector3())!;
}
function settle(controller:{update:(o:typeof base)=>OrthographicCamera},options:typeof base,frames=180){
 for(let i=0;i<frames;i++)controller.update(options);
}

test('farm starts with a broad orthographic view at a fixed 45 degree yaw and 52 degree pitch',async()=>{
 const {EstateCameraController}=await api(),controller=new EstateCameraController(),camera=controller.update(base);
 assert.ok(camera instanceof OrthographicCamera);assert.equal(camera,controller.camera);
 close(camera.right-camera.left,10);close((camera.right-camera.left)/(camera.top-camera.bottom),390/844);
 const direction=camera.getWorldDirection(new Vector3());
 close(direction.x,direction.z);assert.ok(direction.x<0);close(Math.asin(-direction.y)*180/Math.PI,52);
 close(focus(camera).x,0);close(focus(camera).z,0);
});

test('walking and body heading never rotate the view or replace the camera',async()=>{
 const {EstateCameraController}=await api(),controller=new EstateCameraController(),camera=controller.update(base),rotation=camera.quaternion.clone();
 for(let i=0;i<120;i++){
  const input={...base,position:{x:Math.sin(i/12)*3,z:Math.cos(i/12)*3},heading:i/4};
  assert.equal(controller.update(input),camera);assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
 }
});

test('screen up and right project in their named directions and all eight inputs have equal world speed',async()=>{
 const {EstateCameraController,screenMovement}=await api(),camera=new EstateCameraController().update(base),origin=new Vector3(0,0,0).project(camera);
 for(const [dx,dz] of [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]]){
  const movement=screenMovement(camera,dx,dz);close(Math.hypot(movement.x,movement.z),1);
  const projected=new Vector3(movement.x,0,movement.z).project(camera).sub(origin);
  if(dx)assert.ok(projected.x*dx>0);else close(projected.x,0);
  if(dz)assert.ok(projected.y*-dz>0);else close(projected.y,0);
 }
 assert.deepEqual(screenMovement(camera,0,0),{x:0,z:0});
});

test('portrait and landscape resizing preserve projection aspect and camera orientation',async()=>{
 const {EstateCameraController}=await api(),controller=new EstateCameraController(),camera=controller.update(base),rotation=camera.quaternion.clone();
 for(const aspect of [1,16/9,320/932,390/844]){
  controller.update({...base,aspect});close((camera.right-camera.left)/(camera.top-camera.bottom),aspect);
  close(camera.right-camera.left,10);assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
  const right=new Vector3(1,0,-1).project(camera),left=new Vector3(-1,0,1).project(camera);
  assert.ok(right.x>left.x);
 }
});

test('overview widens the same fixed lens to fourteen cells',async()=>{
 const {EstateCameraController}=await api(),controller=new EstateCameraController(),camera=controller.update(base),rotation=camera.quaternion.clone();
 const overview={...base,mode:'overview' as const};for(let i=0;i<180;i++)controller.update(overview);
 close(camera.right-camera.left,14,1e-6);assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
});

test('translation follows smoothly rather than snapping or lagging differently with frame rate',async()=>{
 const {EstateCameraController}=await api(),a=new EstateCameraController(),b=new EstateCameraController();a.update(base);b.update(base);
 const next={...base,position:{x:3,z:2}};a.update(next);const first=focus(a.camera);
 assert.ok(first.x>0&&first.x<3);assert.ok(first.z>0&&first.z<2);
 a.reset();a.update(base);
 for(let i=0;i<60;i++)a.update(next);for(let i=0;i<30;i++)b.update({...next,dt:1/30});
 close(focus(a.camera).x,focus(b.camera).x);close(focus(a.camera).z,focus(b.camera).z);
});

test('follow focus stays inside legal bounds while leaving the edge player comfortably visible',async()=>{
 const {EstateCameraController}=await api();
 for(const position of [{x:5.5,z:5.5},{x:-5.5,z:-5.5},{x:-5.5,z:5.5},{x:5.5,z:-5.5}]){
  const camera=new EstateCameraController().update({...base,position}),center=focus(camera),player=new Vector3(position.x,.6,position.z).project(camera);
  assert.ok(center.x>=bounds.minX&&center.x<=bounds.maxX);assert.ok(center.z>=bounds.minZ&&center.z<=bounds.maxZ);
  assert.ok(Math.abs(player.x)<.75);assert.ok(Math.abs(player.y)<.75);
 }
});

test('attention can reframe an interaction without changing angles or losing LX',async()=>{
 const {EstateCameraController}=await api(),controller=new EstateCameraController(),camera=controller.update(base),rotation=camera.quaternion.clone();
 for(let i=0;i<180;i++)controller.update({...base,attention:{x:99,z:99,zoom:1.15}});
 const center=focus(camera),player=new Vector3(0,.6,0).project(camera);
 assert.ok(center.x>0&&center.z>0);assert.ok(Math.abs(player.x)<.8&&Math.abs(player.y)<.8);
 assert.ok(camera.quaternion.angleTo(rotation)<1e-7);assert.ok(camera.right-camera.left<10);
 settle(controller,base);close(focus(camera).x,0,1e-6);close(camera.right-camera.left,10,1e-6);
});

test('reset snaps to the next valid focus without changing the fixed lens direction',async()=>{
 const {EstateCameraController}=await api(),controller=new EstateCameraController(),camera=controller.update(base),rotation=camera.quaternion.clone();
 controller.reset();controller.update({...base,position:{x:3,z:-2}});close(focus(camera).x,3);close(focus(camera).z,-2);
 assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
});
test('joystick diagonals align with the exact pixel direction after isometric foreshortening',async()=>{
 const {EstateCameraController,screenMovement}=await api(),camera=new EstateCameraController().update(base),origin=new Vector3(0,0,0).project(camera);
 for(const [dx,dz] of [[1,-1],[-1,-1],[1,1],[-1,1],[.3,-1]]){
  const v=screenMovement(camera,dx,dz),p=new Vector3(v.x,0,v.z).project(camera).sub(origin),pixel={x:p.x*390,y:-p.y*844};
  close(pixel.x*dz-pixel.y*dx,0,1e-6);
 }
});
test('ground clicks round-trip the camera projection in all four connected regions',async()=>{
 const {EstateCameraController}=await api(),{Raycaster,Vector2}=await import('three');const camera=new EstateCameraController().update(base);
 for(const [x,z] of [[4,4],[8,4],[8,8],[4,8]]){
  const ground=new Vector3(x-5.5,0,z-5.5),screen=ground.clone().project(camera),ray=new Raycaster();ray.setFromCamera(new Vector2(screen.x,screen.y),camera);
  const picked=ray.ray.intersectPlane(new Plane(new Vector3(0,1,0),0),new Vector3())!;close(picked.x,ground.x);close(picked.z,ground.z);
 }
});
