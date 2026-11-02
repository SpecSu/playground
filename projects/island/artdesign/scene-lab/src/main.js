import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetLibrary, modelStatistics, mainSurfaceHeight, supportsWebP } from './asset.js';
import { createLighting } from './lighting.js';
import { createLagoon } from './lagoon.js';
import { addLivingMotion, motionTime } from './motion.js';
import { calibrateMaterial } from './materials.js';

const $ = id => document.getElementById(id);
const details = {
  dog: ['完整角色一起验收', '头、耳、五官和身体一起验收', ['头颈连接完整，五官不漂浮', '四肢数量正确，双脚站稳', '正面、侧面、背面比例一致', '转动光向后，面部阴影能随之改变']],
  tree: ['先看轮廓，再检查叶冠结构', '厚叶、有层次，不用纹理掩盖破面', ['树冠层次与主图一致', '叶片有厚度，不是薄片圆盘', '树冠与树干连接自然', '树根接地，侧后方不塌陷']],
  ground: ['v0.2 单块方形母件', '四边规整，同一母件重复拼接', ['一个方形单元，无内部十字沟', '四边接口平直，拼接没有显著缝隙', '草皮、土层、浅砂三层清楚', '草面近水平，不随码头方向旋转']],
  shrub: ['完整一簇花叶', '花朵、叶片和根部一体检查', ['花瓣与叶片有厚度', '枝叶连接，花朵不悬空', '花白、叶绿，避免塑料高光', '与大树体积和轮廓明显不同']],
  dock: ['主图为唯一生成输入', '沿地块正交轴装配，调整整体朝向', ['板、梁、桩连接完整', '结构正交，横板没有明显扭曲', '接岸顶面与草面衔接合理', '木纹克制，绳结不是贴上去的影子']],
  boat: ['完整船体，包含内部与马达', '以船体水线定位，不以模型底部定位', ['船内空间、座板和船底可辨', '船沿连续，首尾不粘连', '奶白与蓝色分区干净', '马达与船体固定连接']],
  rock: ['宽缓折面的灰岩', '避免球状轮廓和过密表面噪点', ['整体轮廓有宽缓折面', '底部可嵌入岸线', '灰色基础色无固定强阴影', '缩小后依然能读出岩石形状']],
  fish: ['完整青蓝小鱼', '路径运动与尾鳍形变分开处理', ['鱼头、鱼身、尾鳍连接完整', '正面方向统一为 +Z', '透明浅水下轮廓仍清楚', '先检查静态，绑定前不强做尾鳍动画']]
};
let catalog, layout, renderer, camera, scene, controls, library, lighting, lagoon, floor, grid, guides;
let mode = 'reference', assetId = 'dog', materialMode = 'clay', lightPreset = 'neutral';
let inspection = null, sceneRoot = null, sceneReadyKey = '', buildToken = 0;
let localAsset = null, localFilename = '', selectedInfo = null, totalFrames = 0, renderTime = 0, previous = 0;
let measuring = null, warmFrames = 0, adaptiveScale = 1, slowFrames = 0;
let snapshots = [], contextLost = false;
const fishRoots = [];
let fishSchool=null, boatRoot=null;
const query = new URLSearchParams(location.search);
let geometryMode=query.get('geometry')==='original'?'original':'runtime';
let webpSupported=false;
const modelURL=(entry,clay=false)=>geometryMode==='runtime'&&entry.runtime
  ? (webpSupported && query.get('textures')!=='source' && entry.compact ? entry.compact : entry.runtime)
  : clay?(entry.geometry||entry.texture):(entry.texture||entry.geometry);
const maxDpr = Math.max(1, Math.min(2, Number(query.get('dpr')) || 1.75));
const data = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`无法读取 ${url}`); return r.json(); };

function error(message) { $('fatal-error').textContent = message; $('fatal-error').hidden = false; }
function clearError() { $('fatal-error').hidden = true; }
function markButtons(attr, value) { document.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value))); }

