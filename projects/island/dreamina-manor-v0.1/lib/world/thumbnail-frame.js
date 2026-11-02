import * as THREE from 'three';
// Catalogue icons fill their own physical projected bounds. Inventory thumbnails
// retain the shared per-species scale so giant variants remain visibly larger.
export function frameThumbnail(box){const centre=box.getCenter(new THREE.Vector3()),forward=new THREE.Vector3(4,2.7,6).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),forward).normalize(),up=new THREE.Vector3().crossVectors(forward,right).normalize();let extent=0;for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).sub(centre);extent=Math.max(extent,Math.abs(p.dot(right)),Math.abs(p.dot(up)));}return{centre,width:Math.max(.001,extent*2*1.1)};}
