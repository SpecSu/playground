// 「神奇钓鱼派对」风格参数（C：场景美术/渲染）。所有场景/渲染模块从这里取色，便于阶段 2 统一调色。
import * as THREE from 'three';

// ======================= 柔和场景色板（v1.2 · 对标「猛兽派对」）=======================
// 原则：低–中饱和、明度偏高、偏暖的奶油 / 灰调糖果色；深色一律用暖灰褐（不用纯黑/深紫）。
// 每个场景物体最多 2–3 色：大面积中性色（奶油/燕麦/木色），少量点缀色（雾粉/灰薄荷/雾蓝/黄油黄/陶土/薰衣草灰）。
// 禁止：高饱和纯红 / 纯绿 / 纯紫 / 荧光粉 / 荧光青。所有场景模块（boat/scenery/sky/water/fx）只从这里取色。
export const SOFT = {
  // —— 中性色（大面积）——
  cream: '#f6efe4',      // 奶油白：船体、船舱、软垫
  creamDeep: '#ece2d3',  // 奶油暗面/内舷墙
  oat: '#e8dcc8',        // 燕麦：布料、桌面、气球中性色
  sand: '#e6d3b3',       // 自然沙色：小岛沙滩
  wood: '#d2ab86',       // 柔木色：甲板/扶手（灰暖、不发橙）
  woodDeep: '#b48d6c',   // 木缝/木纹
  stone: '#cbbcaa',      // 暖灰石：岛屿山体
  // —— 点缀色（少量）——
  rose: '#e9b8b0',       // 雾粉
  roseLight: '#f0cdc4',  // 浅雾粉（大体积充气物：火烈鸟）
  roseDeep: '#d99a90',   // 雾粉暗（火烈鸟、舷缘带）
  mint: '#a8cfc3',       // 灰薄荷
  mintDeep: '#88b6a9',
  blue: '#9fbad0',       // 雾蓝
  blueDeep: '#7f9cb4',
  butter: '#f2d48f',     // 黄油黄
  terra: '#d99a76',      // 陶土橙
  terraLight: '#e6b591', // 甜甜圈面团
  lav: '#b9addb',        // 薰衣草灰
  sage: '#aebd98',       // 灰绿植被
  sageDeep: '#8fa283',
  // —— 深色（暖灰褐）——
  taupe: '#8d7a6d',      // 音箱/DJ 台面板
  ink: '#5e5048',        // 眼睛/唱片/细节
  inkSoft: '#9a8a7e',    // 绳子/灯串线
  metal: '#ddd6cc',      // 缎面暖银（栏杆/立柱，不做镜面铬）
  glass: '#7f909c',      // 窗带：暖灰蓝（替代深紫玻璃）
  bulb: '#fff0d6',       // 暖白灯泡
};
// 点缀色循环（彩旗/气球/彩纸/灯串点缀）
export const SOFT_ACCENTS = [SOFT.rose, SOFT.butter, SOFT.mint, SOFT.blue, SOFT.terra, SOFT.lav];

// 兼容旧接口：CANDY 键名保留，取值全部映射到柔和色板（旧的 #ff5fa2/#2fe0c5/#7b5cff 等高饱和色已废弃）
export const CANDY = {
  pink: SOFT.rose, lemon: SOFT.butter, mint: SOFT.mint, grape: SOFT.lav,
  peach: SOFT.terraLight, sky: SOFT.blue, lime: SOFT.sage, orange: SOFT.terra, white: SOFT.cream, ink: SOFT.ink,
};
export const CANDY_LIST = [CANDY.pink, CANDY.lemon, CANDY.mint, CANDY.grape, CANDY.sky, CANDY.orange, CANDY.lime];

// 统一柔和材质参数：粗糙度偏高、柔光 sheen（布料/充气物），避免塑料镜面感
export const SOFT_MAT = {
  paint: { roughness: 0.6, clearcoat: 0.28, clearcoatRoughness: 0.5 }, // 船漆/硬质涂装：薄釉感（像上了釉的陶瓷，柔高光）
  fabric: { roughness: 0.86, sheen: 0.8, sheenRoughness: 0.6 },      // 软垫/彩旗：哑光微绒
  inflat: { roughness: 0.58, sheen: 0.45, sheenRoughness: 0.45 },    // 气球/泳圈：柔亮充气感
  wood: { roughness: 0.78 },
  metal: { metalness: 0.45, roughness: 0.42 },                       // 缎面金属
};

// 场景光照/天空/海水/调色的柔和预设（sky.js PRESETS.dream 直接取用）
export const SOFT_ENV = {
  // r2：天空更通透（奶油地平线 → 清透雾蓝天顶），去掉"阴天灰"
  zenith: '#74abe0', mid: '#b2d6f1', horizon: '#fcf0e2', sun: '#ffe9cc', sunIntensity: 3.15,
  cloud: '#fffbf5', cloudShadow: '#d6d0d8', cloudCover: 0.48,
  // r2：柔和青蓝海（中饱和、高明度的浅青，不是荧光青绿，也不是浑浊灰蓝）
  deep: '#4790b6', shallow: '#97d4dc', sss: '#d8f2ec', foam: '#fffaf2',   // r3：往明亮马卡龙浅蓝偏移
  hemiSky: '#f3efe8', hemiGround: '#e8d6bc', hemiIntensity: 0.5,         // 暖奶油天光 + 暖沙反弹 → 阴影暖灰
  envIntensity: 0.85, exposure: 1.03, lights: 0.12,
  fog: 0.00065, waterFog: 0.00062,   // r3：雾更薄 → 地平线更干净
  grade: { lift: [0.01, 0.006, 0.0], gain: [1.03, 1.0, 0.97], sat: 1.0 },
};

// 描边：inverted hull —— v1.0 渲染回退后已关闭（toon.js 的 addOutline 为空实现），参数仅保留兼容
export const OUTLINE = {
  enabled: false,
  color: '#2b1d4e',
  widthPx: 0,        // CSS 像素宽度（近处），远处按距离衰减到 0.35 倍
  nearDist: 4.5,       // 小于该距离时保持满宽
};

// 迪斯科球光斑 —— v1.0 渲染回退：不再投射到全场材质（toon.js 已移除光斑叠加），strength=0；迪斯科球模型保留
export const DISCO = {
  strength: 0.0,       // 总强度（0 关闭）
  radius: 4.2,         // 影响半径（m）
  cells: 16,           // 经度方向格数（越大光斑越小越多）
  charMul: 0.35,       // 角色/鱼身上减弱，保证主角干净
};

// 时段预设（兼容导出）：v1.2 统一为柔和预设
export const PARTY_PRESET = { label: '柔和午后', sunElev: 24, sunAzim: 205, ...SOFT_ENV };

// 彩虹（天空 shader，海面反射共用）—— v1.0 渲染回退：保留但很淡、自然（加色叠加，alpha 为强度）
// azimDeg 为世界方位角（与 sunDirFromAngles 同约定）：放在钓鱼视线侧后方，避开太阳与浮漂
export const RAINBOW = { azimDeg: 255, elevDeg: -9, radius: 0.46, width: 0.04, alpha: 0.035 };   // v1.2：极淡粉彩虹（几乎只是空气里的一抹）

export function rainbowDir(out = new THREE.Vector3()) {
  const e = THREE.MathUtils.degToRad(RAINBOW.elevDeg), a = THREE.MathUtils.degToRad(RAINBOW.azimDeg);
  return out.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
}
