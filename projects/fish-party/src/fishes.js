// 鱼类系统 v0.4：40 种海洋生物（程序化雕塑模型）+ UGC 变种生成器 + 几件"奇怪的东西"
// 设定：每一条鱼都是玩家创作后投放进这片海的 —— 同一个物种，每次钓上来的颜色、体型、配饰、特质、作者都不同。
import * as THREE from 'three';
import { createMarineModel, animateMarineModel } from './marine.js';
import { newSeed, ugcFromSeed, applyPattern, findAnchors, buildDeco, DECOS, decoText } from './ugc.js';
import { rollItemCatch, ITEM_BY_ID } from './items.js';
import { skinFish, stepSwim } from './fishmat.js';
import { normGx, wildGx, funnyName, anchorsPlus, buildExtra, outlineGroup, addOutline, applyMat, tuneEyes, graftTail, cartoonEye, MAT_TIME, extraOk, stripHullOnTransparent, hasHull } from './parts.js';
export { DECOS, decoText };

export const RARITY = {
  common: { label: '常见', short: 'N', color: '#9fd8e3', pts: 10, power: 0.7 },
  uncommon: { label: '特别', short: 'R', color: '#6fdca8', pts: 25, power: 0.85 },
  rare: { label: '稀有', short: 'SR', color: '#5fb6ff', pts: 60, power: 1.0 },
  epic: { label: '史诗', short: 'SSR', color: '#c39bff', pts: 150, power: 1.15 },
  legendary: { label: '传说', short: 'UR', color: '#ffc94d', pts: 400, power: 1.3 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// cm: 标准体长（厘米）w: 抽取权重
export const SPECIES = [
  { id: 'clownfish', name: '小丑鱼', rarity: 'common', w: 12, cm: 12, kgm: 2, color: '#ff944c', desc: '把一小片落日，藏进橘色条纹里。' },
  { id: 'blue-tang', name: '蓝吊鱼', rarity: 'common', w: 10, cm: 24, kgm: 3, color: '#428cfa', desc: '像从海里跳出来的一滴蓝。' },
  { id: 'sardine', name: '沙丁鱼', rarity: 'common', w: 12, cm: 20, kgm: 2, color: '#a8dce1', desc: '闪闪发亮的小小海洋居民。' },
  { id: 'mackerel', name: '鲭鱼', rarity: 'common', w: 11, cm: 42, kgm: 4, color: '#41b4bd', desc: '银蓝色的流线型速度选手。' },
  { id: 'pufferfish', name: '河豚', rarity: 'uncommon', w: 7, cm: 45, kgm: 7, color: '#e4bb6c', desc: '圆鼓鼓的脾气，软乎乎的惊喜。' },
  { id: 'squid', name: '鱿鱼', rarity: 'uncommon', w: 7, cm: 70, kgm: 3, color: '#ed9abd', desc: '触腕还在跳舞，今天的惊喜很有活力。' },
  { id: 'cuttlefish', name: '乌贼', rarity: 'uncommon', w: 6, cm: 55, kgm: 5, color: '#bc8df4', desc: '一位披着变幻披风的深海艺术家。' },
  { id: 'snow-crab', name: '雪蟹', rarity: 'uncommon', w: 6, cm: 65, kgm: 5, color: '#efa97e', desc: '长长的蟹腿，接住海风的温柔。' },
  { id: 'salmon', name: '三文鱼', rarity: 'uncommon', w: 7, cm: 95, kgm: 8, color: '#cbbac4', desc: '带着银色鳞光，游进你的收藏。' },
  { id: 'octopus', name: '章鱼', rarity: 'rare', w: 4, cm: 120, kgm: 4, color: '#e67b8a', desc: '八只手一起，和你打个招呼。' },
  { id: 'lobster', name: '锦绣龙虾', rarity: 'rare', w: 4.5, cm: 85, kgm: 6, color: '#f07855', desc: '挥舞大钳子的甲板贵宾。' },
  { id: 'mahi-mahi', name: '鲯鳅', rarity: 'rare', w: 4, cm: 150, kgm: 8, color: '#e4d45e', desc: '亮绿与金黄，是大海最招摇的配色。' },
  { id: 'king-crab', name: '帝王蟹', rarity: 'epic', w: 1.8, cm: 160, kgm: 7, color: '#e85e4e', desc: '横着走，也能有王者气场。' },
  { id: 'tuna', name: '蓝鳍金枪鱼', rarity: 'epic', w: 1.8, cm: 220, kgm: 16, color: '#619bd1', desc: '沉甸甸的蓝色奇迹，值得双手抱紧。' },
  { id: 'swordfish', name: '剑鱼', rarity: 'epic', w: 1.6, cm: 280, kgm: 10, color: '#759ebc', desc: '举起长剑，向你的好运致意。' },
  { id: 'sailfish', name: '旗鱼', rarity: 'epic', w: 1.4, cm: 240, kgm: 9, color: '#5b90db', desc: '一面来自深蓝的帆，在风里展开。' },
  { id: 'manta-ray', name: '蝠鲼', rarity: 'legendary', w: 0.45, cm: 450, kgm: 14, color: '#86a2c1', desc: '张开双翼，把整片海拥进怀里。' },
  { id: 'hammerhead', name: '双髻鲨', rarity: 'legendary', w: 0.45, cm: 380, kgm: 12, color: '#91bbc2', desc: '特别的脑袋，当然配得上特别的好运。' },
  { id: 'oarfish', name: '皇带鱼', rarity: 'legendary', w: 0.3, cm: 650, kgm: 3, color: '#d9c1dd', desc: '传说中的海底长缎带，真的被你遇见了。' },
  { id: 'sunfish', name: '翻车鱼', rarity: 'legendary', w: 0.45, cm: 300, kgm: 30, color: '#becdd4', desc: '巨大又淡定，今天最可爱的重量级。' },
  // v4 新增 20 种（模型见 marine2.js；v4.1 color 改为柔和自然色，与原 20 种同一明度带）。数值：每个稀有度新增权重之和 = 该档原有权重之和 → 各档出现率不变（ODDITIES 权重同步 ×2）
  { id: 'butterflyfish', name: '蝴蝶鱼', rarity: 'common', w: 12, cm: 15, kgm: 3, color: '#e8c766', desc: '眼睛藏在黑带里，尾巴上还画了一只假眼。' },
  { id: 'sea-bream', name: '真鲷', rarity: 'common', w: 11, cm: 40, kgm: 8, color: '#e08a92', desc: '粉红鳞片撒满蓝色星点，节日的好彩头。' },
  { id: 'flounder', name: '比目鱼', rarity: 'common', w: 11, cm: 50, kgm: 5, color: '#b39c78', desc: '两只眼睛长在同一边，趴着也能看全世界。' },
  { id: 'starfish', name: '海星', rarity: 'common', w: 11, cm: 25, kgm: 3, color: '#e49272', desc: '五角形的小太阳，从海底慢慢爬上来。' },
  { id: 'seahorse', name: '海马', rarity: 'uncommon', w: 8, cm: 20, kgm: 1, color: '#e0b062', desc: '卷着尾巴站得笔直，是海里的小骑士。' },
  { id: 'jellyfish', name: '海月水母', rarity: 'uncommon', w: 9, cm: 35, kgm: 1, color: '#cfdff0', desc: '一朵会呼吸的透明云，轻轻一碰就会发光。' },
  { id: 'parrotfish', name: '鹦嘴鱼', rarity: 'uncommon', w: 8, cm: 55, kgm: 8, color: '#5fb3a6', desc: '长着鹦鹉嘴，啃珊瑚啃出了白沙滩。' },
  { id: 'lionfish', name: '狮子鱼', rarity: 'uncommon', w: 8, cm: 35, kgm: 6, color: '#d0867a', desc: '红白条纹配一身华丽长棘，好看但别乱摸。' },
  { id: 'moray-eel', name: '巨型海鳝', rarity: 'rare', w: 3, cm: 250, kgm: 2, color: '#a59660', desc: '从礁石缝里探出头，张嘴就是一排獠牙。' },
  { id: 'anglerfish', name: '鮟鱇鱼', rarity: 'rare', w: 3, cm: 90, kgm: 10, color: '#6f6680', desc: '头顶提着一盏小灯笼，深海里最会钓鱼的鱼。' },
  { id: 'mantis-shrimp', name: '雀尾螳螂虾', rarity: 'rare', w: 3.5, cm: 30, kgm: 3, color: '#79b48a', desc: '彩虹色的拳击手，一拳能打碎贝壳。' },
  { id: 'barracuda', name: '大魣', rarity: 'rare', w: 3, cm: 170, kgm: 5, color: '#8fa3ae', desc: '银色长箭带着地包天獠牙，快得像一道闪电。' },
  { id: 'sea-turtle', name: '绿海龟', rarity: 'epic', w: 1.8, cm: 130, kgm: 50, color: '#9c8c5e', desc: '背着一整面花纹盾牌，游过了好几片大洋。' },
  { id: 'dolphin', name: '宽吻海豚', rarity: 'epic', w: 1.6, cm: 280, kgm: 13, color: '#9aabba', desc: '天生微笑脸，跟着你的船跳了一路。' },
  { id: 'giant-grouper', name: '龙趸', rarity: 'epic', w: 1.8, cm: 230, kgm: 25, color: '#8d8462', desc: '礁石之王，一张大嘴能吞下整个好运。' },
  { id: 'coelacanth', name: '腔棘鱼', rarity: 'epic', w: 1.4, cm: 200, kgm: 11, color: '#5a7a9a', desc: '四亿年前的活化石，鳍像四条小腿。' },
  { id: 'great-white', name: '大白鲨', rarity: 'legendary', w: 0.45, cm: 550, kgm: 6, color: '#8f9aa3', desc: '海洋顶级掠食者，今天却乖乖上了你的钩。' },
  { id: 'orca', name: '虎鲸', rarity: 'legendary', w: 0.4, cm: 750, kgm: 9, color: '#353a41', desc: '黑白分明的海洋霸主，聪明又爱玩。' },
  { id: 'narwhal', name: '独角鲸', rarity: 'legendary', w: 0.4, cm: 450, kgm: 10, color: '#aab3b8', desc: '额前一根螺旋长牙，北极海的独角兽。' },
  { id: 'whale-shark', name: '鲸鲨', rarity: 'legendary', w: 0.4, cm: 1200, kgm: 8, color: '#5f7889', desc: '满身星空白点的温柔巨人，世界上最大的鱼。' },
];
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
const VERT_SP = { seahorse: 1, jellyfish: 1 };   // 竖直体型（与 marine2.js normY 一致）

// "奇怪的东西"：漂流瓶（来自其他玩家的留言）/ 小黄鸭 / 宝箱
export const ODDITIES = [
  { id: 'bottle', name: '漂流瓶', rarity: 'rare', w: 4.4, cm: 30, kgm: 1, color: '#9fe3d0', desc: '瓶子里塞着一张纸条，来自另一位钓友。', odd: true },
  { id: 'duck', name: '小黄鸭', rarity: 'uncommon', w: 4.4, cm: 18, kgm: 1, color: '#ffd84a', desc: '嘎。它看起来已经漂了很久，很开心被你捡到。', odd: true },
  { id: 'chest', name: '迷你宝箱', rarity: 'epic', w: 1.6, cm: 40, kgm: 6, color: '#d39a52', desc: '沉甸甸的，当场打开：金币 + 幸运鱼饵 + 装扮道具！', odd: true },
];
for (const o of ODDITIES) SPECIES_BY_ID[o.id] = o;
// v1.1 道具漂流物：钓上来的是"装扮道具"而不是鱼（不进 ODDITIES 抽取池、不计图鉴；由 rollCatch({ itemP }) 触发）
// v.item = { id, n } —— 道具表见 items.js；外观：贝壳包（普通）/ 漂流瓶（稀有）/ 小宝箱（史诗·传说）
export const ITEM_PODS = [
  { id: 'pod_shell', name: '贝壳包', rarity: 'common', w: 0, cm: 22, kgm: 1, color: '#ffc7da', desc: '一只合不拢的贝壳，里面夹着亮晶晶的东西。', odd: true, pod: true },
  { id: 'pod_bottle', name: '道具漂流瓶', rarity: 'uncommon', w: 0, cm: 30, kgm: 1, color: '#9fe3d0', desc: '瓶子里装的不是纸条，是一件装扮道具！', odd: true, pod: true },
  { id: 'pod_chest', name: '装扮小宝箱', rarity: 'rare', w: 0, cm: 40, kgm: 6, color: '#d39a52', desc: '沉甸甸的，里面是稀有的装扮道具。', odd: true, pod: true },
];
for (const o of ITEM_PODS) SPECIES_BY_ID[o.id] = o;

export const BOTTLE_NOTES = [
  '今天钓到了人生第一条鲯鳅，分你一点好运 🍀 —— @海盐柠檬',
  '如果你捡到这个，说明我们在同一片海里 🌊 —— @不吃香菜',
  '我画的那条彩虹河豚，希望有一天被你钓到！—— @画画的小葵',
  '加油，下一杆就是传说！—— @深夜钓鱼佬',
  '别忘了抬头看看晚霞 🌅 —— @云朵收藏家',
  '给我的鱼起名叫"周一不上班"，祝你也是 —— @摸鱼大师',
];

// ---------------- UGC 变种 ----------------
export const CREATORS = ['@画画的小葵', '@海盐柠檬', '@鲸鱼不睡觉', '@不吃香菜', '@今天也躺平', '@泡泡糖星人', '@阿杰的船', '@摸鱼大师', '@云朵收藏家', '@深夜钓鱼佬', '@咸鱼翻身中', '@粉红鲨鲨', '@月亮邮差', '@奶盖大王', '@橘子汽水', '@小鹿乱撞'];
const ADJ = ['元气', '害羞的', '摇滚', '迷糊', '社恐', '睡不醒的', '超级', '会发光的', '想当网红的', '周末限定', '很能吃的', '酷酷的', '爱唱歌的', '暴躁', '温柔', '神秘'];

// 特质：mult 为积分倍率
export const TRAITS = {
  gold: { label: '金色', icon: '✨', mult: 3, w: 3 },
  rainbow: { label: '彩虹', icon: '🌈', mult: 4, w: 2 },
  jelly: { label: '果冻', icon: '🫧', mult: 2.5, w: 4 },
  glow: { label: '夜光', icon: '💡', mult: 2.5, w: 4 },
  giant: { label: '巨型', icon: '🐳', mult: 2, w: 6 },
  mini: { label: '迷你', icon: '🤏', mult: 1.5, w: 6 },
  pastel: { label: '马卡龙', icon: '🍬', mult: 1.5, w: 9 },
  neon: { label: '霓虹', icon: '🌆', mult: 2, w: 6 },
};

function pickW(list, wf) { let s = 0; for (const x of list) s += wf(x); let r = Math.random() * s; for (const x of list) { r -= wf(x); if (r <= 0) return x; } return list[list.length - 1]; }

// luck: 0~1（幸运饵/保底/鱼潮）—— 越高越偏向稀有
// v1.1 itemP：这一杆钓到道具漂流物的概率（玩家 0.2，好友 0）；item：强制道具 id（测试 / ?item=）
export function rollCatch({ luck = 0, forceMinRarity = null, maxRarity = null, featured = null, allowOdd = true, force = null, itemP = 0, item = null, itemLuck = 0 } = {}) {
  let sp;
  if (!force && (item || (itemP > 0 && Math.random() < itemP))) {
    const got = rollItemCatch(Math.random, { p: 1, luck: itemLuck, force: item });
    const v = makeVariant(SPECIES_BY_ID[got.pod]);
    v.item = { id: got.id, n: got.n }; v.nick = ITEM_BY_ID[got.id].name; v.creator = '大海';
    return v;
  }
  if (force && SPECIES_BY_ID[force]) sp = SPECIES_BY_ID[force];
  else {
    const minIdx = forceMinRarity ? RARITY_ORDER.indexOf(forceMinRarity) : 0;
    const maxIdx = maxRarity ? RARITY_ORDER.indexOf(maxRarity) : 9;
    const pool = SPECIES.filter((s) => RARITY_ORDER.indexOf(s.rarity) >= minIdx && RARITY_ORDER.indexOf(s.rarity) <= maxIdx).concat(allowOdd && minIdx < 3 ? ODDITIES.filter((s) => RARITY_ORDER.indexOf(s.rarity) <= maxIdx) : []);
    sp = pickW(pool, (s) => {
      const ri = RARITY_ORDER.indexOf(s.rarity);
      let w = s.w * Math.pow(1 + luck * 2.2, ri);
      if (featured && s.id === featured) w *= 3;
      return w;
    });
  }
  return makeVariant(sp, luck);
}

export function makeVariant(sp, luck = 0) {
  const v = { sp: sp.id, id: newSeed().toString(36) + Date.now().toString(36).slice(-4), creator: CREATORS[(Math.random() * CREATORS.length) | 0], traits: [], hue: 0, sat: 1, light: 1 };
  if (!sp.odd) {
    v.hue = (Math.random() - 0.5) * 0.16; v.sat = 0.9 + Math.random() * 0.35; v.light = 0.92 + Math.random() * 0.16;
    if (Math.random() < 0.42 + luck * 0.3) v.traits.push(pickW(Object.keys(TRAITS), (k) => TRAITS[k].w));
    if (Math.random() < 0.08 + luck * 0.1) { const t2 = pickW(Object.keys(TRAITS), (k) => TRAITS[k].w); if (!v.traits.includes(t2) && !(t2 === 'mini' && v.traits.includes('giant')) && !(t2 === 'giant' && v.traits.includes('mini'))) v.traits.push(t2); }
    // UGC：种子 → 独一无二的花纹 / 配色 / 装饰 / 作品名
    v.seed = newSeed();
    v.ugc = ugcFromSeed(v.seed, sp.id);
    v.title = v.ugc.title;
    // v1.0 派对基因（§5）：35% 自带部件 / 15% 特殊材质 / 大萌眼 / 夸张拉伸 / 搞怪名字
    v.gx = wildGx(sp.id);
    v.nick = funnyName(sp.name, v.gx, v.ugc.decos, Math.random, null);
    if (v.nick === sp.name) v.nick = `${ADJ[(Math.random() * ADJ.length) | 0]}${sp.name}`;
  } else {
    v.nick = sp.name;
    if (sp.id === 'bottle') v.note = BOTTLE_NOTES[(Math.random() * BOTTLE_NOTES.length) | 0];
  }
  let sizeK = 0.8 + Math.random() * 0.45;
  if (v.traits.includes('giant')) sizeK *= 1.6;
  if (v.traits.includes('mini')) sizeK *= 0.5;
  v.cm = Math.round(sp.cm * sizeK * 10) / 10;
  // r3：旧公式先取整再 /10，小鱼一律显示 0.05kg（24cm 蓝吊鱼 = 0.05kg）→ 1kg 以下保留两位小数并给个体积下限
  const kgRaw = sp.kgm * (v.cm / 100) * (v.cm / 100) * (sp.cm / 100) * sizeK;
  v.kg = kgRaw >= 1 ? Math.round(kgRaw * 10) / 10 : Math.max(0.02, Math.round(Math.max(kgRaw, Math.pow(v.cm / 100, 3) * 20) * 100) / 100);
  v.sizeK = sizeK;
  v.uid = v.id; v.gen = 0; v.mut = null;
  return v;
}
// v1.0：个体稀有度（改造/变异可升级）；缺省 = 物种稀有度
export function rarityOf(v) { return (v && v.rarity && RARITY[v.rarity]) ? v.rarity : SPECIES_BY_ID[v?.sp]?.rarity || 'common'; }

// 旧存档（v0.5 及以前）没有 seed：用 sp+cm 派生一个稳定种子，保证图鉴里每次看到的样子一致
export function ensureUgc(v) {
  if (!v || SPECIES_BY_ID[v.sp]?.odd || v.ugc) return v;
  if (v.seed == null) { let h = 2166136261; for (const ch of `${v.sp}|${v.cm}|${v.creator}|${v.nick}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); v.seed = h >>> 0; }
  v.ugc = ugcFromSeed(v.seed, v.sp, v.acc || null); v.title = v.ugc.title;
  return v;
}
export function variantMult(v) { return v.traits.reduce((m, t) => m * TRAITS[t].mult, 1) * (1 + 0.15 * (v.ugc?.decos?.length || 0)); }
export function scoreOf(v, { frenzy = false, combo = 0, first = false } = {}) {
  const sp = SPECIES_BY_ID[v.sp];
  const base = RARITY[rarityOf(v) || sp.rarity].pts * (0.7 + 0.3 * Math.min(v.sizeK, 2)) * variantMult(v);
  return Math.round(base * (frenzy ? 1.5 : 1) * (1 + Math.min(combo, 10) * 0.1) + (first ? 100 : 0));
}
export function traitText(v) { return v.traits.map((t) => TRAITS[t].icon + TRAITS[t].label).concat(v.ugc?.decos?.length ? [decoText(v.ugc)] : []).join(' · '); }
export function displayName(v) { const sp = SPECIES_BY_ID[v.sp]; return sp.odd ? sp.name : v.nick; }

// ---------------- 3D 模型 ----------------
const raycaster = new THREE.Raycaster();
function oddModel(id) {
  const g = new THREE.Group();
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  if (id === 'pod_shell') {   // v1.1 道具贝壳包：粉色扇贝 + 一颗发光珍珠 + 丝带
    const shellM = std('#ffb3cf', { roughness: 0.35 }), inM = std('#fff0f5', { roughness: 0.3 });
    const half = (up) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), up ? shellM : inM); m.scale.set(1, 0.35, 0.85); if (!up) m.rotation.x = Math.PI; return m; };
    const top = half(true); top.position.set(-0.05, 0.12, 0); top.rotation.z = 0.45; g.add(top); g.add(half(false));
    for (let i = -3; i <= 3; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.0), std('#ff8fb8')); rib.position.set(i * 0.15, 0.2, 0); rib.rotation.y = i * 0.18; top.add(rib); }
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), std('#fffbe8', { emissive: '#ffe08a', emissiveIntensity: 0.9, roughness: 0.15 })); pearl.position.set(0.12, 0.12, 0); g.add(pearl);
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 14), std('#7b5cff')); ribbon.position.set(-0.45, 0.1, 0.35); g.add(ribbon);
  } else if (id === 'bottle' || id === 'pod_bottle') {
    const glass = new THREE.MeshPhysicalMaterial({ color: '#9fe3d0', roughness: 0.08, transmission: 0.0, transparent: true, opacity: 0.55 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 8, 16), glass); body.rotation.z = Math.PI / 2; g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.3, 14), glass); neck.rotation.z = -Math.PI / 2; neck.position.x = 0.75; g.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.14, 12), std('#b88454', { roughness: 0.9 })); cork.rotation.z = -Math.PI / 2; cork.position.x = 0.95; g.add(cork);
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 12), std('#fff4d8', { roughness: 0.9 })); paper.rotation.z = Math.PI / 2; g.add(paper);
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.02, 6, 16), std('#ff6b7a')); ribbon.rotation.y = Math.PI / 2; g.add(ribbon);
  } else if (id === 'duck') {
    const y = std('#ffd84a', { roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), y); body.scale.set(1.25, 0.85, 0.95); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), y); head.position.set(0.45, 0.52, 0); g.add(head);
    const beak = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10), std('#ff8a3d')); beak.scale.set(1.4, 0.5, 1); beak.position.set(0.76, 0.46, 0); g.add(beak);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), std('#222')); e.position.set(0.66, 0.62, s * 0.18); g.add(e); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 12), y); tail.rotation.z = Math.PI / 2 + 0.6; tail.position.set(-0.62, 0.2, 0); g.add(tail);
  } else {
    const wood = std('#b9773e', { roughness: 0.8 }), gold = std('#ffcf4a', { metalness: 0.7, roughness: 0.3 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.75), wood); g.add(box);
    // v4：箱盖挂在后缘铰链上（现场开箱时 main.js 把 userData.chestLid 绕 x 轴掀开），箱内一堆金币
    const hinge = new THREE.Group(); hinge.position.set(0, 0.3, -0.375); g.add(hinge); g.userData.chestLid = hinge;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.375, 0.375, 1.2, 20, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.rotation.x = Math.PI / 2; lid.position.set(0, 0, 0.375); hinge.add(lid);
    for (const x of [-0.45, 0.45]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.78), gold); b.position.set(x, 0, 0); g.add(b);
      const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.08, 20, 1, false, 0, Math.PI), gold); lb.rotation.z = Math.PI / 2; lb.rotation.x = Math.PI / 2; lb.position.set(x, 0, 0.375); hinge.add(lb);
    }
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14), gold); c.position.set(-0.36 + (i % 5) * 0.18, 0.29 + (i > 4 ? 0.04 : 0), -0.15 + (i % 3) * 0.14); c.rotation.set(0.3 * (i % 3) - 0.3, 0, 0.25 * (i % 2)); g.add(c); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), gold); lock.position.set(0, 0.22, 0.4); g.add(lock);
    const glowM = std('#fff2a8', { emissive: '#ffd34a', emissiveIntensity: 1.2 });
    const glint = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.04, 0.6), glowM); glint.position.y = 0.32; g.add(glint);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  const box = new THREE.Box3().setFromObject(g), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = 1.6 / Math.max(sz.x, sz.z);
  const wrap = new THREE.Group(); g.scale.setScalar(k); g.position.copy(c).multiplyScalar(-k); wrap.add(g);
  if (g.userData.chestLid) wrap.userData.chestLid = g.userData.chestLid;
  return wrap;
}

const _hsl = { h: 0, s: 0, l: 0 };
// 描边开关（inverted hull）：若阶段 2 改用后处理描边，置 FISH_STYLE.outline = false 即可
export const FISH_STYLE = { outline: false };   // v1.0 渲染回退：恢复 v0.9 无描边风格
const NO_OUTLINE = /eye|pupil|glint|gill|mouth|nostril|sucker|stripe|lips|smile|palette|band/;
export class Fish {
  constructor(v, stylize) {
    this.v = ensureUgc(v);
    this.sp = SPECIES_BY_ID[v.sp];
    this.gx = !this.sp.odd && v.gx ? normGx(v.gx) : null;   // 旧存档无 gx → 原样渲染
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.model = this.sp.odd ? oddModel(this.sp.id) : createMarineModel(this.sp.id, v.cm);
    this.body.add(this.model);
    const gx = this.gx;
    // 融合：嫁接另一物种的尾巴（在材质克隆前，保证一起被风格化/上花纹）
    if (gx?.parts?.tail && gx.parts.tail !== v.sp && SPECIES_BY_ID[gx.parts.tail] && !SPECIES_BY_ID[gx.parts.tail].odd) graftTail(this.model, gx.parts.tail);
    this.mats = [];
    const seen = new Set();
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      if (!seen.has(o.material)) { seen.add(o.material); this.mats.push(o.material); }
    });
    for (const m of this.mats) { m.userData.base = m.color.clone(); }
    stylize?.(this.model);
    if (gx) {
      tuneEyes(this.model, gx.eyeK);
      const s = gx.stretch; this.model.scale.set(s[0], s[1], s[2]);
    }
    this.applyVariant();
    if (gx && (gx.mat || gx.glow > 0)) applyMat(this.model, gx.mat, gx.glow);
    // v3：写实风格化皮肤（鳞片法线/清漆/虹彩/鳍条透光）+ 脊柱行波游动 —— 链在所有材质注入之后
    this.swim = this.sp.odd ? null : skinFish(this);
    // 归一化尺寸：模型最长水平维度 1.6 —— 以"米"为单位缩放到 1
    this.model.scale.multiplyScalar(1 / 1.6);
    this.realLen = v.cm / 100;
    this.computeBounds();
    this.decoAnims = [];
    this.extraAnims = [];
    if (gx && !this.sp.odd) this.addGx(gx, stylize);
    if (v.ugc && !this.sp.odd) this.addDecos(v.ugc);
    // 描边：阶段 1 的 C（toon.js）已在 stylize 里给鱼加 inverted hull；若 stylize 没加（旧 toon / 无 stylize），用 parts.js 的备用描边
    const hull = hasHull(this.model);
    if (hull || !FISH_STYLE.outline) { if (this.decos) stylize?.(this.decos); }
    else if (!this.sp.odd) this.addOutlines();
    stripHullOnTransparent(this.body);
    this.collectFollowers();
    this.t = Math.random() * 10;
    this.shake = 0; this.burst = 0; this.burstCd = 1;
    this.setScale(1);
  }
  // 当前生效的花纹参数：gx.palette / gx.pattern 覆盖 ugc
  effUgc() {
    const u = this.v.ugc; if (!u) return u;
    const gx = this.gx;
    // v3 柔和配色：野生鱼以物种真实配色为底，花纹只做"适度变化"（换色相弱、图案淡）
    if (!gx || (!gx.palette && gx.pattern == null)) return { ...u, tint: u.tint * 0.4, amt: u.amt * 0.62 };
    const o = { ...u, tint: u.tint * 0.6, amt: u.amt * 0.8 };
    if (Array.isArray(gx.palette) && gx.palette.length >= 3) { o.c = gx.palette.slice(0, 3); o.tint = Math.max(u.tint, 0.36); o.amt = Math.max(u.amt, 0.78); }
    if (gx.pattern != null) { o.pat = gx.pattern; if (gx.pattern >= 13) o.den = 2.6; }
    return o;
  }
  applyVariant() {
    const v = this.v, tr = v.traits;
    for (const m of this.mats) {
      const c = m.userData.base.clone();
      c.getHSL(_hsl);
      let h = _hsl.h + v.hue, s = Math.min(1, _hsl.s * v.sat), l = Math.min(0.95, _hsl.l * v.light);
      if (tr.includes('pastel')) { s *= 0.55; l = l * 0.6 + 0.38; }
      if (tr.includes('neon')) { s = Math.min(0.72, s * 1.15 + 0.06); h += 0.45; }   // v3：霓虹不再荧光
      c.setHSL(((h % 1) + 1) % 1, s, l);
      if (tr.includes('gold')) { c.lerp(new THREE.Color('#e0b65a'), 0.6); m.metalness = 0.7; m.roughness = 0.32; }
      m.color.copy(c);
      if (tr.includes('jelly') && !this.gx?.mat) { m.transparent = true; m.opacity = 0.62; m.depthWrite = true; m.roughness = 0.1; }
      if (tr.includes('glow') || tr.includes('neon')) { m.emissive = c.clone(); m.emissiveIntensity = tr.includes('glow') ? 0.45 : 0.18; }
      m.userData.cur = c.clone();
    }
    this.rainbow = tr.includes('rainbow') && !this.gx?.mat;
    if (v.ugc && !this.sp.odd) applyPattern(this.model, this.effUgc());
  }
  computeBounds() {
    this.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(this.model);
    this.b0 = b; // 单位长度（≈1m）下
    this.len0 = Math.max(b.max.x - b.min.x, 0.01);
    this.h0 = b.max.y - b.min.y; this.w0 = b.max.z - b.min.z;
    this.belly0 = -b.min.y; this.noseX0 = b.max.x;
  }
  // v1.0 基因外观：额外眼睛 + 代码生成部件
  addGx(gx, stylize) {
    const A = this.anchors = anchorsPlus(this);
    this.gxGroup = new THREE.Group(); this.gxGroup.name = 'gx-extras'; this.body.add(this.gxGroup);
    const u = this.effUgc();
    const pal = u?.c || ['#ffffff', '#ff7fb0', '#ffd23f'];
    const seed = (this.v.seed || 1) >>> 0;
    // 眼睛数量：1 = 独眼巨萌眼；3~5 = 额头再长 n-2 只
    const er = A.eyes.length ? A.eyes.reduce((s, e) => s + e.r, 0) / A.eyes.length : A.S * 0.12;
    if (gx.eyes === 1) {
      this.model.traverse((o) => { if (o.isMesh && /^eye/.test(o.name) && !/stalk/.test(o.name)) o.visible = false; });
      const R = THREE.MathUtils.clamp(er * 1.9, A.S * 0.22, A.S * 0.42);
      const e = cartoonEye(R);
      const x = (A.eyes.length ? A.eyes[0].p.x : A.headTop.x + A.S * 0.1);
      const hit = A.ray(new THREE.Vector3(x + R * 0.6, A.headTop.y + 2, 0), new THREE.Vector3(0, -1, 0));
      const p = hit ? hit.point : A.headTop;
      e.position.copy(p).add(new THREE.Vector3(0, R * 0.25, 0)); e.rotation.y = Math.PI / 2; e.rotation.x = 0; e.rotation.z = 0;
      e.lookAt(e.position.clone().add(new THREE.Vector3(1, 0.35, 0)));
      this.gxGroup.add(e); this.extraAnims.push((t) => { const bl = Math.max(0, Math.sin(t * 0.9)) ** 30; e.scale.set(1, 1 - bl * 0.85, 1); });
    } else if (gx.eyes >= 3) {
      const n = gx.eyes - 2, R = THREE.MathUtils.clamp(er * 0.85, A.S * 0.08, A.S * 0.2);
      for (let i = 0; i < n; i++) {
        const z = n === 1 ? 0 : THREE.MathUtils.lerp(-1, 1, i / (n - 1)) * Math.min(A.headW * 0.6, A.S * 0.35);
        const x = A.headTop.x + A.S * 0.02 - Math.abs(z) * 0.3;
        const hit = A.ray(new THREE.Vector3(x, A.headTop.y + 2, z), new THREE.Vector3(0, -1, 0));
        if (!hit) continue;
        const nrm = A.nrm(hit);
        const e = cartoonEye(R); e.position.copy(hit.point).addScaledVector(nrm, R * 0.35);
        e.lookAt(e.position.clone().add(nrm.clone().multiplyScalar(0.6).add(new THREE.Vector3(0.8, 0, z * 2))));
        this.gxGroup.add(e);
        const ph = i * 1.7; this.extraAnims.push((t) => { e.userData.pupil.rotation.y = Math.sin(t * 1.1 + ph) * 0.3; const bl = Math.max(0, Math.sin(t * 0.7 + ph)) ** 40; e.scale.set(1, 1 - bl * 0.85, 1); });
      }
    }
    gx.extras.forEach((k, i) => {
      if (!extraOk(k, this.sp.id) && !(k === 'extraEyes')) return;
      try {
        const d = buildExtra(k, A, (seed + i * 7919) >>> 0, { pal });
        this.gxGroup.add(d.group);
        if (d.anim) { d.anim(0); this.extraAnims.push(d.anim); }
      } catch (e) { console.warn('[gx] extra', k, e); }
    });
    stylize?.(this.gxGroup);
    this.root.updateMatrixWorld(true);
    this.bAll = new THREE.Box3().setFromObject(this.body);
  }
  addOutlines() {
    this.model.traverse((o) => {
      if (!o.isMesh || !o.visible || NO_OUTLINE.test(o.name) || o.userData.outline) return;
      if (o.material.transparent) return;
      o.geometry.computeBoundingSphere?.();
      addOutline(o);
    });
    if (this.gxGroup) outlineGroup(this.gxGroup);
    if (this.decos) outlineGroup(this.decos);
  }
  addDecos(u) {
    if (!u.decos?.length) return;
    const A = findAnchors(this);
    this.decos = new THREE.Group(); this.decos.name = 'ugc-decos'; this.body.add(this.decos);
    u.decos.forEach((k, i) => {
      if (!DECOS[k]) return;
      // 与 gx 部件冲突的头饰跳过（如螺旋桨帽 + 礼帽）
      if (this.gx && DECOS[k].slot === 'head' && this.gx.extras.some((e) => ['propeller', 'horn', 'catEars', 'antlers', 'lightbulb', 'bubbleHelmet', 'extraEyes'].includes(e))) return;
      if (this.gx && k === 'shades' && (this.gx.eyes !== 2 || this.gx.extras.includes('bubbleHelmet'))) return;
      const d = buildDeco(k, A, (u.seed + i * 977) >>> 0);
      this.decos.add(d.group);
      if (d.anim) this.decoAnims.push(d.anim);
    });
  }
  // 显示长度（米）
  setScale(L) {
    this.dispLen = L;
    const k = L / this.len0;
    this.root.scale.setScalar(k);
    this.len = L; this.h = this.h0 * k; this.w = this.w0 * k; this.belly = this.belly0 * k;
  }
  // 通用抱鱼尺寸规则：最长水平跨度 = L（横在胸前），体高上限随体长放宽（翻车鱼这类"高个子"自动缩小，避免挡脸）
  // 螃蟹 / 蝠鲼这类"横向更宽"的生物，转 90° 让宽边横在胸前
  holdFit(L) {
    const span0 = Math.max(this.len0, this.w0);
    // v1.0：抱鱼整体放大（0.75~2.8m）→ 高度上限 0.44 起，随 L 放宽到 ~0.7m（rig 会让超出 0.42 的部分下沉）
    const cap = 0.44 + THREE.MathUtils.clamp(L - 0.8, 0, 1.4) * 0.19;
    // D：按尺寸/体型选抱姿 —— hug 双手抱（<1.5m）/ cradle 横抱（细长大鱼）/ yoke 扛在肩上（高身大鱼 & 巨型变异，鱼在头后，不挡脸，可以更大）
    const giant = (this.v.mut && String(this.v.mut).includes('giant')) || (this.v.gx && this.v.gx.scale >= 1.8);
    const hAtL = this.h0 * (L / span0);
    this.pose = L < 1.5 && !giant ? 'hug' : 'yoke';   // 走查：横抱(cradle)对 1.5m+ 的鱼仍会让鱼背挡下巴、镜头装不下 → 1.5m+ 一律举过头顶（cradle 保留在 rig 里备用）
    const capP = this.pose === 'yoke' ? 0.8 + THREE.MathUtils.clamp(L - 1.5, 0, 1.3) * 0.4 : cap;
    const k = Math.min(L / span0, capP / Math.max(this.h0, 0.01));
    this.root.scale.setScalar(k);
    this.wide = this.w0 > this.len0 * 1.05;
    this.span = span0 * k; this.depth = Math.min(this.len0, this.w0) * k;
    this.h = this.h0 * k; this.belly = this.belly0 * k; this.len = this.span; this.w = this.depth;
    return k;
  }
  // 水族箱缩放：保持物种/个体大小差（单调），最小的也看得清（≥0.42·maxLen），最大的不撑爆缸（含部件的总跨度 ≤ maxLen，高 ≤ 0.8·maxLen）
  // 返回 { len, h, w, k }（含部件包围盒的实际尺寸，单位同 maxLen）
  fitTank(maxLen = 1) {
    const t = THREE.MathUtils.clamp((holdLength(this.v) - 0.75) / (2.8 - 0.75), 0, 1);
    const target = maxLen * (0.42 + 0.58 * Math.sqrt(t));
    const b = this.bAll || this.b0;
    const h0 = Math.max(b.max.y - b.min.y, 0.01);
    // v4.1：竖直体型（海马 / 水母）按身高算"体长"，否则 20cm 的海马会按细窄的水平跨度放大成全缸最高
    const span0 = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, VERT_SP[this.v.sp] ? h0 : 0, 0.01);
    const k = Math.min(target / span0, (maxLen * 0.8) / h0);
    this.root.scale.setScalar(k);
    this.len = (b.max.x - b.min.x) * k; this.h = h0 * k; this.w = (b.max.z - b.min.z) * k; this.belly = -b.min.y * k;
    this.tankK = k;
    // v4.1：同步 dispLen（= 当前缩放下的标准体长）。aquarium.fitFish 的「体高 > 1.15 再等比缩小」用 dispLen * 1.15 / h，
    // 原先 dispLen 停留在构造时的 1 → 高背鳍物种（虎鲸 / 旗鱼 / 翻车鱼 / 金枪鱼…）在水族箱里被缩成 ~0.7，比小丑鱼还小
    this.dispLen = this.len0 * k;
    return { len: this.len, h: this.h, w: this.w, k };
  }
  // 装饰物 / 基因部件跟随身体形变：记录每个挂件的静止位置（模型空间 x → 行波位移）
  collectFollowers() {
    this.followers = [];
    if (!this.swim) return;
    const add = (o, depth = 0) => {
      if (o.position.lengthSq() < 1e-10 && o.children.length && depth < 2) { o.children.forEach((c) => add(c, depth + 1)); return; }
      this.followers.push({ o, x: o.position.x, z: o.position.z, ry: o.rotation.y, parentAtOrigin: depth > 0 });
    };
    for (const g of [this.decos, this.gxGroup]) if (g) g.children.forEach((c) => add(c));
  }
  // v3 动画 API：fish.animate(dt, { speed = 1, turn = 0, mode = 'swim'|'hold'|'struggle' })
  // 兼容旧调用 fish.animate(dt) / fish.animate(dt, speedNumber)：
  //   数字参数 = 时间倍率（旧语义），游动速度自动从 root 的位移/转向估算（水族箱不用改代码就有快慢/转弯）
  animate(dt, opt = 1) {
    let speed = 1, turn = 0, mode = 'swim', tk = 1, auto = true;
    if (typeof opt === 'number') tk = opt;
    else if (opt) { speed = opt.speed ?? 1; turn = opt.turn ?? 0; mode = opt.mode || 'swim'; auto = opt.speed == null && mode === 'swim'; tk = opt.timeScale ?? 1; }
    this.t += dt * tk;
    // 自动估算：体长/秒 & 偏航角速度
    if (auto && dt > 0) {
      const p = this.root.position, ry = this.root.rotation.y;
      if (this._lp) {
        const v = p.distanceTo(this._lp) / dt / Math.max(this.len || 1, 0.05);
        let dy = ry - this._ly; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const a = 1 - Math.exp(-dt * 3);
        this._as = (this._as ?? 1) + ((v > 4 ? 1 : 0.75 + Math.min(v, 2.5) * 0.45) - (this._as ?? 1)) * a;
        this._at = (this._at ?? 0) + (THREE.MathUtils.clamp(-dy / dt * 0.6, -1, 1) - (this._at ?? 0)) * a;
      }
      (this._lp ||= new THREE.Vector3()).copy(p); this._ly = ry;
      speed *= this._as ?? 1; if (!turn) turn = this._at ?? 0;
    }
    if (typeof opt === 'number' && opt > 1.05) { mode = opt > 1.9 ? 'struggle' : mode; speed *= opt; }
    // 抱鱼挣扎节律（update('held') 与 animate({mode:'hold'}) 共用）
    if (mode === 'hold' && !this._burstByUpdate && dt > 0) this.tickBurst(dt);
    const finK = mode === 'hold' ? 1.6 + this.burst * 1.5 : mode === 'struggle' ? 2.0 : 0.8 + 0.4 * Math.min(speed, 2);
    this.ft = (this.ft ?? this.t) + dt * tk * finK;
    if (!this.sp.odd) animateMarineModel(this.model, this.ft * 1.4);
    if (this.swim) {
      stepSwim(this.swim, dt * tk, { speed, turn, mode, burst: this.burst, t: this.t });
      const ws = this.model.matrixWorld.elements; this.swim.U.uSk2.value.x = Math.hypot(ws[0], ws[1], ws[2]) || 1;
      const ms = this.model.scale;
      for (const F of this.followers) {
        const d = this.swim.disp(F.x / (ms.x || 1));
        F.o.position.z = F.z + d.z * ms.z;
        F.o.rotation.y = F.ry - d.yaw * (ms.z / (ms.x || 1));
      }
    }
    for (const f of this.decoAnims) f(this.t);
    for (const f of this.extraAnims) f(this.t);
    MAT_TIME.value = (performance.now() / 1000) % 1000;
    if (this.rainbow) { const h = (performance.now() / 3000) % 1; this.mats.forEach((m, i) => { m.color.setHSL((h + i * 0.07) % 1, 0.45, 0.62); if (m.emissive) m.emissive.copy(m.color).multiplyScalar(0.15); }); }
  }
  // 设定游动相位（测试页逐帧截图用）
  setSwimTime(t, opts) { if (opts?.burst != null) this.burst = opts.burst; this.t = t; this.ft = t; const S = this.swim; if (S) { S.amp = S.sw.amp; S.hz = S.sw.hz; S.ph = t * S.sw.hz * Math.PI * 2; } this.animate(0, opts); }
  tickBurst(dt) {
    this.burstCd -= dt;
    if (this.burstCd <= 0) { this.burst = 1; this.burstCd = 1.2 + Math.random() * 2.2; this.onFlop?.(); }
    this.burst = Math.max(0, this.burst - dt * 1.6);
  }
  update(dt, mode = 'swim') {
    // mode: swim（水中游）/ fight（挣扎）/ air（离水翻腾）/ held（抱在手里扑腾）
    const intense = mode === 'fight' ? 1.6 : mode === 'air' ? 2.2 : mode === 'held' ? 1.2 + this.burst * 2 : 1;
    const amode = mode === 'held' ? 'hold' : (mode === 'fight' || mode === 'air') ? 'struggle' : 'swim';
    if (mode === 'held') { this._burstByUpdate = true; this.tickBurst(dt); }
    this.animate(dt, amode === 'swim' ? { mode: 'swim' } : { mode: amode, speed: intense, timeScale: amode === 'hold' ? 1.0 : 1.2 });
    this._burstByUpdate = false;
    if (mode === 'held') {
      const k = 0.35 + this.burst;
      const t = this.t, f = 10;
      // v3：身体弯曲交给脊柱行波（C 形甩尾），整体旋转减弱，避免"整块僵硬地抖"
      this.body.rotation.y = Math.sin(t * f) * 0.06 * k;
      this.body.rotation.x = Math.sin(t * f * 0.6) * 0.08 * k;
      this.body.rotation.z = Math.sin(t * f * 0.45 + 1) * 0.1 * k;
      this.body.position.y = Math.abs(Math.sin(t * f * 0.5)) * 0.03 * k;
    } else if (mode === 'air' || mode === 'fight') {
      this.body.rotation.y = Math.sin(this.t * 14) * 0.18;
      this.body.rotation.z = Math.sin(this.t * 9) * 0.22;
    } else { this.body.rotation.set(0, Math.sin(this.t * 3) * 0.04, 0); this.body.position.y = 0; }
  }
  dispose() {
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.userData.shared && !o.userData.sharedGeo) o.geometry.dispose();
      // v1.3 perf：材质不再 dispose —— material.dispose() 会让 three 释放 program（引用计数归零即 deleteProgram），
      // 下一条同物种/同变体的鱼（玩家 / 好友每次出水、缩略图）就要重新同步编译着色器 → 卡顿。
      // 鱼材质不持有纹理，JS 对象随鱼一起被 GC；program 数量受变体组合上限约束（实测几十个）。
    });
  }
}

// 鱼在手里的展示长度（v1.0 放大）：对数单调映射 —— 小鱼 ≈0.75m、中鱼 1.0–1.3、大鱼 1.6–2.0；巨型变异 2.2–2.8
export function holdLength(v) {
  const sp = SPECIES_BY_ID[v.sp];
  const curve = (cm) => { const t = THREE.MathUtils.clamp(Math.log(Math.max(cm, 8) / 12) / Math.log(650 / 12), 0, 1); return 0.75 + 1.25 * Math.pow(t, 1.3); };
  const giant = (v.mut && String(v.mut).includes('giant')) || (v.gx && v.gx.scale >= 1.8);
  if (giant) {
    const base = sp && !sp.odd ? sp.cm : v.cm / Math.max(v.gx?.scale || 2, 1);
    return THREE.MathUtils.clamp(2.2 + 0.6 * (curve(base) - 0.75) / 1.25, 2.2, 2.8);
  }
  if (sp?.odd) return THREE.MathUtils.clamp(0.55 + v.cm / 100 * 0.6, 0.55, 0.85);
  return THREE.MathUtils.clamp(curve(v.cm), 0.7, 2.0);
}
