import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const api = await import('../src/desert/artwork-focus.ts');
test('portrait artwork framing reserves UI space and fits the whole artwork',()=>{
 assert.equal(typeof api.artworkFocusDistance,'function');
 const r=Math.hypot(7,15),d=api.artworkFocusDistance(7,30,55,390/758);
 assert.ok(d*Math.sin(Math.atan(Math.tan(55*Math.PI/360)*(390/758)*.78))>=r);
 assert.ok(d>api.artworkFocusDistance(7,30,55,1.5));
});
test('nameplate width follows measured text with compact padding',()=>{
 assert.equal(typeof api.nameplateLayout,'function');
 assert.deepEqual(api.nameplateLayout(80),{width:112,height:80,worldWidth:1.26,worldHeight:.9});
 assert.ok(api.nameplateLayout(400).worldWidth>api.nameplateLayout(80).worldWidth);
});
test('pending and shader-hidden construction geometry cannot intercept artwork taps',()=>{
 assert.equal(typeof api.intersectVisibleArtwork,'function');
 const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());root.add(mesh);root.updateMatrixWorld(true);
 const positions=mesh.geometry.getAttribute('position'),anchor=new Float32Array(positions.count*4),axis=new Float32Array(positions.count*4);
 for(let i=0;i<positions.count;i++){anchor.set([0,0,0,10],i*4);axis.set([0,1,0,5],i*4);}
 mesh.geometry.setAttribute('aBuildAnchor',new THREE.BufferAttribute(anchor,4));mesh.geometry.setAttribute('aBuildAxis',new THREE.BufferAttribute(axis,4));
 const ray=new THREE.Raycaster(new THREE.Vector3(0,.8,5),new THREE.Vector3(0,0,-1));
 assert.equal(api.intersectVisibleArtwork(ray,root,0,false),null);
 assert.equal(api.intersectVisibleArtwork(ray,root,20,false),null);
 assert.equal(api.intersectVisibleArtwork(ray,root,5,true),null);
 assert.ok(api.intersectVisibleArtwork(ray,root,20,true));
 root.visible=false;assert.equal(api.intersectVisibleArtwork(ray,root,20,true),null);
});

test('long maximum nicknames are capped while LX and 苏贝壳 retain their measured width',()=>{
 const measure=(text:string)=>[...text].reduce((width,char)=>width+(char.charCodeAt(0)<128?24:48),0);
 assert.equal(api.nameplateLayout(measure('LX')).width,80);
 assert.equal(api.nameplateLayout(measure('苏贝壳')).width,176);
 assert.equal(api.nameplateLayout(measure('荒原艺术创作伙伴'.repeat(3).slice(0,20))).width,300);
 assert.ok(api.nameplateLayout(2000).worldWidth<=3.5);
 assert.equal(api.fitNameplateText('LX',measure),'LX');
 assert.equal(api.fitNameplateText('苏贝壳',measure),'苏贝壳');
 const long=api.fitNameplateText('荒原艺术创作伙伴'.repeat(3).slice(0,20),measure);
 assert.ok(long.endsWith('…'));assert.ok(measure(long)<=268);
 const emoji=api.fitNameplateText('🏜️'.repeat(20),measure);
 assert.ok(emoji.endsWith('…'));assert.ok(measure(emoji)<=268);assert.ok(!/[\ud800-\udbff]$/.test(emoji.slice(0,-1)));
});


test('nickname truncation keeps combined emoji and accents intact',()=>{
 const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 for(const glyph of ['👨‍👩‍👧‍👦','👍🏽','é','🏜️']){
  const measure=(text:string)=>[...graphemes.segment(text)].reduce((width,{segment})=>width+(segment===glyph?70:segment==='…'?20:10),0);
  const clipped=api.fitNameplateText(glyph.repeat(20),measure);
  assert.equal(clipped,glyph.repeat(3)+'…');
 }
});
