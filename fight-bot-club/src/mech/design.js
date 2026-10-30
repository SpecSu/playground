// 提示词 → 机甲设计规格（纯数据，可序列化 / 可复现）
// 关键词决定倾向（定位 / 武器 / 配色 / 造型母题），随机种子决定具体组合与数值；同一提示词每次生成都不同
import { mulberry32, hashStr, clamp } from '../core/util.js';

const has = (p, words) => words.some((w) => p.includes(w));
const score = (p, words) => words.reduce((s, w) => s + (p.includes(w) ? 1 : 0), 0);

const ROLE_KW = {
  tank: ['坦克', '重装', '堡垒', '厚', '盾', '装甲', '重型', '巨', '铁壁', '要塞', '熊', '犀', '龟', '泰坦', '城墙', '守护', 'tank', 'heavy', 'fortress', 'shield', 'armor', 'titan', 'golem', '傀儡'],
  assassin: ['刺客', '敏捷', '忍', '快', '迅', '闪', '影', '幽灵', '豹', '狐', '蜂', '螳螂', '隼', '鹰', '隐', '疾', '风', '轻', 'ninja', 'assassin', 'fast', 'agile', 'shadow', 'speed', 'swift', 'ghost'],
  gunner: ['远程', '狙', '火力', '炮', '枪', '导弹', '射手', '炮台', '激光', '火箭', '机枪', '加特林', '弹幕', 'gun', 'sniper', 'cannon', 'missile', 'artillery', 'laser', 'rocket', 'turret'],
  brawler: ['挖掘', '工程', '拳击', '摔跤', '莽', '拳', '狂', '暴', '野蛮', '格斗', '角斗', '斗士', '蛮', '牛', '猩', '恐龙', '霸王', '拳击', '摔跤', '野兽', '怒', '肌肉', 'brawler', 'berserk', 'punch', 'boxer', 'beast', 'rage', 'gorilla'],
};
const SPECIAL_KW = {
  chainsaw: ['电锯', '锯', 'chainsaw', 'saw'],
  flame: ['火', '焰', '喷火', '燃', '熔岩', '岩浆', '龙', 'flame', 'fire', 'lava', 'dragon', 'inferno', '炎'],
  laser: ['激光', '光束', '镭射', '等离子', '粒子', 'laser', 'beam', 'plasma', '光'],
  cannon: ['火炮', '大炮', '炮', '榴弹', 'cannon', 'artillery', 'howitzer'],
  missile: ['导弹', '火箭', '飞弹', 'missile', 'rocket'],
  drill: ['钻', 'drill'],
  elec: ['电', '雷', '闪电', '磁', 'thunder', 'lightning', 'electric', 'tesla', '霆'],
  shock: ['震', '地震', '锤', '砸', '践踏', 'quake', 'hammer', 'stomp'],
  charge: ['冲撞', '撞', '冲锋', '犀', '公牛', '蛮牛', '火车', 'ram', 'charge', 'bull'],
};
const MAIN_KW = {
  blade: ['剑', '刀', '斩', '武士', '刃', '镰', 'sword', 'blade', 'katana', 'samurai', 'scythe'],
  hammer: ['锤', '槌', 'hammer', 'mace'],
  claw: ['爪', '钳', '蟹', '龙虾', '蝎', 'claw', 'pincer'],
  gatling: ['机枪', '加特林', '速射', '弹幕', 'gatling', 'minigun'],
  blaster: ['激光枪', '能量', '脉冲', '光枪', 'blaster', 'pulse'],
  cannon: ['炮', 'cannon'],
  fist: ['拳', '铁拳', 'fist', 'punch', '拳击'],
};
const STYLE_KW = {
  racing: ['赛车', '跑车', '竞速', 'racing', 'f1'],
  military: ['军', '迷彩', '战术', '陆战', 'military', 'army', 'camo', '特种'],
  neon: ['赛博', '霓虹', '朋克', 'cyber', 'neon', '电竞', '未来'],
  chrome: ['银', '铬', '镜面', '液态金属', 'chrome', 'silver', 'mirror'],
  royal: ['皇', '王', '圣', '骑士', '天使', '神', 'royal', 'king', 'holy', 'paladin', 'knight'],
  hazard: ['工业', '工程', '挖掘', '矿', '施工', '警示', 'industrial', 'construction', 'mining'],
  candy: ['可爱', '萌', '糖', '甜', '粉', '少女', '泡泡', 'cute', 'candy', 'kawaii', '马卡龙'],
  stealth: ['暗', '黑', '夜', '隐形', '死神', '恶魔', '魔', 'stealth', 'dark', 'night', 'demon', 'reaper'],
  ceramic: ['白', '高达', '战士', '圣洁', 'gundam', 'white', '陶瓷'],
  scrap: ['废土', '锈', '破', '拼装', '垃圾', '蒸汽', '复古', 'scrap', 'rust', 'steam', 'junk', 'retro'],
  toxic: ['毒', '酸', '生化', '变异', '僵尸', 'toxic', 'acid', 'bio', 'zombie'],
  ocean: ['海', '鲨', '深海', '冰', '霜', '雪', '寒', 'ocean', 'shark', 'ice', 'frost', 'snow'],
  lava: ['熔岩', '岩浆', '火山', '地狱', 'lava', 'magma', 'volcano', 'hell'],
  carbon: ['碳纤维', '极简', '机能', '科技', 'carbon', 'minimal', 'tech'],
  gold: ['金', '黄金', '土豪', 'gold', 'golden'],
  dragon: ['中国', '国潮', '龙', '麒麟', '武', '侠', '京剧', 'chinese', 'kungfu'],
};
const COLOR_KW = [
  [['红', '赤', '血', 'red', 'crimson'], 0], [['橙', 'orange'], 26], [['金', '黄', 'gold', 'yellow'], 46],
  [['绿', '翠', '毒', 'green'], 122], [['青', 'cyan', 'teal'], 182], [['蓝', '海', '冰', 'blue'], 214],
  [['紫', 'purple', 'violet'], 276], [['粉', 'pink', 'magenta'], 326],
];
const MOTIF_KW = {
  horns: ['牛', '角', '恶魔', '犀', '鹿', '魔', 'horn', 'demon', 'bull'],
  ears: ['猫', '狐', '兔', '狗', '狼', '喵', 'cat', 'fox', 'bunny', 'dog', 'wolf'],
  fin: ['鲨', '鱼', '鲸', 'shark', 'fin'],
  crown: ['王', '皇', '帝', 'king', 'crown', 'emperor'],
  spikes: ['刺', '尖', '恐龙', '龙', '刺猬', 'spike', 'dino'],
  antenna: ['天线', '雷达', '虫', '蚁', 'antenna', 'radar', 'bug'],
  crest: ['武士', '将军', '骑士', 'samurai', 'knight', '盔'],
};
// 形态原型关键词（命中则强倾向，否则随机分配，人形不再是默认）
const FORM_KW = {
  dog: ['狗', '犬', '狼', '獒', '豹', '狐', '猎犬', '四足', '猫', '虎', '狮', 'dog', 'wolf', 'hound', 'k9', 'beast', 'cat', 'tiger'],
  spider: ['蜘蛛', '蛛', '多足', '蝎', '蟹', '虫', '甲虫', '螳螂', '六足', '八足', 'spider', 'crab', 'insect', 'bug', 'scorpion', 'arachn'],
  hover: ['飞', '悬浮', '无人机', '浮游', '鹰', '隼', '翼', '天空', '空中', '炮台', '卫星', 'drone', 'hover', 'fly', 'sky', 'jet', 'ufo'],
  tank: ['坦克', '重装', '堡垒', '要塞', '战车', '履带', '巨像', '犀', '龟', '象', '泰坦', 'tank', 'fortress', 'walker', 'titan', 'rhino'],
  wraith: ['灵', '幽灵', '能量', '鬼', '魂', '幻影', '虚空', '以太', '星灵', '光之', '神秘', 'ghost', 'spirit', 'wraith', 'energy', 'void', 'phantom', 'ether'],
  humanoid: ['人形', '武士', '骑士', '拳击', '战士', '高达', '机甲战士', '格斗', '忍者', 'knight', 'samurai', 'humanoid', 'gundam', 'ninja'],
};
// 定位 → 形态倾向（无关键词时）
const FORM_BY_ROLE = {
  tank: [['tank', 3.2], ['humanoid', 1.3], ['spider', 1], ['dog', 0.4], ['hover', 0.5], ['wraith', 0.5]],
  assassin: [['dog', 2.4], ['wraith', 2.2], ['spider', 1.8], ['humanoid', 1.2], ['hover', 0.6], ['tank', 0.1]],
  gunner: [['hover', 3], ['tank', 1.6], ['spider', 1.1], ['humanoid', 1], ['wraith', 0.8], ['dog', 0.5]],
  brawler: [['humanoid', 1.8], ['dog', 1.6], ['tank', 1.4], ['spider', 1.2], ['wraith', 1], ['hover', 0.2]],
};
export const FORM_CN = { humanoid: '人形', dog: '机械犬', spider: '多足蛛', hover: '浮游炮', tank: '履带战车', wraith: '能量灵体' };
const TAIL_KW = ['尾', '蝎', '恐龙', '龙', '猫', '狐', 'tail', 'scorpion', 'dino'];

