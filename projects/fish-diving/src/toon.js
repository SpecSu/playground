// 旷野之息式风格化光照：把 three.js 的 PBR 材质"就地改造"成
//  - 柔和的 2~3 阶明暗分层（不是硬卡通，过渡带很窄但有柔边）
//  - 阴影带冷色（蓝紫）而不是变黑
//  - 迎光侧的轮廓亮边（BotW 最标志性的 rim light）
//  - 弱化写实高光，保留一点点"风格化"的镜面点
// 所有材质共享同一组 uniform，可在运行时一键切换 PBR ⇄ 风格化做对比。
// 美术升级（光遇 × 猛兽派对）：硬分层 → 包裹光照柔和漫反射；加暖色逆光 rim、次表面透光、毛绒菲涅尔微光、朝下面柔和 AO。无描边、无色阶。
// v1.0 渲染回退：v1.0 的描边 / 迪斯科光斑接口保留为兼容空实现（boat.js / main.js 仍会调用）。
import * as THREE from 'three';

export const toonUniforms = {
  uToon: { value: 1.0 },                               // 0 = 原 PBR，1 = 风格化
  uShadowTint: { value: new THREE.Vector3(0.95, 0.91, 0.93) },  // v1.2：阴影染暖灰（猛兽派对式柔和暖灰影，不发蓝紫、不发黑）
  uSunLum: { value: 3.0 },
  uRimColor: { value: new THREE.Color('#ffe3c4') },           // 美术升级：暖色背光轮廓（光遇）
  uRimStrength: { value: 0.85 },   // v1.2：暖奶油轮廓光略强 → 角色从浅色场景里"抠"出来
  uBandSoft: { value: 0.06 },   // 兼容保留（已无硬分层）
  uWrap: { value: 0.28 },       // 包裹光照：明暗交界线柔和过渡（无色阶）
  uSSSColor: { value: new THREE.Color('#ff9a6a') },           // 次表面透光暖色（皮肤/鱼身）
  uFuzzColor: { value: new THREE.Color('#fff2e6') },          // 毛绒菲涅尔微光（v1.2：暖奶油绒边）
  uAOLow: { value: 0.8 },       // 朝下表面的柔和环境遮蔽（鱼腹/下巴/船底）
  uHdrMax: { value: 4.0 },   // 单像素最高亮度：限制在 Bloom 可控范围内
  // v1.0 兼容：迪斯科球每帧写入这些 uniform，但着色器已不再读取（不在全场材质上投射卡通光斑）
  uDiscoPos: { value: new THREE.Vector3(0, -1e4, 0) },
  uDiscoRot: { value: new THREE.Matrix3() },
  uDisco: { value: new THREE.Vector3(0, 4.2, 16) },
};

const DIRECT_OLD = /* glsl */`	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;`;

const DIRECT_NEW = /* glsl */`	float dotNLraw = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( dotNLraw );
	vec3 irradianceSpec = dotNL * directLight.color; // 高光必须用物理 N·L，否则掠射角 GGX 会爆亮
	// 美术升级：包裹光照 + 轻 S 曲线 —— 柔和漫反射，没有硬色阶
	float wrapNL = saturate( ( dotNLraw + uWrap ) / ( 1.0 + uWrap ) );
	float softNL = mix( wrapNL, wrapNL * wrapNL * ( 3.0 - 2.0 * wrapNL ), 0.35 );
	dotNL = mix( dotNL, softNL, uToon );
	gLit = max( gLit, dotNL * saturate( dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( uSunLum, 1e-3 ) ) );
	// 次表面：明暗交界处渗出暖色（皮肤、鱼身的透光感）
	float sssBand = saturate( ( dotNLraw + 0.55 ) / 0.55 ) * ( 1.0 - saturate( dotNLraw * 1.6 ) );
	vec3 irradiance = dotNL * directLight.color + uSSSColor * ( sssBand * 0.22 * uSssMul * uToon ) * directLight.color;`;

const PARS = /* glsl */`
uniform float uToon;
uniform vec3 uShadowTint;
uniform float uSunLum;
float gLit = 0.0;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uBandSoft;
uniform float uHdrMax;
uniform float uWrap;
uniform vec3 uSSSColor;
uniform vec3 uFuzzColor;
uniform float uAOLow;
uniform float uRimMul;
uniform float uSpecMul;
uniform float uSssMul;
`;

let lightsChunk = null;
function patchedLightsChunk() {
  if (lightsChunk) return lightsChunk;
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!src.includes(DIRECT_OLD)) console.warn('[toon] lights chunk signature changed');
  lightsChunk = src.replace(DIRECT_OLD, DIRECT_NEW)
    .replace('reflectedLight.directSpecular += irradiance * BRDF_GGX', 'reflectedLight.directSpecular += irradianceSpec * BRDF_GGX')
    .replace('sheenSpecularDirect += irradiance * BRDF_Sheen', 'sheenSpecularDirect += irradianceSpec * BRDF_Sheen');
  if (lightsChunk.includes('directSpecular += irradiance * BRDF_GGX')) console.warn('[toon] spec patch failed');
  return lightsChunk;
}