function refreshList() {
  $('asset-list').replaceChildren();
  let ready = 0;
  for (const [id, entry] of Object.entries(catalog.models)) {
    const present = Boolean(entry.geometry || entry.texture); if (present) ready++;
    const b = document.createElement('button'); b.className = 'asset-button'; b.setAttribute('aria-current', String(id === assetId)); b.title = entry.name;
    const image = document.createElement('img'); image.src = entry.reference; image.alt = ''; image.loading = 'lazy';
    const label = document.createElement('span'), name = document.createElement('strong'), state = document.createElement('small');
    name.textContent = entry.name; state.textContent = present ? '待画面验收' : '参考已就绪'; label.append(name, state);
    const dot = document.createElement('span'); dot.className = `asset-state${present ? ' ready' : ''}`;
    b.append(image, label, dot); b.onclick = () => selectAsset(id); $('asset-list').append(b);
  }
  $('model-count').innerHTML = `${ready} <small>/ 8</small>`;
  $('pipeline-status').textContent = Object.values(catalog.models).every(x=>x.texture) ? '八类资产已生成' : catalog.paused ? '生成暂停' : '生成流程已开启';
}

function showInfo(asset) {
  $('model-info').replaceChildren();
  const stats = asset ? modelStatistics(asset.root) : null;
  const values = stats ? [['三角面', stats.triangles.toLocaleString()], ['材质 / 纹理', `${stats.materials} / ${stats.textures}`], ['含 UV 网格', `${stats.uvMeshes} / ${stats.meshes}`], ['GLB 大小', `${(asset.bytes / 1048576).toFixed(1)} MB`], ['纹理显存估算', `${stats.estimatedTextureMiB.toFixed(1)} MB`]] : [['GLB', '尚无文件']];
  for (const [k, v] of values) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; $('model-info').append(dt, dd); }
}

async function selectAsset(id) {
  if (measuring) finishMeasurement('切换资产，测量无效');
  assetId = id; localAsset = null; localFilename = ''; selectedInfo = null; clearError(); refreshList();
  const entry = catalog.models[id];
  $('asset-name').textContent = entry.name;
  $('asset-phase').textContent = entry.texture ? '待材质验收' : entry.geometry ? '待灰模验收' : '待生成';
  $('asset-description').textContent = details[id][0]; $('asset-caption').textContent = mode === 'scene' ? '相同方形地块 · 日光与暮色场景测试' : details[id][1];
  $('reference-image').src = entry.reference; $('reference-image').alt = `${entry.name}资产参考图`;
  $('stage-badge').textContent = `${id.toUpperCase()} / ${id === 'ground' ? 'v0.2' : 'v0.1'}`;
  $('checklist').replaceChildren(...details[id][2].map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('load-note').textContent = entry.geometry || entry.texture ? '文件已接入，不代表造型、材质或手机性能通过验收。' : '当前仅完成参考图片与流程准备。';
  showInfo(null);
  if (mode === 'inspect') await loadInspection();
}

function initRenderer() {
  renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.info.autoReset = false;
  renderer.debug.onShaderError=(gl,program,vs,fs)=>{const details=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].filter(Boolean).join(' · ');console.error('Shader compilation failed:',details);error('着色器编译失败，本次画面无效：'+details);};
  $('canvas-host').append(renderer.domElement);
  scene = new T.Scene(); camera = new T.PerspectiveCamera(32, 1, .08, 200);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .47; controls.minDistance = .5; controls.maxDistance = 36;
  lighting = createLighting(scene, renderer); renderer.shadowMap.autoUpdate=false; library = new AssetLibrary(renderer);
  floor = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshStandardMaterial({ color: '#e5e8df', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.015; floor.receiveShadow = true; scene.add(floor);
  grid = new T.GridHelper(12, 24, '#aebfac', '#cdd7c8'); grid.position.y = -.007; grid.material.transparent = true; grid.material.opacity = .38; scene.add(grid);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; error('浏览器图形上下文已丢失。请刷新页面；此轮性能测量无效。'); if (measuring) finishMeasurement('上下文丢失'); });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  new ResizeObserver(resize).observe($('stage'));
  resize(); setCamera('hero'); requestAnimationFrame(frame);
}

