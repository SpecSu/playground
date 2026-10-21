import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

async function captureModule() {
 const result = await import('../src/desert/ceremony-capture.ts').catch(() => null);
 assert.ok(result, 'real post-render capture helper exists'); return result;
}

test('real capture composes a square overview, copies the just-rendered pixels and restores live viewport/camera', async () => {
 const { captureFestivalCeremonyPhoto } = await captureModule();
 const steps: string[] = [], viewport = new THREE.Vector4(0, 0, 390, 758);
 const live = new THREE.PerspectiveCamera(55, 390 / 758, .25, 1600); live.position.set(8, 3, 7);
 const source = { width: 780, height: 1516 } as HTMLCanvasElement;
 let overview: THREE.PerspectiveCamera | null = null;
 const renderer = {
  domElement: source, getPixelRatio: () => 2,
  getViewport(target: THREE.Vector4) { return target.copy(viewport); },
  setViewport(x: THREE.Vector4 | number, y?: number, w?: number, h?: number) { if (x instanceof THREE.Vector4) viewport.copy(x); else viewport.set(x, y!, w!, h!); steps.push('viewport'); },
  render(scene: THREE.Scene, camera: THREE.Camera) { steps.push(camera === live ? 'live' : 'overview'); if (camera !== live) overview = camera as THREE.PerspectiveCamera; },
 };
 const canvas = { width: 0, height: 0, getContext: () => ({ drawImage(...args: unknown[]) { steps.push('copy'); assert.deepEqual(args, [source, 0, 736, 780, 780, 0, 0, 780, 780]); } }), toDataURL(type: string, quality: number) { steps.push('encode'); assert.equal(type, 'image/jpeg'); assert.equal(quality, .92); return 'data:image/jpeg;base64,REALFRAME'; } };
 const original = globalThis.document;
 Object.assign(globalThis, { document: { createElement: () => canvas } });
 try {
  const photo = captureFestivalCeremonyPhoto(renderer, new THREE.Scene(), live, 7, 322000);
  assert.deepEqual(photo, { roundIndex: 7, capturedAt: 322000, dataUrl: 'data:image/jpeg;base64,REALFRAME' });
  assert.deepEqual(steps, ['viewport', 'overview', 'copy', 'encode', 'viewport', 'live']);
  assert.deepEqual(viewport.toArray(), [0, 0, 390, 758]); assert.deepEqual(live.position.toArray(), [8, 3, 7]);
  assert.deepEqual(overview!.position.toArray(), [62, 84, 104]);
  assert.ok(overview!.position.distanceTo(new THREE.Vector3(0, 13, 0)) < new THREE.Vector3(75, 99, 125).distanceTo(new THREE.Vector3(0, 13, 0)), 'souvenir camera is closer without mutating live camera');
  assert.equal(overview!.aspect, 1); assert.equal(canvas.width, canvas.height);
  const monumentTop = new THREE.Vector3(0, 29, 0).project(overview!);
  assert.ok(Math.abs(monumentTop.x) < .8 && Math.abs(monumentTop.y) < .8, 'overview frames the monument');
 } finally { Object.assign(globalThis, { document: original }); }
});

test('tainted or unavailable capture returns no invented image and always restores the live view', async () => {
 const { captureFestivalCeremonyPhoto } = await captureModule();
 const live = new THREE.Camera(), viewport = new THREE.Vector4(0, 0, 390, 758), rendered: THREE.Camera[] = [];
 const renderer = { domElement: { width: 390, height: 758 } as HTMLCanvasElement, getPixelRatio: () => 1, getViewport: (target: THREE.Vector4) => target.copy(viewport), setViewport(x: THREE.Vector4 | number, y?: number, w?: number, h?: number) { if (x instanceof THREE.Vector4) viewport.copy(x); else viewport.set(x, y!, w!, h!); }, render(_: THREE.Scene, camera: THREE.Camera) { rendered.push(camera); } };
 const original = globalThis.document;
 Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ({ drawImage() { throw new Error('tainted canvas'); } }) }) } });
 try { assert.equal(captureFestivalCeremonyPhoto(renderer, new THREE.Scene(), live, 1, 1000), null); assert.equal(rendered.at(-1), live); assert.deepEqual(viewport.toArray(), [0, 0, 390, 758]); }
 finally { Object.assign(globalThis, { document: original }); }
});

