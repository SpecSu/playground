// 风格化角色：圆润的"豆豆人"比例（类似动森/糖豆人的亲和力），配合 PBR 布料 sheen 材质
import * as THREE from 'three';

const capsule = (r, len, mat, seg = 12) => {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};
const sphere = (r, mat, ws = 24, hs = 16) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};
const fabric = (c, sheen = '#ffffff') => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.82, sheen: 0.8, sheenRoughness: 0.55, sheenColor: new THREE.Color(sheen) });

const SKINS = ['#f2c6a5', '#d9a07a', '#a8714f', '#f7d8bf'];

export function makeCharacter(opts = {}) {
  const o = Object.assign({ skin: SKINS[0], shirt: '#ffffff', shorts: '#2c4a6e', hat: 'cap', hatColor: '#ff7f6e', hair: '#2b1d16', glasses: true, shoe: '#ffffff' }, opts);
  const skin = new THREE.MeshPhysicalMaterial({ color: o.skin, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffd9c4'), sheenRoughness: 0.4 });
  const shirt = fabric(o.shirt);
  const shorts = fabric(o.shorts);
  const shoe = new THREE.MeshStandardMaterial({ color: o.shoe, roughness: 0.6 });
  const hair = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.7 });
  const hatM = fabric(o.hatColor);
  const lens = new THREE.MeshPhysicalMaterial({ color: '#141821', roughness: 0.05, metalness: 0.3, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 });

  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.62; root.add(hips);
  const pelvis = capsule(0.17, 0.08, shorts); pelvis.scale.set(1.05, 1, 0.8); hips.add(pelvis);

  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  const torso = capsule(0.19, 0.24, shirt); torso.position.y = 0.2; torso.scale.set(1.08, 1, 0.78); spine.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20), shirt); collar.rotation.x = Math.PI / 2; collar.position.y = 0.43; spine.add(collar);

  const neck = new THREE.Group(); neck.position.y = 0.46; spine.add(neck);
  const head = new THREE.Group(); head.position.y = 0.2; neck.add(head);
  const skull = sphere(0.21, skin, 32, 24); skull.scale.set(1, 0.98, 0.95); head.add(skull);
  const nose = sphere(0.035, skin, 12, 8); nose.position.set(0, -0.01, 0.2); head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = sphere(0.045, skin, 12, 8); ear.position.set(sx * 0.2, 0, 0); ear.scale.set(0.5, 1, 0.8); head.add(ear);
  }
  // 微笑
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#5a2a24', roughness: 0.6 }));
  smile.position.set(0, -0.08, 0.19); smile.rotation.set(0.25, 0, Math.PI); head.add(smile);
  const cheekM = new THREE.MeshStandardMaterial({ color: '#ff9a8a', roughness: 0.8, transparent: true, opacity: 0.55 });
  for (const sx of [-1, 1]) { const ch = sphere(0.035, cheekM, 12, 8); ch.scale.z = 0.3; ch.position.set(sx * 0.12, -0.05, 0.17); ch.rotation.y = sx * 0.6; head.add(ch); }
  // 头发
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.218, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.rotation.x = -0.35; hairCap.position.set(0, 0.01, -0.01); hairCap.castShadow = true; head.add(hairCap);
  // 眼睛 / 墨镜
  if (o.glasses) {
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.03, 4, 12), lens);
      l.rotation.z = Math.PI / 2; l.scale.set(1, 1, 0.4); l.position.set(sx * 0.075, 0.03, 0.195); head.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), lens); bridge.rotation.z = Math.PI / 2; bridge.position.set(0, 0.04, 0.205); head.add(bridge);
  } else {
    const eyeM = new THREE.MeshStandardMaterial({ color: '#1b1b22', roughness: 0.2 });
    for (const sx of [-1, 1]) { const e = sphere(0.025, eyeM, 12, 8); e.scale.set(1, 1.3, 0.5); e.position.set(sx * 0.07, 0.03, 0.195); head.add(e); }
  }
  // 帽子
  if (o.hat === 'cap') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.225, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hatM); crown.position.y = 0.04; crown.scale.y = 0.85; crown.castShadow = true; head.add(crown);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 24, 1, false, -Math.PI / 2, Math.PI), hatM); visor.position.set(0, 0.06, 0.15); visor.scale.z = 1.1; visor.castShadow = true; head.add(visor);
  } else if (o.hat === 'bucket') {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.17, 28), hatM); crown.position.y = 0.15; crown.castShadow = true; head.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.33, 0.02, 32), hatM); brim.position.y = 0.075; brim.rotation.x = 0.06; brim.castShadow = true; head.add(brim);
  } else if (o.hat === 'straw') {
    const straw = new THREE.MeshStandardMaterial({ color: '#e8cf8f', roughness: 0.85 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.15, 28), straw); crown.position.y = 0.16; crown.castShadow = true; head.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.015, 40), straw); brim.position.y = 0.09; brim.castShadow = true; head.add(brim);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 28, 1, true), hatM); band.position.y = 0.11; head.add(band);
  } else if (o.hat === 'bun') {
    const bun = sphere(0.1, hair, 16, 12); bun.position.set(0, 0.2, -0.06); head.add(bun);
  }

  // 四肢（肩/髋为枢轴，便于动画）
  const limbs = {};
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.24, 0.36, 0); spine.add(sh);
    const sleeve = capsule(0.075, 0.08, shirt); sleeve.position.y = -0.05; sh.add(sleeve);
    const upper = capsule(0.058, 0.18, skin); upper.position.y = -0.15; sh.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.27; sh.add(elbow);
    const fore = capsule(0.052, 0.16, skin); fore.position.y = -0.1; elbow.add(fore);
    const hand = sphere(0.062, skin, 16, 12); hand.position.y = -0.22; elbow.add(hand);
    const grip = new THREE.Group(); grip.position.y = -0.23; elbow.add(grip);
    limbs[sx < 0 ? 'lArm' : 'rArm'] = { sh, elbow, grip };

    const hp = new THREE.Group(); hp.position.set(sx * 0.1, -0.02, 0); hips.add(hp);
    const thigh = capsule(0.085, 0.14, shorts); thigh.position.y = -0.1; hp.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.26; hp.add(knee);
    const shin = capsule(0.062, 0.18, skin); shin.position.y = -0.1; knee.add(shin);
    const foot = capsule(0.06, 0.08, shoe); foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.26, 0.04); knee.add(foot);
    limbs[sx < 0 ? 'lLeg' : 'rLeg'] = { hp, knee };
  }

  return { root, hips, spine, neck, head, ...limbs, phase: Math.random() * 10 };
}

