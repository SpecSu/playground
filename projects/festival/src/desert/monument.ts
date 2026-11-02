import * as THREE from 'three';
import { DREAMINA_MONUMENT_RADIUS } from './art-dimensions.ts';

/** A continuous stone top grounded on a broad, low disc; the original curved silhouette stays intact. */
export function createDreaminaMonument(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'dreamina-stone-spinning-top';
  root.userData.radius = DREAMINA_MONUMENT_RADIUS;
  const profile: THREE.Vector2[] = [];
  const cubic = (points: readonly (readonly [number, number])[], samples: number) => {
    const curve = new THREE.CubicBezierCurve(...points.map(([x, y]) => new THREE.Vector2(x, y)) as [THREE.Vector2, THREE.Vector2, THREE.Vector2, THREE.Vector2]);
    const section = curve.getPoints(samples);
    profile.push(...(profile.length ? section.slice(1) : section));
  };
  cubic([[0, 0], [0.58, 0], [0.62, 1.35], [1.25, 3]], 9);
  cubic([[1.25, 3], [4.2, 10.6], [10.8, 14.8], [18.7, 16.6]], 16);
  cubic([[18.7, 16.6], [21.8, 17.3], [21.1, 18.6], [18.5, 19]], 10);
  cubic([[18.5, 19], [5.9, 21], [2.4, 29.3], [1.2, 40.2]], 18);
  cubic([[1.2, 40.2], [0.76, 44.2], [0.83, 46], [0, 46]], 10);
  const grain = new Uint8Array(128 * 128 * 4);
  let seed = 271828;
  for (let i=0;i<128*128;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; const n=70+(seed>>>24)*.55; grain.set([n,n,n,255],i*4); }
  const pores = new THREE.DataTexture(grain,128,128,THREE.RGBAFormat);
  pores.name='weathered-stone-pores';pores.wrapS=pores.wrapT=THREE.RepeatWrapping;pores.repeat.set(5,8);pores.needsUpdate=true;
  const stone = new THREE.MeshStandardMaterial({name:'weathered warm limestone',color:'#C3B39B',roughness:.96,metalness:0,vertexColors:true,bumpMap:pores,bumpScale:.075});
  const geometry = new THREE.LatheGeometry(profile, 80);geometry.scale(.6,.6,.6);geometry.normalizeNormals();
  const vertices=geometry.getAttribute('position'),colors=new Float32Array(vertices.count*3),shade=new THREE.Color();
  for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);const erosion=.88+.075*Math.sin(x*.73+z*.41+y*.32)+.025*Math.sin(y*4.8+x*2.2);shade.setRGB(erosion,erosion*.97,erosion*.91);colors.set([shade.r,shade.g,shade.b],i*3);}
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const top = new THREE.Mesh(geometry,stone);top.name='dreamina-weathered-stone';top.position.y=1.6;top.castShadow=true;top.receiveShadow=true;root.add(top);
  const baseProfile=[[0,0],[10.3,0],[10.8,.2],[10.8,1.35],[10.3,1.6],[0,1.6]].map(([x,y])=>new THREE.Vector2(x,y));
  const baseMaterial=new THREE.MeshStandardMaterial({name:'weathered stone foundation',color:'#A59680',roughness:.98,metalness:0,bumpMap:pores,bumpScale:.04});
  const plate=new THREE.Mesh(new THREE.LatheGeometry(baseProfile,64),baseMaterial);plate.name='dreamina-disc-base';plate.castShadow=true;plate.receiveShadow=true;root.add(plate);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 180;
    const context = canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, 1024, 180); context.fillStyle = '#f0ece2'; context.textAlign = 'center';
      context.font = '500 104px Arial'; context.fillText('Dreamina', 512, 116);
      context.font = '20px Arial'; context.fillText('IMAGINATION LEAVES NO TRACE', 512, 157);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.68), new THREE.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false}));
      label.name = 'dreamina-signature'; label.position.set(0, 1.615, 7); label.rotation.x = -Math.PI / 2;
      root.add(label);
    }
  }
  root.updateMatrixWorld(true);
  return root;
}