for (const failure of [null, 'overview', 'copy', 'encode', 'context'] as const) {
 test(`photo capture suppresses text and emoji speech only, restoring exact live visibility (${failure ?? 'success'})`, async () => {
  const { captureFestivalCeremonyPhoto } = await captureModule();
  const scene = new THREE.Scene(), live = new THREE.Camera(), viewport = new THREE.Vector4(0, 0, 390, 758);
  const text = new THREE.Sprite(), emoji = new THREE.Sprite(), hiddenSpeech = new THREE.Sprite(), name = new THREE.Sprite(), artwork = new THREE.Mesh();
  for (const speech of [text, emoji, hiddenSpeech]) speech.userData.festivalSpeechBubble = true;
  hiddenSpeech.visible = false; scene.add(text, emoji, hiddenSpeech, name, artwork);
  const state = () => [text, emoji, hiddenSpeech, name, artwork].map(node => node.visible);
  const renders: { live: boolean; visible: boolean[] }[] = [];
  const renderer = {
   domElement: { width: 390, height: 758 } as HTMLCanvasElement, getPixelRatio: () => 1,
   getViewport: (target: THREE.Vector4) => target.copy(viewport),
   setViewport(x: THREE.Vector4 | number, y?: number, width?: number, height?: number) { if (x instanceof THREE.Vector4) viewport.copy(x); else viewport.set(x, y!, width!, height!); },
   render(_scene: THREE.Scene, camera: THREE.Camera) {
    renders.push({ live: camera === live, visible: state() });
    if (failure === 'overview' && camera !== live) throw new Error('temporary capture render error');
   },
  };
  const original = globalThis.document;
  Object.assign(globalThis, { document: { createElement: () => ({
   getContext: () => failure === 'context' ? null : { drawImage() { if (failure === 'copy') throw new Error('copy error'); } },
   toDataURL() { if (failure === 'encode') throw new Error('encoding error'); return 'data:image/jpeg;base64,REALFRAME'; },
  }) } });
  try {
   const photo = captureFestivalCeremonyPhoto(renderer, scene, live, 1, 1000);
   assert.equal(Boolean(photo), failure === null);
   if (failure !== 'context') assert.deepEqual(renders[0], { live: false, visible: [false, false, false, true, true] }, 'The photo removes only speech sprites, including emoji');
   assert.deepEqual(renders.at(-1), { live: true, visible: [true, true, false, true, true] }, 'The visible canvas is restored synchronously before the capture call returns');
   assert.deepEqual(state(), [true, true, false, true, true]);
   assert.deepEqual(viewport.toArray(), [0, 0, 390, 758]);
  } finally { Object.assign(globalThis, { document: original }); }
 });
}

test('speech visibility restores even if the final live repaint itself fails', async () => {
 const { captureFestivalCeremonyPhoto } = await captureModule();
 const scene = new THREE.Scene(), live = new THREE.Camera(), speech = new THREE.Sprite();
 speech.userData.festivalSpeechBubble = true; scene.add(speech);
 const duringRender: boolean[] = [];
 const renderer = {
  domElement: { width: 390, height: 758 } as HTMLCanvasElement, getPixelRatio: () => 1,
  getViewport: (target: THREE.Vector4) => target.set(0, 0, 390, 758), setViewport() {},
  render(_scene: THREE.Scene, camera: THREE.Camera) { duringRender.push(speech.visible); if (camera === live) throw new Error('live renderer failure'); },
 };
 const original = globalThis.document;
 Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,REALFRAME' }) } });
 try {
  assert.throws(() => captureFestivalCeremonyPhoto(renderer, scene, live, 1, 1000), /live renderer failure/);
  assert.deepEqual(duringRender, [false, true]);assert.equal(speech.visible, true);
 } finally { Object.assign(globalThis, { document: original }); }
});

for (const fail of [false,true]) test(`own marker is omitted from the souvenir and exact visibility is restored (${fail?'failed encode':'success'})`,async()=>{
 const {captureFestivalCeremonyPhoto}=await captureModule();const scene=new THREE.Scene(),live=new THREE.Camera();
 const ring=new THREE.Group(),hidden=new THREE.Group(),art=new THREE.Mesh();ring.userData.festivalSelfMarker=hidden.userData.festivalSelfMarker=true;hidden.visible=false;scene.add(ring,hidden,art);
 const states:boolean[][]=[];const renderer={domElement:{width:390,height:758} as HTMLCanvasElement,getPixelRatio:()=>1,getViewport:(v:THREE.Vector4)=>v.set(0,0,390,758),setViewport(){},render(){states.push([ring.visible,hidden.visible,art.visible]);}};
 const original=globalThis.document;Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL(){if(fail)throw new Error('encode failed');return 'data:image/jpeg;base64,REALFRAME';}})}});
 try{assert.equal(Boolean(captureFestivalCeremonyPhoto(renderer,scene,live,2,322000)),!fail);assert.deepEqual(states,[[false,false,true],[true,false,true]]);assert.equal(ring.visible,true);assert.equal(hidden.visible,false);}finally{Object.assign(globalThis,{document:original});}
});
