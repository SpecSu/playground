import * as T from 'three';
import {ALERT_GOLD} from '../art/feedback-palette.js';
/** Readiness is an object selection, never a modification of its leaf/petal materials. */
export function createReadyAccent(root){root.userData.readySilhouette=false;return{set(ready){root.userData.readySilhouette=!!ready;}};}
/** Same outside-only/depth predicate used by the shared GPU composite. */
export function outlineEdgeVisible(centreMask,centreDepth,neighbours){return centreMask<.5&&neighbours.some(n=>n.mask>.5&&n.depth<=centreDepth+.00002);}

/** One union mask + one composite for the entire scene, not a pass per plant.
 * The mask contains full opaque scene depth. Foreground bodies never receive an
 * outline from a selected plant behind them. Internal overlapping plant meshes
 * all write the same white mask, so their material/normal edges cannot appear.
 */
export function createReadyOutline({scene,camera,renderer}){
 const target=new T.WebGLRenderTarget(1,1,{minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:true});target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
 const white=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide,toneMapped:false}),black=new T.MeshBasicMaterial({color:0,side:T.DoubleSide,toneMapped:false});
 const materials=new Map(),entries=[];const blackBackground=new T.Color(0),oldClear=new T.Color();
 const uniforms={uMask:{value:target.texture},uDepth:{value:target.depthTexture},uTexel:{value:new T.Vector2(1,1)},uGold:{value:new T.Color(ALERT_GOLD)}};
 const compositeMaterial=new T.ShaderMaterial({uniforms,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 vUv;uniform sampler2D uMask;uniform sampler2D uDepth;uniform vec2 uTexel;uniform vec3 uGold;
void main(){float centre=texture2D(uMask,vUv).r;if(centre>.5)discard;float depth=texture2D(uDepth,vUv).r;float edge=0.;
for(int i=0;i<8;i++){float angle=float(i)*.78539816339;vec2 p=vUv+vec2(cos(angle),sin(angle))*uTexel*1.35;float selected=texture2D(uMask,p).r;float neighbourDepth=texture2D(uDepth,p).r;edge=max(edge,step(.5,selected)*step(neighbourDepth,depth+.00002));}
if(edge<.5)discard;gl_FragColor=vec4(uGold,.88);
#include <colorspace_fragment>
}`});
 const compositeScene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),compositeMaterial),quadCamera=new T.Camera();quad.frustumCulled=false;compositeScene.add(quad);
 function variant(material,selected){if(!material?.alphaTest)return selected?white:black;let pair=materials.get(material);if(!pair){pair=[false,true].map(on=>new T.MeshBasicMaterial({color:on?0xffffff:0,side:material.side,alphaTest:material.alphaTest,map:material.map,alphaMap:material.alphaMap,toneMapped:false}));materials.set(material,pair);}return pair[selected?1:0];}
 function refresh(){entries.length=0;scene.traverse(o=>{if(!o.isMesh&&!o.isLine&&!o.isPoints&&!o.isSprite)return;let owner=null,below=false;for(let p=o;p;p=p.parent){if(Object.hasOwn(p.userData,'readySilhouette'))owner=p;if(p.userData.waterPass==='below')below=true;}const originals=Array.isArray(o.material)?o.material:[o.material];const omit=!o.isMesh||below||originals.every(m=>!m||m.isShaderMaterial||m.opacity===0||(m.transparent&&!m.depthWrite));entries.push({o,owner,omit,original:o.material,off:originals.map(m=>variant(m,false)),on:originals.map(m=>variant(m,true))});});}
 function resize(width,height){const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));target.setSize(w,h);uniforms.uTexel.value.set(1/w,1/h);}
 function render(){if(!entries.some(e=>e.owner?.userData.readySilhouette&&e.o.visible))return;
  const oldTarget=renderer.getRenderTarget(),background=scene.background,tone=renderer.toneMapping,auto=renderer.autoClear,shadowAuto=renderer.shadowMap.autoUpdate,shadowNeed=renderer.shadowMap.needsUpdate,alpha=renderer.getClearAlpha();renderer.getClearColor(oldClear);
  try{renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.toneMapping=T.NoToneMapping;renderer.autoClear=true;scene.background=blackBackground;renderer.setClearColor(0,1);
   for(const e of entries){e.wasVisible=e.o.visible;e.original=e.o.material;if(e.omit)e.o.visible=false;else{const list=e.owner?.userData.readySilhouette?e.on:e.off;e.o.material=Array.isArray(e.original)?list:list[0];}}
   renderer.setRenderTarget(target);renderer.render(scene,camera);
   for(const e of entries){e.o.material=e.original;e.o.visible=e.wasVisible;}scene.background=background;renderer.setRenderTarget(oldTarget);renderer.autoClear=false;renderer.render(compositeScene,quadCamera);
  }finally{for(const e of entries){e.o.material=e.original;if(e.wasVisible!==undefined)e.o.visible=e.wasVisible;}scene.background=background;renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldClear,alpha);renderer.toneMapping=tone;renderer.autoClear=auto;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeed;}
 }
 return{refresh,resize,render,dispose(){target.dispose();white.dispose();black.dispose();for(const pair of materials.values())pair.forEach(m=>m.dispose());compositeMaterial.dispose();quad.geometry.dispose();}};
}