function resize() {
  if (!renderer) return;
  if(measuring?.start)finishMeasurement('视口尺寸改变，测量无效');
  const w = $('stage').clientWidth, h = $('stage').clientHeight;
  const dpr = (query.has('dpr') ? maxDpr : Math.min(devicePixelRatio || 1, maxDpr)) * adaptiveScale;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  lagoon?.resize(w, h, dpr); warmFrames = 0;
}

function setCamera(view = 'hero') {
  if (!camera) return;
  const box = inspection && mode === 'inspect' ? new T.Box3().setFromObject(inspection, true) : new T.Box3(new T.Vector3(-3, 0, -3), new T.Vector3(4, 5, 5));
  const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
  const fovY = camera.fov * Math.PI / 180, fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);
  let distance = mode === 'scene' ? Math.max(18, 9.6 / (2 * Math.tan(Math.min(fovX, fovY) / 2))) : Math.max(size.y / (2 * Math.tan(fovY / 2)), Math.max(size.x, size.z) / (2 * Math.tan(fovX / 2))) * 1.5;
  const direction = view === 'front' ? new T.Vector3(0, .15, 1) : view === 'back' ? new T.Vector3(0, .15, -1) : view === 'side' ? new T.Vector3(1,.15,0) : new T.Vector3(-.65, mode === 'scene' ? 1.2 : .5, 1.5);
  if (mode === 'scene') center.set(.0, 1.4, .7);
  if(mode==='scene' && view==='plants'){controls.target.set(-1.2,2.3,0);camera.position.copy(controls.target).add(new T.Vector3(-.45,.55,1.4).normalize().multiplyScalar(Math.max(9.8,3.3/(2*Math.tan(fovX/2)))));controls.update();return;}
  if(mode==='scene' && sceneRoot){
    const points=[];
    for(const object of sceneRoot.children){
      if(!object.userData.heroAsset)continue;
      const b=new T.Box3().setFromObject(object,true);
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new T.Vector3(x,y,z));
    }
    if(points.length){
      const d=direction.clone().normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),d).normalize(),up=new T.Vector3().crossVectors(d,right);
      const midpoint=axis=>{const v=points.map(p=>p.dot(axis));return(Math.min(...v)+Math.max(...v))/2;};
      center.copy(right).multiplyScalar(midpoint(right)).addScaledVector(up,midpoint(up)).addScaledVector(d,midpoint(d));
      distance=camera.aspect>1?17:0;
      for(const p of points){const delta=p.clone().sub(center),depth=delta.dot(d);distance=Math.max(distance,depth+Math.abs(delta.dot(right))/(Math.tan(fovX/2)*.88),depth+Math.abs(delta.dot(up))/(Math.tan(fovY/2)*.88));}
    }
  }
  controls.target.copy(center); camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
  controls.maxDistance = Math.max(40, distance * 2); controls.update();
}

async function loadInspection() {
  const token = ++buildToken;
  if (inspection) { library.releaseInstance(inspection); inspection = null; }
  $('empty-model').hidden = false;
  const entry = catalog.models[assetId], path = modelURL(entry,materialMode==='clay');
  if (!localAsset && !path) { showInfo(null); setCamera(); return; }
  $('load-note').textContent = '正在读取模型与纹理…';
  const loadStart = performance.now();
  try {
    const asset = localAsset || await library.load(path);
    if (token !== buildToken || mode !== 'inspect') return;
    inspection = library.instance(asset, { ...layout.assets[assetId], anchor: 'bottom' });
    scene.add(inspection); library.setMaterial(inspection, materialMode); selectedInfo = asset;
    $('empty-model').hidden = true; showInfo(asset); setCamera();
    $('stage-badge').textContent = localAsset ? `LOCAL / ${localFilename}` : `${assetId.toUpperCase()} / 模型检查`;
    $('load-note').textContent = `${localAsset ? '本地文件，仅本次浏览器会话' : path.endsWith('geometry.glb') ? '几何版本，尚未生成新纹理' : '纹理版本，尚待看图验收'} · 读取 ${(performance.now() - loadStart).toFixed(0)} ms。朝向先按原文件保留。`;
  } catch (e) { if (token === buildToken) { error(`模型读取失败：${e.message}`); $('load-note').textContent = '加载失败，没有替换成占位模型。'; } }
}

