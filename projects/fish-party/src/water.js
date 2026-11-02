// 果冻海：Gerstner 几何浪 + 程序化可平铺细节法线 + 天空反射 + 次表面散射 + 粼粼闪光 + 船体泡沫 + 实时阴影
import * as THREE from 'three';
import { GERSTNER_GLSL, waveUniformArray, waveState } from './waves.js';
import { skyGLSL, skyUniforms } from './sky.js';
import { SOFT_ENV } from './style.js';

// —— 生成完全可平铺的细节法线贴图（整数波矢的正弦叠加 ⇒ 天然无缝）——
function makeDetailNormalTexture(size = 256, waves = 28, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const comps = [];
  for (let i = 0; i < waves; i++) {
    const kmag = 2 + Math.floor(rnd() * 14);
    const ang = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(ang) * kmag);
    const ky = Math.round(Math.sin(ang) * kmag);
    if (kx === 0 && ky === 0) continue;
    const km = Math.hypot(kx, ky);
    comps.push({ kx, ky, amp: 1 / Math.pow(km, 1.25), ph: rnd() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  const TAU = Math.PI * 2;
  let hMin = Infinity, hMax = -Infinity;
  const hs = new Float32Array(size * size), gx = new Float32Array(size * size), gy = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let h = 0, dx = 0, dy = 0;
      for (const c of comps) {
        const f = TAU * (c.kx * u + c.ky * v) + c.ph;
        // 尖峰化的波形（更像水面碎波）
        const sv = Math.sin(f), cv = Math.cos(f);
        h += c.amp * sv;
        dx += c.amp * cv * TAU * c.kx;
        dy += c.amp * cv * TAU * c.ky;
      }
      const i = y * size + x;
      hs[i] = h; gx[i] = dx; gy[i] = dy;
      hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
    }
  }
  const strength = 0.045;
  for (let i = 0; i < size * size; i++) {
    let nx = -gx[i] * strength, ny = -gy[i] * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    data[i * 4 + 0] = (nx * 0.5 + 0.5) * 255;
    data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
    data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
    data[i * 4 + 3] = ((hs[i] - hMin) / (hMax - hMin)) * 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// —— 极坐标 LOD 网格：中心极密，远处稀疏，跟随相机 ——
function makePolarGrid(rings = 200, segs = 256, rMax = 3000) {
  const pos = [];
  const idx = [];
  pos.push(0, 0, 0);
  const a = 18, b = rMax - a;
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const r = a * t + b * Math.pow(t, 4);
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      pos.push(Math.cos(th) * r, 0, Math.sin(th) * r);
    }
  }
  for (let j = 0; j < segs; j++) {
    idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  }
  for (let i = 0; i < rings - 1; i++) {
    const r0 = 1 + i * segs, r1 = 1 + (i + 1) * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(r0 + j, r0 + j1, r1 + j);
      idx.push(r0 + j1, r1 + j1, r1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), rMax * 2);
  return g;
}

