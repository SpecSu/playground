// 鱼类皮肤 & 游动 v3：写实风格化（鳞片法线 / 湿润清漆 / 虹彩 / 鳍条透光 / 背深腹浅）+ 脊柱行波顶点动画
// - 只做 onBeforeCompile 链式注入（接在 toon 风格化 / ugc 花纹 / gx 特殊材质之后），所有鱼共享同一组 shader 程序
// - 形变在"鱼模型空间"（normalized-sculpture 坐标，鼻尖 +x）计算；花纹坐标仍用静止姿态 → 花纹贴着身体一起弯
// - 物种差异：0 鲹科摆尾 / 1 鳗形长波 / 2 鳐类翼波 / 3 章鱼触手 / 4 鱿鱼乌贼 / 5 甲壳步行 / 6 翻车鱼背腹鳍扇动
// - 防闪白：输出 NaN/Inf 归零 + HDR 上限钳制
import * as THREE from 'three';

// ---------------- 画质 ----------------
const _Q = (() => { try { return new URLSearchParams(location.search).get('q'); } catch (e) { return null; } })();
export const FISH_Q = { low: _Q === 'low' };
export function setFishQuality(level) { FISH_Q.low = level === 'low'; }

// ---------------- 物种参数 ----------------
// skin: type 0 鳞片 / 1 光滑皮（鲨鱼盾鳞、翻车鱼黏液）/ 2 头足类色素细胞 / 3 甲壳
// den: 鳞片密度（每模型单位）；bump: 法线强度；irid: 虹彩；metal: 银色反光；coat: 湿润清漆
const SKIN = {
  clownfish: { type: 0, den: 46, bump: 0.32, irid: 0.0, metal: 0.0, coat: 0.8 },
  'blue-tang': { type: 0, den: 55, bump: 0.2, irid: 0.15, metal: 0.05, coat: 0.7 },
  sardine: { type: 0, den: 24, bump: 0.8, irid: 1.0, metal: 0.35, coat: 0.8 },
  mackerel: { type: 0, den: 50, bump: 0.35, irid: 0.85, metal: 0.3, coat: 0.85 },
  pufferfish: { type: 1, den: 26, bump: 0.3, irid: 0.0, metal: 0.0, coat: 0.6 },
  squid: { type: 2, den: 16, bump: 0.35, irid: 0.3, metal: 0.0, coat: 0.95 },
  cuttlefish: { type: 2, den: 18, bump: 0.5, irid: 0.25, metal: 0.0, coat: 0.9 },
  'snow-crab': { type: 3, den: 14, bump: 0.7, irid: 0.0, metal: 0.0, coat: 0.55 },
  salmon: { type: 0, den: 40, bump: 0.5, irid: 0.55, metal: 0.25, coat: 0.85 },
  octopus: { type: 2, den: 12, bump: 0.35, irid: 0.15, metal: 0.0, coat: 0.95 },
  lobster: { type: 3, den: 16, bump: 0.6, irid: 0.0, metal: 0.0, coat: 0.6 },
  'mahi-mahi': { type: 0, den: 52, bump: 0.3, irid: 0.65, metal: 0.15, coat: 0.85 },
  'king-crab': { type: 3, den: 12, bump: 0.8, irid: 0.0, metal: 0.0, coat: 0.5 },
  tuna: { type: 0, den: 56, bump: 0.25, irid: 0.75, metal: 0.3, coat: 0.9 },
  swordfish: { type: 1, den: 40, bump: 0.25, irid: 0.5, metal: 0.25, coat: 0.8 },
  sailfish: { type: 1, den: 40, bump: 0.25, irid: 0.6, metal: 0.25, coat: 0.8 },
  'manta-ray': { type: 1, den: 18, bump: 0.12, irid: 0.0, metal: 0.0, coat: 0.55 },
  hammerhead: { type: 1, den: 60, bump: 0.25, irid: 0.0, metal: 0.0, coat: 0.4 },
  oarfish: { type: 1, den: 30, bump: 0.2, irid: 1.0, metal: 0.4, coat: 0.9 },
  sunfish: { type: 1, den: 14, bump: 0.22, irid: 0.0, metal: 0.0, coat: 0.45 },
  // v4 新增
  butterflyfish: { type: 0, den: 60, bump: 0.22, irid: 0.1, metal: 0.0, coat: 0.8 },
  'sea-bream': { type: 0, den: 44, bump: 0.35, irid: 0.45, metal: 0.12, coat: 0.85 },
  flounder: { type: 1, den: 30, bump: 0.35, irid: 0.0, metal: 0.0, coat: 0.6 },
  starfish: { type: 3, den: 26, bump: 0.75, irid: 0.0, metal: 0.0, coat: 0.45 },
  seahorse: { type: 3, den: 22, bump: 0.45, irid: 0.0, metal: 0.0, coat: 0.6 },
  jellyfish: { type: 1, den: 10, bump: 0.05, irid: 0.25, metal: 0.0, coat: 1.0 },
  parrotfish: { type: 0, den: 30, bump: 0.45, irid: 0.25, metal: 0.05, coat: 0.85 },
  lionfish: { type: 0, den: 50, bump: 0.25, irid: 0.0, metal: 0.0, coat: 0.75 },
  'moray-eel': { type: 1, den: 20, bump: 0.25, irid: 0.0, metal: 0.0, coat: 0.95 },
  anglerfish: { type: 1, den: 24, bump: 0.5, irid: 0.0, metal: 0.0, coat: 0.7 },
  'mantis-shrimp': { type: 3, den: 20, bump: 0.5, irid: 0.4, metal: 0.0, coat: 0.7 },
  barracuda: { type: 0, den: 60, bump: 0.25, irid: 0.7, metal: 0.35, coat: 0.85 },
  'sea-turtle': { type: 3, den: 10, bump: 0.25, irid: 0.0, metal: 0.0, coat: 0.6 },
  dolphin: { type: 1, den: 12, bump: 0.06, irid: 0.0, metal: 0.0, coat: 0.85 },
  'giant-grouper': { type: 0, den: 34, bump: 0.4, irid: 0.0, metal: 0.0, coat: 0.7 },
  coelacanth: { type: 0, den: 18, bump: 0.4, irid: 0.1, metal: 0.05, coat: 0.7 },
  'great-white': { type: 1, den: 60, bump: 0.22, irid: 0.0, metal: 0.0, coat: 0.45 },
  orca: { type: 1, den: 12, bump: 0.05, irid: 0.0, metal: 0.0, coat: 0.9 },
  narwhal: { type: 1, den: 14, bump: 0.08, irid: 0.0, metal: 0.0, coat: 0.8 },
  'whale-shark': { type: 1, den: 40, bump: 0.25, irid: 0.0, metal: 0.0, coat: 0.45 },
};
// amp: 尾端半振幅（占体长）；k: 体长上的波数；hz: 巡游频率；head: 头部振幅占比；pw: 振幅包络指数
export const SWIM = {
  clownfish: { type: 0, amp: 0.065, k: 0.8, hz: 2.1, head: 0.12, pw: 2.0 },
  'blue-tang': { type: 0, amp: 0.06, k: 0.75, hz: 1.9, head: 0.1, pw: 2.2 },
  sardine: { type: 0, amp: 0.08, k: 0.95, hz: 2.4, head: 0.1, pw: 2.0 },
  mackerel: { type: 0, amp: 0.075, k: 0.9, hz: 2.0, head: 0.08, pw: 2.2 },
  pufferfish: { type: 0, amp: 0.035, k: 0.6, hz: 2.6, head: 0.0, pw: 3.0 },
  salmon: { type: 0, amp: 0.075, k: 0.9, hz: 1.6, head: 0.1, pw: 2.0 },
  'mahi-mahi': { type: 0, amp: 0.08, k: 0.9, hz: 1.7, head: 0.08, pw: 2.0 },
  tuna: { type: 0, amp: 0.065, k: 0.75, hz: 1.8, head: 0.03, pw: 3.2 },
  swordfish: { type: 0, amp: 0.06, k: 0.8, hz: 1.4, head: 0.02, pw: 3.0 },
  sailfish: { type: 0, amp: 0.06, k: 0.8, hz: 1.4, head: 0.02, pw: 3.0 },
  hammerhead: { type: 0, amp: 0.085, k: 0.95, hz: 1.1, head: 0.16, pw: 1.7 },
  oarfish: { type: 1, amp: 0.05, k: 2.3, hz: 0.9, head: 0.35, pw: 1.0 },
  'manta-ray': { type: 2, amp: 0.12, k: 0.5, hz: 0.55, head: 0, pw: 2 },
  octopus: { type: 3, amp: 0.09, k: 1, hz: 0.8, head: 0, pw: 1 },
  squid: { type: 4, amp: 0.07, k: 1, hz: 1.3, head: 0, pw: 1 },
  cuttlefish: { type: 4, amp: 0.06, k: 1, hz: 1.6, head: 0, pw: 1 },
  lobster: { type: 5, amp: 0.05, k: 1, hz: 1.8, head: 0, pw: 1 },
  'snow-crab': { type: 5, amp: 0.05, k: 1, hz: 2.0, head: 0, pw: 1 },
  'king-crab': { type: 5, amp: 0.045, k: 1, hz: 1.7, head: 0, pw: 1 },
  sunfish: { type: 6, amp: 0.13, k: 1, hz: 0.7, head: 0, pw: 1 },
  // v4 新增（7 = 上下摆动：鲸豚尾叶 / 比目鱼贴底波动）
  butterflyfish: { type: 0, amp: 0.05, k: 0.7, hz: 2.2, head: 0.1, pw: 2.2 },
  'sea-bream': { type: 0, amp: 0.065, k: 0.8, hz: 1.9, head: 0.08, pw: 2.0 },
  flounder: { type: 7, amp: 0.06, k: 1.1, hz: 1.3, head: 0.15, pw: 1.6 },
  starfish: { type: 3, amp: 0.035, k: 1, hz: 0.6, head: 0, pw: 1 },
  seahorse: { type: 0, amp: 0.012, k: 0.5, hz: 1.0, head: 0.3, pw: 1.5 },
  jellyfish: { type: 3, amp: 0.06, k: 1, hz: 0.7, head: 0, pw: 1 },
  parrotfish: { type: 0, amp: 0.06, k: 0.8, hz: 1.8, head: 0.08, pw: 2.0 },
  lionfish: { type: 0, amp: 0.04, k: 0.7, hz: 1.4, head: 0.06, pw: 2.4 },
  'moray-eel': { type: 1, amp: 0.05, k: 1.8, hz: 1.0, head: 0.3, pw: 1.0 },
  anglerfish: { type: 0, amp: 0.04, k: 0.6, hz: 1.6, head: 0.0, pw: 2.6 },
  'mantis-shrimp': { type: 5, amp: 0.05, k: 1, hz: 2.2, head: 0, pw: 1 },
  barracuda: { type: 0, amp: 0.07, k: 0.9, hz: 1.7, head: 0.05, pw: 2.4 },
  'sea-turtle': { type: 2, amp: 0.05, k: 0.5, hz: 0.6, head: 0, pw: 2 },
  dolphin: { type: 7, amp: 0.07, k: 0.7, hz: 1.4, head: 0.04, pw: 2.6 },
  'giant-grouper': { type: 0, amp: 0.05, k: 0.7, hz: 1.2, head: 0.06, pw: 2.4 },
  coelacanth: { type: 0, amp: 0.035, k: 0.6, hz: 0.9, head: 0.05, pw: 2.4 },
  'great-white': { type: 0, amp: 0.07, k: 0.85, hz: 1.0, head: 0.1, pw: 2.0 },
  orca: { type: 7, amp: 0.065, k: 0.7, hz: 1.1, head: 0.04, pw: 2.6 },
  narwhal: { type: 7, amp: 0.065, k: 0.7, hz: 1.0, head: 0.04, pw: 2.6 },
  'whale-shark': { type: 0, amp: 0.06, k: 0.75, hz: 0.7, head: 0.12, pw: 2.0 },
};
const SWIM_DEF = SWIM.salmon, SKIN_DEF = SKIN.salmon;

