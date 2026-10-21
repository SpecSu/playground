import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createFarm} from '../src/model.ts';import {makeSheep} from '../src/sheep.ts';
import {Window} from 'happy-dom';
const point=(x=50,y=50,timeStamp=0,pointerId=1,isPrimary=true)=>({pointerId,clientX:x,clientY:y,timeStamp,isPrimary,button:0});
test('only a short primary tap selects; drags, out-and-back movement, multi-touch and cancellation do not',async()=>{
 const {SceneTapGesture}=await import('../src/picking.ts');const gesture=new SceneTapGesture();
 assert.equal(gesture.begin(point()),true);assert.equal(gesture.end(point(53,52,100)),true);
 gesture.begin(point());gesture.move(point(80,50,30));assert.equal(gesture.end(point(50,50,100)),false);
 gesture.begin(point());gesture.cancel(1);assert.equal(gesture.end(point(50,50,100)),false);
 gesture.begin(point());gesture.begin(point(50,50,10,2,false));assert.equal(gesture.end(point(50,50,100)),false);
 gesture.begin(point());assert.equal(gesture.end(point(50,50,900)),false);
 assert.equal(gesture.begin({...point(),button:2}),false);
 const inherited=Object.create(point()) as ReturnType<typeof point>;assert.equal(gesture.begin(inherited),true);assert.equal(gesture.end(point(50,50,100)),true,'DOM PointerEvent coordinates are inherited getters');
});
test('real scene rays pick each procedural sheep independently and the guardian, while occlusion prevents picking through objects',async()=>{
 const {pickSceneEntity}=await import('../src/picking.ts');const farm=createFarm('a',1),scene=new THREE.Scene();
 const camera=new THREE.OrthographicCamera(-6,6,5,-5,.1,100);camera.position.set(0,10,10);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
 const entities:THREE.Object3D[]=farm.animals.map((a,i)=>{const sheep=makeSheep(a);sheep.root.position.x=(i-1)*3;sheep.root.userData.entityId=a.id;scene.add(sheep.root);return sheep.root;});
 const guardian=new THREE.Mesh(new THREE.SphereGeometry(.5),new THREE.MeshBasicMaterial());guardian.position.set(4.6,1,2);guardian.userData.entityId='guardian';scene.add(guardian);entities.push(guardian);
 const rect={left:100,top:70,width:390,height:758};
 for(const entity of entities){const body=entity.position.clone().add(new THREE.Vector3(0,entity===guardian?0:.9,0));const ndc=body.clone().project(camera);const pointer={clientX:rect.left+(ndc.x+1)*rect.width/2,clientY:rect.top+(1-ndc.y)*rect.height/2};assert.equal(pickSceneEntity(scene.children,camera,pointer,rect),entity.userData.entityId);}
 const body=new THREE.Vector3(0,.9,0),ndc=body.clone().project(camera),pointer={clientX:rect.left+(ndc.x+1)*rect.width/2,clientY:rect.top+(1-ndc.y)*rect.height/2};
 const blocker=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());blocker.position.lerpVectors(body,camera.position,.25);scene.add(blocker);assert.equal(pickSceneEntity(scene.children,camera,pointer,rect),undefined);blocker.visible=false;assert.equal(pickSceneEntity(scene.children,camera,pointer,rect),'momo');
 assert.equal(pickSceneEntity(scene.children,camera,{clientX:0,clientY:0},rect),undefined);
});
test('animal and guardian name labels reject drag-generated clicks but preserve taps and keyboard activation',async()=>{
 const {bindEntityLabel}=await import('../src/picking.ts');const window=new Window();
 try{for(const id of ['pipi','momo','doudou','guardian']){
  const label=window.document.createElement('button'),selected:string[]=[],captures=new Set<number>();
  Object.assign(label,{setPointerCapture:(id:number)=>captures.add(id),hasPointerCapture:(id:number)=>captures.has(id),releasePointerCapture:(id:number)=>captures.delete(id)});
  const cleanup=bindEntityLabel(label as unknown as HTMLButtonElement,id,value=>selected.push(value));
  const pointer=(type:string,x:number)=>label.dispatchEvent(new window.PointerEvent(type,{bubbles:true,pointerId:1,isPrimary:true,button:0,clientX:x,clientY:50}));
  pointer('pointerdown',50);pointer('pointermove',90);pointer('pointermove',50);pointer('pointerup',50);label.dispatchEvent(new window.MouseEvent('click',{detail:1}));assert.deepEqual(selected,[]);
  pointer('pointerdown',50);pointer('pointerup',50);label.dispatchEvent(new window.MouseEvent('click',{detail:1}));assert.deepEqual(selected,[id]);
  label.dispatchEvent(new window.MouseEvent('click',{detail:0}));assert.deepEqual(selected,[id,id]);cleanup();
  label.dispatchEvent(new window.MouseEvent('click',{detail:0}));assert.equal(selected.length,2);
 }}finally{await window.happyDOM.close();}
});
