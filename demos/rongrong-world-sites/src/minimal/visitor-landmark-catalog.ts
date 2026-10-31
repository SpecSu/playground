export type VisitorLandmarkRecord={id:string;label:string;url:string;sha256:string;bytes:number;triangles:number;nativeBounds:{min:readonly number[];max:readonly number[]};sourceSha256:string};
/** User-supplied static landmarks. Only embedded texture resolution changed, not geometry.
 * Stable sample IDs map display art only: no account, inventory or navigation authority. */
export const VISITOR_LANDMARKS:Readonly<Record<string,VisitorLandmarkRecord>>={
 "oasis": {
  "id": "golden-pyramid",
  "label": "金色金字塔",
  "url": "/models/landmarks/golden-pyramid.glb",
  "sha256": "356692faf52f7ad012dccc4dc9b50f1b528ae5d02dacbe74e70c1693f651b749",
  "bytes": 3941752,
  "triangles": 50000,
  "nativeBounds": {
   "min": [
    -0.3816879987716675,
    -5.0732696847761625e-08,
    -0.3902680504160797
   ],
   "max": [
    0.3816800117492676,
    0.5450910990509895,
    0.37759113787888293
   ]
  },
  "sourceSha256": "461fd584cf11791d7f9eb2c2401edda090780b8c1d70e35ee57e6e5c67069a04"
 },
 "glacier": {
  "id": "ice-castle",
  "label": "冰雪城堡",
  "url": "/models/landmarks/ice-castle.glb",
  "sha256": "752ba26d0a73085412d76654967608ba3a4d38cb73288f78e014bd33c73364d4",
  "bytes": 4009248,
  "triangles": 50000,
  "nativeBounds": {
   "min": [
    -0.403672993183136,
    -4.1569019461383197e-08,
    -0.29437402865697715
   ],
   "max": [
    0.40252599120140076,
    0.8286921698796129,
    0.30938816460508595
   ]
  },
  "sourceSha256": "ec41225fe83e144a3b6fff7e6182fb39ce2cf963a17fe5807336df31f8b80635"
 },
 "forest": {
  "id": "eiffel-tower",
  "label": "埃菲尔铁塔",
  "url": "/models/landmarks/eiffel-tower.glb",
  "sha256": "1b65a6aa47eb94a9921588fbd097929becbecc86fbfbe8217f659faa3099fb45",
  "bytes": 4464056,
  "triangles": 50014,
  "nativeBounds": {
   "min": [
    -0.28954198956489563,
    -3.855601865147872e-08,
    -0.28770805290592144
   ],
   "max": [
    0.28833600878715515,
    0.8934551872336512,
    0.28696314459204625
   ]
  },
  "sourceSha256": "1d87752b263b616248e33cdeaca33dac326005e00c4dc979d38d8cff01b2de20"
 },
 "lunar": {
  "id": "rocket-launch-pad",
  "label": "火箭发射台",
  "url": "/models/landmarks/rocket-launch-pad.glb",
  "sha256": "a09a3ba6dc4310477011e203ffe4fdb25eaa6c3546c1bfcd71be922d63b778f7",
  "bytes": 3931840,
  "triangles": 50000,
  "nativeBounds": {
   "min": [
    -0.4797320067882538,
    -6.790886643322897e-08,
    -0.45781207275301117
   ],
   "max": [
    0.49358099699020386,
    0.6709121790130799,
    0.5054291875165609
   ]
  },
  "sourceSha256": "5eb56f06c1442e869aebdade6e7a2fd8063d84da3675a7172017f11805e304da"
 }
};
export function visitorLandmarkFor(sampleId:string):VisitorLandmarkRecord|undefined{return Object.hasOwn(VISITOR_LANDMARKS,sampleId)?VISITOR_LANDMARKS[sampleId]:undefined;}
export function visitorLandmarkTransform(sampleId:string){
 const r=visitorLandmarkFor(sampleId);if(!r)return undefined;const {min,max}=r.nativeBounds;
 const size=max.map((v,i)=>v-min[i]),scale=Math.min(4.8/Math.max(size[0],size[2]),5.5/size[1]);
 return {x:-7,z:-6.8,scale,offset:{x:-(min[0]+max[0])/2*scale,y:-min[1]*scale,z:-(min[2]+max[2])/2*scale}};
}
/** Exact complete geometry bounds, usable by visitor-only framing before asynchronous bytes load. */
export function visitorLandmarkBounds(sampleId:string){
 const r=visitorLandmarkFor(sampleId),t=visitorLandmarkTransform(sampleId);if(!r||!t)return undefined;
 const [x0,y0,z0]=r.nativeBounds.min,[x1,y1,z1]=r.nativeBounds.max;
 return {min:{x:t.x+t.offset.x+x0*t.scale,y:t.offset.y+y0*t.scale,z:t.z+t.offset.z+z0*t.scale},max:{x:t.x+t.offset.x+x1*t.scale,y:t.offset.y+y1*t.scale,z:t.z+t.offset.z+z1*t.scale}};
}
