import * as THREE from 'three';
import { createSea, createGodRays } from './sea.js';
import { Diver } from './diver.js';
import { NetProjectile } from './net.js';
import { Fish, rollCatch, isSynth, makeVariant, SPECIES_BY_ID } from './fishes.js';
import { createMeta, TANK_MAX } from './meta.js';
import { initAudio, sfx } from './sfx.js';
import { createAquarium } from './aquarium.js';
import { createTankUI } from './tank_ui.js';
import { setThumbMaker } from './ui.js';

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.canvas = $('c');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 22);
    this.camera.lookAt(0, 5, 0);

    this.meta = createMeta();
    this.initScene();
    this.initEntities();
    this.initUI();
    this.initInput();
    
    this.lastTime = 0;
    this.oxygen = 100;
    this.depth = 0;
    this.score = 0;
    this.isGameOver = false;
    this.isSurfacing = false;

    window.addEventListener('resize', () => this.onResize());
    requestAnimationFrame((t) => this.loop(t));
    
    // Initial spawn fish
    for (let i = 0; i < 20; i++) this.spawnFish(false, true);

    setTimeout(() => {
        $('splash').classList.add('out');
        this.showMessage('潜水开始！探索深海吧');
    }, 1500);
  }

  initScene() {
    this.scene.add(new THREE.AmbientLight('#fff', 0.5));
    const sun = new THREE.DirectionalLight('#fff', 1.5);
    sun.position.set(10, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -50;
    sun.shadow.camera.right = sun.shadow.camera.top = 50;
    this.scene.add(sun);

    this.sea = createSea(this.scene);
    this.godrays = createGodRays(this.scene);
  }

  initEntities() {
    this.diver = new Diver(this.scene);
    this.fishes = [];
    this.nets = [];
  }

  spawnFish(forceUgc = false, initial = false) {
    let sp;
    // Rare pool logic: released or synthesized fish appear here
    if (forceUgc || (Math.random() < 0.15 && this.meta.S.ocean.length > 0)) {
        const entry = this.meta.S.ocean[Math.floor(Math.random() * this.meta.S.ocean.length)];
        sp = JSON.parse(JSON.stringify(entry.v));
        sp.fromOcean = { by: sp.creator || '大海' };
    } else {
        const luck = Math.min(1, (35 - this.diver.root.position.y) / 30);
        sp = rollCatch({ luck: 0.1 + luck * 0.8 });
    }
    
    const fish = new Fish(sp);
    const side = Math.random() > 0.5 ? 1 : -1;
    const spawnX = initial ? (Math.random() - 0.5) * 60 : this.diver.root.position.x + side * (35 + Math.random() * 20);
    
    fish.root.position.set(
        spawnX,
        Math.random() * 30 + 2,
        Math.random() * 12 - 6
    );
    fish.velocity = new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 1.5, 0);
    this.scene.add(fish.root);
    this.fishes.push(fish);
  }

  initUI() {
    this.btn = $('action-btn');
    this.chargeCircle = $('charge-circle');
    this.charging = false;
    this.charge = 0;

    const handleActionStart = (e) => {
        if (this.isGameOver || this.isSurfacing || this.tankUI.isOpen) return;
        this.charging = true;
        this.charge = 0;
        if(e.cancelable) e.preventDefault();
    };
    this.btn.addEventListener('pointerdown', handleActionStart);
    
    window.addEventListener('pointerup', () => {
      if (this.charging) {
        this.fireNet();
        this.charging = false;
        this.chargeCircle.style.strokeDashoffset = 300;
      }
    });

    // Aquarium UI setup
    this.aq = createAquarium({ renderer: this.renderer });
    setThumbMaker((v, el) => {
        // Mock thumb maker using species id if real renderer not available/complex
        el.src = `assets/thumbs/${v.sp}.webp`;
        el.onload = () => el.classList.add('ok');
        el.onerror = () => { el.src = 'assets/thumbs/clownfish.webp'; };
    });

    this.tankUI = createTankUI({ 
        meta: this.meta, 
        aq: this.aq, 
        app: $('app'),
        size: () => ({ W: window.innerWidth, H: window.innerHeight }),
        onExit: () => {
            this.tankUI.close();
            // Resume game state if needed
        },
        onChanged: () => {
            // Meta saved
        }
    });

    $('tank-btn').onclick = () => {
        this.tankUI.open();
    };
  }

  fireNet() {
    const dir = this.diver.getAimDirection();
    const net = new NetProjectile(this.scene, this.diver.root.position, dir, this.charge);
    this.nets.push(net);
    if(typeof sfx === 'function') sfx('cast'); else if(sfx?.cast) sfx.cast();
  }

  initInput() {
    this.input = { up: false, down: false, left: false, right: false };
    
    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.input.up = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.input.down = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.input.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.input.right = true;
      if (e.code === 'Space') { this.charging = true; this.charge = 0; }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.input.up = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.input.down = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.input.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.input.right = false;
      if (e.code === 'Space' && this.charging) {
        this.fireNet();
        this.charging = false;
        this.chargeCircle.style.strokeDashoffset = 300;
      }
    });

    // Touch Joypad (Simple implementation)
    let touchStart = null;
    window.addEventListener('touchstart', (e) => {
        if (this.tankUI.isOpen) return;
        const t = e.touches[0];
        if (t.clientX < window.innerWidth / 2) {
            touchStart = { x: t.clientX, y: t.clientY };
        }
    });
    window.addEventListener('touchmove', (e) => {
        if (!touchStart) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        this.input.left = dx < -20;
        this.input.right = dx > 20;
        this.input.up = dy < -20;
        this.input.down = dy > 20;
    });
    window.addEventListener('touchend', () => {
        touchStart = null;
        this.input.left = this.input.right = this.input.up = this.input.down = false;
    });
  }

  onResize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.setSize(W, H);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    if (this.tankUI.isOpen) this.aq.resize(W, H);
  }

  loop(t) {
    const dt = Math.min((t - this.lastTime) / 1000, 0.1);
    this.lastTime = t;

    if (!this.tankUI.isOpen) {
        this.updateGame(dt);
        this.renderer.render(this.scene, this.camera);
        $('ui').classList.remove('off');
    } else {
        this.aq.update(dt);
        this.tankUI.tick(dt);
        this.renderer.render(this.aq.scene, this.aq.camera);
        $('ui').classList.add('off');
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  updateGame(dt) {
    if (this.isSurfacing) {
        this.diver.root.position.y += 12 * dt;
        if (this.diver.root.position.y >= 35) {
            this.isSurfacing = false;
            this.oxygen = 100;
            this.showMessage('氧气已补充满！');
        }
    } else {
        this.diver.update(dt, this.input);
        // Oxygen - Depletes faster as you go deeper
        const depthFactor = Math.max(1, (35 - this.diver.root.position.y) / 10);
        this.oxygen -= 1.2 * depthFactor * dt;
        if (this.oxygen <= 0) {
            this.oxygen = 0;
            this.isSurfacing = true;
            this.showMessage('氧气耗尽！紧急上浮...');
        }
    }
    
    // Smooth camera follow
    const targetCamX = this.diver.root.position.x;
    const targetCamY = this.diver.root.position.y + 2;
    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.05;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 0.05;
    this.camera.lookAt(this.diver.root.position.x, this.diver.root.position.y, 0);
    
    this.sea.update(this.lastTime / 1000);
    $('oxy-bar').style.width = `${this.oxygen}%`;
    this.depth = Math.max(0, Math.round(35 - this.diver.root.position.y));
    $('depth-v').innerText = `${this.depth}m`;

    if (this.charging) {
      this.charge = Math.min(this.charge + dt * 1.5, 1);
      this.chargeCircle.style.strokeDashoffset = 300 - (this.charge * 300);
    }

    // Update Fishes
    let clusterCount = 0;
    this.fishes.forEach(fish => {
      fish.animate(dt);
      fish.root.position.addScaledVector(fish.velocity, dt);
      
      const dist = fish.root.position.distanceTo(this.diver.root.position);
      if (dist < 6) {
          clusterCount++;
          // Avoidance
          const escapeDir = fish.root.position.clone().sub(this.diver.root.position).normalize();
          fish.root.position.addScaledVector(escapeDir, 3 * dt);
      }

      // Wrap around or Respawn logic
      if (Math.abs(fish.root.position.x - this.diver.root.position.x) > 60) {
          fish.root.position.x = this.diver.root.position.x - Math.sign(fish.velocity.x) * 55;
          fish.root.position.y = Math.random() * 30 + 2;
      }
    });

    if (clusterCount >= 3) {
        this.showMessage('鱼群聚集！适合撒网', true);
    }

    // Update Nets
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const net = this.nets[i];
      net.update(dt);
      for (let j = this.fishes.length - 1; j >= 0; j--) {
        const fish = this.fishes[j];
        if (net.root.position.distanceTo(fish.root.position) < 3) {
          this.catchFish(fish);
          this.fishes.splice(j, 1);
          this.scene.remove(fish.root);
          net.isDead = true;
          break;
        }
      }
      if (net.isDead) { net.dispose(this.scene); this.nets.splice(i, 1); }
    }

    if (this.fishes.length < 25) this.spawnFish();
  }

  catchFish(fish) {
    const spData = fish.v || fish.sp;
    this.score += 15;
    $('score-v').innerText = this.score;
    const name = spData.nick || (SPECIES_BY_ID[spData.sp]?.name) || '稀有鱼';
    this.showMessage(`捕获了: ${name}！`);
    
    // Record in meta
    this.meta.recordCatch(spData, { score: 15 });
    if (!this.meta.tankFull()) {
        this.meta.addToTank(spData);
    } else {
        // Auto release if tank full for now, or could trigger openRoom
        this.meta.releaseFish(spData);
        this.showMessage('鱼缸已满，自动放生');
    }
  }

  showMessage(txt, persistent = false) {
    const m = $('message');
    m.innerText = txt;
    m.classList.add('show');
    if (!persistent) {
        clearTimeout(this.msgTimer);
        this.msgTimer = setTimeout(() => m.classList.remove('show'), 2000);
    } else {
        setTimeout(() => m.classList.remove('show'), 500);
    }
  }
}

new Game();
initAudio();