// ———————————————————— 配色：16 套完全不同的配色家族 ————————————————————
function hsl(h, s, l) { return { h: ((h % 360) + 360) % 360, s: clamp(s, 0, 1), l: clamp(l, 0, 1) }; }
export function hslToHex({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + to(f(0)) + to(f(8)) + to(f(4));
}
const SCHEMES = {
  // —— 经典家族（整体降饱和、拉开明度层次，避免“儿童画”感）
  racing: (r, h) => ({ p: hsl(h, r.range(0.55, 0.72), r.range(0.36, 0.44)), s: hsl(h, 0.04, r.range(0.84, 0.9)), a: hsl(0, 0, 0.08), e: hsl(h + r.pick([0, 180, 30]), 1, 0.58), m: hsl(0, 0, 0.5), finish: 'gloss', pattern: r.pick(['stripes', 'split', 'chevron']) }),
  military: (r) => { const base = r.pick([[78, 0.22, 0.3], [38, 0.24, 0.48], [200, 0.07, 0.36], [95, 0.14, 0.26]]); return { p: hsl(base[0], base[1], base[2]), s: hsl(base[0] + 15, base[1] * 0.8, base[2] * 0.7), a: hsl(30, 0.12, 0.15), e: hsl(r.pick([28, 0, 140]), 1, 0.55), m: hsl(40, 0.05, 0.33), finish: 'matte', pattern: r.pick(['camo', 'digital', 'patch']) }; },
  neon: (r, h) => ({ p: hsl(r.pick([230, 260, 280, 200]), 0.3, r.range(0.08, 0.13)), s: hsl(240, 0.16, 0.2), a: hsl(h, 0.85, 0.52), e: hsl(h, 1, 0.6), e2: hsl(h + r.pick([150, 180, 200]), 1, 0.6), m: hsl(220, 0.08, 0.24), finish: 'satin', pattern: r.pick(['circuit', 'stripes', 'circuit']) }),
  chrome: (r, h) => ({ p: hsl(h, 0.04, r.range(0.72, 0.82)), s: hsl(h, 0.06, 0.26), a: hsl(h, r.range(0.5, 0.75), 0.45), e: hsl(h, 1, 0.62), m: hsl(0, 0, 0.78), finish: 'chrome', pattern: 'none' }),
  royal: (r) => ({ p: hsl(42, 0.16, r.range(0.82, 0.88)), s: hsl(40, 0.52, 0.42), a: hsl(r.pick([222, 350, 160]), 0.45, 0.24), e: hsl(r.pick([195, 42]), 0.95, 0.64), m: hsl(40, 0.45, 0.44), finish: 'satin', pattern: r.pick(['split', 'trim', 'trim']), sMetal: true }),
  hazard: (r) => ({ p: hsl(r.range(40, 46), 0.72, 0.45), s: hsl(0, 0, 0.11), a: hsl(20, 0.08, 0.26), e: hsl(r.pick([20, 0]), 1, 0.55), m: hsl(30, 0.06, 0.38), finish: 'satin', pattern: 'hazard', worn: 0.75 }),
  candy: (r) => { const hh = r.pick([350, 140, 262, 205, 18]); return { p: hsl(hh, r.range(0.26, 0.38), r.range(0.62, 0.7)), s: hsl(38, 0.18, 0.88), a: hsl(hh + 180, 0.22, 0.34), e: hsl(hh, 0.9, 0.68), m: hsl(30, 0.08, 0.58), finish: 'satin', pattern: r.pick(['split', 'trim', 'none']) }; },
  stealth: (r) => ({ p: hsl(220, 0.06, r.range(0.07, 0.11)), s: hsl(220, 0.05, 0.18), a: hsl(0, 0, 0.26), e: hsl(r.pick([355, 0, 15, 280]), 1, 0.52), m: hsl(220, 0.05, 0.2), finish: 'matte', pattern: r.pick(['hex', 'none', 'carbon']) }),
  ceramic: (r, h) => ({ p: hsl(40, 0.05, r.range(0.86, 0.92)), s: hsl(h, r.range(0.4, 0.55), 0.36), a: hsl(0, 0, 0.13), e: hsl(r.pick([190, 40, 0]), 1, 0.6), m: hsl(220, 0.05, 0.3), finish: 'satin', pattern: r.pick(['split', 'trim', 'none']) }),
  scrap: (r) => ({ p: hsl(r.range(18, 30), r.range(0.4, 0.52), r.range(0.28, 0.36)), s: hsl(r.range(170, 200), 0.14, 0.34), a: hsl(40, 0.4, 0.4), e: hsl(30, 1, 0.55), m: hsl(25, 0.2, 0.3), finish: 'matte', pattern: r.pick(['patch', 'patch', 'hazard']), worn: 1 }),
  toxic: (r) => ({ p: hsl(r.range(80, 95), 0.14, r.range(0.17, 0.22)), s: hsl(0, 0, 0.1), a: hsl(r.range(75, 90), 0.7, 0.44), e: hsl(r.range(85, 100), 1, 0.55), m: hsl(80, 0.06, 0.25), finish: 'matte', pattern: r.pick(['hazard', 'drip', 'cracks']) }),
  ocean: (r) => ({ p: hsl(r.range(208, 220), 0.42, r.range(0.2, 0.26)), s: hsl(200, 0.08, 0.82), a: hsl(r.range(178, 190), 0.55, 0.42), e: hsl(185, 1, 0.62), m: hsl(210, 0.12, 0.45), finish: 'satin', pattern: r.pick(['wave', 'split', 'trim']) }),
  lava: (r) => ({ p: hsl(r.range(10, 20), 0.12, r.range(0.09, 0.13)), s: hsl(15, 0.2, 0.2), a: hsl(r.range(14, 24), 0.85, 0.45), e: hsl(r.range(16, 28), 1, 0.55), m: hsl(15, 0.1, 0.22), finish: 'matte', pattern: 'cracks' }),
  carbon: (r, h) => ({ p: hsl(0, 0, 0.13), s: hsl(0, 0, 0.42), a: hsl(h, 0.8, 0.5), e: hsl(h, 1, 0.6), m: hsl(0, 0, 0.5), finish: 'satin', pattern: 'carbon' }),
  gold: (r) => ({ p: hsl(r.range(36, 42), 0.5, r.range(0.36, 0.42)), s: hsl(0, 0, 0.09), a: hsl(r.pick([355, 200]), 0.5, 0.3), e: hsl(r.pick([40, 190]), 1, 0.6), m: hsl(40, 0.6, 0.48), finish: 'chrome', pattern: r.pick(['none', 'trim']), pMetal: true }),
  dragon: (r) => ({ p: hsl(r.range(354, 360), 0.6, r.range(0.28, 0.33)), s: hsl(40, 0.5, 0.44), a: hsl(0, 0, 0.07), e: hsl(r.pick([38, 28]), 1, 0.6), m: hsl(40, 0.45, 0.42), finish: 'satin', pattern: r.pick(['cloud', 'trim', 'split']), sMetal: true }),
  duotone: (r, h) => { const h2 = h + r.range(120, 200); return { p: hsl(h, r.range(0.35, 0.55), r.range(0.34, 0.46)), s: hsl(h2, r.range(0.3, 0.5), r.range(0.3, 0.5)), a: hsl(0, 0, r.pick([0.08, 0.9])), e: hsl(h2, 1, 0.6), m: hsl(0, 0, 0.33), finish: r.pick(['gloss', 'satin']), pattern: r.pick(['split', 'stripes', 'chevron']) }; },
  // —— 设计师调色板（参考 尼尔：机械纪元 / 赛博朋克 2077 / 命运 2 的气质，而非照搬）
  yorha: (r) => ({ p: hsl(40, 0.12, r.range(0.8, 0.86)), s: hsl(220, 0.06, 0.1), a: hsl(40, 0.4, 0.5), e: hsl(r.pick([355, 30, 40]), 0.9, 0.6), m: hsl(35, 0.08, 0.36), finish: 'satin', pattern: r.pick(['trim', 'split', 'none']) }),
  machine: (r) => ({ p: hsl(r.range(26, 34), 0.32, r.range(0.34, 0.4)), s: hsl(30, 0.1, 0.16), a: hsl(36, 0.45, 0.5), e: hsl(r.pick([28, 38]), 1, 0.58), m: hsl(30, 0.18, 0.3), finish: 'matte', pattern: r.pick(['patch', 'none', 'trim']), worn: 0.8 }),
  arasaka: (r) => ({ p: hsl(r.range(352, 358), 0.66, r.range(0.3, 0.36)), s: hsl(0, 0, 0.08), a: hsl(0, 0, 0.86), e: hsl(r.pick([355, 0]), 1, 0.56), m: hsl(0, 0, 0.22), finish: 'gloss', pattern: r.pick(['split', 'chevron', 'trim']) }),
  militech: (r) => ({ p: hsl(210, 0.05, r.range(0.3, 0.36)), s: hsl(44, 0.5, 0.46), a: hsl(0, 0, 0.1), e: hsl(r.pick([36, 48]), 1, 0.56), m: hsl(210, 0.04, 0.42), finish: 'satin', pattern: r.pick(['stripes', 'hazard', 'trim']) }),
  netrunner: (r) => ({ p: hsl(r.range(185, 200), 0.3, r.range(0.1, 0.14)), s: hsl(190, 0.12, 0.22), a: hsl(176, 0.7, 0.42), e: hsl(178, 1, 0.58), e2: hsl(r.pick([320, 290]), 1, 0.62), m: hsl(190, 0.1, 0.3), finish: 'satin', pattern: r.pick(['circuit', 'digital', 'circuit']) }),
  samurai: (r) => ({ p: hsl(0, 0, r.range(0.08, 0.11)), s: hsl(r.range(52, 56), 0.85, 0.52), a: hsl(0, 0, 0.3), e: hsl(r.pick([54, 180]), 1, 0.58), m: hsl(0, 0, 0.3), finish: 'satin', pattern: r.pick(['chevron', 'split', 'stripes']) }),
  vex: (r) => ({ p: hsl(r.range(32, 38), 0.42, r.range(0.4, 0.46)), s: hsl(30, 0.2, 0.18), a: hsl(40, 0.25, 0.7), e: hsl(r.pick([190, 48, 0]), r.pick([0.25, 0.9]), 0.82), m: hsl(36, 0.5, 0.42), finish: 'chrome', pattern: r.pick(['hex', 'circuit', 'none']), pMetal: true }),
  hive: (r) => ({ p: hsl(44, 0.14, r.range(0.66, 0.72)), s: hsl(90, 0.1, 0.12), a: hsl(30, 0.2, 0.3), e: hsl(r.pick([95, 80]), 1, 0.55), m: hsl(40, 0.1, 0.3), finish: 'matte', pattern: r.pick(['cracks', 'drip', 'patch']), worn: 0.7 }),
  traveler: (r) => ({ p: hsl(210, 0.08, r.range(0.88, 0.93)), s: hsl(42, 0.48, 0.5), a: hsl(212, 0.35, 0.3), e: hsl(r.pick([200, 46]), 0.85, 0.7), m: hsl(42, 0.4, 0.5), finish: 'gloss', pattern: r.pick(['trim', 'split']), sMetal: true }),
  eliksni: (r) => ({ p: hsl(r.range(232, 248), 0.32, r.range(0.22, 0.28)), s: hsl(25, 0.45, 0.4), a: hsl(250, 0.15, 0.12), e: hsl(r.pick([200, 210]), 1, 0.62), m: hsl(25, 0.4, 0.38), finish: 'satin', pattern: r.pick(['patch', 'trim', 'stripes']), sMetal: true }),
  taken: (r) => ({ p: hsl(240, 0.06, r.range(0.06, 0.09)), s: hsl(240, 0.04, 0.14), a: hsl(0, 0, 0.82), e: hsl(0, 0, 0.94), m: hsl(240, 0.04, 0.2), finish: 'gloss', pattern: r.pick(['cracks', 'none']) }),
  void: (r) => ({ p: hsl(r.range(265, 280), 0.28, r.range(0.12, 0.17)), s: hsl(270, 0.14, 0.26), a: hsl(r.range(280, 296), 0.6, 0.48), e: hsl(r.range(275, 290), 1, 0.65), m: hsl(270, 0.1, 0.3), finish: 'satin', pattern: r.pick(['cloud', 'circuit', 'wave']) }),
  solar: (r) => ({ p: hsl(30, 0.1, r.range(0.86, 0.9)), s: hsl(r.range(14, 22), 0.75, 0.45), a: hsl(20, 0.1, 0.12), e: hsl(r.range(22, 34), 1, 0.58), m: hsl(30, 0.3, 0.42), finish: 'satin', pattern: r.pick(['chevron', 'trim', 'split']) }),
  strand: (r) => ({ p: hsl(r.range(140, 155), 0.22, r.range(0.18, 0.24)), s: hsl(150, 0.1, 0.72), a: hsl(146, 0.55, 0.4), e: hsl(148, 1, 0.56), m: hsl(150, 0.1, 0.3), finish: 'matte', pattern: r.pick(['wave', 'hex', 'trim']) }),
};
// 随机选色权重：设计师调色板更常出现，高饱和家族少出现
const SCHEME_W = { candy: 0.35, hazard: 0.6, racing: 0.6, duotone: 0.6, gold: 0.6, toxic: 0.7, yorha: 1.5, machine: 1.3, arasaka: 1.4, militech: 1.3, netrunner: 1.3, samurai: 1.2, vex: 1.4, hive: 1.1, traveler: 1.4, eliksni: 1.3, taken: 1.1, void: 1.3, solar: 1.2, strand: 1.2 };
const SCHEME_NAMES = Object.keys(SCHEMES);

const ROLE_INFO = {
  tank: { cn: '重装坦克', hp: 1750, atk: 33, def: 42, aspd: 0.82, mspd: 3.0, scale: 1.14 },
  assassin: { cn: '敏捷刺客', hp: 1080, atk: 33, def: 15, aspd: 1.5, mspd: 5.8, scale: 0.92 },
  gunner: { cn: '远程火力', hp: 1180, atk: 30, def: 20, aspd: 1.1, mspd: 3.9, scale: 1.0 },
  brawler: { cn: '莽夫近战', hp: 1420, atk: 44, def: 24, aspd: 1.05, mspd: 4.3, scale: 1.06 },
};
// 定位平衡系数（由 tools/matrix.mjs 无头对战矩阵校准）
export const ROLE_ADJ = { tank: 0.95, assassin: 1.2, gunner: 1.1, brawler: 0.8 };
export const ROLE_CN = Object.fromEntries(Object.entries(ROLE_INFO).map(([k, v]) => [k, v.cn]));

const SPECIAL_NAMES = { charge: '蛮牛冲撞', chainsaw: '链锯绞杀', flame: '烈焰喷射', cannon: '重型火炮', laser: '聚能激光', missile: '蜂群导弹', drill: '螺旋钻击', shock: '震地践踏', elec: '雷霆电弧' };
const ULT_NAMES = { meteor: '陨星重砸', barrage: '全弹发射', beam: '光子巨炮', frenzy: '狂暴连斩', inferno: '炼狱火旋', storm: '万雷天罚' };
const MAIN_NAMES = { fist: '铁拳连击', blade: '利刃连斩', hammer: '重锤猛击', claw: '撕裂钳击', gatling: '加特林扫射', blaster: '脉冲速射', cannon: '臂炮轰击' };

const NAME_A = { racing: ['疾风', '极速', '赤线', '涡轮'], military: ['铁幕', '钢盔', '野战', '突击'], neon: ['霓虹', '赛博', '电幻', '光谱'], chrome: ['镜钢', '银翼', '水银', '铬骨'], royal: ['圣辉', '王权', '天穹', '荣耀'], hazard: ['重工', '警戒', '铁矿', '钻探'], candy: ['糖心', '泡泡', '甜甜圈', '棉花'], stealth: ['暗影', '夜魇', '黑曜', '幽冥'], ceramic: ['白垩', '天使', '晨星', '素羽'], scrap: ['废铁', '锈牙', '拾荒', '破锣'], toxic: ['剧毒', '酸蚀', '瘟疫', '变异'], ocean: ['深海', '霜牙', '潮汐', '冰川'], lava: ['熔核', '炎狱', '火山', '焦土'], carbon: ['碳骨', '零式', '机能', '极简'], gold: ['金甲', '鎏金', '黄金', '财神'], dragon: ['赤龙', '麒麟', '战神', '玄武'], duotone: ['双子', '撞色', '裂变', '镜像'] };
// —— 机甲命名：多种句式 + 长短不一（1~6 字），不带数字后缀
const SOLO = ['铁砧', '黑匣', '雷鸣', '赤霄', '断罪', '獠牙', '无光', '霜降', '惊蛰', '白夜', '夜枭', '野火', '孤星', '碎岳', '磐石', '朔风', '烛龙', '鸣镝', '炽', '渊', '烬', '戮', '霆', '岚', '锈', '刹那', '残响', '逆鳞', '归零', '天罚', '玄铁', '长夜', '破军', '贪狼', '七杀', '苍隼', '血刃', '墨鲸'];
const PRE = ['零式', '终焉', '破晓', '永夜', '深红', '幽灵', '狂暴', '沉默的', '最后的', '不眠', '无名', '赤色', '漆黑', '白银', '钢铁', '机械', '疯狂的', '雷霆', '荒原', '午夜'];
const NOUN = { tank: ['堡垒', '重甲', '巨像', '城墙', '铁壁', '方舟', '山岳', '守望者', '不动明王', '要塞'], assassin: ['刀锋', '猎杀者', '影', '飞燕', '毒牙', '夜行者', '镰鼬', '无声者', '蝎', '游魂'], gunner: ['炮台', '火神', '风暴', '狙鹰', '审判', '轰鸣者', '天火', '弹幕', '雷暴', '星落'], brawler: ['狂徒', '拳王', '蛮牛', '暴君', '斗犬', '碎骨者', '熊', '铁锤', '屠夫', '野兽'] };
const SUF = ['号', '·改', '·Δ', '·终式', '·极', '原型机', '·黑', '·真', '·零', '·Ω'];
function makeName(r, a, b, scheme, role) {
  const n = NOUN[role];
  const forms = [
    () => r.pick(SOLO),                                  // 铁砧 / 烬
    () => r.pick(SOLO) + r.pick(SUF),                    // 刹那·改 / 渊号
    () => r.pick(PRE) + r.pick(n),                        // 零式猎杀者 / 沉默的城墙
    () => a + r.pick(n),                                  // 熔核暴君
    () => a + b,                                          // 原风格
    () => r.pick(n),                                      // 影 / 方舟
    () => r.pick(SOLO) + r.pick(n),                       // 夜枭刀锋
    () => (r.chance(0.5) ? r.pick(PRE) : a) + r.pick(SOLO) + r.pick(SUF), // 漆黑七杀·Ω
  ];
  for (let i = 0; i < 6; i++) { const s = r.pick(forms)(); if (s.length >= 2 && s.length <= 8) return s; }
  return a + b;
}
const NAME_B = { tank: ['泰坦', '堡垒', '巨像', '铁壁', '重甲'], assassin: ['魅影', '猎手', '飞刃', '疾影', '刺客'], gunner: ['炮台', '火神', '风暴', '狙鹰', '炮手'], brawler: ['狂徒', '拳王', '蛮兽', '暴君', '斗士'] };

export function parsePrompt(prompt) {
  const p = (prompt || '').toLowerCase();
  const roleScores = Object.fromEntries(Object.entries(ROLE_KW).map(([k, w]) => [k, score(p, w)]));
  const specials = Object.entries(SPECIAL_KW).filter(([, w]) => has(p, w)).map(([k]) => k);
  const mains = Object.entries(MAIN_KW).filter(([, w]) => has(p, w)).map(([k]) => k);
  const styles = Object.entries(STYLE_KW).map(([k, w]) => [k, score(p, w)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const hues = COLOR_KW.filter(([w]) => has(p, w)).map(([, h]) => h);
  const motifs = Object.entries(MOTIF_KW).filter(([, w]) => has(p, w)).map(([k]) => k);
  const tail = has(p, TAIL_KW);
  const boost = {
    def: score(p, ['坚', '硬', '厚', '盾', '防', '铁壁', '不倒', 'armor', 'tough']),
    atk: score(p, ['暴力', '猛', '强', '毁灭', '狂', '杀', '破坏', 'power', 'destroy']),
    spd: score(p, ['快', '迅', '闪', '疾', '风', '轻', 'fast', 'quick']),
    hp: score(p, ['巨', '大', '肥', '胖', '耐', '血', 'giant', 'huge']),
    aspd: score(p, ['连', '速射', '乱', '疯', 'rapid', 'combo']),
  };
  const formScores = Object.fromEntries(Object.entries(FORM_KW).map(([k, w]) => [k, score(p, w)]));
  return { roleScores, specials, mains, styles, hues, motifs, tail, boost, formScores };
}

let ID_SEQ = 0;
export function generateDesign(prompt, owner, opts = {}) {
  const seed = opts.seed ?? ((hashStr(prompt + '|' + Date.now() + '|' + Math.random()) ^ (++ID_SEQ * 2654435761)) >>> 0);
  const r = mulberry32(seed);
  const k = parsePrompt(prompt);

  // —— 定位：关键词加权 + 随机
  const anyKw = Object.values(k.roleScores).some((v) => v > 0);
  const roleW = Object.entries(k.roleScores).map(([role, s]) => [role, anyKw ? (s > 0 ? s * s * 10 : 0.25) : 1]);
  let role = r.weighted(roleW);
  if (k.specials.some((s) => ['missile', 'cannon', 'laser'].includes(s)) && !Object.values(k.roleScores).some((v) => v > 0)) role = r.chance(0.7) ? 'gunner' : role;
  // —— 形态原型：关键词优先；否则按定位倾向随机，并避开最近出现过的形态（保证一屏之内形态多样）
  const formKw = Object.values(k.formScores).some((v) => v > 0);
  let form;
  if (opts.form) form = opts.form;
  else if (formKw) form = r.weighted(Object.entries(k.formScores).map(([f, s]) => [f, s > 0 ? s * s * 10 : 0.12]));
  else {
    const avoidF = opts.avoidForms || [];
    form = r.weighted(FORM_BY_ROLE[role].map(([f, w]) => [f, w * (avoidF.includes(f) ? 0.18 : 1)]));
  }
  // 形态反推定位（仅在提示词没有明确定位时）
  if (!anyKw) {
    const FR = { hover: [['gunner', 1]], tank: [['tank', 3], ['gunner', 1], ['brawler', 1]], dog: [['assassin', 2], ['brawler', 2], ['gunner', 0.5]], spider: [['assassin', 1.5], ['brawler', 1.2], ['tank', 1], ['gunner', 0.8]], wraith: [['assassin', 2.5], ['gunner', 1], ['brawler', 0.8]] }[form];
    if (FR && !FR.some(([x]) => x === role)) role = r.weighted(FR);
  }
  if (form === 'hover') role = 'gunner';
  const info = ROLE_INFO[role];
  const range = role === 'gunner' ? 'ranged' : (role === 'tank' && form !== 'tank' && r.chance(0.25)) || (form === 'tank' && role === 'tank' && r.chance(0.4)) ? 'ranged' : 'melee';

  // —— 武器
  const meleeMains = { tank: [['fist', 3], ['hammer', 3], ['claw', 2]], assassin: [['blade', 5], ['claw', 2], ['fist', 1]], brawler: [['fist', 5], ['hammer', 2], ['claw', 2]], gunner: [['fist', 1]] };
  const rangedMains = [['gatling', 3], ['blaster', 3], ['cannon', 2]];
  let main;
  const kwMain = k.mains.filter((m) => (range === 'ranged') === ['gatling', 'blaster', 'cannon'].includes(m));
  if (kwMain.length) main = r.pick(kwMain);
  else main = range === 'ranged' ? r.weighted(rangedMains) : r.weighted(meleeMains[role]);

  const specialPool = {
    tank: [['charge', 3], ['shock', 3], ['cannon', 2], ['flame', 2], ['drill', 1], ['elec', 1]],
    assassin: [['chainsaw', 2], ['laser', 2], ['elec', 3], ['drill', 2], ['charge', 1]],
    gunner: [['missile', 3], ['cannon', 3], ['laser', 3], ['flame', 1], ['elec', 1]],
    brawler: [['charge', 3], ['chainsaw', 3], ['flame', 2], ['shock', 2], ['drill', 2]],
  };
  const special = k.specials.length ? r.pick(k.specials) : r.weighted(specialPool[role]);
  const ultPool = { tank: [['meteor', 3], ['inferno', 1], ['storm', 1], ['barrage', 1]], assassin: [['frenzy', 4], ['storm', 2], ['beam', 1]], gunner: [['barrage', 3], ['beam', 3], ['storm', 1]], brawler: [['meteor', 3], ['frenzy', 2], ['inferno', 2]] };
  let ult = r.weighted(ultPool[role]);
  if (special === 'flame' && r.chance(0.5)) ult = 'inferno';
  if (special === 'elec' && r.chance(0.5)) ult = 'storm';
  if (special === 'laser' && r.chance(0.4)) ult = 'beam';
  if (special === 'missile' && r.chance(0.5)) ult = 'barrage';

  // —— 数值：定位基准 × 随机 × 关键词，再按综合战力归一（有差异但不失衡）
  const v = (base, sp) => base * r.range(1 - sp, 1 + sp);
  const b = k.boost;
  let hp = v(info.hp, 0.14) * (1 + 0.08 * Math.min(b.hp, 2));
  let atk = v(info.atk, 0.16) * (1 + 0.09 * Math.min(b.atk, 2));
  let def = v(info.def, 0.2) * (1 + 0.12 * Math.min(b.def, 2));
  let aspd = v(info.aspd, 0.14) * (1 + 0.08 * Math.min(b.aspd, 2));
  let mspd = v(info.mspd, 0.12) * (1 + 0.08 * Math.min(b.spd, 2));
  const power = Math.sqrt(hp * (1 + def / 60) * atk * aspd * (0.85 + mspd * 0.04));
  const ref = Math.sqrt(1400 * (1 + 26 / 60) * 36 * 1.1 * (0.85 + 4.2 * 0.04));
  const target = ref * r.range(0.95, 1.05);
  const f = Math.sqrt(target / power);
  hp *= f; atk *= f * (ROLE_ADJ[role] || 1);
  const stats = { hp: Math.round(hp), atk: Math.round(atk), def: Math.round(def), aspd: +aspd.toFixed(2), mspd: +mspd.toFixed(2) };

  // —— 外观：配色家族（关键词优先，否则全随机，且避开最近用过的）
  let schemeName;
  const avoid = opts.avoidSchemes || [];
  if (k.styles.length && r.chance(0.85)) schemeName = k.styles[0];
  else {
    const pool = SCHEME_NAMES.filter((s) => !avoid.includes(s));
    schemeName = r.weighted((pool.length ? pool : SCHEME_NAMES).map((n) => [n, SCHEME_W[n] || 1]));
  }
  const hue = k.hues.length ? r.pick(k.hues) + r.range(-8, 8) : r.range(0, 360);
  const sc = SCHEMES[schemeName](r, hue);
  if (k.hues.length && !['racing', 'neon', 'chrome', 'carbon', 'duotone', 'ceramic'].includes(schemeName)) {
    // 颜色关键词强制体现在强调色/发光色上
    sc.a = hsl(hue, 0.85, 0.5); sc.e = hsl(hue, 1, 0.6);
  }
  const palette = {
    primary: hslToHex(sc.p), secondary: hslToHex(sc.s), accent: hslToHex(sc.a), emissive: hslToHex(sc.e),
    emissive2: hslToHex(sc.e2 || sc.e), metal: hslToHex(sc.m),
  };

  const roleShape = {
    tank: { torso: [[0, 3], [1, 3], [4, 2], [6, 2], [2, 1]], legs: [[0, 4], [3, 2], [4, 3]], arms: [[0, 3], [1, 2], [4, 3]], height: [0.9, 1.0], bulk: [1.15, 1.35] },
    assassin: { torso: [[2, 3], [3, 3], [5, 3], [1, 1]], legs: [[1, 3], [2, 4], [3, 1]], arms: [[2, 4], [3, 3], [1, 1]], height: [1.0, 1.15], bulk: [0.78, 0.92] },
    gunner: { torso: [[1, 2], [3, 2], [4, 2], [5, 2], [6, 2], [0, 1]], legs: [[0, 2], [2, 2], [3, 2], [4, 2]], arms: [[1, 3], [0, 2], [3, 2]], height: [0.95, 1.08], bulk: [0.95, 1.1] },
    brawler: { torso: [[0, 3], [4, 3], [6, 2], [2, 2]], legs: [[0, 3], [3, 3], [4, 2]], arms: [[0, 4], [4, 3], [1, 1]], height: [0.95, 1.05], bulk: [1.05, 1.25] },
  }[role];

  const motif = k.motifs.length ? r.pick(k.motifs) : r.weighted([['none', 4], ['horns', 1], ['ears', 1], ['fin', 1], ['crown', 0.6], ['spikes', 1], ['antenna', 1], ['crest', 1]]);
  const look = {
    scheme: schemeName, finish: sc.finish, pattern: sc.pattern, worn: sc.worn || r.range(0, 0.4), pMetal: !!sc.pMetal, sMetal: !!sc.sMetal,
    torso: r.weighted(roleShape.torso), legs: r.weighted(roleShape.legs), arms: r.weighted(roleShape.arms),
    head: r.int(0, 5), cockpit: r.weighted([[0, 3], [1, 3], [2, 2], [3, 2]]), back: r.int(0, 6), shoulder: r.int(0, 5),
    motif, tail: k.tail ? true : r.chance(0.12),
    height: r.range(...roleShape.height), bulk: r.range(...roleShape.bulk), armLen: r.range(0.9, 1.15), legLen: r.range(0.88, 1.12),
    shoulderW: r.range(0.9, 1.2), eyes: r.int(0, 3), lights: r.range(0.6, 1.4), asym: r.chance(0.3),
    patternSeed: r.int(0, 1e6), formVar: r.int(0, 2),
  };
  if (special === 'missile' && look.back !== 2) look.back = r.chance(0.6) ? 2 : look.back;
  if (special === 'flame' && r.chance(0.5)) look.back = 4;

  const nameA = r.pick(NAME_A[schemeName] || ['钢铁']);
  const nameB = r.pick(NAME_B[role]);
  const custom = (opts.name || '').trim();
  const name = custom || makeName(r, nameA, nameB, schemeName, role);

  return {
    id: 'm' + seed.toString(36) + (Date.now() % 100000).toString(36),
    seed, prompt, owner, name, role, roleCn: info.cn, form, formCn: FORM_CN[form], range, main, special, ult,
    moves: { basic: MAIN_NAMES[main], special: SPECIAL_NAMES[special], ult: ULT_NAMES[ult] },
    stats, scale: info.scale * look.height ** 0.5, palette, look,
    createdAt: Date.now(), wins: 0, losses: 0, day: todayKey(), fought: 0, lastFought: 0,
  };
}

export function todayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

// UI 评级（1~10）
export function ratings(st) {
  const n = (v, a, b) => clamp(Math.round(1 + 9 * (v - a) / (b - a)), 1, 10);
  return { atk: n(st.atk, 22, 56), def: n(st.def, 8, 56), hp: n(st.hp, 850, 2200), aspd: n(st.aspd, 0.6, 1.8), mspd: n(st.mspd, 2.4, 6.8) };
}

export const EXAMPLE_PROMPTS = [
  '霓虹赛博刺客，双刀，闪电般的速度',
  '黄金重装坦克，巨型铁拳，能震地',
  '废土拼装莽夫，电锯手臂，锈迹斑斑',
  '深海鲨鱼远程炮台，蜂群导弹',
  '国潮赤龙斗士，喷火，金色铠甲',
  '可爱粉色糖果机甲，激光枪',
  '暗黑死神刺客，镰刀，红色发光',
  '工业挖掘机改装，螺旋钻头，警示黄黑',
];
