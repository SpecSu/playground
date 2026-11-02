import {createAftershow} from './aftershow.js';
import {createAvatarTurntable} from './avatar-inspection.js';
import * as THREE from 'three';
import { createInputMotionController } from './input-motion.js';
import { createFootGrounding } from './foot-grounding.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function danceTempoScale(duration, bpm = 128) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(bpm) || bpm <= 0) return 1;
  const twoBeats = 120 / bpm;
  const phrase = Math.max(1, Math.round(duration / twoBeats)) * twoBeats;
  return THREE.MathUtils.clamp(duration / phrase, .85, 1.2);
}

export function selectCharacterModel(definition, { coarsePointer = false, deviceMemory } = {}) {
  const constrainedMemory = Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4;
  const low = Boolean(definition?.lowModel && (coarsePointer || constrainedMemory));
  return { url: low ? definition.lowModel : definition?.model || definition?.url || definition?.modelUrl,
    quality: low ? definition.lowTextureProfile || '2k' : definition?.textureProfile || '4k-color', reason: low ? coarsePointer ? 'coarse-pointer' : 'device-memory<=4GiB' : 'desktop-default' };
}

export function shouldReportAssetProgress(url, wantedURLs, phase, disposed = false) {
  return !disposed && phase === 'loading' && wantedURLs.has(url);
}

export function disposeClonedSkeletons(root) {
  const skeletons = new Set();
  root?.traverse(node => { if (node.isSkinnedMesh && node.skeleton) skeletons.add(node.skeleton); });
  skeletons.forEach(skeleton => skeleton.dispose());
  return skeletons.size;
}

export function stageCameraFraming(mode, closeUp = false, orbit = .12) {
  const game = mode === 'playing' || mode === 'paused';
  const detail = closeUp && mode === 'lobby';
  // Playing is intentionally 150% larger; lobby outfit inspection is unchanged.
  return {
    position: [detail ? .07 : orbit, game || detail ? 1.75 : 1.9, detail ? 3.2 : game ? 5.333333 : 7.6],
    target: [detail ? -.13 : game ? 0 : -.30, detail ? 1.30 : game ? .65 : .25, 0],
  };
}

/** Transport-locked accents, independent of note/key callbacks. */
export function stageCameraRhythm(time,bpm=128,offset=0,weight=0){
 const seconds=Number.isFinite(time)?time:0,tempo=Number.isFinite(bpm)&&bpm>0?bpm:128;
 const beat=(seconds-(Number.isFinite(offset)?offset:0))*tempo/60;
 // Anticipate75ms: maximum lens push coincides with the measured audio beat.
 const anticipated=beat+.075*tempo/60,index=Math.floor(anticipated),age=(anticipated-index)*60/tempo;
 const slot=((index%8)+8)%8,strength=[1,0,.58,0,.88,0,.48,.25][slot];
 const ease=x=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t)};
 const envelope=age<.075?ease(age/.075):1-ease((age-.075)/Math.min(.225,60/tempo-.08));
 const phase=((beat%32)+32)%32,phrase=phase>=16&&phase<24?Math.sin((phase-16)/8*Math.PI)**2*.04:0;
 return {beat,index,age,strength,pulse:strength*envelope*(.19+.03*THREE.MathUtils.clamp(weight,0,1)),phrase};
}

export function stagePerformanceFraming(time,bpm=128,weight=0,reduced=false,upperY=0,{offset=0,compositionOnly=false}={}){
 const frame=stageCameraFraming('playing',false,0);
 if(reduced)return frame;
 const rhythm=stageCameraRhythm(time,bpm,offset,weight),push=rhythm.phrase+(compositionOnly?0:rhythm.pulse);
 frame.position[2]*=1-push;
 frame.target[1]+=push*.95;
 // This composition-only retreat cannot attenuate the direct beat displacement.
 frame.position[2]+=THREE.MathUtils.clamp((upperY-2.05)*1.8,0,.65);
 return frame;
}

/** Face-first portrait: large hats/shoulders may deliberately leave the slot. */
export function resultPortraitFraming(head,localBounds,aspect=1){
 const center=head.getWorldPosition(new THREE.Vector3());center.y+=.12;
 // Native head joints anchor each character independently; do not fit a wide
 // hat, long hair or the whole body and accidentally shrink the actual face.
 const distance=1.08*Math.max(1,.82/Math.max(.5,aspect));
 return {position:center.clone().add(new THREE.Vector3(0,0,distance)).toArray(),target:center.toArray()};
}