// ---------------- GLSL ----------------
const VERT_PARS = /* glsl */`
uniform mat4 uSwM; uniform mat3 uSwMi;
uniform vec4 uSw0, uSw1, uSw2, uSw3;
attribute vec3 aFin;
varying vec3 vSkP; varying vec3 vSkN; varying vec3 vFin;
vec3 swDisp(vec3 f){
  int T = int(uSw1.x + 0.5);
  float ph = uSw0.x, A = uSw0.y, K = uSw0.z * 6.2831853, L = 1.0 / max(uSw1.z, 1e-3);
  float u = clamp((uSw1.y - f.x) * uSw1.z, 0.0, 1.15);
  vec3 d = vec3(0.0);
  if (T <= 1 || T == 7) {
    float env = uSw3.x + (1.0 - uSw3.x) * pow(u, uSw3.y);
    d.z = A * L * env * sin(K * u - ph);
    d.z += uSw0.w * L * 0.16 * u * u;                       // 转向弯曲
    d.z += uSw1.w * L * 0.26 * (u * u - 0.3 * (1.0 - u));   // 挣扎 C 形甩动
    if (T == 7) { d.y = d.z; d.z = uSw0.w * L * 0.16 * u * u; }   // v4 鲸豚/比目鱼：上下摆动
  } else if (T == 2) {      // 鳐类：翼尖振幅最大，前缘领先的行波
    float s = clamp(abs(f.z) * uSw2.x, 0.0, 1.0);
    float w = sin(ph - (uSw1.y - f.x) * uSw1.z * 3.2 - s * 0.9);
    d.y = A * L * s * s * w;
    d.y += uSw1.w * L * 0.12 * s * s;
    d.z += A * L * 0.35 * smoothstep(0.75, 1.1, u) * sin(K * 4.0 * u - ph * 1.3);
  } else if (T == 3) {      // 章鱼：触手沿径向行波 + 外套膜呼吸
    vec2 c = uSw2.zw; vec2 r2 = f.xz - c; float r = length(r2);
    float arm = smoothstep(uSw2.x, uSw2.x - 0.12, f.y) * smoothstep(0.05, 0.35, r * uSw1.z * 1.6);
    float an = atan(r2.y, r2.x);
    float wv = sin(r * uSw1.z * 9.0 - ph + an * 2.0);
    d.y += A * L * arm * wv * (0.4 + r * uSw1.z * 1.4);
    vec2 dir = r > 1e-4 ? r2 / r : vec2(0.0);
    d.xz += dir * A * L * arm * 0.6 * sin(r * uSw1.z * 7.0 - ph * 1.1 + an * 3.0);
    vec2 tg = vec2(-dir.y, dir.x);
    d.xz += tg * A * L * arm * 0.5 * cos(r * uSw1.z * 6.0 - ph * 0.9 + an);
    float mant = smoothstep(uSw2.x, uSw2.x + 0.15, f.y);
    float br = uSw2.y;  // 呼吸/喷射节律
    d.xz += r2 * mant * br * 0.07; d.y -= (f.y - uSw2.x) * mant * br * 0.04;
    d.y += uSw1.w * L * 0.1 * arm;
  } else if (T == 4) {      // 鱿鱼 / 乌贼：腕足波动 + 鳍边波浪 + 外套膜喷射收缩
    float a = smoothstep(uSw2.x - 0.02, uSw2.x + 0.12, f.x);
    float t = max(f.x - uSw2.x, 0.0) * uSw1.z;
    d.y += A * L * a * t * 2.2 * sin(t * 11.0 - ph * 1.2 + f.z * uSw1.z * 9.0);
    d.z += A * L * a * t * 1.6 * cos(t * 9.0 - ph + f.y * uSw1.z * 9.0);
    float fin = smoothstep(uSw2.y, uSw2.y + 0.08, abs(f.z)) * (1.0 - a);
    d.y += A * L * 0.8 * fin * (abs(f.z) - uSw2.y) * uSw1.z * 3.0 * sin(f.x * uSw1.z * 12.0 + ph * 2.0);
    float jet = uSw2.z, man = 1.0 - a;
    d.yz -= f.yz * man * jet * 0.08 * smoothstep(-0.2, 0.6, (uSw2.x - f.x) * uSw1.z);
    d.z += uSw1.w * L * 0.15 * u * u;
  } else if (T == 5) {      // 甲壳：腿部交替抬落 + 龙虾尾扇
    float leg = smoothstep(uSw2.x, uSw2.x + 0.1, abs(f.z)) * step(f.x, uSw2.y);
    float sd = f.z > 0.0 ? 0.0 : 3.14159;
    float pl = ph + f.x * uSw1.z * 9.0 + sd;
    float reach = (abs(f.z) - uSw2.x) * uSw1.z;
    d.y += A * L * leg * max(sin(pl), -0.2) * (0.6 + reach * 1.5);
    d.x += A * L * leg * cos(pl) * 0.5 * (0.5 + reach);
    float tl = smoothstep(uSw2.z, uSw2.z - 0.35 / uSw1.z, f.x);
    d.y += A * L * tl * tl * 1.4 * sin(ph * 0.5) ;
    d.y += uSw1.w * L * 0.18 * tl * tl;
    d.y += uSw1.w * L * 0.06 * leg * sin(pl * 2.0);
  } else {                  // 翻车鱼：背鳍/臀鳍左右同步扇动，身体几乎不弯
    float fh = smoothstep(uSw2.x, uSw2.x + 0.25 / uSw1.z, abs(f.y)) * (abs(f.y) - uSw2.x) * uSw1.z;
    d.z += A * L * fh * 1.6 * sin(ph - abs(f.y) * uSw1.z * 0.6);
    d.z += A * L * 0.15 * smoothstep(0.75, 1.0, u) * sin(ph * 1.0 + 1.2);
    d.z += uSw1.w * L * 0.12 * (u * u - 0.3);
  }
  return d;
}
`;
const VERT_MAIN = /* glsl */`
  {
    vec3 skF = (uSwM * vec4(transformed, 1.0)).xyz;
    vec3 skN = normalize(transpose(uSwMi) * objectNormal);
    vSkP = skF; vSkN = skN; vFin = aFin;
    if (uSw0.y > 0.0 || abs(uSw1.w) > 0.0 || abs(uSw0.w) > 0.0) {
      vec3 d0 = swDisp(skF);
      float e = 0.004 / max(uSw1.z, 1e-3);
      mat3 G = mat3((swDisp(skF + vec3(e, 0, 0)) - d0) / e, (swDisp(skF + vec3(0, e, 0)) - d0) / e, (swDisp(skF + vec3(0, 0, e)) - d0) / e);
      transformed += uSwMi * d0;
      vec3 nF = normalize(skN - transpose(G) * skN);
      vec3 nL = transpose(mat3(uSwM)) * nF;
      #ifndef FLAT_SHADED
        vec3 tn = normalMatrix * nL;
        #ifdef FLIP_SIDED
          tn = -tn;
        #endif
        float tl = length(tn); if (tl > 1e-6) vNormal = tn / tl;
      #endif
    }
  }
`;
const FRAG_PARS = /* glsl */`
uniform vec4 uSk0;   // x 皮肤类型, y 鳞片密度, z 法线强度, w 头部 x（模型空间）
uniform vec4 uSk1;   // x 部位(0身体 1鳍 2眼 3其他), y 背深腹浅, z 侧线, w 透光
uniform vec4 uFin0;  // 鳍条：amin, amax, 条数, dmin
uniform vec4 uFin1;  // x dmax, y 鳍半透明开关, z 湿润写实开关(无特殊材质), w -
uniform vec4 uSk2;   // x 模型→世界缩放
uniform vec4 uSk3;   // x 鳃盖线 x（模型空间）, y 眼睛 y, z 1/体长, w 鳃盖线开关
uniform vec4 uSk4;   // 眼眶：x 眼 x, y 眼 y, z |眼 z|, w 眼半径（0 = 无）
varying vec3 vSkP; varying vec3 vSkN; varying vec3 vFin;
float gSkH = 0.0, gSkK = 0.0, gSkThin = 0.0, gSkR = 0.0, gSkFy = 0.0, gSkU = 0.5, gSkWet = 1.0, gSkSss = 0.3, gSkHead = 0.0;
float skHash(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float skNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skHash(i), skHash(i + vec2(1, 0)), f.x), mix(skHash(i + vec2(0, 1)), skHash(i + vec2(1, 1)), f.x), f.y); }
// r4 自然鳞片：行错位 + 每片随机偏移/大小/长宽比；半月形（后缘自由边）与菱形混合；
// 前片压后片（取覆盖该点的"最靠前"一片）→ 只有后缘一道细棱，远看是细腻的鳞光而非网格
float skScale(vec2 p, out float edge){
  vec2 c0 = floor(p);
  float bestX = 1e9, h = 0.0; edge = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 0; i++) {
      vec2 c = c0 + vec2(float(i), float(j));
      float r1 = skHash(c), r2 = skHash(c + 17.31), r3 = skHash(c + 5.17);
      vec2 a = c + vec2(0.5 * mod(c.y, 2.0) + (r1 - 0.5) * 0.46, 0.5 + (r2 - 0.5) * 0.34);   // 鳞片前缘锚点
      vec2 d = (p - a) * vec2(1.0, 0.9 + 0.25 * r3);
      float R = 0.82 + 0.16 * r2;
      float rr = mix(length(d), (abs(d.x) * 0.9 + abs(d.y)) * 0.8, 0.3 + 0.25 * r1);          // 半月 ↔ 菱形
      if (d.x > -0.08 && rr < R && a.x < bestX) {
        bestX = a.x;
        float t = rr / R;
        h = pow(t, 1.6) * (1.0 - smoothstep(0.8, 1.0, t)) * (0.7 + 0.3 * r3);
        edge = smoothstep(0.7, 0.95, t) * (1.0 - smoothstep(0.95, 1.0, t));
      }
    }
  }
  return h;
}
vec3 skBump(vec3 sp, vec3 sn, float h, float k){
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h)) * k;
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  vec3 n = normalize(abs(det) * sn - g);
  return (dot(n, n) > 0.5) ? n : sn;
}
void skAlbedo(inout vec4 dc){
  vec3 fn = normalize(vSkN);
  int role = int(uSk1.x + 0.5);
  gSkFy = fn.y; gSkWet = uFin1.z;
  gSkU = clamp((uSk0.w - vSkP.x) * uSk3.z, 0.0, 1.2);
  if (role == 2) { gSkK = 0.0; gSkR = -0.2; gSkSss = 0.0; return; }
  if (role == 1 && uFin0.z > 0.5) {          // 鳍：细鳍条 + 分节 + 鳍膜半透明，鳍尖更透
    vec2 q = vFin.xy; float ang = atan(q.y, q.x), rr = length(q);
    float rc = (ang - uFin0.x) / max(uFin0.y - uFin0.x, 1e-3) * uFin0.z;
    float rad = clamp((rr - uFin0.w) / max(uFin1.x - uFin0.w, 1e-3), 0.0, 1.0);
    float fr = abs(fract(rc + 0.08 * skNoise(vec2(rad * 3.0, floor(rc)))) - 0.5) * 2.0;
    float aa = min(fwidth(rc) * 1.2, 0.5);
    float ray = smoothstep(0.82 - aa, 0.95 + aa * 0.3, fr) * (1.0 - smoothstep(0.8, 1.0, rad) * 0.8);
    float seg = 0.0;
    #ifndef SK_LQ
      seg = smoothstep(0.86, 1.0, abs(fract(rad * 10.0 + rc * 0.03) - 0.5) * 2.0) * ray;
    #endif
    float aaf = 1.0 - smoothstep(0.07, 0.2, aa);     // 鳍条间距 < ~6px 时淡出，杜绝摩尔纹
    seg *= aaf;
    dc.rgb *= mix(1.0, 0.7, ray * aaf) * (1.0 - seg * 0.08);
    // 鳍膜：越往鳍尖越薄 → 颜色更淡、更透
    vec3 memb = mix(dc.rgb, dc.rgb * 0.85 + vec3(0.12), 0.35);
    dc.rgb = mix(dc.rgb, memb, smoothstep(0.3, 1.0, rad) * (1.0 - ray));
    if (uFin1.y > 0.5) {
      float a = mix(0.8, 0.52, smoothstep(0.15, 1.0, rad));
      a = mix(a, min(a + 0.25, 0.92), ray * aaf);
      dc.a *= a;
    }
    gSkH = ray * (1.0 - seg * 0.5); gSkK = 0.0035 * aaf;     // 鳍条 = 细骨棱（法线隆起），膜 = 平
    gSkThin = (1.0 - ray * 0.7) * (0.55 + 0.45 * rad);
    gSkR = 0.0; gSkSss = 1.0;
    return;
  }
  if (role == 1) { gSkThin = 0.55; gSkSss = 0.6; }
  int T = int(uSk0.x + 0.5);
  vec3 fp = vSkP;
  float wt = smoothstep(0.55, 0.9, abs(fn.y));
  vec2 p = mix(vec2(uSk0.w - fp.x, fp.y), vec2(uSk0.w - fp.x, fp.z), wt) * uSk0.y;
  float fw = fwidth(p.x) + fwidth(p.y);
  float fade = 1.0 - smoothstep(0.08, 0.3, fw);    // 鳞片 < ~8px 时淡出（远看只剩细腻鳞光，不出网格/摩尔纹）
  float h = 0.0, edge = 0.0, k = uSk0.z * 0.3 / max(uSk0.y, 1.0);
  float lum = dot(dc.rgb, vec3(0.299, 0.587, 0.114));
  // 头部（鳃盖线之前）：无鳞的光滑湿皮
  float yy = abs(fp.y - uSk3.y) * uSk3.z * 4.0;
  float yc = min(yy, 0.55); float xl = uSk3.x + 0.55 * yc * yc / (uSk3.z * 4.0);
  float dx = (fp.x - xl) * uSk3.z;
  float head = (uSk3.w > 0.5) ? smoothstep(-0.03, 0.0, dx) : 0.0;   // 鳃盖线之前完全无鳞
  gSkHead = head;
  if (T == 0) {
    float e2;
    h = skScale(p, e2);
    // 头尾渐细渐淡、背部明显、腹部消失
    float along = (1.0 - head) * (1.0 - 0.65 * smoothstep(0.62, 0.95, gSkU));
    float dors = smoothstep(-0.6, 0.35, fn.y);
    float m = along * dors * fade;
    h *= m; edge = e2 * m;
    k *= 0.6;
    // 反照率不动：鳞片只调制法线与粗糙度
  } else if (T == 1) {
    h = (skNoise(p * 2.0) * 0.6 + skNoise(p * 6.3) * 0.4) * (1.0 - head * 0.6);
    dc.rgb *= 0.96 + 0.06 * skNoise(p * 0.7);
  } else if (T == 2) {      // 头足类：色素细胞小点 + 乳突
    vec2 c = floor(p * 1.6), f = fract(p * 1.6) - 0.5;
    float hh = skHash(c);
    float dotm = smoothstep(0.22 + 0.12 * hh, 0.08, length(f + (vec2(skHash(c + 3.1), skHash(c + 7.7)) - 0.5) * 0.4));
    dc.rgb = mix(dc.rgb, dc.rgb * vec3(0.8, 0.6, 0.56), dotm * 0.3 * step(0.35, hh) * fade);
    h = skNoise(p * 0.9) * 0.6 + skNoise(p * 2.7) * 0.4;
    gSkSss = 0.9;
  } else {                  // 甲壳：凹坑颗粒 + 斑驳
    float n1 = skNoise(p * 1.5), n2 = skNoise(p * 4.5);
    h = 1.0 - abs(n1 * 2.0 - 1.0); h = h * 0.6 + n2 * 0.4;
    dc.rgb *= 0.88 + 0.2 * smoothstep(0.3, 0.8, n2);
    dc.rgb = mix(dc.rgb, dc.rgb * vec3(0.8, 0.62, 0.55), smoothstep(0.62, 0.8, skNoise(p * 0.8 + 9.0)) * 0.35);
    gSkSss = 0.1;
  }
  // 鳃盖分界线：一道向后弯的细缝（前片压后片：缝后方一线阴影 + 法线台阶）
  if (uSk3.w > 0.5 && T <= 1) {
    float side = smoothstep(0.25, 0.6, abs(fn.z)) * (1.0 - smoothstep(0.7, 1.05, yy));
    float sh = smoothstep(0.03, 0.0, -dx) * step(dx, 0.0) * side;
    float lip = smoothstep(0.012, 0.0, dx) * step(0.0, dx) * side;     // 鳃盖后缘薄片：略提亮
    dc.rgb *= (1.0 - 0.42 * sh * sh) * (1.0 + 0.06 * lip);
    h += smoothstep(-0.005, 0.004, dx) * side * 1.6;
    // 侧线：沿体侧偏上的一条细线 + 一串孔点，鳃盖后开始、尾柄前淡出
    float ll = smoothstep(0.045, 0.0, abs(fn.y - 0.2)) * smoothstep(0.4, 0.8, abs(fn.z)) * uSk1.z;
    ll *= (1.0 - head) * smoothstep(0.95, 0.75, gSkU) * fade;
    float pore = step(0.55, fract(p.x * 0.5 + 0.25));
    dc.rgb *= 1.0 - (0.1 + 0.12 * pore) * ll;
    h -= ll * 0.5 * pore;
  }
  // 眼眶：眼睛外一圈柔和凹陷（AO 暗环 + 眶缘微隆），让眼球"长在眶里"
  if (uSk4.w > 0.0) {
    float de = length(vec3(fp.x - uSk4.x, fp.y - uSk4.y, (abs(fp.z) - uSk4.z) * 0.6)) / uSk4.w;
    float ao = smoothstep(1.85, 1.15, de) * smoothstep(0.9, 1.15, de);
    dc.rgb *= 1.0 - 0.22 * ao;
    h += smoothstep(1.3, 1.65, de) * smoothstep(2.2, 1.65, de) * 0.8;
  }
  // 背深腹浅（countershading）：背脊压暗、腹部提亮带一点银白
  float cs = uSk1.y;
  dc.rgb *= mix(1.0, 0.84, smoothstep(0.3, 0.95, fn.y) * cs);
  dc.rgb = mix(dc.rgb, max(dc.rgb, vec3(lum)) * 1.05 + 0.035, smoothstep(-0.2, -0.85, fn.y) * 0.32 * cs);
  gSkH = h; gSkK = k * fade; gSkR = edge * 0.06;
  if (role != 1) { gSkThin = 0.06 + 0.26 * smoothstep(-0.1, -0.8, fn.y); if (T != 2) gSkSss = 0.1 + 0.45 * smoothstep(0.1, -0.7, fn.y) + 0.2 * head; }
}
`;
const FRAG_ALBEDO = /* glsl */`
  skAlbedo(diffuseColor);
  diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);
`;
// 粗糙度随部位：头部最湿 0.25、体侧 0.32、腹部 0.40、鳍 0.42；鳞缘略糙（细碎鳞光）
const FRAG_ROUGH = /* glsl */`
  if (gSkWet > 0.5 && int(uSk1.x + 0.5) != 2) {
    float rb = int(uSk1.x + 0.5) == 1 ? 0.42 : mix(0.32, 0.4, smoothstep(0.0, -0.8, gSkFy));
    rb = mix(rb, 0.25, gSkHead);
    if (int(uSk0.x + 0.5) == 3) rb = 0.45;
    roughnessFactor = clamp(rb + gSkR, 0.22, 0.5);
  } else {
    roughnessFactor = clamp(roughnessFactor - gSkR, 0.25, 1.0);
  }
`;
const FRAG_NORMAL = /* glsl */`
  #ifndef SK_LQ
    if (gSkK > 0.0) normal = skBump(-vViewPosition, normal, gSkH, gSkK * uSk2.x);
  #endif
`;
const FRAG_OPAQUE = /* glsl */`
  {
    vec3 Vd = normalize(vViewPosition);
    float ndv = saturate(dot(normal, Vd));
    #if NUM_DIR_LIGHTS > 0
      vec3 Ls = directionalLights[0].direction;
      vec3 Lc = directionalLights[0].color;
      float ndl = dot(normal, Ls);
      // ① 次表面近似：wrap lighting（明暗交界线柔化并染暖红，腹部/鳃盖/鳍更强）
      float wrap = saturate((ndl + 0.55) / 1.55) - saturate(ndl);
      vec3 sssC = diffuseColor.rgb * vec3(1.0, 0.62, 0.5) + vec3(0.03, 0.008, 0.0);
      outgoingLight += sssC * Lc * wrap * gSkSss * 0.22;
      // ② 背光透射：薄处（鳍膜、腹缘、触手）逆光透出暖色
      float back = saturate(-ndl) * 0.5 + pow(saturate(dot(-Vd, Ls)), 3.0) * 0.9;
      vec3 warm = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 0.9, 0.74) + vec3(0.05, 0.02, 0.0), 0.55);
      outgoingLight += warm * Lc * back * gSkThin * uSk1.w * (int(uSk1.x + 0.5) == 1 ? 0.6 : 0.18);
      // 鳍膜正面也有一点透出的暖色（光穿过薄膜后从另一面散出）
      if (int(uSk1.x + 0.5) == 1) outgoingLight += warm * Lc * saturate(ndl) * gSkThin * uFin1.y * 0.08;
      if (gSkWet > 0.5) {
        // ③ 双层湿润高光：宽柔黏膜光泽（低指数）+ 清漆细高光（物理 clearcoat 负责）
        vec3 Hh = normalize(Ls + Vd);
        float nh = saturate(dot(normal, Hh));
        float soft = pow(nh, 14.0) * 0.16 + pow(nh, 90.0) * 0.35;
        outgoingLight += Lc * soft * saturate(ndl + 0.1) * mix(vec3(1.0), diffuseColor.rgb, 0.25) * (int(uSk1.x + 0.5) == 1 ? 0.35 + 0.6 * gSkH : 1.0);
        // 找回被风格化压掉的一部分直射高光（湿皮需要清晰的光斑）
        outgoingLight += reflectedLight.directSpecular * 0.35;
      }
    #endif
    if (gSkWet > 0.5) {
      // ④ 菲涅尔边缘提亮：掠射角反射天光（湿表面的亮边）
      float fr = pow(1.0 - ndv, 4.0);
      outgoingLight += vec3(0.78, 0.86, 0.95) * fr * (int(uSk1.x + 0.5) == 2 ? 0.0 : 0.14);
    }
    if (!(dot(outgoingLight, vec3(1.0)) < 1.0e4)) outgoingLight = vec3(0.0);
    outgoingLight = clamp(outgoingLight, 0.0, 4.0);
  }
`;

