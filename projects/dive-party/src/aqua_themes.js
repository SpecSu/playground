// 水族馆主题（v4）：每套主题 = 水体光学 + 灯光 + 鱼专用照明 + 布景配方 + 粒子
// 配色守则（v4，对齐动森博物馆水族馆）：背景水色「深而饱和」（深青蓝 / 墨绿蓝 / 冷蓝），不发白不发灰；
//   鱼单独提亮（key + rim + 环境反射），布景适度暗于鱼作衬托；光束细、淡、少、随深度衰减；珊瑚略饱和但不荧光
// water: top=水面方向 / hor=水平线（远景雾色）/ deep=向下；den=水体密度；abs=逐通道吸收（红先衰减）；dd=深处光衰；fogN=雾起始距离（米）
// light: 场景灯（布景 + 鱼共用）；fish: 鱼专用（shader 内的 key/rim + 去雾 + 饱和度）；env: 布景整体压暗系数 + 饱和度
export const THEMES = {
  reef: {
    id: 'reef', name: '热带珊瑚礁', emoji: '🪸', sw: ['#2f8fb0', '#e8d8bf', '#e08a6a'],
    water: { top: '#42a6c8', hor: '#0c527a', deep: '#04243c', den: 0.042, abs: [1.75, 0.95, 0.55], dd: 0.6, fogN: 6.0, mid: 0.35 },
    light: { sky: '#9fd8ea', gnd: '#163848', hemi: 0.78, key: '#fff1da', keyI: 2.3, fill: '#8fd0e0', fillI: 0.55, rim: '#7fd0f0', rimI: 0.6, exp: 1.04 },
    fish: { key: '#fff3e0', keyK: 0.47, rim: '#a8e8ff', rimK: 0.70, fog: 0.4, sat: 1.38, env: 0.36 },
    env: { k: 0.9, sat: 1.12 },
    caus: 0.6, causCol: '#fff1d6', trans: '#e8d8b0', sun: '#d8f2ff',
    rays: { n: 4, col: '#e6f6ff', op: 0.032, w: [0.6, 1.2] },
    sand: { c1: '#c9b48e', c2: '#b09a74', amp: 0.6 },
    rock: { c1: '#867a70', c2: '#a0907e', moss: '#6f8a6a', mossK: 0.3, n: 5 },
    coral: ['#ee8a66', '#f0d8bc', '#b386d0', '#b4cc6a', '#f0a650', '#e47a78', '#7fb4d2'],
    mix: { stag: 10, brain: 7, table: 4, tube: 5, fan: 5, anemone: 5, grass: 22, kelp: 2, kelpH: 4.5 },
    particles: { type: 'snow', col: '#cfeaf2', n: 300 },
    bubbles: 3,
  },
  kelp: {
    id: 'kelp', name: '海带森林', emoji: '🌿', sw: ['#2e6a5e', '#a6ad7c', '#173a36'],
    // 深墨绿青：hor 去灰、提纯；中景空气透视/暗部抬升减半 → 不再是绿雾
    water: { top: '#38aca8', hor: '#044650', deep: '#021a20', den: 0.04, abs: [1.9, 0.8, 0.75], dd: 0.62, fogN: 7.0, mid: 0.12, lift: 0.022 },
    light: { sky: '#8ee8e0', gnd: '#08303a', hemi: 0.8, key: '#fbf2d6', keyI: 2.6, fill: '#7cc8bc', fillI: 0.5, rim: '#9fe8d8', rimI: 0.7, exp: 1.05 },
    fish: { key: '#fff4dc', keyK: 0.52, rim: '#b8f0dc', rimK: 0.70, fog: 0.4, sat: 1.38, env: 0.36 },
    env: { k: 0.95, sat: 1.32, rim: '#6fd8e0', rimK: 0.22 },
    caus: 0.65, causCol: '#f4f2d4', trans: '#c8d888', sun: '#d6f4ea',
    rays: { n: 5, col: '#e0f7f0', op: 0.034, w: [0.4, 0.9] },
    sand: { c1: '#8e8c6c', c2: '#6e6e56', amp: 0.8 },
    rock: { c1: '#56625f', c2: '#6c7a72', moss: '#3f7a3a', mossK: 0.6, n: 13 },
    kelpC: ['#2c5a22', '#98b234'],
    coral: ['#d0906c', '#ddd0b4', '#aaa070'],
    mix: { stag: 0, brain: 2, table: 0, tube: 2, fan: 1, anemone: 3, grass: 22, kelp: 26, kelpH: 9 },
    particles: { type: 'snow', col: '#d0eee6', n: 300 },
    bubbles: 2,
  },
  ruins: {
    id: 'ruins', name: '深海遗迹', emoji: '🏛️', sw: ['#123250', '#8a8f8a', '#c9b98a'],
    water: { top: '#2a6a92', hor: '#0b2c48', deep: '#030c18', den: 0.06, abs: [1.9, 1.0, 0.7], dd: 0.5, fogN: 5.0 },
    light: { sky: '#8cc0dc', gnd: '#0c1a26', hemi: 0.62, key: '#dfeaf0', keyI: 1.7, fill: '#6f9ab4', fillI: 0.5, rim: '#8fc8e8', rimI: 0.8, exp: 1.1 },
    fish: { key: '#eef6ff', keyK: 0.57, rim: '#9fdcff', rimK: 0.80, fog: 0.4, sat: 1.35, env: 0.38 },
    env: { k: 0.92, sat: 1.1 },
    caus: 0.32, causCol: '#dcecf2', trans: '#a2c6c0', sun: '#bfe0f0',
    rays: { n: 2, col: '#cfe6f2', op: 0.022, w: [0.4, 0.8] },
    sand: { c1: '#86847c', c2: '#6c6b64', amp: 0.7 },
    rock: { c1: '#565d5c', c2: '#70746a', moss: '#56664e', mossK: 0.4, n: 9 },
    coral: ['#d2c0a4', '#9c90aa', '#bba686'],
    mix: { stag: 2, brain: 2, table: 0, tube: 3, fan: 3, anemone: 4, grass: 8, kelp: 0, kelpH: 4 },
    particles: { type: 'plankton', col: '#bfe6dc', n: 280 },
    glow: { col: '#a8e6d4', n: 80 },
    columns: true, wreck: true,
    bubbles: 2,
  },
  polar: {
    id: 'polar', name: '极地冰海', emoji: '🧊', sw: ['#2f78a8', '#eef3f1', '#14476a'],
    water: { top: '#5aa8d4', hor: '#16507c', deep: '#06223c', den: 0.042, abs: [1.6, 0.9, 0.6], dd: 0.62, fogN: 6.0 },
    light: { sky: '#bfe4f4', gnd: '#1a3a52', hemi: 0.8, key: '#f2f8fc', keyI: 2.1, fill: '#9cc8e4', fillI: 0.55, rim: '#b0dcf4', rimI: 0.7, exp: 1.02 },
    fish: { key: '#f6faff', keyK: 0.47, rim: '#bfeaff', rimK: 0.75, fog: 0.4, sat: 1.40, env: 0.38 },
    env: { k: 0.88, sat: 1.1 },
    caus: 0.5, causCol: '#eaf6fa', trans: '#d6e8ee', sun: '#e2f4ff',
    rays: { n: 3, col: '#eaf6ff', op: 0.026, w: [0.4, 0.9] },
    sand: { c1: '#a8b8c0', c2: '#8e9ea8', amp: 0.5 },
    rock: { c1: '#5a6670', c2: '#76828c', moss: '#8c989c', mossK: 0.15, n: 10 },
    coral: ['#ece0d2', '#cdb4ae', '#b6c0aa'],
    mix: { stag: 0, brain: 0, table: 0, tube: 0, fan: 2, anemone: 6, grass: 6, kelp: 4, kelpH: 4 },
    particles: { type: 'ice', col: '#e6f4fa', n: 320 },
    ice: true,
    bubbles: 1,
  },
  sunset: {
    id: 'sunset', name: '日落红树林', emoji: '🌅', sw: ['#c8904c', '#e8cf9e', '#1f3e3a'],
    // 深琥珀青：水面方向保留琥珀暖光，水平线/深处是纯净深青；吸收改为红先衰减（远处不再泛暖灰）
    water: { top: '#5aa29a', hor: '#08525a', deep: '#02161a', den: 0.04, abs: [1.8, 0.9, 0.75], dd: 0.62, fogN: 7.5, mid: 0.1, lift: 0.025 },
    light: { sky: '#f4c47c', gnd: '#06303a', hemi: 0.74, key: '#ffd296', keyI: 2.6, fill: '#7cb4b0', fillI: 0.5, rim: '#ffc080', rimI: 0.9, exp: 1.05 },
    fish: { key: '#ffe6c4', keyK: 0.5, rim: '#a8e6f0', rimK: 0.72, fog: 0.4, sat: 1.35, env: 0.36 },
    env: { k: 0.92, sat: 1.3, rim: '#70d0d8', rimK: 0.26, fill: 0.04 },
    caus: 0.42, causCol: '#feea9a', trans: '#e8be78', sun: '#ffc880',
    rays: { n: 3, col: '#ffe0b0', op: 0.02, w: [0.35, 0.8] },
    sand: { c1: '#9c7458', c2: '#6c5040', amp: 0.6 },
    rock: { c1: '#544e46', c2: '#6c6456', moss: '#5c7a40', mossK: 0.4, n: 5 },
    coral: ['#e2925e', '#ead2a8', '#c4b05e'],
    mix: { stag: 2, brain: 1, table: 0, tube: 2, fan: 1, anemone: 2, grass: 46, kelp: 0, kelpH: 3 },
    particles: { type: 'gold', col: '#f2d29a', n: 300 },
    roots: true, bark: ['#5c3a22', '#4c6a34'],
    bubbles: 1,
  },
  volcano: {
    id: 'volcano', name: '火山热泉', emoji: '🌋', sw: ['#2a1e1c', '#7d6a5c', '#e0783c'],
    // 深石板蓝黑的水 × 橙色熔岩微光（互补色衬托），不再是一片棕褐
    water: { top: '#3c5a6c', hor: '#16283a', deep: '#05080e', den: 0.055, abs: [1.5, 1.0, 0.8], dd: 0.52, fogN: 5.0 },
    light: { sky: '#b4c8d4', gnd: '#140e0c', hemi: 0.66, key: '#f6e2c8', keyI: 1.9, fill: '#7a8c9a', fillI: 0.5, rim: '#f09460', rimI: 0.9, exp: 1.1 },
    fish: { key: '#fff0dc', keyK: 0.57, rim: '#ffb07a', rimK: 0.75, fog: 0.4, sat: 1.35, env: 0.36 },
    env: { k: 1.0, sat: 1.12, rim: '#5aaee0', rimK: 1.45, fill: 0.16 },
    caus: 0.32, causCol: '#f2d4b4', trans: '#c9966c', sun: '#e8b890',
    rays: { n: 2, col: '#e8c8a8', op: 0.019, w: [0.4, 0.8] },
    sand: { c1: '#56504a', c2: '#423c38', amp: 0.8 },
    rock: { c1: '#3e3c3e', c2: '#565052', moss: '#585440', mossK: 0.15, n: 10 },
    coral: ['#cc9478', '#bcac96'],
    mix: { stag: 0, brain: 0, table: 0, tube: 3, fan: 0, anemone: 2, grass: 4, kelp: 0, kelpH: 3 },
    particles: { type: 'ember', col: '#f0a874', n: 240 },
    vents: true, basalt: true, lava: '#ff6a1c',
    bubbles: 0,
  },
};
export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = 'reef';
export const themeOf = (id) => THEMES[id] || THEMES[DEFAULT_THEME];
export const themeLabel = (id) => { const t = themeOf(id); return `${t.emoji} ${t.name}`; };
// 好友默认主题：按好友序号错开（与玩家默认主题不同），也可由 owner.theme 覆盖
// （FRIENDS 顺序 = Rummons → 海带森林 / 咕咕 → 深海遗迹 / ChenNayu → 极地冰海 / 海盐柠檬 → 日落红树林 / 阿杰 → 火山热泉）
export function themeForFriend(idx, mine = DEFAULT_THEME) {
  const ids = THEME_IDS.filter((x) => x !== mine);
  return ids[idx % ids.length];
}
