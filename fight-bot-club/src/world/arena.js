// 擂台场景：拳击台（围绳 / 角柱 / 围裙广告）、看台人群（实例化）、桁架灯光与体积光、悬挂大屏
// 移动端：灯光数量恒定（避免着色器重编译），人群/灯头全部实例化或合批，阴影只投机甲
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RING } from '../game/sim.js';
import { makeCanvasFloor, makeTextTexture, makeGlowTexture } from '../render/textures.js';
import { GLOBAL_TIME } from '../render/materials.js';
import { mulberry32 } from '../core/util.js';

const MAT = RING + 0.9;   // 台面半宽
const POST = RING + 0.55; // 角柱位置
const PLAT_H = 1.3;

export class Arena {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.q = quality;
    const r = mulberry32(42);
    scene.background = new THREE.Color(0x04050b);
    scene.fog = new THREE.FogExp2(0x05060d, 0.011); // 雾减淡：画面更通透

    // —— 环境反射（一次生成）
    const pm = new THREE.PMREMGenerator(renderer);
    const envRT = pm.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture; scene.environmentIntensity = 0.55;
    pm.dispose();

    // —— 灯光（恒定数量）
    this.hemi = new THREE.HemisphereLight(0x8fa6ff, 0x1a1020, 0.55); scene.add(this.hemi);
    const key = this.key = new THREE.DirectionalLight(0xfff1e0, 2.0);
    key.position.set(6, 22, 9); key.target.position.set(0, 0, 0);
    key.castShadow = true;
    const S = quality.shadow;
    key.shadow.mapSize.set(S, S);
    const sc = key.shadow.camera; sc.left = sc.bottom = -13; sc.right = sc.top = 13; sc.near = 4; sc.far = 50;
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
    scene.add(key, key.target);
    const rimA = new THREE.DirectionalLight(0xf569a8, 0.9); rimA.position.set(-14, 7, -10); scene.add(rimA);
    const rimB = new THREE.DirectionalLight(0xdeff72, 0.9); rimB.position.set(14, 6, -8); scene.add(rimB);
    const fill = new THREE.DirectionalLight(0x9aa8ff, 0.5); fill.position.set(0, 5, 18); scene.add(fill);
    this.rims = [rimA, rimB];