// 钓竿：碳素竿身 + 软木握把 + 渔轮；返回竿尖节点用于连线
export function makeRod() {
  // 分段竿身：8 节嵌套关节，setBend() 可沿鱼线方向弯成自然弧线（咬钩/搏鱼时的核心反馈）
  const g = new THREE.Group();
  const blank = new THREE.MeshStandardMaterial({ color: '#23344a', roughness: 0.4, metalness: 0.1 });
  const cork = new THREE.MeshStandardMaterial({ color: '#c79a62', roughness: 0.9 });
  const reelM = new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 0.6, roughness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: '#ff7f6e', roughness: 0.5 });
  const len = 2.3, SEG = 8, segL = len / SEG;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.42, 12), cork); handle.position.y = 0.05; g.add(handle);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12), accent); ring.position.y = 0.28; g.add(ring);
  const reel = new THREE.Group(); reel.position.set(0, 0.16, 0.06); g.add(reel);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.055, 20), reelM); drum.rotation.z = Math.PI / 2; reel.add(drum);
  const crank = new THREE.Group(); crank.position.x = 0.04; reel.add(crank);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.07, 0.012), reelM); arm.position.y = 0.03; crank.add(arm);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.025, 8), accent); knob.rotation.z = Math.PI / 2; knob.position.set(0.012, 0.062, 0); crank.add(knob);
  const base = new THREE.Group(); base.position.y = 0.26; g.add(base);
  const joints = [];
  let parent = base;
  for (let i = 0; i < SEG; i++) {
    const j = new THREE.Group(); if (i > 0) j.position.y = segL; parent.add(j); joints.push(j);
    const r0 = THREE.MathUtils.lerp(0.02, 0.007, i / SEG), r1 = THREE.MathUtils.lerp(0.02, 0.007, (i + 1) / SEG);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segL * 1.02, 8), blank); m.position.y = segL / 2; j.add(m);
    if (i % 2 === 1) { const gd = new THREE.Mesh(new THREE.TorusGeometry(0.014 - i * 0.001, 0.0025, 4, 10), reelM); gd.position.set(0, segL * 0.6, 0.014); j.add(gd); }
    parent = j;
  }
  const tipCap = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), accent); tipCap.position.y = segL; parent.add(tipCap);
  const tip = new THREE.Object3D(); tip.position.y = segL; parent.add(tip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // 权重越靠竿梢越大 → 竿梢软、竿根硬
  const w = joints.map((_, i) => Math.pow((i + 1) / SEG, 1.6)); const ws = w.reduce((a, b) => a + b, 0);
  const inv = new THREE.Matrix4(), dl = new THREE.Vector3(), axis = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  let curBend = 0;
  return {
    group: g, tip, shaft: base, crank,
    // amount: 总弯曲弧度；towardWorld: 鱼线拉力方向（世界坐标点）
    setBend(amount, towardWorld) {
      curBend = amount;
      if (towardWorld) {
        base.updateMatrixWorld(true);
        inv.copy(base.matrixWorld).invert();
        dl.copy(towardWorld).applyMatrix4(inv).normalize();
        axis.crossVectors(up, dl);
        if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0); else axis.normalize();
      } else axis.set(1, 0, 0);
      for (let i = 0; i < SEG; i++) { q.setFromAxisAngle(axis, amount * w[i] / ws); joints[i].quaternion.copy(q); }
    },
    get bend() { return curBend; },
  };
}