export function createOcean() {
  const detail = makeDetailNormalTexture();

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.lights]);
  Object.assign(uniforms, skyUniforms, {
    uWaves: { value: waveUniformArray },
    uWaveScale: { value: waveState.scale },
    uTime: { value: 0 },
    uDetail: { value: detail },
    uDeep: { value: new THREE.Color(SOFT_ENV.deep) },
    uShallow: { value: new THREE.Color(SOFT_ENV.shallow) },
    uSSS: { value: new THREE.Color(SOFT_ENV.sss) },
    uFoam: { value: new THREE.Color(SOFT_ENV.foam) },
    uSunStrength: { value: 3.2 },
    uFogDensity: { value: 0.0008 },
    uBoatInv: { value: new THREE.Matrix4() },
    uBoatLen: { value: new THREE.Vector2(-7.0, 7.4) },
    uBoatBeam: { value: 2.35 },
    uSparkle: { value: 1.0 },
    uJelly: { value: 1.0 },
    uBobber: { value: new THREE.Vector4(0, 0, 0, 0) },
  });

  const mat = new THREE.ShaderMaterial({
    uniforms,
    lights: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <shadowmap_pars_vertex>
      ${GERSTNER_GLSL}
      varying vec3 vWorldPos;
      varying vec2 vGrid;
      varying float vHeight;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float dist = length(p - cameraPosition.xz);
        vec3 N;
        vec3 d = gerstner(p, dist, N);
        wp.xyz += d;
        vGrid = p;
        vHeight = d.y;
        vWorldPos = wp.xyz;
        vec3 transformedNormal = (viewMatrix * vec4(N, 0.0)).xyz;
        vec4 worldPosition = wp;
        #include <shadowmap_vertex>
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      ${GERSTNER_GLSL}
      ${skyGLSL(3, true)}
      uniform sampler2D uDetail;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSSS;
      uniform vec3 uFoam;
      uniform float uSunStrength;
      uniform float uFogDensity;
      uniform mat4 uBoatInv;
      uniform vec2 uBoatLen;
      uniform float uBoatBeam;
      uniform float uSparkle;
      uniform float uJelly;
      uniform vec4 uBobber;
      varying vec3 vWorldPos;
      varying vec2 vGrid;
      varying float vHeight;

      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      // 船体水平轮廓的半宽（与 boat.js 的放样函数保持一致）
      float hullHalf(float z) {
        float u = clamp((z - uBoatLen.x) / (uBoatLen.y - uBoatLen.x), 0.0, 1.0);
        float bow = pow(clamp((1.0 - u) / 0.56, 0.0, 1.0), 0.62);
        float stern = 0.9 + 0.1 * smoothstep(0.0, 0.3, u);
        return uBoatBeam * min(bow, stern);
      }

      void main() {
        vec3 toCam = cameraPosition - vWorldPos;
        float dist = length(toCam);
        vec3 V = toCam / dist;

        // 船体内部遮罩：不让海水穿进甲板
        vec3 lb = (uBoatInv * vec4(vWorldPos, 1.0)).xyz;
        if (lb.z > uBoatLen.x + 0.05 && lb.z < uBoatLen.y - 0.3 && abs(lb.x) < hullHalf(lb.z) - 0.08 && lb.y < 1.2) discard;
        // 泳台：水面高于泳台底面时不再漫上来（防止船尾看起来被淹）
        if (lb.z < uBoatLen.x + 0.1 && lb.z > uBoatLen.x - 1.06 && abs(lb.x) < uBoatBeam * 0.84 && lb.y > 0.1 && lb.y < 1.0) discard;
        // 宏观法线：逐像素重算 Gerstner，比顶点插值更锐利
        vec3 Ng;
        gerstner(vGrid, dist, Ng);

        // 三层细节法线，不同尺度/方向滚动
        vec2 wp = vWorldPos.xz;
        vec4 t1 = texture2D(uDetail, wp * 0.045 + uTime * vec2(0.010, 0.006));
        vec4 t2 = texture2D(uDetail, wp * 0.13 + uTime * vec2(-0.016, 0.012));
        vec4 t3 = texture2D(uDetail, wp * 0.41 + uTime * vec2(0.028, -0.035));
        vec2 s1 = t1.xy * 2.0 - 1.0;
        vec2 s2 = t2.xy * 2.0 - 1.0;
        vec2 s3 = t3.xy * 2.0 - 1.0;
        float df = exp(-dist * 0.010);
        float df3 = exp(-dist * 0.035);
        vec2 slope = s1 * 0.9 + s2 * 0.75 * mix(0.35, 1.0, df) + s3 * 0.55 * df3;
        slope *= mix(0.25, 1.0, df);
        vec3 N = normalize(vec3(Ng.x + slope.x, Ng.y, Ng.z + slope.y));

        vec3 L = normalize(uSunDir);
        float NdV = max(dot(N, V), 0.0);
        float NdL = max(dot(N, L), 0.0);
        float shadow = getShadowMask();

        // —— 反射：与天空同源的程序化天空 ——
        vec3 R = reflect(-V, N);
        R.y = abs(R.y) + 0.02;
        R = normalize(R);
        vec3 refl = skyColor(R, 0.0);

        // —— 果冻水体：浪峰透亮、浪谷深邃 ——
        float crest = clamp(vHeight * 1.15 + 0.45, 0.0, 1.0);
        vec3 body = mix(uDeep, uShallow, crest * 0.75 + (1.0 - NdV) * 0.25);
        // 俯视时更饱和更通透
        body = mix(body, uShallow * 0.85 + uDeep * 0.3, pow(NdV, 3.0) * 0.25 * uJelly);
        // 体内的"果冻焦散"微光
        float c1 = texture2D(uDetail, wp * 0.21 + uTime * vec2(0.03, 0.02)).a;
        float c2 = texture2D(uDetail, wp * 0.17 - uTime * vec2(0.025, 0.035)).a;
        float caustic = pow(1.0 - abs(c1 - c2), 12.0);
        body += mix(uShallow, uFoam, 0.4) * caustic * 0.22 * exp(-dist * 0.04) * uJelly * (0.4 + 0.6 * shadow);
        // 浅色波峰：浪尖抬亮偏薄荷（果冻透亮感）
        body = mix(body, uShallow * 1.08 + uSSS * 0.1, smoothstep(0.62, 1.0, crest) * 0.26 * uJelly);   // v1.2：浪尖柔亮（不发荧光）
        // 漫射光照（阴影染冷蓝而不是变灰）
        body *= 0.64 + 0.36 * NdL * mix(0.6, 1.0, shadow);
        body *= mix(vec3(0.9, 0.93, 1.0), vec3(1.0), shadow);

        // 次表面散射：逆光看穿浪尖
        vec3 Lt = normalize(L + N * 0.55);
        float sss = pow(clamp(dot(V, -Lt), 0.0, 1.0), 3.5);
        float sssAmt = (sss * 1.1 + pow(1.0 - NdV, 2.0) * 0.22) * crest * uJelly;
        vec3 sssCol = uSSS * sssAmt * mix(0.4, 1.0, shadow) * uSunColor;

        // 菲涅尔（更细腻：近处通透见水体，掠射角平滑过渡到天空反射；远处用宏观法线抑制噪点）
        float NdVs = mix(max(dot(Ng, V), 0.0), NdV, mix(0.45, 1.0, df));
        float F = 0.02 + 0.98 * pow(1.0 - NdVs, 5.0);
        F = mix(F, F * 0.85, uJelly);
        F = clamp(F + smoothstep(120.0, 900.0, dist) * 0.12, 0.0, 1.0);
        vec3 col = mix(body + sssCol, refl, F);

        // —— 高光 + 粼粼闪光 ——
        vec3 H = normalize(L + V);
        float NdH = max(dot(N, H), 0.0);
        float pw = mix(1400.0, 90.0, smoothstep(10.0, 700.0, dist));
        float spec = (pw + 8.0) / 25.13 * pow(NdH, pw);
        // 太阳闪烁（sun glints）：格内随机位置的圆形柔点 + 时间闪烁，只在太阳反射带内出现
        vec2 gq = wp * 3.2;
        vec2 cell = floor(gq);
        float tw = h21(cell + floor(uTime * 2.3 + h21(cell) * 10.0));
        vec2 gp = vec2(h21(cell + 3.7), h21(cell + 9.1)) * 0.6 + 0.2;
        float gd = length(fract(gq) - gp);
        float glint = smoothstep(0.22, 0.0, gd) * smoothstep(0.9, 0.97, tw);
        float sparkle = glint * pow(NdH, 60.0) * 22.0 * df3 * uSparkle;
        // 远处的金色反射光路（宽、柔、偏暖）
        float broad = pow(max(dot(R, L), 0.0), 14.0) * 0.7 + pow(max(dot(R, L), 0.0), 120.0) * 0.6;
        float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
        col += uSunColor * uSunStrength * (spec * Fs * 1.6 + sparkle * 0.25 + broad * 0.08) * shadow;

        // —— 泡沫 ——
        vec3 local = (uBoatInv * vec4(vWorldPos, 1.0)).xyz;
        float hz = clamp(local.z, uBoatLen.x, uBoatLen.y);
        float dEdge = abs(local.x) - hullHalf(local.z);
        float dz = abs(local.z - hz);
        float dHull = max(dEdge, 0.0) + dz;
        if (local.z > uBoatLen.x && local.z < uBoatLen.y) dHull = dEdge;
        float fn = texture2D(uDetail, wp * 0.6 + uTime * 0.05).a * 0.6 + texture2D(uDetail, wp * 1.7 - uTime * 0.08).a * 0.4;
        float hullFoam = smoothstep(0.55, -0.02, dHull) * smoothstep(-0.4, 0.0, dHull);
        hullFoam *= smoothstep(0.5, 0.8, fn + 0.3 * smoothstep(0.35, 0.0, dHull));
        float aoHull = smoothstep(2.2, 0.0, max(dHull, 0.0));
        col *= 1.0 - aoHull * 0.22;
        // 浪尖白沫（chill 海况下很稀疏）
        float crestFoam = smoothstep(0.74, 1.0, crest) * smoothstep(0.6, 0.9, fn) * 0.32 * df;
        // 浮漂周围的小涟漪
        float bd = length(wp - uBobber.xy);
        float ripple = uBobber.w * (0.5 + 0.5 * sin(bd * 14.0 - uTime * 6.0)) * smoothstep(1.4, 0.15, bd) * smoothstep(0.05, 0.25, bd);
        float foam = clamp(hullFoam + crestFoam + ripple * 0.5, 0.0, 1.0);
        // 柔和泡沫：亮部暖白、暗部冷蓝，边缘软
        vec3 foamLit = uFoam * (0.6 + 0.4 * NdL * shadow) * (0.78 + 0.3 * uSunColor);
        foamLit *= mix(vec3(0.9, 0.92, 0.97), vec3(1.0), shadow);
        col = mix(col, foamLit, foam * 0.82);

        // —— 空气透视：远处融入天际线，保证无缝地平线 ——
        float fogF = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
        vec3 fd = normalize(vec3(-V.x, 0.02, -V.z));
        vec3 fogCol = skyBase(fd);
        // 远海与天际融合前先稍微向地平线色靠拢（空气透视的暖粉蓝）
        col = mix(col, mix(col, uHorizon, 0.5), smoothstep(90.0, 900.0, dist) * 0.25);
        col = mix(col, fogCol, fogF);

        if (!(dot(col, vec3(1.0)) < 1.0e4)) col = vec3(0.0);
        gl_FragColor = vec4(clamp(col, 0.0, 8.0), 1.0);
      }`,
  });

  const geo = makePolarGrid();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const snap = 2.0;
  return {
    mesh,
    material: mat,
    update(t, camera) {
      uniforms.uTime.value = t;
      uniforms.uWaveScale.value = waveState.scale;
      mesh.position.set(Math.round(camera.position.x / snap) * snap, 0, Math.round(camera.position.z / snap) * snap);
    },
  };
}