    this.buildRing(r);
    this.buildFloorAndStands(r);
    this.buildTruss(r);
    this.buildScreen();
  }

  buildRing(r) {
    const scene = this.scene;
    // 台面
    const top = new THREE.Mesh(new THREE.BoxGeometry(MAT * 2, 0.24, MAT * 2), [
      new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: makeCanvasFloor(1024), roughness: 0.78, metalness: 0.02 }), new THREE.MeshStandardMaterial({ color: 0x111622 }),
      new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.7 }),
    ]);
    top.position.y = -0.12; top.receiveShadow = true; scene.add(top);
    // 台基 + 围裙广告
    const skirtTex = makeTextTexture(['FIGHT BOT CLUB', '即梦 · 机甲擂台', 'CREATE · FIGHT · WIN'], { w: 2048, h: 160, accent: '#DEFF70' });
    skirtTex.wrapS = THREE.RepeatWrapping;
    this.skirtTex = skirtTex;
    const skirtMat = new THREE.MeshStandardMaterial({ map: skirtTex, emissiveMap: skirtTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5 });
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(MAT * 2 + 0.1, PLAT_H - 0.24, MAT * 2 + 0.1), [skirtMat, skirtMat, new THREE.MeshBasicMaterial({ color: 0 }), new THREE.MeshBasicMaterial({ color: 0 }), skirtMat, skirtMat]);
    skirt.position.y = -0.24 - (PLAT_H - 0.24) / 2; scene.add(skirt);
    // 台边 LED 灯带
    const led = new THREE.Mesh(new THREE.BoxGeometry(MAT * 2 + 0.16, 0.06, MAT * 2 + 0.16), new THREE.MeshBasicMaterial({ color: 0xb84d7e }));
    led.position.y = -0.27; scene.add(led); this.led = led;
    // 角柱
    const postGeo = [];
    const padCols = [0x9e3f6b, 0x8fa63c, 0xf5f5f5, 0xf5f5f5]; // 压暗的玫红/黄绿，避免受光泛光
    const posts = [[-1, -1], [1, 1], [1, -1], [-1, 1]];
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 1, roughness: 0.28 });
    posts.forEach(([sx, sz], i) => {
      const g = new THREE.CylinderGeometry(0.16, 0.2, 3.4, 16); g.translate(sx * POST, 1.5, sz * POST); postGeo.push(g);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.5), new THREE.MeshStandardMaterial({ color: padCols[i], roughness: 0.55, emissive: padCols[i], emissiveIntensity: 0 }));
      pad.position.set(sx * POST, 1.65, sz * POST); pad.rotation.y = Math.PI / 4; scene.add(pad);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: i < 2 ? 0xb0b0b0 : 0xffffff }));
      cap.position.set(sx * POST, 3.25, sz * POST); scene.add(cap);
    });
    const postMesh = new THREE.Mesh(mergeGeometries(postGeo), metal); postMesh.castShadow = false; scene.add(postMesh);
    // 围绳（发光管，可抖动）
    this.ropes = [];
    const ropeCols = [0xf569a8, 0xffffff, 0xdeff72];
    const H = [0.95, 1.75, 2.55];
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.CylinderGeometry(0.055, 0.055, POST * 2, 8, 12, true); g.rotateZ(Math.PI / 2);
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: ropeCols[k], emissive: ropeCols[k], emissiveIntensity: ropeCols[k] === 0xffffff ? 0.3 : 0.2, roughness: 0.4 }));
        const ang = side * Math.PI / 2;
        m.position.set(Math.sin(ang) * POST, H[k], Math.cos(ang) * POST); m.rotation.y = ang;
        m.userData = { side, k, base: g.attributes.position.array.slice(), wob: 0, wobT: 0 };
        scene.add(m); this.ropes.push(m);
      }
    }
    // 台阶 / 角落
    const stairs = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.2), new THREE.MeshStandardMaterial({ color: 0x222838, roughness: 0.6 }));
    stairs.position.set(-POST + 1.4, -0.9, MAT + 0.7); scene.add(stairs);
  }

  buildFloorAndStands(r) {
    const scene = this.scene;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ color: 0x07080e, roughness: 0.35, metalness: 0.6 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -PLAT_H; scene.add(floor);
    // 地面光圈
    const ringGlow = new THREE.Mesh(new THREE.RingGeometry(MAT + 1.0, MAT + 1.25, 64), new THREE.MeshBasicMaterial({ color: 0xdeff72, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    ringGlow.rotation.x = -Math.PI / 2; ringGlow.position.y = -PLAT_H + 0.02; scene.add(ringGlow);
    // 看台（台阶状） + 人群
    const tiers = 7, perTier = 72;
    const standGeo = [];
    const people = [];
    for (let t = 0; t < tiers; t++) {
      const R0 = 19 + t * 2.0, y = -PLAT_H + 0.6 + t * 1.15;
      const g = new THREE.CylinderGeometry(R0 + 1.8, R0 + 1.8, 0.4, 64, 1, true); g.translate(0, y - 0.2, 0); standGeo.push(g);
      const st = new THREE.RingGeometry(R0, R0 + 2.0, 64); st.rotateX(-Math.PI / 2); st.translate(0, y, 0); standGeo.push(st);
      for (let i = 0; i < perTier; i++) {
        if (r() < 0.12) continue;
        const a = (i + r() * 0.6) / perTier * Math.PI * 2;
        const rr = R0 + 0.7 + r() * 0.6;
        people.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, a, s: 0.85 + r() * 0.3, c: r(), ph: r() * 10 });
      }
    }
    const stands = new THREE.Mesh(mergeGeometries(standGeo.map((g) => g.toNonIndexed())), new THREE.MeshPhysicalMaterial({ color: 0x15161e, roughness: 1, metalness: 0, envMapIntensity: 0.12, sheen: 0.7, sheenRoughness: 0.85, sheenColor: new THREE.Color(0x2c2a38), side: THREE.DoubleSide }) /* v10.2 绒布座席：无镜面高光，仅柔和的绒面边缘光 */);
    scene.add(stands);
    // 人：身体 + 头合成一个几何体
    const body = new THREE.CylinderGeometry(0.28, 0.34, 1.0, 6); body.translate(0, 0.5, 0);
    const head = new THREE.SphereGeometry(0.22, 6, 5); head.translate(0, 1.2, 0);
    const pg = mergeGeometries([body.toNonIndexed(), head.toNonIndexed()]);
    const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.25 });
    pm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = GLOBAL_TIME;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = float(gl_InstanceID) * 1.731;
        transformed.y += max(0.0, sin(uTime * (3.0 + mod(ph, 2.0)) + ph)) * 0.25 * step(0.4, fract(ph));`);
    };
    const crowd = new THREE.InstancedMesh(pg, pm, people.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const tints = [0x2a3350, 0x3a2440, 0x1f3a3a, 0x40302a, 0x262a36, 0x4a1f2e].map((h) => { const c = new THREE.Color(h), hsl = {}; c.getHSL(hsl); return c.setHSL(hsl.h, hsl.s * 0.4, hsl.l * 0.95).getHex(); }); // v10.2 观众降饱和，退到背景
    people.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.a - Math.PI / 2);
      m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      crowd.setMatrixAt(i, m4); crowd.setColorAt(i, col.setHex(tints[Math.floor(p.c * tints.length)]));
    });
    scene.add(crowd);
    // 荧光棒 / 手机闪光（点精灵，着色器闪烁）
    const n = Math.floor(people.length * 0.55);
    const pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), ph = new Float32Array(n);
    const palette = [[0.961, 0.412, 0.659], [0.871, 1, 0.447], [1, 0.882, 0.208], [0.718, 0.643, 1], [0.498, 0.898, 0.804]].map((c) => { const m = (c[0] + c[1] + c[2]) / 3; return c.map((v) => (v + (m - v) * 0.45) * 0.8); }); // v10.2 荧光棒降饱和降亮，不抢战斗主视觉
    for (let i = 0; i < n; i++) {
      const p = people[Math.floor(r() * people.length)];
      pos.set([p.x * 0.985, p.y + 1.75 + r() * 0.4, p.z * 0.985], i * 3); cl.set(palette[Math.floor(r() * palette.length)], i * 3); ph[i] = r() * 100;
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.BufferAttribute(cl, 3)); lg.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
    this.excite = { value: 0.3 };
    const lm = new THREE.ShaderMaterial({
      uniforms: { uTime: GLOBAL_TIME, uTex: { value: makeGlowTexture(64, 0.3) }, uEx: this.excite, uPR: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute float ph; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uTime; uniform float uEx; uniform float uPR;
        void main(){ vC=color; vec3 p=position; p.x += sin(uTime*3.0+ph)*0.25*uEx; vA = 0.35 + 0.65*max(0.0, sin(uTime*(1.5+uEx*4.0)+ph)); vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize = (14.0+uEx*10.0)*uPR / -mv.z * 10.0; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ float a=texture2D(uTex, gl_PointCoord).a; gl_FragColor=vec4(vC*a*vA*1.6, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    scene.add(new THREE.Points(lg, lm));
  }

  buildTruss(r) {
    const scene = this.scene;
    const Y = 15, W = 13;
    // v10.2 去掉环形灯架围栏（常挡视线）：每盏射灯改为从屋顶垂下一根细吊杆 + 小 U 形支架
    const g = [];
    // 灯头 + 体积光锥（加色，不是真实光源）
    const headGeo = [], cones = [];
    const coneMat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 1.6); float a = f * pow(vY, 2.2) * 0.07; gl_FragColor = vec4(uCol * a, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const cols = [0xffffff, 0xf569a8, 0xdeff72, 0xffffff, 0xffe135, 0xb7a4ff, 0xffffff, 0x7fe5cd];
    this.cones = [];
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2 + 0.39;
      const px = Math.cos(ang) * W, pz = Math.sin(ang) * W;
      const hg = new THREE.CylinderGeometry(0.35, 0.45, 0.8, 10); hg.translate(px, Y - 0.4, pz); headGeo.push(hg);
      const rod = new THREE.CylinderGeometry(0.05, 0.05, 22, 6); rod.translate(px, Y + 11, pz); g.push(rod);
      const yoke = new THREE.BoxGeometry(1.0, 0.08, 0.08); yoke.translate(px, Y + 0.12, pz); g.push(yoke);
      for (const sx of [-0.5, 0.5]) { const arm = new THREE.BoxGeometry(0.07, 0.6, 0.07); arm.translate(px + sx, Y - 0.18, pz); g.push(arm); }
      const len = 19;
      const cg = new THREE.CylinderGeometry(0.3, 3.2, len, 20, 1, true); cg.translate(0, -len / 2, 0);
      const m = coneMat.clone(); m.uniforms.uCol.value = new THREE.Color(cols[i]);
      const cone = new THREE.Mesh(cg, m); cone.position.set(px, Y - 0.6, pz);
      cone.lookAt(0, -40, 0); cone.rotateX(-Math.PI / 2);
      cone.userData = { px, pz, ph: r() * 10, sp: 0.2 + r() * 0.3 };
      scene.add(cone); this.cones.push(cone);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), new THREE.MeshBasicMaterial({ color: cols[i] }));
      lens.position.set(px, Y - 0.82, pz); lens.rotation.x = Math.PI / 2; scene.add(lens);
    }
    scene.add(new THREE.Mesh(mergeGeometries(headGeo), new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.7, roughness: 0.5 })));
    scene.add(new THREE.Mesh(mergeGeometries(g), new THREE.MeshStandardMaterial({ color: 0x3a3f4c, metalness: 0.9, roughness: 0.4 })));
  }

  buildScreen() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    this.screenCanvas = c; this.screenCtx = c.getContext('2d');
    const tex = this.screenTex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const frame = new THREE.MeshStandardMaterial({ color: 0x0b0d14, metalness: 0.6, roughness: 0.4 });
    const g = new THREE.Group(); g.position.y = 19.5;
    for (let s = 0; s < 4; s++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), mat);
      // v10.1 修复：屏宽 8 却贴在 6 宽的箱体上，四面屏两端各伸出 1 个单位互相穿插，斜看像两块屏交叠；箱体改为 8.4 宽，屏面居中贴合
      const ang = s * Math.PI / 2; p.position.set(Math.sin(ang) * 4.21, 0, Math.cos(ang) * 4.21); p.rotation.y = ang; g.add(p);
    }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(8.4, 4.4, 8.4), frame));
    this.scene.add(g); this.screen = g;
    this.setScreen('FIGHT BOT CLUB', '等待挑战者', '#DEFF70', '#FF61A8');
  }
  setScreen(a, b, ca = '#DEFF70', cb = '#FF61A8', mid = 'VS') {
    const g = this.screenCtx, W = 1024, H = 512;
    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#1D1C20'); grd.addColorStop(1, '#130D2B');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = ca; g.fillRect(0, 0, W / 2, 10); g.fillStyle = cb; g.fillRect(W / 2, 0, W / 2, 10);
    g.fillStyle = ca; g.fillRect(0, H - 10, W / 2, 10); g.fillStyle = cb; g.fillRect(W / 2, H - 10, W / 2, 10);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fit = (s, max, size) => { let f = size; g.font = `900 ${f}px "PingFang SC", "Microsoft YaHei", Arial Black, sans-serif`; while (g.measureText(s).width > max && f > 30) { f -= 4; g.font = `900 ${f}px "PingFang SC", "Microsoft YaHei", Arial Black, sans-serif`; } };
    fit(a, W * 0.9, 84); g.fillStyle = ca; g.fillText(a, W / 2, H * 0.26);
    g.font = '900 96px Arial Black, sans-serif'; g.fillStyle = '#ffffff'; g.fillText(mid, W / 2, H * 0.52);
    fit(b, W * 0.9, 84); g.fillStyle = cb; g.fillText(b, W / 2, H * 0.78);
    this.screenTex.needsUpdate = true;
  }

  // 围绳被撞：抖动
  hitRope(x, z, power = 1) {
    let side;
    if (Math.abs(x) > Math.abs(z)) side = x > 0 ? 1 : 3; else side = z > 0 ? 0 : 2;
    for (const m of this.ropes) if (m.userData.side === side) { m.userData.wob = Math.min(1.5, m.userData.wob + 0.6 * power); m.userData.hitU = side === 0 || side === 2 ? x : z; }
  }

  update(dt, t, excite = 0.3) {
    this.excite.value += (excite - this.excite.value) * Math.min(1, dt * 2);
    this.skirtTex.offset.x = (t * 0.03) % 1;
    const hue = (t * 0.05) % 1; this.led.material.color.setHSL(hue, 0.9, 0.55);
    for (const c of this.cones) {
      const u = c.userData; const a = t * u.sp + u.ph;
      c.lookAt(Math.sin(a) * 7, -PLAT_H - 20, Math.cos(a * 1.3) * 7); c.rotateX(-Math.PI / 2);
    }
    for (const m of this.ropes) {
      const u = m.userData; if (u.wob < 0.002 && !u.dirty) continue;
      u.wobT += dt * 16; u.wob *= Math.exp(-dt * 2.5);
      const pa = m.geometry.attributes.position, arr = pa.array, base = u.base;
      // 绳沿本地 X，从 -POST 到 POST；本地 Z 是向外
      const sign = (u.side === 1 || u.side === 2) ? -1 : 1;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i]; const s = 1 - (x / POST) ** 2;
        arr[i + 2] = base[i + 2] + Math.sin(u.wobT) * u.wob * 0.35 * s;
        arr[i + 1] = base[i + 1] - Math.abs(Math.sin(u.wobT * 0.5)) * u.wob * 0.1 * s;
      }
      pa.needsUpdate = true; u.dirty = u.wob > 0.002;
    }
  }
}
export { MAT, POST, PLAT_H };
