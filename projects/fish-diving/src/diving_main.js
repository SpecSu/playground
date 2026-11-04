window.onerror = function(msg, url, line, col, error) { console.error("GLOBAL ERROR:", msg, error); };
console.log("App Started");
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { createSkyDome } from './sky.js';
import { createOcean } from './water.js';
import { createBoat, HULL } from './boat.js';
import { stylizeObject } from './toon.js';
import { Character } from './rig.js';
import { createDivingUI } from './diving_ui.js';
import { buildEnv, floorAt, FLOOR_Y } from './aqua_env.js';

const ui = createDivingUI();

const app = document.getElementById('app') || document.body;
const canvas = document.getElementById('c') || document.createElement('canvas');
if (!document.getElementById('c')) {
  canvas.id = 'c';
  app.appendChild(canvas);
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

const FOV = 60;
const TANH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const uPx = { value: (window.innerHeight * window.devicePixelRatio) / (2 * TANH) };
const hwAt = (z) => Math.max(0.6, (8.8 - z) * TANH * camera.aspect); // base hwAt logic

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  uPx.value = (window.innerHeight * window.devicePixelRatio) / (2 * TANH);
});
renderer.setSize(window.innerWidth, window.innerHeight);

const sky = createSkyDome();
scene.add(sky);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(100, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const ocean = createOcean();
scene.add(ocean.mesh);

const boat = createBoat();
boat.group.position.set(20, 0, -20);
scene.add(boat.group);

const aquaCtx = { renderer, camera, scene, clock: { elapsedTime: 0 }, hwAt, uPx };
const env = buildEnv('reef', aquaCtx);
scene.add(env.root);

const FISH_COUNT = 100;
const fishGeo = new THREE.ConeGeometry(0.2, 0.8, 8);
fishGeo.rotateX(Math.PI / 2);
const fishMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.4 });
const rareMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.2, emissive: 0xffaa00, emissiveIntensity: 0.5 });
const fishMesh = new THREE.InstancedMesh(fishGeo, fishMat, FISH_COUNT);
fishMesh.castShadow = true;
const rareMesh = new THREE.InstancedMesh(fishGeo, rareMat, FISH_COUNT);
rareMesh.castShadow = true;

const fishes = [];
for (let i = 0; i < FISH_COUNT; i++) {
  const isRare = Math.random() < 0.1;
  fishes.push({
    id: i,
    isRare,
    pos: new THREE.Vector3((Math.random() - 0.5) * 80, -Math.random() * 20 - 2, (Math.random() - 0.5) * 80),
    vel: new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.2, (Math.random() - 0.5)).normalize().multiplyScalar(Math.random() * 2 + 1),
    active: true
  });
}
scene.add(fishMesh);
scene.add(rareMesh);

let player, root;
let oxygen = 100;
let score = 0;
let isGameOver = false;

const loader = new GLTFLoader();
loader.load('assets/crew/subeike.glb', (gltf) => {
  player = new Character(gltf.scene, { name: 'subeike' });
  root = player.root;
  root.position.set(0, 0, 0);
  scene.add(root);
  stylizeObject(root);

  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.06), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  goggles.position.set(0, 0.45, 0.15); 
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }));
  glass.position.set(0, 0, 0.03);
  goggles.add(glass);
  root.add(goggles);

  const flipperGeo = new THREE.BoxGeometry(0.15, 0.05, 0.4);
  const flipperMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
  const fL = new THREE.Mesh(flipperGeo, flipperMat);
  fL.position.set(0.15, 0.05, -0.1);
  const fR = new THREE.Mesh(flipperGeo, flipperMat);
  fR.position.set(-0.15, 0.05, -0.1);
  root.add(fL);
  root.add(fR);
  
  player.fL = fL;
  player.fR = fR; player.fR = fR;
});

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