function shoreTexture(boxes) {
  const n = 256, a = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + .5) / n * 16 - 8, z = (j + .5) / n * 16 - 8;
    let distance = 8;
    for (const b of boxes) {
      if(b.round){distance=Math.min(distance,(Math.hypot((x-b.x)/b.hx,(z-b.z)/b.hz)-1)*Math.min(b.hx,b.hz));continue;}
      const qx = Math.abs(x - b.x) - b.hx + .07, qz = Math.abs(z - b.z) - b.hz + .07;
      distance = Math.min(distance, Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - .07);
    }
    a[j * n + i] = T.MathUtils.clamp(.5 + distance / 16, 0, 1);
  }
  const texture = new T.DataTexture(a, n, n, T.RedFormat, T.FloatType);
  texture.minFilter = texture.magFilter = T.LinearFilter; texture.needsUpdate = true; return texture;
}

function makeGuides() {
  const group = new T.Group(), material = new T.LineDashedMaterial({ color: '#e3f5ed', dashSize: .13, gapSize: .08, transparent: true, opacity: .8 });
  const s = layout.tileSize;
  for (const x of [-s / 2, s / 2]) for (const z of [-s / 2, s / 2]) {
    const points = [[x-s/2,.96,z-s/2],[x+s/2,.96,z-s/2],[x+s/2,.96,z+s/2],[x-s/2,.96,z+s/2],[x-s/2,.96,z-s/2]].map(p=>new T.Vector3(...p));
    const line = new T.Line(new T.BufferGeometry().setFromPoints(points), material); line.computeLineDistances(); group.add(line);
  }
  for (const [id, label] of [['tree','松树 4.0 m'], ['dog','狗狗 1.2 m'], ['dock','码头'], ['boat','小船']]) {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 88;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'rgba(235,248,237,.9)'; ctx.roundRect(2, 2, 316, 84, 16); ctx.fill(); ctx.fillStyle = '#345d4b'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, 160, 54);
    const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false })); sprite.scale.set(1.4, .385, 1); const p = layout.assets[id].position; sprite.position.set(p[0], 1.05, p[2]); group.add(sprite);
  }
  return group;
}

