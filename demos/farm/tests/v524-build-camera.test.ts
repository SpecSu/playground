import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Plane,Ray,type OrthographicCamera} from 'three';
import {EstateCameraController,type EstateCameraOptions} from '../src/v5/isometric-camera.ts';
import {EstateWorld,type EstateGhost} from '../src/v5/EstateWorld.ts';
import {gridToWorld} from '../src/v5/estate-scene.ts';
const bounds={minX:-11.5,maxX:17.5,minZ:-11.5,maxZ:11.5};
const options:EstateCameraOptions={dt:1/60,aspect:390/844,mode:'third-person',position:gridToWorld({x:7,z:14}),bounds};
const center=(camera:OrthographicCamera)=>new Ray(camera.position,camera.getWorldDirection(new Vector3())).intersectPlane(new Plane(new Vector3(0,1,0),-.6),new Vector3())!;
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} should equal ${b}`);
function settle(controller:EstateCameraController,o:EstateCameraOptions&{previewFocus?:{x:number;z:number}}){for(let i=0;i<180;i++)controller.update(o);return controller.camera;}
test('a south-valley visitor can actually see the tower placement above the compact build card',()=>{
 const controller=new EstateCameraController();controller.update(options);const previewFocus=gridToWorld({x:8.5,z:1.5});
 const camera=settle(controller,{...options,previewFocus,attention:{...previewFocus,zoom:1.06}});
 for(const [x,z] of [[8,1],[9,1],[8,2],[9,2],[8.5,1.5]]){const w=gridToWorld({x,z}),ndc=new Vector3(w.x,.25,w.z).project(camera),pixelY=(1-ndc.y)/2*844;assert.ok(Math.abs(ndc.x)<.9,'preview lies inside horizontal screen bounds');assert.ok(pixelY>220&&pixelY<476,`preview must be between the top HUD and the maximum-height bottom card, got ${pixelY}`);}
});
test('preview pan keeps fixed yaw and pitch, then restores the unchanged LX follow lens',()=>{
 const controller=new EstateCameraController(),camera=controller.update(options),rotation=camera.quaternion.clone(),original=center(camera).clone();
 const previewFocus=gridToWorld({x:8.5,z:1.5});for(let i=0;i<180;i++){controller.update({...options,previewFocus});assert.ok(camera.quaternion.angleTo(rotation)<1e-7);}
 const target=center(camera);close(target.x,previewFocus.x);close(target.z,previewFocus.z);
 controller.update(options);const returning=center(camera);assert.ok(returning.distanceTo(original)>0&&returning.distanceTo(original)<target.distanceTo(original),'closing the preview returns toward LX smoothly, without a snap');assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
 settle(controller,options);close(center(camera).x,original.x);close(center(camera).z,original.z);close(camera.right-camera.left,10);close(camera.top,-camera.bottom);
});
test('edge previews respect world bounds and remain above the compact card in both camera modes',()=>{
 for(const mode of ['third-person','overview'] as const)for(const previewFocus of [{x:bounds.minX+1,z:0},{x:bounds.maxX-1,z:0},{x:0,z:bounds.minZ+1},{x:0,z:bounds.maxZ-1}]){
  const camera=settle(new EstateCameraController(),{...options,mode,previewFocus}),focus=center(camera),ndc=new Vector3(previewFocus.x,.25,previewFocus.z).project(camera);
  assert.ok(focus.x>=bounds.minX&&focus.x<=bounds.maxX&&focus.z>=bounds.minZ&&focus.z<=bounds.maxZ);assert.ok(Math.abs(ndc.x)<.9);assert.ok((1-ndc.y)/2*844<476);
 }
});
test('EstateWorld forwards the actual ghost footprint center and removes preview focus with the ghost',()=>{
 const world=Object.create(EstateWorld.prototype) as {cameraUpdate:(dt:number)=>void;ghost?:EstateGhost};let received:EstateCameraOptions&{previewFocus?:{x:number;z:number}}|undefined;
 Object.assign(world,{host:{clientWidth:390,clientHeight:844},cameraController:{update:(o:EstateCameraOptions)=>{received=o;return undefined;}},player:{root:{position:options.position}},cameraMode:'third-person',attention:null,reduced:false,ghost:{x:7,z:4,kind:'shelter',valid:true}});
 world.cameraUpdate(1/60);assert.deepEqual(received?.previewFocus,gridToWorld({x:8,z:5}));world.ghost=undefined;world.cameraUpdate(1/60);assert.equal(received?.previewFocus,undefined);
});