// ---------------- 应用到 Fish ----------------
const ROLE_FIN = /fin|tail|fluke|dorsal|sail|wing|finlet|keel|clavus|tower|frill|ruffled|oar|ribbon|crest|pectoral|ventral|anal|lobe|heterocercal/;
const ROLE_EYE = /eye|pupil|glint|cornea/;
// 这些物种的鳍/翼没有可见的放射鳍条（软骨鱼、头足类、甲壳、翻车鱼的皮质鳍）
const NO_RAYS = new Set(['manta-ray', 'hammerhead', 'squid', 'cuttlefish', 'octopus', 'lobster', 'snow-crab', 'king-crab', 'sunfish',
  'starfish', 'seahorse', 'jellyfish', 'moray-eel', 'mantis-shrimp', 'sea-turtle', 'dolphin', 'great-white', 'orca', 'narwhal', 'whale-shark']);
function ensureFinAttr(g) {
  if (g.getAttribute('aFin')) return;
  const n = g.getAttribute('position').count;
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
}

// 返回 { U, profile, dispZ(x), fishX(bodyX) }
export function skinFish(fish) {
  const model = fish.model, spId = fish.sp.id;
  const sk = SKIN[spId] || SKIN_DEF, sw = SWIM[spId] || SWIM_DEF;
  const gx = fish.gx;
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const box = new THREE.Box3();
  const meshes = [];
  model.traverse((o) => { if (o.isMesh && !o.userData.isOutline && !o.userData.outline) { meshes.push(o); o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
  const len = Math.max(box.max.x - box.min.x, 0.05);
  const root = model.getObjectByName('normalized-sculpture');
  const ns = root ? root.scale.x : 1, rp = root ? root.position : new THREE.Vector3();
  const sc = (x, y, z) => new THREE.Vector3(x * ns + rp.x, y * ns + rp.y, z * ns + rp.z);   // 雕塑坐标 → 模型空间
  // 物种类型参数
  const p2 = new THREE.Vector4(0, 0, 0, 0);
  if (sw.type === 2) p2.x = 1 / Math.max(box.max.z, 0.05);
  else if (sw.type === 3) { const c = spId === 'jellyfish' ? sc(0, -0.02, 0) : spId === 'starfish' ? sc(0, 0.5, 0) : sc(0.02, -0.11, 0); p2.set(c.y, 0, c.x, c.z); }
  else if (sw.type === 4) { p2.x = sc(spId === 'squid' ? 0.36 : 0.47, 0, 0).x; p2.y = (spId === 'squid' ? 0.12 : 0.2) * ns; }
  else if (sw.type === 5 && spId === 'mantis-shrimp') { p2.x = 0.05 * ns; p2.y = sc(0.3, 0, 0).x; p2.z = sc(-0.42, 0, 0).x; }
  else if (sw.type === 5) { const king = spId === 'king-crab'; p2.x = (spId === 'lobster' ? 0.15 : king ? 0.26 : 0.2) * ns; p2.y = sc(spId === 'lobster' ? 0.2 : 0.32, 0, 0).x; p2.z = spId === 'lobster' ? sc(-0.25, 0, 0).x : -99; }
  else if (sw.type === 6) p2.x = 0.52 * ns;
  const U = {
    uSw0: { value: new THREE.Vector4(Math.random() * 6.28, sw.amp, sw.k, 0) },
    uSw1: { value: new THREE.Vector4(sw.type, box.max.x, 1 / len, 0) },
    uSw2: { value: p2 },
    uSw3: { value: new THREE.Vector4(sw.head, sw.pw, 0, 0) },
    uSk0: { value: new THREE.Vector4(sk.type, sk.den * 0.7, sk.bump, box.max.x) },
    uSk2: { value: new THREE.Vector4(1, 0, 0, 0) },
    uSk3: { value: new THREE.Vector4(0, 0, 1 / len, 0) },
    uSk4: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  // r4 鳃盖分界线：以眼睛为参照，往后约 2.6 个眼径（只对有鳃盖的硬骨鱼/鲨）
  const eyeM = model.userData.parts?.['eye-left-rim'] || model.userData.parts?.['eye-1-rim'];
  if (eyeM && sw.type <= 1 && sk.type <= 1) {
    const ep = eyeM.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const er = Math.min(eyeM.scale.x * ns, len * 0.06);
    U.uSk3.value.set(ep.x - Math.max(er * 2.6, len * 0.07), ep.y - er * 0.4, 1 / len, 1);
  }
  if (eyeM && sw.type <= 2) {
    const ep = eyeM.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    U.uSk4.value.set(ep.x, ep.y, Math.abs(ep.z), eyeM.scale.x * ns);
  }
  const matK = gx?.mat;
  // 特殊材质：毛绒/果冻/水晶不需要鳞片
  if (matK === 'plush' || matK === 'jelly' || matK === 'crystal') U.uSk0.value.z *= 0.15;
  else if (matK) U.uSk0.value.z *= 0.6;
  const LQ = FISH_Q.low;
  for (const o of meshes) {
    const m = o.material; if (!m || !m.isMeshStandardMaterial || m.userData.fsk) continue;
    m.userData.fsk = true;
    ensureFinAttr(o.geometry);
    const mark = /palette|window|stripe|band|spot/.test(o.name);    // 贴体花纹片（蓝吊鱼调色板纹等）不是鳍
    const fin = NO_RAYS.has(spId) || mark ? null : o.geometry.userData.fin;
    const role = ROLE_EYE.test(o.name) ? 2 : mark ? 0 : (fin || o.geometry.userData.fin || ROLE_FIN.test(o.name)) ? 1 : 0;
    // ---- PBR 参数 ----
    const wet = m.isMeshPhysicalMaterial && !matK && !m.transparent;
    // 鳍膜半透明：有放射鳍条的真鳍（软骨鱼/翻车鱼/头足/甲壳的皮质鳍保持不透明）
    const finAlpha = wet && role === 1 && !!fin;
    if (m.isMeshPhysicalMaterial && !matK) {
      if (role === 2) {
        const glint = /glint/.test(o.name), pupil = /pupil/.test(o.name), cornea = /cornea/.test(o.name);
        m.clearcoat = 1; m.clearcoatRoughness = 0.06; m.roughness = pupil ? 0.18 : 0.3; m.metalness = /rim/.test(o.name) ? 0.35 : 0;
        if (glint) { m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = 0.35; }
        if (cornea) { m.roughness = 0.05; m.metalness = 0; }
      } else if (role === 1) {
        // 鳍：薄膜，略糙；清漆细高光弱一些
        m.clearcoat = sk.coat * 0.5; m.clearcoatRoughness = 0.14; m.roughness = 0.42; m.metalness = sk.metal * 0.3;
        if (sk.irid > 0 && !LQ) { m.iridescence = sk.irid * 0.45; m.iridescenceIOR = 1.32; m.iridescenceThicknessRange = [220, 560]; }
        if (finAlpha) { m.transparent = true; m.depthWrite = true; }
      } else {
        // 身体：双层湿润 = 宽柔黏膜光泽(粗糙度 0.25–0.45 分区，shader 内) + 清漆细高光(0.08) + 绒面掠射 sheen
        m.clearcoat = Math.min(1, sk.coat * 1.05); m.clearcoatRoughness = sk.type === 3 ? 0.2 : 0.08; m.roughness = sk.type === 3 ? 0.45 : 0.33; m.metalness = Math.max(m.metalness * 0.5, sk.metal);
        if (sk.irid > 0 && !LQ) { m.iridescence = sk.irid; m.iridescenceIOR = 1.33; m.iridescenceThicknessRange = [240, 620]; }
        if (!LQ && sk.type !== 3) { m.sheen = 0.35; m.sheenRoughness = 0.5; m.sheenColor = new THREE.Color('#dfe9f2').lerp(m.color, 0.25); }
      }
    }
    const roleU = { value: new THREE.Vector4(role, sk.type === 3 ? 0.5 : 1.0, sk.type === 0 ? 1 : 0, role === 1 ? 1.0 : sk.type === 2 ? 0.8 : 0.5) };
    const finU0 = { value: new THREE.Vector4(fin ? fin.amin : 0, fin ? fin.amax : 1, fin ? fin.n : 0, fin ? fin.dmin : 0) };
    const finU1 = { value: new THREE.Vector4(fin ? fin.dmax : 1, finAlpha ? 1 : 0, wet ? 1 : 0, 0) };
    const m2f = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const m2fi = new THREE.Matrix3().setFromMatrix4(m2f).invert();
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.() || '';
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, U);
      sh.uniforms.uSwM = { value: m2f }; sh.uniforms.uSwMi = { value: m2fi };
      sh.uniforms.uSk1 = roleU; sh.uniforms.uFin0 = finU0; sh.uniforms.uFin1 = finU1;
      const def = LQ ? '#define SK_LQ\n' : '';
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <project_vertex>', VERT_MAIN + '#include <project_vertex>');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + def + FRAG_PARS)
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n' + FRAG_ALBEDO)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
        .replace('#include <opaque_fragment>', FRAG_OPAQUE + '#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => prevKey + '-fsk4' + (LQ ? 'L' : '');
    m.needsUpdate = true;
  }
  const S = { U, sw, len, xHead: box.max.x, ph: U.uSw0.value.x, amp: sw.amp, flex: 0, turn: 0, hz: sw.hz };
  // CPU 镜像（装饰物跟随身体）：只对 0/1 型（侧向摆动）有效
  S.disp = (x) => {
    if (sw.type > 1) return { z: 0, yaw: 0 };
    const f = (xx) => {
      const u = THREE.MathUtils.clamp((S.xHead - xx) / len, 0, 1.15);
      const env = sw.head + (1 - sw.head) * Math.pow(u, sw.pw);
      const v0 = U.uSw0.value, v1 = U.uSw1.value;
      return v0.y * len * env * Math.sin(v0.z * 6.2831853 * u - v0.x) + v0.w * len * 0.16 * u * u + v1.w * len * 0.26 * (u * u - 0.3 * (1 - u));
    };
    const e = len * 0.01, z = f(x);
    return { z, yaw: Math.atan((f(x + e) - f(x - e)) / (2 * e)) };
  };
  return S;
}

// 每帧：根据模式推进相位 / 振幅（Fish.animate 调用）
export function stepSwim(S, dt, { speed = 1, turn = 0, mode = 'swim', burst = 0, t = 0 } = {}) {
  const sw = S.sw;
  let hz, amp, flex = 0;
  if (mode === 'hold') {
    const k = 0.35 + burst * 1.4;
    hz = sw.hz * (1.5 + burst * 1.6); amp = sw.amp * (0.9 + 1.6 * k);
    flex = Math.sin(t * (sw.type > 1 ? 3 : 5.5)) * 0.55 * Math.min(1, k);
  } else if (mode === 'struggle') {
    hz = sw.hz * 2.3; amp = sw.amp * 1.9; flex = Math.sin(t * 6.5) * 0.45;
  } else {
    const s = THREE.MathUtils.clamp(speed, 0, 3);
    hz = sw.hz * (0.45 + 0.55 * s); amp = sw.amp * (0.7 + 0.3 * Math.min(s, 2));
  }
  amp = Math.min(amp, sw.type === 2 ? 0.26 : sw.type === 6 ? 0.3 : 0.17);
  const a = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
  S.amp += (amp - S.amp) * a; S.flex += (flex - S.flex) * a; S.turn += (THREE.MathUtils.clamp(turn, -1, 1) - S.turn) * a; S.hz += (hz - S.hz) * a;
  S.ph = (S.ph + dt * S.hz * Math.PI * 2) % (Math.PI * 2000);
  const U = S.U;
  U.uSw0.value.x = S.ph; U.uSw0.value.y = S.amp; U.uSw0.value.w = S.turn;
  U.uSw1.value.w = S.flex;
  if (sw.type === 3) U.uSw2.value.y = Math.pow(Math.max(0, Math.sin(S.ph * 0.5)), 3) * (mode === 'swim' ? 1 : 1.6);        // 章鱼呼吸
  if (sw.type === 4) U.uSw2.value.z = Math.pow(Math.max(0, Math.sin(S.ph * 0.5)), 4) * (mode === 'swim' ? 1 : 1.5);        // 鱿鱼喷射节律
}