export function stageMusicalState(time, bpm = 128) {
  const seconds = Math.max(0, Number.isFinite(time) ? time : 0);
  const beat = seconds * bpm / 60;
  const phase = beat - Math.floor(beat);
  const section = seconds < 15 ? 0 : seconds < 30 ? 1 : seconds < 45 ? 2 : seconds < 67.5 ? 3 : 4;
  return { section, beatPulse: Math.pow(.5 + .5 * Math.cos(phase * Math.PI * 2), 3),
    intensity: [1, 1.09, .94, 1.13, 1.18][section], mix: [0, .22, .12, .37, .5][section] };
}

/** Bind geometry, not a raised-arm animation pose, defines consistent avatar height. */
export function characterBindBounds(object) {
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().makeEmpty();
  object.traverse(node => {
    const positions = node.geometry?.attributes?.position;
    if (node.isMesh && positions) bounds.union(new THREE.Box3().setFromBufferAttribute(positions).applyMatrix4(node.matrixWorld));
  });
  return bounds;
}

export function normalizeCharacterBind(object, height = 1.9) {
  const original = characterBindBounds(object), size = original.getSize(new THREE.Vector3());
  if (original.isEmpty() || size.y <= .00001) throw new Error('Character has no valid bind geometry');
  object.scale.multiplyScalar(height / size.y);
  const bounds = characterBindBounds(object), center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x; object.position.z -= center.z; object.position.y -= bounds.min.y;
  object.updateWorldMatrix(true, true);
  return characterBindBounds(object);
}

/** Parsed assets: protect displayed/requested resources and retain a bounded idle LRU. */
export function createOwnedAssetCache(load, release, {maxIdle = 1, maxIdleBytes = 128 * 1048576, estimateBytes = () => 0} = {}) {
  const promises = new Map(), resolved = new Map();
  let active = new Set(), wanted = new Set(), closed = false;
  const protectedURL = url => !closed && (active.has(url) || wanted.has(url));
  function prune() {
    const idle = [...resolved].filter(([url]) => !protectedURL(url));
    let bytes = idle.reduce((sum, [, value]) => sum + estimateBytes(value), 0);
    let count = idle.length;
    for (const [url, value] of idle) {
      if (!closed && count <= maxIdle && bytes <= maxIdleBytes) break;
      bytes -= estimateBytes(value); count--;
      release(value); resolved.delete(url); promises.delete(url);
    }
  }
  return {
    get(url) {
      if (closed) return Promise.reject(new Error('Asset cache disposed'));
      if (resolved.has(url)) { const value = resolved.get(url); resolved.delete(url); resolved.set(url, value); }
      if (!promises.has(url)) {
        let pending;
        pending = Promise.resolve().then(() => load(url)).then(value => {
          if (protectedURL(url)) resolved.set(url, value);
          else { release(value); if (promises.get(url) === pending) promises.delete(url); }
          return value;
        }, error => { if (promises.get(url) === pending) promises.delete(url); throw error; });
        promises.set(url, pending);
      }
      return promises.get(url);
    },
    setWanted(urls) { wanted = new Set(urls); prune(); },
    setActive(urls) { active = new Set(urls); prune(); },
    clear() { closed = true; active.clear(); wanted.clear(); prune(); promises.clear(); },
    has(url) { return resolved.has(url); },
    get size() { return resolved.size; },
  };
}

/**
 * Original GLB bytes retain compressed images, not decoded/GPU textures.
 * The cap holds the current wardrobe without making arbitrary manifests unbounded.
 */
export function createAssetByteCache(load, {maxBytes = 128 * 1048576} = {}) {
  const values = new Map(), pending = new Map();
  let bytes = 0, closed = false;
  return {
    get(url) {
      if (closed) return Promise.reject(new Error('Asset byte cache disposed'));
      if (values.has(url)) {
        const value = values.get(url); values.delete(url); values.set(url, value);
        return Promise.resolve(value);
      }
      if (!pending.has(url)) {
        const promise = Promise.resolve().then(() => load(url)).then(value => {
          if (!closed && value.byteLength <= maxBytes) {
            values.set(url, value); bytes += value.byteLength;
            while (bytes > maxBytes) {
              const [oldURL, oldValue] = values.entries().next().value;
              values.delete(oldURL); bytes -= oldValue.byteLength;
            }
          }
          return value;
        }).finally(() => pending.delete(url));
        pending.set(url, promise);
      }
      return pending.get(url);
    },
    has(url) { return values.has(url); },
    clear() { closed = true; values.clear(); pending.clear(); bytes = 0; },
    get size() { return values.size; },
    get bytes() { return bytes; },
  };
}