export function makeBobber() {
  const g = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ color: '#ff4f45', roughness: 0.25, clearcoat: 1 });
  const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), red); g.add(top);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white); g.add(bot);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), red); stick.position.y = 0.1; g.add(stick);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffef9a', emissiveIntensity: 2 })); glow.position.y = 0.17; g.add(glow);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// 鱼线：竿尖 → 浮漂，带自然下垂
export function makeLine() {
  const N = 32;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f4f8ff', transparent: true, opacity: 0.75 }));
  line.frustumCulled = false;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  return {
    line,
    set(from, to, slack = 0.25) {
      a.copy(from); b.copy(to);
      const arr = geo.attributes.position.array;
      const d = a.distanceTo(b);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        p.lerpVectors(a, b, t);
        p.y -= Math.sin(t * Math.PI) * d * slack * 0.18 * (1 - t * 0.3);
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// —— 各种 idle 动作 ——
export const Poses = {
  stand(c, t, k = 1) {
    const b = Math.sin(t * 1.6 + c.phase);
    c.spine.rotation.x = 0.02 + b * 0.012;
    c.spine.scale.y = 1 + b * 0.008;
    c.neck.rotation.y = Math.sin(t * 0.4 + c.phase) * 0.25 * k;
    c.neck.rotation.x = Math.sin(t * 0.3 + c.phase * 2) * 0.05;
    for (const L of [c.lLeg, c.rLeg]) { L.hp.rotation.x = 0; L.knee.rotation.x = 0; }
    c.lArm.sh.rotation.set(0.05, 0, 0.12 + b * 0.02);
    c.rArm.sh.rotation.set(0.05, 0, -0.12 - b * 0.02);
    c.lArm.elbow.rotation.x = -0.15; c.rArm.elbow.rotation.x = -0.15;
    c.hips.position.y = 0.62;
  },
  walk(c, t, speed) {
    const f = t * 9;
    const s = Math.sin(f);
    const amp = Math.min(speed / 1.6, 1);
    c.lLeg.hp.rotation.x = s * 0.6 * amp;
    c.rLeg.hp.rotation.x = -s * 0.6 * amp;
    c.lLeg.knee.rotation.x = Math.max(0, -Math.cos(f)) * 0.7 * amp;
    c.rLeg.knee.rotation.x = Math.max(0, Math.cos(f)) * 0.7 * amp;
    c.lArm.sh.rotation.set(-s * 0.5 * amp, 0, 0.12);
    c.hips.position.y = 0.62 + Math.abs(Math.cos(f)) * 0.035 * amp;
    c.spine.rotation.x = 0.06 * amp;
    c.neck.rotation.y *= 0.9;
  },
  sit(c, t) {
    Poses.stand(c, t, 1.2);
    c.hips.position.y = 0.46;
    c.lLeg.hp.rotation.x = -1.45; c.rLeg.hp.rotation.x = -1.45;
    c.lLeg.knee.rotation.x = 1.45; c.rLeg.knee.rotation.x = 1.45;
    c.spine.rotation.x = -0.12;
  },
  sitDrink(c, t) {
    Poses.sit(c, t);
    const sip = Math.max(0, Math.sin(t * 0.5 + c.phase)) ** 8;
    c.rArm.sh.rotation.set(-0.7 - sip * 1.1, 0, -0.25);
    c.rArm.elbow.rotation.x = -1.4 - sip * 0.4;
    c.neck.rotation.x = -sip * 0.25;
    c.lArm.sh.rotation.set(-0.1, 0, 0.6);
  },
  lie(c, t) {
    Poses.stand(c, t, 0.4);
    c.lArm.sh.rotation.set(-2.6, 0, 0.5); c.rArm.sh.rotation.set(-2.6, 0, -0.5);
    c.lArm.elbow.rotation.x = -1.9; c.rArm.elbow.rotation.x = -1.9;
    c.rLeg.hp.rotation.x = -0.5; c.rLeg.knee.rotation.x = 0.9;
    const f = Math.sin(t * 0.8 + c.phase);
    c.lLeg.hp.rotation.x = 0; c.lLeg.knee.rotation.x = 0.05;
    c.rLeg.hp.rotation.z = -0.15 + f * 0.04;
  },
  dance(c, t) {
    Poses.stand(c, t, 0.2);
    const f = t * 4.2 + c.phase;
    c.hips.position.y = 0.6 + Math.abs(Math.sin(f)) * 0.04;
    c.spine.rotation.z = Math.sin(f) * 0.08;
    c.neck.rotation.z = Math.sin(f + 0.6) * 0.15;
    c.lArm.sh.rotation.set(-0.4, 0, 0.5 + Math.sin(f) * 0.3);
    c.rArm.sh.rotation.set(-1.9 + Math.sin(f * 0.5) * 0.15, 0, -0.35);
    c.rArm.elbow.rotation.x = -0.6;
    c.lLeg.knee.rotation.x = Math.max(0, Math.sin(f)) * 0.3;
    c.rLeg.knee.rotation.x = Math.max(0, -Math.sin(f)) * 0.3;
  },
  holdRod(c, t, cast = 0) {
    // cast: 0 = 待机持竿，>0 抛竿动作进度（0..1）
    const b = Math.sin(t * 1.3 + c.phase);
    let swing = 0;
    if (cast > 0) swing = cast < 0.35 ? -(cast / 0.35) * 1.3 : -1.3 + ((cast - 0.35) / 0.65) * 2.0;
    c.rArm.sh.rotation.set(-0.9 + swing * 0.8 + b * 0.02, 0.1, -0.15);
    c.rArm.elbow.rotation.x = -0.7 + swing * 0.2;
    c.lArm.sh.rotation.set(-0.7 + swing * 0.5, -0.2, 0.25);
    c.lArm.elbow.rotation.x = -1.1;
  },
};