const clock = new THREE.Clock();
const dummy = new THREE.Object3D();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();

  aquaCtx.clock.elapsedTime = time;
  if (env.update) env.update(delta, camera);

  if (player && root && !isGameOver) {
    const speed = 6 * delta;
    const move = new THREE.Vector3();
    
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    camDir.y = 0; camDir.normalize();
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    camRight.y = 0; camRight.normalize();

    if (keys['KeyW'] || keys['ArrowUp']) move.add(camDir);
    if (keys['KeyS'] || keys['ArrowDown']) move.sub(camDir);
    if (keys['KeyA'] || keys['ArrowLeft']) move.sub(camRight);
    if (keys['KeyD'] || keys['ArrowRight']) move.add(camRight);
    
    if (keys['Space']) move.y += 1;
    if (keys['ShiftLeft'] || keys['ShiftRight']) move.y -= 1;

    if (move.length() > 0) {
      move.normalize();
      root.position.addScaledVector(move, speed * 2);
      
      const targetYaw = Math.atan2(move.x, move.z);
      root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, targetYaw, 0.1);
      
      player.fL.rotation.x = Math.sin(time * 10) * 0.5;
      player.fR.rotation.x = Math.sin(time * 10 + Math.PI) * 0.5;
      
      if (player.rig) player.rig.update(delta, time, move.length());
    } else {
      if (player.fL) player.fL.rotation.x = 0;
      if (player.fR) player.fR.rotation.x = 0;
      if (player.rig) player.rig.update(delta, time, 0);
    }

    const floorY = floorAt(root.position.x, root.position.z);
    if (root.position.y < floorY + 0.5) root.position.y = floorY + 0.5;
    if (root.position.y > 0) root.position.y = 0;
    
    const isSurface = root.position.y >= -0.5;
    if (!isSurface) {
      oxygen -= 4 * delta;
      if (oxygen <= 0) {
        oxygen = 0;
        isGameOver = true;
        ui.showGameOver(score, () => {
          oxygen = 100;
          score = 0;
          isGameOver = false;
          root.position.set(0, 0, 0);
        });
      }
    } else {
      oxygen = Math.min(100, oxygen + 20 * delta);
    }
    ui.update(oxygen, score, isSurface);

    const idealOffset = new THREE.Vector3(0, 2, 6).applyAxisAngle(new THREE.Vector3(0, 1, 0), root.rotation.y);
    const targetCamPos = root.position.clone().add(idealOffset);
    camera.position.lerp(targetCamPos, 0.1);
    camera.lookAt(root.position.clone().add(new THREE.Vector3(0, 1, 0)));

    let normIdx = 0, rareIdx = 0;
    fishes.forEach((f) => {
      if (!f.active) return;
      f.pos.addScaledVector(f.vel, delta * (f.isRare ? 3 : 1));
      
      if (f.pos.x > 40 || f.pos.x < -40) f.vel.x *= -1;
      if (f.pos.z > 40 || f.pos.z < -40) f.vel.z *= -1;
      if (f.pos.y > -1 || f.pos.y < floorAt(f.pos.x, f.pos.z) + 1) f.vel.y *= -1;

      if (f.isRare && f.pos.distanceTo(root.position) < 2.5) {
        f.active = false;
        score += 10;
      } else {
        dummy.position.copy(f.pos);
        dummy.lookAt(f.pos.clone().add(f.vel));
        dummy.updateMatrix();
        if (f.isRare) {
          rareMesh.setMatrixAt(rareIdx++, dummy.matrix);
        } else {
          fishMesh.setMatrixAt(normIdx++, dummy.matrix);
        }
      }
    });
    
    for (let i = normIdx; i < FISH_COUNT; i++) {
      dummy.position.set(1000,1000,1000); dummy.updateMatrix();
      fishMesh.setMatrixAt(i, dummy.matrix);
    }
    for (let i = rareIdx; i < FISH_COUNT; i++) {
      dummy.position.set(1000,1000,1000); dummy.updateMatrix();
      rareMesh.setMatrixAt(i, dummy.matrix);
    }
    fishMesh.instanceMatrix.needsUpdate = true;
    rareMesh.instanceMatrix.needsUpdate = true;
  } else if (!player) {
    // Before player loads, give a default view
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 0, -5);
  }

  const isUnderWater = camera.position.y < 0;
  if (isUnderWater) {
    scene.fog = new THREE.FogExp2(0x004488, 0.03);
    renderer.setClearColor(0x004488);
  } else {
    scene.fog = new THREE.Fog(0xddeeff, 50, 500);
    renderer.setClearColor(0xddeeff);
  }

  if (ocean && ocean.update) ocean.update(time, camera);

  renderer.render(scene, camera);
}

document.addEventListener('click', () => {});
animate();