// Downloads may overlap; expensive image/mesh decoding does not. Stale queued
// outfits keep their original bytes but never allocate decoded model resources.
export function createSerialAssetParser(parse, isWanted) {
  let tail = Promise.resolve();
  return (data, url) => {
    const result = tail.then(() => {
      if (!isWanted(url)) throw new Error('Asset request superseded');
      return parse(data, url);
    });
    tail = result.catch(() => {});
    return result;
  };
}

export function estimateGLTFBytes(gltf) {
  const textures = new Set(), geometries = new Set();
  let bytes = 0;
  gltf.scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : [])
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  });
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array?.byteLength || attribute.data?.array?.byteLength || 0;
    bytes += geometry.index?.array?.byteLength || 0;
  }
  for (const texture of textures) if (texture.image?.width && texture.image?.height)
    bytes += texture.image.width * texture.image.height * 4 * 4 / 3;
  return bytes;
}

/** Remove world-space horizontal root travel without assuming the rig's local up axis. */
export function createRootMotionLock(wrapper, hips) {
  const baseline = wrapper.position.clone();
  wrapper.updateWorldMatrix(true, true);
  const anchor = hips.getWorldPosition(new THREE.Vector3());
  const current = new THREE.Vector3(), desired = new THREE.Vector3(), correction = new THREE.Vector3();
  let maxCorrection = 0;
  function apply() {
    wrapper.position.copy(baseline);
    wrapper.updateWorldMatrix(true, true);
    hips.getWorldPosition(current);
    desired.set(anchor.x, current.y, anchor.z); // Retain authored bounce, jumps and all rotations.
    correction.copy(desired).sub(current);
    maxCorrection = Math.max(maxCorrection, Math.hypot(correction.x, correction.z));
    if (wrapper.parent) {
      wrapper.parent.worldToLocal(desired);
      wrapper.parent.worldToLocal(current);
      correction.copy(desired).sub(current);
    }
    wrapper.position.add(correction);
    wrapper.updateWorldMatrix(true, true);
  }
  return { apply, getDiagnostics: () => ({ anchor: anchor.toArray(), maximumHorizontalCorrection: maxCorrection }) };
}