const done = new WeakSet();
export function stylizeMaterial(mat, opts = {}) {
  if (!mat || done.has(mat) || !(mat.isMeshStandardMaterial)) return mat;
  done.add(mat);
  const rimMul = opts.rim ?? 1.0;
  // 极低粗糙度 + 强太阳光 → GGX 峰值可超过 half-float 上限(65504) 变成 Inf；风格化本来就不要镜面针尖高光
  if (mat.roughness < 0.28) mat.roughness = 0.28;
  if (mat.isMeshPhysicalMaterial && mat.clearcoat > 0 && mat.clearcoatRoughness < 0.25) mat.clearcoatRoughness = 0.25;
  const specMul = opts.spec ?? 0.35;
  // 角色/鱼（rim≥1）默认开启次表面与毛绒微光；船与场景只保留很弱的一点
  // v1.2：材质可通过 userData.fuzz 单独加强绒边/透光（布料、充气物的软萌感）
  const sssMul = mat.userData.fuzz ?? opts.sss ?? (rimMul >= 1.0 ? 1.0 : 0.25);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, toonUniforms);
    shader.uniforms.uRimMul = { value: rimMul };
    shader.uniforms.uSpecMul = { value: specMul };
    shader.uniforms.uSssMul = { value: sssMul };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <lights_physical_pars_fragment>', patchedLightsChunk())
      .replace('#include <opaque_fragment>', /* glsl */`
        {
          // 风格化：高光收敛、阴影染冷色、迎光亮边
          vec3 spec = reflectedLight.directSpecular;
          outgoingLight -= spec * (1.0 - uSpecMul) * uToon;
          float shade = 1.0 - saturate(gLit);
          outgoingLight *= mix(vec3(1.0), uShadowTint, shade * uToon);
          vec3 vdir = normalize(vViewPosition);
          float ndv = saturate(dot(normal, vdir));
          float fres = pow(1.0 - ndv, 2.6);
          float rim = smoothstep(0.18, 0.8, fres);
          // 柔和环境遮蔽：朝下的面（鱼腹、下巴、船底）轻压暗，增加体积与落地感
          vec3 nW = inverseTransformDirection(normal, viewMatrix);
          outgoingLight *= mix(1.0, mix(uAOLow, 1.0, smoothstep(-0.85, 0.45, nW.y)), uToon);
          #if NUM_DIR_LIGHTS > 0
            vec3 Ld = directionalLights[0].direction;
            // 背光侧更强的暖色轮廓（逆光 rim），迎光侧保留一点
            float back = saturate(dot(-vdir, Ld) * 0.5 + 0.5);
            float facing = saturate(dot(normal, Ld) * 0.5 + 0.6);
            rim *= mix(0.35, 1.0, back) * facing;
            vec3 rimLight = uRimColor * directionalLights[0].color * 0.14;
            // 逆光透射：太阳在物体背后时，薄边透出暖色（鱼鳍/耳朵/发梢）
            float trans = pow(saturate(dot(-vdir, Ld)), 4.0) * (0.35 + 0.65 * fres);
            outgoingLight += uSSSColor * directionalLights[0].color * trans * 0.07 * uSssMul * uToon * (0.3 + 0.7 * diffuseColor.rgb);
          #else
            vec3 rimLight = uRimColor * 0.3;
          #endif
          outgoingLight += rimLight * rim * uRimStrength * uRimMul * uToon * (0.4 + 0.6 * diffuseColor.rgb);
          // 毛绒微光：掠射角的柔和天光（猛兽派对式软萌边缘，不是描边）
          outgoingLight += uFuzzColor * fres * 0.1 * uSssMul * uToon * (0.35 + 0.65 * diffuseColor.rgb);
          // 安全钳：杜绝负值/NaN/极端 HDR 值进入 Bloom（否则会扩散成大片方块白光）
          // NaN 与任何数比较都为 false；Inf 会超过上限 —— 两种都归零，避免 half-float 溢出后被 Bloom 放大成白色方块
          if (!(dot(outgoingLight, vec3(1.0)) < 1.0e4)) outgoingLight = vec3(0.0);
          outgoingLight = clamp(outgoingLight, 0.0, uHdrMax);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'toon-art-' + rimMul + '-' + specMul + '-' + sssMul;
  mat.needsUpdate = true;
  return mat;
}

export function stylizeObject(root, opts) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => stylizeMaterial(m, opts));
  });
}

// ---------------- v1.0 兼容空实现（描边已随渲染回退移除） ----------------
export const outlineUniforms = {
  uRes: { value: new THREE.Vector2(390, 844) },
  uOutlineW: { value: 0 },
  uOutlineNear: { value: 4.5 },
  uOutlineColor: { value: new THREE.Color('#2b1d4e') },
};
export function addOutline() { /* no-op：v0.9 风格无描边 */ }
export function setOutlineQuality(on, w, h) { if (w && h) outlineUniforms.uRes.value.set(w, h); }