async function assembleScene() {
  const key = geometryMode+JSON.stringify(catalog.models);
  if (sceneReadyKey === key && sceneRoot) return;
  if (sceneRoot) library.releaseInstance(sceneRoot);
  sceneRoot = new T.Group(); scene.add(sceneRoot); fishRoots.length = 0; fishSchool=null;boatRoot=null;
  const ready = new Map();
  const results = await Promise.allSettled(Object.entries(catalog.models).map(async ([id, e]) => {
    const url = modelURL(e); if (!url) return;
    ready.set(id, await library.load(url));
  }));
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) error(`${failures.length} 个模型读取失败：${failures[0].reason.message}`);
  let surfaceY = .95; const shoreBoxes = [], groundObjects=[];
  if (ready.has('ground')) {
    const s = layout.tileSize;
    for (const x of [-s / 2, s / 2]) for (const z of [-s / 2, s / 2]) {
      const ground = library.instance(ready.get('ground'), layout.assets.ground); ground.userData.heroAsset=true; ground.position.set(x, 0, z); sceneRoot.add(ground);
      calibrateMaterial(ground,'ground');groundObjects.push(ground);
      surfaceY = ground.userData.dimensions[1];
    }
    shoreBoxes.push({ x: 0, z: 0, hx: s, hz: s });
  }
  for (const [id, asset] of ready) {
    if (id === 'ground' || id === 'fish') continue;
    const spec = layout.assets[id], object = library.instance(asset, spec); object.userData.heroAsset=true;object.position.fromArray(spec.position);
    if (['dog','tree','shrub'].includes(id)) {
      sceneRoot.updateMatrixWorld(true);
      const ray=new T.Raycaster(new T.Vector3(object.position.x,surfaceY+5,object.position.z),new T.Vector3(0,-1,0));
      const hits=ray.intersectObjects(groundObjects,true);
      object.position.y += (hits[0]?.point.y ?? surfaceY) - (id==='dog'?.008:id==='shrub'?.30:.025);
    }
    if(id==='dock') {
      object.position.set(0,0,0);
      const deckY=mainSurfaceHeight(object);
      object.position.fromArray(spec.position);object.position.y += surfaceY-deckY-.025;
    }
    if(['tree','dog','shrub'].includes(id))object.userData.waterPass='above';
    if(id==='tree'||id==='shrub')addLivingMotion(object,id);
    calibrateMaterial(object,id);
    sceneRoot.add(object);
    if (id === 'boat') {boatRoot=object;boatRoot.userData.restY=object.position.y;}
    if(id==='rock')shoreBoxes.push({x:object.position.x,z:object.position.z,hx:object.userData.dimensions[0]*.43,hz:object.userData.dimensions[2]*.43,round:true});
    if(id==='dock')for(const x of [-.76,.76])for(const z of [-1.35,0,1.35])shoreBoxes.push({x:object.position.x+x,z:object.position.z+z,hx:.12,hz:.12,round:true});
  }
  if(ready.has('rock')){
    const placements=[[-3.4,-1.45,2.2,.68],[-3.7,-1.6,4.4,.85],[-1.6,-1.45,4.7,.7],[.1,-1.55,5.3,.55],[-4,-1.6,-1.5,.9]].map((p,i)=>({position:p.slice(0,3),scale:p[3],rotation:i*1.47}));
    const rocks=library.batch(ready.get('rock'),{...layout.assets.rock,size:1.25,anchor:'bottom'},placements);rocks.userData.waterPass='below';sceneRoot.add(rocks);
  }
  if(ready.has('fish')){
    fishSchool=library.batch(ready.get('fish'),layout.assets.fish,[0,1,2].map(i=>({position:[-2+i,-.4,4]})));
    fishSchool.userData.waterPass='below';addLivingMotion(fishSchool,'fish');sceneRoot.add(fishSchool);
  }
  library.setMaterial(sceneRoot, materialMode);
  const shore = shoreTexture(shoreBoxes);
  if (!lagoon) lagoon = createLagoon(scene, renderer, camera, { height: layout.waterHeight, shoreTexture: shore });
  else { lagoon.uniforms.uShore.value.dispose(); lagoon.uniforms.uShore.value = shore; }
  if(boatRoot)lagoon.uniforms.uBoatMask.value.set(boatRoot.position.x,boatRoot.position.z,boatRoot.userData.dimensions[0]*.36,boatRoot.userData.dimensions[2]*.36);
  if (!guides) { guides = makeGuides(); scene.add(guides); }
  guides.visible = ready.size < 8;
  $('scene-note').querySelector('strong').textContent = ready.size === 8 ? '小岛 · 视觉试验 0.4' : `装配方案 · 已接入 ${ready.size} / 8 类模型`;
  $('scene-note').querySelector('span').textContent = ready.size === 8 ? '八类独立资产 · 实时光照与海水'  : '线框仅标识空间位置，水体为实时渲染。不是成品效果。';
  sceneReadyKey = failures.length ? '' : key; resize();
}