/** Portrait concert renderer. All human geometry and dance motion come from supplied GLBs. */
export function createStage(container, { onLoadProgress = () => {}, onError = () => {}, onAftershowEvent = () => {}, manifest: initialManifest = null } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    const notice = document.createElement('div');
    notice.className = 'stage-unavailable';
    notice.textContent = '当前浏览器无法开启 3D 舞台，请使用支持 WebGL 的浏览器。';
    Object.assign(notice.style, { position: 'absolute', inset: '40% 12% auto', padding: '12px 16px', color: '#dedfd9', background: '#10141de6', border: '1px solid #ffffff16', borderRadius: '12px', textAlign: 'center', font: '12px/1.65 sans-serif' });
    container.append(notice); onError(error);
    return { available: false, setCharacter: async () => false, setAssetManifest() {}, setResultPortraitTarget() {}, setMode() {}, setBPM() {}, setCloseUp: () => false, spinShowcase: () => false, rotateAvatar: () => false, hit() {}, update() {}, resize() {}, dispose() { notice.remove(); } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'ENCORE 三维舞台');
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#080b10');
  scene.fog = new THREE.FogExp2('#080b10', .045);
  const normalBackground=scene.background,normalFog=scene.fog;
  let portraitHost=null,portraitVisibility=null;
  const reducedQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const aftershow=createAftershow(onAftershowEvent);
  const camera = new THREE.PerspectiveCamera(33, 9 / 16, .05, 80);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, .08);
  scene.environment = env.texture;
  room.dispose(); pmrem.dispose();
  const stage = new THREE.Group(); scene.add(stage);
  const base = new THREE.MeshStandardMaterial({ color: '#11151b', metalness: .75, roughness: .34 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#79828b', metalness: .95, roughness: .24 });
  const ivory = new THREE.MeshStandardMaterial({ color: '#eee9dd', metalness: .3, roughness: .3 });
  const emissive = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const accentMaterial = emissive('#c9ff64');
  const secondaryMaterial = emissive('#f565c5');
  const whiteLED = emissive('#e9f0ee');
  const accents = [accentMaterial];
  function mesh(geometry, material, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); stage.add(object); return object;
  }
  const platform = mesh(new THREE.CylinderGeometry(1.72, 1.82, .14, 96), base, 0, -.08, 0);
  platform.receiveShadow = true;
  const innerDisc = mesh(new THREE.CylinderGeometry(1.58, 1.58, .015, 96), new THREE.MeshStandardMaterial({ color: '#202730', metalness: .85, roughness: .24 }), 0, -.003, 0);
  innerDisc.receiveShadow = true;
  function floorRing(radius, thickness, material, y = .015) {
    const ring = mesh(new THREE.TorusGeometry(radius, thickness, 8, 112), material, 0, y, 0); ring.rotation.x = -Math.PI / 2; return ring;
  }
  floorRing(1.66, .012, accentMaterial);
  floorRing(1.52, .004, whiteLED);
  floorRing(1.78, .009, secondaryMaterial, -.09);
  const floor = mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#080c12', roughness: .29, metalness: .72 }), 0, -.16, 0);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  // Fresnel-like soft pools replace an expensive full-resolution planar reflection pass.
  const glowMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color('#a7e35c') }, strength: { value: .16 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv; uniform vec3 tint; uniform float strength; void main(){float d=length((vUv-.5)*2.);float a=pow(max(0.,1.-d),2.7)*strength;gl_FragColor=vec4(tint,a);}' });
  const glow = mesh(new THREE.PlaneGeometry(7, 7), glowMaterial, 0, -.145, .9); glow.rotation.x = -Math.PI / 2;
  // Architectural pill portals: quiet enough to frame a person, not compete with them.
  const portals = new THREE.Group(); stage.add(portals);
  for (let i = 0; i < 3; i++) {
    const shape = new THREE.Shape(); const w = 1.8 + i * .29, h = 3.65 + i * .35, r = w / 2;
    shape.moveTo(-w / 2, r); shape.lineTo(-w / 2, h - r);
    shape.absarc(0, h - r, r, Math.PI, 0, true); shape.lineTo(w / 2, r);
    shape.absarc(0, r, r, 0, -Math.PI, true);
    const points = shape.getPoints(90).map(p => new THREE.Vector3(p.x, p.y, -2.2 - i * .35));
    const curve = new THREE.CatmullRomCurve3(points, true);
    const frame = new THREE.Mesh(new THREE.TubeGeometry(curve, 170, i === 0 ? .022 : .012, 6, true), i === 0 ? ivory : chrome);
    portals.add(frame);
    if (i === 0) { const led = new THREE.Mesh(new THREE.TubeGeometry(curve, 170, .009, 5, true), accentMaterial); led.position.z = .025; portals.add(led); }
  }
  // Slender side-light architecture and rear steps give genuine depth to the set.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = side * (2.0 + i * .36), z = -1.5 - i * .38;
      mesh(new THREE.BoxGeometry(.1, 3.4 + i * .15, .13), base, x, 1.5, z);
      mesh(new THREE.BoxGeometry(.018, 2.8 + i * .15, .018), i % 2 ? whiteLED : secondaryMaterial, x, 1.5, z + .08);
    }
    const stair = mesh(new THREE.BoxGeometry(1.8, .12, .85), base, side * 1.7, -.07, -1.8); stair.receiveShadow = true;
  }
  const hemi = new THREE.HemisphereLight('#e5ecff', '#18131b', 1.25); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff4e4', 3.6); key.position.set(1.5, 4.5, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -1; key.shadow.normalBias = .025; key.shadow.bias = -.0002; scene.add(key);
  const fill = new THREE.DirectionalLight('#c4d9ff', 1.9); fill.position.set(-3, 2, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight('#e8b5ff', 3.5); rim.position.set(-1, 3, -3); scene.add(rim);
  const stageLight = new THREE.PointLight('#c9ff64', 6, 6, 2); stageLight.position.set(0, 1.8, -1.8); scene.add(stageLight);
  // Transparent cone shader produces a soft theatrical beam, never an opaque triangle.
  const beamMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color('#d9e9ff') }, opacity: { value: .035 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform vec3 tint;uniform float opacity;void main(){float edge=pow(sin(vUv.x*3.14159265),3.);float fade=smoothstep(0.,.13,vUv.y)*(1.-vUv.y);gl_FragColor=vec4(tint,edge*fade*opacity);}' });
  const beams = [];
  for (const side of [-1, 1]) {
    const b = mesh(new THREE.ConeGeometry(.95, 5, 32, 1, true), beamMaterial, side * 1.9, 2.2, -.7);
    b.rotation.z = side * .22; beams.push(b);
  }
  const particleCount = 96;
  const particlePositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = Math.sin(i * 23.71) * 3;
    particlePositions[i * 3 + 1] = ((i * .731) % 1) * 4;
    particlePositions[i * 3 + 2] = -1 - ((i * .317) % 1) * 4;
  }
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#e6e9c8', size: .012, transparent: true, opacity: .27, depthWrite: false })); scene.add(dust);
  const impactRings = [];
  for (let i = 0; i < 4; i++) {
    const material = new THREE.MeshBasicMaterial({ color: '#d7ff74', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const object = floorRing(.7, .012, material, .025 + i * .001); impactRings.push({ object, material, age: 10 });
  }
  const modelRoot = new THREE.Group(); scene.add(modelRoot);
  const loader = new GLTFLoader();
  let progressURLs = new Set();
  const fileLoader = new THREE.FileLoader().setResponseType('arraybuffer');
  const lowMemory = Boolean(window.matchMedia?.('(pointer: coarse)').matches) || (globalThis.navigator?.deviceMemory <= 4);
  const byteCache = createAssetByteCache(url => fileLoader.loadAsync(url, e => {
    if (e.total && shouldReportAssetProgress(url, progressURLs, status, disposed)) report('loading', e.loaded / e.total);
  }), {maxBytes: (lowMemory ? 64 : 128) * 1048576});
  const parseGLB = createSerialAssetParser((data, url) => loader.parseAsync(data, THREE.LoaderUtils.extractUrlBase(url)),
    url => !disposed && progressURLs.has(url));
  // Idle cap is additional to the active model: normal residency is two models.
  // Current wardrobe textures estimate 128 MiB/model desktop, 32 MiB/model low,
  // so active+idle is ~256/64 MiB plus geometry (not a measured GPU allocation).
  // A switch can temporarily retain one extra decoded model until commit.
  const assetCache = createOwnedAssetCache(async url => {
    const data = await byteCache.get(url);
    return parseGLB(data, url);
  }, releaseGLTF, { maxIdle: 1, maxIdleBytes: (lowMemory ? 64 : 160) * 1048576, estimateBytes: estimateGLTFBytes });
  let manifest = initialManifest, activeModel = null, mixer = null, actions = [], currentAction = null, idleIndex = -1, danceIndices = [], rootMotionLock = null, footGrounding = null;
  let currentId = 'jiji', currentOutfit = 0, mode = 'lobby', requestId = 0, disposed = false;
  let activeModelURL = null, activeTextureQuality = null, qualityReason = null;
  let beatOffset=0;
  let bpm = 128, sectionIntensity = 1, musicalSection = 0, closeUp = false;
  const outfitAccent = new THREE.Color('#ed6294'), lightingAccent = outfitAccent.clone(), sectionColor = new THREE.Color();
  let motionController = null, beatImpact = 0;
  const turntable=createAvatarTurntable();
  // Whole-body portrait safe region above the bottom controls; mathematically checked below.
  const cameraTarget = new THREE.Vector3(-.3, .25, 0); const cameraDestination = new THREE.Vector3(.12, 1.9, 7.6);
  camera.position.copy(cameraDestination); camera.lookAt(cameraTarget);
  const performanceBasePosition=camera.position.clone(),performanceBaseTarget=cameraTarget.clone();
  let status = 'empty';
  let qualityDpr = Math.min(window.devicePixelRatio || 1, 1.75), frameAverage = 1 / 60, slowFrames = 0;
  function releaseGLTF(gltf) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    gltf.scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(m); });
    for (const material of materials) { for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); material.dispose(); }
    geometries.forEach(g => g.dispose()); textures.forEach(t => { t.dispose(); t.image?.close?.(); });
    disposeClonedSkeletons(gltf.scene);
  }
  function report(phase, progress = 0, extra = {}) { status = phase; onLoadProgress({ phase, progress, character: currentId, outfit: currentOutfit, ...extra }); }
  async function loadGLB(url) {
    return assetCache.get(url);
  }
  function definition(id, outfit) {
    const people = manifest?.characters || manifest;
    const person = Array.isArray(people) ? people.find(p => p.id === id) : people?.[id];
    const item = Array.isArray(person?.outfits) ? person.outfits[outfit] : person?.outfits?.[outfit] || person;
    return typeof item === 'string' ? { model: item } : item;
  }
  async function setCharacter(id = currentId, outfit = 0) {
    currentId = id; currentOutfit = outfit; const token = ++requestId;
    const def = definition(id, outfit);
    const selection = selectCharacterModel(def, { coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)').matches), deviceMemory: globalThis.navigator?.deviceMemory });
    const modelURL = selection.url;
    const additional = def?.animations || def?.clips || [];
    const list = Array.isArray(additional) ? additional : Object.values(additional);
    const keep = new Set([modelURL, ...list.map(item => typeof item === 'string' ? item : item.url || item.model)].filter(Boolean));
    progressURLs = keep;
    assetCache.setWanted(keep);
    const primary = id === 'lx' ? ['#b3e5ff', '#d7ff73', '#c997ff'][outfit % 3] : ['#ed6294', '#c2ff70', '#aebcff'][outfit % 3];
    outfitAccent.set(primary); lightingAccent.copy(outfitAccent);
    accents.forEach(m => m.color.set(primary)); stageLight.color.set(primary); glowMaterial.uniforms.tint.value.set(primary);
    if (!modelURL) { report('missing', 0); return false; }
    const cacheState = assetCache.has(modelURL) ? 'parsed' : byteCache.has(modelURL) ? 'bytes' : 'network';
    report('loading', null, { cacheState });
    try {
      const gltf = await loadGLB(modelURL);
      if (token !== requestId || disposed) return false;
      const extra = await Promise.all(list.map(async item => {
        if (typeof item === 'string') return (await loadGLB(item)).animations;
        const source = await loadGLB(item.url || item.model);
        return source.animations.map(c => { const copy = c.clone(); if (item.name) copy.name = item.name; return copy; });
      }));
      if (token !== requestId || disposed) return false;
      if (mixer) { mixer.stopAllAction(); if (activeModel) mixer.uncacheRoot(activeModel); }
      motionController?.dispose();
      disposeClonedSkeletons(activeModel);
      modelRoot.clear(); modelRoot.position.set(0, 0, 0); modelRoot.rotation.y = 0; activeModel = cloneSkeleton(gltf.scene);
      activeModel.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; object.frustumCulled = false; } });
      normalizeCharacterBind(activeModel, def.height || 1.9);
      activeModel.rotation.y += def.rotationY || 0;
      modelRoot.add(activeModel); mixer = new THREE.AnimationMixer(activeModel);
      let hips = null;
      activeModel.traverse(node => { if (!hips && /hips$|pelvis$/i.test(node.name)) hips = node; });
      rootMotionLock = hips ? createRootMotionLock(modelRoot, hips) : null;
      const clips = [...gltf.animations, ...extra.flat()];
      actions = clips.map(clip => mixer.clipAction(clip)); currentAction = null;
      idleIndex = clips.findIndex(c => /idle|relax|wait|standing/i.test(c.name));
      danceIndices = clips.map((clip, index) => /dance|groove|hip.?hop|samba|salsa|break|shuffle|choreo/i.test(clip.name) ? index : -1).filter(i => i >= 0);
      // Some exporters strip names. Never include a recognized idle in the dance rotation.
      if (!danceIndices.length) danceIndices = clips.map((_, i) => i).filter(i => i !== idleIndex);
      // Old displayed resources stay alive until this successful switch has detached them.
      assetCache.setActive(keep);
      activeModelURL = modelURL; activeTextureQuality = selection.quality; qualityReason = selection.reason;
      motionController = createInputMotionController(activeModel, clips, { restPose: def.restPose });
      motionController.setBPM(bpm); motionController.setMode(mode);
      footGrounding = createFootGrounding(modelRoot);
      turntable.reset();
      report('ready', 1, { animationCount: actions.length, triangles: null, cacheState });
      return true;
    } catch (error) { if (token === requestId && !disposed) { report('error', 0, { message: '角色载入失败，请重试' }); onError(error); } return false; }
  }
  function setAssetManifest(value) { manifest = value; return setCharacter(currentId, currentOutfit); }
  function setBPM(value, offset=0) {
    if (!Number.isFinite(value) || value < 40 || value > 240) return false;
    bpm = value;beatOffset=Number.isFinite(offset)?offset:0;
    motionController?.setBPM(value);
    return true;
  }
  function setCloseUp(value) {
    closeUp = Boolean(value) && mode === 'lobby';
    if (closeUp) { turntable.reset(); modelRoot.rotation.y = 0; }
    return closeUp;
  }
  function spinShowcase() {
    if (mode !== 'lobby' || !activeModel) return false;
    return turntable.spin();
  }
  function rotateAvatar(delta){
    if(mode!=='lobby'||!activeModel||!turntable.drag(delta))return false;
    modelRoot.rotation.y=turntable.angle;return true;
  }
  function setMode(value) {
    const previous = mode; mode = value; motionController?.setMode(value);turntable.setMode(value);aftershow.setMode(value);
    if(value!=='results'&&portraitHost)setResultPortraitTarget(null);
    if(previous==='results'&&value!=='results'){const f=stageCameraFraming(value,closeUp,0);camera.position.fromArray(f.position);cameraTarget.fromArray(f.target);camera.lookAt(cameraTarget);}
    if(value==='playing'&&previous!=='paused'){performanceBasePosition.copy(camera.position);performanceBaseTarget.copy(cameraTarget);}
    if (value === 'playing' && previous !== 'paused') {
      closeUp = false;
      // A start during the outfit turn must not leave the performer facing backwards.
      turntable.reset(); modelRoot.rotation.y = 0;
    }
    if (value === 'lobby' || value === 'results') { turntable.reset(); modelRoot.rotation.y = 0; }
  }
  function hit(lane, rating = 'perfect', detail = {}) {
    const accepted = motionController?.hit(lane, rating, detail);
    if (!accepted) return false;
    beatImpact = rating === 'perfect' ? 1 : .5;
    const ring = impactRings[lane]; ring.age = 0;
    ring.material.color.set(['#f56aa8', '#b7a4ff', '#ddff72', '#7ee5cc'][lane]);
    return true;
  }
  function update(delta = 1 / 60, time = 0) {
    if (disposed) return;
    const dt = Math.min(Math.max(delta, 0), .08); const live = mode === 'playing';
    frameAverage = frameAverage * .97 + dt * .03;
    slowFrames = frameAverage > .026 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
    if (slowFrames > 180 && qualityDpr > 1) { qualityDpr = Math.max(1, qualityDpr - .25); renderer.setPixelRatio(qualityDpr); resize(); slowFrames = 0; }
    const reduced=!!reducedQuery?.matches;
    aftershow.setReducedMotion(reduced);
    const after=aftershow.update(dt,{active:!!portraitHost&&!document.hidden});
    motionController?.setAftershow(after);
    if(!document.hidden)motionController?.update(dt, live ? time : undefined);
    modelRoot.rotation.y=mode==='results'?after.turn:turntable.update(dt);
    // Tripo may place the pelvis on local Z beneath a rotating root. World-space
    // compensation prevents orbiting/sliding while leaving the real rig animation intact.
    rootMotionLock?.apply();
    footGrounding?.apply();
    const gameFrame = live || mode === 'paused';
    const orbit = live&&!reduced ? Math.sin(time * .24) * .12 : gameFrame ? 0 : .12;
    const framing = stageCameraFraming(mode, closeUp, orbit);
    const target = new THREE.Vector3().fromArray(framing.target);
    cameraDestination.fromArray(framing.position);
    if(live){
      let highest=0;if(!reduced)activeModel?.traverse(n=>{if(n.isBone&&/(?:Head|Hand)$/.test(n.name))highest=Math.max(highest,n.getWorldPosition(new THREE.Vector3()).y+(n.name.endsWith('Head')?.25:.08));});
      const f=stagePerformanceFraming(time,bpm,motionController?.getDiagnostics().weight||0,reduced,highest,{offset:beatOffset,compositionOnly:true});
      cameraDestination.fromArray(f.position);target.fromArray(f.target);
    }
    if(portraitHost&&activeModel){
      let head=null;activeModel.traverse(n=>{if(n.isBone&&n.name.endsWith('Head'))head=n});
      if(head){const f=resultPortraitFraming(head,motionController?.getDiagnostics().aftershow?.headLocalBounds,camera.aspect);target.fromArray(f.target);cameraDestination.fromArray(f.position);}
    }
    if(mode!=='paused'&&!document.hidden){
      const blend=1-Math.exp(-dt*6);
      if(live){
        performanceBasePosition.lerp(cameraDestination,blend);performanceBaseTarget.lerp(target,blend);
        camera.position.copy(performanceBasePosition);cameraTarget.copy(performanceBaseTarget);
        // Apply the already-smooth75/225ms envelope AFTER composition smoothing.
        const pulse=reduced?0:stageCameraRhythm(time,bpm,beatOffset,motionController?.getDiagnostics().weight||0).pulse;
        camera.position.z-=5.333333*pulse;cameraTarget.y+=.95*pulse;
      }else{camera.position.lerp(cameraDestination,blend);cameraTarget.lerp(target,blend);}
      camera.lookAt(cameraTarget);
    }
    beatImpact = Math.max(0, beatImpact - dt * 3.6);
    const music = live ? stageMusicalState(time, bpm) : { section: musicalSection, intensity: 1, mix: 0, beatPulse: 0 };
    if (live) musicalSection = music.section;
    sectionIntensity = THREE.MathUtils.damp(sectionIntensity, music.intensity, 1.2, dt);
    sectionColor.copy(outfitAccent).lerp(music.section === 2 ? new THREE.Color('#a8cfff') : new THREE.Color('#e7ffb0'), music.mix);
    lightingAccent.lerp(sectionColor, 1 - Math.exp(-dt * 1.15));
    accents.forEach(material => material.color.copy(lightingAccent)); stageLight.color.copy(lightingAccent); glowMaterial.uniforms.tint.value.copy(lightingAccent);
    stageLight.intensity = 5.2 * sectionIntensity + music.beatPulse * .7 + beatImpact * 2;
    glowMaterial.uniforms.strength.value = .13 + music.beatPulse * .015 + beatImpact * .05;
    rim.intensity = 3.5 * sectionIntensity + music.beatPulse * .14;
    beams.forEach((b, i) => { b.rotation.z = (i ? 1 : -1) * (.22 + Math.sin(time * .4) * .06); });
    dust.rotation.y = time * .015;
    for (const ring of impactRings) { ring.age += dt; const p = Math.min(1, ring.age / .7); ring.object.scale.setScalar(.85 + p * 1.35); ring.material.opacity = (1 - p) * .75; }
    renderer.render(scene, camera);
  }
  function resize() { const host=portraitHost||container;const rawW=host.clientWidth,rawH=host.clientHeight;if(portraitHost&&(!rawW||!rawH))return;const w = rawW || 390, h = rawH || 693; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  function setResultPortraitTarget(host){
    const next=mode==='results'?host:null;
    if(disposed||next===portraitHost)return false;
    observer.disconnect();portraitHost=next||null;
    (portraitHost||container).append(renderer.domElement);
    scene.background=portraitHost?null:normalBackground;scene.fog=portraitHost?null:normalFog;
    if(portraitHost){portraitVisibility??={stage:stage.visible,dust:dust.visible};stage.visible=false;dust.visible=false;}
    else if(portraitVisibility){stage.visible=portraitVisibility.stage;dust.visible=portraitVisibility.dust;portraitVisibility=null;}
    renderer.setClearAlpha(portraitHost?0:1);
    observer.observe(portraitHost||container);resize();
    // A newly shown portrait must not spend its first second at the old far camera.
    if(portraitHost){let head=null;activeModel?.traverse(n=>{if(n.isBone&&n.name.endsWith('Head'))head=n});if(head){const f=resultPortraitFraming(head,motionController?.getDiagnostics().aftershow?.headLocalBounds,camera.aspect);cameraTarget.fromArray(f.target);camera.position.fromArray(f.position);}}
    else{const frame=stageCameraFraming(mode,closeUp,0);camera.position.fromArray(frame.position);cameraTarget.fromArray(frame.target);}
    camera.lookAt(cameraTarget);
    return true;
  }
  const loseContext = event => { event.preventDefault(); report('context-lost', 0); };
  renderer.domElement.addEventListener('webglcontextlost', loseContext);
  function dispose() {
    disposed = true; ++requestId; observer.disconnect(); mixer?.stopAllAction(); motionController?.dispose();
    disposeClonedSkeletons(activeModel); modelRoot.clear();
    renderer.domElement.removeEventListener('webglcontextlost', loseContext);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(m); });
    for (const m of materials) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); }
    geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); env.dispose(); assetCache.clear(); byteCache.clear(); renderer.dispose(); renderer.domElement.remove();
  }
  function getDiagnostics() {
    let estimatedTextureBytes = 0; const textures = new Set();
    scene.traverse(o => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); });
    for (const texture of textures) { const image = texture.image; if (image?.width && image?.height) estimatedTextureBytes += image.width * image.height * 4 * 4 / 3; }
    return { aftershow:aftershow.getState(),portrait:!!portraitHost,status, character: currentId, outfit: currentOutfit, inspectionAngle: turntable.angle, activeModelURL, textureQuality: activeTextureQuality, qualityReason, closeUp, bpm, beatOffset, musicalSection, animationRate: motionController?.getDiagnostics().rate, animations: actions.length, idleClip: idleIndex, danceClips: danceIndices.length, inputMotion: motionController?.getDiagnostics(), rootMotion: rootMotionLock?.getDiagnostics(), footGrounding: footGrounding?.getDiagnostics(), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, cachedAssets: assetCache.size, cachedGLBs: byteCache.size, cachedGLBMiB: +(byteCache.bytes / 1048576).toFixed(1), dpr: qualityDpr, frameAverageMs: +(frameAverage * 1000).toFixed(2), estimatedTextureMiB: +(estimatedTextureBytes / 1048576).toFixed(1), note: 'Texture memory is an RGBA+mipmap estimate, not a GPU measurement.' };
  }
  return { available: true, setCharacter, setAssetManifest, setResultPortraitTarget, setMode, setBPM, setCloseUp, spinShowcase, rotateAvatar, hit, update, resize, dispose, getDiagnostics, get status() { return status; }, get animationCount() { return actions.length; }, renderer, scene, camera };
}