async function setMode(value) {
  if (measuring) finishMeasurement('切换视图，测量无效');
  mode = value; ++buildToken; clearError();
  $('asset-caption').textContent = mode === 'scene' ? '相同方形地块 · 日光与暮色场景测试' : details[assetId][1];
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('reference-view').hidden = mode !== 'reference'; $('canvas-host').hidden = mode === 'reference';
  $('render-controls').hidden = mode === 'reference'; $('viewport-bottom').hidden = mode === 'reference';
  $('stage-badge').hidden = mode === 'scene'; $('scene-note').hidden = mode !== 'scene'; $('empty-model').hidden = true;
  if (mode !== 'reference' && !renderer) { try { initRenderer(); } catch(e) { error(`无法启动 WebGL：${e.message}`); return; } }
  if (!renderer) return;
  if (inspection) inspection.visible = mode === 'inspect';
  floor.visible = grid.visible = mode === 'inspect';
  if (sceneRoot) sceneRoot.visible = mode === 'scene';
  if (guides) guides.visible = mode === 'scene' && Object.values(catalog.models).filter(x => x.texture || x.geometry).length < 8;
  if (lagoon) lagoon.surface.visible = lagoon.seabed.visible = mode === 'scene';
  if (mode === 'inspect') { await loadInspection(); setLight('neutral'); }
  if (mode === 'scene') { await assembleScene(); setLight('sun'); setCamera(); }
  resize();
}

function setLight(value) {
  lightPreset = value; lighting?.setPreset(value); markButtons('data-light', value); lagoon?.setDusk(value === 'dusk' ? 1 : 0);
  if (mode === 'scene' && scene) scene.background = new T.Color(value === 'dusk' ? '#9cabc3' : '#48b7d1');
}

function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }

function finishMeasurement(reason = '') {
  if (!measuring) return;
  const m = measuring; measuring = null;
  const valid = m.frames.length > 20 && !reason;
  const sorted = m.frames.toSorted((a,b)=>a-b), sum = m.frames.reduce((a,b)=>a+b,0);
  const result = { date:new Date().toISOString(), valid, reason, mode, asset: assetId, material: materialMode, lighting: lightPreset, viewport: [renderer.domElement.clientWidth, renderer.domElement.clientHeight], dpr: renderer.getPixelRatio(), samples: sorted.length, fps: sorted.length * 1000 / sum, p95FrameMs: sorted[Math.floor(sorted.length*.95)] || 0, maxDrawCalls: m.calls, maxTriangles: m.triangles, contextLost, texturesAllocated:renderer.info.memory.textures, geometriesAllocated:renderer.info.memory.geometries, geometry:geometryMode, orbit:Boolean(m.orbit), reflection:lagoon ? {...lagoon.stats,intervals:lagoon.stats.intervals.slice()} : null, limitations: '当前浏览器、当前内容；没有完整资产时不能推算完整场景或手机性能。' };
  $('metrics').textContent = valid ? `${result.fps.toFixed(1)} FPS · P95 ${result.p95FrameMs.toFixed(1)} ms\n${result.maxDrawCalls} 次绘制 · ${result.maxTriangles.toLocaleString()} 三角面 / 帧（含离屏）\nDPR ${result.dpr.toFixed(2)}，当前浏览器 ${result.viewport.join(' × ')}。${Object.values(catalog.models).every(e=>!e.geometry&&!e.texture) ? '无正式模型，不能视为场景性能。' : '不代表真实手机。'}` : `测量未完成：${reason || '样本不足'}`;
  if(valid && result.reflection){const r=result.reflection;const gaps=r.intervals.toSorted((a,b)=>a-b);$('metrics').textContent+=`\n倒影 ${r.updates} / ${r.frames} 帧更新 · 转动漏更 ${r.staleMovingFrames} 帧 · 间隔 P95 ${(gaps[Math.floor(gaps.length*.95)]||0).toFixed(1)}ms`;}
  $('metrics').dataset.result = JSON.stringify(result); snapshots.push(result); $('measure').disabled = false; $('measure').textContent = '测量 12 秒帧率'; $('measure-orbit').disabled=false;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = previous ? now - previous : 16.7; previous = now;
  if (!renderer || mode === 'reference' || document.hidden || contextLost) return;
  renderTime = query.get('still')==='1' ? 8 : renderTime + Math.min(dt, 50) / 1000; controls.autoRotate = $('turntable').checked; controls.autoRotateSpeed = measuring?.orbit ? 4 : .8; if(measuring?.orbit)controls.autoRotate=true; controls.update(Math.min(dt,50)/1000);
  for (const fish of fishRoots) if (mode === 'scene') { const t=renderTime*.25; fish.position.set(-1.3+Math.cos(t)*2,-.4+Math.sin(t*2)*.05,3.7+Math.sin(t)*.7); fish.rotation.y=Math.atan2(-Math.sin(t)*2,Math.cos(t)*.7); }
  if(mode==='scene' && fishSchool)for(let i=0;i<3;i++){
    const t=renderTime*.16+i*1.7;
    library.updateBatch(fishSchool,i,{position:[-1.8+Math.cos(t)*1.7,-.34-i*.09,3.8+Math.sin(t)*.9],rotation:Math.atan2(-Math.sin(t)*1.7,Math.cos(t)*.9),scale:1-i*.12});
  }
  if(mode==='scene' && boatRoot){boatRoot.position.y=boatRoot.userData.restY+Math.sin(renderTime*.9)*.015;boatRoot.rotation.z=Math.sin(renderTime*.7)*.007;}
  motionTime.value=renderTime;
  renderer.shadowMap.needsUpdate=true;
  renderer.info.reset();
  if (lagoon && mode === 'scene') { lagoon.uniforms.uSun.value.copy(lighting.sun.position).normalize(); lagoon.render(renderTime); }
  else renderer.render(scene, camera);
  totalFrames++; warmFrames++;
  if (totalFrames % 30 === 0) $('render-status').textContent = `${mode === 'scene' ? '水体实时预演' : inspection ? '模型实时预览' : '检查环境就绪'} · DPR ${renderer.getPixelRatio().toFixed(2)}`;
  if (measuring && warmFrames > 30) {
    if (!measuring.start) {measuring.start = now;lagoon?.resetStats();}
    measuring.frames.push(dt); measuring.calls = Math.max(measuring.calls, renderer.info.render.calls); measuring.triangles = Math.max(measuring.triangles, renderer.info.render.triangles);
    $('measure').textContent = `测量中 · ${Math.max(0, 12 - (now - measuring.start) / 1000).toFixed(0)} 秒`;
    if (now - measuring.start >= 12000) finishMeasurement();
  }
  // Reduce resolution only after sustained pressure, never during a measurement or tab suspension.
  if (!measuring && query.get('still')!=='1' && warmFrames > 120 && dt < 200) {
    slowFrames = dt > 30 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 90 && adaptiveScale > .65) { adaptiveScale = Math.max(.65, adaptiveScale - .1); slowFrames = 0; resize(); }
  }
}

async function boot() {
  [catalog, layout, webpSupported] = await Promise.all([data('assets/catalog.json'), data('assets/layout.json'), supportsWebP()]);
  refreshList(); await selectAsset(catalog.models[query.get('asset')] ? query.get('asset') : 'dog');
  $('immersive').onclick = () => { document.body.classList.toggle('immersive'); $('immersive').textContent = document.body.classList.contains('immersive') ? '返回工作台' : '沉浸预览'; resize(); setCamera(); };
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode).catch(e=>error(e.message)));
  document.querySelectorAll('[data-material]').forEach(b => b.onclick = async () => {
    if (measuring) finishMeasurement('切换材质，测量无效');
    materialMode = b.dataset.material; markButtons('data-material', materialMode);
    if (mode === 'inspect') await loadInspection();
    if (sceneRoot) library.setMaterial(sceneRoot, materialMode);
  });
  document.querySelectorAll('[data-light]').forEach(b => b.onclick = () => setLight(b.dataset.light));
  document.querySelectorAll('[data-camera]').forEach(b => b.onclick = () => setCamera(b.dataset.camera));
  $('light-angle').oninput = e => { lighting.setAngle(Number(e.target.value)); lagoon?.invalidateReflection(); $('light-angle-value').textContent = `${e.target.value}°`; };
  $('exposure').oninput = e => { renderer.toneMappingExposure = Number(e.target.value); $('exposure-value').textContent = Number(e.target.value).toFixed(2); };
  $('reload').onclick = async () => { try { catalog = await data('assets/catalog.json'); refreshList(); await selectAsset(assetId); if (mode === 'scene') { await assembleScene(); setCamera(); } } catch(e) { error(e.message); } };
  $('scene-reference').onclick = async () => { await setMode('reference'); $('reference-image').src = '/reference-scene.png'; $('reference-image').alt = '原始小岛整体参考图'; $('stage-badge').textContent = 'SCENE / 原始方向'; };
  $('local-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return; clearError();
    if (file.size > 180*1024*1024) { error('文件超过本次检查页的 180 MB 上限。'); return; }
    try { localAsset = await library.parse(await file.arrayBuffer()); localFilename = file.name; await loadInspection(); $('asset-phase').textContent = '本地文件待检查'; } catch (e) { error(e.message); }
    e.target.value = '';
  };
  $('capture').onclick = () => {
    if (!renderer || contextLost) return;
    const stamp = new Date().toISOString().replaceAll(':','-');
    const canvas = document.createElement('canvas'); canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(renderer.domElement, 0, 0);
    const s = Math.max(.8, canvas.width / 1000); ctx.fillStyle = 'rgba(248,251,244,.93)'; ctx.fillRect(0, 0, canvas.width, 57*s); ctx.fillStyle = '#345a45'; ctx.font = `${12*s}px sans-serif`;
    ctx.fillText(`ISLAND · ${mode === 'scene' ? '视觉试验 v0.4 / 浏览器实时渲染' : inspection ? '单体检查 / 浏览器实时渲染' : '模型缺失 · 检查环境'} · ${assetId} · ${materialMode} · ${lightPreset} · ${geometryMode}`, 16*s, 22*s);
    ctx.font = `${10*s}px monospace`; ctx.fillText(`${stamp} | ${canvas.width}×${canvas.height} | DPR ${renderer.getPixelRatio().toFixed(2)}`, 16*s, 42*s);
    canvas.toBlob(blob => { if(blob) downloadBlob(blob, `island-${mode}-${assetId}-${stamp}.png`); });
  };
  $('quick-capture').onclick=()=>$('capture').click();
  $('measure-orbit').onclick=()=>{$('measure').click();measuring.orbit=true;setCamera();};
  $('measure').onclick = () => { $('measure-orbit').disabled=true; measuring = { start: 0, frames: [], calls: 0, triangles: 0 }; warmFrames = 0; $('measure').disabled = true; $('measure').textContent = '预热中…'; $('metrics').textContent = '正在记录当前画面。请保持本页前台可见。'; };
  document.addEventListener('visibilitychange', () => { if (document.hidden && measuring) finishMeasurement('页面切到后台，测量无效'); });
  if (query.get('mode') === 'scene' || query.get('mode') === 'inspect') await setMode(query.get('mode'));
  if(query.get('material') && ['clay','pbr','base'].includes(query.get('material'))) {
    materialMode=query.get('material');markButtons('data-material',materialMode);
    if(mode==='inspect')await loadInspection();
    if(sceneRoot)library.setMaterial(sceneRoot,materialMode);
  }
  if(query.get('light') && ['neutral','sun','dusk'].includes(query.get('light')))setLight(query.get('light'));
  if(query.get('clean')==='1')$('immersive').click();
}
boot().catch(e => error(e.message));
